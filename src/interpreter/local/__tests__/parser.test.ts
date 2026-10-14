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

  it('"borrá eso" con un pendiente lo descarta en vez de anular un registro viejo', () => {
    expect(parseLocal('borrá eso', movePending, FIXTURE_TODAY)).toEqual({ kind: 'cancel' });
  });

  it('una frase con palabras ajenas no completa el slot', () => {
    const mmPending: PendingInfo = { intent: { tool: 'registrar_lluvia', args: { fecha: '2026-10-12' } }, missing: 'mm' };
    expect(parseLocal('dame 2 minutos', movePending, FIXTURE_TODAY)).toEqual({ kind: 'unknown' });
    expect(parseLocal('esperá 5 minutos', mmPending, FIXTURE_TODAY)).toEqual({ kind: 'unknown' });
  });

  it('"unos 18" completa los milímetros', () => {
    const mmPending: PendingInfo = { intent: { tool: 'registrar_lluvia', args: { fecha: '2026-10-12' } }, missing: 'mm' };
    expect(parseLocal('unos 18', mmPending, FIXTURE_TODAY)).toEqual({ kind: 'intent', intent: { tool: 'registrar_lluvia', args: { fecha: '2026-10-12', mm: 18 } } });
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

describe('parseLocal: números que no son milímetros ni cantidades', () => {
  it('una hora no son milímetros', () => {
    expect(parseLocal('Llovieron a las 5', null, FIXTURE_TODAY)).toEqual({ kind: 'intent', intent: { tool: 'registrar_lluvia', args: {} } });
  });

  it('una duración no son milímetros', () => {
    expect(parseLocal('Llovieron 2 horas', null, FIXTURE_TODAY)).toEqual({ kind: 'intent', intent: { tool: 'registrar_lluvia', args: {} } });
  });

  it('los días de "hace N días" no son la cantidad de animales', () => {
    expect(parseLocal('Pasé vaquillonas del 3 al 5 hace dos días', null, FIXTURE_TODAY)).toEqual({
      kind: 'intent',
      intent: { tool: 'mover_animales', args: { categoria: 'vaquillonas', lote_origen: 3, lote_destino: 5, fecha: '2026-10-11' } },
    });
  });

  it('"hace N días" con un verbo que no es de escritura es una consulta', () => {
    expect(parseLocal('¿Llovió hace tres días?', null, FIXTURE_TODAY)).toEqual({ kind: 'intent', intent: { tool: 'consultar_lluvia', args: { periodo: 'mes' } } });
  });
});
