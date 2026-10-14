import { InterpretOutcome, InterpretRequest } from '@/conversation/engine';
import { farmSummaryText } from '@/domain/summary';
import { Farm } from '@/domain/types';
import { interpretWithLlm, LlmConfig } from './llm';
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
  return async (req: InterpretRequest): Promise<InterpretOutcome> => {
    if (!deps.llm || !(await deps.isOnline())) return interpretLocally(req);
    try {
      const interpretation = await interpretWithLlm({ ...req, farmSummary: farmSummaryText(deps.farm, req.events) }, deps.llm, deps.timeoutMs);
      return { interpretation, via: 'ia', degraded: false };
    } catch (error) {
      deps.onLlmError?.(error);
      return { ...(await interpretLocally(req)), degraded: true };
    }
  };
}
