import { categoryLabel } from './categories';
import { monthName, periodRange, toISODate } from './dates';
import { formatMm, lastRain, rainInRange, RainItem } from './rain';
import { activeEvents, farmTotal, projectStock } from './stock';
import { CATEGORIES, Farm, FarmEvent } from './types';

export interface TodayRecord {
  time: string;
  text: string;
}

export interface TodaySummary {
  rainTodayMm: number;
  rainMonthMm: number;
  month: string;
  lastRain: RainItem | null;
  totalHeads: number;
  lotCount: number;
  movesToday: number;
  records: TodayRecord[];
}

function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function todaySummary(farm: Farm, events: FarmEvent[], today: string): TodaySummary {
  const recordedToday = activeEvents(events).filter(
    (e) => e.source !== 'semilla' && toISODate(new Date(e.recordedAt)) === today,
  );
  const records = [...recordedToday].reverse().map((e) => ({
    time: localTime(e.recordedAt),
    text:
      e.type === 'lluvia'
        ? `Lluvia ${formatMm(e.payload.mm)} mm`
        : `${e.payload.count} ${categoryLabel(e.payload.category, e.payload.count)} · lote ${e.payload.fromLot} → ${e.payload.toLot}`,
  }));
  return {
    rainTodayMm: rainInRange(events, { from: today, to: today }).totalMm,
    rainMonthMm: rainInRange(events, periodRange('mes', today)).totalMm,
    month: monthName(today),
    lastRain: lastRain(events, today),
    totalHeads: farmTotal(projectStock(farm, events)),
    lotCount: farm.lots.length,
    movesToday: recordedToday.filter((e) => e.type === 'movimiento').length,
    records,
  };
}

export function farmSummaryText(farm: Farm, events: FarmEvent[]): string {
  const stock = projectStock(farm, events);
  return farm.lots
    .map((lot) => {
      const parts = CATEGORIES.filter((c) => stock[lot][c] > 0).map((c) => `${stock[lot][c]} ${c}`);
      return `Lote ${lot}: ${parts.length > 0 ? parts.join(', ') : 'vacío'}`;
    })
    .join('\n');
}
