const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const header = read('src/components/MemberPageHeader.js');

assert.match(header, /fontSize: 22/);
assert.match(header, /fontWeight: '700'/);
assert.match(header, /fontSize: 11/);
assert.match(header, /fontWeight: '500'/);
assert.match(read('src/components/AdminPageHeader.js'), /fontSize: 18/);

const migrated = [
  'src/components/ProfileScreen.js',
  'src/components/MyEventsScreen.js',
  'src/components/FavouritesScreen.js',
  'src/components/InboxScreen.js',
  'src/components/StreamedVideosScreen.js',
  'src/components/SupportForm.js',
  'src/components/AddEventChoice.js',
  'src/components/RecurringEventForm.js',
  'src/components/BulkShareScreen.js',
  'src/business/BusinessDirectoryModule.js',
  'src/business/BusinessInboxScreen.js',
  'src/business/BusinessListingForm.js',
  'src/business/BusinessOwnerScreen.js',
  'src/business/BusinessPromotionForm.js',
  'src/business/BusinessNotificationsScreen.js',
];

for (const file of migrated) assert.match(read(file), /MemberPageHeader/, `${file} should use MemberPageHeader`);
for (const file of ['src/components/CalendarScreen.js', 'src/components/HijriCalendarScreen.js']) {
  assert.doesNotMatch(read(file), /MemberPageHeader/, `${file} retains its intentional custom calendar hero`);
}

console.log('PASS member page header: shared typography, admin exception, migrations and calendar hero exceptions.');
