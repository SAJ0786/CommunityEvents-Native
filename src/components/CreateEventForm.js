import React, { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';
import {
  getHijriDisplay,
  getHijriMonthLength,
  getHijriParts,
  hijriDisplayFromParts,
  hijriToGregorian,
  HIJRI_MONTHS,
} from '../services/hijri';
import {
  applyPrayerOffset,
  calculatePrayerTimes,
  hasPrayerLocation,
  prayerLabel,
  PRAYER_OPTIONS,
} from '../services/prayerTimes';
import { getHijriSettings } from '../services/settings';
import { classifyMetroArea, normalizeCity } from '../utils/cities';
import {
  AUDIENCE_TYPES,
  EVENT_TYPES,
  ORGANISER_OPTIONS,
  RECITER_TYPES,
  RELIGIOUS_EVENT_TYPES,
} from '../utils/eventOptions';
import { getOrganisations, normalizeOrganisationType } from '../services/organisations';
import AddressAutocomplete from './AddressAutocomplete';
import CompactSelect from './CompactSelect';

function Field({ label, optional = false, error, children }) {
  return (
    <View style={styles.field}>
      <Text maxFontSizeMultiplier={1.2} style={styles.label}>
        {label}{optional ? ' (optional)' : ' *'}
      </Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function ChoiceGroup({ options, value, onChange }) {
  if (options.length > 2) {
    return <CompactSelect options={options} value={value} onChange={onChange} />;
  }
  return (
    <View style={styles.choiceRow}>
      {options.map(option => {
        const selected = value === option;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option}
            onPress={() => onChange(option)}
            style={({ pressed }) => [
              styles.choice,
              selected && styles.choiceSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function OptionGroup({ options, value, onChange }) {
  return <CompactSelect options={options} value={value} onChange={onChange} />;
}

function isIsoDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());
}

function isWebUrl(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return /^https?:\/\/\S+$/i.test(text);
}

function addressParts(event) {
  const source = event || {};
  const address = source.address || {};
  if (typeof address === 'string') {
    return {
      fullAddress: address,
      street: address,
      suburb: source.suburb || '',
      state: '',
      postcode: '',
      latitude: null,
      longitude: null,
    };
  }
  return {
    fullAddress: address.fullAddress || '',
    street: address.street || '',
    suburb: address.suburb || source.suburb || '',
    state: address.state || '',
    postcode: address.postcode || '',
    latitude: address.latitude ?? null,
    longitude: address.longitude ?? null,
  };
}

function createFormState(event, defaultCity, defaults = {}) {
  const source = event || {};
  const address = addressParts(event);
  const reciters = Array.isArray(event?.reciters) && event.reciters.length
    ? event.reciters.map(item => ({
      type: item.type || 'Reciter',
      customType: item.customType || '',
      name: item.name || '',
    }))
    : [{ type: 'Reciter', name: '' }];

  return {
    city: normalizeCity(event?.metroArea || defaultCity),
    eventType: EVENT_TYPES.includes(event?.eventType) ? event.eventType : 'Majlis',
    customEventType: event?.customEventType || '',
    eventSubject: event?.eventSubject || event?.subject || '',
    hostName: source.hostName || defaults.hostName || '',
    hostPhone: source.hostPhone || defaults.hostPhone || '',
    hostContactOptional: source.hostContactOptional || '',
    isOnBehalfOf: Boolean(event?.isOnBehalfOf),
    organiserType: source.organiserType || 'private',
    organiserId: source.organiserId || '',
    organiserName: source.organiserName || '',
    organisationType: source.organisationType || 'private',
    eventDate: event?.eventDate || '',
    startTime: event?.startTime || '',
    endTime: event?.endTime || '',
    timeMode: source.timeMode || 'manual',
    prayerName: source.prayerName || '',
    prayerLabel: source.prayerLabel || '',
    prayerOffsetMinutes: Number(source.prayerOffsetMinutes || 0),
    prayerTimeZone: source.prayerTimeZone || '',
    hijriDate: source.hijriDate || '',
    enteredAsHijri: Boolean(source.enteredAsHijri),
    hijriDay: source.hijriDay || null,
    hijriMonth: source.hijriMonth || null,
    hijriYear: source.hijriYear || null,
    audienceType: AUDIENCE_TYPES.includes(event?.audienceType) ? event.audienceType : 'Family Event',
    speakerName: event?.speakerName || '',
    reciters,
    notes: event?.notes || '',
    imageUrl: event?.imageUrl || event?.posterUrl || '',
    imagePath: event?.imagePath || '',
    ...address,
    state: address.state || 'NSW',
  };
}

function normaliseForComparison(value) {
  return JSON.stringify(value, (key, item) => typeof item === 'string' ? item.trim() : item);
}

export default function CreateEventForm({
  defaultCity,
  defaultHostName = '',
  defaultHostPhone = '',
  existingEvents = [],
  initialEvent,
  onSubmit,
  onCancel,
  onRequireSignIn,
  submitLabel = 'Add Event',
  title = 'Add Event',
  subtitle = 'Add a new community event',
  hideDate = false,
  submitting = false,
  error = '',
  success = '',
  canSubmit = true,
}) {
  const defaults = useMemo(() => ({
    hostName: defaultHostName,
    hostPhone: defaultHostPhone,
  }), [defaultHostName, defaultHostPhone]);
  const [form, setForm] = useState(() => createFormState(initialEvent, defaultCity, defaults));
  const [attempted, setAttempted] = useState(false);
  const [localImage, setLocalImage] = useState(null);
  const [pickerError, setPickerError] = useState('');
  const [calendarMode, setCalendarMode] = useState(initialEvent?.enteredAsHijri ? 'hijri' : 'gregorian');
  const [hijriOverrides, setHijriOverrides] = useState([]);
  const [dynamicOrganisations, setDynamicOrganisations] = useState([]);

  useEffect(() => {
    setForm(createFormState(initialEvent, defaultCity, defaults));
    setAttempted(false);
    setLocalImage(null);
    setPickerError('');
    setCalendarMode(initialEvent?.enteredAsHijri ? 'hijri' : 'gregorian');
  }, [defaultCity, defaults, initialEvent?.id]);

  useEffect(() => {
    let active = true;
    getHijriSettings().then(settings => {
      if (active) setHijriOverrides(settings.overrides || []);
    });
    getOrganisations().then(items => {
      if (active) setDynamicOrganisations(Array.isArray(items) ? items : []);
    });
    return () => { active = false; };
  }, []);

  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const showReligious = RELIGIOUS_EVENT_TYPES.has(form.eventType);
  const prayerAddress = useMemo(() => ({
    fullAddress: form.fullAddress,
    street: form.street,
    suburb: form.suburb,
    state: form.state,
    postcode: form.postcode,
    latitude: form.latitude,
    longitude: form.longitude,
  }), [form.fullAddress, form.latitude, form.longitude, form.postcode, form.state, form.street, form.suburb]);
  const prayerTimes = useMemo(
    () => calculatePrayerTimes(form.eventDate, prayerAddress),
    [form.eventDate, prayerAddress]
  );

  useEffect(() => {
    if (!isIsoDate(form.eventDate) || form.enteredAsHijri) return;
    const display = getHijriDisplay(form.eventDate, hijriOverrides);
    const parts = getHijriParts(form.eventDate, hijriOverrides);
    if (
      form.hijriDate === display
      && form.hijriDay === parts.day
      && form.hijriMonth === parts.month
      && form.hijriYear === parts.year
    ) return;
    setForm(current => ({
      ...current,
      hijriDate: display,
      hijriDay: parts.day,
      hijriMonth: parts.month,
      hijriYear: parts.year,
    }));
  }, [form.enteredAsHijri, form.eventDate, form.hijriDate, form.hijriDay, form.hijriMonth, form.hijriYear, hijriOverrides]);

  useEffect(() => {
    if (form.timeMode !== 'prayer' || !form.prayerName || !prayerTimes?.[form.prayerName]) return;
    const nextStartTime = applyPrayerOffset(
      prayerTimes[form.prayerName],
      form.prayerOffsetMinutes || 0
    );
    const nextLabel = prayerLabel(form.prayerName);
    if (
      form.startTime === nextStartTime
      && form.prayerTimeZone === prayerTimes.timeZone
      && form.prayerLabel === nextLabel
    ) return;
    setForm(current => ({
      ...current,
      startTime: nextStartTime,
      prayerLabel: nextLabel,
      prayerTimeZone: prayerTimes.timeZone,
    }));
  }, [form.prayerLabel, form.prayerName, form.prayerOffsetMinutes, form.prayerTimeZone, form.startTime, form.timeMode, prayerTimes]);

  const validation = useMemo(() => {
    const errors = {};
    if (!form.hostName.trim()) errors.hostName = 'Enter the host name.';
    if (!isIsoDate(form.eventDate)) errors.eventDate = 'Use a valid date in YYYY-MM-DD format.';
    if (form.timeMode === 'prayer' && !form.prayerName) {
      errors.startTime = 'Select the prayer time for this event.';
    } else if (!isTime(form.startTime)) {
      errors.startTime = 'Use time format HH:MM (24-hour).';
    }
    if (form.endTime.trim() && !isTime(form.endTime)) errors.endTime = 'Use time format HH:MM (24-hour).';
    if (isTime(form.startTime) && isTime(form.endTime) && form.endTime <= form.startTime) {
      errors.endTime = 'End time must be later than start time.';
    }
    if (form.eventType === 'Custom' && !form.customEventType.trim()) {
      errors.customEventType = 'Enter the custom event type.';
    }
    if (
      !form.fullAddress.trim()
      || !form.suburb.trim()
      || !form.state
      || !Number.isFinite(Number(form.latitude))
      || !Number.isFinite(Number(form.longitude))
    ) {
      errors.address = 'Select the full event address from the Google suggestions.';
    }
    if (!isWebUrl(form.imageUrl)) errors.imageUrl = 'Enter a full http:// or https:// image URL.';
    return errors;
  }, [form]);

  const baseline = useMemo(
    () => createFormState(initialEvent, defaultCity, defaults),
    [defaultCity, defaults, initialEvent]
  );
  const isDirty = Boolean(localImage) || normaliseForComparison(form) !== normaliseForComparison(baseline);
  const canSend = Object.keys(validation).length === 0 && (!initialEvent?.id || isDirty);
  const unchangedEdit = Boolean(initialEvent?.id && !isDirty);
  const getDynamicOrganisationById = id => dynamicOrganisations.find(item => item.id === id);
  const getDynamicOrganisationBySlug = slug => dynamicOrganisations.find(item => item.slug === slug);

  const getCentreName = (organiserType = form.organiserType, organiserId = form.organiserId) => {
    if (!organiserType || organiserType === 'private' || organiserType === 'centre') return '';
    if (organiserId) return getDynamicOrganisationById(organiserId)?.name || '';
    const builtIn = ORGANISER_OPTIONS.find(option => option.value === organiserType);
    return builtIn?.name || getDynamicOrganisationBySlug(organiserType)?.name || '';
  };

  const getOrganisationType = (organiserType = form.organiserType, organiserId = form.organiserId) => {
    if (!organiserType || organiserType === 'private') return 'private';
    const selected = organiserId
      ? getDynamicOrganisationById(organiserId)
      : getDynamicOrganisationBySlug(organiserType);
    return normalizeOrganisationType(selected?.type || form.organisationType);
  };

  const organiserOptions = useMemo(() => {
    const extra = dynamicOrganisations
      .filter(item => !item.builtIn)
      .map(item => ({
        value: `org:${item.id}`,
        label: item.location ? `${item.name} - ${item.location}` : item.name,
        name: item.name || '',
        organisationType: normalizeOrganisationType(item.type),
      }));
    return [...ORGANISER_OPTIONS, ...extra];
  }, [dynamicOrganisations]);

  const selectedOrganiserValue = useMemo(() => {
    if (form.organiserId && getDynamicOrganisationById(form.organiserId)) return `org:${form.organiserId}`;
    return form.organiserType || 'private';
  }, [dynamicOrganisations, form.organiserId, form.organiserType]);

  const lockedHostName = Boolean(getCentreName());

  const setReciter = (index, field, value) => {
    setForm(current => ({
      ...current,
      reciters: current.reciters.map((reciter, itemIndex) => (
        itemIndex === index ? { ...reciter, [field]: value } : reciter
      )),
    }));
  };

  const addReciter = () => {
    setForm(current => ({
      ...current,
      reciters: [...current.reciters, { type: 'Reciter', name: '' }],
    }));
  };

  const moveReciter = (index, direction) => {
    setForm(current => {
      const target = index + direction;
      if (target < 0 || target >= current.reciters.length) return current;
      const reciters = [...current.reciters];
      [reciters[index], reciters[target]] = [reciters[target], reciters[index]];
      return { ...current, reciters };
    });
  };

  const removeReciter = index => {
    setForm(current => ({
      ...current,
      reciters: current.reciters.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const selectOrganiser = value => {
    const selectedDynamic = String(value || '').startsWith('org:')
      ? getDynamicOrganisationById(String(value).slice(4))
      : null;
    const selected = organiserOptions.find(option => option.value === value) || ORGANISER_OPTIONS[0];
    const organiserType = selectedDynamic?.slug || selected.value;
    const organiserId = selectedDynamic?.id || '';
    const centreName = selectedDynamic?.name || selected.name || '';
    setForm(current => ({
      ...current,
      organiserType,
      organiserId,
      organiserName: centreName,
      organisationType: selectedDynamic
        ? normalizeOrganisationType(selectedDynamic.type)
        : selected.organisationType,
      hostName: centreName || (current.isOnBehalfOf ? '' : defaultHostName || current.hostName),
    }));
  };

  const toggleOnBehalf = value => {
    const centreName = getCentreName();
    setForm(current => ({
      ...current,
      isOnBehalfOf: value,
      hostName: centreName || (value ? '' : defaultHostName),
      hostPhone: value ? '' : defaultHostPhone,
      hostContactOptional: value ? current.hostContactOptional : '',
    }));
  };

  const duplicateEvents = useMemo(() => {
    if (!form.eventDate || !form.startTime) return [];
    return existingEvents.filter(event => (
      event?.eventDate === form.eventDate
      && event?.startTime === form.startTime
      && event?.id !== initialEvent?.id
    ));
  }, [existingEvents, form.eventDate, form.startTime, initialEvent?.id]);

  const setGregorianDate = value => {
    setForm(current => ({
      ...current,
      eventDate: value,
      enteredAsHijri: false,
    }));
  };

  const switchCalendarMode = mode => {
    setCalendarMode(mode);
    if (mode === 'gregorian') {
      setForm(current => ({ ...current, enteredAsHijri: false }));
      return;
    }
    setForm(current => {
      const parts = isIsoDate(current.eventDate)
        ? getHijriParts(current.eventDate, hijriOverrides)
        : getHijriParts(new Date(), hijriOverrides);
      return {
        ...current,
        enteredAsHijri: true,
        hijriDay: current.hijriDay || parts.day,
        hijriMonth: current.hijriMonth || parts.month,
        hijriYear: current.hijriYear || parts.year,
      };
    });
  };

  const updateHijriDate = changes => {
    setForm(current => {
      const rawDay = changes.hijriDay ?? current.hijriDay;
      const rawMonth = changes.hijriMonth ?? current.hijriMonth;
      const rawYear = changes.hijriYear ?? current.hijriYear;
      const day = Number(rawDay);
      const month = Number(rawMonth);
      const year = Number(rawYear);
      if (!day || !month || !year) {
        return {
          ...current,
          ...changes,
          eventDate: '',
          hijriDate: '',
          enteredAsHijri: true,
        };
      }
      const maxDay = year && month ? getHijriMonthLength(year, month, hijriOverrides) : 30;
      const safeDay = Math.min(Math.max(day || 1, 1), maxDay);
      const eventDate = hijriToGregorian(safeDay, month, year, hijriOverrides) || current.eventDate;
      return {
        ...current,
        ...changes,
        hijriDay: safeDay,
        hijriMonth: month,
        hijriYear: year,
        hijriDate: hijriDisplayFromParts(safeDay, month, year),
        eventDate,
        enteredAsHijri: true,
      };
    });
  };

  const setTimeMode = mode => {
    setForm(current => ({
      ...current,
      timeMode: mode,
      startTime: mode === 'manual' ? current.startTime : '',
      prayerName: mode === 'manual' ? '' : current.prayerName,
      prayerLabel: mode === 'manual' ? '' : current.prayerLabel,
      prayerOffsetMinutes: mode === 'manual' ? 0 : current.prayerOffsetMinutes,
      prayerTimeZone: mode === 'manual' ? '' : current.prayerTimeZone,
    }));
  };

  const applyPrayerTime = (name, offset = form.prayerOffsetMinutes) => {
    if (!name || !prayerTimes?.[name]) return;
    setForm(current => ({
      ...current,
      timeMode: 'prayer',
      prayerName: name,
      prayerLabel: prayerLabel(name),
      prayerOffsetMinutes: Number(offset || 0),
      prayerTimeZone: prayerTimes.timeZone,
      startTime: applyPrayerOffset(prayerTimes[name], offset || 0),
    }));
  };

  const adjustPrayerOffset = delta => {
    const next = Math.max(-360, Math.min(360, Number(form.prayerOffsetMinutes || 0) + delta));
    if (form.prayerName) applyPrayerTime(form.prayerName, next);
    else update('prayerOffsetMinutes', next);
  };

  const handleSubmit = () => {
    setAttempted(true);
    if (!canSubmit) {
      onRequireSignIn?.();
      return;
    }
    if (!canSend) return;

    const fullAddress = form.fullAddress.trim();
    const displayType = form.eventType === 'Custom'
      ? form.customEventType.trim()
      : form.eventType;

    onSubmit?.({
      metroArea: classifyMetroArea(prayerAddress),
      eventType: form.eventType,
      customEventType: form.eventType === 'Custom' ? form.customEventType.trim() : '',
      eventTypeDisplay: displayType,
      eventSubject: form.eventSubject.trim(),
      hostName: (getCentreName() || form.hostName).trim(),
      hostPhone: form.hostPhone.trim(),
      hostContactOptional: form.isOnBehalfOf ? form.hostContactOptional.trim() : '',
      isOnBehalfOf: form.isOnBehalfOf,
      organiserType: form.organiserType,
      organiserId: form.organiserId,
      organiserName: getCentreName() || form.organiserName,
      organisationType: getOrganisationType(),
      eventDate: form.eventDate.trim(),
      startTime: form.startTime.trim(),
      endTime: form.endTime.trim(),
      timeMode: form.timeMode,
      prayerName: form.prayerName,
      prayerLabel: form.prayerLabel,
      prayerOffsetMinutes: form.prayerOffsetMinutes,
      prayerTimeZone: form.prayerTimeZone,
      hijriDate: form.hijriDate,
      enteredAsHijri: form.enteredAsHijri,
      hijriDay: form.hijriDay,
      hijriMonth: form.hijriMonth,
      hijriYear: form.hijriYear,
      audienceType: form.audienceType,
      speakerName: showReligious ? form.speakerName.trim() : '',
      reciters: showReligious
        ? form.reciters.filter(item => item.name.trim()).map(item => ({
          type: item.type,
          customType: item.type === 'Custom' ? String(item.customType || '').trim() : '',
          name: item.name.trim(),
        }))
        : [],
      notes: form.notes.trim(),
      imageUrl: form.imageUrl.trim(),
      imagePath: form.imagePath,
      _localImageUri: localImage?.uri || '',
      _localImageMimeType: localImage?.mimeType || 'image/jpeg',
      address: {
        fullAddress,
        street: form.street.trim(),
        suburb: form.suburb.trim(),
        state: form.state,
        postcode: form.postcode.trim(),
        latitude: form.latitude,
        longitude: form.longitude,
      },
    });
  };

  const choosePoster = async () => {
    setPickerError('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setPickerError('Allow photo access to choose an event poster.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize >= 5 * 1024 * 1024) {
        setPickerError('Event posters must be smaller than 5 MB.');
        return;
      }
      setLocalImage({ uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' });
      update('imageUrl', '');
      update('imagePath', '');
    } catch (pickError) {
      setPickerError(pickError?.message || 'Could not open your photo library.');
    }
  };

  const removePoster = () => {
    setLocalImage(null);
    setPickerError('');
    setForm(current => ({ ...current, imageUrl: '', imagePath: '' }));
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {!canSubmit ? (
        <View style={styles.accountNotice}>
          <Text style={styles.accountNoticeTitle}>Sign in required</Text>
          <Text style={styles.accountNoticeText}>Create an account or sign in before adding events.</Text>
          <Pressable onPress={onRequireSignIn} style={styles.accountButton}>
            <Text style={styles.accountButtonText}>Go to Profile</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        <Field label="Upload Event Poster" optional error={attempted ? validation.imageUrl : ''}>
          {localImage?.uri || (isWebUrl(form.imageUrl) && form.imageUrl.trim()) ? (
            <Image source={{ uri: localImage?.uri || form.imageUrl.trim() }} resizeMode="cover" style={styles.posterPreview} />
          ) : null}
          <View style={styles.posterActions}>
            <Pressable onPress={choosePoster} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
              <Text style={styles.addButtonText}>{localImage || form.imageUrl ? 'Choose another photo' : 'Upload your event poster'}</Text>
            </Pressable>
            {localImage || form.imageUrl ? (
              <Pressable onPress={removePoster} style={styles.removeButton}>
                <Text style={styles.removeText}>Remove poster</Text>
              </Pressable>
            ) : null}
          </View>
          {pickerError ? <Text style={styles.fieldError}>{pickerError}</Text> : null}
          <Text style={styles.orText}>or use an image URL</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={form.imageUrl}
            onChangeText={value => update('imageUrl', value)}
            placeholder="https://example.com/poster.jpg"
            placeholderTextColor={colors.muted}
            style={[styles.input, attempted && validation.imageUrl && styles.inputInvalid]}
          />
          <Text style={styles.helper}>Optional - if you do not add one, your organisation logo will be shown. Images must be smaller than 5 MB.</Text>
        </Field>

        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>I am adding this event on behalf of someone else</Text>
          </View>
          <Switch
            value={form.isOnBehalfOf}
            onValueChange={toggleOnBehalf}
            trackColor={{ false: colors.border, true: colors.teal }}
          />
        </View>

        <Field label="Organiser Type">
          <Text style={styles.helper}>Used to show the correct logo when no poster is uploaded.</Text>
          <OptionGroup options={organiserOptions} value={selectedOrganiserValue} onChange={selectOrganiser} />
        </Field>

        <Field label="Host Name" error={attempted ? validation.hostName : ''}>
          <TextInput
            value={form.hostName}
            onChangeText={value => update('hostName', value)}
            placeholder={form.isOnBehalfOf ? "Enter the host's name" : 'Your name or organisation'}
            placeholderTextColor={colors.muted}
            editable={!lockedHostName}
            style={[styles.input, attempted && validation.hostName && styles.inputInvalid]}
          />
        </Field>

        <Field label="Host Phone Number" optional>
          <TextInput
            keyboardType="phone-pad"
            value={form.hostPhone}
            onChangeText={value => update('hostPhone', value)}
            placeholder="e.g. 0412 345 678"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </Field>

        {form.isOnBehalfOf ? (
          <Field label="Host Contact Email" optional>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={form.hostContactOptional}
              onChangeText={value => update('hostContactOptional', value)}
              placeholder="Email of host (if different from phone above)"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </Field>
        ) : null}

        {!hideDate ? <Field label="Date" error={attempted ? validation.eventDate : ''}>
          <ChoiceGroup
            options={['Gregorian', 'Hijri']}
            value={calendarMode === 'gregorian' ? 'Gregorian' : 'Hijri'}
            onChange={value => switchCalendarMode(value === 'Gregorian' ? 'gregorian' : 'hijri')}
          />
          {calendarMode === 'gregorian' ? (
            <>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                value={form.eventDate}
                onChangeText={setGregorianDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                style={[styles.input, attempted && validation.eventDate && styles.inputInvalid]}
              />
              {form.hijriDate ? <Text style={styles.convertedDate}>Hijri: {form.hijriDate}</Text> : null}
            </>
          ) : (
            <View style={styles.hijriBox}>
              <Text style={styles.miniLabel}>Hijri Month</Text>
              <ChoiceGroup
                options={HIJRI_MONTHS.map(month => month.name)}
                value={HIJRI_MONTHS.find(month => month.value === Number(form.hijriMonth))?.name || ''}
                onChange={name => updateHijriDate({
                  hijriMonth: HIJRI_MONTHS.find(month => month.name === name)?.value || 1,
                })}
              />
              <View style={styles.twoColumns}>
                <View style={styles.column}>
                  <Text style={styles.miniLabel}>Day</Text>
                  <TextInput
                    keyboardType="number-pad"
                    maxLength={2}
                    value={String(form.hijriDay || '')}
                    onChangeText={value => updateHijriDate({ hijriDay: value.replace(/\D/g, '') })}
                    placeholder="1"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                </View>
                <View style={styles.column}>
                  <Text style={styles.miniLabel}>Year</Text>
                  <TextInput
                    keyboardType="number-pad"
                    maxLength={4}
                    value={String(form.hijriYear || '')}
                    onChangeText={value => updateHijriDate({ hijriYear: value.replace(/\D/g, '') })}
                    placeholder="1448"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                </View>
              </View>
              {form.eventDate ? <Text style={styles.convertedDate}>Gregorian: {form.eventDate}</Text> : null}
            </View>
          )}
        </Field> : null}

        <Text style={styles.sectionLabel}>Time Selection *</Text>
        <OptionGroup
          options={[
            { value: 'manual', label: 'Fixed Time' },
            { value: 'prayer', label: 'Prayer Time (Variable)' },
          ]}
          value={form.timeMode}
          onChange={setTimeMode}
        />

        {form.timeMode === 'manual' ? (
          <View style={styles.twoColumns}>
            <View style={styles.column}>
              <Field label="Start Time" error={attempted ? validation.startTime : ''}>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                  value={form.startTime}
                  onChangeText={value => update('startTime', value)}
                  placeholder="19:30"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, attempted && validation.startTime && styles.inputInvalid]}
                />
              </Field>
            </View>
            <View style={styles.column}>
              <Field label="End Time" optional error={attempted ? validation.endTime : ''}>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                  value={form.endTime}
                  onChangeText={value => update('endTime', value)}
                  placeholder="21:00"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, attempted && validation.endTime && styles.inputInvalid]}
                />
              </Field>
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Address *</Text>
        <Text style={styles.helper}>Start typing, then select the full Australian address from Google. Public cards show suburb-level location only.</Text>
        <AddressAutocomplete
          invalid={Boolean(attempted && validation.address)}
          value={prayerAddress}
          onChange={address => setForm(current => ({ ...current, ...address }))}
        />
        {attempted && validation.address ? <Text style={styles.fieldError}>{validation.address}</Text> : null}

        {form.timeMode === 'prayer' ? (
          <View style={styles.prayerBox}>
            <Text style={styles.miniLabel}>Prayer Time *</Text>
            {prayerTimes ? (
              <>
                <ChoiceGroup
                  options={PRAYER_OPTIONS.map(option => option.label)}
                  value={prayerLabel(form.prayerName)}
                  onChange={label => applyPrayerTime(PRAYER_OPTIONS.find(option => option.label === label)?.key)}
                />
                <Text style={styles.miniLabel}>Offset</Text>
                <View style={styles.offsetRow}>
                  <Pressable onPress={() => adjustPrayerOffset(-30)} style={styles.offsetButton}>
                    <Text style={styles.offsetButtonText}>-</Text>
                  </Pressable>
                  <Text style={styles.offsetValue}>
                    {form.prayerOffsetMinutes > 0 ? '+' : ''}{form.prayerOffsetMinutes} mins
                  </Text>
                  <Pressable onPress={() => adjustPrayerOffset(30)} style={styles.offsetButton}>
                    <Text style={styles.offsetButtonText}>+</Text>
                  </Pressable>
                </View>
                {form.prayerName ? (
                  <View style={styles.prayerResult}>
                    <Text style={styles.prayerResultTitle}>
                      {prayerLabel(form.prayerName)}: {prayerTimes[form.prayerName]}
                    </Text>
                    <Text style={styles.prayerResultTime}>Event start time: {form.startTime}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.helper}>
                {hasPrayerLocation(prayerAddress)
                  ? 'Select a valid event date first to calculate prayer times.'
                  : 'Prayer time needs a full address selected with GPS location data.'}
              </Text>
            )}
            {attempted && validation.startTime ? <Text style={styles.fieldError}>{validation.startTime}</Text> : null}
            <Field label="End Time" optional error={attempted ? validation.endTime : ''}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                value={form.endTime}
                onChangeText={value => update('endTime', value)}
                placeholder="21:00"
                placeholderTextColor={colors.muted}
                style={[styles.input, attempted && validation.endTime && styles.inputInvalid]}
              />
            </Field>
          </View>
        ) : null}

        {duplicateEvents.length ? (
          <View style={styles.duplicateNotice}>
            <Text style={styles.duplicateTitle}>
              {duplicateEvents.length} event{duplicateEvents.length === 1 ? '' : 's'} already exist at this date and time:
            </Text>
            {duplicateEvents.map(item => (
              <Text key={item.id} style={styles.duplicateText}>
                - {item.eventTypeDisplay || item.eventType} by {item.hostName}
                {item.address?.suburb ? ` - ${item.address.suburb}` : ''} - {item.audienceType}
              </Text>
            ))}
            <Text style={styles.duplicateHelp}>You can still save - this is a notice only.</Text>
          </View>
        ) : null}

        <Field label="Event Type">
          <ChoiceGroup options={EVENT_TYPES} value={form.eventType} onChange={value => update('eventType', value)} />
        </Field>

        {form.eventType === 'Custom' ? (
          <Field label="Custom Event Type" error={attempted ? validation.customEventType : ''}>
            <TextInput
              value={form.customEventType}
              onChangeText={value => update('customEventType', value)}
              placeholder="e.g. Aqeeqa, Nikah, Commemoration"
              placeholderTextColor={colors.muted}
              style={[styles.input, attempted && validation.customEventType && styles.inputInvalid]}
            />
          </Field>
        ) : null}

        <Field label="Subject" optional>
          <TextInput
            value={form.eventSubject}
            onChangeText={value => update('eventSubject', value)}
            placeholder="e.g. Shahadat of Imam Hussain (A.S.)"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </Field>

        <Field label="Audience Type">
          <ChoiceGroup options={AUDIENCE_TYPES} value={form.audienceType} onChange={value => update('audienceType', value)} />
        </Field>

        {showReligious ? (
          <View style={styles.religiousBox}>
            <Text style={styles.religiousIntro}>Speaker and reciters for {form.eventType === 'Custom' ? form.customEventType || 'Custom' : form.eventType} events.</Text>
            <Field label="Speaker" optional>
              <TextInput
                value={form.speakerName}
                onChangeText={value => update('speakerName', value)}
                placeholder="Speaker name"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </Field>
            {form.reciters.map((reciter, index) => (
              <View key={`reciter-${index}`} style={styles.reciterCard}>
                <View style={styles.reciterHeader}>
                  <Text style={styles.reciterTitle}>Sequence {index + 1}</Text>
                  <View style={styles.sequenceActions}>
                    <Pressable
                      disabled={index === 0}
                      onPress={() => moveReciter(index, -1)}
                      style={[styles.sequenceButton, index === 0 && styles.disabled]}
                    >
                      <Text style={styles.sequenceButtonText}>Up</Text>
                    </Pressable>
                    <Pressable
                      disabled={index === form.reciters.length - 1}
                      onPress={() => moveReciter(index, 1)}
                      style={[styles.sequenceButton, index === form.reciters.length - 1 && styles.disabled]}
                    >
                      <Text style={styles.sequenceButtonText}>Down</Text>
                    </Pressable>
                  </View>
                </View>
                <Text style={styles.miniLabel}>Type</Text>
                <ChoiceGroup
                  options={RECITER_TYPES}
                  value={reciter.type}
                  onChange={value => setReciter(index, 'type', value)}
                />
                {reciter.type === 'Custom' ? (
                  <>
                    <Text style={styles.miniLabel}>Custom Type Name</Text>
                    <TextInput
                      value={reciter.customType || ''}
                      onChangeText={value => setReciter(index, 'customType', value)}
                      placeholder="e.g. Rubai, Qasida, Nauha…"
                      placeholderTextColor={colors.muted}
                      style={styles.input}
                    />
                  </>
                ) : null}
                <Text style={styles.miniLabel}>Reciter Name</Text>
                <TextInput
                  value={reciter.name}
                  onChangeText={value => setReciter(index, 'name', value)}
                  placeholder="Full name"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
                <Pressable onPress={() => removeReciter(index)} style={styles.removeButton}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}
            <Pressable onPress={addReciter} style={styles.addButton}>
              <Text style={styles.addButtonText}>+ Add Reciter</Text>
            </Pressable>
          </View>
        ) : null}

        <Field label="Notes" optional>
          <TextInput
            multiline
            maxLength={500}
            numberOfLines={4}
            textAlignVertical="top"
            value={form.notes}
            onChangeText={value => update('notes', value)}
            placeholder="Add instructions or information to include when this event is shared"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.textArea]}
          />
          <Text style={styles.counter}>{form.notes.length}/500</Text>
        </Field>

        {attempted && Object.keys(validation).length ? (
          <Text accessibilityRole="alert" style={styles.error}>Complete the highlighted mandatory fields.</Text>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        <Pressable
          disabled={submitting || unchangedEdit}
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.submitButton,
            pressed && styles.pressed,
            (submitting || unchangedEdit) && styles.disabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Text style={styles.submitText}>{canSubmit ? submitLabel : 'Sign in to add events'}</Text>
          )}
        </Pressable>

        {onCancel ? (
          <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        ) : null}

        {isDirty ? (
          <Pressable
            onPress={() => {
              setForm(createFormState(initialEvent, defaultCity));
              setAttempted(false);
              setLocalImage(null);
              setPickerError('');
            }}
            style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
          >
            <Text style={styles.resetText}>Reset form</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.lg, paddingBottom: 48 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, fontWeight: '700', marginTop: spacing.xs, marginBottom: spacing.lg },
  accountNotice: { padding: spacing.lg, marginBottom: spacing.lg, borderRadius: radius.lg, backgroundColor: '#fff8e1', borderWidth: 1, borderColor: '#efcf73' },
  accountNoticeTitle: { color: colors.navy, fontSize: 18, fontWeight: '900' },
  accountNoticeText: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: spacing.xs },
  accountButton: { alignSelf: 'flex-start', marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.teal },
  accountButtonText: { color: colors.surface, fontWeight: '900' },
  card: { gap: spacing.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  field: { gap: 7 },
  label: { color: colors.navy, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  sectionLabel: { color: colors.tealDark, fontSize: 14, fontWeight: '900', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surface, color: colors.text, fontSize: 15 },
  inputInvalid: { borderColor: colors.danger, backgroundColor: '#fffafa' },
  fieldError: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  posterPreview: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  posterActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  orText: { color: colors.muted, fontSize: 11, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  switchCopy: { flex: 1 },
  switchTitle: { color: colors.navy, fontSize: 14, fontWeight: '900' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  choiceSelected: { borderColor: colors.teal, backgroundColor: colors.teal },
  choiceText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  choiceTextSelected: { color: colors.surface },
  optionList: { gap: spacing.sm },
  option: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  optionSelected: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.muted, backgroundColor: colors.surface },
  radioSelected: { borderWidth: 5, borderColor: colors.teal },
  optionText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
  optionTextSelected: { color: colors.tealDark, fontWeight: '900' },
  fixedTimeBadge: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.teal },
  fixedTimeText: { color: colors.surface, fontSize: 13, fontWeight: '900' },
  convertedDate: { color: colors.tealDark, fontSize: 12, fontWeight: '800' },
  hijriBox: { gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  prayerBox: { gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.tealSoft },
  offsetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  offsetButton: { width: 46, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.teal, backgroundColor: colors.surface },
  offsetButtonText: { color: colors.tealDark, fontSize: 22, fontWeight: '900' },
  offsetValue: { flex: 1, textAlign: 'center', color: colors.navy, fontSize: 14, fontWeight: '900' },
  prayerResult: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  prayerResultTitle: { color: colors.navy, fontSize: 14, fontWeight: '900' },
  prayerResultTime: { color: colors.tealDark, fontSize: 12, fontWeight: '900', marginTop: spacing.xs },
  duplicateNotice: { gap: 5, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  duplicateTitle: { color: '#92400e', fontSize: 13, fontWeight: '900' },
  duplicateText: { color: '#78350f', fontSize: 12, lineHeight: 17 },
  duplicateHelp: { color: '#92400e', fontSize: 11, fontWeight: '700', marginTop: 2 },
  twoColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  column: { flex: 1, minWidth: 0 },
  religiousBox: { gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  religiousIntro: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  reciterCard: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  reciterTitle: { color: colors.navy, fontSize: 13, fontWeight: '900' },
  reciterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sequenceActions: { flexDirection: 'row', gap: 6 },
  sequenceButton: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.teal, backgroundColor: colors.surface },
  sequenceButtonText: { color: colors.tealDark, fontSize: 11, fontWeight: '900' },
  miniLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  addButton: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.teal },
  addButtonText: { color: colors.tealDark, fontSize: 13, fontWeight: '900' },
  removeButton: { alignSelf: 'flex-end', paddingHorizontal: spacing.sm, paddingVertical: 6 },
  removeText: { color: colors.danger, fontSize: 12, fontWeight: '900' },
  textArea: { minHeight: 110 },
  counter: { alignSelf: 'flex-end', color: colors.muted, fontSize: 11 },
  submitButton: { minHeight: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal, paddingHorizontal: spacing.lg },
  submitText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  cancelButton: { minHeight: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealSoft, paddingHorizontal: spacing.lg },
  cancelText: { color: colors.tealDark, fontSize: 14, fontWeight: '900' },
  resetButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  resetText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 14, fontWeight: '800' },
  success: { color: colors.tealDark, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.55 },
});
