// Transport-safe private venue contract. This is never part of publicEvent().
export function normalisePrivateVenue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const text = (key, limit, required = false) => {
    const field = value[key];
    if (field == null && !required) return '';
    return typeof field === 'string' && field.length <= limit && (!required || field.trim()) ? field.trim() : null;
  };
  const fullAddress = text('fullAddress', 500, true);
  const suburb = text('suburb', 100, true);
  const state = text('state', 3, true);
  const postcode = text('postcode', 4);
  const placeId = text('placeId', 300);
  const latitude = value.latitude; const longitude = value.longitude;
  if (!fullAddress || !suburb || /[\d\r\n,/:]/u.test(suburb) || !['NSW', 'VIC', 'ACT', 'QLD', 'SA', 'TAS', 'WA', 'NT'].includes(state)
    || postcode === null || (postcode && !/^\d{4}$/.test(postcode)) || placeId === null
    || typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -45 || latitude > -9
    || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < 110 || longitude > 155) return null;
  return { fullAddress, suburb, state, postcode, placeId, latitude, longitude };
}

// Only pass privateDetails returned by the authorised callable, never a public event.
export function privateVenueLinks(privateDetails, platform = 'web') {
  const venue = normalisePrivateVenue(privateDetails?.venue);
  if (!venue) return null;
  const point = encodeURIComponent(`${venue.latitude},${venue.longitude}`);
  return platform === 'ios'
    ? { map: `https://maps.apple.com/?ll=${point}&q=${encodeURIComponent(venue.fullAddress)}`, directions: `https://maps.apple.com/?daddr=${point}&dirflg=d` }
    : { map: `https://www.google.com/maps/search/?api=1&query=${point}`, directions: `https://www.google.com/maps/dir/?api=1&destination=${point}` };
}
