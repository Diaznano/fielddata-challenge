import { categoryFromWord, categoryLabel } from '../categories';

describe('categorías', () => {
  it('mapea sinónimos rioplatenses a la categoría canónica', () => {
    expect(categoryFromWord('vaquillas')).toBe('vaquillonas');
    expect(categoryFromWord('vaquillona')).toBe('vaquillonas');
    expect(categoryFromWord('terneras')).toBe('terneros');
    expect(categoryFromWord('novillitos')).toBe('novillos');
    expect(categoryFromWord('toro')).toBe('toros');
  });

  it('mapea las variantes que el reconocedor confunde con vaquillonas', () => {
    for (const word of ['bajillona', 'bajillonas', 'vajillona', 'vajillonas']) {
      expect(categoryFromWord(word)).toBe('vaquillonas');
    }
  });

  it('devuelve null para palabras que no son categorías', () => {
    expect(categoryFromWord('perros')).toBeNull();
    expect(categoryFromWord('lote')).toBeNull();
    expect(categoryFromWord('constructor')).toBeNull();
    expect(categoryFromWord('__proto__')).toBeNull();
  });

  it('usa singular solo para 1', () => {
    expect(categoryLabel('vacas', 1)).toBe('vaca');
    expect(categoryLabel('vaquillonas', 40)).toBe('vaquillonas');
    expect(categoryLabel('toros', 0)).toBe('toros');
  });
});
