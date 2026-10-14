import { Category, EventSource, FarmEvent } from '@/domain/types';

interface Opts {
  source?: EventSource;
  recordedAt?: string;
  occurredOn?: string;
}

export function rain(id: string, occurredOn: string, mm: number, opts: Opts = {}): FarmEvent {
  return {
    id,
    type: 'lluvia',
    occurredOn,
    recordedAt: opts.recordedAt ?? `${occurredOn}T15:00:00.000Z`,
    source: opts.source ?? 'texto',
    interpreter: null,
    rawText: null,
    payload: { mm },
  };
}

export function move(id: string, count: number, category: Category, fromLot: number, toLot: number, opts: Opts = {}): FarmEvent {
  const occurredOn = opts.occurredOn ?? '2026-10-13';
  return {
    id,
    type: 'movimiento',
    occurredOn,
    recordedAt: opts.recordedAt ?? `${occurredOn}T15:00:00.000Z`,
    source: opts.source ?? 'texto',
    interpreter: 'local',
    rawText: null,
    payload: { category, count, fromLot, toLot },
  };
}

export function voidOf(id: string, targetId: string): FarmEvent {
  return {
    id,
    type: 'anulacion',
    occurredOn: '2026-10-13',
    recordedAt: '2026-10-13T15:30:00.000Z',
    source: 'texto',
    interpreter: 'local',
    rawText: null,
    payload: { targetId },
  };
}
