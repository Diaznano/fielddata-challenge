import { NativeModule, requireNativeModule } from 'expo';

declare class VolumePttModule extends NativeModule<{ onVolumeDown: () => void }> {}

const VolumePtt = requireNativeModule<VolumePttModule>('VolumePtt');

export function addVolumeDownListener(listener: () => void) {
  return VolumePtt.addListener('onVolumeDown', listener);
}
