const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
function load(file, mocks = {}, suffix = '') {
  const { code } = babel.transformSync(fs.readFileSync(file, 'utf8') + suffix, {
    configFile: false, babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
  });
  const exports = {};
  vm.runInNewContext(code, { exports, require: id => {
    assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id];
  } });
  return exports;
}
const policy = load('src/utils/imageRenderPolicy.js');
test('public remote images use disk caching and size-aware ARGB decoding', () => {
  const result = policy.imageRenderPolicy({ uri: 'https://images.example/poster.jpg' }, 'contain');
  assert.equal(result.cachePolicy, 'disk');
  assert.equal(result.allowDownscaling, true);
  assert.equal(result.decodeFormat, 'argb');
  assert.equal(result.contentFit, 'contain');
});
test('private payloads, authenticated URLs and upload previews are never persisted', () => {
  for (const source of [{ uri: 'data:image/png;base64,private' }, { uri: 'file:///preview.png' },
    { uri: 'content://picker/one' }, { uri: 'https://images.example/private', headers: { Authorization: 'test' } }, 12]) {
    assert.equal(policy.imageRenderPolicy(source).cachePolicy, 'none');
  }
});
test('fullscreen posters retain original decode resolution and aspect fit', () => {
  const result = policy.imageRenderPolicy({ uri: 'https://images.example/poster' }, 'contain', true);
  assert.equal(result.allowDownscaling, false);
  assert.equal(result.contentFit, 'contain');
});
function reactFixture() {
  const hooks = []; let index = 0;
  return { reset: () => { index = 0; },
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: value => { const i = index++; return hooks[i] || (hooks[i] = { current: value }); },
    useMemo: (fn, deps) => {
      const i = index++;
      if (!hooks[i] || deps.some((v, n) => v !== hooks[i].deps[n])) hooks[i] = { deps, value: fn() };
      return hooks[i].value;
    },
  };
}
test('Android renderer preserves callbacks and resets recycled images only when source changes', () => {
  const react = reactFixture();
  const Image = load('src/components/OptimizedImage.android.js', {
    react, 'expo-image': { Image: 'GlideImage' }, '../utils/imageRenderPolicy': policy,
  }).default;
  const error = () => {}; const style = { width: 80, height: 100 };
  function render(uri) { react.reset(); return Image({ source: { uri }, style, onError: error, resizeMode: 'cover' }); }
  const first = render('https://images.example/one');
  assert.equal(first.type, 'GlideImage');
  assert.equal(first.props.onError, error);
  assert.equal(first.props.style, style);
  assert.equal(render('https://images.example/one').props.recyclingKey, first.props.recyclingKey);
  assert.notEqual(render('data:image/png;base64,private').props.recyclingKey, first.props.recyclingKey);
  assert.ok(render('data:image/png;base64,private').props.recyclingKey.length < 10);
});
test('iOS keeps React Native renderer and strips Android-only fullscreen control', () => {
  const Image = load('src/components/OptimizedImage.js', { react: reactFixture(), 'react-native': { Image: 'RNImage' } }).default;
  const image = Image({ source: { uri: 'https://images.example/poster' }, fullResolution: true, resizeMode: 'contain' });
  assert.equal(image.type, 'RNImage');
  assert.equal(image.props.resizeMode, 'contain');
  assert.ok(!('fullResolution' in image.props));
});
test('poster URL resolution coalesces requests, handles changed paths and evicts old entries', async () => {
  let calls = 0;
  const images = load('src/services/images.js', {
    '@react-native-firebase/storage': { ref: (_, path) => path,
      getDownloadURL: async path => { calls++; return 'https://images.example/' + path; } },
    '../firebase/firebase': { storage: {} },
  });
  await Promise.all(Array.from({ length: 20 }, () => images.resolvePosterSource({ id: 'one', imagePath: 'same' })));
  assert.equal(calls, 1);
  assert.equal(await images.resolvePosterSource({ id: 'one', imagePath: 'replacement' }), 'https://images.example/replacement');
  assert.equal(calls, 2);
  for (let i = 0; i < 129; i++) await images.resolvePosterSource({ imagePath: 'poster-' + i });
  const before = calls;
  await images.resolvePosterSource({ imagePath: 'same' });
  assert.equal(calls, before + 1);
});
test('failed poster resolution can be retried', async () => {
  let calls = 0;
  const images = load('src/services/images.js', {
    '@react-native-firebase/storage': { ref: (_, path) => path, getDownloadURL: async () => {
      if (++calls === 1) throw Error('Offline'); return 'https://images.example/retried';
    } }, '../firebase/firebase': { storage: {} },
  });
  await assert.rejects(images.resolvePosterSource({ imagePath: 'retry' }), /Offline/);
  assert.equal(await images.resolvePosterSource({ imagePath: 'retry' }), 'https://images.example/retried');
});

