const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

function fixture() {
  const calls = [];
  const exports = {};
  const mocks = {
    '@react-native-firebase/functions': { httpsCallable: (_functions, name) => async payload => {
      calls.push({ name, payload });
      return { data: { rtmpUrl: 'rtmp://example.invalid/live/key', sessionId: 'session' } };
    } },
    '../firebase/firebase': { functions: {} },
    './events': { getEventTitle: event => event.title },
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'streaming.js'), 'utf8');
  const code = babel.transformSync(source, { configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  vm.runInNewContext(code, { exports, require: name => {
    assert.ok(name in mocks, name);
    return mocks[name];
  } });
  return { api: exports, calls };
}

test('registration stream operations fail explicitly before any legacy callable invocation', async () => {
  const { api, calls } = fixture();
  const event = { id: 'registration-id', registrationOnly: true, title: 'Private venue event' };
  await assert.rejects(api.startNativeEventStream(event), /viewing privacy and backend support/);
  await assert.rejects(api.startNativeEventStream({ ...event, isLive: true, liveUrl: 'session' }), /viewing privacy and backend support/);
  await assert.rejects(api.startExternalEventStream(event, 'https://youtube.com/watch?v=example'), /viewing privacy and backend support/);
  await assert.rejects(api.endEventStream(event, 'session'), /viewing privacy and backend support/);
  await assert.rejects(api.endEventStream({ ...event, liveSource: 'external-youtube' }), /viewing privacy and backend support/);
  assert.throws(() => api.notifyEventLive(event), /viewing privacy and backend support/);
  assert.equal(calls.length, 0);
});

test('ordinary stream start, resume, end and notification payloads stay unchanged', async () => {
  const { api, calls } = fixture();
  const event = { id: 'ordinary-id', title: 'Ordinary event', eventType: 'Community', hostName: 'Host' };
  await api.startNativeEventStream(event, 'unlisted');
  await api.startNativeEventStream({ ...event, isLive: true, liveUrl: 'session' });
  await api.startExternalEventStream(event, ' https://youtube.com/watch?v=example ', 'public');
  await api.endEventStream(event, 'session');
  await api.endEventStream({ ...event, liveSource: 'external-youtube' });
  await api.notifyEventLive(event);
  assert.deepEqual(calls.map(call => call.name), [
    'nativeStreamStart', 'nativeStreamResume', 'startExternalYouTubeStream',
    'nativeStreamEndEvent', 'endExternalYouTubeStream', 'notifyEventLive',
  ]);
  assert.equal(calls[0].payload.privacyStatus, 'unlisted');
  assert.equal(calls[0].payload.protocolVersion, 2);
  assert.equal(calls[1].payload.sessionId, 'session');
  assert.equal(calls[2].payload.youtubeUrl, 'https://youtube.com/watch?v=example');
  for (const call of calls) {
    assert.equal(call.payload.eventId, event.id);
    assert.equal('eventKind' in call.payload, false);
  }
});
