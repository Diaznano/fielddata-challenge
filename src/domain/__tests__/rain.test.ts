import { rain, voidOf } from '@/test-utils/events';
import { formatMm, lastRain, rainInRange } from '../rain';

describe('lluvias', () => {
  const events = [
    rain('a', '2026-10-12', 18),
    rain('b', '2026-10-02', 6),
    rain('c', '2026-09-30', 10),
    rain('d', '2026-10-05', 12.5),
    rain('e', '2026-10-06', 0.2),
    voidOf('v', 'e'),
  ];

  it('suma solo dentro del rango y sin anuladas, ordenado de más nuevo a más viejo', () => {
    const r = rainInRange(events, { from: '2026-10-01', to: '2026-10-13' });
    expect(r.totalMm).toBe(36.5);
    expect(r.items.map((i) => i.date)).toEqual(['2026-10-12', '2026-10-05', '2026-10-02']);
  });

  it('devuelve la última lluvia hasta hoy', () => {
    expect(lastRain(events, '2026-10-13')).toEqual({ date: '2026-10-12', mm: 18 });
    expect(lastRain([], '2026-10-13')).toBeNull();
  });

  it('formatea milímetros con coma decimal', () => {
    expect(formatMm(12.5)).toBe('12,5');
    expect(formatMm(18)).toBe('18');
    expect(formatMm(0.1 + 0.2)).toBe('0,3');
  });
});
