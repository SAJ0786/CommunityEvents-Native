const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistrationHandlers, localMinute } = require('../backend/functions-registration/registration');
const { createPosterMaintenance, GRACE_MS } = require('../backend/functions-registration/posterMaintenance');
const { createChangeNotifications } = require('../backend/functions-registration/changeNotifications');
const { createNotificationTransport } = require('../backend/functions-registration/notificationTransport');
const { createAccountCleanup } = require('../backend/functions-registration/accountCleanup');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
function fixture() {
  const records = new Map(); const reads=[]; let sequence = 0; let queue = Promise.resolve();
  const files = new Map(); let onDownload; let onDelete; let onSave;
  let clock = Date.parse('2026-11-01T00:00:00Z');
  const bucket = { file: path => ({
    save: async (bytes, options) => { if (onSave) await onSave(); files.set(path, { bytes: Buffer.from(bytes), options }); },
    delete: async () => { if (onDelete) await onDelete(); files.delete(path); },
    download: async () => { const bytes = files.get(path)?.bytes; if (onDownload) await onDownload(); if (!bytes) throw Error('No object'); return [bytes]; },
  }) };
  const snap = ref => ({ exists: records.has(ref.path), id: ref.id, ref, data: () => records.has(ref.path) ? structuredClone(records.get(ref.path)) : undefined });
  const collection = (path, filters = [], maximum = Infinity, cursor = '', order = '__name__') => ({
    doc: value => reference(`${path}/${value || `auto-${++sequence}`}`),
    where: (field, operator, value) => { assert.ok(['==', '<='].includes(operator)); return collection(path, [...filters, [field, value, operator]], maximum, cursor, order); },
    orderBy: field => collection(path, filters, maximum, cursor, field),
    limit: value => collection(path, filters, value, cursor, order), startAfter: value => collection(path, filters, maximum, value, order),
    get: async () => ({ docs: [...records.keys()].filter(key => key.startsWith(`${path}/`) && key.slice(path.length + 1).indexOf('/') === -1 && key.slice(path.length + 1) > cursor && filters.every(([field, value, op]) => op === '==' ? records.get(key)[field] === value : records.get(key)[field] <= value)).sort((a, b) => String(order === '__name__' ? a : records.get(a)[order]).localeCompare(String(order === '__name__' ? b : records.get(b)[order]))).slice(0, maximum).map(key => snap(reference(key))) }),
  });
  const reference = path => ({ path, id: path.split('/').at(-1), get: async () => snap(reference(path)), set: async (data, options) => records.set(path, options?.merge ? {...records.get(path),...structuredClone(data)} : structuredClone(data)), collection: name => collection(`${path}/${name}`) });
  const db = { collection, runTransaction(fn) {
    // Serial execution models transaction retries: each concurrent request sees committed capacity.
    const promise = queue.then(async () => {
      const writes = []; let writing = false;
      const result = await fn({ get: async ref => { reads.push(ref.path); assert.equal(writing, false, 'all reads must precede writes'); return ref.path ? snap(ref) : ref.get(); },
        set: (ref, data, options) => { writing = true; writes.push(() => records.set(ref.path, options?.merge ? { ...records.get(ref.path), ...structuredClone(data) } : structuredClone(data))); },
        update: (ref, data) => { writing = true; writes.push(() => records.set(ref.path, { ...records.get(ref.path), ...structuredClone(data) })); },
        delete: ref => { writing = true; writes.push(() => records.delete(ref.path)); },
      });
      writes.forEach(write => write()); return result;
    });
    queue = promise.catch(() => {}); return promise;
  } };
  for (const [uid, role, city] of [['host','user','sydney'], ['member','user','sydney'], ['other','user','sydney'], ['admin','admin','sydney'], ['wrongadmin','admin','perth'], ['super','superAdmin','perth']]) records.set(`users/${uid}`, { fullName: 'Test User', email: 'test@example.com', isActive: true, accountStatus: 'active', role, adminCity: city });
  const handlers = createRegistrationHandlers({ db, bucket, HttpsError, now: () => new Date(clock), enabled: () => true });
  const sweep = createPosterMaintenance({ db, bucket, now: () => new Date(clock), enabled: () => true });
  const request = (uid, data) => ({ auth: uid ? { uid, token: { firebase: { sign_in_provider: 'phone' } } } : null, data });
  const draft = { title: 'Synthetic event', eventType: 'Custom', customEventType: 'Workshop', city: 'sydney', date: '2026-12-01', suburb: 'Parramatta', address: '1 Synthetic Lane', notes: 'Public notes', capacity: 3, closes: '2026-11-30T18:00', allowCancellation: true, purpose: 'Arrange attendance', fields: [{ id: 'name', type: 'text', label: 'Name', required: true, options: [], description: '' }, { id: 'consent', type: 'consent', label: 'I agree', terms: 'Arrive on time', required: true, options: [], description: '' }] };
  const create = () => handlers.saveRegistrationEvent(request('host', { city: 'sydney', createKey: 'create-one', draft }));
  const approve = event => handlers.approveRegistrationEvent(request('super', { eventId: event.eventId, expectedRevision: event.revision }));
  const submit = (event, uid = 'member', overrides = {}) => handlers.submitEventRegistration(request(uid, { eventId: event.eventId, formVersion: 1, expectedRevision: 0, requestId: 'request-1', places: 2, answers: { name: 'Synthetic', consent: true }, ...overrides }));
  return { records, reads, files, now: () => new Date(clock), onDownload: callback => { onDownload = callback; }, onDelete: callback => { onDelete = callback; }, onSave: callback => { onSave = callback; }, advance: ms => { clock += ms; }, sweep, handlers, request, draft, create, approve, submit, db };
}

function seriesRequest(f, changes = {}) {
  return {
    city: 'sydney', createKey: 'series-one',
    draft: { ...f.draft, startTime: '10:00', endTime: '11:00' },
    recurrence: { calendarType: 'gregorian', frequency: 'week', repeatEvery: 1, endMode: 'count', occurrenceCount: 2 },
    occurrences: [
      { date: '2026-12-01', closes: '2026-11-30T18:00', capacity: 3, startTime: '10:00', endTime: '11:00' },
      { date: '2026-12-08', closes: '2026-12-06T12:00', capacity: 7, startTime: '11:00', endTime: '12:00' },
    ], ...changes,
  };
}

test('deletion with no bookings still records a cancellation for required admin notices',async()=>{
 const f=fixture(),event=await f.create();await f.approve(event);
 const result=await f.handlers.deleteRegistrationEvent(f.request('host',{eventId:event.eventId,expectedRevision:1,confirmation:'DELETE EVENT'}));
 assert.deepEqual(f.records.get(`registrationChanges/${event.eventId}-${result.revision}`).changes,['cancelled']);
});

test('series review lists only pending dates for superadmins and approves selected dates atomically',async()=>{
 const f=fixture(),series=await f.handlers.createRegistrationSeries(f.request('host',seriesRequest(f))),first=series.events[0].eventId;
 const review=await f.handlers.getRegistrationEvent(f.request('super',{eventId:first,includeSeriesReview:true}));assert.equal(review.reviewOccurrences.length,2);
 const owner=await f.handlers.getRegistrationEvent(f.request('host',{eventId:first,includeSeriesReview:true}));assert.equal(owner.reviewOccurrences,undefined);
 const data={eventId:first,requestId:'approve-series',occurrences:review.reviewOccurrences.map(row=>({eventId:row.eventId,expectedRevision:row.revision}))};
 await assert.rejects(f.handlers.approveRegistrationSeries(f.request('admin',data)),{code:'permission-denied'});
 const result=await f.handlers.approveRegistrationSeries(f.request('super',data));assert.equal(result.events.length,2);
 assert.deepEqual(await f.handlers.approveRegistrationSeries(f.request('super',data)),result);
 for(const row of series.events)assert.equal(f.records.get(`registrationEvents/${row.eventId}`).status,'approved');
 assert.equal((await f.handlers.getRegistrationEvent(f.request('super',{eventId:first,includeSeriesReview:true}))).reviewOccurrences.length,0);
});
test('stale or unrelated series approval rolls back every selected occurrence',async()=>{
 for(const mismatch of ['revision','series']){
 const f=fixture(),series=await f.handlers.createRegistrationSeries(f.request('host',seriesRequest(f))),[first,second]=series.events.map(row=>row.eventId);
 if(mismatch==='series')f.records.get(`registrationEvents/${second}`).seriesId='different';
 const data={eventId:first,requestId:'approve-stale',occurrences:[{eventId:first,expectedRevision:1},{eventId:second,expectedRevision:mismatch==='revision'?0:1}]};
 await assert.rejects(f.handlers.approveRegistrationSeries(f.request('super',data)));
 assert.equal(f.records.get(`registrationEvents/${first}`).status,'pending');assert.equal(f.records.get(`registrationEvents/${second}`).status,'pending');
 }
});

