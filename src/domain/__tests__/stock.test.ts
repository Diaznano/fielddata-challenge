import { move, voidOf } from '@/test-utils/events';
import { activeEvents, countTotal, farmTotal, projectStock } from '../stock';
import { Farm } from '../types';

const farm: Farm = {
  name: 'Test',
  location: 'X',
  lots: [1, 2, 3],
  initialStock: { 1: { vacas: 10 }, 2: { vaquillonas: 5 }, 3: {} },
};

describe('stock', () => {
  it('completa con ceros las categorías ausentes', () => {
    const stock = projectStock(farm, []);
    expect(stock[3]).toEqual({ vacas: 0, vaquillonas: 0, terneros: 0, novillos: 0, toros: 0 });
    expect(countTotal(stock[1])).toBe(10);
    expect(farmTotal(stock)).toBe(15);
  });

  it('aplica movimientos en orden', () => {
    const stock = projectStock(farm, [move('a', 4, 'vacas', 1, 3), move('b', 1, 'vacas', 3, 2)]);
    expect(stock[1].vacas).toBe(6);
    expect(stock[3].vacas).toBe(3);
    expect(stock[2].vacas).toBe(1);
  });

  it('ignora movimientos anulados y las anulaciones mismas', () => {
    const events = [move('a', 4, 'vacas', 1, 3), voidOf('v', 'a')];
    expect(projectStock(farm, events)[1].vacas).toBe(10);
    expect(activeEvents(events)).toEqual([]);
  });
});
