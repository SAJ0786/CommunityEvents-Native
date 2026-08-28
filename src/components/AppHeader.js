import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, radius, shadow, spacing } from '../theme';

const EVENT_AUTH_ITEMS = [
  { key: 'home', label: 'Home', icon: '\u{1F3E0}' },
  { key: 'calendar', label: 'Calendar', icon: '\u{1F4C5}', group: 'Calendar' },
  { key: 'hijri-calendar', label: 'Hijri Calendar', icon: '\u263E', group: 'Calendar' },
  { key: 'inbox', label: 'Inbox', icon: '\u{1F4E5}', group: 'Messages' },
  { key: 'feedback', label: 'Feedback', icon: '\u{1F4AC}', group: 'Messages' },
  { key: 'admin', label: 'Events Admin', icon: '\u{1F6E0}', group: 'Administration', adminOnly: true },
  { key: 'bulk_share', label: 'Bulk Share Events', icon: '\u{1F4E4}', group: 'Tools', adminOnly: true },
  { key: 'search', label: 'AI Search', icon: '\u{1F916}', group: 'Tools', disabled: true },
  { key: 'streams', label: 'Streamed Videos', icon: '\u25B6', group: 'Streams' },
];

const EVENT_GUEST_ITEMS = [
  { key: 'home', label: 'Home', icon: '\u{1F3E0}' },
  { key: 'calendar', label: 'Calendar', icon: '\u{1F4C5}', group: 'Calendar' },
  { key: 'hijri-calendar', label: 'Hijri Calendar', icon: '\u263E', group: 'Calendar' },
  { key: 'feedback', label: 'Feedback', icon: '\u{1F4AC}', group: 'Messages' },
  { key: 'search', label: 'AI Search', icon: '\u{1F916}', group: 'Tools', disabled: true },
  { key: 'streams', label: 'Streamed Videos', icon: '\u25B6', group: 'Streams' },
];

const BUSINESS_AUTH_ITEMS = [
  { key: 'business-home', label: 'Business Directory Home', icon: '\u{1F3EA}' },
  { key: 'business-favourites', label: 'Favourite Businesses', icon: '\u2764\uFE0F', group: 'Saved' },
  { key: 'business-admin', label: 'Business Settings', icon: '\u2699\uFE0F', group: 'Business Management', adminOnly: true },
  { key: 'business-inbox', label: 'Business Inbox', icon: '\u{1F4E5}', group: 'Messages' },
  { key: 'business-feedback', label: 'Business Feedback', icon: '\u{1F4CB}', group: 'Messages' },
  { key: 'business-report', label: 'Report a Business', icon: '\u{1F6A9}', group: 'Support' },
  { key: 'business-contact', label: 'Contact Us', icon: '\u{1F4AC}', group: 'Support' },
];

const BUSINESS_GUEST_ITEMS = [
  { key: 'business-home', label: 'Business Directory Home', icon: '\u{1F3EA}' },
  { key: 'business-feedback', label: 'Business Feedback', icon: '\u{1F4CB}', group: 'Messages' },
  { key: 'business-report', label: 'Report a Business', icon: '\u{1F6A9}', group: 'Support' },
  { key: 'business-contact', label: 'Contact Us', icon: '\u{1F4AC}', group: 'Support' },
];

const GROUP_LABELS = {
  Community: 'Explore Community',
  Calendar: 'Calendar',
  Messages: 'Inbox & Feedback',
  Administration: 'Administration',
  'Business Management': 'Business Management',
  Saved: 'Saved Businesses',
  Support: 'Help & Support',
  Tools: 'Share & Search',
  Streams: 'Streamed Videos',
};

const HEADER_TOP_PADDING = Platform.OS === 'android'
  ? (StatusBar.currentHeight || 0) + spacing.sm
  : spacing.md;

