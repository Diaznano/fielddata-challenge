import { move, rain, voidOf } from '@/test-utils/events';
import { makeCtx } from '@/test-utils/toolContext';
import { deshacerUltimo } from '../undo';
import { runTool } from '../index';

describe('deshacer_ultimo', () => {
  it('anula el último registro del productor', () => {
    const r = deshacerUltimo({}, makeCtx([rain('s', '2026-10-11', 6, { source: 'semilla' }), rain('r1', '2026-10-12', 18), move('m1', 40, 'vaquillonas', 3, 5)]));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.newEvents[0]).toMatchObject({ type: 'anulacion', payload: { targetId: 'm1' } });
    expect(r.speech).toBe('Listo, borré el movimiento de 40 vaquillonas del lote 3 al 5.');
    expect(r.card).toEqual({ tone: 'registro', title: 'Registro anulado', headline: 'Deshecho', lines: ['El movimiento de 40 vaquillonas del lote 3 al 5'] });
  });

  it('una lluvia de 1 milímetro se nombra en singular', () => {
    const r = deshacerUltimo({}, makeCtx([rain('r1', '2026-10-12', 1)]));
    expect(r.status === 'ok' && r.speech).toBe('Listo, borré la lluvia de 1 milímetro.');
    const decimal = deshacerUltimo({}, makeCtx([rain('r1', '2026-10-12', 1.5)]));
    expect(decimal.status === 'ok' && decimal.speech).toBe('Listo, borré la lluvia de 1,5 milímetros.');
  });

  it('deshacer repetido sigue en orden inverso y saltea lo ya anulado', () => {
    const r = deshacerUltimo({}, makeCtx([rain('r1', '2026-10-12', 18), move('m1', 40, 'vaquillonas', 3, 5), voidOf('v1', 'm1')]));
    expect(r.status === 'ok' && r.speech).toBe('Listo, borré la lluvia de 18 milímetros.');
  });

  it('nunca anula la semilla y avisa cuando no queda nada', () => {
    expect(deshacerUltimo({}, makeCtx([rain('s', '2026-10-11', 6, { source: 'semilla' })]))).toMatchObject({ status: 'rejected', speech: 'No hay nada para deshacer.' });
  });

  it('runTool despacha a cada herramienta', () => {
    expect(runTool({ tool: 'consultar_stock', args: { lote: 7 } }, makeCtx()).status).toBe('ok');
    expect(runTool({ tool: 'deshacer_ultimo', args: {} }, makeCtx()).status).toBe('rejected');
  });
});
