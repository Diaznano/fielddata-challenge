import { FARM } from '@/data/seed';
import { FarmEvent } from '@/domain/types';
import { ToolContext } from '@/tools/types';

export const TODAY = '2026-10-13';

export function makeCtx(events: FarmEvent[] = []): ToolContext {
  let n = 0;
  return {
    farm: FARM,
    events,
    today: TODAY,
    now: '2026-10-13T13:00:00.000Z',
    newId: () => `id-${++n}`,
    origin: { source: 'texto', interpreter: 'local', rawText: 'prueba' },
  };
}
