import { colors } from '../theme';
export const MODULE_EXPERIENCES = {
  events: {
    id: 'events',
    choiceTitle: 'Community Events',
    choiceDescription: 'Events, prayer times, reminders and live streams',
    productTitle: 'Events',
    loginDescription: 'Sign in to personalise events, reminders and favourites.',
    guestDescription: 'Browse public community events without signing in.',
    icon: 'calendar-month',
    iconBackground: colors.indigoSoft,
    iconColor: colors.purple,
  },
  directory: {
    id: 'directory',
    choiceTitle: 'Business Directory',
    choiceDescription: 'Local businesses, services, promotions and enquiries',
    productTitle: 'Business Directory',
    loginDescription: 'Sign in to manage favourites, enquiries and business listings.',
    guestDescription: 'Browse public businesses and promotions without signing in.',
    icon: 'storefront-outline',
    iconBackground: colors.successSoft,
    iconColor: colors.tealDark,
  },
};

export const MODULE_EXPERIENCE_LIST = [
  MODULE_EXPERIENCES.events,
  MODULE_EXPERIENCES.directory,
];

export function getModuleExperience(value) {
  return MODULE_EXPERIENCES[value] || MODULE_EXPERIENCES.events;
}
