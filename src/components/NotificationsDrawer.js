import React, { useMemo, useRef } from 'react';
import { Animated, Modal, PanResponder, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import BusinessNotificationsScreen from '../business/BusinessNotificationsScreen';
import { colors } from '../theme';

export default function NotificationsDrawer({ visible, onClose, user, profile }) {
  const offset = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const drag = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 3 && gesture.dy > Math.abs(gesture.dx) * 1.15,
    onPanResponderMove: (_, gesture) => offset.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 64 || gesture.vy > 0.5) closeRef.current?.();
      Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start(),
  }), [offset]);
  return (
    <Modal transparent visible={visible} animationType="slide" onShow={() => offset.setValue(0)} onRequestClose={onClose}>
      <SafeAreaView style={styles.layer}>
        <Pressable accessibilityLabel="Close notifications" style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: offset }] }]}>
          <View {...drag.panHandlers} style={styles.handleArea}>
            <View style={styles.handle} />
            <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
          </View>
          {visible ? <BusinessNotificationsScreen key={user?.uid || 'guest'} user={user} profile={profile} onBack={onClose} /> : null}
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.46)' },
  sheet: { height: '85%', backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  handleArea: { height: 48, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border },
  close: { position: 'absolute', right: 12, top: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 28, color: colors.navy },
});
