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
    expect(out.card).toEqual({ tone: 'ayuda', title: 'La Tranquera', lines: ['Puedo anotar lluvias y movimientos.'] });
    expect(out.speech).toBe('Puedo anotar lluvias y movimientos.');
  });

  it('informa si el intérprete cayó a modo degradado', async () => {
    const { deps } = setup(async (req) => ({ interpretation: parseLocal(req.text, req.pending, req.today), via: 'local', degraded: true }));
    const out = await runTurn('¿Cuánto llovió hoy?', 'voz', initialConversation, deps);
    expect(out).toMatchObject({ via: 'local', degraded: true });
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
