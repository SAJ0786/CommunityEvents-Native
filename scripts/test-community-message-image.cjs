'use strict';
// Focused regression tests for the optional Community Update Message inline
// image feature: text-only, image-only, text+image, invalid URL omission and
// empty-request rejection. Loads the real recovered-source.js in a sandboxed
// vm with mocked firebase/nodemailer/sharp dependencies (none are installed
// in this checkout) so the actual shipped logic is exercised, not a copy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const folder = path.resolve(__dirname, '../backend/functions-events');
const sourcePath = path.join(folder, 'recovered-source.js');
const source = fs.readFileSync(sourcePath, 'utf8');

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function chainableFirestoreStub() {
  const stub = {
    collection: () => stub,
    doc: () => stub,
    where: () => stub,
    get: async () => ({ empty: true, docs: [], size: 0 }),
    add: async () => ({ id: 'stub-id' }),
    set: async () => undefined,
    update: async () => undefined,
    batch: () => ({ set() {}, commit: async () => undefined }),
  };
  return stub;
}

const mocks = {
  'firebase-admin': {
    initializeApp: () => undefined,
    firestore: Object.assign(() => chainableFirestoreStub(), {
      FieldValue: { serverTimestamp: () => 'SERVER_TIME' },
    }),
  },
  'nodemailer': { createTransport: () => ({ sendMail: async () => ({}) }) },
  'sharp': () => ({ resize: () => ({ toBuffer: async () => Buffer.from('') }) }),
  'firebase-functions/v2/https': {
    onRequest: (_, handler) => handler || _,
    onCall: (optsOrHandler, handler) => (typeof optsOrHandler === 'function' ? optsOrHandler : handler),
    HttpsError,
  },
  'firebase-functions/v2/firestore': {
    onDocumentCreated: (_, handler) => handler,
    onDocumentDeleted: (_, handler) => handler,
  },
  'firebase-functions/v2/scheduler': { onSchedule: (_, handler) => handler },
  'firebase-functions/params': { defineSecret: name => ({ name, value: () => '' }) },
};

function sandboxRequire(key) {
  if (key in mocks) return mocks[key];
  if (key.startsWith('./') || key.startsWith('../')) return require(path.join(folder, key));
  return require(key);
}

function loadRecoveredSource() {
  const exportsObj = {};
  const context = {
    exports: exportsObj,
    module: { exports: exportsObj },
    require: sandboxRequire,
    console,
    process,
    Buffer,
    URL,
    __dirname: folder,
    __filename: sourcePath,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: sourcePath });
  return context.module.exports;
}

