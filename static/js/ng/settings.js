/**
 * Reader settings. NG reads and writes the same cookies as the classic reader
 * (ReaderPanel.setOption, reader/views.py reader_initial_settings), so `?ng=0` shows the
 * same language and layout, and server-side defaults agree with what NG shows.
 */
import Sefaria from '../sefaria/sefaria';
import {layoutKeyFor, longLang} from './text';

export const DEFAULT_SETTINGS = {
  language: 'bilingual',
  layoutDefault: 'segmented',
  layoutTalmud: 'continuous',
  layoutTanakh: 'segmented',
  biLayout: 'stacked',
  aliyotTorah: 'aliyotOff',
  vowels: 'all',
  punctuationTalmud: 'punctuationOn',
  fontSize: 62.5,
};

export const COOKIE_OPTIONS = Object.keys(DEFAULT_SETTINGS);

/** Initial settings: server cookies (initialSettings), overridden by the panel (e.g. ?lang=). */
export function initialSettingsFromProps(props) {
  const fromServer = props.initialSettings || {};
  const panelSettings = (props.initialPanel && props.initialPanel.settings) || {};
  const settings = {...DEFAULT_SETTINGS};
  for (const key of COOKIE_OPTIONS) {
    if (fromServer[key] !== undefined && fromServer[key] !== null) { settings[key] = fromServer[key]; }
  }
  if (panelSettings.language) { settings.language = longLang(panelSettings.language) || settings.language; }
  if (panelSettings.aliyotTorah) { settings.aliyotTorah = panelSettings.aliyotTorah; }
  settings.fontSize = parseFloat(settings.fontSize) || DEFAULT_SETTINGS.fontSize;
  return settings;
}

/** "layout" is stored per category, as in ReaderPanel.setOption. */
export function resolveSettingKey(option, section) {
  return option === 'layout' ? layoutKeyFor(section) : option;
}

export function layoutFor(settings, section) {
  return settings[layoutKeyFor(section)] || 'segmented';
}

function writeCookie(name, value) {
  // Same as $.cookie(name, value, {path: "/"}) in the classic reader: session cookie, site-wide path.
  if (typeof document === 'undefined') { return; }
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}; path=/`;
}

/** Persist one setting where the classic reader and the server look for it. */
export function persistSetting(option, value) {
  if (option === 'language') {
    writeCookie('contentLang', value);
  }
  writeCookie(option, value);
}

/**
 * Version choices go through the data layer (Sefaria.setVersionPreference), which updates
 * the version_preferences_by_corpus cookie and the profile exactly as the classic reader does.
 */
export function persistVersionPreference(sref, versionTitle, lang) {
  if (Sefaria.versionPreferences && sref && versionTitle) {
    Sefaria.setVersionPreference(sref, versionTitle, lang);
  }
}
