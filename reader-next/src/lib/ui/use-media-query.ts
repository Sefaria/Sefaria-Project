import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches. On the server (and in the first client render, so hydration agrees) it is `false`;
 * the real answer follows at once — the same way the old search page starts on the desktop layout and corrects itself.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
