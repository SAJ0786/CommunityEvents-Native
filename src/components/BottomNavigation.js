import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, shadow, spacing } from '../theme';
import { userInitials } from './AccountMenuSheet';

const TABS = [
  { key: 'home', icon: 'home-variant', label: 'Home', color: '#176b87', soft: '#e5f5fb' },
  { key: 'my_events', icon: 'calendar-month', label: 'My Events', restricted: true, color: '#8a4dba', soft: '#f2e8fa' },
  { key: 'create', icon: 'plus', label: 'Add Event', restricted: true, primary: true },
  { key: 'favourites', icon: 'heart', label: 'Favourites', restricted: true, color: '#d43867', soft: '#fdeaf0' },
  { key: 'profile', icon: 'account-circle', label: 'Menu', color: '#7357d9', soft: '#eef0ff' },
];

export default function BottomNavigation({ activeTab, onChange, onOpenMenu, user, profile, isGuest = false }) {
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
            onPress={() => tab.key === 'profile' ? onOpenMenu?.() : onChange(tab.key)}
            style={({ pressed }) => [
              styles.tab,
              active && styles.activeTab,
              tab.primary && styles.primaryTab,
              disabled && styles.disabledTab,
              pressed && styles.pressed,
            ]}
          >
            <View style={[
              tab.primary ? styles.primaryIcon : [styles.iconWrap, { backgroundColor: tab.key === 'profile' && !isGuest ? tab.color : tab.soft }],
              tab.primary && !disabled && styles.primaryIconEnabled,
            ]}>
              {tab.key === 'profile' ? <Text style={[styles.initialsText, isGuest && styles.guestInitials]}> {isGuest ? 'G' : userInitials(user, profile)}</Text> : <MaterialCommunityIcons color={tab.primary ? colors.surface : tab.color} name={tab.icon} size={tab.primary ? 28 : 23} />}
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
    minHeight: 66,
    marginHorizontal: 12,
    marginBottom: 7,
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
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 2,
  },
  activeTab: { backgroundColor: 'rgba(232,240,255,0.72)' },
  primaryTab: {
    marginHorizontal: 2,
    marginTop: -15,
  },
  disabledTab: { opacity: 0.35 },
  iconWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  primaryIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    backgroundColor: '#9bb8b4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.surface,
    ...shadow,
  },
  primaryIconEnabled: {
    backgroundColor: colors.blue,
  },
  label: { color: colors.muted, fontSize: 8.5, fontWeight: '600', marginTop: 2 },
  activeLabel: { color: colors.blueDark, fontWeight: '700' },
  primaryLabel: {
    marginTop: 4,
    color: colors.blueDark,
    fontWeight: '700',
  },
  primaryLabelDisabled: {
    color: '#b6c6c4',
  },
  initialsText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  guestInitials: { color: colors.purple },
  pressed: { opacity: 0.7 },
});
