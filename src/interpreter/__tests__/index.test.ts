import { FARM } from '@/data/seed';
import { createInterpreter } from '../index';

const toolCallBody = { choices: [{ message: { tool_calls: [{ function: { name: 'consultar_stock', arguments: '{"lote":5}' } }] } }] };
const okFetch = () => jest.fn(async () => ({ ok: true, status: 200, json: async () => toolCallBody })) as unknown as typeof fetch;
const req = { text: '¿Cuántos animales hay en el lote 5?', pending: null, history: [], today: '2026-10-13', events: [] };

describe('createInterpreter', () => {
  it('con red usa el LLM', async () => {
    const interpret = createInterpreter({ llm: { apiKey: 'k', model: 'm', fetchImpl: okFetch() }, isOnline: async () => true, farm: FARM });
    await expect(interpret(req)).resolves.toEqual({ interpretation: { kind: 'intent', intent: { tool: 'consultar_stock', args: { lote: 5 } } }, via: 'ia', degraded: false });
  });

  it('sin red usa el parser y no llama a la API', async () => {
    const fetchImpl = okFetch();
    const interpret = createInterpreter({ llm: { apiKey: 'k', model: 'm', fetchImpl }, isOnline: async () => false, farm: FARM });
    await expect(interpret(req)).resolves.toMatchObject({ via: 'local', degraded: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('si el LLM falla cae al parser en modo degradado y avisa el error', async () => {
    const onLlmError = jest.fn();
    const failing = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    const interpret = createInterpreter({ llm: { apiKey: 'k', model: 'm', fetchImpl: failing }, isOnline: async () => true, farm: FARM, onLlmError });
    await expect(interpret(req)).resolves.toEqual({ interpretation: { kind: 'intent', intent: { tool: 'consultar_stock', args: { lote: 5 } } }, via: 'local', degraded: true });
    expect(onLlmError).toHaveBeenCalled();
  });

  it('sin configuración de LLM siempre es local', async () => {
    const interpret = createInterpreter({ llm: null, isOnline: async () => true, farm: FARM });
    await expect(interpret(req)).resolves.toMatchObject({ via: 'local', degraded: false });
  });
});
