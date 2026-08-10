import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { CITY_OPTIONS, cityCode } from '../utils/cities';
import { colors, radius, spacing } from '../theme';

export default function CitySelector({ selectedCity, onChange }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {CITY_OPTIONS.map(city => {
        const active = city.value === selectedCity;
        return (
          <Pressable
            key={city.value}
            onPress={() => onChange(city.value)}
            style={[styles.chip, active && styles.activeChip]}
          >
            <Text style={[styles.code, active && styles.activeText]}>{cityCode(city.value)}</Text>
            <Text style={[styles.label, active && styles.activeText]} numberOfLines={1}>{city.label.replace(', Australia', '')}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  chip: {
    minWidth: 116,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  activeChip: {
    borderColor: colors.teal,
    backgroundColor: colors.teal,
  },
  code: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 2,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  activeText: {
    color: '#ffffff',
  },
});
