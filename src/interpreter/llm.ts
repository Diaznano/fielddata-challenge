import { z } from 'zod';
import { Interpretation, InterpretRequest } from '@/conversation/engine';
import { formatLongDate } from '@/domain/dates';
import { cleanArgs, parseIntent, PendingInfo, ToolName, toolDescriptions, ToolResult, toolSchemas } from '@/tools';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export interface LlmConfig {
  apiKey: string;
  model: string;
  reasoningEffort?: string;
  fetchImpl?: typeof fetch;
}

export class LlmError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export function toolDefinitions(): object[] {
  const tools = (Object.keys(toolSchemas) as ToolName[]).map((name) => {
    const { $schema: _schema, ...parameters } = z.toJSONSchema(toolSchemas[name]) as Record<string, unknown>;
    return { type: 'function', function: { name, description: toolDescriptions[name], parameters } };
  });
  return [
    ...tools,
    {
      type: 'function',
      function: { name: 'cancelar', description: 'El productor cancela la acción pendiente.', parameters: { type: 'object', properties: {} } },
    },
  ];
}

export function systemPrompt(ctx: { today: string; farmSummary: string; pending: PendingInfo | null }): string {
  return [
    'Sos el asistente de campo de un productor ganadero de Argentina. Recibís lo que dijo (español rioplatense transcripto por voz, puede tener errores) y llamás UNA herramienta.',
    `Hoy es ${formatLongDate(ctx.today)} (${ctx.today}). "Anoche" es el día anterior. Las fechas van como YYYY-MM-DD.`,
    `Stock actual del campo:\n${ctx.farmSummary}`,
    'Categorías: vacas, vaquillonas, terneros, novillos, toros (vaquillas = vaquillonas, terneras = terneros).',
    'Reglas:',
    '- Si quiere registrar o consultar algo, llamá la herramienta aunque falten datos: pasá solo lo que dijo. La app pregunta lo que falte. Nunca inventes datos.',
    '- Pasá fecha solo si el productor dijo cuándo (ayer, anoche, un día puntual). Si no dijo cuándo, omitila: la app asume hoy.',
    '- Si habla de "todas", "todos" o "los toros" sin número, usá cantidad "todas".',
    '- Si quiere borrar o corregir lo último, usá deshacer_ultimo.',
    '- Si no tiene que ver con el campo, respondé en una frase corta qué podés hacer, sin herramientas.',
    ctx.pending
      ? `Hay una acción pendiente: ${ctx.pending.intent.tool} con ${JSON.stringify(ctx.pending.intent.args)}; falta "${ctx.pending.missing}". Si el productor responde ese dato, llamá ${ctx.pending.intent.tool} con TODOS los argumentos combinados. Si cancela, llamá cancelar.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function post(body: Record<string, unknown>, cfg: LlmConfig, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await (cfg.fetchImpl ?? fetch)(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, ...(cfg.reasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {}), ...body }),
      signal: controller.signal,
    });
    if (!res.ok) throw new LlmError(`HTTP ${res.status}`, res.status);
    return await res.json();
  } catch (e) {
    if (e instanceof LlmError) throw e;
    throw new LlmError(controller.signal.aborted ? 'timeout' : String(e));
  } finally {
    clearTimeout(timer);
  }
}

export async function interpretWithLlm(req: InterpretRequest & { farmSummary: string }, cfg: LlmConfig, timeoutMs = 4000): Promise<Interpretation> {
  const messages = [
    { role: 'system', content: systemPrompt({ today: req.today, farmSummary: req.farmSummary, pending: req.pending }) },
    ...req.history.map((t) => ({ role: t.role, content: t.text })),
    { role: 'user', content: req.text },
  ];
  const json = await post({ messages, tools: toolDefinitions(), tool_choice: 'auto', parallel_tool_calls: false, max_completion_tokens: 500 }, cfg, timeoutMs);
  const message = json?.choices?.[0]?.message;
  const call = message?.tool_calls?.[0];
  if (call) {
    if (call.function?.name === 'cancelar') return { kind: 'cancel' };
    let args: unknown;
    try {
      args = JSON.parse(call.function?.arguments || '{}');
    } catch {
      throw new LlmError('argumentos no son JSON');
    }
    if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new LlmError('argumentos no son un objeto');
    const intent = parseIntent(call.function?.name ?? '', cleanArgs(args as Record<string, unknown>));
    if (!intent) throw new LlmError(`tool call inválido: ${call.function?.name}`);
    return { kind: 'intent', intent };
  }
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  if (content) return { kind: 'reply', text: content };
  throw new LlmError('respuesta vacía');
}

export async function phraseWithLlm(userText: string, result: ToolResult, cfg: LlmConfig, timeoutMs = 2500): Promise<string | null> {
  try {
    const json = await post(
      {
        messages: [
          {
            role: 'system',
            content:
              'Sos la voz de una app de campo. Reescribí la respuesta en español rioplatense, cálida y breve (máximo 20 palabras). Usá SOLO los números del resultado y no agregues datos. Si el estado es "rejected" (rechazo), la respuesta tiene que dejar claro que no se registró nada; nunca la redactes como una confirmación. Devolvé solo el texto a decir.',
          },
          { role: 'user', content: `El productor dijo: "${userText}"\nResultado: ${JSON.stringify({ estado: result.status, comprobante: result.card, respuesta_base: result.status === 'needs_info' ? result.question : result.speech })}` },
        ],
        max_completion_tokens: 300,
      },
      cfg,
      timeoutMs,
    );
    const text = json?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}
