import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Keyboard, Platform, ScrollView, TextInput } from 'react-native';

// Native keyboard insets reserve space; measuring the focused field also
// brings inputs already below the keyboard into the visible scroll viewport.
export default forwardRef(function KeyboardAwareScrollView({ onScroll, onFocus, onBlur, onContentSizeChange, automaticallyAdjustKeyboardInsets = Platform.OS === 'ios', ...props }, forwardedRef) {
  const scroll = useRef(null);
  const position = useRef(0);
  const keyboardTop = useRef(Infinity);
  const timer = useRef(null);
  const focused = useRef(null);
  useImperativeHandle(forwardedRef, () => scroll.current);
  const reveal = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const input = TextInput.State.currentlyFocusedInput();
      if (!input || input !== focused.current || !scroll.current) return;
      scroll.current.measureInWindow((sx, sy, sw, sh) => {
        input.measureInWindow((x, y, w, h) => {
          const bottom = Math.min(sy + sh, keyboardTop.current) - 20;
          const distance = y + h - bottom;
          if (distance > 0) scroll.current?.scrollTo({ y: Math.max(0, position.current + distance), animated: true });
        });
      });
    }, 100);
  }, []);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => { keyboardTop.current = event.endCoordinates.screenY; reveal(); });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardTop.current = Infinity; });
    return () => { show.remove(); hide.remove(); clearTimeout(timer.current); };
  }, [reveal]);
  return <ScrollView {...props} ref={scroll}
    automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets} keyboardShouldPersistTaps="handled"
    scrollEventThrottle={16}
    onFocus={event => { event.stopPropagation(); focused.current = TextInput.State.currentlyFocusedInput(); onFocus?.(event); reveal(); }}
    onBlur={event => { focused.current = null; onBlur?.(event); }}
    onContentSizeChange={(width, height) => { onContentSizeChange?.(width, height); if (keyboardTop.current !== Infinity) reveal(); }}
    onScroll={event => { position.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }} />;
});
