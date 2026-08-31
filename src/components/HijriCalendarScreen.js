import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
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
import { getAzaanAlarmSettings, getPrayerReminderSettings, initializeDefaultPrayerReminders, refreshAzaanAlarms, setAzaanAlarm, setPrayerReminder } from '../services/reminders';
import { DEFAULT_CITY, cityLabel, normalizeCity } from '../utils/cities';
import { getPrayerLocation } from '../utils/prayerLocations';
import CompactSelect from './CompactSelect';
import NativeDateTimeField from './NativeDateTimeField';

const CATEGORIES = ['Wiladat', 'Shahadat', 'Wafat', 'Eid', 'Ayyam-e-Aza', 'Amaal', 'Season', 'Event'];
const PRAYER_VISUALS = {
  fajr: { icon: 'weather-night-partly-cloudy', color: '#0f766e' },
  sunrise: { icon: 'weather-sunset-up', color: '#e99718' },
  zohrain: { icon: 'white-balance-sunny', color: '#e99718' },
  sunset: { icon: 'weather-sunset-down', color: '#e17726' },
  maghreb: { icon: 'weather-night', color: '#17213f' },
};
const SUN_ENDPOINTS = ['sunrise', 'sunset'];
const PRAYER_STAGES = ['fajr', 'zohrain', 'maghreb'];

function toIsoDate(date) {
  const value = new Date(date);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
}

function parseIsoDate(input) {
  const [year, month, day] = String(input || '').split('-').map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
}

function timeMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
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

