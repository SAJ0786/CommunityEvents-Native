const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Execute the actual shared hook with a deterministic animation clock. Native
// touch dispatch/layout must still be checked on an iOS and Android device.
function harness() {
  let index = 0;
  const slots = [], effects = [], animations = [], calls = [];
  const react = {
    useRef(value) { const i = index++; return slots[i] ||= { current: value }; },
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
    useEffect(fn, deps) {
      const i = index++, previous = slots[i];
      if (!previous || deps.some((v, n) => v !== previous.deps[n])) {
        effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    stopAnimation() { this.pending?.finish(false); }
  }
  function animation(type, value, config) {
    const entry = { type, config, finished: false, start(callback) { this.callback = callback; value.pending = this; animations.push(this); },
      finish(finished = true) {
        if (this.finished) return;
        this.finished = true;
        if (value.pending === this) value.pending = null;
        if (finished) value.setValue(config.toValue);
        this.callback?.({ finished });
      } };
    return entry;
  }
  const native = {
    useWindowDimensions: () => ({ height: 844 }),
    Animated: { Value, spring: (v, c) => animation('spring', v, c), timing: (v, c) => animation('timing', v, c) },
    Easing: { cubic: 'cubic', out: value => `out:${value}` },
    PanResponder: { create: handlers => ({ panHandlers: handlers }) },
  };
  const { code } = babel.transformSync(read('src/components/useMenuDrawerMotion.js'), {
    configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const exports = {};
  vm.runInNewContext(code, { exports, require: id => {
    if (id === 'react') return react;
    if (id === 'react-native') return native;
    throw new Error(id);
  } });
  return { animations, calls,
    render(visible = true) {
      index = 0;
      const result = exports.default({ visible, onClose: () => calls.push('close') });
      effects.splice(0).forEach(effect => effect());
      return result;
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

const h = harness();
let drawer = h.render();
assert.equal(h.animations[0].type, 'spring');
assert.equal(h.animations[0].config.damping, 25);
assert.equal(h.animations[0].config.stiffness, 230);
assert.equal(h.animations[0].config.mass, 0.9);
const pan = drawer.panHandlers;
assert.equal(pan.onStartShouldSetPanResponder(), false);
assert.equal(pan.onMoveShouldSetPanResponder(null, { dy: 5, dx: 1 }), true);
assert.equal(pan.onMoveShouldSetPanResponder(null, { dy: 5, dx: 20 }), false);
assert.equal(pan.onMoveShouldSetPanResponder(null, { dy: -30, dx: 0 }), false);
assert.equal(pan.onMoveShouldSetPanResponderCapture(null, { dy: 5, dx: 1 }), true, 'header must capture downward drags before nested Text/Pressable controls');
assert.equal(pan.onMoveShouldSetPanResponderCapture(null, { dy: 1, dx: 0 }), false, 'a tap on Close must not become a drag');
assert.equal(pan.onMoveShouldSetPanResponderCapture(null, { dy: 5, dx: 20 }), false, 'horizontal motion remains available to children');
assert.equal(pan.onMoveShouldSetPanResponderCapture(null, { dy: -30, dx: 0 }), false, 'upward drags must not dismiss');
pan.onPanResponderGrant();
assert.equal(h.animations[0].finished, true, 'drag must stop the opening spring');
pan.onPanResponderMove(null, { dy: 20 });
assert.equal(drawer.translateY.value, 20);
pan.onPanResponderRelease(null, { dy: 20, vy: 0 });
assert.equal(h.animations.at(-1).type, 'spring');
assert.equal(h.animations.at(-1).config.stiffness, 240);
assert.equal(h.calls.length, 0, 'short drag must restore rather than close');
pan.onPanResponderGrant();
pan.onPanResponderRelease(null, { dy: 62, vy: 0.3 });
const closing = h.animations.at(-1);
assert.equal(closing.type, 'timing', 'projected distance must dismiss');
assert.equal(closing.config.duration, 245);
assert.equal(closing.config.toValue, 844);
assert.equal(h.calls.length, 0, 'remain mounted until slide-out completes');
const count = h.animations.length;
drawer.requestClose();
pan.onPanResponderTerminate();
assert.equal(h.animations.length, count, 'no duplicate close or spring-back during dismissal');
assert.equal(pan.onMoveShouldSetPanResponder(null, { dy: 20, dx: 0 }), false);
assert.equal(pan.onMoveShouldSetPanResponderCapture(null, { dy: 20, dx: 0 }), false, 'do not recapture while already dismissing');
closing.finish();
assert.equal(h.calls.join(','), 'close');

drawer = h.render(false);
drawer = h.render(true);
drawer.requestClose(() => h.calls.push('navigate'));
h.animations.at(-1).finish();
assert.equal(h.calls.join(','), 'close,close,navigate', 'navigate only after closing');

const interrupted = harness();
const interruptedDrawer = interrupted.render();
interruptedDrawer.requestClose(() => interrupted.calls.push('unexpected navigation'));
const staleClose = interrupted.animations.at(-1);
interrupted.render(false);
interrupted.render(true);
staleClose.finish();
assert.equal(interrupted.calls.length, 0, 'an old animation cannot close a reopened drawer');
interrupted.unmount();

for (const name of ['AccountMenuSheet', 'EventDetailsModal', 'NotificationsDrawer']) {
  const source = read(`src/components/${name}.js`);
  assert.match(source, /useMenuDrawerMotion\(\{ visible, onClose \}\)/);
  assert.match(source, /DrawerDragZone/);
  assert.match(source, /panHandlers=\{panHandlers\}/);
  assert.doesNotMatch(source, /PanResponder.create|Animated.spring|Animated.timing/);
}
const dragZone = read('src/components/DrawerDragZone.js');
assert.match(dragZone, /collapsable=\{false\}/, 'shared drag surface must remain a native hit-test target');
const notices = read('src/business/BusinessNotificationsScreen.js');
assert.ok(notices.indexOf('renderHeader(header)') < notices.indexOf('<ScrollView bounces='), 'draggable heading must be outside scroll content');
assert.match(notices, /!renderHeader \? header : null/, 'full Notifications page keeps its header');
assert.doesNotMatch(read('src/components/NotificationsDrawer.js'), /animationType="slide"/);
console.log('PASS shared drawers: Menu spring settings, drag ownership, snap-back, projected swipe, deferred/duplicate close, reopen interruption, navigation ordering and fixed notification header');
