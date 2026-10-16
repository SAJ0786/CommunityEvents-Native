import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, Text, View } from 'react-native';
import EventDetailsModal from './EventDetailsModal';
import { firebaseRegistration, REGISTRATION_ENABLED } from '../registration/firebaseRegistration';
import { registrationEventCard } from '../registration/eventFeed';

export default function RegistrationEventDetails({ event, user, profile, isGuest, onClose, onOperation, onRequireSignIn, onEdit, onDelete, onManageStream }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [posterError, setPosterError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
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
      if (result.privateDetails?.hasPoster) {
        try {
          const image = await api.poster(event.id);
          poster = `data:${image.mime};base64,${image.base64}`;
        } catch (err) {
          result = await api.load(event.id);
          if (active) setPosterError(err.message || 'Private poster unavailable. Reopen the event to retry.');
        }
      }
      if (active) setDetail({ ...result, card: {
        ...registrationEventCard(result.event),
        ownerUid: result.event.ownerUid,
        address: result.privateDetails ? { ...result.privateDetails.venue, fullAddress: result.privateDetails.address, suburb: result.event.suburb } : { suburb: result.event.suburb },
        registrationPrivate: Boolean(result.privateDetails),
        imageUrl: poster,
      } });
    })().catch(err => { if (active) setError(err.message || 'Could not load this event.'); });
    return () => { active = false; };
  }, [event, user?.uid, foreground, refresh]);
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
  return <EventDetailsModal event={detail.card} visible onClose={onClose} user={user} profile={profile} isGuest={isGuest}
    registrationDetail={detail}
    registrationNotice={posterError}
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
    onApproveRegistration={detail.canApprove && detail.event.status === 'pending' ? () => Alert.alert('Approve event?', 'Publish this event on Home after reviewing its details and registration form.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: async () => {
        try {
          await firebaseRegistration({ enabled: REGISTRATION_ENABLED }).approve(detail.event.id, detail.event.revision);
          onClose();
        } catch (err) { Alert.alert('Approval failed', err.message); }
      } },
    ]) : undefined}
  />;
}
