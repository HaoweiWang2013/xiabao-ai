/**
 * useKeyboard — track soft keyboard visibility & height on mobile.
 *
 * On Capacitor: uses @capacitor/keyboard plugin (native events).
 * Fallback: visualViewport API (Chrome WebView / PWA).
 */
import { useEffect, useState } from 'react';

export interface KeyboardInfo {
  visible: boolean;
  height: number;
}

export function useKeyboard(): KeyboardInfo {
  const [info, setInfo] = useState<KeyboardInfo>({ visible: false, height: 0 });

  useEffect(() => {
    // Try Capacitor Keyboard plugin first (dynamic import)
    const tryCapacitor = async () => {
      try {
        const { Keyboard } = await import('@capacitor/keyboard');
        const showHandler = await Keyboard.addListener(
          'keyboardWillShow',
          (ev: { keyboardHeight: number }) => {
            setInfo({ visible: true, height: ev.keyboardHeight });
          },
        );
        const hideHandler = await Keyboard.addListener('keyboardWillHide', () => {
          setInfo({ visible: false, height: 0 });
        });
        return () => {
          void showHandler.remove();
          void hideHandler.remove();
        };
      } catch {
        return null;
      }
    };

    // Fallback: visualViewport API
    const useVisualViewport = () => {
      const onResize = () => {
        const vh = window.visualViewport?.height ?? window.innerHeight;
        const kh = window.innerHeight - vh;
        setInfo({ visible: kh > 100, height: Math.max(0, kh) });
      };
      window.visualViewport?.addEventListener('resize', onResize);
      onResize();
      return () => window.visualViewport?.removeEventListener('resize', onResize);
    };

    let cleanup: (() => void) | null = null;
    void tryCapacitor().then((c) => {
      cleanup = c ?? useVisualViewport();
    });

    return () => {
      cleanup?.();
    };
  }, []);

  return info;
}
