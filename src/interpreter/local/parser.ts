import { categoryFromWord } from '@/domain/categories';
import { RelativeDayWord, resolveRelativeDay } from '@/domain/dates';
import { Category } from '@/domain/types';
import { cleanArgs, mergeIntent, withArgs } from '@/tools/intent';
import { Intent, ToolArgs } from '@/tools/schemas';
import { PendingInfo } from '@/tools/types';
import { tokenize } from './normalize';
import { findNumbers, readNumberAt } from './numbers';

export type LocalParse = { kind: 'intent'; intent: Intent } | { kind: 'cancel' } | { kind: 'unknown' };

const RAIN_WORDS = new Set(['llovio', 'llovieron', 'llueve', 'lluvia', 'lluvias', 'cayo', 'cayeron', 'agua', 'milimetro', 'milimetros', 'mm']);
const RAIN_WRITE_VERBS = new Set(['llovieron', 'cayeron', 'cayo', 'anota', 'anotame', 'registra', 'registrame', 'carga', 'cargame']);
const RAIN_COMPARISON = new Set(['mas', 'menos']);
const QUANTITY_QUESTION = new Set(['cuanto', 'cuanta', 'cuantos', 'cuantas']);
const STOCK_QUESTION = new Set(['hay', 'tengo', 'quedan', 'quedaron']);
const STOCK_WORDS = new Set(['animales', 'cabezas', 'hacienda']);
const MOVE_VERBS = new Set([
  'pase', 'pasamos', 'pasaron', 'paso', 'movi', 'movimos', 'movieron', 'lleve', 'llevamos', 'llevaron',
  'cambie', 'cambiamos', 'traslade', 'trasladamos', 'mande', 'mandamos', 'meti', 'metimos', 'saque', 'sacamos',
]);
const FROM_WORDS = new Set(['del', 'de', 'desde']);
const TO_WORDS = new Set(['al', 'a', 'hacia', 'para']);
const LOT_WORDS = new Set(['lote', 'potrero']);
const ALL_WORDS = new Set(['todas', 'todos']);
const UNDO = /\b(borra|borrar|borralo|deshace|deshacer|deshacelo|anula|anular|anulalo|me equivoque)\b/;
const CANCEL = /\b(cancela|cancelar|cancelalo|olvidate|dejalo|no importa)\b/;
const AFFIRM = /^(si|dale|correcto|confirmo|exacto|asi es)\b/;

export function parseLocal(text: string, pending: PendingInfo | null, today: string): LocalParse {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { kind: 'unknown' };
  const sentence = tokens.join(' ');

  if (pending?.missing === 'confirmacion' && AFFIRM.test(sentence)) {
    return { kind: 'intent', intent: withArgs(pending.intent, { confirmado: true }) };
  }
  if (pending && (sentence === 'no' || CANCEL.test(sentence))) return { kind: 'cancel' };
  if (UNDO.test(sentence)) return { kind: 'intent', intent: { tool: 'deshacer_ultimo', args: {} } };

  const fresh = parseFresh(tokens, today);
  if (fresh) return { kind: 'intent', intent: pending ? mergeIntent(pending.intent, fresh) : fresh };
  if (pending) {
    const filled = fillSlot(tokens, pending);
    if (filled) return { kind: 'intent', intent: filled };
  }
  return { kind: 'unknown' };
}

function parseFresh(tokens: string[], today: string): Intent | null {
  const has = (set: Set<string>) => tokens.some((t) => set.has(t));
  if (has(MOVE_VERBS)) return { tool: 'mover_animales', args: parseMove(tokens, today) };
  if (has(RAIN_WORDS)) {
    const noNumbers = findNumbers(tokens).length === 0;
    const isQuery = has(QUANTITY_QUESTION) || has(RAIN_COMPARISON) || (noNumbers && !has(RAIN_WRITE_VERBS));
    return isQuery
      ? { tool: 'consultar_lluvia', args: parseRainPeriod(tokens) }
      : { tool: 'registrar_lluvia', args: parseRainWrite(tokens, today) };
  }
  const category = findCategory(tokens);
  const lot = findLotRef(tokens);
  const asks = has(QUANTITY_QUESTION) || has(STOCK_QUESTION);
  if (asks && (category || has(STOCK_WORDS) || lot !== undefined)) {
    return { tool: 'consultar_stock', args: cleanArgs({ lote: lot, categoria: category?.category }) };
  }
  return null;
}

function findCategory(tokens: string[]): { category: Category; index: number } | null {
  for (let i = 0; i < tokens.length; i++) {
    const category = categoryFromWord(tokens[i]);
    if (category) return { category, index: i };
  }
  return null;
}

function findRelativeDay(tokens: string[], today: string): string | undefined {
  const sentence = tokens.join(' ');
  let word: RelativeDayWord | undefined;
  if (/\b(anteayer|antes de ayer)\b/.test(sentence)) word = 'anteayer';
  else if (tokens.includes('anoche')) word = 'anoche';
  else if (tokens.includes('ayer')) word = 'ayer';
  else if (tokens.includes('hoy')) word = 'hoy';
  return word ? resolveRelativeDay(word, today) : undefined;
}

