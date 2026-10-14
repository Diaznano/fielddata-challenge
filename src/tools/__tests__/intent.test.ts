import { cleanArgs, mergeIntent, withArgs } from '../intent';
import { parseIntent, toolSchemas } from '../schemas';

describe('intents', () => {
  it('valida argumentos con zod y rechaza herramientas desconocidas', () => {
    expect(parseIntent('mover_animales', { cantidad: 40, categoria: 'vaquillonas' })).toEqual({
      tool: 'mover_animales',
      args: { cantidad: 40, categoria: 'vaquillonas' },
    });
    expect(parseIntent('mover_animales', { categoria: 'perros' })).toBeNull();
    expect(parseIntent('borrar_todo', {})).toBeNull();
    expect(parseIntent('registrar_lluvia', { mm: -3 })).toBeNull();
  });

  it('acepta cantidad "todas"', () => {
    expect(parseIntent('mover_animales', { cantidad: 'todas' })).not.toBeNull();
  });

  it('limpia undefined y null', () => {
    expect(cleanArgs({ a: 1, b: undefined, c: null })).toEqual({ a: 1 });
  });

  it('combina un pendiente con datos nuevos de la misma herramienta', () => {
    const base = { tool: 'mover_animales' as const, args: { cantidad: 40, lote_destino: 5 } };
    expect(mergeIntent(base, { tool: 'mover_animales', args: { lote_origen: 3 } })).toEqual({
      tool: 'mover_animales',
      args: { cantidad: 40, lote_destino: 5, lote_origen: 3 },
    });
    expect(withArgs(base, { lote_origen: undefined })).toEqual(base);
  });

  it('si la herramienta cambia, gana la nueva', () => {
    const next = { tool: 'consultar_lluvia' as const, args: {} };
    expect(mergeIntent({ tool: 'mover_animales', args: {} }, next)).toBe(next);
  });

  it('expone las 5 herramientas', () => {
    expect(Object.keys(toolSchemas).sort()).toEqual(['consultar_lluvia', 'consultar_stock', 'deshacer_ultimo', 'mover_animales', 'registrar_lluvia']);
  });
});
