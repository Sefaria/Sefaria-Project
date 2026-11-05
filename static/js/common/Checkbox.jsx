import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';

/**
 * Checkbox — a native checkbox drawn with the design system's Lucide checkbox icons (18px), in the
 * same family as Input: label beside the box, optional description under it, and Input's inline error.
 *
 * The whole row is the click target. Links inside `label` stay clickable.
 *
 * @param id           input id (required: the label, description and error hang off it)
 * @param checked      controlled value
 * @param onChange     change handler
 * @param label        the label (keyed string ID or node)
 * @param description  helper text under the label (keyed string ID or node)
 * @param error        error message (keyed string ID or node)
 */
const Checkbox = ({ id, checked, onChange, label, description = null, error = null, disabled = false, required = false, ...rest }) => {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  const classes = [
    'sefaria-checkbox',
    error ? 'sefaria-checkbox--error' : '',
    disabled ? 'sefaria-checkbox--disabled' : '',
  ].filter(Boolean).join(' ');
  const text = (node) => (typeof node === 'string' ? <InterfaceText>{node}</InterfaceText> : node);

  return (
    <div className={classes}>
      <label className="sefaria-checkbox-row" htmlFor={id}>
        <span className="sefaria-checkbox-box">
          <input
            type="checkbox"
            id={id}
            className="sefaria-checkbox-input"
            checked={!!checked}
            onChange={onChange}
            disabled={disabled}
            required={required}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            {...rest}
          />
          {/* Lucide square / square-check: the design system's checkbox-empty and checkbox-checked icons */}
          <svg className="sefaria-checkbox-icon sefaria-checkbox-icon--off" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect width="18" height="18" x="3" y="3" rx="2" />
          </svg>
          <svg className="sefaria-checkbox-icon sefaria-checkbox-icon--on" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="m16 9-5.5 5.5L8 12" />
          </svg>
        </span>
        <span className="sefaria-checkbox-label">{text(label)}</span>
      </label>
      {description && <p className="sefaria-checkbox-description" id={descriptionId}>{text(description)}</p>}
      {error && (
        <div className="sefaria-input-error sefaria-checkbox-error" id={errorId} role="alert">
          <img className="sefaria-input-errorIcon" src="/static/icons/info-error.svg" alt="" aria-hidden="true" />
          {text(error)}
        </div>
      )}
    </div>
  );
};

Checkbox.propTypes = {
  id: PropTypes.string.isRequired,
  checked: PropTypes.bool,
  onChange: PropTypes.func,
  label: PropTypes.node.isRequired,
  description: PropTypes.node,
  error: PropTypes.node,
  disabled: PropTypes.bool,
  required: PropTypes.bool,
};

export default Checkbox;
