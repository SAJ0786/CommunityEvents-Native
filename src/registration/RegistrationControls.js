import React from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export function Action({ children, onPress, primary, disabled }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={[styles.button, primary && styles.primary, disabled && styles.disabled]}><Text style={[styles.buttonText, primary && styles.primaryText]}>{children}</Text></Pressable>;
}
export function IconAction({ icon, label, onPress, disabled }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><MaterialCommunityIcons name={icon} size={24} color={colors.tealDark} /></Pressable>;
}
export function Input({ label, error, ...props }) {
  return <View style={styles.group}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} maxLength={2000} {...props} style={[styles.input, props.multiline && styles.multiline]} />{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View>;
}
export function Answer({ field, value, onChange }) {
  const label = `${field.label}${field.required ? ' *' : ''}`;
  if (field.type === 'consent') return <View style={styles.group}><Text style={styles.text}>{field.terms}</Text><View style={styles.row}><Text style={styles.flex}>{label}</Text><Switch accessibilityLabel={label} value={value === true} onValueChange={onChange} /></View></View>;
  if (['select', 'radio', 'checkboxes'].includes(field.type)) return <View style={styles.group}><Text style={styles.label}>{label}</Text>{field.options.map(option => {
    const multiple = field.type === 'checkboxes'; const values = Array.isArray(value) ? value : [];
    const selected = multiple ? values.includes(option) : value === option;
    return <Pressable key={option} accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected }} onPress={() => onChange(multiple ? selected ? values.filter(item => item !== option) : [...values, option] : option)} style={[styles.button, selected && styles.selected]}><Text style={styles.text}>{selected ? '✓ ' : ''}{option}</Text></Pressable>;
  })}</View>;
  return <Input label={label} value={typeof value === 'string' ? value : ''} multiline={field.type === 'textarea'} keyboardType={field.type === 'email' ? 'email-address' : field.type === 'phone' ? 'phone-pad' : field.type === 'number' ? 'numeric' : 'default'} autoCapitalize={field.type === 'email' ? 'none' : 'sentences'} onChangeText={onChange} />;
}
export const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  title: { color: colors.navy, ...typography.sectionTitle },
  label: { color: colors.text, ...typography.label },
  text: { color: colors.text, ...typography.body },
  muted: { color: colors.muted, ...typography.body },
  error: { color: colors.tealDark, backgroundColor: colors.tealSoft, padding: spacing.md, borderRadius: radius.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, color: colors.text }, group: { gap: spacing.sm, marginVertical: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, borderRadius: radius.md, padding: spacing.md, minHeight: 48, fontSize: typography.sectionTitle.fontSize },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  button: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, minHeight: 44, padding: spacing.md, justifyContent: 'center' },
  buttonText: { color: colors.tealDark, fontWeight: '600' }, primary: { backgroundColor: colors.blue }, primaryText: { color: colors.onPrimary },
  selected: { backgroundColor: colors.blueSoft, borderColor: colors.blue }, disabled: { opacity: 0.45 },
  poster: { width: '100%', height: 300 },
});
