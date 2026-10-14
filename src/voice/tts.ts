import * as Speech from 'expo-speech';

const PREFERENCE = ['es-AR', 'es-419', 'es-US', 'es-MX', 'es-ES'];
let language = 'es-AR';

export async function initTts(): Promise<void> {
  const voices = await Speech.getAvailableVoicesAsync();
  const languages = voices.map((v) => v.language.replace('_', '-'));
  language = PREFERENCE.find((p) => languages.includes(p)) ?? languages.find((l) => l.startsWith('es')) ?? language;
}

export function speak(text: string, onDone: () => void): void {
  Speech.speak(text, { language, rate: 1.05, onDone, onStopped: onDone, onError: () => onDone() });
}

export function stopSpeaking(): void {
  void Speech.stop();
}
