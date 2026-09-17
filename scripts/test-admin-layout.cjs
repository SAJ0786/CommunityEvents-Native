const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, mocks) {
  const { code } = babel.transformSync(read(file), { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] });
  const exports = {};
  vm.runInNewContext(code, { exports, require: key => { if (!(key in mocks)) throw new Error('Unexpected import ' + key); return mocks[key]; } });
  return exports;
}
async function main() {
  let measuredInset = 0;
  const refs = [];
  const hook = load('src/components/useMenuNavigationInset.js', { react: {
    useRef(value) { const ref = { current: value }; refs.push(ref); return ref; },
    useState: value => [value, next => { measuredInset = next; }], useCallback: fn => fn,
  } });
  const layout = hook.default();
  assert.equal(layout.bottomInset, 120, 'safe fallback before layout');
  layout.rootRef.current = { measureInWindow: fn => fn(0, 0, 393, 852) };
  layout.onNavigationLayout({ measureInWindow: fn => fn(12, 745, 369, 66) });
  assert.equal(measuredInset, 123, 'includes iPhone safe area and raised Add button');
  layout.rootRef.current = { measureInWindow: fn => fn(0, 24, 360, 776) };
  layout.onNavigationLayout({ measureInWindow: fn => fn(12, 710, 336, 80) });
  assert.equal(measuredInset, 106, 'handles scaled footer and offset root');
  assert.equal(hook.menuNavigationInset(0, 700, 690), 88);

  const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }), Fragment: 'Fragment', useState: value => [value, () => {}], useMemo: fn => fn() };
  const select = load('src/components/CompactSelect.js', {
    react,
    'react-native': { Modal: 'Modal', Pressable: 'Pressable', SafeAreaView: 'SafeAreaView', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: value => value, absoluteFillObject: {} } },
    '../theme': { colors: {}, radius: {}, shadow: {}, spacing: {} },
  }).default;
  const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flatMap(flatten)];
  const options = [{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }, { value: 'superAdmin', label: 'Super Admin' }];
  let selected;
  const tree = flatten(select({ options, value: 'admin', compact: true, onChange: value => { selected = value; } }));
  const radios = tree.filter(node => node.props.accessibilityRole === 'radio');
  assert.equal(radios[1].props.accessibilityState.checked, true);
  radios[1].props.onPress();
  assert.equal(selected, undefined, 'reselecting the current role must not save');
  radios[2].props.onPress();
  assert.equal(selected, 'superAdmin');
  selected = undefined;
  const locked = flatten(select({ options, value: 'user', disabled: true, onChange: value => { selected = value; } }));
  assert.equal(locked.find(node => node.props.accessibilityRole === 'button').props.disabled, true);
  locked.filter(node => node.props.accessibilityRole === 'radio')[1].props.onPress();
  assert.equal(selected, undefined);

  const source = read('src/components/AdminDashboardScreen.js');
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  let handler;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id?.name === 'changeUserRole') handler = source.slice(node.init.start, node.init.end);
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
  }
  visit(ast);
  assert.ok(handler);
  let users = [{ id: 'target', role: 'user' }], saveCount = 0, resolve, fail = false, errorText;
  const context = { profile: { role: 'superAdmin' }, user: { uid: 'self' }, savingUserRoleId: '', ROLE_OPTIONS: options,
    setSavingUserRoleId: value => { context.savingUserRoleId = value; },
    setUsersError: value => { errorText = value; }, setUsersList: fn => { users = fn(users); }, setStatus() {},
    updateUserRole: async () => { saveCount++; if (fail) throw new Error('Denied'); return new Promise(done => { resolve = done; }); },
  };
  const change = vm.runInNewContext('(' + handler + ')', context);
  const pending = change(users[0], 'admin');
  assert.equal(users[0].role, 'user', 'selection changes only after persistence succeeds');
  await change(users[0], 'superAdmin');
  assert.equal(saveCount, 1, 'duplicate/concurrent role saves blocked');
  resolve({ role: 'admin' }); await pending;
  assert.equal(users[0].role, 'admin');
  fail = true; await change(users[0], 'user');
  assert.equal(users[0].role, 'admin', 'failure leaves saved role selected');
  assert.equal(errorText, 'Denied');
  context.profile.role = 'admin'; await change(users[0], 'user');
  context.profile.role = 'superAdmin'; await change({ id: 'self', role: 'superAdmin' }, 'user');
  assert.equal(saveCount, 2, 'city admins and self-demotion do not issue updates');

  assert.doesNotMatch(source, />Refresh<|Refresh Connection/);
  assert.match(source, /AppState.addEventListener/);
  assert.match(source, /userActionRow: \{ flexDirection: 'row'/);
  assert.match(source, /<ScrollView horizontal[^>]*styles.userActionRow/);
  assert.match(source, /<Text style=\{styles\.cardTitle\}>Important Hijri Events Adjustment<\/Text>/);
  assert.match(source, /getHijriObservances\(\)/);
  assert.match(source, /saveHijriObservances\(sorted\)/);
  assert.match(source, /const selectHijriObservance = selection =>/);
  assert.match(source, /options=\{\[\s*\{ value: '__new__', label: 'New event' \},\s*\.\.\.sortedObservances\.map/);
  assert.match(source, /onChange=\{selectHijriObservance\}/);
  assert.match(source, /value=\{hijriObsSelection\}/);
  assert.match(source, /\{hijriObsSelection \? \(/);
  assert.match(source, /onPress=\{\(\) => resetHijriObservanceForm\(\)\}[\s\S]{0,180}>[\s\S]*Cancel</);
  for (const field of ['name', 'day', 'month', 'category', 'priority', 'notes', 'enabled']) {
    assert.match(source, new RegExp(`hijriObsForm\\.${field}`), `Hijri observance form should include ${field}`);
  }
  for (const handler of ['saveObservance', 'toggleObservance', 'confirmDeleteObservance', 'editHijriObservance']) {
    assert.match(source, new RegExp(`const ${handler} =`), `Hijri observance CRUD should include ${handler}`);
  }
  assert.match(source, /if \(!canManageHijriSettings\)/);
  assert.match(read('backend/firestore.rules'), /!\(docId in \['hijriCalendar', 'hijriObservances'\]\)/);
  for (const file of ['src/components/AdminDashboardScreen.js', 'src/business/BusinessAdminDashboard.js', 'src/business/BusinessApprovalPanel.js', 'src/business/BusinessStatisticsScreen.js']) assert.match(read(file), /AdminPageHeader/);
  assert.match(read('src/components/AccountMenuSheet.js'), /paddingBottom: bottomInset/);
  for (const file of ['src/components/BottomNavigation.js', 'src/business/DirectoryBottomNavigation.js']) assert.match(read(file), /onNavigationLayout\?\.\(navigationRef.current\)/);
  console.log('PASS admin layout: measured menu clearance, common headers, no Refresh buttons, role selection/persistence/error/permission guards and single-row actions.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
