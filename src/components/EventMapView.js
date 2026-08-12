import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Callout, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { compareEventsByDateTime, getEventTitle } from '../services/events';
import { colors, radius, shadow, spacing } from '../theme';
import { formatEventTime } from '../utils/formatters';

const TIME_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'Next 7 Days' },
  { key: 'month', label: 'Next 30 Days' },
  { key: 'all', label: 'All Upcoming' },
];

const AUDIENCE_COLORS = {
  ladies: '#ec4899',
  gents: '#2563eb',
  family: '#0f766e',
  kids: '#f97316',
  other: '#64748b',
};

function audienceKey(value = '') {
  const text = String(value).toLowerCase();
  if (text.includes('ladies')) return 'ladies';
  if (text.includes('gents')) return 'gents';
  if (text.includes('kids')) return 'kids';
  if (text.includes('family') || text.includes('mixed')) return 'family';
  return 'other';
}

function audienceLabel(value = '') {
  const key = audienceKey(value);
  if (key === 'ladies') return 'Ladies';
  if (key === 'gents') return 'Gents';
  if (key === 'kids') return 'Kids';
  if (key === 'family') return 'Family';
  return 'Other';
}

function localDateString(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseTimeMinutes(value = '') {
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 24 * 60;
}

function filterEventsByTime(events, filter) {
  const today = localDateString();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const tomorrow = localDateString(1);
  const weekEnd = localDateString(7);
  const monthEnd = localDateString(30);
  return events.filter(event => {
    if (event.isLive) return true;
    if (!event.eventDate || event.eventDate < today) return false;
    if (filter === 'today') return event.eventDate === today && parseTimeMinutes(event.startTime) >= nowMinutes;
    if (filter === 'tomorrow') return event.eventDate === tomorrow;
    if (filter === 'week') return event.eventDate >= today && event.eventDate <= weekEnd;
    if (filter === 'month') return event.eventDate >= today && event.eventDate <= monthEnd;
    return event.eventDate >= today;
  });
}

function getCoordinates(event = {}) {
  const address = event.address || {};
  const latitude = Number(
    address.latitude ?? address.lat ?? event.latitude ?? event.lat ?? event.geo?.latitude ?? event.geo?.lat
  );
  const longitude = Number(
    address.longitude ?? address.lng ?? address.lon ?? event.longitude ?? event.lng ?? event.lon ?? event.geo?.longitude ?? event.geo?.lng
  );
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function eventDateLabel(event) {
  if (!event.eventDate) return '';
  return new Date(`${event.eventDate}T12:00:00`).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function eventTimeLabel(event) {
  const base = formatEventTime(event.startTime, event.endTime);
  return event.prayerLabel ? `${event.prayerLabel} ${base}` : base;
}

function fullAddress(event = {}) {
  const address = event.address || {};
  if (typeof address === 'string') return address;
  return address.fullAddress || [address.street, address.suburb, address.state, address.postcode].filter(Boolean).join(', ');
}

function distanceKm(from, to) {
  if (!from || !to) return null;
  const radians = value => Number(value) * Math.PI / 180;
  const latDelta = radians(to.latitude - from.latitude);
  const lngDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(lngDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceLabel(from, to) {
  const distance = distanceKm(from, to);
  if (!Number.isFinite(distance)) return '';
  if (distance < 1) return `${Math.max(1, Math.round(distance * 1000))} m away`;
  return `${distance < 10 ? distance.toFixed(1) : Math.round(distance)} km away`;
}

export default function EventMapView({ events = [], onSelectEvent }) {
  const mapRef = useRef(null);
  const [timeFilter, setTimeFilter] = useState('today');
  const [userLocation, setUserLocation] = useState(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapLoadSlow, setMapLoadSlow] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [selectedMarker, setSelectedMarker] = useState(null);

  useEffect(() => {
    if (!mapReady || mapLoaded) {
      setMapLoadSlow(false);
      return undefined;
    }
    const timeout = setTimeout(() => setMapLoadSlow(true), 12000);
    return () => clearTimeout(timeout);
  }, [mapLoaded, mapReady, mapAttempt]);

  const filteredEvents = useMemo(
    () => filterEventsByTime(events, timeFilter).sort(compareEventsByDateTime),
    [events, timeFilter]
  );

  const mapEvents = useMemo(
    () => filteredEvents
      .map(event => ({ event, coords: getCoordinates(event) }))
      .filter(item => item.coords),
    [filteredEvents]
  );

  const missingCoordinatesCount = filteredEvents.length - mapEvents.length;

  const fitToMarkers = () => {
    const coordinates = [
      ...mapEvents.map(item => item.coords),
      ...(userLocation ? [userLocation] : []),
    ];
    if (!coordinates.length) return;
    mapRef.current?.fitToCoordinates(coordinates, {
      edgePadding: { top: 56, right: 44, bottom: 56, left: 44 },
      animated: true,
    });
  };

  const retryMap = () => {
    setMapReady(false);
    setMapLoaded(false);
    setMapLoadSlow(false);
    setMapAttempt(current => current + 1);
  };

  const openDirections = async event => {
    const address = fullAddress(event);
    if (!address) {
      setLocationError('This event does not have a full address for directions.');
      return;
    }
    const destination = encodeURIComponent(address);
    const url = Platform.OS === 'ios'
      ? `https://maps.apple.com/?daddr=${destination}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
    try {
      await Linking.openURL(url);
    } catch {
      setLocationError('Could not open directions on this device.');
    }
  };

  useEffect(() => {
    if (!mapEvents.length) return;
    const timeout = setTimeout(fitToMarkers, 250);
    return () => clearTimeout(timeout);
  }, [mapEvents, userLocation]);

  const enableCurrentLocation = async () => {
    setLocating(true);
    setLocationError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationEnabled(false);
        setLocationError('Location access was not granted.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      setUserLocation(next);
      setLocationEnabled(true);
    } catch (error) {
      setLocationEnabled(false);
      setLocationError(error?.message || 'Could not get your current location.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.introTitle}>Map View</Text>
      <Text style={styles.introText}>
        Browse upcoming events by location. Tap a marker, then tap the callout to open the full event details.
      </Text>

      <View style={styles.filterBar}>
        {TIME_FILTERS.map(filter => (
          <Pressable
            key={filter.key}
            onPress={() => setTimeFilter(filter.key)}
            style={[styles.filterSegment, timeFilter === filter.key && styles.filterSegmentActive]}
          >
            <Text numberOfLines={2} style={[styles.filterSegmentText, timeFilter === filter.key && styles.filterSegmentTextActive]}>{filter.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.legend}>
        {Object.entries({ Family: 'family', Gents: 'gents', Ladies: 'ladies', Kids: 'kids', Other: 'other' }).map(([label, key]) => (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: AUDIENCE_COLORS[key] }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.mapShell}>
        <MapView
          key={mapAttempt}
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: userLocation?.latitude || -33.8688,
            longitude: userLocation?.longitude || 151.2093,
            latitudeDelta: 1.1,
            longitudeDelta: 1.1,
          }}
          mapType="standard"
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          onMapReady={() => setMapReady(true)}
          onMapLoaded={() => {
            setMapLoaded(true);
            setMapLoadSlow(false);
          }}
          showsCompass
          showsUserLocation={locationEnabled}
          showsMyLocationButton={locationEnabled}
          toolbarEnabled
        >
          {mapEvents.map(({ event, coords }) => {
            const key = audienceKey(event.audienceType || event.audience);
            return (
              <Marker
                key={event.id}
                coordinate={coords}
                pinColor={AUDIENCE_COLORS[key]}
                title={getEventTitle(event)}
                description={`${eventDateLabel(event)} - ${eventTimeLabel(event)} - ${event.address?.suburb || event.suburb || ''}`}
                onPress={() => setSelectedMarker({ event, coords })}
              >
                <Callout onPress={() => onSelectEvent?.(event)}>
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle}>{getEventTitle(event)}</Text>
                    <Text style={styles.calloutMeta}>
                      {eventDateLabel(event)} - {eventTimeLabel(event)} - {event.address?.suburb || event.suburb || ''}
                    </Text>
                    <Text style={[styles.calloutAudience, { color: AUDIENCE_COLORS[key] }]}>
                      {audienceLabel(event.audienceType || event.audience)}
                    </Text>
                    {userLocation ? <Text style={styles.calloutDistance}>{distanceLabel(userLocation, coords)}</Text> : null}
                    <Text style={styles.viewLink}>Open event details</Text>
                  </View>
                </Callout>
              </Marker>
            );
          })}
        </MapView>
        {!mapReady ? (
          <View pointerEvents="none" style={styles.mapLoading}>
            <ActivityIndicator color={colors.teal} size="large" />
            <Text style={styles.mapLoadingText}>Loading Google Map…</Text>
          </View>
        ) : null}
        {mapLoadSlow ? (
          <View style={styles.mapProblem}>
            <Text style={styles.mapProblemTitle}>Google Map did not load</Text>
            <Text style={styles.mapProblemText}>Check your internet connection, then retry. Event markers will remain available when the map tiles load.</Text>
            <Pressable onPress={retryMap} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
              <Text style={styles.retryButtonText}>Retry Map</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {selectedMarker ? (
        <View style={styles.selectedCard}>
          <View style={styles.selectedCopy}>
            <Text style={styles.selectedTitle}>{getEventTitle(selectedMarker.event)}</Text>
            <Text style={styles.selectedMeta}>{eventDateLabel(selectedMarker.event)} · {eventTimeLabel(selectedMarker.event)}</Text>
            {userLocation ? <Text style={styles.selectedDistance}>{distanceLabel(userLocation, selectedMarker.coords)}</Text> : null}
          </View>
          <View style={styles.selectedActions}>
            <Pressable onPress={() => onSelectEvent?.(selectedMarker.event)} style={({ pressed }) => [styles.selectedViewButton, pressed && styles.pressed]}>
              <Text style={styles.selectedViewText}>View</Text>
            </Pressable>
            <Pressable onPress={() => openDirections(selectedMarker.event)} style={({ pressed }) => [styles.selectedDirectionsButton, pressed && styles.pressed]}>
              <Text style={styles.selectedDirectionsText}>Directions</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.locationActions}>
        <Pressable
          disabled={locating}
          onPress={enableCurrentLocation}
          style={({ pressed }) => [styles.locationButton, pressed && styles.pressed, locating && styles.disabled]}
        >
          {locating ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.locationButtonText}>{locationEnabled ? '📍 Refresh My Location' : '📍 Show My Location'}</Text>}
        </Pressable>
        <Pressable onPress={fitToMarkers} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>🗺 Fit All Markers</Text>
        </Pressable>
      </View>
      {locationError ? <Text style={styles.locationError}>{locationError}</Text> : null}

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>{mapEvents.length} mapped event{mapEvents.length === 1 ? '' : 's'}</Text>
        <Text style={styles.summaryText}>
          {!mapLoaded && mapReady
            ? 'Map view opened; waiting for Google map tiles.'
            : missingCoordinatesCount > 0
              ? `${missingCoordinatesCount} event${missingCoordinatesCount === 1 ? '' : 's'} in this filter do not have saved map coordinates yet.`
              : 'All events in this filter have saved map coordinates.'}
        </Text>
      </View>

      {!mapEvents.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No mapped events</Text>
          <Text style={styles.emptyText}>No events with saved map coordinates match this time filter.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  introTitle: { color: colors.navy, fontSize: 22, fontWeight: '900' },
  introText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: spacing.md },
  filterBar: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    marginBottom: spacing.md,
    borderRadius: 16,
    backgroundColor: '#edf3f2',
  },
  filterSegment: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 4,
  },
  filterSegmentActive: {
    backgroundColor: colors.surface,
    ...shadow,
  },
  filterSegmentText: { color: colors.muted, fontSize: 10, lineHeight: 12, fontWeight: '900', textAlign: 'center' },
  filterSegmentTextActive: { color: colors.tealDark },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  summaryCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  summaryTitle: { color: colors.navy, fontSize: 15, fontWeight: '900' },
  summaryText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  locationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  locationButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  locationButtonText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
  },
  secondaryButtonText: {
    color: colors.tealDark,
    fontSize: 13,
    fontWeight: '900',
  },
  locationError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  mapShell: {
    height: 430,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.tealSoft,
    ...shadow,
  },
  map: { flex: 1 },
  mapLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.tealSoft },
  mapLoadingText: { color: colors.tealDark, fontSize: 13, fontWeight: '900' },
  mapProblem: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(239,247,246,0.96)' },
  mapProblemTitle: { color: colors.navy, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  mapProblemText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: spacing.sm },
  retryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.teal, marginTop: spacing.md },
  retryButtonText: { color: colors.surface, fontSize: 13, fontWeight: '900' },
  selectedCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow },
  selectedCopy: { flex: 1, minWidth: 0 },
  selectedTitle: { color: colors.navy, fontSize: 14, fontWeight: '900' },
  selectedMeta: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  selectedDistance: { color: colors.tealDark, fontSize: 11, fontWeight: '900', marginTop: 3 },
  selectedActions: { gap: 6 },
  selectedViewButton: { minHeight: 38, minWidth: 88, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.tealSoft },
  selectedViewText: { color: colors.tealDark, fontSize: 12, fontWeight: '900' },
  selectedDirectionsButton: { minHeight: 38, minWidth: 88, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: '#2563eb' },
  selectedDirectionsText: { color: colors.surface, fontSize: 12, fontWeight: '900' },
  callout: { width: 235, padding: 4 },
  calloutTitle: { color: colors.navy, fontSize: 14, fontWeight: '900', marginBottom: 4 },
  calloutMeta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  calloutAudience: { fontSize: 12, fontWeight: '900', marginTop: 4 },
  calloutDistance: { color: colors.navy, fontSize: 12, fontWeight: '900', marginTop: 4 },
  viewLink: { color: colors.tealDark, fontSize: 13, fontWeight: '900', marginTop: 8 },
  empty: {
    alignItems: 'center',
    padding: spacing.xl,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { color: colors.navy, fontSize: 18, fontWeight: '900', marginTop: 5 },
  emptyText: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 4 },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
});
