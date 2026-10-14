import { describeDay, formatShortDate, monthName, monthRangeOf, periodRange } from '@/domain/dates';
import { rainInRange } from '@/domain/rain';
import { RainEvent } from '@/domain/types';
import { Card } from './cards';
import { capitalize, eventOrigin, fmtMm, needs, reject } from './format';
import { ToolArgs } from './schemas';
import { ToolContext, ToolResult } from './types';

export const RAIN_CONFIRM_ABOVE_MM = 150;

type RainArgs = ToolArgs<'registrar_lluvia'>;

function pendingCard(args: RainArgs, fecha: string, today: string): Card {
  return {
    tone: 'pendiente',
    title: 'Registrar lluvia',
    lines: [],
    fields: [
      { label: 'Milímetros', value: args.mm === undefined ? null : `${fmtMm(args.mm)} mm` },
      { label: 'Fecha', value: describeDay(fecha, today) },
    ],
  };
}

export function registrarLluvia(args: RainArgs, ctx: ToolContext): ToolResult {
  const intent = { tool: 'registrar_lluvia' as const, args };
  const fecha = args.fecha ?? ctx.today;
  if (fecha > ctx.today) return reject('Fecha futura', 'Esa fecha todavía no llegó. No registré nada.');
  if (args.mm === undefined) {
    return needs(intent, 'mm', '¿Cuántos milímetros llovieron?', pendingCard(args, fecha, ctx.today));
  }
  if (args.mm > RAIN_CONFIRM_ABOVE_MM && !args.confirmado) {
    return needs(intent, 'confirmacion', `¿Seguro que fueron ${fmtMm(args.mm)} milímetros?`, pendingCard(args, fecha, ctx.today));
  }

  const event: RainEvent = { id: ctx.newId(), type: 'lluvia', occurredOn: fecha, ...eventOrigin(ctx), payload: { mm: args.mm } };
  const month = rainInRange([...ctx.events, event], monthRangeOf(fecha, ctx.today));
  const day = describeDay(fecha, ctx.today);
  const mes = monthName(fecha);
  return {
    status: 'ok',
    newEvents: [event],
    speech: `Anotado: ${fmtMm(args.mm)} milímetros ${day}. En ${mes} van ${fmtMm(month.totalMm)}.`,
    card: {
      tone: 'registro',
      title: 'Lluvia registrada',
      headline: `${fmtMm(args.mm)} mm`,
      lines: [`${capitalize(day)} · ${formatShortDate(fecha)}`, `Acumulado de ${mes}: ${fmtMm(month.totalMm)} mm`],
      undoableEventId: event.id,
      at: ctx.now,
    },
  };
}

export function consultarLluvia(args: ToolArgs<'consultar_lluvia'>, ctx: ToolContext): ToolResult {
  const range = periodRange(args.periodo ?? (args.dias ? 'ultimos_dias' : 'mes'), ctx.today, args.dias ?? 7);
  const { totalMm, items } = rainInRange(ctx.events, range);
  const speech =
    items.length === 0
      ? `No llovió ${range.label}.`
      : `${capitalize(range.label)} llovieron ${fmtMm(totalMm)} milímetros${items.length > 1 ? `, en ${items.length} lluvias` : ''}.`;
  return {
    status: 'ok',
    newEvents: [],
    speech,
    card: {
      tone: 'consulta',
      title: `Lluvia ${range.label}`,
      headline: `${fmtMm(totalMm)} mm`,
      lines: items.length === 0 ? ['Sin lluvias registradas'] : items.map((i) => `${formatShortDate(i.date)} · ${fmtMm(i.mm)} mm`),
    },
  };
}
