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
import { EventSource, Farm } from '@/domain/types';
import { isOnline, subscribeOnline } from '@/platform/network';
import { Card, CardTone } from '@/tools';
import { abortListening, MAX_LISTEN_MS, MicPermission, micPermission, requestMic, startListening, stopListening, SttCapabilities, sttCapabilities } from './stt';
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

function feedback(tone: CardTone): void {
  if (tone === 'registro') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (tone === 'rechazo') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function useVoiceAgent({ store, farm, interpret, phrase }: AgentOptions) {
  const [mic, dispatch] = useReducer(micReducer, initialMic);
  const [permission, setPermission] = useState<MicPermission>('granted');
  const [partial, setPartial] = useState('');
  const [lastUser, setLastUser] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [card, setCard] = useState<Card | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [online, setOnline] = useState(true);
  const [lastDegraded, setLastDegraded] = useState(false);
  const [version, setVersion] = useState(0);
  const conversation = useRef<ConversationState>(initialConversation);
  const caps = useRef<SttCapabilities>({ available: true, onDeviceLocale: null });
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotFinal = useRef(false);
  const turnInFlight = useRef(false);

  const deps: TurnDeps = useMemo(
    () => ({ farm, store, interpret, phrase, now: () => new Date(), newId: Crypto.randomUUID }),
    [farm, store, interpret, phrase],
  );

  function clearListenTimer() {
    if (listenTimer.current) clearTimeout(listenTimer.current);
    listenTimer.current = null;
  }

  async function listen() {
    if (turnInFlight.current) return;
    const result = await requestMic();
    setPermission(result);
    if (result !== 'granted') {
      dispatch({ type: 'MIC_BLOCKED' });
      return;
    }
    dispatch({ type: 'MIC_ALLOWED' });
    if (!caps.current.available) {
      setNotice({ text: 'Este teléfono no tiene el reconocimiento de voz activo. Podés escribir abajo.' });
      return;
    }
    gotFinal.current = false;
    setPartial('');
    startListening({ online: await isOnline(), onDeviceLocale: caps.current.onDeviceLocale });
    clearListenTimer();
    listenTimer.current = setTimeout(stopListening, MAX_LISTEN_MS);
  }

  function say(text: string, reopenMic: boolean) {
    setLastReply(text);
    dispatch({ type: 'SPEAK' });
    speak(text, (completed) => {
      dispatch({ type: 'DONE' });
      if (reopenMic && completed) setTimeout(() => void handlers.current.listen(), REOPEN_MIC_MS);
    });
  }

  function apply(outcome: TurnOutcome, source: EventSource) {
    conversation.current = outcome.state;
    setCard(outcome.card);
    setLastDegraded(outcome.degraded);
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
    dispatch({ type: 'SUBMIT' });
    try {
      apply(await runIntentTurn({ tool: 'deshacer_ultimo', args: {} }, 'Deshacer (botón)', conversation.current, deps), 'texto');
    } catch {
      fail();
    } finally {
      turnInFlight.current = false;
    }
  }

  async function resetDemo() {
    if (turnInFlight.current) return;
    const now = new Date();
    await resetDemoData(store, toISODate(now), now.toISOString(), Crypto.randomUUID);
    conversation.current = initialConversation;
    setCard(null);
    setLastUser('');
    setLastReply('');
    setVersion((v) => v + 1);
  }

  function onMicPress() {
    switch (mic.status) {
      case 'idle':
        void listen();
        return;
      case 'listening':
        clearListenTimer();
        stopListening();
        return;
      case 'speaking':
        stopSpeaking();
        return;
      case 'blocked':
        if (permission === 'blocked') void Linking.openSettings();
        else void listen();
        return;
      case 'thinking':
        return;
    }
  }

  // Los listeners nativos y el callback del TTS se registran una vez; leen siempre la versión actual.
  const handlers = useRef({ listen, handleText, say });
  handlers.current = { listen, handleText, say };

  useSpeechRecognitionEvent('start', () => dispatch({ type: 'LISTEN' }));
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    setPartial(text);
    if (event.isFinal && text.trim()) {
      gotFinal.current = true;
      clearListenTimer();
      void handlers.current.handleText(text, 'voz');
    }
  });
  useSpeechRecognitionEvent('error', (event) => {
    clearListenTimer();
    if (event.error === 'aborted') return;
    if (event.error === 'not-allowed') {
      setPermission('denied');
      dispatch({ type: 'MIC_BLOCKED' });
      return;
    }
    if (event.error === 'no-speech' || event.error === 'speech-timeout') {
      gotFinal.current = true;
      handlers.current.say('No te escuché, probá de nuevo.', false);
      return;
    }
    if (event.error === 'network' || event.error === 'language-not-supported' || event.error === 'service-not-allowed') {
      setNotice({ text: 'No pude usar el reconocimiento de voz (¿sin señal?). Escribí abajo y lo registro igual.' });
    }
  });
  useSpeechRecognitionEvent('end', () => {
    clearListenTimer();
    if (!gotFinal.current) dispatch({ type: 'STOPPED' });
  });

  useEffect(() => {
    // Sin voz de síntesis la app sigue andando: los subtítulos muestran todo lo que se diría.
    initTts().catch(() => {});
    void sttCapabilities().then((c) => {
      caps.current = c;
    });
    void micPermission().then((p) => {
      setPermission(p);
      if (p === 'blocked') dispatch({ type: 'MIC_BLOCKED' });
    });
    void isOnline().then(setOnline);
    const unsubscribe = subscribeOnline(setOnline);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      clearListenTimer();
      abortListening();
      stopSpeaking();
    });
    return () => {
      unsubscribe();
      appState.remove();
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
    mode: resolveMode({ online, llmEnabled: LLM_ENABLED, lastDegraded }),
    version,
    onMicPress,
    submitText: (text: string) => void handleText(text, 'texto'),
    undoLast: () => void undoLast(),
    resetDemo,
  };
}
