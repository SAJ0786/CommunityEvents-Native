import React from 'react';
import { View } from 'react-native';

export default function DrawerDragZone({ panHandlers, style, children }) {
  return (
    <View collapsable={false} {...panHandlers} style={style}>
      {children}
    </View>
  );
}
