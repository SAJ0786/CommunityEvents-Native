const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistrationHandlers, localMinute } = require('../backend/functions-registration/registration');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
function fixture() {
  const records = new Map(); let sequence = 0; let queue = Promise.resolve();
  const files = new Map(); let onDownload;
  const bucket = { file: path => ({
    save: async (bytes, options) => files.set(path, { bytes: Buffer.from(bytes), options }),
    delete: async () => { files.delete(path); },
    download: async () => { const bytes = files.get(path)?.bytes; if (onDownload) await onDownload(); if (!bytes) throw Error('No object'); return [bytes]; },
  }) };
  const snap = ref => ({ exists: records.has(ref.path), id: ref.id, data: () => records.has(ref.path) ? structuredClone(records.get(ref.path)) : undefined });
  const collection = (path, filters = [], maximum = Infinity, cursor = '') => ({
    doc: value => reference(`${path}/${value || `auto-${++sequence}`}`),
    where: (field, operator, value) => { assert.equal(operator, '=='); return collection(path, [...filters, [field, value]], maximum, cursor); },
    orderBy: field => { assert.equal(field, '__name__'); return collection(path, filters, maximum, cursor); },
    limit: value => collection(path, filters, value, cursor), startAfter: value => collection(path, filters, maximum, value),
    get: async () => ({ docs: [...records.keys()].filter(key => key.startsWith(`${path}/`) && key.slice(path.length + 1).indexOf('/') === -1 && key.slice(path.length + 1) > cursor && filters.every(([field, value]) => records.get(key)[field] === value)).sort().slice(0, maximum).map(key => snap(reference(key))) }),
  });
  const reference = path => ({ path, id: path.split('/').at(-1), get: async () => snap(reference(path)), collection: name => collection(`${path}/${name}`) });
  const db = { collection, runTransaction(fn) {
    // Serial execution models transaction retries: each concurrent request sees committed capacity.
    const promise = queue.then(async () => {
      const writes = []; let writing = false;
      const result = await fn({ get: async ref => { assert.equal(writing, false, 'all reads must precede writes'); return snap(ref); },
        set: (ref, data, options) => { writing = true; writes.push(() => records.set(ref.path, options?.merge ? { ...records.get(ref.path), ...structuredClone(data) } : structuredClone(data))); },
        update: (ref, data) => { writing = true; writes.push(() => records.set(ref.path, { ...records.get(ref.path), ...structuredClone(data) })); },
      });
      writes.forEach(write => write()); return result;
    });
    queue = promise.catch(() => {}); return promise;
  } };
  for (const [uid, role, city] of [['host','user','sydney'], ['member','user','sydney'], ['other','user','sydney'], ['admin','admin','sydney'], ['wrongadmin','admin','perth'], ['super','superAdmin','perth']]) records.set(`users/${uid}`, { fullName: 'Test User', email: 'test@example.com', isActive: true, accountStatus: 'active', role, adminCity: city });
  const handlers = createRegistrationHandlers({ db, bucket, HttpsError, now: () => new Date('2026-11-01T00:00:00Z'), enabled: () => true });
  const request = (uid, data) => ({ auth: uid ? { uid, token: { firebase: { sign_in_provider: 'phone' } } } : null, data });
  const draft = { title: 'Synthetic event', eventType: 'Custom', customEventType: 'Workshop', city: 'sydney', date: '2026-12-01', suburb: 'Parramatta', address: '1 Synthetic Lane', notes: 'Public notes', capacity: 3, closes: '2026-11-30T18:00', allowCancellation: true, purpose: 'Arrange attendance', fields: [{ id: 'name', type: 'text', label: 'Name', required: true, options: [], description: '' }, { id: 'consent', type: 'consent', label: 'I agree', terms: 'Arrive on time', required: true, options: [], description: '' }] };
  const create = () => handlers.saveRegistrationEvent(request('host', { city: 'sydney', createKey: 'create-one', draft }));
  const approve = event => handlers.approveRegistrationEvent(request('admin', { eventId: event.eventId, expectedRevision: event.revision }));
  const submit = (event, uid = 'member', overrides = {}) => handlers.submitEventRegistration(request(uid, { eventId: event.eventId, formVersion: 1, expectedRevision: 0, requestId: 'request-1', places: 2, answers: { name: 'Synthetic', consent: true }, ...overrides }));
  return { records, files, onDownload: callback => { onDownload = callback; }, handlers, request, draft, create, approve, submit, db };
}

