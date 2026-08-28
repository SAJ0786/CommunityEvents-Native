import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, shadow, spacing } from '../theme';

const TABS = [
  { key: 'home', icon: 'home-variant', label: 'Home', color: '#176b87', soft: '#e5f5fb' },
  { key: 'my_events', icon: 'calendar-month', label: 'My Events', restricted: true, color: '#8a4dba', soft: '#f2e8fa' },
  { key: 'create', icon: 'plus', label: 'Add Event', restricted: true, primary: true },
  { key: 'favourites', icon: 'heart', label: 'Favourites', restricted: true, color: '#d43867', soft: '#fdeaf0' },
  { key: 'profile', icon: 'account-circle', label: 'Profile', color: '#c44764', soft: '#fdeaf0' },
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
              tab.primary ? styles.primaryIcon : [styles.iconWrap, { backgroundColor: tab.soft }],
              tab.primary && !disabled && styles.primaryIconEnabled,
            ]}>
              <MaterialCommunityIcons
                color={tab.primary ? colors.surface : tab.color}
                name={tab.icon}
                size={tab.primary ? 36 : 29}
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
                !tab.primary && { color: tab.color },
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
    minHeight: 82,
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
  activeTab: { backgroundColor: '#f6faf9' },
  primaryTab: {
    marginHorizontal: 2,
    marginTop: -18,
  },
  disabledTab: { opacity: 0.35 },
  iconWrap: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
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
  label: { color: colors.muted, fontSize: 9, fontWeight: '900', marginTop: 3 },
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
