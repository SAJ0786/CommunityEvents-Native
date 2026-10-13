import { doc, getDocFromServer } from '@react-native-firebase/firestore';
import { db } from '../firebase/firebase';
import { STORE_CHECK_INTERVAL_MS } from '../utils/storeUpdatePolicy';

// Only release metadata is read. No listeners, writes, store scraping or forced updates.
export function createStoreReleaseReader(read, clock = Date.now) {
  const cache = new Map();
  const pending = new Map();
  return async platform => {
    if (!['ios', 'android'].includes(platform)) return null;
    const saved = cache.get(platform);
    if (saved && clock() >= saved.at && clock() - saved.at < saved.ttl) return saved.value;
    if (pending.has(platform)) return pending.get(platform);
    const operation = (async () => {
      let timer;
      try {
        const value = await Promise.race([
          Promise.resolve().then(() => read(platform)),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('release-check-timeout')), 8000); }),
        ]);
        cache.set(platform, { at: clock(), ttl: STORE_CHECK_INTERVAL_MS, value });
        return value;
      } catch {
        // Missing permission, offline or timeout must never interrupt browsing.
        cache.set(platform, { at: clock(), ttl: 5 * 60 * 1000, value: null });
        return null;
      } finally { clearTimeout(timer); pending.delete(platform); }
    })();
    pending.set(platform, operation);
    return operation;
  };
}
export const readStoreRelease = createStoreReleaseReader(async platform => {
  const snapshot = await getDocFromServer(doc(db, 'appReleases', platform));
  return snapshot.exists() ? snapshot.data() : null;
});
