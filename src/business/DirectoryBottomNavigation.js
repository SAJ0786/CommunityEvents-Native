import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, shadow, spacing } from '../theme';

const TABS = [
  { key: 'home', icon: 'home-outline', label: 'Home' },
  { key: 'promotions', icon: 'tag-outline', label: 'Promotions' },
  { key: 'add', icon: 'plus', label: 'Add Business', primary: true },
  { key: 'my-businesses', icon: 'briefcase-outline', label: 'My Business' },
  { key: 'profile', icon: 'account-outline', label: 'Profile' },
];

export default function DirectoryBottomNavigation({ activeTab, onChange }) {
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
            onPress={() => onChange?.(tab.key)}
            style={({ pressed }) => [
              styles.tab,
              active && styles.activeTab,
              tab.primary && styles.primaryTab,
              pressed && styles.pressed,
            ]}
          >
            <View style={tab.primary ? styles.primaryIcon : styles.iconWrap}>
              <MaterialCommunityIcons
                color={tab.primary ? colors.surface : active ? colors.tealDark : colors.muted}
                name={tab.icon}
                size={tab.primary ? 34 : 23}
              />
            </View>
            <Text numberOfLines={1} maxFontSizeMultiplier={1} style={[
              styles.label,
              active && styles.activeLabel,
              tab.primary && styles.primaryLabel,
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
    minHeight: 76,
    flexDirection: 'row',
    paddingHorizontal: spacing.xs,
    paddingTop: 6,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow,
  },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 2 },
  activeTab: { backgroundColor: colors.tealSoft },
  primaryTab: { marginHorizontal: 2, marginTop: -18 },
  iconWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  primaryIcon: {
    width: 54,
    height: 54,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: colors.surface,
    borderRadius: 27,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  label: { marginTop: 2, color: colors.muted, fontSize: 9, fontWeight: '800' },
  activeLabel: { color: colors.tealDark },
  primaryLabel: { marginTop: 4, color: colors.tealDark, fontWeight: '900' },
  pressed: { opacity: 0.72 },
});
