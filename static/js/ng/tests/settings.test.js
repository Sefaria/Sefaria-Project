import {initialSettingsFromProps, layoutFor, persistSetting, resolveSettingKey, DEFAULT_SETTINGS} from '../settings';
import {sectionFromApi} from '../text';
import {fixture} from './helpers';

function clearCookies() {
  document.cookie.split(';').forEach(c => {
    const name = c.split('=')[0].trim();
    if (name) { document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`; }
  });
}

describe('initial settings', () => {
  test('come from the server (the classic cookies) with defaults filled in', () => {
    const props = fixture('genesis-1');
    props.initialSettings = {language: 'hebrew', biLayout: 'heRight', fontSize: '71.875'};
    const s = initialSettingsFromProps(props);
    expect(s.language).toBe('hebrew');
    expect(s.biLayout).toBe('heRight');
    expect(s.fontSize).toBe(71.875);
    expect(s.layoutTalmud).toBe(DEFAULT_SETTINGS.layoutTalmud);
  });

  test('the panel (?lang=) overrides the cookie', () => {
    const props = fixture('genesis-1', {language: 'bilingual'});
    props.initialPanel.settings = {language: 'en'};
    expect(initialSettingsFromProps(props).language).toBe('english');
  });
});

describe('layout is per category, as ReaderPanel.getLayoutCategory', () => {
  const gen = sectionFromApi(fixture('genesis-1').initialPanel.text);
  const ber = sectionFromApi(fixture('berakhot-2a').initialPanel.text);
  test('resolves "layout" to the section\'s key', () => {
    expect(resolveSettingKey('layout', gen)).toBe('layoutTanakh');
    expect(resolveSettingKey('layout', ber)).toBe('layoutTalmud');
    expect(resolveSettingKey('layout', {primaryCategory: 'Mishnah'})).toBe('layoutDefault');
    expect(resolveSettingKey('biLayout', gen)).toBe('biLayout');
  });
  test('defaults: Tanakh segmented, Talmud continuous', () => {
    expect(layoutFor(DEFAULT_SETTINGS, gen)).toBe('segmented');
    expect(layoutFor(DEFAULT_SETTINGS, ber)).toBe('continuous');
  });
});

describe('persistSetting writes the classic reader\'s cookies', () => {
  beforeEach(clearCookies);
  test('language also sets contentLang, which the server reads', () => {
    persistSetting('language', 'hebrew');
    expect(document.cookie).toContain('contentLang=hebrew');
    expect(document.cookie).toContain('language=hebrew');
  });
  test('other options use their own name', () => {
    persistSetting('biLayout', 'heRight');
    persistSetting('layoutTanakh', 'continuous');
    expect(document.cookie).toContain('biLayout=heRight');
    expect(document.cookie).toContain('layoutTanakh=continuous');
  });
});
