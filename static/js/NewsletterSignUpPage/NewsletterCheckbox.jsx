import React from 'react';
import Sefaria from '../sefaria/sefaria';

/**
 * NewsletterCheckbox - Reusable checkbox component for newsletter selection
 *
 * Features:
 * - Displays emoji icon alongside label
 * - Accessible checkbox input with associated label
 * - Analytics tracking for user interactions
 * - Full bilingual support (English/Hebrew)
 */
export default function NewsletterCheckbox({
  newsletter,
  isChecked,
  onChange,
  disabled,
}) {
  const translatedLabel = Sefaria._(newsletter.labelKey);

  return (
    <div className="newsletterCheckboxWrapper">
      <label className={`newsletterCheckboxLabel ${isChecked ? 'checked' : ''}`}>
        <input
          type="checkbox"
          className="newsletterCheckboxInput"
          checked={isChecked}
          onChange={onChange}
          disabled={disabled}
          data-anl-event="newsletter_selected:input"
          data-anl-text={translatedLabel}
          data-anl-form_name="newsletter_signup"
        />
        <span className="checkboxIcon">
          {isChecked ? '✓' : ''}
        </span>
        <span className="newsletterEmoji">{newsletter.emoji}</span>
        <span className="newsletterLabel">{translatedLabel}</span>
      </label>
    </div>
  );
}
