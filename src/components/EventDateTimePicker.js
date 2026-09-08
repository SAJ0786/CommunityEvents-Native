import React, { useEffect, useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing } from '../theme';

// Mount only while open. iOS wheels are embedded views, so present them above
// the form instead of placing them below fields outside the visible viewport.
export default function EventDateTimePicker({ value, mode, title, minimumDate, onChange, onClose }) {
  const [selection, setSelection] = useState(value);
  useEffect(() => { Keyboard.dismiss(); }, []);

  if (Platform.OS !== 'ios') {
    return <DateTimePicker value={value} mode={mode} display="default" minimumDate={minimumDate} minuteInterval={5} onChange={onChange} />;
  }

  return (
    <Modal transparent visible animationType="slide" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel date or time selection" style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            <DateTimePicker
              value={selection}
              mode={mode}
              display="spinner"
              themeVariant="light"
              textColor={colors.text}
              minimumDate={minimumDate}
              minuteInterval={5}
              style={styles.picker}
              onChange={(event, date) => {
                if (event?.type !== 'dismissed' && date) setSelection(date);
              }}
            />
          </ScrollView>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.button}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => {
              onChange({ type: 'set', nativeEvent: { timestamp: selection.getTime() } }, selection);
              onClose();
            }} style={styles.button}>
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.38)' },
  sheet: { maxHeight: '90%', padding: spacing.md, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  title: { color: colors.text, fontSize: 18, fontWeight: '600', padding: spacing.sm },
  picker: { width: '100%', height: 216 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  button: { minHeight: 48, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  cancel: { fontSize: 16, color: colors.muted },
  done: { fontSize: 16, fontWeight: '600', color: '#2563eb' },
});
