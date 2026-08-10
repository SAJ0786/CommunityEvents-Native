import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import BottomNavigation from './src/components/BottomNavigation';
import CitySelector from './src/components/CitySelector';
import EventCard from './src/components/EventCard';
import EventDetailsModal from './src/components/EventDetailsModal';
import ProfileScreen from './src/components/ProfileScreen';
import { auth } from './src/firebase/firebase';
import { getPublicEvents, prepareHomeEvents } from './src/services/events';
import { getUserProfile } from './src/services/users';
import { DEFAULT_CITY, cityLabel, normalizeCity } from './src/utils/cities';
import { colors, radius, shadow, spacing } from './src/theme';

const logo = require('./assets/logo.png');
const CITY_STORAGE_KEY = '@community-events/selected-city';

export default function App() {
  const [selectedCity, setSelectedCity] = useState(DEFAULT_CITY);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    let requestId = 0;
    const unsubscribe = onAuthStateChanged(auth, user => {
      const activeRequest = ++requestId;
      setCurrentUser(user);
      setProfile(null);
      setProfileError('');

      if (!user || user.isAnonymous) {
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      getUserProfile(user.uid)
        .then(value => {
          if (activeRequest === requestId) setProfile(value);
        })
        .catch(err => {
          if (activeRequest === requestId) {
            setProfileError(err?.message || 'Could not load your profile.');
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

  const loadEvents = useCallback(async ({ refresh = false } = {}) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const loaded = await getPublicEvents();
      setEvents(loaded);
    } catch (err) {
      setError(err?.message || 'Could not load events.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const visibleEvents = useMemo(
    () => prepareHomeEvents(events, selectedCity),
    [events, selectedCity]
  );

  const handleCityChange = useCallback(city => {
    const normalizedCity = normalizeCity(city);
    setSelectedCity(normalizedCity);
    AsyncStorage.setItem(CITY_STORAGE_KEY, normalizedCity).catch(() => {});
  }, []);

  const renderHeader = () => (
    <View style={styles.contentHeader}>
      <CitySelector selectedCity={selectedCity} onChange={handleCityChange} />
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.sectionTitle}>Upcoming Events</Text>
          <Text style={styles.sectionSubtitle}>
            {visibleEvents.length} event{visibleEvents.length === 1 ? '' : 's'} in {cityLabel(selectedCity)}
          </Text>
        </View>
        <Pressable style={styles.refreshButton} onPress={() => loadEvents({ refresh: true })}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>
      <Text style={styles.notice}>Hijri dates are subject to moon sighting. Events are user-submitted, so please verify details with hosts.</Text>
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
      <View style={styles.loadingCard}>
        <Text style={styles.emptyTitle}>No events found</Text>
        <Text style={styles.emptyText}>Try another city or refresh the list.</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={styles.header}>
        <Image source={logo} style={styles.logo} resizeMode="contain" />
        <View>
          <Text style={styles.brand}>Community</Text>
          <Text style={styles.brand}>Events Australia</Text>
        </View>
      </View>

      {activeTab === 'home' ? (
        <FlatList
          data={loading ? [] : visibleEvents}
          keyExtractor={(item, index) => item.id || `${item.eventDate || 'event'}-${index}`}
          renderItem={({ item }) => (
            <EventCard event={item} onPress={() => setSelectedEvent(item)} />
          )}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadEvents({ refresh: true })}
              tintColor={colors.teal}
              colors={[colors.teal]}
            />
          }
        />
      ) : (
        <ProfileScreen
          user={currentUser}
          profile={profile}
          loading={profileLoading}
          error={profileError}
        />
      )}
      <EventDetailsModal
        event={selectedEvent}
        visible={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
      />
      <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadow,
  },
  logo: {
    width: 54,
    height: 54,
  },
  brand: {
    color: colors.navy,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  contentHeader: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  refreshButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.teal,
    backgroundColor: colors.surface,
  },
  refreshText: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: '900',
  },
  notice: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
    marginTop: spacing.md,
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
  },
});
