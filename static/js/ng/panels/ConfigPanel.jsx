/**
 * The config panel: how the text reads. It opens from the reader's leading edge (a drag toward
 * the trailing edge) and leaves a sliver of the text visible, which updates live as settings
 * change, with the segment being read held in place.
 *
 * - Language: source only, translation only, or both (stacked or side by side).
 * - Versions: the source and translation versions, translations grouped by language with the
 *   reader's translation-language preference first. Choosing one reloads the text through the
 *   data layer, puts it in the URL (ven/vhe) and records the preference as the classic reader does.
 * - Text: font size, segmented or continuous (stored per category), vowels and cantillation,
 *   Talmud punctuation.
 * - A link to the same page in the classic reader (?ng=0).
 *
 * Every setting goes through useNgReader().setSetting, which writes the classic reader's cookies.
 * Mount contract (OverlaySlot): {overlay, onClose}. It renders only in the browser, after an
 * interaction, but keeps render free of browser globals anyway.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Sefaria from '../../sefaria/sefaria';
import {useIsomorphicLayoutEffect, useNgReader} from '../context';
import {classicReaderUrl} from '../url';
import {isTalmud, stripHebrewMarks} from '../text';
import {DEFAULT_SETTINGS, persistVersionPreference, stepFontSize} from '../settings';
import {
  currVersionsWith, flattenVersions, groupVersions, languageAfterVersionChoice, languageName, sameVersion,
  versionDisplayTitle, versionFullTitle, versionKey, versionLanguage, versionNotes,
} from '../versions';
import {configStrings, licenseLabel} from './configStrings';

const VIEW = {MAIN: 'main', SOURCE: 'source', TRANSLATION: 'translation'};
const VOWEL_RE = /[ְ-ׇּׁׂ]/;
const CANTILLATION_RE = /[֑-֯]/;
const SAMPLE_WORD = 'שָׁלוֹ֖ם';  // shalom, with vowels and a tipcha

/* ---------------------------------------------------------------- icons */

