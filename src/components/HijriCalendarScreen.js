import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';
import {
  getCurrentHijriYear,
  getHijriDisplay,
  getHijriParts,
  hijriDisplayFromParts,
  hijriToGregorian,
  HIJRI_MONTHS,
} from '../services/hijri';
import { getHijriSettings } from '../services/settings';
import {
  DEFAULT_HIJRI_OBSERVANCES,
  getHijriObservances,
  sortHijriObservances,
} from '../services/hijriObservances';
import { calculatePrayerTimes, PRAYER_OPTIONS } from '../services/prayerTimes';
import { DEFAULT_CITY, cityLabel, normalizeCity } from '../utils/cities';

const CATEGORIES = ['All', 'Wiladat', 'Shahadat', 'Wafat', 'Eid', 'Ayyam-e-Aza', 'Amaal', 'Season', 'Event'];

const CITY_PRAYER_LOCATIONS = {
  sydney: { suburb: 'Sydney', state: 'NSW', latitude: -33.8688, longitude: 151.2093, fullAddress: 'Sydney NSW, Australia' },
  melbourne: { suburb: 'Melbourne', state: 'VIC', latitude: -37.8136, longitude: 144.9631, fullAddress: 'Melbourne VIC, Australia' },
  canberra: { suburb: 'Canberra', state: 'ACT', latitude: -35.2809, longitude: 149.13, fullAddress: 'Canberra ACT, Australia' },
  brisbane: { suburb: 'Brisbane', state: 'QLD', latitude: -27.4698, longitude: 153.0251, fullAddress: 'Brisbane QLD, Australia' },
  adelaide: { suburb: 'Adelaide', state: 'SA', latitude: -34.9285, longitude: 138.6007, fullAddress: 'Adelaide SA, Australia' },
  hobart: { suburb: 'Hobart', state: 'TAS', latitude: -42.8821, longitude: 147.3272, fullAddress: 'Hobart TAS, Australia' },
  perth: { suburb: 'Perth', state: 'WA', latitude: -31.9523, longitude: 115.8613, fullAddress: 'Perth WA, Australia' },
  'rest-of-australia': { suburb: 'Sydney', state: 'NSW', latitude: -33.8688, longitude: 151.2093, fullAddress: 'Sydney NSW, Australia' },
};

function toIsoDate(date) {
  const value = new Date(date);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
}

function parseIsoDate(input) {
  const [year, month, day] = String(input || '').split('-').map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
}

function formatDate(value, options = {}) {
  if (!value) return '';
  return parseIsoDate(value).toLocaleDateString('en-AU', {
    weekday: options.weekday || 'short',
    day: 'numeric',
    month: 'short',
    year: options.year || 'numeric',
  });
}

function observanceTone(category = '') {
  if (['Wiladat', 'Eid'].includes(category)) return 'happy';
  if (['Shahadat', 'Wafat', 'Ayyam-e-Aza'].includes(category)) return 'sad';
  return 'occasion';
}

function getNextObservance(observances, overrides) {
  const today = toIsoDate(new Date());
  const currentYear = getCurrentHijriYear(overrides) || new Date().getFullYear() - 578;
  const candidates = [];

  for (const item of observances.filter(entry => entry.enabled !== false)) {
    for (const year of [currentYear, currentYear + 1]) {
      const gDate = hijriToGregorian(item.day, item.month, year, overrides);
      if (gDate && gDate >= today) candidates.push({ ...item, hYear: year, gDate });
    }
  }

  candidates.sort((a, b) => a.gDate.localeCompare(b.gDate) || Number(a.priority || 50) - Number(b.priority || 50));
  return candidates[0] || null;
}

