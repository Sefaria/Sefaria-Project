import React, { useEffect, useState } from 'react';
import Sefaria from './sefaria/sefaria';
import {
  DEFAULT_PREFERENCE,
  normalizePreference,
  writeStoredPreference,
  applyTheme,
  resolveTheme,
  getCurrentPreference,
} from './sefaria/theme';

/**
 * Appearance controls: Auto / Light / Dark.
 *   - `AppearanceToggle` is the item in the desktop account menus, right after Site Language
 *     (DropdownLanguageToggle), and copies it: a `languageHeader` title, then the options.
 *   - `MobileAppearanceToggle` is the row in the hamburger menu, right after the language row.
 * Both stay in sync through THEME_CHANGE_EVENT, dispatched on `document` on every change.
 *
 * Each option is a toggle button (aria-pressed) inside a labelled group; exactly one is pressed.
 * Choosing an option keeps the desktop menu open (data-prevent-close) so the change can be seen.
 *
 * SSR/hydration: the first render reads only `Sefaria.theme` (a base prop, null when the visitor
 * has no stored preference, which means auto). The cookie is read only after mount, in an effect.
 */

export const THEME_CHANGE_EVENT = 'sefaria:themechange';

const svgProps = (size) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  'aria-hidden': 'true', focusable: 'false',
});

// Auto: a screen, i.e. "follow this device".
const AutoIcon = ({ size }) => (
  <svg className="appearanceIcon appearanceIconAuto" {...svgProps(size)}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const SunIcon = ({ size }) => (
  <svg className="appearanceIcon appearanceIconLight" {...svgProps(size)}>
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const MoonIcon = ({ size }) => (
  <svg className="appearanceIcon appearanceIconDark" {...svgProps(size)}>
    <path d="M22 12.88A10 10 0 1 1 11.12 2a7.78 7.78 0 0 0 10.88 10.88z" />
  </svg>
);

// The mobile row's leading icon (where the language row has its globe): a half-filled circle.
const ContrastIcon = ({ size }) => (
  <svg className="appearanceIcon appearanceIconRow" {...svgProps(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
  </svg>
);

const OPTIONS = [
  { value: 'auto', Icon: AutoIcon },
  { value: 'light', Icon: SunIcon },
  { value: 'dark', Icon: MoonIcon },
];

const text = (key) => Sefaria._(key);
const langClass = () => (Sefaria.interfaceLang === 'hebrew' ? 'int-he' : 'int-en');
const serverPreference = () => normalizePreference(Sefaria.theme) || DEFAULT_PREFERENCE;

const setAppearance = (from, to, action) => {
  writeStoredPreference(to);
  const theme = applyTheme(resolveTheme(to));
  Sefaria.theme = to;
  document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { preference: to, theme, from } }));
  // site_lang is attached to every event by the gtag config in base.html.
  if (typeof gtag === 'function') {
    gtag('event', 'appearance_change', { feature_name: 'appearance', from, to, theme, action });
  }
};

const useAppearance = (action) => {
  const [preference, setPreference] = useState(serverPreference);

  useEffect(() => {
    setPreference(getCurrentPreference());
    const onChange = (e) => setPreference(normalizePreference(e.detail?.preference) || getCurrentPreference());
    document.addEventListener(THEME_CHANGE_EVENT, onChange);
    return () => document.removeEventListener(THEME_CHANGE_EVENT, onChange);
  }, []);

  const choose = (next) => {
    if (next === preference) { return; }
    setPreference(next);
    setAppearance(preference, next, action);
  };

  return [preference, choose];
};

const AppearanceOptions = ({ preference, choose, size }) => OPTIONS.map(({ value, Icon }) => {
  const selected = preference === value;
  const label = text(`header.appearance_${value}`);
  return (
    <button
      key={value}
      type="button"
      className={`appearanceOption${selected ? ' active' : ''}`}
      data-appearance={value}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={() => choose(value)}
    >
      <Icon size={size} />
    </button>
  );
});

const AppearanceToggle = () => {
  const [preference, choose] = useAppearance('header_menu');
  return (
    <>
      <div className="languageHeader appearanceHeader">
        <span className={langClass()}>{text('header.appearance')}</span>
      </div>
      <div className="dropdownAppearanceToggle" role="group" aria-label={text('header.appearance')}
           data-prevent-close="true">
        <AppearanceOptions preference={preference} choose={choose} size={18} />
      </div>
    </>
  );
};

const MobileAppearanceToggle = () => {
  const [preference, choose] = useAppearance('mobile_menu');
  return (
    <div className="mobileAppearanceToggle" role="group" aria-label={text('header.appearance')}>
      <ContrastIcon size={16} />
      <span className={langClass()}>{text('header.appearance')}</span>
      <span className="mobileAppearanceOptions">
        <AppearanceOptions preference={preference} choose={choose} size={18} />
      </span>
    </div>
  );
};

export { AppearanceToggle, MobileAppearanceToggle };
