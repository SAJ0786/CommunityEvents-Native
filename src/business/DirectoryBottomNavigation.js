import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, shadow, spacing } from '../theme';

const TABS = [
  { key: 'home', icon: 'home-variant', label: 'Home', color: '#176b87', soft: '#e5f5fb' },
  { key: 'promotions', icon: 'tag', label: 'Promotions', color: '#d88700', soft: '#fff4d8' },
  { key: 'add', icon: 'plus', label: 'Add Business', primary: true, color: colors.teal, soft: colors.tealSoft },
  { key: 'my-businesses', icon: 'briefcase', label: 'My Business', color: '#8a4dba', soft: '#f2e8fa' },
  { key: 'profile', icon: 'account-circle', label: 'Profile', color: '#c44764', soft: '#fdeaf0' },
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
            <View style={tab.primary ? styles.primaryIcon : [styles.iconWrap, { backgroundColor: tab.soft }]}>
              <MaterialCommunityIcons
                color={tab.primary ? colors.surface : tab.color}
                name={tab.icon}
                size={tab.primary ? 36 : 29}
              />
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
    minHeight: 82,
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
  activeTab: { backgroundColor: '#f6faf9' },
  primaryTab: { marginHorizontal: 2, marginTop: -18 },
  iconWrap: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
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
  label: { marginTop: 3, color: colors.muted, fontSize: 9, fontWeight: '900' },
  activeLabel: { color: colors.tealDark },
  primaryLabel: { marginTop: 4, color: colors.tealDark, fontWeight: '900' },
  pressed: { opacity: 0.72 },
});