test('series attendee selection is atomic, retry-safe and keeps separate bookings/capacities', async()=>{
 const f=fixture(),series=await f.handlers.createRegistrationSeries(f.request('host',seriesRequest(f)));
 for(const event of series.events)await f.approve(event);
 const root=series.events[0].eventId;
 const detail=await f.handlers.getRegistrationEvent(f.request('member',{eventId:root,includeOccurrences:true}));
 assert.equal(detail.occurrences.length,2);assert.ok(detail.occurrences.every(row=>row.selectable));
 assert.equal(JSON.stringify(detail.occurrences).includes(f.draft.address),false);
 const data={eventId:root,requestId:'batch-one',places:2,answers:{name:'Synthetic',consent:true},occurrences:detail.occurrences.map(row=>({eventId:row.eventId,formVersion:row.formVersion,expectedRevision:0}))};
 const result=await f.handlers.submitRegistrationOccurrences(f.request('member',data));
 assert.equal(result.registrations.length,2);
 assert.deepEqual(await f.handlers.submitRegistrationOccurrences(f.request('member',data)),result);
 for(const event of series.events){assert.equal(f.records.get(`registrationEvents/${event.eventId}`).reservedPlaces,2);assert.equal(f.records.get(`registrationEvents/${event.eventId}/registrations/member`).revision,1);}
 const after=await f.handlers.getRegistrationEvent(f.request('member',{eventId:root,includeOccurrences:true}));
 assert.equal(after.occurrences.find(row=>row.eventId!==root).reason,'Already registered');
 await assert.rejects(f.handlers.submitRegistrationOccurrences(f.request('member',{...data,places:1})),{code:'already-exists'});
});
test('a full, closed, changed-form or unrelated occurrence prevents all selected writes',async()=>{
 for(const failure of ['full','closed','form','unrelated']){
 const f=fixture(),series=await f.handlers.createRegistrationSeries(f.request('host',seriesRequest(f)));
 for(const event of series.events)await f.approve(event);
 const [first,second]=series.events.map(row=>row.eventId),row=f.records.get(`registrationEvents/${second}`);
 if(failure==='full')row.reservedPlaces=row.capacity;
 if(failure==='closed')row.closes='2026-10-01T00:00';
 if(failure==='unrelated')row.seriesId='different-series';
 if(failure==='form')f.records.get(`registrationForms/${second}`).fields[0].label='Changed question';
 const data={eventId:first,requestId:'batch-fail',places:2,answers:{name:'Synthetic',consent:true},occurrences:[first,second].map(eventId=>({eventId,formVersion:1,expectedRevision:0}))};
 await assert.rejects(f.handlers.submitRegistrationOccurrences(f.request('member',data)));
 assert.equal(f.records.has(`registrationEvents/${first}/registrations/member`),false,failure);
 assert.equal(f.records.get(`registrationEvents/${first}`).reservedPlaces,0,failure);
 }
});
test('occurrence selector hides unapproved/deleted dates and does not disclose other attendees',async()=>{
 const f=fixture(),series=await f.handlers.createRegistrationSeries(f.request('host',seriesRequest(f)));
 await f.approve(series.events[0]);
 const first=series.events[0].eventId;
 const detail=await f.handlers.getRegistrationEvent(f.request('member',{eventId:first,includeOccurrences:true}));
 assert.equal(detail.occurrences.length,1);
 await assert.rejects(f.handlers.submitRegistrationOccurrences(f.request(null,{eventId:first,requestId:'guest',occurrences:[{eventId:first}]})),{code:'unauthenticated'});
 await assert.rejects(f.handlers.submitRegistrationOccurrences(f.request('member',{eventId:first,requestId:'dupe',occurrences:[{eventId:first},{eventId:first}]})),{code:'invalid-argument'});
});

test('series creation is atomic, authenticated, retry-safe and separate from public discovery until individual approval', async () => {
  const f = fixture();
  const venue = { fullAddress: f.draft.address, suburb: f.draft.suburb, state: 'NSW', postcode: '2150', placeId: 'series-place', latitude: -33.815, longitude: 151.001 };
  const data = seriesRequest(f, { draft: { ...f.draft, startTime: '10:00', endTime: '11:00', venue } });
  await assert.rejects(f.handlers.createRegistrationSeries(f.request(null, data)), { code: 'unauthenticated' });
  const [created, duplicate] = await Promise.all([f.handlers.createRegistrationSeries(f.request('host', data)), f.handlers.createRegistrationSeries(f.request('host', data))]);
  assert.deepEqual(created, duplicate);
  assert.equal(created.events.length, 2);
  assert.equal([...f.records.keys()].filter(key => /^registrationEvents\/[^/]+$/.test(key)).length, 2);
  assert.equal((await f.handlers.listRegistrationEvents(f.request(null, { scope: 'public', city: 'sydney' }))).events.length, 0);
  await assert.rejects(f.handlers.createRegistrationSeries(f.request('host', { ...data, occurrences: [data.occurrences[0], { ...data.occurrences[1], capacity: 8 }] })), { code: 'already-exists' });
  const host = await f.handlers.getRegistrationEvent(f.request('host', { eventId: created.events[1].eventId }));
  assert.equal(host.event.seriesId, created.seriesId); assert.equal(host.event.occurrenceIndex, 1);
  assert.equal(host.event.capacity, 7); assert.equal(host.event.closes, '2026-12-06T12:00');
  assert.equal(host.privateDetails.address, f.draft.address);
  await assert.rejects(f.handlers.approveRegistrationEvent(f.request('admin', { eventId: created.events[0].eventId, expectedRevision: 1 })), { code: 'permission-denied' });
  await f.approve(created.events[0]);
  const page = await f.handlers.listRegistrationEvents(f.request(null, { scope: 'public', city: 'sydney' }));
  assert.equal(page.events.length, 1); assert.equal(page.events[0].seriesId, created.seriesId);
  assert.equal(page.events[0].latitude, -33.81); assert.equal(page.events[0].longitude, 151);
  assert.notEqual(page.events[0].latitude, venue.latitude, 'public map point must not expose the exact private venue');
  assert.equal(JSON.stringify(page).includes(f.draft.address), false);
  assert.equal(JSON.stringify(page).includes('privateDetails'), false);
});

test('series occurrences have independent bookings, staged approval, cancellation and immutable provenance', async () => {
  const f = fixture(); const data = seriesRequest(f);
  const result = await f.handlers.createRegistrationSeries(f.request('host', data));
  const [first, second] = result.events;
  await f.approve(first); await f.approve(second);
  await f.submit(first); await f.submit(second);
  assert.equal(f.records.get(`registrationEvents/${first.eventId}`).reservedPlaces, 2);
  assert.equal(f.records.get(`registrationEvents/${second.eventId}`).reservedPlaces, 2);
  await f.handlers.cancelEventRegistration(f.request('member', { eventId: first.eventId, expectedRevision: 1 }));
  assert.equal(f.records.get(`registrationEvents/${first.eventId}`).reservedPlaces, 0);
  assert.equal(f.records.get(`registrationEvents/${second.eventId}`).reservedPlaces, 2);
  const saved = await f.handlers.saveRegistrationEvent(f.request('host', {
    city: 'sydney', eventId: second.eventId, expectedRevision: 1,
    draft: { ...data.draft, ...data.occurrences[1], title: 'Changed occurrence only', seriesId: 'FORGED', occurrenceIndex: 55 },
  }));
  assert.equal((await f.handlers.getRegistrationEvent(f.request('member', { eventId: second.eventId }))).event.title, data.draft.title);
  await f.approve(saved);
  const detail = await f.handlers.getRegistrationEvent(f.request('member', { eventId: second.eventId }));
  assert.equal(detail.event.title, 'Changed occurrence only'); assert.equal(detail.event.seriesId, result.seriesId);
  assert.equal(detail.event.occurrenceIndex, 1); assert.equal(detail.event.recurrenceRule.frequency, 'week');
  await f.handlers.deleteRegistrationEvent(f.request('host', { eventId: first.eventId, expectedRevision: 1, confirmation: 'DELETE EVENT' }));
  assert.equal(f.records.get(`registrationEvents/${second.eventId}`).status, 'approved');
});

test('invalid later occurrences, DST schedules, closing dates and creation bounds cannot partially write a series', async () => {
  const f = fixture(); const data = seriesRequest(f);
  for (const changes of [
    { occurrences: [data.occurrences[0], { ...data.occurrences[1], capacity: 0 }] },
    { occurrences: [data.occurrences[0], { ...data.occurrences[1], date: '2026-12-09' }] },
    { occurrences: [data.occurrences[0], { ...data.occurrences[1], closes: '2026-12-08T12:00' }] },
    { occurrences: [data.occurrences[0], { ...data.occurrences[1], endTime: '11:00' }] },
    { recurrence: { ...data.recurrence, occurrenceCount: 101 } },
    { recurrence: { ...data.recurrence, overrides: [] } },
  ]) {
    await assert.rejects(f.handlers.createRegistrationSeries(f.request('host', { ...data, ...changes })), { code: 'invalid-argument' });
    assert.equal([...f.records.keys()].filter(key => key.startsWith('registrationEvents/')).length, 0);
  }
  f.advance(305 * 86400000);
  const gap = seriesRequest(f, {
    draft: { ...data.draft, date: '2027-10-02', closes: '2027-10-01T18:00', startTime: '02:30', endTime: '' },
    recurrence: { ...data.recurrence, frequency: 'day' },
    occurrences: [
      { date: '2027-10-02', closes: '2027-10-01T18:00', capacity: 3, startTime: '02:30', endTime: '' },
      { date: '2027-10-03', closes: '2027-10-02T18:00', capacity: 3, startTime: '02:30', endTime: '' },
    ],
  });
  await assert.rejects(f.handlers.createRegistrationSeries(f.request('host', gap)), { code: 'invalid-argument' });
  assert.equal([...f.records.keys()].filter(key => key.startsWith('registrationEvents/')).length, 0);
});

