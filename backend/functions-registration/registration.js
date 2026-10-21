const { createHash, randomUUID } = require('node:crypto');
const { enqueuePosterCleanup } = require('./posterMaintenance');
const { eventMetadata } = require('./eventMetadata');
const model = import('./formModel.mjs');
const catalogueModel = import('./cityCatalogue.mjs');
const venueModel = import('./privateVenue.mjs');
const scheduleModel = import('./eventSchedule.mjs');
const recurrenceModel = import('./registrationRecurrence.mjs');
const RETENTION = Object.freeze({ policy: 'until-organiser-deletes-or-attendee-cancels', notice: 'Your registration answers are kept until the organiser deletes them or you cancel/delete your registration. Cancelling deletes your answers and releases your places. Organiser answer deletion alone does not cancel your booking. Deleting your account queues removal of your registration answers and cancels upcoming events you organise, notifying attendees. Contact support for other privacy requests.' });
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
  return actor.profile.role === 'superAdmin';
}
function createRegistrationHandlers({ db, bucket, HttpsError, now = () => new Date(), enabled = () => false }) {
  const displayName = value => typeof value === 'string' ? value.trim().slice(0,160) : '';
  async function submitterName(tx, event, cache = new Map()) {
    const saved = displayName(event.submittedByName);
    if (saved || !event.ownerUid) return saved;
    if (!cache.has(event.ownerUid)) cache.set(event.ownerUid, tx.get(db.collection('users').doc(event.ownerUid)).then(snapshot => displayName(snapshot.data()?.fullName)));
    return cache.get(event.ownerUid);
  }

  const fail = (code, message) => { throw new HttpsError(code, message); };
  const id = value => { if (typeof value !== 'string' || !ID.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) fail('invalid-argument', 'Invalid record reference.'); return value; };
  const gate = () => { if (!enabled()) fail('failed-precondition', 'Event registration is not available yet.'); };
  const eventRef = value => db.collection('registrationEvents').doc(id(value));
  const privateRef = value => db.collection('registrationEventPrivate').doc(id(value));
  const formRef = value => db.collection('registrationForms').doc(id(value));
  const pendingRef = value => db.collection('registrationPendingChanges').doc(id(value));
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
      startTime: text(raw.startTime ?? '', 5, true), endTime: text(raw.endTime ?? '', 5, true),
      closes: text(raw.closes || '', 16, true), capacity: Number(raw.capacity), allowCancellation: raw.allowCancellation === true,
      purpose: text(raw.purpose, 1000),
      fields: raw.fields.map(field => {
        if (!field || typeof field !== 'object') fail('invalid-argument', 'Invalid question.');
        return { ...(field.perParticipant === true ? {perParticipant:true} : {}), id: id(field.id), type: text(field.type, 20), label: text(field.label, 200), description: text(field.description || '', 500, true), terms: text(field.terms || '', 1000, true), required: field.required === true,
          options: Array.isArray(field.options) && field.options.length <= 20 ? field.options.map(option => text(option, 100)) : [] };
      }),
    };
    if (/[\d\r\n,/:]/u.test(draft.suburb)) fail('invalid-argument', 'The public location must contain only a suburb name, not a street address.');
    const errors = (await model).validateDraft(draft);
    if (errors.length) fail('invalid-argument', errors.join(' '));
    try { return { ...draft, ...eventMetadata(raw) }; }
    catch (error) { fail('invalid-argument', error.message); }
  }
  const requireVisible = (caller, event) => {
    if (event.hidden === true && !(caller && manages(caller, event))) fail('not-found', 'The organiser has chosen to hide this event. It is currently unavailable.');
  };
  async function setRegistrationEventVisibility(request) {
    if (typeof request.data?.hidden !== 'boolean') fail('invalid-argument', 'Choose event visibility.');
    return db.runTransaction(async tx => {
      const caller = await actor(request, tx);
      const event = await readEvent(request.data?.eventId, tx);
      if (!manages(caller, event)) fail('permission-denied', 'Only the organiser or authorised admins may change visibility.');
      if (event.deletedAt || event.status === 'cancelled') fail('failed-precondition', 'A cancelled or deleted event cannot be made visible.');
      if (request.data.expectedRevision !== event.revision) fail('aborted', 'The event has changed. Reload before changing visibility.');
      const hidden = request.data.hidden;
      if (Boolean(event.hidden) === hidden) return {eventId:event.id,hidden,revision:event.revision};
      const revision = event.revision + 1;
      tx.update(eventRef(event.id), {hidden,revision,visibilityChangedAt:now().toISOString(),visibilityChangedBy:caller.uid});
      return {eventId:event.id,hidden,revision};
    });
  }
  const checkOpen = event => {
    if (event.status !== 'approved' || localMinute(now(), event.timeZone) >= (event.closes || `${event.date}T00:00`)) fail('failed-precondition', 'Registration is closed or this event is not approved.');
  };
  async function createRegistrationSeries(request) {
    await actor(request);
    const city = id(request.data?.city);
    const createKey = id(request.data?.createKey);
    const raw = request.data?.draft;
    const base = await cleanDraft(raw);
    const suppliedVenue = raw?.venue;
    const venue = suppliedVenue == null ? null : (await venueModel).normalisePrivateVenue(suppliedVenue);
    if (suppliedVenue != null && (!venue || venue.fullAddress !== base.address || venue.suburb !== base.suburb)) fail('invalid-argument', 'Select the full address again and confirm its public suburb.');
    const rule = request.data?.recurrence;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) fail('invalid-argument', 'Choose recurrence settings.');
    const allowedRule = ['calendarType', 'frequency', 'repeatEvery', 'endMode', 'occurrenceCount', 'endDate', 'startHijri', 'endHijri'];
    if (Object.keys(rule).some(key => !allowedRule.includes(key))) fail('invalid-argument', 'Unsupported recurrence setting.');
    const recurrence = {
      calendarType: rule.calendarType, frequency: rule.frequency, repeatEvery: rule.repeatEvery, endMode: rule.endMode,
      ...(rule.endMode === 'count' ? { occurrenceCount: rule.occurrenceCount }
        : rule.calendarType === 'hijri' ? { endHijri: rule.endHijri } : { endDate: rule.endDate }),
      ...(rule.calendarType === 'hijri' ? { startHijri: rule.startHijri } : {}),
    };
    for (const key of ['startHijri', 'endHijri']) {
      if (recurrence[key] !== undefined) {
        const value = recurrence[key];
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(field => !['day', 'month', 'year'].includes(field))) fail('invalid-argument', 'Invalid Hijri recurrence date.');
      }
    }
    const occurrences = request.data?.occurrences;
    if (!Array.isArray(occurrences) || occurrences.length < 2 || occurrences.length > 100) fail('invalid-argument', 'Create between 2 and 100 separate occurrences.');
    const occurrenceKeys = ['date', 'closes', 'capacity', 'startTime', 'endTime', 'hijriDate', 'enteredAsHijri', 'hijriDay', 'hijriMonth', 'hijriYear'];
    const drafts = [];
    for (const occurrence of occurrences) {
      if (!occurrence || typeof occurrence !== 'object' || Array.isArray(occurrence)
          || Object.keys(occurrence).some(key => !occurrenceKeys.includes(key))
          || occurrence.capacity === undefined
          || ['date', 'closes', 'startTime', 'endTime'].some(key => typeof occurrence[key] !== 'string')) fail('invalid-argument', 'Each occurrence needs its own date, capacity, closing and clock settings.');
      drafts.push(await cleanDraft({ ...raw, ...occurrence }));
    }
    if (['date', 'capacity', 'closes', 'startTime', 'endTime'].some(key => (base[key] ?? '') !== (drafts[0][key] ?? ''))) fail('invalid-argument', 'The first occurrence must match the event settings.');
    const fingerprint = createHash('sha256').update(JSON.stringify({ city, base, venue, recurrence, drafts })).digest('hex');
    const seriesId = createHash('sha256').update(`series:${request.auth?.uid}:${createKey}`).digest('hex');
    const receiptRef = db.collection('registrationSeries').doc(seriesId);
    const references = drafts.map((_, index) => eventRef(createHash('sha256').update(`${seriesId}:${index}`).digest('hex')));
    return db.runTransaction(async tx => {
      const caller = await actor(request, tx);
      const receipt = await tx.get(receiptRef);
      if (receipt.exists) {
        if (receipt.data().ownerUid !== caller.uid || receipt.data().fingerprint !== fingerprint) fail('already-exists', 'This series creation reference was already used.');
        return receipt.data().result;
      }
      const timeZone = await zone(city, tx);
      const calendar = recurrence.calendarType === 'hijri' ? await tx.get(db.collection('settings').doc('hijriCalendar')) : null;
      const overrides = calendar?.data()?.overrides ?? [];
      if (!Array.isArray(overrides) || overrides.length > 1200 || overrides.some(item => {
        if (!item || !Number.isInteger(Number(item.hYear)) || Number(item.hYear) < 1300 || Number(item.hYear) > 1700
            || !Number.isInteger(Number(item.hMonth)) || Number(item.hMonth) < 1 || Number(item.hMonth) > 12
            || typeof item.gDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.gDate)) return true;
        const date = new Date(`${item.gDate}T12:00:00Z`);
        return !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== item.gDate;
      })) fail('failed-precondition', 'Hijri calendar settings need administrator review.');
      let preview;
      try { preview = (await recurrenceModel).registrationOccurrencePreview(base.date, recurrence, overrides); }
      catch (error) { fail('invalid-argument', error.message); }
      if (preview.length !== drafts.length || preview.some((row, index) => row.date !== drafts[index].date)) fail('invalid-argument', 'Occurrence dates do not match the current recurrence preview. Reload the calendar and try again.');
      for (const reference of references) {
        if ((await tx.get(reference)).exists) fail('already-exists', 'An occurrence already exists without its series receipt. Contact support.');
      }
      const timestamp = now().toISOString();
      const rows = [];
      let bytes = 0;
      for (let index = 0; index < drafts.length; index++) {
        const draft = { ...drafts[index], ...preview[index] };
        const monthNames = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah'];
        draft.hijriDate = draft.enteredAsHijri ? `${draft.hijriDay} ${monthNames[draft.hijriMonth - 1]} ${draft.hijriYear} AH` : '';
        let schedule;
        try { schedule = (await scheduleModel).registrationSchedule({ date: draft.date, startTime: draft.startTime, endTime: draft.endTime, timeZone }); }
        catch (error) { fail('invalid-argument', `Occurrence ${index + 1}: ${error.message}`); }
        if (localMinute(now(), timeZone) >= (draft.closes || `${draft.date}T00:00`)) fail('failed-precondition', `Occurrence ${index + 1} has already closed.`);
        if (draft.timeMode === 'prayer' && (!draft.prayerName || !schedule.startAt)) fail('invalid-argument', `Occurrence ${index + 1} needs its calculated prayer time.`);
        const event = { ...(await model).publicEvent(draft), ...schedule, city, timeZone,
          ...(draft.timeMode === 'prayer' ? { prayerTimeZone: timeZone } : {}),
          ownerUid: caller.uid, submittedByName: displayName(caller.profile.fullName), revision: 1, formVersion: 1, status: 'pending', reservedPlaces: 0, registrationCount: 0,
          createdAt: timestamp, updatedAt: timestamp, allowCancellation: draft.allowCancellation,
          seriesId, occurrenceIndex: index, occurrenceCount: drafts.length, recurrenceRule: recurrence };
        const privateDetails = { address: draft.address, venue, hostPhone: draft.hostPhone ?? '', hostContactOptional: draft.hostContactOptional ?? '' };
        const form = { version: 1, fields: draft.fields, purpose: draft.purpose };
        bytes += Buffer.byteLength(JSON.stringify({ event, privateDetails, form }));
        rows.push({ event, privateDetails, form });
      }
      if (bytes > 8 * 1024 * 1024) fail('resource-exhausted', 'This series and form are too large. Use fewer occurrences.');
      const result = { seriesId, events: references.map(reference => ({ eventId: reference.id, revision: 1, status: 'pending' })) };
      for (let index = 0; index < rows.length; index++) {
        const reference = references[index]; const row = rows[index];
        tx.set(reference, row.event);
        tx.set(privateRef(reference.id), row.privateDetails);
        tx.set(formRef(reference.id), row.form);
      }
      tx.set(receiptRef, { ownerUid: caller.uid, fingerprint, result, createdAt: timestamp });
      return result;
    });
  }
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
      if (current?.status === 'cancelled' || current?.deletedAt) fail('failed-precondition', 'A cancelled or deleted event cannot be edited.');
      if (current && request.data.expectedRevision !== current.revision) fail('aborted', 'The event has changed. Reload before saving.');
      const timeZone = await zone(city, tx);
      const pending = current ? (await tx.get(pendingRef(reference.id))).data() : null;
      const editingEvent = pending?.event || current;
      let schedule;
      try {
        schedule = (await scheduleModel).registrationSchedule({
          date: draft.date, timeZone,
          startTime: request.data.draft.startTime === undefined && request.data.draft.endTime === undefined ? editingEvent?.startTime || '' : draft.startTime,
          endTime: request.data.draft.startTime === undefined && request.data.draft.endTime === undefined ? editingEvent?.endTime || '' : draft.endTime,
        });
      } catch (error) { fail('invalid-argument', error.message); }
      const previousForm = current ? (await tx.get(formRef(reference.id))).data() : null;
      const publishedVenue = current ? (await tx.get(privateRef(reference.id))).data() : null;
      const previousVenue = pending?.privateDetails || publishedVenue;
      if (draft.capacity < (current?.reservedPlaces || 0)) fail('failed-precondition', 'Capacity cannot be lower than existing registrations.');
      const revision = (current?.revision || 0) + 1;
      const formChanged = !previousForm || JSON.stringify(previousForm.fields) !== JSON.stringify(draft.fields) || previousForm.purpose !== draft.purpose;
      if (current?.registrationCount > 0 && formChanged && localMinute(now(), timeZone).slice(0, 10) >= draft.date) fail('failed-precondition', 'Registration questions cannot change on or after event day when attendees have registered.');
      const formVersion = formChanged ? revision : previousForm.version;
      const status = current?.status || 'pending';
      const publicData = { ...(await model).publicEvent({ ...editingEvent, ...draft }), ...schedule, city, timeZone, ownerUid: current?.ownerUid || caller.uid, submittedByName: current ? await submitterName(tx,current) : displayName(caller.profile.fullName), revision,
        formVersion, status, hidden: current?.hidden === true, reservedPlaces: current?.reservedPlaces || 0, registrationCount: current?.registrationCount || 0,
        createdAt: current?.createdAt || now().toISOString(), updatedAt: now().toISOString(), allowCancellation: draft.allowCancellation, creationFingerprint: current?.creationFingerprint || fingerprint };
      if (current?.approvedAt) { publicData.approvedAt = current.approvedAt; publicData.approvedBy = current.approvedBy; }
      for (const key of ['isLive', 'liveUrl', 'liveWatchUrl', 'liveAppVisibility', 'liveSource', 'liveStartedAt', 'liveVideoRecordId', 'liveEndedAt', 'liveRoomCode', 'liveStartedBy']) {
        if (current && Object.hasOwn(current, key)) publicData[key] = current[key];
      }
      if (publicData.timeMode === 'prayer') publicData.prayerTimeZone = timeZone;
      if (publicData.timeMode === 'prayer' && (!publicData.prayerName || !schedule.startAt)) fail('invalid-argument', 'Select a prayer and its calculated start time.');
      const privateData = { ...previousVenue, address: draft.address, venue,
        hostPhone: draft.hostPhone ?? previousVenue?.hostPhone ?? '',
        hostContactOptional: draft.hostContactOptional ?? previousVenue?.hostContactOptional ?? '' };
      const formData = { version: formVersion, fields: draft.fields, purpose: draft.purpose };
      if (status === 'approved') {
        tx.set(pendingRef(reference.id), { event: publicData, form: formData, privateDetails: privateData,
          submittedAt: now().toISOString(), submittedBy: caller.uid });
        tx.update(reference, { revision, hasPendingChanges: true, reviewDecision: '', reviewFeedback: '' });
        return { eventId: reference.id, revision, status, hasPendingChanges: true };
      }
      tx.set(reference, publicData);
      tx.set(privateRef(reference.id), privateData);
      tx.set(formRef(reference.id), formData);
      return { eventId: reference.id, revision, status };
    });
  }
  async function approveRegistrationEvent(request) {
    return db.runTransaction(tx => approveInTransaction(request,tx));
  }
  async function approveInTransaction(request,tx) {
      const caller = await actor(request, tx); const event = await readEvent(request.data?.eventId, tx);
      if (!approves(caller, event)) fail('permission-denied', 'Only a super admin can approve an event.');
      if (event.deletedAt || event.reviewDecision || (event.status !== 'pending' && !(event.status === 'approved' && event.hasPendingChanges))) fail('failed-precondition', 'Only a pending event or submitted changes can be approved.');
      if (request.data.expectedRevision !== event.revision) fail('aborted', 'Review the latest event before approval.');
      const pending = (await tx.get(pendingRef(event.id))).data();
      const currentForm = (await tx.get(formRef(event.id))).data();
      const currentPrivate = (await tx.get(privateRef(event.id))).data();
      const target = event.hasPendingChanges ? pending?.event : event;
      if (!target) fail('failed-precondition', 'The submitted changes are unavailable. Reload before approval.');
      if (pending && event.hasPendingChanges) {
        if (target.capacity < event.reservedPlaces) fail('failed-precondition', 'Capacity is below the places booked since these changes were submitted.');
        if (await zone(target.city, tx) !== target.timeZone) fail('failed-precondition', 'The event city timezone changed. Resubmit the event schedule before approval.');
        const formChanged = JSON.stringify(currentForm.fields) !== JSON.stringify(pending.form.fields) || currentForm.purpose !== pending.form.purpose;
        if (event.registrationCount > 0 && formChanged && localMinute(now(), target.timeZone).slice(0, 10) >= target.date) fail('failed-precondition', 'Registration questions cannot change on or after event day when attendees have registered.');
        if (localMinute(now(), target.timeZone).slice(0, 10) > target.date) fail('failed-precondition', 'A past event cannot be published.');
        const revision = event.revision + 1;
        const formVersion = formChanged ? revision : event.formVersion;
        const changes = [
          ...(formChanged ? ['form'] : []),
          ...(event.date !== target.date || (event.startTime || '') !== target.startTime || (event.endTime || '') !== target.endTime || event.timeZone !== target.timeZone ? ['date'] : []),
          ...(event.city !== target.city || currentPrivate?.address !== pending.privateDetails.address || JSON.stringify(currentPrivate?.venue || null) !== JSON.stringify(pending.privateDetails.venue || null) ? ['venue'] : []),
        ];
        // Promote editable content only; current capacity counters and live lifecycle win.
        tx.update(eventRef(event.id), { ...(await model).publicEvent({ ...target, address: pending.privateDetails.address }), allowCancellation: target.allowCancellation,
          city: target.city, timeZone: target.timeZone, formVersion, revision, hasPendingChanges: false,
          approvedBy: caller.uid, approvedAt: now().toISOString() });
        tx.set(formRef(event.id), { ...pending.form, version: formVersion });
        tx.set(privateRef(event.id), pending.privateDetails);
        tx.delete(pendingRef(event.id));
        if (currentPrivate?.posterPath && currentPrivate.posterPath !== pending.privateDetails.posterPath) enqueuePosterCleanup(db, tx, event.id, currentPrivate.posterPath, now());
        if (event.registrationCount > 0 && changes.length) tx.set(db.collection('registrationChanges').doc(`${event.id}-${revision}`), {
          eventId: event.id, revision, formVersion, changes, createdAt: now().toISOString(), state: 'pending', cursor: null,
        });
        return { eventId: event.id, status: 'approved', revision, hasPendingChanges: false };
      }
      if (localMinute(now(), event.timeZone) >= (event.closes || `${event.date}T00:00`)) fail('failed-precondition', 'The registration closing time has passed.');
      tx.update(eventRef(event.id), { status: 'approved', approvedBy: caller.uid, approvedAt: now().toISOString() });
      return { eventId: event.id, status: 'approved' };
  }
  async function approveRegistrationSeries(request) {
    gate();const selected=request.data?.occurrences;
    if(!Array.isArray(selected)||!selected.length||selected.length>100||new Set(selected.map(row=>row?.eventId)).size!==selected.length)fail('invalid-argument','Choose between 1 and 100 different occurrences.');
    const baseId=id(request.data.eventId),requestId=id(request.data.requestId);
    return db.runTransaction(async tx=>{
      const caller=await actor(request,tx);
      if(!approves(caller))fail('permission-denied','Only a super admin can approve a series.');
      const receiptRef=eventRef(baseId).collection('seriesApprovalOperations').doc(createHash('sha256').update(JSON.stringify([caller.uid,requestId])).digest('hex'));
      const hash=createHash('sha256').update(JSON.stringify(request.data)).digest('hex'),receipt=await tx.get(receiptRef);
      if(receipt.exists){if(receipt.data().hash!==hash)fail('already-exists','This approval reference was already used.');return receipt.data().result;}
      const base=await readEvent(baseId,tx);if(!base.seriesId||base.deletedAt)fail('failed-precondition','Reload a series event before approving.');
      const writes=[],cache=new Map();let bytes=0;
      const stage=(method,args)=>{bytes+=Buffer.byteLength(JSON.stringify(args[1]||{}));writes.push(()=>tx[method](...args));};
      const staged={get:ref=>{if(!cache.has(ref.path))cache.set(ref.path,tx.get(ref));return cache.get(ref.path);},
        set:(...args)=>stage('set',args),update:(...args)=>stage('update',args),delete:(...args)=>stage('delete',args)};
      const events=[];
      for(const row of selected){
        const event=await readEvent(row?.eventId,staged);
        if(event.seriesId!==base.seriesId||event.ownerUid!==base.ownerUid)fail('invalid-argument','Choose occurrences from the same series.');
        try{events.push(await approveInTransaction({...request,data:{eventId:event.id,expectedRevision:row.expectedRevision}},staged));}
        catch(error){throw new HttpsError(error.code||'internal',`${event.date}: ${error.message}`);}
      }
      if(writes.length>450||bytes>8*1024*1024)fail('resource-exhausted','These submitted changes are too large to approve together. Select fewer occurrences.');
      const result={events};writes.forEach(write=>write());tx.set(receiptRef,{uid:caller.uid,hash,result,createdAt:now().toISOString()});return result;
    });
  }
  async function reviewRegistrationEvent(request) {
    const decision = request.data?.decision;
    const feedback = String(request.data?.feedback || '').trim();
    if (!['rejected', 'changes-requested'].includes(decision) || !feedback || feedback.length > 2000) fail('invalid-argument', 'Choose a decision and enter feedback (up to 2000 characters).');
    return db.runTransaction(async tx => {
      const caller = await actor(request, tx); const event = await readEvent(request.data?.eventId, tx);
      if (!approves(caller, event)) fail('permission-denied', 'Only a super admin can review an event.');
      if (event.deletedAt || event.reviewDecision || (event.status !== 'pending' && !(event.status === 'approved' && event.hasPendingChanges))) fail('failed-precondition', 'Reload an event awaiting review.');
      if (request.data.expectedRevision !== event.revision) fail('aborted', 'Review the latest event before deciding.');
      const revision = event.revision + 1;
      tx.update(eventRef(event.id), { revision, reviewDecision: decision, reviewFeedback: feedback, reviewedBy: caller.uid, reviewedAt: now().toISOString() });
      return { eventId: event.id, revision, decision };
    });
  }
  async function submitEventRegistration(request) {
    return db.runTransaction(tx => submitInTransaction(request, tx));
  }
  async function submitInTransaction(request, tx) {
    const eventId = id(request.data?.eventId); const requestId = id(request.data?.requestId);
    const hash = createHash('sha256').update(JSON.stringify({ answers: request.data.answers, places: request.data.places, formVersion: request.data.formVersion, expectedRevision: request.data.expectedRevision })).digest('hex');
      const caller = await actor(request, tx); const event = await readEvent(eventId, tx);
      requireVisible(caller,event);
      const operationId = createHash('sha256').update(JSON.stringify([caller.uid, requestId])).digest('hex');
      const receiptRef = eventRef(eventId).collection('operations').doc(operationId);
      const receipt = await tx.get(receiptRef);
      if (receipt.exists) { if (receipt.data().hash !== hash) fail('already-exists', 'This submission reference was already used.'); return receipt.data().result; }
      const formSnap = await tx.get(formRef(eventId)); const form = formSnap.data();
      if (!form || request.data.formVersion !== form.version) fail('failed-precondition', 'The form changed. Reload and review the latest questions and terms.');
      const ref = bookingRef(eventId, caller.uid); const previousSnap = await tx.get(ref); const previous = previousSnap.exists ? previousSnap.data() : null;
      // Existing attendees can correct answers until event day, even after closing.
      // Closing still blocks new/reopened bookings and any increase in places.
      const editing = event.status === 'approved' && previous?.status === 'registered' && localMinute(now(), event.timeZone).slice(0, 10) < event.date;
      if (!editing) checkOpen(event);
      if (editing && localMinute(now(), event.timeZone) >= (event.closes || `${event.date}T00:00`) && Number(request.data.places) > previous.places) fail('failed-precondition', 'Registration has closed. You may update answers or reduce places, but cannot add places.');
      if ((request.data.expectedRevision || 0) !== (previous?.revision || 0)) fail('aborted', 'Your registration changed. Reload before editing.');
      const rawAnswers = request.data.answers;
      if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) fail('invalid-argument', 'Answers are required.');
      const answers = {};
      const responseFields = (await model).registrationFields(form.fields, request.data.places);
      for (const field of responseFields) {
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
      tx.set(ref, { ...result, uid: caller.uid, answers: clone(answers), fields: clone(responseFields), retentionPolicy: RETENTION.policy, submittedAt: previous?.status === 'registered' ? previous.submittedAt : now().toISOString(), updatedAt: now().toISOString() });
      tx.set(db.collection('registrationMemberEvents').doc(caller.uid).collection('events').doc(eventId), { eventId });
      tx.update(eventRef(eventId), { reservedPlaces, registrationCount: event.registrationCount + (previous?.status === 'registered' ? 0 : 1) });
      tx.set(receiptRef, { uid: caller.uid, hash, result, createdAt: now().toISOString() });
      return result;
  }
  async function submitRegistrationOccurrences(request) {
    gate();
    const selected = request.data?.occurrences;
    if (!Array.isArray(selected) || !selected.length || selected.length > 100
      || new Set(selected.map(row => row?.eventId)).size !== selected.length) fail('invalid-argument', 'Choose between 1 and 100 different occurrences.');
    const baseId = id(request.data.eventId), requestId = id(request.data.requestId);
    if (Buffer.byteLength(JSON.stringify(request.data)) > 100000) fail('invalid-argument', 'This registration is too large.');
    return db.runTransaction(async tx => {
      const caller = await actor(request, tx);
      const receiptRef = eventRef(baseId).collection('seriesOperations').doc(createHash('sha256').update(JSON.stringify([caller.uid,requestId])).digest('hex'));
      const hash = createHash('sha256').update(JSON.stringify(request.data)).digest('hex');
      const receipt = await tx.get(receiptRef);
      if (receipt.exists) { if (receipt.data().hash !== hash) fail('already-exists','This submission reference was already used.'); return receipt.data().result; }
      const base = await readEvent(baseId,tx);
      requireVisible(caller,base);
      if (!base.seriesId || base.deletedAt || base.status !== 'approved') fail('failed-precondition','Reload an approved series occurrence.');
      const baseForm = (await tx.get(formRef(baseId))).data();
      const signature = form => JSON.stringify([form?.purpose,form?.fields]);
      // Buffer writes so every occurrence is validated/read before Firestore writes.
      const writes = [], cache = new Map();
      const staged = { get: ref => { if (!cache.has(ref.path)) cache.set(ref.path,tx.get(ref)); return cache.get(ref.path); },
        set: (...args) => writes.push(() => tx.set(...args)), update: (...args) => writes.push(() => tx.update(...args)) };
      const registrations = [];
      for (const row of selected) {
        const event = await readEvent(row?.eventId,staged);
        if (event.seriesId !== base.seriesId || event.ownerUid !== base.ownerUid || event.deletedAt) fail('invalid-argument','Choose occurrences from the same event series.');
        const form = (await staged.get(formRef(event.id))).data();
        if (signature(form) !== signature(baseForm)) fail('failed-precondition',`${event.date}: this occurrence has a different form. Register for it separately.`);
        if (event.id !== baseId && (await staged.get(bookingRef(event.id,caller.uid))).data()?.status === 'registered') fail('failed-precondition','Manage existing registrations separately.');
        try {
          registrations.push(await submitInTransaction({ ...request,data:{ eventId:event.id,requestId,formVersion:row.formVersion,
            expectedRevision:row.expectedRevision,places:request.data.places,answers:request.data.answers } },staged));
        } catch (error) { throw new HttpsError(error.code || 'internal',`${event.date}: ${error.message}`); }
      }
      const result = { registrations };
      writes.forEach(write => write());
      tx.set(receiptRef,{ uid:caller.uid,hash,result,createdAt:now().toISOString() });
      return result;
    });
  }
  async function cancelEventRegistration(request) {
    return db.runTransaction(async tx => {
      const caller = await actor(request, tx); const event = await readEvent(request.data?.eventId, tx);
      const ref = bookingRef(event.id, caller.uid); const snapshot = await tx.get(ref); const booking = snapshot.data();
      if (!booking || booking.status === 'cancelled') return { status: 'cancelled' };
      if (event.status !== 'cancelled' && (!event.allowCancellation || localMinute(now(), event.timeZone).slice(0, 10) >= event.date)) fail('failed-precondition', 'Cancellation is not available. Contact the organiser.');
      if (request.data.expectedRevision !== booking.revision) fail('aborted', 'Reload your registration before cancelling.');
      // Do not retain form entries in cancelled bookings. Replace (not merge)
      // with a minimal tombstone for revision/idempotency; no question snapshots,
      // contact answers or other submitted values remain here or in operation receipts.
      tx.set(ref, { eventId: event.id, registrationId: caller.uid, uid: caller.uid,
        status: 'cancelled', revision: booking.revision + 1, places: 0,
        cancelledAt: now().toISOString(), answersDeletedAt: now().toISOString() });
      tx.delete(db.collection('registrationMemberEvents').doc(caller.uid).collection('events').doc(event.id));
      tx.update(eventRef(event.id), { reservedPlaces: event.status === 'cancelled' ? 0 : event.reservedPlaces - booking.places, registrationCount: event.registrationCount - 1 });
      return { status: 'cancelled', revision: booking.revision + 1 };
    });
  }
  async function cancelRegistrationEvent(request) {
    if (request.data?.confirmation !== 'CANCEL EVENT') fail('invalid-argument', 'Confirm that you want to cancel the whole event.');
    return db.runTransaction(async tx => {
      const caller = await actor(request, tx); const event = await readEvent(request.data?.eventId, tx);
      if (!manages(caller, event)) fail('permission-denied', 'You cannot cancel this event.');
      if (event.status === 'cancelled') return { eventId: event.id, revision: event.revision, status: 'cancelled' };
      if (request.data.expectedRevision !== event.revision) fail('aborted', 'Reload the event before cancelling.');
      const pending = (await tx.get(pendingRef(event.id))).data();
      const revision = event.revision + 1; const timestamp = now().toISOString();
      tx.update(eventRef(event.id), { status: 'cancelled', revision, reservedPlaces: 0, cancelledAt: timestamp, cancelledBy: caller.uid, hasPendingChanges: false });
      tx.delete(pendingRef(event.id));
      if (pending?.privateDetails.posterPath) enqueuePosterCleanup(db, tx, event.id, pending.privateDetails.posterPath, now());
      tx.set(db.collection('registrationChanges').doc(`${event.id}-${revision}`), {
        eventId: event.id, revision, formVersion: event.formVersion, changes: ['cancelled'], createdAt: timestamp, state: 'pending', cursor: null,
      });
      return { eventId: event.id, revision, status: 'cancelled' };
    });
  }
  async function deleteRegistrationEvent(request) {
    if (request.data?.confirmation !== 'DELETE EVENT') fail('invalid-argument', 'Confirm that you want to delete this event.');
    return db.runTransaction(async tx => {
      const caller = await actor(request, tx); const event = await readEvent(request.data?.eventId, tx);
      if (!manages(caller, event)) fail('permission-denied', 'You cannot delete this event.');
      if (event.deletedAt) return { eventId: event.id, revision: event.revision, status: 'cancelled', deleted: true };
      if (request.data.expectedRevision !== event.revision) fail('aborted', 'Reload the event before deleting it.');
      const pending = (await tx.get(pendingRef(event.id))).data();
      const revision = event.revision + 1; const timestamp = now().toISOString();
      tx.update(eventRef(event.id), { status: 'cancelled', deletedAt: timestamp, deletedBy: caller.uid, revision, reservedPlaces: 0, hasPendingChanges: false });
      tx.delete(pendingRef(event.id));
      if (pending?.privateDetails.posterPath) enqueuePosterCleanup(db, tx, event.id, pending.privateDetails.posterPath, now());
      tx.set(db.collection('registrationChanges').doc(`${event.id}-${revision}`), {
        eventId: event.id, revision, formVersion: event.formVersion, changes: ['cancelled'], createdAt: timestamp, state: 'pending', cursor: null,
      });
      return { eventId: event.id, revision, status: 'cancelled', deleted: true };
    });
  }
  const liveProjection = event => event.status === 'approved' && !event.deletedAt ? {
        isLive: event.isLive === true,
        liveUrl: /^[A-Za-z0-9_-]{1,128}$/.test(event.liveUrl || '') ? event.liveUrl : null,
        liveWatchUrl: event.liveAppVisibility === 'public' && /^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]+$/.test(event.liveWatchUrl || '') ? event.liveWatchUrl : null,
        liveAppVisibility: ['public', 'private'].includes(event.liveAppVisibility) ? event.liveAppVisibility : null,
        liveSource: ['native', 'external-youtube'].includes(event.liveSource) ? event.liveSource : null,
        liveStartedAt: typeof event.liveStartedAt === 'string' ? event.liveStartedAt : null,
        liveVideoRecordId: /^[A-Za-z0-9_-]{1,200}$/.test(event.liveVideoRecordId || '') ? event.liveVideoRecordId : null,
      } : { isLive: false };
  async function getRegistrationEvent(request) {
    gate();
    return db.runTransaction(async tx => {
      const [caller, event] = await Promise.all([request.auth && request.auth.token?.firebase?.sign_in_provider !== 'anonymous' ? actor(request, tx) : Promise.resolve(null), readEvent(request.data?.eventId, tx)]);
      const manager = caller && manages(caller, event);
      requireVisible(caller,event);
      const cardOnly = request.data?.cardOnly === true;
      const [ownSnap, form, details] = await Promise.all([caller ? tx.get(bookingRef(event.id, caller.uid)) : Promise.resolve(null), cardOnly ? Promise.resolve(null) : tx.get(formRef(event.id)), tx.get(privateRef(event.id))]);
      const own = ownSnap?.exists ? ownSnap.data() : null;
      const registered = own?.status === 'registered';
      if (event.status !== 'approved' && !manager && !registered) fail('not-found', 'Event not available.');
      if (cardOnly) {
        const time = localMinute(now(), event.timeZone);
        const result = { event: { ...(await model).publicEvent({ ...event, address: details.data()?.address || '' }),
          ...(await scheduleModel).registrationSchedule(event), ...liveProjection(event), id:event.id, ownerUid:event.ownerUid,
          status:event.status, city:event.city, timeZone:event.timeZone, revision:event.revision, formVersion:event.formVersion,
          hidden:event.hidden === true, deleted:Boolean(event.deletedAt), submittedByName:await submitterName(tx,event),
          ...(manager ? {registrationCount:event.registrationCount,hasPendingChanges:Boolean(event.hasPendingChanges)} : {}) },
          canManage:Boolean(manager), canApprove:Boolean(caller && !event.deletedAt && !event.reviewDecision && (event.status === 'pending' || event.hasPendingChanges) && approves(caller,event)),
          canRegister:event.status === 'approved' && time < (event.closes || `${event.date}T00:00`),
          canEditRegistration:Boolean(registered && event.status === 'approved' && time.slice(0,10) < event.date),
          canCancel:Boolean(registered && (event.status === 'cancelled' || (event.allowCancellation && time.slice(0,10) < event.date))),
          ownRegistration:own ? {status:own.status,revision:own.revision,places:own.places,formVersion:own.formVersion} : null };
        if (manager && event.reviewDecision) result.reviewFeedback = {decision:event.reviewDecision,message:event.reviewFeedback};
        if (manager || (registered && event.status !== 'cancelled')) {
          const data=details.data();
          result.privateDetails={address:data?.address || '',venue:(await venueModel).normalisePrivateVenue(data?.venue),hasPoster:Boolean(data?.posterPath),hostPhone:data?.hostPhone || '',hostContactOptional:data?.hostContactOptional || ''};
        }
        return result;
      }
      const pending = manager && event.hasPendingChanges && event.status === 'approved' && !event.deletedAt ? (await tx.get(pendingRef(event.id))).data() : null;
      if (manager && event.hasPendingChanges && event.status === 'approved' && !event.deletedAt && !pending) fail('failed-precondition', 'The submitted changes are unavailable. Contact an administrator before editing.');
      const schedule = (await scheduleModel).registrationSchedule({ ...event, timeZone: event.timeZone });
      const live = liveProjection(event);
      const result = { event: { ...(await model).publicEvent({ ...event, address: details.data()?.address || '' }), ...schedule, ...live, id: event.id, ownerUid: event.ownerUid, status: event.status, city: event.city, timeZone: event.timeZone, revision: event.revision, formVersion: event.formVersion, allowCancellation: event.allowCancellation === true }, form: form.data(), ownRegistration: own, canManage: Boolean(manager) };
      result.event.hidden = event.hidden === true;
      result.event.deleted = Boolean(event.deletedAt);
      result.event.submittedByName = await submitterName(tx,event);
      result.canApprove = Boolean(caller && !event.deletedAt && !event.reviewDecision && (event.status === 'pending' || pending) && approves(caller, event));
      result.canRegister = event.status === 'approved' && localMinute(now(), event.timeZone) < (event.closes || `${event.date}T00:00`);
      result.canEditRegistration = Boolean(registered && event.status === 'approved' && localMinute(now(), event.timeZone).slice(0, 10) < event.date);
      result.registrationNeedsReview = Boolean(registered && own.formVersion !== event.formVersion);
      result.canCancel = Boolean(registered && (event.status === 'cancelled' || (event.allowCancellation && localMinute(now(), event.timeZone).slice(0, 10) < event.date)));
      result.retention = RETENTION;
      if(request.data?.includeSeriesReview === true && event.seriesId && caller && approves(caller,event)){
        const snapshot=await tx.get(db.collection('registrationEvents').where('seriesId','==',event.seriesId).limit(100));
        result.reviewOccurrences=snapshot.docs.map(doc=>({...doc.data(),id:doc.id})).filter(row=>row.ownerUid===event.ownerUid&&!row.deletedAt&&!row.reviewDecision&&(row.status==='pending'||(row.status==='approved'&&row.hasPendingChanges)))
          .map(row=>({eventId:row.id,title:row.title,date:row.date,startTime:row.startTime||'',revision:row.revision,status:row.status,hasPendingChanges:Boolean(row.hasPendingChanges)}))
          .sort((a,b)=>`${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
      }
      if (request.data?.includeOccurrences === true && event.seriesId && event.status === 'approved' && !event.deletedAt) {
        const snapshot = await tx.get(db.collection('registrationEvents').where('seriesId','==',event.seriesId).limit(100));
        const rows = snapshot.docs.map(doc => ({ ...doc.data(),id:doc.id })).filter(row => row.status === 'approved' && !row.deletedAt && (row.hidden !== true || (caller && manages(caller,row))) && row.ownerUid === event.ownerUid);
        result.occurrences = await Promise.all(rows.map(async row => {
          const [booking,otherForm] = await Promise.all([caller ? tx.get(bookingRef(row.id,caller.uid)) : Promise.resolve(null),tx.get(formRef(row.id))]);
          const registered = booking?.data()?.status === 'registered';
          const open = localMinute(now(),row.timeZone) < (row.closes || `${row.date}T00:00`);
          const sameForm = JSON.stringify([form.data()?.purpose,form.data()?.fields]) === JSON.stringify([otherForm.data()?.purpose,otherForm.data()?.fields]);
          return { eventId:row.id,date:row.date,startTime:row.startTime || '',timeZone:row.timeZone,formVersion:otherForm.data()?.version,
            availablePlaces:Math.max(0,row.capacity-row.reservedPlaces + (registered && row.id === event.id ? booking.data().places : 0)),registered,registrationRevision:booking?.data()?.revision || 0,
            selectable:row.id === event.id ? Boolean(result.canRegister || result.canEditRegistration) : Boolean(open && !registered && sameForm && row.capacity>row.reservedPlaces),
            reason:!sameForm ? 'Different form — register separately' : registered && row.id !== event.id ? 'Already registered' : !open ? 'Registration closed' : row.capacity<=row.reservedPlaces ? 'Full' : '' };
        }));
        result.occurrences.sort((a,b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
      }
      if (manager && event.reviewDecision) result.reviewFeedback = { decision: event.reviewDecision, message: event.reviewFeedback };
      const { normalisePrivateVenue } = await venueModel;
      const privateProjection = data => ({ address: data?.address || '', venue: normalisePrivateVenue(data?.venue), hasPoster: Boolean(data?.posterPath),
        hostPhone: data?.hostPhone || '', hostContactOptional: data?.hostContactOptional || '' });
      if (manager) { result.event.registrationCount = event.registrationCount; result.event.hasPendingChanges = Boolean(pending); }
      if (pending) result.pendingChanges = {
        event: { ...(await model).publicEvent({ ...pending.event, address: pending.privateDetails.address }),
          id: event.id, city: pending.event.city, timeZone: pending.event.timeZone, status: 'approved',
          ownerUid: event.ownerUid, revision: event.revision, formVersion: pending.form.version,
          allowCancellation: pending.event.allowCancellation },
        form: pending.form, privateDetails: privateProjection(pending.privateDetails),
        submittedAt: pending.submittedAt, submittedBy: pending.submittedBy,
      };
      if (manager || (registered && event.status !== 'cancelled')) result.privateDetails = privateProjection(details.data());
      return result;
    });
  }
  // List cards need only the public projection and current access flags. Never
  // load full forms, pending drafts or submitted answers while discovering cards.
  async function registrationListPage(request, scope, city, ids) {
    const { normalisePrivateVenue } = await venueModel;
    return db.runTransaction(async tx => {
      const signedIn = request.auth && request.auth.token?.firebase?.sign_in_provider !== 'anonymous';
      const caller = signedIn ? await actor(request, tx) : null;
      if (scope !== 'public' && !caller) fail('unauthenticated', 'Sign in to continue.');
      if (scope === 'review' && !approves(caller)) fail('permission-denied', 'You cannot review events.');
      if (scope === 'management' && caller.profile.role !== 'superAdmin'
        && !(caller.profile.role === 'admin' && (caller.profile.adminCity || caller.profile.defaultCity) === city)) fail('permission-denied', 'You cannot manage events in this city.');
      const snapshots = await Promise.all(ids.map(value => tx.get(eventRef(value))));
      const submitterNames = new Map();
      const rows = await Promise.all(snapshots.map(async snapshot => {
        if (!snapshot.exists) return null;
        const event = { ...snapshot.data(), id: snapshot.id };
        if ((event.deletedAt && scope !== 'attending') || (city && event.city !== city) || (scope === 'mine' && event.ownerUid !== caller.uid)) return null;
        if (scope === 'public' && (event.hidden === true || event.status !== 'approved' || event.date < localMinute(now(), event.timeZone).slice(0, 10))) return null;
        const manager = Boolean(caller && manages(caller, event));
        if (event.hidden === true && !manager) return null;
        const canApprove = Boolean(manager && !event.reviewDecision && (event.status === 'pending' || event.hasPendingChanges) && approves(caller, event));
        if (scope === 'review' && !canApprove) return null;
        const [privateSnap, ownSnap] = await Promise.all([
          tx.get(privateRef(event.id)), caller ? tx.get(bookingRef(event.id, caller.uid)) : Promise.resolve(null),
        ]);
        const registered = ownSnap?.data()?.status === 'registered';
        if ((scope === 'attending' && !registered) || (event.status !== 'approved' && !manager && !registered)) return null;
        const schedule = (await scheduleModel).registrationSchedule(event);
        const venue = normalisePrivateVenue(privateSnap.data()?.venue);
        // The map needs a location, but the exact registration venue remains
        // private. Two decimal places locate the suburb without exposing the
        // selected street address; authorised navigation still uses the exact
        // private venue returned by getRegistrationEvent.
        const publicMapPoint = venue ? {
          latitude: Number(venue.latitude.toFixed(2)),
          longitude: Number(venue.longitude.toFixed(2)),
        } : {};
        const row = { ...(await model).publicEvent({ ...event, address: privateSnap.data()?.address || '' }), ...schedule,
          ...publicMapPoint,
          id: event.id, city: event.city, timeZone: event.timeZone, ownerUid: event.ownerUid, submittedByName: await submitterName(tx,event,submitterNames),
          status: event.status, hidden: event.hidden === true, deleted: Boolean(event.deletedAt), revision: event.revision, formVersion: event.formVersion,
          allowCancellation: event.allowCancellation === true, registrationOnly: true,
          canManage: manager, canApprove, isRegistered: registered,
          canRegister: event.status === 'approved' && localMinute(now(), event.timeZone) < (event.closes || `${event.date}T00:00`),
          canEditRegistration: Boolean(registered && event.status === 'approved' && localMinute(now(), event.timeZone).slice(0, 10) < event.date),
          ...liveProjection(event),
        };
        if (manager) { row.hasPendingChanges = Boolean(event.hasPendingChanges); row.reviewDecision = event.reviewDecision || null; }
        if (manager || (registered && event.status !== 'cancelled')) row.hasPoster = Boolean(privateSnap.data()?.posterPath);
        return row;
      }));
      return rows.filter(Boolean);
    });
  }
  async function listRegistrationEvents(request) {
    gate();
    const scope = request.data?.scope || 'public';
    if (!['public', 'mine', 'review', 'attending', 'management'].includes(scope)) fail('invalid-argument', 'Choose a valid event list.');
    const signedIn = request.auth && request.auth.token?.firebase?.sign_in_provider !== 'anonymous';
    const caller = scope === 'public' && !signedIn ? null : await actor(request);
    if (scope === 'attending') {
      let query = db.collection('registrationMemberEvents').doc(caller.uid).collection('events').orderBy('__name__').limit(25);
      if (request.data?.cursor) query = query.startAfter(id(request.data.cursor));
      const page = await query.get();
      return { events: await registrationListPage(request, scope, null, page.docs.map(doc => doc.id)), nextCursor: page.docs.length === 25 ? page.docs.at(-1).id : null };
    }
    const city = scope === 'mine' ? null : (scope === 'review' && request.data?.city == null ? null : id(request.data?.city));
    if (scope === 'review' && !approves(caller, { city })) fail('permission-denied', 'You cannot review events.');
    if (scope === 'management' && caller.profile.role !== 'superAdmin'
      && !(caller.profile.role === 'admin' && (caller.profile.adminCity || caller.profile.defaultCity) === city)) {
      fail('permission-denied', 'You cannot manage events in this city.');
    }
    // One equality + document ID order uses a bounded page; filtering MUST NOT
    // move the cursor to the last visible row or pending rows could cause loops.
    let query = db.collection('registrationEvents');
    if (scope === 'mine') query = query.where('ownerUid', '==', caller.uid);
    else if (scope !== 'review' || city) query = query.where('city', '==', city);
    query = query.orderBy('__name__').limit(25);
    if (request.data?.cursor) query = query.startAfter(id(request.data.cursor));
    const page = await query.get();
    return { events: await registrationListPage(request, scope, city, page.docs.map(doc => doc.id)), nextCursor: page.docs.length === 25 ? page.docs.at(-1).id : null };
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
    // Enforce a per-member budget before writing any bytes. Stale revisions and
    // revoked managers do not consume a slot. Quota + recovery intent are atomic.
    await db.runTransaction(async tx => {
      const currentActor = await actor(request, tx); const currentEvent = await readEvent(event.id, tx);
      const rateRef = db.collection('registrationUploadLimits').doc(createHash('sha256').update(currentActor.uid).digest('hex'));
      const rate = (await tx.get(rateRef)).data(); const time = now().getTime();
      if (!manages(currentActor, currentEvent)) fail('permission-denied', 'You cannot change this poster.');
      if (currentEvent.status === 'cancelled' || currentEvent.deletedAt) fail('failed-precondition', 'A cancelled or deleted event cannot be edited.');
      if (request.data.expectedRevision !== currentEvent.revision) fail('aborted', 'The event changed. Reload before updating its poster.');
      const sameWindow = rate && Number.isFinite(rate.windowStart) && time >= rate.windowStart && time - rate.windowStart < 60 * 60 * 1000;
      const count = sameWindow ? rate.count : 0;
      if (count >= 10) fail('resource-exhausted', 'Too many poster uploads. Try again in an hour.');
      tx.set(rateRef, { windowStart: sameWindow ? rate.windowStart : time, count: count + 1 });
      enqueuePosterCleanup(db, tx, event.id, path, now());
    });
    await bucket.file(path).save(bytes, { resumable: false, metadata: { contentType: mime, cacheControl: 'private, no-store' } });
    // Recheck role and revision after upload; never create a public/download-token URL.
    let previousPath; let nextRevision; let nextStatus; let staged = false;
    try { await db.runTransaction(async tx => {
      const currentActor = await actor(request, tx); const currentEvent = await readEvent(event.id, tx);
      const previous = await tx.get(privateRef(event.id));
      const pending = (await tx.get(pendingRef(event.id))).data();
      const form = (await tx.get(formRef(event.id))).data();
      if (!manages(currentActor, currentEvent)) fail('permission-denied', 'You cannot change this poster.');
      if (currentEvent.status === 'cancelled' || currentEvent.deletedAt) fail('failed-precondition', 'A cancelled or deleted event cannot be edited.');
      if (request.data.expectedRevision !== currentEvent.revision) fail('aborted', 'The event changed. Reload before updating its poster.');
      staged = currentEvent.status === 'approved';
      previousPath = (staged ? pending?.privateDetails || previous.data() : previous.data())?.posterPath; nextRevision = currentEvent.revision + 1;
      nextStatus = currentEvent.status;
      if (staged) {
        tx.set(pendingRef(event.id), { event: { ...(pending?.event || currentEvent), revision: nextRevision },
          form: pending?.form || form, privateDetails: { ...(pending?.privateDetails || previous.data()), posterPath: path, posterMime: mime },
          submittedAt: now().toISOString(), submittedBy: currentActor.uid });
        tx.update(eventRef(event.id), { revision: nextRevision, hasPendingChanges: true });
      } else {
        tx.set(privateRef(event.id), { posterPath: path, posterMime: mime }, { merge: true });
        tx.update(eventRef(event.id), { revision: nextRevision });
      }
      if (previousPath && previousPath !== path) enqueuePosterCleanup(db, tx, event.id, previousPath, now());
    }); } catch (error) {
      await bucket.file(path).delete({ ignoreNotFound: true }).catch(() => {});
      throw error;
    }
    if (!staged && previousPath && previousPath !== path && previousPath.startsWith(`registration-private/${event.id}/`)) await bucket.file(previousPath).delete({ ignoreNotFound: true }).catch(() => {});
    return { uploaded: true, revision: nextRevision, status: nextStatus, hasPendingChanges: staged };
  }
  async function posterAccess(request, staged) {
    return db.runTransaction(async tx => {
      const [caller, event] = await Promise.all([actor(request, tx), readEvent(request.data?.eventId, tx)]);
      const manager = manages(caller, event);
      requireVisible(caller,event);
      if (staged && (!manager || event.status !== 'approved' || !event.hasPendingChanges)) fail('permission-denied', 'Only managers can review a pending poster.');
      if (!manager) {
        const own = await tx.get(bookingRef(event.id, caller.uid));
        if (own.data()?.status !== 'registered' || event.status !== 'approved') fail('permission-denied', 'Register before viewing the poster.');
      }
      const snapshot = await tx.get(staged ? pendingRef(event.id) : privateRef(event.id));
      return staged ? snapshot.data()?.privateDetails : snapshot.data();
    });
  }
  async function getRegistrationPoster(request) {
    gate();
    if (request.data?.view !== undefined && !['published', 'pending'].includes(request.data.view)) fail('invalid-argument', 'Choose a published or pending poster.');
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') fail('permission-denied', 'Register before viewing the poster.');
    const staged = request.data?.view === 'pending';
    const data = await posterAccess(request, staged);
    if (!data?.posterPath) fail('not-found', 'No poster has been uploaded.');
    const [bytes] = await bucket.file(data.posterPath).download();
    // Recheck active account, city/ownership, registration and current object
    // after storage I/O. Forms and answers are not part of poster authorisation.
    const latest = await posterAccess(request, staged);
    if (latest?.posterPath !== data.posterPath) fail('permission-denied', 'Poster access changed. Reload the event.');
    return { mime: data.posterMime, base64: bytes.toString('base64') };
  }
  async function removeRegistrationPoster(request) {
    let previousPath; let nextRevision; let nextStatus; let staged = false;
    const eventId = id(request.data?.eventId);
    await db.runTransaction(async tx => {
      const caller = await actor(request, tx); const event = await readEvent(eventId, tx);
      requireVisible(caller,event);
      const previous = await tx.get(privateRef(eventId));
      const pending = (await tx.get(pendingRef(eventId))).data();
      const form = (await tx.get(formRef(eventId))).data();
      if (!manages(caller, event)) fail('permission-denied', 'You cannot change this poster.');
      if (event.status === 'cancelled' || event.deletedAt) fail('failed-precondition', 'A cancelled or deleted event cannot be edited.');
      if (request.data.expectedRevision !== event.revision) fail('aborted', 'The event changed. Reload before removing its poster.');
      staged = event.status === 'approved';
      previousPath = (staged ? pending?.privateDetails || previous.data() : previous.data())?.posterPath; nextRevision = event.revision + 1;
      nextStatus = event.status;
      if (staged) {
        tx.set(pendingRef(eventId), { event: { ...(pending?.event || event), revision: nextRevision },
          form: pending?.form || form, privateDetails: { ...(pending?.privateDetails || previous.data()), posterPath: null, posterMime: null },
          submittedAt: now().toISOString(), submittedBy: caller.uid });
        tx.update(eventRef(eventId), { revision: nextRevision, hasPendingChanges: true });
      } else {
        tx.set(privateRef(eventId), { posterPath: null, posterMime: null }, { merge: true });
        tx.update(eventRef(eventId), { revision: nextRevision });
      }
      if (previousPath) enqueuePosterCleanup(db, tx, eventId, previousPath, now());
    });
    if (!staged && previousPath?.startsWith(`registration-private/${eventId}/`)) await bucket.file(previousPath).delete({ ignoreNotFound: true }).catch(() => {});
    return { removed: true, revision: nextRevision, status: nextStatus, hasPendingChanges: staged };
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
  return { setRegistrationEventVisibility, createRegistrationSeries, saveRegistrationEvent, approveRegistrationEvent, approveRegistrationSeries, reviewRegistrationEvent, submitEventRegistration, submitRegistrationOccurrences, cancelEventRegistration, cancelRegistrationEvent, deleteRegistrationEvent, getRegistrationEvent, listRegistrationEvents, listEventRegistrations, deleteRegistrationAnswers, putRegistrationPoster, getRegistrationPoster, removeRegistrationPoster, saveRegistrationTemplate, listRegistrationTemplates };
}
module.exports = { createRegistrationHandlers, localMinute, active, manages, approves };
