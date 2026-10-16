import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Modal, Pressable, Text, View } from 'react-native';
import EventDetailsModal from './EventDetailsModal';
import KeyboardAwareScrollView from './KeyboardAwareScrollView';
import MemberPageHeader from './MemberPageHeader';
import { firebaseRegistration, REGISTRATION_ENABLED } from '../registration/firebaseRegistration';
import { registrationEventCard } from '../registration/eventFeed';

export default function RegistrationEventDetails({ event, user, profile, isGuest, onClose, onOperation, onRequireSignIn, onEdit, onDelete, onManageStream, initialReview = false }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [posterError, setPosterError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reviewing, setReviewing] = useState(initialReview);
  const [approving, setApproving] = useState(false);
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
      let result = await api.load(event.id);
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
          const image = await api.poster(event.id);
          poster = `data:${image.mime};base64,${image.base64}`;
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
  }, [event, user?.uid, foreground, refresh, reviewing]);
  if (!event) return null;
  if (!detail) return <Modal transparent onRequestClose={onClose}><View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#ffffff' }}>
    {error ? <Text accessibilityRole="alert">{error}</Text> : <ActivityIndicator />}
    {error ? <Pressable onPress={() => setRefresh(value => value + 1)}><Text>Retry</Text></Pressable> : null}
    <Pressable onPress={onClose}><Text>Back to events</Text></Pressable>
  </View></Modal>;
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
        setDetail(null); setReviewing(false); setRefresh(value => value + 1);
      } catch (err) { Alert.alert('Approval failed', err.message); }
      finally { setApproving(false); }
    } },
  ]);
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
      ...['hostName', 'organiserType', 'organiserId', 'organiserName', 'organisationType', 'isOnBehalfOf', 'eventSubject', 'audienceType', 'speakerName', 'timeMode', 'prayerName', 'prayerLabel', 'prayerOffsetMinutes', 'prayerTimeZone', 'hijriDate', 'enteredAsHijri', 'hijriDay', 'hijriMonth', 'hijriYear'].map(key => [key, submittedEvent[key]]),
      ['Reciters', (submittedEvent.reciters || []).map(item => `${item.type === 'Custom' ? item.customType : item.type}: ${item.name}`).join('\n')],
      ['Full address — private', submitted.privateDetails?.address],
      ['Venue coordinates', submitted.privateDetails?.venue ? `${submitted.privateDetails.venue.latitude}, ${submitted.privateDetails.venue.longitude}` : ''],
      ['Host phone — private', submitted.privateDetails?.hostPhone], ['Host contact — private', submitted.privateDetails?.hostContactOptional],
    ];
    return <Modal onRequestClose={() => setReviewing(false)}>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <MemberPageHeader title="Review submitted changes" subtitle={detail.pendingChanges ? 'Published event remains live until approval' : 'Unpublished event and registration form'} icon="clipboard-check-outline" tone="teal" />
        <Pressable disabled={approving} onPress={() => setReviewing(false)}><Text>Back to published event</Text></Pressable>
        {detail.pendingChanges && <Text>Submitted {detail.pendingChanges.submittedAt || ''} by {detail.pendingChanges.submittedBy || 'organiser'}</Text>}
        {values.filter(([, value]) => value !== undefined && value !== '').map(([label, value]) => <View key={label}><Text style={{ fontWeight: '700' }}>{label}</Text><Text selectable>{String(value)}</Text></View>)}
        <Text style={{ fontWeight: '700' }}>Private poster</Text>
        {detail.reviewPoster ? <Image accessibilityLabel="Submitted private poster" source={{ uri: detail.reviewPoster }} style={{ width: '100%', height: 360 }} resizeMode="contain" /> : <Text>{detail.reviewPosterFailed ? 'Could not load submitted poster. Approval is blocked until it can be reviewed.' : 'No poster in this submitted version.'}</Text>}
        {posterError ? <Text accessibilityRole="alert">{posterError}</Text> : null}
        <Text style={{ fontWeight: '700' }}>Registration purpose</Text><Text>{submitted.form?.purpose}</Text>
        {(submitted.form?.fields || []).map((field, index) => <View key={field.id}>
          <Text style={{ fontWeight: '700' }}>{index + 1}. {field.label} ({field.type}, {field.required ? 'required' : 'optional'})</Text>
          {field.description ? <Text>{field.description}</Text> : null}
          {(field.options || []).map((option, optionIndex) => <Text key={optionIndex}>{option}</Text>)}
          {field.terms ? <Text selectable>Terms: {field.terms}</Text> : null}
        </View>)}
        {!complete ? <Text accessibilityRole="alert">Reload complete private details, form and poster before approving.</Text> : null}
        <Pressable disabled={approving} onPress={() => setRefresh(value => value + 1)}><Text>Reload submitted changes</Text></Pressable>
        {detail.canApprove && <Pressable accessibilityRole="button" disabled={!complete || approving} onPress={approve}><Text>{approving ? 'Approving…' : 'Approve reviewed event and form'}</Text></Pressable>}
      </KeyboardAwareScrollView>
    </Modal>;
  }
  return <EventDetailsModal event={detail.card} visible onClose={onClose} user={user} profile={profile} isGuest={isGuest}
    registrationDetail={detail}
    registrationNotice={detail.canManage && detail.event.hasPendingChanges ? <Text>Submitted changes await approval. The published event and form remain live and unchanged. <Text accessibilityRole="button" onPress={() => setReviewing(true)}>Review submitted changes</Text>{posterError ? `\n${posterError}` : ''}</Text> : posterError}
    canManageStream={!isGuest && detail.canManage && detail.event.status === 'approved' && Boolean(onManageStream)}
    onManageStream={detail.canManage && detail.event.status === 'approved' ? onManageStream : undefined}
    onRegister={() => operation('entry')}
    onEditRegistrationForm={detail.canManage && detail.event.status !== 'cancelled' ? () => operation('form') : undefined}
    onRegistrationResponses={detail.canManage ? () => operation('responses') : undefined}
    onEdit={detail.canManage && detail.event.status !== 'cancelled' ? () => onEdit(detail.card) : undefined}
    onCopy={detail.canManage && ['admin', 'superAdmin'].includes(profile?.role) ? () => operation('copy') : undefined}
    onDelete={detail.canManage ? () => onDelete(detail.card) : undefined}
    onCancelRegistration={detail.canCancel ? () => Alert.alert('Delete your registration?', 'Delete your submitted answers and release your places. Access to the private venue and poster will be removed.', [
      { text: 'Keep registration', style: 'cancel' }, { text: 'Delete registration', style: 'destructive', onPress: async () => {
        try {
          await firebaseRegistration({ enabled: REGISTRATION_ENABLED }).cancel(detail.event.id, detail.ownRegistration.revision);
          setDetail(null); setRefresh(value => value + 1);
        } catch (err) { Alert.alert('Could not delete registration', err.message); }
      } },
    ]) : undefined}
    onApproveRegistration={detail.canApprove ? () => setReviewing(true) : undefined}
  />;
}
