// Preserve the existing renderer on iOS and web. Metro selects .android.js on Android.
import React from 'react';
import { Image } from 'react-native';

export default function OptimizedImage({ fullResolution, ...props }) {
  return <Image {...props} />;
}
