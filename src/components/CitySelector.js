import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { CITY_OPTIONS, cityCode, cityLabel, classifyMetroArea } from '../utils/cities';
import { colors, radius, shadow, spacing } from '../theme';

export default function CitySelector({ selectedCity, onChange, onLocationResolved, allowCurrentLocation = false, compact = false }) {
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const selectedLabel = useMemo(() => cityLabel(selectedCity).replace(', Australia', ''), [selectedCity]);

  const detectCurrentCity = async () => {
    setLocating(true);
    setLocationError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Location access was not allowed.');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const reverse = await Location.reverseGeocodeAsync({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
      const first = reverse[0] || {};
      const resolved = classifyMetroArea({
        suburb: first.district || first.subregion || first.city || first.name || '',
        city: first.city || first.subregion || '',
        state: first.region || '',
        postcode: first.postalCode || '',
        fullAddress: [first.name, first.city, first.region, first.postalCode].filter(Boolean).join(', '),
      });
      onChange?.(resolved);
      onLocationResolved?.({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
      setOpen(false);
    } catch (error) {
      setLocationError(error?.message || 'Could not determine your current city.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.trigger, compact && styles.triggerCompact, pressed && styles.pressed]}>
        <View style={[styles.triggerCode, compact && styles.triggerCodeCompact]}>
          <Text style={styles.triggerMarker}>{'\u{1F4CD}'}</Text>
          <Text style={styles.triggerCodeText}>{cityCode(selectedCity)}</Text>
        </View>
        {!compact ? <View style={styles.triggerCopy}>
          <Text style={styles.triggerLabel}>City</Text>
          <Text style={styles.triggerValue}>{selectedLabel}</Text>
        </View> : null}
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Choose City</Text>
              <Pressable onPress={() => setOpen(false)} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            {allowCurrentLocation ? (
              <Pressable
                disabled={locating}
                onPress={detectCurrentCity}
                style={({ pressed }) => [styles.locationButton, pressed && styles.pressed, locating && styles.disabled]}
              >
                <View style={styles.locationIconCircle}>
                  {locating
                    ? <ActivityIndicator color={colors.surface} size="small" />
                    : <Text style={styles.locationIcon}>{'\u25CE'}</Text>}
                </View>
                <View style={styles.locationCopy}>
                  <Text style={styles.locationButtonText}>{locating ? 'Finding your city...' : 'Use my current location'}</Text>
                  <Text style={styles.locationButtonHint}>Detect the nearest supported city</Text>
                </View>
                <Text style={styles.locationArrow}>{'\u203A'}</Text>
              </Pressable>
            ) : null}
            {locationError ? <Text style={styles.locationError}>{locationError}</Text> : null}

            <ScrollView contentContainerStyle={styles.list}>
              {CITY_OPTIONS.map(city => {
                const active = city.value === selectedCity;
                return (
                  <Pressable
                    key={city.value}
                    onPress={() => {
                      onChange?.(city.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.pressed]}
                  >
                    <View style={styles.optionCode}>
                      <Text style={[styles.optionCodeText, active && styles.optionCodeTextActive]}>{cityCode(city.value)}</Text>
                    </View>
                    <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{city.label.replace(', Australia', '')}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  triggerCode: {
    minWidth: 54,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
  },
  triggerCompact: { width: 92, minHeight: 45, gap: 5, paddingHorizontal: 6 },
  triggerCodeCompact: { minWidth: 58, flexDirection: 'row', gap: 2, paddingHorizontal: 5, paddingVertical: 6 },
  triggerMarker: { fontSize: 15 },
  triggerCodeText: {
    color: colors.tealDark,
    fontSize: 12,
    fontWeight: '900',
  },
  triggerCopy: {
    flex: 1,
    minWidth: 0,
  },
  triggerLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  triggerValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  chevron: {
    color: colors.tealDark,
    fontSize: 18,
    fontWeight: '900',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    maxHeight: '78%',
    padding: spacing.lg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
    ...shadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '900',
  },
  closeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
  },
  closeText: {
    color: colors.tealDark,
    fontSize: 13,
    fontWeight: '900',
  },
  locationButton: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#73c9c0',
    borderRadius: radius.lg,
    backgroundColor: '#e4f7f4',
    marginBottom: spacing.md,
  },
  locationIconCircle: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: colors.teal,
  },
  locationIcon: { color: colors.surface, fontSize: 25, lineHeight: 27, fontWeight: '900' },
  locationCopy: { flex: 1, minWidth: 0 },
  locationButtonText: {
    color: colors.tealDark,
    fontSize: 14,
    fontWeight: '900',
  },
  locationButtonHint: { color: '#46706c', fontSize: 11, fontWeight: '700', marginTop: 2 },
  locationArrow: { color: colors.tealDark, fontSize: 28, lineHeight: 28, fontWeight: '700' },
  locationError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  optionActive: {
    borderColor: colors.teal,
    backgroundColor: colors.tealSoft,
  },
  optionCode: {
    minWidth: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#eef7f5',
    alignItems: 'center',
  },
  optionCodeText: {
    color: colors.tealDark,
    fontSize: 12,
    fontWeight: '900',
  },
  optionCodeTextActive: {
    color: colors.tealDark,
  },
  optionLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  optionLabelActive: {
    color: colors.tealDark,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.55,
  },
});
