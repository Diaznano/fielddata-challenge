import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return visible;
}
