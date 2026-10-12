import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';
import MemberPageHeader from './MemberPageHeader';

export default function AddEventChoice({ canCreateRecurring, onChoose, registrationPreviewEnabled = false }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <MemberPageHeader title="Add Event" subtitle="Choose how people will attend your event." icon="calendar-plus-outline" tone="teal" />

        <Pressable onPress={() => onChoose('single')} style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
          <View style={styles.choiceIconWrap}>
            <Text style={styles.choiceIcon}>🗓️</Text>
          </View>
          <View style={styles.choiceText}>
            <Text style={styles.choiceEyebrow}>One-time event</Text>
            <Text style={styles.choiceTitle}>Open Single Event</Text>
            <Text style={styles.choiceDescription}>Create one event for one date and time.</Text>
            <Text style={styles.choiceMeta}>Best for majlis, lectures, programs and one-off gatherings.</Text>
          </View>
        </Pressable>

        <Pressable
          disabled={!canCreateRecurring}
          onPress={() => onChoose('recurring')}
          style={({ pressed }) => [
            styles.choice,
            !canCreateRecurring && styles.disabledChoice,
            pressed && canCreateRecurring && styles.pressed,
          ]}
        >
          <View style={[styles.choiceIconWrap, !canCreateRecurring && styles.disabledChoiceIconWrap]}>
            <Text style={styles.choiceIcon}>🔁</Text>
          </View>
          <View style={styles.choiceText}>
            <Text style={[styles.choiceEyebrow, !canCreateRecurring && styles.disabledText]}>Repeating schedule</Text>
            <Text style={[styles.choiceTitle, !canCreateRecurring && styles.disabledText]}>Open Recurring Event</Text>
            <Text style={[styles.choiceDescription, !canCreateRecurring && styles.disabledText]}>
              Repeat by day, week, month or year with a preview before saving.
            </Text>
            <Text style={[styles.choiceMeta, !canCreateRecurring && styles.disabledText]}>Great for regular programs that repeat across dates.</Text>
            {!canCreateRecurring ? <Text style={styles.adminOnly}>Admin only</Text> : null}
          </View>
        </Pressable>
        {registrationPreviewEnabled && <Pressable accessibilityRole="button" onPress={() => onChoose('registration-preview')} style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
          <View style={styles.choiceIconWrap}><Text style={styles.choiceIcon}>📋</Text></View>
          <View style={styles.choiceText}><Text style={styles.choiceEyebrow}>Development preview</Text><Text style={styles.choiceTitle}>Registration Required Event</Text><Text style={styles.choiceDescription}>Choose your questions, limit places and preview registration.</Text><Text style={styles.choiceMeta}>Demo only. No live event or booking will be created.</Text></View>
        </Pressable>}
        <Text style={styles.choiceMeta}>Open means registration is not required. Event visibility remains a separate setting.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 120 },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.tealSoft,
  },
  heroBadgeText: {
    color: colors.tealDark,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: { color: colors.navy, fontSize: 27, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 21, marginTop: 8, marginBottom: spacing.lg },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  disabledChoice: { backgroundColor: colors.background, opacity: 0.72 },
  choiceIconWrap: {
    width: 56,
    height: 56,
    marginRight: spacing.md,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealSoft,
  },
  disabledChoiceIconWrap: {
    backgroundColor: colors.border,
  },
  choiceIcon: {
    fontSize: 28,
  },
  choiceText: { flex: 1 },
  choiceEyebrow: { color: colors.tealDark, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  choiceTitle: { color: colors.navy, fontSize: 18, fontWeight: '700' },
  choiceDescription: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  choiceMeta: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: 8 },
  adminOnly: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 10 },
  disabledText: { color: colors.muted },
  pressed: { opacity: 0.72 },
});
