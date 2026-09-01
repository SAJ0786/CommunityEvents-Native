export const MODULE_EXPERIENCES = {
  events: {
    id: 'events',
    choiceTitle: 'Community Events',
    choiceDescription: 'Events, prayer times, reminders and live streams',
    productTitle: 'Community Events Australia',
    loginDescription: 'Sign in to personalise events, reminders and favourites.',
    guestDescription: 'Browse public community events without signing in.',
    icon: 'calendar-month',
    iconBackground: '#eee4ff',
    iconColor: '#6941b8',
  },
  directory: {
    id: 'directory',
    choiceTitle: 'Business Directory',
    choiceDescription: 'Local businesses, services, promotions and enquiries',
    productTitle: 'Community Businesses Australia',
    loginDescription: 'Sign in to manage favourites, enquiries and business listings.',
    guestDescription: 'Browse public businesses and promotions without signing in.',
    icon: 'storefront-outline',
    iconBackground: '#dff5ef',
    iconColor: '#08766a',
  },
};

export const MODULE_EXPERIENCE_LIST = [
  MODULE_EXPERIENCES.events,
  MODULE_EXPERIENCES.directory,
];

export function getModuleExperience(value) {
  return MODULE_EXPERIENCES[value] || MODULE_EXPERIENCES.events;
}
