import { move } from '@/test-utils/events';
import { makeCtx } from '@/test-utils/toolContext';
import { consultarStock, moverAnimales } from '../animals';

const full = { cantidad: 40, categoria: 'vaquillonas' as const, lote_origen: 3, lote_destino: 5 };

describe('mover_animales', () => {
  it('mueve y muestra el antes → después de la categoría', () => {
    const r = moverAnimales(full, makeCtx());
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.newEvents[0]).toMatchObject({ type: 'movimiento', payload: { category: 'vaquillonas', count: 40, fromLot: 3, toLot: 5 } });
    expect(r.card).toMatchObject({ tone: 'registro', title: 'Movimiento registrado', headline: '40 vaquillonas', undoableEventId: 'id-1' });
    expect(r.card.lines).toEqual(['Lote 3 → Lote 5', 'Lote 3: 45 → 5 vaquillonas', 'Lote 5: 40 → 80 vaquillonas']);
    expect(r.speech).toBe('Listo, pasé 40 vaquillonas del lote 3 al 5.');
  });

  it('usa singular para un animal', () => {
    const r = moverAnimales({ cantidad: 1, categoria: 'toros', lote_origen: 7, lote_destino: 6 }, makeCtx());
    expect(r.status === 'ok' && r.speech).toBe('Listo, pasé 1 toro del lote 7 al 6.');
  });

  it('"todas" mueve todo lo disponible', () => {
    const r = moverAnimales({ cantidad: 'todas', categoria: 'toros', lote_origen: 7, lote_destino: 6 }, makeCtx());
    expect(r.status === 'ok' && r.newEvents[0].payload).toEqual({ category: 'toros', count: 10, fromLot: 7, toLot: 6 });
  });

  it('pregunta un dato por vez: categoría, cantidad, origen, destino', () => {
    expect(moverAnimales({}, makeCtx())).toMatchObject({ status: 'needs_info', missing: 'categoria', question: '¿Qué animales? Vacas, vaquillonas, terneros, novillos o toros.' });
    expect(moverAnimales({ categoria: 'vaquillonas' }, makeCtx())).toMatchObject({ missing: 'cantidad', question: '¿Cuántas vaquillonas?' });
    expect(moverAnimales({ categoria: 'novillos' }, makeCtx())).toMatchObject({ missing: 'cantidad', question: '¿Cuántos novillos?' });
    expect(moverAnimales({ categoria: 'novillos', cantidad: 5 }, makeCtx())).toMatchObject({ missing: 'lote_origen', question: '¿De qué lote salen?' });
    expect(moverAnimales({ categoria: 'novillos', cantidad: 5, lote_origen: 6 }, makeCtx())).toMatchObject({ missing: 'lote_destino', question: '¿A qué lote van?' });
  });

  it('la tarjeta pendiente marca los huecos', () => {
    const r = moverAnimales({ cantidad: 40, categoria: 'vaquillonas', lote_destino: 5 }, makeCtx());
    expect(r.status === 'needs_info' && r.card.fields).toEqual([
      { label: 'Categoría', value: 'vaquillonas' },
      { label: 'Cantidad', value: '40' },
      { label: 'Lote origen', value: null },
      { label: 'Lote destino', value: 'Lote 5' },
    ]);
  });

  it('lote inexistente repregunta y limpia ese dato', () => {
    const r = moverAnimales({ ...full, lote_origen: 9 }, makeCtx());
    expect(r).toMatchObject({ status: 'needs_info', missing: 'lote_origen', question: 'No tengo lote 9, los lotes van del 1 al 8. ¿De qué lote salen?' });
    expect(r.status === 'needs_info' && r.partial.args).toEqual({ cantidad: 40, categoria: 'vaquillonas', lote_destino: 5 });
  });

  it('mismo lote de origen y destino repregunta el destino', () => {
    expect(moverAnimales({ ...full, lote_destino: 3 }, makeCtx())).toMatchObject({ missing: 'lote_destino', question: 'Salen y entran al mismo lote. ¿A qué lote van?' });
  });

  it('rechaza si no alcanzan o si no hay de esa categoría', () => {
    expect(moverAnimales({ ...full, cantidad: 50 }, makeCtx())).toMatchObject({ status: 'rejected', speech: 'En el lote 3 hay 45 vaquillonas, no 50. No registré nada.' });
    expect(moverAnimales({ ...full, categoria: 'toros' }, makeCtx())).toMatchObject({ status: 'rejected', speech: 'En el lote 3 no hay toros. No registré nada.' });
  });

  it('valida contra el stock ya movido', () => {
    const r = moverAnimales({ ...full, cantidad: 10 }, makeCtx([move('m', 40, 'vaquillonas', 3, 5)]));
    expect(r).toMatchObject({ status: 'rejected', speech: 'En el lote 3 hay 5 vaquillonas, no 10. No registré nada.' });
  });
});

describe('consultar_stock', () => {
  const speech = (args: Parameters<typeof consultarStock>[0], events = [] as Parameters<typeof makeCtx>[0]) => {
    const r = consultarStock(args, makeCtx(events));
    return r.status === 'ok' ? r.speech : r.status;
  };

  it('por lote, con desglose', () => {
    expect(speech({ lote: 1 })).toBe('En el lote 1 hay 110 animales: 70 vacas y 40 terneros.');
    const r = consultarStock({ lote: 5 }, makeCtx());
    expect(r.status === 'ok' && r.card).toEqual({ tone: 'consulta', title: 'Lote 5', headline: '40 cabezas', lines: ['40 vaquillonas'] });
  });

  it('lote vacío', () => {
    expect(speech({ lote: 8 })).toBe('El lote 8 está vacío.');
  });

  it('lote y categoría', () => {
    expect(speech({ lote: 3, categoria: 'vaquillonas' })).toBe('En el lote 3 hay 45 vaquillonas.');
  });

  it('categoría en todo el campo', () => {
    expect(speech({ categoria: 'vaquillonas' })).toBe('Hay 85 vaquillonas: 45 en el lote 3 y 40 en el lote 5.');
    expect(speech({ categoria: 'toros' }, [move('m', 10, 'toros', 7, 8)])).toBe('Hay 10 toros: 10 en el lote 8.');
  });

  it('total del campo con detalle por categoría', () => {
    const r = consultarStock({}, makeCtx());
    expect(r.status === 'ok' && r.speech).toBe('En total hay 450 animales en el campo.');
    expect(r.status === 'ok' && r.card.lines).toEqual(['Vacas: 210', 'Vaquillonas: 85', 'Terneros: 120', 'Novillos: 25', 'Toros: 10']);
  });

  it('refleja los movimientos', () => {
    expect(speech({ lote: 5 }, [move('m', 40, 'vaquillonas', 3, 5)])).toBe('En el lote 5 hay 80 animales: 80 vaquillonas.');
  });

  it('rechaza lotes inexistentes', () => {
    expect(consultarStock({ lote: 9 }, makeCtx())).toMatchObject({ status: 'rejected', speech: 'No tengo lote 9, los lotes van del 1 al 8.' });
  });
});
