import { useCallback, useRef, useState } from 'react';

// Both navigation bars sit inside the app's SafeAreaView. Measure in the same
// window coordinates so the home indicator, font scaling and raised Add button
// are included instead of assuming a fixed footer height.
export const menuNavigationInset = (rootY, rootHeight, navigationY) =>
  Math.max(88, Math.ceil(rootY + rootHeight - navigationY + 16));

export default function useMenuNavigationInset() {
  const rootRef = useRef(null);
  const navigationRef = useRef(null);
  const [bottomInset, setBottomInset] = useState(120);
  const measure = useCallback(() => {
    const navigation = navigationRef.current;
    rootRef.current?.measureInWindow((x, rootY, width, rootHeight) => {
      navigation?.measureInWindow((navX, navigationY) => {
        if (navigation !== navigationRef.current || !rootHeight) return;
        setBottomInset(menuNavigationInset(rootY, rootHeight, navigationY));
      });
    });
  }, []);
  const onNavigationLayout = useCallback(node => {
    navigationRef.current = node;
    measure();
  }, [measure]);
  return { rootRef, bottomInset, onNavigationLayout, measure };
}
