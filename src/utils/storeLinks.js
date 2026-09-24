export const APPLE_APP_STORE_URL = 'https://apps.apple.com/au/app/community-events-australia/id6782770347';
export const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=info.siza.communityevents.app';
export const MICROSOFT_STORE_URL = 'https://apps.microsoft.com/detail/9NDGJZHL86KJ';
export const APP_OPEN_LINK = 'https://download.communityconnect.siza.info';

export const STORE_SHARE_LINES = [
  '--------------------',
  '*Download Community Connect Australia to stay connected with your community*',
  APP_OPEN_LINK,
];

// Include the URL in the message itself: some share targets ignore a separate
// URL attachment, particularly when receiving both text and a URL on iOS.
export function buildAppShareContent() {
  return {
    title: 'Community Connect Australia',
    message: [
      'Community Connect Australia',
      'Events and Business Directory in one app.',
      '',
      'Download the app:',
      APP_OPEN_LINK,
    ].join('\n'),
  };
}
