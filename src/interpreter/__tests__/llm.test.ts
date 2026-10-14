import { InterpretRequest } from '@/conversation/engine';
import { ToolResult } from '@/tools';
import { interpretWithLlm, LlmConfig, LlmError, LlmNetworkError, phraseWithLlm, systemPrompt, toolDefinitions } from '../llm';

function fakeFetch(body: unknown, status = 200) {
  return jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;
}

const hangingFetch = ((_url: string, init: RequestInit) =>
  new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;

const toolCall = (name: string, args: object) => ({
  choices: [{ message: { tool_calls: [{ type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
});

const cfg = (fetchImpl: typeof fetch): LlmConfig => ({ apiKey: 'k', model: 'modelo', fetchImpl });
const req = { text: 'pasé 40 vaquillonas del 3 al 5', pending: null, history: [], today: '2026-10-13', events: [], farmSummary: 'Lote 3: 45 vaquillonas' };

describe('interpretWithLlm', () => {
  it('convierte el tool call en un intent validado', async () => {
    const fetchImpl = fakeFetch(toolCall('mover_animales', { cantidad: 40, categoria: 'vaquillonas', lote_origen: 3, lote_destino: 5 }));
    await expect(interpretWithLlm(req, cfg(fetchImpl))).resolves.toEqual({
      kind: 'intent',
      intent: { tool: 'mover_animales', args: { cantidad: 40, categoria: 'vaquillonas', lote_origen: 3, lote_destino: 5 } },
    });
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('modelo');
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'pasé 40 vaquillonas del 3 al 5' });
    expect(init.headers.Authorization).toBe('Bearer k');
  });

  it('descarta null en argumentos opcionales', async () => {
    const fetchImpl = fakeFetch(toolCall('mover_animales', { cantidad: 40, categoria: 'vaquillonas', lote_origen: null, fecha: null }));
    await expect(interpretWithLlm(req, cfg(fetchImpl))).resolves.toEqual({
      kind: 'intent',
      intent: { tool: 'mover_animales', args: { cantidad: 40, categoria: 'vaquillonas' } },
    });
  });

  it('cancelar y respuestas sin herramienta', async () => {
    await expect(interpretWithLlm(req, cfg(fakeFetch(toolCall('cancelar', {}))))).resolves.toEqual({ kind: 'cancel' });
    await expect(interpretWithLlm(req, cfg(fakeFetch({ choices: [{ message: { content: ' Puedo anotar lluvias. ' } }] })))).resolves.toEqual({
      kind: 'reply',
      text: 'Puedo anotar lluvias.',
    });
  });

  it.each([
    ['herramienta desconocida', fakeFetch(toolCall('borrar_todo', {}))],
    ['argumentos inválidos', fakeFetch(toolCall('mover_animales', { categoria: 'perros' }))],
    ['JSON roto', fakeFetch({ choices: [{ message: { tool_calls: [{ function: { name: 'consultar_stock', arguments: '{lote:' } }] } }] })],
    ['respuesta vacía', fakeFetch({ choices: [{ message: { content: '' } }] })],
    ['HTTP 500', fakeFetch({}, 500)],
  ])('%s → LlmError', async (_name, fetchImpl) => {
    await expect(interpretWithLlm(req, cfg(fetchImpl))).rejects.toBeInstanceOf(LlmError);
  });

  it('corta por timeout', async () => {
    await expect(interpretWithLlm(req, cfg(hangingFetch), 20)).rejects.toThrow('timeout');
  });

  it.each([['un número', '5'], ['un string', '"lote 5"'], ['un array', '[1]'], ['null', 'null']])('argumentos que son %s → LlmError', async (_name, raw) => {
    const body = { choices: [{ message: { tool_calls: [{ function: { name: 'consultar_stock', arguments: raw } }] } }] };
    await expect(interpretWithLlm(req, cfg(fakeFetch(body)))).rejects.toBeInstanceOf(LlmError);
  });

  it('solo el timeout y la falla de red son errores de red; una respuesta HTTP o una salida inválida no', async () => {
    const unreachable = jest.fn(async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
    await expect(interpretWithLlm(req, cfg(unreachable))).rejects.toBeInstanceOf(LlmNetworkError);
    await expect(interpretWithLlm(req, cfg(hangingFetch), 20)).rejects.toBeInstanceOf(LlmNetworkError);
    await expect(interpretWithLlm(req, cfg(fakeFetch({}, 503)))).rejects.not.toBeInstanceOf(LlmNetworkError);
    await expect(interpretWithLlm(req, cfg(fakeFetch(toolCall('borrar_todo', {}))))).rejects.not.toBeInstanceOf(LlmNetworkError);
  });

  it('el error HTTP lleva el status', async () => {
    await expect(interpretWithLlm(req, cfg(fakeFetch({}, 401)))).rejects.toMatchObject({ status: 401 });
  });

  describe('request enviado', () => {
    const bodyOf = async (request: InterpretRequest & { farmSummary: string }, config: LlmConfig) => {
      await interpretWithLlm(request, config);
      return JSON.parse((config.fetchImpl as jest.Mock).mock.calls[0][1].body);
    };
    const ok = () => fakeFetch(toolCall('consultar_stock', {}));

    it('manda el historial entre el system prompt y el mensaje actual, con sus roles', async () => {
      const history = [
        { role: 'user' as const, text: 'pasé 40 al 5' },
        { role: 'assistant' as const, text: '¿De qué lote salen?' },
      ];
      const body = await bodyOf({ ...req, history }, cfg(ok()));
      expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
      expect(body.messages.slice(1)).toEqual([
        { role: 'user', content: 'pasé 40 al 5' },
        { role: 'assistant', content: '¿De qué lote salen?' },
        { role: 'user', content: 'pasé 40 vaquillonas del 3 al 5' },
      ]);
    });

    it('el pendiente llega al system prompt del request', async () => {
      const pending = { intent: { tool: 'mover_animales' as const, args: { cantidad: 40 } }, missing: 'lote_origen' as const };
      const body = await bodyOf({ ...req, pending }, cfg(ok()));
      expect(body.messages[0].content).toContain('falta "lote_origen"');
    });

    it('reasoning_effort se manda solo si está configurado', async () => {
      const sin = await bodyOf(req, cfg(ok()));
      expect(sin).not.toHaveProperty('reasoning_effort');
      const con = await bodyOf(req, { ...cfg(ok()), reasoningEffort: 'minimal' });
      expect(con.reasoning_effort).toBe('minimal');
    });
  });
});

describe('definiciones para OpenAI', () => {
  it('expone las 5 herramientas y cancelar, sin $schema', () => {
    const defs = toolDefinitions() as { function: { name: string; parameters: Record<string, unknown> } }[];
    expect(defs.map((d) => d.function.name).sort()).toEqual(['cancelar', 'consultar_lluvia', 'consultar_stock', 'deshacer_ultimo', 'mover_animales', 'registrar_lluvia']);
    expect(defs.every((d) => !('$schema' in d.function.parameters))).toBe(true);
  });

  it('las fechas conservan el patrón YYYY-MM-DD en el schema', () => {
    const defs = toolDefinitions() as { function: { name: string; parameters: { properties: Record<string, { pattern?: string }> } } }[];
    const lluvia = defs.find((d) => d.function.name === 'registrar_lluvia');
    expect(lluvia?.function.parameters.properties.fecha.pattern).toBe('^\\d{4}-\\d{2}-\\d{2}$');
  });

  it('el prompt pide pasar fecha solo si el productor la dijo', () => {
    const prompt = systemPrompt({ today: '2026-10-13', farmSummary: 'Lote 3: 45 vaquillonas', pending: null });
    expect(prompt).toContain('Pasá fecha solo si el productor dijo cuándo');
  });

  it('el prompt incluye fecha, campo y pendiente', () => {
    const prompt = systemPrompt({
      today: '2026-10-13',
      farmSummary: 'Lote 3: 45 vaquillonas',
      pending: { intent: { tool: 'mover_animales', args: { cantidad: 40 } }, missing: 'lote_origen' },
    });
    expect(prompt).toContain('martes 13 de octubre (2026-10-13)');
    expect(prompt).toContain('Lote 3: 45 vaquillonas');
    expect(prompt).toContain('falta "lote_origen"');
  });
});

describe('phraseWithLlm', () => {
  const ok: ToolResult = { status: 'ok', newEvents: [], speech: 'Anotado: 18 milímetros ayer.', card: { tone: 'registro', title: 'Lluvia registrada', lines: [] } };

  it('devuelve el texto redactado', async () => {
    await expect(phraseWithLlm('llovieron 18', ok, cfg(fakeFetch({ choices: [{ message: { content: 'Listo, 18 milímetros de ayer.' } }] })))).resolves.toBe('Listo, 18 milímetros de ayer.');
  });

  it('ante cualquier error devuelve null', async () => {
    await expect(phraseWithLlm('llovieron 18', ok, cfg(fakeFetch({}, 500)))).resolves.toBeNull();
    await expect(phraseWithLlm('llovieron 18', ok, cfg(hangingFetch), 20)).resolves.toBeNull();
  });

  it('un rechazo viaja con su estado y la instrucción de no presentarlo como confirmación', async () => {
    const rejected: ToolResult = { status: 'rejected', speech: 'No puedo mover 50: en el lote 3 hay 45.', card: { tone: 'rechazo', title: 'No se pudo mover', lines: [] } };
    const fetchImpl = fakeFetch({ choices: [{ message: { content: 'No pude, no quedó nada anotado.' } }] });
    await phraseWithLlm('pasé 50 al 5', rejected, cfg(fetchImpl));
    const body = JSON.parse((fetchImpl as jest.Mock).mock.calls[0][1].body);
    const [system, user] = body.messages;
    expect(system.content).toContain('rechazo');
    expect(system.content).toContain('no se registró nada');
    expect(user.content).toContain('"estado":"rejected"');
  });
});
