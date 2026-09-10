import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, radius, shadow, spacing } from '../theme';
import { cityLabel, normalizeCity } from '../utils/cities';

const EVENT_ITEMS = [
  { key: 'profile', label: 'My Profile', icon: 'account-outline', tone: 'purple', authOnly: true },
  { key: 'notifications', label: 'Notifications', icon: 'bell-outline', tone: 'teal', authOnly: true },
  { key: 'inbox', label: 'Inbox & Feedback', icon: 'inbox-outline', tone: 'purple', authOnly: true },
  { key: 'admin', label: 'Admin Dashboard', icon: 'shield-crown-outline', tone: 'blue', adminOnly: true },
  { key: 'help-policies', route: 'profile', label: 'Help & Policies', icon: 'help-circle-outline', tone: 'teal' },
  { key: 'share-app', label: 'Share App', icon: 'share-variant-outline', tone: 'amber' },
];

const BUSINESS_ITEMS = [
  { key: 'profile', label: 'My Profile', icon: 'account-outline', tone: 'purple', authOnly: true },
  { key: 'business-notifications', label: 'Notifications', icon: 'bell-outline', tone: 'teal', authOnly: true },
  { key: 'business-inbox', label: 'Inbox & Feedback', icon: 'inbox-outline', tone: 'purple', authOnly: true },
  { key: 'business-admin', label: 'Admin Dashboard', icon: 'shield-crown-outline', tone: 'blue', adminOnly: true },
  { key: 'help-policies', route: 'profile', label: 'Help & Policies', icon: 'help-circle-outline', tone: 'teal' },
  { key: 'share-app', label: 'Share App', icon: 'share-variant-outline', tone: 'amber' },
];

const TONES = {
  blue: [colors.blueSoft, colors.blue],
  purple: [colors.purpleSoft, colors.purple],
  teal: [colors.tealSoft, colors.tealDark],
  rose: [colors.roseSoft, colors.rose],
  amber: [colors.amberSoft, colors.amber],
};

export function userInitials(user, profile) {
  const name = String(profile?.fullName || user?.displayName || '').trim();
  if (name) return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const email = String(user?.email || '').trim();
  if (email) return email.slice(0, 2).toUpperCase();
  const phone = String(user?.phoneNumber || '').replace(/\D/g, '');
  return phone ? phone.slice(-2) : 'U';
}

