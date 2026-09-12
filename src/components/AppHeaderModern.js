import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Platform, Pressable, StyleSheet, StatusBar, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, radius, shadow, spacing } from '../theme';

const HEADER_TOP_PADDING = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 4 : spacing.sm;

export default function AppHeaderModern({ activeModule = 'events', logoSource, onModuleChange, notificationUnreadCount = 0, onOpenNotifications }) {
  const [switcherWidth, setSwitcherWidth] = useState(0);
  const sliderPosition = useRef(new Animated.Value(activeModule === 'directory' ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(sliderPosition, { toValue: activeModule === 'directory' ? 1 : 0, useNativeDriver: true, damping: 20, stiffness: 220, mass: 0.7 }).start();
  }, [activeModule, sliderPosition]);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => {
      if (!switcherWidth) return;
      const halfWidth = Math.max(1, (switcherWidth - 6) / 2);
      sliderPosition.setValue(Math.max(0, Math.min(1, (activeModule === 'directory' ? 1 : 0) + gesture.dx / halfWidth)));
    },
    onPanResponderRelease: (_, gesture) => onModuleChange?.(gesture.dx > 22 ? 'directory' : gesture.dx < -22 ? 'events' : activeModule),
  }), [activeModule, onModuleChange, sliderPosition, switcherWidth]);
  const translateX = sliderPosition.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, (switcherWidth - 6) / 2)] });
  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <View style={styles.brandMark}><Image source={logoSource} style={styles.logo} resizeMode="contain" /></View>
        <View style={styles.brandCopy}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={styles.brand}>COMMUNITY CONNECT</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={styles.moduleTitle}>{activeModule === 'directory' ? 'Community Businesses Australia' : 'Community Events Australia'}</Text>
        </View>
        <Pressable accessibilityLabel="Open notifications" accessibilityRole="button" onPress={onOpenNotifications} style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons color={colors.blue} name={notificationUnreadCount ? 'bell' : 'bell-outline'} size={23} />
          {notificationUnreadCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{notificationUnreadCount > 99 ? '99+' : notificationUnreadCount}</Text></View> : null}
        </Pressable>
      </View>
      <View onLayout={event => setSwitcherWidth(event.nativeEvent.layout.width)} style={styles.switcher} {...panResponder.panHandlers}>
        <Animated.View pointerEvents="none" style={[styles.slider, { width: Math.max(0, (switcherWidth - 6) / 2), transform: [{ translateX }] }]} />
        <Pressable accessibilityLabel="Community Events" onPress={() => onModuleChange?.('events')} style={styles.button}>
          <View style={styles.iconFrame}><Text allowFontScaling={false} style={styles.icon}>📅</Text></View>
          <Text adjustsFontSizeToFit maxFontSizeMultiplier={1.15} minimumFontScale={0.78} numberOfLines={1} style={[styles.label, activeModule === 'events' && styles.labelActive]}>Events</Text>
        </Pressable>
        <Pressable accessibilityLabel="Community Business Directory" onPress={() => onModuleChange?.('directory')} style={styles.button}>
          <View style={styles.iconFrame}><Text allowFontScaling={false} style={styles.icon}>🏬</Text></View>
          <Text adjustsFontSizeToFit maxFontSizeMultiplier={1.15} minimumFontScale={0.68} numberOfLines={1} style={[styles.label, activeModule === 'directory' && styles.labelActive]}>Business Directory</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { paddingTop: HEADER_TOP_PADDING, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: 'rgba(250,253,252,0.94)', borderBottomWidth: 1, borderBottomColor: colors.glassBorder, ...shadow },
  header: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  brandMark: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 15, borderWidth: 1, borderColor: '#d9e5ff', backgroundColor: colors.blueSoft, transform: [{ rotate: '-2deg' }] },
  logo: { width: 35, height: 35, transform: [{ rotate: '2deg' }] },
  brandCopy: { flex: 1, minWidth: 0 },
  brand: { color: colors.muted, fontSize: 9.5, lineHeight: 12, letterSpacing: 1, fontWeight: '700' },
  moduleTitle: { marginTop: 2, color: colors.navy, fontSize: 17, lineHeight: 20, letterSpacing: -0.35, fontWeight: '700' },
  bellButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.blueSoft },
  badge: { position: 'absolute', right: -2, top: -2, minWidth: 17, height: 17, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: colors.rose },
  badgeText: { color: colors.surface, fontSize: 8, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  switcher: { position: 'relative', minHeight: 43, flexDirection: 'row', padding: 3, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 17, backgroundColor: 'rgba(228,238,236,0.72)' },
  slider: { position: 'absolute', left: 3, top: 3, bottom: 3, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.96)', ...shadow },
  button: { flex: 1, minWidth: 0, minHeight: 37, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 4, overflow: 'hidden' },
  iconFrame: { width: 22, height: 22, flexShrink: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  icon: { width: 22, height: 22, color: colors.navy, fontSize: 15, lineHeight: 20, textAlign: 'center', includeFontPadding: false },
  label: { minWidth: 0, flexShrink: 1, color: '#7b848c', fontSize: 11.5, fontWeight: '600' },
  labelActive: { color: colors.blue, fontWeight: '700' },
});
