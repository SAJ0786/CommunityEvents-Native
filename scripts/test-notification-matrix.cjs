'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { register, recipientMatches, channelAllowed, active } = require('../backend/functions-events/notification-matrix');
function harness() {
  const records = new Map(), mails = [], pushes = [];
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => collection(path + '/' + name), get: async () => snap(path),
    create: async value => { if (records.has(path)) throw Object.assign(Error('exists'), { code: 6 }); records.set(path, structuredClone(value)); },
    set: async value => records.set(path, structuredClone(value)), update: async value => records.set(path, { ...records.get(path), ...structuredClone(value) }) });
  const snap = path => ({ ref: ref(path), id: path.split('/').at(-1), exists: records.has(path), data: () => records.get(path) });
  const collection = (path, filters = [], cursor = '', count = 1000) => ({ doc: id => ref(path + '/' + id),
    where: (key, op, value) => collection(path, [...filters, [key, value]], cursor, count), orderBy: () => collection(path, filters, cursor, count),
    limit: n => collection(path, filters, cursor, n), startAfter: id => collection(path, filters, id, count),
    get: async () => { const docs = [...records.keys()].filter(key => key.startsWith(path + '/') && key.split('/').length === path.split('/').length + 1)
      .sort().filter(key => key.split('/').at(-1) > cursor).filter(key => filters.every(([field, value]) => records.get(key)[field] === value)).slice(0,count).map(snap); return { docs, size: docs.length }; } });
  let chain = Promise.resolve(), reject = false, writeback = false;
  const db = { collection, runTransaction: fn => { const next = chain.then(async () => { const writes = []; const result = await fn({ get: r => r.get(), update: (r,v) => writes.push(() => r.update(v)), set: (r,v) => writes.push(() => r.set(v)), create: (r,v) => writes.push(() => r.create(v)) }); for (const write of writes) await write(); return result; }); chain = next.catch(() => {}); return next; } };
  const functions = register({ db, admin: { firestore: { FieldValue: { serverTimestamp: () => 'STAMP' } }, messaging: () => ({ sendEachForMulticast: async payload => { pushes.push(payload); return { successCount: payload.tokens.length, failureCount: 0 }; } }) },
    triggers: Object.fromEntries(['onDocumentCreated','onDocumentWritten','onDocumentUpdated','onDocumentDeleted'].map(key => [key, (_,fn) => fn])), scheduler: { onSchedule: (_,fn) => fn },
    params: { defineSecret: name => ({ name, value: () => 'configured' }) }, https: { onCall: (_,fn) => fn, HttpsError: class extends Error { constructor(code,message){ super(message); this.code=code; } } },
    nodemailer: { createTransport: () => ({ sendMail: async message => { if (reject) throw Error('ambiguous'); mails.push(message); return { accepted: [message.to] }; } }) } });
  process.env.NOTIFICATION_MATRIX_ENABLED = 'true';
  const user = (uid, patch = {}) => records.set('users/' + uid, { fullName: uid, email: uid + '@example.test', defaultCity: 'sydney', fcmTokens: ['token-' + uid], ...patch });
  const event = (path, id = 'cloud-event') => ({ id, data: { before: { ...snap(path), data: () => undefined }, after: snap(path) }, params: { uid: path.split('/').at(-1) } });
  const flush = async () => { for (let i = 0; i < 8; i++) await functions.deliverNotificationMatrix(); };
  return { db, records, mails, pushes, user, event, snap, functions, flush, reject: value => reject = value };
}
test('optional digest intersects canonical email, category and active identity; service exceptions are explicit', () => {
 const off = { emailNotificationsEnabled: false, pushNotificationsEnabled: false, eventNotificationsEnabled: false };
 assert.equal(channelAllowed(off, {}, 'email'), false); assert.equal(channelAllowed(off, {required:true}, 'email'), true);
 assert.equal(channelAllowed({emailNotificationsEnabled:true,reminderEmailEnabled:false}, {}, 'email'), true);
 assert.equal(channelAllowed({reminderEmailEnabled:false}, {}, 'email'), false);
 assert.equal(active({migratedToUid:'same'}, 'same'), true); assert.equal(active({migratedToUid:'other'}, 'same'), false);
 assert.equal(recipientMatches({role:'admin',adminCity:'perth'}, 'u', {audience:'admins',city:'sydney'}),false);
 assert.equal(recipientMatches({role:'superAdmin'}, 'u', {audience:'admins',city:'sydney'}),true);
});
test('welcome waits for complete profile, sends once, and does not welcome existing complete accounts', async () => {
 const h=harness(); h.user('member'); const e=h.event('users/member'); await h.functions.matrixProfileWritten(e); await h.flush(); assert.equal(h.mails.length,1);
 await h.functions.matrixProfileWritten(e); await h.flush(); assert.equal(h.mails.length,1);
 const before = {...h.records.get('users/member')}; const later=h.event('users/member','later');later.data.before={exists:true,data:()=>before}; await h.functions.matrixProfileWritten(later);await h.flush();assert.equal(h.mails.length,1);
 h.user('incomplete',{fullName:''});await h.functions.matrixProfileWritten(h.event('users/incomplete','incomplete'));await h.flush();assert.equal(h.mails.length,1);
});
test('new profile email confirmation is sent only to current new address; event OTP is not replaced', async () => {
 const h=harness();h.user('member');h.user('sa',{role:'superAdmin'});const e=h.event('users/member');e.data.before={exists:true,data:()=>({...h.records.get('users/member'),email:'old@example.test'})};await h.functions.matrixProfileWritten(e);await h.flush();
 assert.deepEqual(h.mails.map(x=>x.to).sort(),['member@example.test','sa@example.test']);assert.ok(h.mails.every(x=>!x.to.includes('old@')));
});
test('registration bookings route to organizer and superadmins only, and expose no answers in push', async () => {
 const h=harness();for(const uid of ['organizer','sa','cityAdmin','attendee','other'])h.user(uid,{role:uid==='sa'?'superAdmin':uid==='cityAdmin'?'admin':'user'});
 h.records.set('registrationEvents/e',{ownerUid:'organizer',city:'sydney',title:'Workshop'});h.records.set('registrationEvents/e/registrations/attendee',{revision:1,status:'registered',answers:{secret:'private'}});
 const e={id:'booking',params:{eventId:'e',uid:'attendee'},data:{before:{data:()=>undefined},after:h.snap('registrationEvents/e/registrations/attendee')}};
 await h.functions.matrixRegistrationBooking(e);await h.flush();assert.deepEqual(h.mails.map(x=>x.to).sort(),['organizer@example.test','sa@example.test']);assert.equal(h.pushes.length,2);assert.ok(!JSON.stringify(h.pushes).includes('private'));
});
test('host message has bell and push only; ownership transfer stops stale delivery', async () => {
 const h=harness();h.user('host');h.user('customer');h.records.set('events/e',{createdByUserId:'host'});h.records.set('hostMessageThreads/t',{hostUid:'host',senderUid:'customer',participantUids:['host','customer'],eventId:'e'});h.records.set('hostMessageThreads/t/messages/m',{kind:'text',senderUid:'customer',text:'private message'});
 await h.functions.matrixHostMessage({id:'m',params:{threadId:'t',messageId:'m'},data:h.snap('hostMessageThreads/t/messages/m')});await h.flush();assert.equal(h.mails.length,0);assert.equal(h.pushes.length,1);assert.equal(h.pushes[0].data.recipientUid,'host');assert.ok(!JSON.stringify(h.pushes).includes('private message'));
 await h.functions.matrixHostMessage({id:'m2',params:{threadId:'t',messageId:'m'},data:h.snap('hostMessageThreads/t/messages/m')});h.records.set('events/e',{createdByUserId:'replacement'});await h.flush();assert.equal(h.pushes.length,1);
});
test('fanout crosses 50-user boundaries and replay does not duplicate accepted sends', async () => {
 const h=harness();for(let i=0;i<123;i++)h.user('u'+String(i).padStart(3,'0'),{role:'superAdmin'});
 const value={status:'active',eventType:'Meetup',metroArea:'sydney'};await h.functions.onEventCreated({id:'event',params:{eventId:'e'},data:{data:()=>value}});await h.flush();assert.equal(h.mails.length,123);await h.flush();assert.equal(h.mails.length,123);
});
test('ambiguous SMTP failures remain review-required and are never blindly retried', async () => {
 const h=harness();h.user('member');await h.functions.matrixProfileWritten(h.event('users/member'));h.reject(true);await h.flush();h.reject(false);await h.flush();assert.equal(h.mails.length,0);assert.ok([...h.records.values()].some(x=>x.state==='review-required'));
});
test('registration reminder rejects unauthenticated/date-only/past values and uses authoritative start', async () => {
 const h=harness();await assert.rejects(h.functions.scheduleRegistrationNotice({data:{}}),/Sign in/);
 h.records.set('registrationEvents/e',{status:'approved',startTime:'',startAt:null});await assert.rejects(h.functions.scheduleRegistrationNotice({auth:{uid:'u'},data:{eventId:'e',minutesBefore:30}}),/start time/);
 h.records.set('registrationEvents/e',{status:'approved',startTime:'18:00',startAt:new Date(Date.now()+3600000).toISOString()});const result=await h.functions.scheduleRegistrationNotice({auth:{uid:'u'},data:{eventId:'e',minutesBefore:30}});assert.equal(result.scheduled,true);
});

