const test = require('node:test');
const assert = require('node:assert/strict');
const { createApproval } = require('../backend/functions-business-workflow/promotionAudience');
function fixture() {
  const records = new Map([
    ['users/admin', { role: 'admin', defaultCity: 'sydney' }],
    ['businesses/biz', { status: 'approved', location: { city: 'sydney' } }],
    ['businessPromotions/promo', { status: 'pending', businessId: 'biz', requestedAudience: 'australia',
      title: 'Offer', startDate: '2099-01-01', endDate: '2099-12-31' }],
  ]);
  const ref = path => ({ path });
  let writes = 0;
  const db = { collection: path => ({ doc: id => ref(`${path}/${id}`) }), runTransaction: async work => {
    const queued = [];
    const result = await work({ get: async r => ({ exists: records.has(r.path), data: () => records.get(r.path) }),
      set: (r, data) => queued.push(() => records.set(r.path, data)),
      update: (r, data) => queued.push(() => records.set(r.path, { ...records.get(r.path), ...data })) });
    queued.forEach(write => { writes++; write(); }); return result;
  } };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const timestamp = { toMillis: () => 123000 };
  const approve = createApproval({ db, HttpsError, admin: { firestore: { Timestamp: { now: () => timestamp } } }, enabled: () => true });
  const request = { auth: { uid: 'admin' }, data: { promotionId: 'promo', audience: 'australia', confirmAudience: true } };
  return { records, approve, request, writes: () => writes };
}
test('admin approval atomically records trusted audience with matching promotion revision and public projection', async () => {
  const h = fixture(); await h.approve(h.request);
  assert.equal(h.records.get('promotionAudienceApprovals/promo').approvalRevision, '123000');
  assert.equal(h.records.get('businessPromotions/promo').approvedAudience, 'australia');
  assert.equal(h.records.get('publicBusinessPromotions/promo').approvedAudience, 'australia');
  assert.equal(h.writes(), 4);
});
test('owners, deleted admins, missing confirmation and unrequested nationwide audience cannot approve', async () => {
  for (const mutate of [h => { h.records.get('users/admin').role = 'user'; },
    h => { h.records.get('users/admin').accountStatus = 'deleted'; },
    h => { h.request.data.confirmAudience = false; },
    h => { h.records.get('businessPromotions/promo').requestedAudience = 'local'; },
    h => { h.records.get('businesses/biz').hidden = true; },
    h => { h.records.get('businessPromotions/promo').status = 'archived'; }]) {
    const h = fixture(); mutate(h); await assert.rejects(h.approve(h.request)); assert.equal(h.writes(), 0);
  }
});
test('admin can narrow a nationwide request to local city', async () => {
  const h = fixture(); h.request.data.audience = 'local'; await h.approve(h.request);
  assert.equal(h.records.get('promotionAudienceApprovals/promo').audience, 'local');
});
