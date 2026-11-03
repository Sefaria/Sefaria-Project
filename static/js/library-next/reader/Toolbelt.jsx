/**
 * The toolbelt: appears when segments are selected and lists the persona's reader tools.
 * Inline under the selection on desktop, a fixed bottom bar on small screens (CSS).
 */
import React, { useRef } from 'react';
import { useT, pick, t as translate } from '../i18n';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Icon = ({ children }) => <svg className="ln-tool-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>{children}</svg>;

/** Built-in icon names tools can use for `icon`. */
export const ICONS = {
  connections: <Icon><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.3 11l7.4-3.8M8.3 13l7.4 3.8" /></Icon>,
  shelf: <Icon><path d="M6 4h12a1 1 0 0 1 1 1v16l-7-4-7 4V5a1 1 0 0 1 1-1z" /></Icon>,
  cite: <Icon><path d="M8 5H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3" /><rect x="9" y="3" width="11" height="12" rx="1" /></Icon>,
  note: <Icon><path d="M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10l-5 5H5a1 1 0 0 1-1-1z" /><path d="M15 20v-5h5" /><path d="M8 9h8M8 13h5" /></Icon>,
  highlight: <Icon><path d="M4 20h7" /><path d="M9 15l6-9 3 2-6 9-3.5 1z" /></Icon>,
  flashcard: <Icon><rect x="3" y="6" width="14" height="11" rx="1.5" /><path d="M7 10h14v9H7" /></Icon>,
  check: <Icon><circle cx="12" cy="12" r="8.5" /><path d="M8 12.5l2.5 2.5L16 9.5" /></Icon>,
  lesson: <Icon><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" /></Icon>,
  question: <Icon><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7" /><path d="M12 17h.01" /></Icon>,
  print: <Icon><path d="M7 9V4h10v5" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M7 14h10v6H7z" /></Icon>,
  versions: <Icon><path d="M4 5h7v14H4zM13 5h7v14h-7z" /><path d="M6 9h3M15 9h3M6 12h3M15 12h3" /></Icon>,
  manuscript: <Icon><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><path d="M9 12h6M9 16h6" /></Icon>,
  lexicon: <Icon><path d="M4 19V5a1 1 0 0 1 1-1h12a2 2 0 0 1 2 2v13" /><path d="M4 19a2 2 0 0 0 2 2h13" /><path d="M8 8h7M8 12h5" /></Icon>,
  glossary: <Icon><circle cx="11" cy="11" r="6" /><path d="M15.5 15.5L20 20" /><path d="M8.5 11h5" /></Icon>,
  info: <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></Icon>,
  default: <Icon><circle cx="12" cy="12" r="8.5" /><path d="M8 12h8" /></Icon>,
};

export function ToolIcon({ icon }) {
  if (React.isValidElement(icon)) { return icon; }
  return ICONS[icon] || ICONS.default;
}

/** A tool's label in the interface language: `{ en, he }` objects or an i18n key. */
export function toolLabel(tool) {
  return typeof tool.label === 'string' ? translate(tool.label) : pick(tool.label);
}

export default function Toolbelt({ selection, tools, activeToolId, onPick, onClear }) {
  const { t, lang } = useT();
  const listRef = useRef(null);
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') { return; }
    const buttons = Array.from(listRef.current.querySelectorAll('button'));
    const i = buttons.indexOf(document.activeElement);
    if (i === -1) { return; }
    e.preventDefault();
    const forward = (e.key === 'ArrowRight') !== (lang === 'he');
    buttons[(i + (forward ? 1 : buttons.length - 1)) % buttons.length].focus();
  };
  return (
    <div className="ln-toolbelt" role="toolbar" aria-label={t('reader.toolbelt')} onKeyDown={onKeyDown}>
      <span className="ln-toolbelt-ref">
        <span className="ln-sr-only">{t('reader.selected')}: </span>
        {lang === 'he' ? selection.heRef : selection.ref}
      </span>
      <div className="ln-toolbelt-tools" ref={listRef}>
        {tools.map(tool => (
          <button key={tool.id} type="button" data-tool={tool.id}
                  className={`ln-tool ${activeToolId === tool.id ? 'is-active' : ''}`}
                  aria-pressed={activeToolId === tool.id} onClick={() => onPick(tool)}>
            <ToolIcon icon={tool.icon} />
            <span className="ln-tool-label">{toolLabel(tool)}</span>
          </button>
        ))}
      </div>
      <button type="button" className="ln-icon-button ln-toolbelt-close" aria-label={t('reader.clearSelection')} onClick={onClear}>×</button>
    </div>
  );
}
