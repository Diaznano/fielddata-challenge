import { InterpretOutcome, InterpretRequest } from '@/conversation/engine';
import { parseLocal } from './local/parser';

export async function interpretLocally(req: InterpretRequest): Promise<InterpretOutcome> {
  return { interpretation: parseLocal(req.text, req.pending, req.today), via: 'local', degraded: false };
}
