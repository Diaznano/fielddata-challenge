import { Interpreter } from '@/domain/types';

export type Mode = 'ia' | 'local' | 'offline' | 'degraded';

// lastVia es el del último turno con red (null si todavía no hubo): con LLM configurado, local sin degradar es cualquier falla del LLM que no sea de red (key rechazada, 4xx/5xx, respuesta inválida), y el badge no debe culpar a la conexión.
export function resolveMode(p: { online: boolean; llmEnabled: boolean; lastDegraded: boolean; lastVia: Interpreter | null }): Mode {
  if (!p.online) return 'offline';
  if (!p.llmEnabled) return 'local';
  if (p.lastDegraded) return 'degraded';
  return p.lastVia === 'local' ? 'local' : 'ia';
}
