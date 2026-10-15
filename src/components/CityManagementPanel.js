import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../firebase/firebase';
import { installCityCatalogue } from '../utils/cities';
import { colors, radius, spacing } from '../theme';

export default function CityManagementPanel({ profile }) {
  const [input, setInput] = useState('');
  const [code, setCode] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  if (profile?.role !== 'superAdmin' || Constants.expoConfig?.extra?.cityManagementEnabled !== true) return null;
  const call = async (name, data) => (await httpsCallable(functions, name)(data)).data;
  const run = async work => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await work(); } catch (error) { setMessage(error?.message || 'City lookup failed. Nothing was added.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const button = (label, onPress, disabled = false) => <Pressable accessibilityRole="button"
    accessibilityState={{ disabled: busy || disabled }} disabled={busy || disabled} onPress={onPress}
    style={[styles.button, (busy || disabled) && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  return <View style={styles.card}>
    <Text style={styles.heading}>Add a city</Text>
    <Text style={styles.text}>Search for an Australian city or town. Review its coordinates and timezone before adding it.</Text>
    <TextInput accessibilityLabel="City name" placeholder="City name" placeholderTextColor={colors.muted}
      value={input} editable={!busy} maxLength={100} style={styles.input}
      onChangeText={value => { setInput(value); setPreview(null); setSuggestions([]); setMessage(''); }} />
    {button('Search cities', () => run(async () => {
      setPreview(null); setSuggestions([]);
      const result = await call('searchCatalogueCities', { input });
      setSuggestions(result.suggestions || []);
      if (!result.suggestions?.length) setMessage('No matching cities found. Try a city name and state.');
    }), input.trim().length < 3)}
    {suggestions.map(item => <Pressable key={item.placeId} accessibilityRole="button" disabled={busy}
      style={styles.input} onPress={() => run(async () => {
        setPreview(null);
        setPreview(await call('previewCatalogueCity', { placeId: item.placeId }));
      })}><Text style={styles.text}>{item.label}</Text></Pressable>)}
    {suggestions.length > 0 && <Text style={styles.text}>Powered by Google Maps</Text>}
    {preview && <View>
      <Text style={styles.heading}>{preview.city.label}</Text>
      <Text style={styles.text}>Latitude: {preview.city.latitude}</Text>
      <Text style={styles.text}>Longitude: {preview.city.longitude}</Text>
      <Text style={styles.text}>Timezone: {preview.city.timeZone}</Text>
      <TextInput accessibilityLabel="City short code" placeholder="Short code (2–6 letters or digits)"
        placeholderTextColor={colors.muted} style={styles.input} maxLength={6} autoCapitalize="characters"
        editable={!busy} value={code} onChangeText={value => setCode(value.toUpperCase())} />
      <Text style={styles.text}>Adding makes this city selectable in compatible app versions. Its centre coordinates are not an event venue.</Text>
    </View>}
    {button('Confirm and add city', () => run(async () => {
      const result = await call('addCatalogueCity', { placeId: preview.placeId, fingerprint: preview.fingerprint, code });
      installCityCatalogue(result.catalogue);
      setPreview(null); setSuggestions([]); setInput(''); setCode('');
      setMessage('City added with verified coordinates and timezone.');
    }), !preview || !/^[A-Z0-9]{2,6}$/.test(code))}
    {busy && <ActivityIndicator color={colors.blue} />}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.text}>{message}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg },
  heading: { color: colors.text, fontWeight: '700', fontSize: 18 },
  text: { color: colors.text, fontSize: 14, lineHeight: 21 },
  input: { padding: spacing.md, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, color: colors.text },
  button: { backgroundColor: colors.blue, padding: spacing.md, borderRadius: radius.md },
  buttonText: { color: colors.onPrimary, textAlign: 'center', fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
