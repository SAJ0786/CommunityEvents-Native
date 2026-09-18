const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// The shared header panel title (typography.pageTitle) is 22px and must
// remain the largest text on any migrated screen. Rendered body/list/item
// text and in-body section headings must stay clearly smaller than that.
const HEADER_TITLE_SIZE = 22;

function assertFontSizeBelow(file, styleKey, maxSize, label) {
  const source = read(file);
  const pattern = new RegExp(`${styleKey}:\\s*\\{[^}]*fontSize:\\s*([0-9.]+)`);
  const match = source.match(pattern);
  assert.ok(match, `${file} should define styles.${styleKey}`);
  const size = Number(match[1]);
  assert.ok(size < maxSize, `${file} styles.${styleKey} (${label}) is ${size}px, expected below ${maxSize}px`);
}

// Profile & Settings.
assertFontSizeBelow('src/components/ProfileScreen.js', 'cardTitle', HEADER_TITLE_SIZE, 'card heading');
assertFontSizeBelow('src/components/ProfileScreen.js', 'sectionTitle', HEADER_TITLE_SIZE, 'section heading');
assertFontSizeBelow('src/components/ProfileScreen.js', 'body', HEADER_TITLE_SIZE, 'body text');
assertFontSizeBelow('src/components/ProfileScreen.js', 'aboutTitle', HEADER_TITLE_SIZE, 'about brand heading');

// Streamed Videos.
assertFontSizeBelow('src/components/StreamedVideosScreen.js', 'emptyTitle', HEADER_TITLE_SIZE, 'empty-state heading');
assertFontSizeBelow('src/components/StreamedVideosScreen.js', 'videoTitle', HEADER_TITLE_SIZE, 'video item title');

// Host Inbox.
assertFontSizeBelow('src/components/InboxScreen.js', 'title', HEADER_TITLE_SIZE, 'conversation heading');
assertFontSizeBelow('src/components/InboxScreen.js', 'sectionTitle', HEADER_TITLE_SIZE, 'section heading');
assertFontSizeBelow('src/components/InboxScreen.js', 'threadTitle', HEADER_TITLE_SIZE, 'thread item title');

// Business Messaging.
assertFontSizeBelow('src/business/BusinessInboxScreen.js', 'threadTitle', HEADER_TITLE_SIZE, 'thread item title');

// Notifications.
assertFontSizeBelow('src/business/BusinessNotificationsScreen.js', 'cardTitle', HEADER_TITLE_SIZE, 'notification card title');
assertFontSizeBelow('src/business/BusinessNotificationsScreen.js', 'appealTitle', HEADER_TITLE_SIZE, 'appeal modal heading');

// Other migrated pages with a body "hero" or empty-state card.
assertFontSizeBelow('src/components/CalendarScreen.js', 'syncHeroTitle', HEADER_TITLE_SIZE, 'sync hero heading');
assertFontSizeBelow('src/components/MyEventsScreen.js', 'emptyTitle', HEADER_TITLE_SIZE, 'empty-state heading');
assertFontSizeBelow('src/components/FavouritesScreen.js', 'emptyTitle', HEADER_TITLE_SIZE, 'empty-state heading');
assertFontSizeBelow('src/business/BusinessDetailsScreen.js', 'contactTitle', HEADER_TITLE_SIZE, 'contact modal heading');

// Streamed Videos header no longer exposes a manual Refresh control; data
// loads automatically whenever the screen mounts (tab focus).
const streamedVideos = read('src/components/StreamedVideosScreen.js');
assert.doesNotMatch(streamedVideos, />\{loading \? 'Loading\.\.\.' : 'Refresh'\}</, 'Streamed Videos header should not expose a manual Refresh button');
assert.match(streamedVideos, /useEffect\(\(\) => \{\s*loadVideos\(\);\s*\}, \[loadVideos\]\);/, 'Streamed Videos should keep loading automatically on mount/focus');

console.log('PASS panel typography hierarchy: header panel title stays the largest text and no manual header Refresh controls remain.');
