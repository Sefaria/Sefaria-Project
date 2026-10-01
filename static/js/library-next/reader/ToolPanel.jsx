/**
 * Hosts the active reader tool: a side panel on desktop, a bottom sheet on small screens (CSS).
 * Focus moves to the close button on open and returns to the opener on close; Esc is handled
 * by the page.
 */
import React, { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { ToolIcon, toolLabel } from './Toolbelt';

export default function ToolPanel({ tool, selection, book, close, extra = {} }) {
  const { t, lang } = useT();
  const panel = useRef(null);
  useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    const closeButton = panel.current && panel.current.querySelector('.ln-panel-close');
    if (closeButton) { closeButton.focus(); }
    return () => { if (opener && opener.focus && document.contains(opener)) { opener.focus(); } };
  }, [tool.id]);
  const Body = tool.component;
  return (
    <>
      <div className="ln-sheet-backdrop" onClick={close} aria-hidden="true" />
      <aside className="ln-reader-panel" role="dialog" aria-labelledby="ln-panel-title" data-tool={tool.id} ref={panel}>
        <div className="ln-panel-head">
          <h2 id="ln-panel-title" className="ln-panel-title">
            <ToolIcon icon={tool.icon} />
            <span>{toolLabel(tool)}</span>
          </h2>
          <span className="ln-panel-ref ln-muted">{lang === 'he' ? selection.heRef : selection.ref}</span>
          <button type="button" className="ln-icon-button ln-panel-close" aria-label={t('reader.closePanel')} onClick={close}>×</button>
        </div>
        <div className="ln-panel-body">
          <Body selection={selection} book={book} close={close} {...extra} />
        </div>
      </aside>
    </>
  );
}
