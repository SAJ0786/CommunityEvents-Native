import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, shadow, spacing } from '../theme';

const TABS = [
  { key: 'home', icon: '\u{1F3E0}', label: 'Home' },
  { key: 'my_events', icon: '\u{1F4C5}', label: 'My Events', restricted: true },
  { key: 'create', icon: '+', label: 'Add Event', restricted: true, primary: true },
  { key: 'favourites', icon: '\u2764\uFE0F', label: 'Favourites', restricted: true },
  { key: 'profile', icon: '\u{1F464}', label: 'Profile' },
];

export default function BottomNavigation({ activeTab, onChange, isGuest = false }) {
  return (
    <View style={styles.navigation} accessibilityRole="tablist">
      {TABS.map(tab => {
        const active = tab.key === activeTab;
        const disabled = isGuest && tab.restricted;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [
              styles.tab,
              active && styles.activeTab,
              tab.primary && styles.primaryTab,
              disabled && styles.disabledTab,
              pressed && styles.pressed,
            ]}
          >
            <Text
              maxFontSizeMultiplier={1}
              style={[
                styles.icon,
                active && styles.activeIcon,
                tab.primary && styles.primaryIcon,
                tab.primary && !disabled && styles.primaryIconEnabled,
              ]}
            >
              {tab.icon}
            </Text>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
              style={[
                styles.label,
                active && styles.activeLabel,
                tab.primary && styles.primaryLabel,
                tab.primary && disabled && styles.primaryLabelDisabled,
              ]}
            >
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
    minHeight: 76,
    paddingHorizontal: spacing.xs,
    paddingTop: 6,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 2,
  },
  activeTab: { backgroundColor: colors.tealSoft },
  primaryTab: {
    marginHorizontal: 2,
    marginTop: -18,
  },
  disabledTab: { opacity: 0.35 },
  icon: { color: colors.muted, fontSize: 19, fontWeight: '900', lineHeight: 22 },
  activeIcon: { color: colors.tealDark },
  primaryIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    color: colors.surface,
    backgroundColor: '#9bb8b4',
    textAlign: 'center',
    lineHeight: 48,
    fontSize: 34,
    borderWidth: 4,
    borderColor: colors.surface,
    ...shadow,
  },
  primaryIconEnabled: {
    backgroundColor: colors.teal,
  },
  label: { color: colors.muted, fontSize: 9.5, fontWeight: '800', marginTop: 2 },
  activeLabel: { color: colors.tealDark },
  primaryLabel: {
    marginTop: 4,
    color: colors.tealDark,
    fontWeight: '900',
  },
  primaryLabelDisabled: {
    color: '#b6c6c4',
  },
  pressed: { opacity: 0.7 },
});
