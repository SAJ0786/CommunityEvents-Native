import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Share, Text, View } from 'react-native';
import KeyboardAwareScrollView from './KeyboardAwareScrollView';
import MemberPageHeader from './MemberPageHeader';
import RegistrationEditor from '../registration/RegistrationEditor';
import { Action, Answer, Input, styles } from '../registration/RegistrationControls';
import { firebaseRegistration } from '../registration/firebaseRegistration';
import { createSubmission, registrationsCsv } from '../registration/registrationClient';
import { answersForReview, eventDraftFromDetail, mergeRegistrationPage } from '../registration/registrationViewModel';
import { createDraft, validateAnswers } from '../registration/prototypeModel';
import { EVENT_TYPES } from '../utils/eventOptions';
import { getDynamicEventOptions } from '../services/eventOptionsAdmin';
import { cityLabel } from '../utils/cities';
import { colors } from '../theme';

const newReference = () => `r-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export default function RegistrationScreen({ enabled = false, user, profile, city, initialCreate = false, initialEventId = null, initialAction = 'entry', onBack, onRequireSignIn, transport }) {
  const api = useMemo(() => transport || firebaseRegistration({ enabled }), [enabled, transport]);
  const [stage, setStage] = useState('loading');
  const [detail, setDetail] = useState(null); const [draft, setDraft] = useState(null);
  const [types, setTypes] = useState(EVENT_TYPES); const [templates, setTemplates] = useState([]); const [templateCursor, setTemplateCursor] = useState(null);
  const [responses, setResponses] = useState([]); const [responseCursor, setResponseCursor] = useState(null);
  const [answers, setAnswers] = useState({}); const [places, setPlaces] = useState('1');
  const [pendingPoster, setPendingPoster] = useState(null);
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [obscured, setObscured] = useState(false);
  const busyRef = useRef(false); const epoch = useRef(0); const currentId = useRef(null);
  const createKey = useRef(newReference()); const submission = useRef(null);
  const stageRef = useRef(stage); stageRef.current = stage;
  const member = Boolean(user?.uid && !user.isAnonymous);

  async function run(work) {
    if (!enabled || busyRef.current) return;
    const token = epoch.current; busyRef.current = true; setBusy(true); setNotice('');
    try { await work(() => token === epoch.current); }
    catch (error) { if (token === epoch.current) setNotice(error?.message || 'Could not complete the request. Reload and try again.'); }
    finally { if (token === epoch.current) { busyRef.current = false; setBusy(false); } }
  }
  const requireMember = () => { if (member) return true; onRequireSignIn?.('Sign in to register for or organise an event.'); return false; };
  const open = (eventId, action = 'entry') => run(async valid => {
    setDetail(null); setAnswers({}); setResponses([]);
    const result = await api.load(eventId);
    if (!valid()) return;
    currentId.current = eventId; setDetail(result);
    if (action === 'entry') {
      if (!requireMember()) return;
      setAnswers(answersForReview(result)); setPlaces(String(result.ownRegistration?.status === 'registered' ? result.ownRegistration.places : 1)); setStage('entry');
    } else if (action === 'editor' || action === 'form' || action === 'copy') {
      const options = await getDynamicEventOptions();
      if (!valid()) return;
      const eventTypes = [...new Set([...EVENT_TYPES, ...(options.eventTypes || [])])];
      setTypes(eventTypes); setDraft(eventDraftFromDetail(result, eventTypes)); setStage('editor');
      if (action === 'copy') { createKey.current = newReference(); currentId.current = null; setDetail(null); }
      await loadTemplates(valid);
    } else if (action === 'responses') {
      const page = await api.responses(eventId);
      if (valid()) { setResponses(page.registrations); setResponseCursor(page.nextCursor); setStage('responses'); }
    } else if (['confirmation', 'host-confirmation'].includes(action)) setStage(action);
  });
  async function loadTemplates(valid, next = null) {
    const result = await api.templates(next);
    if (valid()) { setTemplates(current => mergeRegistrationPage(next ? current : [], result.templates)); setTemplateCursor(result.nextCursor); }
  }
  const edit = (isNew = false) => {
    if (!requireMember()) return;
    run(async valid => {
      const options = await getDynamicEventOptions();
      const eventTypes = [...new Set([...EVENT_TYPES, ...(options.eventTypes || [])])];
      const fresh = isNew ? null : await api.load(detail.event.id);
      if (!valid()) return;
      if (isNew) { createKey.current = newReference(); currentId.current = null; setDetail(null); }
      else setDetail(fresh);
      setTypes(eventTypes); setDraft(isNew ? { ...createDraft(), title: '', eventType: eventTypes[0], customEventType: '' } : eventDraftFromDetail(fresh, eventTypes));
      setStage('editor'); setPendingPoster(null);
      await loadTemplates(valid);
    });
  };
  useEffect(() => {
    if (!enabled) return undefined;
    if (initialEventId) open(initialEventId, initialAction); else if (initialCreate && member) edit(true);
    return () => { epoch.current++; busyRef.current = false; };
  }, [enabled]); // Parent keys this screen by account and selected city.
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state === 'background' && stageRef.current !== 'editor') {
        // Do not leave private posters/responses visible in a backgrounded screen.
        epoch.current++; busyRef.current = false; setBusy(false); setObscured(true); setResponses([]); setAnswers({});
      } else if (state === 'active' && stageRef.current !== 'editor') {
        setObscured(false);
        if (currentId.current) open(currentId.current, ['confirmation', 'host-confirmation'].includes(stageRef.current) ? stageRef.current : initialAction);
      }
    });
    return () => listener.remove();
  }, [api, enabled, city]);

  const save = nextDraft => run(async valid => {
    const result = await api.save({ ...(detail ? { eventId: detail.event.id, expectedRevision: detail.event.revision } : { createKey: createKey.current }), city: detail?.event.city || city, draft: nextDraft });
    if (!valid()) return;
    currentId.current = result.eventId;
    let posterError = '';
    if (nextDraft.poster) {
      try { await api.uploadPoster(result.eventId, result.revision, nextDraft.poster.mime, nextDraft.poster.base64); if (valid()) setPendingPoster(null); }
      catch (error) { posterError = `Event saved, but poster upload failed: ${error.message}. Open the event card to retry.`; if (valid()) setPendingPoster(nextDraft.poster); }
    }
    const fresh = await api.load(result.eventId);
    if (!valid()) return;
    setDetail(fresh); setStage('host-confirmation'); setDraft(null); setNotice(posterError || (fresh.event.hasPendingChanges ? 'Changes submitted for super administrator review. The published event and form remain live and unchanged.' : 'Saved for super administrator review. The event is not public until approved.'));
  });
  const startEntry = () => {
    if (!requireMember()) return;
    run(async valid => {
      const fresh = await api.load(detail.event.id);
      if (!valid()) return;
      setDetail(fresh); setAnswers(answersForReview(fresh)); setPlaces(String(fresh.ownRegistration?.status === 'registered' ? fresh.ownRegistration.places : 1)); submission.current = null; setStage('entry');
    });
  };
  const submit = () => {
    const errors = validateAnswers(detail.form.fields, answers, places, detail.event.capacity);
    if (Object.keys(errors).length) { setNotice(Object.entries(errors).map(([id, error]) => `${detail.form.fields.find(field => field.id === id)?.label || 'Places'}: ${error}`).join('\n')); return; }
    if (!submission.current) submission.current = createSubmission(detail.event.id, detail.form.version, detail.ownRegistration, answers, places, newReference());
    run(async valid => {
      await api.submit(submission.current);
      const fresh = await api.load(detail.event.id);
      if (!valid()) return;
      setDetail(fresh); submission.current = null; setAnswers({}); setStage('confirmation');
    });
  };
  const responsePage = (next = null) => run(async valid => {
    const result = await api.responses(detail.event.id, next);
    if (valid()) { setResponses(current => mergeRegistrationPage(next ? current : [], result.registrations)); setResponseCursor(result.nextCursor); setStage('responses'); }
  });
  const deleteAnswers = row => Alert.alert('Permanently delete answers?', 'This removes the form entries, not the attendee’s reserved places. It cannot be undone.', [
    { text: 'Keep answers', style: 'cancel' }, { text: 'Delete answers', style: 'destructive', onPress: () => run(async valid => {
      await api.deleteAnswers(detail.event.id, row.registrationId, row.revision, 'DELETE ANSWERS');
      if (valid()) { setResponses(current => current.filter(item => item.registrationId !== row.registrationId)); setNotice('Answers deleted. Booking status and places are unchanged. Reload responses to see current metadata.'); }
    }) },
  ]);
  const posterChange = remove => Alert.alert(remove ? 'Remove private poster?' : 'Retry poster upload?', 'For approved events, poster changes are staged for review. The published poster stays unchanged until approval.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: () => run(async valid => {
      if (remove) await api.removePoster(detail.event.id, detail.event.revision);
      else await api.uploadPoster(detail.event.id, detail.event.revision, pendingPoster.mime, pendingPoster.base64);
      const fresh = await api.load(detail.event.id);
      if (valid()) { setPendingPoster(null); setDetail(fresh); setNotice(fresh.event.hasPendingChanges ? 'Poster change submitted for review. The published poster remains unchanged until approval.' : 'Private poster updated.'); }
    }) },
  ]);
  if (!enabled) return <View style={styles.panel}><Text style={styles.text}>Registration is not enabled for this release.</Text><Action onPress={onBack}>Back</Action></View>;
  if (obscured) return <View style={styles.panel}><Text style={styles.muted}>Private event details hidden while the app is inactive.</Text></View>;
  return <KeyboardAwareScrollView contentContainerStyle={styles.content}>
    <MemberPageHeader title={stage === 'responses' ? 'Registration responses' : stage === 'editor' ? 'Edit event and registration form' : 'Event registration'} subtitle={cityLabel(city)} icon="clipboard-text-outline" tone="teal" />
    <View style={styles.row}><Action disabled={busy} onPress={onBack}>Back to events</Action></View>
    {busy && <ActivityIndicator color={colors.tealDark} />}
    {notice ? <Text accessibilityRole="alert" style={styles.error}>{notice}</Text> : null}
    <View pointerEvents={busy ? 'none' : 'auto'}>
    {stage === 'editor' && draft && <RegistrationEditor initialDraft={draft} eventId={detail?.event.id} city={detail?.event.city || city} defaultHostName={profile?.fullName || user?.displayName || ''} defaultHostPhone={profile?.phone || user?.phoneNumber || ''}
      initialStep={initialAction === 'form' ? 'form' : 'event'} eventTypes={types} savedTemplates={templates} hasMoreTemplates={Boolean(templateCursor)} onMoreTemplates={() => run(valid => loadTemplates(valid, templateCursor))} busy={busy} onSave={save} onCancel={onBack} hasPoster={(detail?.pendingChanges || detail)?.privateDetails?.hasPoster} onRemovePoster={() => posterChange(true)} onSaveTemplate={template => run(async valid => {
      await api.saveTemplate({ ...template, templateId: newReference() }); await loadTemplates(valid); if (valid()) setNotice('Template saved to your account.');
    })} />}
    {detail && stage === 'entry' && <View style={styles.panel}>
      <Text style={styles.title}>{detail.ownRegistration?.status === 'registered' ? 'Edit registration' : 'Register'} · {detail.event.title}</Text>
      {detail.ownRegistration && detail.ownRegistration.formVersion !== detail.form.version && <Text style={styles.error}>The organiser changed the form. Review every question and agree to the current terms again.</Text>}
      <Text style={styles.text}>{detail.form.purpose}</Text><Text style={styles.muted}>{detail.retention?.notice}</Text>
      <Input label="Number of places" value={places} keyboardType="number-pad" onChangeText={value => { submission.current = null; setPlaces(value); }} />
      {detail.form.fields.map(field => <View key={field.id}><Answer field={field} value={answers[field.id]} onChange={value => { submission.current = null; setAnswers(current => ({ ...current, [field.id]: value })); }} />{field.description ? <Text style={styles.muted}>{field.description}</Text> : null}</View>)}
      <Action primary onPress={submit}>Submit registration</Action><Action onPress={onBack}>Back to events</Action>
    </View>}
    {detail && ['confirmation', 'host-confirmation'].includes(stage) && <View style={styles.panel}>
      <Text style={styles.title}>{stage === 'confirmation' ? 'Registration confirmed' : 'Event and form saved'}</Text>
      <Text style={styles.text}>{detail.event.title}</Text>
      <Text style={styles.muted}>{stage === 'confirmation' ? `${detail.ownRegistration?.places || 0} places reserved.` : detail.event.hasPendingChanges ? 'Changes await super administrator approval. The published event and form remain unchanged.' : detail.event.status === 'pending' ? 'Awaiting super administrator approval. Your event appears in My Events until approved.' : 'Changes saved.'}</Text>
      <Action primary onPress={onBack}>Back to events</Action><Action onPress={() => stage === 'confirmation' ? startEntry() : edit()}>{stage === 'confirmation' ? 'Edit registration' : 'Edit event or form'}</Action>
      {pendingPoster && <Action onPress={() => posterChange(false)}>Retry selected poster upload</Action>}
    </View>}
    {detail && stage === 'responses' && <View style={styles.group}>
      <Text style={styles.muted}>Only authorised organiser/admin responses are shown. Export includes the loaded pages only; handle personal information securely.</Text>
      <Action onPress={() => run(() => Share.share({ title: 'Registration responses (loaded pages)', message: registrationsCsv(responses) }))}>Share loaded responses as CSV text</Action>
      {responses.map(row => <View key={row.registrationId} style={styles.panel}><Text style={styles.label}>{row.registrationId} · {row.status} · {row.places} places</Text>{(row.fields || []).map(field => <View key={field.id}><Text style={styles.label}>{field.label}</Text><Text style={styles.text}>{Array.isArray(row.answers[field.id]) ? row.answers[field.id].join(', ') : row.answers[field.id] === true ? 'Agreed' : String(row.answers[field.id] ?? '')}</Text></View>)}{row.answersDeletedAt ? <Text style={styles.muted}>Answers deleted.</Text> : <Action onPress={() => deleteAnswers(row)}>Permanently delete answers only</Action>}</View>)}
      {responseCursor && <Action onPress={() => responsePage(responseCursor)}>Load more responses</Action>}<Action onPress={onBack}>Back to events</Action>
    </View>}
    </View>
  </KeyboardAwareScrollView>;
}
