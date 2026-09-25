// Real hours helpers, JSX handlers, form initialization and persistence projections.
// No Firebase writes, native UI or external network calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const plain = value => JSON.parse(JSON.stringify(value));
function load(file, mocks = {}, expose = '') {
  const source = read(file) + (expose ? '\nexport { ' + expose + ' };' : '');
  const { code } = babel.transformSync(source, { configFile: false, babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] });
  const exports = {};
  vm.runInNewContext(code, { exports, console, require: name => {
    assert.ok(name in mocks, 'Unexpected import: ' + name); return mocks[name];
  } });
  return exports;
}
const hours = load('src/utils/businessHours.js');
const { BUSINESS_DAYS: days, dayPeriods, cleanBusinessHours, applyHoursToDays, editableHoursDay,
  formatBusinessDay, validateBusinessHours, businessOpenState } = hours;
const period = (open, close) => ({ open, close });
const split = { closed: false, open24Hours: false, periods: [period('09:00', '13:00'), period('17:00', '21:00')] };
const closedWeek = () => Object.fromEntries(days.map(([day]) => [day, { closed: true, open: '', close: '' }]));
const at = (day, hour, minute = 0) => new Date(2026, 8, 21 + day, hour, minute); // Monday 21 September, local clock (same as existing app).

