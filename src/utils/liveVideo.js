export function isPlayableYouTubeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') return url.pathname.replace(/^\//, '').length >= 6;
    if (!['youtube.com', 'm.youtube.com'].includes(host)) return false;
    if (url.pathname === '/watch') return String(url.searchParams.get('v') || '').length >= 6;
    return /^\/(live|shorts|embed)\/[A-Za-z0-9_-]{6,}/.test(url.pathname);
  } catch {
    return false;
  }
}

export function isPublicPlayableLiveEvent(event = {}) {
  return event.isLive === true
    && event.liveAppVisibility !== 'private'
    && isPlayableYouTubeUrl(event.liveWatchUrl);
}
