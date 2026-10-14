export type MicStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'blocked';

export interface MicState {
  status: MicStatus;
  micAllowed: boolean;
}

export type MicAction =
  | { type: 'LISTEN' }
  | { type: 'SUBMIT' }
  | { type: 'SPEAK' }
  | { type: 'DONE' }
  | { type: 'STOPPED' }
  | { type: 'MIC_BLOCKED' }
  | { type: 'MIC_ALLOWED' };

export const initialMic: MicState = { status: 'idle', micAllowed: true };

function rest(state: MicState): MicState {
  return { ...state, status: state.micAllowed ? 'idle' : 'blocked' };
}

export function micReducer(state: MicState, action: MicAction): MicState {
  switch (action.type) {
    case 'LISTEN':
      return state.micAllowed ? { ...state, status: 'listening' } : state;
    case 'SUBMIT':
      return { ...state, status: 'thinking' };
    case 'SPEAK':
      return { ...state, status: 'speaking' };
    case 'DONE':
      return rest(state);
    // El "end" del reconocedor llega tarde, después del resultado final: solo actúa si seguimos escuchando.
    case 'STOPPED':
      return state.status === 'listening' ? rest(state) : state;
    case 'MIC_BLOCKED':
      return { micAllowed: false, status: state.status === 'idle' || state.status === 'listening' ? 'blocked' : state.status };
    case 'MIC_ALLOWED':
      return { micAllowed: true, status: state.status === 'blocked' ? 'idle' : state.status };
  }
}

export const MIC_COPY: Record<MicStatus, { label: string; hint: string }> = {
  idle: { label: 'Tocá y hablá', hint: 'Te escucho hasta que hagas silencio' },
  listening: { label: 'Escuchando…', hint: 'Tocá para terminar' },
  thinking: { label: 'Pensando…', hint: 'Un segundo' },
  speaking: { label: 'Hablando…', hint: 'Tocá para cortar' },
  blocked: { label: 'Activar micrófono', hint: 'Mientras tanto, podés escribir' },
};
