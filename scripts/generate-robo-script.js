const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const templatePath = path.join(
  projectRoot,
  'firebase-test-lab',
  'robo',
  'community-events-authenticated.template.json'
);
const outputPath = path.join(
  projectRoot,
  'firebase-test-lab',
  'robo',
  'community-events-authenticated.generated.json'
);

const phone = String(process.env.CCA_TEST_PHONE || '').replace(/[\s().-]/g, '');
const code = String(process.env.CCA_TEST_VERIFICATION_CODE || '').trim();

if (!/^\+614\d{8}$/.test(phone)) {
  throw new Error('CCA_TEST_PHONE must be an Australian mobile in +614XXXXXXXX format.');
}
if (!/^\d{6}$/.test(code)) {
  throw new Error('CCA_TEST_VERIFICATION_CODE must contain exactly six digits.');
}

const template = fs.readFileSync(templatePath, 'utf8');
const generated = template
  .replaceAll('__TEST_PHONE_NUMBER__', phone)
  .replaceAll('__TEST_VERIFICATION_CODE__', code);

JSON.parse(generated);
fs.writeFileSync(outputPath, `${generated.trim()}\n`, { mode: 0o600 });
console.log(`Generated private Robo script: ${outputPath}`);
console.log('This generated file is excluded from Git. Upload it directly to Firebase Test Lab.');
