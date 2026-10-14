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

export function rainInRange(events: FarmEvent[], range: Pick<DateRange, 'from' | 'to'>): RainSummary {
  const items = rains(events)
    .filter((e) => e.occurredOn >= range.from && e.occurredOn <= range.to)
    .map((e) => ({ date: e.occurredOn, mm: e.payload.mm }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { totalMm: roundMm(items.reduce((sum, i) => sum + i.mm, 0)), items };
}

export function lastRain(events: FarmEvent[], today: string): RainItem | null {
  const past = rains(events)
    .filter((e) => e.occurredOn <= today)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  return past.length > 0 ? { date: past[0].occurredOn, mm: past[0].payload.mm } : null;
}
