/**
 * The mount point for the reader's bottom sheets: the table of contents and search in the book,
 * both opened from the header. They are overlay states like the side drawers (context.js
 * OVERLAY.TOC / OVERLAY.SEARCH), so at most one sheet or drawer is open, each has a history
 * entry, and Back closes it. OverlaySlot leaves these states alone (no drawer, no swipes).
 *
 * The slot keeps a sheet mounted while it animates out after its overlay state has closed.
 * `data-state` is the overlay state (a sheet type or 'none'), for tests.
 */
import React, {useState} from 'react';
import {isSheet, OVERLAY, useIsomorphicLayoutEffect, useNgReader} from '../context';
import TocSheet from './TocSheet';
import SearchSheet from './SearchSheet';

export const DEFAULT_SHEETS = {
  [OVERLAY.TOC]: TocSheet,
  [OVERLAY.SEARCH]: SearchSheet,
};

export default function SheetSlot({sheets = DEFAULT_SHEETS}) {
  const {overlay, closeOverlay} = useNgReader();
  const open = isSheet(overlay.type);
  const [shown, setShown] = useState(() => (open ? {type: overlay.type, closing: false, key: 0} : null));

  useIsomorphicLayoutEffect(() => {
    if (open) {
      if (!shown || shown.type !== overlay.type || shown.closing) {
        setShown(prev => ({type: overlay.type, closing: false, key: (prev ? prev.key : 0) + 1}));
      }
    } else if (shown && !shown.closing) {
      setShown({...shown, closing: true});
    }
  }, [overlay.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const Sheet = shown ? sheets[shown.type] : null;
  return (
    <div className="ng-sheets" data-ng="sheets" data-state={open ? overlay.type : OVERLAY.NONE} hidden={!Sheet}>
      {Sheet ? (
        <Sheet key={shown.key} closing={shown.closing} onClose={closeOverlay}
               onExited={() => setShown(now => (now && now.closing ? null : now))} />
      ) : null}
    </div>
  );
}
