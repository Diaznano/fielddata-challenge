import { categoryFromWord } from '@/domain/categories';
import { addDays, lastWeekday, nextWeekday, RelativeDayWord, resolveRelativeDay } from '@/domain/dates';
import { Category } from '@/domain/types';
import { cleanArgs, mergeIntent, withArgs } from '@/tools/intent';
import { Intent, ToolArgs } from '@/tools/schemas';
import { PendingInfo } from '@/tools/types';
import { tokenize } from './normalize';
import { findNumbers, NumberMatch, readNumberAt } from './numbers';

export type LocalParse = { kind: 'intent'; intent: Intent } | { kind: 'cancel' } | { kind: 'unknown' };

// "cayo", "cayeron" y "agua" solos son ambiguos ("se cayó el alambrado", "el agua del bebedero"): solo cuentan juntos.
const RAIN_SIGNALS = new Set(['llovio', 'llovieron', 'llueve', 'lluvia', 'lluvias', 'milimetro', 'milimetros', 'mm']);
const RAIN_FALL_VERBS = new Set(['cayo', 'cayeron']);
const RAIN_VERBS = new Set(['llovio', 'llovieron', 'cayo', 'cayeron']);
const RAIN_FILLERS = new Set(['como', 'unos', 'unas', 'o', 'de']);
const RAIN_WRITE_VERBS = new Set(['llovieron', 'cayeron', 'anota', 'anotame', 'registra', 'registrame', 'carga', 'cargame']);
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
const MEASURE_UNITS = new Set([
  'dia', 'dias', 'hora', 'horas', 'minuto', 'minutos', 'semana', 'semanas', 'mes', 'meses', 'ano', 'anos',
  'diente', 'dientes', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'kg',
]);
const TIMES_WORDS = new Set(['vez', 'veces']);
const NEXT_WORDS = new Set(['proximo', 'proxima']);
const WEEKDAYS = new Map([['domingo', 0], ['lunes', 1], ['martes', 2], ['miercoles', 3], ['jueves', 4], ['viernes', 5], ['sabado', 6]]);
const ANSWER_FILLERS = new Set([
  'del', 'de', 'desde', 'al', 'a', 'el', 'la', 'las', 'los', 'lote', 'potrero',
  'son', 'eran', 'fueron', 'unos', 'unas', 'como', 'y', 'todas', 'todos', 'si',
]);
const COPULAS = new Set(['eran', 'fueron', 'son', 'era', 'fue']);
const COPULA_FILLERS = new Set(['como', 'unos', 'unas']);
const UNDO = /\b(borra|borrar|borralo|deshace|deshacer|deshacelo|anula|anular|anulalo|me equivoque)\b/;
const CANCEL = /\b(cancela|cancelar|cancelalo|olvidate|dejalo|no importa)\b/;
const AFFIRM = /^(si|dale|correcto|confirmo|exacto|asi es)\b/;
const NEGATION = /^no\b/;
const REPLY_LEAD = /^(si|dale|correcto|confirmo|exacto|asi es|no)( pero)?$/;

// "de una" es "enseguida", no el lote uno ni una cantidad.
function withoutDeUna(tokens: string[]): string[] {
  return tokens.filter((t, i) => !(t === 'de' && tokens[i + 1] === 'una') && !(t === 'una' && tokens[i - 1] === 'de'));
}

export function parseLocal(text: string, pending: PendingInfo | null, today: string): LocalParse {
  const tokens = withoutDeUna(tokenize(text));
  if (tokens.length === 0) return { kind: 'unknown' };
  const sentence = tokens.join(' ');

  if (pending?.missing === 'confirmacion' && (AFFIRM.test(sentence) || NEGATION.test(sentence))) {
    const corrected = correctedMm(tokens, pending);
    // El valor nuevo no hereda la confirmación: la herramienta lo vuelve a validar y repregunta si pasa el umbral.
    if (corrected !== undefined) return { kind: 'intent', intent: withArgs(pending.intent, { mm: corrected }) };
  }
  if (pending?.missing === 'confirmacion' && AFFIRM.test(sentence)) {
    return { kind: 'intent', intent: withArgs(pending.intent, { confirmado: true }) };
  }
  if (pending && (sentence === 'no' || CANCEL.test(sentence))) return { kind: 'cancel' };
  if (UNDO.test(sentence)) {
    return pending ? { kind: 'cancel' } : { kind: 'intent', intent: { tool: 'deshacer_ultimo', args: {} } };
  }

  const fresh = parseFresh(tokens, today);
  if (fresh) return { kind: 'intent', intent: pending ? mergeIntent(pending.intent, fresh) : fresh };
  if (pending) {
    const filled = fillSlot(tokens, pending);
    if (filled) return { kind: 'intent', intent: filled };
  }
  return { kind: 'unknown' };
}

