import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onIdTokenChanged, signOut } from '@react-native-firebase/auth';
import AppHeader from './src/components/AppHeader';
import AdminDashboardScreen from './src/components/AdminDashboardScreen';
import BottomNavigation from './src/components/BottomNavigation';
import BulkShareScreen from './src/components/BulkShareScreen';
import AddEventChoice from './src/components/AddEventChoice';
import CalendarScreen from './src/components/CalendarScreen';
import CreateEventForm from './src/components/CreateEventForm';
import CitySelector from './src/components/CitySelector';
import EventCard from './src/components/EventCard';
import EventDetailsModal from './src/components/EventDetailsModal';
import FeedbackScreen from './src/components/FeedbackScreen';
import FavouritesScreen from './src/components/FavouritesScreen';
import HomeFilters from './src/components/HomeFilters';
import HijriCalendarScreen from './src/components/HijriCalendarScreen';
import InboxScreen from './src/components/InboxScreen';
import EventMapView from './src/components/EventMapView';
import MyEventsScreen from './src/components/MyEventsScreen';
import ProfileScreen from './src/components/ProfileScreen';
import RecurringEventForm from './src/components/RecurringEventForm';
import StreamedVideosScreen from './src/components/StreamedVideosScreen';
import { auth, confirmPhoneVerification, sendPhoneVerification, setNativeDisplayName } from './src/firebase/firebase';
import { compareEventsByDateTime, createEventSubmission, createRecurringEventSeries, deleteEventSeries, deleteEventSubmission, getPublicEvents, getUserEventSubmissions, listenActiveEvents, prepareHomeEvents, setEventVisibility, updateEventSeries, updateEventSubmission } from './src/services/events';
import { uploadEventPoster } from './src/services/images';
import { deleteMyAccountAndEvents, ensureUserProfile, migratePhoneAccount, toggleSavedEvent, updateUserPreferences } from './src/services/users';
import { DEFAULT_CITY, cityLabel, normalizeCity } from './src/utils/cities';
import { colors, radius, shadow, spacing } from './src/theme';
import { friendlyError } from './src/utils/errors';

const logo = require('./assets/logo.png');
const appVersion = require('./app.json').expo.version;
const CITY_STORAGE_KEY = '@community-events/selected-city';
const AUTO_EVENT_REFRESH_MS = 60000;
const EMPTY_HOME_FILTERS = {
  organiser: '',
  eventType: '',
  audienceType: '',
  period: '',
  hostName: '',
  suburb: '',
};

