import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  View,
} from 'react-native';

/**
 * Keeps the focused input visible above the Android keyboard.
 *
 * - Adds bottom padding equal to the keyboard height so the form can scroll past it.
 * - Scrolls the focused field up when the keyboard would cover it.
 *
 * iOS is handled by KeyboardAvoidingView (behavior="padding"), so this is a no-op there.
 */
export function useKeyboardScroll() {
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const focusedField = useRef<View | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const ensureVisible = useCallback(() => {
    const field = focusedField.current;
    const top = keyboardTop.current;
    if (!field || top == null) return;

    field.measureInWindow((_x, y, _w, h) => {
      // 32px of breathing room, which also leaves space for the error text under the field.
      const overlap = y + h + 32 - top;
      if (overlap > 0) {
        scrollRef.current?.scrollTo({ y: scrollY.current + overlap, animated: true });
      }
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      setKeyboardHeight(e.endCoordinates.height);
      // Wait a beat so the extra bottom padding is laid out before scrolling.
      setTimeout(ensureVisible, 120);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [ensureVisible]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  /** Call from a TextInput's onFocus with the ref of the View wrapping that input. */
  const trackField = useCallback(
    (ref: React.RefObject<View | null>) => {
      focusedField.current = ref.current;
      // Covers moving between fields while the keyboard is already open.
      setTimeout(ensureVisible, 120);
    },
    [ensureVisible]
  );

  return { scrollRef, keyboardHeight, onScroll, trackField };
}
