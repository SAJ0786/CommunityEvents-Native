import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import CreateEventForm from './CreateEventForm';
import CompactSelect from './CompactSelect';
import { getHijriParts, HIJRI_MONTHS } from '../services/hijri';
import { getHijriSettings } from '../services/settings';
import {
  addYearsClamped,
  formatLocalDate,
  generateGregorianOccurrences,
  generateHijriOccurrences,
  parseLocalDate,
  recurrenceLabel,
} from '../services/recurrence';
import { colors, radius, shadow, spacing } from '../theme';

const FREQUENCIES = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

function defaultEndDate(frequency, startDate) {
  const start = parseLocalDate(startDate) || new Date();
  return formatLocalDate(addYearsClamped(start, frequency === 'year' ? 4 : 1));
}

function ToggleRow({ options, value, onChange }) {
  if (options.length > 2) {
    return <CompactSelect options={options} value={value} onChange={onChange} />;
  }
  return (
    <View style={styles.toggleRow}>
      {options.map(option => (
        <Pressable
          key={option.value}
          onPress={() => onChange(option.value)}
          style={[styles.toggle, value === option.value && styles.toggleActive]}
        >
          <Text style={[styles.toggleText, value === option.value && styles.toggleTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label} *</Text>
      {children}
    </View>
  );
}

function HijriInputs({ label, value, onChange }) {
  return (
    <Field label={label}>
      <View style={styles.hijriNumbers}>
        <TextInput
          keyboardType="number-pad"
          maxLength={2}
          onChangeText={day => onChange({ ...value, day })}
          placeholder="Day"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.dayInput]}
          value={String(value.day || '')}
        />
        <TextInput
          keyboardType="number-pad"
          maxLength={4}
          onChangeText={year => onChange({ ...value, year })}
          placeholder="Year"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.yearInput]}
          value={String(value.year || '')}
        />
      </View>
      <Text style={styles.monthLabel}>Month</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.months}>
        {HIJRI_MONTHS.map(month => {
          const selected = Number(value.month) === month.value;
          return (
            <Pressable
              key={month.value}
              onPress={() => onChange({ ...value, month: String(month.value) })}
              style={[styles.month, selected && styles.monthActive]}
            >
              <Text style={[styles.monthText, selected && styles.monthTextActive]}>{month.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Field>
  );
}

export default function RecurringEventForm({
  defaultCity,
  defaultHostName,
  defaultHostPhone,
  existingEvents,
  submitting,
  error,
  success,
  onSubmit,
  onBackToChoice,
  onRequireSignIn,
}) {
  const today = formatLocalDate(new Date());
  const [stage, setStage] = useState('schedule');
  const [calendarType, setCalendarType] = useState('gregorian');
  const [startDate, setStartDate] = useState(today);
  const [frequency, setFrequency] = useState('week');
  const [repeatEvery, setRepeatEvery] = useState('1');
  const [endMode, setEndMode] = useState('count');
  const [endDate, setEndDate] = useState(defaultEndDate('week', today));
  const [occurrenceCount, setOccurrenceCount] = useState('4');
  const [overrides, setOverrides] = useState([]);
  const [settingsReady, setSettingsReady] = useState(false);
  const [hijriStart, setHijriStart] = useState({ day: '', month: '', year: '' });
  const [hijriEnd, setHijriEnd] = useState({ day: '', month: '', year: '' });

  useEffect(() => {
    getHijriSettings().then(settings => {
      const loaded = settings.overrides || [];
      setOverrides(loaded);
      const current = getHijriParts(today, loaded);
      setHijriStart({ day: String(current.day || 1), month: String(current.month || 1), year: String(current.year || 1448) });
      setHijriEnd({ day: String(Math.min((current.day || 1) + 29, 30)), month: String(current.month || 1), year: String(current.year || 1448) });
    }).finally(() => setSettingsReady(true));
  }, [today]);

  useEffect(() => {
    setEndDate(defaultEndDate(frequency, startDate));
    if (frequency === 'year' && Number(occurrenceCount) > 5) setOccurrenceCount('5');
  }, [frequency, startDate]);

  const preview = useMemo(() => {
    if (!settingsReady) return { occurrences: [], error: '' };
    try {
      const occurrences = calendarType === 'hijri'
        ? generateHijriOccurrences({
          startHijri: hijriStart,
          frequency,
          repeatEvery,
          endMode,
          endHijri: hijriEnd,
          occurrenceCount,
          overrides,
        })
        : generateGregorianOccurrences({
          startDate,
          frequency,
          repeatEvery,
          endMode,
          endDate,
          occurrenceCount,
          overrides,
        });
      return { occurrences, error: '' };
    } catch (previewError) {
      return { occurrences: [], error: previewError.message };
    }
  }, [calendarType, endDate, endMode, frequency, hijriEnd, hijriStart, occurrenceCount, overrides, repeatEvery, settingsReady, startDate]);

  const recurrence = useMemo(() => ({
    calendarType,
    frequency,
    repeatEvery: Number(repeatEvery),
    endMode,
    endDate,
    endHijri: hijriEnd,
    occurrenceCount: Number(occurrenceCount),
  }), [calendarType, endDate, endMode, frequency, hijriEnd, occurrenceCount, repeatEvery]);

  const initialEvent = useMemo(() => {
    const first = preview.occurrences[0];
    if (!first) return null;
    return {
      metroArea: defaultCity,
      eventDate: first.eventDate,
      hijriDate: first.hijriDate,
      hijriDay: first.hijriDay || null,
      hijriMonth: first.hijriMonth || null,
      hijriYear: first.hijriYear || null,
      enteredAsHijri: first.enteredAsHijri,
    };
  }, [defaultCity, preview.occurrences]);

  if (stage === 'details' && initialEvent) {
    return (
      <CreateEventForm
        defaultCity={defaultCity}
        defaultHostName={defaultHostName}
        defaultHostPhone={defaultHostPhone}
        existingEvents={existingEvents}
        initialEvent={initialEvent}
        title="Recurring Event"
        subtitle={`${recurrenceLabel(frequency, repeatEvery)} - ${preview.occurrences.length} event${preview.occurrences.length === 1 ? '' : 's'} - ${preview.occurrences[0].eventDate} to ${preview.occurrences[preview.occurrences.length - 1].eventDate}`}
        submitLabel={`Create ${preview.occurrences.length} recurring event${preview.occurrences.length === 1 ? '' : 's'}`}
        submitting={submitting}
        error={error}
        success={success}
        canSubmit
        hideDate
        onSubmit={payload => onSubmit(payload, { occurrences: preview.occurrences, recurrence })}
        onCancel={() => setStage('schedule')}
        onRequireSignIn={onRequireSignIn}
      />
    );
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Recurring Event</Text>
        <Text style={styles.subtitle}>Create repeating events from one shared set of details. Dates are previewed before saving.</Text>

        <ToggleRow
          options={[{ value: 'gregorian', label: 'Gregorian' }, { value: 'hijri', label: 'Hijri' }]}
          value={calendarType}
          onChange={setCalendarType}
        />

        {!settingsReady ? <ActivityIndicator color={colors.teal} style={styles.loader} /> : calendarType === 'gregorian' ? (
          <>
            <Field label="First event date">
              <TextInput
                autoCapitalize="none"
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={startDate}
              />
            </Field>
            {endMode === 'date' ? (
              <Field label="End date">
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={endDate}
                />
              </Field>
            ) : null}
          </>
        ) : (
          <>
            <HijriInputs label="First event Hijri date" value={hijriStart} onChange={setHijriStart} />
            {endMode === 'date' ? <HijriInputs label="End Hijri date" value={hijriEnd} onChange={setHijriEnd} /> : null}
          </>
        )}

        <Text style={styles.sectionLabel}>Frequency *</Text>
        <ToggleRow options={FREQUENCIES} value={frequency} onChange={setFrequency} />

        <Field label="Repeat every">
          <TextInput
            keyboardType="number-pad"
            maxLength={3}
            onChangeText={setRepeatEvery}
            style={styles.input}
            value={repeatEvery}
          />
        </Field>

        <ToggleRow
          options={[{ value: 'count', label: 'Number of occurrences' }, { value: 'date', label: 'End date' }]}
          value={endMode}
          onChange={setEndMode}
        />

        {endMode === 'count' ? (
          <Field label="Occurrences">
            <TextInput
              keyboardType="number-pad"
              maxLength={3}
              onChangeText={setOccurrenceCount}
              style={styles.input}
              value={occurrenceCount}
            />
          </Field>
        ) : null}

        <Text style={styles.ruleText}>
          {recurrenceLabel(frequency, repeatEvery)}. Daily, weekly and monthly events are limited to one year. Yearly events are limited to 5 occurrences.
        </Text>

        {preview.error ? <Text style={styles.error}>{preview.error}</Text> : null}
        {preview.occurrences.length ? (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>Preview: {preview.occurrences.length} event{preview.occurrences.length === 1 ? '' : 's'} will be created</Text>
            <View style={styles.previewDates}>
              {preview.occurrences.slice(0, 10).map((item, index) => (
                <View key={`${item.eventDate}-${index}`} style={styles.dateChip}>
                  <Text style={styles.dateChipText}>{calendarType === 'hijri' ? item.hijriDate : item.eventDate}</Text>
                </View>
              ))}
              {preview.occurrences.length > 10 ? <Text style={styles.more}>+{preview.occurrences.length - 10} more</Text> : null}
            </View>
          </View>
        ) : null}

        <Pressable
          disabled={!preview.occurrences.length}
          onPress={() => setStage('details')}
          style={[styles.primaryButton, !preview.occurrences.length && styles.disabledButton]}
        >
          <Text style={styles.primaryText}>Continue to Event Details</Text>
        </Pressable>
        <Pressable onPress={onBackToChoice} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, ...shadow },
  title: { color: colors.navy, fontSize: 27, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4, marginBottom: spacing.lg },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: spacing.md },
  toggle: { flexGrow: 1, minWidth: 76, paddingVertical: 10, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: 'center', backgroundColor: colors.surface },
  toggleActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  toggleText: { color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  toggleTextActive: { color: colors.surface },
  field: { marginBottom: spacing.md },
  label: { color: colors.text, fontSize: 13, fontWeight: '900', marginBottom: 7, textTransform: 'uppercase' },
  sectionLabel: { color: colors.text, fontSize: 13, fontWeight: '900', marginBottom: 7, textTransform: 'uppercase' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 13, color: colors.text, backgroundColor: colors.surface, fontSize: 16 },
  hijriNumbers: { flexDirection: 'row', gap: spacing.sm },
  dayInput: { flex: 1 },
  yearInput: { flex: 1.5 },
  monthLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 8 },
  months: { gap: 6, paddingVertical: 7 },
  month: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  monthActive: { backgroundColor: colors.tealSoft, borderColor: colors.teal },
  monthText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  monthTextActive: { color: colors.tealDark, fontWeight: '900' },
  loader: { marginVertical: 24 },
  ruleText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  error: { color: colors.danger, fontSize: 13, fontWeight: '800', lineHeight: 19, marginBottom: spacing.md },
  preview: { backgroundColor: colors.tealSoft, borderWidth: 1, borderColor: '#b7ded7', borderRadius: 13, padding: spacing.md, marginBottom: spacing.lg },
  previewTitle: { color: colors.tealDark, fontSize: 14, fontWeight: '900', marginBottom: 8 },
  previewDates: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dateChip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 6 },
  dateChipText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  more: { color: colors.muted, fontSize: 11, fontWeight: '800', paddingVertical: 6 },
  primaryButton: { minHeight: 50, borderRadius: 13, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  disabledButton: { opacity: 0.42 },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  backButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  backText: { color: colors.tealDark, fontSize: 14, fontWeight: '900' },
});