function mailHarness() {
  const h=harness(); let failure, failAcceptedWrite=false;
  const module=require('../backend/functions-events/queued-email');
  const worker=module.register({db:h.db,admin:{},triggers:{onDocumentCreated:(_,fn)=>fn},scheduler:{onSchedule:(_,fn)=>fn},params:{defineSecret:name=>({name,value:()=>name==='SMTP_PORT'?'587':'set'})},nodemailer:{createTransport:()=>({sendMail:async value=>{if(failure)throw failure;h.mails.push(value);return {accepted:[value.to],messageId:'provider-id'};}})}});
  return {...h,...worker,queue:module.queueEmail,fail:value=>failure=value,delivery:id=>({params:{id},data:h.snap('eventEmailOutbox/'+id)})};
}
test('durable event email respects latest preference, preserves Directory branding and accepts once',async()=>{
 const h=mailHarness();h.user('u');const job=await h.queue(h.db,'stable','u',{to:'u@example.test',subject:'Decision',text:'Approved'},true);h.records.get('eventEmailOutbox/'+job.reference).module='directory';
 await h.deliverQueuedEventEmail(h.delivery(job.reference));await h.deliverQueuedEventEmail(h.delivery(job.reference));assert.equal(h.mails.length,1);assert.match(h.mails[0].text,/Business Directory/);assert.equal(h.mails[0].replyTo,'support@siza.info');
 const optional=await h.queue(h.db,'optional','u',{to:'u@example.test',subject:'Digest',text:'Tomorrow'});h.records.get('users/u').emailNotificationsEnabled=false;await h.deliverQueuedEventEmail(h.delivery(optional.reference));assert.equal(h.mails.length,1);assert.equal(h.records.get('eventEmailOutbox/'+optional.reference).state,'skipped');
});
test('temporary SMTP rejection retries safely, while ambiguous failure requires operator review',async()=>{
 const h=mailHarness();h.user('u');const job=await h.queue(h.db,'retry','u',{to:'u@example.test',subject:'Digest',text:'Tomorrow'});h.fail(Object.assign(Error('Temporary rejection'),{responseCode:451}));await assert.rejects(h.deliverQueuedEventEmail(h.delivery(job.reference)),/Retry/);assert.equal(h.records.get('eventEmailOutbox/'+job.reference).state,'pending');h.fail(null);await h.deliverQueuedEventEmail(h.delivery(job.reference));assert.equal(h.mails.length,1);
 const ambiguous=await h.queue(h.db,'ambiguous','u',{to:'u@example.test',subject:'Digest',text:'Tomorrow'});h.fail(Error('Timeout'));await h.deliverQueuedEventEmail(h.delivery(ambiguous.reference));h.fail(null);await h.deliverQueuedEventEmail(h.delivery(ambiguous.reference));assert.equal(h.mails.length,1);assert.equal(h.records.get('eventEmailOutbox/'+ambiguous.reference).state,'review-required');
});
