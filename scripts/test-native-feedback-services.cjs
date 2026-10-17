const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const babel = require(root + '/node_modules/@babel/core');
const assert = require('node:assert/strict');
const XLSX = require(root + '/node_modules/xlsx');
function load(file, mocks = {}) {
  const exports = {};
  const code = babel.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), { configFile: false, babelrc: false, plugins: [require.resolve(root + '/node_modules/@babel/plugin-transform-modules-commonjs')] }).code;
  vm.runInNewContext(code, { exports, require: name => { if (name in mocks) return mocks[name]; throw Error(name); } });
  return exports;
}
async function main() {
  const presentation = load('src/registration/responsePresentation.js');
  const writes = [], shares = [], deleted = [];
  const exporter = load('src/services/registrationExport.js', {
    xlsx: XLSX,
    'expo-file-system/legacy': { cacheDirectory: 'cache/', EncodingType: { Base64: 'base64' }, writeAsStringAsync: async (...args) => writes.push(args), deleteAsync: async uri => deleted.push(uri) },
    'react-native-share': { __esModule: true, default: { open: async options => shares.push(options) } },
    '../registration/responsePresentation': presentation,
  });
  const rows = [{ status: 'registered', places: 2, submittedAt: '2026-10-18T01:00:00Z', fields: [{ id: 'name', label: 'Full name', type: 'text' }, { id: 'answer', label: 'Notes', type: 'textarea' }], answers: { name: 'Test Member', answer: '=HYPERLINK("bad")' } }];
  await exporter.exportRegistrationWorkbook('Synthetic event', rows);
  const workbook = XLSX.read(writes[0][1], { type: 'base64' });
  const sheet = workbook.Sheets.Responses;
  assert.equal(sheet.A2.v, 'Test Member'); assert.equal(sheet.C2.v, 2);
  assert.equal(sheet.F2.t, 's'); assert.equal(sheet.F2.f, undefined); assert.equal(sheet.F2.v, rows[0].answers.answer);
  assert.equal(sheet['!autofilter'].ref, 'A1:F2'); assert.equal(shares[0].type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(deleted.length, 1);
  await exporter.exportRegistrationWorkbook('Cancelled', rows, () => false);
  assert.equal(writes.length, 1); assert.equal(shares.length, 1);

  let serverReads = 0, cacheReads = 0;
  const profile = { fullName: 'Test Member', email: 'test@example.com', phone: '+61400000000', phoneVerified: true, role: 'user' };
  const snapshot = { id: 'member', exists: () => true, data: () => profile };
  const users = load('src/services/users.js', {
    '@react-native-firebase/firestore': { doc: () => 'user/member', getDoc: async () => { serverReads++; return snapshot; }, getDocFromCache: async () => { cacheReads++; return snapshot; } },
    '@react-native-firebase/functions': {}, '@react-native-firebase/auth': {}, '../firebase/firebase': { db: {} },
  });
  const cached = await users.getUserProfile('member', { cacheOnly: true });
  assert.equal(cached.fullName, profile.fullName); assert.equal(cacheReads, 1); assert.equal(serverReads, 0);
  await users.ensureUserProfile('member', { phone: profile.phone, phoneVerified: true });
  assert.equal(serverReads, 1, 'completed profile initialization must use one server read');
  console.log('PASS: Excel round-trip, literal formula-looking answers, filters, attachment MIME, private export cleanup/cancellation, cached profile and single-read initialization.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
