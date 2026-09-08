import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import EventDateTimePicker from './EventDateTimePicker';
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
import NativeBackButton from './NativeBackButton';

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
  initialEvent = null,
  editing = false,
  onSubmit,
  onBackToChoice,
  onRequireSignIn,
}) {
  const today = formatLocalDate(new Date());
  const existingRule = initialEvent?.recurrenceRuleSnapshot || {};
  const initialStartDate = initialEvent?.seriesStartDate || initialEvent?.eventDate || today;
  const [stage, setStage] = useState('schedule');
  const [calendarType, setCalendarType] = useState(existingRule.calendarType || (initialEvent?.enteredAsHijri ? 'hijri' : 'gregorian'));
  const [startDate, setStartDate] = useState(initialStartDate);
  const [frequency, setFrequency] = useState(existingRule.frequency || 'week');
  const [repeatEvery, setRepeatEvery] = useState(String(existingRule.repeatEvery || 1));
  const [endMode, setEndMode] = useState(existingRule.endMode || 'count');
  const [endDate, setEndDate] = useState(existingRule.endDate || initialEvent?.seriesEndDate || defaultEndDate(existingRule.frequency || 'week', initialStartDate));
  const [occurrenceCount, setOccurrenceCount] = useState(String(existingRule.occurrenceCount || initialEvent?.recurrenceTotal || 4));
  const [overrides, setOverrides] = useState([]);
  const [settingsReady, setSettingsReady] = useState(false);
  const [hijriStart, setHijriStart] = useState({
    day: String(initialEvent?.hijriDay || ''),
    month: String(initialEvent?.hijriMonth || ''),
    year: String(initialEvent?.hijriYear || ''),
  });
  const [hijriEnd, setHijriEnd] = useState({
    day: String(existingRule.endHijri?.day || ''),
    month: String(existingRule.endHijri?.month || ''),
    year: String(existingRule.endHijri?.year || ''),
  });
  const [datePicker, setDatePicker] = useState('');
  const scheduleReadyRef = useRef(false);

  const handleDatePicker = (event, value) => {
    const kind = datePicker;
    setDatePicker('');
    if (event?.type === 'dismissed' || !value) return;
    if (kind === 'start') setStartDate(formatLocalDate(value));
    if (kind === 'end') setEndDate(formatLocalDate(value));
  };

  useEffect(() => {
    getHijriSettings().then(settings => {
      const loaded = settings.overrides || [];
      setOverrides(loaded);
      const current = getHijriParts(initialStartDate, loaded);
      if (!initialEvent?.hijriDay || !initialEvent?.hijriMonth || !initialEvent?.hijriYear) {
        setHijriStart({ day: String(current.day || 1), month: String(current.month || 1), year: String(current.year || 1448) });
      }
      if (!existingRule.endHijri?.day || !existingRule.endHijri?.month || !existingRule.endHijri?.year) {
        setHijriEnd({ day: String(Math.min((current.day || 1) + 29, 30)), month: String(current.month || 1), year: String(current.year || 1448) });
      }
    }).finally(() => setSettingsReady(true));
  }, [existingRule.endHijri?.day, existingRule.endHijri?.month, existingRule.endHijri?.year, initialEvent?.hijriDay, initialEvent?.hijriMonth, initialEvent?.hijriYear, initialStartDate]);

  useEffect(() => {
    if (!scheduleReadyRef.current) {
      scheduleReadyRef.current = true;
      return;
    }
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
  const expectedOccurrenceCount = editing ? Number(initialEvent?.recurrenceTotal || 0) : 0;
  const scheduleCountError = expectedOccurrenceCount && preview.occurrences.length !== expectedOccurrenceCount
    ? `Keep this series at ${expectedOccurrenceCount} occurrences. Change the recurrence settings until the preview shows ${expectedOccurrenceCount} events.`
    : '';

  const detailsInitialEvent = useMemo(() => {
    const first = preview.occurrences[0];
    if (!first) return null;
    return {
      ...(editing && initialEvent ? initialEvent : {}),
      metroArea: defaultCity,
      eventDate: first.eventDate,
      hijriDate: first.hijriDate,
      hijriDay: first.hijriDay || null,
      hijriMonth: first.hijriMonth || null,
      hijriYear: first.hijriYear || null,
      enteredAsHijri: first.enteredAsHijri,
    };
  }, [defaultCity, editing, initialEvent, preview.occurrences]);

  if (stage === 'details' && detailsInitialEvent) {
    return (
      <CreateEventForm
        defaultCity={defaultCity}
        defaultHostName={defaultHostName}
        defaultHostPhone={defaultHostPhone}
        existingEvents={existingEvents}
        initialEvent={detailsInitialEvent}
        title={editing ? 'Edit Entire Series' : 'Recurring Event'}
        subtitle={`${recurrenceLabel(frequency, repeatEvery)} - ${preview.occurrences.length} event${preview.occurrences.length === 1 ? '' : 's'} - ${preview.occurrences[0].eventDate} to ${preview.occurrences[preview.occurrences.length - 1].eventDate}`}
        submitLabel={editing ? `Update ${preview.occurrences.length} series event${preview.occurrences.length === 1 ? '' : 's'}` : `Create ${preview.occurrences.length} recurring event${preview.occurrences.length === 1 ? '' : 's'}`}
        submitting={submitting}
        error={error}
        success={success}
        canSubmit
        allowUnchangedSubmit={editing}
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
        <Text style={styles.title}>{editing ? 'Edit Entire Series' : 'Recurring Event'}</Text>
        <Text style={styles.subtitle}>{editing ? 'Update the recurrence schedule and shared event details. Review the regenerated dates before saving.' : 'Create repeating events from one shared set of details. Dates are previewed before saving.'}</Text>

        <ToggleRow
          options={[{ value: 'gregorian', label: 'Gregorian' }, { value: 'hijri', label: 'Hijri' }]}
          value={calendarType}
          onChange={setCalendarType}
        />

        {!settingsReady ? <ActivityIndicator color={colors.teal} style={styles.loader} /> : calendarType === 'gregorian' ? (
          <>
            <Field label="First event date">
              <Pressable onPress={() => setDatePicker('start')} style={styles.datePickerButton}><Text style={styles.datePickerIcon}>{'\u{1F4C5}'}</Text><Text style={styles.datePickerText}>{startDate}</Text><Text style={styles.datePickerArrow}>{'\u203A'}</Text></Pressable>
            </Field>
            {endMode === 'date' ? (
              <Field label="End date">
                <Pressable onPress={() => setDatePicker('end')} style={styles.datePickerButton}><Text style={styles.datePickerIcon}>{'\u{1F4C5}'}</Text><Text style={styles.datePickerText}>{endDate}</Text><Text style={styles.datePickerArrow}>{'\u203A'}</Text></Pressable>
              </Field>
            ) : null}
          </>
        ) : (
          <>
            <HijriInputs label="First event Hijri date" value={hijriStart} onChange={setHijriStart} />
            {endMode === 'date' ? <HijriInputs label="End Hijri date" value={hijriEnd} onChange={setHijriEnd} /> : null}
          </>
        )}

        {datePicker ? <EventDateTimePicker key={datePicker} title={datePicker === 'start' ? 'First event date' : 'Last event date'} value={parseLocalDate(datePicker === 'start' ? startDate : endDate) || new Date()} mode="date" minimumDate={editing ? undefined : new Date()} onChange={handleDatePicker} onClose={() => setDatePicker('')} /> : null}

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

        {preview.error || scheduleCountError ? <Text style={styles.error}>{preview.error || scheduleCountError}</Text> : null}
        {preview.occurrences.length ? (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>Preview: {preview.occurrences.length} event{preview.occurrences.length === 1 ? '' : 's'} will be {editing ? 'kept in the updated series' : 'created'}</Text>
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
          disabled={!preview.occurrences.length || Boolean(scheduleCountError)}
          onPress={() => setStage('details')}
          style={[styles.primaryButton, (!preview.occurrences.length || scheduleCountError) && styles.disabledButton]}
        >
          <Text style={styles.primaryText}>{editing ? 'Continue to Shared Event Details' : 'Continue to Event Details'}</Text>
        </Pressable>
        <NativeBackButton onPress={onBackToChoice} style={styles.backButton} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, ...shadow },
  title: { color: colors.navy, fontSize: 27, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4, marginBottom: spacing.lg },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: spacing.md },
  toggle: { flexGrow: 1, minWidth: 76, paddingVertical: 10, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: 'center', backgroundColor: colors.surface },
  toggleActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  toggleText: { color: colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  toggleTextActive: { color: colors.surface },
  field: { marginBottom: spacing.md },
  label: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 7, textTransform: 'uppercase' },
  sectionLabel: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 7, textTransform: 'uppercase' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 13, color: colors.text, backgroundColor: colors.surface, fontSize: 16 },
  datePickerButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  datePickerIcon: { fontSize: 18 }, datePickerText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' }, datePickerArrow: { color: colors.tealDark, fontSize: 22, fontWeight: '700' },
  hijriNumbers: { flexDirection: 'row', gap: spacing.sm },
  dayInput: { flex: 1 },
  yearInput: { flex: 1.5 },
  monthLabel: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 8 },
  months: { gap: 6, paddingVertical: 7 },
  month: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  monthActive: { backgroundColor: colors.tealSoft, borderColor: colors.teal },
  monthText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  monthTextActive: { color: colors.tealDark, fontWeight: '700' },
  loader: { marginVertical: 24 },
  ruleText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', lineHeight: 19, marginBottom: spacing.md },
  preview: { backgroundColor: colors.tealSoft, borderWidth: 1, borderColor: '#b7ded7', borderRadius: 13, padding: spacing.md, marginBottom: spacing.lg },
  previewTitle: { color: colors.tealDark, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  previewDates: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dateChip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 6 },
  dateChipText: { color: colors.text, fontSize: 11, fontWeight: '600' },
  more: { color: colors.muted, fontSize: 11, fontWeight: '600', paddingVertical: 6 },
  primaryButton: { minHeight: 50, borderRadius: 13, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  disabledButton: { opacity: 0.42 },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  backButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  backText: { color: colors.tealDark, fontSize: 14, fontWeight: '700' },
});
