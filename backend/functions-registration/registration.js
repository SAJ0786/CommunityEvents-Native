const { createHash, randomUUID } = require('node:crypto');
const model = import('./formModel.mjs');
const catalogueModel = import('./cityCatalogue.mjs');
const venueModel = import('./privateVenue.mjs');
const RETENTION = Object.freeze({ policy: 'until-organiser-deletes-or-attendee-cancels', notice: 'Your registration answers are kept until the organiser deletes them or you cancel/delete your registration. Cancelling deletes your answers and releases your places. Organiser answer deletion alone does not cancel your booking. Account deletion and privacy requests are handled separately.' });
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const clone = value => JSON.parse(JSON.stringify(value));
function localMinute(now, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function active(profile) {
  return profile && profile.isActive !== false && !profile.bannedAt && !profile.archivedAt && !profile.accountDeletedAt
    && !['inactive', 'banned', 'deleted', 'archived', 'suspended'].includes(profile.accountStatus);
}
function manages(actor, event) {
  return actor.uid === event.ownerUid || actor.profile.role === 'superAdmin'
    || (actor.profile.role === 'admin' && Boolean(actor.profile.adminCity || actor.profile.defaultCity) && (actor.profile.adminCity || actor.profile.defaultCity) === event.city);
}
function approves(actor, event) {
  return actor.profile.role === 'superAdmin' || (actor.profile.role === 'admin' && Boolean(actor.profile.adminCity || actor.profile.defaultCity) && (actor.profile.adminCity || actor.profile.defaultCity) === event.city);
}
function createRegistrationHandlers({ db, bucket, HttpsError, now = () => new Date(), enabled = () => false }) {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  const id = value => { if (typeof value !== 'string' || !ID.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) fail('invalid-argument', 'Invalid record reference.'); return value; };
  const gate = () => { if (!enabled()) fail('failed-precondition', 'Event registration is not available yet.'); };
  const eventRef = value => db.collection('registrationEvents').doc(id(value));
  const privateRef = value => db.collection('registrationEventPrivate').doc(id(value));
  const formRef = value => db.collection('registrationForms').doc(id(value));
  const bookingRef = (eventId, uid) => eventRef(eventId).collection('registrations').doc(id(uid));
  async function actor(request, transaction) {
    gate();
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') fail('unauthenticated', 'Sign in to continue.');
    const ref = db.collection('users').doc(id(request.auth.uid));
    const snapshot = transaction ? await transaction.get(ref) : await ref.get();
    if (!snapshot.exists || !active(snapshot.data())) fail('permission-denied', 'An active member account is required.');
    return { uid: request.auth.uid, profile: snapshot.data() };
  }
  async function readEvent(value, transaction) {
    const ref = eventRef(value); const snap = transaction ? await transaction.get(ref) : await ref.get();
    if (!snap.exists) fail('not-found', 'Event not found.');
    return { ...snap.data(), id: ref.id };
  }
  async function zone(city, transaction) {
    const ref = db.collection('settings').doc('cityCatalogue');
    const snapshot = transaction ? await transaction.get(ref) : await ref.get();
    const { validateCityCatalogue, BUNDLED_CITY_CATALOGUE } = await catalogueModel;
    const catalogue = snapshot.exists ? validateCityCatalogue(snapshot.data()) : BUNDLED_CITY_CATALOGUE;
    if (!catalogue) fail('failed-precondition', 'City configuration needs administrator review.');
    const result = catalogue.cities.find(row => row.id === city && row.enabled === true)?.timeZone;
    try { if (!result || !result.startsWith('Australia/')) throw Error(); localMinute(now(), result); } catch { fail('invalid-argument', 'Choose an enabled Australian event city with a valid timezone.'); }
    return result;
  }
  async function cleanDraft(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.fields) || raw.fields.length > 30) fail('invalid-argument', 'A valid event and form are required.');
    const text = (value, limit, optional = false) => {
      if (typeof value !== 'string' || value.length > limit || (!optional && !value.trim())) fail('invalid-argument', 'A text field is missing or too long.');
      return value.trim();
    };
    const draft = {
      title: text(raw.title, 160), eventType: text(raw.eventType, 80), customEventType: text(raw.customEventType || '', 80, true),
      date: text(raw.date, 10), suburb: text(raw.suburb, 100), address: text(raw.address, 500), notes: text(raw.notes || '', 5000, true),
      closes: text(raw.closes || '', 16, true), capacity: Number(raw.capacity), allowCancellation: raw.allowCancellation === true,
      purpose: text(raw.purpose, 1000),
      fields: raw.fields.map(field => {
        if (!field || typeof field !== 'object') fail('invalid-argument', 'Invalid question.');
        return { id: id(field.id), type: text(field.type, 20), label: text(field.label, 200), description: text(field.description || '', 500, true), terms: text(field.terms || '', 1000, true), required: field.required === true,
          options: Array.isArray(field.options) && field.options.length <= 20 ? field.options.map(option => text(option, 100)) : [] };
      }),
    };
    if (/[\d\r\n,/:]/u.test(draft.suburb)) fail('invalid-argument', 'The public location must contain only a suburb name, not a street address.');
    const errors = (await model).validateDraft(draft);
    if (errors.length) fail('invalid-argument', errors.join(' '));
    return draft;
  }
  const checkOpen = event => {
    if (event.status !== 'approved' || localMinute(now(), event.timeZone) >= (event.closes || `${event.date}T00:00`)) fail('failed-precondition', 'Registration is closed or this event is not approved.');
  };
  async function saveRegistrationEvent(request) {
    gate(); const draft = await cleanDraft(request.data?.draft);
    // The legacy prototype has no coordinates. New production clients supply a
    // selected venue; reject partial/tampered coordinates rather than retaining a stale pin.
    const suppliedVenue = request.data?.draft?.venue;
    const venue = suppliedVenue == null ? null : (await venueModel).normalisePrivateVenue(suppliedVenue);
    if (suppliedVenue != null && (!venue || venue.fullAddress !== draft.address || venue.suburb !== draft.suburb)) fail('invalid-argument', 'Select the full address again and confirm its public suburb.');
    const city = id(request.data?.city);
    const createKey = request.data?.eventId ? null : id(request.data?.createKey);
    const fingerprint = createHash('sha256').update(JSON.stringify({ draft, city, venue })).digest('hex');
    const reference = request.data?.eventId ? eventRef(request.data.eventId) : eventRef(createHash('sha256').update(`${request.auth?.uid}:${createKey}`).digest('hex'));
    return db.runTransaction(async tx => {
      const caller = await actor(request, tx); const currentSnap = await tx.get(reference); const current = currentSnap.exists ? currentSnap.data() : null;
      if (current && createKey) {
        if (current.ownerUid !== caller.uid || current.creationFingerprint !== fingerprint) fail('already-exists', 'This event creation reference was already used.');
        return { eventId: reference.id, revision: current.revision, status: current.status };
      }
      if (current && (!manages(caller, current) || !manages(caller, { ...current, city }))) fail('permission-denied', 'You cannot edit this event.');
      if (current && request.data.expectedRevision !== current.revision) fail('aborted', 'The event has changed. Reload before saving.');
      const timeZone = await zone(city, tx);
      if (draft.capacity < (current?.reservedPlaces || 0)) fail('failed-precondition', 'Capacity cannot be lower than existing registrations.');
      const revision = (current?.revision || 0) + 1;
      const publicData = { ...(await model).publicEvent(draft), city, timeZone, ownerUid: current?.ownerUid || caller.uid, revision,
        formVersion: revision, status: 'pending', reservedPlaces: current?.reservedPlaces || 0, registrationCount: current?.registrationCount || 0,
        createdAt: current?.createdAt || now().toISOString(), updatedAt: now().toISOString(), allowCancellation: draft.allowCancellation, creationFingerprint: current?.creationFingerprint || fingerprint };
      tx.set(reference, publicData);
      tx.set(privateRef(reference.id), { address: draft.address, venue }, { merge: true });
      tx.set(formRef(reference.id), { version: revision, fields: draft.fields, purpose: draft.purpose });
      return { eventId: reference.id, revision, status: 'pending' };
    });
  }
  async function approveRegistrationEvent(request) {
    return db.runTransaction(async tx => {
      const caller = await actor(request, tx); const event = await readEvent(request.data?.eventId, tx);
      if (!approves(caller, event)) fail('permission-denied', 'An authorised city admin or super admin must approve this event.');
      if (request.data.expectedRevision !== event.revision) fail('aborted', 'Review the latest event before approval.');
      if (localMinute(now(), event.timeZone) >= (event.closes || `${event.date}T00:00`)) fail('failed-precondition', 'The registration closing time has passed.');
      tx.update(eventRef(event.id), { status: 'approved', approvedBy: caller.uid, approvedAt: now().toISOString() });
      return { eventId: event.id, status: 'approved' };
    });
  }
  async function submitEventRegistration(request) {
    const eventId = id(request.data?.eventId); const requestId = id(request.data?.requestId);
    const hash = createHash('sha256').update(JSON.stringify({ answers: request.data.answers, places: request.data.places, formVersion: request.data.formVersion, expectedRevision: request.data.expectedRevision })).digest('hex');
    return db.runTransaction(async tx => {
      const caller = await actor(request, tx); const event = await readEvent(eventId, tx);
      const operationId = createHash('sha256').update(JSON.stringify([caller.uid, requestId])).digest('hex');
      const receiptRef = eventRef(eventId).collection('operations').doc(operationId);
      const receipt = await tx.get(receiptRef);
      if (receipt.exists) { if (receipt.data().hash !== hash) fail('already-exists', 'This submission reference was already used.'); return receipt.data().result; }
      checkOpen(event);
      const formSnap = await tx.get(formRef(eventId)); const form = formSnap.data();
      if (!form || request.data.formVersion !== form.version) fail('failed-precondition', 'The form changed. Reload and review the latest questions and terms.');
      const ref = bookingRef(eventId, caller.uid); const previousSnap = await tx.get(ref); const previous = previousSnap.exists ? previousSnap.data() : null;
      if ((request.data.expectedRevision || 0) !== (previous?.revision || 0)) fail('aborted', 'Your registration changed. Reload before editing.');
      const rawAnswers = request.data.answers;
      if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) fail('invalid-argument', 'Answers are required.');
      const answers = {};
      for (const field of form.fields) {
        if (!Object.hasOwn(rawAnswers, field.id)) continue;
        const value = rawAnswers[field.id];
        if (!(typeof value === 'string' || typeof value === 'boolean' || (Array.isArray(value) && value.length <= 20 && value.every(item => typeof item === 'string' && item.length <= 100)))) fail('invalid-argument', 'Unsupported answer value.');
        Object.defineProperty(answers, field.id, { value, enumerable: true });
      }
      const errors = (await model).validateAnswers(form.fields, answers, request.data.places, event.capacity);
      if (Object.keys(errors).length) fail('invalid-argument', Object.values(errors).join(' '));
      const places = Number(request.data.places); const previousPlaces = previous?.status === 'registered' ? previous.places : 0;
      const reservedPlaces = event.reservedPlaces - previousPlaces + places;
      if (reservedPlaces > event.capacity) fail('resource-exhausted', 'Not enough places remain. Choose fewer places or try another event.');
      const result = { eventId, registrationId: caller.uid, revision: (previous?.revision || 0) + 1, status: 'registered', places, formVersion: form.version };
      tx.set(ref, { ...result, uid: caller.uid, answers: clone(answers), fields: clone(form.fields), retentionPolicy: RETENTION.policy, submittedAt: previous?.submittedAt || now().toISOString(), updatedAt: now().toISOString() });
      tx.update(eventRef(eventId), { reservedPlaces, registrationCount: event.registrationCount + (previous?.status === 'registered' ? 0 : 1) });
      tx.set(receiptRef, { uid: caller.uid, hash, result, createdAt: now().toISOString() });
      return result;
    });
  }
  async function cancelEventRegistration(request) {
    return db.runTransaction(async tx => {
      const caller = await actor(request, tx); const event = await readEvent(request.data?.eventId, tx);
      const ref = bookingRef(event.id, caller.uid); const snapshot = await tx.get(ref); const booking = snapshot.data();
      if (!booking || booking.status === 'cancelled') return { status: 'cancelled' };
      if (!event.allowCancellation || localMinute(now(), event.timeZone).slice(0, 10) >= event.date) fail('failed-precondition', 'Cancellation is not available. Contact the organiser.');
      if (request.data.expectedRevision !== booking.revision) fail('aborted', 'Reload your registration before cancelling.');
      // Do not retain form entries in cancelled bookings. Replace (not merge)
      // with a minimal tombstone for revision/idempotency; no question snapshots,
      // contact answers or other submitted values remain here or in operation receipts.
      tx.set(ref, { eventId: event.id, registrationId: caller.uid, uid: caller.uid,
        status: 'cancelled', revision: booking.revision + 1, places: 0,
        cancelledAt: now().toISOString(), answersDeletedAt: now().toISOString() });
      tx.update(eventRef(event.id), { reservedPlaces: event.reservedPlaces - booking.places, registrationCount: event.registrationCount - 1 });
      return { status: 'cancelled', revision: booking.revision + 1 };
    });
  }
  async function getRegistrationEvent(request) {
    gate();
    return db.runTransaction(async tx => {
      const caller = request.auth && request.auth.token?.firebase?.sign_in_provider !== 'anonymous' ? await actor(request, tx) : null;
      const event = await readEvent(request.data?.eventId, tx);
      const manager = caller && manages(caller, event);
      const ownSnap = caller ? await tx.get(bookingRef(event.id, caller.uid)) : null;
      const own = ownSnap?.exists ? ownSnap.data() : null;
      const registered = own?.status === 'registered';
      if (event.status !== 'approved' && !manager && !registered) fail('not-found', 'Event not available.');
      const form = await tx.get(formRef(event.id));
      const details = await tx.get(privateRef(event.id));
      const result = { event: { ...(await model).publicEvent({ ...event, address: details.data()?.address || '' }), id: event.id, status: event.status, city: event.city, timeZone: event.timeZone, revision: event.revision, formVersion: event.formVersion, allowCancellation: event.allowCancellation === true }, form: form.data(), ownRegistration: own, canManage: Boolean(manager) };
      result.canApprove = Boolean(caller && approves(caller, event));
      result.canRegister = event.status === 'approved' && localMinute(now(), event.timeZone) < (event.closes || `${event.date}T00:00`);
      result.canCancel = Boolean(registered && event.allowCancellation && localMinute(now(), event.timeZone).slice(0, 10) < event.date);
      result.retention = RETENTION;
      if (manager) result.event.registrationCount = event.registrationCount;
      if (manager || registered) result.privateDetails = { address: details.data()?.address || '', venue: (await venueModel).normalisePrivateVenue(details.data()?.venue), hasPoster: Boolean(details.data()?.posterPath) };
      return result;
    });
  }
  async function listRegistrationEvents(request) {
    gate();
    const scope = request.data?.scope || 'public';
    if (!['public', 'mine', 'review'].includes(scope)) fail('invalid-argument', 'Choose a valid event list.');
    const caller = scope === 'public' ? null : await actor(request);
    const city = scope === 'mine' ? null : id(request.data?.city);
    if (scope === 'review' && !approves(caller, { city })) fail('permission-denied', 'You cannot review this city.');
    // One equality + document ID order uses a bounded page; filtering MUST NOT
    // move the cursor to the last visible row or pending rows could cause loops.
    let query = db.collection('registrationEvents').where(scope === 'mine' ? 'ownerUid' : 'city', '==', scope === 'mine' ? caller.uid : city).orderBy('__name__').limit(25);
    if (request.data?.cursor) query = query.startAfter(id(request.data.cursor));
    const page = await query.get(); const events = [];
    for (const doc of page.docs) {
      const event = doc.data();
      if (scope === 'public' && (event.status !== 'approved' || event.date < localMinute(now(), event.timeZone).slice(0, 10))) continue;
      if (scope === 'review' && event.status !== 'pending') continue;
      // Re-read through the transactional detail policy to handle approval/access
      // changes during pagination. Only the public allowlist leaves this endpoint.
      try {
        const result = await getRegistrationEvent({ ...request, data: { eventId: doc.id } });
        if (scope === 'public' && result.event.status !== 'approved') continue;
        if (scope === 'review' && (!result.canApprove || result.event.status !== 'pending')) continue;
        const { registrationCount, ...publicCard } = result.event;
        events.push(publicCard);
      } catch (error) { if (error.code !== 'not-found') throw error; }
    }
    return { events, nextCursor: page.docs.length === 25 ? page.docs.at(-1).id : null };
  }
  async function listEventRegistrations(request) {
    const caller = await actor(request); const event = await readEvent(request.data?.eventId);
    if (!manages(caller, event)) fail('permission-denied', 'Only the organiser or authorised admins may view responses.');
    let query = eventRef(event.id).collection('registrations').orderBy('__name__').limit(50);
    if (request.data.cursor) query = query.startAfter(id(request.data.cursor));
    const snapshots = await query.get();
    return { registrations: snapshots.docs.map(doc => doc.data()), nextCursor: snapshots.docs.length === 50 ? snapshots.docs.at(-1).id : null };
  }
  async function deleteRegistrationAnswers(request) {
    if (request.data?.confirmation !== 'DELETE ANSWERS') fail('invalid-argument', 'Confirm that you want to permanently delete these answers.');
    return db.runTransaction(async tx => {
      const caller = await actor(request, tx); const event = await readEvent(request.data?.eventId, tx);
      if (!manages(caller, event)) fail('permission-denied', 'Only the organiser or authorised admins may delete responses.');
      const ref = bookingRef(event.id, request.data?.registrationId); const snapshot = await tx.get(ref);
      if (!snapshot.exists) fail('not-found', 'Registration not found.');
      const booking = snapshot.data();
      if (booking.answersDeletedAt) return { deleted: true, revision: booking.revision };
      if (request.data.expectedRevision !== booking.revision) fail('aborted', 'The attendee changed their response. Review it again before deleting.');
      const revision = booking.revision + 1;
      // Retain only booking metadata needed for capacity/access/retry safety. No
      // answers or question snapshots remain; cancellation is a separate action.
      const metadata = { eventId: event.id, registrationId: ref.id, uid: ref.id, revision,
        status: booking.status, places: booking.places, formVersion: booking.formVersion,
        submittedAt: booking.submittedAt, updatedAt: now().toISOString(),
        answers: {}, fields: [], answersDeletedAt: now().toISOString(), answersDeletedBy: caller.uid,
        retentionPolicy: RETENTION.policy };
      tx.set(ref, metadata);
      return { deleted: true, revision };
    });
  }
  async function putRegistrationPoster(request) {
    const caller = await actor(request); const event = await readEvent(request.data?.eventId);
    if (!manages(caller, event)) fail('permission-denied', 'You cannot change this poster.');
    const base64 = request.data.base64; const mime = request.data.mime;
    if (typeof base64 !== 'string' || base64.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) fail('invalid-argument', 'Invalid image.');
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.toString('base64') !== base64) fail('invalid-argument', 'Invalid image encoding.');
    const isImage = (mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
      || (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
      || (mime === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
    if (!isImage || bytes.length > 5 * 1024 * 1024) fail('invalid-argument', 'Use a JPEG, PNG or WebP image up to 5 MB.');
    const digest = createHash('sha256').update(bytes).digest('hex');
    // Unique objects ensure cleaning up a failed concurrent upload cannot delete
    // another request's committed poster, even when the bytes are identical.
    const path = `registration-private/${event.id}/${digest}-${randomUUID()}`;
    await bucket.file(path).save(bytes, { resumable: false, metadata: { contentType: mime, cacheControl: 'private, no-store' } });
    // Recheck role and revision after upload; never create a public/download-token URL.
    let previousPath; let nextRevision;
    try { await db.runTransaction(async tx => {
      const currentActor = await actor(request, tx); const currentEvent = await readEvent(event.id, tx);
      const previous = await tx.get(privateRef(event.id));
      if (!manages(currentActor, currentEvent)) fail('permission-denied', 'You cannot change this poster.');
      if (request.data.expectedRevision !== currentEvent.revision) fail('aborted', 'The event changed. Reload before updating its poster.');
      previousPath = previous.data()?.posterPath; nextRevision = currentEvent.revision + 1;
      tx.set(privateRef(event.id), { posterPath: path, posterMime: mime }, { merge: true });
      tx.update(eventRef(event.id), { status: 'pending', revision: nextRevision });
    }); } catch (error) {
      await bucket.file(path).delete({ ignoreNotFound: true }).catch(() => {});
      throw error;
    }
    if (previousPath && previousPath !== path && previousPath.startsWith(`registration-private/${event.id}/`)) await bucket.file(previousPath).delete({ ignoreNotFound: true }).catch(() => {});
    return { uploaded: true, revision: nextRevision, status: 'pending' };
  }
  async function getRegistrationPoster(request) {
    const details = await getRegistrationEvent(request);
    if (!details.privateDetails) fail('permission-denied', 'Register before viewing the poster.');
    const snapshot = await privateRef(details.event.id).get(); const data = snapshot.data();
    if (!data?.posterPath) fail('not-found', 'No poster has been uploaded.');
    const [bytes] = await bucket.file(data.posterPath).download();
    // Download may take time: cancellation or removal must revoke subsequent delivery.
    const current = await getRegistrationEvent(request);
    const latest = await privateRef(details.event.id).get();
    if (!current.privateDetails || latest.data()?.posterPath !== data.posterPath) fail('permission-denied', 'Poster access changed. Reload the event.');
    return { mime: data.posterMime, base64: bytes.toString('base64') };
  }
  async function removeRegistrationPoster(request) {
    let previousPath; let nextRevision;
    const eventId = id(request.data?.eventId);
    await db.runTransaction(async tx => {
      const caller = await actor(request, tx); const event = await readEvent(eventId, tx);
      const previous = await tx.get(privateRef(eventId));
      if (!manages(caller, event)) fail('permission-denied', 'You cannot change this poster.');
      if (request.data.expectedRevision !== event.revision) fail('aborted', 'The event changed. Reload before removing its poster.');
      previousPath = previous.data()?.posterPath; nextRevision = event.revision + 1;
      tx.set(privateRef(eventId), { posterPath: null, posterMime: null }, { merge: true });
      tx.update(eventRef(eventId), { revision: nextRevision, status: 'pending' });
    });
    if (previousPath?.startsWith(`registration-private/${eventId}/`)) await bucket.file(previousPath).delete({ ignoreNotFound: true }).catch(() => {});
    return { removed: true, revision: nextRevision, status: 'pending' };
  }
  async function saveRegistrationTemplate(request) {
    const caller = await actor(request);
    const name = request.data?.name;
    if (typeof name !== 'string' || !name.trim() || name.length > 80) fail('invalid-argument', 'Name the template using 1–80 characters.');
    // Validate only form content; no venue, poster or registrant data belongs in templates.
    const draft = await cleanDraft({ title: 'Template validation', eventType: 'Custom', customEventType: 'Template', date: '2099-01-01', suburb: 'Template', address: 'Not saved', capacity: 1,
      purpose: request.data.purpose, fields: request.data.fields });
    const reference = db.collection('registrationTemplates').doc(caller.uid).collection('items').doc(id(request.data.templateId));
    await reference.set({ name: name.trim(), purpose: draft.purpose, fields: draft.fields, updatedAt: now().toISOString() });
    return { templateId: reference.id };
  }
  async function listRegistrationTemplates(request) {
    const caller = await actor(request);
    let query = db.collection('registrationTemplates').doc(caller.uid).collection('items').orderBy('__name__').limit(50);
    if (request.data?.cursor) query = query.startAfter(id(request.data.cursor));
    const snapshot = await query.get();
    return { templates: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })), nextCursor: snapshot.docs.length === 50 ? snapshot.docs.at(-1).id : null };
  }
  return { saveRegistrationEvent, approveRegistrationEvent, submitEventRegistration, cancelEventRegistration, getRegistrationEvent, listRegistrationEvents, listEventRegistrations, deleteRegistrationAnswers, putRegistrationPoster, getRegistrationPoster, removeRegistrationPoster, saveRegistrationTemplate, listRegistrationTemplates };
}
module.exports = { createRegistrationHandlers, localMinute, active, manages, approves };