test('series dates use true Hijri cadence and trusted calendar overrides; stale previews do not write', async () => {
  const f = fixture();
  const { registrationOccurrencePreview } = await import('../backend/functions-registration/registrationRecurrence.mjs');
  const { hijriToGregorian } = await import('../backend/functions-registration/hijri.mjs');
  const recurrence = { calendarType: 'hijri', frequency: 'month', repeatEvery: 1, endMode: 'count', occurrenceCount: 3, startHijri: { day: 1, month: 7, year: 1448 } };
  const startDate = hijriToGregorian(1, 7, 1448);
  const preview = registrationOccurrencePreview(startDate, recurrence);
  assert.notEqual(preview[1].date.slice(8), preview[0].date.slice(8));
  const occurrences = preview.map(row => ({ ...row, capacity: 3, closes: '', startTime: '10:00', endTime: '' }));
  const data = seriesRequest(f, { draft: { ...f.draft, ...occurrences[0] }, recurrence, occurrences });
  const stale = fixture();
  stale.records.set('settings/hijriCalendar', { overrides: [{ hYear: 1448, hMonth: 7, gDate: new Date(Date.parse(startDate + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10) }] });
  await assert.rejects(stale.handlers.createRegistrationSeries(stale.request('host', data)), { code: 'invalid-argument' });
  assert.equal([...stale.records.keys()].filter(key => key.startsWith('registrationEvents/')).length, 0);
  const result = await f.handlers.createRegistrationSeries(f.request('host', data));
  const detail = await f.handlers.getRegistrationEvent(f.request('host', { eventId: result.events[1].eventId }));
  assert.equal(detail.event.hijriMonth, 8); assert.equal(detail.event.enteredAsHijri, true);
  assert.equal(detail.event.recurrenceRule.calendarType, 'hijri');
  // A valid retry is resolved by its receipt, even if the authoritative calendar later changes.
  f.records.set('settings/hijriCalendar', { overrides: [{ hYear: 1448, hMonth: 7, gDate: '2026-12-20' }] });
  assert.deepEqual(await f.handlers.createRegistrationSeries(f.request('host', data)), result);
});

test('the exact 100 occurrence bound commits all documents but oversized repeated forms fail before writes', async () => {
  const { registrationOccurrenceDates } = await import('../backend/functions-registration/registrationRecurrence.mjs');
  const f = fixture();
  const recurrence = { calendarType: 'gregorian', frequency: 'day', repeatEvery: 1, endMode: 'count', occurrenceCount: 100 };
  const occurrences = registrationOccurrenceDates('2026-12-01', recurrence).map(date => ({ date, capacity: 3, closes: '', startTime: '', endTime: '' }));
  const data = seriesRequest(f, { draft: { ...f.draft, closes: '', startTime: '', endTime: '' }, recurrence, occurrences });
  const result = await f.handlers.createRegistrationSeries(f.request('host', data));
  assert.equal(result.events.length, 100);
  assert.equal([...f.records.keys()].filter(key => key.startsWith('registrationEvents/')).length, 100);
  assert.equal([...f.records.keys()].filter(key => key.startsWith('registrationForms/')).length, 100);
  assert.equal([...f.records.keys()].filter(key => key.startsWith('registrationEventPrivate/')).length, 100);
  const large = fixture();
  const fields = Array.from({ length: 30 }, (_, index) => ({ id: `field-${index}`, type: 'text', label: 'Q'.repeat(200), description: 'D'.repeat(500), terms: 'T'.repeat(1000), required: false, options: Array.from({ length: 20 }, (_, option) => `${option}`.padEnd(100, 'X')) }));
  await assert.rejects(large.handlers.createRegistrationSeries(large.request('host', { ...data, draft: { ...data.draft, fields, notes: 'N'.repeat(5000) } })), { code: 'resource-exhausted' });
  assert.equal([...large.records.keys()].filter(key => key.startsWith('registrationEvents/') || key.startsWith('registrationSeries/')).length, 0);
});

test('poster quota is atomic, private uploads have recovery intents and stale managers cannot spend quota', async () => {
  const f = fixture(); const event = await f.create();
  const data = { eventId: event.eventId, mime: 'image/jpeg', base64: Buffer.from([255,216,255,0]).toString('base64') };
  for (let revision = 1; revision <= 10; revision++) await f.handlers.putRegistrationPoster(f.request('host', { ...data, expectedRevision: revision }));
  await assert.rejects(f.handlers.putRegistrationPoster(f.request('host', { ...data, expectedRevision: 11 })), { code: 'resource-exhausted' });
  assert.equal([...f.records.keys()].filter(key => key.startsWith('registrationPosterCleanup/')).length, 10);
  assert.equal(f.files.size, 1);
  f.advance(3600000);
  await f.handlers.putRegistrationPoster(f.request('host', { ...data, expectedRevision: 11 }));
  assert.equal([...f.records.values()].find(value => value.windowStart)?.count, 1);
  await assert.rejects(f.handlers.putRegistrationPoster(f.request('host', { ...data, expectedRevision: 1 })), { code: 'aborted' });
  assert.equal([...f.records.values()].find(value => value.windowStart)?.count, 1);
});

test('explicit event schedule is city-correct, optional, overnight-aware and preserved for older edits', async () => {
  const f = fixture();
  const dateOnly = await f.create();
  const original = await f.handlers.getRegistrationEvent(f.request(null, { eventId: dateOnly.eventId })).catch(error => error);
  assert.equal(original.code, 'not-found');
  const timed = await f.handlers.saveRegistrationEvent(f.request('host', {
    eventId: dateOnly.eventId, expectedRevision: 1, city: 'sydney', draft: { ...f.draft, startTime: '23:30', endTime: '01:00', startAt: 'FORGED' },
  }));
  const record = f.records.get(`registrationEvents/${dateOnly.eventId}`);
  assert.equal(record.startAt, '2026-12-01T12:30:00.000Z');
  assert.equal(record.endAt, '2026-12-01T14:00:00.000Z');
  await f.approve(timed); await f.submit(dateOnly);
  const edited = await f.handlers.saveRegistrationEvent(f.request('host', {
    eventId: dateOnly.eventId, expectedRevision: timed.revision, city: 'sydney', draft: f.draft,
  }));
  const detail = await f.handlers.getRegistrationEvent(f.request('member', { eventId: dateOnly.eventId }));
  assert.equal(detail.event.startTime, '23:30');
  assert.equal(detail.event.endTime, '01:00');
  assert.equal(detail.event.startAt, record.startAt);
  assert.equal(detail.ownRegistration.places, 2);
  const cleared = await f.handlers.saveRegistrationEvent(f.request('host', {
    eventId: dateOnly.eventId, expectedRevision: edited.revision, city: 'sydney', draft: { ...f.draft, startTime: '', endTime: '' },
  }));
  const promoted = await f.approve(cleared);
  const publicRows = await f.handlers.listRegistrationEvents(f.request(null, { scope: 'public', city: 'sydney' }));
  assert.equal(publicRows.events[0].startAt, null);
  assert.equal(publicRows.events[0].endAt, null);
  assert.deepEqual(f.records.get(`registrationChanges/${dateOnly.eventId}-${promoted.revision}`).changes, ['date']);
  assert.equal(f.records.get(`registrationEvents/${dateOnly.eventId}`).formVersion, 1);
});

test('live projections expose public video only, never unlisted links, credentials or pending streams', async () => {
  const f = fixture();
  const created = await f.create();
  const record = f.records.get(`registrationEvents/${created.eventId}`);
  Object.assign(record, { isLive: true, liveUrl: 'session-1', liveWatchUrl: 'https://www.youtube.com/watch?v=abc123',
    liveAppVisibility: 'public', liveSource: 'native', liveStartedAt: '2026-12-01T07:30:00Z',
    liveVideoRecordId: 'registration_event-1', liveRoomCode: 'PRIVATE_ROOM', liveStartedBy: 'host', rtmpUrl: 'SECRET', streamKey: 'SECRET' });
  assert.equal((await f.handlers.getRegistrationEvent(f.request('host', { eventId: created.eventId }))).event.isLive, false);
  await f.approve(created);
  const stored = f.records.get(`registrationEvents/${created.eventId}`);
  const publicDetail = await f.handlers.getRegistrationEvent(f.request(null, { eventId: created.eventId }));
  assert.equal(publicDetail.event.liveWatchUrl, record.liveWatchUrl);
  assert.equal(publicDetail.event.liveUrl, 'session-1');
  assert.equal(JSON.stringify(publicDetail).includes('SECRET'), false);
  assert.equal(JSON.stringify(publicDetail).includes('PRIVATE_ROOM'), false);
  stored.liveAppVisibility = 'private';
  const page = await f.handlers.listRegistrationEvents(f.request(null, { scope: 'public', city: 'sydney' }));
  assert.equal(page.events[0].liveWatchUrl, null);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('host', { eventId: created.eventId }))).event.liveWatchUrl, null);
  stored.liveUrl = 'https://private.invalid/secret';
  assert.equal((await f.handlers.getRegistrationEvent(f.request(null, { eventId: created.eventId }))).event.liveUrl, null);
  stored.liveUrl = 'session-1';
  await f.handlers.saveRegistrationEvent(f.request('host', {
    eventId: created.eventId, expectedRevision: created.revision, city: 'sydney', draft: f.draft,
  }));
  assert.equal(f.records.get(`registrationEvents/${created.eventId}`).liveUrl, 'session-1');
  assert.equal(f.records.get(`registrationEvents/${created.eventId}`).liveAppVisibility, 'private');
  assert.equal(f.records.get(`registrationEvents/${created.eventId}`).liveRoomCode, 'PRIVATE_ROOM');
  assert.equal(f.records.get(`registrationEvents/${created.eventId}`).liveStartedBy, 'host');
  await f.handlers.deleteRegistrationEvent(f.request('host', {
    eventId: created.eventId, expectedRevision: 2, confirmation: 'DELETE EVENT',
  }));
  const deleted = await f.handlers.getRegistrationEvent(f.request('host', { eventId: created.eventId }));
  assert.equal(deleted.event.isLive, false);
  assert.equal(deleted.event.liveWatchUrl, undefined);
});

test('event schedule rejects invalid clocks, impossible DST times and overlaps before writing', async () => {
  const f = fixture();
  for (const fields of [
    { startTime: '24:00' }, { startTime: '20:60' }, { startTime: '12:00', endTime: '12:00' },
    { endTime: '12:00' }, { date: '2027-10-03', startTime: '02:30' }, { date: '2027-04-04', startTime: '02:30' },
  ]) {
    await assert.rejects(f.handlers.saveRegistrationEvent(f.request('host', {
      city: 'sydney', createKey: 'bad-schedule', draft: { ...f.draft, ...fields },
    })), { code: 'invalid-argument' });
  }
  assert.equal([...f.records.keys()].some(key => key.startsWith('registrationEvents/')), false);
});

