const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'backend', 'functions-events', 'recovered-source.js'), 'utf8');
const handlerSource = source.slice(source.indexOf('exports.sendPrivateStreamLinkEmail = onCall('), source.indexOf('exports.nativeStreamStop = onCall('));
function fixture(collection = 'registrationEvents', role = 'user', city = 'sydney', account = {}) {
  const reads = []; let sent = 0;
  const context = { exports: {}, REGION: 'test', SMTP_HOST: {}, SMTP_PORT: {}, SMTP_USER: {}, SMTP_PASS: {}, EMAIL_FROM: {},
    onCall: (_, handler) => handler, HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
    db: { collection: name => ({ doc: id => ({ get: async () => {
      reads.push([name, id]);
      return { exists: true, data: () => name === 'nativeStreamSessions'
        ? { uid: 'host', eventId: 'event', eventCollection: collection, privacyStatus: 'unlisted', watchUrl: 'https://youtu.be/test' }
        : name === 'users' ? { role, adminCity: city, ...account } : { city: 'sydney' } };
    } }) }) },
    adminCanAccessEvent: () => role === 'superAdmin',
    sendPrivateStreamLinkToHost: async () => { sent++; return { sent: true }; },
  };
  vm.runInNewContext(handlerSource, context);
  return { call: uid => context.exports.sendPrivateStreamLinkEmail({ auth: uid ? { uid } : null, data: { sessionId: 'session' } }),
    reads, sent: () => sent };
}
test('registration owners and authorized admins cannot trigger private-link delivery', async () => {
  for (const [uid, role] of [['host', 'user'], ['admin', 'admin'], ['super', 'superAdmin']]) {
    const f = fixture('registrationEvents', role);
    const result = await f.call(uid);
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'registration-delivery-disabled');
    assert.equal(f.sent(), 0);
    assert.equal(f.reads.some(([name]) => name === 'events'), false);
  }
});
test('registration guard retains authentication, account and city authorization checks', async () => {
  await assert.rejects(fixture().call(null), { code: 'unauthenticated' });
  await assert.rejects(fixture().call('other'), { code: 'permission-denied' });
  await assert.rejects(fixture('registrationEvents', 'admin', 'perth').call('admin'), { code: 'permission-denied' });
  await assert.rejects(fixture('registrationEvents', 'user', 'sydney', { isActive: false }).call('host'), { code: 'permission-denied' });
});
test('ordinary and legacy sessions preserve existing private-link delivery behavior', async () => {
  for (const collection of ['events', null]) {
    const f = fixture(collection);
    const result = await f.call('host');
    assert.equal(result.sent, true);
    assert.equal(f.sent(), 1);
    assert.equal(f.reads.some(([name]) => name === 'events'), true);
  }
});
