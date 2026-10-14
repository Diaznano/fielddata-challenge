import { bestTranscript } from '../transcript';

describe('mejor hipótesis del reconocedor', () => {
  it('elige la de mayor confianza', () => {
    const results = [
      { transcript: 'llovieron 18 mm anoches', confidence: 0.929 },
      { transcript: 'llovieron 18 mm anoche', confidence: 0.948 },
      { transcript: 'llovieron 18 milímetros anoche', confidence: 0.726 },
    ];
    expect(bestTranscript(results)).toBe('llovieron 18 mm anoche');
  });

  it('con empate de confianza queda la primera', () => {
    const results = [
      { transcript: 'pasé 40 vacas', confidence: 0.8 },
      { transcript: 'pase 40 vacas', confidence: 0.8 },
    ];
    expect(bestTranscript(results)).toBe('pasé 40 vacas');
  });

  it('si la confianza no viene (0 o -1) queda la primera no vacía', () => {
    expect(bestTranscript([{ transcript: 'hola che', confidence: 0 }, { transcript: 'ola che', confidence: 0 }])).toBe('hola che');
    expect(bestTranscript([{ transcript: 'hola che', confidence: -1 }, { transcript: 'ola che', confidence: -1 }])).toBe('hola che');
  });

  it('ignora las hipótesis vacías aunque tengan más confianza', () => {
    const results = [
      { transcript: '', confidence: 0.99 },
      { transcript: '   ', confidence: 0.98 },
      { transcript: 'cuántos animales hay', confidence: 0.4 },
    ];
    expect(bestTranscript(results)).toBe('cuántos animales hay');
  });

  it('sin hipótesis o todas vacías devuelve vacío', () => {
    expect(bestTranscript([])).toBe('');
    expect(bestTranscript([{ transcript: '', confidence: 1 }])).toBe('');
  });

  it('descarta las hipótesis truncadas aunque tengan más confianza (caso real: "del" 0.826 vs "del 7" 0.698)', () => {
    const results = [
      { transcript: 'del 7', confidence: 0.698 },
      { transcript: 'del Siete', confidence: 0.514 },
      { transcript: 'del', confidence: 0.826 },
    ];
    expect(bestTranscript(results)).toBe('del 7');
  });

  it('el prefijo se compara por palabras, sin importar mayúsculas ni espacios de más', () => {
    const results = [
      { transcript: 'Pasé  40', confidence: 0.9 },
      { transcript: 'pasé 40 vacas', confidence: 0.5 },
    ];
    expect(bestTranscript(results)).toBe('pasé 40 vacas');
  });

  it('un prefijo parcial de una palabra no cuenta como prefijo', () => {
    const results = [
      { transcript: 'del', confidence: 0.9 },
      { transcript: 'delta 7', confidence: 0.5 },
    ];
    expect(bestTranscript(results)).toBe('del');
  });

  it('con una sola hipótesis no se descarta nada', () => {
    expect(bestTranscript([{ transcript: 'del', confidence: 0.3 }])).toBe('del');
  });

  it('dos hipótesis iguales no se descartan entre sí', () => {
    const results = [
      { transcript: 'del 7', confidence: 0.4 },
      { transcript: 'Del 7', confidence: 0.6 },
    ];
    expect(bestTranscript(results)).toBe('Del 7');
  });
});
