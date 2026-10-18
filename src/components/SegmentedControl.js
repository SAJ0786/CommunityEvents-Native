import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, radius, shadow, spacing, typography } from '../theme';

export default function SegmentedControl({ value, options, onChange, label = 'Choose view' }) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex(item => item.value === value));
  const position = useRef(new Animated.Value(index)).current;
  const animate = next => Animated.spring(position, { toValue: next, useNativeDriver: true, damping: 20, stiffness: 220, mass: 0.7 }).start();
  useEffect(() => { animate(index); }, [index]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => position.setValue(Math.max(0, Math.min(options.length - 1, index + gesture.dx / Math.max(1, width / options.length)))),
    onPanResponderRelease: (_, gesture) => { const next = Math.max(0, Math.min(options.length - 1, index + (gesture.dx > 22 ? 1 : gesture.dx < -22 ? -1 : 0))); onChange?.(options[next].value); animate(next); },
    onPanResponderTerminate: () => animate(index),
  }), [index, width, options, onChange]);
  const itemWidth = Math.max(0, (width - spacing.xs * 2) / options.length);
  return <View accessibilityRole="tablist" accessibilityLabel={label} onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.track} {...pan.panHandlers}>
    <Animated.View pointerEvents="none" style={[styles.slider, { width: itemWidth, transform: [{ translateX: position.interpolate({ inputRange: [0, Math.max(1, options.length - 1)], outputRange: [0, itemWidth * Math.max(1, options.length - 1)] }) }] }]} />
    {options.map(item => <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: value === item.value }} onPress={() => onChange?.(item.value)} style={styles.option}>
      {item.icon && <MaterialCommunityIcons name={item.icon} color={value === item.value ? colors.tealDark : colors.muted} size={20} />}
      <Text style={[styles.label, value === item.value && styles.active]}>{item.label}</Text>
    </Pressable>)}
  </View>;
}
const styles = StyleSheet.create({
  track: { position: 'relative', flexDirection: 'row', padding: spacing.xs, borderRadius: radius.md, backgroundColor: colors.tealSoft, borderWidth: 1, borderColor: colors.border },
  slider: { position: 'absolute', left: spacing.xs, top: spacing.xs, bottom: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow },
  option: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  label: { flexShrink: 1, color: colors.muted, ...typography.body, textAlign: 'center' }, active: { color: colors.tealDark, fontWeight: '700' },
});
