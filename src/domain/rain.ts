import { DateRange } from './dates';
import { activeEvents } from './stock';
import { FarmEvent, RainEvent } from './types';

export interface RainItem {
  date: string;
  mm: number;
}

export interface RainSummary {
  totalMm: number;
  items: RainItem[];
}

export function roundMm(mm: number): number {
  return Math.round(mm * 10) / 10;
}

export function formatMm(mm: number): string {
  return String(roundMm(mm)).replace('.', ',');
}

function rains(events: FarmEvent[]): RainEvent[] {
  return activeEvents(events).filter((e): e is RainEvent => e.type === 'lluvia');
}

function rainByDay(events: FarmEvent[], keep: (date: string) => boolean): RainItem[] {
  const byDate = new Map<string, number>();
  for (const e of rains(events)) {
    if (keep(e.occurredOn)) byDate.set(e.occurredOn, (byDate.get(e.occurredOn) ?? 0) + e.payload.mm);
  }
  return [...byDate]
    .map(([date, mm]) => ({ date, mm: roundMm(mm) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function rainInRange(events: FarmEvent[], range: Pick<DateRange, 'from' | 'to'>): RainSummary {
  const items = rainByDay(events, (date) => date >= range.from && date <= range.to);
  return { totalMm: roundMm(items.reduce((sum, i) => sum + i.mm, 0)), items };
}

export function lastRain(events: FarmEvent[], today: string): RainItem | null {
  return rainByDay(events, (date) => date <= today)[0] ?? null;
}