function testData() {
  const legacy = { mon: { closed: false, open: '09:00', close: '17:00' }, tue: { closed: true, open: '10:00', close: '16:00' }, wed: { closed: false, open: '', close: '' } };
  assert.deepEqual(plain(cleanBusinessHours(legacy)), legacy);
  assert.equal(formatBusinessDay(legacy.mon), '09:00 – 17:00', 'existing public display retained');
  assert.equal(formatBusinessDay(legacy.tue), 'Closed');
  assert.equal(formatBusinessDay(legacy.wed), 'Hours not supplied');
  assert.equal(formatBusinessDay(), 'Hours not supplied');
  assert.deepEqual(plain(dayPeriods(null)), []);
  assert.equal(editableHoursDay(null).periods[0].open, '09:00');
  assert.equal(validateBusinessHours(legacy), '');
  assert.equal(validateBusinessHours({ mon: { open: 'By appointment', close: '' } }), '');
  assert.equal(formatBusinessDay(split), '9:00 AM – 1:00 PM\n5:00 PM – 9:00 PM');
  const allDay = { ...split, open24Hours: true };
  assert.equal(formatBusinessDay(allDay), 'Open 24 Hours');
  assert.equal(formatBusinessDay({ ...allDay, closed: true }), 'Closed');
  const savedAllDay = cleanBusinessHours({ mon: allDay }).mon;
  assert.equal(savedAllDay.open, '00:00');
  assert.equal(savedAllDay.close, '23:59');
  assert.deepEqual(plain(savedAllDay.periods), split.periods, 'normal times retained when switching modes');
  const saved = cleanBusinessHours({ mon: split });
  assert.equal(saved.mon.open, '09:00');
  assert.equal(saved.mon.close, '13:00');
  assert.equal(dayPeriods(saved.mon).length, 2);
  assert.deepEqual(plain(editableHoursDay(saved.mon)), split);
  const applied = applyHoursToDays(legacy, ['mon', 'tue'], split);
  assert.equal(applied.wed, legacy.wed, 'unselected days untouched');
  assert.notEqual(applied.mon.periods, applied.tue.periods);
  applied.mon.periods[0].open = '10:00';
  assert.equal(applied.tue.periods[0].open, '09:00');
  assert.equal(split.periods[0].open, '09:00');
  assert.equal(legacy.mon.open, '09:00');
  assert.equal(validateBusinessHours({ mon: split }), '');
  assert.match(validateBusinessHours({ mon: { periods: [period('', '13:00')] } }), /select both/);
  assert.match(validateBusinessHours({ mon: { periods: [period('25:00', '13:00')] } }), /select both/);
  assert.match(validateBusinessHours({ mon: { periods: [period('09:00', '09:00')] } }), /must differ/);
  assert.match(validateBusinessHours({ mon: { periods: [] } }), /add an opening period/);
  assert.match(validateBusinessHours({ mon: { periods: [period('09:00', '14:00'), period('13:00', '17:00')] } }), /overlap/);
  assert.equal(validateBusinessHours({ mon: { periods: [period('09:00', '13:00'), period('13:00', '17:00')] } }), '');
  assert.equal(validateBusinessHours({ mon: { ...split, closed: true, periods: [period('', '')] } }), '');
  assert.equal(validateBusinessHours({ mon: { open24Hours: true } }), '');
  assert.match(validateBusinessHours({ sun: { periods: [period('22:00', '02:00')] }, mon: { periods: [period('01:00', '03:00')] } }), /overlap/);
  assert.equal(validateBusinessHours(applyHoursToDays({}, days.map(([day]) => day), allDay)), '');
  console.log('PASS hours data: legacy preservation, per-day cloning, split/24-hour persistence, validation and weekly overlap checks.');
}
function testOpenState() {
  const week = { ...closedWeek(), mon: split };
  for (const [hour, minute, expected] of [[8, 59, false], [9, 0, true], [12, 59, true], [13, 0, false], [16, 59, false], [17, 0, true], [20, 59, true], [21, 0, false]]) {
    assert.equal(businessOpenState(week, at(0, hour, minute)), expected, `${hour}:${minute}`);
  }
  assert.equal(businessOpenState({ mon: { open24Hours: true } }, at(0, 0)), true);
  assert.equal(businessOpenState({ mon: { open24Hours: true } }, at(0, 23, 59)), true);
  assert.equal(businessOpenState({ mon: { closed: true, open24Hours: true } }, at(0, 12)), false);
  assert.equal(businessOpenState({}, at(0, 12)), null);
  const overnight = { ...closedWeek(), mon: { periods: [period('22:00', '02:00')] } };
  assert.equal(businessOpenState(overnight, at(0, 1)), false, 'Monday overnight does not open Monday morning');
  assert.equal(businessOpenState(overnight, at(0, 23)), true);
  assert.equal(businessOpenState(overnight, at(1, 1)), true, 'previous day carries into closed day');
  assert.equal(businessOpenState(overnight, at(1, 2)), false);
  assert.equal(businessOpenState({ sun: { open: '22:00', close: '02:00' } }, at(0, 1)), true);
  assert.match(formatBusinessDay(overnight.mon), /10:00 PM – 2:00 AM \(next day\)/);
  console.log('PASS Open Now: split-session breaks, exact close boundary, 24 hours, unknown hours and overnight/week-wrap.');
}
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...(tree.children || []).flatMap(nodes)] : [];
const text = tree => nodes(tree).flatMap(node => node.children || []).filter(child => typeof child === 'string').join(' ');
function harness(exportName, initialProps) {
  let state = [], index = 0, props = initialProps, alerts = [];
  const react = { useState: init => { const slot = index++; if (!(slot in state)) state[slot] = typeof init === 'function' ? init() : init;
    return [state[slot], value => { state[slot] = typeof value === 'function' ? value(state[slot]) : value; }]; },
    createElement: (type, properties, ...children) => ({ type, props: properties || {}, children: children.flat() }), Fragment: 'Fragment' };
  const mod = load('src/business/BusinessHoursEditor.js', { react,
    'react-native': { Alert: { alert: (...args) => alerts.push(args) }, Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: value => value } },
    '../components/NativeDateTimeField': 'TimeField', '../theme': { colors: {}, radius: {}, spacing: {} }, '../utils/businessHours': hours });
  return { alerts, render(nextProps) { if (nextProps) props = nextProps; index = 0; return mod[exportName](props); } };
}
function testEditor() {
  let stored = closedWeek(), writes = 0;
  const props = () => ({ hours: stored, onChange: value => { stored = value; writes++; } });
  const editor = harness('default', props());
  const button = (tree, title) => nodes(tree).find(node => node.type === 'Pressable' && text(node) === title);
  let tree = editor.render();
  assert.equal(nodes(tree).filter(node => node.props.accessibilityRole === 'checkbox').length, 7);
  assert.equal(button(tree, 'Apply Hours').props.disabled, true);
  for (const [quick, count] of [['Monday to Friday', 5], ['Saturday and Sunday', 2], ['All 7 Days', 7]]) {
    button(tree, quick).props.onPress(); tree = editor.render();
    assert.equal(nodes(tree).filter(node => node.props.accessibilityState?.checked).length, count);
  }
  button(tree, 'Monday to Friday').props.onPress(); tree = editor.render();
  nodes(tree).find(node => node.props.label === 'Selected days').props.onChange(split); tree = editor.render();
  button(tree, 'Apply Hours').props.onPress();
  assert.equal(writes, 0, 'confirmation required');
  assert.equal(editor.alerts.at(-1)[2][0].style, 'cancel');
  editor.alerts.at(-1)[2][1].onPress();
  assert.equal(writes, 1);
  assert.equal(stored.fri.periods.length, 2);
  assert.equal(stored.sat.closed, true);
  tree = editor.render(props());
  assert.match(text(tree), /Hours applied to Monday, Tuesday, Wednesday, Thursday, Friday/);
  nodes(tree).find(node => node.props.accessibilityLabel === 'Edit Tuesday').props.onPress(); tree = editor.render();
  const monday = stored.mon;
  nodes(tree).find(node => node.props.label === 'Tuesday').props.onChange({ ...split, open24Hours: true });
  assert.equal(stored.mon, monday);
  assert.equal(stored.tue.open24Hours, true);
  tree = editor.render(props());
  assert.match(text(tree), /Open 24 Hours/);
  nodes(tree).find(node => node.props.label === 'Selected days').props.onChange({ ...split, periods: [period('', '')] });
  tree = editor.render();
  const before = writes;
  button(tree, 'Apply Hours').props.onPress(); tree = editor.render();
  assert.equal(writes, before);
  assert.match(text(tree), /select both/);

  let schedule = editableHoursDay({ open: '09:00', close: '17:00' });
  const fields = harness('ScheduleFields', { schedule, label: 'Monday', onChange: value => { schedule = value; } });
  tree = fields.render();
  button(tree, '+ Add another time').props.onPress();
  assert.equal(schedule.periods.length, 2);
  tree = fields.render({ schedule, label: 'Monday', onChange: value => { schedule = value; } });
  nodes(tree).find(node => node.props.accessibilityLabel === 'Remove Monday period 2').props.onPress();
  assert.equal(schedule.periods.length, 1);
  button(tree, 'Closed').props.onPress(); assert.equal(schedule.closed, true);
  tree = fields.render({ schedule, label: 'Monday', onChange: value => { schedule = value; } });
  assert.equal(nodes(tree).filter(node => node.type === 'TimeField').length, 0);
  button(tree, 'Open 24 Hours').props.onPress(); assert.equal(schedule.open24Hours, true); assert.equal(schedule.closed, false);
  console.log('PASS form UX: all quick-select groups, explicit apply, overwrite confirmation/cancel, unselected days, individual edits, modes and additional periods.');
}
function testWiringAndPersistence() {
  const service = load('src/services/businesses.js', { '@react-native-firebase/firestore': { serverTimestamp: () => 'timestamp' },
    '@react-native-firebase/functions': {}, '../firebase/firebase': {}, '../utils/businessHours': hours },
  'submissionFields, publicBusinessFields, publishedPrivateSnapshot');
  const legacy = { mon: { closed: false, open: '09:00', close: '17:00' } };
  for (const value of [legacy, { mon: split, tue: { ...split, open24Hours: true }, wed: { ...split, closed: true } }]) {
    const input = { hours: value };
    const submitted = service.submissionFields(input);
    const published = service.publicBusinessFields(submitted);
    assert.deepEqual(plain(published.hours), plain(cleanBusinessHours(value)));
    assert.deepEqual(plain(service.publishedPrivateSnapshot(submitted).hours), plain(published.hours));
    assert.equal(service.validateBusinessPayload(input).hours, undefined);
  }
  assert.match(service.validateBusinessPayload({ hours: { mon: { periods: [period('', '')] } } }).hours, /select both/);
  const form = read('src/business/BusinessListingForm.js');
  assert.match(form, /<BusinessHoursEditor key=\{initialBusiness\?\.id \|\| 'new'\}/);
  const ast = require('@babel/parser').parse(form, { sourceType: 'module', plugins: ['jsx'] });
  const functions = ast.program.body.filter(node => node.type === 'FunctionDeclaration' && ['defaultHours', 'createFormState'].includes(node.id.name)).map(node => form.slice(node.start, node.end)).join('\n');
  const context = { DAYS: days, normalizeAbn: value => value || '' };
  vm.runInNewContext(functions, context);
  assert.deepEqual(plain(context.createFormState({ hours: legacy }, 'sydney').hours), legacy, 'editing must not invent unsupplied weekdays');
  assert.equal(Object.keys(context.createFormState(null, 'sydney').hours).length, 7);
  assert.deepEqual(plain(context.createFormState({ hours: { mon: split } }, 'sydney').hours.mon), split);
  const details = read('src/business/BusinessDetailsScreen.js');
  assert.match(details, /const days = BUSINESS_DAYS/);
  assert.match(details, /return \[label, formatBusinessDay\(row\)\]/);
  assert.match(details, /hoursRows\.map\(\(\[day, hours\]\) =>/);
  assert.match(read('src/business/BusinessDirectoryModule.js'), /businessOpenState\(business.hours\)/);
  console.log('PASS compatibility: old/new form initialization, submit/approval/public snapshot round-trip, validation and unchanged seven-day public layout.');
}
testData(); testOpenState(); testEditor(); testWiringAndPersistence();