test('staged drafts isolate all public and private content, including host self-registration, until superAdmin promotion', async () => {
  const f = fixture(); const created = await f.create(); await f.approve(created); await f.submit(created);
  const stored = f.records.get(`registrationEvents/${created.eventId}`);
  Object.assign(stored, { isLive: true, liveUrl: 'session', liveSource: 'native', liveAppVisibility: 'public' });
  const changed = { ...f.draft, title: 'Unpublished title', date: '2026-12-02', startTime: '18:00', endTime: '20:00',
    address: '7 Unpublished Lane', capacity: 4, purpose: 'Unpublished purpose', hostName: 'Public host', hostPhone: 'PRIVATE_PHONE',
    hostContactOptional: 'PRIVATE_CONTACT', eventSubject: 'Descriptive subject', audienceType: 'Family Event', organiserType: 'centre',
    organiserId: 'centre-1', organiserName: 'Community centre', organisationType: 'centre', isOnBehalfOf: true,
    speakerName: 'Speaker', reciters: [{ type: 'Custom', customType: 'Reading', name: 'Reader' }], timeMode: 'prayer',
    prayerName: 'maghrib', prayerLabel: 'Maghrib', prayerOffsetMinutes: 5, prayerTimeZone: 'FORGED',
    hijriDate: 'Hijri display', enteredAsHijri: true, hijriDay: 22, hijriMonth: 6, hijriYear: 1448 };
  const saved = await f.handlers.saveRegistrationEvent(f.request('host', { eventId: created.eventId, expectedRevision: 1, city: 'sydney', draft: changed }));
  assert.equal(saved.hasPendingChanges, true);
  for (const uid of [null, 'other', 'member', 'host', 'super']) {
    const detail = await f.handlers.getRegistrationEvent(f.request(uid, { eventId: created.eventId }));
    assert.equal(detail.event.title, f.draft.title);
    assert.equal(detail.form.purpose, f.draft.purpose);
    assert.equal(detail.event.date, f.draft.date);
    assert.equal(detail.event.isLive, true);
    if (detail.privateDetails) assert.equal(detail.privateDetails.address, f.draft.address);
    if (['host', 'super'].includes(uid)) {
      assert.equal(detail.pendingChanges.event.title, changed.title);
      assert.equal(detail.pendingChanges.privateDetails.hostPhone, 'PRIVATE_PHONE');
      assert.equal(detail.pendingChanges.event.hostPhone, undefined);
      assert.equal(detail.pendingChanges.event.prayerTimeZone, 'Australia/Sydney');
      assert.equal(detail.event.hasPendingChanges, true);
    } else {
      assert.equal(detail.pendingChanges, undefined);
      assert.equal(detail.event.hasPendingChanges, undefined);
    }
  }
  const review = await f.handlers.listRegistrationEvents(f.request('super', { scope: 'review' }));
  assert.equal(review.events.length, 1);
  assert.equal(review.events[0].canApprove, true);
  assert.equal(review.events[0].title, f.draft.title);
  assert.equal(JSON.stringify(review).includes('Unpublished'), false);
  await f.submit(created, 'host', { places: 1 });
  await assert.rejects(f.handlers.approveRegistrationEvent(f.request('admin', { eventId: created.eventId, expectedRevision: 2 })), { code: 'permission-denied' });
  await assert.rejects(f.approve(created), { code: 'aborted' });
  await f.approve(saved);
  const published = await f.handlers.getRegistrationEvent(f.request('member', { eventId: created.eventId }));
  assert.equal(published.event.title, changed.title);
  assert.equal(published.event.startAt, '2026-12-02T07:00:00.000Z');
  assert.equal(published.event.hostName, changed.hostName);
  assert.equal(published.event.organiserId, 'centre-1');
  assert.equal(published.event.reciters[0].name, 'Reader');
  assert.equal(published.privateDetails.hostPhone, 'PRIVATE_PHONE');
  assert.equal(published.registrationNeedsReview, true);
  assert.equal(f.records.get(`registrationEvents/${created.eventId}`).reservedPlaces, 3);
  assert.equal(f.records.get(`registrationEvents/${created.eventId}`).liveUrl, 'session');
  assert.equal(f.records.has(`registrationPendingChanges/${created.eventId}`), false);
  const publicPage = await f.handlers.listRegistrationEvents(f.request(null, { scope: 'public', city: 'sydney' }));
  assert.equal(JSON.stringify(publicPage).includes('PRIVATE_'), false);
  assert.equal(JSON.stringify(publicPage).includes('Unpublished Lane'), false);
});

test('promotion rechecks booked capacity and city catalogue and never drops concurrent stream updates', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event);
  const pending = await f.handlers.saveRegistrationEvent(f.request('host', {
    eventId: event.eventId, expectedRevision: 1, city: 'sydney', draft: { ...f.draft, capacity: 1, title: 'One seat' },
  }));
  await f.submit(event);
  f.records.get(`registrationEvents/${event.eventId}`).liveUrl = 'new-session';
  await assert.rejects(f.approve(pending), { code: 'failed-precondition' });
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).title, f.draft.title);
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).reservedPlaces, 2);
  const resubmitted = await f.handlers.saveRegistrationEvent(f.request('host', {
    eventId: event.eventId, expectedRevision: 2, city: 'sydney', draft: { ...f.draft, capacity: 3, title: 'Three seats' },
  }));
  f.records.get(`registrationEvents/${event.eventId}`).liveUrl = 'latest-session';
  const approved = await f.approve(resubmitted);
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).liveUrl, 'latest-session');
  assert.equal(approved.revision, resubmitted.revision + 1);
  await assert.rejects(f.handlers.saveRegistrationEvent(f.request('host', {
    eventId: event.eventId, expectedRevision: resubmitted.revision, city: 'sydney', draft: f.draft,
  })), { code: 'aborted' });
  await assert.rejects(f.handlers.removeRegistrationPoster(f.request('host', {
    eventId: event.eventId, expectedRevision: resubmitted.revision,
  })), { code: 'aborted' });
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).reservedPlaces, 2);
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).formVersion, 1);
});

test('normal metadata and private contacts round-trip and survive old edits without leaking in projections', async () => {
  const f = fixture();
  const draft = { ...f.draft, hostName: 'Host', hostPhone: 'PRIVATE_PHONE', hostContactOptional: 'PRIVATE_CONTACT',
    organiserType: 'dynamic-centre', organiserId: 'centre-1', organiserName: 'Centre', organisationType: 'centre',
    eventSubject: 'Subject', audienceType: 'Ladies Only', speakerName: 'Speaker',
    reciters: [{ type: 'Custom', name: 'Reader', customType: 'Reading' }],
    timeMode: 'manual', hijriDate: 'Display', enteredAsHijri: false, hijriDay: null, hijriMonth: null, hijriYear: null };
  const created = await f.handlers.saveRegistrationEvent(f.request('host', { city: 'sydney', createKey: 'metadata', draft }));
  await f.approve(created);
  const saved = await f.handlers.saveRegistrationEvent(f.request('host', {
    city: 'sydney', eventId: created.eventId, expectedRevision: 1, draft: f.draft,
  }));
  const pending = (await f.handlers.getRegistrationEvent(f.request('host', { eventId: created.eventId }))).pendingChanges;
  assert.equal(pending.event.organiserId, 'centre-1');
  assert.equal(pending.privateDetails.hostContactOptional, 'PRIVATE_CONTACT');
  await f.approve(saved);
  const anonymous = await f.handlers.getRegistrationEvent(f.request(null, { eventId: created.eventId }));
  assert.equal(anonymous.event.hostName, 'Host');
  assert.equal(anonymous.event.hijriDay, null);
  assert.equal(anonymous.event.reciters[0].name, 'Reader');
  assert.equal(JSON.stringify(anonymous).includes('PRIVATE_'), false);
  const clear = await f.handlers.saveRegistrationEvent(f.request('host', {
    city: 'sydney', eventId: created.eventId, expectedRevision: 3,
    draft: { ...f.draft, hostName: '', hostPhone: '', hostContactOptional: '', reciters: [] },
  }));
  await f.approve(clear);
  const manager = await f.handlers.getRegistrationEvent(f.request('host', { eventId: created.eventId }));
  assert.equal(manager.event.hostName, '');
  assert.equal(manager.privateDetails.hostPhone, '');
  assert.deepEqual(manager.event.reciters, []);
});

test('approval rejects an invalidated city and account cleanup discards private staged drafts', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event);
  const staged = await f.handlers.saveRegistrationEvent(f.request('host', {
    eventId: event.eventId, expectedRevision: 1, city: 'sydney', draft: { ...f.draft, address: '8 Staged Lane', hostPhone: 'PRIVATE' },
  }));
  f.records.set('settings/cityCatalogue', { cities: [] });
  await assert.rejects(f.approve(staged), { code: 'failed-precondition' });
  f.records.delete('settings/cityCatalogue');
  const cleanup = createAccountCleanup({ db: f.db, now: f.now, enabled: () => true });
  f.records.get('users/host').accountStatus = 'deleted';
  await cleanup.enqueue('host'); await cleanup.tick();
  assert.equal(f.records.has(`registrationPendingChanges/${event.eventId}`), false);
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).status, 'cancelled');
  assert.equal(f.records.get(`registrationEventPrivate/${event.eventId}`).address, f.draft.address);
});

test('pending posters and removals remain isolated and cleanup retains both referenced versions', async () => {
  const f = fixture(); const event = await f.create();
  const image = extra => Buffer.from([255, 216, 255, extra]).toString('base64');
  await f.handlers.putRegistrationPoster(f.request('host', { eventId: event.eventId, expectedRevision: 1, mime: 'image/jpeg', base64: image(0) }));
  await f.approve({ ...event, revision: 2 }); await f.submit(event);
  const oldPath = f.records.get(`registrationEventPrivate/${event.eventId}`).posterPath;
  const pending = await f.handlers.putRegistrationPoster(f.request('host', { eventId: event.eventId, expectedRevision: 2, mime: 'image/jpeg', base64: image(1) }));
  assert.equal((await f.handlers.getRegistrationPoster(f.request('member', { eventId: event.eventId }))).base64, image(0));
  assert.equal((await f.handlers.getRegistrationPoster(f.request('host', { eventId: event.eventId, view: 'pending' }))).base64, image(1));
  await assert.rejects(f.handlers.getRegistrationPoster(f.request('member', { eventId: event.eventId, view: 'pending' })), { code: 'permission-denied' });
  f.advance(GRACE_MS + 1); const retained = await f.sweep();
  assert.equal(retained.retained, 2);
  assert.equal(f.files.has(oldPath), true);
  const promoted = await f.approve({ ...event, revision: pending.revision });
  assert.equal((await f.handlers.getRegistrationPoster(f.request('member', { eventId: event.eventId }))).base64, image(1));
  const removed = await f.handlers.removeRegistrationPoster(f.request('host', { eventId: event.eventId, expectedRevision: promoted.revision }));
  assert.equal((await f.handlers.getRegistrationEvent(f.request('member', { eventId: event.eventId }))).privateDetails.hasPoster, true);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('host', { eventId: event.eventId }))).pendingChanges.privateDetails.hasPoster, false);
  await f.approve({ ...event, revision: removed.revision });
  await assert.rejects(f.handlers.getRegistrationPoster(f.request('member', { eventId: event.eventId })), { code: 'not-found' });
  f.advance(GRACE_MS + 1); await f.sweep(); assert.equal(f.files.size, 0);
});

