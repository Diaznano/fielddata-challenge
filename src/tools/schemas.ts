import { z } from 'zod';
import { isValidISODate, RAIN_PERIODS } from '@/domain/dates';
import { CATEGORIES } from '@/domain/types';

const isoDate = z.string().refine(isValidISODate);

export const toolSchemas = {
  registrar_lluvia: z.object({
    mm: z.number().positive().optional(),
    fecha: isoDate.optional(),
    confirmado: z.boolean().optional(),
  }),
  mover_animales: z.object({
    cantidad: z.union([z.number().int().positive(), z.literal('todas')]).optional(),
    categoria: z.enum(CATEGORIES).optional(),
    lote_origen: z.number().int().optional(),
    lote_destino: z.number().int().optional(),
    fecha: isoDate.optional(),
  }),
  consultar_lluvia: z.object({
    periodo: z.enum(RAIN_PERIODS).optional(),
    dias: z.number().int().positive().max(365).optional(),
  }),
  consultar_stock: z.object({
    lote: z.number().int().optional(),
    categoria: z.enum(CATEGORIES).optional(),
  }),
  deshacer_ultimo: z.object({}),
};

export type ToolName = keyof typeof toolSchemas;
export type ToolArgs<K extends ToolName> = z.infer<(typeof toolSchemas)[K]>;
export type Intent = { [K in ToolName]: { tool: K; args: ToolArgs<K> } }[ToolName];

export const toolDescriptions: Record<ToolName, string> = {
  registrar_lluvia: 'Registra una lluvia caída en el campo. mm = milímetros; fecha = día de la lluvia (YYYY-MM-DD, "anoche" es el día anterior). confirmado = true solo si el productor confirmó un valor mayor a 150 mm.',
  mover_animales: 'Registra un movimiento de animales entre lotes. cantidad = número o "todas"; categoria = vacas, vaquillonas, terneros, novillos o toros; lote_origen y lote_destino = números de lote.',
  consultar_lluvia: 'Consulta cuánto llovió en un período: hoy, ayer, semana, mes (este mes), mes_anterior o ultimos_dias (con dias).',
  consultar_stock: 'Consulta cuántos animales hay, opcionalmente por lote y/o categoría. Sin argumentos devuelve el total del campo.',
  deshacer_ultimo: 'Anula el último registro hecho por el productor (lluvia o movimiento).',
};

export function parseIntent(tool: string, args: unknown): Intent | null {
  if (!Object.prototype.hasOwnProperty.call(toolSchemas, tool)) return null;
  const parsed = toolSchemas[tool as ToolName].safeParse(args);
  return parsed.success ? ({ tool, args: parsed.data } as Intent) : null;
}