test('Android directory keeps result rows lazy; iOS retains the previous list and selection', () => {
  const react = { ...reactFixture(), useState: value => [value, () => {}], useMemo: fn => fn(), useEffect: () => {} };
  const native = { Platform: { OS: 'android' }, StyleSheet: { create: x => x, absoluteFillObject: {} },
    useWindowDimensions: () => ({ fontScale: 1 }), FlatList: 'FlatList', View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput' };
  const mocks = { react, 'react-native': native, '../theme': load('src/theme.js'),
    './businessData': { filterAndRankBusinesses: ({ businesses }) => businesses },
    '../utils/cities': { cityLabel: () => 'Sydney, NSW', normalizeCity: x => x } };
  const source = fs.readFileSync('src/business/BusinessDirectoryModule.js', 'utf8');
  const parser = require('@babel/parser');
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  for (const node of ast.program.body.filter(n => n.type === 'ImportDeclaration')) {
    if (!(node.source.value in mocks)) mocks[node.source.value] = { __esModule: true, default: node.source.value };
  }
  const { DirectoryHome } = load('src/business/BusinessDirectoryModule.js', mocks, '\nexport { DirectoryHome };');
  const businesses = Array.from({ length: 1000 }, (_, i) => ({ id: 'business-' + i, name: 'Business ' + i }));
  let selected;
  const props = { businesses, categories: [], savedIds: [], city: 'sydney', onOpenBusiness: b => { selected = b.id; } };
  const android = DirectoryHome(props);
  assert.equal(android.type, 'FlatList');
  assert.equal(android.props.data.length, 1000);
  assert.equal(android.props.initialNumToRender, 6);
  assert.ok(!JSON.stringify(android.props.ListHeaderComponent).includes('Business 999'));
  android.props.renderItem({ item: businesses[999] }).props.onPress();
  assert.equal(selected, 'business-999');
  native.Platform.OS = 'ios';
  const ios = DirectoryHome(props);
  assert.equal(ios.type, '../components/KeyboardAwareScrollView');
  assert.ok(JSON.stringify(ios).includes('Business 999'));
  native.Platform.OS = 'android';
  assert.equal(DirectoryHome({ ...props, loading: true }).props.data.length, 0);
  assert.equal(DirectoryHome({ ...props, error: 'Offline' }).props.data.length, 0);
});

test('release R8, resource shrinking, crash mapping and non-incrementing audit profile stay configured', () => {
  const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
  const properties = fs.readFileSync('android/gradle.properties', 'utf8');
  const rules = fs.readFileSync('android/app/proguard-rules.pro', 'utf8');
  const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
  assert.match(properties, /^android.enableMinifyInReleaseBuilds=true$/m);
  assert.match(properties, /^android.enableShrinkResourcesInReleaseBuilds=true$/m);
  assert.doesNotMatch(properties, /android.enableR8.fullMode=false/);
  assert.match(gradle, /proguard-android-optimize.txt/);
  assert.match(gradle, /mappingFileUploadEnabled true/);
  assert.doesNotMatch(rules, /^\s*-(dontoptimize|dontobfuscate|dontshrink)\b/m);
  assert.equal(eas.build['performance-audit'].autoIncrement, false);
  assert.equal(eas.build['performance-audit'].extends, 'production');
  assert.ok(eas.build.production.buildArtifactPaths.some(p => p.includes('mapping/release')));
});
