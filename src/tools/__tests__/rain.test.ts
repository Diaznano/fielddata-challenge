import { rain } from '@/test-utils/events';
import { makeCtx } from '@/test-utils/toolContext';
import { consultarLluvia, registrarLluvia } from '../rain';

describe('registrar_lluvia', () => {
  it('registra "anoche" como el día anterior y devuelve comprobante + voz', () => {
    const r = registrarLluvia({ mm: 18, fecha: '2026-10-12' }, makeCtx());
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.newEvents).toHaveLength(1);
    expect(r.newEvents[0]).toMatchObject({ type: 'lluvia', occurredOn: '2026-10-12', payload: { mm: 18 }, source: 'texto', rawText: 'prueba' });
    expect(r.card).toMatchObject({ tone: 'registro', title: 'Lluvia registrada', headline: '18 mm', undoableEventId: 'id-1' });
    expect(r.card.lines).toEqual(['Ayer · 12/10', 'Acumulado de octubre: 18 mm']);
    expect(r.speech).toBe('Anotado: 18 milímetros ayer. En octubre van 18.');
  });

  it('sin fecha usa hoy y acumula con lo existente', () => {
    const r = registrarLluvia({ mm: 12.5 }, makeCtx([rain('a', '2026-10-02', 6)]));
    expect(r.status === 'ok' && r.speech).toBe('Anotado: 12,5 milímetros hoy. En octubre van 18,5.');
  });

  it('sin milímetros pide el dato', () => {
    const r = registrarLluvia({ fecha: '2026-10-12' }, makeCtx());
    expect(r).toMatchObject({ status: 'needs_info', missing: 'mm', question: '¿Cuántos milímetros llovieron?' });
    if (r.status !== 'needs_info') return;
    expect(r.partial).toEqual({ tool: 'registrar_lluvia', args: { fecha: '2026-10-12' } });
    expect(r.card.fields).toEqual([
      { label: 'Milímetros', value: null },
      { label: 'Fecha', value: 'ayer' },
    ]);
  });

  it.each([0, -3])('%s mm cuenta como dato faltante: repregunta y no registra', (mm) => {
    const r = registrarLluvia({ mm, fecha: '2026-10-12' }, makeCtx());
    expect(r).toMatchObject({ status: 'needs_info', missing: 'mm', question: '¿Cuántos milímetros llovieron?' });
    if (r.status !== 'needs_info') return;
    expect(r.partial).toEqual({ tool: 'registrar_lluvia', args: { fecha: '2026-10-12' } });
    expect(r.card.fields).toEqual([
      { label: 'Milímetros', value: null },
      { label: 'Fecha', value: 'ayer' },
    ]);
  });

  it('1 milímetro va en singular y 1,5 en plural', () => {
    const one = registrarLluvia({ mm: 1 }, makeCtx());
    expect(one.status === 'ok' && one.speech).toBe('Anotado: 1 milímetro hoy. En octubre van 1.');
    const decimal = registrarLluvia({ mm: 1.5 }, makeCtx());
    expect(decimal.status === 'ok' && decimal.speech).toBe('Anotado: 1,5 milímetros hoy. En octubre van 1,5.');
  });

  it('más de 150 mm pide confirmación y con confirmado registra', () => {
    expect(registrarLluvia({ mm: 200 }, makeCtx())).toMatchObject({ status: 'needs_info', missing: 'confirmacion', question: '¿Seguro que fueron 200 milímetros?' });
    expect(registrarLluvia({ mm: 200, confirmado: true }, makeCtx()).status).toBe('ok');
  });

  it('150 mm exactos se registran sin pedir confirmación', () => {
    expect(registrarLluvia({ mm: 150 }, makeCtx()).status).toBe('ok');
  });

  it('el acumulado es el del mes de la lluvia, no el de hoy', () => {
    const r = registrarLluvia({ mm: 18, fecha: '2026-10-31' }, { ...makeCtx(), today: '2026-11-01' });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.speech).toBe('Anotado: 18 milímetros ayer. En octubre van 18.');
    expect(r.card.lines[1]).toBe('Acumulado de octubre: 18 mm');
  });

  it('rechaza fechas futuras sin escribir', () => {
    expect(registrarLluvia({ mm: 10, fecha: '2026-10-14' }, makeCtx())).toMatchObject({ status: 'rejected', speech: 'Esa fecha todavía no llegó. No registré nada.' });
  });
});

describe('consultar_lluvia', () => {
  const events = [rain('a', '2026-10-12', 18), rain('b', '2026-10-02', 6), rain('c', '2026-09-30', 10)];

  it('este mes por defecto, con detalle en la tarjeta', () => {
    const r = consultarLluvia({}, makeCtx(events));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.speech).toBe('En octubre llovieron 24 milímetros, en 2 lluvias.');
    expect(r.card).toMatchObject({ tone: 'consulta', title: 'Lluvia en octubre', headline: '24 mm', lines: ['12/10 · 18 mm', '2/10 · 6 mm'] });
    expect(r.newEvents).toEqual([]);
  });

  it('dias sin periodo consulta los últimos N días', () => {
    const r = consultarLluvia({ dias: 2 }, makeCtx(events));
    expect(r.status === 'ok' && r.speech).toBe('En los últimos 2 días llovieron 18 milímetros.');
  });

  it('un solo día no menciona cantidad de lluvias', () => {
    const r = consultarLluvia({ periodo: 'ayer' }, makeCtx(events));
    expect(r.status === 'ok' && r.speech).toBe('Ayer llovieron 18 milímetros.');
  });

  it('1 milímetro concuerda en singular, también con decimales que redondean a 1', () => {
    const one = consultarLluvia({ periodo: 'ayer' }, makeCtx([rain('a', '2026-10-12', 1)]));
    expect(one.status === 'ok' && one.speech).toBe('Ayer llovió 1 milímetro.');
    const rounded = consultarLluvia({ periodo: 'ayer' }, makeCtx([rain('a', '2026-10-12', 1.04)]));
    expect(rounded.status === 'ok' && rounded.speech).toBe('Ayer llovió 1 milímetro.');
    const decimal = consultarLluvia({ periodo: 'ayer' }, makeCtx([rain('a', '2026-10-12', 1.5)]));
    expect(decimal.status === 'ok' && decimal.speech).toBe('Ayer llovieron 1,5 milímetros.');
  });

  it('el último 1 día es hoy', () => {
    const r = consultarLluvia({ periodo: 'ultimos_dias', dias: 1 }, makeCtx([rain('a', '2026-10-13', 5)]));
    expect(r.status === 'ok' && r.speech).toBe('Hoy llovieron 5 milímetros.');
    expect(r.status === 'ok' && r.card.title).toBe('Lluvia hoy');
  });

  it('sin lluvias lo dice claro', () => {
    const r = consultarLluvia({ periodo: 'hoy' }, makeCtx(events));
    expect(r.status === 'ok' && r.speech).toBe('No llovió hoy.');
    expect(r.status === 'ok' && r.card.lines).toEqual(['Sin lluvias registradas']);
  });

  it('mes anterior y últimos N días', () => {
    const prev = consultarLluvia({ periodo: 'mes_anterior' }, makeCtx(events));
    expect(prev.status === 'ok' && prev.speech).toBe('En septiembre llovieron 10 milímetros.');
    const last = consultarLluvia({ periodo: 'ultimos_dias', dias: 2 }, makeCtx(events));
    expect(last.status === 'ok' && last.speech).toBe('En los últimos 2 días llovieron 18 milímetros.');
  });
});
