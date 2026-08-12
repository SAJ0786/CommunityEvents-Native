import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AUDIENCE_TYPES } from '../utils/eventOptions';
import { colors, radius, spacing } from '../theme';
import CompactSelect from './CompactSelect';

function FilterChoices({ label, options, value, onChange }) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
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
        <Text style={styles.searchIcon}>{'\uD83D\uDD0D'}</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={onQueryChange}
          placeholder="Search events..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          value={query}
        />
        {query ? (
          <Pressable accessibilityLabel="Clear search" onPress={() => onQueryChange('')} style={styles.clearSearch}>
            <Text style={styles.clearSearchText}>x</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onToggleFilters} style={[styles.filterButton, showFilters && styles.filterButtonActive]}>
          <Text style={[styles.filterButtonText, showFilters && styles.filterButtonTextActive]}>
            Filters{activeCount ? ` (${activeCount})` : ''}
          </Text>
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
              <Text style={styles.label}>Host name</Text>
              <TextInput
                onChangeText={value => onFilterChange('hostName', value)}
                placeholder="All hosts"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={filters.hostName}
              />
            </View>
            <View style={styles.column}>
              <Text style={styles.label}>Suburb</Text>
              <TextInput
                onChangeText={value => onFilterChange('suburb', value)}
                placeholder="All suburbs"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={filters.suburb}
              />
            </View>
          </View>
          {activeCount ? (
            <Pressable onPress={onClear} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>Clear Filters</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, marginBottom: spacing.sm },
  searchRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  searchIcon: { color: colors.muted, fontSize: 20, fontWeight: '900' },
  searchInput: { flex: 1, minWidth: 0, minHeight: 46, color: colors.text, fontSize: 14 },
  clearSearch: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.border },
  clearSearchText: { color: colors.surface, fontSize: 20, lineHeight: 23, fontWeight: '900' },
  filterButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.tealSoft },
  filterButtonActive: { backgroundColor: colors.teal },
  filterButtonText: { color: colors.tealDark, fontSize: 11, fontWeight: '900' },
  filterButtonTextActive: { color: colors.surface },
  panel: { gap: spacing.md, marginTop: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  group: { gap: 6 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  choiceRow: { gap: spacing.sm },
  choice: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  choiceSelected: { borderColor: colors.teal, backgroundColor: colors.teal },
  choiceText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  choiceTextSelected: { color: colors.surface },
  twoColumns: { flexDirection: 'row', gap: spacing.sm },
  column: { flex: 1, minWidth: 0, gap: 6 },
  input: { minHeight: 44, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, backgroundColor: colors.surface, fontSize: 13 },
  clearButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.tealSoft },
  clearButtonText: { color: colors.tealDark, fontSize: 13, fontWeight: '900' },
  pressed: { opacity: 0.76 },
});
