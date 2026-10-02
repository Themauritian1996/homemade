/**
 * Clavier : sur Android « bord à bord » (imposé depuis Expo SDK 54), la fenêtre ne rapetisse plus quand le clavier
 * s'ouvre. Les écrans de saisie utilisent donc KeyboardAvoidingView en mode « padding » sur les deux plateformes
 * (voir KEYBOARD_BEHAVIOR), et leur ScrollView défile jusqu'au champ touché s'il passe sous le clavier.
 * Usage : `const kb = useKeyboardAutoScroll();` puis `<ScrollView {...kb} …>`.
 */
import { useEffect, useRef } from 'react';
import { Keyboard, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, TextInput } from 'react-native';

export const KEYBOARD_BEHAVIOR = Platform.OS === 'web' ? undefined : ('padding' as const);

/** Marge visible sous le champ (son libellé d'erreur, le bouton suivant). */
const MARGIN = 32;

export function useKeyboardAutoScroll() {
  const ref = useRef<ScrollView>(null);
  const offset = useRef(0);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Keyboard.addListener('keyboardDidShow', (e) => {
      const input = TextInput.State.currentlyFocusedInput?.();
      if (!input || !ref.current) return;
      const keyboardTop = e.endCoordinates.screenY;
      // Petit délai : le KeyboardAvoidingView applique d'abord sa marge.
      setTimeout(() => {
        input.measureInWindow((_x, y, _w, h) => {
          const overlap = y + h + MARGIN - keyboardTop;
          if (overlap > 0) ref.current?.scrollTo({ y: offset.current + overlap, animated: true });
        });
      }, 60);
    });
    return () => sub.remove();
  }, []);

  return {
    ref,
    scrollEventThrottle: 32,
    keyboardShouldPersistTaps: 'handled' as const,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = e.nativeEvent.contentOffset.y;
    },
  };
}