test('discovery is city scoped, private-data free, paginated across filtered rows and review is authorised', async () => {
  const f = fixture(); const event = await f.create();
  const list = (uid, scope, city = 'sydney', cursor = null) => f.handlers.listRegistrationEvents(f.request(uid, { scope, city, cursor }));
  assert.equal((await list(null, 'public')).events.length, 0);
  assert.equal((await list('host', 'mine')).events.length, 1);
  assert.equal((await list('other', 'mine')).events.length, 0);
  assert.equal((await list('admin', 'review')).events.length, 1);
  await assert.rejects(list('wrongadmin', 'review'), { code: 'permission-denied' });
  await assert.rejects(list(null, 'mine'), { code: 'unauthenticated' });
  await f.approve(event);
  const publicPage = await list(null, 'public'); assert.equal(publicPage.events.length, 1);
  assert.equal((await list(null, 'public', 'perth')).events.length, 0);
  assert.equal(JSON.stringify(publicPage).includes('Synthetic Lane'), false);
  assert.equal(publicPage.events[0].ownerUid, undefined);
  assert.equal(publicPage.events[0].registrationCount, undefined);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('admin', { eventId: event.eventId }))).canApprove, true);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('host', { eventId: event.eventId }))).canApprove, false);
  await f.submit(event);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('member', { eventId: event.eventId }))).canCancel, true);
  const row = f.records.get(`registrationEvents/${event.eventId}`);
  for (let i = 0; i < 26; i++) f.records.set(`registrationEvents/000-${String(i).padStart(2, '0')}`, { ...row, status: 'pending' });
  const first = await list(null, 'public'); assert.equal(first.events.length, 0); assert.equal(first.nextCursor, '000-24');
  const second = await list(null, 'public', 'sydney', first.nextCursor); assert.equal(second.events.length, 1); assert.equal(second.nextCursor, null);
});

test('venue coordinates are private, validated, cleared on text-only edit and included in retry identity', async () => {
  const f = fixture();
  const venue = { fullAddress: f.draft.address, suburb: f.draft.suburb, state: 'NSW', postcode: '2150', placeId: 'synthetic-place', latitude: -33.815, longitude: 151.001 };
  const data = { city: 'sydney', createKey: 'mapped', draft: { ...f.draft, venue } };
  const event = await f.handlers.saveRegistrationEvent(f.request('host', data)); await f.approve(event);
  const publicView = await f.handlers.getRegistrationEvent(f.request(null, { eventId: event.eventId }));
  assert.equal(publicView.privateDetails, undefined);
  assert.equal(JSON.stringify(publicView).includes('151.001'), false);
  assert.equal(JSON.stringify(f.records.get(`registrationEvents/${event.eventId}`)).includes('151.001'), false);
  await f.submit(event);
  const memberView = await f.handlers.getRegistrationEvent(f.request('member', { eventId: event.eventId }));
  assert.deepEqual(memberView.privateDetails.venue, venue);
  for (const changes of [{ latitude: '0' }, { longitude: 0 }, { fullAddress: 'Another place' }, { suburb: 'Another suburb' }]) {
    await assert.rejects(f.handlers.saveRegistrationEvent(f.request('host', { ...data, createKey: 'bad-venue', draft: { ...f.draft, venue: { ...venue, ...changes } } })), { code: 'invalid-argument' });
  }
  await assert.rejects(f.handlers.saveRegistrationEvent(f.request('host', { ...data, draft: { ...f.draft, venue: { ...venue, latitude: -33.816 } } })), { code: 'already-exists' });
  await f.handlers.saveRegistrationEvent(f.request('host', { city: 'sydney', eventId: event.eventId, expectedRevision: 1, draft: { ...f.draft, address: '2 New Synthetic Lane' } }));
  assert.equal(f.records.get(`registrationEventPrivate/${event.eventId}`).venue, null, 'stale map pin must not survive address changes');
});

