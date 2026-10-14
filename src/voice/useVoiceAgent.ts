import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { LLM_ENABLED } from '@/config';
import { ConversationState, initialConversation, runIntentTurn, runTurn, TurnDeps, TurnOutcome } from '@/conversation/engine';
import { initialMic, micReducer } from '@/conversation/mic';
import { resolveMode } from '@/conversation/mode';
import { EventStore } from '@/data/eventStore';
import { resetDemo as resetDemoData } from '@/data/openStore';
import { toISODate } from '@/domain/dates';
import { EventSource, Farm, Interpreter } from '@/domain/types';
import { isOnline, subscribeOnline } from '@/platform/network';
import { Card, CardTone } from '@/tools';
import { abortListening, MAX_LISTEN_MS, micPermission, requestMic, startListening, stopListening, SttCapabilities, sttCapabilities } from './stt';
import { bestTranscript } from './transcript';
import { initTts, speak, stopSpeaking } from './tts';

export interface Notice {
  text: string;
  action?: { label: string; onPress: () => void };
}

interface AgentOptions {
  store: EventStore;
  farm: Farm;
  interpret: TurnDeps['interpret'];
  phrase?: TurnDeps['phrase'];
}

const REOPEN_MIC_MS = 300;
const NOTICE_NETWORK = 'Sin señal no puedo reconocer la voz. Escribí abajo y lo registro igual.';
const NOTICE_NO_SPANISH = 'Este teléfono no tiene el reconocimiento de voz en español disponible. Escribí abajo y lo registro igual.';
const NOTICE_GENERIC = 'No pude escucharte. Probá de nuevo o escribí abajo.';

