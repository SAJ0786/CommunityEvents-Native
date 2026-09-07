import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, shadow, spacing } from '../theme';
import { userInitials } from '../components/AccountMenuSheet';

const TABS = [
  { key: 'home', icon: 'home-variant', label: 'Home', color: '#176b87', soft: '#e5f5fb' },
  { key: 'promotions', icon: 'tag', label: 'Promotions', color: '#d88700', soft: '#fff4d8' },
  { key: 'add', icon: 'plus', label: 'Add Business', primary: true, color: colors.blue, soft: colors.blueSoft },
  { key: 'my-businesses', icon: 'briefcase', label: 'My Business', color: '#8a4dba', soft: '#f2e8fa' },
  { key: 'profile', icon: 'account-circle', label: 'Menu', color: '#7357d9', soft: '#eef0ff' },
];

export default function DirectoryBottomNavigation({ activeTab, onChange, onOpenMenu, user, profile, isGuest = false }) {
  return (
    <View accessibilityRole="tablist" style={styles.navigation}>
      {TABS.map(tab => {
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => tab.key === 'profile' ? onOpenMenu?.() : onChange?.(tab.key)}
            style={({ pressed }) => [
              styles.tab,
              active && styles.activeTab,
              tab.primary && styles.primaryTab,
              pressed && styles.pressed,
            ]}
          >
            <View style={tab.primary ? styles.primaryIcon : [styles.iconWrap, { backgroundColor: tab.key === 'profile' && !isGuest ? tab.color : tab.soft }]}>
              {tab.key === 'profile' ? <Text style={[styles.initialsText, isGuest && styles.guestInitials]}>{isGuest ? 'G' : userInitials(user, profile)}</Text> : <MaterialCommunityIcons color={tab.primary ? colors.surface : tab.color} name={tab.icon} size={tab.primary ? 28 : 23} />}
            </View>
            <Text numberOfLines={1} maxFontSizeMultiplier={1} style={[
              styles.label,
              active && styles.activeLabel,
              tab.primary && styles.primaryLabel,
              !tab.primary && { color: tab.color },
            ]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  navigation: {
    minHeight: 66,
    marginHorizontal: 12,
    marginBottom: 7,
    flexDirection: 'row',
    paddingHorizontal: spacing.xs,
    paddingTop: 5,
    paddingBottom: 6,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.91)',
    ...shadow,
    zIndex: 100,
    elevation: 100,
  },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 2 },
  activeTab: { backgroundColor: 'rgba(232,240,255,0.72)' },
  primaryTab: { marginHorizontal: 2, marginTop: -15 },
  iconWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  primaryIcon: {
    width: 50,
    height: 50,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: colors.surface,
    borderRadius: 25,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  label: { marginTop: 2, color: colors.muted, fontSize: 8.5, fontWeight: '600' },
  activeLabel: { color: colors.blueDark, fontWeight: '700' },
  primaryLabel: { marginTop: 4, color: colors.blueDark, fontWeight: '700' },
  initialsText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  guestInitials: { color: colors.purple },
  pressed: { opacity: 0.72 },
});
