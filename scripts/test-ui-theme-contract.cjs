const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { colors, withAlpha } = require('./theme-fixture.cjs');
const root = path.resolve(__dirname, '..');
function files(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(item => item.isDirectory() ? files(path.join(dir,item.name)) : item.name.endsWith('.js') ? [path.join(dir,item.name)] : []); }
test('native UI colours live in the shared theme instead of screen literals', () => {
  const violations = [path.join(root,'App.js'), ...files(path.join(root,'src'))].filter(file => path.basename(file) !== 'theme.js')
    .filter(file => /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/.test(fs.readFileSync(file,'utf8'))).map(file => path.relative(root,file));
  assert.deepEqual(violations, []);
});
test('translucent surfaces derive from the supplied palette colour', () => {
  assert.equal(withAlpha(colors.blue, .25), 'rgba(37,99,235,0.25)');
  assert.equal(withAlpha('#b91c1c', .25), 'rgba(185,28,28,0.25)');
  assert.equal(withAlpha('#fff', 1.5), 'rgba(255,255,255,1)');
  assert.throws(() => withAlpha('invalid', .2), /Theme colour/);
});

test('shared theme symbols resolve in every native screen and service', () => {
  const parser = require('@babel/parser'), traverse = require('@babel/traverse').default;
  const theme = require('./theme-fixture.cjs');
  const names = new Set(['colors','withAlpha','typography','spacing','radius','shadow','panelTones']);
  const errors = [];
  for (const file of [path.join(root,'App.js'), ...files(path.join(root,'src'))].filter(file => path.basename(file) !== 'theme.js')) {
    const ast = parser.parse(fs.readFileSync(file,'utf8'), {sourceType:'module',plugins:['jsx']});
    traverse(ast, { ReferencedIdentifier(p) { if(names.has(p.node.name) && !p.scope.hasBinding(p.node.name)) errors.push(`${path.relative(root,file)}: unbound ${p.node.name}`); }, MemberExpression(p) {
      if (!p.node.computed && p.node.object.type === 'Identifier' && names.has(p.node.object.name)) {
        const binding = p.scope.getBinding(p.node.object.name);
        if (binding?.path.isImportSpecifier() && theme[p.node.object.name] && !(p.node.property.name in theme[p.node.object.name])) errors.push(`${path.relative(root,file)}: unknown ${p.node.object.name}.${p.node.property.name}`);
      }
    }});
  }
  assert.deepEqual(errors, []);
});