export default function AccountMenuSheet({ visible, activeModule = 'events', isGuest = false, user, profile, authBusy = false, onClose, onNavigate, onSignOut }) {
  const { height: screenHeight } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const closeRef = useRef(onClose);
  const afterCloseRef = useRef(null);
  const closingRef = useRef(false);
  const scrollOffsetRef = useRef(0);
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superAdmin';
  const displayName = profile?.fullName || user?.displayName || user?.email || 'Community member';
  const role = profile?.role === 'superAdmin' ? 'Super Admin' : profile?.role === 'admin' ? 'Admin' : isGuest ? 'Guest access' : 'Member';
  const roleScope = profile?.role === 'superAdmin'
    ? 'All cities'
    : profile?.role === 'admin'
      ? cityLabel(normalizeCity(profile?.adminCity || profile?.defaultCity))
      : '';
  const items = useMemo(() => (activeModule === 'directory' ? BUSINESS_ITEMS : EVENT_ITEMS)
    .filter(item => (!item.adminOnly || isAdmin) && (!item.authOnly || !isGuest)), [activeModule, isAdmin, isGuest]);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    afterCloseRef.current = null;
    scrollOffsetRef.current = 0;
    translateY.setValue(Math.max(620, screenHeight));
    Animated.spring(translateY, {
      toValue: 0,
      damping: 25,
      stiffness: 230,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [screenHeight, translateY, visible]);

  const restoreSheet = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      damping: 26,
      stiffness: 240,
      mass: 0.85,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const requestClose = useCallback(afterClose => {
    if (closingRef.current) return;
    closingRef.current = true;
    afterCloseRef.current = typeof afterClose === 'function' ? afterClose : null;
    Animated.timing(translateY, {
      toValue: Math.max(700, screenHeight),
      duration: 245,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      const callback = afterCloseRef.current;
      afterCloseRef.current = null;
      closeRef.current?.();
      callback?.();
    });
  }, [screenHeight, translateY]);

  const releaseDrag = useCallback(gesture => {
    const projectedDistance = Math.max(0, gesture.dy) + Math.max(0, gesture.vy) * 120;
    if (gesture.dy > 64 || gesture.vy > 0.5 || projectedDistance > 92) {
      requestClose();
      return;
    }
    restoreSheet();
  }, [requestClose, restoreSheet]);

  // Keep the drag recogniser on the sheet's dedicated header.  Competing with
  // the ScrollView at the sheet root made a normal downward swipe unreliable.
  const dragResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => (
      gesture.dy > 3
      && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.15
    ),
    onPanResponderGrant: () => translateY.stopAnimation(),
    onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => releaseDrag(gesture),
    onPanResponderTerminate: restoreSheet,
    onPanResponderTerminationRequest: () => false,
  }), [releaseDrag, restoreSheet, translateY]);

  if (!visible) return null;
  const navigate = key => requestClose(() => onNavigate?.(key));

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <Pressable accessibilityLabel="Close menu" onPress={() => requestClose()} style={styles.backdrop} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.dragZone} {...dragResponder.panHandlers}>
          <View style={styles.handle} />
          <View style={styles.headingRow}>
          <View><Text style={styles.title}>Menu</Text><Text style={styles.subtitle}>Account, services and app settings</Text></View>
          <Pressable accessibilityLabel="Close menu" onPress={() => requestClose()} style={styles.close}><MaterialCommunityIcons color={colors.blue} name="close" size={24} /></Pressable>
          </View>
        </View>
        <View style={styles.identity}>
          <View style={styles.initials}><Text style={styles.initialsText}>{isGuest ? 'G' : userInitials(user, profile)}</Text></View>
          <View style={styles.identityCopy}><Text numberOfLines={1} style={styles.name}>{isGuest ? 'Guest User' : displayName}</Text><Text style={styles.role}>{[role, roleScope].filter(Boolean).join(' · ')}</Text></View>
        </View>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.list}
          directionalLockEnabled
          onScroll={event => { scrollOffsetRef.current = Math.max(0, event.nativeEvent.contentOffset.y); }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {items.map(item => {
            const [backgroundColor, color] = TONES[item.tone] || TONES.blue;
            return (
              <Pressable key={item.key} disabled={item.disabled} onPress={() => navigate(item.route || item.key)} style={({ pressed }) => [styles.item, item.disabled && styles.disabled, pressed && styles.pressed]}>
                <View style={[styles.itemIcon, { backgroundColor }]}><MaterialCommunityIcons color={color} name={item.icon} size={21} /></View>
                <Text style={styles.itemText}>{item.label}</Text>
                {!item.disabled ? <MaterialCommunityIcons color="#9aa6b5" name="chevron-right" size={22} /> : null}
              </Pressable>
            );
          })}
          {isGuest ? (
            <Pressable onPress={() => navigate('login')} style={[styles.action, styles.login]}><MaterialCommunityIcons color="#fff" name="login" size={20} /><Text style={styles.actionText}>Login / Create Account</Text></Pressable>
          ) : (
            <Pressable disabled={authBusy} onPress={() => requestClose(() => onSignOut?.())} style={[styles.action, styles.logout, authBusy && styles.disabled]}>
              {authBusy ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons color="#fff" name="power" size={22} />}<Text style={styles.actionText}>{authBusy ? 'Signing out…' : 'Log out'}</Text>
            </Pressable>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 80, elevation: 80, justifyContent: 'flex-end', paddingBottom: 72 },
  backdrop: { ...StyleSheet.absoluteFillObject, bottom: 72, backgroundColor: 'rgba(15,23,42,0.46)' },
  sheet: { maxHeight: '72%', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.glassBorder, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: 'rgba(250,252,252,0.97)', ...shadow },
  dragZone: { paddingTop: spacing.xs, paddingBottom: spacing.xs },
  handle: { alignSelf: 'center', width: 54, height: 5, borderRadius: 3, backgroundColor: '#d5dce6', marginBottom: spacing.sm },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.navy, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { color: colors.muted, fontSize: 11, fontWeight: '500', marginTop: 2 },
  close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.blueSoft, borderWidth: 1, borderColor: '#cbdcff' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: '#d8e2ff', backgroundColor: '#f2f4ff' },
  initials: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.purple },
  initialsText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  identityCopy: { flex: 1, minWidth: 0 },
  name: { color: colors.navy, fontSize: 15, fontWeight: '700' },
  role: { color: colors.muted, fontSize: 11, marginTop: 3 },
  list: { gap: 7, paddingVertical: spacing.md, paddingBottom: spacing.lg },
  item: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, borderRadius: 18, borderWidth: 1, borderColor: '#edf0f5', backgroundColor: '#fff' },
  itemIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
  action: { minHeight: 51, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: 18, marginTop: spacing.xs },
  login: { backgroundColor: colors.blue },
  logout: { backgroundColor: '#dc2626' },
  actionText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.76 },
});