test('deleted staged events cannot be approved and metadata validation rejects malformed descriptive fields', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event);
  for (const fields of [{ hostName: 7 }, { reciters: [{ name: 'Missing type' }] }, { prayerOffsetMinutes: 361 }, { timeMode: 'guess' }, { hijriMonth: 13 }]) {
    await assert.rejects(f.handlers.saveRegistrationEvent(f.request('host', {
      eventId: event.eventId, expectedRevision: 1, city: 'sydney', draft: { ...f.draft, ...fields },
    })), { code: 'invalid-argument' });
  }
  const saved = await f.handlers.saveRegistrationEvent(f.request('host', {
    eventId: event.eventId, expectedRevision: 1, city: 'sydney', draft: { ...f.draft, title: 'Staged title' },
  }));
  await f.handlers.deleteRegistrationEvent(f.request('host', { eventId: event.eventId, expectedRevision: saved.revision, confirmation: 'DELETE EVENT' }));
  assert.equal(f.records.has(`registrationPendingChanges/${event.eventId}`), false);
  await assert.rejects(f.approve({ ...event, revision: 3 }), { code: 'failed-precondition' });
});

test('approval races cannot commit stale poster uploads or deliver a superseded pending poster', async () => {
  const f = fixture(); const event = await f.create();
  const image = { mime: 'image/jpeg', base64: Buffer.from([255, 216, 255, 0]).toString('base64') };
  await f.handlers.putRegistrationPoster(f.request('host', { eventId: event.eventId, expectedRevision: 1, ...image }));
  await f.approve({ ...event, revision: 2 });
  const saved = await f.handlers.saveRegistrationEvent(f.request('host', {
    eventId: event.eventId, expectedRevision: 2, city: 'sydney', draft: { ...f.draft, title: 'Publish while uploading' },
  }));
  f.onSave(async () => { f.onSave(null); await f.approve(saved); });
  await assert.rejects(f.handlers.putRegistrationPoster(f.request('host', {
    eventId: event.eventId, expectedRevision: saved.revision, ...image,
  })), { code: 'aborted' });
  assert.equal(f.files.size, 1, 'failed upload cleanup never removes the published object');
  assert.equal(f.records.has(`registrationPendingChanges/${event.eventId}`), false);
  const staged = await f.handlers.putRegistrationPoster(f.request('host', { eventId: event.eventId, expectedRevision: 4, ...image }));
  f.onDownload(async () => { f.onDownload(null); await f.approve({ ...event, revision: staged.revision }); });
  await assert.rejects(f.handlers.getRegistrationPoster(f.request('host', { eventId: event.eventId, view: 'pending' })), { code: 'permission-denied' });
});

test('durable cleanup preserves referenced posters and retries failed deletes after replacement', async () => {
  const f = fixture(); const event = await f.create();
  const data = { eventId: event.eventId, mime: 'image/jpeg', base64: Buffer.from([255,216,255,0]).toString('base64') };
  await f.handlers.putRegistrationPoster(f.request('host', { ...data, expectedRevision: 1 }));
  assert.equal((await f.sweep()).examined, 0, 'grace window protects in-flight uploads');
  f.advance(GRACE_MS + 1);
  assert.equal((await f.sweep()).retained, 1); assert.equal(f.files.size, 1);
  f.onDelete(() => { throw Error('Synthetic storage outage'); });
  await f.handlers.putRegistrationPoster(f.request('host', { ...data, expectedRevision: 2 }));
  assert.equal(f.files.size, 2, 'failed immediate cleanup remains queued');
  f.advance(GRACE_MS + 1);
  const failed = await f.sweep(); assert.equal(failed.deferred, 1); assert.equal(failed.retained, 1);
  assert.equal(f.files.size, 2);
  f.onDelete(null); f.advance(3600000);
  assert.equal((await f.sweep()).removed, 1); assert.equal(f.files.size, 1);
  assert.equal((await f.sweep()).examined, 0);
});

test('failed upload has a cleanup intent; malformed paths never delete outside private event prefix', async () => {
  const f = fixture(); const event = await f.create();
  f.onSave(() => { throw Error('Synthetic upload failure'); });
  await assert.rejects(f.handlers.putRegistrationPoster(f.request('host', { eventId: event.eventId, expectedRevision: 1, mime: 'image/jpeg', base64: Buffer.from([255,216,255,0]).toString('base64') })), /upload failure/);
  assert.equal([...f.records.keys()].filter(key => key.startsWith('registrationPosterCleanup/')).length, 1);
  f.records.set('registrationPosterCleanup/bad', { eventId: event.eventId, path: 'public/keep', state: 'pending', notBefore: '2000-01-01T00:00:00Z' });
  f.files.set('public/keep', {}); f.advance(GRACE_MS + 1);
  const result = await f.sweep(); assert.equal(result.failed, 1); assert.equal(result.removed, 1); assert.equal(f.files.has('public/keep'), true);
  assert.equal(f.records.get('registrationPosterCleanup/bad').state, 'failed');
});

test('discovery is city scoped, private-data free, paginated across filtered rows and review is authorised', async () => {
  const f = fixture(); const event = await f.create();
  const list = (uid, scope, city = 'sydney', cursor = null) => f.handlers.listRegistrationEvents(f.request(uid, { scope, city, cursor }));
  assert.equal((await list(null, 'public')).events.length, 0);
  assert.equal((await list('host', 'public')).events.length, 0);
  assert.equal((await list('admin', 'public')).events.length, 0);
  assert.equal((await list('host', 'mine')).events.length, 1);
  assert.equal((await list('other', 'mine')).events.length, 0);
  await assert.rejects(list('admin', 'review'), { code: 'permission-denied' });
  assert.equal((await list('super', 'review')).events.length, 1);
  f.records.set('registrationEvents/former-city-pending', {
    ...f.records.get(`registrationEvents/${event.eventId}`), city: 'former-disabled-city', ownerUid: 'other',
  });
  const globalReview = await f.handlers.listRegistrationEvents(f.request('super', { scope: 'review' }));
  assert.equal(globalReview.events.length, 2);
  assert.ok(globalReview.events.some(row => row.city === 'former-disabled-city'));
  await assert.rejects(f.handlers.listRegistrationEvents(f.request('admin', { scope: 'review' })), { code: 'permission-denied' });
  assert.equal((await f.handlers.getRegistrationEvent(f.request('super', { eventId: event.eventId }))).canApprove, true);
  assert.equal((await list('admin', 'management')).events.length, 1);
  assert.equal((await list('super', 'management')).events.length, 1);
  await assert.rejects(list('wrongadmin', 'review'), { code: 'permission-denied' });
  await assert.rejects(list('wrongadmin', 'management'), { code: 'permission-denied' });
  await assert.rejects(list(null, 'mine'), { code: 'unauthenticated' });
  await assert.rejects(f.handlers.approveRegistrationEvent(f.request('admin', { eventId: event.eventId, expectedRevision: event.revision })), { code: 'permission-denied' });
  await assert.rejects(f.handlers.approveRegistrationEvent(f.request('host', { eventId: event.eventId, expectedRevision: event.revision })), { code: 'permission-denied' });
  await f.approve(event);
  const publicPage = await list(null, 'public'); assert.equal(publicPage.events.length, 1);
  assert.equal((await list(null, 'public', 'perth')).events.length, 0);
  assert.equal(JSON.stringify(publicPage).includes('Synthetic Lane'), false);
  assert.equal(publicPage.events[0].ownerUid, 'host');
  assert.equal(publicPage.events[0].registrationCount, undefined);
  assert.equal(publicPage.events[0].registrationOnly, true);
  assert.equal(publicPage.events[0].canManage, false);
  assert.equal(publicPage.events[0].canApprove, false);
  assert.equal(publicPage.events[0].isRegistered, false);
  assert.equal(publicPage.events[0].canRegister, true);
  assert.equal(publicPage.events[0].canEditRegistration, false);
  assert.equal(publicPage.events[0].hasPoster, undefined);
  const ownerPage = await list('host', 'public');
  assert.equal(ownerPage.events[0].canManage, true);
  assert.equal(ownerPage.events[0].hasPoster, false);
  assert.equal((await list('admin', 'public')).events[0].canManage, true);
  assert.equal((await list('admin', 'public')).events[0].canApprove, false);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('admin', { eventId: event.eventId }))).canApprove, false);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('super', { eventId: event.eventId }))).canApprove, false);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('host', { eventId: event.eventId }))).canApprove, false);
  assert.equal((await f.handlers.getRegistrationEvent(f.request(null, { eventId: event.eventId }))).event.ownerUid, 'host');
  await f.handlers.putRegistrationPoster(f.request('host', { eventId: event.eventId, expectedRevision: 1, mime: 'image/jpeg', base64: Buffer.from([255,216,255,0]).toString('base64') }));
  assert.equal((await list(null, 'public')).events[0].hasPoster, undefined);
  assert.equal((await list('other', 'public')).events[0].hasPoster, undefined);
  const ownerWithPoster = await list('host', 'public');
  assert.equal(ownerWithPoster.events[0].hasPoster, false, 'published poster is unchanged while awaiting review');
  assert.equal(ownerWithPoster.events[0].hasPendingChanges, true);
  await f.approve({ ...event, revision: 2 });
  assert.equal(JSON.stringify(ownerWithPoster).includes('base64'), false);
  await f.submit(event);
  const registeredPage = await list('member', 'public');
  assert.equal(registeredPage.events[0].isRegistered, true);
  assert.equal(registeredPage.events[0].canEditRegistration, true);
  assert.equal(registeredPage.events[0].hasPoster, true);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('member', { eventId: event.eventId }))).canCancel, true);
  const row = f.records.get(`registrationEvents/${event.eventId}`);
  for (let i = 0; i < 26; i++) f.records.set(`registrationEvents/000-${String(i).padStart(2, '0')}`, { ...row, status: 'pending' });
  const first = await list(null, 'public'); assert.equal(first.events.length, 0); assert.equal(first.nextCursor, '000-24');
  const second = await list(null, 'public', 'sydney', first.nextCursor); assert.equal(second.events.length, 1); assert.equal(second.nextCursor, null);
});

test('cancelled events remain in manager lists, but never appear in public lists', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event);
  await f.handlers.cancelRegistrationEvent(f.request('host', { eventId: event.eventId, expectedRevision: event.revision, confirmation: 'CANCEL EVENT' }));
  for (const scope of ['mine', 'management']) {
    const result = await f.handlers.listRegistrationEvents(f.request(scope === 'mine' ? 'host' : 'admin', { scope, city: 'sydney' }));
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].status, 'cancelled');
  }
  assert.equal((await f.handlers.listRegistrationEvents(f.request(null, { scope: 'public', city: 'sydney' }))).events.length, 0);
});

