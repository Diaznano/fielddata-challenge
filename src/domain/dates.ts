const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function monthName(iso: string): string {
  return MONTHS[fromISODate(iso).getMonth()];
}

export function formatLongDate(iso: string): string {
  const d = fromISODate(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function formatShortDate(iso: string): string {
  const d = fromISODate(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function describeDay(iso: string, today: string): string {
  if (iso === today) return 'hoy';
  if (iso === addDays(today, -1)) return 'ayer';
  return `el ${formatShortDate(iso)}`;
}

export const RAIN_PERIODS = ['hoy', 'ayer', 'semana', 'mes', 'mes_anterior', 'ultimos_dias'] as const;
export type RainPeriod = (typeof RAIN_PERIODS)[number];

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

export function periodRange(period: RainPeriod, today: string, days = 7): DateRange {
  const d = fromISODate(today);
  switch (period) {
    case 'hoy':
      return { from: today, to: today, label: 'hoy' };
    case 'ayer': {
      const y = addDays(today, -1);
      return { from: y, to: y, label: 'ayer' };
    }
    case 'semana':
      return { from: addDays(today, -6), to: today, label: 'en los últimos 7 días' };
    case 'mes':
      return { from: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), to: today, label: `en ${MONTHS[d.getMonth()]}` };
    case 'mes_anterior': {
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const last = new Date(d.getFullYear(), d.getMonth(), 0);
      return { from: toISODate(first), to: toISODate(last), label: `en ${MONTHS[first.getMonth()]}` };
    }
    case 'ultimos_dias':
      return { from: addDays(today, -(days - 1)), to: today, label: `en los últimos ${days} días` };
  }
}

export type RelativeDayWord = 'hoy' | 'anoche' | 'ayer' | 'anteayer';

export function resolveRelativeDay(word: RelativeDayWord, today: string): string {
  switch (word) {
    case 'hoy':
      return today;
    case 'anoche':
    case 'ayer':
      return addDays(today, -1);
    case 'anteayer':
      return addDays(today, -2);
  }
}