export default function HijriCalendarScreen({ profile, selectedCity }) {
  const { width, fontScale } = useWindowDimensions();
  const compactLayout = width / Math.max(fontScale, 1) < 360;
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ overrides: [] });
  const [observances, setObservances] = useState(DEFAULT_HIJRI_OBSERVANCES);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const [currentHijriMonth, setCurrentHijriMonth] = useState(1);
  const [convertMode, setConvertMode] = useState('gregorian');
  const [gInput, setGInput] = useState(todayIso);
  const [hDay, setHDay] = useState('1');
  const [hMonth, setHMonth] = useState('1');
  const [hYear, setHYear] = useState('1448');
  const [prayerReminderKeys, setPrayerReminderKeys] = useState([]);
  const [prayerReminderBusy, setPrayerReminderBusy] = useState('');
  const [azaanAlarmKeys, setAzaanAlarmKeys] = useState([]);
  const [azaanAlarmBusy, setAzaanAlarmBusy] = useState('');
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const prayerCity = normalizeCity(selectedCity || profile?.defaultCity || DEFAULT_CITY);

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
      setCurrentHijriMonth(Number(currentHijri?.month || 1));
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

  useEffect(() => {
    const loadReminders = profile?.prayerRemindersEnabled === false
      ? getPrayerReminderSettings()
      : initializeDefaultPrayerReminders(getPrayerLocation(prayerCity));
    loadReminders
      .then(value => setPrayerReminderKeys(value.enabledKeys || []))
      .catch(() => setPrayerReminderKeys([]));
  }, [prayerCity, profile?.prayerRemindersEnabled]);

  useEffect(() => {
    getAzaanAlarmSettings()
      .then(value => value.enabledKeys?.length
        ? refreshAzaanAlarms(getPrayerLocation(prayerCity))
        : value)
      .then(value => setAzaanAlarmKeys(value.enabledKeys || []))
      .catch(() => setAzaanAlarmKeys([]));
  }, [prayerCity]);

  const overrides = settings.overrides || [];
  const todayHijri = getHijriDisplay(todayIso, overrides);
  const nextObservance = useMemo(() => getNextObservance(observances, overrides), [observances, overrides]);
  const todayPrayerTimes = useMemo(
    () => calculatePrayerTimes(todayIso, getPrayerLocation(prayerCity)),
    [prayerCity, todayIso]
  );
  const sunPosition = useMemo(() => {
    const sunrise = timeMinutes(todayPrayerTimes?.sunrise);
    const sunset = timeMinutes(todayPrayerTimes?.sunset);
    if (!Number.isFinite(sunrise) || !Number.isFinite(sunset) || sunset <= sunrise) return { left: '50%', top: 8 };
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const progress = Math.max(0, Math.min(1, (current - sunrise) / (sunset - sunrise)));
    return {
      left: `${4 + progress * 92}%`,
      top: 28 - Math.sin(Math.PI * progress) * 20,
    };
  }, [todayPrayerTimes]);
  const currentHijriYear = getCurrentHijriYear(overrides) || Number(hYear) || 1448;
  const visibleObservances = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortHijriObservances(observances)
      .filter(item => item.enabled !== false)
      .filter(item => categories.length ? categories.includes(item.category) : query ? true : Number(item.month) === currentHijriMonth)
      .filter(item => !query || `${item.name} ${item.notes} ${item.category}`.toLowerCase().includes(query))
      .map(item => ({
        ...item,
        hYear: currentHijriYear,
        gDate: hijriToGregorian(item.day, item.month, currentHijriYear, overrides),
      }));
  }, [categories, currentHijriMonth, currentHijriYear, observances, overrides, search]);

  const gToHijri = getHijriDisplay(gInput, overrides);
  const hToGregorian = hijriToGregorian(Number(hDay), Number(hMonth), Number(hYear), overrides);
  const useGregorianInput = convertMode === 'gregorian';

  const togglePrayerReminder = async key => {
    if (prayerReminderBusy) return;
    const enabled = !prayerReminderKeys.includes(key);
    setPrayerReminderBusy(key);
    try {
      const value = await setPrayerReminder(key, enabled, getPrayerLocation(prayerCity));
      setPrayerReminderKeys(value.enabledKeys || []);
      Alert.alert(enabled ? 'Prayer reminder set' : 'Prayer reminder removed', enabled ? 'This phone will schedule the selected prayer time for the next 21 days. Opening this page lets you refresh or change the selection.' : 'The selected prayer-time reminders were removed.');
    } catch (error) {
      Alert.alert('Prayer reminder', error?.message || 'Could not update this reminder.');
    } finally {
      setPrayerReminderBusy('');
    }
  };

  const toggleAzaanAlarm = async key => {
    if (azaanAlarmBusy) return;
    const enabled = !azaanAlarmKeys.includes(key);
    setAzaanAlarmBusy(key);
    try {
      const value = await setAzaanAlarm(key, enabled, getPrayerLocation(prayerCity));
      setAzaanAlarmKeys(value.enabledKeys || []);
      Alert.alert(enabled ? 'Azaan alarm on' : 'Azaan alarm off', enabled
        ? 'This phone will play the bundled Azaan clip at the selected prayer time for the next 21 days. The alarm is stored only on this device.'
        : 'The selected Azaan alarms were removed from this phone.');
    } catch (error) {
      Alert.alert('Azaan alarm', error?.message || 'Could not update this Azaan alarm.');
    } finally {
      setAzaanAlarmBusy('');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, compactLayout && styles.contentCompact]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.heroGlowLarge} />
        <View style={styles.heroGlowSmall} />
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name="moon-waning-crescent" color={colors.surface} size={25} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>ISLAMIC CALENDAR</Text>
          <Text style={styles.title}>Hijri Calendar</Text>
          <Text numberOfLines={2} style={styles.subtitle}>Dates, prayer times and quick conversion</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.tealDark} />
          <Text style={styles.loadingText}>Loading Hijri calendar…</Text>
        </View>
      ) : (
        <>
          <View style={[styles.card, styles.todayCard]}>
            <View style={styles.todayTopRow}>
              <View style={styles.todayIcon}>
                <MaterialCommunityIcons name="calendar-today" color={colors.tealDark} size={23} />
              </View>
              <View style={styles.todayCopy}>
                <Text style={styles.todayLabel}>TODAY</Text>
                <Text style={styles.secondaryDate}>{todayHijri || 'Hijri date unavailable'}</Text>
                <Text style={styles.primaryDate}>{formatDate(todayIso, { weekday: 'long' })}</Text>
              </View>
            </View>

            {nextObservance ? (
              <View style={[styles.highlightBox, toneStyles[observanceTone(nextObservance.category)]]}>
                <View style={styles.observanceIcon}>
                  <MaterialCommunityIcons name="star-crescent" color={colors.tealDark} size={18} />
                </View>
                <View style={styles.observanceCopy}>
                  <Text style={styles.highlightLabel}>NEXT OBSERVANCE</Text>
                  <Text numberOfLines={1} style={styles.highlightTitle}>{nextObservance.name}</Text>
                  <Text numberOfLines={1} style={styles.highlightText}>
                    {hijriDisplayFromParts(nextObservance.day, nextObservance.month, nextObservance.hYear)} · {formatDate(nextObservance.gDate)}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {todayPrayerTimes ? (
            <View style={styles.card}>
              <View style={styles.sectionRow}>
                <Text style={styles.cardTitle}>Prayer Times</Text>
                <View style={styles.cityPill}>
                  <MaterialCommunityIcons name="map-marker" color={colors.tealDark} size={14} />
                  <Text style={styles.cityPillText}>{cityLabel(prayerCity)}</Text>
                </View>
              </View>
              <Text style={styles.prayerHelp}>Tap a prayer time to add or remove its phone reminder.</Text>
              <View style={styles.prayerJourney}>
                <View pointerEvents="none" style={styles.sunArc}>
                  <View style={styles.sunArcLine} />
                  <View accessibilityLabel="Current daylight position" style={[styles.sunArcDot, sunPosition]} />
                </View>
                <View style={styles.sunEndpointRow}>
                  {SUN_ENDPOINTS.map(key => {
                    const option = PRAYER_OPTIONS.find(item => item.key === key);
                    const visual = PRAYER_VISUALS[key];
                    const reminderEnabled = prayerReminderKeys.includes(key);
                    return (
                      <Pressable accessibilityRole="button" accessibilityState={{ selected: reminderEnabled }} disabled={Boolean(prayerReminderBusy)} key={key} onPress={() => togglePrayerReminder(key)} style={({ pressed }) => [styles.sunEndpoint, reminderEnabled && styles.prayerStageActive, pressed && styles.pressed]}>
                        {prayerReminderBusy === key ? <ActivityIndicator color={visual.color} size="small" /> : <MaterialCommunityIcons name={visual.icon} color={visual.color} size={30} />}
                        <Text style={styles.sunEndpointLabel}>{option?.label}</Text>
                        <Text style={styles.sunEndpointTime}>{todayPrayerTimes[key]}</Text>
                        <MaterialCommunityIcons name={reminderEnabled ? 'bell' : 'bell-outline'} color={reminderEnabled ? colors.tealDark : colors.muted} size={14} style={styles.prayerReminderIcon} />
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.prayerStageRow}>
                  {PRAYER_STAGES.map(key => {
                    const option = PRAYER_OPTIONS.find(item => item.key === key);
                    const visual = PRAYER_VISUALS[key];
                    const reminderEnabled = prayerReminderKeys.includes(key);
                    return (
                      <Pressable accessibilityRole="button" accessibilityState={{ selected: reminderEnabled }} disabled={Boolean(prayerReminderBusy)} key={key} onPress={() => togglePrayerReminder(key)} style={({ pressed }) => [styles.prayerStage, reminderEnabled && styles.prayerStageActive, pressed && styles.pressed]}>
                        {prayerReminderBusy === key ? <ActivityIndicator color={visual.color} size="small" /> : <MaterialCommunityIcons name={visual.icon} color={visual.color} size={25} />}
                        <Text style={styles.prayerStageLabel}>{option?.label === 'Maghrebain' ? 'Maghreb' : option?.label}</Text>
                        <Text style={styles.prayerStageTime}>{todayPrayerTimes[key]}</Text>
                        <MaterialCommunityIcons name={reminderEnabled ? 'bell' : 'bell-outline'} color={reminderEnabled ? colors.tealDark : colors.muted} size={13} style={styles.prayerReminderIcon} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={styles.azaanPanel}>
                <View style={styles.azaanHeadingRow}>
                  <View style={styles.azaanIcon}><MaterialCommunityIcons name="volume-high" color={colors.surface} size={18} /></View>
                  <View style={styles.azaanHeadingCopy}>
                    <Text style={styles.azaanTitle}>Azaan Alarm</Text>
                    <Text style={styles.azaanHelp}>Optional on this phone. All alarms are off by default.</Text>
                  </View>
                </View>
                {[
                  ['fajr', 'Fajr'],
                  ['zohrain', 'Dhuhr / Zohrain'],
                  ['maghreb', 'Maghrib'],
                ].map(([key, label]) => (
                  <View key={key} style={styles.azaanRow}>
                    <View style={styles.azaanRowCopy}>
                      <Text style={styles.azaanRowLabel}>{label}</Text>
                      <Text style={styles.azaanRowTime}>{todayPrayerTimes[key]}</Text>
                    </View>
                    {azaanAlarmBusy === key ? <ActivityIndicator color={colors.tealDark} size="small" /> : <Switch accessibilityLabel={`${label} Azaan alarm`} value={azaanAlarmKeys.includes(key)} onValueChange={() => toggleAzaanAlarm(key)} trackColor={{ false: colors.border, true: colors.teal }} />}
                  </View>
                ))}
                <Text style={styles.azaanPrivacy}>The selected Azaan recording is bundled in the app. Tap its notification to open playback, and use the visible Stop control whenever needed. Android may require Alarms &amp; reminders permission; the phone’s notification settings remain in control.</Text>
              </View>
            </View>
          ) : null}

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
                <NativeDateTimeField value={gInput} onChange={setGInput} accessibilityLabel="Select Gregorian date to convert" />
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
                <View style={[styles.fieldStack, styles.flexField, styles.monthField]}>
                  <Text style={styles.fieldLabel}>Month</Text>
                  <CompactSelect
                    value={String(hMonth)}
                    onChange={value => setHMonth(String(value))}
                    options={HIJRI_MONTHS.map(month => ({ value: String(month.value), label: month.name }))}
                    placeholder="Muharram"
                    title="Choose Hijri month"
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
                <Text style={styles.cardTitle}>Key Islamic Events</Text>
                <Text style={styles.sectionMeta}>{visibleObservances.length} items</Text>
              </View>
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search key Islamic events..."
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <Pressable onPress={() => setCategoryPickerOpen(value => !value)} style={styles.categorySelect}>
              <View>
                <Text style={styles.categorySelectLabel}>EVENT TYPES</Text>
                <Text numberOfLines={1} style={styles.categorySelectValue}>{categories.length ? `${categories.length} selected · ${categories.join(', ')}` : 'All event types'}</Text>
              </View>
              <Text style={styles.categorySelectChevron}>{categoryPickerOpen ? '▲' : '▼'}</Text>
            </Pressable>
            {categoryPickerOpen ? (
              <View style={styles.categoryMenu}>
                {CATEGORIES.map(item => {
                  const active = categories.includes(item);
                  return (
                    <Pressable key={item} onPress={() => setCategories(current => active ? current.filter(value => value !== item) : [...current, item])} style={styles.categoryOption}>
                      <View style={[styles.categoryCheck, active && styles.categoryCheckActive]}><Text style={styles.categoryCheckText}>{active ? '✓' : ''}</Text></View>
                      <Text style={[styles.categoryOptionText, active && styles.categoryOptionTextActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {!search.trim() && !categories.length ? <Text style={styles.defaultMonthTitle}>Events in {HIJRI_MONTHS.find(item => item.value === currentHijriMonth)?.name || 'Current Hijri Month'}</Text> : (
              <Pressable onPress={() => { setSearch(''); setCategories([]); }} style={styles.clearFilters}><Text style={styles.clearFiltersText}>Clear search &amp; filters</Text></Pressable>
            )}

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
                  <Text style={styles.emptyTitle}>No key Islamic events found</Text>
                  <Text style={styles.emptyText}>Try another search term or event type.</Text>
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
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  contentCompact: { paddingHorizontal: spacing.sm },
  hero: {
    position: 'relative',
    minHeight: 98,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.teal,
    ...shadow,
  },
  heroGlowLarge: { position: 'absolute', width: 130, height: 130, borderRadius: 65, right: -35, top: -70, backgroundColor: 'rgba(255,255,255,0.12)' },
  heroGlowSmall: { position: 'absolute', width: 72, height: 72, borderRadius: 36, right: 58, bottom: -54, backgroundColor: 'rgba(255,255,255,0.09)' },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.16)' },
  heroCopy: { flex: 1, gap: 2 },
  heroEyebrow: { color: 'rgba(255,255,255,0.78)', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  title: {
    color: colors.surface,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  loadingCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    ...shadow,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow,
  },
  todayCard: { overflow: 'hidden', borderColor: '#b9dfd9', backgroundColor: '#fbfefd' },
  todayTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  todayIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealSoft, borderWidth: 1, borderColor: '#c7e7e1' },
  todayCopy: { flex: 1, gap: 1 },
  todayLabel: { color: colors.tealDark, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  cardTitle: {
    color: colors.navy,
    fontSize: 17,
    fontWeight: '900',
  },
  azaanPanel: { marginTop: spacing.sm, overflow: 'hidden', borderWidth: 1, borderColor: '#b9ddd6', borderRadius: radius.md, backgroundColor: '#f4fbf9' },
  azaanHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: '#dcece8' },
  azaanIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.teal },
  azaanHeadingCopy: { flex: 1, minWidth: 0 },
  azaanTitle: { color: colors.navy, fontSize: 14, fontWeight: '900' },
  azaanHelp: { marginTop: 2, color: colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  azaanRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: '#e3efec' },
  azaanRowCopy: { flex: 1, minWidth: 0 },
  azaanRowLabel: { color: colors.navy, fontSize: 12, fontWeight: '900' },
  azaanRowTime: { marginTop: 2, color: colors.tealDark, fontSize: 11, fontWeight: '800' },
  azaanPrivacy: { padding: spacing.md, color: colors.muted, fontSize: 9.5, lineHeight: 14, fontWeight: '700' },
  primaryDate: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  secondaryDate: {
    color: colors.navy,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  highlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  observanceIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.76)' },
  observanceCopy: { flex: 1, gap: 1 },
  highlightLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  highlightTitle: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '900',
  },
  highlightText: {
    color: colors.text,
    fontSize: 11,
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
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  cityPill: { maxWidth: '58%', minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: colors.tealSoft },
  cityPillText: { flexShrink: 1, color: colors.tealDark, fontSize: 10, fontWeight: '900' },
  prayerHelp: { color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  prayerJourney: { position: 'relative', overflow: 'hidden', padding: spacing.sm, borderWidth: 1, borderColor: '#9fd8d1', borderRadius: radius.md, backgroundColor: colors.tealSoft, gap: 6 },
  sunArc: { height: 36, marginHorizontal: spacing.md, marginBottom: -14 },
  sunArcLine: { position: 'absolute', top: 14, left: 0, right: 0, height: 54, borderTopWidth: 1.5, borderColor: colors.teal, borderTopLeftRadius: 180, borderTopRightRadius: 180, opacity: 0.75 },
  sunArcDot: { position: 'absolute', width: 13, height: 13, marginLeft: -6, borderRadius: 7, backgroundColor: '#e99718', shadowColor: '#e99718', shadowOpacity: 0.45, shadowRadius: 5, elevation: 3 },
  sunEndpointRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  sunEndpoint: { position: 'relative', flex: 1, minHeight: 90, alignItems: 'center', justifyContent: 'center', padding: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  sunEndpointLabel: { marginTop: 3, color: colors.muted, fontSize: 12, fontWeight: '800' },
  sunEndpointTime: { marginTop: 1, color: colors.navy, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  prayerStageRow: { flexDirection: 'row', gap: 6 },
  prayerStage: { position: 'relative', flex: 1, minHeight: 82, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  prayerStageActive: { borderColor: colors.teal, backgroundColor: '#f4fbfa' },
  prayerStageLabel: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  prayerStageTime: { marginTop: 2, color: colors.navy, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  prayerReminderIcon: { position: 'absolute', top: 7, right: 7 },
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
    color: colors.muted,
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
    minWidth: 76,
  },
  monthField: { flex: 1.45, minWidth: 130 },
  resultBox: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.tealSoft,
    gap: spacing.xs,
  },
  resultLabel: {
    color: colors.muted,
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
  categorySelect: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  categorySelectLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  categorySelectValue: { maxWidth: 240, marginTop: 3, color: colors.navy, fontSize: 12, fontWeight: '800' },
  categorySelectChevron: { color: colors.tealDark, fontSize: 12, fontWeight: '900' },
  categoryMenu: { marginTop: -spacing.xs, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow },
  categoryOption: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  categoryCheck: { width: 19, height: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 5, backgroundColor: colors.background },
  categoryCheckActive: { borderColor: colors.teal, backgroundColor: colors.teal },
  categoryCheckText: { color: colors.surface, fontSize: 12, fontWeight: '900' },
  categoryOptionText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  categoryOptionTextActive: { color: colors.tealDark, fontWeight: '900' },
  defaultMonthTitle: { color: colors.navy, fontSize: 15, fontWeight: '900' },
  clearFilters: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: 99, backgroundColor: colors.tealSoft },
  clearFiltersText: { color: colors.tealDark, fontSize: 11, fontWeight: '900' },
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
    color: colors.muted,
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
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: { opacity: 0.78 },
});
