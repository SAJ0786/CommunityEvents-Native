import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import NativeShare from 'react-native-share';
import { colors, radius, shadow, spacing } from '../theme';
import { formatEventDate, formatEventTime } from '../utils/formatters';
import { buildEventShareMessage } from '../utils/eventShare';
import { getEventSuburb, getEventTitle } from '../services/events';
import { openEventInDeviceCalendar } from '../services/calendar';
import { getImmediatePosterSource, resolvePosterSource } from '../services/images';
import { getEventHostUid, sendHostMessage } from '../services/messaging';
import { isPlayableYouTubeUrl } from '../utils/liveVideo';
import {
  cancelEventReminder,
  formatReminderLeadTime,
  getEventReminder,
  openDeviceNotificationSettings,
  scheduleEventReminder,
} from '../services/reminders';

const REMINDER_OPTIONS = [
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 180, label: '3 hours before' },
  { value: 1440, label: '1 day before' },
];

function DetailRow({ label, icon, value }) {
  if (!value) return null;
  return (
    <View accessibilityLabel={`${label}: ${value}`} style={styles.detailRow}>
      <View style={styles.detailIconCircle}>
        <MaterialCommunityIcons color={colors.blue} name={icon} size={19} />
      </View>
      <Text style={styles.detailValue}>{String(value)}</Text>
    </View>
  );
}

