import { Interpreter } from '@/domain/types';

export type Mode = 'ia' | 'local' | 'offline' | 'degraded';

// lastVia es el del último turno con red (null si todavía no hubo): local sin degradar con LLM configurado significa que la key fue rechazada.
export function resolveMode(p: { online: boolean; llmEnabled: boolean; lastDegraded: boolean; lastVia: Interpreter | null }): Mode {
  if (!p.online) return 'offline';
  if (!p.llmEnabled) return 'local';
  if (p.lastDegraded) return 'degraded';
  return p.lastVia === 'local' ? 'local' : 'ia';
}
