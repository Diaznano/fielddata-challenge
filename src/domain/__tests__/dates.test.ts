import { addDays, describeDay, formatLongDate, formatShortDate, isValidISODate, monthRangeOf, periodRange, resolveRelativeDay, toISODate } from '../dates';

describe('fechas', () => {
  it('formatea fechas locales como YYYY-MM-DD', () => {
    expect(toISODate(new Date(2026, 9, 3, 23, 59))).toBe('2026-10-03');
  });

  it('suma y resta días cruzando meses y años', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('anoche y ayer son el día anterior; anteayer, dos días antes', () => {
    expect(resolveRelativeDay('anoche', '2026-10-13')).toBe('2026-10-12');
    expect(resolveRelativeDay('ayer', '2026-10-01')).toBe('2026-09-30');
    expect(resolveRelativeDay('anteayer', '2026-10-01')).toBe('2026-09-29');
    expect(resolveRelativeDay('hoy', '2026-10-13')).toBe('2026-10-13');
  });

  it('calcula el rango de este mes hasta hoy', () => {
    expect(periodRange('mes', '2026-10-13')).toEqual({ from: '2026-10-01', to: '2026-10-13', label: 'en octubre' });
  });

  it('calcula el mes anterior completo', () => {
    expect(periodRange('mes_anterior', '2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-28', label: 'en febrero' });
  });

  it('últimos N días incluye hoy', () => {
    expect(periodRange('ultimos_dias', '2026-10-13', 10)).toEqual({ from: '2026-10-04', to: '2026-10-13', label: 'en los últimos 10 días' });
    expect(periodRange('semana', '2026-10-13')).toEqual({ from: '2026-10-07', to: '2026-10-13', label: 'en los últimos 7 días' });
  });

  it('hoy y ayer como rangos de un día', () => {
    expect(periodRange('hoy', '2026-10-13')).toEqual({ from: '2026-10-13', to: '2026-10-13', label: 'hoy' });
    expect(periodRange('ayer', '2026-10-13')).toEqual({ from: '2026-10-12', to: '2026-10-12', label: 'ayer' });
  });

  it('describe días relativos y fechas en español', () => {
    expect(describeDay('2026-10-13', '2026-10-13')).toBe('hoy');
    expect(describeDay('2026-10-12', '2026-10-13')).toBe('ayer');
    expect(describeDay('2026-10-02', '2026-10-13')).toBe('el 2/10');
    expect(formatLongDate('2026-10-13')).toBe('martes 13 de octubre');
    expect(formatShortDate('2026-01-05')).toBe('5/1');
  });

  it('valida fechas de calendario reales', () => {
    expect(isValidISODate('2026-10-13')).toBe(true);
    expect(isValidISODate('2028-02-29')).toBe(true);
    for (const bad of ['2026-09-31', '2026-02-30', '2025-13-01', '2026-10-00', '2026-1-05', 'ayer']) {
      expect(isValidISODate(bad)).toBe(false);
    }
  });

  it('rango del mes de una fecha, acotado a hoy', () => {
    expect(monthRangeOf('2026-10-31', '2026-11-01')).toEqual({ from: '2026-10-01', to: '2026-10-31', label: 'en octubre' });
    expect(monthRangeOf('2026-10-02', '2026-10-13')).toEqual({ from: '2026-10-01', to: '2026-10-13', label: 'en octubre' });
    expect(monthRangeOf('2028-02-10', '2028-03-05')).toEqual({ from: '2028-02-01', to: '2028-02-29', label: 'en febrero' });
  });
});
