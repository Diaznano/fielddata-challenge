import { EventStore } from '@/data/eventStore';
import { toISODate } from '@/domain/dates';
import { EventSource, Farm, FarmEvent, Interpreter } from '@/domain/types';
import { Card, Intent, mergeIntent, PendingInfo, runTool, ToolResult } from '@/tools';

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export interface Pending extends PendingInfo {
  createdAt: number;
}

export interface ConversationState {
  pending: Pending | null;
  history: Turn[];
}

export const initialConversation: ConversationState = { pending: null, history: [] };
export const PENDING_TTL_MS = 60_000;
const HISTORY_LIMIT = 6;

export const HELP_LINES = [
  '"Llovieron 18 milímetros anoche"',
  '"Pasé 40 vaquillonas del lote 3 al 5"',
  '"¿Cuánto llovió este mes?"',
  '"¿Cuántos animales hay en el lote 5?"',
];

export type Interpretation =
  | { kind: 'intent'; intent: Intent }
  | { kind: 'cancel' }
  | { kind: 'unknown' }
  | { kind: 'reply'; text: string };

export interface InterpretRequest {
  text: string;
  pending: PendingInfo | null;
  history: Turn[];
  today: string;
  events: FarmEvent[];
}

export interface InterpretOutcome {
  interpretation: Interpretation;
  via: Interpreter;
  degraded: boolean;
}

export interface TurnDeps {
  farm: Farm;
  store: EventStore;
  interpret: (req: InterpretRequest) => Promise<InterpretOutcome>;
  phrase?: (userText: string, result: ToolResult) => Promise<string | null>;
  now: () => Date;
  newId: () => string;
}

export interface TurnOutcome {
  card: Card;
  speech: string;
  via: Interpreter;
  degraded: boolean;
  expectsReply: boolean;
  state: ConversationState;
}

interface TurnMeta {
  text: string;
  via: Interpreter;
  degraded: boolean;
}

function activePending(state: ConversationState, now: Date): Pending | null {
  return state.pending && now.getTime() - state.pending.createdAt < PENDING_TTL_MS ? state.pending : null;
}

function reply(state: ConversationState, meta: TurnMeta, card: Card, speech: string, pending: Pending | null, expectsReply = false): TurnOutcome {
  const history: Turn[] = [...state.history, { role: 'user' as const, text: meta.text }, { role: 'assistant' as const, text: speech }].slice(-HISTORY_LIMIT);
  return { card, speech, via: meta.via, degraded: meta.degraded, expectsReply, state: { pending, history } };
}

// La redacción va antes del append y tolera fallas: un rechazo del LLM después de guardar haría que el usuario repita y se duplique el evento.
async function phraseOrNull(phrase: NonNullable<TurnDeps['phrase']>, userText: string, result: ToolResult): Promise<string | null> {
  try {
    return (await phrase(userText, result))?.trim() || null;
  } catch {
    return null;
  }
}

// El LLM puede mandar confirmado:true en cualquier turno; solo vale como respuesta a la pregunta de confirmación vigente.
function withoutUnaskedConfirmation(intent: Intent, pending: Pending | null): Intent {
  if (intent.tool !== 'registrar_lluvia' || !intent.args.confirmado || pending?.missing === 'confirmacion') return intent;
  const { confirmado: _confirmado, ...args } = intent.args;
  return { tool: intent.tool, args };
}

async function execute(intent: Intent, source: EventSource, state: ConversationState, deps: TurnDeps, meta: TurnMeta, events: FarmEvent[], now: Date): Promise<TurnOutcome> {
  const result = runTool(intent, {
    farm: deps.farm,
    events,
    today: toISODate(now),
    now: now.toISOString(),
    newId: deps.newId,
    origin: { source, interpreter: meta.via, rawText: meta.text },
  });
  if (result.status === 'needs_info') {
    return reply(state, meta, result.card, result.question, { intent: result.partial, missing: result.missing, createdAt: now.getTime() }, true);
  }
  // Los rechazos van siempre con la plantilla: una redacción no puede sonar a confirmación de algo que no se guardó.
  const phrased = result.status === 'ok' && meta.via === 'ia' && deps.phrase ? await phraseOrNull(deps.phrase, meta.text, result) : null;
  if (result.status === 'ok' && result.newEvents.length > 0) await deps.store.append(result.newEvents);
  return reply(state, meta, result.card, phrased ?? result.speech, null);
}

export async function runTurn(text: string, source: EventSource, state: ConversationState, deps: TurnDeps): Promise<TurnOutcome> {
  const now = deps.now();
  const today = toISODate(now);
  const pending = activePending(state, now);
  const events = await deps.store.list();
  // Con el pendiente vencido el historial sigue mostrando su pregunta y el LLM lo reconstruiría.
  const history = state.pending && !pending ? [] : state.history;
  const { interpretation, via, degraded } = await deps.interpret({ text, pending, history, today, events });
  const meta: TurnMeta = { text, via, degraded };

  switch (interpretation.kind) {
    case 'cancel':
      return reply(state, meta, { tone: 'ayuda', title: 'Cancelado', lines: ['No registré nada.'] }, 'Listo, lo dejamos ahí.', null);
    case 'unknown':
      return reply(
        state,
        meta,
        { tone: 'ayuda', title: 'No te entendí', lines: ['Probá decir:', ...HELP_LINES] },
        'No te entendí. Probá, por ejemplo: llovieron dieciocho milímetros anoche.',
        pending,
      );
    case 'reply':
      return reply(state, meta, { tone: 'ayuda', title: 'La Tranquera', lines: [interpretation.text] }, interpretation.text, pending);
    case 'intent': {
      const merged = pending ? mergeIntent(pending.intent, interpretation.intent) : interpretation.intent;
      return execute(withoutUnaskedConfirmation(merged, pending), source, state, deps, meta, events, now);
    }
  }
}

export async function runIntentTurn(intent: Intent, rawText: string, state: ConversationState, deps: TurnDeps): Promise<TurnOutcome> {
  const now = deps.now();
  const events = await deps.store.list();
  return execute(intent, 'texto', state, deps, { text: rawText, via: 'local', degraded: false }, events, now);
}
