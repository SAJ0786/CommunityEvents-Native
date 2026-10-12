import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import KeyboardAwareScrollView from './KeyboardAwareScrollView';
import MemberPageHeader from './MemberPageHeader';
import { colors, radius, spacing } from '../theme';
import { FIELD_TYPES, STANDARD_FIELDS, createDraft, makeField, moveField, validateDraft, validateAnswers, snapshotBooking } from '../registration/prototypeModel';

// Deliberately no Firebase imports. This screen is accessible only in development.
export default function RegistrationPrototypeScreen({ onBack }) {
  const [stage, setStage] = useState(0);
  const [draft, setDraft] = useState(createDraft);
  const [answers, setAnswers] = useState({});
  const [places, setPlaces] = useState('1');
  const [message, setMessage] = useState('');
  const [booking, setBooking] = useState(null);
  const [saved, setSaved] = useState(null);
  const [template, setTemplate] = useState(null);
  const serial = useRef(0);
  const scroll = useRef(null);
  const titles = ['Event setup', 'Build registration form', 'Attendee preview', 'Demo confirmation', 'Registration response'];
  const go = next => { setStage(next); setMessage(''); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const changeField = (id, changes) => update('fields', draft.fields.map(field => field.id === id ? { ...field, ...changes } : field));
  const add = field => {
    if (draft.fields.length >= 30) { setMessage('Use no more than 30 questions in this prototype.'); return; }
    update('fields', [...draft.fields, { description: '', options: [], ...field, id: `${field.id || 'custom'}-${++serial.current}` }]);
  };
  const preview = () => { const errors = validateDraft(draft); if (errors.length) setMessage(errors.join('\n')); else go(2); };
  const submit = () => {
    const errors = validateAnswers(draft.fields, answers, places, draft.capacity);
    if (Object.keys(errors).length) { setMessage(Object.entries(errors).map(([id, error]) => `${id === 'places' ? 'Places' : draft.fields.find(f => f.id === id)?.label}: ${error}`).join('\n')); return; }
    setBooking(snapshotBooking(draft, answers, places)); go(3);
  };
  return <KeyboardAwareScrollView ref={scroll} contentContainerStyle={styles.content}>
    <Text style={styles.warning}>PROTOTYPE ONLY · Fictional details only. No real event, booking, email or Firebase connection. Drafts reset when you leave.</Text>
    <MemberPageHeader title={titles[stage]} subtitle="Registration Required Event · Single date" icon="clipboard-text-outline" tone="teal" />
    <View style={styles.row}><Action text="Back" onPress={() => stage === 0 ? onBack() : go(stage - 1)} /><Text style={styles.muted}>Step {stage + 1} of 5</Text></View>
    {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
    {stage === 0 && <View style={styles.panel}>
      <Text style={styles.title}>Tell us about your event</Text><Text style={styles.muted}>Only title, type, date and suburb are shown before registration.</Text>
      <Input label="Event title" value={draft.title} onChangeText={value => update('title', value)} />
      <Input label="Event type" value={draft.eventType} onChangeText={value => update('eventType', value)} />
      <Input label="Event date (YYYY-MM-DD)" value={draft.date} onChangeText={value => update('date', value)} />
      <Input label="Suburb" value={draft.suburb} onChangeText={value => update('suburb', value)} />
      <Input label="Capacity in places" value={String(draft.capacity)} keyboardType="number-pad" onChangeText={value => update('capacity', value)} />
      <Text style={styles.muted}>A family of three uses three places. Server availability is not connected in this preview.</Text>
      <View style={styles.row}><Text style={styles.flex}>Allow attendee cancellation</Text><Switch accessibilityLabel="Allow attendee cancellation" value={draft.allowCancellation} onValueChange={value => update('allowCancellation', value)} /></View>
      <Action primary text="Build registration form" onPress={() => go(1)} />
    </View>}
    {stage === 1 && <>
      <View style={styles.panel}><Input label="Why are you collecting these answers?" multiline value={draft.purpose} onChangeText={value => update('purpose', value)} /><View style={styles.row}><Action text="Save demo draft" onPress={() => { setSaved(JSON.parse(JSON.stringify(draft))); setMessage('Draft saved for this screen session only.'); }} />{saved && <Action text="Restore draft" onPress={() => { setDraft(JSON.parse(JSON.stringify(saved))); setAnswers({}); setMessage('Demo draft restored.'); }} />}</View></View>
      {draft.fields.map((field, index) => <View key={field.id} style={styles.panel}>
        <Text style={styles.eyebrow}>QUESTION {index + 1} · {FIELD_TYPES.find(([type]) => type === field.type)?.[1]}</Text>
        <Input label="Question" value={field.label} maxLength={200} onChangeText={value => changeField(field.id, { label: value })} />
        <Input label="Help text (optional)" value={field.description} maxLength={500} onChangeText={value => changeField(field.id, { description: value })} />
        {['select', 'radio', 'checkboxes'].includes(field.type) && <Input label="Options — one per line" multiline value={field.options.join('\n')} onChangeText={value => changeField(field.id, { options: value.split('\n') })} />}
        <View style={styles.row}><Text style={styles.flex}>Required answer</Text><Switch accessibilityLabel={`${field.label} required`} value={field.required} onValueChange={value => changeField(field.id, { required: value })} /></View>
        <View style={styles.row}><Action text="Move up" disabled={index === 0} onPress={() => update('fields', moveField(draft.fields, index, -1))} /><Action text="Move down" disabled={index === draft.fields.length - 1} onPress={() => update('fields', moveField(draft.fields, index, 1))} /><Action text="Remove" onPress={() => update('fields', draft.fields.filter(f => f.id !== field.id))} /></View>
      </View>)}
      <View style={styles.panel}><Text style={styles.title}>Add a question</Text><Text style={styles.muted}>Standard fields</Text><View style={styles.row}>{STANDARD_FIELDS.map(field => <Action key={field.id} text={`+ ${field.label}`} onPress={() => add(field)} />)}</View><Text style={styles.muted}>Custom questions</Text><View style={styles.row}>{FIELD_TYPES.map(([type, label]) => <Action key={type} text={`+ ${label}`} onPress={() => add(makeField(type, 'custom'))} />)}</View></View>
      <View style={styles.panel}><Text style={styles.title}>Reusable form template</Text><Text style={styles.muted}>One session-only template for this native preview.</Text><View style={styles.row}><Action text="Save template" onPress={() => { setTemplate(JSON.parse(JSON.stringify(draft.fields))); setMessage('Template saved for this screen session.'); }} />{template && <Action text="Use template" onPress={() => { update('fields', JSON.parse(JSON.stringify(template))); setAnswers({}); setMessage('Template applied.'); }} />}</View></View>
      <Action primary text="Preview attendee form" onPress={preview} />
    </>}
    {stage === 2 && <>
      <View style={styles.summary}><Text style={styles.eyebrow}>REGISTRATION REQUIRED</Text><Text style={styles.title}>{draft.title}</Text><Text style={styles.muted}>{draft.eventType} · {draft.date} · {draft.suburb}</Text><Text style={styles.muted}>Full event details appear only after confirmed registration.</Text></View>
      <View style={styles.panel}><Text style={styles.title}>Your registration</Text><Text style={styles.muted}>{draft.purpose}</Text><Text style={styles.muted}>Previewing a signed-in attendee. Use fictional details.</Text><Input label="Number of attendees *" value={places} keyboardType="number-pad" onChangeText={setPlaces} />
        {draft.fields.map(field => <NativeAnswer key={field.id} field={field} value={answers[field.id]} onChange={value => setAnswers(current => ({ ...current, [field.id]: value }))} />)}
        <Action primary text="Try demo registration" onPress={submit} />
      </View>
    </>}
    {stage === 3 && booking && <View style={styles.panel}><Text style={styles.eyebrow}>PREVIEW RESULT</Text><Text style={styles.title}>Your demo registration is confirmed</Text><Text style={styles.muted}>No real places have been reserved.</Text><Text style={styles.title}>{booking.id} · {booking.places} places</Text><Text style={styles.muted}>Protected venue details will appear here after server integration.</Text><Action primary text="View organiser response" onPress={() => go(4)} /><Action text="Return to builder" onPress={() => go(1)} /></View>}
    {stage === 4 && booking && <View style={styles.panel}><Text style={styles.title}>Read-only response</Text><Text style={styles.muted}>Form version {booking.formVersion} · {booking.places} demo places</Text>{booking.fields.map(field => <View style={styles.answer} key={field.id}><Text style={styles.label}>{field.label}</Text><Text style={styles.text}>{Array.isArray(booking.answers[field.id]) ? booking.answers[field.id].join(', ') : booking.answers[field.id] === true ? 'Agreed' : String(booking.answers[field.id] ?? 'Not provided')}</Text></View>)}<Text style={styles.muted}>Permissions, cancellation, CSV export and live capacity are not connected in this prototype.</Text></View>}
  </KeyboardAwareScrollView>;
}
function Action({ text, onPress, primary, disabled }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={[styles.button, primary && styles.primary, disabled && styles.disabled]}><Text style={[styles.buttonText, primary && styles.primaryText]}>{text}</Text></Pressable>;
}
function Input({ label, ...props }) { return <View style={styles.inputGroup}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={[styles.input, props.multiline && styles.multiline]} maxLength={2000} {...props} /></View>; }
function NativeAnswer({ field, value, onChange }) {
  const label = `${field.label}${field.required ? ' *' : ''}`;
  if (field.type === 'consent') return <View style={styles.row}><Text style={styles.flex}>{label}</Text><Switch accessibilityLabel={label} value={value === true} onValueChange={onChange} /></View>;
  if (['select', 'radio', 'checkboxes'].includes(field.type)) return <View style={styles.inputGroup}><Text style={styles.label}>{label}</Text><Text style={styles.muted}>{field.description}</Text>{field.options.map(option => {
    const selected = field.type === 'checkboxes' ? Array.isArray(value) && value.includes(option) : value === option;
    return <Pressable accessibilityRole={field.type === 'checkboxes' ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected }} key={option} style={[styles.button, selected && styles.selected]} onPress={() => onChange(field.type === 'checkboxes' ? selected ? value.filter(v => v !== option) : [...(Array.isArray(value) ? value : []), option] : option)}><Text style={styles.text}>{selected ? '✓ ' : '○ '}{option}</Text></Pressable>;
  })}</View>;
  return <View><Input label={field.type === 'date' ? `${label} (YYYY-MM-DD)` : label} value={String(value ?? '')} multiline={field.type === 'textarea'} autoCapitalize={field.type === 'email' ? 'none' : 'sentences'} keyboardType={{ email: 'email-address', phone: 'phone-pad', number: 'decimal-pad' }[field.type] || 'default'} onChangeText={onChange} />{field.description ? <Text style={styles.muted}>{field.description}</Text> : null}</View>;
}
const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 140, backgroundColor: colors.background },
  panel: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, marginVertical: spacing.sm, gap: spacing.sm },
  summary: { backgroundColor: colors.blueSoft, padding: spacing.lg, borderRadius: radius.lg, marginVertical: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  title: { color: colors.navy, fontSize: 21, fontWeight: '700' },
  eyebrow: { color: colors.tealDark, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  text: { color: colors.text, fontSize: 15 }, muted: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  warning: { color: colors.text, backgroundColor: colors.amberSoft, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md, fontSize: 12, lineHeight: 18 },
  message: { color: colors.tealDark, backgroundColor: colors.tealSoft, padding: spacing.md, borderRadius: radius.md, marginVertical: spacing.sm },
  flex: { flex: 1, color: colors.text }, inputGroup: { marginVertical: spacing.sm },
  label: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: spacing.sm },
  input: { backgroundColor: colors.background, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, minHeight: 48, padding: spacing.md },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  button: { minHeight: 44, justifyContent: 'center', padding: spacing.md, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, marginVertical: 3 },
  buttonText: { color: colors.tealDark, fontSize: 13, fontWeight: '600' }, primary: { backgroundColor: colors.blue }, primaryText: { color: colors.onPrimary, textAlign: 'center' },
  selected: { backgroundColor: colors.blueSoft, borderColor: colors.blue }, disabled: { opacity: 0.4 },
  answer: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
});
