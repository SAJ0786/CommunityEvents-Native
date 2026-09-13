const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, deleteApp } = require('firebase/app');
const { getFirestore, connectFirestoreEmulator, collection, query, where, getDocs, doc, getDoc, updateDoc, setDoc } = require('firebase/firestore');
const project = 'demo-community-support';
const endpoint = 'http://127.0.0.1:8089';
const base = endpoint + '/v1/projects/' + project + '/databases/(default)/documents';
const val = x => typeof x === 'string' ? { stringValue: x } : typeof x === 'boolean' ? { booleanValue: x } : Array.isArray(x) ? { arrayValue: { values: x.map(val) } } : { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k,v]) => [k,val(v)])) } };
async function seed(p, data) {
  const r = await fetch(base + '/' + p, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k,v]) => [k,val(v)])) }) });
  assert.ok(r.ok, await r.text());
}
async function main() {
  const rules = fs.readFileSync(path.join(__dirname, '../backend/firestore.rules'), 'utf8');
  const r = await fetch(endpoint + '/emulator/v1/projects/' + project + ':securityRules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) });
  assert.ok(r.ok, await r.text());
  await seed('users/outsider', { role: 'superAdmin', isActive: true });
  for (const type of ['business', 'host']) {
    await seed(type + 'MessageThreads/thread', { type, participantUids: ['sender', 'owner'], senderUid: 'sender', ownerUid: 'owner', hostUid: 'owner', businessId: 'business', unreadBy: {} });
    await seed(type + 'MessageThreads/thread/messages/message', { senderUid: 'sender', text: 'Private synthetic test message' });
  }
  await seed('supportSubmissions/private', { senderUid: 'sender', message: 'Private report' });
  for (const uid of ['sender', 'owner', 'outsider', 'anonymous']) {
    const app = initializeApp({ projectId: project, apiKey: 'fake', appId: uid }, uid);
    const db = getFirestore(app);
    connectFirestoreEmulator(db, '127.0.0.1', 8089, { mockUserToken: { sub: uid, user_id: uid, firebase: { sign_in_provider: uid === 'anonymous' ? 'anonymous' : 'phone' } } });
    try {
      for (const type of ['business', 'host']) {
        const name = type + 'MessageThreads';
        const listQuery = query(collection(db, name), where('participantUids', 'array-contains', uid));
        if (uid === 'anonymous') { await assert.rejects(getDocs(listQuery)); continue; }
        const rows = await getDocs(listQuery);
        assert.equal(rows.size, uid === 'outsider' ? 0 : 1, uid + ' private query ' + type);
        const privateDoc = doc(db, name, 'thread');
        if (uid === 'outsider') {
          await assert.rejects(getDoc(privateDoc));
          await assert.rejects(getDoc(doc(db, name, 'thread', 'messages', 'message')));
        } else {
          assert.ok((await getDoc(privateDoc)).exists());
          await updateDoc(privateDoc, { ['unreadBy.' + uid]: 0 });
          await assert.rejects(updateDoc(privateDoc, { participantUids: ['sender', 'outsider'] }));
          await assert.rejects(updateDoc(privateDoc, { senderUid: 'outsider' }));
        }
      }
      await assert.rejects(getDoc(doc(db, 'supportSubmissions', 'private')));
      await assert.rejects(setDoc(doc(db, 'supportEmailOutbox', uid), { recipients: ['attacker@example.test'] }));
    } finally { await deleteApp(app); }
  }
  console.log('PASS participant inbox queries, messages and read state; unrelated super admin cannot read private conversations.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
