import { categoryLabel } from '@/domain/categories';
import { countTotal, farmTotal, projectStock } from '@/domain/stock';
import { CATEGORIES, MoveEvent } from '@/domain/types';
import { Card } from './cards';
import { capitalize, cuantos, eventOrigin, joinEs, lotRangeText, needs, plural, reject } from './format';
import { ToolArgs } from './schemas';
import { Slot, ToolContext, ToolResult } from './types';

type MoveArgs = ToolArgs<'mover_animales'>;

function pendingCard(args: MoveArgs): Card {
  return {
    tone: 'pendiente',
    title: 'Movimiento de animales',
    lines: [],
    fields: [
      { label: 'Categoría', value: args.categoria ?? null },
      { label: 'Cantidad', value: args.cantidad === undefined ? null : String(args.cantidad) },
      { label: 'Lote origen', value: args.lote_origen === undefined ? null : `Lote ${args.lote_origen}` },
      { label: 'Lote destino', value: args.lote_destino === undefined ? null : `Lote ${args.lote_destino}` },
    ],
  };
}

function ask(args: MoveArgs, slot: Slot, question: string): ToolResult {
  return needs({ tool: 'mover_animales', args }, slot, question, pendingCard(args));
}

export function moverAnimales(args: MoveArgs, ctx: ToolContext): ToolResult {
  const lots = ctx.farm.lots;
  if (args.categoria === undefined) return ask(args, 'categoria', '¿Qué animales? Vacas, vaquillonas, terneros, novillos o toros.');
  // El parser local puede entregar 0 ("pasé 0 vacas"): no es un movimiento, es un dato que falta.
  if (args.cantidad === undefined || (args.cantidad !== 'todas' && args.cantidad <= 0)) {
    return ask({ ...args, cantidad: undefined }, 'cantidad', `¿${cuantos(args.categoria)} ${args.categoria}?`);
  }
  if (args.lote_origen === undefined) return ask(args, 'lote_origen', '¿De qué lote salen?');
  if (!lots.includes(args.lote_origen)) {
    return ask({ ...args, lote_origen: undefined }, 'lote_origen', `No tengo lote ${args.lote_origen}, ${lotRangeText(lots)}. ¿De qué lote salen?`);
  }
  if (args.lote_destino === undefined) return ask(args, 'lote_destino', '¿A qué lote van?');
  if (!lots.includes(args.lote_destino)) {
    return ask({ ...args, lote_destino: undefined }, 'lote_destino', `No tengo lote ${args.lote_destino}, ${lotRangeText(lots)}. ¿A qué lote van?`);
  }
  if (args.lote_destino === args.lote_origen) {
    return ask({ ...args, lote_destino: undefined }, 'lote_destino', 'Salen y entran al mismo lote. ¿A qué lote van?');
  }
  const fecha = args.fecha ?? ctx.today;
  if (fecha > ctx.today) return reject('Fecha futura', 'Esa fecha todavía no llegó. No registré nada.');

  const cat = args.categoria;
  const from = args.lote_origen;
  const to = args.lote_destino;
  const before = projectStock(ctx.farm, ctx.events);
  const available = before[from][cat];
  if (available === 0) return reject('No hay animales para mover', `En el lote ${from} no hay ${cat}. No registré nada.`);
  const count = args.cantidad === 'todas' ? available : args.cantidad;
  if (count > available) {
    return reject('No alcanzan los animales', `En el lote ${from} hay ${available} ${categoryLabel(cat, available)}, no ${count}. No registré nada.`);
  }

  const event: MoveEvent = {
    id: ctx.newId(),
    type: 'movimiento',
    occurredOn: fecha,
    ...eventOrigin(ctx),
    payload: { category: cat, count, fromLot: from, toLot: to },
  };
  const after = projectStock(ctx.farm, [...ctx.events, event]);
  const label = categoryLabel(cat, count);
  return {
    status: 'ok',
    newEvents: [event],
    speech: `Listo, pasé ${count} ${label} del lote ${from} al ${to}.`,
    card: {
      tone: 'registro',
      title: 'Movimiento registrado',
      headline: `${count} ${label}`,
      lines: [
        `Lote ${from} → Lote ${to}`,
        `Lote ${from}: ${before[from][cat]} → ${after[from][cat]} ${categoryLabel(cat, after[from][cat])}`,
        `Lote ${to}: ${before[to][cat]} → ${after[to][cat]} ${categoryLabel(cat, after[to][cat])}`,
      ],
      undoableEventId: event.id,
      at: ctx.now,
    },
  };
}

function answer(speech: string, card: Card): ToolResult {
  return { status: 'ok', newEvents: [], speech, card };
}

export function consultarStock(args: ToolArgs<'consultar_stock'>, ctx: ToolContext): ToolResult {
  const stock = projectStock(ctx.farm, ctx.events);
  const { lote, categoria } = args;
  if (lote !== undefined && !ctx.farm.lots.includes(lote)) {
    return reject('Lote inexistente', `No tengo lote ${lote}, ${lotRangeText(ctx.farm.lots)}.`);
  }
  if (lote !== undefined && categoria !== undefined) {
    const n = stock[lote][categoria];
    return answer(n === 0 ? `En el lote ${lote} no hay ${categoria}.` : `En el lote ${lote} hay ${n} ${categoryLabel(categoria, n)}.`, {
      tone: 'consulta',
      title: `Lote ${lote} · ${capitalize(categoria)}`,
      headline: `${n}`,
      lines: [],
    });
  }
  if (lote !== undefined) {
    const counts = stock[lote];
    const total = countTotal(counts);
    const parts = CATEGORIES.filter((c) => counts[c] > 0).map((c) => `${counts[c]} ${categoryLabel(c, counts[c])}`);
    return answer(total === 0 ? `El lote ${lote} está vacío.` : `En el lote ${lote} hay ${total} ${plural(total, 'animal', 'animales')}: ${joinEs(parts)}.`, {
      tone: 'consulta',
      title: `Lote ${lote}`,
      headline: `${total} ${plural(total, 'cabeza', 'cabezas')}`,
      lines: parts.length > 0 ? parts : ['Sin animales'],
    });
  }
  if (categoria !== undefined) {
    const perLot = ctx.farm.lots.filter((l) => stock[l][categoria] > 0).map((l) => ({ lot: l, n: stock[l][categoria] }));
    const total = perLot.reduce((sum, p) => sum + p.n, 0);
    return answer(
      total === 0
        ? `No hay ${categoria} en el campo.`
        : `Hay ${total} ${categoryLabel(categoria, total)}: ${joinEs(perLot.map((p) => `${p.n} en el lote ${p.lot}`))}.`,
      { tone: 'consulta', title: capitalize(categoria), headline: `${total}`, lines: perLot.map((p) => `Lote ${p.lot}: ${p.n}`) },
    );
  }
  const total = farmTotal(stock);
  const byCategory = CATEGORIES.map((c) => ({ c, n: ctx.farm.lots.reduce((sum, l) => sum + stock[l][c], 0) })).filter((p) => p.n > 0);
  return answer(`En total hay ${total} animales en el campo.`, {
    tone: 'consulta',
    title: 'Todo el campo',
    headline: `${total} cabezas`,
    lines: byCategory.map((p) => `${capitalize(p.c)}: ${p.n}`),
  });
}
