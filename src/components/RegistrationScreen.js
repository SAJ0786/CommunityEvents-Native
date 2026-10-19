import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, Text, View } from 'react-native';
import KeyboardAwareScrollView from './KeyboardAwareScrollView';
import MemberPageHeader from './MemberPageHeader';
import NativeBackButton from './NativeBackButton';
import RegistrationEditor from '../registration/RegistrationEditor';
import { Action, Answer, Input, styles } from '../registration/RegistrationControls';
import { firebaseRegistration } from '../registration/firebaseRegistration';
import { createSubmission } from '../registration/registrationClient';
import { answersForReview, eventDraftFromDetail, mergeRegistrationPage } from '../registration/registrationViewModel';
import { createDraft, validateAnswers, registrationFieldGroups } from '../registration/prototypeModel';
import { EVENT_TYPES } from '../utils/eventOptions';
import { cityLabel } from '../utils/cities';
import { colors } from '../theme';
import { responseName, responseAnswer } from '../registration/responsePresentation';
import { exportRegistrationWorkbook } from '../services/registrationExport';

const newReference = () => `r-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export default function RegistrationScreen({ enabled = false, user, profile, city, initialCreate = false, initialEventId = null, initialAction = 'entry', onBack, onMyEvents, onRequireSignIn, transport }) {
  const api = useMemo(() => transport || firebaseRegistration({ enabled }), [enabled, transport]);
  const [stage, setStage] = useState('loading');
  const [detail, setDetail] = useState(null); const [draft, setDraft] = useState(null);
  const [types, setTypes] = useState(EVENT_TYPES); const [templates, setTemplates] = useState([]); const [templateCursor, setTemplateCursor] = useState(null);
  const [expandedResponse, setExpandedResponse] = useState(null);
  const [responses, setResponses] = useState([]); const [responseCursor, setResponseCursor] = useState(null);
  const [answers, setAnswers] = useState({}); const [places, setPlaces] = useState('1');
  const [pendingPoster, setPendingPoster] = useState(null);
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [obscured, setObscured] = useState(false);
  const busyRef = useRef(false); const epoch = useRef(0); const currentId = useRef(null);
  const createKey = useRef(newReference()); const submission = useRef(null);
  const pendingSave = useRef(null);
  const [seriesSummary, setSeriesSummary] = useState(null);
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
    const [result, responseResult] = await Promise.all([api.load(eventId), action === 'responses' ? api.responses(eventId) : Promise.resolve(null)]);
    if (!valid()) return;
    currentId.current = eventId; setDetail(result);
    if (action === 'entry') {
      if (!requireMember()) return;
      setAnswers(answersForReview(result)); setPlaces(String(result.ownRegistration?.status === 'registered' ? result.ownRegistration.places : 1)); setStage('entry');
    } else if (action === 'editor' || action === 'form' || action === 'copy') {
      const options = {};
      if (!valid()) return;
      const eventTypes = [...new Set([...EVENT_TYPES, ...(options.eventTypes || [])])];
      setTypes(eventTypes); setDraft(eventDraftFromDetail(result, eventTypes)); setStage('editor');
      if (action === 'copy') { createKey.current = newReference(); currentId.current = null; setDetail(null); }
      loadTemplates(valid).catch(error => { if (valid()) setNotice(error.message || 'Saved templates could not be loaded. Built-in templates are available.'); });
    } else if (action === 'responses') {
      const page = responseResult;
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
      const options = {};
      const eventTypes = [...new Set([...EVENT_TYPES, ...(options.eventTypes || [])])];
      const fresh = isNew ? null : await api.load(detail.event.id);
      if (!valid()) return;
      if (isNew) { createKey.current = newReference(); currentId.current = null; setDetail(null); }
      else setDetail(fresh);
      setTypes(eventTypes); setDraft(isNew ? { ...createDraft(), title: '', eventType: eventTypes[0], customEventType: '' } : eventDraftFromDetail(fresh, eventTypes));
      setStage('editor'); setPendingPoster(null);
      loadTemplates(valid).catch(error => { if (valid()) setNotice(error.message || 'Saved templates could not be loaded. Built-in templates are available.'); });
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

  const save = (nextDraft, series) => run(async valid => {
    // Freeze the exact request across transport failures. A lost response must
    // never turn a retry into a different series under the same create key.
    if (!pendingSave.current) {
      const { poster, ...eventDraft } = nextDraft;
      pendingSave.current = { request: JSON.parse(JSON.stringify({
        ...(detail ? { eventId: detail.event.id, expectedRevision: detail.event.revision } : { createKey: createKey.current }),
        city: detail?.event.city || city, draft: eventDraft,
        ...(!detail && series ? { recurrence: series.recurrence, occurrences: series.occurrences } : {}),
      })), poster: poster ? { ...poster } : null, isSeries: !detail && Boolean(series), result: null, postersDone: false, posterError: '' };
    }
    const pending = pendingSave.current;
    if (!pending.result) {
      try { pending.result = pending.isSeries ? await api.createSeries(pending.request) : await api.save(pending.request); }
      catch (error) {
        if (['invalid-argument', 'permission-denied', 'unauthenticated', 'failed-precondition'].some(code => String(error?.code || '').endsWith(code))) {
          // A definitive rejection made no write; allow correction with a new key.
          pendingSave.current = null; createKey.current = newReference();
        }
        throw error;
      }
    }
    const result = pending.result;
    if (!valid()) return;
    const events = pending.isSeries ? result.events : [result];
    if (!events?.length || events.some(event => !event.eventId || !Number.isInteger(event.revision))) throw Error('The save response was incomplete. Retry the same saved request.');
    currentId.current = events[0].eventId;
    if (pending.poster && !pending.postersDone) {
      const failures = [];
      let quotaReached = false;
      for (const [index, event] of events.entries()) {
        const label = `${pending.request.occurrences?.[index]?.date || pending.request.draft.date} (${event.eventId})`;
        if (quotaReached) { failures.push(`${label}: pending, not attempted (poster upload quota reached)`); continue; }
        try { await api.uploadPoster(event.eventId, event.revision, pending.poster.mime, pending.poster.base64); }
        catch (error) {
          quotaReached = String(error?.code || '').includes('resource-exhausted');
          failures.push(`${label}: ${error.message || 'upload failed'}${quotaReached ? ' (poster upload quota reached)' : ''}`);
        }
        if (!valid()) return;
      }
      pending.postersDone = true;
      if (failures.length) {
        pending.posterError = pending.isSeries
          ? `${events.length} events were saved. Private poster upload failed for ${failures.length} occurrence(s), including any unattempted pending uploads: ${failures.join('; ')}. Open those individual events in My Events and select the poster again${quotaReached ? ' after the upload quota resets' : ''}. No events were recreated.`
          : `Event saved, but poster upload failed: ${failures.join('; ')}. Use Retry poster upload below.`;
        if (!pending.isSeries) setPendingPoster(pending.poster);
      } else setPendingPoster(null);
    }
    const fresh = await api.load(events[0].eventId);
    if (!valid()) return;
    setSeriesSummary(pending.isSeries ? { count: events.length, seriesId: result.seriesId } : null);
    setDetail(fresh); setStage('host-confirmation'); setDraft(null); setNotice(pending.posterError || (fresh.event.hasPendingChanges ? 'Changes submitted for super administrator review. The published event and form remain live and unchanged.' : 'Saved for super administrator review. The event is not public until approved.'));
    pendingSave.current = null;
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
  if (!enabled) return <View style={styles.panel}><NativeBackButton onPress={onBack} accessibilityLabel="Back to events" /><Text style={styles.text}>Registration is not enabled for this release.</Text></View>;
  if (obscured) return <View style={styles.panel}><Text style={styles.muted}>Private event details hidden while the app is inactive.</Text></View>;
  return <KeyboardAwareScrollView contentContainerStyle={styles.content}>
    <MemberPageHeader title={stage === 'responses' ? 'Registration responses' : stage === 'editor' ? 'Edit event and registration form' : 'Event registration'} subtitle={cityLabel(city)} icon="clipboard-text-outline" tone="teal" onBack={onBack} backDisabled={busy} backAccessibilityLabel="Back to events" />
    {busy && <ActivityIndicator color={colors.tealDark} />}
    {detail?.reviewFeedback && <Text style={styles.error}>{detail.reviewFeedback.message} Edit and save to resubmit for approval.</Text>}
    {notice ? <Text accessibilityRole="alert" style={styles.error}>{notice}</Text> : null}
    {stage === 'editor' && pendingSave.current && !busy && <View style={styles.panel}>
      <Text style={styles.text}>The original save request is retained unchanged. Retry it before making further changes; leaving now may hide a successfully created event until My Events reloads.</Text>
      <Action primary onPress={() => save()}>Retry original save request</Action>
    </View>}
    <View pointerEvents={busy ? 'none' : 'auto'}>
    {stage === 'editor' && draft && <RegistrationEditor initialDraft={draft} eventId={detail?.event.id} city={detail?.event.city || city} defaultHostName={profile?.fullName || user?.displayName || ''} defaultHostPhone={profile?.phone || user?.phoneNumber || ''}
      initialStep={initialAction === 'form' ? 'form' : 'event'} eventTypes={types} savedTemplates={templates} hasMoreTemplates={Boolean(templateCursor)} onMoreTemplates={() => run(valid => loadTemplates(valid, templateCursor))} busy={busy || Boolean(pendingSave.current)} onSave={save} onCancel={onBack} hasPoster={(detail?.pendingChanges || detail)?.privateDetails?.hasPoster} onRemovePoster={() => posterChange(true)} onSaveTemplate={template => run(async valid => {
      await api.saveTemplate({ ...template, templateId: newReference() }); await loadTemplates(valid); if (valid()) setNotice('Template saved to your account.');
    })} />}
    {detail && stage === 'entry' && <View style={styles.panel}>
      <Text style={styles.title}>{detail.ownRegistration?.status === 'registered' ? 'Edit registration' : 'Register'} · {detail.event.title}</Text>
      {detail.ownRegistration && detail.ownRegistration.formVersion !== detail.form.version && <Text style={styles.error}>The organiser changed the form. Review every question and agree to the current terms again.</Text>}
      <Text style={styles.text}>{detail.form.purpose}</Text><Text style={styles.muted}>{detail.retention?.notice}</Text>
      <Input label="Number of places (maximum 5)" value={places} keyboardType="number-pad" onChangeText={value => { submission.current = null; setPlaces(value); }} />
      {registrationFieldGroups(detail.form.fields, places).map(group => <View key={group.id} style={styles.panel}><Text style={styles.title}>{group.label}</Text>{group.fields.map(field => <View key={field.id}><Answer field={{...field,label:field.originalLabel || field.label}} value={answers[field.id]} onChange={value => { submission.current = null; setAnswers(current => ({ ...current, [field.id]: value })); }} />{field.description ? <Text style={styles.muted}>{field.description}</Text> : null}</View>)}</View>)}
      <Action primary onPress={submit}>Submit registration</Action>
    </View>}
    {detail && ['confirmation', 'host-confirmation'].includes(stage) && <View style={styles.panel}>
      <Text style={styles.title}>{stage === 'confirmation' ? 'Registration confirmed' : 'Event and form saved'}</Text>
      <Text style={styles.text}>{detail.event.title}</Text>
      {stage === 'host-confirmation' && (seriesSummary || detail.event.seriesId) && <Text style={styles.title}>{seriesSummary?.count || detail.event.occurrenceCount} independent occurrences — separate bookings, capacities, closing dates and approvals. Editing here changes only this occurrence.</Text>}
      <Text style={styles.muted}>{stage === 'confirmation' ? `${detail.ownRegistration?.places || 0} places reserved.` : detail.event.hasPendingChanges ? 'Changes await super administrator approval. The published event and form remain unchanged.' : detail.event.status === 'pending' ? 'Awaiting super administrator approval. Your event appears in My Events until approved.' : 'Changes saved.'}</Text>
      <Action onPress={() => stage === 'confirmation' ? startEntry() : edit()}>{stage === 'confirmation' ? 'Edit registration' : 'Edit event or form'}</Action>
      {stage === 'host-confirmation' && seriesSummary && <Action primary onPress={onMyEvents || onBack}>Return to My Events</Action>}
      {pendingPoster && <Action onPress={() => posterChange(false)}>Retry selected poster upload</Action>}
    </View>}
    {detail && stage === 'responses' && <View style={styles.group}>
      <Action disabled={busy} onPress={() => run(async valid => {
        const rows = [...responses]; const seen = new Set(); let cursor = responseCursor;
        while (cursor) {
          if (seen.has(cursor)) throw Error('Response pagination did not advance. Please reload.');
          seen.add(cursor);
          const page = await api.responses(detail.event.id, cursor);
          if (!valid()) return;
          rows.push(...page.registrations); cursor = page.nextCursor;
        }
        if (valid()) await exportRegistrationWorkbook(detail.event.title, mergeRegistrationPage([], rows), valid);
      })}>Export responses to Excel (.xlsx)</Action>
      {!responses.length && <Text style={styles.muted}>No registration responses yet.</Text>}
      {responses.map(row => <View key={row.registrationId} style={styles.panel}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: expandedResponse === row.registrationId }} onPress={() => setExpandedResponse(current => current === row.registrationId ? null : row.registrationId)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.label}>{responseName(row)}</Text></Pressable>
        {expandedResponse === row.registrationId && <View style={styles.group}>
          <Text style={styles.muted}>{row.status} · {row.places} {row.places === 1 ? 'place' : 'places'}</Text>
          {(row.fields || []).map(field => <View key={field.id}><Text style={styles.label}>{field.label}</Text><Text style={styles.text}>{responseAnswer(row.answers?.[field.id])}</Text></View>)}
          {row.answersDeletedAt ? <Text style={styles.muted}>Answers deleted.</Text> : <Action onPress={() => deleteAnswers(row)}>Permanently delete answers only</Action>}
        </View>}
      </View>)}
      {responseCursor && <Action onPress={() => responsePage(responseCursor)}>Load more responses</Action>}
    </View>}
    </View>
  </KeyboardAwareScrollView>;
}
