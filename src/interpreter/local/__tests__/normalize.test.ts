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

  it('tokeniza sin vacíos', () => {
    expect(tokenize('  ¿Qué hay?  ')).toEqual(['que', 'hay']);
    expect(tokenize('')).toEqual([]);
  });
});