test('poster replacement cleans old object, failed concurrent upload cannot delete winner, removal is protected', async () => {
  const f = fixture(); const event = await f.create();
  const data = { eventId: event.eventId, expectedRevision: 1, mime: 'image/png', base64: Buffer.from([137,80,78,71,13,10,26,10]).toString('base64') };
  await assert.rejects(f.handlers.putRegistrationPoster(f.request('other', data)), { code: 'permission-denied' });
  await assert.rejects(f.handlers.putRegistrationPoster(f.request('host', { ...data, base64: 'invalid' })), { code: 'invalid-argument' });
  const results = await Promise.allSettled([f.handlers.putRegistrationPoster(f.request('host', data)), f.handlers.putRegistrationPoster(f.request('host', data))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.files.size, 1, 'failed upload object is cleaned; winner remains');
  const firstPath = [...f.files.keys()][0];
  assert.equal(f.files.get(firstPath).options.metadata.cacheControl, 'private, no-store');
  assert.equal(JSON.stringify(f.files.get(firstPath).options).includes('downloadToken'), false);
  const replacement = await f.handlers.putRegistrationPoster(f.request('host', { ...data, expectedRevision: 2 }));
  assert.equal(replacement.revision, 3); assert.equal(f.files.has(firstPath), false); assert.equal(f.files.size, 1);
  await assert.rejects(f.handlers.removeRegistrationPoster(f.request('wrongadmin', { eventId: event.eventId, expectedRevision: 3 })), { code: 'permission-denied' });
  await assert.rejects(f.handlers.removeRegistrationPoster(f.request('host', { eventId: event.eventId, expectedRevision: 2 })), { code: 'aborted' });
  const removed = await f.handlers.removeRegistrationPoster(f.request('host', { eventId: event.eventId, expectedRevision: 3 }));
  assert.equal(removed.revision, 4); assert.equal(f.files.size, 0);
  assert.equal(f.records.get(`registrationEventPrivate/${event.eventId}`).posterPath, null);
});

test('poster download rechecks cancellation before returning bytes', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event); await f.submit(event);
  await f.handlers.putRegistrationPoster(f.request('host', { eventId: event.eventId, expectedRevision: 1, mime: 'image/jpeg', base64: Buffer.from([255,216,255,0]).toString('base64') }));
  await f.approve({ ...event, revision: 2 });
  const request = f.request('member', { eventId: event.eventId });
  assert.ok((await f.handlers.getRegistrationPoster(request)).base64);
  f.onDownload(() => f.handlers.cancelEventRegistration(f.request('member', { eventId: event.eventId, expectedRevision: 1 })));
  await assert.rejects(f.handlers.getRegistrationPoster(request), { code: 'permission-denied' });
});
test('private address is separated and unauthorised users cannot read pending events', async () => {
  const f = fixture(); const event = await f.create();
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).address, undefined);
  assert.equal(f.records.get(`registrationEventPrivate/${event.eventId}`).address, '1 Synthetic Lane');
  await assert.rejects(f.handlers.getRegistrationEvent(f.request('other', { eventId: event.eventId })), { code: 'not-found' });
  await assert.rejects(f.handlers.approveRegistrationEvent(f.request('host', { eventId: event.eventId, expectedRevision: 1 })), { code: 'permission-denied' });
  await assert.rejects(f.handlers.approveRegistrationEvent(f.request('wrongadmin', { eventId: event.eventId, expectedRevision: 1 })), { code: 'permission-denied' });
  await f.approve(event);
  const publicView = await f.handlers.getRegistrationEvent(f.request(null, { eventId: event.eventId }));
  assert.equal(publicView.privateDetails, undefined); assert.equal(JSON.stringify(publicView).includes('Synthetic Lane'), false);
  const nonRegistrant = await f.handlers.getRegistrationEvent(f.request('other', { eventId: event.eventId })); assert.equal(nonRegistrant.privateDetails, undefined);
  await f.submit(event);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('member', { eventId: event.eventId }))).privateDetails.address, '1 Synthetic Lane');
});

