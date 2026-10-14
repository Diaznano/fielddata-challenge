import { InterpretOutcome, InterpretRequest } from '@/conversation/engine';
import { farmSummaryText } from '@/domain/summary';
import { Farm } from '@/domain/types';
import { interpretWithLlm, LlmConfig, LlmError, LlmNetworkError } from './llm';
import { parseLocal } from './local/parser';

export async function interpretLocally(req: InterpretRequest): Promise<InterpretOutcome> {
  return { interpretation: parseLocal(req.text, req.pending, req.today), via: 'local', degraded: false };
}

interface InterpreterDeps {
  llm: LlmConfig | null;
  isOnline: () => Promise<boolean>;
  farm: Farm;
  timeoutMs?: number;
  onLlmError?: (error: unknown) => void;
}

export function createInterpreter(deps: InterpreterDeps) {
  // Una key vencida o sin acceso no se arregla reintentando: cada turno pagaría la ida y vuelta fallida.
  let keyRejected = false;
  return async (req: InterpretRequest): Promise<InterpretOutcome> => {
    if (!deps.llm || keyRejected || !(await deps.isOnline())) return interpretLocally(req);
    try {
      const interpretation = await interpretWithLlm({ ...req, farmSummary: farmSummaryText(deps.farm, req.events) }, deps.llm, deps.timeoutMs);
      return { interpretation, via: 'ia', degraded: false };
    } catch (error) {
      deps.onLlmError?.(error);
      if (error instanceof LlmError && (error.status === 401 || error.status === 403)) {
        keyRejected = true;
        return interpretLocally(req);
      }
      // Un 429/5xx o una salida inválida no son mala señal: el badge no debe culpar a la red.
      return { ...(await interpretLocally(req)), degraded: error instanceof LlmNetworkError };
    }
  };
}
