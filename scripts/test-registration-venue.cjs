const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const venue = { fullAddress: '1 Synthetic Lane, Parramatta NSW 2150', suburb: 'Parramatta', state: 'NSW', postcode: '2150', latitude: -33.815, longitude: 151.001, placeId: 'test-place' };
test('private venue link helper validates coordinates and only uses fixed map providers', async () => {
  const { normalisePrivateVenue, privateVenueLinks } = await import('../backend/functions-registration/privateVenue.mjs');
  assert.equal(privateVenueLinks({}), null);
  assert.equal(privateVenueLinks({ venue: { ...venue, latitude: null } }), null);
  assert.equal(normalisePrivateVenue({ ...venue, fullAddress: undefined }), null);
  assert.equal(normalisePrivateVenue({ ...venue, suburb: '50 Street' }), null);
  assert.equal(privateVenueLinks({ venue }, 'ios').directions, 'https://maps.apple.com/?daddr=-33.815%2C151.001&dirflg=d');
  assert.equal(new URL(privateVenueLinks({ venue }, 'android').map).hostname, 'www.google.com');
  assert.equal(normalisePrivateVenue({ ...venue, maliciousLink: 'javascript:alert(1)' }).maliciousLink, undefined);
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n').trim();
  assert.equal(read('src/registration/privateVenue.js'), read('backend/functions-registration/privateVenue.mjs'));
});
