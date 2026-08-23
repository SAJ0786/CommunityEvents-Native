import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onIdTokenChanged, signOut } from '@react-native-firebase/auth';
import AppHeader from './src/components/AppHeader';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import AuthLandingScreen from './src/components/AuthLandingScreen';
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
import NativeLiveStreamModal from './src/components/NativeLiveStreamModal';
import ProfileScreen from './src/components/ProfileScreen';
import RecurringEventForm from './src/components/RecurringEventForm';
import StreamedVideosScreen from './src/components/StreamedVideosScreen';
import BusinessDirectoryModule from './src/business/BusinessDirectoryModule';
import { auth, confirmPhoneVerification, ensureFirebaseSession, sendPhoneVerification, setNativeDisplayName } from './src/firebase/firebase';
import { compareEventsByDateTime, createEventSubmission, createRecurringEventSeries, deleteEventSeries, deleteEventSubmission, getPublicEvents, getUserEventSubmissions, listenActiveEvents, prepareHomeEvents, setEventVisibility, updateEventSeries, updateEventSubmission } from './src/services/events';
import { uploadEventPoster } from './src/services/images';
import { deleteMyAccountAndEvents, ensureUserProfile, migratePhoneAccount, toggleSavedEvent, updateUserPreferences } from './src/services/users';
import { DEFAULT_CITY, cityLabel, getEventMetroArea, normalizeCity } from './src/utils/cities';
import { colors, radius, shadow, spacing } from './src/theme';
import { friendlyError } from './src/utils/errors';
import { cancelFavouriteReminder, scheduleFavouriteReminder } from './src/services/reminders';
import {
  clearDiagnosticUser,
  initializeDiagnostics,
  logDiagnostic,
  recordNonFatalError,
  setDiagnosticContext,
  setDiagnosticUser,
} from './src/services/diagnostics';

const logo = require('./assets/logo.png');
const appVersion = require('./app.json').expo.version;
const appBuild = require('./app.json').expo.android.versionCode;
const CITY_STORAGE_KEY = '@community-events/selected-city';
const MODULE_STORAGE_KEY = '@community-connect/default-module';
const AUTO_EVENT_REFRESH_MS = 60000;
const PROFILE_LOAD_TIMEOUT_MS = 15000;
const EMPTY_HOME_FILTERS = {
  organiser: '',
  eventType: '',
  audienceType: '',
  period: '',
  hostName: '',
  suburb: '',
};

function withTimeout(promise, milliseconds, code = 'unavailable') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('The service is taking too long to respond.');
      error.code = code;
      reject(error);
    }, milliseconds);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}

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

