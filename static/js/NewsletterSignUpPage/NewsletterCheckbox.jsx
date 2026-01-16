import React, { useState, useEffect } from 'react';
import Sefaria from '../sefaria/sefaria';

// Default fallback icon if the specified icon fails to load
const DEFAULT_ICON = 'news-and-resources.svg';
const ICON_BASE_PATH = '/static/icons/newsletter-signup/';

/**
 * NewsletterCheckbox - Reusable checkbox component for newsletter selection
 *
 * Features:
 * - Button-style selectable items with gray background when selected
 * - SVG checkmark icon appears on right (English) or left (Hebrew) when selected
 * - Accessible checkbox input with associated label
 * - Analytics tracking for user interactions
 * - Full bilingual support (English/Hebrew)
 * - Fallback to default icon if specified icon fails to load
 * - CSS mask-based icon coloring for dynamic color control
 */
export default function NewsletterCheckbox({
  newsletter,
  isChecked,
  onChange,
  disabled,
}) {
  const translatedLabel = Sefaria._(newsletter.labelKey);
  const initialIcon = newsletter.icon || DEFAULT_ICON;
  const [iconSrc, setIconSrc] = useState(`${ICON_BASE_PATH}${initialIcon}`);

  // Preload icon and handle errors by falling back to default
  useEffect(() => {
    const iconPath = `${ICON_BASE_PATH}${newsletter.icon || DEFAULT_ICON}`;
    const defaultPath = `${ICON_BASE_PATH}${DEFAULT_ICON}`;

    // Skip validation if already using default
    if (iconPath === defaultPath) return;

    const img = new Image();
    img.onload = () => setIconSrc(iconPath);
    img.onerror = () => {
      console.warn(`Failed to load newsletter icon: ${newsletter.icon}, falling back to default`);
      setIconSrc(defaultPath);
    };
    img.src = iconPath;
  }, [newsletter.icon]);

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
        <span
          className="newsletterIcon"
          style={{ maskImage: `url(${iconSrc})` }}
          role="img"
          aria-hidden="true"
        />
        <span className="newsletterLabel">{translatedLabel}</span>
        <span className="selectedCheckmark">
          <img
            src="/static/icons/newsletter-signup/newsletter-selected-checkbox.svg"
            alt=""
            aria-hidden="true"
          />
        </span>
      </label>
    </div>
  );
}
