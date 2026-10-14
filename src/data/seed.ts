import { addDays } from '@/domain/dates';
import { Farm, RainEvent } from '@/domain/types';
import seed from './seed.json';

export const FARM: Farm = seed.farm as Farm;
export const SEED_VERSION = '1';

// Las lluvias se guardan como "hace N días" para que el demo tenga datos recientes sin importar cuándo se instale.
export function buildSeedEvents(installDate: string, newId: () => string, recordedAt: string): RainEvent[] {
  return seed.rains.map((r) => ({
    id: newId(),
    type: 'lluvia' as const,
    occurredOn: addDays(installDate, -r.daysAgo),
    recordedAt,
    source: 'semilla' as const,
    interpreter: null,
    rawText: null,
    payload: { mm: r.mm },
  }));
}
