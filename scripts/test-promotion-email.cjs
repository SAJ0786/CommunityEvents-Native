// No Firebase, SMTP or real recipients: execute the actual workers against an in-memory store.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandlers, eligibleRecipient, eligiblePromotion, messageFor, emailKey, register } = require('../backend/functions-business-workflow/promotion-email');
const NOW = new Date('2026-10-02T02:00:00Z');
const business = { name: 'Sample business', status: 'approved', location: { city: 'sydney' } };
const promotion = { businessId: 'business', status: 'active', title: 'Future offer', discountText: '10% off',
  fullDetails: '<script>alert(1)</script>', startDate: '2026-10-20', endDate: '2026-10-31', approvedAt: { seconds: 100 } };
const member = { email: 'member@example.test', defaultCity: 'sydney', emailNotificationsEnabled: true, businessNotificationsEnabled: true };

function harness() {
  const records = new Map(), sent = [], logs = [];
  let transactionChain = Promise.resolve(), failUpdate, smtp = 'ok', failQuery = 0, queries = 0;
  const snap = ref => ({ ref, id: ref.id, exists: records.has(ref.path), data: () => records.get(ref.path) });
  const ref = path => ({ path, id: path.split('/').at(-1), get: async () => snap(ref(path)),
    collection: name => collection(path + '/' + name),
    update: async data => {
      if (failUpdate?.(path, data)) throw new Error('simulated write failure');
      assert.ok(records.has(path)); records.set(path, { ...records.get(path), ...data });
    },
    set: async data => records.set(path, { ...data }),
  });
  const collection = path => ({ doc: id => ref(path + '/' + id), orderBy: () => query(path) });
  const query = (path, cursor = '', count = 100) => ({
    limit: n => query(path, cursor, n), startAfter: id => query(path, id, count),
    get: async () => {
      queries++;
      if (failQuery === queries) throw new Error('simulated page failure');
      return { docs: [...records.keys()].filter(key => key.startsWith(path + '/') && key.split('/').length === path.split('/').length + 1)
        .sort().filter(key => key.split('/').at(-1) > cursor).slice(0, count).map(key => snap(ref(key))) };
    },
  });
  const db = { collection, runTransaction: fn => {
    const next = transactionChain.then(async () => {
      const writes = [];
      const result = await fn({ get: r => r.get(), set: (r, v) => writes.push(() => r.set(v)), update: (r, v) => writes.push(() => r.update(v)) });
      for (const write of writes) await write();
      return result;
    });
    transactionChain = next.catch(() => {});
    return next;
  } };
  const deps = { db, admin: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIME' }, FieldPath: { documentId: () => '__name__' } } },
    now: () => NOW, sender: () => 'support@example.test', logger: { error: (...args) => logs.push(args) },
    buildTransporter: () => smtp === 'missing' ? null : { sendMail: async email => {
      sent.push(email);
      if (smtp === 'error') throw new Error('ambiguous SMTP failure');
      return { accepted: smtp === 'rejected' ? [] : [email.to], messageId: 'test-id' };
    } },
  };
  const handlers = createHandlers(deps);
  records.set('businesses/business', { ...business });
  records.set('businessPromotions/promo', { ...promotion });
  const approval = (before = { status: 'pending' }, after = promotion) => ({ params: { promotionId: 'promo' }, data: { before: { data: () => before }, after: { data: () => after } } });
  const jobs = () => [...records.keys()].filter(key => key.startsWith('promotionEmailCampaigns/promo/recipients/'));
  const delivery = path => ({ params: { promotionId: 'promo', recipientId: ref(path).id }, data: snap(ref(path)) });
  return { records, sent, logs, deps, ...handlers, approval, jobs, delivery,
    setSmtp: mode => { smtp = mode; }, failUpdate: fn => { failUpdate = fn; }, failQuery: n => { failQuery = n; } };
}

