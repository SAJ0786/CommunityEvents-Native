const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const root = path.resolve(__dirname, '..');
const globals = new Set(('console require module exports process __DEV__ global globalThis window document navigator fetch XMLHttpRequest AbortController URL URLSearchParams FormData Blob FileReader Buffer setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame setImmediate clearImmediate alert performance atob btoa Intl Map Set WeakMap WeakSet Promise Symbol Object String Number Boolean Array Date Math JSON RegExp Error TypeError RangeError NaN Infinity undefined parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI Uint8Array ArrayBuffer DataView TextEncoder TextDecoder').split(' '));
function unresolved(source) {
  const failures = new Set();
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  traverse(ast, {
    ReferencedIdentifier(p) {
      const {name, loc} = p.node;
      if (!p.scope.hasBinding(name) && !globals.has(name)) failures.add(`${loc.start.line}: ${name}`);
    },
    JSXOpeningElement(p) {
      const name = p.node.name;
      if (name.type === 'JSXIdentifier' && /^[A-Z]/.test(name.name) && !p.scope.hasBinding(name.name)) failures.add(`${name.loc.start.line}: ${name.name}`);
    },
  });
  return [...failures];
}
function verify() {
  const files = ['App.js'];
  function collect(dir) { for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes:true})) { const file=path.join(dir,entry.name); if(entry.isDirectory()) collect(file); else if(file.endsWith('.js')) files.push(file); } }
  collect('src');
  const errors=files.flatMap(file=>unresolved(fs.readFileSync(path.join(root,file),'utf8')).map(error=>`${file}:${error}`));
  if(errors.length) throw Error(`Unresolved application references:\n${errors.join('\n')}`);
  console.log(`UI binding check passed: ${files.length} files; no unbound identifiers or JSX components.`);
}
module.exports={unresolved,verify};
if(require.main===module) verify();
