import React, { forwardRef } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// Native Modal roots have their own window bounds. Measure there instead of
// reusing the main screen's inset or adding a guessed navigation-bar height.
export default forwardRef(function ModalSafeArea(props, ref) {
  return <SafeAreaProvider style={{ flex: 1 }}><SafeAreaView {...props} ref={ref} /></SafeAreaProvider>;
});
