const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistrationHandlers, localMinute } = require('../backend/functions-registration/registration');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
function fixture() {
  const records = new Map(); let sequence = 0; let queue = Promise.resolve();
  const snap = ref => ({ exists: records.has(ref.path), id: ref.id, data: () => records.has(ref.path) ? structuredClone(records.get(ref.path)) : undefined });
  const collection = path => ({ doc: value => reference(`${path}/${value || `auto-${++sequence}`}`) });
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
  const handlers = createRegistrationHandlers({ db, HttpsError, now: () => new Date('2026-11-01T00:00:00Z'), enabled: () => true });
  const request = (uid, data) => ({ auth: uid ? { uid, token: { firebase: { sign_in_provider: 'phone' } } } : null, data });
  const draft = { title: 'Synthetic event', eventType: 'Custom', customEventType: 'Workshop', city: 'sydney', date: '2026-12-01', suburb: 'Parramatta', address: '1 Synthetic Lane', notes: 'Public notes', capacity: 3, closes: '2026-11-30T18:00', allowCancellation: true, purpose: 'Arrange attendance', fields: [{ id: 'name', type: 'text', label: 'Name', required: true, options: [], description: '' }, { id: 'consent', type: 'consent', label: 'I agree', terms: 'Arrive on time', required: true, options: [], description: '' }] };
  const create = () => handlers.saveRegistrationEvent(request('host', { city: 'sydney', createKey: 'create-one', draft }));
  const approve = event => handlers.approveRegistrationEvent(request('admin', { eventId: event.eventId, expectedRevision: event.revision }));
  const submit = (event, uid = 'member', overrides = {}) => handlers.submitEventRegistration(request(uid, { eventId: event.eventId, formVersion: 1, expectedRevision: 0, requestId: 'request-1', places: 2, answers: { name: 'Synthetic', consent: true }, ...overrides }));
  return { records, handlers, request, draft, create, approve, submit, db };
}
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
  await f.handlers.cancelEventRegistration(f.request('member', { eventId: event.eventId, expectedRevision: 1 }));
  await f.handlers.cancelEventRegistration(f.request('member', { eventId: event.eventId, expectedRevision: 1 }));
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).reservedPlaces, 0);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('member', { eventId: event.eventId }))).privateDetails, undefined);
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
