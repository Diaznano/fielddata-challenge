import { useEffect, useRef } from 'react';
import { addVolumeDownListener } from '../../modules/volume-ptt';

export function useVolumePtt(onPress: () => void): void {
  const latest = useRef(onPress);
  latest.current = onPress;
  useEffect(() => {
    const subscription = addVolumeDownListener(() => latest.current());
    return () => subscription.remove();
  }, []);
}
