import { EventSource, Farm, FarmEvent, Interpreter } from '@/domain/types';
import { Card } from './cards';
import { Intent } from './schemas';

export type Slot = 'mm' | 'confirmacion' | 'cantidad' | 'categoria' | 'lote_origen' | 'lote_destino';

export interface PendingInfo {
  intent: Intent;
  missing: Slot;
}

export interface ToolContext {
  farm: Farm;
  events: FarmEvent[];
  today: string;
  now: string;
  newId: () => string;
  origin: { source: EventSource; interpreter: Interpreter; rawText: string };
}

export type ToolResult =
  | { status: 'ok'; card: Card; speech: string; newEvents: FarmEvent[] }
  | { status: 'needs_info'; missing: Slot; partial: Intent; question: string; card: Card }
  | { status: 'rejected'; card: Card; speech: string };
