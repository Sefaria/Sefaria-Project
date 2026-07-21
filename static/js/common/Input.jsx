import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';

/**
 * Input — canonical text / email / password field for the design system.
 *
 * Mirrors the Figma `Input Field` component (Registration & Login — SSO & UI Refresh,
 * node 187:76581): the field already includes its label and inline error, so this
 * component is the complete field unit — there is no separate FormField.
 *
 * States (all driven by props + the .sefaria-input* classes in auth-components.css):
 *   default/placeholder · typing · filled · disabled · password (mask + show/hide) ·
 *   with link · placeholder/error · filled/error.
 *
 * Controlled component — the parent owns `value` and validation. Keep it presentational:
 * pass keyed string IDs for `label`, `error`, and the reveal labels;
 * this component wraps visible text in InterfaceText and aria-labels via Sefaria._().
 *
 * @param type           "text" | "email" | "password"
 * @param value          controlled value
 * @param onChange       change handler
 * @param label          field label (keyed string ID)
 * @param name           input name (also used as id fallback)
 * @param id             input id (defaults to name)
 * @param placeholder    placeholder (raw string — HTML attribute, not localized via InterfaceText)
 * @param error          error message (keyed string ID), or null/empty for no error
 * @param disabled       disables the field
 * @param required       marks the field required
 * @param inputDir       "ltr" | "rtl" — direction for the control value only (e.g. "ltr" for email/password in RTL layouts)
 * @param autoComplete   autocomplete hint
 * @param trailingLink   { text, href?, onClick? } — the Figma "with link" variant (text is a keyed string ID)
 * @param revealLabel    aria-label for the show-password control (keyed string ID)
 * @param hideLabel      aria-label for the hide-password control (keyed string ID)
 */
const Input = ({
  type = 'text',
  value,
  onChange,
  label,
  name,
  id,
  placeholder,
  error = null,
  disabled = false,
  required = false,
  inputDir,
  autoComplete,
  trailingLink = null,
  revealLabel = 'auth.show_password',
  hideLabel = 'auth.hide_password',
  ...rest
}) => {
  const inputId = id || name;
  const errorId = error ? `${inputId}-error` : undefined;
  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);
  const effectiveType = isPassword && revealed ? 'text' : type;

  const wrapperClasses = [
    'sefaria-input',
    error ? 'sefaria-input--error' : '',
    disabled ? 'sefaria-input--disabled' : '',
  ].filter(Boolean).join(' ');

  const fieldClasses = [
    'sefaria-input-field',
    isPassword ? 'has-trailing-icon' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={wrapperClasses}>
      {(label || trailingLink) && (
        <div className="sefaria-input-labelRow">
          {label ? <label className="sefaria-input-label" htmlFor={inputId}><InterfaceText>{label}</InterfaceText></label> : <span />}
          {trailingLink && (
            <a
              className="sefaria-input-trailingLink"
              href={trailingLink.href}
              onClick={trailingLink.onClick}
              tabIndex={!trailingLink.href && 0}
              role={!trailingLink.href && 'link'}
              onKeyDown={!trailingLink.href && trailingLink.onClick
                ? (e) => { if (e.key === 'Enter') trailingLink.onClick(e); }
                : undefined}
            >
              <InterfaceText>{trailingLink.text}</InterfaceText>
            </a>
          )}
        </div>
      )}

      <div className={fieldClasses}>
        <input
          id={inputId}
          name={name}
          type={effectiveType}
          className="sefaria-input-control"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          dir={inputDir}
          autoComplete={autoComplete}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={errorId}
          {...rest}
        />
        {isPassword && !disabled && value && (
          <button
            type="button"
            className="sefaria-input-reveal"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? Sefaria._(hideLabel) : Sefaria._(revealLabel)}
            aria-pressed={revealed}
          >
            <img src={`/static/icons/${revealed ? 'eye-off' : 'eye'}.svg`} alt="" aria-hidden="true" />
          </button>
        )}
      </div>

      {error && (
        <div className="sefaria-input-error" id={errorId} role="alert">
          <img className="sefaria-input-errorIcon" src="/static/icons/info-error.svg" alt="" aria-hidden="true" />
          {typeof error === 'string' ? <InterfaceText>{error}</InterfaceText> : error}
        </div>
      )}
    </div>
  );
};

Input.propTypes = {
  type: PropTypes.oneOf(['text', 'email', 'password']),
  value: PropTypes.string,
  onChange: PropTypes.func,
  label: PropTypes.string,
  name: PropTypes.string,
  id: PropTypes.string,
  placeholder: PropTypes.string,
  error: PropTypes.node,
  disabled: PropTypes.bool,
  required: PropTypes.bool,
  inputDir: PropTypes.oneOf(['ltr', 'rtl']),
  autoComplete: PropTypes.string,
  trailingLink: PropTypes.shape({
    text: PropTypes.string.isRequired,
    href: PropTypes.string,
    onClick: PropTypes.func,
  }),
  revealLabel: PropTypes.string,
  hideLabel: PropTypes.string,
};

export default Input;
