import React, { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import KeyboardAwareScrollView from './KeyboardAwareScrollView';
import MemberPageHeader from './MemberPageHeader';
import { colors, radius, spacing, typography } from '../theme';
import { FIELD_TYPES, STANDARD_FIELDS, FORM_TEMPLATES, TERMS_LIMIT, NOTES_LIMIT, templateFields, consentLast, resolvedEventType, createDraft, makeField, moveField, validateDraft, validateAnswers, snapshotBooking } from '../registration/prototypeModel';
import { closingDateError, publicNotesError, publicSuburbError, publicEvent } from '../registration/prototypeModel';
import { EVENT_TYPES } from '../utils/eventOptions';

// Deliberately no Firebase imports. This screen is accessible only in development.
export default function RegistrationPrototypeScreen({ onBack, eventTypes = EVENT_TYPES }) {
  const [stage, setStage] = useState(0);
  const [draft, setDraft] = useState(createDraft);
  const [answers, setAnswers] = useState({});
  const [places, setPlaces] = useState('1');
  const [message, setMessage] = useState('');
  const [booking, setBooking] = useState(null);
  const [saved, setSaved] = useState(null);
  const [template, setTemplate] = useState(null);
  const [published, setPublished] = useState(null);
  const [viewer, setViewer] = useState('public');
  const serial = useRef(0);
  const scroll = useRef(null);
  const titles = ['Event setup', 'Build registration form', 'Attendee preview', 'Demo confirmation', 'Registration response', 'Choose form starting point', 'Host confirmation', 'Event card'];
  const go = next => { setStage(next); setMessage(''); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const changeField = (id, changes) => update('fields', draft.fields.map(field => field.id === id ? { ...field, ...changes } : field));
  const add = field => {
    if (draft.fields.length >= 30) { setMessage('Use no more than 30 questions in this prototype.'); return; }
    update('fields', consentLast([...draft.fields, { description: '', options: [], terms: '', ...field, id: `${field.id || 'custom'}-${++serial.current}` }]));
    if (field.type === 'consent') setMessage(`Write your terms and conditions before using this agreement. Limit ${TERMS_LIMIT} characters. Agreement stays at the end.`);
  };
  const preview = () => { const errors = validateDraft(draft); if (errors.length) setMessage(errors.join('\n')); else go(2); };
  const submit = () => {
    const errors = validateAnswers(draft.fields, answers, places, draft.capacity);
    if (Object.keys(errors).length) { setMessage(Object.entries(errors).map(([id, error]) => `${id === 'places' ? 'Places' : draft.fields.find(f => f.id === id)?.label}: ${error}`).join('\n')); return; }
    setBooking(snapshotBooking(draft, answers, places)); go(3);
  };
  const chooseTemplate = fields => { update('fields', consentLast(JSON.parse(JSON.stringify(fields)))); setAnswers({}); go(1); };
  const finishHost = () => { const errors = validateDraft(draft); if (errors.length) setMessage(errors.join('\n')); else { setPublished(JSON.parse(JSON.stringify(draft))); go(6); } };
  const selectPoster = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) { setMessage('Choose a poster smaller than 5 MB.'); return; }
      update('poster', { uri: asset.uri, name: asset.fileName || 'Event poster' });
    } catch { setMessage('The poster could not be selected. Please try again.'); }
  };
  const card = published || draft;
  const publicCard = publicEvent(card);
  const closeError = closingDateError(draft);
  const notesError = publicNotesError(draft);
  const suburbError = draft.suburb ? publicSuburbError(draft) : '';
  const canSeePrivate = ['host', 'admin'].includes(viewer) || (viewer === 'registered' && Boolean(booking));
  return <KeyboardAwareScrollView ref={scroll} contentContainerStyle={styles.content}>
    <Text style={styles.warning}>PROTOTYPE ONLY · Fictional details only. No real event, booking, email or Firebase connection. Drafts reset when you leave.</Text>
    <MemberPageHeader title={titles[stage]} subtitle="Registration only events · Single date" icon="clipboard-text-outline" tone="teal" />
    <View style={styles.row}><Action text="Back" onPress={() => stage === 0 ? onBack() : go(({ 1: 5, 5: 0, 2: 7, 3: 2, 4: 7, 6: 1, 7: published ? 6 : 0 })[stage])} /><Text style={styles.muted}>Event registration</Text></View>
    {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
    {stage === 0 && <View style={styles.panel}>
      <Text style={styles.title}>Tell us about your event</Text><Text style={styles.muted}>Only title, type, date and suburb are shown before registration.</Text>
      <Input label="Event title" value={draft.title} onChangeText={value => update('title', value)} />
      <Text style={styles.label}>Event type (same as Add Event)</Text><View style={styles.row}>{[...new Set([...eventTypes, 'Custom'])].map(type => <Action key={type} primary={draft.eventType === type} text={type} onPress={() => update('eventType', type)} />)}</View>
      {draft.eventType === 'Custom' && <Input label="Custom event type" value={draft.customEventType} maxLength={80} onChangeText={value => update('customEventType', value)} />}
      <Input label="Event date (YYYY-MM-DD)" value={draft.date} onChangeText={value => update('date', value)} />
      <Input label="Full address — private" multiline value={draft.address} maxLength={500} onChangeText={value => update('address', value)} />
      <Input error={suburbError} label="Confirm public suburb (no street or unit)" value={draft.suburb} maxLength={100} onChangeText={value => update('suburb', value)} />
      <Input error={notesError} label="Detailed notes — public" multiline value={draft.notes} maxLength={NOTES_LIMIT} onChangeText={value => update('notes', value)} /><Text style={styles.muted}>Do not include confidential details or the full address in public notes.</Text>
      <Input error={closeError} label="Registration closes (optional, YYYY-MM-DDTHH:mm)" value={draft.closes} maxLength={16} onChangeText={value => update('closes', value)} /><Text style={styles.muted}>Must be on an earlier day than the event. Blank means the start of the event day.</Text>
      <Action text="Choose private event poster" onPress={selectPoster} />{draft.poster && <><Image source={{ uri: draft.poster.uri }} style={styles.poster} resizeMode="contain" accessibilityLabel="Private poster preview" /><Action text="Remove poster" onPress={() => update('poster', null)} /></>}
      <Input label="Capacity in places" value={String(draft.capacity)} keyboardType="number-pad" onChangeText={value => update('capacity', value)} />
      <Text style={styles.muted}>A family of three uses three places. Server availability is not connected in this preview.</Text>
      <View style={styles.row}><Text style={styles.flex}>Allow attendee cancellation</Text><Switch accessibilityLabel="Allow attendee cancellation" value={draft.allowCancellation} onValueChange={value => update('allowCancellation', value)} /></View>
      <Action primary text="Choose registration form" onPress={() => go(5)} />
    </View>}
    {stage === 5 && <View style={styles.panel}><Text style={styles.title}>Use a template or build your own?</Text><Text style={styles.muted}>Every template can be edited. Add or remove questions to suit your event.</Text>{FORM_TEMPLATES.map(item => <Action key={item.name} text={item.name} onPress={() => chooseTemplate(templateFields(item))} />)}{template && <Action text="My saved template" onPress={() => chooseTemplate(template)} />}<Action primary text="Build my own form" onPress={() => chooseTemplate([])} /><Action text="Continue current form" onPress={() => go(1)} /></View>}
    {stage === 1 && <>
      <View style={styles.panel}><Input label="Why are you collecting these answers?" multiline value={draft.purpose} onChangeText={value => update('purpose', value)} /><View style={styles.row}><Action text="Save demo draft" onPress={() => { setSaved(JSON.parse(JSON.stringify(draft))); setMessage('Draft saved for this screen session only.'); }} />{saved && <Action text="Restore draft" onPress={() => { setDraft(JSON.parse(JSON.stringify(saved))); setAnswers({}); setMessage('Demo draft restored.'); }} />}</View></View>
      {draft.fields.map((field, index) => <View key={field.id} style={styles.panel}>
        <Text style={styles.eyebrow}>QUESTION {index + 1} · {FIELD_TYPES.find(([type]) => type === field.type)?.[1]}</Text>
        <Input label="Question" value={field.label} maxLength={200} onChangeText={value => changeField(field.id, { label: value })} />
        <Input label="Help text (optional)" value={field.description} maxLength={500} onChangeText={value => changeField(field.id, { description: value })} />
        {['select', 'radio', 'checkboxes'].includes(field.type) && <Input label="Options — one per line" multiline value={field.options.join('\n')} onChangeText={value => changeField(field.id, { options: value.split('\n') })} />}
        {field.type === 'consent' && <><Input label="Terms and conditions *" multiline value={field.terms || ''} maxLength={TERMS_LIMIT} onChangeText={value => changeField(field.id, { terms: value })} /><Text style={styles.muted}>{(field.terms || '').length}/{TERMS_LIMIT}. State exactly what registrants agree to. Kept at the end.</Text></>}
        <View style={styles.row}><Text style={styles.flex}>Required answer</Text><Switch accessibilityLabel={`${field.label} required`} disabled={field.type === 'consent'} value={field.required} onValueChange={value => changeField(field.id, { required: value })} /></View>
        <View style={styles.row}><Action text="Move up" disabled={index === 0} onPress={() => update('fields', moveField(draft.fields, index, -1))} /><Action text="Move down" disabled={index === draft.fields.length - 1} onPress={() => update('fields', moveField(draft.fields, index, 1))} /><Action text="Remove" onPress={() => update('fields', draft.fields.filter(f => f.id !== field.id))} /></View>
      </View>)}
      <View style={styles.panel}><Text style={styles.title}>Add a question</Text><Text style={styles.muted}>Standard fields</Text><View style={styles.row}>{STANDARD_FIELDS.map(field => <Action key={field.id} text={`+ ${field.label}`} onPress={() => add(field)} />)}</View><Text style={styles.muted}>Custom questions</Text><View style={styles.row}>{FIELD_TYPES.map(([type, label]) => <Action key={type} text={`+ ${label}`} onPress={() => add(makeField(type, 'custom'))} />)}</View></View>
      <View style={styles.panel}><Text style={styles.title}>Reusable form template</Text><Text style={styles.muted}>One session-only template for this native preview.</Text><View style={styles.row}><Action text="Save template" onPress={() => { setTemplate(JSON.parse(JSON.stringify(draft.fields))); setMessage('Template saved for this screen session.'); }} />{template && <Action text="Use template" onPress={() => { update('fields', JSON.parse(JSON.stringify(template))); setAnswers({}); setMessage('Template applied.'); }} />}</View></View>
      <Action primary text="Preview attendee form" onPress={preview} />
      <Action primary text="Finish event and form" onPress={finishHost} />
    </>}
    {stage === 2 && <>
      <View style={styles.summary}><Text style={styles.eyebrow}>REGISTRATION REQUIRED</Text><Text style={styles.title}>{draft.title}</Text><Text style={styles.muted}>{draft.eventType} · {draft.date} · {draft.suburb}</Text><Text style={styles.muted}>Full event details appear only after confirmed registration.</Text></View>
      <View style={styles.panel}><Text style={styles.title}>Your registration</Text><Text style={styles.muted}>{draft.purpose}</Text><Text style={styles.muted}>Previewing a signed-in attendee. Use fictional details.</Text><Input label="Number of attendees *" value={places} keyboardType="number-pad" onChangeText={setPlaces} />
        {draft.fields.map(field => <NativeAnswer key={field.id} field={field} value={answers[field.id]} onChange={value => setAnswers(current => ({ ...current, [field.id]: value }))} />)}
        <Action primary text="Try demo registration" onPress={submit} />
      </View>
    </>}
    {stage === 3 && booking && <View style={styles.panel}><Text style={styles.eyebrow}>PREVIEW RESULT</Text><Text style={styles.title}>Your demo registration is confirmed</Text><Text style={styles.muted}>No real places have been reserved.</Text><Text style={styles.title}>{booking.id} · {booking.places} places</Text><Action text="Edit my entry" onPress={() => go(2)} /><Action primary text="Go to event card" onPress={() => { setViewer('registered'); go(7); }} /></View>}
    {stage === 6 && published && <View style={styles.panel}><Text style={styles.title}>Your event and form are ready for review</Text><Text style={styles.muted}>Demo saved for this screen session only. No real event published.</Text><Action text="Edit event" onPress={() => go(0)} /><Action text="Edit form" onPress={() => go(1)} /><Action primary text="Go to event card" onPress={() => { setViewer('host'); go(7); }} /></View>}
    {stage === 7 && <View style={styles.panel}><Text style={styles.muted}>Simulate viewer (not a real permission switch)</Text><View style={styles.row}>{['public', 'registered', 'host', 'admin'].map(role => <Action key={role} text={role} primary={viewer === role} disabled={role === 'registered' && !booking} onPress={() => setViewer(role)} />)}</View><Text style={styles.eyebrow}>{viewer === 'registered' && booking ? 'REGISTERED' : 'REGISTRATION REQUIRED'}</Text><Text style={styles.title}>{card.title}</Text><Text style={styles.muted}>{resolvedEventType(card)} · {card.date} · {publicCard.suburb || 'Suburb not entered'}</Text><Text style={styles.text}>{publicCard.notes || 'No additional notes.'}</Text>{canSeePrivate ? <><Text style={styles.label}>Private address and poster</Text><Text style={styles.text}>{card.address}</Text>{card.poster && <Image source={{ uri: card.poster.uri }} style={styles.poster} resizeMode="contain" />}</> : <Text style={styles.muted}>Register to see the full address and poster.</Text>}{['host', 'admin'].includes(viewer) ? <><Action text="Edit event" onPress={() => go(0)} /><Action text="Edit form" onPress={() => go(1)} /><Action primary text={`Registrations (${booking ? 1 : 0})`} onPress={() => go(4)} /></> : <Action primary text={viewer === 'registered' ? 'Edit registration' : 'Register for event'} onPress={preview} />}</View>}
    {stage === 4 && !booking && <View style={styles.panel}><Text style={styles.title}>No registrations yet</Text><Action text="Back to event card" onPress={() => go(7)} /></View>}
    {stage === 4 && booking && <View style={styles.panel}><Text style={styles.title}>Read-only response</Text><Text style={styles.muted}>Form version {booking.formVersion} · {booking.places} demo places</Text>{booking.fields.map(field => <View style={styles.answer} key={field.id}><Text style={styles.label}>{field.label}</Text><Text style={styles.text}>{Array.isArray(booking.answers[field.id]) ? booking.answers[field.id].join(', ') : booking.answers[field.id] === true ? 'Agreed' : String(booking.answers[field.id] ?? 'Not provided')}</Text></View>)}<Text style={styles.muted}>Permissions, cancellation, CSV export and live capacity are not connected in this prototype.</Text></View>}
  </KeyboardAwareScrollView>;
}
function Action({ text, onPress, primary, disabled }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={[styles.button, primary && styles.primary, disabled && styles.disabled]}><Text style={[styles.buttonText, primary && styles.primaryText]}>{text}</Text></Pressable>;
}
function Input({ label, error, ...props }) { return <View style={styles.inputGroup}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={[styles.input, props.multiline && styles.multiline]} maxLength={2000} {...props} />{error ? <Text accessibilityRole="alert" style={styles.message}>{error}</Text> : null}</View>; }
function NativeAnswer({ field, value, onChange }) {
  const label = `${field.label}${field.required ? ' *' : ''}`;
  if (field.type === 'consent') return <View><Text style={styles.text}>{field.terms}</Text><View style={styles.row}><Text style={styles.flex}>{label}</Text><Switch accessibilityLabel={label} value={value === true} onValueChange={onChange} /></View></View>;
  if (['select', 'radio', 'checkboxes'].includes(field.type)) return <View style={styles.inputGroup}><Text style={styles.label}>{label}</Text><Text style={styles.muted}>{field.description}</Text>{field.options.map(option => {
    const selected = field.type === 'checkboxes' ? Array.isArray(value) && value.includes(option) : value === option;
    return <Pressable accessibilityRole={field.type === 'checkboxes' ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected }} key={option} style={[styles.button, selected && styles.selected]} onPress={() => onChange(field.type === 'checkboxes' ? selected ? value.filter(v => v !== option) : [...(Array.isArray(value) ? value : []), option] : option)}><Text style={styles.text}>{selected ? '✓ ' : '○ '}{option}</Text></Pressable>;
  })}</View>;
  return <View><Input label={field.type === 'date' ? `${label} (YYYY-MM-DD)` : label} value={String(value ?? '')} multiline={field.type === 'textarea'} autoCapitalize={field.type === 'email' ? 'none' : 'sentences'} keyboardType={{ email: 'email-address', phone: 'phone-pad', number: 'decimal-pad' }[field.type] || 'default'} onChangeText={onChange} />{field.description ? <Text style={styles.muted}>{field.description}</Text> : null}</View>;
}
const styles = StyleSheet.create({
  poster: { width: '100%', height: 280 },
  content: { padding: spacing.lg, paddingBottom: 140, backgroundColor: colors.background },
  panel: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, marginVertical: spacing.sm, gap: spacing.sm },
  summary: { backgroundColor: colors.blueSoft, padding: spacing.lg, borderRadius: radius.lg, marginVertical: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  title: { color: colors.navy, fontSize: 21, fontWeight: '700' },
  eyebrow: { color: colors.tealDark, fontSize: typography.label.fontSize, fontWeight: '700', letterSpacing: 1 },
  text: { color: colors.text, fontSize: 15 }, muted: { color: colors.muted, fontSize: typography.body.fontSize, lineHeight: 20 },
  warning: { color: colors.text, backgroundColor: colors.amberSoft, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md, fontSize: 12, lineHeight: 18 },
  message: { color: colors.tealDark, backgroundColor: colors.tealSoft, padding: spacing.md, borderRadius: radius.md, marginVertical: spacing.sm },
  flex: { flex: 1, color: colors.text }, inputGroup: { marginVertical: spacing.sm },
  label: { color: colors.text, fontSize: typography.cardTitle.fontSize, fontWeight: '600', marginBottom: spacing.sm },
  input: { backgroundColor: colors.background, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, minHeight: 48, padding: spacing.md },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  button: { minHeight: 44, justifyContent: 'center', padding: spacing.md, borderRadius: radius.md, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface, marginVertical: 3 },
  buttonText: { color: colors.tealDark, fontSize: typography.body.fontSize, fontWeight: '600' }, primary: { backgroundColor: colors.blue }, primaryText: { color: colors.onPrimary, textAlign: 'center' },
  selected: { backgroundColor: colors.blueSoft, borderColor: colors.blue }, disabled: { opacity: 0.4 },
  answer: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
});
