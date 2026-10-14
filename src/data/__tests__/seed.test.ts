import { farmTotal, projectStock } from '@/domain/stock';
import { rainInRange } from '@/domain/rain';
import { buildSeedEvents, FARM } from '../seed';

describe('semilla', () => {
  it('La Tranquera tiene 8 lotes y 450 cabezas', () => {
    expect(FARM.name).toBe('La Tranquera');
    expect(FARM.lots).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const stock = projectStock(FARM, []);
    expect(farmTotal(stock)).toBe(450);
    expect(stock[3].vaquillonas).toBe(45);
    expect(stock[5].vaquillonas).toBe(40);
    expect(stock[8]).toEqual({ vacas: 0, vaquillonas: 0, terneros: 0, novillos: 0, toros: 0 });
  });

  it('materializa las lluvias relativas a la fecha de instalación', () => {
    let n = 0;
    const events = buildSeedEvents('2026-10-13', () => `s-${++n}`, '2026-10-13T12:00:00.000Z');
    expect(events).toHaveLength(9);
    expect(events[0]).toMatchObject({ id: 's-1', type: 'lluvia', occurredOn: '2026-10-11', source: 'semilla', payload: { mm: 6 } });
    expect(rainInRange(events, { from: '2026-08-14', to: '2026-10-13' }).totalMm).toBe(123);
    expect(new Set(events.map((e) => e.id)).size).toBe(9);
  });
});
