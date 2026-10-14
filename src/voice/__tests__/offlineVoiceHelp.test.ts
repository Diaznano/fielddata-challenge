import { offlineVoiceHelp } from '../offlineVoiceHelp';

describe('ayuda para usar la voz sin señal', () => {
  it('desde Android 13 ofrece descargar el español desde la app', () => {
    expect(offlineVoiceHelp(33)).toEqual({
      text: 'Para usar la voz sin señal, descargá el español offline (una sola vez, con wifi).',
      canDownload: true,
    });
    expect(offlineVoiceHelp(34).canDownload).toBe(true);
  });

  it('antes de Android 13 no hay API de descarga: explica el camino manual y sigue con el texto', () => {
    const help = offlineVoiceHelp(32);
    expect(help.canDownload).toBe(false);
    expect(help.text).toMatch(/Ajustes/);
    expect(help.text).toMatch(/descargá Español \(EE\.UU\.\)/);
    expect(help.text).toMatch(/escribí abajo/);
    expect(offlineVoiceHelp(31).canDownload).toBe(false);
    expect(offlineVoiceHelp(29).canDownload).toBe(false);
  });
});