// Lee "[el|la] [lote] N" después de la preposición en la posición i.
function lotAfter(tokens: string[], i: number): { value: number; end: number } | null {
  let j = i + 1;
  if (tokens[j] === 'el' || tokens[j] === 'la') j++;
  if (LOT_WORDS.has(tokens[j])) j++;
  const n = readNumberAt(tokens, j, { allowArticles: true });
  return n ? { value: n.value, end: n.end } : null;
}

function findLotRef(tokens: string[]): number | undefined {
  for (let i = 0; i < tokens.length; i++) {
    if (LOT_WORDS.has(tokens[i])) {
      const n = readNumberAt(tokens, i + 1, { allowArticles: true });
      if (n) return n.value;
    }
    if (tokens[i] === 'en' || tokens[i] === 'del') {
      const lot = lotAfter(tokens, i);
      if (lot) return lot.value;
    }
  }
  return undefined;
}

function parseLots(tokens: string[]): { origin?: number; dest?: number; lotTokens: Set<number> } {
  let origin: number | undefined;
  let dest: number | undefined;
  const lotTokens = new Set<number>();
  const mark = (from: number, to: number) => {
    for (let k = from; k < to; k++) lotTokens.add(k);
  };
  for (let i = 0; i < tokens.length; i++) {
    const isFrom = FROM_WORDS.has(tokens[i]);
    const isTo = TO_WORDS.has(tokens[i]);
    if (!isFrom && !isTo) continue;
    const lot = lotAfter(tokens, i);
    if (!lot) continue;
    if (isFrom && origin === undefined) {
      origin = lot.value;
      mark(i, lot.end);
    } else if (isTo && dest === undefined) {
      dest = lot.value;
      mark(i, lot.end);
    }
  }
  tokens.forEach((t, i) => {
    if (!LOT_WORDS.has(t) || lotTokens.has(i)) return;
    const n = readNumberAt(tokens, i + 1, { allowArticles: true });
    if (!n) return;
    if (origin === undefined) origin = n.value;
    else if (dest === undefined && n.value !== origin) dest = n.value;
    mark(i, n.end);
  });
  return { origin, dest, lotTokens };
}

function parseMove(tokens: string[], today: string): ToolArgs<'mover_animales'> {
  const { origin, dest, lotTokens } = parseLots(tokens);
  const category = findCategory(tokens);
  const numbers = findNumbers(tokens).filter((n) => !lotTokens.has(n.start) && Number.isInteger(n.value));
  const beforeCategory = category ? numbers.find((n) => n.end === category.index) : undefined;
  let cantidad: number | 'todas' | undefined = (beforeCategory ?? numbers[0])?.value;
  const articleBeforeCategory = category !== null && ['los', 'las'].includes(tokens[category.index - 1]);
  if (cantidad === undefined && (tokens.some((t) => ALL_WORDS.has(t)) || articleBeforeCategory)) cantidad = 'todas';
  return cleanArgs({
    cantidad,
    categoria: category?.category,
    lote_origen: origin,
    lote_destino: dest,
    fecha: findRelativeDay(tokens, today),
  });
}

function parseRainWrite(tokens: string[], today: string): ToolArgs<'registrar_lluvia'> {
  const numbers = findNumbers(tokens);
  const unitIndex = tokens.findIndex((t) => t === 'mm' || t.startsWith('milimetro'));
  const mm = (numbers.find((n) => n.end === unitIndex) ?? numbers[0])?.value;
  return cleanArgs({ mm, fecha: findRelativeDay(tokens, today) });
}

function parseRainPeriod(tokens: string[]): ToolArgs<'consultar_lluvia'> {
  const sentence = tokens.join(' ');
  if (/\bmes (pasado|anterior)\b/.test(sentence)) return { periodo: 'mes_anterior' };
  const last = tokens.indexOf('ultimos');
  if (last >= 0) {
    const n = readNumberAt(tokens, last + 1);
    if (n && tokens[n.end] === 'dias') return { periodo: 'ultimos_dias', dias: n.value };
  }
  if (tokens.includes('semana')) return { periodo: 'semana' };
  if (tokens.includes('hoy')) return { periodo: 'hoy' };
  if (tokens.includes('ayer') || tokens.includes('anoche')) return { periodo: 'ayer' };
  return { periodo: 'mes' };
}

function fillSlot(tokens: string[], pending: PendingInfo): Intent | null {
  const first = findNumbers(tokens, { allowArticles: tokens.length <= 2 })[0]?.value;
  switch (pending.missing) {
    case 'mm':
      return first !== undefined ? withArgs(pending.intent, { mm: first }) : null;
    case 'cantidad':
      if (tokens.some((t) => ALL_WORDS.has(t))) return withArgs(pending.intent, { cantidad: 'todas' });
      return first !== undefined && Number.isInteger(first) ? withArgs(pending.intent, { cantidad: first }) : null;
    case 'categoria': {
      const category = findCategory(tokens);
      return category ? withArgs(pending.intent, { categoria: category.category }) : null;
    }
    case 'lote_origen':
    case 'lote_destino': {
      const { origin, dest } = parseLots(tokens);
      const extra: Record<string, number> = {};
      if (origin !== undefined) extra.lote_origen = origin;
      if (dest !== undefined) extra.lote_destino = dest;
      if (Object.keys(extra).length === 0 && first !== undefined) extra[pending.missing] = first;
      return Object.keys(extra).length > 0 ? withArgs(pending.intent, extra) : null;
    }
    case 'confirmacion':
      return null;
  }
}
