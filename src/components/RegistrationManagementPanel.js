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
import { colors, spacing, typography } from '../theme';
import { transferMemberName } from '../utils/adminUserSearch';
import TransferMemberPicker from './TransferMemberPicker';

export default function RegistrationManagementPanel({ user, profile, review = false, onOperation, users = [], onLoadUsers, usersLoading = false, usersError = '' }) {
  const [city, setCity] = useState(profile?.adminCity || profile?.defaultCity || DEFAULT_CITY);
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [streamEvent, setStreamEvent] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [transfer, setTransfer] = useState(null), [transferQuery, setTransferQuery] = useState('');
  const [transferUser, setTransferUser] = useState(null);
  useEffect(() => { setEvents([]); setSelected(null); setStreamEvent(null); setTransfer(null); setTransferQuery(''); setCity(profile?.adminCity || profile?.defaultCity || DEFAULT_CITY); }, [user?.uid, profile?.adminCity, profile?.defaultCity, profile?.role]);
  useEffect(() => {
    let active = true;
    setBusy(true); setError('');
    if (!REGISTRATION_ENABLED || (review && profile?.role !== 'superAdmin')) { setBusy(false); return undefined; }
    const api = firebaseRegistration({ enabled: true });
    registrationEventFeed(api, 'management', city, rows => { if (active) setEvents(rows.sort(compareEventsByDateTime)); })
      .then(rows => { if (active) setEvents(rows.sort(compareEventsByDateTime)); })
      .catch(err => { if (active) setError(err.message || 'Could not load registration events.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [city, review, profile?.role, user?.uid, refresh]);
  if (!REGISTRATION_ENABLED || (review && profile?.role !== 'superAdmin')) return null;
  const close = () => setSelected(null);
  const openTransfer = event => {
    setSelected(null); setTransfer(event); setTransferQuery(''); setTransferUser(null); setError(''); onLoadUsers?.();
  };
  const confirmTransfer = target => Alert.alert('Transfer event ownership?', `Transfer to ${transferMemberName(target)}? They will be able to manage this event and its registration responses. Other series occurrences are unchanged.`, [{text:'Cancel',style:'cancel'},{text:'Transfer',onPress:async()=>{
    if(busy)return;setBusy(true);setError('');
    try{await firebaseRegistration({enabled:true}).transfer(transfer.id,transfer.revision,target.id);setTransfer(null);setTransferQuery('');setSelected(null);setRefresh(value=>value+1);}
    catch(err){setError(err.message || 'Transfer failed. Reload events and try again.');}finally{setBusy(false);}
  }}]);
  const deleteHidden = event => Alert.alert('Delete hidden event?', 'Existing places will be released and registration history retained.', [
    {text:'Keep event',style:'cancel'}, {text:'Delete event',style:'destructive',onPress:async()=>{
      if(busy)return;setBusy(true);setError('');
      try {await firebaseRegistration({enabled:true}).deleteEvent(event.id,event.revision);setRefresh(value=>value+1);}
      catch(err){setError(err.message || 'Could not delete event.');}finally{setBusy(false);}
    }},
  ]);
  const transferForm = transfer && <View style={{padding:spacing.md,gap:spacing.sm,backgroundColor:colors.surface}} accessibilityLabel="Transfer registration event ownership">
    <Text style={{...typography.sectionTitle,color:colors.navy}}>Transfer {transfer.title}</Text>
    <Text>The new organiser can manage this event and its responses. Only this occurrence is transferred.</Text>
    <TransferMemberPicker users={users} ownerUid={transfer.ownerUid} query={transferQuery} onQueryChange={setTransferQuery}
      selected={transferUser} onSelect={setTransferUser} loading={usersLoading} error={usersError} busy={busy}
      onConfirm={confirmTransfer} onCancel={() => { setTransfer(null); setTransferUser(null); setTransferQuery(''); }} />
  </View>;
  return <View style={{ gap: spacing.sm, marginVertical: spacing.md }}>
    <CitySelector selectedCity={city} onChange={value => { setEvents([]); setTransfer(null); setTransferQuery(''); setCity(value); }} disabled={profile?.role !== 'superAdmin'} />
    <Text style={{ color: colors.navy, ...typography.sectionTitle }}>Registration only events</Text>
    {busy && <ActivityIndicator />}
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
    <Pressable onPress={() => setRefresh(value => value + 1)}><Text style={{ color: colors.tealDark }}>Refresh registration events</Text></Pressable>
    {!busy && !error && events.length === 0 && <Text>{review ? 'No events pending approval.' : 'No registration events in this city.'}</Text>}
    {events.map(event => event.moderationOnly ? <View key={event.id} style={{gap:spacing.sm,padding:spacing.md,backgroundColor:colors.surface}}><Text>{event.title}</Text><Text>Hidden by organiser · {event.date}</Text><Text>Only the organiser can open or restore this event.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={()=>deleteHidden(event)}><Text style={{color:colors.danger}}>Delete event</Text></Pressable></View> : <View key={event.id} style={{gap:spacing.sm}}><EventCard event={event} onPress={setSelected} />{event.canTransfer && <Pressable accessibilityRole="button" disabled={busy || usersLoading} onPress={()=>openTransfer(event)} style={{padding:spacing.sm,borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.surface}}><Text style={{color:colors.tealDark}}>Transfer ownership</Text></Pressable>}{transfer?.id===event.id && transferForm}</View>)}

    <RegistrationEventDetails event={selected} user={user} profile={profile} isGuest={false} onChanged={() => setRefresh(value => value + 1)} onClose={close}
      onTransfer={openTransfer}
      onManageStream={event => { setSelected(null); setStreamEvent(event); }}
      onOperation={onOperation} onEdit={event => onOperation(event, 'editor')}
      onDelete={event => Alert.alert('Delete Event?', 'Hide this event and close registration, retaining participant history.', [
        { text: 'Keep event', style: 'cancel' }, { text: 'Delete Event', style: 'destructive', onPress: async () => {
          try { await firebaseRegistration({ enabled: true }).deleteEvent(event.id, event.revision); close(); setRefresh(value => value + 1); }
          catch (err) { Alert.alert('Delete failed', err.message); }
        } },
      ])}
    />
    {streamEvent ? <NativeLiveStreamModal event={streamEvent} visible onClose={() => { setStreamEvent(null); setRefresh(value => value + 1); }}
      onStreamChanged={updated => { setStreamEvent(current => current?.id === updated.id ? updated : current); setRefresh(value => value + 1); }} /> : null}
  </View>;
}
