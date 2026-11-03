import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';
import {InterfaceText} from './Misc';
import {
  LEVELS, FORMATS, NOTES, VOWELS, DEFAULT_SETTINGS,
  loadSettings, loadTargetInfo, resolveOptions, loadCopyData, render, hasNikkud, writeClipboard,
} from './sefaria/copyTool';


const CopyToolMenu = ({x, y, showPrevious, onCopyPrevious, onCopyDialog, onClose}) => {
  /* The right-click menu over library text. */
  const menuRef = useRef(null);
  const [position, setPosition] = useState({left: x, top: y});

  useLayoutEffect(() => {
    // Keep the menu inside the viewport.
    const {width, height} = menuRef.current.getBoundingClientRect();
    setPosition({
      left: Math.max(0, Math.min(x, window.innerWidth - width - 4)),
      top: Math.max(0, Math.min(y, window.innerHeight - height - 4)),
    });
    menuRef.current.querySelector('button').focus();
  }, [x, y]);

  useEffect(() => {
    const onMouseDown = (e) => { if (!menuRef.current.contains(e.target)) { onClose(); } };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = Array.from(menuRef.current.querySelectorAll('button'));
        const i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      }
    };
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div className="copyToolMenu sans-serif" role="menu" ref={menuRef} style={position}
         onContextMenu={(e) => e.preventDefault()}>
      {showPrevious &&
        <button type="button" role="menuitem" onClick={onCopyPrevious}>
          <InterfaceText>copy_tool.copy_with_previous</InterfaceText>
        </button>}
      <button type="button" role="menuitem" onClick={onCopyDialog}>
        <InterfaceText>copy_tool.copy_ellipsis</InterfaceText>
      </button>
    </div>
  );
};
CopyToolMenu.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  showPrevious: PropTypes.bool,
  onCopyPrevious: PropTypes.func.isRequired,
  onCopyDialog: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};


const RadioRow = ({name, label, value, choices, onChange}) => (
  <div className="copyToolRow" role="radiogroup" aria-label={Sefaria._(label)}>
    <div className="copyToolLabel"><InterfaceText>{label}</InterfaceText></div>
    <div className="copyToolControls">
      {choices.map(c => (
        <label key={c.value} className="copyToolChoice">
          <input type="radio" name={name} value={c.value} checked={value === c.value} onChange={() => onChange(c.value)} />
          {c.text ? <span>{c.text}</span> : <InterfaceText>{c.label}</InterfaceText>}
        </label>
      ))}
    </div>
  </div>
);

const versionKey = (v) => v ? `${v.languageFamilyName}|${v.versionTitle}` : '';
const versionLabel = (v) => (Sefaria.interfaceLang === 'hebrew' && v.versionTitleInHebrew) || v.versionTitle;
const levelLabel = (l) => l.level === LEVELS.WORD ? Sefaria._('copy_tool.word') :
  (Sefaria.interfaceLang === 'hebrew' ? Sefaria.hebrewTerm(l.name) : l.name);

const VersionSelect = ({lang, versions, value, disabled, onChange}) => {
  // Translations are grouped by language; source versions are listed flat.
  const groups = {};
  versions.forEach(v => { (groups[v.languageFamilyName] = groups[v.languageFamilyName] || []).push(v); });
  const options = (vs) => vs.map(v => <option key={versionKey(v)} value={versionKey(v)}>{versionLabel(v)}</option>);
  return (
    <select className="copyToolVersionSelect" value={versionKey(value)} disabled={disabled}
            aria-label={Sefaria._(`copy_tool.${lang}`)}
            onChange={(e) => {
              const v = versions.find(v => versionKey(v) === e.target.value);
              onChange({languageFamilyName: v.languageFamilyName, versionTitle: v.versionTitle});
            }}>
      {lang === 'translation' && Object.keys(groups).length > 1 ?
        Object.entries(groups).map(([family, vs]) => (
          <optgroup key={family} label={Sefaria._(family.toFirstCapital())}>{options(vs)}</optgroup>
        )) : options(versions)}
    </select>
  );
};


