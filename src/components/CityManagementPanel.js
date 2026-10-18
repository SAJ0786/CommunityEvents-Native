import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../firebase/firebase';
import { getCityDefinitions, installCityCatalogue } from '../utils/cities';
import { suggestCityCode } from '../utils/airportCodes';
import { useCityCatalogueVersion } from '../services/cityCatalogue';
import { colors, radius, spacing, typography } from '../theme';

const BUILT_IN = new Set(['adelaide', 'brisbane', 'canberra', 'hobart', 'melbourne', 'perth', 'rest-of-australia', 'sydney']);

export default function CityManagementPanel({ profile }) {
  const version = useCityCatalogueVersion();
  const cities = useMemo(() => getCityDefinitions(), [version]);
  const [managedId, setManagedId] = useState(''), [pickerOpen, setPickerOpen] = useState(false), [draft, setDraft] = useState(null), [suggested, setSuggested] = useState(false);
  const managed = cities.find(city => city.id === managedId);
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
        const next = await call('previewCatalogueCity', { placeId: item.placeId });
        const guess = suggestCityCode(next.city); setCode(guess); setSuggested(!!guess); setPreview(next);
      })}><Text style={styles.text}>{item.label}</Text></Pressable>)}
    {suggestions.length > 0 && <Text style={styles.text}>Powered by Google Maps</Text>}
    {preview && <View>
      <Text style={styles.heading}>{preview.city.label}</Text>
      <Text style={styles.text}>Latitude: {preview.city.latitude}</Text>
      <Text style={styles.text}>Longitude: {preview.city.longitude}</Text>
      <Text style={styles.text}>Timezone: {preview.city.timeZone}</Text>
      <TextInput accessibilityLabel="City short code" placeholder="Short code (2–6 letters or digits)"
        placeholderTextColor={colors.muted} style={styles.input} maxLength={6} autoCapitalize="characters"
        editable={!busy} value={code} onChangeText={value => { setCode(value.toUpperCase()); setSuggested(false); }} />
      <Text style={styles.text}>{suggested ? 'Pre-filled with the local airport code. You can change it.' : code ? '' : 'No airport code found for this city. Enter a short code of 2-6 letters or digits.'}</Text>
      <Text style={styles.text}>Adding makes this city selectable in compatible app versions. Its centre coordinates are not an event venue.</Text>
    </View>}
    {button('Confirm and add city', () => run(async () => {
      const result = await call('addCatalogueCity', { placeId: preview.placeId, fingerprint: preview.fingerprint, code });
      installCityCatalogue(result.catalogue);
      setPreview(null); setSuggestions([]); setInput(''); setCode('');
      setMessage('City added with verified coordinates and timezone.');
    }), !preview || !/^[A-Z0-9]{2,6}$/.test(code))}
    <Text style={styles.heading}>Manage existing cities</Text>
    {button(managed ? managed.label + (managed.enabled ? '' : ' (deleted)') : 'Select a city', () => setPickerOpen(open => !open))}
    {pickerOpen && cities.map(city => <Pressable key={city.id} accessibilityRole="button" style={styles.input}
      onPress={() => { setManagedId(city.id); setDraft(null); setPickerOpen(false); setMessage(''); }}>
      <Text style={styles.text}>{city.label + (city.enabled ? '' : ' (deleted)')}</Text></Pressable>)}
    {managed && <View style={{ gap: spacing.md }}>
      <Text style={styles.text}>{managed.latitude === null ? 'No coordinates' : managed.latitude.toFixed(4) + ', ' + managed.longitude.toFixed(4)} {managed.timeZone}</Text>
      <TextInput accessibilityLabel="Short code" style={styles.input} maxLength={6} autoCapitalize="characters" editable={!busy}
        value={draft ?? managed.code} onChangeText={value => setDraft(value.toUpperCase())} />
      {button('Save short code', () => run(async () => {
        const result = await call('updateCatalogueCity', { cityId: managed.id, code: draft });
        installCityCatalogue(result.catalogue); setDraft(null); setMessage(managed.label + ' code saved.');
      }), (draft ?? managed.code) === managed.code || !/^[A-Z0-9]{2,6}$/.test(draft ?? managed.code))}
      {!BUILT_IN.has(managed.id) && button(managed.enabled ? 'Delete city' : 'Restore city', () => run(async () => {
        const result = await call('updateCatalogueCity', { cityId: managed.id, enabled: !managed.enabled });
        installCityCatalogue(result.catalogue);
        setMessage(managed.enabled ? managed.label + ' deleted from city selectors. Members keep their saved city.' : managed.label + ' restored.');
      }))}
      {BUILT_IN.has(managed.id) && <Text style={styles.text}>Built-in cities cannot be deleted, but their short code can be changed.</Text>}
    </View>}    {busy && <ActivityIndicator color={colors.blue} />}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.text}>{message}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg },
  heading: { color: colors.text, fontWeight: '700', fontSize: 18 },
  text: { color: colors.text, fontSize: typography.cardTitle.fontSize, lineHeight: 21 },
  input: { padding: spacing.md, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, color: colors.text },
  button: { backgroundColor: colors.blue, padding: spacing.md, borderRadius: radius.md },
  buttonText: { color: colors.onPrimary, textAlign: 'center', fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
