import { resolveMode } from '../mode';

describe('resolveMode', () => {
  it('sin red siempre es offline', () => {
    expect(resolveMode({ online: false, llmEnabled: true, lastDegraded: false, lastVia: null })).toBe('offline');
  });
  it('con red y sin key es local', () => {
    expect(resolveMode({ online: true, llmEnabled: false, lastDegraded: false, lastVia: null })).toBe('local');
  });
  it('con red y key es IA, o señal débil si el último turno cayó al parser', () => {
    expect(resolveMode({ online: true, llmEnabled: true, lastDegraded: false, lastVia: null })).toBe('ia');
    expect(resolveMode({ online: true, llmEnabled: true, lastDegraded: true, lastVia: 'local' })).toBe('degraded');
  });
  it('si el último turno con red fue IA, o todavía no hubo turno, es IA', () => {
    expect(resolveMode({ online: true, llmEnabled: true, lastDegraded: false, lastVia: 'ia' })).toBe('ia');
    expect(resolveMode({ online: true, llmEnabled: true, lastDegraded: false, lastVia: null })).toBe('ia');
  });
  it('si el último turno con red fue local sin degradar, el LLM está apagado (key rechazada): local', () => {
    expect(resolveMode({ online: true, llmEnabled: true, lastDegraded: false, lastVia: 'local' })).toBe('local');
  });
});