const CopyToolDialog = ({target, translationLanguagePreference, onClose, onCopied}) => {
  /* "Copy from <ref>": choose level, languages, versions, format and extras, preview, copy. */
  const [info, setInfo] = useState(null);
  const [options, setOptions] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [htmlPreviewMode, setHtmlPreviewMode] = useState('code');  // 'code' | 'rendered' — view only, not saved, not copied
  const dialogRef = useRef(null);
  const set = (changes) => setOptions(o => ({...o, ...changes}));

  useEffect(() => {
    let current = true;
    loadTargetInfo(target, translationLanguagePreference).then(info => {
      if (!current) { return; }
      setInfo(info);
      setOptions(resolveOptions(target, info, loadSettings() || DEFAULT_SETTINGS));
    }).catch(() => current && setError('copy_tool.no_text'));
    return () => { current = false; };
  }, [target]);

  // Refetch only when what's copied changes; format and extras just re-render.
  const fetchKey = options && JSON.stringify([options.level, options.languages, options.versions]);
  useEffect(() => {
    if (!options) { return; }
    let current = true;
    setData(null);
    loadCopyData(target, info, options).then(d => current && setData(d)).catch(() => current && setError('copy_tool.no_text'));
    return () => { current = false; };
  }, [fetchKey]);

  const output = useMemo(() => data && render(data, options), [data, options]);

  useEffect(() => {
    dialogRef.current.focus();
    const onKeyDown = (e) => { if (e.key === 'Escape') { onClose(); } };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleCopy = async () => {
    try {
      await writeClipboard(output, options.format === FORMATS.FORMATTED);
      const {versions, ...settings} = options;
      onCopied(settings);
    } catch (e) {
      setError('copy_tool.copy_failed');
    }
  };

  const isWord = options?.level === LEVELS.WORD;
  const isHtmlFormat = options?.format === FORMATS.HTML;
  const missingCount = output?.missingSegments || 0;
  const levelInfo = info && options && info.levels.find(l => l.level === options.level);
  const titleRef = levelInfo?.ref ? (Sefaria.interfaceLang === 'hebrew' ? levelInfo.heRef : levelInfo.ref) : target.ref;
  const toggleLanguage = (lang) => {
    const languages = {...options.languages, [lang]: !options.languages[lang]};
    if (languages.source || languages.translation) { set({languages}); }  // keep at least one
  };
  const setLevel = (level) => {
    if (level === LEVELS.WORD) {
      // A word is copied from the language it was clicked in; the other can't be tacked on.
      const lang = target.wordLang === 'translation' && info.defaults.translation ? 'translation' : 'source';
      set({level, languages: {source: lang === 'source', translation: lang === 'translation'}});
    } else {
      set({level});
    }
  };

  const languageRow = (lang) => {
    const versions = info.versions[lang];
    const disabled = !versions.length || (isWord && !options.languages[lang]);
    return (
      <div className="copyToolLanguage" key={lang}>
        <label className="copyToolChoice">
          <input type="checkbox" checked={options.languages[lang]} disabled={disabled} onChange={() => toggleLanguage(lang)} />
          <InterfaceText>{`copy_tool.${lang}`}</InterfaceText>
        </label>
        {versions.length > 0 && options.languages[lang] &&
          <VersionSelect lang={lang} versions={versions} value={options.versions[lang]} disabled={isWord}
                         onChange={(v) => set({versions: {...options.versions, [lang]: v}})} />}
      </div>
    );
  };

  return (
    <div className="copyToolDialogBox">
      <div className="copyToolOverlay" onClick={onClose}></div>
      <div className="copyToolDialog sans-serif" role="dialog" aria-modal="true" aria-labelledby="copyToolTitle"
           tabIndex="-1" ref={dialogRef}>
        <div className="copyToolHeader">
          <h2 id="copyToolTitle">
            <InterfaceText>copy_tool.copy_from</InterfaceText> <span className="copyToolRef">{titleRef}</span>
          </h2>
          <button type="button" className="copyToolClose" aria-label={Sefaria._('common.close')} onClick={onClose}>×</button>
        </div>

        {!options ? (
          <div className="copyToolStatus"><InterfaceText>{error || 'common.loading'}</InterfaceText></div>
        ) : (<>
          <RadioRow name="copyToolLevel" label="copy_tool.level" value={options.level} onChange={setLevel}
                    choices={info.levels.map(l => ({value: l.level, text: levelLabel(l)}))} />

          <div className="copyToolRow">
            <div className="copyToolLabel"><InterfaceText>copy_tool.language</InterfaceText></div>
            <div className="copyToolControls copyToolLanguages">
              {languageRow('source')}
              {languageRow('translation')}
            </div>
          </div>

          <RadioRow name="copyToolFormat" label="copy_tool.format" value={options.format} onChange={(format) => set({format})}
                    choices={[
                      {value: FORMATS.FORMATTED, label: 'copy_tool.format_formatted'},
                      {value: FORMATS.PLAIN, label: 'copy_tool.format_plain'},
                      {value: FORMATS.MARKDOWN, label: 'copy_tool.format_markdown'},
                      {value: FORMATS.HTML, label: 'copy_tool.format_html'},
                    ]} />

          <div className="copyToolRow">
            <div className="copyToolLabel"><InterfaceText>copy_tool.include</InterfaceText></div>
            <div className="copyToolControls">
              <label className="copyToolChoice">
                <input type="checkbox" checked={options.citation} onChange={() => set({citation: !options.citation})} />
                <InterfaceText>copy_tool.citation</InterfaceText>
              </label>
              {!isWord &&
                <label className="copyToolChoice">
                  <input type="checkbox" checked={options.segmentNumbers} onChange={() => set({segmentNumbers: !options.segmentNumbers})} />
                  <InterfaceText>copy_tool.segment_numbers</InterfaceText>
                </label>}
            </div>
          </div>

          {!isWord && output?.hasNotes &&
            <RadioRow name="copyToolNotes" label="copy_tool.notes" value={options.notes} onChange={(notes) => set({notes})}
                      choices={[
                        {value: NOTES.OMIT, label: 'copy_tool.notes_omit'},
                        {value: NOTES.INLINE, label: 'copy_tool.notes_inline'},
                        {value: NOTES.END, label: 'copy_tool.notes_end'},
                      ]} />}

          {data && options.languages.source && hasNikkud(data) &&
            <RadioRow name="copyToolVowels" label="copy_tool.vowels" value={options.vowels} onChange={(vowels) => set({vowels})}
                      choices={[
                        {value: VOWELS.ALL, label: 'copy_tool.vowels_all'},
                        {value: VOWELS.VOWELS, label: 'copy_tool.vowels_only'},
                        {value: VOWELS.NONE, label: 'copy_tool.vowels_none'},
                      ]} />}

          <div className="copyToolPreviewLabelRow">
            <div className="copyToolPreviewLabel"><InterfaceText>copy_tool.preview</InterfaceText></div>
            {isHtmlFormat &&
              <div className="copyToolPreviewToggle" role="group" aria-label={Sefaria._('copy_tool.preview')}>
                <button type="button" aria-pressed={htmlPreviewMode === 'rendered'} onClick={() => setHtmlPreviewMode('rendered')}>
                  <InterfaceText>copy_tool.preview_rendered</InterfaceText>
                </button>
                <button type="button" aria-pressed={htmlPreviewMode === 'code'} onClick={() => setHtmlPreviewMode('code')}>
                  <InterfaceText>copy_tool.preview_code</InterfaceText>
                </button>
              </div>}
          </div>
          <div className={classNames({copyToolPreview: 1, copyToolPreviewSource: options.format !== FORMATS.FORMATTED})}>
            {error ? <InterfaceText>{error}</InterfaceText> :
              !output ? <InterfaceText>common.loading</InterfaceText> :
              !output.plain ? <InterfaceText>copy_tool.no_text</InterfaceText> :
              output.html ? <div dangerouslySetInnerHTML={{__html: output.html}} /> :
              isHtmlFormat && htmlPreviewMode === 'rendered' ? <div dangerouslySetInnerHTML={{__html: output.plain}} /> :
              <pre>{output.plain}</pre>}
          </div>

          {options.level === LEVELS.SECTION && missingCount > 0 &&
            <div className="copyToolMissingNote">
              <InterfaceText>copy_tool.segments_missing</InterfaceText> {missingCount}
            </div>}

          <div className="copyToolButtons">
            <button type="button" className="button small white" onClick={onClose}>
              <InterfaceText>common.cancel</InterfaceText>
            </button>
            <button type="button" className={classNames({button: 1, small: 1, disabled: !output?.plain})}
                    disabled={!output?.plain} onClick={handleCopy}>
              <InterfaceText>copy_tool.copy</InterfaceText>
            </button>
          </div>
        </>)}
      </div>
    </div>
  );
};
CopyToolDialog.propTypes = {
  target: PropTypes.object.isRequired,
  translationLanguagePreference: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onCopied: PropTypes.func.isRequired,
};


const CopyToolToast = ({message, onDone}) => {
  useEffect(() => {
    const timer = setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [message]);
  return <div className="copyToolToast sans-serif" role="status" aria-live="polite"><InterfaceText>{message}</InterfaceText></div>;
};
CopyToolToast.propTypes = {
  message: PropTypes.string.isRequired,
  onDone: PropTypes.func.isRequired,
};


export {CopyToolMenu, CopyToolDialog, CopyToolToast};
