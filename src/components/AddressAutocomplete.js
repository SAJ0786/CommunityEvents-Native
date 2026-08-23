import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';
import {
  autocompleteAustralianAddresses,
  createPlacesSessionToken,
  getAustralianAddressDetails,
  isGooglePlacesConfigured,
} from '../services/googlePlaces';

export default function AddressAutocomplete({
  value = {},
  onChange,
  invalid = false,
  placeholder = 'Start typing the full event address…',
}) {
  const [query, setQuery] = useState(value?.fullAddress || '');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState('');
  const sessionRef = useRef(createPlacesSessionToken());
  const selectedTextRef = useRef(value?.fullAddress || '');

  useEffect(() => {
    const next = value?.fullAddress || '';
    if (next !== query && next === selectedTextRef.current) setQuery(next);
  }, [query, value?.fullAddress]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3 || text === selectedTextRef.current || !isGooglePlacesConfigured()) {
      setSuggestions([]);
      setSearching(false);
      return undefined;
    }

    let active = true;
    const timeout = setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        const results = await autocompleteAustralianAddresses(text, sessionRef.current);
        if (active) setSuggestions(results);
      } catch (searchError) {
        if (active) {
          setSuggestions([]);
          setError(searchError?.message || 'Could not search for this address.');
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query]);

  const changeText = text => {
    selectedTextRef.current = '';
    setQuery(text);
    setError(isGooglePlacesConfigured() ? '' : 'Google address search is unavailable in this build. Please install the latest test APK.');
    onChange?.({
      ...value,
      placeId: '',
      fullAddress: text,
      street: '',
      suburb: '',
      state: '',
      postcode: '',
      latitude: null,
      longitude: null,
    });
  };

  const selectSuggestion = async suggestion => {
    setSelecting(true);
    setError('');
    try {
      const address = await getAustralianAddressDetails(suggestion.placeId, sessionRef.current);
      selectedTextRef.current = address.fullAddress;
      setQuery(address.fullAddress);
      setSuggestions([]);
      onChange?.({ ...value, ...address });
      sessionRef.current = createPlacesSessionToken();
    } catch (selectionError) {
      setError(selectionError?.message || 'Could not load this address.');
    } finally {
      setSelecting(false);
    }
  };

  const configured = isGooglePlacesConfigured();
  const verified = Boolean(value?.fullAddress && value?.suburb && value?.state && value?.latitude && value?.longitude);

  return (
    <View style={styles.root}>
      <View style={[styles.inputWrap, invalid && styles.inputInvalid]}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          autoCapitalize="words"
          autoCorrect={false}
          editable={!selecting}
          onChangeText={changeText}
          onFocus={() => {
            if (!configured) setError('Google address search is unavailable in this build. Please install the latest test APK.');
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={query}
        />
        {searching || selecting ? <ActivityIndicator color={colors.teal} size="small" /> : null}
      </View>

      {suggestions.length ? (
        <View style={styles.suggestions}>
          {suggestions.map(suggestion => (
            <Pressable
              key={suggestion.placeId}
              onPress={() => selectSuggestion(suggestion)}
              style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
            >
              <Text style={styles.pin}>📍</Text>
              <View style={styles.suggestionCopy}>
                <Text style={styles.primary}>{suggestion.primaryText}</Text>
                {suggestion.secondaryText ? <Text style={styles.secondary}>{suggestion.secondaryText}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {verified ? (
        <Text style={styles.verified}>✓ {value.suburb}, {value.state} {value.postcode} · GPS saved</Text>
      ) : !configured ? (
        <Text style={styles.helper}>Address search requires the latest configured test build.</Text>
      ) : (
        <Text style={styles.helper}>Select an Australian address from the Google suggestions.</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6, zIndex: 20 },
  inputWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.teal,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  inputInvalid: { borderColor: colors.danger, backgroundColor: '#fffafa' },
  searchIcon: { color: colors.tealDark, fontSize: 22, fontWeight: '900' },
  input: { flex: 1, minHeight: 50, color: colors.text, fontSize: 15 },
  suggestions: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadow,
  },
  suggestion: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  pin: { fontSize: 16 },
  suggestionCopy: { flex: 1 },
  primary: { color: colors.navy, fontSize: 14, fontWeight: '900' },
  secondary: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  verified: { color: colors.tealDark, fontSize: 12, fontWeight: '900' },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  pressed: { backgroundColor: colors.tealSoft },
});
