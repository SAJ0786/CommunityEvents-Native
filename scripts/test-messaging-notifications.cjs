const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, mocks) {
  const { code } = babel.transformSync(read(file), { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'] });
  const exports = {};
  vm.runInNewContext(code, { exports, console: { error() {} }, require: id => {
    if (!(id in mocks)) throw new Error(`Unexpected import ${id}`);
    return mocks[id];
  } });
  return exports;
}

async function main() {
  const batches = [], writes = [], listeners = [];
  let failCommit = false, documentExists = false, missingDenied = false;
  const ref = (...parts) => ({ path: parts.map(p => p?.path || p).filter(Boolean).join('/') });
  const api = {
    collection: ref, doc: (...parts) => ref(...parts, ...(parts.length === 1 ? ['auto'] : [])),
    increment: value => ({ increment: value }), serverTimestamp: () => 'timestamp',
    query: (...parts) => parts, where: (...parts) => parts, orderBy: (...parts) => parts,
    getDoc: async () => {
      if (missingDenied) throw Object.assign(new Error('missing'), { code: 'firestore/permission-denied' });
      return { exists: () => documentExists, data: () => ({}) };
    },
    setDoc: async (...args) => writes.push(['set', ...args]),
    updateDoc: async (...args) => writes.push(['update', ...args]),
    addDoc: async (...args) => writes.push(['add', ...args]),
    onSnapshot: (query, success, error) => { listeners.push({ query, success, error }); return () => {}; },
    writeBatch: () => {
      const operations = [];
      return { set: (...args) => operations.push(['set', ...args]), update: (...args) => operations.push(['update', ...args]),
        commit: async () => { if (failCommit) throw new Error('commit rejected'); batches.push(operations); } };
    },
  };
  const storageMap = new Map();
  const storage = { getItem: async key => storageMap.get(key) || null, setItem: async (key, value) => storageMap.set(key, value) };
  let callableRequest;
  const mocks = {
    '@react-native-firebase/firestore': api,
    '@react-native-async-storage/async-storage': storage,
    '@react-native-firebase/functions': { httpsCallable: (_, name) => async data => { callableRequest = { name, data }; return { data: { threadId: 'server-thread' } }; } },
    '../firebase/firebase': { db: { path: 'db' }, functions: {} },
    '../utils/cities': { DEFAULT_CITY: 'sydney', normalizeCity: value => value, cityLabel: value => value },
  };
  const messaging = load('src/services/messaging.js', mocks);
  const user = { uid: 'sender' }, profile = { fullName: 'Test' };
  const event = { id: 'event', createdByUserId: 'new-owner', ownerUid: 'old-owner', metroArea: 'sydney' };
  await messaging.sendHostMessage({ event, user, profile, text: 'Hello' });
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
  const thread = batches[0][0][2];
  assert.equal(thread.hostUid, 'new-owner');
  assert.equal(thread.unreadBy['new-owner'].increment, 1);
  assert.equal(thread.unreadBy.sender, 0);
  assert.equal(Object.keys(thread).some(key => key.startsWith('unreadBy.')), false);
  await assert.rejects(() => messaging.sendHostMessage({ event, user: { uid: 'new-owner' }, text: 'Hello' }), /managed by you/);
  await assert.rejects(() => messaging.sendHostMessage({ event, user: { uid: 'guest', isAnonymous: true }, text: 'Hello' }), /sign in/);
  failCommit = true;
  await assert.rejects(() => messaging.sendHostMessage({ event, user, text: 'Hello' }), /commit rejected/);
  assert.equal(batches.length, 1, 'failed commit must not report successful writes');
  failCommit = false;
  const conversation = { id: 'thread', participantUids: ['sender', 'new-owner'] };
  await messaging.sendHostReply({ thread: conversation, user, profile, text: 'Reply' });
  await messaging.sendBusinessReply({ thread: conversation, user, profile, text: 'Reply' });
  assert.equal(batches[1].length, 2);
  assert.equal(batches[2].length, 2);
  await assert.rejects(() => messaging.sendBusinessReply({ thread: { ...conversation, adminBlocked: true }, user, text: 'Hello' }), /blocked/);
  await assert.rejects(() => messaging.sendBusinessReply({ thread: conversation, user, text: 'x'.repeat(2001) }), /2000/);
  await messaging.sendBusinessMessage({ business: { id: 'business' }, user, profile, text: 'Enquiry' });
  assert.equal(callableRequest.name, 'sendBusinessEnquiry');
  assert.equal(callableRequest.data.businessId, 'business');

  for (const listen of [messaging.listenHostThreads, messaging.listenBusinessThreads]) {
    let called = false, receivedError;
    listen('sender', () => { called = true; }, error => { receivedError = error; });
    const error = new Error('permission-denied');
    listeners.at(-1).error(error);
    assert.equal(called, false, 'listener errors must not erase inbox results');
    assert.equal(receivedError, error);
  }
  missingDenied = true;
  await messaging.sendFeedbackMessage({ user, profile, text: 'First contact' });
  assert.equal(writes.at(-1)[0], 'add');
  missingDenied = false; documentExists = true; writes.length = 0;
  await messaging.sendFeedbackMessage({ user, profile, text: 'Follow up' });
  assert.equal(writes[0][2].createdAt, undefined, 'follow-up must not change protected metadata');
  assert.equal(writes[0][2].senderUid, undefined);
  assert.equal(writes[0][2].unreadBy.sender, 0);

  const notifications = load('src/services/businessNotifications.js', mocks);
  let current = [];
  const stop = notifications.listenUserNotifications('sender', rows => { current = rows; });
  await new Promise(resolve => setImmediate(resolve));
  listeners.at(-1).success({ docs: [{ id: 'notice', data: () => ({ recipientUid: 'sender', read: false }) }] });
  assert.equal(current.length, 1);
  await notifications.clearUserNotifications(current, 'sender');
  assert.equal(current.length, 0);
  stop();
  notifications.listenUserNotifications('sender', rows => { current = rows; });
  await new Promise(resolve => setImmediate(resolve));
  listeners.at(-1).success({ docs: [{ id: 'notice', data: () => ({ read: true }) }, { id: 'new', data: () => ({ read: false }) }] });
  assert.equal(current.length, 1);
  assert.equal(current[0].id, 'new');

  assert.match(read('backend/firestore.rules'), /getAfter\(\/databases\/\$\(database\)\/documents\/hostMessageThreads/);
  assert.match(read('src/components/EventDetailsModal.js'), /styles.sheetHeader\} \{\.\.\.sheetPanResponder.panHandlers\}/);
  assert.match(read('src/components/KeyboardAwareScrollView.js'), /input !== focused.current/);
  assert.match(read('src/components/NotificationsDrawer.js'), /BusinessNotificationsScreen.*user=\{user\}/);
  assert.match(read('src/components/InboxScreen.js'), /onOpenFeedback/);
  assert.match(read('src/business/BusinessInboxScreen.js'), /onOpenFeedback/);
  const audio = fs.readFileSync(path.join(root, 'assets/sounds/azan_mashad.wav'));
  assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
  assert.equal(audio.toString('ascii', 8, 12), 'WAVE');
  let offset = 12, byteRate, dataSize, format;
  while (offset + 8 <= audio.length) {
    const id = audio.toString('ascii', offset, offset + 4), size = audio.readUInt32LE(offset + 4);
    if (id === 'fmt ') { format = audio.readUInt16LE(offset + 8); byteRate = audio.readUInt32LE(offset + 16); }
    if (id === 'data') dataSize = size;
    offset += 8 + size + (size % 2);
  }
  assert.equal(format, 1, 'iOS notification sound must be PCM');
  assert.ok(dataSize / byteRate > 0 && dataSize / byteRate < 30);
  assert.match(read('src/services/reminders.js'), /azan_mashad.wav/);
  assert.doesNotMatch(read('src/components/AzaanPlaybackController.js'), /position: 'absolute'|playsInSilentMode: true/);
  console.log('PASS messaging: atomic host/business replies, owner routing, validation, surfaced errors, first/repeated feedback; notification clearing; drawer/keyboard contracts; iOS PCM sound');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
