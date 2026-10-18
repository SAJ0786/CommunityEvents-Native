import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDocFromServer } from '@react-native-firebase/firestore';
import { db } from '../firebase/firebase';
import { cityCatalogueRevision, subscribeCityCatalogue, installCityCatalogue, validateCityCatalogue } from '../utils/cities';
const KEY = '@community-connect/city-catalogue/v1';
let pending; let lastCheck = 0; let cacheLoaded = false;
export function refreshCityCatalogue() {
  if (pending) return pending;
  pending = (async () => {
    if (!cacheLoaded) {
      cacheLoaded = true;
      try { const saved = await AsyncStorage.getItem(KEY); if (saved) installCityCatalogue(JSON.parse(saved)); } catch { /* bundled fallback */ }
    }
    const now = Date.now();
    if (lastCheck && now >= lastCheck && now - lastCheck < 60 * 60 * 1000) return;
    let timer;
    try {
      const snapshot = await Promise.race([getDocFromServer(doc(db, 'settings', 'cityCatalogue')),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('catalogue-timeout')), 8000); })]);
      const data = snapshot.exists() && validateCityCatalogue(snapshot.data());
      if (data) {
        if (installCityCatalogue(data)) await AsyncStorage.setItem(KEY, JSON.stringify(data));
        lastCheck = now;
      }
    } catch { /* keep last-known-good catalogue; retry on next foreground */ }
    finally { clearTimeout(timer); }
  })().finally(() => { pending = null; });
  return pending;
}
export function useCityCatalogueVersion() {
  return useSyncExternalStore(subscribeCityCatalogue, cityCatalogueRevision, cityCatalogueRevision);
}
export function useCityCatalogueRefresh() {
  const version = useCityCatalogueVersion();
  useEffect(() => {
    void refreshCityCatalogue();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refreshCityCatalogue(); });
    return () => subscription.remove();
  }, []);
  return version;
}
