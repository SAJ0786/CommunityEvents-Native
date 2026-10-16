import React, { useRef, useState } from 'react';
import { Image, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import CreateEventForm from '../components/CreateEventForm';
import NativeDateTimeField from '../components/NativeDateTimeField';
import { Action, Input, styles } from './RegistrationControls';
import { FIELD_TYPES, FORM_TEMPLATES, TERMS_LIMIT, closingDateError, consentLast, makeField, moveField, publicNotesError, publicSuburbError, templateFields, validateDraft } from './prototypeModel';
import { normalisePrivateVenue } from './privateVenue';
import { normalEventFromRegistrationDraft, registrationDraftFromNormalEvent } from './registrationViewModel';

// No local persistence: private venue and answers must not enter an unencrypted draft cache.
export default function RegistrationEditor({
 initialDraft, eventId, city, defaultHostName = '', defaultHostPhone = '', savedTemplates, hasMoreTemplates, onMoreTemplates, busy, onSave, onSaveTemplate, onCancel, hasPoster = false, onRemovePoster, initialStep = 'event' }) {
  const [draft, setDraft] = useState(initialDraft);
  const [step, setStep] = useState(initialStep);
  const [error, setError] = useState('');
  const [templateName, setTemplateName] = useState('');
  const serial = useRef(0);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const change = (id, fields) => update('fields', draft.fields.map(field => field.id === id ? { ...field, ...fields } : field));
  const choose = template => { setDraft(current => ({ ...current, fields: consentLast(JSON.parse(JSON.stringify(template.fields))), purpose: template.purpose || current.purpose })); setStep('form'); };
  const save = () => {
    const errors = validateDraft(draft);
    if (!normalisePrivateVenue(draft.venue)) errors.push('Select a complete address from the suggestions to enable the private map and directions.');
    if (errors.length) { setError(errors.join('\n')); return; }
    setError(''); onSave(draft);
  };
  const acceptEvent = event => {
    const next = registrationDraftFromNormalEvent(draft, event);
    const errors = [!next.title.trim() && 'Enter an event title.', publicSuburbError(next), publicNotesError(next)];
    if (!normalisePrivateVenue(next.venue)) errors.push('Select a complete address from the suggestions to enable the private map and directions.');
    if (errors.some(Boolean)) { setError(errors.filter(Boolean).join('\n')); return; }
    setDraft(next); setError(''); setStep('settings');
  };
  const selectPoster = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      // Expo base64 image data is JPEG. Confirm limits again on the server.
      if (!asset.base64 || asset.base64.length > Math.ceil(5 * 1024 * 1024 / 3) * 4) throw Error('Choose an image up to 5 MB.');
      update('poster', { uri: asset.uri, base64: asset.base64, mime: 'image/jpeg' });
    } catch (failure) { setError(failure.message || 'Could not select poster.'); }
  };
  return <View style={styles.group} pointerEvents={busy ? 'none' : 'auto'}>
    <View style={styles.row}><Action onPress={onCancel}>Back to events</Action>{step !== 'event' && <Action onPress={() => setStep('event')}>Edit event details</Action>}</View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {step === 'event' && <View>
      <Input label="Event title" value={draft.title} maxLength={160} onChangeText={value => update('title', value)} />
      <CreateEventForm registrationMode defaultCity={city} defaultHostName={defaultHostName} defaultHostPhone={defaultHostPhone}
        initialEvent={normalEventFromRegistrationDraft(draft, eventId)} allowUnchangedSubmit submitting={busy}
        title="Event details" subtitle="Registration event — private venue and poster" submitLabel="Continue to registration settings"
        onSubmit={acceptEvent} onCancel={onCancel} />
    </View>}
    {step === 'settings' && <View style={styles.panel}>
      <Text style={styles.title}>Registration settings</Text>
      <Text style={styles.label}>Registration closing date (optional)</Text><NativeDateTimeField accessibilityLabel="Registration closing date" value={draft.closes.slice(0, 10)} onChange={value => update('closes', `${value}T${draft.closes.slice(11) || '18:00'}`)} />
      {closingDateError(draft) ? <Text accessibilityRole="alert" style={styles.error}>{closingDateError(draft)}</Text> : null}
      {draft.closes && <><Text style={styles.label}>Closing time in event city</Text><NativeDateTimeField accessibilityLabel="Registration closing time" mode="time" value={draft.closes.slice(11)} onChange={value => update('closes', `${draft.closes.slice(0, 10)}T${value}`)} /><Action onPress={() => update('closes', '')}>Clear closing date</Action></>}
      <Text style={styles.muted}>Must be on an earlier day than the event. Blank closes at the start of the event day in the selected city's timezone.</Text>
      <Input label="Capacity (places)" value={String(draft.capacity)} keyboardType="number-pad" onChangeText={value => update('capacity', value)} />
      <View style={styles.row}><Text style={styles.flex}>Allow attendee cancellation before event day</Text><Switch value={draft.allowCancellation} onValueChange={value => update('allowCancellation', value)} /></View>
      <Action onPress={selectPoster}>Select private poster</Action>
      {hasPoster && <Action onPress={onRemovePoster}>Remove existing private poster</Action>}
      {draft.poster && <><Image source={{ uri: draft.poster.uri }} style={styles.poster} resizeMode="contain" /><Action onPress={() => update('poster', null)}>Discard selected poster</Action></>}
      <Text style={styles.muted}>A newly selected poster uploads after event details save. Only registrants, the host and authorised admins can see it.</Text>
      <Action primary onPress={() => setStep('templates')}>Choose registration form</Action>
    </View>}
    {step === 'templates' && <View style={styles.panel}>
      <Text style={styles.title}>Use a template or build your own?</Text><Text style={styles.muted}>Every template can be customised by adding, changing or removing questions.</Text>
      {FORM_TEMPLATES.map(template => <Action key={template.name} onPress={() => choose({ fields: templateFields(template) })}>{template.name}</Action>)}
      {savedTemplates.map(template => <Action key={template.id} onPress={() => choose(template)}>{template.name} (saved)</Action>)}
      {hasMoreTemplates && <Action onPress={onMoreTemplates}>Load more templates</Action>}
      <Action onPress={() => choose({ fields: [] })}>Build my own form</Action><Action primary onPress={() => setStep('form')}>Continue current form</Action>
    </View>}
    {step === 'form' && <>
      <Input label="Why are you collecting these answers?" value={draft.purpose} multiline maxLength={1000} onChangeText={value => update('purpose', value)} />
      {draft.fields.map((field, index) => <View key={field.id} style={styles.panel}>
        <Text style={styles.label}>Question {index + 1} · {field.type}</Text>
        <Input label="Question" value={field.label} maxLength={200} onChangeText={value => change(field.id, { label: value })} />
        <Input label="Help text" value={field.description || ''} maxLength={500} onChangeText={value => change(field.id, { description: value })} />
        {['select', 'radio', 'checkboxes'].includes(field.type) && <Input label="Options (one per line)" value={field.options.join('\n')} multiline onChangeText={value => change(field.id, { options: value.split('\n') })} />}
        {field.type === 'consent' && <><Input label="Your terms and conditions" value={field.terms || ''} multiline maxLength={TERMS_LIMIT} onChangeText={value => change(field.id, { terms: value })} /><Text style={styles.muted}>{(field.terms || '').length}/{TERMS_LIMIT}. Describe exactly what attendees agree to. Agreement stays last.</Text></>}
        <View style={styles.row}><Text style={styles.flex}>Required</Text><Switch disabled={field.type === 'consent'} value={field.required} onValueChange={value => change(field.id, { required: value })} /></View>
        <View style={styles.row}><Action onPress={() => update('fields', moveField(draft.fields, index, -1))}>Move up</Action><Action onPress={() => update('fields', moveField(draft.fields, index, 1))}>Move down</Action><Action onPress={() => update('fields', draft.fields.filter(item => item.id !== field.id))}>Remove</Action></View>
      </View>)}
      <View style={styles.panel}><Text style={styles.title}>Add a question</Text><View style={styles.row}>{FIELD_TYPES.map(([type, label]) => <Action key={type} disabled={draft.fields.length >= 30} onPress={() => {
        update('fields', consentLast([...draft.fields, makeField(type, `q-${Date.now()}-${++serial.current}`)]));
        if (type === 'consent') setError(`Write your own terms and conditions (up to ${TERMS_LIMIT} characters). The agreement remains at the end.`);
      }}>{label}</Action>)}</View></View>
      <View style={styles.panel}><Input label="Save reusable template as" value={templateName} maxLength={80} onChangeText={setTemplateName} /><Action disabled={!templateName.trim()} onPress={() => onSaveTemplate({ name: templateName, fields: draft.fields, purpose: draft.purpose })}>Save template (no venue or answers)</Action></View>
      <Text style={styles.muted}>New events and changes to approved events require super administrator approval. While changes are reviewed, the published event and registration form remain live and unchanged. No notifications or emails are sent.</Text>
      <Action primary onPress={save}>Save event and registration form</Action>
    </>}
  </View>;
}
