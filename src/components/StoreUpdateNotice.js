import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readStoreRelease } from '../services/storeUpdate';
import { storeUpdateNotice, UPDATE_SNOOZE_MS } from '../utils/storeUpdatePolicy';
import { colors, radius, spacing, typography } from '../theme';

export default function StoreUpdateNotice({ visible }) {
  const [notice, setNotice] = useState(null);
  const snoozes = useRef({});
  const storageKey = version => `@community-connect/store-update/${Platform.OS}/${version}`;
  useEffect(() => {
    if (!visible || __DEV__) return undefined;
    let active = true; let sequence = 0;
    const check = async () => {
      const current = ++sequence;
      const release = await readStoreRelease(Platform.OS);
      const candidate = storeUpdateNotice({ release, platform: Platform.OS, applicationId: Application.applicationId, installedVersion: Application.nativeApplicationVersion });
      let noticeToShow = candidate;
      if (candidate) {
        let until = snoozes.current[candidate.version] || 0;
        try { until = Math.max(until, Number(await AsyncStorage.getItem(storageKey(candidate.version))) || 0); } catch { /* session snooze still works */ }
        until = Math.max(until, snoozes.current[candidate.version] || 0);
        noticeToShow = storeUpdateNotice({ release, platform: Platform.OS, applicationId: Application.applicationId, installedVersion: Application.nativeApplicationVersion, snoozedUntil: until });
      }
      if (active && current === sequence) setNotice(noticeToShow);
    };
    void check();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void check(); });
    return () => { active = false; subscription.remove(); };
  }, [visible]);
  if (!visible || !notice) return null;
  const dismiss = () => {
    const until = Date.now() + UPDATE_SNOOZE_MS;
    snoozes.current[notice.version] = until;
    void AsyncStorage.setItem(storageKey(notice.version), String(until)).catch(() => {});
    setNotice(null);
  };
  const openStore = async () => {
    try { await Linking.openURL(notice.url); }
    catch { Alert.alert('Unable to open the store', 'Please open the App Store or Google Play and search for Community Connect Australia.'); }
  };
  return <View style={styles.banner} accessibilityLiveRegion="polite">
    <Text style={styles.title}>An update is available</Text>
    <Text style={styles.text}>Version {notice.version} is available. Update to get the latest improvements.</Text>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={openStore} style={styles.update}><Text style={styles.updateText}>Update</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Remind me about this update tomorrow" onPress={dismiss} style={styles.later}><Text style={styles.laterText}>Later</Text></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  banner: { marginHorizontal: spacing.md, marginVertical: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.blueSoft },
  title: { color: colors.navy, fontSize: 15, fontWeight: '700' },
  text: { color: colors.text, fontSize: typography.body.fontSize, marginTop: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  update: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.sm, backgroundColor: colors.blue },
  updateText: { color: colors.onPrimary, fontWeight: '700' },
  later: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  laterText: { color: colors.blueDark, fontWeight: '600' },
});