test('event deletion is manager-only, soft, revisioned and cannot be reversed by saving or approving', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event); await f.submit(event);
  const beforeBooking = structuredClone(f.records.get(`registrationEvents/${event.eventId}/registrations/member`));
  await assert.rejects(f.handlers.deleteRegistrationEvent(f.request('other', { eventId: event.eventId, expectedRevision: 1, confirmation: 'DELETE EVENT' })), { code: 'permission-denied' });
  await assert.rejects(f.handlers.deleteRegistrationEvent(f.request('host', { eventId: event.eventId, expectedRevision: 1, confirmation: 'CANCEL EVENT' })), { code: 'invalid-argument' });
  const deleted = await f.handlers.deleteRegistrationEvent(f.request('host', { eventId: event.eventId, expectedRevision: 1, confirmation: 'DELETE EVENT' }));
  assert.deepEqual(deleted, { eventId: event.eventId, revision: 2, status: 'cancelled', deleted: true });
  const stored = f.records.get(`registrationEvents/${event.eventId}`);
  assert.equal(stored.status, 'cancelled'); assert.equal(stored.deletedBy, 'host'); assert.ok(stored.deletedAt);
  assert.equal(stored.reservedPlaces, 0); assert.equal(stored.registrationCount, 1);
  assert.deepEqual(f.records.get(`registrationEvents/${event.eventId}/registrations/member`), beforeBooking);
  assert.deepEqual(f.records.get(`registrationChanges/${event.eventId}-2`).changes, ['cancelled']);
  await assert.rejects(f.handlers.saveRegistrationEvent(f.request('host', { eventId: event.eventId, expectedRevision: 2, city: 'sydney', draft: f.draft })), { code: 'failed-precondition' });
  await assert.rejects(f.handlers.approveRegistrationEvent(f.request('super', { eventId: event.eventId, expectedRevision: 2 })), { code: 'failed-precondition' });
  for (const scope of ['mine', 'management', 'public', 'review']) {
    assert.equal((await f.handlers.listRegistrationEvents(f.request(scope === 'public' ? null : 'super', { scope, city: 'sydney' }))).events.length, 0);
  }
  const attending = await f.handlers.listRegistrationEvents(f.request('member', { scope: 'attending' }));
  assert.equal(attending.events.length, 1);
  assert.equal(attending.events[0].deleted, true);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('member', { eventId: event.eventId }))).event.deleted, true);
  assert.equal((await f.handlers.getRegistrationEvent(f.request('member', { eventId: event.eventId }))).event.status, 'cancelled');
  assert.deepEqual(await f.handlers.deleteRegistrationEvent(f.request('host', { eventId: event.eventId, expectedRevision: 1, confirmation: 'DELETE EVENT' })), deleted);
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
  assert.deepEqual(f.records.get(`registrationEventPrivate/${event.eventId}`).venue, venue, 'published address remains active');
  assert.equal(f.records.get(`registrationPendingChanges/${event.eventId}`).privateDetails.venue, null);
  await f.approve({ ...event, revision: 2 });
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
  assert.equal(f.records.get(`registrationEvents/${event.eventId}`).status, 'approved');
});

test('approved edits stage review; promotion preserves stable versions and queues private-safe outbox only after approval', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event); await f.submit(event);
  const save = (revision, draft) => f.handlers.saveRegistrationEvent(f.request('host', { eventId: event.eventId, expectedRevision: revision, city: 'sydney', draft }));
  await save(1, { ...f.draft, title: 'New title' });
  const stored = f.records.get(`registrationEvents/${event.eventId}`);
  assert.equal(stored.status, 'approved'); assert.equal(stored.approvedBy, 'super'); assert.equal(stored.formVersion, 1);
  assert.equal([...f.records.keys()].filter(key => key.startsWith('registrationChanges/')).length, 0);
  await save(2, { ...f.draft, purpose: 'Updated purpose' });
  assert.equal(f.records.get(`registrationForms/${event.eventId}`).purpose, f.draft.purpose);
  assert.equal(f.records.get(`registrationChanges/${event.eventId}-3`), undefined);
  await f.approve({ ...event, revision: 3 });
  const change = f.records.get(`registrationChanges/${event.eventId}-4`);
  assert.deepEqual(change.changes, ['form']); assert.equal(change.formVersion, 4);
  assert.equal(JSON.stringify(change).includes('Synthetic Lane'), false); assert.equal(change.fields, undefined);
  await assert.rejects(save(2, f.draft), { code: 'aborted' });
  assert.equal([...f.records.keys()].filter(key => key.startsWith('registrationChanges/')).length, 1);
  const data = { eventId: event.eventId, expectedRevision: 4, mime: 'image/jpeg', base64: Buffer.from([255,216,255,0]).toString('base64') };
  assert.equal((await f.handlers.putRegistrationPoster(f.request('host', data))).status, 'approved');
  assert.equal((await f.handlers.removeRegistrationPoster(f.request('host', { eventId: event.eventId, expectedRevision: 5 }))).status, 'approved');
});

test('after closing, existing attendees can review answers but cannot add seats or reopen cancelled bookings', async () => {
  const f = fixture(); const event = await f.create(); await f.approve(event); await f.submit(event);
  f.advance(Date.parse('2026-11-30T08:00:00Z') - f.now().getTime()); // Sydney 19:00, closed at 18:00.
  await f.handlers.saveRegistrationEvent(f.request('host', { eventId: event.eventId, expectedRevision: 1, city: 'sydney', draft: { ...f.draft, purpose: 'Updated purpose' } }));
  await f.approve({ ...event, revision: 2 });
  const detail = await f.handlers.getRegistrationEvent(f.request('member', { eventId: event.eventId }));
  assert.equal(detail.canRegister, false); assert.equal(detail.canEditRegistration, true); assert.equal(detail.registrationNeedsReview, true);
  await assert.rejects(f.submit(event, 'other', { formVersion: 3 }), { code: 'failed-precondition' });
  await assert.rejects(f.submit(event, 'member', { formVersion: 3, expectedRevision: 1, places: 3, requestId: 'extra' }), { code: 'failed-precondition' });
  await f.submit(event, 'member', { formVersion: 3, expectedRevision: 1, requestId: 'review' });
  assert.equal((await f.handlers.getRegistrationEvent(f.request('member', { eventId: event.eventId }))).registrationNeedsReview, false);
  await f.handlers.cancelEventRegistration(f.request('member', { eventId: event.eventId, expectedRevision: 2 }));
  await assert.rejects(f.submit(event, 'member', { formVersion: 3, expectedRevision: 3, requestId: 'reopen' }), { code: 'failed-precondition' });
});

async function noticeFixture() {
  const f = fixture(); const event = await f.create(); await f.approve(event); await f.submit(event);
  f.records.get('users/member').fcmTokens = ['synthetic-token']; f.advance(1000);
  await f.handlers.saveRegistrationEvent(f.request('host', { eventId: event.eventId, expectedRevision: 1, city: 'sydney', draft: { ...f.draft, purpose: 'Updated purpose' } }));
  await f.approve({ ...event, revision: 2 });
  const changeRef = f.db.collection('registrationChanges').doc(`${event.eventId}-3`);
  const sent = [];
  const worker = createChangeNotifications({ db: f.db, now: f.now, enabled: () => true,
    sendEmail: async (to, notice) => sent.push({ channel: 'email', to, notice }), sendPush: async (to, notice) => sent.push({ channel: 'push', to, notice }) });
  return { ...f, event, changeRef, sent, worker };
}

test('change notices fan out email and push once under concurrent retries with no private content', async () => {
  const f = await noticeFixture(); await Promise.all([f.worker.tick(), f.worker.tick()]); await f.worker.tick();
  assert.deepEqual(f.sent.map(row => row.channel).sort(), ['email', 'push']);
  assert.equal(JSON.stringify(f.sent).includes('Synthetic Lane'), false);
  assert.equal(JSON.stringify(f.sent).includes('Updated purpose'), false);
  assert.equal(f.records.get(f.changeRef.path).state, 'queued');
  assert.equal([...f.records.values()].filter(value => value.state === 'sent').length, 2);
});

test('notice delivery rechecks cancellation, account status and already-reviewed form; later attendees excluded', async () => {
  for (const action of ['cancel', 'ban', 'review']) {
    const f = await noticeFixture(); await f.worker.expand(f.changeRef);
    if (action === 'cancel') await f.handlers.cancelEventRegistration(f.request('member', { eventId: f.event.eventId, expectedRevision: 1 }));
    if (action === 'ban') f.records.get('users/member').accountStatus = 'banned';
    if (action === 'review') await f.submit(f.event, 'member', { formVersion: 3, expectedRevision: 1, requestId: 'review' });
    await f.worker.tick(); assert.equal(f.sent.length, 0, action);
  }
  const f = await noticeFixture(); f.advance(1000); await f.submit(f.event, 'other', { formVersion: 3, places: 1 });
  await f.worker.tick(); assert.equal(f.sent.length, 2);
  assert.equal([...f.records.values()].some(value => value.channel && value.uid === 'other'), false);
});

test('ambiguous email failure is not automatically retried; interrupted claims need operator review', async () => {
  const f = await noticeFixture(); let attempts = 0;
  const worker = createChangeNotifications({ db: f.db, now: f.now, enabled: () => true,
    sendEmail: async () => { attempts++; throw Error('Ambiguous SMTP result'); }, sendPush: async () => ({}) });
  await worker.tick(); await worker.tick(); assert.equal(attempts, 1);
  assert.equal([...f.records.values()].find(value => value.channel === 'email').state, 'review-required');
  f.records.set('registrationNoticeDeliveries/interrupted', { state: 'sending', startedAt: '2020-01-01T00:00:00Z' });
  await worker.tick(); assert.equal(f.records.get('registrationNoticeDeliveries/interrupted').state, 'review-required');
  assert.deepEqual(await createChangeNotifications({ db: f.db }).tick(), { disabled: true });
});

