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

  it('si la red falla cae al parser en modo degradado y avisa el error', async () => {
    const onLlmError = jest.fn();
    const failing = jest.fn(async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
    const interpret = createInterpreter({ llm: { apiKey: 'k', model: 'm', fetchImpl: failing }, isOnline: async () => true, farm: FARM, onLlmError });
    await expect(interpret(req)).resolves.toEqual({ interpretation: { kind: 'intent', intent: { tool: 'consultar_stock', args: { lote: 5 } } }, via: 'local', degraded: true });
    expect(onLlmError).toHaveBeenCalled();
  });

  it('si el LLM no contesta a tiempo cae al parser en modo degradado', async () => {
    const hanging = jest.fn((_url: unknown, init?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as unknown as typeof fetch;
    const interpret = createInterpreter({ llm: { apiKey: 'k', model: 'm', fetchImpl: hanging }, isOnline: async () => true, farm: FARM, timeoutMs: 10 });
    await expect(interpret(req)).resolves.toMatchObject({ via: 'local', degraded: true });
  });

  it.each([429, 500, 503])('con HTTP %i el turno es local sin degradar', async (status) => {
    const onLlmError = jest.fn();
    const failing = jest.fn(async () => ({ ok: false, status, json: async () => ({}) })) as unknown as typeof fetch;
    const interpret = createInterpreter({ llm: { apiKey: 'k', model: 'm', fetchImpl: failing }, isOnline: async () => true, farm: FARM, onLlmError });
    await expect(interpret(req)).resolves.toEqual({ interpretation: { kind: 'intent', intent: { tool: 'consultar_stock', args: { lote: 5 } } }, via: 'local', degraded: false });
    expect(onLlmError).toHaveBeenCalled();
  });

  it('una salida inválida del LLM es local sin degradar', async () => {
    const invalid = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { tool_calls: [{ function: { name: 'inventada', arguments: '{}' } }] } }] }) })) as unknown as typeof fetch;
    const interpret = createInterpreter({ llm: { apiKey: 'k', model: 'm', fetchImpl: invalid }, isOnline: async () => true, farm: FARM });
    await expect(interpret(req)).resolves.toMatchObject({ via: 'local', degraded: false });
  });

  it.each([401, 403])('con HTTP %i la key no sirve: ese turno es local, sin degradar, y los siguientes no llaman a la API', async (status) => {
    const onLlmError = jest.fn();
    const rejected = jest.fn(async () => ({ ok: false, status, json: async () => ({}) })) as unknown as typeof fetch;
    const interpret = createInterpreter({ llm: { apiKey: 'k', model: 'm', fetchImpl: rejected }, isOnline: async () => true, farm: FARM, onLlmError });
    await expect(interpret(req)).resolves.toMatchObject({ via: 'local', degraded: false });
    await expect(interpret(req)).resolves.toMatchObject({ via: 'local', degraded: false });
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(onLlmError).toHaveBeenCalledTimes(1);
  });

  it('un 500 no apaga el LLM: el turno siguiente vuelve a intentarlo', async () => {
    const failing = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    const interpret = createInterpreter({ llm: { apiKey: 'k', model: 'm', fetchImpl: failing }, isOnline: async () => true, farm: FARM });
    await interpret(req);
    await interpret(req);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('sin configuración de LLM siempre es local', async () => {
    const interpret = createInterpreter({ llm: null, isOnline: async () => true, farm: FARM });
    await expect(interpret(req)).resolves.toMatchObject({ via: 'local', degraded: false });
  });
});
