import { PendingInfo } from '@/tools/types';
import { parseLocal } from '../parser';
import { FIXTURE_TODAY, PHRASES } from '../phrases.fixture';

describe('parseLocal: frases sueltas', () => {
  it.each(PHRASES)('"$text"', ({ text, expected }) => {
    const result = parseLocal(text, null, FIXTURE_TODAY);
    expect(result).toEqual(expected ? { kind: 'intent', intent: expected } : { kind: 'unknown' });
  });
});

describe('parseLocal: respuestas a repreguntas', () => {
  const movePending: PendingInfo = {
    intent: { tool: 'mover_animales', args: { cantidad: 40, categoria: 'vaquillonas', lote_destino: 5 } },
    missing: 'lote_origen',
  };
  const completedMove = { kind: 'intent', intent: { tool: 'mover_animales', args: { cantidad: 40, categoria: 'vaquillonas', lote_destino: 5, lote_origen: 3 } } };

  it.each(['del 3', '3', 'del lote tres', 'el tres'])('"%s" completa el lote de origen', (text) => {
    expect(parseLocal(text, movePending, FIXTURE_TODAY)).toEqual(completedMove);
  });

  it('completa milímetros con un número o con la frase completa', () => {
    const pending: PendingInfo = { intent: { tool: 'registrar_lluvia', args: { fecha: '2026-10-12' } }, missing: 'mm' };
    const expected = { kind: 'intent', intent: { tool: 'registrar_lluvia', args: { fecha: '2026-10-12', mm: 18 } } };
    expect(parseLocal('18', pending, FIXTURE_TODAY)).toEqual(expected);
    expect(parseLocal('dieciocho milímetros', pending, FIXTURE_TODAY)).toEqual(expected);
  });

  it('completa la categoría', () => {
    const pending: PendingInfo = { intent: { tool: 'mover_animales', args: { cantidad: 40, lote_origen: 3, lote_destino: 5 } }, missing: 'categoria' };
    expect(parseLocal('vaquillonas', pending, FIXTURE_TODAY)).toEqual({
      kind: 'intent',
      intent: { tool: 'mover_animales', args: { cantidad: 40, lote_origen: 3, lote_destino: 5, categoria: 'vaquillonas' } },
    });
  });

  it('completa la cantidad con número, "uno" o "todos"', () => {
    const pending: PendingInfo = { intent: { tool: 'mover_animales', args: { categoria: 'toros', lote_origen: 7, lote_destino: 6 } }, missing: 'cantidad' };
    const cantidad = (text: string) => {
      const r = parseLocal(text, pending, FIXTURE_TODAY);
      return r.kind === 'intent' && r.intent.tool === 'mover_animales' ? r.intent.args.cantidad : r.kind;
    };
    expect(cantidad('cinco')).toBe(5);
    expect(cantidad('uno')).toBe(1);
    expect(cantidad('todos')).toBe('todas');
  });

  it('confirma o cancela una lluvia grande', () => {
    const pending: PendingInfo = { intent: { tool: 'registrar_lluvia', args: { mm: 200 } }, missing: 'confirmacion' };
    expect(parseLocal('sí', pending, FIXTURE_TODAY)).toEqual({ kind: 'intent', intent: { tool: 'registrar_lluvia', args: { mm: 200, confirmado: true } } });
    expect(parseLocal('dale', pending, FIXTURE_TODAY)).toEqual({ kind: 'intent', intent: { tool: 'registrar_lluvia', args: { mm: 200, confirmado: true } } });
    expect(parseLocal('no', pending, FIXTURE_TODAY)).toEqual({ kind: 'cancel' });
  });

  it.each(['cancelá', 'olvidate', 'no'])('"%s" cancela el pendiente', (text) => {
    expect(parseLocal(text, movePending, FIXTURE_TODAY)).toEqual({ kind: 'cancel' });
  });

  it('un pedido nuevo de otra herramienta reemplaza al pendiente', () => {
    expect(parseLocal('¿Cuánto llovió este mes?', movePending, FIXTURE_TODAY)).toEqual({ kind: 'intent', intent: { tool: 'consultar_lluvia', args: { periodo: 'mes' } } });
  });

  it('algo incomprensible no rompe el pendiente', () => {
    expect(parseLocal('banana', movePending, FIXTURE_TODAY)).toEqual({ kind: 'unknown' });
  });

  it('sin pendiente, "del 3" no significa nada', () => {
    expect(parseLocal('del 3', null, FIXTURE_TODAY)).toEqual({ kind: 'unknown' });
  });
});
