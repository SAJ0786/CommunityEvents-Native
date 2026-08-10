const config = {
  name: 'Community Events Australia',
  slug: 'community-events-australia-native',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/logo.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/logo.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    bundleIdentifier: 'info.siza.communityevents',
    supportsTablet: true,
  },
  android: {
    package: 'info.siza.communityevents.app',
    adaptiveIcon: {
      foregroundImage: './assets/logo.png',
      backgroundColor: '#ffffff',
    },
  },
  extra: {
    eas: {
      projectId: 'b05d73eb-a069-4503-be44-ceb149f4a4fe',
    },
    firebaseProjectId: 'community-event-8b639',
  },
  plugins: ['expo-build-properties', '@react-native-firebase/app', '@react-native-firebase/auth'],
};

if (process.env.GOOGLE_SERVICES_JSON) {
  config.android.googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
}

if (process.env.GOOGLE_SERVICES_INFO_PLIST) {
  config.ios.googleServicesFile = process.env.GOOGLE_SERVICES_INFO_PLIST;
}

export default config;
