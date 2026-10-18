const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/theme.js'), 'utf8').replace(/export const /g, 'const ');
const sandbox = { exports: {} }; vm.runInNewContext(source + '\nObject.assign(exports, { colors, radius, shadow, spacing, typography, panelTones });', sandbox); module.exports = sandbox.exports;
