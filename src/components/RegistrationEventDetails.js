import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Modal, Pressable, Text, View } from 'react-native';
import EventDetailsModal from './EventDetailsModal';
import KeyboardAwareScrollView from './KeyboardAwareScrollView';
import MemberPageHeader from './MemberPageHeader';
import { firebaseRegistration, REGISTRATION_ENABLED } from '../registration/firebaseRegistration';
import { colors } from '../theme';
import { Action, Input, RegistrationIdentity, styles } from '../registration/RegistrationControls';
import SafeAreaView from './ModalSafeArea';
import { registrationEventCard } from '../registration/eventFeed';
import SeriesApproval from '../registration/SeriesApproval';

export default function RegistrationEventDetails({ event, user, profile, isGuest, onClose, onOperation, onRequireSignIn, onEdit, onDelete, onManageStream, initialReview = false, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [posterError, setPosterError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [reviewing, setReviewing] = useState(initialReview);
  const [approving, setApproving] = useState(false);
  const [feedback, setFeedback] = useState('');
  useEffect(() => setFeedback(''), [event?.id]);
  useEffect(() => { setReviewing(initialReview); }, [event?.id, initialReview]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      setDetail(null); setForeground(state === 'active');
      if (state === 'active') setRefresh(value => value + 1);
    });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    let active = true;
    setDetail(null); setError(''); setPosterError('');
    if (!event || !foreground) return undefined;
    const api = firebaseRegistration({ enabled: REGISTRATION_ENABLED });
    (async () => {
      let result = await (reviewing ? api.load(event.id) : (api.card || api.load)(event.id));
      // Draw text/actions as soon as authorised details arrive, before image transfer.
      if (active) setDetail({ ...result, reviewLoaded: false, card: {
        ...registrationEventCard(result.event),
        address: result.privateDetails ? { ...result.privateDetails.venue, fullAddress: result.privateDetails.address, suburb: result.event.suburb } : { suburb: result.event.suburb },
        registrationPrivate: Boolean(result.privateDetails), imageUrl: '',
      } });
      let poster = '';
      let reviewPoster = '';
      let reviewPosterFailed = false;
      const submitted = result.canManage ? result.pendingChanges || result : null;
      if (reviewing && submitted?.privateDetails?.hasPoster) {
        try {
          const image = await api.poster(event.id, result.pendingChanges ? 'pending' : 'published');
          reviewPoster = `data:${image.mime};base64,${image.base64}`;
        } catch (err) {
          result = await api.load(event.id);
          reviewPosterFailed = true;
          if (active) setPosterError(err.message || 'Submitted poster unavailable. Reload before approval.');
        }
      }
      if (!reviewing && result.privateDetails?.hasPoster) {
        try {
          const offered=event.registrationPoster;
          if (refresh === 0 && offered?.uid === user?.uid && offered.revision === result.event.revision) poster=offered.uri;
          else { const image = await api.poster(event.id); poster = `data:${image.mime};base64,${image.base64}`; }
        } catch (err) {
          result = await api.load(event.id);
          if (active) setPosterError(err.message || 'Private poster unavailable. Reopen the event to retry.');
        }
      }
      if (active) setDetail({ ...result, reviewLoaded: reviewing, reviewPoster, reviewPosterFailed, card: {
        ...registrationEventCard(result.event),
        organiserType: result.event.organiserType || 'private',
        eventSubject: result.event.eventSubject || result.event.title,
        ownerUid: result.event.ownerUid,
        address: result.privateDetails ? { ...result.privateDetails.venue, fullAddress: result.privateDetails.address, suburb: result.event.suburb } : { suburb: result.event.suburb },
        registrationPrivate: Boolean(result.privateDetails),
        imageUrl: poster,
      } });
    })().catch(err => { if (active) setError(err.message || 'Could not load this event.'); });
    return () => { active = false; };
  }, [event?.id, event?.revision, user?.uid, foreground, refresh, reviewing]);
  if (!event) return null;
  if (!detail) return <EventDetailsModal event={{ ...registrationEventCard(event), imageUrl: '', hostPhone: '', hostContactOptional: '', registrationPrivate: false }} visible user={user} profile={profile} isGuest={isGuest} onClose={onClose}
    registrationDetail={{}} registrationLoading={!error} registrationNotice={error}
    onRetryRegistration={error ? () => setRefresh(value => value + 1) : undefined} />;
  const operation = action => {
    if (isGuest && action === 'entry') { onRequireSignIn(); return; }
    onOperation(detail.card, action);
  };
  const approve = () => Alert.alert('Approve submitted event and form?', 'Publish the details, venue, poster and registration questions shown in this review. The current published version will be replaced.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: async () => {
      if (approving) return;
      setApproving(true);
      try {
        await firebaseRegistration({ enabled: REGISTRATION_ENABLED }).approve(detail.event.id, detail.event.revision);
        onChanged?.(); setDetail(null); setReviewing(false); setRefresh(value => value + 1);
      } catch (err) { Alert.alert('Approval failed', err.message); }
      finally { setApproving(false); }
    } },
  ]);
  const decide = async decision => {
    if (approving) return;
    if (!feedback.trim()) { Alert.alert('Feedback required', 'Enter the reason or suggested changes for the organiser.'); return; }
    setApproving(true);
    try {
      await firebaseRegistration({ enabled: REGISTRATION_ENABLED }).review(detail.event.id, detail.event.revision, decision, feedback.trim());
      onChanged?.(); onClose();
    } catch (err) { Alert.alert('Review failed', err.message); }
    finally { setApproving(false); }
  };
  if (reviewing && detail.canManage) {
    const submitted = detail.pendingChanges || detail;
    const submittedEvent = submitted.event;
    const complete = Boolean(detail.reviewLoaded && submitted.form && submitted.privateDetails && !detail.reviewPosterFailed && (!submitted.privateDetails.hasPoster || detail.reviewPoster));
    const values = [
      ['Title', submittedEvent.title], ['Event type', submittedEvent.eventType], ['Date', submittedEvent.date],
      ['Start time', submittedEvent.startTime || 'Date only'], ['End time', submittedEvent.endTime || 'Not supplied'],
      ['City', detail.event.city], ['Public suburb', submittedEvent.suburb], ['Public notes', submittedEvent.notes],
      ['Capacity', submittedEvent.capacity], ['Registration closes', submittedEvent.closes || 'Start of event day'],
      ['Allow cancellation', submittedEvent.allowCancellation ? 'Yes' : 'No'],
      ...[['Host', 'hostName'], ['Organiser', 'organiserName'], ['Organiser type', 'organiserType'], ['Subject', 'eventSubject'], ['Audience', 'audienceType'], ['Speaker', 'speakerName'], ['Time selection', 'timeMode'], ['Prayer', 'prayerLabel'], ['Hijri date', 'hijriDate']].map(([label, key]) => [label, submittedEvent[key]]),
      ['Reciters', (submittedEvent.reciters || []).map(item => `${item.type === 'Custom' ? item.customType : item.type}: ${item.name}`).join('\n')],
      ['Full address — private', submitted.privateDetails?.address],
      ['Host phone — private', submitted.privateDetails?.hostPhone], ['Host contact — private', submitted.privateDetails?.hostContactOptional],
    ];
    return <Modal onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><KeyboardAwareScrollView contentContainerStyle={styles.content}>
        <MemberPageHeader title="Review submitted changes" subtitle={detail.pendingChanges ? 'Published event remains live until approval' : 'Unpublished event and registration form'} icon="clipboard-check-outline" tone="teal" onBack={onClose} backDisabled={approving} backAccessibilityLabel="Back to events" />
        {detail.pendingChanges && <Text style={styles.text}>Submitted {detail.pendingChanges.submittedAt || ''} by {detail.pendingChanges.submittedBy || 'organiser'}</Text>}
        <View style={styles.panel}><RegistrationIdentity event={submittedEvent}/><Text style={styles.title}>Submitted event details</Text><View style={styles.reviewGrid}>{values.filter(([label, value]) => label !== 'Title' && value !== undefined && value !== '').map(([label, value]) => <View key={label} style={styles.reviewField}><Text style={styles.label}>{label}</Text><Text selectable style={styles.text}>{String(value)}</Text></View>)}</View></View>
        <Text style={styles.label}>Private poster</Text>
        {detail.reviewPoster ? <Image accessibilityLabel="Submitted private poster" source={{ uri: detail.reviewPoster }} style={{ width: '100%', height: 360 }} resizeMode="contain" /> : <Text style={styles.text}>{detail.reviewPosterFailed ? 'Could not load submitted poster. Approval is blocked until it can be reviewed.' : 'No poster in this submitted version.'}</Text>}
        {posterError ? <Text accessibilityRole="alert" style={styles.error}>{posterError}</Text> : null}
        <Text style={styles.label}>Registration purpose</Text><Text style={styles.text}>{submitted.form?.purpose}</Text>
        {(submitted.form?.fields || []).map((field, index) => <View key={field.id} style={styles.panel}>
          <Text style={styles.label}>{index + 1}. {field.label} ({field.type}, {field.required ? 'required' : 'optional'}{field.perParticipant ? ', per participant' : ''})</Text>
          {field.description ? <Text style={styles.text}>{field.description}</Text> : null}
          {(field.options || []).map((option, optionIndex) => <Text key={optionIndex} style={styles.text}>{option}</Text>)}
          {field.terms ? <Text selectable style={styles.text}>Terms: {field.terms}</Text> : null}
        </View>)}
        {!complete ? <Text accessibilityRole="alert" style={styles.error}>Reload complete private details, form and poster before approving.</Text> : null}
        <Action disabled={approving} onPress={() => setRefresh(value => value + 1)}>Reload submitted changes</Action>
        {detail.canApprove && <View style={styles.group}>
          <Action primary disabled={!complete || approving} onPress={approve}>{approving ? 'Please wait…' : 'Approve event and form'}</Action>
          {detail.event.seriesId && <SeriesApproval event={detail.event} api={firebaseRegistration({enabled:REGISTRATION_ENABLED})} disabled={approving} onApproved={()=>{onChanged?.();setDetail(null);setReviewing(false);setRefresh(value=>value+1);}}/>}
          <Input label="Feedback for organiser" value={feedback} onChangeText={setFeedback} multiline maxLength={2000} />
          <View style={styles.actions}><Action style={styles.actionInRow} disabled={approving} onPress={() => decide('changes-requested')}>Suggest changes</Action><Action style={styles.actionInRow} disabled={approving} onPress={() => decide('rejected')}>Reject</Action></View>
        </View>}
      </KeyboardAwareScrollView></SafeAreaView>
    </Modal>;
  }
  return <EventDetailsModal event={detail.card} visible onClose={onClose} user={user} profile={profile} isGuest={isGuest}
    registrationDetail={detail}
    registrationNotice={detail.reviewFeedback ? `Review: ${detail.reviewFeedback.decision === 'rejected' ? 'Rejected' : 'Changes requested'} — ${detail.reviewFeedback.message}. Edit and save to resubmit.` : detail.canManage && detail.event.hasPendingChanges ? <Text style={styles.text}>Submitted changes await approval. The published event and form remain live and unchanged. <Text accessibilityRole="button" onPress={() => setReviewing(true)}>Review submitted changes</Text>{posterError ? `\n${posterError}` : ''}</Text> : posterError}
    canManageStream={!isGuest && detail.canManage && detail.event.status === 'approved' && Boolean(onManageStream)}
    onManageStream={detail.canManage && detail.event.status === 'approved' ? onManageStream : undefined}
    onViewRegistrationHistory={() => operation('history')}
    onRegister={() => operation('entry')}
    onEditRegistrationForm={detail.canManage && detail.event.status !== 'cancelled' ? () => operation('form') : undefined}
    onRegistrationResponses={detail.canManage ? () => operation('responses') : undefined}
    onEdit={detail.canManage && detail.event.status !== 'cancelled' ? () => onEdit(detail.card) : undefined}
    onCopy={detail.canManage && ['admin', 'superAdmin'].includes(profile?.role) ? () => operation('copy') : undefined}
    onDelete={detail.canManage ? () => onDelete(detail.card) : undefined}
    onCancelRegistration={detail.canCancel ? () => Alert.alert(detail.event.status === 'cancelled' ? 'Delete your registration data?' : 'Delete your registration?', detail.event.status === 'cancelled' ? 'Permanently delete your saved registration answers for this unavailable event. This will remove it from your registration history.' : 'Delete your submitted answers and release your places. Access to the private venue and poster will be removed.', [
      { text: 'Keep registration', style: 'cancel' }, { text: 'Delete registration', style: 'destructive', onPress: async () => {
        try {
          await firebaseRegistration({ enabled: REGISTRATION_ENABLED }).cancel(detail.event.id, detail.ownRegistration.revision);
          onChanged?.();
          if (detail.event.status === 'cancelled') { onClose?.(); return; }
          setDetail(null); setRefresh(value => value + 1);
        } catch (err) { Alert.alert('Could not delete registration', err.message); }
      } },
    ]) : undefined}
    onApproveRegistration={detail.canApprove ? () => setReviewing(true) : undefined}
  />;
}
