const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const androidCertificateSha1 = process.env.ANDROID_CERT_SHA1
  || '5E8F16062EA3CD2C4A0D547876BAA6F38CABF625';
const releaseMode = process.env.APP_RELEASE_MODE || '';
const isBundledRelease = process.env.NODE_ENV === 'production';

if ((isBundledRelease || releaseMode === 'tester' || releaseMode === 'production') && !mapsApiKey) {
  throw new Error('GOOGLE_MAPS_API_KEY is required for tester and production builds. Refusing to create an APK with broken maps or address autocomplete.');
}

export default ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    ['react-native-share', { android: [], ios: [] }],
  ],
  android: {
    ...config.android,
    ...(mapsApiKey ? {
      config: {
        ...(config.android?.config || {}),
        googleMaps: {
          apiKey: mapsApiKey,
        },
      },
    } : {}),
  },
  extra: {
    ...(config.extra || {}),
    googlePlacesApiKey: mapsApiKey,
    androidCertificateSha1,
    testBuild: releaseMode !== 'production',
    eas: {
      projectId: 'b05d73eb-a069-4503-be44-ceb149f4a4fe',
    },
  },
});