function MainApp() {
  const [appModule, setAppModule] = useState('events');
  const [preferredModule, setPreferredModule] = useState('events');
  const [directoryTab, setDirectoryTab] = useState('home');
  const [directoryFilter, setDirectoryFilter] = useState(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [businessListingOpen, setBusinessListingOpen] = useState(false);
  const [selectedCity, setSelectedCity] = useState(DEFAULT_CITY);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [streamEvent, setStreamEvent] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [currentUser, setCurrentUser] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [guestAccessGranted, setGuestAccessGranted] = useState(false);
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
  const [liveOnly, setLiveOnly] = useState(false);
  const livePulse = useRef(new Animated.Value(1)).current;
  const [createMode, setCreateMode] = useState('');
  const hasEventsRef = useRef(false);

  const isGuest = !currentUser || currentUser.isAnonymous;

  useEffect(() => {
    initializeDiagnostics()
      .then(() => logDiagnostic('APP_NAVIGATION_READY'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setDiagnosticContext({
      current_screen: appModule === 'directory' ? `Business:${directoryTab}` : `Events:${activeTab}`,
      feature: appModule === 'directory' ? 'business_directory' : 'events',
      authentication_state: isGuest ? 'guest' : 'authenticated',
    });
    logDiagnostic('SCREEN_CHANGED', { module: appModule, screen: appModule === 'directory' ? directoryTab : activeTab });
  }, [activeTab, appModule, directoryTab, isGuest]);

  useEffect(() => {
    if (currentUser?.uid && !currentUser.isAnonymous) setDiagnosticUser(currentUser.uid);
    else clearDiagnosticUser();
  }, [currentUser?.isAnonymous, currentUser?.uid]);

  useEffect(() => {
    let requestId = 0;
    const unsubscribe = onIdTokenChanged(auth, user => {
      const activeRequest = ++requestId;
      setCurrentUser(user);
      setAuthResolved(true);
      setProfile(null);
      setProfileError('');

      if (!user || user.isAnonymous) {
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      const profilePromise = withTimeout((async () => {
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
      })(), PROFILE_LOAD_TIMEOUT_MS);

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

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(MODULE_STORAGE_KEY).then(value => {
      if (!active || !['events', 'directory'].includes(value)) return;
      setPreferredModule(value);
      setAppModule(value);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const handlePreferredModuleChange = useCallback(module => {
    if (!['events', 'directory'].includes(module)) return;
    setPreferredModule(module);
    AsyncStorage.setItem(MODULE_STORAGE_KEY, module).catch(() => {});
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
      recordNonFatalError(err, { feature: 'events', operation: 'load_public_events', current_screen: 'Home' });
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
    setSelectedEvent(current => {
      if (!current?.id) return current;
      return events.find(item => item.id === current.id) || current;
    });
    setStreamEvent(current => {
      if (!current?.id) return current;
      return events.find(item => item.id === current.id) || current;
    });
  }, [events]);

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

  const liveEventCount = useMemo(() => visibleEvents.filter(event => event.isLive).length, [visibleEvents]);
  const displayedEvents = useMemo(() => {
    const filtered = filterHomeEvents(visibleEvents, homeQuery, homeFilters);
    return liveOnly ? filtered.filter(event => event.isLive) : filtered;
  }, [homeFilters, homeQuery, liveOnly, visibleEvents]);

  useEffect(() => {
    if (!liveEventCount) {
      setLiveOnly(false);
      livePulse.setValue(1);
      return undefined;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(livePulse, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      Animated.timing(livePulse, { toValue: 1, duration: 650, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [liveEventCount, livePulse]);

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
  const adminCanManageSelected = useMemo(() => {
    if (!selectedEvent?.id) return false;
    if (profile?.role === 'superAdmin') return true;
    if (profile?.role !== 'admin') return false;
    return getEventMetroArea(selectedEvent) === normalizeCity(profile?.adminCity || profile?.defaultCity || DEFAULT_CITY);
  }, [profile?.adminCity, profile?.defaultCity, profile?.role, selectedEvent]);
  const canManageSelectedEvent = selectedEventOwned || adminCanManageSelected;

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

  const requestSignIn = useCallback((message = '') => {
    setProfileError(message);
    setProfileMessage('');
    setGuestAccessGranted(false);
  }, []);

  const handleToggleSaved = useCallback(async event => {
    const eventId = event?.id;
    if (!eventId) return;
    if (!currentUser?.uid || currentUser.isAnonymous) {
      requestSignIn('Sign in or create an account to save favourites.');
      return;
    }

    setSavingEventId(eventId);
    setProfileError('');

    try {
      const shouldSave = !savedEventIds.includes(eventId);
      const nextProfile = await toggleSavedEvent(
        currentUser.uid,
        eventId,
        shouldSave
      );
      setProfile(nextProfile);
      if (shouldSave) scheduleFavouriteReminder(event).catch(() => {});
      else cancelFavouriteReminder(eventId).catch(() => {});
    } catch (err) {
      setProfileError(friendlyError(err, 'Could not update Favourites.'));
    } finally {
      setSavingEventId('');
    }
  }, [currentUser?.isAnonymous, currentUser?.uid, requestSignIn, savedEventIds]);

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
      setGuestAccessGranted(false);
      setAppModule(preferredModule);
      setProfileMessage('Mobile number verified.');
      return user;
    } catch (err) {
      setProfileError(friendlyError(err, 'Could not verify the code.'));
      return null;
    } finally {
      setAuthBusy(false);
    }
  }, [preferredModule]);

  const handleSignOut = useCallback(async () => {
    setAuthBusy(true);
    setProfileError('');
    try {
      await signOut(auth);
      setGuestAccessGranted(false);
    } catch (err) {
      setProfileError(friendlyError(err, 'Could not sign out.'));
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleContinueAsGuest = useCallback(async () => {
    setAuthBusy(true);
    setProfileError('');
    try {
      await ensureFirebaseSession();
      setGuestAccessGranted(true);
      setAppModule(preferredModule);
    } catch (err) {
      setProfileError(friendlyError(err, 'Guest browsing could not start. Check your connection and try again.'));
    } finally {
      setAuthBusy(false);
    }
  }, [preferredModule]);

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
      setProfileMessage(nextProfile?.roleDemoted
        ? 'Default city updated. Admin access was removed because admin access is city-specific.'
        : 'Profile settings saved.');
      if (changes.defaultCity) handleCityChange(changes.defaultCity);
      if (changes.defaultModule) handlePreferredModuleChange(changes.defaultModule);
      return true;
    } catch (err) {
      setProfileError(friendlyError(err, 'Could not save profile settings.'));
      return false;
    } finally {
      setProfileBusy(false);
    }
  }, [currentUser, handleCityChange, handlePreferredModuleChange]);

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
        createdByName: profile?.fullName || currentUser?.displayName || currentUser?.email || '',
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
        createdByName: profile?.fullName || currentUser?.displayName || currentUser?.email || '',
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
    if (isGuest && nextTab === 'profile') {
      requestSignIn();
      return;
    }
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
  }, [editingEvent, isGuest, requestSignIn]);

  const requestModuleChange = useCallback(nextModule => {
    if (!nextModule || nextModule === appModule) return;

    const switchModule = () => {
      setSelectedEvent(null);
      setStreamEvent(null);
      setSelectedBusinessId('');
      setAppModule(nextModule);
    };

    if (nextModule === 'directory' && editingEvent) {
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
              setCreateMode('');
              switchModule();
            },
          },
        ]
      );
      return;
    }

    if (nextModule === 'events' && appModule === 'directory' && businessListingOpen) {
      Alert.alert(
        'Leave business listing?',
        'Your unsaved business listing changes will be discarded.',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: switchModule },
        ]
      );
      return;
    }

    switchModule();
  }, [appModule, businessListingOpen, editingEvent]);

  const handleHeaderNavigate = useCallback(nextTab => {
    if (nextTab === 'login') {
      requestSignIn();
      return;
    }
    const businessRoutes = {
      'business-home': 'home',
      'business-admin': 'admin',
      'business-inbox': 'inbox',
      'business-feedback': 'feedback',
      'business-report': 'report',
      'business-contact': 'contact',
    };
    if (businessRoutes[nextTab]) {
      setSelectedBusinessId('');
      setAppModule('directory');
      setDirectoryTab(businessRoutes[nextTab]);
      return;
    }
    const navigate = () => {
      setAppModule('events');
      setSelectedBusinessId('');
      requestTabChange(nextTab);
    };
    if (appModule === 'directory' && businessListingOpen) {
      Alert.alert(
        'Leave business listing?',
        'Your unsaved business listing changes will be discarded.',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: navigate },
        ]
      );
      return;
    }
    navigate();
  }, [appModule, businessListingOpen, requestSignIn, requestTabChange]);

  const openEventsProfile = useCallback(() => {
    setAppModule('events');
    setSelectedBusinessId('');
    requestTabChange('profile');
  }, [requestTabChange]);

  const openNiazArrangement = useCallback(event => {
    const eventCity = getEventMetroArea(event);
    handleCityChange(eventCity);
    setSelectedEvent(null);
    setSelectedBusinessId('');
    setDirectoryFilter({
      categoryId: 'food',
      subcategoryId: 'niaz-preparation-and-supply',
      label: 'Niaz Preparation and supply',
      nonce: Date.now(),
    });
    setDirectoryTab('home');
    setAppModule('directory');
  }, [handleCityChange]);

  const renderHeader = () => (
    <View style={styles.contentHeader}>
      <View style={styles.homeControls}>
        <CitySelector compact selectedCity={selectedCity} onChange={handleCityChange} allowCurrentLocation />
        <View style={styles.viewToggle}>
          {['list', 'map'].map(mode => (
            <Pressable key={mode} onPress={() => setHomeViewMode(mode)} style={[styles.viewToggleButton, homeViewMode === mode && styles.viewToggleButtonActive]}>
              <Text style={[styles.viewToggleText, homeViewMode === mode && styles.viewToggleTextActive]}>{mode === 'list' ? 'List' : 'Map'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.eventShortcuts}>
        <Pressable
          accessibilityLabel="Open Streamed Videos"
          onPress={() => requestTabChange('streams')}
          style={({ pressed }) => [styles.eventShortcut, styles.streamShortcut, pressed && styles.eventShortcutPressed]}
        >
          <View style={[styles.eventShortcutIcon, styles.streamShortcutIcon]}><Text style={styles.streamShortcutIconText}>{'\u25B6'}</Text></View>
          <Text style={styles.eventShortcutText}>Streamed Videos</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Open Hijri Calendar"
          onPress={() => requestTabChange('hijri-calendar')}
          style={({ pressed }) => [styles.eventShortcut, styles.hijriShortcut, pressed && styles.eventShortcutPressed]}
        >
          <View style={[styles.eventShortcutIcon, styles.hijriShortcutIcon]}><Text style={styles.hijriShortcutIconText}>{'\u263E'}</Text></View>
          <Text style={styles.eventShortcutText}>Hijri Calendar</Text>
        </Pressable>
      </View>
      {homeViewMode === 'list' ? <HomeFilters
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
        <View style={styles.titleAccent} />
        <View style={styles.titleCopy}>
          <Text style={styles.sectionEyebrow}>DISCOVER WHAT'S ON</Text>
          <Text style={styles.sectionTitle}>Upcoming Events</Text>
          <Text style={styles.sectionSubtitle}>
            {displayedEvents.length} event{displayedEvents.length === 1 ? '' : 's'} in {cityLabel(selectedCity)}
          </Text>
        </View>
        {liveEventCount ? (
          <Pressable accessibilityState={{ selected: liveOnly }} onPress={() => setLiveOnly(current => !current)}>
            <Animated.View style={[styles.liveFilter, liveOnly && styles.liveFilterActive, { opacity: livePulse }]}>
              <View style={styles.liveDot} />
              <Text style={styles.liveFilterText}>LIVE {liveEventCount}</Text>
            </Animated.View>
          </Pressable>
        ) : null}
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

  if (!authResolved) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ExpoStatusBar style="dark" />
        <View style={styles.entryLoading}>
          <Image source={logo} resizeMode="contain" style={styles.entryLoadingLogo} />
          <ActivityIndicator color={colors.teal} size="large" />
          <Text style={styles.loadingText}>Checking your account...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isGuest && !guestAccessGranted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ExpoStatusBar style="dark" />
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <AuthLandingScreen
          logoSource={logo}
          preferredModule={preferredModule}
          busy={authBusy}
          error={profileError}
          onPreferredModuleChange={handlePreferredModuleChange}
          onSendPhoneCode={handleSendPhoneCode}
          onVerifyPhoneCode={handleVerifyPhoneCode}
          onContinueGuest={handleContinueAsGuest}
          onClearError={() => setProfileError('')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <AppHeader
        activeTab={appModule === 'directory' ? directoryTab : activeTab}
        activeModule={appModule}
        isGuest={isGuest}
        user={currentUser}
        profile={profile}
        logoSource={logo}
        onNavigate={handleHeaderNavigate}
        onModuleChange={requestModuleChange}
        onSignOut={handleSignOut}
        authBusy={authBusy}
      />

      {appModule === 'directory' ? (
        <BusinessDirectoryModule
          activeTab={directoryTab}
          onTabChange={setDirectoryTab}
          selectedBusinessId={selectedBusinessId}
          onSelectBusiness={setSelectedBusinessId}
          selectedCity={selectedCity}
          onCityChange={handleCityChange}
          isGuest={isGuest}
          currentUser={currentUser}
          profile={profile}
          onOpenAccount={openEventsProfile}
          onEditingStateChange={setBusinessListingOpen}
          initialFilter={directoryFilter}
          onInitialFilterConsumed={() => setDirectoryFilter(null)}
        />
      ) : activeTab === 'home' && homeViewMode === 'map' ? (
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
          selectedCity={selectedCity}
        />
      ) : activeTab === 'admin' ? (
        <AdminDashboardScreen
          user={currentUser}
          profile={profile}
          events={events}
          onNavigate={setActiveTab}
          onEditEvent={handleEditMyEvent}
          onCopyEvent={handleCopyMyEvent}
          onEditSeries={handleEditSeries}
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
          onRequireSignIn={() => requestSignIn('Sign in to add recurring events.')}
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
          onRequireSignIn={() => requestSignIn('Sign in to add or edit events.')}
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
          appBuild={appBuild}
          preferredModule={preferredModule}
          onPreferredModuleChange={handlePreferredModuleChange}
        />
      )}
      {appModule === 'events' && activeTab === 'home' ? (
        <View pointerEvents="box-none" style={styles.floatingCtaWrap}>
          <Pressable onPress={() => setActiveTab('calendar')} style={({ pressed }) => [styles.floatingCta, pressed && styles.floatingCtaPressed]}>
            <Text style={styles.floatingCtaText}>View Calendar &amp; Sync</Text>
            <Text style={styles.floatingCtaArrow}>›</Text>
          </Pressable>
        </View>
      ) : null}
      <EventDetailsModal
        event={selectedEvent}
        visible={appModule === 'events' && Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        isGuest={isGuest}
        user={currentUser}
        profile={profile}
        onNiazArrangement={openNiazArrangement}
        onEdit={canManageSelectedEvent ? event => {
          setSelectedEvent(null);
          handleEditMyEvent(event);
        } : undefined}
        onDelete={canManageSelectedEvent ? event => {
          setSelectedEvent(null);
          handleDeleteMyEvent(event);
        } : undefined}
        onCopy={adminCanManageSelected ? event => {
          setSelectedEvent(null);
          handleCopyMyEvent(event);
        } : undefined}
        onEditSeries={adminCanManageSelected && (selectedEvent?.seriesId || selectedEvent?.recurringSeriesId) ? event => {
          setSelectedEvent(null);
          handleEditSeries(event);
        } : undefined}
        onDeleteSeries={adminCanManageSelected && (selectedEvent?.seriesId || selectedEvent?.recurringSeriesId) ? event => {
          setSelectedEvent(null);
          handleDeleteSeries(event);
        } : undefined}
        canManageStream={!isGuest && canManageSelectedEvent}
        onManageStream={event => {
          setSelectedEvent(null);
          setStreamEvent(event);
        }}
        />
        <NativeLiveStreamModal
          event={streamEvent}
          visible={Boolean(streamEvent)}
          onClose={() => setStreamEvent(null)}
          onStreamChanged={updatedEvent => {
            setStreamEvent(updatedEvent);
            setEvents(current => current.map(item => item.id === updatedEvent.id ? { ...item, ...updatedEvent } : item));
            setMyEvents(current => current.map(item => item.id === updatedEvent.id ? { ...item, ...updatedEvent } : item));
          }}
        />
        {appModule === 'events' ? (
          <BottomNavigation
            activeTab={activeTab === 'bulk_share' || activeTab === 'admin' ? 'profile' : activeTab === 'calendar' || activeTab === 'hijri-calendar' || activeTab === 'streams' || activeTab === 'feedback' || activeTab === 'inbox' ? 'home' : activeTab}
            isGuest={isGuest}
            onChange={requestTabChange}
          />
        ) : null}
    </SafeAreaView>
  );
}

export default function App() {
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  return (
    <AppErrorBoundary>
      <MainApp />
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  entryLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  entryLoadingLogo: { width: 92, height: 92 },
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
  homeControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eventShortcuts: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  eventShortcut: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: 12, backgroundColor: colors.surface },
  streamShortcut: { borderColor: '#ffc4c4' },
  hijriShortcut: { borderColor: '#d9cff8' },
  eventShortcutIcon: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  streamShortcutIcon: { backgroundColor: '#ff0000' },
  hijriShortcutIcon: { backgroundColor: '#5b3fb5' },
  streamShortcutIconText: { color: colors.surface, fontSize: 12, fontWeight: '900' },
  hijriShortcutIconText: { color: '#ffd66b', fontSize: 17, fontWeight: '900' },
  eventShortcutText: { color: colors.navy, fontSize: 11.5, fontWeight: '900' },
  eventShortcutPressed: { opacity: 0.76 },
  viewToggle: {
    flex: 1,
    flexDirection: 'row',
    padding: 3,
    marginTop: 0,
    marginBottom: 0,
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
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  titleAccent: { width: 5, height: 48, borderRadius: 3, backgroundColor: colors.teal },
  titleCopy: { flex: 1, minWidth: 0 },
  sectionEyebrow: { color: colors.tealDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.25 },
  sectionTitle: {
    color: colors.navy,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
  },
  liveFilter: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: 19, backgroundColor: '#ef4444' },
  liveFilterActive: { backgroundColor: '#b91c1c' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.surface },
  liveFilterText: { color: colors.surface, fontSize: 11, fontWeight: '900' },
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
