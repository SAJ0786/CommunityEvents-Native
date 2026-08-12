import React, { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

const AUTH_ITEMS = [
  { key: 'home', label: 'Home', icon: '\u{1F3E0}' },
  { key: 'calendar', label: 'Calendar', icon: '\u{1F4C5}', group: 'Calendar' },
  { key: 'hijri-calendar', label: 'Hijri Calendar', icon: '\u{1F319}', group: 'Calendar' },
  { key: 'inbox', label: 'Inbox', icon: '\u{1F4E5}', group: 'Messages' },
  { key: 'feedback', label: 'Feedback', icon: '\u{1F4AC}', group: 'Messages' },
  { key: 'admin', label: 'Admin Dashboard', icon: '\u{1F6E0}', group: 'Account', adminOnly: true },
  { key: 'profile', label: 'Profile & Settings', icon: '\u{1F464}', group: 'Account' },
  { key: 'bulk_share', label: 'Bulk Share Events', icon: '\u{1F4E4}', group: 'Tools', adminOnly: true },
  { key: 'search', label: 'AI Search', icon: '\u{1F916}', group: 'Tools', disabled: true },
  { key: 'streams', label: 'Streamed Videos', icon: '\u25B6', group: 'Streams' },
];

const GUEST_ITEMS = [
  { key: 'home', label: 'Home', icon: '\u{1F3E0}' },
  { key: 'calendar', label: 'Calendar', icon: '\u{1F4C5}', group: 'Calendar' },
  { key: 'hijri-calendar', label: 'Hijri Calendar', icon: '\u{1F319}', group: 'Calendar' },
  { key: 'feedback', label: 'Feedback', icon: '\u{1F4AC}', group: 'Messages' },
  { key: 'admin', label: 'Admin Dashboard', icon: '\u{1F6E0}', group: 'Account', disabled: true },
  { key: 'profile', label: 'Profile & Settings', icon: '\u{1F464}', group: 'Account', disabled: true },
  { key: 'bulk_share', label: 'Bulk Share Events', icon: '\u{1F4E4}', group: 'Tools', disabled: true },
  { key: 'search', label: 'AI Search', icon: '\u{1F916}', group: 'Tools', disabled: true },
  { key: 'streams', label: 'Streamed Videos', icon: '\u25B6', group: 'Streams' },
];

const GROUP_LABELS = {
  Calendar: 'Calendar',
  Messages: 'Inbox & Feedback',
  Account: 'Admin & Profile',
  Tools: 'Share & Search',
  Streams: 'Streamed Videos',
};

const HEADER_TOP_PADDING = Platform.OS === 'android'
  ? (StatusBar.currentHeight || 0) + spacing.sm
  : spacing.md;

export default function AppHeader({
  activeTab,
  isGuest = false,
  user,
  profile,
  logoSource,
  onNavigate,
  onSignOut,
  authBusy = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superAdmin';
  const displayName = profile?.fullName || user?.displayName || user?.email || '';
  const roleLabel = profile?.role === 'superAdmin'
    ? 'Super Admin'
    : profile?.role === 'admin'
      ? 'Admin'
      : 'User';

  const items = useMemo(() => {
    const source = isGuest ? GUEST_ITEMS : AUTH_ITEMS;
    return source.filter(item => !item.adminOnly || isAdmin);
  }, [isAdmin, isGuest]);

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

  const activeKey = activeTab === 'bulk_share' ? 'bulk_share' : activeTab;

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
          <View>
            <Text style={styles.brand}>Community</Text>
            <Text style={styles.brand}>Events Australia</Text>
          </View>
        </View>

        <View style={styles.rightSpacer} />
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
                        <View style={[styles.menuIconWrap, active && styles.menuIconWrapActive]}>
                          <Text style={styles.menuIcon}>{item.icon}</Text>
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
                  onPress={() => handleNavigate('profile')}
                  style={({ pressed }) => [styles.footerButton, styles.loginButton, pressed && styles.pressed]}
                >
                  <Text style={styles.loginButtonText}>Login / Create Account</Text>
                </Pressable>
              ) : (
                <Pressable
                  disabled={authBusy}
                  onPress={() => {
                    setMenuOpen(false);
                    onSignOut?.();
                  }}
                  style={({ pressed }) => [styles.footerButton, pressed && styles.pressed, authBusy && styles.menuItemDisabled]}
                >
                  <Text style={styles.footerButtonText}>{authBusy ? 'Signing out...' : 'Logout'}</Text>
                </Pressable>
              )}
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadow,
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
    gap: spacing.md,
    flex: 1,
    minWidth: 0,
  },
  logo: {
    width: 50,
    height: 50,
  },
  brand: {
    color: colors.navy,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  rightSpacer: {
    width: 42,
    height: 42,
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
  footerButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.78,
  },
});
