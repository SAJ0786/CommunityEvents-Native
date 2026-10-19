import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, radius, spacing, typography } from '../theme';

// Shared by ordinary and registration events; storage/access policy stays with callers.
export default function EventPosterPicker({ uri, hasPoster = false, onChoose, onRemove, error, disabled = false, privatePoster = false, showChooseButton = true }) {
  const selected = Boolean(uri || hasPoster);
  return <View style={styles.group}>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose event poster" disabled={disabled} onPress={onChoose} style={styles.dropZone}>
      {uri ? <Image source={{ uri }} resizeMode="contain" style={styles.preview} /> : <View style={styles.placeholder}>
        <MaterialCommunityIcons name="camera-plus-outline" color={colors.tealDark} size={32} />
        <Text style={styles.title}>{hasPoster ? 'Event poster saved' : 'Tap to add event poster'}</Text>
        <Text style={styles.helper}>Choose a clear image from your phone</Text>
      </View>}
    </Pressable>
    <View style={styles.actions}>
      {showChooseButton && <Pressable accessibilityRole="button" disabled={disabled} onPress={onChoose} style={styles.choose}><Text style={styles.chooseText}>{selected ? 'Choose another photo' : 'Upload your event poster'}</Text></Pressable>}
      {selected && onRemove && <Pressable accessibilityRole="button" disabled={disabled} onPress={onRemove} style={styles.remove}><Text style={styles.removeText}>Remove poster</Text></Pressable>}
    </View>
    {privatePoster && <Text style={styles.helper}>Visible only to registered attendees, the organiser and authorised admins. JPEG, PNG or WebP, up to 5 MB.</Text>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  dropZone: { minHeight: 180, overflow: 'hidden', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.teal, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  placeholder: { minHeight: 180, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  preview: { width: '100%', height: 180, backgroundColor: colors.tealSoft },
  title: { color: colors.tealDark, ...typography.cardTitle }, helper: { color: colors.muted, ...typography.body, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  choose: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.teal, backgroundColor: colors.surface, minHeight: 44, justifyContent: 'center' },
  chooseText: { color: colors.tealDark, ...typography.label }, remove: { padding: spacing.sm, minHeight: 44, justifyContent: 'center' }, removeText: { color: colors.danger, ...typography.label }, error: { color: colors.danger, ...typography.body },
});
