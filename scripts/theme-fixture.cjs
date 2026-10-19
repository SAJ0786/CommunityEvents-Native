const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/theme.js'), 'utf8').replace(/export (const|function) /g, '$1 ');
const sandbox = { exports: {} }; vm.runInNewContext(source + '\nObject.assign(exports, { colors, quickAccess, radius, shadow, spacing, typography, panelTones, withAlpha });', sandbox); module.exports = sandbox.exports;