function ActionButton({ label, icon, iconNode, variant = 'subtle', onPress, disabled = false, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        style,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={[
        styles.actionIconBubble,
        variant === 'share' && styles.actionIconBubbleShare,
        variant === 'primary' && styles.actionIconBubblePrimary,
        variant === 'danger' && styles.actionIconBubbleDanger,
        variant === 'live' && styles.actionIconBubbleLive,
      ]}>
        {iconNode || <MaterialCommunityIcons color={variant === 'danger' ? colors.danger : variant === 'live' ? '#ffffff' : colors.blue} name={icon} size={22} />}
      </View>
      <Text maxFontSizeMultiplier={1} numberOfLines={2} style={[
        styles.actionLabel,
        variant === 'danger' && styles.actionLabelDanger,
        variant === 'live' && styles.actionLabelLive,
      ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatReciters(reciters) {
  if (!Array.isArray(reciters)) return '';
  return reciters
    .filter(reciter => reciter?.name)
    .map(reciter => `${reciter.customType || reciter.type || 'Reciter'}: ${reciter.name}`)
    .join('\n');
}

function getPosterFileType(uri = '') {
  const normalized = String(uri).toLowerCase();
  if (normalized.startsWith('data:image/png') || normalized.includes('.png')) {
    return { extension: 'png', mimeType: 'image/png' };
  }
  if (normalized.startsWith('data:image/webp') || normalized.includes('.webp')) {
    return { extension: 'webp', mimeType: 'image/webp' };
  }
  return { extension: 'jpg', mimeType: 'image/jpeg' };
}

async function preparePosterForSharing(uri, eventId) {
  const source = String(uri || '').trim();
  if (!source) throw new Error('No event poster is available.');

  const fileType = getPosterFileType(source);
  if (source.startsWith('data:') || source.startsWith('file:') || source.startsWith('content:')) {
    return { uri: source, ...fileType };
  }

  if (!/^https?:\/\//i.test(source)) {
    throw new Error('This poster format cannot be shared.');
  }

  const safeId = String(eventId || 'event').replace(/[^a-z0-9_-]/gi, '-').slice(0, 48);
  const destination = `${FileSystem.cacheDirectory}community-event-${safeId}.${fileType.extension}`;
  const result = await FileSystem.downloadAsync(source, destination);
  if (!result?.uri || result.status < 200 || result.status >= 300) {
    throw new Error('The event poster could not be downloaded.');
  }
  return { uri: result.uri, ...fileType };
}

export default function EventDetailsModal({
  event,
  visible,
  onClose,
  isGuest = true,
  user = null,
  profile = null,
  onNiazArrangement,
  onEdit,
  onDelete,
  onCopy,
  onEditSeries,
  onDeleteSeries,
  onToggleVisibility,
  onTransfer,
  onRemoveLiveStale,
  canManageStream = false,
  onManageStream,
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  const closingRef = useRef(false);
  const scrollOffsetRef = useRef(0);
  const [posterUri, setPosterUri] = useState('');
  const [posterOpen, setPosterOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharingPoster, setSharingPoster] = useState(false);
  const [hostMessageOpen, setHostMessageOpen] = useState(false);
  const [hostMessageText, setHostMessageText] = useState('');
  const [hostMessageStatus, setHostMessageStatus] = useState('');
  const [hostMessageSending, setHostMessageSending] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminder, setReminder] = useState(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderError, setReminderError] = useState('');
  const hasPlayableLiveUrl = isPlayableYouTubeUrl(event?.liveWatchUrl);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    scrollOffsetRef.current = 0;
    translateY.setValue(640);
    Animated.timing(translateY, {
      toValue: 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [translateY, visible]);

  useEffect(() => {
    let alive = true;
    if (!event) {
      setPosterUri('');
      setPosterOpen(false);
      setShareOpen(false);
      setHostMessageOpen(false);
      setHostMessageText('');
      setHostMessageStatus('');
      setReminderOpen(false);
      setReminder(null);
      setReminderError('');
      return () => { alive = false; };
    }

    setPosterUri(getImmediatePosterSource(event));

    resolvePosterSource(event)
      .then(value => {
        if (alive && value) setPosterUri(value);
      })
      .catch(() => {});

    getEventReminder(event.id)
      .then(value => {
        if (alive) setReminder(value);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [event]);

  const animateClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(translateY, {
      toValue: 900,
      duration: 280,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      closeRef.current?.();
    });
  }, [translateY]);

  const restoreSheet = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      damping: 24,
      stiffness: 180,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const releaseDrag = useCallback(gesture => {
    const projectedDistance = gesture.dy + Math.max(0, gesture.vy) * 70;
    if (gesture.dy > 48 || gesture.vy > 0.42 || projectedDistance > 58) {
      animateClose();
      return;
    }
    restoreSheet();
  }, [animateClose, restoreSheet]);

  const sheetPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, gesture) => (
      scrollOffsetRef.current <= 0
      && gesture.dy > 3
      && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.1
    ),
    onMoveShouldSetPanResponder: (_, gesture) => (
      scrollOffsetRef.current <= 0
      && gesture.dy > 3
      && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.1
    ),
    onPanResponderGrant: () => translateY.stopAnimation(),
    onPanResponderMove: (_, gesture) => {
      translateY.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_, gesture) => releaseDrag(gesture),
    onPanResponderTerminate: restoreSheet,
    onPanResponderTerminationRequest: () => false,
  }), [releaseDrag, restoreSheet, translateY]);

  if (!event) return null;

  const displayType = event.eventTypeDisplay || event.customEventType || event.eventType || event.type || '';
  const host = event.hostName || event.organiserName || event.organizationName || '';
  const audience = event.audienceType === 'Mixed Audience' ? 'Family Event' : event.audienceType || event.audience || '';
  const hijriDate = event.hijriDateDisplay || event.hijriDate || '';
  const address = event.address || {};
  const fullAddress = typeof address === 'string'
    ? address
    : address.fullAddress || [address.street, address.suburb, address.state, address.postcode].filter(Boolean).join(', ');
  const publicLocation = typeof address === 'string'
    ? getEventSuburb(event)
    : [address.suburb || getEventSuburb(event), address.state].filter(Boolean).join(', ');
  const location = isGuest ? publicLocation : fullAddress || publicLocation;
  const shareMessage = buildEventShareMessage(event, { isGuest, user, profile });
  const hasPoster = Boolean(posterUri);
  const hasUploadedPoster = Boolean(event.imageUrl || event.posterUrl || event.poster || event.image || event.flyerUrl || event.flyer || event.imagePath || event.posterPath);
  const canSharePoster = hasUploadedPoster && hasPoster;
  const hostUid = getEventHostUid(event);
  // The current owner is the contact target. Ownership transfers update
  // createdByUserId, so the old owner can contact the new owner while the new
  // owner sees the same action disabled.
  const canConnectHost = Boolean(!isGuest && user?.uid && (!hostUid || hostUid !== user.uid));
  const isSeriesEvent = Boolean(event.isSeries || event.isRecurring || event.seriesId || event.recurringSeriesId);

  const shareTextOnly = async () => {
    try {
      await Share.share({
        title: getEventTitle(event),
        message: shareMessage,
      });
      setShareOpen(false);
    } catch (error) {
      Alert.alert('Share event', error?.message || 'Could not open sharing on this device.');
    }
  };

  const shareWithPoster = async () => {
    if (!canSharePoster || sharingPoster) return;
    setSharingPoster(true);
    try {
      const posterFile = await preparePosterForSharing(posterUri, event.id);
      try {
        await NativeShare.open({
          title: getEventTitle(event),
          subject: getEventTitle(event),
          message: shareMessage,
          url: posterFile.uri,
          type: posterFile.mimeType,
          filename: `community-event-${event.id || 'poster'}.${posterFile.extension}`,
          useInternalStorage: true,
          failOnCancel: false,
        });
      } catch (nativeShareError) {
        if (Platform.OS !== 'ios') throw nativeShareError;
        await Share.share({
          title: getEventTitle(event),
          message: shareMessage,
          url: posterFile.uri,
        });
      }
      setShareOpen(false);
    } catch (error) {
      Alert.alert('Share event', error?.message || 'Could not share the poster on this device.');
    } finally {
      setSharingPoster(false);
    }
  };

  const copyShareText = async () => {
    try {
      await Clipboard.setStringAsync(shareMessage);
      setShareOpen(false);
      Alert.alert('Copied', 'Share text copied to your clipboard.');
    } catch {
      Alert.alert('Copy text', 'Could not copy the share text.');
    }
  };

  const sendMessageToHost = async () => {
    if (!hostMessageText.trim() || hostMessageSending) return;
    setHostMessageSending(true);
    setHostMessageStatus('');
    try {
      await sendHostMessage({ event, user, profile, text: hostMessageText });
      setHostMessageText('');
      setHostMessageStatus('Message sent to host. You can continue the conversation in Inbox.');
    } catch (error) {
      setHostMessageStatus(error?.message || 'Could not send this message.');
    } finally {
      setHostMessageSending(false);
    }
  };

  const openDirections = async () => {
    if (isGuest || !fullAddress) return;
    const destination = encodeURIComponent(fullAddress);
    const url = Platform.OS === 'ios'
      ? `https://maps.apple.com/?daddr=${destination}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Directions', 'Could not open maps on this device.');
    }
  };

  const addToCalendar = async () => {
    if (isGuest) return;
    try {
      await openEventInDeviceCalendar(event);
    } catch (error) {
      Alert.alert('Add to calendar', error?.message || 'Could not open your calendar.');
    }
  };

  const openLiveVideo = async () => {
    if (!hasPlayableLiveUrl) {
      Alert.alert('Watch on YouTube', 'The YouTube live link is not available yet.');
      return;
    }
    try {
      await Linking.openURL(event.liveWatchUrl);
    } catch {
      Alert.alert('Watch Live', 'Could not open YouTube on this device.');
    }
  };

  const setEventReminder = async minutesBefore => {
    if (isGuest || reminderBusy) return;
    setReminderBusy(true);
    setReminderError('');
    try {
      const value = await scheduleEventReminder(event, minutesBefore);
      setReminder(value);
      setReminderOpen(false);
      Alert.alert('Reminder set', `We’ll remind you ${formatReminderLeadTime(minutesBefore)}.`);
    } catch (error) {
      const message = error?.message || 'Could not set this reminder.';
      setReminderError(message);
      if (['EXACT_ALARM_BLOCKED', 'REMINDER_NOT_SCHEDULED', 'NOTIFICATION_PERMISSION_DENIED'].includes(error?.code)) {
        Alert.alert(
          'Reminder permission required',
          message,
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => openDeviceNotificationSettings({ exactAlarm: error?.code === 'EXACT_ALARM_BLOCKED' }),
            },
          ],
        );
      }
    } finally {
      setReminderBusy(false);
    }
  };

  const removeEventReminder = async () => {
    if (!event.id || reminderBusy) return;
    setReminderBusy(true);
    setReminderError('');
    try {
      await cancelEventReminder(event.id);
      setReminder(null);
      setReminderOpen(false);
      Alert.alert('Reminder removed', 'This event reminder has been cancelled.');
    } catch (error) {
      setReminderError(error?.message || 'Could not remove this reminder.');
    } finally {
      setReminderBusy(false);
    }
  };

  return (
    <>
      <Modal transparent visible={visible} animationType="none" onRequestClose={animateClose}>
        <SafeAreaView style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={animateClose} />
          <Animated.View {...sheetPanResponder.panHandlers} style={[styles.sheet, { transform: [{ translateY }] }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.dragHandle} />
              <View style={styles.headerRow}>
                <View style={styles.headerCopy}>
                  <Text maxFontSizeMultiplier={1.05} style={styles.headerTitle}>Event details</Text>
                  <Text maxFontSizeMultiplier={1.05} style={styles.headerHint}>Swipe down to close</Text>
                </View>
                <Pressable accessibilityLabel="Close event details" onPress={animateClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                  <Text maxFontSizeMultiplier={1} style={styles.closeText}>{'\u00D7'}</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView
              bounces={false}
              contentContainerStyle={styles.content}
              directionalLockEnabled
              keyboardShouldPersistTaps="handled"
              onScroll={event => { scrollOffsetRef.current = Math.max(0, event.nativeEvent.contentOffset.y); }}
              scrollEventThrottle={16}
            >
              <View style={styles.card}>
                <View style={styles.titlePanel}>
                  <Text maxFontSizeMultiplier={1.08} style={styles.title}>{getEventTitle(event).toUpperCase()}</Text>
                </View>

                <View style={styles.actionGrid}>
                  {onToggleVisibility ? <ActionButton icon={event.hidden ? 'eye-outline' : 'eye-off-outline'} label={event.hidden ? 'Make Visible' : 'Hide Event'} onPress={() => onToggleVisibility(event)} /> : null}
                  {onTransfer ? <ActionButton icon="account-switch-outline" label="Transfer" variant="primary" onPress={() => onTransfer(event)} /> : null}
                  {onRemoveLiveStale ? <ActionButton icon="broadcast-off" label="Remove Live Stale" variant="danger" onPress={() => onRemoveLiveStale(event)} /> : null}
                  <ActionButton icon="share-variant-outline" label="Share" variant="share" onPress={() => setShareOpen(true)} />
                  <ActionButton icon="map-marker-path" label="Directions" variant="primary" onPress={openDirections} disabled={isGuest || !fullAddress} />
                  <ActionButton icon="email-outline" label="Contact Host" disabled={!canConnectHost} onPress={() => { setHostMessageStatus(''); setHostMessageOpen(true); }} />
                  {!isGuest && event.isLive && hasPlayableLiveUrl && event.liveAppVisibility !== 'private' && !(canManageStream && onManageStream) ? <ActionButton iconNode={<FontAwesome name="youtube-play" size={22} color="#dc2626" />} label="Watch on YouTube" variant="danger" onPress={openLiveVideo} /> : null}
                  {canManageStream && onManageStream ? (
                    <ActionButton
                      icon={event.isLive && hasPlayableLiveUrl ? undefined : 'broadcast'}
                      iconNode={event.isLive && hasPlayableLiveUrl ? <FontAwesome name="youtube-play" size={22} color="#ffffff" /> : undefined}
                      label={event.isLive && hasPlayableLiveUrl ? 'Watch on YouTube' : event.isLive ? 'Manage Live' : 'Go Live'}
                      variant="live"
                      onPress={event.isLive && hasPlayableLiveUrl ? openLiveVideo : () => onManageStream(event)}
                    />
                  ) : null}
                  <ActionButton icon={reminder ? 'bell-check-outline' : 'alarm'} label={reminder ? 'Reminder Set' : 'Reminder'} onPress={() => { setReminderError(''); setReminderOpen(true); }} disabled={isGuest} />
                  <ActionButton icon="calendar-sync-outline" label="Sync Calendar" variant="primary" onPress={addToCalendar} disabled={isGuest} />
                  {onNiazArrangement ? <ActionButton icon="bowl-mix-outline" label="Niaz Arrangement" variant="share" onPress={() => onNiazArrangement(event)} /> : null}
                  <ActionButton icon="pencil-outline" label="Edit" disabled={!onEdit} onPress={() => onEdit?.(event)} />
                  {isSeriesEvent ? <ActionButton icon="folder-edit-outline" label="Edit Series" disabled={!onEditSeries} onPress={() => onEditSeries?.(event)} /> : null}
                  <ActionButton icon="content-copy" label="Copy" disabled={!onCopy} onPress={() => onCopy?.(event)} />
                  <ActionButton icon="trash-can-outline" label="Delete" variant="danger" disabled={!onDelete} onPress={() => onDelete?.(event)} />
                  {isSeriesEvent ? <ActionButton icon="delete-sweep-outline" label="Delete Series" variant="danger" disabled={!onDeleteSeries} onPress={() => onDeleteSeries?.(event)} /> : null}
                </View>

                <Text style={styles.date}>{formatEventDate(event.eventDate)}</Text>

                {canSharePoster ? (
                  <Pressable onPress={() => setPosterOpen(true)} style={styles.posterFrame}>
                    <Image source={{ uri: posterUri }} style={styles.poster} resizeMode="cover" />
                    <View style={styles.posterHint}>
                      <Text style={styles.posterHintText}>Tap poster to view full screen</Text>
                    </View>
                  </Pressable>
                ) : null}

                <View style={styles.detailsPanel}>
                  <DetailRow icon="ticket-confirmation-outline" label="Event" value={displayType} />
                  <DetailRow icon="home-outline" label="Host" value={host} />
                  <DetailRow icon="clock-outline" label="Time" value={`${event.prayerLabel ? `${event.prayerLabel} ` : ''}${formatEventTime(event.startTime, event.endTime)}`} />
                  <DetailRow icon="map-marker-outline" label={isGuest ? 'Suburb' : 'Location'} value={location || 'Location TBC'} />
                  <DetailRow icon="account-group-outline" label="Audience" value={audience} />
                  <DetailRow icon="moon-waning-crescent" label="Hijri date" value={hijriDate} />
                  <DetailRow icon="microphone-outline" label="Speaker" value={event.speakerName} />
                  <DetailRow icon="account-voice" label="Reciters" value={formatReciters(event.reciters)} />
                </View>

                {event.notes?.trim() ? (
                  <View style={styles.notesBox}>
                    <Text style={styles.notesLabel}>{'\uD83D\uDCDD'} Notes</Text>
                    <Text style={styles.notes}>{event.notes.trim()}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.privacyNote}>
                {isGuest ? 'Public view shows suburb-level location only. ' : ''}Verify event details with the host.
              </Text>
            </ScrollView>
          </Animated.View>

          {shareOpen ? <View style={styles.inlineOverlayLayer}>
            <View style={styles.overlayRoot}>
          <Pressable style={styles.overlayBackdrop} onPress={() => setShareOpen(false)} />
          <View style={styles.overlayCard}>
            <Text style={styles.overlayTitle}>Share Event</Text>
            <Text style={styles.overlaySubtitle}>Choose how you want to share this event.</Text>
            <View style={styles.shareOptions}>
              <ActionButton style={styles.shareAction} icon="image-outline" label={sharingPoster ? 'Preparing Poster…' : 'Share with Poster'} variant="share" onPress={shareWithPoster} disabled={!canSharePoster || sharingPoster} />
              <ActionButton style={styles.shareAction} icon="send-outline" label="Share Text Only" onPress={shareTextOnly} />
              <ActionButton style={styles.shareAction} icon="content-copy" label="Copy Text" onPress={copyShareText} />
            </View>
            <Pressable onPress={() => setShareOpen(false)} style={({ pressed }) => [styles.overlayClose, pressed && styles.pressed]}>
              <Text style={styles.overlayCloseText}>Cancel</Text>
            </Pressable>
          </View>
            </View>
          </View> : null}

          {hostMessageOpen ? <View style={styles.inlineOverlayLayer}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.overlayRoot}
            >
          <Pressable style={styles.overlayBackdrop} onPress={() => setHostMessageOpen(false)} />
          <View style={styles.overlayCard}>
            <Text style={styles.overlayTitle}>Contact Host</Text>
            <Text style={styles.overlaySubtitle}>Message about {getEventTitle(event)}</Text>
            <TextInput
              multiline
              maxLength={2000}
              onChangeText={value => {
                setHostMessageText(value);
                setHostMessageStatus('');
              }}
              placeholder="Write your message to the host…"
              placeholderTextColor={colors.muted}
              style={styles.messageInput}
              textAlignVertical="top"
              value={hostMessageText}
            />
            {hostMessageStatus ? <Text style={styles.messageStatus}>{hostMessageStatus}</Text> : null}
            <Pressable
              disabled={!hostMessageText.trim() || hostMessageSending}
              onPress={sendMessageToHost}
              style={({ pressed }) => [styles.messageSend, pressed && styles.pressed, (!hostMessageText.trim() || hostMessageSending) && styles.disabled]}
            >
              <Text style={styles.messageSendText}>{hostMessageSending ? 'Sending…' : 'Send Message'}</Text>
            </Pressable>
            <Pressable onPress={() => setHostMessageOpen(false)} style={({ pressed }) => [styles.overlayClose, pressed && styles.pressed]}>
              <Text style={styles.overlayCloseText}>{hostMessageStatus.startsWith('Message sent') ? 'Done' : 'Cancel'}</Text>
            </Pressable>
          </View>
              </KeyboardAvoidingView>
          </View> : null}

          {reminderOpen ? <View style={styles.inlineOverlayLayer}>
            <View style={styles.overlayRoot}>
          <Pressable style={styles.overlayBackdrop} onPress={() => setReminderOpen(false)} />
          <View style={styles.overlayCard}>
            <Text style={styles.overlayTitle}>Event Reminder</Text>
            <Text style={styles.overlaySubtitle}>Choose when this phone should remind you about {getEventTitle(event)}.</Text>
            <View style={styles.reminderOptions}>
              {REMINDER_OPTIONS.map(option => (
                <Pressable
                  disabled={reminderBusy}
                  key={option.value}
                  onPress={() => setEventReminder(option.value)}
                  style={({ pressed }) => [
                    styles.reminderOption,
                    reminder?.minutesBefore === option.value && styles.reminderOptionActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.reminderOptionIcon}>{reminder?.minutesBefore === option.value ? '🔔' : '○'}</Text>
                  <Text style={[styles.reminderOptionText, reminder?.minutesBefore === option.value && styles.reminderOptionTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            {reminderError ? <Text style={styles.reminderError}>{reminderError}</Text> : null}
            {reminder ? (
              <Pressable disabled={reminderBusy} onPress={removeEventReminder} style={styles.removeReminderButton}>
                <Text style={styles.removeReminderText}>{reminderBusy ? 'Please wait…' : 'Remove Reminder'}</Text>
              </Pressable>
            ) : null}
            <Pressable disabled={reminderBusy} onPress={() => setReminderOpen(false)} style={({ pressed }) => [styles.overlayClose, pressed && styles.pressed]}>
              <Text style={styles.overlayCloseText}>Cancel</Text>
            </Pressable>
          </View>
            </View>
          </View> : null}

          {posterOpen ? <View style={styles.inlineOverlayLayer}>
            <View style={styles.posterModalRoot}>
          <Pressable style={styles.posterBackdrop} onPress={() => setPosterOpen(false)} />
          <Pressable style={styles.posterModalContent} onPress={() => setPosterOpen(false)}>
            {canSharePoster ? <Image source={{ uri: posterUri }} style={styles.posterFullscreen} resizeMode="contain" /> : null}
          </Pressable>
            </View>
          </View> : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.36)',
  },
  inlineOverlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  sheetHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 58,
    height: 6,
    borderRadius: 3,
    marginBottom: spacing.sm,
    backgroundColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerCopy: { flex: 1 },
  headerTitle: {
    color: colors.navy,
    fontSize: 19,
    fontWeight: '700',
  },
  headerHint: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.tealSoft,
  },
  closeText: {
    color: colors.tealDark,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '700',
  },
  content: {
    padding: spacing.md,
    paddingBottom: 46,
  },
  posterFrame: {
    width: '100%',
    height: 132,
    borderRadius: radius.lg,
    backgroundColor: '#eff5f4',
    overflow: 'hidden',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 6,
    backgroundColor: 'rgba(7, 23, 51, 0.62)',
  },
  posterHintText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    ...shadow,
  },
  titlePanel: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderLeftWidth: 4,
    borderLeftColor: colors.teal,
    borderRadius: radius.md,
    backgroundColor: '#edf8f6',
  },
  title: {
    color: colors.navy,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    letterSpacing: 0.35,
  },
  date: {
    color: colors.teal,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    rowGap: 7,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  actionButton: {
    width: '20%',
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  actionIconBubble: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#eef2f7' },
  actionIconBubbleShare: { backgroundColor: '#dcfce7' },
  actionIconBubblePrimary: { backgroundColor: '#dbeafe' },
  actionIconBubbleDanger: { backgroundColor: '#fee2e2' },
  actionIconBubbleLive: {
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  actionIcon: { fontSize: 20 },
  actionLabel: {
    color: colors.text,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionLabelDanger: {
    color: colors.danger,
  },
  actionLabelLive: { color: '#b91c1c' },
  detailsPanel: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailIconCircle: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.tealSoft },
  detailIcon: { fontSize: 16 },
  detailValue: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  notesLabel: { color: colors.tealDark, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  notesBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
  },
  notes: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  privacyNote: {
    color: colors.muted,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  overlayRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(15, 23, 42, 0.46)',
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayCard: {
    width: '100%',
    maxWidth: 420,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow,
  },
  overlayTitle: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  overlaySubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  shareOptions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  shareAction: {
    flex: 1,
    width: 0,
    minWidth: 0,
  },
  overlayClose: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
    marginTop: spacing.md,
  },
  overlayCloseText: {
    color: colors.tealDark,
    fontSize: 14,
    fontWeight: '700',
  },
  messageInput: {
    minHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 15,
  },
  messageStatus: {
    color: colors.tealDark,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  messageSend: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.teal,
    marginTop: spacing.md,
  },
  messageSendText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  reminderOptions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  reminderOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  reminderOptionActive: {
    borderColor: colors.teal,
    backgroundColor: colors.tealSoft,
  },
  reminderOptionIcon: {
    width: 26,
    fontSize: 17,
    textAlign: 'center',
  },
  reminderOptionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  reminderOptionTextActive: {
    color: colors.tealDark,
  },
  reminderError: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  removeReminderButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#fee2e2',
  },
  removeReminderText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  posterModalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  posterBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  posterModalContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  posterFullscreen: {
    width: '100%',
    height: '100%',
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.45,
  },
});
