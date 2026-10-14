import { describeDay, formatShortDate, monthName, monthRangeOf, periodRange } from '@/domain/dates';
import { rainInRange, roundMm } from '@/domain/rain';
import { RainEvent } from '@/domain/types';
import { Card } from './cards';
import { capitalize, eventOrigin, fmtMm, mmText, needs, plural, reject } from './format';
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
  // El parser local puede entregar 0 ("llovieron 0 mm"): no es una lluvia, es un dato que falta.
  if (args.mm === undefined || args.mm <= 0) {
    const { mm: _mm, ...missing } = args;
    return needs({ tool: 'registrar_lluvia', args: missing }, 'mm', '¿Cuántos milímetros llovieron?', pendingCard(missing, fecha, ctx.today));
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
    speech: `Anotado: ${mmText(args.mm)} ${day}. En ${mes} van ${fmtMm(month.totalMm)}.`,
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
      : `${capitalize(range.label)} ${plural(roundMm(totalMm), 'llovió', 'llovieron')} ${mmText(totalMm)}${items.length > 1 ? `, en ${items.length} lluvias` : ''}.`;
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