function localDateString(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function filterHomeEvents(events, query, filters) {
  let displayed = [...events];
  const today = localDateString();
  if (filters.period) {
    const end = filters.period === 'today'
      ? today
      : localDateString(filters.period === 'week' ? 7 : 30);
    displayed = displayed.filter(event => event.isLive || (
      event.eventDate >= today && event.eventDate <= end
    ));
  }
  if (filters.organiser) {
    displayed = displayed.filter(event => {
      const organiserType = event.organiserType || event.organisationType || 'private';
      const isPrivate = organiserType === 'private';
      return filters.organiser === 'private' ? isPrivate : !isPrivate;
    });
  }
  if (filters.eventType) {
    displayed = displayed.filter(event => (
      event.eventTypeDisplay || event.customEventType || event.eventType
    ) === filters.eventType);
  }
  if (filters.audienceType) {
    displayed = displayed.filter(event => {
      const audience = event.audienceType === 'Mixed Audience' ? 'Family Event' : event.audienceType;
      return audience === filters.audienceType;
    });
  }
  if (filters.hostName.trim()) {
    const host = filters.hostName.trim().toLowerCase();
    displayed = displayed.filter(event => String(event.hostName || '').toLowerCase().includes(host));
  }
  if (filters.suburb.trim()) {
    const suburb = filters.suburb.trim().toLowerCase();
    displayed = displayed.filter(event => String(event.address?.suburb || event.suburb || '').toLowerCase().includes(suburb));
  }

  if (query.trim()) {
    const stopWords = new Set(['event', 'events', 'this', 'the', 'in', 'on', 'at', 'for', 'a', 'an', 'of', 'to', 'and', 'is', 'are', 'near', 'around', 'my', 'show', 'me', 'find', 'all', 'please']);
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const audienceWords = { kid: 'kids', kids: 'kids', child: 'kids', children: 'kids', lady: 'ladies', ladies: 'ladies', women: 'ladies', gent: 'gents', gents: 'gents', men: 'gents', family: 'family', mixed: 'family' };
    const tokens = query.toLowerCase().split(/\s+/)
      .map(token => token.replace(/[^a-z0-9]/g, ''))
      .filter(token => token && !stopWords.has(token));
    if (tokens.length) {
      displayed = displayed.filter(event => {
        const audience = event.audienceType || event.audience || '';
        const haystack = [
          event.eventType,
          event.eventTypeDisplay,
          event.hostName,
          event.eventSubject,
          event.address?.suburb,
          event.address?.fullAddress,
          audience,
          event.speakerName,
        ].filter(Boolean).join(' ').toLowerCase();
        let eventMonth = '';
        try {
          eventMonth = months[new Date(`${event.eventDate}T00:00:00`).getMonth()] || '';
        } catch {}
        return tokens.every(token => {
          if (haystack.includes(token)) return true;
          if (months.includes(token)) return eventMonth === token;
          const audienceWord = audienceWords[token];
          if (!audienceWord) return false;
          const normalizedAudience = audience.toLowerCase();
          if (audienceWord === 'family') return normalizedAudience.includes('family') || normalizedAudience.includes('mixed');
          return normalizedAudience.includes(audienceWord);
        });
      });
    }
  }
  return displayed.sort(compareEventsByDateTime);
}

function EmptyState({ title, text }) {
  return (
    <View style={styles.loadingCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export default function App() {
  const [selectedCity, setSelectedCity] = useState(DEFAULT_CITY);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [savingEventId, setSavingEventId] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [editingEvent, setEditingEvent] = useState(null);
  const [myEvents, setMyEvents] = useState([]);
  const [myEventsLoading, setMyEventsLoading] = useState(true);
  const [myEventsError, setMyEventsError] = useState('');
  const [deleteBusyId, setDeleteBusyId] = useState('');
  const [deleteSeriesBusyId, setDeleteSeriesBusyId] = useState('');
  const [visibilityBusyId, setVisibilityBusyId] = useState('');
  const [homeQuery, setHomeQuery] = useState('');
  const [showHomeFilters, setShowHomeFilters] = useState(false);
  const [homeFilters, setHomeFilters] = useState(EMPTY_HOME_FILTERS);
  const [homeViewMode, setHomeViewMode] = useState('list');
  const [createMode, setCreateMode] = useState('');
  const hasEventsRef = useRef(false);

  const isGuest = !currentUser || currentUser.isAnonymous;

  useEffect(() => {
    let requestId = 0;
    const unsubscribe = onIdTokenChanged(auth, user => {
      const activeRequest = ++requestId;
      setCurrentUser(user);
      setProfile(null);
      setProfileError('');

      if (!user || user.isAnonymous) {
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      const profilePromise = (async () => {
        let migratedProfile = null;
        if (user.phoneNumber) {
          try {
            migratedProfile = await migratePhoneAccount();
          } catch {
            migratedProfile = null;
          }
        }
        return ensureUserProfile(user.uid, {
          ...(migratedProfile || {}),
          email: migratedProfile?.email || user.email || '',
          phone: user.phoneNumber || migratedProfile?.phone || '',
          phoneVerified: Boolean(user.phoneNumber),
        });
      })();

      profilePromise
        .then(value => {
          if (activeRequest === requestId) setProfile(value);
        })
        .catch(err => {
          if (activeRequest === requestId) {
          setProfileError(friendlyError(err, 'Could not initialize your profile.'));
          }
        })
        .finally(() => {
          if (activeRequest === requestId) setProfileLoading(false);
        });
    });

    return () => {
      requestId += 1;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(CITY_STORAGE_KEY)
      .then(value => {
        if (active && value) setSelectedCity(normalizeCity(value));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const loadEvents = useCallback(async ({ refresh = false, silent = false } = {}) => {
    if (!refresh && !silent) setLoading(true);
    if (!silent) setError('');

    try {
      const loaded = await getPublicEvents();
      hasEventsRef.current = loaded.length > 0;
      setEvents(loaded);
      setError('');
    } catch (err) {
      if (!silent || !hasEventsRef.current) {
        setError(friendlyError(err, 'Could not load events.'));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [currentUser?.isAnonymous, currentUser?.uid, loadEvents]);

  useEffect(() => {
    if (!currentUser?.uid || currentUser.isAnonymous) return undefined;
    return listenActiveEvents(
      loaded => {
        hasEventsRef.current = loaded.length > 0;
        setEvents(loaded);
        setError('');
      },
      eventError => setError(friendlyError(eventError, 'Could not update events automatically.'))
    );
  }, [currentUser?.isAnonymous, currentUser?.uid]);

  useEffect(() => {
    const refreshSilently = () => {
      loadEvents({ silent: true });
    };

    const interval = setInterval(refreshSilently, AUTO_EVENT_REFRESH_MS);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshSilently();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [loadEvents]);

  useEffect(() => {
    let active = true;

    async function loadMyEvents() {
      if (!currentUser?.uid || currentUser.isAnonymous) {
        setMyEvents([]);
        setMyEventsLoading(false);
        return;
      }

      setMyEventsLoading(true);
      setMyEventsError('');

      try {
        const loaded = await getUserEventSubmissions(currentUser.uid);
        if (active) setMyEvents(loaded);
      } catch (err) {
        if (active) setMyEventsError(friendlyError(err, 'Could not load your events.'));
      } finally {
        if (active) setMyEventsLoading(false);
      }
    }

    loadMyEvents();

    return () => {
      active = false;
    };
  }, [currentUser?.isAnonymous, currentUser?.uid, createSuccess]);

  const visibleEvents = useMemo(
    () => prepareHomeEvents(events, selectedCity).filter(event => event.isLive || event.eventDate >= localDateString()),
    [events, selectedCity]
  );

  const displayedEvents = useMemo(
    () => filterHomeEvents(visibleEvents, homeQuery, homeFilters),
    [homeFilters, homeQuery, visibleEvents]
  );

  const savedEventIds = useMemo(
    () => (Array.isArray(profile?.savedEvents) ? profile.savedEvents : []),
    [profile?.savedEvents]
  );

  const savedEvents = useMemo(
    () => events.filter(event => savedEventIds.includes(event.id)).sort(compareEventsByDateTime),
    [events, savedEventIds]
  );

  const selectedEventOwned = useMemo(() => (
    Boolean(selectedEvent?.id && myEvents.some(event => event.id === selectedEvent.id))
  ), [myEvents, selectedEvent?.id]);

  const myEventSeriesCounts = useMemo(() => myEvents.reduce((counts, event) => {
    const key = event.seriesId || event.recurringSeriesId;
    if (!key) return counts;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {}), [myEvents]);

  const handleCityChange = useCallback(city => {
    const normalizedCity = normalizeCity(city);
    setSelectedCity(normalizedCity);
    AsyncStorage.setItem(CITY_STORAGE_KEY, normalizedCity).catch(() => {});
  }, []);

  const handleToggleSaved = useCallback(async event => {
    const eventId = event?.id;
    if (!eventId) return;
    if (!currentUser?.uid || currentUser.isAnonymous) {
      setActiveTab('profile');
      setProfileError('Sign in or create an account to save favourites.');
      return;
    }

    setSavingEventId(eventId);
    setProfileError('');

    try {
      const nextProfile = await toggleSavedEvent(
        currentUser.uid,
        eventId,
        !savedEventIds.includes(eventId)
      );
      setProfile(nextProfile);
    } catch (err) {
      setProfileError(friendlyError(err, 'Could not update Favourites.'));
    } finally {
      setSavingEventId('');
    }
  }, [currentUser?.isAnonymous, currentUser?.uid, savedEventIds]);

  const handleSendPhoneCode = useCallback(async phoneNumber => {
    setAuthBusy(true);
    setProfileError('');
    setProfileMessage('');
    try {
      return await sendPhoneVerification(phoneNumber);
    } catch (err) {
      setProfileError(friendlyError(err, 'Could not send the verification code.'));
      return null;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleVerifyPhoneCode = useCallback(async (confirmation, code) => {
    setAuthBusy(true);
    setProfileError('');
    setProfileMessage('');
    try {
      const user = await confirmPhoneVerification(confirmation, code);
      setProfileMessage('Mobile number verified.');
      return user;
    } catch (err) {
      setProfileError(friendlyError(err, 'Could not verify the code.'));
      return null;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setAuthBusy(true);
    setProfileError('');
    try {
      await signOut(auth);
    } catch (err) {
      setProfileError(friendlyError(err, 'Could not sign out.'));
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleSaveProfile = useCallback(async changes => {
    if (!currentUser?.uid || currentUser.isAnonymous) return false;
    setProfileBusy(true);
    setProfileError('');
    setProfileMessage('');
    try {
      if (changes.fullName && changes.fullName !== currentUser.displayName) {
        await setNativeDisplayName(currentUser, changes.fullName);
      }
      const nextProfile = await updateUserPreferences(currentUser.uid, changes);
      setProfile(nextProfile);
      setProfileMessage('Profile settings saved.');
      if (changes.defaultCity) handleCityChange(changes.defaultCity);
      return true;
    } catch (err) {
      setProfileError(friendlyError(err, 'Could not save profile settings.'));
      return false;
    } finally {
      setProfileBusy(false);
    }
  }, [currentUser, handleCityChange]);

  const handleDeleteAccount = useCallback(async archiveEventsNow => {
    if (!currentUser || currentUser.isAnonymous) return false;
    setAuthBusy(true);
    setProfileError('');
    setProfileMessage('');
    try {
      await deleteMyAccountAndEvents(currentUser, archiveEventsNow);
      setActiveTab('home');
      return true;
    } catch (err) {
      setProfileError(friendlyError(
        err,
        err?.code === 'auth/requires-recent-login'
          ? 'For security, sign out and sign back in before deleting your account.'
          : 'Could not delete your account.'
      ));
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, [currentUser]);

  const handleCreateEvent = useCallback(async payload => {
    setCreateBusy(true);
    setCreateError('');
    setCreateSuccess('');

    try {
      const {
        _localImageUri,
        _localImageMimeType,
        ...eventPayload
      } = payload;
      let poster = {};
      if (_localImageUri) {
        poster = await uploadEventPoster(
          _localImageUri,
          currentUser?.uid,
          editingEvent?.seriesId || editingEvent?.recurringSeriesId || editingEvent?.id,
          _localImageMimeType
        );
      }
      const submissionPayload = {
        ...eventPayload,
        ...poster,
        createdByUserEmail: profile?.email || currentUser?.email || '',
        createdByUserPhone: profile?.phone || currentUser?.phoneNumber || '',
        submittedByName: profile?.fullName || currentUser?.displayName || currentUser?.email || '',
        submittedByRole: profile?.role || 'user',
      };

      if (editingEvent?.__editSeries) {
        const updatedCount = await updateEventSeries(editingEvent, submissionPayload);
        setCreateSuccess(`${updatedCount} events in the series updated successfully.`);
      } else if (editingEvent?.id) {
        await updateEventSubmission(editingEvent.id, submissionPayload);
        setCreateSuccess('Event updated.');
      } else {
        const submissionId = await createEventSubmission(submissionPayload);
        setCreateSuccess(`Event added. Reference: ${submissionId}`);
      }

      await loadEvents({ refresh: true });
      setEditingEvent(null);
      setActiveTab('my_events');
    } catch (err) {
      setCreateError(friendlyError(err, 'Could not save event.'));
    } finally {
      setCreateBusy(false);
    }
  }, [currentUser?.displayName, currentUser?.email, currentUser?.phoneNumber, currentUser?.uid, editingEvent, loadEvents, profile?.email, profile?.fullName, profile?.phone, profile?.role]);

  const handleCreateRecurringEvents = useCallback(async (payload, schedule) => {
    setCreateBusy(true);
    setCreateError('');
    setCreateSuccess('');
    try {
      const { _localImageUri, _localImageMimeType, ...eventPayload } = payload;
      let poster = {};
      if (_localImageUri) {
        poster = await uploadEventPoster(
          _localImageUri,
          currentUser?.uid,
          null,
          _localImageMimeType
        );
      }
      const submissionPayload = {
        ...eventPayload,
        ...poster,
        createdByUserEmail: profile?.email || currentUser?.email || '',
        createdByUserPhone: profile?.phone || currentUser?.phoneNumber || '',
        submittedByName: profile?.fullName || currentUser?.displayName || currentUser?.email || '',
        submittedByRole: profile?.role || 'user',
      };
      const result = await createRecurringEventSeries({
        payload: submissionPayload,
        occurrences: schedule.occurrences,
        recurrence: schedule.recurrence,
        profile,
      });
      setCreateSuccess(`${result.totalEvents} recurring event${result.totalEvents === 1 ? '' : 's'} added successfully.`);
      await loadEvents({ refresh: true });
      setCreateMode('');
      setActiveTab('my_events');
    } catch (err) {
      setCreateError(friendlyError(err, 'Could not save recurring events.'));
    } finally {
      setCreateBusy(false);
    }
  }, [currentUser?.displayName, currentUser?.email, currentUser?.phoneNumber, currentUser?.uid, loadEvents, profile]);

  const handleDeleteMyEvent = useCallback(async event => {
    if (!event?.id) return;
    Alert.alert(
      'Delete event',
      'This will permanently remove the submission from your My Events list. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleteBusyId(event.id);
            setMyEventsError('');
            try {
              await deleteEventSubmission(event.id);
              setMyEvents(prev => prev.filter(item => item.id !== event.id));
              setEvents(prev => prev.filter(item => item.id !== event.id));
            } catch (err) {
              setMyEventsError(friendlyError(err, 'Could not delete event.'));
            } finally {
              setDeleteBusyId('');
            }
          },
        },
      ]
    );
  }, []);

  const handleEditMyEvent = useCallback(event => {
    setEditingEvent(event);
    setCreateMode('single');
    setCreateError('');
    setCreateSuccess('');
    setActiveTab('create');
  }, []);

  const handleEditSeries = useCallback(event => {
    const seriesId = event?.seriesId || event?.recurringSeriesId;
    if (!seriesId) {
      setMyEventsError('This recurring series does not have a series ID yet.');
      return;
    }
    setEditingEvent({ ...event, __editSeries: true });
    setCreateMode('single');
    setCreateError('');
    setCreateSuccess('');
    setActiveTab('create');
  }, []);

  const handleCopyMyEvent = useCallback(event => {
    const draft = {
      hostName: event.hostName || '',
      hostPhone: event.hostPhone || '',
      hostContactOptional: event.hostContactOptional || '',
      isOnBehalfOf: Boolean(event.isOnBehalfOf),
      organiserType: event.organiserType || 'private',
      organiserName: event.organiserName || '',
      organisationType: event.organisationType || 'private',
      eventDate: '',
      startTime: '',
      endTime: '',
      timeMode: 'manual',
      prayerName: '',
      prayerLabel: '',
      prayerOffsetMinutes: 0,
      prayerTimeZone: '',
      hijriDate: '',
      enteredAsHijri: false,
      hijriDay: null,
      hijriMonth: null,
      hijriYear: null,
      eventType: event.eventType || 'Majlis',
      customEventType: event.customEventType || '',
      eventTypeDisplay: event.eventTypeDisplay || event.eventType || '',
      eventSubject: event.eventSubject || '',
      notes: event.notes || '',
      audienceType: event.audienceType || 'Family Event',
      address: event.address || {
        fullAddress: '', street: '', suburb: '', state: 'NSW', postcode: '', latitude: null, longitude: null,
      },
      speakerName: event.speakerName || '',
      reciters: event.reciters || [],
      metroArea: event.metroArea || selectedCity,
      _copyDraft: true,
    };
    setEditingEvent(draft);
    setCreateMode('single');
    setCreateError('');
    setCreateSuccess('');
    setActiveTab('create');
  }, [selectedCity]);

  const handleCancelEdit = useCallback(() => {
    setEditingEvent(null);
    setCreateError('');
    setCreateSuccess('');
    setCreateMode('');
    setActiveTab('my_events');
  }, []);

  const handleDeleteSeries = useCallback(async event => {
    const seriesId = event?.seriesId || event?.recurringSeriesId;
    if (!seriesId) return;
    Alert.alert(
      'Delete entire recurring series',
      'This will permanently remove every event in this recurring series. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Series',
          style: 'destructive',
          onPress: async () => {
            setDeleteSeriesBusyId(seriesId);
            setMyEventsError('');
            try {
              await deleteEventSeries(event);
              setMyEvents(current => current.filter(item => (item.seriesId || item.recurringSeriesId) !== seriesId));
              setEvents(current => current.filter(item => (item.seriesId || item.recurringSeriesId) !== seriesId));
              setCreateSuccess('Recurring series deleted.');
            } catch (err) {
              setMyEventsError(friendlyError(err, 'Could not delete the recurring series.'));
            } finally {
              setDeleteSeriesBusyId('');
            }
          },
        },
      ]
    );
  }, []);

  const handleToggleVisibility = useCallback(async event => {
    if (!event?.id) return;
    const hidden = !event.hidden;
    setVisibilityBusyId(event.id);
    setMyEventsError('');
    try {
      await setEventVisibility(event.id, hidden);
      setMyEvents(current => current.map(item => (
        item.id === event.id ? { ...item, hidden } : item
      )));
      await loadEvents({ refresh: true });
    } catch (err) {
      setMyEventsError(friendlyError(err, 'Could not change event visibility.'));
    } finally {
      setVisibilityBusyId('');
    }
  }, [loadEvents]);

  const requestTabChange = useCallback(nextTab => {
    if (editingEvent && nextTab !== 'create') {
      Alert.alert(
        'Discard changes?',
        'You have an event open for editing. Leave without saving changes?',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setEditingEvent(null);
              setCreateError('');
              setCreateSuccess('');
              setActiveTab(nextTab);
            },
          },
        ]
      );
      return;
    }

    if (nextTab !== 'create') {
      setEditingEvent(null);
      setCreateError('');
      setCreateSuccess('');
      setCreateMode('');
    } else if (!editingEvent) {
      setCreateMode('');
    }
    setActiveTab(nextTab);
  }, [editingEvent]);

  const renderHeader = () => (
    <View style={styles.contentHeader}>
      <CitySelector selectedCity={selectedCity} onChange={handleCityChange} allowCurrentLocation />
      {!isGuest ? (
        <View style={styles.viewToggle}>
          {['list', 'map'].map(mode => (
            <Pressable key={mode} onPress={() => setHomeViewMode(mode)} style={[styles.viewToggleButton, homeViewMode === mode && styles.viewToggleButtonActive]}>
              <Text style={[styles.viewToggleText, homeViewMode === mode && styles.viewToggleTextActive]}>{mode === 'list' ? 'List' : 'Map'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {homeViewMode === 'list' || isGuest ? <HomeFilters
          events={visibleEvents}
          query={homeQuery}
          onQueryChange={setHomeQuery}
          filters={homeFilters}
          onFilterChange={(field, value) => setHomeFilters(current => ({ ...current, [field]: value }))}
          showFilters={showHomeFilters}
          onToggleFilters={() => setShowHomeFilters(current => !current)}
          onClear={() => setHomeFilters({ ...EMPTY_HOME_FILTERS })}
        /> : null}
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.sectionTitle}>Upcoming Events</Text>
          <Text style={styles.sectionSubtitle}>
            {displayedEvents.length} event{displayedEvents.length === 1 ? '' : 's'} in {cityLabel(selectedCity)}
          </Text>
        </View>
      </View>
      <Text style={styles.notice}>
        Hijri dates are subject to moon sighting. Events are user-submitted, so please verify details with hosts.
      </Text>
      {isGuest ? (
        <View style={styles.guestNotice}>
          <Text style={styles.guestNoticeText}>Sign in for full event details and app benefits, including directions, adding events, Favourites and reminders.</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.teal} size="large" />
          <Text style={styles.loadingText}>Loading community events...</Text>
        </View>
      );
    }

    return (
        <EmptyState
        title="No events found"
        text={homeQuery || Object.values(homeFilters).some(Boolean)
          ? 'No upcoming events match your search or filters.'
          : 'Try another city or check back shortly for new events.'}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <AppHeader
        activeTab={activeTab}
        isGuest={isGuest}
        user={currentUser}
        profile={profile}
        logoSource={logo}
        onNavigate={requestTabChange}
        onSignOut={handleSignOut}
        authBusy={authBusy}
      />

      {activeTab === 'home' && homeViewMode === 'map' && !isGuest ? (
        <ScrollView contentContainerStyle={styles.mapScrollContent} nestedScrollEnabled>
          <View style={styles.mapHeader}>{renderHeader()}</View>
          <EventMapView events={visibleEvents} onSelectEvent={setSelectedEvent} />
        </ScrollView>
      ) : activeTab === 'home' ? (
        <FlatList
          data={loading ? [] : displayedEvents}
          keyExtractor={(item, index) => item.id || `${item.eventDate || 'event'}-${index}`}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              isSaved={savedEventIds.includes(item.id)}
              saving={savingEventId === item.id}
              onPress={() => setSelectedEvent(item)}
              onToggleSaved={isGuest ? undefined : () => handleToggleSaved(item)}
            />
          )}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
        />
      ) : activeTab === 'my_events' ? (
        <MyEventsScreen
          events={myEvents}
          loading={myEventsLoading}
          error={myEventsError}
          onPressEvent={setSelectedEvent}
          deletingId={deleteBusyId}
          onDelete={handleDeleteMyEvent}
          onEdit={handleEditMyEvent}
          onCopy={profile?.role === 'admin' || profile?.role === 'superAdmin' ? handleCopyMyEvent : undefined}
          onAddEvent={() => {
            setCreateMode('');
            setActiveTab('create');
          }}
          onToggleVisibility={handleToggleVisibility}
          visibilityBusyId={visibilityBusyId}
          seriesCounts={myEventSeriesCounts}
          onEditSeries={profile?.role === 'admin' || profile?.role === 'superAdmin' ? handleEditSeries : undefined}
          onDeleteSeries={profile?.role === 'admin' || profile?.role === 'superAdmin' ? handleDeleteSeries : undefined}
          deletingSeriesId={deleteSeriesBusyId}
        />
      ) : activeTab === 'calendar' ? (
        <CalendarScreen
          events={visibleEvents}
          user={currentUser}
          isGuest={isGuest}
          savedIds={savedEventIds}
          savingEventId={savingEventId}
          onBack={() => setActiveTab('home')}
          onOpenEvent={setSelectedEvent}
          onToggleSaved={handleToggleSaved}
        />
      ) : activeTab === 'hijri-calendar' ? (
        <HijriCalendarScreen
          profile={profile}
        />
      ) : activeTab === 'admin' ? (
        <AdminDashboardScreen
          user={currentUser}
          profile={profile}
          events={events}
          onNavigate={setActiveTab}
        />
      ) : activeTab === 'streams' ? (
        <StreamedVideosScreen
          isGuest={isGuest}
          onBack={() => setActiveTab('home')}
        />
      ) : activeTab === 'inbox' ? (
        <InboxScreen
          user={currentUser}
          profile={profile}
          onBack={() => setActiveTab('home')}
        />
      ) : activeTab === 'feedback' ? (
        <FeedbackScreen
          user={currentUser}
          profile={profile}
          selectedCity={selectedCity}
          onBack={() => setActiveTab('home')}
        />
      ) : activeTab === 'create' && !editingEvent && !createMode ? (
        <AddEventChoice
          canCreateRecurring={profile?.role === 'admin' || profile?.role === 'superAdmin'}
          onChoose={setCreateMode}
        />
      ) : activeTab === 'create' && createMode === 'recurring' && !editingEvent ? (
        <RecurringEventForm
          defaultCity={selectedCity}
          defaultHostName={profile?.fullName || currentUser?.displayName || ''}
          defaultHostPhone={profile?.phone || currentUser?.phoneNumber || ''}
          existingEvents={events}
          submitting={createBusy}
          error={createError}
          success={createSuccess}
          onSubmit={handleCreateRecurringEvents}
          onBackToChoice={() => setCreateMode('')}
          onRequireSignIn={() => setActiveTab('profile')}
        />
      ) : activeTab === 'create' ? (
        <CreateEventForm
          defaultCity={selectedCity}
          defaultHostName={profile?.fullName || currentUser?.displayName || ''}
          defaultHostPhone={profile?.phone || currentUser?.phoneNumber || ''}
          existingEvents={events}
          initialEvent={editingEvent}
          title={editingEvent?.__editSeries ? 'Edit Entire Series' : editingEvent?.id ? 'Edit Event' : 'Add Event'}
          subtitle={editingEvent?.__editSeries ? 'Shared details will be updated across the series. Each event keeps its own date.' : editingEvent?.id ? 'Update your community event' : 'Add a new community event'}
          submitLabel={editingEvent?.__editSeries ? 'Update Entire Series' : editingEvent?.id ? 'Update Event' : 'Add Event'}
          submitting={createBusy}
          error={createError}
          success={createSuccess}
          canSubmit={!isGuest}
          hideDate={Boolean(editingEvent?.__editSeries)}
          onSubmit={handleCreateEvent}
          onCancel={editingEvent ? handleCancelEdit : () => setCreateMode('')}
          onRequireSignIn={() => setActiveTab('profile')}
        />
      ) : activeTab === 'favourites' ? (
        <FavouritesScreen
          events={savedEvents}
          loading={profileLoading || loading}
          savingEventId={savingEventId}
          onPressEvent={setSelectedEvent}
          onToggleSaved={handleToggleSaved}
          onBrowseEvents={() => setActiveTab('home')}
        />
      ) : activeTab === 'bulk_share' ? (
        <BulkShareScreen
          events={events}
          profile={profile}
          user={currentUser}
          onBack={() => setActiveTab('profile')}
        />
      ) : (
        <ProfileScreen
          user={currentUser}
          profile={profile}
          loading={profileLoading}
          error={profileError}
          message={profileMessage}
          savedCount={savedEvents.length}
          authBusy={authBusy}
          profileBusy={profileBusy}
          onSendPhoneCode={handleSendPhoneCode}
          onVerifyPhoneCode={handleVerifyPhoneCode}
          onSaveProfile={handleSaveProfile}
          onSignOut={handleSignOut}
          onDeleteAccount={handleDeleteAccount}
          onOpenBulkShare={profile?.role === 'admin' || profile?.role === 'superAdmin' ? () => setActiveTab('bulk_share') : undefined}
          appVersion={appVersion}
        />
      )}
      {activeTab === 'home' ? (
        <View pointerEvents="box-none" style={styles.floatingCtaWrap}>
          <Pressable onPress={() => setActiveTab('calendar')} style={({ pressed }) => [styles.floatingCta, pressed && styles.floatingCtaPressed]}>
            <Text style={styles.floatingCtaText}>View Calendar &amp; Sync</Text>
            <Text style={styles.floatingCtaArrow}>›</Text>
          </Pressable>
        </View>
      ) : null}
      <EventDetailsModal
        event={selectedEvent}
        visible={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        isGuest={isGuest}
        user={currentUser}
        profile={profile}
        onEdit={selectedEventOwned ? event => {
          setSelectedEvent(null);
          handleEditMyEvent(event);
        } : undefined}
        onDelete={selectedEventOwned ? event => {
          setSelectedEvent(null);
          handleDeleteMyEvent(event);
        } : undefined}
        onCopy={profile?.role === 'admin' || profile?.role === 'superAdmin' ? event => {
          setSelectedEvent(null);
          handleCopyMyEvent(event);
        } : undefined}
        onEditSeries={selectedEventOwned && (profile?.role === 'admin' || profile?.role === 'superAdmin') && (selectedEvent?.seriesId || selectedEvent?.recurringSeriesId) ? event => {
          setSelectedEvent(null);
          handleEditSeries(event);
        } : undefined}
        onDeleteSeries={selectedEventOwned && (profile?.role === 'admin' || profile?.role === 'superAdmin') && (selectedEvent?.seriesId || selectedEvent?.recurringSeriesId) ? event => {
          setSelectedEvent(null);
          handleDeleteSeries(event);
        } : undefined}
        />
        <BottomNavigation
          activeTab={activeTab === 'bulk_share' || activeTab === 'admin' ? 'profile' : activeTab === 'calendar' || activeTab === 'hijri-calendar' || activeTab === 'streams' || activeTab === 'feedback' || activeTab === 'inbox' ? 'home' : activeTab}
          isGuest={isGuest}
          onChange={requestTabChange}
        />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 148,
  },
  mapScrollContent: { paddingBottom: 148 },
  mapHeader: { paddingHorizontal: spacing.lg },
  contentHeader: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  viewToggle: {
    flexDirection: 'row',
    padding: 3,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: 11,
    backgroundColor: '#edf2f1',
  },
  viewToggleButton: {
    flex: 1,
    minHeight: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  viewToggleButtonActive: { backgroundColor: colors.surface, ...shadow },
  viewToggleText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  viewToggleTextActive: { color: colors.tealDark },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.navy,
    fontSize: 28,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  notice: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
    marginTop: spacing.md,
  },
  guestNotice: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#acd9d5',
    backgroundColor: '#eaf7f5',
  },
  guestNoticeText: {
    color: '#09645f',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  calendarLink: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  calendarLinkText: { color: colors.text, fontSize: 14, fontWeight: '900' },
  calendarLinkArrow: { color: colors.tealDark, fontSize: 24, fontWeight: '900' },
  floatingCtaWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 82,
  },
  floatingCta: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    ...shadow,
  },
  floatingCtaPressed: { opacity: 0.82 },
  floatingCtaText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  floatingCtaArrow: {
    color: colors.tealDark,
    fontSize: 24,
    fontWeight: '900',
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
    marginTop: spacing.md,
  },
  loadingCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  emptyTitle: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '900',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
