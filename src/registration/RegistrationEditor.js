import EventPosterPicker from '../components/EventPosterPicker';
import { registrationPosterAsset } from './posterAsset';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import CreateEventForm from '../components/CreateEventForm';
import NativeDateTimeField from '../components/NativeDateTimeField';
import { Action, IconAction, Input, styles } from './RegistrationControls';
import { FIELD_TYPES, FORM_TEMPLATES, TERMS_LIMIT, closingDateError, consentLast, makeField, moveField, publicNotesError, publicSuburbError, templateFields, validateDraft } from './prototypeModel';
import { normalisePrivateVenue } from './privateVenue';
import { normalEventFromRegistrationDraft, registrationDraftFromNormalEvent, registrationOccurrenceDefaults, validateRegistrationOccurrences } from './registrationViewModel';
import { registrationOccurrencePreview } from './registrationRecurrence';
import { getHijriParts } from '../services/hijri';
import { getHijriSettings } from '../services/settings';
import { applyPrayerOffset, calculatePrayerTimes } from '../services/prayerTimes';
import { getCityDefinition } from '../utils/cities';

// No local persistence: private venue and answers must not enter an unencrypted draft cache.
export default function RegistrationEditor({
 initialDraft, eventId, city, defaultHostName = '', defaultHostPhone = '', savedTemplates, hasMoreTemplates, onMoreTemplates, busy, onSave, onSaveTemplate, onCancel, hasPoster = false, onRemovePoster, initialStep = 'event' }) {
  const [draft, setDraft] = useState(initialDraft);
  const [step, setStep] = useState(initialStep);
  const [previewPlaces, setPreviewPlaces] = useState(2);
  const [error, setError] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [rule, setRule] = useState({ calendarType: 'gregorian', frequency: 'week', repeatEvery: 1, endMode: 'count', occurrenceCount: 4 });
  const [calendar, setCalendar] = useState(null);
  const [preview, setPreview] = useState(null);
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => {
    let active = true;
    getHijriSettings().then(settings => { if (active) setCalendar(settings.overrides || []); })
      .catch(() => { if (active) setError('Could not load the trusted Hijri calendar. Retry opening this form before creating a recurring event.'); });
    return () => { active = false; };
  }, []);
  const prayer = { applyPrayerOffset, calculatePrayerTimes };
  const previewKey = JSON.stringify([rule, calendar, draft.date, draft.capacity, draft.closes, draft.startTime, draft.endTime, draft.timeMode, draft.prayerName, draft.prayerOffsetMinutes, draft.prayerTimeZone, draft.enteredAsHijri, draft.hijriDay, draft.hijriMonth, draft.hijriYear, draft.venue]);
  const currentPreview = preview?.key === previewKey ? preview : null;
  const changeRule = fields => { setRule(current => ({ ...current, ...fields })); setReviewed(false); };
  const generatePreview = () => {
    try {
      if (calendar === null) throw Error('Wait for the trusted Hijri calendar to load, or reopen the form if loading failed.');
      const recurrence = { ...rule };
      if (recurrence.calendarType === 'hijri') recurrence.startHijri = draft.enteredAsHijri
        ? { day: Number(draft.hijriDay), month: Number(draft.hijriMonth), year: Number(draft.hijriYear) }
        : getHijriParts(draft.date, calendar);
      const dates = registrationOccurrencePreview(draft.date, recurrence, calendar);
      const rows = registrationOccurrenceDefaults(draft, dates, prayer, getCityDefinition(city));
      setPreview({ key: previewKey, recurrence, rows }); setReviewed(false); setError('');
    } catch (failure) { setPreview(null); setError(failure.message); }
  };
  const updateOccurrence = (index, fields) => {
    setPreview(current => ({ ...current, rows: current.rows.map((row, i) => i === index ? { ...row, ...fields } : row) }));
    setReviewed(false);
  };
  const serial = useRef(0);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const change = (id, fields) => update('fields', draft.fields.map(field => field.id === id ? { ...field, ...fields } : field));
  const choose = template => { setDraft(current => ({ ...current, fields: consentLast(JSON.parse(JSON.stringify(template.fields))), purpose: template.purpose || current.purpose })); setStep('form'); };
  const save = () => {
    let next = draft, series;
    if (!eventId && recurring) {
      try {
        if (!currentPreview || !reviewed) throw Error('Preview and confirm every occurrence before saving.');
        validateRegistrationOccurrences(draft, currentPreview.rows, prayer, getCityDefinition(city));
        next = { ...draft, ...currentPreview.rows[0] };
        series = { recurrence: currentPreview.recurrence, occurrences: currentPreview.rows };
      } catch (failure) { setError(failure.message); return; }
    }
    const errors = validateDraft(next);
    if (!normalisePrivateVenue(draft.venue)) errors.push('Select a complete address from the suggestions to enable the private map and directions.');
    if (errors.length) { setError(errors.join('\n')); return; }
    setError(''); onSave(next, series);
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
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw Error('Allow photo access to choose an event poster.');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
      if (result.canceled) return;
      update('poster', registrationPosterAsset(result.assets[0]));
      setError('');
    } catch (failure) { setError(failure.message || 'Could not select poster.'); }
  };
  return <View style={styles.group} pointerEvents={busy ? 'none' : 'auto'}>
    {step !== 'event' && <Action onPress={() => setStep('event')}>Edit event details</Action>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {step === 'event' && <View>
      <CreateEventForm registrationMode registrationTitle={draft.title} onRegistrationTitleChange={value => update('title', value)} defaultCity={city} defaultHostName={defaultHostName} defaultHostPhone={defaultHostPhone}
        registrationPosterControl={<EventPosterPicker uri={draft.poster?.uri} hasPoster={hasPoster} privatePoster onChoose={selectPoster} onRemove={draft.poster ? () => update('poster', null) : onRemovePoster} disabled={busy} />}
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
      {eventId ? <Text style={styles.muted}>Editing only this occurrence. Other occurrences, bookings and closing dates remain unchanged.</Text> : <View style={styles.group}>
        <Text style={styles.title}>Frequency</Text>
        <View style={styles.row}><Action onPress={() => setRecurring(false)}>{!recurring ? '✓ ' : ''}One-time</Action><Action onPress={() => setRecurring(true)}>{recurring ? '✓ ' : ''}Recurring</Action></View>
        {recurring && <>
          <Text style={styles.label}>Repeat calendar</Text>
          <View style={styles.row}>{['gregorian', 'hijri'].map(calendarType => <Action key={calendarType} onPress={() => changeRule({ calendarType })}>{rule.calendarType === calendarType ? '✓ ' : ''}{calendarType === 'hijri' ? 'Hijri' : 'Gregorian'}</Action>)}</View>
          <View style={styles.row}>{[['Daily', 'day', 1], ['Weekly', 'week', 1], ['Fortnightly', 'week', 2], ['Monthly', 'month', 1], ['Yearly', 'year', 1]].map(([label, frequency, repeatEvery]) => <Action key={label} onPress={() => changeRule({ frequency, repeatEvery })}>{rule.frequency === frequency && rule.repeatEvery === repeatEvery ? '✓ ' : ''}{label}</Action>)}</View>
          <Input label="Repeat every (1–100)" keyboardType="number-pad" value={String(rule.repeatEvery)} onChangeText={value => changeRule({ repeatEvery: Number(value) })} />
          <View style={styles.row}><Action onPress={() => changeRule({ endMode: 'count' })}>{rule.endMode === 'count' ? '✓ ' : ''}End after a count</Action><Action onPress={() => changeRule({ endMode: 'date' })}>{rule.endMode === 'date' ? '✓ ' : ''}End by date</Action></View>
          {rule.endMode === 'count' ? <Input label={rule.frequency === 'year' ? 'Occurrences (2–5)' : 'Occurrences (2–100)'} keyboardType="number-pad" value={String(rule.occurrenceCount || '')} onChangeText={value => changeRule({ occurrenceCount: Number(value) })} />
            : rule.calendarType === 'gregorian' ? <NativeDateTimeField accessibilityLabel="Recurrence end date" value={rule.endDate || ''} onChange={endDate => changeRule({ endDate })} />
              : <View><Text style={styles.label}>Hijri end date</Text>{['day', 'month', 'year'].map(part => <Input key={part} label={`Hijri end ${part}`} keyboardType="number-pad" value={String(rule.endHijri?.[part] || '')} onChangeText={value => changeRule({ endHijri: { ...rule.endHijri, [part]: Number(value) } })} />)}</View>}
          <Text style={styles.muted}>Every occurrence has its own registration form, bookings, capacity, closing date and approval. Up to 100 occurrences within one year, or 5 yearly occurrences. No series-wide edits or notifications.</Text>
          <Action onPress={generatePreview}>Preview occurrences</Action>
          {!currentPreview && <Text style={styles.muted}>Preview again after changing dates, times, venue, capacity, closing or repeat settings.</Text>}
          {currentPreview && <>
            <Text style={styles.title}>{currentPreview.rows.length} independent occurrences</Text>
            <Text style={styles.muted}>Review every date, city-local clock, capacity and closing below. Blank closing closes at the start of that occurrence's day. A specified closing must be on an earlier day. Prayer starts are recalculated for every date; end clocks remain editable, including overnight.</Text>
            {currentPreview.rows.map((row, index) => <View key={row.date} style={styles.panel}>
              <Text style={styles.label}>Occurrence {index + 1}: {row.date}{row.enteredAsHijri ? ` · Hijri ${row.hijriDay}/${row.hijriMonth}/${row.hijriYear}` : ''}</Text>
              <Input label={`Occurrence ${index + 1} capacity`} keyboardType="number-pad" value={String(row.capacity)} onChangeText={capacity => updateOccurrence(index, { capacity: Number(capacity) })} />
              <Text style={styles.label}>Closing date</Text><NativeDateTimeField accessibilityLabel={`Occurrence ${index + 1} closing date`} value={row.closes.slice(0, 10)} onChange={value => updateOccurrence(index, { closes: `${value}T${row.closes.slice(11) || '18:00'}` })} />
              {row.closes && <><NativeDateTimeField accessibilityLabel={`Occurrence ${index + 1} closing time`} mode="time" value={row.closes.slice(11)} onChange={value => updateOccurrence(index, { closes: `${row.closes.slice(0, 10)}T${value}` })} /><Action onPress={() => updateOccurrence(index, { closes: '' })}>Clear occurrence closing</Action></>}
              {closingDateError(row) ? <Text accessibilityRole="alert" style={styles.error}>{closingDateError(row)}</Text> : null}
              <Text style={styles.label}>Start time {draft.timeMode === 'prayer' ? '(calculated prayer)' : '(optional)'}</Text>
              {draft.timeMode === 'prayer' ? <Text style={styles.text}>{row.startTime}</Text> : <><NativeDateTimeField accessibilityLabel={`Occurrence ${index + 1} start time`} mode="time" value={row.startTime} onChange={startTime => updateOccurrence(index, { startTime })} /><Action onPress={() => updateOccurrence(index, { startTime: '', endTime: '' })}>Date only (clear clocks)</Action></>}
              <Text style={styles.label}>End time (optional; earlier clock means next day)</Text><NativeDateTimeField accessibilityLabel={`Occurrence ${index + 1} end time`} mode="time" value={row.endTime} onChange={endTime => updateOccurrence(index, { endTime })} /><Action onPress={() => updateOccurrence(index, { endTime: '' })}>Clear end time</Action>
            </View>)}
            <View style={styles.row}><Text style={styles.flex}>I reviewed all occurrence dates, clocks, closing dates and capacities</Text><Switch accessibilityLabel="Confirm all independent occurrences" value={reviewed} onValueChange={setReviewed} /></View>
          </>}
        </>}
      </View>}
      <View style={styles.row}><Text style={styles.flex}>Allow attendee cancellation before event day</Text><Switch value={draft.allowCancellation} onValueChange={value => update('allowCancellation', value)} /></View>
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
      <Action onPress={() => setStep('settings')}>Review registration settings and occurrences</Action>
      <Input label="Why are you collecting these answers?" value={draft.purpose} multiline maxLength={1000} onChangeText={value => update('purpose', value)} />
      {draft.fields.map((field, index) => <View key={field.id} style={styles.panel}>
        <Text style={styles.label}>Question {index + 1} · {field.type}</Text>
        <Input label="Question" value={field.label} maxLength={200} onChangeText={value => change(field.id, { label: value })} />
        <Input label="Help text" value={field.description || ''} maxLength={500} onChangeText={value => change(field.id, { description: value })} />
        {['select', 'radio', 'checkboxes'].includes(field.type) && <Input label="Options (one per line)" value={field.options.join('\n')} multiline onChangeText={value => change(field.id, { options: value.split('\n') })} />}
        {field.type === 'consent' && <><Input label="Your terms and conditions" value={field.terms || ''} multiline maxLength={TERMS_LIMIT} onChangeText={value => change(field.id, { terms: value })} /><Text style={styles.muted}>{(field.terms || '').length}/{TERMS_LIMIT}. Describe exactly what attendees agree to. Agreement stays last.</Text></>}
        {field.type !== 'consent' && <View style={styles.row}><Text style={styles.flex}>Per participant (repeat for each place)</Text><Switch value={Boolean(field.perParticipant)} onValueChange={value => change(field.id, {perParticipant:value})} /></View>}
        <View style={styles.row}><Text style={styles.flex}>Required</Text><Switch disabled={field.type === 'consent'} value={field.required} onValueChange={value => change(field.id, { required: value })} /></View>
        <View style={styles.row}><IconAction icon="arrow-up" label="Move question up" disabled={index === 0 || field.type === 'consent'} onPress={() => update('fields', moveField(draft.fields, index, -1))} /><IconAction icon="arrow-down" label="Move question down" disabled={index === draft.fields.length - 1 || field.type === 'consent'} onPress={() => update('fields', moveField(draft.fields, index, 1))} /><IconAction icon="delete-outline" label="Delete question" onPress={() => update('fields', draft.fields.filter(item => item.id !== field.id))} /></View>
      </View>)}
      <View style={styles.panel}><Text style={styles.title}>Add a question</Text><View style={styles.row}>{FIELD_TYPES.map(([type, label]) => <Action key={type} disabled={draft.fields.length >= 30} onPress={() => {
        update('fields', consentLast([...draft.fields, makeField(type, `q-${Date.now()}-${++serial.current}`)]));
        if (type === 'consent') setError(`Write your own terms and conditions (up to ${TERMS_LIMIT} characters). The agreement remains at the end.`);
      }}>{label}</Action>)}</View></View>
      {draft.fields.some(field => field.perParticipant) && <View style={styles.panel}><Text style={styles.title}>Participant form preview</Text><View style={styles.row}>{[1,2,3,4,5].map(count => <Action key={count} primary={previewPlaces === count} onPress={() => setPreviewPlaces(count)}>{count}</Action>)}</View>{registrationFieldGroups(draft.fields, previewPlaces).map(group => <View key={group.id} style={styles.panel}><Text style={styles.title}>{group.label}</Text>{group.fields.map(field => <Text key={field.id} style={styles.text}>{field.originalLabel || field.label}{field.required ? ' *' : ''}</Text>)}</View>)}</View>}
      <View style={styles.panel}><Input label="Save reusable template as" value={templateName} maxLength={80} onChangeText={setTemplateName} /><Action disabled={!templateName.trim()} onPress={() => onSaveTemplate({ name: templateName, fields: draft.fields, purpose: draft.purpose })}>Save template (no venue or answers)</Action></View>
      <Text style={styles.muted}>New events and changes to approved events require super administrator approval. While changes are reviewed, the published event and registration form remain live and unchanged. The organiser and authorised admins receive the applicable status notifications.</Text>
      <Action primary onPress={save}>Save event and registration form</Action>
    </>}
  </View>;
}
