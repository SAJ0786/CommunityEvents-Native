const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

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
    eas: {
      projectId: 'b05d73eb-a069-4503-be44-ceb149f4a4fe',
    },
  },
});
