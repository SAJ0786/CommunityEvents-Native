import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import EventCard from './EventCard';
import { compareEventsByDateTime } from '../services/events';
import { buildFeedUrl, calendarInstructions, copyCalendarFeed, openLiveCalendarSubscription } from '../services/calendar';
import { getHijriParts, HIJRI_MONTHS } from '../services/hijri';
import { getHijriSettings } from '../services/settings';
import { colors, radius, shadow, spacing } from '../theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function audienceColor(value = '') {
  const text = String(value).toLowerCase();
  if (text.includes('ladies')) return '#db2777';
  if (text.includes('gents')) return '#0f766e';
  if (text.includes('kids')) return '#d97706';
  if (text.includes('family') || text.includes('mixed')) return '#2563eb';
  return '#16a34a';
}

function NavButton({ label, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.navButton}>
      <Text style={styles.navButtonText}>{label}</Text>
    </Pressable>
  );
}

function CalendarSync({ user, onBack }) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState('android');
  const feedUrl = buildFeedUrl(user?.uid);
  const instructions = calendarInstructions();

  const run = async action => {
    try {
      await action();
    } catch (error) {
      Alert.alert('Calendar sync', error?.message || 'Could not open calendar sync.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.screenHeader}>
        <NavButton label="<" onPress={onBack} />
        <Text style={styles.screenTitle}>Sync Calendar</Text>
      </View>

      <View style={styles.syncHero}>
        <Text style={styles.syncHeroTitle}>Community Event Calendar</Text>
        <Text style={styles.syncHeroText}>Subscribe once - your calendar automatically stays up to date as events are added or removed.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick Sync</Text>
        <Text style={styles.cardText}>Add the Community Events calendar to your phone calendar.</Text>
        <Pressable onPress={() => run(() => openLiveCalendarSubscription(user?.uid))} style={styles.primaryButton}>
          <Text style={styles.primaryText}>Sync to My Calendar</Text>
        </Pressable>
        <Pressable onPress={() => run(() => openLiveCalendarSubscription(user?.uid, true))} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Try alternate link</Text>
        </Pressable>
        <Text style={styles.notice}>Calendar updates automatically within approximately one hour when events change.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Personal Feed URL</Text>
        <Text style={styles.cardText}>Use this if Quick Sync does not work, or to add the calendar to Outlook.</Text>
        <Text selectable style={styles.feedUrl}>{feedUrl}</Text>
        <Pressable onPress={() => run(async () => {
          await copyCalendarFeed(user?.uid);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        })} style={styles.primaryButton}>
          <Text style={styles.primaryText}>{copied ? 'Copied!' : 'Copy Feed URL'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Manual Setup Instructions</Text>
        <View style={styles.toggleRow}>
          {[['android', 'Android / Google'], ['iphone', 'iPhone / iPad']].map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.toggle, tab === key && styles.toggleActive]}>
              <Text style={[styles.toggleText, tab === key && styles.toggleTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {instructions[tab].map((step, index) => (
          <View key={step} style={styles.instruction}>
            <Text style={styles.instructionNumber}>{index + 1}</Text>
            <Text style={styles.instructionText}>{step}</Text>
          </View>
        ))}
        <Text style={styles.notice}>Calendar entries include host name, event type, date and time, address and audience type.</Text>
      </View>
    </ScrollView>
  );
}

export default function CalendarScreen({
  events = [],
  user,
  isGuest,
  savedIds = [],
  savingEventId,
  onBack,
  onOpenEvent,
  onToggleSaved,
}) {
  const [showSync, setShowSync] = useState(false);
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(ymd(new Date()));
  const [showHijriDates, setShowHijriDates] = useState(false);
  const [overrides, setOverrides] = useState([]);

  useEffect(() => {
    getHijriSettings().then(settings => setOverrides(settings.overrides || []));
  }, []);

  const byDate = useMemo(() => {
    const grouped = {};
    events.forEach(event => {
      if (!event.eventDate) return;
      (grouped[event.eventDate] = grouped[event.eventDate] || []).push(event);
    });
    Object.values(grouped).forEach(items => items.sort(compareEventsByDateTime));
    return grouped;
  }, [events]);

  const monthGrid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const cells = Array(first.getDay()).fill(null);
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= days; day += 1) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [cursor]);

  const weekDays = useMemo(() => {
    const first = new Date(cursor);
    first.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(first);
      date.setDate(first.getDate() + index);
      return date;
    });
  }, [cursor]);

  const selectedEvents = byDate[selected] || [];
  const today = ymd(new Date());
  const hijriShort = date => {
    const parts = getHijriParts(ymd(date), overrides);
    const month = HIJRI_MONTHS.find(item => item.value === Number(parts.month))?.name || '';
    return parts.day ? `${parts.day} ${month.slice(0, 3)}` : '';
  };
  const stepMonth = amount => setCursor(current => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  const stepWeek = amount => setCursor(current => {
    const next = new Date(current);
    next.setDate(next.getDate() + amount * 7);
    return next;
  });

  if (showSync && !isGuest) return <CalendarSync user={user} onBack={() => setShowSync(false)} />;

  const renderEvent = event => (
    <EventCard
      key={event.id}
      event={event}
      isSaved={savedIds.includes(event.id)}
      saving={savingEventId === event.id}
      onPress={() => onOpenEvent(event)}
      onToggleSaved={isGuest ? undefined : () => onToggleSaved(event)}
    />
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.screenHeader}>
        <NavButton label="<" onPress={onBack} />
        <Text style={styles.screenTitle}>Calendar</Text>
      </View>

      <Pressable
        disabled={isGuest}
        onPress={() => setShowSync(true)}
        style={[styles.syncButton, isGuest && styles.disabledButton]}
      >
        <Text style={[styles.syncButtonText, isGuest && styles.disabledText]}>Sync to My Calendar</Text>
      </Pressable>
      {isGuest ? <Text style={styles.guestText}>Calendar browsing is available to guests. Sign in to sync it to your device.</Text> : null}

      <View style={styles.toggleRow}>
        {[['month', 'Month'], ['week', 'Week']].map(([key, label]) => (
          <Pressable key={key} onPress={() => setView(key)} style={[styles.toggle, view === key && styles.toggleActive]}>
            <Text style={[styles.toggleText, view === key && styles.toggleTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.hijriSwitch}>
        <Text style={styles.hijriSwitchText}>Show Hijri dates</Text>
        <Switch value={showHijriDates} onValueChange={setShowHijriDates} trackColor={{ true: colors.teal }} />
      </View>

      {view === 'month' ? (
        <>
          <View style={styles.calendarCard}>
            <View style={styles.monthHeader}>
              <Text style={styles.monthTitle}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</Text>
              <View style={styles.monthNav}><NavButton label="<" onPress={() => stepMonth(-1)} /><NavButton label=">" onPress={() => stepMonth(1)} /></View>
            </View>
            <View style={styles.grid}>
              {DAYS.map((day, index) => <Text key={`${day}-${index}`} style={styles.dayName}>{day}</Text>)}
              {monthGrid.map((date, index) => {
                if (!date) return <View key={`blank-${index}`} style={styles.dayCell} />;
                const key = ymd(date);
                const dayEvents = byDate[key] || [];
                const active = key === selected;
                return (
                  <Pressable key={key} onPress={() => setSelected(key)} style={[styles.dayCell, active && styles.dayCellActive, key === today && !active && styles.todayCell]}>
                    <Text style={[styles.dayNumber, active && styles.dayNumberActive]}>{date.getDate()}</Text>
                    {showHijriDates ? <Text numberOfLines={1} style={[styles.hijriDate, active && styles.hijriDateActive]}>{hijriShort(date)}</Text> : null}
                    <View style={styles.dots}>
                      {dayEvents.slice(0, 3).map(event => <View key={event.id} style={[styles.dot, { backgroundColor: active ? colors.surface : audienceColor(event.audienceType) }]} />)}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Text style={styles.selectedTitle}>
            {new Date(`${selected}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()} - {selectedEvents.length} EVENT{selectedEvents.length === 1 ? '' : 'S'}
          </Text>
          {selectedEvents.length ? selectedEvents.map(renderEvent) : <Text style={styles.noEvents}>No events on this day.</Text>}
        </>
      ) : (
        <>
          <View style={styles.weekHeader}>
            <NavButton label="<" onPress={() => stepWeek(-1)} />
            <Text style={styles.weekTitle}>{weekDays[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} - {weekDays[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</Text>
            <NavButton label=">" onPress={() => stepWeek(1)} />
          </View>
          {weekDays.map(date => {
            const key = ymd(date);
            const dayEvents = byDate[key] || [];
            return (
              <View key={key}>
                <Text style={styles.weekDay}>{date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}{showHijriDates ? ` - ${hijriShort(date)}` : ''} - {dayEvents.length ? `${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : 'No events'}</Text>
                {dayEvents.map(renderEvent)}
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 120 },
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  screenTitle: { color: colors.navy, fontSize: 24, fontWeight: '900' },
  navButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  navButtonText: { color: colors.surface, fontSize: 27, fontWeight: '900', lineHeight: 31 },
  syncButton: { minHeight: 50, backgroundColor: colors.tealDark, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, ...shadow },
  syncButtonText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  disabledButton: { backgroundColor: '#eef4f3', shadowOpacity: 0 },
  disabledText: { color: colors.muted },
  guestText: { color: colors.muted, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 18, marginTop: -5, marginBottom: spacing.md },
  toggleRow: { flexDirection: 'row', gap: 6, padding: 3, borderRadius: 11, backgroundColor: '#edf2f1', marginBottom: spacing.md },
  toggle: { flex: 1, minHeight: 39, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  toggleActive: { backgroundColor: colors.surface, ...shadow },
  toggleText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  toggleTextActive: { color: colors.tealDark },
  hijriSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, marginBottom: spacing.md },
  hijriSwitchText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  calendarCard: { padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  monthTitle: { color: colors.navy, fontSize: 15, fontWeight: '900' },
  monthNav: { flexDirection: 'row', gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayName: { width: '14.2857%', color: colors.muted, fontSize: 11, fontWeight: '900', textAlign: 'center', paddingVertical: 6 },
  dayCell: { width: '14.2857%', height: 54, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 1 },
  dayCellActive: { backgroundColor: colors.teal },
  todayCell: { backgroundColor: colors.tealSoft },
  dayNumber: { color: colors.text, fontSize: 14, fontWeight: '900' },
  dayNumberActive: { color: colors.surface },
  hijriDate: { color: colors.tealDark, fontSize: 8, fontWeight: '800', maxWidth: '96%' },
  hijriDateActive: { color: colors.surface },
  dots: { flexDirection: 'row', gap: 2, height: 5, marginTop: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  selectedTitle: { color: colors.muted, fontSize: 11, fontWeight: '900', marginTop: spacing.lg, marginBottom: spacing.sm },
  noEvents: { color: colors.muted, fontSize: 13, paddingVertical: spacing.md },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  weekTitle: { color: colors.navy, fontSize: 14, fontWeight: '900' },
  weekDay: { color: colors.text, fontSize: 12, fontWeight: '900', marginTop: spacing.md, marginBottom: 6 },
  syncHero: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.tealDark, marginBottom: spacing.md },
  syncHeroTitle: { color: colors.surface, fontSize: 23, fontWeight: '900' },
  syncHeroText: { color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 20, marginTop: 5 },
  card: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, marginBottom: spacing.md, ...shadow },
  cardTitle: { color: colors.navy, fontSize: 19, fontWeight: '900', marginBottom: 5 },
  cardText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  primaryButton: { minHeight: 48, borderRadius: 13, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.surface, fontSize: 14, fontWeight: '900' },
  secondaryButton: { minHeight: 43, borderRadius: 11, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  secondaryText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  notice: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: spacing.md },
  feedUrl: { color: colors.tealDark, fontSize: 12, lineHeight: 18, padding: spacing.md, backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  instruction: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  instructionNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.tealSoft, color: colors.tealDark, textAlign: 'center', lineHeight: 24, fontSize: 12, fontWeight: '900' },
  instructionText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 20 },
});
