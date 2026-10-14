import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export type MicPermission = 'granted' | 'denied' | 'blocked';

export const MAX_LISTEN_MS = 10_000;
const SILENCE_MS = 1_500;
const CONTEXT = ['vacas', 'vaquillonas', 'terneros', 'novillos', 'toros', 'lote', 'milímetros', 'llovieron'];
const SPANISH_PREFERENCE = ['es-AR', 'es-419', 'es-US', 'es-ES'];

function toPermission(r: { granted: boolean; canAskAgain: boolean }): MicPermission {
  if (r.granted) return 'granted';
  return r.canAskAgain ? 'denied' : 'blocked';
}

export async function requestMic(): Promise<MicPermission> {
  return toPermission(await ExpoSpeechRecognitionModule.requestPermissionsAsync());
}

export async function micPermission(): Promise<MicPermission> {
  return toPermission(await ExpoSpeechRecognitionModule.getPermissionsAsync());
}

export interface SttCapabilities {
  available: boolean;
  onDeviceLocale: string | null;
}

export async function sttCapabilities(): Promise<SttCapabilities> {
  const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
  if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return { available, onDeviceLocale: null };
  try {
    const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    const locale = SPANISH_PREFERENCE.find((l) => installedLocales.includes(l)) ?? installedLocales.find((l) => l.startsWith('es')) ?? null;
    return { available, onDeviceLocale: locale };
  } catch {
    return { available, onDeviceLocale: null };
  }
}

// Con red se usa el reconocedor online (mejor con ruido); sin red, el modelo on-device si está instalado.
export function startListening(opts: { online: boolean; onDeviceLocale: string | null }): void {
  const onDevice = !opts.online && opts.onDeviceLocale !== null;
  ExpoSpeechRecognitionModule.start({
    lang: onDevice && opts.onDeviceLocale ? opts.onDeviceLocale : 'es-AR',
    interimResults: true,
    continuous: false,
    requiresOnDeviceRecognition: onDevice,
    contextualStrings: CONTEXT,
    androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: SILENCE_MS },
  });
}

export function stopListening(): void {
  ExpoSpeechRecognitionModule.stop();
}

export function abortListening(): void {
  ExpoSpeechRecognitionModule.abort();
}
