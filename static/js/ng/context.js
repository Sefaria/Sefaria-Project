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

/**
 * Overlay states. `associated` and `config` are the side drawers (OverlaySlot); `toc` and
 * `search` are bottom sheets opened from the header (sheets/SheetSlot). Only one is open at a
 * time, and each one's history entry comes from overlayState.js.
 */
export const OVERLAY = {
  NONE: 'none',
  ASSOCIATED: 'associated',
  CONFIG: 'config',
  TOC: 'toc',
  SEARCH: 'search',
};

/** The overlays that are bottom sheets rather than drawers. */
export const SHEETS = [OVERLAY.TOC, OVERLAY.SEARCH];
export const isSheet = (type) => SHEETS.indexOf(type) !== -1;
