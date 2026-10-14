import { formatMm } from '@/domain/rain';
import { Category } from '@/domain/types';
import { Card } from './cards';
import { Intent } from './schemas';
import { Slot, ToolContext, ToolResult } from './types';

export const fmtMm = formatMm;

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function joinEs(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export function cuantos(category: Category): string {
  return category === 'vacas' || category === 'vaquillonas' ? 'Cuántas' : 'Cuántos';
}

export function needs(partial: Intent, missing: Slot, question: string, card: Card): ToolResult {
  return { status: 'needs_info', partial, missing, question, card };
}

export function reject(title: string, speech: string): ToolResult {
  return { status: 'rejected', speech, card: { tone: 'rechazo', title, lines: [speech] } };
}

export function eventOrigin(ctx: ToolContext) {
  return { recordedAt: ctx.now, source: ctx.origin.source, interpreter: ctx.origin.interpreter, rawText: ctx.origin.rawText };
}

export function lotRangeText(lots: number[]): string {
  return `los lotes van del ${Math.min(...lots)} al ${Math.max(...lots)}`;
}
