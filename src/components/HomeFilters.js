import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AUDIENCE_TYPES } from '../utils/eventOptions';
import { colors, radius, spacing } from '../theme';
import CompactSelect from './CompactSelect';

function FilterChoices({ label, options, value, onChange }) {
  return (
    <View style={styles.group}>
      <Text maxFontSizeMultiplier={1.08} style={styles.label}>{label}</Text>
      <CompactSelect options={options} value={value} onChange={onChange} />
    </View>
  );
}

export default function HomeFilters({
  events = [],
  query,
  onQueryChange,
  filters,
  onFilterChange,
  showFilters,
  onToggleFilters,
  onClear,
}) {
  const eventTypes = useMemo(() => [...new Set(events
    .map(event => event.eventTypeDisplay || event.customEventType || event.eventType)
    .filter(Boolean))].sort(), [events]);
  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <MaterialCommunityIcons color={colors.muted} name="magnify" size={22} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={onQueryChange}
          placeholder="Search events..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          maxFontSizeMultiplier={1.08}
          value={query}
        />
        {query ? (
          <Pressable accessibilityLabel="Clear search" onPress={() => onQueryChange('')} style={styles.clearSearch}>
            <Text maxFontSizeMultiplier={1} style={styles.clearSearchText}>x</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onToggleFilters} style={[styles.filterButton, showFilters && styles.filterButtonActive]}>
          <MaterialCommunityIcons color={showFilters ? colors.surface : colors.blue} name="tune-variant" size={19} />
          {activeCount ? <View style={styles.filterCount}><Text style={styles.filterCountText}>{activeCount}</Text></View> : null}
        </Pressable>
      </View>

      {showFilters ? (
        <View style={styles.panel}>
          <FilterChoices
            label="Time period"
            options={[
              { value: '', label: 'All upcoming' },
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'Next 7 days' },
              { value: 'month', label: 'Next 30 days' },
            ]}
            value={filters.period}
            onChange={value => onFilterChange('period', value)}
          />
          <FilterChoices
            label="Event type"
            options={[{ value: '', label: 'All event types' }, ...eventTypes.map(value => ({ value, label: value }))]}
            value={filters.eventType}
            onChange={value => onFilterChange('eventType', value)}
          />
          <FilterChoices
            label="Audience type"
            options={[{ value: '', label: 'All audiences' }, ...AUDIENCE_TYPES.map(value => ({ value, label: value }))]}
            value={filters.audienceType}
            onChange={value => onFilterChange('audienceType', value)}
          />
          <FilterChoices
            label="Organiser type"
            options={[
              { value: '', label: 'All' },
              { value: 'centre', label: 'Centre' },
              { value: 'private', label: 'Private' },
            ]}
            value={filters.organiser}
            onChange={value => onFilterChange('organiser', value)}
          />
          <View style={styles.twoColumns}>
            <View style={styles.column}>
              <Text maxFontSizeMultiplier={1.08} style={styles.label}>Host name</Text>
              <TextInput
                onChangeText={value => onFilterChange('hostName', value)}
                placeholder="All hosts"
                placeholderTextColor={colors.muted}
                style={styles.input}
                maxFontSizeMultiplier={1.08}
                value={filters.hostName}
              />
            </View>
            <View style={styles.column}>
              <Text maxFontSizeMultiplier={1.08} style={styles.label}>Suburb</Text>
              <TextInput
                onChangeText={value => onFilterChange('suburb', value)}
                placeholder="All suburbs"
                placeholderTextColor={colors.muted}
                style={styles.input}
                maxFontSizeMultiplier={1.08}
                value={filters.suburb}
              />
            </View>
          </View>
          {activeCount ? (
            <Pressable onPress={onClear} style={styles.clearButton}>
              <Text maxFontSizeMultiplier={1.08} style={styles.clearButtonText}>Clear Filters</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md, marginBottom: 0 },
  searchRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.82)' },
  searchIcon: { color: colors.muted, fontSize: 20, fontWeight: '700' },
  searchInput: { flex: 1, minWidth: 0, minHeight: 49, color: colors.text, fontSize: 14, fontWeight: '500' },
  clearSearch: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.border },
  clearSearchText: { color: colors.surface, fontSize: 20, lineHeight: 23, fontWeight: '700' },
  filterButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.blueSoft },
  filterButtonActive: { backgroundColor: colors.blue },
  filterButtonText: { color: colors.tealDark, fontSize: 11, fontWeight: '700' },
  filterButtonTextActive: { color: colors.surface },
  filterCount: { position: 'absolute', right: -3, top: -3, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderRadius: 8, backgroundColor: colors.rose },
  filterCountText: { color: colors.surface, fontSize: 8, fontWeight: '700' },
  panel: { gap: spacing.md, marginTop: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  group: { gap: 6 },
  label: { color: colors.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  choiceRow: { gap: spacing.sm },
  choice: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  choiceSelected: { borderColor: colors.teal, backgroundColor: colors.teal },
  choiceText: { color: colors.text, fontSize: 11, fontWeight: '600' },
  choiceTextSelected: { color: colors.surface },
  twoColumns: { flexDirection: 'row', gap: spacing.sm },
  column: { flex: 1, minWidth: 0, gap: 6 },
  input: { minHeight: 44, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, backgroundColor: colors.surface, fontSize: 13 },
  clearButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.blueSoft },
  clearButtonText: { color: colors.blueDark, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.76 },
});
