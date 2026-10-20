import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder, useWindowDimensions } from 'react-native';

// The Menu drawer's complete motion lifecycle, shared by all drawer headers.
// Keep panHandlers outside the body ScrollView so scrolling never competes
// with dragging the handle/title. Content remains independently scrollable.
export default function useMenuDrawerMotion({ visible, onClose, openingFraction = 1 }) {
  const { height: screenHeight } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const sheetHeight = useRef(0);
  const closeRef = useRef(onClose);
  const closingRef = useRef(false);
  const afterCloseRef = useRef(null);
  const generation = useRef(0);
  const drag = useRef({ active:false, generation:0, origin:null, distance:0 });
  closeRef.current = onClose;

  useEffect(() => {
    const current = ++generation.current;
    translateY.stopAnimation();
    closingRef.current = false;
    afterCloseRef.current = null;
    drag.current.active = false;
    if (visible) {
      translateY.setValue(sheetHeight.current || screenHeight * openingFraction);
      Animated.spring(translateY, {
        toValue: 0, damping: 25, stiffness: 230, mass: 0.9, useNativeDriver: true,
      }).start();
    }
    return () => {
      if (generation.current === current) generation.current++;
      translateY.stopAnimation();
    };
  }, [screenHeight, translateY, visible, openingFraction]);

  const restoreSheet = useCallback(() => {
    if (closingRef.current) return;
    Animated.spring(translateY, {
      toValue: 0, damping: 26, stiffness: 240, mass: 0.85, useNativeDriver: true,
    }).start();
  }, [translateY]);

  const requestClose = useCallback(afterClose => {
    if (closingRef.current) return;
    closingRef.current = true;
    drag.current.active = false;
    afterCloseRef.current = typeof afterClose === 'function' ? afterClose : null;
    const current = generation.current;
    translateY.stopAnimation();
    Animated.timing(translateY, {
      toValue: sheetHeight.current || screenHeight, duration: 245,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || generation.current !== current) return;
      const callback = afterCloseRef.current;
      afterCloseRef.current = null;
      closeRef.current?.();
      callback?.();
    });
  }, [screenHeight, translateY]);

  const releaseDrag = useCallback(gesture => {
    const projectedDistance = Math.max(0, gesture.dy) + Math.max(0, gesture.vy) * 120;
    if (gesture.dy > 64 || gesture.vy > 0.5 || projectedDistance > 92) {
      requestClose();
      return;
    }
    restoreSheet();
  }, [requestClose, restoreSheet]);

  const shouldCaptureDrag = useCallback((_, gesture) => !closingRef.current
    && gesture.dy > 3 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.15, []);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // Native Modal headers contain Text/Pressable descendants. Claim a real
    // downward drag during capture, before a child can consume the responder
    // event. No capture at touch-down: close buttons and other taps still work.
    onMoveShouldSetPanResponderCapture: shouldCaptureDrag,
    onMoveShouldSetPanResponder: shouldCaptureDrag,
    onPanResponderGrant: () => {
      const token=++drag.current.generation;
      drag.current.active=true; drag.current.origin=null; drag.current.distance=0;
      translateY.stopAnimation(value=>{
        if (!drag.current.active || token!==drag.current.generation || closingRef.current) return;
        drag.current.origin=value;
        translateY.setValue(Math.max(0,value+drag.current.distance));
      });
    },
    onPanResponderMove: (_, gesture) => {
      drag.current.distance=gesture.dy;
      if (!closingRef.current && drag.current.active && drag.current.origin!==null) translateY.setValue(Math.max(0,drag.current.origin+gesture.dy));
    },
    onPanResponderRelease: (_, gesture) => { drag.current.active=false; releaseDrag(gesture); },
    onPanResponderTerminate: () => { drag.current.active=false; restoreSheet(); },
    onPanResponderTerminationRequest: () => false,
  }), [releaseDrag, restoreSheet, shouldCaptureDrag, translateY]);

  const onSheetLayout = useCallback(event => { sheetHeight.current = event.nativeEvent.layout.height; }, []);
  return { translateY, requestClose, onSheetLayout, panHandlers: responder.panHandlers };
}
