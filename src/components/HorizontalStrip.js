import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '../theme';
import { stripBounds } from '../utils/horizontalStrip';

export default forwardRef(function HorizontalStrip({ children, style, accessibilityLabel = 'Options', onLayout, onContentSizeChange, onScroll, ...props }, forwardedRef) {
  const scroll = useRef(null);
  const [layout, setLayout] = useState({ width: 0, content: 0, offset: 0 });
  useImperativeHandle(forwardedRef, () => scroll.current);
  const bounds = stripBounds(layout.width, layout.content, layout.offset);
  const move = direction => scroll.current?.scrollTo({ x: Math.max(0, Math.min(bounds.maximum, bounds.position + direction * bounds.distance)), animated: true });
  return <View style={[styles.shell, style]} onLayout={event => {
    const width = event.nativeEvent.layout.width;
    setLayout(current => current.width === width ? current : { ...current, width });
    onLayout?.(event);
  }}>
    <ScrollView {...props} ref={scroll} horizontal directionalLockEnabled alwaysBounceVertical={false}
      contentInsetAdjustmentBehavior="never" showsHorizontalScrollIndicator={false}
      accessibilityLabel={accessibilityLabel} style={[styles.viewport, bounds.overflow && styles.gutters]}
      scrollEventThrottle={16} onContentSizeChange={(width, height) => {
        setLayout(current => current.content === width ? current : { ...current, content: width });
        onContentSizeChange?.(width, height);
      }} onScroll={event => {
        const offset = event.nativeEvent.contentOffset.x;
        setLayout(current => current.offset === offset ? current : { ...current, offset });
        onScroll?.(event);
      }}>{children}</ScrollView>
    {bounds.previous && <Pressable accessibilityRole="button" accessibilityLabel={`Scroll left: ${accessibilityLabel}`} onPress={() => move(-1)} style={[styles.edge, styles.left]}><MaterialCommunityIcons name="chevron-left" size={24} color={colors.tealDark}/></Pressable>}
    {bounds.next && <Pressable accessibilityRole="button" accessibilityLabel={`Scroll right: ${accessibilityLabel}`} onPress={() => move(1)} style={[styles.edge, styles.right]}><MaterialCommunityIcons name="chevron-right" size={24} color={colors.tealDark}/></Pressable>}
  </View>;
});
const styles = StyleSheet.create({
  shell: { minWidth: 0, flexShrink: 1 }, viewport: { minWidth: 0, flexGrow: 0 },
  gutters: { marginHorizontal: 44 },
  edge: { position: 'absolute', top: 0, bottom: 0, width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  left: { left: 0 }, right: { right: 0 },
});
