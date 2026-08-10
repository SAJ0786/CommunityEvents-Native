import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, shadow, spacing } from '../theme';

const TABS = [
  { key: 'home', label: 'Home' },
  { key: 'profile', label: 'Profile' },
];

export default function BottomNavigation({ activeTab, onChange }) {
  return (
    <View style={styles.navigation} accessibilityRole="tablist">
      {TABS.map(tab => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [
              styles.tab,
              active && styles.activeTab,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.indicator, active && styles.activeIndicator]} />
            <Text maxFontSizeMultiplier={1.2} style={[styles.label, active && styles.activeLabel]}>
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
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  activeTab: {
    backgroundColor: colors.tealSoft,
  },
  indicator: {
    width: 22,
    height: 3,
    marginBottom: 5,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  activeIndicator: {
    backgroundColor: colors.teal,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  activeLabel: {
    color: colors.tealDark,
  },
  pressed: {
    opacity: 0.7,
  },
});
