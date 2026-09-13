const assert = require('node:assert/strict');
const { register, adminEmails, buildEmail, APP_CATEGORIES } = require('../backend/functions-business-workflow/support-workflow');
const records = new Map(), sent = [];
let rejectEmail = false;
const snapshot = ref => ({ ref, exists: records.has(ref.path), data: () => records.get(ref.path), createTime: { toDate: () => new Date('2026-09-13T00:00:00Z') } });
const ref = path => ({
  path, id: path.split('/').at(-1), get: async () => snapshot(ref(path)),
  collection: name => col(path + '/' + name),
  create: async value => { if (records.has(path)) throw Object.assign(new Error('exists'), { code: 6 }); records.set(path, { ...value }); },
  set: async value => records.set(path, { ...value }),
  update: async value => { assert.ok(records.has(path)); records.set(path, { ...records.get(path), ...value }); },
});
const col = path => ({ doc: id => ref(path + '/' + id), where: () => ({ get: async () => ({ docs: [...records.entries()].filter(([k]) => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1).map(([k]) => snapshot(ref(k))) }) }) });
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const funcs = register({
  admin: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIME' } } },
  db: { collection: col, runTransaction: async fn => {
    const writes = [];
    const result = await fn({ get: r => r.get(), create: (r,v) => writes.push(() => r.create(v)), set: (r,v) => writes.push(() => r.set(v)), update: (r,v) => writes.push(() => r.update(v)) });
    for (const write of writes) await write();
    return result;
  } },
  onCall: (_, fn) => fn, onDocumentCreated: (_, fn) => fn, HttpsError,
  REGION: 'test', EMAIL_SECRETS: [], logger: { error() {} },
  buildTransporter: () => ({ sendMail: async email => { if (rejectEmail) throw new Error('SMTP offline'); sent.push(email); return { accepted: [email.to], rejected: [], messageId: email.messageId }; } }),
});
const auth = uid => ({ uid, token: { firebase: { sign_in_provider: 'phone' } } });
const request = (uid, data = {}) => ({ auth: auth(uid), data: { requestId: 'support_reference_' + uid, category: APP_CATEGORIES[0], message: 'A useful test feedback message', senderName: 'Test User', senderEmail: 'user@example.test', ...data } });
async function main() {
  const users = [
    { role: 'admin', adminCity: 'sydney', email: 'city@example.test' },
    { role: 'admin', adminCity: 'melbourne', email: 'other@example.test' },
    { role: 'superAdmin', email: 'super@example.test' },
    { role: 'superAdmin', email: 'super@example.test' },
    { role: 'superAdmin', isActive: false, email: 'inactive@example.test' },
    { role: 'admin', adminCity: 'sydney', accountStatus: 'banned', email: 'banned@example.test' },
    { role: 'user', email: 'owner@example.test' },
  ];
  assert.deepEqual(adminEmails(users, 'sydney'), ['city@example.test', 'super@example.test']);
  for (let i = 0; i < users.length; i++) records.set('users/admin' + i, users[i]);
  records.set('publicBusinesses/biz', { name: 'Business <script>', location: { city: 'sydney' } });
  const app = await funcs.submitSupportRequest(request('sender'));
  assert.deepEqual(records.get('supportEmailOutbox/' + app.reference).recipients, ['support@siza.info']);
  assert.deepEqual(await funcs.submitSupportRequest(request('sender')), app, 'retry is idempotent');
  await assert.rejects(funcs.submitSupportRequest(request('sender', { requestId: 'different_reference' })), /30 seconds/);
  await assert.rejects(funcs.submitSupportRequest({ data: {} }), /session/);
  await assert.rejects(funcs.submitSupportRequest(request('bad', { message: 'short' })), /10–2500/);
  const report = await funcs.submitSupportRequest(request('reporter', { kind: 'business-report', businessId: 'biz', category: 'Business closed', city: 'melbourne', recipients: ['attacker@example.test'] }));
  const job = records.get('supportEmailOutbox/' + report.reference);
  assert.deepEqual(job.recipients, ['city@example.test', 'super@example.test'], 'routing is from trusted business city');
  assert.equal(job.city, 'sydney');
  const email = buildEmail({ ...job, message: '<img src=x onerror=alert(1)>' }, report.reference);
  assert.ok(email.html.includes('&lt;img'));
  assert.ok(!email.html.includes('<script>'));
  assert.equal(email.replyTo, 'support@siza.info');
  const event = id => ({ data: snapshot(ref('supportEmailOutbox/' + id)), params: { reference: id } });
  rejectEmail = true;
  await assert.rejects(funcs.deliverSupportEmail(event(report.reference)), /retry/);
  assert.equal(records.get('supportEmailOutbox/' + report.reference).status, 'retrying');
  rejectEmail = false;
  await funcs.deliverSupportEmail(event(report.reference));
  assert.equal(sent.length, 2);
  assert.equal(records.get('supportSubmissions/' + report.reference).status, 'email-sent');
  await funcs.deliverSupportEmail(event(report.reference));
  assert.equal(sent.length, 2, 'replayed event must not send duplicate completed mail');
  await ref('supportEmailOutbox/exhausted').create({ ...job, attempts: 5, submissionId: app.reference });
  await funcs.deliverSupportEmail(event('exhausted'));
  assert.equal(records.get('supportSubmissions/' + app.reference).status, 'email-failed');
  records.set('businesses/biz', { ownerId: 'owner', contact: { email: 'official@example.test' }, location: { city: 'sydney' } });
  records.set('businessContactRoutes/biz', { active: true, ownerUid: 'owner' });
  records.set('businessMessageThreads/thread', { ownerUid: 'owner', senderUid: 'customer', businessId: 'biz', businessName: 'Business' });
  const enquiry = async id => {
    const p = 'businessMessageThreads/thread/messages/' + id;
    records.set(p, { kind: 'text', senderUid: 'customer', text: 'Customer enquiry' });
    await funcs.queueBusinessEnquiryEmail({ data: snapshot(ref(p)), params: { threadId: 'thread', messageId: id } });
    return [...records.entries()].filter(([k,v]) => k.startsWith('supportEmailOutbox/') && v.kind === 'business-enquiry').at(-1)[1];
  };
  assert.deepEqual((await enquiry('first')).recipients, ['official@example.test']);
  records.set('businesses/biz', { ownerId: 'owner', contact: {} });
  const skipped = await enquiry('missing-email');
  assert.equal(skipped.status, 'skipped');
  assert.deepEqual(skipped.recipients, [], 'no personal-email fallback');
  records.set('businessContactRoutes/biz', { active: true, ownerUid: 'replacement' });
  assert.equal((await enquiry('after-transfer')).skipReason, 'ownership-changed');
  assert.equal([...records.keys()].some(k => k.startsWith('adminFeedbackThreads/')), false);
  console.log('PASS support: categories, validation, private routing, trusted city, idempotency, rate limit, escaped email, retries, exhausted delivery, official email only and transfer privacy.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
