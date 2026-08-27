const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const projectRoot = path.resolve(__dirname, '..');
const files = ['App.js'];

function collectJavaScriptFiles(relativeDirectory) {
  const absoluteDirectory = path.join(projectRoot, relativeDirectory);
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      collectJavaScriptFiles(relativePath);
    } else if (entry.name.endsWith('.js')) {
      files.push(relativePath);
    }
  }
}

collectJavaScriptFiles('src');

for (const file of files) {
  const source = fs.readFileSync(path.join(projectRoot, file), 'utf8');
  parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
}

const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const appJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo;

if (packageJson.dependencies.expo !== '~54.0.37') {
  throw new Error(`Expected Expo SDK 54 dependency, found ${packageJson.dependencies.expo || 'missing'}.`);
}
if (!appJson.android?.package || !appJson.ios?.bundleIdentifier) {
  throw new Error('Android package or iOS bundle identifier is missing from app.json.');
}

console.log(`Source check passed: ${files.length} JavaScript files parsed; Expo and app identifiers verified.`);
