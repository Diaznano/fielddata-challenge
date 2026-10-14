import { move, rain } from '@/test-utils/events';
import { farmSummaryText, todaySummary } from '../summary';
import { Farm } from '../types';

const farm: Farm = {
  name: 'Test',
  location: 'X',
  lots: [1, 2],
  initialStock: { 1: { vacas: 10, terneros: 4 }, 2: {} },
};

const at = (h: number, m: number) => new Date(2026, 9, 13, h, m).toISOString();

describe('resumen de hoy', () => {
  it('cuenta lluvias, cabezas y registros de hoy sin incluir la semilla', () => {
    const events = [
      rain('s1', '2026-10-11', 20, { source: 'semilla', recordedAt: at(8, 0) }),
      rain('r1', '2026-10-13', 5, { recordedAt: at(9, 15) }),
      move('m1', 3, 'vacas', 1, 2, { recordedAt: at(10, 42) }),
      rain('old', '2026-10-12', 7, { recordedAt: new Date(2026, 9, 12, 18, 0).toISOString() }),
    ];
    const s = todaySummary(farm, events, '2026-10-13');
    expect(s.rainTodayMm).toBe(5);
    expect(s.rainMonthMm).toBe(32);
    expect(s.month).toBe('octubre');
    expect(s.lastRain).toEqual({ date: '2026-10-13', mm: 5 });
    expect(s.totalHeads).toBe(14);
    expect(s.lotCount).toBe(2);
    expect(s.movesToday).toBe(1);
    expect(s.records).toEqual([
      { time: '10:42', text: '3 vacas · lote 1 → 2' },
      { time: '09:15', text: 'Lluvia 5 mm' },
    ]);
  });

  it('describe el stock por lote para el prompt del LLM', () => {
    expect(farmSummaryText(farm, [])).toBe('Lote 1: 10 vacas, 4 terneros\nLote 2: vacío');
  });
});