test('registration uses validated city catalogue timezone and refuses disabled or malformed configuration', async () => {
  const { BUNDLED_CITY_CATALOGUE } = await import('../backend/functions-registration/cityCatalogue.mjs');
  const catalogue = structuredClone(BUNDLED_CITY_CATALOGUE);
  catalogue.cities.push({ id: 'darwin', label: 'Darwin, Australia', code: 'DRW', enabled: true, order: 9,
    state: 'NT', timeZone: 'Australia/Darwin', latitude: -12.46, longitude: 130.84, aliases: ['Darwin'], postcodeRanges: [[800, 899]] });
  const f = fixture(); f.records.set('settings/cityCatalogue', catalogue);
  const data = { city: 'darwin', createKey: 'darwin-one', draft: f.draft };
  const event = await f.handlers.saveRegistrationEvent(f.request('host', data));
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).timeZone, 'Australia/Darwin');
  catalogue.cities.at(-1).enabled = false;
  await assert.rejects(f.handlers.saveRegistrationEvent(f.request('host', { ...data, createKey: 'darwin-two' })), { code: 'invalid-argument' });
  f.records.set('settings/cityCatalogue', { cities: [] });
  await assert.rejects(f.create(), { code: 'failed-precondition' });
});
test('server rejects address leakage and filters previously stored public notes', async () => {
  const f = fixture();
  for (const notes of ['1 Synthetic Lane', 'Meet at 1 SYNTHETIC LANE, please.']) {
    await assert.rejects(f.handlers.saveRegistrationEvent(f.request('host', { city: 'sydney', createKey: 'unsafe', draft: { ...f.draft, notes } })), { code: 'invalid-argument' });
  }
  const event = await f.create(); await f.approve(event);
  const record = f.records.get(`registrationEvents/${event.eventId}`);
  record.notes = '1 Synthetic Lane';
  const result = await f.handlers.getRegistrationEvent(f.request(null, { eventId: event.eventId }));
  assert.equal(result.event.notes, '');
  assert.equal(result.event.suburb, 'Parramatta');
  assert.equal(result.privateDetails, undefined);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('host', { eventId: event.eventId }))).privateDetails.address, '1 Synthetic Lane');
});

test('retrying event creation returns the same event without duplicate records', async () => {
  const f = fixture(); const first = await f.create(); assert.deepEqual(await f.create(), first);
  assert.equal([...f.records.keys()].filter(key => /^registrationEvents\/[^/]+$/.test(key)).length, 1);
});
test('idempotent retries do not double book, and edited registration uses only the seat delta', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event);
  const first = await f.submit(event); assert.deepEqual(await f.submit(event), first);
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).reservedPlaces, 2);
  await assert.rejects(f.submit(event, 'member', { places: 3 }), { code: 'already-exists' });
  await f.submit(event, 'member', { places: 1, requestId: 'edit-1', expectedRevision: 1 });
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).reservedPlaces, 1);
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).registrationCount, 1);
  await assert.rejects(f.submit(event, 'member', { requestId: 'stale-edit', expectedRevision: 1 }), { code: 'aborted' });
});
test('concurrent requests cannot reserve beyond capacity', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event);
  const outcomes = await Promise.allSettled([f.submit(event, 'member'), f.submit(event, 'other')]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).reservedPlaces, 2);
});
test('cancellation is idempotent, releases seats and revokes private detail access', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event); await f.submit(event);
  await assert.rejects(f.handlers.cancelEventRegistration(f.request('member', { eventId: event.eventId, expectedRevision: 0 })), { code: 'aborted' });
  assert.ok(f.records.get(`registrationEvents/${event.eventId}/registrations/member`).answers.name);
  await f.handlers.cancelEventRegistration(f.request('member', { eventId: event.eventId, expectedRevision: 1 }));
  await f.handlers.cancelEventRegistration(f.request('member', { eventId: event.eventId, expectedRevision: 1 }));
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).reservedPlaces, 0);
  const cancelled = f.records.get(`registrationEvents/${event.eventId}/registrations/member`);
  assert.equal(cancelled.answers, undefined); assert.equal(cancelled.fields, undefined);
  assert.equal(cancelled.formVersion, undefined); assert.equal(cancelled.places, 0);
  assert.ok(cancelled.answersDeletedAt);
  await f.submit(event); // An old successful retry receipt must not restore entries.
  assert.equal(f.records.get(`registrationEvents/${event.eventId}/registrations/member`).answers, undefined);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('member', { eventId: event.eventId }))).privateDetails, undefined);
});

