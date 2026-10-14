import { initialMic, MicAction, micReducer, MicState } from '../mic';

const run = (actions: MicAction['type'][], from: MicState = initialMic) =>
  actions.reduce((s, type) => micReducer(s, { type } as MicAction), from);

describe('micReducer', () => {
  it('ciclo normal: escuchar → pensar → hablar → inactivo', () => {
    expect(run(['LISTEN']).status).toBe('listening');
    expect(run(['LISTEN', 'SUBMIT']).status).toBe('thinking');
    expect(run(['LISTEN', 'SUBMIT', 'SPEAK']).status).toBe('speaking');
    expect(run(['LISTEN', 'SUBMIT', 'SPEAK', 'DONE']).status).toBe('idle');
  });

  it('el "end" del reconocedor después del resultado final no pisa "Pensando"', () => {
    expect(run(['LISTEN', 'SUBMIT', 'STOPPED']).status).toBe('thinking');
  });

  it('el "end" sin resultado vuelve a inactivo', () => {
    expect(run(['LISTEN', 'STOPPED']).status).toBe('idle');
  });

  it('sin permiso queda bloqueado y vuelve a bloqueado después de un turno escrito', () => {
    const blocked = run(['MIC_BLOCKED']);
    expect(blocked).toEqual({ status: 'blocked', micAllowed: false });
    expect(run(['LISTEN'], blocked).status).toBe('blocked');
    expect(run(['SUBMIT', 'SPEAK', 'DONE'], blocked).status).toBe('blocked');
  });

  it('al conceder el permiso vuelve a inactivo', () => {
    expect(run(['MIC_BLOCKED', 'MIC_ALLOWED'])).toEqual({ status: 'idle', micAllowed: true });
  });

  it('bloquear mientras habla no corta el habla', () => {
    expect(run(['SUBMIT', 'SPEAK', 'MIC_BLOCKED'])).toEqual({ status: 'speaking', micAllowed: false });
  });
});
