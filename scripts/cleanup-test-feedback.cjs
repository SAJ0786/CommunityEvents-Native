// One-off, explicitly approved pre-launch cleanup. Never run after launch.
// Preview: node scripts/cleanup-test-feedback.cjs
// Apply:   node scripts/cleanup-test-feedback.cjs --apply
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const project = 'community-event-8b639';
const root = 'projects/' + project + '/databases/(default)/documents';
const prefix = root + '/adminFeedbackThreads/';
const api = 'https://firestore.googleapis.com/v1/';
const token = execSync('gcloud.cmd auth print-access-token', { encoding: 'utf8', windowsHide: true }).trim();
const headers = { Authorization: 'Bearer ' + token, 'x-goog-user-project': project, 'Content-Type': 'application/json' };
async function request(url, options = {}) {
  const r = await fetch(url, { ...options, headers });
  if (!r.ok) throw new Error('Firestore request failed: ' + r.status);
  return r.json();
}
async function list(parent, collectionId) {
  const result = []; let pageToken = '';
  do {
    const url = new URL(api + parent + '/' + collectionId);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await request(url);
    result.push(...(page.documents || [])); pageToken = page.nextPageToken || '';
  } while (pageToken);
  return result;
}
async function descend(doc, records) {
  if (!doc.name.startsWith(prefix)) throw new Error('Refusing a document outside the feedback-only scope.');
  records.push(doc);
  let pageToken = '';
  do {
    const page = await request(api + doc.name + ':listCollectionIds', { method: 'POST', body: JSON.stringify({ pageSize: 100, ...(pageToken ? { pageToken } : {}) }) });
    for (const id of page.collectionIds || []) for (const child of await list(doc.name, id)) await descend(child, records);
    pageToken = page.nextPageToken || '';
  } while (pageToken);
}
async function main() {
  const records = [], threads = await list(root, 'adminFeedbackThreads');
  for (const thread of threads) await descend(thread, records);
  console.log(JSON.stringify({ project, collection: 'adminFeedbackThreads', threads: threads.length, totalDocuments: records.length, apply: process.argv.includes('--apply') }));
  if (!process.argv.includes('--apply') || !records.length) return;
  const directory = path.resolve(__dirname, '../.tools/feedback-backups');
  fs.mkdirSync(directory, { recursive: true });
  const marker = path.join(directory, 'approved-cleanup-completed.json');
  if (fs.existsSync(marker)) throw new Error('The approved one-off cleanup has already run. No further deletion is permitted.');
  if (Date.now() >= Date.parse('2026-09-14T00:00:00Z')) throw new Error('This pre-launch cleanup authorization has expired.');
  const backup = path.join(directory, 'test-feedback-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(backup, JSON.stringify({ project, exportedAt: new Date().toISOString(), collection: 'adminFeedbackThreads', records }, null, 2), { flag: 'wx', mode: 0o600 });
  const verified = JSON.parse(fs.readFileSync(backup, 'utf8'));
  if (JSON.stringify(verified.records) !== JSON.stringify(records)) throw new Error('Backup verification failed; nothing deleted.');
  // Atomic commit, with updateTime preconditions. Any changed record aborts ALL
  // deletes. New records created after this snapshot are deliberately untouched.
  if (records.length > 450) throw new Error('More than 450 records; backup saved but manual review required.');
  await request(api + root + ':commit', { method: 'POST', body: JSON.stringify({ writes: records.map(doc => ({ delete: doc.name, currentDocument: { updateTime: doc.updateTime } })) }) });
  fs.writeFileSync(marker, JSON.stringify({ completedAt: new Date().toISOString(), backup, deletedDocuments: records.length }), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ deletedThreads: threads.length, deletedDocuments: records.length, recoveryBackup: backup }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