test('explicit preferences, valid email, matching city and active account are required', () => {
  assert.ok(eligibleRecipient(member, 'sydney'));
  for (const patch of [{ defaultCity: '' }, { defaultCity: 'perth' }, { email: '' }, { email: 'bad' },
    { emailNotificationsEnabled: false }, { emailNotificationsEnabled: undefined }, { businessNotificationsEnabled: false },
    { businessNotificationsEnabled: undefined }, { active: false }, { isActive: false }, { accountStatus: 'banned' },
    { accountStatus: 'deleted' }, { accountStatus: 'archived' }, { migratedToUid: 'new-user' }]) {
    assert.equal(eligibleRecipient({ ...member, ...patch }, 'sydney'), false, JSON.stringify(patch));
  }
});

test('future offers are eligible immediately; invalid, expired, hidden or unapproved offers are not', () => {
  assert.ok(eligiblePromotion(promotion, business, NOW));
  for (const patch of [{ status: 'pending' }, { status: 'rejected' }, { hidden: true }, { approvedAt: undefined },
    { endDate: '2026-10-01' }, { startDate: '2026-02-30' }, { startDate: '2026-11-01' }, { endDate: '' }]) {
    assert.equal(eligiblePromotion({ ...promotion, ...patch }, business, NOW), false);
  }
  for (const patch of [{ status: 'pending' }, { hidden: true }, { location: {} }, { location: { city: 'unknown' } }]) {
    assert.equal(eligiblePromotion(promotion, { ...business, ...patch }, NOW), false);
  }
  const endToday = { ...promotion, startDate: '2026-10-01', endDate: '2026-10-02' };
  const nearMidnight = new Date('2026-10-02T14:30:00Z');
  assert.equal(eligiblePromotion(endToday, business, nearMidnight), false, 'already next day in Sydney');
  assert.equal(eligiblePromotion(endToday, { ...business, location: { city: 'perth' } }, nearMidnight), true, 'still same day in Perth');
});

test('approval paginates, resumes after failure, deduplicates email and ignores edits/reapproval', async () => {
  const h = harness();
  for (let i = 0; i < 205; i++) h.records.set(`users/u${String(i).padStart(3, '0')}`, { ...member, email: `m${i}@example.test` });
  h.records.set('users/duplicate', { ...member, email: 'M0@example.test' });
  h.records.set('users/otherCity', { ...member, defaultCity: 'perth' });
  h.records.set('users/optout', { ...member, emailNotificationsEnabled: false });
  await h.queue(h.approval(promotion, promotion));
  assert.equal(h.jobs().length, 0, 'active edits and existing offers do not broadcast');
  h.failQuery(2);
  await assert.rejects(h.queue(h.approval()), /page failure/);
  assert.equal(h.jobs().length, 97, '100 profiles, one duplicate email and two ineligible members');
  assert.ok(h.records.get('promotionEmailCampaigns/promo').cursor);
  await Promise.all([h.queue(h.approval()), h.queue(h.approval())]);
  assert.equal(h.jobs().length, 205);
  assert.equal(h.records.get('promotionEmailCampaigns/promo').status, 'queued');
  await h.queue(h.approval({ status: 'pending' }, { ...promotion, approvedAt: { seconds: 200 } }));
  assert.equal(h.jobs().length, 205, 'reapproval never creates another campaign');
  const fresh = harness();
  await fresh.queue(fresh.approval({ status: 'pending' }, { ...promotion, businessId: '' }));
  assert.equal(fresh.jobs().length, 0);
});

test('concurrent/replayed delivery sends once, uses escaped email and includes dates/unsubscribe', async () => {
  const h = harness(); h.records.set('users/user', member);
  await h.queue(h.approval());
  const event = h.delivery(h.jobs()[0]);
  await Promise.all([h.deliver(event), h.deliver(event)]);
  await h.deliver(event);
  assert.equal(h.sent.length, 1);
  assert.equal(h.records.get(h.jobs()[0]).status, 'accepted');
  assert.ok(h.sent[0].text.includes('Starts: 2026-10-20'));
  assert.ok(h.sent[0].text.includes('Ends: 2026-10-31'));
  assert.ok(h.sent[0].html.includes('&lt;script&gt;'));
  assert.ok(!h.sent[0].html.includes('<script>'));
  assert.ok(h.sent[0].headers['List-Unsubscribe'].startsWith('<mailto:'));
  assert.ok(h.sent[0].text.includes('turn off either preference'));
  assert.ok(![...h.records.keys()].some(key => key.startsWith('userNotifications/')), 'email only; existing push/in-app workflow unchanged');
  assert.equal(emailKey(member), emailKey({ ...member, email: ' MEMBER@example.test ' }));
  assert.ok(!messageFor({ ...promotion, title: 'Title\r\nBcc: test' }, business, 'sydney').title.includes('\n'));
});

