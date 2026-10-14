import { FARM } from '@/data/seed';
import { MemoryEventStore } from '@/data/eventStore';
import { parseLocal } from '@/interpreter/local/parser';
import { initialConversation, runIntentTurn, runTurn, TurnDeps } from '../engine';

const localInterpret: TurnDeps['interpret'] = async (req) => ({
  interpretation: parseLocal(req.text, req.pending, req.today),
  via: 'local',
  degraded: false,
});

function setup(interpret: TurnDeps['interpret'] = localInterpret) {
  const store = new MemoryEventStore();
  let n = 0;
  let now = new Date(2026, 9, 13, 10, 0, 0);
  const deps: TurnDeps = { farm: FARM, store, interpret, now: () => now, newId: () => `e-${++n}` };
  return { store, deps, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

describe('runTurn', () => {
  it('registra una lluvia dicha por voz y la persiste con su origen', async () => {
    const { store, deps } = setup();
    const out = await runTurn('Llovieron 18 mm anoche', 'voz', initialConversation, deps);
    expect(out.card.title).toBe('Lluvia registrada');
    expect(out.speech).toBe('Anotado: 18 milímetros ayer. En octubre van 18.');
    expect(out.expectsReply).toBe(false);
    expect(await store.list()).toEqual([
      expect.objectContaining({ type: 'lluvia', occurredOn: '2026-10-12', source: 'voz', interpreter: 'local', rawText: 'Llovieron 18 mm anoche' }),
    ]);
  });

  it('repregunta el lote y completa con la respuesta', async () => {
    const { store, deps } = setup();
    const first = await runTurn('Pasé 40 vaquillonas al 5', 'voz', initialConversation, deps);
    expect(first).toMatchObject({ speech: '¿De qué lote salen?', expectsReply: true });
    expect(first.state.pending?.missing).toBe('lote_origen');
    expect(await store.list()).toEqual([]);

    const second = await runTurn('del 3', 'voz', first.state, deps);
    expect(second.card.lines).toContain('Lote 3: 45 → 5 vaquillonas');
    expect(second.state.pending).toBeNull();
    expect(await store.list()).toHaveLength(1);
  });

  it('el pendiente vence al minuto', async () => {
    const { deps, advance } = setup();
    const first = await runTurn('Pasé 40 vaquillonas al 5', 'voz', initialConversation, deps);
    advance(61_000);
    const second = await runTurn('del 3', 'voz', first.state, deps);
    expect(second.card.title).toBe('No te entendí');
  });

  it('cancelar descarta el pendiente sin escribir', async () => {
    const { store, deps } = setup();
    const first = await runTurn('Pasé 40 vaquillonas al 5', 'voz', initialConversation, deps);
    const second = await runTurn('olvidate', 'voz', first.state, deps);
    expect(second.card.title).toBe('Cancelado');
    expect(second.state.pending).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it('un pedido distinto descarta el pendiente', async () => {
    const { deps } = setup();
    const first = await runTurn('Pasé 40 vaquillonas al 5', 'voz', initialConversation, deps);
    const second = await runTurn('¿Cuánto llovió este mes?', 'voz', first.state, deps);
    expect(second.card.tone).toBe('consulta');
    expect(second.state.pending).toBeNull();
  });

  it('si no entiende, mantiene el pendiente para reintentar', async () => {
    const { store, deps } = setup();
    const first = await runTurn('Pasé 40 vaquillonas al 5', 'voz', initialConversation, deps);
    const confused = await runTurn('banana', 'voz', first.state, deps);
    expect(confused.card.title).toBe('No te entendí');
    expect(confused.expectsReply).toBe(false);
    expect(confused.state.pending?.missing).toBe('lote_origen');
    await runTurn('del 3', 'voz', confused.state, deps);
    expect(await store.list()).toHaveLength(1);
  });

  it('un rechazo no escribe nada', async () => {
    const { store, deps } = setup();
    const out = await runTurn('Pasé 50 vaquillonas del 3 al 5', 'voz', initialConversation, deps);
    expect(out.speech).toBe('En el lote 3 hay 45 vaquillonas, no 50. No registré nada.');
    expect(await store.list()).toEqual([]);
  });

  it('"borrá eso" anula el último registro', async () => {
    const { store, deps } = setup();
    const first = await runTurn('Llovieron 18 mm anoche', 'voz', initialConversation, deps);
    const undo = await runTurn('borrá eso', 'voz', first.state, deps);
    expect(undo.speech).toBe('Listo, borré la lluvia de 18 milímetros.');
    expect((await store.list()).map((e) => e.type)).toEqual(['lluvia', 'anulacion']);
  });

  describe('deshacer con una repregunta abierta', () => {
    const iaDeshacer: TurnDeps['interpret'] = async () => ({
      interpretation: { kind: 'intent', intent: { tool: 'deshacer_ultimo', args: {} } },
      via: 'ia',
      degraded: false,
    });

    it('la IA que pide deshacer con un pendiente cancela la repregunta y no anula un registro viejo', async () => {
      const { store, deps } = setup();
      await runTurn('Llovieron 18 mm anoche', 'voz', initialConversation, deps);
      const pendiente = await runTurn('Pasé 40 vaquillonas al 5', 'voz', initialConversation, deps);
      expect(pendiente.state.pending?.missing).toBe('lote_origen');

      const out = await runTurn('borrá eso', 'voz', pendiente.state, { ...deps, interpret: iaDeshacer });
      expect(out.card.title).toBe('Cancelado');
      expect(out.speech).toBe('Listo, lo dejamos ahí.');
      expect(out.state.pending).toBeNull();
      expect((await store.list()).map((e) => e.type)).toEqual(['lluvia']);
    });

    it('sin pendiente la IA sí anula el último registro', async () => {
      const { store, deps } = setup();
      const first = await runTurn('Llovieron 18 mm anoche', 'voz', initialConversation, deps);
      const out = await runTurn('borrá eso', 'voz', first.state, { ...deps, interpret: iaDeshacer });
      expect(out.card.title).toBe('Registro anulado');
      expect((await store.list()).map((e) => e.type)).toEqual(['lluvia', 'anulacion']);
    });

    it('con el pendiente vencido el deshacer vuelve a valer', async () => {
      const { store, deps, advance } = setup();
      await runTurn('Llovieron 18 mm anoche', 'voz', initialConversation, deps);
      const pendiente = await runTurn('Pasé 40 vaquillonas al 5', 'voz', initialConversation, deps);
      advance(61_000);
      const out = await runTurn('borrá eso', 'voz', pendiente.state, { ...deps, interpret: iaDeshacer });
      expect(out.card.title).toBe('Registro anulado');
      expect((await store.list()).map((e) => e.type)).toEqual(['lluvia', 'anulacion']);
    });
  });

  describe('valores en cero con el parser local', () => {
    it('"llovieron 0 mm" repregunta los milímetros y no escribe nada', async () => {
      const { store, deps } = setup();
      const first = await runTurn('llovieron 0 mm', 'voz', initialConversation, deps);
      expect(first).toMatchObject({ speech: '¿Cuántos milímetros llovieron?', expectsReply: true });
      expect(first.state.pending?.missing).toBe('mm');
      expect(await store.list()).toEqual([]);

      const again = await runTurn('cero', 'voz', first.state, deps);
      expect(again.speech).toBe('¿Cuántos milímetros llovieron?');
      expect(await store.list()).toEqual([]);

      const done = await runTurn('18', 'voz', again.state, deps);
      expect(done.speech).toBe('Anotado: 18 milímetros hoy. En octubre van 18.');
      expect(await store.list()).toHaveLength(1);
    });

    it('"pasé 0 vacas del 1 al 2" repregunta la cantidad y no escribe nada', async () => {
      const { store, deps } = setup();
      const first = await runTurn('pasé 0 vacas del 1 al 2', 'voz', initialConversation, deps);
      expect(first).toMatchObject({ speech: '¿Cuántas vacas?', expectsReply: true });
      expect(first.state.pending?.missing).toBe('cantidad');
      expect(await store.list()).toEqual([]);

      const again = await runTurn('cero', 'voz', first.state, deps);
      expect(again.speech).toBe('¿Cuántas vacas?');
      expect(await store.list()).toEqual([]);

      const done = await runTurn('diez', 'voz', again.state, deps);
      expect(done.speech).toBe('Listo, pasé 10 vacas del lote 1 al 2.');
      expect(await store.list()).toHaveLength(1);
    });
  });

  it('con el parser local, corregir los milímetros a una confirmación vuelve a validar el valor nuevo', async () => {
    const { store, deps } = setup();
    const first = await runTurn('llovieron 200 mm', 'voz', initialConversation, deps);
    expect(first.state.pending?.missing).toBe('confirmacion');
    const second = await runTurn('no, eran 18', 'voz', first.state, deps);
    expect(second.speech).toBe('Anotado: 18 milímetros hoy. En octubre van 18.');
    expect(await store.list()).toEqual([expect.objectContaining({ type: 'lluvia', payload: { mm: 18 } })]);
  });

  it('con el parser local, corregir a otro valor grande vuelve a pedir confirmación', async () => {
    const { store, deps } = setup();
    const first = await runTurn('llovieron 200 mm', 'voz', initialConversation, deps);
    const second = await runTurn('sí, pero eran 300', 'voz', first.state, deps);
    expect(second.speech).toBe('¿Seguro que fueron 300 milímetros?');
    expect(second.state.pending).toMatchObject({ missing: 'confirmacion', intent: { args: { mm: 300 } } });
    expect(await store.list()).toEqual([]);
  });

  it('el botón Deshacer ejecuta la herramienta sin pasar por el intérprete', async () => {
    const interpret = jest.fn(localInterpret);
    const { deps } = setup(interpret);
    const first = await runTurn('Llovieron 18 mm anoche', 'voz', initialConversation, deps);
    interpret.mockClear();
    const undo = await runIntentTurn({ tool: 'deshacer_ultimo', args: {} }, 'Deshacer (botón)', first.state, deps);
    expect(undo.card.title).toBe('Registro anulado');
    expect(interpret).not.toHaveBeenCalled();
  });

  it('con IA usa la redacción del LLM y cae a la plantilla si no llega', async () => {
    const ia: TurnDeps['interpret'] = async () => ({
      interpretation: { kind: 'intent', intent: { tool: 'registrar_lluvia', args: { mm: 5 } } },
      via: 'ia',
      degraded: false,
    });
    const { deps } = setup(ia);
    const phrased = await runTurn('cayeron cinco', 'voz', initialConversation, { ...deps, phrase: async () => 'Cinco milímetros, anotado.' });
    expect(phrased.speech).toBe('Cinco milímetros, anotado.');
    const fallback = await runTurn('cayeron cinco', 'voz', initialConversation, { ...deps, phrase: async () => null });
    expect(fallback.speech).toBe('Anotado: 5 milímetros hoy. En octubre van 10.');
  });

  describe('redacción del LLM como límite con un servicio externo', () => {
    const iaLluvia: TurnDeps['interpret'] = async () => ({
      interpretation: { kind: 'intent', intent: { tool: 'registrar_lluvia', args: { mm: 5 } } },
      via: 'ia',
      degraded: false,
    });

    it('si la redacción rechaza, usa la plantilla y el evento se guarda una sola vez', async () => {
      const { store, deps } = setup(iaLluvia);
      const out = await runTurn('cayeron cinco', 'voz', initialConversation, { ...deps, phrase: async () => { throw new Error('timeout'); } });
      expect(out.speech).toBe('Anotado: 5 milímetros hoy. En octubre van 5.');
      expect(await store.list()).toHaveLength(1);
    });

    it('si la redacción viene en blanco, usa la plantilla', async () => {
      const { deps } = setup(iaLluvia);
      const out = await runTurn('cayeron cinco', 'voz', initialConversation, { ...deps, phrase: async () => '   ' });
      expect(out.speech).toBe('Anotado: 5 milímetros hoy. En octubre van 5.');
    });

    it('redacta antes de guardar, para que el append sea el último paso asíncrono', async () => {
      const { store, deps } = setup(iaLluvia);
      let guardadosAlRedactar = -1;
      const phrase = async () => {
        guardadosAlRedactar = (await store.list()).length;
        return 'Cinco milímetros, anotado.';
      };
      await runTurn('cayeron cinco', 'voz', initialConversation, { ...deps, phrase });
      expect(guardadosAlRedactar).toBe(0);
      expect(await store.list()).toHaveLength(1);
    });
  });

  it('en modo local no llama a la redacción del LLM', async () => {
    const phrase = jest.fn(async () => 'no debería usarse');
    const { deps } = setup();
    await runTurn('Llovieron 18 mm anoche', 'voz', initialConversation, { ...deps, phrase });
    expect(phrase).not.toHaveBeenCalled();
  });

  it('una respuesta libre del LLM se muestra como ayuda', async () => {
    const { deps } = setup(async () => ({ interpretation: { kind: 'reply', text: 'Puedo anotar lluvias y movimientos.' }, via: 'ia', degraded: false }));
    const out = await runTurn('¿qué podés hacer?', 'voz', initialConversation, deps);
    expect(out.card).toEqual({ tone: 'ayuda', title: 'FieldData', lines: ['Puedo anotar lluvias y movimientos.'] });
    expect(out.speech).toBe('Puedo anotar lluvias y movimientos.');
  });

  it('informa si el intérprete cayó a modo degradado', async () => {
    const { deps } = setup(async (req) => ({ interpretation: parseLocal(req.text, req.pending, req.today), via: 'local', degraded: true }));
    const out = await runTurn('¿Cuánto llovió hoy?', 'voz', initialConversation, deps);
    expect(out).toMatchObject({ via: 'local', degraded: true });
  });

  describe('confirmación de lluvias de más de 150 mm', () => {
    // El LLM puede mandar cualquier argumento, incluso uno que el schema no deja pasar por tipos.
    const iaLluvia = (args: () => object): TurnDeps['interpret'] => async () => ({
      interpretation: { kind: 'intent', intent: { tool: 'registrar_lluvia', args: args() } } as never,
      via: 'ia',
      degraded: false,
    });

    it('ignora un confirmado que viene del intérprete sin pendiente de confirmación', async () => {
      const { store, deps } = setup(iaLluvia(() => ({ mm: 300, confirmado: true })));
      const out = await runTurn('cayeron trescientos', 'voz', initialConversation, deps);
      expect(out.state.pending?.missing).toBe('confirmacion');
      expect(out.expectsReply).toBe(true);
      expect(await store.list()).toEqual([]);
    });

    it('ignora el confirmado aunque haya otro pendiente activo', async () => {
      let args: object = {};
      const { store, deps } = setup(iaLluvia(() => args));
      const first = await runTurn('llovió', 'voz', initialConversation, deps);
      expect(first.state.pending?.missing).toBe('mm');
      args = { mm: 300, confirmado: true };
      const second = await runTurn('trescientos', 'voz', first.state, deps);
      expect(second.state.pending?.missing).toBe('confirmacion');
      expect(await store.list()).toEqual([]);
    });

    it('con la confirmación pendiente activa, el confirmado sí registra', async () => {
      let args: object = { mm: 300 };
      const { store, deps } = setup(iaLluvia(() => args));
      const first = await runTurn('cayeron trescientos', 'voz', initialConversation, deps);
      expect(first.state.pending?.missing).toBe('confirmacion');
      args = { mm: 300, confirmado: true };
      const second = await runTurn('sí', 'voz', first.state, deps);
      expect(second.state.pending).toBeNull();
      expect(await store.list()).toEqual([expect.objectContaining({ type: 'lluvia', payload: { mm: 300 } })]);
    });

    it('la confirmación solo vale para el mismo valor preguntado: con otro valor vuelve a preguntar', async () => {
      let args: object = { mm: 300 };
      const { store, deps } = setup(iaLluvia(() => args));
      const first = await runTurn('cayeron trescientos', 'voz', initialConversation, deps);
      expect(first.state.pending?.missing).toBe('confirmacion');
      args = { mm: 500, confirmado: true };
      const second = await runTurn('no, fueron quinientos', 'voz', first.state, deps);
      expect(second.speech).toBe('¿Seguro que fueron 500 milímetros?');
      expect(second.state.pending).toMatchObject({ missing: 'confirmacion', intent: { args: { mm: 500 } } });
      expect(await store.list()).toEqual([]);
    });

    it('una confirmación vencida no sirve: pide confirmar de nuevo', async () => {
      let args: object = { mm: 300 };
      const { store, deps, advance } = setup(iaLluvia(() => args));
      const first = await runTurn('cayeron trescientos', 'voz', initialConversation, deps);
      advance(61_000);
      args = { mm: 300, confirmado: true };
      const second = await runTurn('sí', 'voz', first.state, deps);
      expect(second.state.pending?.missing).toBe('confirmacion');
      expect(await store.list()).toEqual([]);
    });
  });

  it('un pendiente vencido no se revive desde el historial que ve el intérprete', async () => {
    const interpret = jest.fn(localInterpret);
    const { deps, advance } = setup(interpret);
    const first = await runTurn('Pasé 40 vaquillonas al 5', 'voz', initialConversation, deps);
    const vigente = await runTurn('banana', 'voz', first.state, deps);
    expect(interpret.mock.calls[1][0].history).toHaveLength(2);
    advance(61_000);
    await runTurn('del 3', 'voz', vigente.state, deps);
    expect(interpret.mock.calls[2][0]).toMatchObject({ pending: null, history: [] });
  });

  it('un rechazo usa siempre la plantilla y no pasa por la redacción del LLM', async () => {
    const ia: TurnDeps['interpret'] = async () => ({
      interpretation: { kind: 'intent', intent: { tool: 'mover_animales', args: { cantidad: 50, categoria: 'vaquillonas', lote_origen: 3, lote_destino: 5 } } },
      via: 'ia',
      degraded: false,
    });
    const phrase = jest.fn(async () => 'Listo, pasé 50 vaquillonas.');
    const { store, deps } = setup(ia);
    const out = await runTurn('pasé 50 del 3 al 5', 'voz', initialConversation, { ...deps, phrase });
    expect(phrase).not.toHaveBeenCalled();
    expect(out.speech).toBe('En el lote 3 hay 45 vaquillonas, no 50. No registré nada.');
    expect(await store.list()).toEqual([]);
  });

  it('limita el historial a los últimos 6 mensajes', async () => {
    const { deps } = setup();
    let state = initialConversation;
    for (const text of ['¿Cuánto llovió hoy?', '¿Cuánto llovió ayer?', '¿Cuántos animales tengo?', '¿Qué hay en el 7?']) {
      state = (await runTurn(text, 'texto', state, deps)).state;
    }
    expect(state.history).toHaveLength(6);
    expect(state.history[0]).toEqual({ role: 'user', text: '¿Cuánto llovió ayer?' });
  });
});
