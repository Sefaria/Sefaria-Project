/**
 * The mount point for the reader's overlay panels: `associated` (commentary and connections
 * for the current segment) and `config` (language, layout, versions).
 *
 * A panel is a component registered in `panels` under its overlay type. It receives
 * {overlay, onClose} and reads everything else from useNgReader(). The stubs in ./panels are
 * placeholders until the real panels land; replacing one is a change to DEFAULT_PANELS only.
 */
import React, {useEffect} from 'react';
import {OVERLAY, useNgReader} from './context';
import AssociatedPanelStub from './panels/AssociatedPanelStub';
import ConfigPanel from './panels/ConfigPanel';

export const DEFAULT_PANELS = {
  [OVERLAY.ASSOCIATED]: AssociatedPanelStub,
  [OVERLAY.CONFIG]: ConfigPanel,
};

export default function OverlaySlot({panels = DEFAULT_PANELS}) {
  const reader = useNgReader();
  const {overlay, closeOverlay, strings} = reader;
  const Panel = overlay.type !== OVERLAY.NONE ? panels[overlay.type] : null;

  useEffect(() => {
    if (!Panel) { return undefined; }
    const onKey = (e) => { if (e.key === 'Escape') { closeOverlay(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [Panel, closeOverlay]);

  return (
    <div className="ng-overlay" data-ng="overlay" data-overlay={overlay.type} hidden={!Panel}>
      {Panel ? (
        <>
          <div className="ng-overlay-backdrop" data-ng="overlay-backdrop" onClick={closeOverlay} aria-hidden="true" />
          <div className="ng-sheet" role="dialog" aria-modal="true" aria-label={strings[overlay.type === OVERLAY.CONFIG ? 'textSettings' : 'connectionsFor']}>
            <Panel overlay={overlay} onClose={closeOverlay} />
          </div>
        </>
      ) : null}
    </div>
  );
}
