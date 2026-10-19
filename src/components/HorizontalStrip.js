import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '../theme';
import { stripBounds } from '../utils/horizontalStrip';

export default forwardRef(function HorizontalStrip({ children, style, accessibilityLabel = 'Options', onLayout, onContentSizeChange, onScroll, equalItems = false, minimumItemWidth = 65, ...props }, forwardedRef) {
  const scroll = useRef(null);
  const [layout, setLayout] = useState({ width: 0, content: 0, offset: 0 });
  useImperativeHandle(forwardedRef, () => scroll.current);
  const items = equalItems ? React.Children.toArray(children) : null;
  const minimumContent = items ? items.length * minimumItemWidth + Math.max(0, items.length - 1) * 4 : layout.content;
  const bounds = stripBounds(layout.width, minimumContent, layout.offset);
  const itemWidth = items && !bounds.overflow && layout.width > 0
    ? Math.max(minimumItemWidth, (layout.width - Math.max(0, items.length - 1) * 4) / items.length) : minimumItemWidth;
  const renderedChildren = items ? items.map(child => React.cloneElement(child, {
    style: typeof child.props.style === 'function'
      ? state => [child.props.style(state), { width: itemWidth }]
      : [child.props.style, { width: itemWidth }],
  })) : children;
  const move = direction => scroll.current?.scrollTo({ x: Math.max(0, Math.min(bounds.maximum, bounds.position + direction * bounds.distance)), animated: true });
  return <View style={[styles.shell, style]} onLayout={event => {
    const width = event.nativeEvent.layout.width;
    setLayout(current => current.width === width ? current : { ...current, width });
    onLayout?.(event);
  }}>
    <ScrollView {...props} ref={scroll} horizontal directionalLockEnabled alwaysBounceVertical={false}
      contentInsetAdjustmentBehavior="never" showsHorizontalScrollIndicator={false}
      accessibilityLabel={accessibilityLabel} style={[styles.viewport, bounds.overflow && styles.gutters]}
      contentContainerStyle={[props.contentContainerStyle, !bounds.overflow && styles.spreadContent, equalItems && styles.equalContent]}
      scrollEventThrottle={16} onContentSizeChange={(width, height) => {
        setLayout(current => current.content === width ? current : { ...current, content: width });
        onContentSizeChange?.(width, height);
      }} onScroll={event => {
        const offset = event.nativeEvent.contentOffset.x;
        setLayout(current => current.offset === offset ? current : { ...current, offset });
        onScroll?.(event);
      }}>{renderedChildren}</ScrollView>
    {bounds.previous && <Pressable accessibilityRole="button" accessibilityLabel={`Scroll left: ${accessibilityLabel}`} onPress={() => move(-1)} style={[styles.edge, styles.left]}><MaterialCommunityIcons name="chevron-left" size={24} color={colors.tealDark}/></Pressable>}
    {bounds.next && <Pressable accessibilityRole="button" accessibilityLabel={`Scroll right: ${accessibilityLabel}`} onPress={() => move(1)} style={[styles.edge, styles.right]}><MaterialCommunityIcons name="chevron-right" size={24} color={colors.tealDark}/></Pressable>}
  </View>;
});
const styles = StyleSheet.create({
  shell: { minWidth: 0, flexShrink: 1 }, viewport: { minWidth: 0, flexGrow: 0 },
  equalContent: { gap: 4, paddingLeft: 0, paddingRight: 0 },
  spreadContent: { flexGrow: 1, justifyContent: 'space-between' },
  gutters: { marginHorizontal: 28 },
  edge: { position: 'absolute', top: '50%', marginTop: -22, height: 44, width: 28, minHeight: 44, zIndex: 1, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  left: { left: 0 }, right: { right: 0 },
});
