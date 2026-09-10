const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const source = fs.readFileSync(path.resolve(__dirname, '../src/utils/phone.js'), 'utf8');
const { code } = babel.transformSync(source, {
  configFile: false,
  babelrc: false,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
});
const moduleExports = {};
vm.runInNewContext(code, { exports: moduleExports });

const { buildWhatsAppUrl, normalizeAustralianWhatsAppNumber } = moduleExports;
assert.equal(normalizeAustralianWhatsAppNumber('0415 228 559'), '+61415228559');
assert.equal(normalizeAustralianWhatsAppNumber('(04) 1522-8559'), '+61415228559');
assert.equal(normalizeAustralianWhatsAppNumber('+61 415 228 559'), '+61415228559');
assert.equal(normalizeAustralianWhatsAppNumber('0061 415 228 559'), '+61415228559');
assert.equal(buildWhatsAppUrl('0415228559'), 'https://wa.me/61415228559');
assert.equal(buildWhatsAppUrl(''), '');
console.log('PASS WhatsApp number normalisation');
