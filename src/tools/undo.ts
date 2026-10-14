import { categoryLabel } from '@/domain/categories';
import { MoveEvent, RainEvent, VoidEvent } from '@/domain/types';
import { capitalize, eventOrigin, fmtMm, reject } from './format';
import { ToolArgs } from './schemas';
import { ToolContext, ToolResult } from './types';

function describeEvent(e: RainEvent | MoveEvent): string {
  if (e.type === 'lluvia') return `la lluvia de ${fmtMm(e.payload.mm)} milímetros`;
  const { count, category, fromLot, toLot } = e.payload;
  return `el movimiento de ${count} ${categoryLabel(category, count)} del lote ${fromLot} al ${toLot}`;
}

export function deshacerUltimo(_args: ToolArgs<'deshacer_ultimo'>, ctx: ToolContext): ToolResult {
  const voided = new Set(ctx.events.flatMap((e) => (e.type === 'anulacion' ? [e.payload.targetId] : [])));
  const target = [...ctx.events]
    .reverse()
    .find((e): e is RainEvent | MoveEvent => e.type !== 'anulacion' && e.source !== 'semilla' && !voided.has(e.id));
  if (!target) return reject('Nada para deshacer', 'No hay nada para deshacer.');

  const event: VoidEvent = { id: ctx.newId(), type: 'anulacion', occurredOn: ctx.today, ...eventOrigin(ctx), payload: { targetId: target.id } };
  const what = describeEvent(target);
  return {
    status: 'ok',
    newEvents: [event],
    speech: `Listo, borré ${what}.`,
    card: { tone: 'registro', title: 'Registro anulado', headline: 'Deshecho', lines: [capitalize(what)] },
  };
}