// "sí, pero eran 20" o "no, 18" a "¿Seguro que fueron 200?": un número distinto del preguntado es una corrección, no una confirmación.
// Solo cuenta si se lee como los milímetros (suelto, con unidad, tras el verbo de lluvia o tras "eran"): "sí, el 12 de octubre" o "sí, llovió dos veces" confirman.
function correctedMm(tokens: string[], pending: PendingInfo): number | undefined {
  if (pending.intent.tool !== 'registrar_lluvia') return undefined;
  const asked = pending.intent.args.mm;
  const afterRainVerb = numbersAfterRainVerb(tokens);
  const values = findNumbers(tokens)
    .filter(
      (n) =>
        isMmCandidate(tokens, n) &&
        !TIMES_WORDS.has(tokens[n.end]) &&
        (isWholeReply(tokens, n) || isMmUnit(tokens[n.end]) || afterRainVerb.some((m) => m.start === n.start) || followsCopula(tokens, n)),
    )
    .map((n) => n.value);
  return values.some((v) => v === asked) ? undefined : values[0];
}

function isWholeReply(tokens: string[], n: NumberMatch): boolean {
  return n.end === tokens.length && REPLY_LEAD.test(tokens.slice(0, n.start).join(' '));
}

function followsCopula(tokens: string[], n: NumberMatch): boolean {
  let i = n.start - 1;
  for (let skipped = 0; skipped < 2 && COPULA_FILLERS.has(tokens[i]); skipped++) i--;
  return COPULAS.has(tokens[i]);
}

