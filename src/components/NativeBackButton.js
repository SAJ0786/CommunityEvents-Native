import React from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '../theme';

/** One consistent, platform-native back affordance for every in-app screen. */
export default function NativeBackButton({ onPress, accessibilityLabel = 'Back', style, color = colors.navy }) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.button, style, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons
        color={color}
        name={Platform.OS === 'ios' ? 'chevron-left' : 'arrow-left'}
        size={Platform.OS === 'ios' ? 32 : 25}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  pressed: { opacity: 0.55 },
});
