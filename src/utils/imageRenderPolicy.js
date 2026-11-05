export function imageRenderPolicy(source, resizeMode = 'cover', fullResolution = false) {
  const uri = typeof source === 'string' ? source : source?.uri;
  const publicRemote = /^https?:\/\//i.test(uri || '') && !source?.headers;
  return {
    cachePolicy: publicRemote ? 'disk' : 'none',
    contentFit: ({ stretch: 'fill', center: 'none' })[resizeMode] || resizeMode,
    allowDownscaling: !fullResolution,
    // Keep alpha and poster text quality. Avoid RGB_565's reduced color precision.
    decodeFormat: 'argb',
    transition: 0,
  };
}
