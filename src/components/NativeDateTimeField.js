import React, { useMemo, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function dateFromValue(value, mode) {
  if (mode === 'time') {
    const date = new Date();
    if (isTime(value)) {
      const [hours, minutes] = value.split(':').map(Number);
      date.setHours(hours, minutes, 0, 0);
    }
    return date;
  }
  const dateValue = String(value || '').slice(0, 10);
  return isIsoDate(dateValue) ? new Date(`${dateValue}T12:00:00`) : new Date();
}

function storedValue(date, mode, valueFormat) {
  if (mode === 'time') {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return valueFormat === 'month' ? dateValue.slice(0, 7) : dateValue;
}

function displayValue(value, mode, valueFormat) {
  if (!value) return mode === 'time' ? 'Select time' : valueFormat === 'month' ? 'Select month' : 'Select date';
  if (mode === 'time' && isTime(value)) {
    return dateFromValue(value, mode).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  }
  const dateValue = valueFormat === 'month' ? `${value}-01` : value;
  if (isIsoDate(dateValue)) {
    return new Date(`${dateValue}T12:00:00`).toLocaleDateString('en-AU', valueFormat === 'month'
      ? { month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return String(value);
}

export default function NativeDateTimeField({
  value,
  onChange,
  mode = 'date',
  valueFormat = 'full',
  minimumDate,
  maximumDate,
  minuteInterval = 5,
  compact = false,
  accessibilityLabel,
}) {
  const [visible, setVisible] = useState(false);
  const pickerDate = useMemo(() => dateFromValue(value, mode), [mode, value]);
  const choose = (event, selectedDate) => {
    if (Platform.OS !== 'ios') setVisible(false);
    if (event?.type === 'dismissed' || !selectedDate) return;
    onChange?.(storedValue(selectedDate, mode, valueFormat));
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || `Select ${mode}`}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.button, compact && styles.buttonCompact, pressed && styles.pressed]}
      >
        <Text style={styles.icon}>{mode === 'time' ? '\u{1F552}' : '\u{1F4C5}'}</Text>
        <Text numberOfLines={1} style={[styles.value, !value && styles.placeholder]}>{displayValue(value, mode, valueFormat)}</Text>
        <Text style={styles.chevron}>{'\u203A'}</Text>
      </Pressable>
      {visible ? (
        <View style={Platform.OS === 'ios' ? styles.iosPicker : null}>
          <DateTimePicker
            value={pickerDate}
            mode={mode}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            minuteInterval={mode === 'time' ? minuteInterval : undefined}
            onChange={choose}
          />
          {Platform.OS === 'ios' ? <Pressable onPress={() => setVisible(false)} style={styles.done}><Text style={styles.doneText}>Done</Text></Pressable> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minWidth: 0 },
  button: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  buttonCompact: { minHeight: 44, paddingHorizontal: spacing.sm },
  icon: { fontSize: 17 },
  value: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, fontWeight: '800' },
  placeholder: { color: colors.muted },
  chevron: { color: colors.tealDark, fontSize: 22, fontWeight: '900' },
  pressed: { opacity: 0.74 },
  iosPicker: { marginTop: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  done: { alignSelf: 'flex-end', minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.md },
  doneText: { color: colors.tealDark, fontSize: 13, fontWeight: '900' },
});
