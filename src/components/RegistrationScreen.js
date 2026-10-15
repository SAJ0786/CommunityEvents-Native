import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Linking, Platform, Share, Text, View } from 'react-native';
import KeyboardAwareScrollView from './KeyboardAwareScrollView';
import MemberPageHeader from './MemberPageHeader';
import RegistrationEditor from '../registration/RegistrationEditor';
import { Action, Answer, Input, styles } from '../registration/RegistrationControls';
import { firebaseRegistration } from '../registration/firebaseRegistration';
import { createSubmission, registrationsCsv } from '../registration/registrationClient';
import { answersForReview, eventDraftFromDetail, mergeRegistrationPage } from '../registration/registrationViewModel';
import { createDraft, validateAnswers } from '../registration/prototypeModel';
import { privateVenueLinks } from '../registration/privateVenue';
import { EVENT_TYPES } from '../utils/eventOptions';
import { getDynamicEventOptions } from '../services/eventOptionsAdmin';
import { cityLabel } from '../utils/cities';
import { colors } from '../theme';

const newReference = () => `r-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export default function RegistrationScreen({ enabled = false, user, profile, city, initialCreate = false, onBack, onRequireSignIn, transport }) {
  const api = useMemo(() => transport || firebaseRegistration({ enabled }), [enabled, transport]);
  const [stage, setStage] = useState('list'); const [scope, setScope] = useState('public');
  const [items, setItems] = useState([]); const [cursor, setCursor] = useState(null);
  const [detail, setDetail] = useState(null); const [draft, setDraft] = useState(null);
  const [types, setTypes] = useState(EVENT_TYPES); const [templates, setTemplates] = useState([]); const [templateCursor, setTemplateCursor] = useState(null);
  const [responses, setResponses] = useState([]); const [responseCursor, setResponseCursor] = useState(null);
  const [answers, setAnswers] = useState({}); const [places, setPlaces] = useState('1');
  const [poster, setPoster] = useState(null); const [pendingPoster, setPendingPoster] = useState(null);
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [obscured, setObscured] = useState(false);
  const busyRef = useRef(false); const epoch = useRef(0); const currentId = useRef(null);
  const createKey = useRef(newReference()); const submission = useRef(null);
  const stageRef = useRef(stage); stageRef.current = stage;
  const member = Boolean(user?.uid && !user.isAnonymous);
  const admin = ['admin', 'superAdmin'].includes(profile?.role);

  async function run(work) {
    if (!enabled || busyRef.current) return;
    const token = epoch.current; busyRef.current = true; setBusy(true); setNotice('');
    try { await work(() => token === epoch.current); }
    catch (error) { if (token === epoch.current) setNotice(error?.message || 'Could not complete the request. Reload and try again.'); }
    finally { if (token === epoch.current) { busyRef.current = false; setBusy(false); } }
  }
  const requireMember = () => { if (member) return true; onRequireSignIn?.('Sign in to register for or organise an event.'); return false; };
  const list = (nextScope = scope, nextCursor = null) => run(async valid => {
    const result = await api.list({ scope: nextScope, city, cursor: nextCursor });
    if (!valid()) return;
    currentId.current = null; setDetail(null); setPoster(null); setResponses([]); setAnswers({});
    setItems(current => mergeRegistrationPage(nextCursor ? current : [], result.events)); setCursor(result.nextCursor); setScope(nextScope); setStage('list');
  });
  const open = eventId => run(async valid => {
    setPoster(null); setDetail(null); setAnswers({}); setResponses([]);
    const result = await api.load(eventId);
    if (!valid()) return;
    currentId.current = eventId; setDetail(result); setStage('card');
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
    if (initialCreate && member) edit(true); else list('public');
    return () => { epoch.current++; busyRef.current = false; };
  }, [enabled]); // Parent keys this screen by account and selected city.
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state === 'background' && stageRef.current !== 'editor') {
        // Do not leave private posters/responses visible in a backgrounded screen.
        epoch.current++; busyRef.current = false; setBusy(false); setObscured(true); setPoster(null); setResponses([]); setAnswers({});
      } else if (state === 'active' && stageRef.current !== 'editor') {
        setObscured(false);
        if (currentId.current) open(currentId.current); else list('public');
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
    setDetail(fresh); setStage('host-confirmation'); setDraft(null); setNotice(posterError || 'Saved for administrator review. The event is not public until approved.');
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
  const cancel = () => Alert.alert('Delete your registration?', 'Your answers will be deleted, your places released, and access to the private venue and poster removed.', [
    { text: 'Keep registration', style: 'cancel' }, { text: 'Delete registration', style: 'destructive', onPress: () => run(async valid => {
      await api.cancel(detail.event.id, detail.ownRegistration.revision);
      if (!valid()) return;
      setPoster(null); setDetail(null); setAnswers({});
      const fresh = await api.load(currentId.current);
      if (valid()) { setDetail(fresh); setStage('card'); setNotice('Registration and submitted answers deleted.'); }
    }) },
  ]);
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
  const posterChange = remove => Alert.alert(remove ? 'Remove private poster?' : 'Retry poster upload?', 'This sends the event back for administrator approval.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: () => run(async valid => {
      if (remove) await api.removePoster(detail.event.id, detail.event.revision);
      else await api.uploadPoster(detail.event.id, detail.event.revision, pendingPoster.mime, pendingPoster.base64);
      const fresh = await api.load(detail.event.id);
      if (valid()) { setPoster(null); setPendingPoster(null); setDetail(fresh); }
    }) },
  ]);
  const links = detail?.privateDetails ? privateVenueLinks(detail.privateDetails, Platform.OS) : null;
  if (!enabled) return <View style={styles.panel}><Text style={styles.text}>Registration is not enabled for this release.</Text><Action onPress={onBack}>Back</Action></View>;
  if (obscured) return <View style={styles.panel}><Text style={styles.muted}>Private event details hidden while the app is inactive.</Text></View>;
  return <KeyboardAwareScrollView contentContainerStyle={styles.content}>
    <MemberPageHeader title="Registration only events" subtitle={cityLabel(city)} icon="clipboard-text-outline" tone="teal" />
    <View style={styles.row}><Action disabled={busy} onPress={onBack}>Back to Home</Action>{stage !== 'list' && <Action disabled={busy} onPress={() => list(scope)}>Event list</Action>}</View>
    {busy && <ActivityIndicator color={colors.tealDark} />}
    {notice ? <Text accessibilityRole="alert" style={styles.error}>{notice}</Text> : null}
    <View pointerEvents={busy ? 'none' : 'auto'}>
    {stage === 'list' && <View style={styles.group}>
      <View style={styles.row}><Action primary={scope === 'public'} onPress={() => list('public')}>Browse events</Action>{member && <Action primary={scope === 'mine'} onPress={() => list('mine')}>My hosted events</Action>}{admin && <Action primary={scope === 'review'} onPress={() => list('review')}>Review city events</Action>}<Action onPress={() => edit(true)}>Create registration event</Action></View>
      {!items.length && <Text style={styles.muted}>No events on this page.{cursor ? ' Load the next page to continue.' : ''}</Text>}
      {items.map(event => <View key={event.id} style={styles.panel}><Text style={styles.title}>{event.title}</Text><Text style={styles.text}>{event.eventType} · {event.date} · {event.suburb}</Text><Text style={styles.muted}>{event.status} · Registration required</Text><Action onPress={() => open(event.id)}>View event</Action></View>)}
      {cursor && <Action onPress={() => list(scope, cursor)}>Load more events</Action>}
    </View>}
    {stage === 'editor' && draft && <RegistrationEditor initialDraft={draft} eventTypes={types} savedTemplates={templates} hasMoreTemplates={Boolean(templateCursor)} onMoreTemplates={() => run(valid => loadTemplates(valid, templateCursor))} busy={busy} onSave={save} onCancel={() => detail ? setStage('card') : list(scope)} onSaveTemplate={template => run(async valid => {
      await api.saveTemplate({ ...template, templateId: newReference() }); await loadTemplates(valid); if (valid()) setNotice('Template saved to your account.');
    })} />}
    {detail && stage === 'card' && <View style={styles.panel}>
      <Text style={styles.title}>{detail.event.title}</Text><Text style={styles.text}>{detail.event.eventType} · {detail.event.date} · {detail.event.suburb}</Text>
      <Text style={styles.muted}>{detail.ownRegistration?.status === 'registered' ? 'Registered' : 'Registration required'} · {detail.event.status}</Text><Text style={styles.text}>{detail.event.notes}</Text>
      {detail.privateDetails && <><Text style={styles.label}>Private venue</Text><Text style={styles.text}>{detail.privateDetails.address}</Text>{links && <View style={styles.row}><Action onPress={() => run(() => Linking.openURL(links.map))}>View map</Action><Action onPress={() => run(() => Linking.openURL(links.directions))}>Directions</Action></View>}
        {detail.privateDetails.hasPoster && <Action onPress={() => run(async valid => { const result = await api.poster(detail.event.id); if (valid()) setPoster(`data:${result.mime};base64,${result.base64}`); })}>View private poster</Action>}
        {poster && <Image source={{ uri: poster }} style={styles.poster} resizeMode="contain" />}
      </>}
      {!detail.privateDetails && <Text style={styles.muted}>The full address and poster are available after confirmed registration.</Text>}
      {detail.canManage && <><Action onPress={() => edit()}>Edit event or registration form</Action><Action onPress={() => responsePage()}>Registrations ({detail.event.registrationCount || 0})</Action>{detail.privateDetails?.hasPoster && <Action onPress={() => posterChange(true)}>Remove private poster</Action>}{pendingPoster && <Action onPress={() => posterChange(false)}>Retry selected poster upload</Action>}</>}
      {detail.canApprove && detail.event.status === 'pending' && <Action primary onPress={() => run(async valid => { await api.approve(detail.event.id, detail.event.revision); const fresh = await api.load(detail.event.id); if (valid()) { setDetail(fresh); setNotice('Approved.'); } })}>Approve event after reviewing details</Action>}
      {detail.canRegister && <Action primary onPress={startEntry}>{detail.ownRegistration?.status === 'registered' ? 'Edit registration' : 'Register for event'}</Action>}
      {!detail.canRegister && <Text style={styles.muted}>Registration is closed or awaiting approval.</Text>}
      {detail.canCancel && <Action onPress={cancel}>Delete my registration and answers</Action>}
    </View>}
    {detail && stage === 'entry' && <View style={styles.panel}>
      <Text style={styles.title}>{detail.ownRegistration?.status === 'registered' ? 'Edit registration' : 'Register'} · {detail.event.title}</Text>
      {detail.ownRegistration && detail.ownRegistration.formVersion !== detail.form.version && <Text style={styles.error}>The organiser changed the form. Review every question and agree to the current terms again.</Text>}
      <Text style={styles.text}>{detail.form.purpose}</Text><Text style={styles.muted}>{detail.retention?.notice}</Text>
      <Input label="Number of places" value={places} keyboardType="number-pad" onChangeText={value => { submission.current = null; setPlaces(value); }} />
      {detail.form.fields.map(field => <View key={field.id}><Answer field={field} value={answers[field.id]} onChange={value => { submission.current = null; setAnswers(current => ({ ...current, [field.id]: value })); }} />{field.description ? <Text style={styles.muted}>{field.description}</Text> : null}</View>)}
      <Action primary onPress={submit}>Submit registration</Action><Action onPress={() => { setAnswers({}); setStage('card'); }}>Back to event</Action>
    </View>}
    {detail && ['confirmation', 'host-confirmation'].includes(stage) && <View style={styles.panel}>
      <Text style={styles.title}>{stage === 'confirmation' ? 'Registration confirmed' : 'Event and form saved'}</Text>
      <Text style={styles.text}>{detail.event.title}</Text>
      <Text style={styles.muted}>{stage === 'confirmation' ? `${detail.ownRegistration?.places || 0} places reserved.` : 'Awaiting administrator approval. Review your event before it is published.'}</Text>
      <Action primary onPress={() => setStage('card')}>View event details</Action><Action onPress={() => stage === 'confirmation' ? startEntry() : edit()}>{stage === 'confirmation' ? 'Edit registration' : 'Edit event or form'}</Action>
    </View>}
    {detail && stage === 'responses' && <View style={styles.group}>
      <Text style={styles.muted}>Only authorised organiser/admin responses are shown. Export includes the loaded pages only; handle personal information securely.</Text>
      <Action onPress={() => run(() => Share.share({ title: 'Registration responses (loaded pages)', message: registrationsCsv(responses) }))}>Share loaded responses as CSV text</Action>
      {responses.map(row => <View key={row.registrationId} style={styles.panel}><Text style={styles.label}>{row.registrationId} · {row.status} · {row.places} places</Text>{(row.fields || []).map(field => <View key={field.id}><Text style={styles.label}>{field.label}</Text><Text style={styles.text}>{Array.isArray(row.answers[field.id]) ? row.answers[field.id].join(', ') : row.answers[field.id] === true ? 'Agreed' : String(row.answers[field.id] ?? '')}</Text></View>)}{row.answersDeletedAt ? <Text style={styles.muted}>Answers deleted.</Text> : <Action onPress={() => deleteAnswers(row)}>Permanently delete answers only</Action>}</View>)}
      {responseCursor && <Action onPress={() => responsePage(responseCursor)}>Load more responses</Action>}<Action onPress={() => open(detail.event.id)}>Back to event</Action>
    </View>}
    </View>
  </KeyboardAwareScrollView>;
}
