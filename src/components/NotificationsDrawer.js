import React, { useEffect } from 'react';
import { Animated, BackHandler, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import BusinessNotificationsScreen from '../business/BusinessNotificationsScreen';
import useMenuDrawerMotion from './useMenuDrawerMotion';
import DrawerDragZone from './DrawerDragZone';
import { colors } from '../theme';

export default function NotificationsDrawer({ visible, onClose, user, profile }) {
  const { translateY, requestClose, panHandlers } = useMenuDrawerMotion({ visible, onClose });
  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestClose();
      return true;
    });
    return () => subscription.remove();
  }, [requestClose, visible]);

  if (!visible) return null;

  return (
      <SafeAreaView accessibilityViewIsModal={true} pointerEvents="box-none" style={styles.layer}>
        <Pressable accessibilityLabel="Close notifications" style={StyleSheet.absoluteFillObject} onPress={requestClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <BusinessNotificationsScreen key={user?.uid || 'guest'} user={user} profile={profile} onBack={requestClose}
            renderHeader={header => (
              <DrawerDragZone panHandlers={panHandlers} style={styles.dragZone}>
                <View style={styles.handle} />
                {header}
              </DrawerDragZone>
            )}
          />
        </Animated.View>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.46)', zIndex: 1000, elevation: 1000 },
  sheet: { height: '85%', backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  dragZone: { minHeight: 78, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 8, justifyContent: 'center' },
  handle: { alignSelf: 'center', width: 54, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 8 },
});
