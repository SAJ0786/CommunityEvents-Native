// Runs production notification policy/workers with an in-memory database only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { allowsNotification, fcmTokens } = require('../backend/functions-business-workflow/notification-policy');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const records = new Map(), pushes = [], emails = [];
let sequence = 0, nextPushResults;
const snapshot = ref => ({ exists: records.has(ref.path), id: ref.id, ref, data: () => records.get(ref.path) });
const reference = p => ({ path: p, id: p.split('/').at(-1),
  get: async () => snapshot(reference(p)), collection: name => collection(p + '/' + name),
  set: async value => records.set(p, { ...value }),
  update: async value => { assert.ok(records.has(p), p); records.set(p, { ...records.get(p), ...value }); },
});
const collection = p => ({ doc: id => reference(p + '/' + (id || 'generated-' + ++sequence)),
  where: () => ({ get: async () => ({ docs: [...records.keys()].filter(k => k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1).map(k => snapshot(reference(k))) }) }),
});
const db = { collection, batch: () => { const writes = []; return { set: (ref, data) => writes.push(() => ref.set(data)), commit: async () => { for (const write of writes) await write(); } }; },
  runTransaction: async fn => {
    const writes = [];
    const result = await fn({ get: ref => ref.get(), set: (ref, value) => writes.push(() => ref.set(value)), update: (ref, value) => writes.push(() => ref.update(value)) });
    for (const write of writes) await write(); return result;
  },
};
const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'SERVER_TIME' } }),
  messaging: () => ({ sendEachForMulticast: async payload => { pushes.push(payload); const responses = nextPushResults || payload.tokens.map(() => ({ success: true })); nextPushResults = null; return { responses }; } }),
};
const logger = { error() {}, warn() {}, info() {} };
const { deliverBusinessPush } = require('../backend/functions-business-workflow/push-delivery').register({ admin, db, onDocumentCreated: (_, fn) => fn, REGION: 'test', logger });
const event = (id, user = 'member', type = 'business-reply') => ({ params: { notificationId: id }, data: { data: () => ({ module: 'directory', recipientUid: user, type, title: 'Business update', body: 'Open Business Inbox', threadId: 'conversation' }) } });
async function testPush() {
  const off = { businessNotificationsEnabled: false, emailNotificationsEnabled: false, pushNotificationsEnabled: false };
  for (const type of ['business-enquiry','business-reply','business.approved','business.changes_requested','business.archived','business.deleted','promotion.approved','promotion.changes_requested']) {
    for (const channel of ['inApp','email','push']) assert.equal(allowsNotification(off, type, channel), true, type);
  }
  for (const channel of ['inApp','email','push']) {
    assert.equal(allowsNotification({}, 'profile.updated', channel), true);
    assert.equal(allowsNotification(off, 'profile.updated', channel), false);
    assert.equal(allowsNotification({ ...off, accountStatus: 'banned' }, 'business-reply', channel), false);
  }
  assert.deepEqual(fcmTokens({ fcmTokens: { iphone: {}, web: true } }), ['iphone','web']);
  records.set('users/member', { ...off, fcmTokens: ['iphone','android','iphone'] });
  await deliverBusinessPush(event('reply'));
  assert.deepEqual(pushes.at(-1).tokens, ['iphone','android']);
  assert.equal(pushes.at(-1).apns.payload.aps.sound, 'default');
  assert.equal(pushes.at(-1).apns.headers['apns-push-type'], 'alert');
  assert.equal(pushes.at(-1).data.screen, 'business-inbox');
  assert.equal(pushes.at(-1).data.recipientUid, 'member');
  const count = pushes.length;
  await deliverBusinessPush(event('reply'));
  assert.equal(pushes.length, count, 'completed push trigger replay must not re-send');
  await deliverBusinessPush(event('optional', 'member', 'profile.updated'));
  assert.equal(pushes.length, count, 'optional update respects opt-out');
  records.set('users/member', { fcmTokens: { good: {}, bad: {} } });
  nextPushResults = [{ success: true }, { success: false, error: { code: 'messaging/registration-token-not-registered' } }];
  await deliverBusinessPush(event('invalid'));
  assert.deepEqual(Object.keys(records.get('users/member').fcmTokens), ['good']);
  records.set('users/member', { fcmTokens: ['good','retry'] });
  nextPushResults = [{ success: true }, { success: false, error: { code: 'messaging/server-unavailable' } }];
  await assert.rejects(deliverBusinessPush(event('partial')), /retry/);
  await deliverBusinessPush(event('partial'));
  assert.deepEqual(pushes.at(-1).tokens, ['retry'], 'do not re-send successful devices during partial retry');
  records.set('users/member', { isActive: false, fcmTokens: ['private'] });
  const before = pushes.length;
  await deliverBusinessPush(event('inactive'));
  assert.equal(pushes.length, before);
  records.set('users/member', {});
  await deliverBusinessPush(event('no-token'));
  assert.equal(records.get('businessPushDeliveries/no-token').reason, 'no-device-token');
  records.set('businessPushDeliveries/exhausted', { attempts: 5 });
  await deliverBusinessPush(event('exhausted'));
  assert.equal(records.get('businessPushDeliveries/exhausted').status, 'failed');
  console.log('PASS push policy/delivery: essential exceptions, default-on/opt-outs, iOS payload, arrays/maps, replay/partial retries, inactive users and missing/invalid tokens.');
}
async function testWorkflow() {
  const exports = {};
  const mocks = {
    'firebase-admin': admin,
    nodemailer: { createTransport: () => ({ sendMail: async email => { emails.push(email); return { messageId: 'test', accepted: [email.to] }; } }) },
    'firebase-functions/v2/firestore': { onDocumentCreated: (_, fn) => fn, onDocumentUpdated: (_, fn) => fn, onDocumentDeleted: (_, fn) => fn },
    'firebase-functions/v2/https': { onCall: (_, fn) => fn, HttpsError: Error },
    'firebase-functions/params': { defineSecret: name => ({ value: () => name === 'SMTP_PORT' ? '587' : 'test' }) },
    'firebase-functions/logger': logger,
    './notification-policy': require('../backend/functions-business-workflow/notification-policy'),
    './email-template': require('../backend/functions-business-workflow/email-template'),
    './support-workflow': { register: () => ({}) }, './push-delivery': { register: () => ({}) },
  };
  vm.runInNewContext(read('backend/functions-business-workflow/index.js'), { exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, console });
  const off = { businessNotificationsEnabled: false, emailNotificationsEnabled: false, pushNotificationsEnabled: false };
  records.clear(); emails.length = 0;
  for (const [uid, role, city] of [['owner','user','sydney'],['actor','admin','sydney'],['city','admin','sydney'],['other','admin','perth'],['super','superAdmin','perth']]) {
    records.set('users/' + uid, { ...off, role, adminCity: city, email: uid + '@example.test' });
  }
  const business = { ownerId: 'owner', name: 'Example', location: { city: 'sydney' }, approvedBy: 'actor', rejectedBy: 'actor', archivedBy: 'actor', deletedBy: 'actor' };
  const update = (before, after) => ({ params: { businessId: 'business' }, data: { before: { data: () => before }, after: { data: () => after } } });
  await exports.nativeBusinessSubmissionUpdated(update({ status: 'pending' }, { ...business, status: 'approved' }));
  assert.deepEqual(emails.map(email => email.to).sort(), ['city@example.test','owner@example.test','super@example.test']);
  const noticeTypes = () => [...records.entries()].filter(([key]) => key.startsWith('userNotifications/')).map(([,value]) => value.type);
  assert.equal(noticeTypes().filter(type => type === 'business.approved').length, 3);
  emails.length = 0;
  await exports.nativeBusinessSubmissionUpdated(update({ status: 'approved' }, { ...business, status: 'archived', archiveReason: 'PRIVATE COMPLAINT DETAILS' }));
  assert.equal(emails.length, 3);
  assert.ok(!emails[0].text.includes('PRIVATE COMPLAINT DETAILS'));
  assert.equal(noticeTypes().filter(type => type === 'business.archived').length, 3);
  emails.length = 0;
  await exports.nativeBusinessSubmissionUpdated(update({ status: 'pending' }, { ...business, status: 'rejected' }));
  assert.equal(emails.length, 3);
  records.set('businesses/business', business);
  emails.length = 0;
  await exports.nativeBusinessPromotionUpdated({ params: { promotionId: 'promo' }, data: { before: { data: () => ({ status: 'pending' }) }, after: { data: () => ({ businessId: 'business', ownerId: 'owner', approvedBy: 'actor', title: 'Offer', status: 'active' }) } } });
  assert.equal(emails.length, 3);
  emails.length = 0;
  await exports.nativeBusinessProfileUpdated({ params: { userId: 'owner' }, data: { before: { data: () => ({ fullName: 'Before', defaultCity: 'sydney' }) }, after: { data: () => ({ fullName: 'After', defaultCity: 'sydney' }) } } });
  assert.equal(emails.length, 0, 'ordinary profile updates respect opted-out admins');
  console.log('PASS workflow recipients: essential approvals/rejections/closures/promotions reach owner + correct admins, exclude actor/other cities, and preserve optional opt-outs.');
}
async function testNativeRegistration() {
  const babel = require('@babel/core');
  const { code } = babel.transformSync(read('src/services/pushNotifications.js'), { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'] });
  let profile = { fcmTokens: { oldWeb: { platform: 'web' } } }, uid = 'member', refreshed, opened, expoOpened, registration = 0, deleted = 0, requests = 0;
  const Platform = { OS: 'ios' }, auth = { currentUser: { uid, isAnonymous: false } };
  let permission = { status: 'granted' };
  const mocks = {
    'react-native': { Platform },
    'expo-notifications': { IosAuthorizationStatus: { PROVISIONAL: 3 }, AndroidImportance: { HIGH: 4 },
      getPermissionsAsync: async () => permission, requestPermissionsAsync: async () => permission,
      setNotificationChannelAsync: async () => {}, addNotificationResponseReceivedListener: fn => { expoOpened = fn; return { remove() {} }; } },
    '@react-native-firebase/firestore': { doc: (_, collection, id) => ({ id }), serverTimestamp: () => 'now', runTransaction: async (_, fn) => fn({
      get: async () => ({ exists: () => true, data: () => profile }), update: (_, data) => { profile = { ...profile, ...data }; },
    }) },
    '@react-native-firebase/messaging': { getMessaging: () => ({}),
      getToken: async () => { requests++; return 'fcm-iphone'; }, getAPNSToken: async () => 'apns-token-not-for-storage',
      isDeviceRegisteredForRemoteMessages: () => false, registerDeviceForRemoteMessages: async () => { registration++; },
      onTokenRefresh: (_, fn) => { refreshed = fn; return () => {}; }, deleteToken: async () => { deleted++; },
      onNotificationOpenedApp: (_, fn) => { opened = fn; return () => {}; }, getInitialNotification: async () => null,
    }, '../firebase/firebase': { db: {}, auth },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, setTimeout, clearTimeout, console });
  await exports.registerDevicePushNotifications(uid);
  assert.equal(registration, 1);
  assert.deepEqual(Object.keys(profile.fcmTokens), ['oldWeb', 'fcm-iphone']);
  assert.ok(!('apns-token-not-for-storage' in profile.fcmTokens));
  permission = { status: 'denied' };
  const before = requests;
  assert.equal(await exports.registerDevicePushNotifications(uid), null);
  assert.equal(requests, before, 'OS denial must not be overridden');
  permission = { status: 'granted' };
  const stop = exports.listenForDevicePushTokenChanges(uid);
  refreshed('refreshed-token'); await new Promise(resolve => setImmediate(resolve));
  assert.ok(profile.fcmTokens['refreshed-token']);
  stop(); refreshed('after-stop'); await new Promise(resolve => setImmediate(resolve));
  assert.ok(!profile.fcmTokens['after-stop']);
  const routes = [];
  const stopOpen = exports.listenForBusinessPushOpens(uid, route => routes.push(route));
  const data = { module: 'directory', recipientUid: uid, notificationId: 'reply', threadId: 'thread' };
  opened({ data }); expoOpened({ notification: { request: { content: { data } } } });
  assert.deepEqual(routes, ['business-inbox'], 'tap sources deduplicated');
  opened({ data: { ...data, notificationId: 'other', recipientUid: 'different-user' } });
  assert.equal(routes.length, 1);
  stopOpen();
  await exports.unregisterDevicePushNotifications(uid);
  assert.equal(deleted, 1);
  assert.ok(!profile.fcmTokens['fcm-iphone']);
  assert.ok(profile.fcmTokens.oldWeb);
  auth.currentUser = { uid: 'someone-else' };
  assert.equal(await exports.registerDevicePushNotifications(uid), null);
  Platform.OS = 'android'; auth.currentUser = { uid }; profile = { fcmTokens: ['legacy-android'] };
  await exports.registerDevicePushNotifications(uid);
  assert.deepEqual(plain(profile.fcmTokens), ['legacy-android','fcm-iphone']);
  const app = JSON.parse(read('app.json')).expo;
  assert.ok(app.plugins.includes('@react-native-firebase/messaging'));
  assert.equal(app.ios.entitlements['aps-environment'], 'production');
  assert.ok(app.ios.infoPlist.UIBackgroundModes.includes('remote-notification'));
  assert.match(read('src/components/ProfileScreen.js'), /remain enabled as service notifications/);
  assert.doesNotMatch(read('App.js'), /if \(!pushEnabled \|\| cancelled/);
  console.log('PASS native push: real iOS FCM registration, APNs not stored as FCM, OS denial, refresh cleanup, map/array preservation, account/tap privacy and native config.');
}
(async () => { await testPush(); await testWorkflow(); await testNativeRegistration(); })().catch(error => { console.error(error); process.exitCode = 1; });