export default function AppHeader({
  activeTab,
  activeModule = 'events',
  isGuest = false,
  user,
  profile,
  logoSource,
  onNavigate,
  onModuleChange,
  onSignOut,
  authBusy = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [switcherWidth, setSwitcherWidth] = useState(0);
  const sliderPosition = useRef(new Animated.Value(activeModule === 'directory' ? 1 : 0)).current;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superAdmin';
  const displayName = profile?.fullName || user?.displayName || user?.email || '';
  const roleLabel = profile?.role === 'superAdmin'
    ? 'Super Admin'
    : profile?.role === 'admin'
      ? 'Admin'
      : 'User';

  const items = useMemo(() => {
    const source = activeModule === 'directory'
      ? (isGuest ? BUSINESS_GUEST_ITEMS : BUSINESS_AUTH_ITEMS)
      : (isGuest ? EVENT_GUEST_ITEMS : EVENT_AUTH_ITEMS);
    return source.filter(item => !item.adminOnly || isAdmin);
  }, [activeModule, isAdmin, isGuest]);

  const rows = useMemo(() => items.flatMap((item, index) => {
    const result = [];
    if (item.group && item.group !== items[index - 1]?.group) {
      result.push({ type: 'group', key: `group-${item.group}`, label: GROUP_LABELS[item.group] || item.group });
    }
    result.push({ type: 'item', key: item.key, item });
    return result;
  }), [items]);

  const handleNavigate = key => {
    setMenuOpen(false);
    onNavigate?.(key);
  };

  const activeKey = activeModule === 'directory'
    ? `business-${activeTab === 'home' ? 'home' : activeTab}`
    : activeTab === 'bulk_share' ? 'bulk_share' : activeTab;

  useEffect(() => {
    Animated.spring(sliderPosition, {
      toValue: activeModule === 'directory' ? 1 : 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 220,
      mass: 0.7,
    }).start();
  }, [activeModule, sliderPosition]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => (
      Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy)
    ),
    onPanResponderMove: (_, gesture) => {
      if (!switcherWidth) return;
      const halfWidth = Math.max(1, (switcherWidth - 6) / 2);
      const origin = activeModule === 'directory' ? 1 : 0;
      sliderPosition.setValue(Math.max(0, Math.min(1, origin + gesture.dx / halfWidth)));
    },
    onPanResponderRelease: (_, gesture) => {
      const nextModule = gesture.dx > 22
        ? 'directory'
        : gesture.dx < -22
          ? 'events'
          : activeModule;
      onModuleChange?.(nextModule);
      Animated.spring(sliderPosition, {
        toValue: nextModule === 'directory' ? 1 : 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 220,
        mass: 0.7,
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(sliderPosition, {
        toValue: activeModule === 'directory' ? 1 : 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 220,
        mass: 0.7,
      }).start();
    },
  }), [activeModule, onModuleChange, sliderPosition, switcherWidth]);

  const sliderTranslate = sliderPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(0, (switcherWidth - 6) / 2)],
  });
  const brandProduct = activeModule === 'directory' ? 'Businesses Australia' : 'Events Australia';

  return (
    <>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Menu"
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          {[0, 1, 2].map(index => <View key={index} style={styles.menuLine} />)}
        </Pressable>

        <View style={styles.brandWrap}>
          <Image source={logoSource} style={styles.logo} resizeMode="contain" />
          <View style={styles.brandTextWrap}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={[styles.brand, activeModule === 'directory' && styles.brandCompact]}>Community</Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={[styles.brand, activeModule === 'directory' && styles.brandCompact]}>{brandProduct}</Text>
          </View>
        </View>

        <View style={styles.rightSpacer} />
      </View>

      <View style={styles.moduleSwitcherWrap}>
        <View
          onLayout={event => setSwitcherWidth(event.nativeEvent.layout.width)}
          style={styles.moduleSwitcher}
          {...panResponder.panHandlers}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.moduleSlider,
              { width: Math.max(0, (switcherWidth - 6) / 2), transform: [{ translateX: sliderTranslate }] },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: activeModule === 'events' }}
            onPress={() => onModuleChange?.('events')}
            style={({ pressed }) => [
              styles.moduleButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.moduleIcon}>{'\u{1F4C5}'}</Text>
            <Text style={[styles.moduleLabel, activeModule === 'events' && styles.moduleLabelActive]}>Events</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: activeModule === 'directory' }}
            onPress={() => onModuleChange?.('directory')}
            style={({ pressed }) => [
              styles.moduleButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.moduleIcon}>{'\u{1F3EA}'}</Text>
            <Text style={[styles.moduleLabel, activeModule === 'directory' && styles.moduleLabelActive]}>Business Directory</Text>
          </Pressable>
        </View>
      </View>

      <Modal animationType="fade" transparent visible={menuOpen} onRequestClose={() => setMenuOpen(false)}>
        <SafeAreaView style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuShell} pointerEvents="box-none">
            <View style={styles.menuPanel}>
              <View style={styles.menuHeader}>
                {isGuest ? (
                  <>
                    <Text style={styles.menuUserTitle}>Guest User</Text>
                    <Text style={styles.menuUserSubtle}>Read-only access</Text>
                  </>
                ) : (
                  <>
                    <Text numberOfLines={2} style={styles.menuUserTitle}>{displayName}</Text>
                    {user?.email && displayName !== user.email ? (
                      <Text numberOfLines={1} style={styles.menuUserSubtle}>{user.email}</Text>
                    ) : null}
                    <View style={styles.rolePill}>
                      <Text style={styles.rolePillText}>{roleLabel}</Text>
                    </View>
                    <Pressable
                      accessibilityLabel={authBusy ? 'Signing out' : 'Log out'}
                      accessibilityRole="button"
                      disabled={authBusy}
                      hitSlop={8}
                      onPress={() => { setMenuOpen(false); onSignOut?.(); }}
                      style={({ pressed }) => [styles.identityLogout, pressed && styles.pressed, authBusy && styles.menuItemDisabled]}
                    >
                      {authBusy
                        ? <ActivityIndicator color={colors.surface} size="small" />
                        : <MaterialCommunityIcons color={colors.surface} name="power" size={27} />}
                    </Pressable>
                  </>
                )}
              </View>

              <ScrollView style={styles.menuList} contentContainerStyle={styles.menuListContent}>
                {rows.map(row => {
                  if (row.type === 'group') {
                    return <Text key={row.key} style={styles.groupLabel}>{row.label}</Text>;
                  }

                  const { item } = row;
                  const active = activeKey === item.key;
                  return (
                    <Pressable
                      key={row.key}
                      disabled={item.disabled}
                      onPress={() => handleNavigate(item.key)}
                      style={({ pressed }) => [
                        styles.menuItem,
                        active && styles.menuItemActive,
                        item.disabled && styles.menuItemDisabled,
                        pressed && !item.disabled && styles.pressed,
                      ]}
                    >
                      <View style={styles.menuItemContent}>
                        <View style={[
                          styles.menuIconWrap,
                          item.key === 'streams' && styles.youtubeMenuIcon,
                          item.key === 'hijri-calendar' && styles.hijriMenuIcon,
                          active && styles.menuIconWrapActive,
                        ]}>
                          <Text style={[styles.menuIcon, item.key === 'streams' && styles.specialMenuIcon, item.key === 'hijri-calendar' && styles.hijriMenuIconText]}>{item.icon}</Text>
                        </View>
                        <Text style={[
                          styles.menuItemText,
                          active && styles.menuItemTextActive,
                          item.disabled && styles.menuItemTextDisabled,
                        ]}
                        >
                          {item.label}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {isGuest ? (
                <Pressable
                  onPress={() => handleNavigate('login')}
                  style={({ pressed }) => [styles.footerButton, styles.loginButton, pressed && styles.pressed]}
                >
                  <Text style={styles.loginButtonText}>Login / Create Account</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: HEADER_TOP_PADDING,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 0,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  menuLine: {
    width: 18,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.tealDark,
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  logo: {
    width: 46,
    height: 46,
  },
  brandTextWrap: { minWidth: 0 },
  brand: {
    color: colors.navy,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  brandCompact: { fontSize: 18, lineHeight: 21 },
  rightSpacer: {
    width: 42,
    height: 42,
  },
  youtubeMenuIcon: { backgroundColor: '#ff0000', borderColor: '#ff0000' },
  hijriMenuIcon: { backgroundColor: '#5b3fb5', borderColor: '#5b3fb5' },
  specialMenuIcon: { color: '#ffffff' },
  hijriMenuIconText: { color: '#ffd66b' },
  moduleSwitcherWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadow,
  },
  moduleSwitcher: {
    position: 'relative',
    minHeight: 42,
    flexDirection: 'row',
    padding: 3,
    borderRadius: 14,
    backgroundColor: '#eef4f3',
  },
  moduleSlider: {
    position: 'absolute',
    left: 3,
    top: 3,
    bottom: 3,
    borderRadius: 11,
    backgroundColor: colors.surface,
    ...shadow,
  },
  moduleButton: {
    flex: 1,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: spacing.sm,
    borderRadius: 11,
  },
  moduleIcon: {
    fontSize: 15,
  },
  moduleLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  moduleLabelActive: {
    color: colors.tealDark,
    fontWeight: '900',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(8, 18, 28, 0.18)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  menuShell: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingTop: HEADER_TOP_PADDING + 58,
    paddingHorizontal: spacing.lg,
  },
  menuPanel: {
    width: 290,
    maxWidth: '92%',
    maxHeight: '82%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow,
  },
  menuHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.tealSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuUserTitle: {
    color: colors.tealDark,
    fontSize: 14,
    fontWeight: '900',
  },
  menuUserSubtle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  rolePill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: '#b7d8d4',
    backgroundColor: colors.surface,
  },
  rolePillText: {
    color: colors.tealDark,
    fontSize: 11,
    fontWeight: '900',
  },
  menuList: {
    flexGrow: 0,
  },
  menuListContent: {
    paddingVertical: spacing.sm,
  },
  groupLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  menuItem: {
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f4',
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  menuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealSoft,
  },
  menuIconWrapActive: {
    backgroundColor: '#cdeee7',
  },
  menuIcon: {
    fontSize: 16,
  },
  menuItemActive: {
    backgroundColor: colors.tealSoft,
  },
  menuItemDisabled: {
    opacity: 0.45,
  },
  menuItemText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  menuItemTextActive: {
    color: colors.tealDark,
    fontWeight: '900',
  },
  menuItemTextDisabled: {
    color: colors.muted,
  },
  footerButton: {
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  loginButton: {
    backgroundColor: colors.tealSoft,
  },
  loginButtonText: {
    color: colors.tealDark,
    fontSize: 14,
    fontWeight: '900',
  },
  logoutButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: '#fff1f0' },
  identityLogout: {
    position: 'absolute', top: spacing.sm, right: spacing.sm,
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#991b1b', borderRadius: 22,
    backgroundColor: '#dc2626', ...shadow,
  },
  pressed: {
    opacity: 0.78,
  },
});
