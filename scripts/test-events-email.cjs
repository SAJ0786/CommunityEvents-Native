'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sendEventEmail, textAlternative } = require('../backend/functions-events/email-layout');
const { eventEmailFixtures } = require('./events-email-fixtures.cjs');
const folder = path.resolve(__dirname, '../backend/functions-events');
async function main() {
  const source = fs.readFileSync(path.join(folder, 'recovered-source.js'), 'utf8');
  assert.doesNotMatch(source, /temporaryStoreTesterLogin|transporter\.sendMail\(/);
  assert.equal((source.match(/await sendEventEmail\(transporter,/g) || []).length, 7);
  assert.equal(fs.existsSync(path.join(folder, '.env')), false);
  const normalize = text => text.replace(/\r/g, '');
  assert.equal(normalize(fs.readFileSync(path.join(folder, 'email-template.js'), 'utf8')),
    normalize(fs.readFileSync(path.resolve(folder, '../functions-business-workflow/email-template.js'), 'utf8')));
  const allowed = ['dailyEmailReminders', 'monthlyHijriReminder', 'sendRemindersNow', 'onReminderEmailJobCreated', 'onEventCreated', 'onEventDeleted', 'onUserCreated', 'onAiReportCreated', 'sendEditOtp', 'sendPrivateStreamLinkEmail'];
  const entry = { exports: {}, require: () => Object.fromEntries(allowed.map(name => [name, name])) };
  vm.runInNewContext(fs.readFileSync(path.join(folder, 'email-entrypoints.js'), 'utf8'), entry);
  assert.deepEqual(Object.keys(entry.exports).sort(), allowed.sort());
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'package.json'))).main, 'email-entrypoints.js');
  const message = { from: 'sender@example.test', to: 'recipient@example.test', replyTo: 'support@siza.info',
    subject: 'Test <subject>', headers: { 'X-Test': 'true' }, attachments: [{ filename: 'example.txt', content: 'test' }],
    html: '<p>Test &amp; example</p><a href="https://example.test/unsubscribe?uid=synthetic">Unsubscribe</a>' };
  let delivered;
  const result = await sendEventEmail({ sendMail: async value => { delivered = value; return 'smtp-result'; } }, message);
  assert.equal(result, 'smtp-result');
  for (const key of ['from', 'to', 'replyTo', 'subject', 'headers', 'attachments']) assert.equal(delivered[key], message[key]);
  assert.match(delivered.html, /Test &lt;subject&gt;/);
  assert.match(delivered.text, /https:\/\/example.test\/unsubscribe\?uid=synthetic/);
  assert.equal(textAlternative('<p>A &amp; B</p>'), 'A & B');
  const samples = await eventEmailFixtures();
  for (const [name, email] of Object.entries(samples)) {
    assert.match(email.html, /Community Connect \| Events/, name);
    assert.match(email.text, /^Community Connect \| Events/);
    assert.equal((email.html.match(/<h1\b/g) || []).length, 1);
    assert.doesNotMatch(email.html, /<script>/);
  }
  assert.match(samples['events-reminder'].html, /&lt;script&gt;/);
  assert.match(samples['events-reminder'].text, /unsubscribeEmail\?uid=synthetic-user/);
  assert.equal(samples['events-created'].to, 'admin@example.test');
  assert.equal(samples['events-otp'].to, 'host@example.test');
  for (const name of ['events-created', 'events-deleted', 'events-user-created', 'events-otp']) {
    assert.equal(samples[name].from, '"Community Connect | Events" <support@siza.info>');
    assert.equal(samples[name].replyTo, 'support@siza.info');
  }
  assert.match(samples['events-reminder'].html, /href="mailto:support@siza.info"/);
  assert.doesNotMatch(samples['events-reminder'].html, /mailto:communityeventssydney@gmail.com/);
  console.log('PASS recovered Events email templates: mock handlers, allowlist, escaping, shared shell, envelope preservation and unsubscribe links. No network or live writes.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
