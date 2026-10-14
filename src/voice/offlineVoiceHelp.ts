// La descarga del paquete offline desde una app existe desde Android 13 (API 33). Antes hay que bajarlo a mano desde la app de Google;
// se nombra Español (EE.UU.) porque es el locale que pide startListening sin señal en esas versiones.
const DOWNLOAD_API_LEVEL = 33;

export function offlineVoiceHelp(apiLevel: number): { text: string; canDownload: boolean } {
  if (apiLevel >= DOWNLOAD_API_LEVEL) {
    return { text: 'Para usar la voz sin señal, descargá el español offline (una sola vez, con wifi).', canDownload: true };
  }
  return {
    text: 'Para usar la voz sin señal: Ajustes → Google → Todos los servicios → Ajustes de aplicaciones de Google → Buscador, Asistente y voz → Voz → Reconocimiento de voz sin conexión → descargá Español (EE.UU.). Mientras tanto, escribí abajo.',
    canDownload: false,
  };
}
