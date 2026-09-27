import React, { useEffect, useState } from 'react';
import Sefaria from './sefaria/sefaria';
import {
  normalizeTheme,
  writeStoredTheme,
  applyTheme,
  getCurrentTheme,
} from './sefaria/theme';

/**
 * Dark mode toggle: `ThemeToggle` is the desktop header icon button, `MobileThemeToggle` is the
 * row in the hamburger menu. Both render the same theme and stay in sync through
 * THEME_CHANGE_EVENT, which is dispatched on `document` whenever either one changes the theme.
 *
 * SSR/hydration: the first render reads only `Sefaria.theme` (a base prop, null when the visitor
 * has no stored choice, which means light). The DOM is read only after mount, in an effect,
 * because the head script may have applied a different theme (for templates rendered without it).
 */

export const THEME_CHANGE_EVENT = 'sefaria:themechange';

const LIGHT = 'light';
const DARK = 'dark';

const serverTheme = () => normalizeTheme(Sefaria.theme) || LIGHT;
const domTheme = () => normalizeTheme(getCurrentTheme()) || serverTheme();

const setSiteTheme = (from, to, action) => {
  const domain = Sefaria.util.getCookieDomain();
  if (domain) {
    writeStoredTheme(to, { domain });
  } else {
    writeStoredTheme(to);
  }
  applyTheme(to);
  Sefaria.theme = to;
  document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: to, from } }));
  // site_lang is attached to every event by the gtag config in base.html.
  if (typeof gtag === 'function') {
    gtag('event', 'theme_toggle', { feature_name: 'theme_toggle', from, to, action });
  }
};

const useSiteTheme = (action) => {
  const [theme, setTheme] = useState(serverTheme);

  useEffect(() => {
    setTheme(domTheme());
    const onThemeChange = (e) => setTheme(normalizeTheme(e.detail?.theme) || domTheme());
    document.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    return () => document.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
  }, []);

  const toggle = () => {
    const next = theme === DARK ? LIGHT : DARK;
    setTheme(next);
    setSiteTheme(theme, next, action);
  };

  return [theme, toggle];
};

const MoonIcon = ({ size }) => (
  <svg className="themeToggleIcon themeToggleMoon" width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true" focusable="false">
    <path d="M22 12.88A10 10 0 1 1 11.12 2a7.78 7.78 0 0 0 10.88 10.88z" />
  </svg>
);

const SunIcon = ({ size }) => (
  <svg className="themeToggleIcon themeToggleSun" width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const label = () => Sefaria._('header.dark_mode');

const ThemeToggle = () => {
  const [theme, toggle] = useSiteTheme('header');
  const isDark = theme === DARK;
  return (
    <button
      type="button"
      className="icon-only themeToggle"
      aria-pressed={isDark}
      aria-label={label()}
      title={label()}
      onClick={toggle}
    >
      {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  );
};

const MobileThemeToggle = () => {
  const [theme, toggle] = useSiteTheme('mobile_menu');
  const isDark = theme === DARK;
  return (
    <button
      type="button"
      role="switch"
      className="mobileThemeToggle"
      aria-checked={isDark}
      onClick={toggle}
    >
      <MoonIcon size={16} />
      <span className={Sefaria.interfaceLang === 'hebrew' ? 'int-he' : 'int-en'}>{label()}</span>
      <span className="mobileThemeToggleSwitch" aria-hidden="true" />
    </button>
  );
};

export { ThemeToggle, MobileThemeToggle };
