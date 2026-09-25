import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import NativeDateTimeField from '../components/NativeDateTimeField';
import { colors, radius, spacing } from '../theme';
import { BUSINESS_DAYS, applyHoursToDays, editableHoursDay, formatBusinessDay, validateBusinessHours } from '../utils/businessHours';

const QUICK_DAYS = [
  ['Monday to Friday', ['mon', 'tue', 'wed', 'thu', 'fri']],
  ['Saturday and Sunday', ['sat', 'sun']],
  ['All 7 Days', BUSINESS_DAYS.map(([day]) => day)],
];
const modeOf = row => row.closed ? 'closed' : row.open24Hours ? '24' : 'normal';

export function ScheduleFields({ schedule, onChange, label }) {
  const [picker, setPicker] = useState(null);
  const value = editableHoursDay(schedule);
  const updatePeriod = (index, field, time) => onChange({ ...value,
    periods: value.periods.map((period, i) => i === index ? { ...period, [field]: time } : period) });
  return (
    <View style={styles.fields}>
      <View style={styles.options}>
        {[['normal', 'Normal hours'], ['closed', 'Closed'], ['24', 'Open 24 Hours']].map(([mode, title]) => (
          <Pressable key={mode} accessibilityRole="button" accessibilityLabel={`${label}: ${title}`}
            accessibilityState={{ selected: modeOf(value) === mode }}
            onPress={() => { setPicker(null); onChange({ ...value, closed: mode === 'closed', open24Hours: mode === '24' }); }}
            style={[styles.chip, modeOf(value) === mode && styles.selected]}>
            <Text style={[styles.chipText, modeOf(value) === mode && styles.selectedText]}>{title}</Text>
          </Pressable>
        ))}
      </View>
      {modeOf(value) === 'normal' ? <>
        {value.periods.map((period, index) => (
          <View key={index} style={styles.period}>
            <Text style={styles.helper}>Period {index + 1}</Text>
            <View style={styles.timeRow}>
              {['open', 'close'].map(field => <View key={field} style={styles.timeField}>
                <Text style={styles.helper}>{field === 'open' ? 'Opening time' : 'Closing time'}</Text>
                <NativeDateTimeField compact mode="time" pickerEnabled={false} value={period[field]}
                  onPress={() => setPicker({ index, field })} onChange={time => updatePeriod(index, field, time)}
                  accessibilityLabel={`${label} period ${index + 1} ${field === 'open' ? 'opening' : 'closing'} time`} />
              </View>)}
            </View>
            {picker?.index === index ? <NativeDateTimeField pickerOnly mode="time" value={period[picker.field]}
              onChange={time => updatePeriod(index, picker.field, time)} onPickerDismiss={() => setPicker(null)}
              accessibilityLabel={`${label} period ${index + 1} ${picker.field} time picker`} /> : null}
            {value.periods.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label} period ${index + 1}`}
              onPress={() => { setPicker(null); onChange({ ...value, periods: value.periods.filter((_, i) => i !== index) }); }} style={styles.textButton}>
              <Text style={styles.removeText}>Remove this time</Text>
            </Pressable> : null}
          </View>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel={`Add another time for ${label}`}
          onPress={() => { setPicker(null); onChange({ ...value, periods: [...value.periods, { open: '', close: '' }] }); }} style={styles.textButton}>
          <Text style={styles.linkText}>+ Add another time</Text>
        </Pressable>
        <Text style={styles.helper}>A closing time earlier than opening means the following day.</Text>
      </> : null}
    </View>
  );
}

export default function BusinessHoursEditor({ hours = {}, onChange, error }) {
  const [selectedDays, setSelectedDays] = useState([]);
  const [draft, setDraft] = useState(() => editableHoursDay());
  const [editingDay, setEditingDay] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [bulkError, setBulkError] = useState('');
  const apply = () => {
    if (!selectedDays.length) { setBulkError('Select at least one day.'); return; }
    const next = applyHoursToDays(hours, selectedDays, draft);
    const invalid = validateBusinessHours(next);
    if (invalid) { setBulkError(invalid); return; }
    const commit = () => {
      onChange(next);
      setBulkError('');
      setFeedback(`Hours applied to ${BUSINESS_DAYS.filter(([day]) => selectedDays.includes(day)).map(([, label]) => label).join(', ')}. Save the business to submit these changes.`);
    };
    const overwrites = selectedDays.some(day => hours[day] && JSON.stringify(editableHoursDay(hours[day])) !== JSON.stringify(draft));
    if (overwrites) Alert.alert('Replace selected days’ hours?', 'This replaces all opening periods for the selected days only. Other days will not change.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Apply Hours', onPress: commit },
    ]);
    else commit();
  };
  const select = days => { setSelectedDays(days); setFeedback(''); setBulkError(''); };
  return (
    <View>
      <View style={styles.bulk}>
        <Text style={styles.title}>Set hours for multiple days</Text>
        <Text style={styles.helper}>Choose your hours and days, then tap Apply Hours to update the weekly schedule below.</Text>
        <ScheduleFields label="Selected days" schedule={draft} onChange={value => { setDraft(value); setFeedback(''); setBulkError(''); }} />
        <Text style={styles.label}>Apply to these days</Text>
        <View style={styles.options}>
          {QUICK_DAYS.map(([label, days]) => <Pressable key={label} accessibilityRole="button"
            onPress={() => select([...days])} style={styles.chip}><Text style={styles.linkText}>{label}</Text></Pressable>)}
        </View>
        <View style={styles.options}>
          {BUSINESS_DAYS.map(([day, label]) => <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={label}
            accessibilityState={{ checked: selectedDays.includes(day) }}
            onPress={() => select(selectedDays.includes(day) ? selectedDays.filter(item => item !== day) : [...selectedDays, day])}
            style={[styles.chip, selectedDays.includes(day) && styles.selected]}>
            <Text style={[styles.chipText, selectedDays.includes(day) && styles.selectedText]}>{label}</Text>
          </Pressable>)}
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !selectedDays.length }} disabled={!selectedDays.length}
          onPress={apply} style={[styles.apply, !selectedDays.length && styles.disabled]}><Text style={styles.selectedText}>Apply Hours</Text></Pressable>
        {bulkError ? <Text accessibilityRole="alert" style={styles.error}>{bulkError}</Text> : null}
        {feedback ? <Text accessibilityLiveRegion="polite" style={styles.helper}>{feedback}</Text> : null}
      </View>
      <Text style={styles.title}>Weekly schedule</Text>
      {BUSINESS_DAYS.map(([day, label]) => <View key={day} style={styles.day}>
        <View style={styles.dayHeader}>
          <Text style={styles.label}>{label}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${editingDay === day ? 'Done editing' : 'Edit'} ${label}`}
            accessibilityState={{ expanded: editingDay === day }} onPress={() => setEditingDay(editingDay === day ? null : day)} style={styles.textButton}>
            <Text style={styles.linkText}>{editingDay === day ? 'Done' : 'Edit'}</Text>
          </Pressable>
        </View>
        <Text style={styles.summary}>{formatBusinessDay(hours[day])}</Text>
        {editingDay === day ? <ScheduleFields key={day} label={label} schedule={hours[day]}
          onChange={value => { onChange(applyHoursToDays(hours, [day], value)); setFeedback(''); }} /> : null}
      </View>)}
      {error || validateBusinessHours(hours) ? <Text accessibilityRole="alert" style={styles.error}>{error || validateBusinessHours(hours)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bulk: { padding: spacing.md, marginVertical: spacing.md, gap: spacing.sm, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md },
  title: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: spacing.sm },
  label: { color: colors.text, fontSize: 13, fontWeight: '700' },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  fields: { gap: spacing.sm, marginTop: spacing.sm },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: spacing.sm, paddingVertical: 9, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  selected: { backgroundColor: colors.blue, borderColor: colors.blue },
  selectedText: { color: colors.surface, fontSize: 13, fontWeight: '700' },
  period: { gap: spacing.sm },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeField: { flexGrow: 1, flexBasis: 135, minWidth: 130, gap: 4 },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, alignSelf: 'flex-start' },
  linkText: { color: colors.blue, fontSize: 12, fontWeight: '700' },
  removeText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  apply: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.blue },
  disabled: { opacity: 0.45 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  day: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summary: { color: colors.muted, fontSize: 13, lineHeight: 21 },
});
