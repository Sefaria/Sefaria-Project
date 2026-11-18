import { useSyncExternalStore } from 'react';

/** Subscribes to a CSS media query. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export const MEDIA_SM = '(min-width: 640px)';
export const MEDIA_LG = '(min-width: 1024px)';
/** The featured band is a 3-column grid from here, a scroll-snap row below. */
export const MEDIA_BAND_GRID = '(min-width: 900px)';
