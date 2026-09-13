'use strict';
// Evaluate recovered templates with all Firebase, SMTP and network access mocked.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const folder = path.resolve(__dirname, '../backend/functions-events');

async function eventEmailFixtures() {
  const messages = [];
  const record = { status: 'active', eventType: 'Community gathering', hostName: 'Example Centre',
    eventDate: '2026-10-10', startTime: '18:00', organiserType: 'centre', metroArea: 'sydney',
    audienceType: 'Mixed Audience', address: { fullAddress: '123 Example Street, Sydney NSW 2000', suburb: 'Sydney' },
    createdByUserEmail: 'host@example.test', createdByName: 'Test Host', speakerName: 'Test Speaker',
    reciters: [{ type: 'Reciter', name: 'Test Reciter' }] };
  const profile = { email: 'admin@example.test', role: 'superAdmin', fullName: 'Test Admin', defaultCity: 'sydney' };
  const snapshot = data => ({ exists: !!data, id: 'fixture', data: () => data });
  const db = { collection(name) { return {
    get: async () => ({ docs: name === 'users' ? [snapshot(profile)] : [] }),
    doc: () => ({ get: async () => snapshot(name === 'events' ? record : name === 'users' ? profile : null), set: async () => {} }),
  }; } };
  const register = (...args) => args.at(-1);
  const secret = name => ({ value: () => name === 'SMTP_PORT' ? '587' : name === 'SMTP_HOST' ? 'smtp.example.test' : 'synthetic-test-value' });
  const sandbox = { exports: {}, __dirname: folder, console: { log() {}, warn() {}, error() {} },
    process: { env: {} }, setTimeout: callback => callback(),
    require(name) {
      if (name === 'firebase-admin') return { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 0 } }) };
      if (name === 'nodemailer') return { createTransport: () => ({ sendMail: async message => { messages.push(message); return { messageId: 'synthetic' }; } }) };
      if (name === 'firebase-functions/v2/https') return { onCall: register, onRequest: register, HttpsError: Error };
      if (name === 'firebase-functions/v2/firestore') return { onDocumentCreated: register, onDocumentDeleted: register };
      if (name === 'firebase-functions/v2/scheduler') return { onSchedule: register };
      if (name === 'firebase-functions/params') return { defineSecret: secret };
      if (name === 'sharp') return () => { throw new Error('Unexpected image processing'); };
      if (['crypto', 'path', 'url'].includes(name)) return require(name);
      if (name === 'fs') return {};
      if (name === './email-layout' || name === './email-template') return require(path.join(folder, name));
      throw new Error('Unmocked dependency: ' + name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(folder, 'recovered-source.js'), 'utf8') +
    '\nexports.fixtures = { buildGroupedEmailEventTables, buildStoreAnnouncementEmail, unsubscribeFooter, emailEnvelope };', sandbox, { timeout: 2000 });
  // Sender must not regress to the legacy domain or credentials, including
  // the old Gmail-specific fallback. These values are synthetic only.
  const assert = require('node:assert/strict');
  for (const host of ['smtp.example.test', 'smtp.gmail.com', '']) {
    for (const type of ['reminders', 'updates', 'admin']) {
      const envelope = sandbox.exports.fixtures.emailEnvelope({
        SMTP_HOST: { value: () => host }, EMAIL_FROM: { value: () => 'legacy@example.test' },
        SMTP_USER: { value: () => 'legacy-login@example.test' },
      }, type);
      assert.equal(envelope.from, '"Community Connect | Events" <support@siza.info>');
      assert.equal(envelope.replyTo, 'support@siza.info');
    }
  }
  const output = {};
  const capture = async (name, callback) => {
    const before = messages.length;
    await callback();
    if (messages.length !== before + 1) throw new Error(name + ': expected exactly one mock email');
    output[name] = messages.at(-1);
  };
  await capture('events-created', () => sandbox.exports.onEventCreated({ params: { eventId: 'fixture' }, data: snapshot(record) }));
  await capture('events-deleted', () => sandbox.exports.onEventDeleted({ params: { eventId: 'fixture' }, data: snapshot(record) }));
  await capture('events-user-created', () => sandbox.exports.onUserCreated({ params: { uid: 'fixture' }, data: snapshot(profile) }));
  await capture('events-otp', () => sandbox.exports.sendEditOtp({ data: { eventId: 'fixture', contact: 'host@example.test' } }));
  const { sendEventEmail } = require(path.join(folder, 'email-layout'));
  const mockTransport = { sendMail: async message => { messages.push(message); } };
  await capture('events-reminder', () => sendEventEmail(mockTransport, { subject: 'Upcoming community events',
    html: sandbox.exports.fixtures.buildGroupedEmailEventTables([record, { ...record, organiserType: 'private', hostName: '<script>Test & Host</script>' }]) + sandbox.exports.fixtures.unsubscribeFooter('synthetic-user'),
  }));
  await capture('events-app-announcement', () => sendEventEmail(mockTransport, { subject: 'Our app is available', html: sandbox.exports.fixtures.buildStoreAnnouncementEmail() }));
  return output;
}
module.exports = { eventEmailFixtures };
