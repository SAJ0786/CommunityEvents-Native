// No camera, live broadcast, cloud write, or app build. Execute source handlers
// with native boundaries mocked, and verify native/codegen patch invariants.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const babel = require('@babel/core');
const traverse = require('@babel/traverse').default;
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('src/components/NativeLiveStreamModal.js');
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const functions = {};
traverse(ast, {
  VariableDeclarator(p) { if (p.node.init?.type === 'ArrowFunctionExpression') functions[p.node.id.name] = source.slice(p.node.init.start, p.node.init.end); },
  JSXAttribute(p) { if (p.node.value?.expression?.type === 'ArrowFunctionExpression') functions[p.node.name.name] = source.slice(p.node.value.expression.start, p.node.value.expression.end); },
});
function load(file, mocks) {
  const { code } = babel.transformSync(read(file), { configFile: false, babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] });
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in mocks)) throw Error('Unexpected dependency ' + name);
    return mocks[name];
  }, console, setTimeout, clearTimeout });
  return exports;
}
async function testEnd(backendFailure) {
  const changes = [];
  const context = {
    nativeStreamStartedRef: { current: true }, cameraMountedRef: { current: true }, liveRef: { current: { stopStreaming() { changes.push('native-stop'); } } },
    StreamingPip: { setStreamingActive(value) { changes.push(value); } },
    connectionStateRef: { current: true }, pendingSessionRef: { current: {} }, streamAttemptRef: { current: 1 }, connectionTimerRef: { current: null },
    logDiagnostic() {}, recordNonFatalError() {}, clearConnectionTimer() {}, clearTimeout() {},
    wait: async () => {}, NATIVE_STOP_SETTLE_MS: 350, Platform: { OS: 'android' },
    restorePortraitOrientation: async () => {}, step: 'phone', event: { id: 'event' }, sessionId: 'session',
    streaming: true, connecting: true, onClose() {}, onStreamChanged() {}, streamOrientation: 'landscape',
    endEventStream: async () => { if (backendFailure) throw Error('offline'); },
  };
  for (const name of ['Busy','Error','Status','Connecting','Streaming','Connected','Interrupted','Minimized','Step','SessionId','WatchUrl']) {
    context['set'+name] = value => changes.push({name,value});
  }
  const run = name => vm.runInNewContext('(' + functions[name] + ')', context);
  context.stopNativeStreamOnce = run('stopNativeStreamOnce');
  await run('finishStream')();
  assert.equal(context.nativeStreamStartedRef.current, false);
  assert.ok(changes.indexOf(false) < changes.indexOf('native-stop'), 'PiP off before native stop');
  assert.ok(changes.some(x=>x.name==='Streaming' && x.value===false));
  assert.ok(changes.some(x=>x.name==='Minimized' && x.value===false));
  const before = changes.length;
  // Delayed callbacks with stale React streaming=true must not revive PiP.
  run('onConnectionSuccess')(); run('onConnectionFailed')('disconnected'); run('onDisconnect')();
  assert.equal(changes.length, before);
  assert.equal(changes.includes(true), false);
}
async function testPermissionCancellation() {
  let handle;
  let answer;
  const commands = [];
  const permissions = new Promise(resolve=>{ answer=resolve; });
  const react = { forwardRef: f=>f, useRef: value=>({current:value}), useImperativeHandle: (_,factory)=>{handle=factory();}, createElement:()=>null };
  const Bridge = load('src/components/AndroidRootEncoderLiveStreamView.js', {
    react, 'react-native': { requireNativeComponent:()=> 'Camera', findNodeHandle:()=>1, Platform:{OS:'android'},
      UIManager:{getViewManagerConfig:()=>({Commands:{startStreaming:1,stopStreaming:2}}),dispatchViewManagerCommand:(_,cmd)=>commands.push(cmd)},
      PermissionsAndroid:{requestMultiple:()=>permissions,PERMISSIONS:{CAMERA:'camera',RECORD_AUDIO:'audio'},RESULTS:{GRANTED:'granted'}} },
  }).default;
  Bridge({}, {});
  const pending = handle.startStreaming('fake-key','rtmps://example.invalid/live');
  handle.stopStreaming();
  answer({camera:'granted',audio:'granted'});
  await assert.rejects(pending, /stopped/);
  assert.deepEqual(commands,[2]);
}
function testNativeIntegration() {
  const libraryPath = path.join(root,'node_modules/@api.video/react-native-livestream');
  const pkg = JSON.parse(fs.readFileSync(path.join(libraryPath,'package.json'),'utf8'));
  const {generateRCTThirdPartyComponents} = require('react-native/scripts/codegen/generate-artifacts-executor/generateRCTThirdPartyComponents.js');
  const output = fs.mkdtempSync(path.join(os.tmpdir(),'cca-codegen-check-'));
  generateRCTThirdPartyComponents([{config:pkg.codegenConfig,libraryPath}],output);
  assert.match(fs.readFileSync(path.join(output,'RCTThirdPartyComponentsProvider.mm'),'utf8'), /@"ApiVideoLiveStreamView": NSClassFromString\(@"RNLiveStreamView"\)/);
  const swift = read('node_modules/@api.video/react-native-livestream/ios/RNLiveStreamViewImpl.swift');
  const stop = swift.slice(swift.indexOf('@objc public func stopStreaming()'),swift.indexOf('private func configurePictureInPicture()'));
  assert.ok(stop.indexOf('AutomaticallyFromInline = false') < stop.indexOf('guard isStreaming'));
  assert.match(swift, /controller.canStartPictureInPictureAutomaticallyFromInline = false/);
  const patch = read('patches/@api.video+react-native-livestream+2.0.2.patch');
  assert.ok(!/^diff --git .*\/(build|\.gradle)\//m.test(patch));
  for (const required of ['RNLiveStreamView.mm','RNLiveStreamViewManager.swift','componentProvider','AutomaticallyFromInline = false']) assert.ok(patch.includes(required));
  const android = read('android/app/src/main/java/info/siza/communityevents/app/StreamingPipModule.kt');
  assert.match(android,/UiThreadUtil.runOnUiThread/);
  const owner = read('android/app/src/main/java/info/siza/communityevents/app/AndroidRootEncoderLiveStreamView.java');
  assert.match(owner,/stopStreamingExplicitly\(\) \{\s*stopping = true;\s*disablePictureInPicture\(\)/);
}
function testMetadata() {
  for (const platform of ['ios','android']) {
    const mocks = {'expo-application':{nativeApplicationVersion:'1.2.3',nativeBuildVersion:'59'},'expo-constants':{expoConfig:{version:'1.0.0',android:{versionCode:48},ios:{buildNumber:'1'}}},'react-native':{Platform:{OS:platform}}};
    const app = load('src/services/appVersion.js',mocks);
    assert.equal(app.appBuild,'59');
    assert.equal(app.appVersion,'1.2.3');
    mocks['expo-application'] = {};
    assert.equal(load('src/services/appVersion.js',mocks).appBuild,'unknown', 'Never report stale config as the installed build');
  }
  const sanitized = load('src/services/diagnostics/sanitizeError.js',{}).sanitizeDiagnosticMetadata({code:'Failed rtmps://example.invalid/live/private-key',streamKey:'private-key'});
  assert.equal(sanitized.streamKey,'[redacted]');
  assert.ok(!sanitized.code.includes('private-key'));
}
function testPodHook() {
  const module = {exports:{}};
  vm.runInNewContext(read('plugins/with-rnfirebase-cocoapods.js'), {module,require:()=>({withPodfile:(config,callback)=>callback(config),withXcodeProject:config=>config})});
  const generated = module.exports({modResults:{contents:'post_install do |installer|\nend'}}).modResults.contents;
  const replacements = [...generated.matchAll(/^\s*("(?:[^"\\]|\\.)*") => ("(?:[^"\\]|\\.)*"),?$/gm)].map(m=>[JSON.parse(m[1]),JSON.parse(m[2])]);
  assert.equal(replacements.length,3, 'All explicit-stop SDK replacements must survive JS/Ruby escaping');
  const patched = replacements.map(([before,after])=>before.replace(before,after)).join('\n');
  assert.match(patched,/self.streamKey = ""\n        self.url = ""/);
  assert.match(patched,/guard !self.streamKey.isEmpty, !self.url.isEmpty else \{ return \}/);
  assert.match(patched,/guard !self.streamKey.isEmpty else \{ return \}/);
}
(async()=>{
  await testEnd(false); await testEnd(true);
  await testPermissionCancellation(); testNativeIntegration(); testMetadata(); testPodHook();
  console.log('PASS stream lifecycle: confirmed End, backend failure, late callbacks, permission cancellation, iOS provider/PiP, native build metadata and redaction');
})().catch(e=>{console.error(e);process.exitCode=1;});