test('operation identifiers cannot collide across members with underscores in their IDs', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event);
  for (const uid of ['foo', 'foo_bar']) f.records.set(`users/${uid}`, { role: 'user', isActive: true });
  const first = await f.submit(event, 'foo', { requestId: 'bar_baz', places: 1 });
  const second = await f.submit(event, 'foo_bar', { requestId: 'baz', places: 1 });
  assert.equal(first.registrationId, 'foo'); assert.equal(second.registrationId, 'foo_bar');
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).reservedPlaces, 2);
});
test('server enforces terms, date constraints, active accounts and latest form version', async () => {
  const f = fixture();
  await assert.rejects(f.handlers.saveRegistrationEvent(f.request('host', { city: 'sydney', draft: { ...f.draft, closes: '2026-12-01T00:01' } })), { code: 'invalid-argument' });
  await assert.rejects(f.handlers.saveRegistrationEvent(f.request('host', { city: 'sydney', draft: { ...f.draft, fields: [{ ...f.draft.fields[1], terms: '' }] } })), { code: 'invalid-argument' });
  const event = await f.create(); await f.approve(event);
  await assert.rejects(f.submit(event, 'member', { answers: { name: 'Demo', consent: false } }), { code: 'invalid-argument' });
  await assert.rejects(f.submit(event, 'member', { formVersion: 99 }), { code: 'failed-precondition' });
  f.records.set('users/member', { role: 'superAdmin', isActive: false });
  await assert.rejects(f.submit(event), { code: 'permission-denied' });
});
test('server rejects forged role and ownership; form changes retain response snapshots', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event); await f.submit(event);
  await assert.rejects(f.handlers.saveRegistrationEvent(f.request('other', { eventId: event.eventId, expectedRevision: 1, city: 'sydney', draft: f.draft, role: 'superAdmin', ownerUid: 'other' })), { code: 'permission-denied' });
  await f.handlers.saveRegistrationEvent(f.request('host', { eventId: event.eventId, expectedRevision: 1, city: 'sydney', draft: { ...f.draft, fields: f.draft.fields.map(field => ({ ...field, label: 'Changed label' })) } }));
  assert.equal(f.records.get(`registrationEvents/${event.eventId}/registrations/member`).fields[0].label, 'Name');
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).status, 'pending');
});
test('timezone calculation follows daylight saving and feature defaults to off', async () => {
  assert.equal(localMinute(new Date('2026-10-03T16:00:00Z'), 'Australia/Sydney'), '2026-10-04T03:00');
  const f = fixture(); const off = createRegistrationHandlers({ db: f.db, HttpsError });
  await assert.rejects(off.getRegistrationEvent(f.request(null, { eventId: 'test' })), { code: 'failed-precondition' });
});

test('organiser deletes answers explicitly without cancelling seats, with revision and role checks', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event); await f.submit(event);
  const data = { eventId: event.eventId, registrationId: 'member', expectedRevision: 1, confirmation: 'DELETE ANSWERS' };
  for (const uid of ['other', 'wrongadmin', 'member']) await assert.rejects(f.handlers.deleteRegistrationAnswers(f.request(uid, data)), { code: 'permission-denied' });
  await assert.rejects(f.handlers.deleteRegistrationAnswers(f.request('host', { ...data, confirmation: '' })), { code: 'invalid-argument' });
  await assert.rejects(f.handlers.deleteRegistrationAnswers(f.request('host', { ...data, expectedRevision: 0 })), { code: 'aborted' });
  const first = await f.handlers.deleteRegistrationAnswers(f.request('host', data));
  assert.deepEqual(await f.handlers.deleteRegistrationAnswers(f.request('host', data)), first);
  const stored = f.records.get(`registrationEvents/${event.eventId}/registrations/member`);
  assert.deepEqual(stored.answers, {}); assert.deepEqual(stored.fields, []); assert.ok(stored.answersDeletedAt);
  assert.equal(stored.status, 'registered'); assert.equal(stored.revision, 2);
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).reservedPlaces, 2);
  const view = await f.handlers.getRegistrationEvent(f.request('member', { eventId: event.eventId }));
  assert.equal(view.retention.policy, 'until-organiser-deletes-or-attendee-cancels'); assert.ok(view.privateDetails);
  await f.submit(event); // Retry an old accepted operation must never restore deleted answers.
  assert.deepEqual(f.records.get(`registrationEvents/${event.eventId}/registrations/member`).answers, {});
});
