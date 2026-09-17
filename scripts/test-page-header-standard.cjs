const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const screenHeaders = [
  'src/components/CalendarScreen.js',
  'src/components/HijriCalendarScreen.js',
  'src/components/CreateEventForm.js',
  'src/components/RecurringEventForm.js',
  'src/components/BulkShareScreen.js',
  'src/components/ProfileScreen.js',
  'src/components/InboxScreen.js',
  'src/components/SupportForm.js',
  'src/business/BusinessDirectoryModule.js',
  'src/business/BusinessDetailsScreen.js',
  'src/business/BusinessInboxScreen.js',
  'src/business/BusinessListingForm.js',
  'src/business/BusinessOwnerScreen.js',
  'src/business/BusinessPromotionForm.js',
  'src/business/BusinessNotificationsScreen.js',
];

for (const file of screenHeaders) {
  const source = read(file);
  assert.match(source, /MemberPageHeader/, `${file} should use the shared member header`);
}

assert.doesNotMatch(read('src/components/CalendarScreen.js'), /styles\.screenHeader|styles\.screenTitle/);
assert.doesNotMatch(read('src/components/HijriCalendarScreen.js'), /styles\.heroEyebrow|styles\.heroGlowLarge/);
assert.doesNotMatch(read('src/business/BusinessDetailsScreen.js'), /styles\.topRow/);
assert.match(read('src/components/PageHeader.js'), /accessibilityRole="header"/);

console.log('PASS page header standard: all screen-level headers use the shared component and legacy targeted headers are absent.');