test('notice transport addresses only chosen attendee and provides validated routing payload, no private fields', async () => {
  const mail = []; const pushes = [];
  const transport = createNotificationTransport({ mailer: { sendMail: async payload => mail.push(payload) },
    messaging: { sendEachForMulticast: async payload => { pushes.push(payload); return { failureCount: 0 }; } }, from: 'test@example.com' });
  const notice = { title: 'Review registration', body: 'Review answers', eventId: 'event-1', noticeId: 'job-1', recipientUid: 'member' };
  await transport.sendEmail('member@example.com', notice); await transport.sendPush(['one'], notice);
  assert.equal(mail[0].to, 'member@example.com'); assert.equal(pushes[0].data.module, 'registration');
  assert.equal(pushes[0].data.eventId, 'event-1'); assert.equal(pushes[0].data.recipientUid, 'member');
});

test('organiser cancellation is authorised and idempotent, sends notices, revokes venue and allows answer erasure', async () => {
  const f = await noticeFixture();
  const cancel = uid => f.handlers.cancelRegistrationEvent(f.request(uid, { eventId: f.event.eventId, expectedRevision: 3, confirmation: 'CANCEL EVENT' }));
  await assert.rejects(cancel('other'), { code: 'permission-denied' });
  await assert.rejects(cancel('wrongadmin'), { code: 'permission-denied' });
  assert.deepEqual(await cancel('host'), await cancel('host'));
  const detail = await f.handlers.getRegistrationEvent(f.request('member', { eventId: f.event.eventId }));
  assert.equal(detail.event.status, 'cancelled'); assert.equal(detail.privateDetails, undefined); assert.equal(detail.canCancel, true);
  assert.equal(f.records.get(`registrationEvents/${f.event.eventId}`).reservedPlaces, 0);
  assert.equal(f.records.get(`registrationEvents/${f.event.eventId}/registrations/member`).answers.name, 'Synthetic');
  await assert.rejects(f.handlers.approveRegistrationEvent(f.request('super', { eventId: f.event.eventId, expectedRevision: 3 })), { code: 'failed-precondition' });
  await f.worker.tick(); assert.equal(f.sent.length, 2); assert.ok(f.sent.every(row => row.notice.title.includes('cancelled')));
  const list = await f.handlers.listRegistrationEvents(f.request('member', { scope: 'attending' }));
  assert.equal(list.events.length, 1); assert.equal(JSON.stringify(list).includes('Synthetic Lane'), false);
  assert.equal((await f.handlers.listRegistrationEvents(f.request('other', { scope: 'attending' }))).events.length, 0);
  await f.handlers.cancelEventRegistration(f.request('member', { eventId: f.event.eventId, expectedRevision: 1 }));
  assert.equal((await f.handlers.listRegistrationEvents(f.request('member', { scope: 'attending' }))).events.length, 0);
  assert.equal(f.records.get(`registrationEvents/${f.event.eventId}`).reservedPlaces, 0);
  assert.equal(f.records.get(`registrationEvents/${f.event.eventId}/registrations/member`).answers, undefined);
});

test('account deletion cancels upcoming hosted events once and notifies attendees; history is preserved', async () => {
  const f = await noticeFixture();
  const old = { ...f.records.get(`registrationEvents/${f.event.eventId}`), date: '2020-01-01', title: 'Past event' };
  f.records.set('registrationEvents/historical', old);
  const cleanup = createAccountCleanup({ db: f.db, now: f.now, enabled: () => true });
  await cleanup.enqueue('host'); assert.equal(f.records.has('registrationAccountCleanup/host'), false);
  f.records.get('users/host').accountStatus = 'deleted';
  f.records.set('registrationTemplates/host/items/private-template', { fields: [{ label: 'Private custom template' }] });
  await Promise.all([cleanup.enqueue('host'), cleanup.enqueue('host')]);
  for (let i = 0; i < 4; i++) await Promise.all([cleanup.tick(), cleanup.tick()]);
  assert.equal(f.records.get(`registrationEvents/${f.event.eventId}`).status, 'cancelled');
  assert.equal(f.records.get(`registrationEvents/${f.event.eventId}`).revision, 4);
  assert.equal(f.records.get('registrationEvents/historical').status, 'approved');
  assert.equal(f.records.get('registrationAccountCleanup/host').state, 'complete');
  assert.equal(f.records.has('registrationTemplates/host/items/private-template'), false);
  await f.worker.tick(); assert.equal(f.sent.length, 2); assert.ok(f.sent.every(row => row.notice.title.includes('cancelled')));
});

