import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import EventCard from './EventCard';
import RegistrationEventDetails from './RegistrationEventDetails';
import NativeLiveStreamModal from './NativeLiveStreamModal';
import CitySelector from './CitySelector';
import { firebaseRegistration, REGISTRATION_ENABLED } from '../registration/firebaseRegistration';
import { registrationEventFeed } from '../registration/eventFeed';
import { compareEventsByDateTime } from '../services/events';
import { DEFAULT_CITY } from '../utils/cities';
import { colors, spacing } from '../theme';

export default function RegistrationManagementPanel({ user, profile, review = false, onOperation }) {
  const [city, setCity] = useState(profile?.adminCity || profile?.defaultCity || DEFAULT_CITY);
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [streamEvent, setStreamEvent] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(''); setEvents([]);
    if (!REGISTRATION_ENABLED || (review && profile?.role !== 'superAdmin')) { setBusy(false); return undefined; }
    const api = firebaseRegistration({ enabled: true });
    registrationEventFeed(api, review ? 'review' : 'management', review ? undefined : city)
      .then(rows => { if (active) setEvents(rows.sort(compareEventsByDateTime)); })
      .catch(err => { if (active) setError(err.message || 'Could not load registration events.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [city, review, profile?.role, user?.uid, refresh]);
  if (!REGISTRATION_ENABLED || (review && profile?.role !== 'superAdmin')) return null;
  const close = () => { setSelected(null); setRefresh(value => value + 1); };
  return <View style={{ gap: spacing.sm, marginVertical: spacing.md }}>
    <Text style={{ color: colors.navy, fontSize: 18, fontWeight: '700' }}>{review ? 'Events and submitted changes awaiting approval' : 'Registration events'}</Text>
    {!review && profile?.role === 'superAdmin' && <CitySelector selectedCity={city} onChange={setCity} />}
    {busy && <ActivityIndicator />}
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
    <Pressable onPress={() => setRefresh(value => value + 1)}><Text style={{ color: colors.tealDark }}>Refresh registration events</Text></Pressable>
    {!busy && !error && events.length === 0 && <Text>{review ? 'No events pending approval.' : 'No registration events in this city.'}</Text>}
    {events.map(event => <EventCard key={event.id} event={event} onPress={() => setSelected(event)} />)}
    <RegistrationEventDetails event={selected} user={user} profile={profile} isGuest={false} initialReview={review} onClose={close}
      onManageStream={event => { setSelected(null); setStreamEvent(event); }}
      onOperation={onOperation} onEdit={event => onOperation(event, 'editor')}
      onDelete={event => Alert.alert('Delete Event?', 'Hide this event and close registration, retaining participant history.', [
        { text: 'Keep event', style: 'cancel' }, { text: 'Delete Event', style: 'destructive', onPress: async () => {
          try { await firebaseRegistration({ enabled: true }).deleteEvent(event.id, event.revision); close(); }
          catch (err) { Alert.alert('Delete failed', err.message); }
        } },
      ])}
    />
    {streamEvent ? <NativeLiveStreamModal event={streamEvent} visible onClose={() => { setStreamEvent(null); setRefresh(value => value + 1); }}
      onStreamChanged={updated => { setStreamEvent(current => current?.id === updated.id ? updated : current); setRefresh(value => value + 1); }} /> : null}
  </View>;
}
