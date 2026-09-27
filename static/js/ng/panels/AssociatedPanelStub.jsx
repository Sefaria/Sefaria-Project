/**
 * Placeholder for the associated panel (commentary, links, resources for a segment).
 * It shows which segment the panel is anchored to, so the wiring can be checked end to end.
 */
import React from 'react';
import {useNgReader} from '../context';

export default function AssociatedPanelStub({overlay, onClose}) {
  const {strings, interfaceLang} = useNgReader();
  const ref = overlay.ref || '';
  const heRef = overlay.heRef || ref;
  return (
    <div className="ng-panel" data-ng="panel-associated" data-ref={ref}>
      <div className="ng-panel-head">
        <h2 className="ng-panel-title">{strings.connectionsFor} {interfaceLang === 'hebrew' ? heRef : ref}</h2>
        <button type="button" className="ng-panel-close" data-ng="overlay-close" onClick={onClose}>{strings.close}</button>
      </div>
      <p className="ng-panel-note">{strings.comingSoon}</p>
    </div>
  );
}
