import React from 'react';
import { Animated, Modal, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import BusinessNotificationsScreen from '../business/BusinessNotificationsScreen';
import useMenuDrawerMotion from './useMenuDrawerMotion';
import DrawerDragZone from './DrawerDragZone';
import { colors } from '../theme';

export default function NotificationsDrawer({ visible, onClose, user, profile }) {
  const { translateY, requestClose, panHandlers } = useMenuDrawerMotion({ visible, onClose });
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={requestClose}>
      <SafeAreaView style={styles.layer}>
        <Pressable accessibilityLabel="Close notifications" style={StyleSheet.absoluteFillObject} onPress={requestClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          {visible ? <BusinessNotificationsScreen key={user?.uid || 'guest'} user={user} profile={profile} onBack={requestClose}
            renderHeader={header => (
              <DrawerDragZone panHandlers={panHandlers} style={styles.dragZone}>
                <View style={styles.handle} />
                {header}
              </DrawerDragZone>
            )}
          /> : null}
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.46)' },
  sheet: { height: '85%', backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  dragZone: { paddingTop: 10, paddingHorizontal: 12, paddingBottom: 8 },
  handle: { alignSelf: 'center', width: 54, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 8 },
});
