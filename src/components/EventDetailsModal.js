import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
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
import NativeShare from 'react-native-share';
import { colors, radius, shadow, spacing } from '../theme';
import { formatEventDate, formatEventTime } from '../utils/formatters';
import { buildEventShareMessage } from '../utils/eventShare';
import { getEventSuburb, getEventTitle } from '../services/events';
import { openEventInDeviceCalendar } from '../services/calendar';
import { getImmediatePosterSource, resolvePosterSource } from '../services/images';
import { getEventHostUid, sendHostMessage } from '../services/messaging';

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{String(value)}</Text>
    </View>
  );
}

function ActionButton({ label, icon, variant = 'subtle', onPress, disabled = false }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        variant === 'share' && styles.actionButtonShare,
        variant === 'primary' && styles.actionButtonPrimary,
        variant === 'danger' && styles.actionButtonDanger,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[
        styles.actionIcon,
        variant === 'primary' && styles.actionIconPrimary,
        variant === 'danger' && styles.actionIconDanger,
      ]}
      >
        {icon}
      </Text>
      <Text style={[
        styles.actionLabel,
        variant === 'primary' && styles.actionLabelPrimary,
        variant === 'danger' && styles.actionLabelDanger,
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
  onEdit,
  onDelete,
  onCopy,
  onEditSeries,
  onDeleteSeries,
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  const scrollOffsetRef = useRef(0);
  const [posterUri, setPosterUri] = useState('');
  const [posterOpen, setPosterOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharingPoster, setSharingPoster] = useState(false);
  const [hostMessageOpen, setHostMessageOpen] = useState(false);
  const [hostMessageText, setHostMessageText] = useState('');
  const [hostMessageStatus, setHostMessageStatus] = useState('');
  const [hostMessageSending, setHostMessageSending] = useState(false);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(0);
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
      return () => { alive = false; };
    }

    setPosterUri(getImmediatePosterSource(event));

    resolvePosterSource(event)
      .then(value => {
        if (alive && value) setPosterUri(value);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [event]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => (
      scrollOffsetRef.current <= 0
      && gesture.dy > 12
      && Math.abs(gesture.dy) > Math.abs(gesture.dx)
    ),
    onPanResponderMove: (_, gesture) => {
      translateY.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 110 || gesture.vy > 1) {
        Animated.timing(translateY, {
          toValue: 900,
          duration: 180,
          useNativeDriver: true,
        }).start(() => {
          translateY.setValue(0);
          closeRef.current?.();
        });
        return;
      }
      Animated.spring(translateY, {
        toValue: 0,
        damping: 20,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
    },
  }), [translateY]);

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
  const canConnectHost = !isGuest && user?.uid && (!hostUid || hostUid !== user.uid);

  const shareTextOnly = async () => {
    try {
      await Share.share({ title: getEventTitle(event), message: shareMessage });
      setShareOpen(false);
    } catch {
      Alert.alert('Share event', 'Could not open sharing on this device.');
    }
  };

  const shareWithPoster = async () => {
    if (!canSharePoster || sharingPoster) return;
    setSharingPoster(true);
    try {
      const posterFile = await preparePosterForSharing(posterUri, event.id);
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

  return (
    <>
      <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
        <SafeAreaView style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
            <View style={styles.sheetHeader}>
              <View style={styles.dragHandle} />
              <View style={styles.headerRow}>
                <View style={styles.headerCopy}>
                  <Text style={styles.headerTitle}>Event details</Text>
                  <Text style={styles.headerHint}>Swipe down to close</Text>
                </View>
                <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              onScroll={event => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={16}
            >
              <View style={styles.card}>
                <Text style={styles.title}>{getEventTitle(event)}</Text>

                <View style={styles.actionGrid}>
                  <ActionButton icon="📤" label="Share" variant="share" onPress={() => setShareOpen(true)} />
                  <ActionButton icon="🗺️" label="Directions" variant="primary" onPress={openDirections} disabled={isGuest || !fullAddress} />
                  {canConnectHost ? <ActionButton icon="✉️" label="Connect" onPress={() => { setHostMessageStatus(''); setHostMessageOpen(true); }} /> : null}
                  <ActionButton icon="📅" label="Calendar" onPress={addToCalendar} disabled={isGuest} />
                  {onEdit ? <ActionButton icon="✏️" label="Edit" onPress={() => onEdit(event)} /> : null}
                  {onEditSeries ? <ActionButton icon="🗂️" label="Edit Series" onPress={() => onEditSeries(event)} /> : null}
                  {onCopy ? <ActionButton icon="📋" label="Copy" onPress={() => onCopy(event)} /> : null}
                  {onDelete ? <ActionButton icon="🗑️" label="Delete" variant="danger" onPress={() => onDelete(event)} /> : null}
                  {onDeleteSeries ? <ActionButton icon="🚫" label="Delete Series" variant="danger" onPress={() => onDeleteSeries(event)} /> : null}
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

                <DetailRow label="Event" value={displayType} />
                <DetailRow label="Host" value={host} />
                <DetailRow label="Time" value={`${event.prayerLabel ? `${event.prayerLabel} ` : ''}${formatEventTime(event.startTime, event.endTime)}`} />
                <DetailRow label={isGuest ? 'Suburb' : 'Location'} value={location || 'Location TBC'} />
                <DetailRow label="Audience" value={audience} />
                <DetailRow label="Hijri date" value={hijriDate} />
                <DetailRow label="Speaker" value={event.speakerName} />
                <DetailRow label="Reciters" value={formatReciters(event.reciters)} />

                {event.notes?.trim() ? (
                  <View style={styles.notesBox}>
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={styles.notes}>{event.notes.trim()}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.privacyNote}>
                {isGuest ? 'Public view shows suburb-level location only. ' : ''}Verify event details with the host.
              </Text>
            </ScrollView>
          </Animated.View>
        </SafeAreaView>
      </Modal>

      <Modal transparent visible={shareOpen} animationType="fade" onRequestClose={() => setShareOpen(false)}>
        <View style={styles.overlayRoot}>
          <Pressable style={styles.overlayBackdrop} onPress={() => setShareOpen(false)} />
          <View style={styles.overlayCard}>
            <Text style={styles.overlayTitle}>Share Event</Text>
            <Text style={styles.overlaySubtitle}>Choose how you want to share this event.</Text>
            <View style={styles.shareOptions}>
              <ActionButton icon="🖼️" label={sharingPoster ? 'Preparing Poster…' : 'Share with Poster'} variant="share" onPress={shareWithPoster} disabled={!canSharePoster || sharingPoster} />
              <ActionButton icon="📨" label="Share Text Only" onPress={shareTextOnly} />
              <ActionButton icon="📋" label="Copy Text" onPress={copyShareText} />
            </View>
            <Pressable onPress={() => setShareOpen(false)} style={({ pressed }) => [styles.overlayClose, pressed && styles.pressed]}>
              <Text style={styles.overlayCloseText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={hostMessageOpen} animationType="fade" onRequestClose={() => setHostMessageOpen(false)}>
        <View style={styles.overlayRoot}>
          <Pressable style={styles.overlayBackdrop} onPress={() => setHostMessageOpen(false)} />
          <View style={styles.overlayCard}>
            <Text style={styles.overlayTitle}>Connect to Host</Text>
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
        </View>
      </Modal>

      <Modal transparent visible={posterOpen} animationType="fade" onRequestClose={() => setPosterOpen(false)}>
        <View style={styles.posterModalRoot}>
          <Pressable style={styles.posterBackdrop} onPress={() => setPosterOpen(false)} />
          <Pressable style={styles.posterModalContent} onPress={() => setPosterOpen(false)}>
            {canSharePoster ? <Image source={{ uri: posterUri }} style={styles.posterFullscreen} resizeMode="contain" /> : null}
          </Pressable>
        </View>
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    maxHeight: '88%',
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
    width: 44,
    height: 5,
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
    fontWeight: '900',
  },
  headerHint: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  closeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
  },
  closeText: {
    color: colors.tealDark,
    fontSize: 14,
    fontWeight: '900',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 46,
  },
  posterFrame: {
    width: '100%',
    height: 160,
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
    fontWeight: '800',
    textAlign: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    ...shadow,
  },
  title: {
    color: colors.navy,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
  },
  date: {
    color: colors.teal,
    fontSize: 15,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  actionButton: {
    minWidth: 134,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  actionButtonShare: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  actionButtonPrimary: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  actionButtonDanger: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  actionIcon: {
    fontSize: 15,
  },
  actionIconPrimary: {
    color: colors.surface,
  },
  actionIconDanger: {
    color: colors.danger,
  },
  actionLabel: {
    color: colors.tealDark,
    fontSize: 13,
    fontWeight: '900',
  },
  actionLabelPrimary: {
    color: colors.surface,
  },
  actionLabelDanger: {
    color: colors.danger,
  },
  detailRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
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
    fontWeight: '900',
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
    gap: spacing.sm,
    marginTop: spacing.lg,
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
    fontWeight: '900',
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
    fontWeight: '800',
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
    fontWeight: '900',
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