function feedback(tone: CardTone): void {
  if (tone === 'registro') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (tone === 'rechazo') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function useVoiceAgent({ store, farm, interpret, phrase }: AgentOptions) {
  const [mic, dispatch] = useReducer(micReducer, initialMic);
  const [partial, setPartial] = useState('');
  const [lastUser, setLastUser] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [card, setCard] = useState<Card | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [online, setOnline] = useState(true);
  const [lastDegraded, setLastDegraded] = useState(false);
  const [lastVia, setLastVia] = useState<Interpreter | null>(null);
  const [version, setVersion] = useState(0);
  const conversation = useRef<ConversationState>(initialConversation);
  const caps = useRef<SttCapabilities>({ available: true, onDeviceLocale: null });
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reopenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnInFlight = useRef(false);
  const utterance = useRef(0);
  // Por sesión de escucha: la mejor frase oída hasta ahora y si ya se resolvió (enviada, cancelada o fallida), para enviarla una sola vez.
  const heard = useRef('');
  const sessionDone = useRef(true);

  const deps: TurnDeps = useMemo(
    () => ({ farm, store, interpret, phrase, now: () => new Date(), newId: Crypto.randomUUID }),
    [farm, store, interpret, phrase],
  );

  function clearListenTimer() {
    if (listenTimer.current) clearTimeout(listenTimer.current);
    listenTimer.current = null;
  }

  function clearReopenTimer() {
    if (reopenTimer.current) clearTimeout(reopenTimer.current);
    reopenTimer.current = null;
  }

  function closeSession() {
    sessionDone.current = true;
    heard.current = '';
  }

  function blockMic() {
    dispatch({ type: 'MIC_BLOCKED' });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }

  // Solo se aborta una sesión viva: el abort nativo siempre emite "end", y uno tardío cortaría la escucha siguiente.
  function cancelListening(buzz = true) {
    clearListenTimer();
    const active = !sessionDone.current;
    closeSession();
    if (!active) return;
    if (buzz) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    abortListening();
  }

  // Corta todo lo que esté en curso (escucha, voz, reapertura). El token invalida los callbacks tardíos de la voz cortada.
  function interrupt() {
    clearReopenTimer();
    cancelListening();
    utterance.current += 1;
    stopSpeaking();
    dispatch({ type: 'DONE' });
  }

  async function listen() {
    if (turnInFlight.current) return;
    const result = await requestMic();
    if (result !== 'granted') {
      blockMic();
      return;
    }
    dispatch({ type: 'MIC_ALLOWED' });
    if (!caps.current.available) {
      setNotice({ text: 'Este teléfono no tiene el reconocimiento de voz activo. Podés escribir abajo.' });
      return;
    }
    sessionDone.current = false;
    heard.current = '';
    setPartial('');
    startListening({ online: await isOnline(), onDeviceLocale: caps.current.onDeviceLocale });
    clearListenTimer();
    listenTimer.current = setTimeout(stopListening, MAX_LISTEN_MS);
  }

  function say(text: string, reopenMic: boolean) {
    const id = ++utterance.current;
    setLastReply(text);
    dispatch({ type: 'SPEAK' });
    speak(text, (completed) => {
      if (id !== utterance.current) return;
      dispatch({ type: 'DONE' });
      if (reopenMic && completed) {
        reopenTimer.current = setTimeout(() => {
          reopenTimer.current = null;
          void handlers.current.listen();
        }, REOPEN_MIC_MS);
      }
    });
  }

  // El botón Deshacer no pasa por el intérprete, así que no dice nada del estado del LLM; los turnos sin red tampoco: vuelve a valer el último con red.
  function apply(outcome: TurnOutcome, source: EventSource, interpreted = true) {
    conversation.current = outcome.state;
    setCard(outcome.card);
    if (interpreted) {
      setLastDegraded(outcome.degraded);
      setLastVia((previous) => (online ? outcome.via : previous));
    }
    setVersion((v) => v + 1);
    feedback(outcome.card.tone);
    say(outcome.speech, outcome.expectsReply && source === 'voz');
  }

  function fail() {
    setCard({ tone: 'rechazo', title: 'Algo falló', lines: ['No registré nada. Probá de nuevo.'] });
    say('Algo falló, probá de nuevo.', false);
  }

  async function handleText(text: string, source: EventSource) {
    if (!text.trim() || turnInFlight.current) return;
    turnInFlight.current = true;
    if (source === 'texto') interrupt();
    dispatch({ type: 'SUBMIT' });
    setLastUser(text);
    setPartial('');
    setNotice(null);
    try {
      apply(await runTurn(text, source, conversation.current, deps), source);
    } catch {
      fail();
    } finally {
      turnInFlight.current = false;
    }
  }

  async function undoLast() {
    if (turnInFlight.current) return;
    turnInFlight.current = true;
    interrupt();
    dispatch({ type: 'SUBMIT' });
    setLastUser('Deshacer');
    setPartial('');
    try {
      apply(await runIntentTurn({ tool: 'deshacer_ultimo', args: {} }, 'Deshacer (botón)', conversation.current, deps), 'texto', false);
    } catch {
      fail();
    } finally {
      turnInFlight.current = false;
    }
  }

  async function resetDemo() {
    if (turnInFlight.current) return;
    turnInFlight.current = true;
    interrupt();
    try {
      const now = new Date();
      await resetDemoData(store, toISODate(now), now.toISOString(), Crypto.randomUUID);
      conversation.current = initialConversation;
      setCard(null);
      setLastUser('');
      setLastReply('');
      setPartial('');
      setNotice(null);
      setLastDegraded(false);
      setLastVia(null);
      setVersion((v) => v + 1);
    } catch {
      fail();
    } finally {
      turnInFlight.current = false;
    }
  }

  // Envía la mejor frase oída, una sola vez por sesión. Devuelve false si no había nada que enviar.
  function sendHeard(): boolean {
    if (sessionDone.current || !heard.current) return false;
    const text = heard.current;
    closeSession();
    clearListenTimer();
    void handlers.current.handleText(text, 'voz');
    return true;
  }

  function noHeard() {
    if (sessionDone.current || sendHeard()) return;
    closeSession();
    say('No te escuché, probá de nuevo.', false);
  }

  // El permiso pudo cambiar desde Ajustes: se consulta antes de decidir si hay que mandar al usuario allá.
  async function recoverMic() {
    const permission = await micPermission();
    if (permission === 'blocked') void Linking.openSettings();
    else void listen();
  }

  function onMicPress() {
    clearReopenTimer();
    switch (mic.status) {
      case 'idle':
        void listen();
        return;
      case 'listening':
        clearListenTimer();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        stopListening();
        return;
      case 'speaking':
        stopSpeaking();
        return;
      case 'blocked':
        void recoverMic();
        return;
      case 'thinking':
        return;
    }
  }

  // Los listeners nativos y el callback del TTS se registran una vez; leen siempre la versión actual.
  const handlers = useRef({ listen, handleText, sendHeard, noHeard });
  handlers.current = { listen, handleText, sendHeard, noHeard };

  useSpeechRecognitionEvent('start', () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dispatch({ type: 'LISTEN' });
  });
  // Android puede entregar las hipótesis finales en un evento parcial y después un final vacío (evento "nomatch"): se guarda la mejor de cada evento.
  useSpeechRecognitionEvent('result', (event) => {
    if (sessionDone.current) return;
    const best = bestTranscript(event.results);
    if (best) {
      heard.current = best;
      setPartial(best);
    }
    if (event.isFinal) handlers.current.sendHeard();
  });
  useSpeechRecognitionEvent('nomatch', () => handlers.current.noHeard());
  useSpeechRecognitionEvent('error', (event) => {
    clearListenTimer();
    switch (event.error) {
      case 'aborted':
        return;
      case 'not-allowed':
        closeSession();
        blockMic();
        return;
      case 'no-speech':
      case 'speech-timeout':
        handlers.current.noHeard();
        return;
      case 'network':
        closeSession();
        setNotice({ text: NOTICE_NETWORK });
        return;
      case 'language-not-supported':
      case 'service-not-allowed':
        closeSession();
        setNotice({ text: NOTICE_NO_SPANISH });
        return;
      default:
        closeSession();
        setNotice({ text: NOTICE_GENERIC });
    }
  });
  useSpeechRecognitionEvent('end', () => {
    clearListenTimer();
    if (!handlers.current.sendHeard()) dispatch({ type: 'STOPPED' });
  });

  useEffect(() => {
    // Sin voz de síntesis la app sigue andando: los subtítulos muestran todo lo que se diría.
    initTts().catch(() => {});
    void sttCapabilities().then((c) => {
      caps.current = c;
    });
    void micPermission().then((p) => {
      if (p === 'blocked') dispatch({ type: 'MIC_BLOCKED' });
    });
    void isOnline().then(setOnline);
    const unsubscribe = subscribeOnline(setOnline);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void micPermission().then((p) => {
          if (p === 'granted') dispatch({ type: 'MIC_ALLOWED' });
        });
        return;
      }
      clearReopenTimer();
      cancelListening(false);
      stopSpeaking();
    });
    return () => {
      unsubscribe();
      appState.remove();
      clearListenTimer();
      clearReopenTimer();
    };
  }, []);

  return {
    mic,
    partial,
    lastUser,
    lastReply,
    card,
    notice,
    setNotice,
    mode: resolveMode({ online, llmEnabled: LLM_ENABLED, lastDegraded, lastVia }),
    version,
    onMicPress,
    submitText: (text: string) => void handleText(text, 'texto'),
    undoLast: () => void undoLast(),
    resetDemo,
  };
}
