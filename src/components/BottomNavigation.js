import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, shadow, spacing } from '../theme';

const TABS = [
  { key: 'home', icon: 'home-outline', label: 'Home' },
  { key: 'my_events', icon: 'calendar-outline', label: 'My Events', restricted: true },
  { key: 'create', icon: 'plus', label: 'Add Event', restricted: true, primary: true },
  { key: 'favourites', icon: 'heart-outline', label: 'Favourites', restricted: true },
  { key: 'profile', icon: 'account-outline', label: 'Profile' },
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
            <View style={[
              tab.primary ? styles.primaryIcon : styles.iconWrap,
              tab.primary && !disabled && styles.primaryIconEnabled,
            ]}>
              <MaterialCommunityIcons
                color={tab.primary ? colors.surface : active ? colors.tealDark : colors.muted}
                name={tab.icon}
                size={tab.primary ? 34 : 23}
              />
            </View>
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
  iconWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  primaryIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    backgroundColor: '#9bb8b4',
    alignItems: 'center',
    justifyContent: 'center',
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
