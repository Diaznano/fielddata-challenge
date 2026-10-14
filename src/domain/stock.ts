import { CATEGORIES, CategoryCounts, Farm, FarmEvent, MoveEvent, RainEvent, StockByLot } from './types';

export function emptyCounts(): CategoryCounts {
  return { vacas: 0, vaquillonas: 0, terneros: 0, novillos: 0, toros: 0 };
}

export function countTotal(counts: CategoryCounts): number {
  return CATEGORIES.reduce((sum, c) => sum + counts[c], 0);
}

export function activeEvents(events: FarmEvent[]): (RainEvent | MoveEvent)[] {
  const voided = new Set(events.flatMap((e) => (e.type === 'anulacion' ? [e.payload.targetId] : [])));
  return events.filter((e): e is RainEvent | MoveEvent => e.type !== 'anulacion' && !voided.has(e.id));
}

export function projectStock(farm: Farm, events: FarmEvent[]): StockByLot {
  const stock: StockByLot = {};
  for (const lot of farm.lots) stock[lot] = { ...emptyCounts(), ...farm.initialStock[lot] };
  for (const e of activeEvents(events)) {
    if (e.type !== 'movimiento') continue;
    const { category, count, fromLot, toLot } = e.payload;
    stock[fromLot][category] -= count;
    stock[toLot][category] += count;
  }
  return stock;
}

export function farmTotal(stock: StockByLot): number {
  return Object.values(stock).reduce((sum, counts) => sum + countTotal(counts), 0);
}
