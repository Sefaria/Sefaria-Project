import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Sefaria from '../sefaria/sefaria';
import { InterfaceText } from '../Misc.jsx';

/**
 * Select — the design system's Select Field (Figma Components, node 158:194), with its open list
 * drawn as the Dropdown menu and menu items (node 130:66). Same family as Input: label above,
 * optional addon after the label, Input's inline error below.
 *
 * A button with a listbox, so the open list can follow the design (a native <select> can't).
 * Keyboard: Enter, Space or Down opens; Up/Down move; Enter or Space picks; Escape or Tab closes.
 *
 * @param id          control id (the label, list and error hang off it)
 * @param label       label (keyed string ID or node)
 * @param labelAddon  node after the label, outside it (e.g. an "Optional" marker)
 * @param options     [{value, label}] where label is a node or {en, he}
 * @param value       the chosen value, or "" for none
 * @param onChange    called with the chosen value
 * @param placeholder shown when nothing is chosen (node or {en, he})
 * @param error       error message (keyed string ID or node)
 */
const optionText = (label) => (label && typeof label === 'object' && !React.isValidElement(label)
  ? <InterfaceText text={label} /> : label);

const Select = ({ id, label, labelAddon = null, options, value = '', onChange, placeholder = null, error = null, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const chosen = options.findIndex(o => o.value === value);
  const errorId = error ? `${id}-error` : undefined;
  const listId = `${id}-list`;

  useEffect(() => {
    if (!open) { return undefined; }
    const away = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); } };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const openList = () => { if (!disabled) { setActive(chosen >= 0 ? chosen : 0); setOpen(true); } };
  const pick = (i) => { onChange(options[i].value); setOpen(false); buttonRef.current && buttonRef.current.focus(); };

  const onKeyDown = (e) => {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (active >= 0) { pick(active); } }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === 'Tab') { setOpen(false); }
  };

  const classes = ['sefaria-select', error ? 'sefaria-select--error' : '', disabled ? 'sefaria-select--disabled' : '', open ? 'is-open' : ''].filter(Boolean).join(' ');
  return (
    <div className={classes} ref={wrapRef}>
      {label ?
        <span className="sefaria-select-labelRow">
          <span className="sefaria-select-label" id={`${id}-label`}>{typeof label === 'string' ? <InterfaceText>{label}</InterfaceText> : label}</span>
          {labelAddon}
        </span> : null}
      <div className="sefaria-select-field">
        <button
          type="button"
          id={id}
          ref={buttonRef}
          className={'sefaria-select-control' + (chosen < 0 ? ' is-placeholder' : '')}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-labelledby={`${id}-label ${id}`}
          aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={errorId}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onKeyDown}
        >
          <span className="sefaria-select-value">{chosen >= 0 ? optionText(options[chosen].label) : optionText(placeholder)}</span>
          {/* Lucide chevron-down (in the design system's icon library) */}
          <svg className="sefaria-select-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {open ?
          <ul className="sefaria-select-menu" role="listbox" id={listId} aria-labelledby={`${id}-label`}>
            {options.map((o, i) => (
              <li key={String(o.value)} id={`${id}-opt-${i}`} role="option" aria-selected={i === chosen}
                className={'sefaria-select-item' + (i === active ? ' is-active' : '') + (i === chosen ? ' is-chosen' : '')}
                onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(i)}>
                {optionText(o.label)}
              </li>
            ))}
          </ul> : null}
      </div>
      {error ?
        <div className="sefaria-input-error" id={errorId} role="alert">
          <img className="sefaria-input-errorIcon" src="/static/icons/info-error.svg" alt="" aria-hidden="true" />
          {typeof error === 'string' ? <InterfaceText>{error}</InterfaceText> : error}
        </div> : null}
    </div>
  );
};

Select.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.node,
  labelAddon: PropTypes.node,
  options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.any.isRequired, label: PropTypes.any.isRequired })).isRequired,
  value: PropTypes.any,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.any,
  error: PropTypes.node,
  disabled: PropTypes.bool,
};

export default Select;
