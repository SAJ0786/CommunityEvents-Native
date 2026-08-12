import React, { useMemo, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

function normaliseOption(option) {
  if (typeof option === 'string') return { value: option, label: option };
  return { value: option?.value ?? '', label: option?.label ?? String(option?.value ?? '') };
}

export default function CompactSelect({ options = [], value, onChange, placeholder = 'Choose an option' }) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => options.map(normaliseOption), [options]);
  const selected = rows.find(option => option.value === value);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Text numberOfLines={1} style={[styles.triggerText, !selected && styles.placeholder]}>
          {selected?.label || placeholder}
        </Text>
        <Text style={styles.chevron}>{'\u25BE'}</Text>
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Choose an option</Text>
              <Pressable onPress={() => setOpen(false)} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
              {rows.map(option => {
                const active = option.value === value;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    key={String(option.value)}
                    onPress={() => {
                      onChange?.(option.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
                    {active ? <Text style={styles.check}>{'\u2713'}</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  triggerText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  placeholder: { color: colors.muted, fontWeight: '500' },
  chevron: { color: colors.tealDark, fontSize: 18, fontWeight: '900' },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.38)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { maxHeight: '74%', padding: spacing.lg, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, ...shadow },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  title: { flex: 1, color: colors.navy, fontSize: 20, fontWeight: '900' },
  close: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  closeText: { color: colors.tealDark, fontSize: 13, fontWeight: '900' },
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  optionActive: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  optionText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  optionTextActive: { color: colors.tealDark, fontWeight: '900' },
  check: { color: colors.tealDark, fontSize: 18, fontWeight: '900' },
  pressed: { opacity: 0.78 },
});
