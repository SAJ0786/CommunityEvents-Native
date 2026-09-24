// Actual JSX and service logic; Firebase/native boundaries mocked, no live writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
function load(file, mocks, expose = '') {
  const source = read(file) + (expose ? '\nexport { ' + expose + ' };' : '');
  const code = babel.transformSync(source, { configFile: false, babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] }).code;
  const exports = {};
  vm.runInNewContext(code, { exports, console, setTimeout, clearTimeout, require: name => {
    if (name.endsWith('.png')) return name;
    if (!(name in mocks)) throw new Error('Unexpected dependency: ' + name);
    return mocks[name];
  } });
  return exports;
}
let role = 'superAdmin';
let current = {};
let writes = 0;
let calls = 0;
const firestore = {
  doc: (_, collection, id) => ({ collection, id }),
  getDoc: async ref => ({ exists: () => true, data: () => ref.collection === 'users' ? { role } : current }),
  writeBatch: () => { writes++; return { update() {}, set() {}, delete() {}, commit: async () => {} }; },
};
const services = load('src/services/businesses.js', {
  '@react-native-firebase/firestore': firestore,
  '@react-native-firebase/functions': { httpsCallable: () => async () => { calls++; return { data: {} }; } },
  '../firebase/firebase': { db: {}, functions: {}, ensureFirebaseSession: async () => ({ uid: 'owner', isAnonymous: false }) },
});
const react = {
  createElement(type, props, ...children) {
    const next = { ...props, children: children.flat(Infinity) };
    return typeof type === 'function' ? type(next) : { type, props: next };
  },
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect() {}, useMemo: fn => fn(),
};
const native = Object.fromEntries(['ActivityIndicator','Image','Pressable','ScrollView','Text','View','TextInput','Switch'].map(name => [name,name]));
const mocks = {
  react,
  'react-native': { ...native, Alert: { alert() {} }, Linking: {}, StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 400, fontScale: 1 }) },
  '../services/businesses': services,
  '../theme': { colors: {}, radius: {}, shadow: {}, spacing: {} },
  '../utils/errors': { friendlyError: error => error.message },
  '../components/MemberPageHeader': 'MemberPageHeader',
  '../components/AdminPageHeader': 'AdminPageHeader',
  './BusinessPromotionApprovalPanel': 'BusinessPromotionApprovalPanel',
};
const ownerCard = load('src/business/BusinessOwnerScreen.js', mocks, 'OwnerBusinessCard').OwnerBusinessCard;
const adminCard = load('src/business/BusinessApprovalPanel.js', mocks, 'BusinessReviewCard').BusinessReviewCard;
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...(node.props?.children || []).flatMap(nodes)];
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node?.props?.children || []).map(text).join(' ');
}
const business = status => ({
  id: 'listing', ownerId: 'owner', name: 'Test business', status, hidden: false,
  hasPublishedVersion: true, publishedSnapshot: { name: 'Old name' },
  contact: {}, location: {}, referrer: { name: 'Referrer', phone: '0400000000', location: 'Sydney' },
  archiveReason: 'Test archive reason',
});
function testOwnerViews() {
  for (const status of ['archived', 'deleted']) for (const viewerRole of ['user', 'admin', 'superAdmin']) {
    let edited = false;
    const tree = ownerCard({ business: business(status), role: viewerRole, onEdit: () => { edited = true; } });
    const content = text(tree);
    assert.match(content, new RegExp(status === 'archived' ? 'Archived listing' : 'Deleted listing'));
    assert.match(content, /read-only/);
    assert.match(content, /Not public/);
    assert.doesNotMatch(content, /Edit listing|Add promotion/);
    assert.equal(nodes(tree).filter(node => node.type === 'Pressable').length, 0);
    assert.equal(edited, false);
  }
  for (const status of ['pending', 'approved', 'rejected']) {
    let edited = false;
    const tree = ownerCard({ business: business(status), onEdit: () => { edited = true; } });
    const edit = nodes(tree).find(node => node.type === 'Pressable' && text(node).includes('Edit listing'));
    assert.ok(edit);
    edit.props.onPress();
    assert.equal(edited, true);
  }
  assert.match(text(ownerCard({ business: { ...business('approved'), hidden: true } })), /Not public/);
}
function testAdminViews() {
  for (const status of ['archived', 'deleted']) for (const isSuperAdmin of [false, true]) for (const abn of ['', '51824753556']) {
    const tree = adminCard({
      business: { ...business(status), abn }, selected: true, isManagement: true, isSuperAdmin,
      historyMatches: [{ id: 'old', matchReasons: ['same ABN'] }], onRestore() {},
    });
    const content = text(tree);
    assert.match(content, /read-only/);
    assert.doesNotMatch(content, /Approve & Publish|Request Changes|Verify with ABR|Recheck with ABR|Publish without ABN|LISTING TIER|CURRENTLY PUBLIC|Founding Member/);
    assert.equal(nodes(tree).filter(node => node.type === 'Switch').length, 0);
    const inputs = nodes(tree).filter(node => node.type === 'TextInput');
    assert.equal(inputs.length, isSuperAdmin ? 1 : 0); // restoration reason only
    if (isSuperAdmin) {
      assert.match(content, /RESTORATION REASON/);
      assert.match(content, /Restore for Review/);
    } else assert.doesNotMatch(content, /Restore for Review|RESTORATION REASON/);
  }
  const active = text(adminCard({ business: business('pending'), selected: true, isManagement: true, isSuperAdmin: true, historyMatches: [] }));
  assert.match(active, /Approve & Publish/);
  assert.match(active, /CHANGES REQUIRED REASON/);
}
function testNavigation() {
  const source = read('src/business/BusinessDirectoryModule.js');
  const body = source.split('  const openEditListing = business => {')[1].split('\n  };')[0];
  for (const status of ['archived', 'deleted', 'approved']) {
    let opened = false, warned = false;
    vm.runInNewContext('(business => {' + body + '})(business)', {
      business: business(status), isHistoricalBusiness: services.isHistoricalBusiness,
      Alert: { alert() { warned = true; } }, setEditingBusiness() { opened = true; },
      setListingError() {}, setListingSuccess() {}, setListingFormOpen() {}, onTabChange() {},
    });
    assert.equal(opened, status === 'approved');
    assert.equal(warned, status !== 'approved');
  }
  // Execute the live status-change effect, not just its source string.
  const effect = source.split('  useEffect(() => {\n    if (!listingFormOpen || !editingBusiness?.id) return;')[1].split('\n  }, [listingFormOpen')[0];
  for (const status of ['archived', 'deleted', 'approved']) {
    let closed = false;
    vm.runInNewContext('(function(){' + effect + '})()', {
      ownerBusinesses: [business(status)], editingBusiness: { id: 'listing' },
      isHistoricalBusiness: services.isHistoricalBusiness,
      setListingFormOpen: value => { closed = !value; }, setEditingBusiness() {}, setListingError() {},
      onTabChange() {}, Alert: { alert() {} },
    });
    assert.equal(closed, status !== 'approved');
  }
}
async function testServices() {
  const payload = {
    name: 'Test business', categoryId: 'services', subcategoryIds: ['test'], abnStatus: 'none',
    description: 'A valid test description with more than forty characters.',
    contact: { phone: '0400000000', email: 'test@example.com' },
    location: { fullAddress: 'Sydney NSW 2000', suburb: 'Sydney', state: 'NSW', postcode: '2000', latitude: -33, longitude: 151 },
    listingDeclarationAccepted: true, referrer: { name: 'Referrer', phone: '0400000000', location: 'Sydney', consentConfirmed: true },
  };
  for (const status of ['archived', 'deleted']) for (const nextRole of ['user', 'admin', 'superAdmin']) {
    current = business(status); role = nextRole;
    await assert.rejects(services.updateBusinessSubmission('listing', payload), /historical listing cannot be edited/);
    if (role !== 'user') {
      await assert.rejects(services.rejectBusinessListing('listing', 'A valid rejection reason'), /read-only/);
      await assert.rejects(services.setBusinessVisibility('listing', false), /read-only/);
      await assert.rejects(services.verifyBusinessAbn('listing'), /read-only/);
    }
  }
  assert.equal(writes, 0);
  assert.equal(calls, 0);
}
(async () => {
  testOwnerViews(); testAdminViews(); testNavigation(); await testServices();
  console.log('PASS business history: archived/deleted labels; no owner/admin/super-admin edit controls; no stale Public state; guarded navigation, live archive closure and service calls; active edits and explicit Super Admin restoration retained.');
})().catch(error => { console.error(error); process.exitCode = 1; });
