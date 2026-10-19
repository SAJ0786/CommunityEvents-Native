import * as Location from 'expo-location';

const coordinatePair = position => {
  const latitude = Number(position?.coords?.latitude);
  const longitude = Number(position?.coords?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
};

const locationError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

async function currentPosition(options, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync(options),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(locationError('LOCATION_TIMEOUT', 'Location timed out.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getNearbyPosition() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw locationError('LOCATION_PERMISSION_DENIED', 'Location permission is off.');
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!servicesEnabled) {
    throw locationError('LOCATION_SERVICES_DISABLED', 'Location services are off.');
  }

  const recent = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);
  const recentCoordinates = coordinatePair(recent);
  if (recentCoordinates) return recentCoordinates;

  const balanced = await currentPosition({ accuracy: Location.Accuracy.Balanced }, 12000).catch(() => null);
  const balancedCoordinates = coordinatePair(balanced);
  if (balancedCoordinates) return balancedCoordinates;

  const fallback = await currentPosition({ accuracy: Location.Accuracy.Low }, 8000).catch(() => null);
  const fallbackCoordinates = coordinatePair(fallback);
  if (fallbackCoordinates) return fallbackCoordinates;

  throw locationError('LOCATION_UNAVAILABLE', 'Location is unavailable.');
}

export function nearbyLocationMessage(error) {
  if (error?.code === 'LOCATION_PERMISSION_DENIED') {
    return 'Allow location access for Community Connect Australia, then try again.';
  }
  if (error?.code === 'LOCATION_SERVICES_DISABLED') {
    return 'Turn on Location on your phone, then try again.';
  }
  return 'We could not find your location. Move to an open area and try again.';
}
