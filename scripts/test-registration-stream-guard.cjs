const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

function fixture(response = { rtmpUrl: 'rtmp://example.invalid/live/key', sessionId: 'session', watchUrl: 'https://www.youtube.com/watch?v=abc123' }) {
  const calls = [];
  const exports = {};
  const mocks = {
    '@react-native-firebase/functions': { httpsCallable: (_functions, name) => async payload => {
      calls.push({ name, payload });
      return { data: response };
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

test('registration lifecycle always selects registrationEvents and host-only stream lookup; notifications stay off', async () => {
  const { api, calls } = fixture();
  const event = { id: 'registration-id', registrationOnly: true, title: 'Private venue event' };
  await api.startNativeEventStream(event);
  await api.startNativeEventStream({ ...event, isLive: true, liveUrl: 'session' });
  await api.startExternalEventStream(event, 'https://youtube.com/watch?v=example');
  await api.endEventStream(event, 'session');
  await api.endEventStream({ ...event, liveSource: 'external-youtube' });
  await api.getManagedEventStream(event);
  assert.throws(() => api.notifyEventLive(event), /not enabled/);
  assert.equal(calls.length, 6);
  for (const call of calls) {
    assert.equal(call.payload.eventCollection, 'registrationEvents');
    assert.equal(call.payload.eventId, event.id);
  }
  assert.equal(calls[5].name, 'getEventStream');
});

test('missing manager stream links fail explicitly instead of returning a channel fallback', async () => {
  const { api } = fixture({});
  await assert.rejects(api.getManagedEventStream({ id: 'event', registrationOnly: true }), /could not be retrieved/);
});

test('registration modal retrieves host controls and never announces registration streams through legacy delivery', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'NativeLiveStreamModal.js'), 'utf8');
  assert.match(source, /getManagedEventStream\(event\)/);
  assert.match(source, /if \(!event\.registrationOnly\) notifyEventLive\(event\)/);
  assert.match(source, /!pending\.resumeExistingSession && !event\.registrationOnly/);
  assert.doesNotMatch(source, /communityevents.*youtube|youtube\.com\/channel/);
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