test('deleted attendee answers and snapshots are erased and capacity is released exactly once', async () => {
  const f = await noticeFixture();
  f.records.get('users/member').accountStatus = 'deleted';
  const cleanup = createAccountCleanup({ db: f.db, now: f.now, enabled: () => true });
  await cleanup.enqueue('member');
  for (let i = 0; i < 4; i++) await Promise.all([cleanup.tick(), cleanup.tick()]);
  const booking = f.records.get(`registrationEvents/${f.event.eventId}/registrations/member`);
  assert.equal(booking.answers, undefined); assert.equal(booking.fields, undefined); assert.equal(booking.revision, 2);
  assert.equal(f.records.get(`registrationEvents/${f.event.eventId}`).reservedPlaces, 0);
  assert.equal(f.records.get(`registrationEvents/${f.event.eventId}`).registrationCount, 0);
  await f.worker.tick(); assert.equal(f.sent.length, 0);
  assert.deepEqual(await createAccountCleanup({ db: f.db }).tick(), { disabled: true });
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

test('review decisions are superadmin-only, revision checked, private, and reset only on resubmission', async () => {
  for (const decision of ['rejected', 'changes-requested']) {
    const f = fixture(); const event = await f.create();
    const data = { eventId: event.eventId, expectedRevision: event.revision, decision, feedback: 'Please correct the date.' };
    await assert.rejects(f.handlers.reviewRegistrationEvent(f.request('host', data)), { code: 'permission-denied' });
    await assert.rejects(f.handlers.reviewRegistrationEvent(f.request('admin', data)), { code: 'permission-denied' });
    await assert.rejects(f.handlers.reviewRegistrationEvent(f.request('super', { ...data, expectedRevision: 99 })), { code: 'aborted' });
    await assert.rejects(f.handlers.reviewRegistrationEvent(f.request('super', { ...data, feedback: '' })), { code: 'invalid-argument' });
    const result = await f.handlers.reviewRegistrationEvent(f.request('super', data));
    const owner = await f.handlers.getRegistrationEvent(f.request('host', { eventId: event.eventId }));
    assert.equal(owner.reviewFeedback.message, data.feedback); assert.equal(owner.canApprove, false);
    assert.equal((await f.handlers.listRegistrationEvents(f.request('super', { scope: 'review' }))).events.length, 0);
    await assert.rejects(f.approve({ ...event, revision: result.revision }), { code: 'failed-precondition' });
    const saved = await f.handlers.saveRegistrationEvent(f.request('host', { city: 'sydney', eventId: event.eventId, expectedRevision: result.revision, draft: f.draft }));
    assert.equal((await f.handlers.listRegistrationEvents(f.request('super', { scope: 'review' }))).events.length, 1);
    await f.approve(saved);
    const staged = await f.handlers.saveRegistrationEvent(f.request('host', { city: 'sydney', eventId: event.eventId, expectedRevision: saved.revision, draft: { ...f.draft, title: 'Changed title' } }));
    await f.handlers.reviewRegistrationEvent(f.request('super', { ...data, expectedRevision: staged.revision }));
    const publicView = await f.handlers.getRegistrationEvent(f.request('other', { eventId: event.eventId }));
    assert.equal(publicView.event.title, f.draft.title); assert.equal(publicView.reviewFeedback, undefined);
    assert.equal(publicView.pendingChanges, undefined); assert.equal(publicView.privateDetails, undefined);
    const hostView = await f.handlers.getRegistrationEvent(f.request('host', { eventId: event.eventId }));
    assert.equal(hostView.pendingChanges.event.title, 'Changed title');
  }
});

test('list pages batch current access checks and never load forms, pending drafts or answer payloads', async () => {
  const f = fixture(), saved = await f.create(); await f.approve(saved);
  const original = f.records.get(`registrationEvents/${saved.eventId}`);
  for (let i = 0; i < 24; i++) {
    const id = `summary-${String(i).padStart(2, '0')}`;
    f.records.set(`registrationEvents/${id}`, { ...original, title: `Summary ${i}` });
    f.records.set(`registrationEventPrivate/${id}`, { address: '99 Hidden Private Road', posterPath: 'private-object' });
    f.records.set(`registrationForms/${id}`, { fields: [{ id:'secret', label:'Private form not needed by cards' }] });
  }
  const reads = [], transaction = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = work => transaction(tx => work({ ...tx, get: ref => { reads.push(ref.path); return tx.get(ref); } }));
  const page = await f.handlers.listRegistrationEvents(f.request('member', { scope:'public', city:'sydney' }));
  assert.equal(page.events.length, 25);
  assert.equal(reads.filter(path => path === 'users/member').length, 1);
  assert.equal(reads.some(path => path.startsWith('registrationForms/') || path.startsWith('registrationPendingChanges/')), false);
  assert.ok(reads.length <= 76, `Bounded summary reads: ${reads.length}`);
  assert.doesNotMatch(JSON.stringify(page), /99 Hidden Private Road|private-object|Private form not needed/);
  assert.ok(page.events.every(event => event.canManage === false && !event.hasPoster));
});

test('participant questions repeat exactly per place; booking contacts and consent remain single', async () => {
  const f=fixture(); f.draft.capacity=10; f.draft.fields[0].perParticipant=true;
  const event=await f.create(); await f.approve(event);
  await assert.rejects(f.submit(event,'member',{places:2,answers:{name:'One shared name',consent:true}}),{code:'invalid-argument'});
  const answers={'participant:1:name':'First child','participant:2:name':'Second child',consent:true,'participant:3:name':'Discard extra'};
  const result=await f.submit(event,'member',{places:2,answers});
  const saved=f.records.get(`registrationEvents/${event.eventId}/registrations/member`);
  assert.equal(result.places,2);assert.equal(saved.answers['participant:1:name'],'First child');assert.equal(saved.answers['participant:2:name'],'Second child');assert.equal(saved.answers['participant:3:name'],undefined);
  assert.deepEqual(saved.fields.filter(field=>field.participantIndex).map(field=>field.label),['Participant 1 — Name','Participant 2 — Name']);
  assert.equal(saved.fields.filter(field=>field.type==='consent').length,1);
  await assert.rejects(f.submit(event,'other',{places:6,answers,requestId:'too-many'}),{code:'invalid-argument'});
  const reduced=await f.submit(event,'member',{places:1,expectedRevision:result.revision,requestId:'reduce',answers});
  assert.equal(reduced.places,1);assert.equal(f.records.get(`registrationEvents/${event.eventId}/registrations/member`).answers['participant:2:name'],undefined);
});

test('participant templates preserve scope; agreement cannot become a repeated participant question',async()=>{
  const f=fixture();f.draft.fields[0].perParticipant=true;
  const template=await f.handlers.saveRegistrationTemplate(f.request('host',{templateId:'participants',name:'Children',purpose:'Arrange attendance',fields:f.draft.fields}));
  const saved=[...f.records.values()].find(row=>row.name==='Children');assert.equal(saved.fields[0].perParticipant,true);
  f.draft.fields[1].perParticipant=true;await assert.rejects(f.create(),{code:'invalid-argument'});
});

test('my events keeps submissions separate from bookings and denies attendee organiser operations',async()=>{
 const f=fixture();const one=await f.create();const two=await f.handlers.saveRegistrationEvent(f.request('other',{city:'sydney',createKey:'other-event',draft:f.draft}));await f.approve(one);await f.approve(two);await f.submit(one);
 const mine=await f.handlers.listRegistrationEvents(f.request('member',{scope:'mine'}));assert.equal(mine.events.length,0);
 const attending=await f.handlers.listRegistrationEvents(f.request('member',{scope:'attending'}));assert.deepEqual(attending.events.map(row=>row.id),[one.eventId]);assert.equal(attending.events[0].canManage,false);
 assert.deepEqual((await f.handlers.listRegistrationEvents(f.request('host',{scope:'mine'}))).events.map(row=>row.id),[one.eventId]);
 await assert.rejects(f.handlers.listEventRegistrations(f.request('member',{eventId:one.eventId})),{code:'permission-denied'});
});
test('submitter name comes from the authenticated creator and older events resolve it without exposing email',async()=>{
 const f=fixture();f.records.get('users/host').fullName='Actual Creator';f.draft.submittedByName='Spoofed Name';const event=await f.create();assert.equal(f.records.get('registrationEvents/'+event.eventId).submittedByName,'Actual Creator');await f.approve(event);
 const stored=f.records.get('registrationEvents/'+event.eventId);delete stored.submittedByName;
 const listed=await f.handlers.listRegistrationEvents(f.request(null,{scope:'public',city:'sydney'}));assert.equal(listed.events[0].submittedByName,'Actual Creator');assert.equal(JSON.stringify(listed).includes('test@example.com'),false);
 const detail=await f.handlers.getRegistrationEvent(f.request('member',{eventId:event.eventId}));assert.equal(detail.event.submittedByName,'Actual Creator');
});


test('lightweight cards skip forms and staged drafts, omit answers and preserve current privacy checks',async()=>{
 const f=fixture(),created=await f.create();await f.approve(created);await f.submit(created);
 await f.handlers.saveRegistrationEvent(f.request('host',{eventId:created.eventId,expectedRevision:1,city:'sydney',draft:{...f.draft,title:'Staged title'}}));
 f.reads.length=0;
 const host=await f.handlers.getRegistrationEvent(f.request('host',{eventId:created.eventId,cardOnly:true,includeOccurrences:true,includeSeriesReview:true}));
 assert.equal(host.canManage,true);assert.equal(host.event.hasPendingChanges,true);assert.ok(host.privateDetails);
 assert.ok(!f.reads.some(path=>/registrationForms|registrationPendingChanges/.test(path)),'card opening does not read form or staged drafts');
 assert.equal(host.form,undefined);assert.equal(host.pendingChanges,undefined);assert.equal(host.occurrences,undefined);
 const attendee=await f.handlers.getRegistrationEvent(f.request('member',{eventId:created.eventId,cardOnly:true}));
 assert.equal(attendee.ownRegistration.places,2);assert.equal(attendee.ownRegistration.answers,undefined);assert.equal(attendee.ownRegistration.fields,undefined);assert.ok(attendee.privateDetails);
 const stranger=await f.handlers.getRegistrationEvent(f.request('other',{eventId:created.eventId,cardOnly:true}));assert.equal(stranger.privateDetails,undefined);assert.equal(stranger.ownRegistration,null);
 const full=await f.handlers.getRegistrationEvent(f.request('member',{eventId:created.eventId}));assert.ok(full.form);assert.equal(full.ownRegistration.answers.name,'Synthetic');
 const event=f.records.get(`registrationEvents/${created.eventId}`);event.status='cancelled';event.deletedAt='now';
 const history=await f.handlers.getRegistrationEvent(f.request('member',{eventId:created.eventId,cardOnly:true}));assert.equal(history.event.deleted,true);assert.equal(history.privateDetails,undefined);assert.equal(history.canRegister,false);assert.equal(history.canEditRegistration,false);
 await assert.rejects(f.handlers.getRegistrationEvent(f.request('other',{eventId:created.eventId,cardOnly:true})),{code:'not-found'});
});


test('hidden registrations disappear for guests and attendees, but retain bookings and manager access',async()=>{
 const f=fixture(),event=await f.create();await f.approve(event);await f.submit(event);
 const booking=structuredClone(f.records.get(`registrationEvents/${event.eventId}/registrations/member`));
 const changed=await f.handlers.setRegistrationEventVisibility(f.request('host',{eventId:event.eventId,expectedRevision:1,hidden:true}));
 assert.equal(changed.hidden,true);assert.equal(changed.revision,2);
 assert.deepEqual(f.records.get(`registrationEvents/${event.eventId}/registrations/member`),booking);
 assert.equal(f.records.get(`registrationEvents/${event.eventId}`).reservedPlaces,2);
 for(const uid of [null,'member','other','wrongadmin']) {
  for(const cardOnly of [false,true])await assert.rejects(f.handlers.getRegistrationEvent(f.request(uid,{eventId:event.eventId,cardOnly})),{code:'not-found',message:'The organiser has chosen to hide this event. It is currently unavailable.'});
 }
 assert.equal((await f.handlers.listRegistrationEvents(f.request(null,{scope:'public',city:'sydney'}))).events.length,0);
 assert.equal((await f.handlers.listRegistrationEvents(f.request('member',{scope:'attending'}))).events.length,0);
 for(const uid of ['host','admin','super'])assert.equal((await f.handlers.getRegistrationEvent(f.request(uid,{eventId:event.eventId}))).event.hidden,true);
 assert.equal((await f.handlers.listRegistrationEvents(f.request('host',{scope:'mine'}))).events[0].hidden,true);
 assert.equal((await f.handlers.listRegistrationEvents(f.request('admin',{scope:'management',city:'sydney'}))).events[0].hidden,true);
 await assert.rejects(f.submit(event,'member',{expectedRevision:1,requestId:'edit-hidden'}),{code:'not-found'});
 await assert.rejects(f.submit(event,'other'),{code:'not-found'});
 await assert.rejects(f.handlers.getRegistrationPoster(f.request('member',{eventId:event.eventId})),{code:'not-found'});
 await f.handlers.setRegistrationEventVisibility(f.request('admin',{eventId:event.eventId,expectedRevision:2,hidden:false}));
 assert.equal((await f.handlers.getRegistrationEvent(f.request('member',{eventId:event.eventId}))).ownRegistration.status,'registered');
 assert.equal((await f.handlers.listRegistrationEvents(f.request('member',{scope:'attending'}))).events.length,1);
 assert.equal(f.records.get(`registrationEvents/${event.eventId}`).status,'approved');
});

test('visibility mutations require scoped management, valid state and current revision',async()=>{
 const f=fixture(),event=await f.create();await f.approve(event);
 const change=(uid,overrides={})=>f.handlers.setRegistrationEventVisibility(f.request(uid,{eventId:event.eventId,expectedRevision:1,hidden:true,...overrides}));
 for(const uid of ['member','other','wrongadmin'])await assert.rejects(change(uid),{code:'permission-denied'});
 await assert.rejects(change(null),{code:'unauthenticated'});
 await assert.rejects(change('host',{hidden:'true'}),{code:'invalid-argument'});
 await assert.rejects(change('host',{expectedRevision:0}),{code:'aborted'});
 await change('host');
 await assert.rejects(change('super',{hidden:false}),{code:'aborted'});
 await f.handlers.cancelRegistrationEvent(f.request('host',{eventId:event.eventId,expectedRevision:2,confirmation:'CANCEL EVENT'}));
 await assert.rejects(change('host',{expectedRevision:3,hidden:false}),{code:'failed-precondition'});
});

test('saving and approving edits never unhides an event',async()=>{
 const f=fixture(),event=await f.create();await f.approve(event);
 await f.handlers.setRegistrationEventVisibility(f.request('host',{eventId:event.eventId,expectedRevision:1,hidden:true}));
 const saved=await f.handlers.saveRegistrationEvent(f.request('host',{eventId:event.eventId,city:'sydney',expectedRevision:2,draft:{...f.draft,title:'Updated while hidden'}}));
 await f.approve(saved);
 assert.equal(f.records.get(`registrationEvents/${event.eventId}`).hidden,true);
 assert.equal((await f.handlers.listRegistrationEvents(f.request(null,{scope:'public',city:'sydney'}))).events.length,0);
});

test('hidden series occurrences cannot be discovered or submitted by attendees',async()=>{
 const f=fixture(),series=await f.handlers.createRegistrationSeries(f.request('host',seriesRequest(f)));
 for(const row of series.events)await f.approve(row);
 const [first,second]=series.events.map(row=>row.eventId);
 await f.handlers.setRegistrationEventVisibility(f.request('host',{eventId:second,expectedRevision:1,hidden:true}));
 const detail=await f.handlers.getRegistrationEvent(f.request('member',{eventId:first,includeOccurrences:true}));
 assert.deepEqual(detail.occurrences.map(row=>row.eventId),[first]);
 await assert.rejects(f.handlers.submitRegistrationOccurrences(f.request('member',{eventId:first,requestId:'hidden-series',places:1,answers:{name:'Synthetic',consent:true},occurrences:series.events.map(row=>({eventId:row.eventId,formVersion:1,expectedRevision:0}))})));
 assert.equal(f.records.get(`registrationEvents/${first}`).reservedPlaces,0);
});
