import { normalize, tokenize } from '../normalize';

describe('normalize', () => {
  it.each([
    ['¿Cuánto llovió este mes?', 'cuanto llovio este mes'],
    ['Llovieron 18mm anoche.', 'llovieron 18 mm anoche'],
    ['Cayeron 12,5 milímetros', 'cayeron 12.5 milimetros'],
    ['¡Pasé 40 Vaquillonas del Lote 3 al 5!', 'pase 40 vaquillonas del lote 3 al 5'],
    ['  Borrá   eso  ', 'borra eso'],
    ['Año, ñandú', 'ano nandu'],
  ])('"%s" → "%s"', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it.each([
    ['Pasé 1.500 novillos', 'pase 1500 novillos'],
    ['Llovieron 12.5 mm', 'llovieron 12.5 mm'],
    ['cayeron 12,5mm', 'cayeron 12.5 mm'],
    ['lote3', 'lote 3'],
  ])('"%s" → "%s" (miles es-AR y unidades pegadas)', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it('tokeniza sin vacíos', () => {
    expect(tokenize('  ¿Qué hay?  ')).toEqual(['que', 'hay']);
    expect(tokenize('')).toEqual([]);
  });
});