export default function HijriCalendarScreen({ profile }) {
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ overrides: [] });
  const [observances, setObservances] = useState(DEFAULT_HIJRI_OBSERVANCES);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [convertMode, setConvertMode] = useState('gregorian');
  const [gInput, setGInput] = useState(todayIso);
  const [hDay, setHDay] = useState('1');
  const [hMonth, setHMonth] = useState('1');
  const [hYear, setHYear] = useState('1448');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const [nextSettings, nextObservances] = await Promise.all([
        getHijriSettings(),
        getHijriObservances(),
      ]);
      if (!active) return;
      const overrides = nextSettings.overrides || [];
      const currentHijri = getHijriParts(todayIso, overrides);
      setSettings(nextSettings);
      setObservances(sortHijriObservances(nextObservances));
      setHDay(String(currentHijri?.day || 1));
      setHMonth(String(currentHijri?.month || 1));
      setHYear(String(currentHijri?.year || 1448));
      setLoading(false);
    }
    load().catch(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [todayIso]);

  const overrides = settings.overrides || [];
  const todayHijri = getHijriDisplay(todayIso, overrides);
  const nextObservance = useMemo(() => getNextObservance(observances, overrides), [observances, overrides]);
  const prayerCity = normalizeCity(profile?.defaultCity || DEFAULT_CITY);
  const todayPrayerTimes = useMemo(
    () => calculatePrayerTimes(todayIso, CITY_PRAYER_LOCATIONS[prayerCity] || CITY_PRAYER_LOCATIONS[DEFAULT_CITY]),
    [prayerCity, todayIso]
  );
  const currentHijriYear = getCurrentHijriYear(overrides) || Number(hYear) || 1448;
  const visibleObservances = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortHijriObservances(observances)
      .filter(item => item.enabled !== false)
      .filter(item => category === 'All' || item.category === category)
      .filter(item => !query || `${item.name} ${item.notes} ${item.category}`.toLowerCase().includes(query))
      .map(item => ({
        ...item,
        hYear: currentHijriYear,
        gDate: hijriToGregorian(item.day, item.month, currentHijriYear, overrides),
      }));
  }, [category, currentHijriYear, observances, overrides, search]);

  const gToHijri = getHijriDisplay(gInput, overrides);
  const hToGregorian = hijriToGregorian(Number(hDay), Number(hMonth), Number(hYear), overrides);
  const useGregorianInput = convertMode === 'gregorian';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.title}>Hijri Calendar</Text>
        <Text style={styles.subtitle}>
          Today&apos;s Hijri date, important dates, prayer times, and quick conversion tools.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.tealDark} />
          <Text style={styles.loadingText}>Loading Hijri calendar…</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Today</Text>
            <Text style={styles.primaryDate}>{formatDate(todayIso, { weekday: 'long' })}</Text>
            <Text style={styles.secondaryDate}>{todayHijri || 'Hijri date unavailable'}</Text>

            {nextObservance ? (
              <View style={[styles.highlightBox, toneStyles[observanceTone(nextObservance.category)]]}>
                <Text style={styles.highlightLabel}>Next Observance</Text>
                <Text style={styles.highlightTitle}>{nextObservance.name}</Text>
                <Text style={styles.highlightText}>
                  {hijriDisplayFromParts(nextObservance.day, nextObservance.month, nextObservance.hYear)}
                </Text>
                <Text style={styles.highlightText}>{formatDate(nextObservance.gDate, { weekday: 'long' })}</Text>
              </View>
            ) : null}

            {todayPrayerTimes ? (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>Prayer Times</Text>
                  <Text style={styles.sectionMeta}>{cityLabel(prayerCity)}</Text>
                </View>
                <View style={styles.prayerGrid}>
                  {PRAYER_OPTIONS.map(option => (
                    <View key={option.key} style={styles.prayerCard}>
                      <Text style={styles.prayerLabel}>{option.label}</Text>
                      <Text style={styles.prayerTime}>{todayPrayerTimes[option.key]}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Quick Convert</Text>
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => setConvertMode('gregorian')}
                style={[styles.toggleButton, useGregorianInput && styles.toggleButtonActive]}
              >
                <Text style={[styles.toggleText, useGregorianInput && styles.toggleTextActive]}>
                  Gregorian to Hijri
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setConvertMode('hijri')}
                style={[styles.toggleButton, !useGregorianInput && styles.toggleButtonActive]}
              >
                <Text style={[styles.toggleText, !useGregorianInput && styles.toggleTextActive]}>
                  Hijri to Gregorian
                </Text>
              </Pressable>
            </View>

            {useGregorianInput ? (
              <View style={styles.fieldStack}>
                <Text style={styles.fieldLabel}>Gregorian date</Text>
                <TextInput
                  value={gInput}
                  onChangeText={setGInput}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>
            ) : (
              <View style={styles.hijriInputRow}>
                <View style={[styles.fieldStack, styles.flexField]}>
                  <Text style={styles.fieldLabel}>Day</Text>
                  <TextInput
                    value={hDay}
                    onChangeText={value => setHDay(value.replace(/\D/g, '').slice(0, 2))}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
                <View style={[styles.fieldStack, styles.flexField]}>
                  <Text style={styles.fieldLabel}>Month</Text>
                  <TextInput
                    value={HIJRI_MONTHS.find(item => String(item.value) === String(hMonth))?.name || ''}
                    onChangeText={value => {
                      const matched = HIJRI_MONTHS.find(item => item.name.toLowerCase() === value.trim().toLowerCase());
                      if (matched) setHMonth(String(matched.value));
                    }}
                    placeholder="Muharram"
                    autoCapitalize="words"
                    style={styles.input}
                  />
                </View>
                <View style={[styles.fieldStack, styles.flexField]}>
                  <Text style={styles.fieldLabel}>Year</Text>
                  <TextInput
                    value={hYear}
                    onChangeText={value => setHYear(value.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
              </View>
            )}

            {!useGregorianInput ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthChips}>
                {HIJRI_MONTHS.map(month => {
                  const active = String(month.value) === String(hMonth);
                  return (
                    <Pressable
                      key={month.value}
                      onPress={() => setHMonth(String(month.value))}
                      style={[styles.monthChip, active && styles.monthChipActive]}
                    >
                      <Text style={[styles.monthChipText, active && styles.monthChipTextActive]}>{month.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>{useGregorianInput ? 'Hijri date' : 'Gregorian date'}</Text>
              <Text style={styles.resultValue}>
                {useGregorianInput
                  ? (gToHijri || 'Select a Gregorian date')
                  : (hToGregorian ? formatDate(hToGregorian, { weekday: 'long' }) : 'Select a Hijri date')}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionRow}>
              <View>
                <Text style={styles.cardTitle}>Important Dates</Text>
                <Text style={styles.sectionMeta}>{visibleObservances.length} items</Text>
              </View>
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search important dates..."
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {CATEGORIES.map(item => {
                const active = item === category;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setCategory(item)}
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                  >
                    <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{item}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.list}>
              {visibleObservances.length ? visibleObservances.map(item => {
                const tone = observanceTone(item.category);
                return (
                  <View key={item.id} style={[styles.listRow, toneStyles[tone]]}>
                    <View style={styles.listTopRow}>
                      <Text style={styles.listTitle}>{item.name}</Text>
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText}>{item.category}</Text>
                      </View>
                    </View>
                    <Text style={styles.listDate}>
                      {hijriDisplayFromParts(item.day, item.month, item.hYear)}
                    </Text>
                    <Text style={styles.listDate}>
                      {item.gDate ? formatDate(item.gDate, { weekday: 'long' }) : 'Gregorian date unavailable'}
                    </Text>
                    {item.notes ? <Text style={styles.listNotes}>{item.notes}</Text> : null}
                  </View>
                );
              }) : (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>No important dates found</Text>
                  <Text style={styles.emptyText}>Try another search term or category.</Text>
                </View>
              )}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const toneStyles = StyleSheet.create({
  happy: { backgroundColor: '#ebfaf5', borderColor: '#b7e8d7' },
  sad: { backgroundColor: '#fff1f0', borderColor: '#f3c6c2' },
  occasion: { backgroundColor: colors.tealSoft, borderColor: '#cae7e0' },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  hero: {
    gap: spacing.sm,
  },
  title: {
    color: colors.navy,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  loadingCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    ...shadow,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow,
  },
  cardTitle: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '900',
  },
  primaryDate: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '900',
  },
  secondaryDate: {
    color: colors.tealDark,
    fontSize: 16,
    fontWeight: '800',
  },
  highlightBox: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  highlightLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  highlightTitle: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: '900',
  },
  highlightText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionBlock: {
    gap: spacing.sm,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: '900',
  },
  sectionMeta: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  prayerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  prayerCard: {
    minWidth: '30%',
    flexGrow: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.xs,
  },
  prayerLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  prayerTime: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: '900',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.background,
  },
  toggleButtonActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  toggleText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  toggleTextActive: {
    color: colors.surface,
  },
  fieldStack: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  hijriInputRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  flexField: {
    flex: 1,
    minWidth: 92,
  },
  monthChips: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  monthChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  monthChipActive: {
    backgroundColor: colors.tealSoft,
    borderColor: colors.teal,
  },
  monthChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  monthChipTextActive: {
    color: colors.tealDark,
  },
  resultBox: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.tealSoft,
    gap: spacing.xs,
  },
  resultLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  resultValue: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '900',
  },
  categoryRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  categoryChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  categoryChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  categoryChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  categoryChipTextActive: {
    color: colors.surface,
  },
  list: {
    gap: spacing.md,
  },
  listRow: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  listTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  listTitle: {
    flex: 1,
    color: colors.navy,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  categoryBadge: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryBadgeText: {
    color: colors.tealDark,
    fontSize: 11,
    fontWeight: '900',
  },
  listDate: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  listNotes: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  emptyBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: '900',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
});