async function main() {
  const { __testables } = loadRecoveredSource();
  assert.ok(__testables, 'recovered-source.js must export __testables for regression coverage');
  const {
    isTrustedCommunityMessageImageUrl,
    buildCustomMessageEmailBody,
    isCustomMessagePayload,
    assertCustomMessagePayloadHasContent,
  } = __testables;

  const trustedUrl = 'https://firebasestorage.googleapis.com/v0/b/community-event-8b639.firebasestorage.app/o/community-message-images%2Fadmin-uid%2F1700000000000.jpg?alt=media&token=abc-123';

  // --- URL trust checks -----------------------------------------------------
  assert.equal(isTrustedCommunityMessageImageUrl(trustedUrl), true, 'accepts the expected Firebase Storage download URL');
  assert.equal(isTrustedCommunityMessageImageUrl(''), false, 'rejects empty');
  assert.equal(isTrustedCommunityMessageImageUrl('not a url'), false, 'rejects garbage');
  assert.equal(isTrustedCommunityMessageImageUrl('data:image/png;base64,AAAA'), false, 'never trusts base64/data URIs');
  assert.equal(isTrustedCommunityMessageImageUrl('http://firebasestorage.googleapis.com/v0/b/community-event-8b639.firebasestorage.app/o/community-message-images%2Fx%2Fy.jpg?alt=media'), false, 'rejects non-https');
  assert.equal(isTrustedCommunityMessageImageUrl('https://evil.example.test/v0/b/community-event-8b639.firebasestorage.app/o/community-message-images%2Fx%2Fy.jpg?alt=media'), false, 'rejects wrong host');
  assert.equal(isTrustedCommunityMessageImageUrl('https://firebasestorage.googleapis.com/v0/b/community-event-8b639.firebasestorage.app/o/business-images%2Fx%2Fy.jpg?alt=media'), false, 'rejects paths outside community-message-images');
  assert.equal(isTrustedCommunityMessageImageUrl('https://firebasestorage.googleapis.com/v0/b/community-event-8b639.firebasestorage.app/o/community-message-images%2Fx%2Fy.jpg'), false, 'requires alt=media');

  // --- Email body composition ----------------------------------------------
  const textOnly = buildCustomMessageEmailBody('Hello everyone', '');
  assert.match(textOnly, /<p style="white-space:pre-wrap;margin:0">Hello everyone<\/p>/, 'text-only renders the message');
  assert.doesNotMatch(textOnly, /<img/, 'text-only has no image tag');

  const imageOnly = buildCustomMessageEmailBody('', trustedUrl);
  assert.doesNotMatch(imageOnly, /<p /, 'image-only has no paragraph');
  assert.match(imageOnly, /<img src="https:\/\/firebasestorage\.googleapis\.com\/[^"]+" alt="Community update image" style="width:100%;max-width:600px;height:auto[^"]*"\s*\/>/, 'image-only renders the image with responsive email-safe styling');

  const textPlusImage = buildCustomMessageEmailBody('Hello everyone', trustedUrl);
  const pIndex = textPlusImage.indexOf('<p ');
  const imgIndex = textPlusImage.indexOf('<img');
  assert.ok(pIndex >= 0 && imgIndex > pIndex, 'text must render before the image');

  const untrustedImage = buildCustomMessageEmailBody('Hello everyone', 'data:image/png;base64,AAAA');
  assert.doesNotMatch(untrustedImage, /<img|data:/, 'an invalid/untrusted URL is omitted, never interpolated');
  assert.match(untrustedImage, /Hello everyone/, 'text-only behaviour is preserved when the image is rejected');

  // --- Empty-request rejection ----------------------------------------------
  assert.equal(isCustomMessagePayload({ customMode: true }), true);
  assert.equal(isCustomMessagePayload({ customMode: true, customTemplate: 'storeAnnouncement' }), false, 'store announcement is a distinct flow, not validated here');
  assert.equal(isCustomMessagePayload({ customMode: false }), false);

  assert.doesNotThrow(() => assertCustomMessagePayloadHasContent({ customMode: true, customMessage: 'hi' }), 'text only is accepted');
  assert.doesNotThrow(() => assertCustomMessagePayloadHasContent({ customMode: true, customImageUrl: trustedUrl }), 'image only is accepted');
  assert.doesNotThrow(() => assertCustomMessagePayloadHasContent({ customMode: true, customMessage: 'hi', customImageUrl: trustedUrl }), 'text plus image is accepted');
  assert.doesNotThrow(() => assertCustomMessagePayloadHasContent({ customMode: true, customTemplate: 'storeAnnouncement' }), 'store announcement is exempt from this validation');
  assert.throws(
    () => assertCustomMessagePayloadHasContent({ customMode: true, customMessage: '   ', customImageUrl: '' }),
    /Enter a message or add an image/,
    'empty text and no image is rejected with a clear error'
  );
  const rejectedError = (() => {
    try {
      assertCustomMessagePayloadHasContent({ customMode: true });
      return null;
    } catch (error) {
      return error;
    }
  })();
  assert.ok(rejectedError instanceof HttpsError, 'rejection uses the callable HttpsError type');
  assert.equal(rejectedError.code, 'invalid-argument');

  console.log('PASS Community Update Message inline image: URL trust, text/image/both composition, invalid URL omission, and empty-request rejection.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