const Svg = ({children, size = 24, className = 'ng-icon'}) => (
  <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"
       fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const CloseIcon = () => <Svg><path d="M6 6l12 12M18 6 6 18" /></Svg>;
const BackIcon = () => <Svg className="ng-icon ng-icon-flip"><path d="M14.5 5.5 8 12l6.5 6.5" /></Svg>;
const ChevronIcon = () => <Svg size={20} className="ng-icon ng-icon-flip"><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></Svg>;
const CheckIcon = () => <Svg size={20}><path d="m5 12.5 4.5 4.5L19 7.5" strokeWidth="2" /></Svg>;
const InfoIcon = () => <Svg size={20}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.6v.01" strokeWidth="2" /></Svg>;
const StackedGlyph = () => <Svg size={22}><path d="M5 6.5h14M5 9.5h10M5 14.5h14M5 17.5h8" /></Svg>;
const SideBySideGlyph = () => <Svg size={22}><path d="M4 7h6.5M4 10.5h6.5M4 14h5M13.5 7H20M13.5 10.5H20M13.5 14H18" /><path d="M12 5v12" strokeWidth="1" /></Svg>;
const SegmentedGlyph = () => <Svg size={22}><path d="M4 6.5h2M8.5 6.5H20M8.5 9.5h8M4 14.5h2M8.5 14.5H20M8.5 17.5h6" /></Svg>;
const ContinuousGlyph = () => <Svg size={22}><path d="M4 6.5h16M4 10h16M4 13.5h16M4 17h9" /></Svg>;

/* ---------------------------------------------------------------- building blocks */

/**
 * A segmented control: one choice of a few. Each option is a toggle button (aria-pressed)
 * with a stable `data-ng="setting-<name>-<value>"` hook.
 */
function Segmented({name, label, options, value, onChange, columns}) {
  const labelId = `ng-config-${name}-label`;
  return (
    <div className="ng-config-field" data-ng={`field-${name}`}>
      {label ? <div className="ng-config-label" id={labelId}>{label}</div> : null}
      <div className="ng-segmented" role="group" aria-labelledby={label ? labelId : undefined}
           style={{'--ng-segments': columns || options.length}}>
        {options.map(option => {
          const selected = option.value === value;
          return (
            <button key={option.value} type="button" className="ng-segment" aria-pressed={selected ? 'true' : 'false'}
                    data-ng={`setting-${name}-${option.value}`} onClick={() => { if (!selected) { onChange(name, option.value); } }}>
              {option.glyph ? <span className="ng-segment-glyph" aria-hidden="true">{option.glyph}</span> : null}
              <span className="ng-segment-label">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Group({title, children, name}) {
  return (
    <section className="ng-config-group" data-ng={`group-${name}`} aria-label={title}>
      <h3 className="ng-config-group-title">{title}</h3>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- data */

/** The versions of `ref`, through the data layer (cached per ref). */
function useVersions(ref) {
  const [state, setState] = useState({status: 'loading', ref, byLanguage: null});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ref) { return undefined; }
    let live = true;
    setState(prev => (prev.ref === ref && prev.status === 'ready' ? prev : {status: 'loading', ref, byLanguage: null}));
    Promise.resolve(Sefaria.getVersions(ref)).then(
      byLanguage => { if (live) { setState({status: 'ready', ref, byLanguage}); } },
      () => { if (live) { setState({status: 'error', ref, byLanguage: null}); } });
    return () => { live = false; };
  }, [ref, attempt]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  return {...state, retry};
}

/**
 * Keep the segment being read at the same height on screen while a setting reflows the text,
 * so the visible sliver shows the change and not a jump. `hold(fn)` measures, runs the change,
 * and the layout effect restores the position once the new layout is in the DOM.
 */
function useHeldPosition(rootRef, currentSegment, deps) {
  const pending = useRef(null);
  const find = (ref) => {
    const reader = rootRef.current && rootRef.current.closest('[data-ng="reader"]');
    if (!reader || !ref) { return null; }
    return Array.from(reader.querySelectorAll('[data-ng="segment"]')).find(el => el.getAttribute('data-ref') === ref) || null;
  };
  const hold = useCallback((fn) => {
    const ref = currentSegment && currentSegment.ref;
    const el = find(ref);
    pending.current = el ? {ref, top: el.getBoundingClientRect().top} : null;
    fn();
  }, [currentSegment]); // eslint-disable-line react-hooks/exhaustive-deps
  useIsomorphicLayoutEffect(() => {
    const held = pending.current;
    pending.current = null;
    const el = held && find(held.ref);
    if (!el) { return; }
    const delta = el.getBoundingClientRect().top - held.top;
    if (Math.abs(delta) >= 1) { window.scrollBy(0, delta); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return hold;
}

function sampleHas(section, re) {
  if (!section) { return false; }
  return section.segments.slice(0, 8).some(s => re.test(s.he || ''));
}

/* ---------------------------------------------------------------- versions */

function VersionRow({kind, label, version, interfaceLang, onOpen, count}) {
  const title = version ? versionDisplayTitle(version, interfaceLang) : '—';
  const lang = version ? languageName(versionLanguage(version) || version.lang, interfaceLang, version.languageFamilyName) : '';
  return (
    <button type="button" className="ng-config-row" data-ng={`version-row-${kind}`} onClick={onOpen}
            aria-haspopup="true" data-count={count}>
      <span className="ng-config-row-text">
        <span className="ng-config-row-label">{label}{lang && kind === VIEW.TRANSLATION ? ` · ${lang}` : ''}</span>
        <span className="ng-config-row-value" dir="auto">{title}</span>
      </span>
      <ChevronIcon />
    </button>
  );
}

function VersionItem({version, selected, pending, onChoose, interfaceLang, t, showLanguage}) {
  const [open, setOpen] = useState(false);
  const key = versionKey(version);
  const aboutId = `ng-version-about-${key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const title = versionDisplayTitle(version, interfaceLang);
  const fullTitle = versionFullTitle(version, interfaceLang);
  const notes = versionNotes(version, interfaceLang);
  const license = licenseLabel(version.license, interfaceLang);  // on the row itself; the details add the rest
  const lang = showLanguage ? languageName(versionLanguage(version), interfaceLang, version.languageFamilyName) : '';
  const meta = [lang, license].filter(Boolean).join(' · ');
  return (
    <li className="ng-version" data-ng="version" data-version-title={version.versionTitle}
        data-lang={versionLanguage(version)} data-selected={selected ? 'true' : undefined}
        data-pending={pending ? 'true' : undefined}>
      <div className="ng-version-main">
        <button type="button" className="ng-version-choose" data-ng="version-choose" aria-pressed={selected ? 'true' : 'false'}
                onClick={() => onChoose(version)} disabled={pending}>
          <span className="ng-version-title" dir="auto">{title}</span>
          {meta ? <span className="ng-version-meta">{meta}</span> : null}
        </button>
        <span className="ng-version-state" aria-hidden="true">
          {pending ? <span className="ng-spinner ng-spinner-small" /> : selected ? <CheckIcon /> : null}
        </span>
        <button type="button" className="ng-version-info" data-ng="version-info" aria-expanded={open ? 'true' : 'false'}
                aria-controls={aboutId} aria-label={`${open ? t.hideAbout : t.aboutVersion}: ${title}`}
                onClick={() => setOpen(o => !o)}>
          <InfoIcon />
        </button>
      </div>
      {open ? (
        <div className="ng-version-about" id={aboutId} data-ng="version-about">
          {fullTitle ? <p className="ng-version-full" dir="auto">{fullTitle}</p> : null}
          {notes ? <div className="ng-version-notes" dir="auto" dangerouslySetInnerHTML={{__html: notes}} /> : null}
          {version.versionSource ? (
            <p className="ng-version-source">
              <a href={version.versionSource} target="_blank" rel="noopener noreferrer">{t.sourceLink}</a>
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function VersionPicker({kind, versions, groups, current, pendingKey, error, onChoose, interfaceLang, t}) {
  if (versions.status === 'loading') {
    return <div className="ng-config-status" role="status" data-ng="versions-loading"><span className="ng-spinner" aria-hidden="true" />{t.loadingVersions}</div>;
  }
  if (versions.status === 'error') {
    return (
      <div className="ng-config-status" data-ng="versions-error">
        <button type="button" className="ng-config-retry" onClick={versions.retry}>{t.versionsError}</button>
      </div>
    );
  }
  const lists = kind === VIEW.SOURCE ? [{lang: null, name: null, versions: groups.sources}] : groups.translations;
  if (!lists.some(g => g.versions.length)) {
    return <p className="ng-config-status" data-ng="versions-empty">{t.noOtherVersions}</p>;
  }
  return (
    <div className="ng-version-picker" data-ng="version-picker" data-kind={kind}>
      {error ? <p className="ng-config-error" role="alert" data-ng="version-error">{error}</p> : null}
      {lists.map(group => (
        <section key={group.lang || 'all'} className="ng-version-group" data-ng="version-group" data-lang={group.lang || undefined}>
          {group.name ? <h3 className="ng-version-group-title">{group.name}</h3> : null}
          <ul className="ng-version-list">
            {group.versions.map(v => (
              <VersionItem key={versionKey(v)} version={v} selected={sameVersion(v, current)} pending={pendingKey === versionKey(v)}
                           onChoose={onChoose} interfaceLang={interfaceLang} t={t} showLanguage={kind === VIEW.SOURCE && lists.length === 1 && versionLanguage(v) !== 'he'} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- the panel */

export default function ConfigPanel({onClose}) {
  const reader = useNgReader();
  const {
    interfaceLang, settings, setSetting, currentLayout, currentSection, currentSegment, currVersions, setCurrVersions,
    currentUrl, translationLanguagePreference = null,
  } = reader;
  const t = configStrings(interfaceLang);
  const rootRef = useRef(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const [view, setView] = useState(VIEW.MAIN);
  const [pendingKey, setPendingKey] = useState(null);
  const [switchError, setSwitchError] = useState(null);

  const hold = useHeldPosition(rootRef, currentSegment,
    [settings.language, settings.biLayout, settings.fontSize, settings.vowels, settings.punctuationTalmud, currentLayout]);
  const change = useCallback((option, value) => hold(() => setSetting(option, value)), [hold, setSetting]);

  const sectionRef = currentSection ? currentSection.ref : null;
  const versions = useVersions(sectionRef);
  const groups = useMemo(() => groupVersions(versions.byLanguage, {translationLanguagePreference, interfaceLang}),
    [versions.byLanguage, translationLanguagePreference, interfaceLang]);
  const allVersions = useMemo(() => flattenVersions(versions.byLanguage), [versions.byLanguage]);
  // The versions on screen, as the text API reported them; filled out from the full list once it loads.
  const shown = (meta) => (meta && allVersions.find(v => sameVersion(v, meta))) || meta;
  const currentSource = currentSection ? shown(currentSection.primary) : null;
  const currentTranslation = currentSection ? shown(currentSection.translation) : null;

  // Focus the panel when it opens (without scrolling the text), and the view's heading after a switch.
  useEffect(() => {
    const el = rootRef.current && rootRef.current.querySelector('[data-ng="config-title"]');
    if (el && el.focus) { el.focus({preventScroll: true}); }
  }, [view]);

  const chooseVersion = useCallback((version) => {
    const current = version.isSource ? currentSource : currentTranslation;
    if (sameVersion(version, current)) { setView(VIEW.MAIN); return; }
    const key = versionKey(version);
    setPendingKey(key);
    setSwitchError(null);
    const nextLanguage = languageAfterVersionChoice(settings.language, !!version.isSource);
    Promise.resolve(setCurrVersions(currVersionsWith(currVersions, version))).then(() => {
      // As VersionBlock.openVersionInMainPanel: record the choice per corpus (translations only).
      persistVersionPreference(sectionRef, version.versionTitle, version.isSource ? 'he' : 'en');
      if (!mounted.current) { return; }
      if (nextLanguage !== settings.language) { setSetting('language', nextLanguage); }
      setPendingKey(null);
      setView(VIEW.MAIN);
    }, () => {
      if (!mounted.current) { return; }
      setPendingKey(null);
      setSwitchError(t.switchError);
    });
  }, [currentSource, currentTranslation, currVersions, setCurrVersions, settings.language, setSetting, sectionRef, t]);

  const openPicker = (kind) => { setSwitchError(null); setView(kind); };

  const bilingual = settings.language === 'bilingual';
  const sideBySide = settings.biLayout === 'heLeft' || settings.biLayout === 'heRight';
  const showsSource = settings.language !== 'english';
  const hasVowels = sampleHas(currentSection, VOWEL_RE);
  const hasCantillation = sampleHas(currentSection, CANTILLATION_RE);
  const talmud = isTalmud(currentSection);
  const tanakh = currentSection && currentSection.primaryCategory === 'Tanakh';
  const hasTranslations = !!currentSection && (!!currentSection.translation || groups.translations.length > 0);
  const size = settings.fontSize || DEFAULT_SETTINGS.fontSize;
  const smaller = stepFontSize(size, 'smaller');
  const larger = stepFontSize(size, 'larger');

  const vowelOptions = hasCantillation
    ? [
      {value: 'all', label: t.vowelsAll, glyph: SAMPLE_WORD},
      {value: 'partial', label: t.vowelsPartial, glyph: stripHebrewMarks(SAMPLE_WORD, {vowels: 'partial'})},
      {value: 'none', label: t.vowelsNone, glyph: stripHebrewMarks(SAMPLE_WORD, {vowels: 'none'})},
    ]
    : [
      {value: 'all', label: t.vowelsPartial, glyph: stripHebrewMarks(SAMPLE_WORD, {vowels: 'partial'})},
      {value: 'none', label: t.vowelsNone, glyph: stripHebrewMarks(SAMPLE_WORD, {vowels: 'none'})},
    ];
  // Without cantillation in the text, "all" and "partial" look the same: show them as one choice.
  const vowelValue = !hasCantillation && settings.vowels === 'partial' ? 'all' : settings.vowels;

  const title = view === VIEW.SOURCE ? t.chooseSource : view === VIEW.TRANSLATION ? t.chooseTranslation : t.title;

  return (
    <div className="ng-panel ng-config" data-ng="panel-config" data-view={view} ref={rootRef}>
      <div className="ng-config-head">
        {view !== VIEW.MAIN ? (
          <button type="button" className="ng-config-icon-button" data-ng="config-back" aria-label={t.back}
                  onClick={() => setView(VIEW.MAIN)}><BackIcon /></button>
        ) : null}
        <h2 className="ng-config-title" data-ng="config-title" tabIndex={-1}>{title}</h2>
        <button type="button" className="ng-config-icon-button ng-config-close" data-ng="overlay-close" aria-label={t.close}
                onClick={onClose}><CloseIcon /></button>
      </div>

      {view === VIEW.MAIN ? (
        <div className="ng-config-body" data-ng="config-main">
          <Group name="language" title={t.language}>
            <Segmented name="language" value={settings.language} onChange={change} options={[
              {value: 'hebrew', label: t.source, glyph: <span lang="he">א</span>},
              {value: 'english', label: t.translation, glyph: <span lang="en">A</span>},
              {value: 'bilingual', label: t.both, glyph: <><span lang="he">א</span><span lang="en">A</span></>},
            ]} />
            {bilingual ? (
              <Segmented name="biLayout" label={t.bilingualLayout} value={sideBySide ? 'heRight' : 'stacked'} onChange={change} options={[
                {value: 'stacked', label: t.stacked, glyph: <StackedGlyph />},
                {value: 'heRight', label: t.sideBySide, glyph: <SideBySideGlyph />},
              ]} />
            ) : null}
          </Group>

          {currentSection ? (
            <Group name="versions" title={t.versions}>
              <div className="ng-config-rows">
                <VersionRow kind={VIEW.SOURCE} label={t.sourceVersion} version={currentSource} interfaceLang={interfaceLang}
                            onOpen={() => openPicker(VIEW.SOURCE)} count={groups.sources.length || undefined} />
                {hasTranslations ? (
                  <VersionRow kind={VIEW.TRANSLATION} label={t.translationVersion} version={currentTranslation} interfaceLang={interfaceLang}
                              onOpen={() => openPicker(VIEW.TRANSLATION)} count={groups.translations.length || undefined} />
                ) : null}
              </div>
            </Group>
          ) : null}

          <Group name="text" title={t.text}>
            <div className="ng-config-field" data-ng="field-fontSize">
              <div className="ng-config-label" id="ng-config-fontSize-label">{t.fontSize}</div>
              <div className="ng-stepper" role="group" aria-labelledby="ng-config-fontSize-label">
                <button type="button" className="ng-stepper-button" data-ng="setting-fontSize-smaller" aria-label={t.smaller}
                        disabled={smaller === size} onClick={() => change('fontSize', smaller)}>
                  <span className="ng-stepper-a ng-stepper-a-small" aria-hidden="true">A</span>
                </button>
                <output className="ng-stepper-value" data-ng="fontSize-value" aria-live="polite">
                  {Math.round(size / DEFAULT_SETTINGS.fontSize * 100)}%
                </output>
                <button type="button" className="ng-stepper-button" data-ng="setting-fontSize-larger" aria-label={t.larger}
                        disabled={larger === size} onClick={() => change('fontSize', larger)}>
                  <span className="ng-stepper-a ng-stepper-a-large" aria-hidden="true">A</span>
                </button>
              </div>
            </div>
            {!bilingual ? (
              <Segmented name="layout" label={t.flow} value={currentLayout} onChange={change} options={[
                {value: 'segmented', label: tanakh ? t.segmentedTanakh : t.segmented, glyph: <SegmentedGlyph />},
                {value: 'continuous', label: t.continuous, glyph: <ContinuousGlyph />},
              ]} />
            ) : null}
            {showsSource && hasVowels ? (
              <Segmented name="vowels" label={hasCantillation ? t.vowels : t.vowelsOnly} value={vowelValue} onChange={change} options={vowelOptions} />
            ) : null}
            {showsSource && talmud ? (
              <Segmented name="punctuationTalmud" label={t.punctuation} value={settings.punctuationTalmud} onChange={change} options={[
                {value: 'punctuationOn', label: t.on},
                {value: 'punctuationOff', label: t.off},
              ]} />
            ) : null}
          </Group>

          {currentUrl ? (
            <a className="ng-config-classic" data-ng="classic-link" href={classicReaderUrl(currentUrl)}>
              <span>{t.classicView}</span>
              <span className="ng-config-classic-note">{t.classicViewNote}</span>
            </a>
          ) : null}
        </div>
      ) : (
        <div className="ng-config-body" data-ng="config-versions">
          <VersionPicker kind={view} versions={versions} groups={groups} pendingKey={pendingKey} error={switchError}
                         current={view === VIEW.SOURCE ? currentSource : currentTranslation}
                         onChoose={chooseVersion} interfaceLang={interfaceLang} t={t} />
        </div>
      )}
    </div>
  );
}
