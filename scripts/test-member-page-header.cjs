const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const header = read('src/components/PageHeader.js');
const theme = read('src/theme.js');

// Shared panel structure: icon chip + eyebrow + title + subtitle on a
// decorated, tone-able surface (the Hijri Calendar "gold standard" pattern
// generalised for every screen-level header).
assert.match(header, /MaterialCommunityIcons/, 'PageHeader should render an icon chip');
assert.match(header, /iconChip/);
assert.match(header, /glowLarge/);
assert.match(header, /glowSmall/);
assert.match(header, /panelTones\[tone\]/, 'PageHeader should look up its accent from the shared panelTones palette');
assert.match(header, /typography\.pageTitle/, 'PageHeader title should use the shared typography scale');
assert.match(header, /typography\.eyebrow/);
assert.match(header, /typography\.subtitle/);
assert.match(header, /borderRadius: radius\.lg/);
assert.match(header, /\.\.\.shadow/);
assert.match(theme, /pageTitle: \{ fontSize: 22,/, 'shared header title size should stay the largest on-screen text (22px)');
for (const tone of ['teal', 'blue', 'purple', 'rose', 'amber', 'indigo']) {
  assert.match(theme, new RegExp(`${tone}: \\{[\\s\\S]*?icon:`), `panelTones should define a ${tone} accent`);
}
for (const tone of ['purple', 'rose', 'amber', 'indigo']) {
  const block = theme.slice(theme.indexOf(`${tone}: {`), theme.indexOf(`${tone}: {`) + 400);
  assert.doesNotMatch(block, /#fbeaf0|#f8dbe6|#fff4d9|#ffe9b3|#e7defa|#e3e1fb/, `${tone} panel tone should remain in the blue family`);
}
assert.match(read('src/components/AdminPageHeader.js'), /PageHeader/);
assert.match(read('src/components/MemberPageHeader.js'), /PageHeader/);

const panelPages = [
  'src/components/StreamedVideosScreen.js',
  'src/components/ProfileScreen.js',
  'src/components/InboxScreen.js',
  'src/business/BusinessInboxScreen.js',
  'src/business/BusinessNotificationsScreen.js',
];

for (const file of panelPages) assert.match(read(file), /MemberPageHeader[\s\S]*?panel/, `${file} should opt into the shared heading panel`);

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
for (const file of ['src/components/CalendarScreen.js', 'src/components/HijriCalendarScreen.js', 'src/components/CreateEventForm.js', 'src/business/BusinessDirectoryModule.js', 'src/business/BusinessDetailsScreen.js']) {
  assert.match(read(file), /MemberPageHeader/, `${file} should use MemberPageHeader`);
}

// Pages should differentiate their accent colour while sharing one structure.
const toned = {
  'src/components/HijriCalendarScreen.js': 'teal',
  'src/components/ProfileScreen.js': 'purple',
  'src/components/InboxScreen.js': 'blue',
  'src/components/StreamedVideosScreen.js': 'indigo',
  'src/business/BusinessNotificationsScreen.js': 'rose',
  'src/business/BusinessInboxScreen.js': 'blue',
};
for (const [file, tone] of Object.entries(toned)) {
  assert.match(read(file), new RegExp(`tone=["']${tone}["']`), `${file} should use the ${tone} panel accent`);
}

console.log('PASS page headers: shared decorative panel structure, typography and per-page accents.');
