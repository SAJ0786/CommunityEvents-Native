import React from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography, shadow } from '../theme';

export function RegistrationIdentity({ event, places }) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(event.date || '') ? new Date(`${event.date}T12:00:00Z`) : null;
  const dateText = date ? new Intl.DateTimeFormat('en-AU', { weekday:'short', day:'numeric', month:'short', year:'numeric', timeZone:'UTC' }).format(date) : event.date;
  return <View style={styles.identity}>
    <View style={styles.identityHeading}><View style={styles.identityIcon}><MaterialCommunityIcons name="clipboard-text-outline" size={28} color={colors.blueDark}/></View><View style={styles.identityCopy}><Text style={styles.eyebrow}>Registration only event</Text><Text style={styles.title}>{event.title}</Text>{event.eventType ? <Text style={styles.muted}>{event.eventType}</Text> : null}</View></View>
    <View style={styles.metadata}>{[['calendar-outline',dateText],['clock-outline',event.startTime || 'Time to be confirmed'],['map-marker-outline',event.suburb]].filter(([,text]) => text).map(([icon,text]) => <View key={icon} style={styles.metadataRow}><MaterialCommunityIcons name={icon} size={18} color={colors.blueDark}/><Text style={styles.text}>{text}</Text></View>)}</View>
    {places > 0 && <View style={styles.booked}><MaterialCommunityIcons name="ticket-confirmation-outline" size={20} color={colors.tealDark}/><Text style={styles.bookedText}>{places} {places === 1 ? 'place' : 'places'} registered</Text></View>}
  </View>;
}
export function Action({ children, onPress, primary, disabled, style }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={[styles.button, primary && styles.primary, disabled && styles.disabled, style]}><Text style={[styles.buttonText, primary && styles.primaryText]}>{children}</Text></Pressable>;
}
export function IconAction({ icon, label, onPress, disabled }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.button, styles.iconButton, disabled && styles.disabled]}><MaterialCommunityIcons name={icon} size={24} color={colors.tealDark} /></Pressable>;
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
  reviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  reviewField: { flexGrow: 1, flexBasis: 160, minWidth: 0, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, padding: spacing.md, borderRadius: radius.md, gap: spacing.sm },
  identity: { gap: spacing.md, marginBottom: spacing.md },
  identityHeading: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  identityCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  identityIcon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { ...typography.eyebrow, color: colors.blueDark },
  metadata: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.sm },
  metadataRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  booked: { alignSelf: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.tealSoft, padding: spacing.sm, borderRadius: radius.md },
  bookedText: { ...typography.body, color: colors.tealDark },
  content: { padding: spacing.lg, gap: spacing.md },
  panel: { ...shadow, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  title: { color: colors.navy, ...typography.sectionTitle },
  label: { color: colors.text, ...typography.label },
  text: { color: colors.text, ...typography.body },
  muted: { color: colors.muted, ...typography.body },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, padding: spacing.md, borderRadius: radius.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: spacing.sm },
  actionInRow: { flexGrow: 1, flexBasis: 140 },
  flex: { flex: 1, minWidth: 0, color: colors.text, ...typography.body }, group: { gap: spacing.sm, marginVertical: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, borderRadius: radius.md, padding: spacing.md, minHeight: 48, ...typography.body },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  button: { minWidth: 0, maxWidth: '100%', flexShrink: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, minHeight: 44, padding: spacing.md, justifyContent: 'center' },
  iconButton: { width: 44, height: 44, padding: 0, alignItems: 'center' },
  buttonText: { color: colors.tealDark, ...typography.body, fontWeight: '600', textAlign: 'center' }, primary: { backgroundColor: colors.blue, borderColor: colors.blue }, primaryText: { color: colors.onPrimary },
  selected: { backgroundColor: colors.blueSoft, borderColor: colors.blue }, disabled: { opacity: 0.45 },
  progress: { flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.md },
  progressStep: { flex: 1, minWidth: 0, alignItems: 'center', gap: spacing.sm },
  progressNumber: { width: 28, height: 28, borderRadius: radius.md, backgroundColor: colors.neutralSoft, color: colors.muted, textAlign: 'center', textAlignVertical: 'center', lineHeight: 28, fontWeight: '700' },
  progressActive: { backgroundColor: colors.blue, color: colors.onPrimary },
  progressComplete: { backgroundColor: colors.blueSoft, color: colors.blueDark },
  progressLabel: { ...typography.label, color: colors.muted, textAlign: 'center' },
  progressLabelActive: { color: colors.blueDark },
  insetPanel: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  poster: { width: '100%', height: 300 },
});
