import React, { useMemo, useRef } from 'react';
import { Image } from 'expo-image';
import { imageRenderPolicy } from '../utils/imageRenderPolicy';

// Glide sizes decodes to the measured view. Cache encoded public images on disk,
// without retaining an additional decoded-memory cache. Private Base64 and local
// upload previews are never persisted by this renderer.
export default function OptimizedImage({ source, resizeMode = 'cover', fullResolution = false, ...props }) {
  const generation = useRef(0);
  const identity = typeof source === 'object' ? source?.uri : source;
  // A short per-view key avoids sending private Base64 over the bridge twice.
  const recyclingKey = useMemo(() => String(++generation.current), [identity]);
  return <Image {...props} source={source}
    recyclingKey={recyclingKey}
    {...imageRenderPolicy(source, resizeMode, fullResolution)} />;
}
