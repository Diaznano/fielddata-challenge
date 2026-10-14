import { resolveMode } from '../mode';

describe('resolveMode', () => {
  it('sin red siempre es offline', () => {
    expect(resolveMode({ online: false, llmEnabled: true, lastDegraded: false })).toBe('offline');
  });
  it('con red y sin key es local', () => {
    expect(resolveMode({ online: true, llmEnabled: false, lastDegraded: false })).toBe('local');
  });
  it('con red y key es IA, o señal débil si el último turno cayó al parser', () => {
    expect(resolveMode({ online: true, llmEnabled: true, lastDegraded: false })).toBe('ia');
    expect(resolveMode({ online: true, llmEnabled: true, lastDegraded: true })).toBe('degraded');
  });
});