function parseFresh(tokens: string[], today: string): Intent | null {
  const has = (set: Set<string>) => tokens.some((t) => set.has(t));
  if (has(MOVE_VERBS)) return { tool: 'mover_animales', args: parseMove(tokens, today) };
  if (has(RAIN_SIGNALS) || (has(RAIN_FALL_VERBS) && tokens.includes('agua'))) {
    const mm = findMm(tokens);
    const explicitWrite = has(RAIN_WRITE_VERBS);
    const isQuery =
      has(QUANTITY_QUESTION) ||
      has(RAIN_COMPARISON) ||
      tokens.includes('ultimos') ||
      (readDaysAgo(tokens) !== null && !explicitWrite) ||
      (mm === undefined && !explicitWrite);
    return isQuery
      ? { tool: 'consultar_lluvia', args: parseRainPeriod(tokens) }
      : { tool: 'registrar_lluvia', args: cleanArgs({ mm, fecha: findRelativeDay(tokens, today) }) };
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

function readDaysAgo(tokens: string[]): number | null {
  const i = tokens.indexOf('hace');
  if (i < 0) return null;
  const n = readNumberAt(tokens, i + 1, { allowArticles: true });
  if (!n || !Number.isInteger(n.value) || (tokens[n.end] !== 'dia' && tokens[n.end] !== 'dias')) return null;
  return n.value;
}

function findRelativeDay(tokens: string[], today: string): string | undefined {
  const sentence = tokens.join(' ');
  let word: RelativeDayWord | undefined;
  if (/\b(anteayer|antes de ayer)\b/.test(sentence)) word = 'anteayer';
  else if (tokens.includes('anoche')) word = 'anoche';
  else if (tokens.includes('ayer')) word = 'ayer';
  else if (tokens.includes('hoy')) word = 'hoy';
  if (word) return resolveRelativeDay(word, today);

  const daysAgo = readDaysAgo(tokens);
  if (daysAgo !== null) return addDays(today, -daysAgo);
  const weekdayDate = findWeekdayDate(tokens, today);
  if (weekdayDate) return weekdayDate;
  const tomorrow = tokens.indexOf('manana');
  // "mañana" a secas y "de mañana" son el día siguiente (la herramienta lo rechaza); solo las partes del día de hoy llevan fecha de hoy.
  // "mañanita" va después porque en "mañana a la mañanita" la hora es de mañana, no de hoy.
  if (tomorrow >= 0) return isMorningOfToday(tokens, tomorrow) ? today : addDays(today, 1);
  if (tokens.includes('mananita')) return today;
  return undefined;
}

function isMorningOfToday(tokens: string[], i: number): boolean {
  return ['esta', 'la', 'media'].includes(tokens[i - 1]) || (tokens[i - 1] === 'de' && tokens[i + 1] === 'temprano');
}

function findWeekdayDate(tokens: string[], today: string): string | undefined {
  for (let i = 0; i < tokens.length; i++) {
    const weekday = WEEKDAYS.get(tokens[i]);
    if (weekday === undefined) continue;
    const upcoming = NEXT_WORDS.has(tokens[i - 1]) || NEXT_WORDS.has(tokens[i + 1]) || (tokens[i + 1] === 'que' && tokens[i + 2] === 'viene');
    return upcoming ? nextWeekday(weekday, today) : lastWeekday(weekday, today);
  }
  return undefined;
}

// Un número seguido de una unidad ("dos días", "2 años", "200 kilos") mide otra cosa: no es cantidad de animales ni milímetros.
function isMeasured(tokens: string[], n: NumberMatch): boolean {
  return MEASURE_UNITS.has(tokens[n.end]);
}

// "las 5" es una hora ("a las 5", "tipo las 5", "después de las 5"); solo el número pegado a la categoría ("las 40 vaquillonas") es una cantidad.
function isAfterLas(tokens: string[], n: NumberMatch): boolean {
  return tokens[n.start - 1] === 'las';
}

function isMmCandidate(tokens: string[], n: NumberMatch): boolean {
  return !isMeasured(tokens, n) && !isAfterLas(tokens, n);
}

// Lote y potrero son masculinos: "una" no nombra un lote ("lote una" no existe), solo "uno" y "un".
function readLotNumberAt(tokens: string[], i: number): NumberMatch | null {
  return tokens[i] === 'una' ? null : readNumberAt(tokens, i, { allowArticles: true });
}

function firstLotNumber(tokens: string[]): number | undefined {
  for (let i = 0; i < tokens.length; i++) {
    const n = readLotNumberAt(tokens, i);
    if (n) return n.value;
  }
  return undefined;
}

// El artículo y "lote" son opcionales porque por voz se dice "del 3 al 5" igual que "del lote 3 al lote 5".
function lotAfter(tokens: string[], i: number): { value: number; end: number } | null {
  let j = i + 1;
  if (tokens[j] === 'el' || tokens[j] === 'la') j++;
  if (LOT_WORDS.has(tokens[j])) j++;
  const n = readLotNumberAt(tokens, j);
  return n ? { value: n.value, end: n.end } : null;
}

function findLotRef(tokens: string[]): number | undefined {
  for (let i = 0; i < tokens.length; i++) {
    if (LOT_WORDS.has(tokens[i])) {
      const n = readLotNumberAt(tokens, i + 1);
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
    if (!lot || MEASURE_UNITS.has(tokens[lot.end])) continue;
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
    const n = readLotNumberAt(tokens, i + 1);
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
  const numbers = findNumbers(tokens).filter((n) => !lotTokens.has(n.start) && Number.isInteger(n.value) && !isMeasured(tokens, n));
  const beforeCategory = category ? numbers.find((n) => n.end === category.index) : undefined;
  let cantidad: number | 'todas' | undefined = (beforeCategory ?? numbers.find((n) => !isAfterLas(tokens, n)))?.value;
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

function isMmUnit(token: string | undefined): boolean {
  return token === 'mm' || (token !== undefined && token.startsWith('milimetro'));
}

// Sin unidad ni verbo de lluvia pegado al número no hay forma de saber que son milímetros: mejor repreguntar que adivinar.
function findMm(tokens: string[]): number | undefined {
  const counts = findNumbers(tokens).filter((n) => isMmCandidate(tokens, n));
  const beforeUnit = counts.find((n) => isMmUnit(tokens[n.end]));
  if (beforeUnit) return beforeUnit.value;

  // parseLots toma "de treinta" por un lote en "lluvia de treinta milímetros": el filtro de lotes solo corre sin unidad.
  return numbersAfterRainVerb(tokens)[0]?.value;
}

function numbersAfterRainVerb(tokens: string[]): NumberMatch[] {
  const { lotTokens } = parseLots(tokens);
  const found: NumberMatch[] = [];
  for (let v = 0; v < tokens.length; v++) {
    if (!RAIN_VERBS.has(tokens[v])) continue;
    let j = v + 1;
    for (let skipped = 0; skipped < 2 && RAIN_FILLERS.has(tokens[j]); skipped++) j++;
    const n = readNumberAt(tokens, j);
    if (n && isMmCandidate(tokens, n) && !lotTokens.has(n.start)) found.push(n);
  }
  return found;
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

// Una respuesta a una repregunta es solo el dato ("del 3", "unos 18"); si trae otras palabras ("dame 2 minutos") es otra cosa.
function isPlainAnswer(tokens: string[]): boolean {
  let i = 0;
  while (i < tokens.length) {
    const n = readNumberAt(tokens, i, { allowArticles: true });
    if (n) i = n.end;
    else if (ANSWER_FILLERS.has(tokens[i]) || categoryFromWord(tokens[i])) i++;
    else return false;
  }
  return true;
}

function fillSlot(tokens: string[], pending: PendingInfo): Intent | null {
  if (!isPlainAnswer(tokens)) return null;
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
      const directional = tokens.some((t) => FROM_WORDS.has(t) || TO_WORDS.has(t));
      // Sin preposición ("el lote 5", "el 3") parseLots manda el único lote a origen: acá es el slot que faltaba, y no debe pisar el otro.
      const extra = directional && (origin !== undefined || dest !== undefined)
        ? { lote_origen: origin, lote_destino: dest }
        : { [pending.missing]: origin ?? firstLotNumber(tokens) };
      return Object.values(extra).some((v) => v !== undefined) ? withArgs(pending.intent, extra) : null;
    }
    case 'confirmacion':
      return null;
  }
}
