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
    expect(bestTranscript([{ transcript: 'hola', confidence: 0 }, { transcript: 'hola che', confidence: 0 }])).toBe('hola');
    expect(bestTranscript([{ transcript: 'hola', confidence: -1 }, { transcript: 'hola che', confidence: -1 }])).toBe('hola');
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
});
