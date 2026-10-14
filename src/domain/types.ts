export const CATEGORIES = ['vacas', 'vaquillonas', 'terneros', 'novillos', 'toros'] as const;
export type Category = (typeof CATEGORIES)[number];
export type CategoryCounts = Record<Category, number>;
export type StockByLot = Record<number, CategoryCounts>;

export interface Farm {
  name: string;
  location: string;
  lots: number[];
  initialStock: Record<number, Partial<CategoryCounts>>;
}

export type EventSource = 'voz' | 'texto' | 'semilla';
export type Interpreter = 'ia' | 'local';

interface BaseEvent {
  id: string;
  occurredOn: string;
  recordedAt: string;
  source: EventSource;
  interpreter: Interpreter | null;
  rawText: string | null;
}

export interface RainEvent extends BaseEvent {
  type: 'lluvia';
  payload: { mm: number };
}

export interface MoveEvent extends BaseEvent {
  type: 'movimiento';
  payload: { category: Category; count: number; fromLot: number; toLot: number };
}

export interface VoidEvent extends BaseEvent {
  type: 'anulacion';
  payload: { targetId: string };
}

export type FarmEvent = RainEvent | MoveEvent | VoidEvent;
