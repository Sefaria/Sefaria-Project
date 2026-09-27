/**
 * The NG reader's API for the pieces that plug into it (header, stream, overlay panels).
 * Everything a panel needs comes through here, never off the shared `Sefaria` singleton.
 */
import React, {useContext, useEffect, useLayoutEffect} from 'react';

export const NgReaderContext = React.createContext(null);
NgReaderContext.displayName = 'NgReaderContext';

export function useNgReader() {
  return useContext(NgReaderContext);
}

/** useLayoutEffect in the browser, useEffect on the server (where React 16 warns about layout effects). */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Overlay slot states. The panels themselves arrive in a later pass. */
export const OVERLAY = {
  NONE: 'none',
  ASSOCIATED: 'associated',
  CONFIG: 'config',
};