test('failure after recipients are created can retry without duplicate jobs', async () => {
  const h = harness(); h.records.set('users/user', member);
  h.failUpdate((path, value) => value.status === 'queued');
  await assert.rejects(h.queue(h.approval()), /write failure/);
  assert.equal(h.jobs().length, 1);
  h.failUpdate(null); await h.queue(h.approval());
  assert.equal(h.jobs().length, 1);
  assert.equal(h.records.get('promotionEmailCampaigns/promo').status, 'queued');
});

test('recheck opt-out, removal, changed address/city, withdrawal, expiry and reapproval at send time', async () => {
  for (const mutate of [
    h => h.records.set('users/user', { ...member, businessNotificationsEnabled: false }),
    h => h.records.set('users/user', { ...member, emailNotificationsEnabled: false }),
    h => h.records.delete('users/user'),
    h => h.records.set('users/user', { ...member, email: 'changed@example.test' }),
    h => h.records.set('users/user', { ...member, defaultCity: 'perth' }),
    h => h.records.set('businessPromotions/promo', { ...promotion, status: 'pending' }),
    h => h.records.set('businessPromotions/promo', { ...promotion, endDate: '2026-10-01' }),
    h => h.records.set('businessPromotions/promo', { ...promotion, approvedAt: { seconds: 200 } }),
    h => h.records.set('businesses/business', { ...business, hidden: true }),
    h => h.records.set('businesses/business', { ...business, location: { city: 'perth' } }),
  ]) {
    const h = harness(); h.records.set('users/user', member); await h.queue(h.approval());
    const event = h.delivery(h.jobs()[0]); mutate(h); await h.deliver(event);
    assert.equal(h.sent.length, 0); assert.equal(h.records.get(h.jobs()[0]).status, 'skipped');
  }
});

test('missing SMTP retries before claim; SMTP errors or acceptance writeback failures never auto-resend', async () => {
  const h = harness(); h.records.set('users/user', member); await h.queue(h.approval());
  const event = h.delivery(h.jobs()[0]); h.setSmtp('missing');
  await assert.rejects(h.deliver(event), /SMTP unavailable/);
  assert.equal(h.records.get(h.jobs()[0]).status, 'pending');
  h.setSmtp('ok'); await h.deliver(event); assert.equal(h.sent.length, 1);
  for (const mode of ['error', 'rejected', 'writeback', 'all-writes']) {
    const x = harness(); x.records.set('users/user', member); await x.queue(x.approval());
    const e = x.delivery(x.jobs()[0]);
    if (mode.includes('write')) x.failUpdate((path, value) => value.status === 'accepted' || mode === 'all-writes' && value.status === 'review-required');
    else x.setSmtp(mode);
    if (mode === 'all-writes') await assert.rejects(x.deliver(e), /write failure/);
    else await x.deliver(e);
    await x.deliver(e); assert.equal(x.sent.length, 1, mode);
    assert.equal(x.records.get(x.jobs()[0]).status, mode === 'all-writes' ? 'sending' : 'review-required');
  }
});

test('register only dedicated approval queue and throttled delivery worker', () => {
  const h = harness(), configs = [];
  const registered = register({ ...h.deps, REGION: 'australia-southeast1', EMAIL_SECRETS: ['test-secret'],
    onDocumentUpdated: (config, handler) => { configs.push(config); return handler; },
    onDocumentCreated: (config, handler) => { configs.push(config); return handler; } });
  assert.deepEqual(Object.keys(registered), ['queueApprovedPromotionEmails', 'deliverApprovedPromotionEmail']);
  assert.equal(configs[0].document, 'businessPromotions/{promotionId}');
  assert.equal(configs[1].concurrency, 1); assert.equal(configs[1].maxInstances, 5);
  assert.equal(configs[1].retry, true); assert.deepEqual(configs[1].secrets, ['test-secret']);
});
