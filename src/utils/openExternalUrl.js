import { Linking, Platform } from 'react-native';

const isWebUrl = value => /^https?:\/\//i.test(String(value || ''));

export async function openExternalUrl(url) {
  if (Platform.OS === 'web' && isWebUrl(url) && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }

  return Linking.openURL(url);
}
