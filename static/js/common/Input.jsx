import React, { useState } from 'react';
import PropTypes from 'prop-types';

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
 * pass already-localized strings for `label`, `placeholder`, `error`, and the reveal labels.
 *
 * @param type           "text" | "email" | "password"
 * @param value          controlled value
 * @param onChange       change handler
 * @param label          field label (localized)
 * @param name           input name (also used as id fallback)
 * @param id             input id (defaults to name)
 * @param placeholder    placeholder (localized)
 * @param error          error message string, or null/empty for no error
 * @param disabled       disables the field
 * @param required       marks the field required
 * @param dir            "ltr" | "rtl" — set "ltr" for email/password in a Hebrew UI
 * @param autoComplete   autocomplete hint
 * @param trailingLink   { text, href?, onClick? } — the Figma "with link" variant (e.g. "Forgot password?")
 * @param revealLabel    aria-label for the show-password control (localized)
 * @param hideLabel      aria-label for the hide-password control (localized)
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
  dir,
  autoComplete,
  trailingLink = null,
  revealLabel = 'Show password',
  hideLabel = 'Hide password',
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
    <div className={wrapperClasses} dir={dir}>
      {(label || trailingLink) && (
        <div className="sefaria-input-labelRow">
          {label ? <label className="sefaria-input-label" htmlFor={inputId}>{label}</label> : <span />}
          {trailingLink && (
            <a
              className="sefaria-input-trailingLink"
              href={trailingLink.href}
              onClick={trailingLink.onClick}
            >
              {trailingLink.text}
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
          dir={dir}
          autoComplete={autoComplete}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={errorId}
          {...rest}
        />
        {isPassword && !disabled && (
          <button
            type="button"
            className="sefaria-input-reveal"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? hideLabel : revealLabel}
            aria-pressed={revealed}
          >
            <img src={`/static/icons/${revealed ? 'eye-off' : 'eye'}.svg`} alt="" aria-hidden="true" />
          </button>
        )}
      </div>

      {error && (
        <div className="sefaria-input-error" id={errorId} role="alert">
          <img className="sefaria-input-errorIcon" src="/static/icons/info.svg" alt="" aria-hidden="true" />
          <span>{error}</span>
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
  error: PropTypes.string,
  disabled: PropTypes.bool,
  required: PropTypes.bool,
  dir: PropTypes.oneOf(['ltr', 'rtl']),
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
