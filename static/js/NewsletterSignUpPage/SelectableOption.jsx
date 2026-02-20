import React, { useState, useEffect } from 'react';

const DEFAULT_ICON = 'news-and-resources.svg';
const ICON_BASE_PATH = '/static/icons/newsletter-signup/';

/**
 * SelectableOption - Shared radio/checkbox button-style selectable item
 *
 * Used by newsletter checkboxes (multi-select) and learning level options (single-select).
 * Features:
 * - Button-style card with gray background when selected
 * - SVG checkmark appears on right (English) or left (Hebrew) when selected
 * - Optional icon with preloading and fallback
 * - Supports both radio and checkbox input types
 * - Full bilingual support (English/Hebrew)
 */
export default function SelectableOption({
  type = 'checkbox',
  name,
  value,
  label,
  icon,
  isSelected = false,
  onChange,
  disabled = false,
  analyticsAttributes = {},
}) {
  const [iconSrc, setIconSrc] = useState(
    icon ? `${ICON_BASE_PATH}${icon}` : null
  );

  // Preload icon and handle errors by falling back to default
  useEffect(() => {
    if (!icon) return;

    const iconPath = `${ICON_BASE_PATH}${icon}`;
    const defaultPath = `${ICON_BASE_PATH}${DEFAULT_ICON}`;

    // Skip validation if already using default
    if (iconPath === defaultPath) return;

    const img = new Image();
    img.onload = () => setIconSrc(iconPath);
    img.onerror = () => {
      console.warn(`Failed to load icon: ${icon}, falling back to default`);
      setIconSrc(defaultPath);
    };
    img.src = iconPath;
  }, [icon]);

  const inputProps = {
    type,
    className: 'selectableOptionInput',
    checked: isSelected,
    onChange,
    disabled,
    ...analyticsAttributes,
  };
  if (type === 'radio') {
    inputProps.name = name;
    inputProps.value = value;
  }

  return (
    <div className="selectableOptionWrapper">
      <label className={`selectableOptionLabel ${isSelected ? 'selected' : ''}`}>
        <input {...inputProps} />
        {iconSrc && (
          <span
            className="selectableOptionIcon"
            style={{ maskImage: `url(${iconSrc})` }}
            role="img"
            aria-hidden="true"
          />
        )}
        <span className="selectableOptionText">{label}</span>
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
