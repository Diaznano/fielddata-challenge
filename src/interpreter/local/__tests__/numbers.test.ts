import { tokenize } from '../normalize';
import { findNumbers, readNumberAt } from '../numbers';

const read = (text: string, allowArticles = false) => readNumberAt(tokenize(text), 0, { allowArticles })?.value ?? null;

describe('números', () => {
  it.each([
    ['18', 18],
    ['12.5', 12.5],
    ['cero', 0],
    ['dieciocho', 18],
    ['veintidos', 22],
    ['treinta', 30],
    ['cuarenta y cinco', 45],
    ['cien', 100],
    ['ciento veinte', 120],
    ['ciento cinco', 105],
    ['doscientos cincuenta', 250],
  ])('"%s" = %d', (text, value) => {
    expect(read(text)).toBe(value);
  });

  it('no toma artículos como números salvo que se pida', () => {
    expect(read('una')).toBeNull();
    expect(read('una', true)).toBe(1);
    expect(read('uno', true)).toBe(1);
  });

  it('encuentra todos los números con sus posiciones', () => {
    expect(findNumbers(tokenize('pase cuarenta vaquillas del tres al cinco')).map((n) => n.value)).toEqual([40, 3, 5]);
    expect(findNumbers(tokenize('una lluvia de 18')).map((n) => n.value)).toEqual([18]);
    expect(findNumbers(tokenize('cuarenta y cinco vacas'))).toEqual([{ value: 45, start: 0, end: 3 }]);
  });

  it('"y" sin unidad no se consume', () => {
    expect(findNumbers(tokenize('treinta y vacas'))).toEqual([{ value: 30, start: 0, end: 1 }]);
  });
});
