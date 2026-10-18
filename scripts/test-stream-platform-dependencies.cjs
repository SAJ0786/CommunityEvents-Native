const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/components/NativeLiveStreamModal.js'), 'utf8');
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const names = ['ApiVideoLiveStreamView', 'AndroidRootEncoderLiveStreamView', 'PhoneLiveStreamView'];
const declarations = ast.program.body.filter(node => node.type === 'VariableDeclaration' && node.declarations.some(d => names.includes(d.id.name)));
for (const platform of ['android', 'ios']) {
  const loaded = [];
  const context = { Platform: { OS: platform }, require(name) {
    loaded.push(name);
    if (platform === 'android' && name.includes('@api.video')) throw Error('Android must not initialise api.video native code');
    return { ApiVideoLiveStreamView: 'ios-view', default: 'android-view' };
  }};
  const code = declarations.map(node => source.slice(node.start, node.end)).join('\n');
  vm.runInNewContext(code + '\nresult = PhoneLiveStreamView;', context);
  assert.equal(context.result, platform === 'android' ? 'android-view' : 'ios-view');
  assert.deepEqual(loaded, platform === 'android' ? ['./AndroidRootEncoderLiveStreamView'] : ['@api.video/react-native-livestream']);
}
const config = require('../react-native.config');
assert.equal(config.dependencies['@api.video/react-native-livestream'].platforms.android, null);
assert.equal(config.dependencies['@api.video/react-native-livestream'].platforms.ios, undefined);
for (const platform of ['android', 'ios']) {
  const resolved = JSON.parse(execFileSync(process.execPath, [
    path.join(root, 'node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js'),
    'react-native-config', '--platform', platform, '--json',
  ], { cwd: root, encoding: 'utf8' }));
  const library = resolved.dependencies['@api.video/react-native-livestream'];
  assert.equal(Boolean(library?.platforms?.[platform]), platform === 'ios');
}
console.log('Streaming platform dependency isolation passed for Android and iOS.');
