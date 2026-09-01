const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const androidCertificateSha1 = process.env.ANDROID_CERT_SHA1
  || '5E8F16062EA3CD2C4A0D547876BAA6F38CABF625';
const iosBundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER || '';
const iosGoogleServicesFile = process.env.IOS_GOOGLE_SERVICES_FILE || '';
const releaseMode = process.env.APP_RELEASE_MODE || '';
const isBundledRelease = process.env.NODE_ENV === 'production';
// EAS CLI resolves the config once locally before it loads the selected EAS
// environment. Permit only that metadata pass; the cloud runner re-evaluates
// this file with EAS_BUILD=true and must have the real protected Maps key.
const isEasLocalMetadataPass = process.env.EXPO_NO_DOTENV === '1'
  && process.env.EAS_BUILD !== 'true';

if ((isBundledRelease || releaseMode === 'tester' || releaseMode === 'production')
    && !mapsApiKey
    && !isEasLocalMetadataPass) {
  throw new Error('GOOGLE_MAPS_API_KEY is required for tester and production builds. Refusing to create an APK with broken maps or address autocomplete.');
}

export default ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    'expo-asset',
    'expo-audio',
    ['react-native-share', { android: [], ios: [] }],
  ],
  android: {
    ...config.android,
    ...(mapsApiKey ? {
      config: {
        ...(config.android?.config || {}),
        googleMaps: {
          // Keep generated native source free of plaintext credentials. Gradle
          // substitutes this placeholder from GOOGLE_MAPS_API_KEY at build time.
          apiKey: '${GOOGLE_MAPS_API_KEY}',
        },
      },
    } : {}),
  },
  ios: {
    ...config.ios,
    ...(iosBundleIdentifier ? { bundleIdentifier: iosBundleIdentifier } : {}),
    ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
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
