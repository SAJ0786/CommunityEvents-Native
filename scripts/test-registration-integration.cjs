const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
function load(file) {
  const exports = {};
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  vm.runInNewContext(code, { exports, require: name => load(path.resolve(path.dirname(file), name + '.js')) }); return exports;
}
const view = load(path.join(root, 'src/registration/registrationViewModel.js'));
const contract = load(path.join(root, 'src/registration/registrationClient.js'));
test('client stays off by default and discovery uses the callable allowlist', async () => {
  let calls = [];
  const call = async (name, data) => { calls.push({ name, data }); return { data: { events: [] } }; };
  await assert.rejects(contract.createRegistrationClient(call).list({ city: 'sydney' }), /not enabled/);
  assert.equal(calls.length, 0);
  await contract.createRegistrationClient(call, { enabled: true }).list({ city: 'sydney', scope: 'review', cursor: 'next' });
  assert.equal(calls[0].name, 'listRegistrationEvents');
  assert.equal(calls[0].data.cursor, 'next');
});
test('editing requires authorised private detail; custom type and cancellation setting survive', () => {
  assert.throws(() => view.eventDraftFromDetail({ canManage: false }, []), /manage/);
  const detail = { canManage: true, privateDetails: { address: '1 Private Lane', venue: null }, event: { title: 'Event', eventType: 'Workshop', date: '2026-12-01', suburb: 'Parramatta', capacity: 3, closes: '', allowCancellation: false }, form: { fields: [], purpose: 'Attendance' } };
  const draft = view.eventDraftFromDetail(detail, ['Majlis']);
  assert.equal(draft.eventType, 'Custom'); assert.equal(draft.customEventType, 'Workshop');
  assert.equal(draft.allowCancellation, false); assert.equal(draft.address, '1 Private Lane');
});
test('changed form requires fresh consent and does not carry renamed/retyped answers', () => {
  const detail = { form: { fields: [{ id: 'name', type: 'text', label: 'Name' }, { id: 'changed', type: 'text', label: 'New question' }, { id: 'terms', type: 'consent', label: 'Agreement' }] },
    ownRegistration: { fields: [{ id: 'name', type: 'text', label: 'Name' }, { id: 'changed', type: 'text', label: 'Old question' }], answers: { name: 'Fictional', changed: 'Old answer', terms: true } } };
  const answers = view.answersForReview(detail);
  assert.equal(answers.name, 'Fictional'); assert.equal(answers.changed, undefined); assert.equal(answers.terms, false);
  detail.ownRegistration = { answersDeletedAt: 'now', fields: [], answers: {} };
  assert.equal(view.answersForReview(detail).name, undefined);
});
test('pagination de-duplicates records and cancelled answers export safely', () => {
  const result = view.mergeRegistrationPage([{ id: 'a', title: 'Old' }], [{ id: 'a', title: 'New' }, { id: 'b' }]);
  assert.equal(result.length, 2); assert.equal(result[0].title, 'New');
  assert.doesNotThrow(() => contract.registrationsCsv([{ registrationId: 'x', status: 'cancelled' }]));
  assert.match(contract.registrationsCsv([{ registrationId: 'x', fields: [{ id: 'answer', label: 'Name' }], answers: { answer: '=1+1' } }]), /'=1\+1/);
});
test('entry points stay release gated; public cards do not render private venue; closing feedback is inline', () => {
  const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const screen = fs.readFileSync(path.join(root, 'src/components/RegistrationScreen.js'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'src/registration/RegistrationEditor.js'), 'utf8');
  const config = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
  assert.match(app, /REGISTRATION_ENABLED && activeTab === 'registration'/);
  assert.match(app, /registrationEnabled=\{REGISTRATION_ENABLED\}/);
  assert.match(config, /eventRegistrationEnabled: process.env.EVENT_REGISTRATION_CLIENT_ENABLED === 'true'/);
  assert.match(screen, /if \(!enabled\) return/);
  assert.match(screen, /detail.privateDetails &&/);
  assert.match(screen, /privateVenueLinks\(detail.privateDetails/);
  assert.match(screen, /key=\{event.id\}[\s\S]*?event.suburb/);
  assert.match(editor, /accessibilityLabel="Registration closing date"[^\n]+\n\s*\{closingDateError\(draft\)/);
  assert.match(screen, /getDynamicEventOptions\(\)/);
  assert.match(screen, /answersForReview\(fresh\)/);
  assert.match(screen, /api.cancel\(detail.event.id, detail.ownRegistration.revision\)/);
});
