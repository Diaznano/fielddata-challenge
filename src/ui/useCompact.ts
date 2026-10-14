import { useWindowDimensions } from 'react-native';

// Por debajo de esta altura (dp) no entran el resumen, la tarjeta y el micrófono juntos; la TC21 mide 360x640.
const COMPACT_HEIGHT = 720;

export function useCompact(): boolean {
  return useWindowDimensions().height < COMPACT_HEIGHT;
}
