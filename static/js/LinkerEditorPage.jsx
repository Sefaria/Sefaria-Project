import React, { useState, useEffect, useCallback } from 'react';
import Sefaria from './sefaria/sefaria';
import { GeneralAutocomplete } from './GeneralAutocomplete';
import { InterfaceText, LoadingMessage } from './Misc';
import ToggleSwitch from './common/ToggleSwitch';

/*
 * Staff-only linker editor (/linker-editor). Search an Index, browse its schema tree,
 * and edit each node's MatchTemplates and AddressTypes. Clicking a NonUniqueTerm badge
 * opens a bottom panel showing every other node that uses the term.
 * Backend: sefaria/helper/linker_editor.py + api/views.py LinkerEditor* views.
 */

const SCOPES = ['combined', 'alone', 'any'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const nodePrimaryTitle = (node) => {
  if (node.default) { return '<Default Node>'; }
  const titles = node.titles || [];
  const primaryEn = titles.find(t => t.lang === 'en' && t.primary);
  if (primaryEn) { return primaryEn.text; }
  const anyEn = titles.find(t => t.lang === 'en');
  if (anyEn) { return anyEn.text; }
  return node.title || node.sharedTitle || node.key || node.wholeRef || '(untitled)';
};

const pathString = (keyPath) => keyPath.join('.');

// A NonUniqueTerm badge shows its primary English title (falling back to primary
// Hebrew), with the raw slug always displayed in grey underneath for reference.
const termBadgeTitle = (slug, termTitles) => {
  const t = (termTitles || {})[slug] || {};
  return (t.primary_en || '').trim() || (t.primary_he || '').trim();
};

const TermBadge = ({ slug, termTitles, onClick, children }) => {
  const title = termBadgeTitle(slug, termTitles);
  const interactive = typeof onClick === 'function';
  return (
    <span
      className="termBadge"
      title={slug}
      onClick={interactive ? onClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <span className="termBadgeLabels">
        {title && <span className="termBadgeTitle">{title}</span>}
        <span className="termBadgeSlug">{slug}</span>
      </span>
      {children}
    </span>
  );
};

// Gather every NonUniqueTerm slug used across a raw index's default + alt structures.
const collectTermSlugs = (rawIndex) => {
  const slugs = new Set();
  const walk = (node) => {
    if (!node) { return; }
    (node.match_templates || []).forEach(mt => (mt.term_slugs || []).forEach(s => slugs.add(s)));
    (node.nodes || []).forEach(walk);
  };
  walk(rawIndex && rawIndex.schema);
  altStructRoots(rawIndex || {}).forEach(({ nodes }) => nodes.forEach(walk));
  return [...slugs];
};

const altStructRoots = (rawIndex) => {
  const altStructs = rawIndex?.alt_structs || {};
  return Object.entries(altStructs)
    .map(([structName, struct]) => ({ structName, nodes: struct.nodes || [] }));
};

const nodeDomId = (path) => `linker-editor-node-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

const encPath = (s) => encodeURIComponent(s);

const detectTitleLang = (text) => Sefaria.hebrew.isHebrew(text) ? 'he' : 'en';

const editorApi = {
  loadRawIndex: (title) => Sefaria._ApiPromise(`${Sefaria.apiHost}/api/v2/raw/index/${encPath(title)}?_=${Date.now()}`),
  searchTerms: (q) => Sefaria._ApiPromise(`${Sefaria.apiHost}/api/linker/non-unique-terms?q=${encPath(q)}`),
  termDetail: (slug) => Sefaria._ApiPromise(`${Sefaria.apiHost}/_api/linker-editor/non-unique-term/${encPath(slug)}`),
  termTitles: (slugs) => Sefaria._ApiPromise(`${Sefaria.apiHost}/_api/linker-editor/non-unique-term-titles?slugs=${encPath(slugs.join(','))}`),
  createTerm: (payload) =>
    Sefaria.apiRequestWithBody('/_api/linker-editor/non-unique-term', {}, payload, 'POST'),
  addTermTitles: (slug, payload) =>
    Sefaria.apiRequestWithBody(`/_api/linker-editor/non-unique-term/${encPath(slug)}`, {}, payload, 'POST'),
  deleteTerm: (slug) =>
    Sefaria.apiRequestWithBody(`/_api/linker-editor/non-unique-term/${encPath(slug)}`, {}, {}, 'DELETE'),
  swapTerm: (slug, payload) =>
    Sefaria.apiRequestWithBody(`/_api/linker-editor/non-unique-term/${encPath(slug)}/swap`, {}, payload, 'POST'),
  addressTypes: () => Sefaria._ApiPromise(`${Sefaria.apiHost}/_api/linker-editor/address-types`),
  addMatchTemplate: (title, path, payload) =>
    Sefaria.apiRequestWithBody(`/_api/linker-editor/index/${encPath(title)}/node/${encPath(path)}/match-templates`, {}, payload, 'POST'),
  replaceMatchTemplate: (title, path, payload) =>
    Sefaria.apiRequestWithBody(`/_api/linker-editor/index/${encPath(title)}/node/${encPath(path)}/match-templates`, {}, payload, 'PUT'),
  deleteMatchTemplate: (title, path, payload) =>
    Sefaria.apiRequestWithBody(`/_api/linker-editor/index/${encPath(title)}/node/${encPath(path)}/match-templates`, {}, payload, 'DELETE'),
  setAddressTypes: (title, path, payload) =>
    Sefaria.apiRequestWithBody(`/_api/linker-editor/index/${encPath(title)}/node/${encPath(path)}/address-type`, {}, payload, 'PUT'),
  setNodeProperties: (title, path, payload) =>
    Sefaria.apiRequestWithBody(`/_api/linker-editor/index/${encPath(title)}/node/${encPath(path)}/properties`, {}, payload, 'PUT'),
  rebuildLinkerResolvers: (langs) => Sefaria.apiRequestWithBody('/admin/reset/linker-resolvers', {}, { langs }, 'POST'),
  rebuildDiburHamatchils: (title) =>
    Sefaria.apiRequestWithBody(`/_api/linker-editor/index/${encPath(title)}/rebuild-dibur-hamatchils`, {}, {}, 'POST'),
};

// True if any node in the raw index (default or alt structure) is a segment-level
// dibur-hamatchil node — i.e. the index has dibur hamatchils worth (re)building.
const indexHasDiburHamatchil = (rawIndex) => {
  if (!rawIndex) { return false; }
  let found = false;
  const walk = (node) => {
    if (!node || found) { return; }
    if (node.isSegmentLevelDiburHamatchil) { found = true; return; }
    (node.nodes || []).forEach(walk);
  };
  walk(rawIndex.schema);
  altStructRoots(rawIndex).forEach(({ nodes }) => nodes.forEach(walk));
  return found;
};

// Editing either of these on any node changes what the dibur-hamatchil extraction
// produces, so the stored dibur_hamatchils go stale until a rebuild is run.
const DIBUR_HAMATCHIL_PROPS = new Set(['isSegmentLevelDiburHamatchil', 'diburHamatchilRegexes']);

// ---------------------------------------------------------------------------
// NonUniqueTerm autocomplete (used by the MatchTemplate editor)
// ---------------------------------------------------------------------------

const TermAutocomplete = ({ onSelect, placeholder, clearOnSelect=false, autoFocus=false }) => {
  let clearInput = null;
  const selectTerm = (term) => {
    if (!term) { return; }
    onSelect(term);
    if (clearOnSelect && clearInput) { clearInput(); }
  };
  const getSuggestions = async (inputValue) => {
    if (!inputValue || inputValue.trim().length < 1) { return []; }
    try {
      const d = await editorApi.searchTerms(inputValue.trim());
      return (d.terms || []).map(t => ({ ...t, name: t.slug }));
    } catch (e) { return []; }
  };
  const renderInput = (highlightedIndex, highlightedSuggestion, getInputProps, setInputValue) => {
    clearInput = () => setInputValue('');
    return (
      <input {...getInputProps()} className="linkerEditorTermInput" placeholder={placeholder || Sefaria._('Search terms…')} autoFocus={autoFocus} />
    );
  };
  const renderItems = (suggestions, highlightedIndex, getItemProps) => (
    suggestions.map((item, index) => (
      <div
        key={item.slug}
        {...getItemProps({ item, index })}
        className={'linkerEditorSuggestion' + (highlightedIndex === index ? ' highlighted' : '')}
      >
        <span className="termSlug">{item.slug}</span>
        <span className="termTitles">{item.primary_en}{item.primary_he ? ` · ${item.primary_he}` : ''}</span>
      </div>
    ))
  );
  return (
    <GeneralAutocomplete
      containerClassString="linkerEditorAutocomplete"
      dropdownMenuClassString="linkerEditorDropdown"
      getSuggestions={getSuggestions}
      renderInput={renderInput}
      renderItems={renderItems}
      onSelectedItemChange={({ selectedItem }) => selectTerm(selectedItem)}
      onEnter={({ event, highlightedSuggestion, suggestions }) => {
        const item = highlightedSuggestion || suggestions[0];
        if (!item) { return false; }
        event.preventDefault();
        selectTerm(item);
        return true;
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// MatchTemplate editor within a node card
// ---------------------------------------------------------------------------

const MatchTemplateRow = ({ template, title, keyPath, termTitles, onTermClick, onChanged }) => {
  const [addingTerm, setAddingTerm] = useState(false);
  const [busy, setBusy] = useState(false);
  const path = pathString(keyPath);

  const scope = template.scope || 'combined';

  const removeTemplate = async () => {
    if (!confirm(Sefaria._('Delete this MatchTemplate?'))) { return; }
    setBusy(true);
    try {
      await editorApi.deleteMatchTemplate(title, path, { term_slugs: template.term_slugs, scope });
      await onChanged();
    } catch (e) { alert(e.message || e); }
    setBusy(false);
  };

  const addTermToTemplate = async (term) => {
    setAddingTerm(false);
    if (template.term_slugs.includes(term.slug)) { return; }
    setBusy(true);
    try {
      await editorApi.replaceMatchTemplate(title, path, {
        old: { term_slugs: template.term_slugs, scope },
        new: { term_slugs: [...template.term_slugs, term.slug], scope },
      });
      await onChanged();
    } catch (e) { alert(e.message || e); }
    setBusy(false);
  };

  return (
    <div className={'matchTemplateRow' + (busy ? ' busy' : '')}>
      <div className="matchTemplateBadges">
        {template.term_slugs.map((slug, i) => (
          <TermBadge key={i} slug={slug} termTitles={termTitles} onClick={() => onTermClick(slug)} />
        ))}
        <span className={'scopeBadge scope-' + scope}>{scope}</span>
      </div>
      <div className="matchTemplateActions">
        {addingTerm
          ? <TermAutocomplete onSelect={addTermToTemplate} placeholder={Sefaria._('Add term…')} />
          : <button className="linkerEditorBtn small" onClick={() => setAddingTerm(true)}>+ {Sefaria._('term')}</button>}
        <button className="linkerEditorBtn small danger" onClick={removeTemplate} title={Sefaria._('Delete')}>×</button>
      </div>
    </div>
  );
};

const AddMatchTemplateForm = ({ title, keyPath, termTitles, onChanged }) => {
  const [open, setOpen] = useState(false);
  const [slugs, setSlugs] = useState([]);
  // Titles for slugs picked here that aren't yet in the index-wide termTitles map.
  const [pickedTitles, setPickedTitles] = useState({});
  const [scope, setScope] = useState('combined');
  const [busy, setBusy] = useState(false);
  const path = pathString(keyPath);

  const reset = () => { setSlugs([]); setPickedTitles({}); setScope('combined'); setOpen(false); };
  const badgeTitles = { ...(termTitles || {}), ...pickedTitles };
  const addSlug = (term) => {
    if (slugs.includes(term.slug)) { return; }
    setSlugs([...slugs, term.slug]);
    setPickedTitles(prev => ({ ...prev, [term.slug]: { primary_en: term.primary_en, primary_he: term.primary_he } }));
  };

  const save = async () => {
    if (!slugs.length) { return; }
    setBusy(true);
    try {
      await editorApi.addMatchTemplate(title, path, { term_slugs: slugs, scope });
      await onChanged();
      reset();
    } catch (e) { alert(e.message || e); }
    setBusy(false);
  };

  if (!open) {
    return <button className="linkerEditorBtn" onClick={() => setOpen(true)}>+ {Sefaria._('Add MatchTemplate')}</button>;
  }
  return (
    <div className="addMatchTemplateForm">
      <div className="addMatchTemplateBadges">
        {slugs.map((slug, i) => (
          <TermBadge key={i} slug={slug} termTitles={badgeTitles}>
            <span className="removeSlug" onClick={() => setSlugs(slugs.filter((_, j) => j !== i))}>×</span>
          </TermBadge>
        ))}
      </div>
      <TermAutocomplete autoFocus={true} clearOnSelect={true} onSelect={addSlug} />
      <label className="scopeSelect">
        {Sefaria._('scope')}:
        <select value={scope} onChange={e => setScope(e.target.value)}>
          {SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <button className="linkerEditorBtn small" disabled={!slugs.length || busy} onClick={save}>{Sefaria._('Save')}</button>
      <button className="linkerEditorBtn small" onClick={reset}>{Sefaria._('Cancel')}</button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// AddressType editor
// ---------------------------------------------------------------------------

const AddressTypeEditor = ({ node, title, keyPath, addressTypeOptions, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const path = pathString(keyPath);
  const addressTypes = node.addressTypes || [];

  const changeAt = async (levelIdx, value) => {
    const next = addressTypes.slice();
    next[levelIdx] = value;
    setBusy(true); setMsg(null);
    try {
      await editorApi.setAddressTypes(title, path, { address_types: next });
      setMsg({ ok: true, text: Sefaria._('Saved') });
      await onChanged();
    } catch (e) { setMsg({ ok: false, text: e.message || String(e) }); }
    setBusy(false);
  };

  if (!addressTypes.length) { return null; }
  return (
    <div className={'addressTypeEditor' + (busy ? ' busy' : '')}>
      <span className="cardLabel">{Sefaria._('AddressTypes')}</span>
      {addressTypes.map((atype, i) => (
        <select key={i} value={atype} disabled={busy} onChange={e => changeAt(i, e.target.value)}>
          {(addressTypeOptions.includes(atype) ? addressTypeOptions : [atype, ...addressTypeOptions]).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ))}
      {busy && <span className="addressTypeMsg">{Sefaria._('Saving…')}</span>}
      {!busy && msg && <span className={'addressTypeMsg' + (msg.ok ? ' ok' : ' err')}>{msg.text}</span>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Node properties editor (referenceable, numeric_equivalent, ...)
// ---------------------------------------------------------------------------

// Order here is the display order. Each property carries a plain-language explanation
// of what it does and a concrete example of when you'd set it.
const NODE_PROPERTIES = [
  {
    key: 'referenceable',
    label: 'referenceable',
    what: "Whether the linker can cite this node directly. On (the default for most nodes): the node is matchable and its children are traversed. Off: the node itself is skipped and only its referenceable descendants are used. Optional: the node is BOTH matchable by name AND transparent, so its children flatten up — a citation can land on the node or descend straight into it.",
    example: "Mark a Zohar sub-section like “Saba DeMishpatim” as Optional so a bare daf citation (זח\"ב צה.) can resolve into it, while the sub-section is still citable by its own name.",
  },
  {
    key: 'numeric_equivalent',
    label: 'numeric_equivalent',
    what: "The integer this named node stands in for, so a numeric citation can match it. Set it on a named (usually alt-structure) node that corresponds to a number.",
    example: "An alt-struct perek node titled “Chapter 2” gets numeric_equivalent = 2, so both “Chapter 2” and a bare “2” resolve to it.",
  },
  {
    key: 'referenceableSections',
    label: 'referenceableSections',
    what: "Per-depth flags marking which section levels of this node can be cited by number. Turn a level off to stop the linker from matching a number at that depth. Defaults to all-on.",
    example: "On a commentary stored as Daf → Line, turn off the “Line” level so citations resolve to the daf but never to a specific line.",
  },
  {
    key: 'isSegmentLevelDiburHamatchil',
    label: 'isSegmentLevelDiburHamatchil',
    what: "When on, the deepest section is matched by its opening words (dibur hamatchil) instead of by a number.",
    example: "A commentary whose comments are quoted by their opening phrase — “Rashi ד\"ה בראשית” — rather than “Rashi 1:3”.",
  },
  {
    key: 'diburHamatchilRegexes',
    label: 'diburHamatchilRegexes',
    what: "Ordered list of regular expressions used to extract the dibur hamatchil (opening phrase) from each segment's text. Used together with isSegmentLevelDiburHamatchil.",
    example: "^(<b>.*?</b>) to grab the bolded lemma at the start of each comment as its citable opening phrase.",
  },
  {
    key: 'skipped_addresses',
    label: 'skipped_addresses',
    what: "Address numbers that don't exist in this map and should be skipped when numbering its entries. Keeps a daf/page map aligned when some pages are missing.",
    example: "A daf-based map where daf 245 doesn't exist — add 245 so the entries after it map to daf 246 and onward correctly.",
  },
  {
    key: 'isMapReferenceable',
    label: 'isMapReferenceable',
    what: "Whether this alt-structure map can be reached by the linker at all (default on). Turn off to keep the mapping for display/navigation while hiding it from citation resolution.",
    example: "A supplementary cross-reference map you want shown in the sidebar but never matched as a citation target.",
  },
];

// Common diburHamatchilRegexes, offered as one-click presets. These mirror
// delimiter_to_regex() in scripts/linker_books/bulk_commentary.py — the saved
// value must match those strings exactly, so mind the string escaping here
// (doubled backslashes so the stored regex is `^(.+?)[\-–]` / `^(.*?)\.`).
const DH_REGEX_PRESETS = [
  { label: 'Bold',   regex: '^<b>(.+?)</b>' },
  { label: 'Dash',   regex: '^(.+?)[\\-–]' },
  { label: 'Period', regex: '^(.*?)\\.' },
];

// Which properties apply to a given (raw) node, mirroring each node class's
// optional_param_keys on the backend. `nodeType` is absent on plain structural nodes.
const nodePropertyApplies = (node, key) => {
  const nodeType = node.nodeType;
  const isJagged = nodeType === 'JaggedArrayNode';
  const isMap = nodeType === 'ArrayMapNode';
  const hasSections = Array.isArray(node.sectionNames) && node.sectionNames.length > 0;
  switch (key) {
    case 'referenceable':
    case 'numeric_equivalent':
      return true;
    case 'referenceableSections':
    case 'isSegmentLevelDiburHamatchil':
    case 'diburHamatchilRegexes':
      return (isJagged || isMap) && hasSections;
    case 'skipped_addresses':
    case 'isMapReferenceable':
      return isMap;
    default:
      return false;
  }
};

const HelpTip = ({ what, example }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="linkerHelpTip">
      <button
        type="button"
        className="linkerHelpTipIcon"
        aria-label={Sefaria._('What is this?')}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >?</button>
      {open && (
        <span className="linkerHelpTipPopover" role="tooltip">
          <span className="linkerHelpTipWhat">{what}</span>
          <span className="linkerHelpTipExample"><em>{Sefaria._('Example')}:</em> {example}</span>
        </span>
      )}
    </span>
  );
};

const PropertyRow = ({ meta, children }) => (
  <div className="nodePropertyRow">
    <div className="nodePropertyLabel">
      <span className="nodePropertyName">{meta.label}</span>
      <HelpTip what={meta.what} example={meta.example} />
    </div>
    <div className="nodePropertyControl">{children}</div>
  </div>
);

// A referenceable value is tri-state (true / false / "optional") plus "unset" (default).
const ReferenceableControl = ({ value, disabled, onChange }) => {
  const options = [
    { v: null, label: Sefaria._('default') },
    { v: true, label: Sefaria._('on') },
    { v: false, label: Sefaria._('off') },
    { v: 'optional', label: Sefaria._('optional') },
  ];
  const current = value === undefined ? null : value;
  return (
    <div className="segmentedControl">
      {options.map(opt => (
        <button
          key={String(opt.v)}
          type="button"
          disabled={disabled}
          className={'segment' + (current === opt.v ? ' active' : '')}
          onClick={() => onChange(opt.v)}
        >{opt.label}</button>
      ))}
    </div>
  );
};

const ToggleControl = ({ name, value, defaultValue, disabled, onChange }) => {
  const on = value === undefined || value === null ? defaultValue : value;
  return (
    <ToggleSwitch
      name={name}
      disabled={disabled}
      isChecked={!!on}
      onChange={() => onChange(!on)}
    />
  );
};

const NumberControl = ({ value, disabled, onSave }) => {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);
  const commit = () => {
    const trimmed = String(draft).trim();
    onSave(trimmed === '' ? null : Number(trimmed));
  };
  return (
    <input
      className="linkerEditorTermInput numberInput"
      type="number"
      value={draft}
      disabled={disabled}
      placeholder={Sefaria._('unset')}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
    />
  );
};

// Per-section on/off toggles, one per address depth, labelled by sectionName.
const ReferenceableSectionsControl = ({ node, value, disabled, onChange }) => {
  const sectionNames = node.sectionNames || [];
  const current = sectionNames.map((_, i) => (Array.isArray(value) ? value[i] !== false : true));
  const setAt = (idx, on) => {
    const next = current.slice();
    next[idx] = on;
    onChange(next);
  };
  return (
    <div className="referenceableSections">
      {sectionNames.map((name, i) => (
        <label key={i} className="referenceableSectionItem">
          <input type="checkbox" disabled={disabled} checked={current[i]} onChange={e => setAt(i, e.target.checked)} />
          <span>{name}</span>
        </label>
      ))}
    </div>
  );
};

// Editable list of free-text rows (used for regexes and, in numeric mode, skipped addresses).
const ListControl = ({ value, disabled, numeric, placeholder, presets, onSave }) => {
  const [rows, setRows] = useState(() => (Array.isArray(value) ? value.map(String) : []));
  useEffect(() => { setRows(Array.isArray(value) ? value.map(String) : []); }, [JSON.stringify(value)]);
  const dirty = JSON.stringify(rows) !== JSON.stringify((value || []).map(String));
  const setAt = (i, v) => setRows(rows.map((r, j) => (j === i ? v : r)));
  const addPreset = (regex) => { if (!rows.includes(regex)) setRows([...rows, regex]); };
  const save = () => {
    const cleaned = rows.map(r => r.trim()).filter(r => r !== '');
    onSave(cleaned.length ? (numeric ? cleaned.map(Number) : cleaned) : null);
  };
  return (
    <div className="linkerListControl">
      {presets && presets.length > 0 && (
        <div className="linkerListPresets">
          <span className="linkerListPresetsLabel">{Sefaria._('Presets')}:</span>
          {presets.map(p => {
            const added = rows.includes(p.regex);
            return (
              <button
                type="button"
                key={p.label}
                className="linkerEditorBtn small preset"
                disabled={disabled || added}
                title={p.regex}
                onClick={() => addPreset(p.regex)}
              >{added ? '✓ ' : '+ '}{Sefaria._(p.label)}</button>
            );
          })}
        </div>
      )}
      {rows.map((row, i) => (
        <div className="linkerListRow" key={i}>
          <input
            className="linkerEditorTermInput"
            type={numeric ? 'number' : 'text'}
            value={row}
            disabled={disabled}
            placeholder={placeholder}
            onChange={e => setAt(i, e.target.value)}
          />
          <button type="button" className="linkerEditorBtn small danger" disabled={disabled} onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div className="linkerListActions">
        <button type="button" className="linkerEditorBtn small" disabled={disabled} onClick={() => setRows([...rows, ''])}>+ {Sefaria._('add')}</button>
        {dirty && <button type="button" className="linkerEditorBtn small" disabled={disabled} onClick={save}>{Sefaria._('Save')}</button>}
      </div>
    </div>
  );
};

const NodePropertiesEditor = ({ node, title, keyPath, onChanged, onDhChanged }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const path = pathString(keyPath);
  const applicable = NODE_PROPERTIES.filter(meta => nodePropertyApplies(node, meta.key));
  if (!applicable.length) { return null; }

  const saveProperty = async (key, value) => {
    setBusy(true); setMsg(null);
    try {
      await editorApi.setNodeProperties(title, path, { properties: { [key]: value } });
      setMsg({ ok: true, text: Sefaria._('Saved') });
      if (DIBUR_HAMATCHIL_PROPS.has(key) && onDhChanged) { onDhChanged(); }
      await onChanged();
    } catch (e) {
      setMsg({ ok: false, text: e.message || String(e) });
    }
    setBusy(false);
  };

  const controlFor = (meta) => {
    const value = node[meta.key];
    switch (meta.key) {
      case 'referenceable':
        return <ReferenceableControl value={value} disabled={busy} onChange={v => saveProperty('referenceable', v)} />;
      case 'numeric_equivalent':
        return <NumberControl value={value} disabled={busy} onSave={v => saveProperty('numeric_equivalent', v)} />;
      case 'referenceableSections':
        return <ReferenceableSectionsControl node={node} value={value} disabled={busy} onChange={v => saveProperty('referenceableSections', v)} />;
      case 'isSegmentLevelDiburHamatchil':
        return <ToggleControl name={`${path}-isSegmentLevelDiburHamatchil`} value={value} defaultValue={false} disabled={busy} onChange={v => saveProperty('isSegmentLevelDiburHamatchil', v)} />;
      case 'diburHamatchilRegexes':
        return <ListControl value={value} disabled={busy} presets={DH_REGEX_PRESETS} placeholder={Sefaria._('regex')} onSave={v => saveProperty('diburHamatchilRegexes', v)} />;
      case 'skipped_addresses':
        return <ListControl value={value} disabled={busy} numeric={true} placeholder={Sefaria._('address #')} onSave={v => saveProperty('skipped_addresses', v)} />;
      case 'isMapReferenceable':
        return <ToggleControl name={`${path}-isMapReferenceable`} value={value} defaultValue={true} disabled={busy} onChange={v => saveProperty('isMapReferenceable', v)} />;
      default:
        return null;
    }
  };

  return (
    <div className="nodePropertiesEditor">
      <button className="nodePropertiesToggle" onClick={() => setOpen(o => !o)}>
        <span className="expandToggle">{open ? '▾' : '▸'}</span>
        {Sefaria._('Properties')}
      </button>
      {open && (
        <div className="nodePropertiesBody">
          {applicable.map(meta => (
            <PropertyRow key={meta.key} meta={meta}>{controlFor(meta)}</PropertyRow>
          ))}
          {msg && <span className={'nodePropertiesMsg' + (msg.ok ? ' ok' : ' err')}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Recursive schema node card
// ---------------------------------------------------------------------------

const SchemaNodeCard = ({
  node,
  keyPath,
  title,
  isRoot,
  forceExpanded=false,
  expandedPaths,
  toggleExpand,
  addressTypeOptions,
  termTitles,
  onTermClick,
  onChanged,
  onDhChanged,
  altStructRootEntries=[],
  collapseBranchBodyWhenCollapsed=false,
  ancestorCrumbs=[],
  jumpToPath,
}) => {
  const path = pathString(keyPath);
  const children = node.nodes || [];
  const hasChildren = children.length > 0;
  const expanded = forceExpanded || expandedPaths.has(path);
  const matchTemplates = node.match_templates || [];
  // A default node is reached by falling through from its parent, never matched by
  // name, so its own MatchTemplates are never consulted by the linker. Don't offer to
  // add them; still show any existing (legacy) ones so they can be deleted.
  const isDefault = !!node.default;
  const childKeyPath = (child, index) => keyPath[0] === '__alt__' ? [...keyPath, String(index)] : [...keyPath, child.key];
  const childAncestorCrumbs = [...ancestorCrumbs, { label: nodePrimaryTitle(node), path }];
  const showBody = forceExpanded || expanded || !hasChildren || !collapseBranchBodyWhenCollapsed;

  return (
    <div id={nodeDomId(path)} className={'schemaNodeCard' + (isRoot ? ' root' : '')}>
      <div className="schemaNodeHeader">
        {hasChildren && !forceExpanded
          ? <span className="expandToggle" onClick={() => toggleExpand(path)}>{expanded ? '▾' : '▸'}</span>
          : <span className="expandToggle placeholder" />}
        <span className="schemaNodeTitle">{nodePrimaryTitle(node)}</span>
        {ancestorCrumbs.length > 0 && (
          <span className="schemaNodePath">
            (
            {ancestorCrumbs.map((crumb, i) => (
              <React.Fragment key={`${crumb.path}-${i}`}>
                {i > 0 && <span className="schemaNodePathSeparator"> / </span>}
                <button className="schemaNodePathCrumb" onClick={() => jumpToPath(crumb.path)}>{crumb.label}</button>
              </React.Fragment>
            ))}
            )
          </span>
        )}
        <span className="schemaNodeKey">{node.key || node.nodeType}</span>
      </div>

      {showBody && <div className="schemaNodeBody">
        {(!isDefault || matchTemplates.length > 0) && (
          <div className="matchTemplatesSection">
            <span className="cardLabel">{Sefaria._('MatchTemplates')}</span>
            {matchTemplates.length === 0 && <span className="emptyNote">{Sefaria._('none')}</span>}
            {matchTemplates.map((mt, i) => (
              <MatchTemplateRow
                key={i}
                template={{ term_slugs: mt.term_slugs || [], scope: mt.scope || 'combined' }}
                title={title}
                keyPath={keyPath}
                termTitles={termTitles}
                onTermClick={onTermClick}
                onChanged={onChanged}
              />
            ))}
            {!isDefault && <AddMatchTemplateForm title={title} keyPath={keyPath} termTitles={termTitles} onChanged={onChanged} />}
          </div>
        )}

        <AddressTypeEditor
          node={node}
          title={title}
          keyPath={keyPath}
          addressTypeOptions={addressTypeOptions}
          onChanged={onChanged}
        />

        <NodePropertiesEditor
          node={node}
          title={title}
          keyPath={keyPath}
          onChanged={onChanged}
          onDhChanged={onDhChanged}
        />
      </div>}

      {expanded && hasChildren && (
        <div className="schemaNodeChildren">
          {children.map((child, i) => (
            <SchemaNodeCard
              key={child.key || i}
              node={child}
              keyPath={childKeyPath(child, i)}
              title={title}
              isRoot={false}
              forceExpanded={false}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              addressTypeOptions={addressTypeOptions}
              termTitles={termTitles}
              onTermClick={onTermClick}
              onChanged={onChanged}
              onDhChanged={onDhChanged}
              collapseBranchBodyWhenCollapsed={collapseBranchBodyWhenCollapsed}
              ancestorCrumbs={childAncestorCrumbs}
              jumpToPath={jumpToPath}
            />
          ))}
        </div>
      )}

      {isRoot && altStructRootEntries.length > 0 && (
        <div className="schemaNodeChildren altStructChildren">
          <div className="altStructHeading">{Sefaria._('Alt Structs')}</div>
          {altStructRootEntries.map(({ structName, nodes }) => (
            <AltStructGroup
              key={structName}
              structName={structName}
              nodes={nodes}
              title={title}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              addressTypeOptions={addressTypeOptions}
              termTitles={termTitles}
              onTermClick={onTermClick}
              onChanged={onChanged}
              onDhChanged={onDhChanged}
              jumpToPath={jumpToPath}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const AltStructGroup = ({ structName, nodes, title, expandedPaths, toggleExpand, addressTypeOptions, termTitles, onTermClick, onChanged, onDhChanged, jumpToPath }) => {
  const path = pathString(['__alt__', structName]);
  const expanded = expandedPaths.has(path);

  return (
    <div id={nodeDomId(path)} className="schemaNodeCard altStructGroup">
      <div className="schemaNodeHeader">
        <span className="expandToggle" onClick={() => toggleExpand(path)}>{expanded ? '▾' : '▸'}</span>
        <span className="schemaNodeTitle">{structName}</span>
        <span className="schemaNodeStructName">{Sefaria._('Alt Struct')}</span>
      </div>

      {expanded && (
        <div className="schemaNodeChildren">
          {nodes.map((altNode, rootIndex) => (
            <SchemaNodeCard
              key={`${structName}-${rootIndex}`}
              node={altNode}
              keyPath={['__alt__', structName, String(rootIndex)]}
              title={title}
              isRoot={false}
              forceExpanded={false}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              addressTypeOptions={addressTypeOptions}
              termTitles={termTitles}
              onTermClick={onTermClick}
              onChanged={onChanged}
              onDhChanged={onDhChanged}
              collapseBranchBodyWhenCollapsed={true}
              ancestorCrumbs={[
                { label: structName, path },
              ]}
              jumpToPath={jumpToPath}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// NonUniqueTerm detail panel (bottom slide-up)
// ---------------------------------------------------------------------------

const TermDetailPanel = ({ slug, createMode, refreshToken, onClose, onCreated, onJump, onChanged }) => {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [savingTitles, setSavingTitles] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapTarget, setSwapTarget] = useState(null);
  const [swapping, setSwapping] = useState(false);
  // Create-mode state: primary English / Hebrew titles for a brand-new term.
  const [newEn, setNewEn] = useState('');
  const [newHe, setNewHe] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (createMode) { return; }
    setDetail(null); setError(null);
    editorApi.termDetail(slug).then(setDetail, e => setError(e.message || String(e)));
  }, [slug, createMode, refreshToken]);

  const handlePanelKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  };

  const createTerm = async () => {
    const titles = [];
    if (newEn.trim()) { titles.push({ lang: 'en', text: newEn.trim() }); }
    if (newHe.trim()) { titles.push({ lang: 'he', text: newHe.trim() }); }
    if (!titles.length) { return; }
    setCreating(true); setError(null);
    try {
      const created = await editorApi.createTerm({ titles });
      onCreated(created.slug);
    } catch (e) {
      setError(e.message || String(e));
    }
    setCreating(false);
  };

  const addTitles = async () => {
    const text = newTitle.trim();
    if (!text) { return; }
    setSavingTitles(true); setError(null);
    try {
      const nextDetail = await editorApi.addTermTitles(slug, { titles: [{ lang: detectTitleLang(text), text }] });
      setDetail(nextDetail);
      setNewTitle('');
    } catch (e) {
      setError(e.message || String(e));
    }
    setSavingTitles(false);
  };

  const deleteTerm = async () => {
    const usageCount = (detail?.usages || []).length;
    if (usageCount > 0) {
      alert(Sefaria._('This term is still used by MatchTemplates. Delete the other usages first or use Swap to replace them with another term.'));
      return;
    }
    if (!confirm(Sefaria._('Permanently delete this NonUniqueTerm? This action cannot be undone.'))) { return; }
    setDeleting(true); setError(null);
    try {
      await editorApi.deleteTerm(slug);
      onClose();
    } catch (e) {
      setError(e.message || String(e));
    }
    setDeleting(false);
  };

  const saveSwap = async () => {
    if (!swapTarget || swapTarget.slug === slug) { return; }
    setSwapping(true); setError(null);
    try {
      const result = await editorApi.swapTerm(slug, { new_slug: swapTarget.slug });
      setDetail(result.old_term);
      setSwapOpen(false);
      setSwapTarget(null);
      if (onChanged) { await onChanged(); }
    } catch (e) {
      setError(e.message || String(e));
    }
    setSwapping(false);
  };

  if (createMode) {
    return (
      <div className="termDetailPanel" onKeyDown={handlePanelKeyDown}>
        <div className="termDetailHeader">
          <span className="termDetailSlug">{Sefaria._('New term')}</span>
          <button className="linkerEditorBtn small" onClick={onClose}>{Sefaria._('Close')}</button>
        </div>
        {error && <div className="termDetailError">{error}</div>}
        <div className="termDetailBody">
          <div className="termCreateForm">
            <span className="cardLabel">{Sefaria._('Primary titles')} <span className="termCreateHint">({Sefaria._('at least one required')})</span></span>
            <input
              className="linkerEditorTermInput"
              value={newEn}
              onChange={e => setNewEn(e.target.value)}
              placeholder={Sefaria._('Primary English title')}
              autoFocus
            />
            <input
              className="linkerEditorTermInput"
              value={newHe}
              onChange={e => setNewHe(e.target.value)}
              placeholder={Sefaria._('Primary Hebrew title')}
              dir="rtl"
            />
            <button
              className="linkerEditorBtn small"
              disabled={creating || (!newEn.trim() && !newHe.trim())}
              onClick={createTerm}
            >
              {creating ? Sefaria._('Saving…') : Sefaria._('Save')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="termDetailPanel" onKeyDown={handlePanelKeyDown}>
      <div className="termDetailHeader">
        <span className="termDetailSlug">{slug}</span>
        <button className="linkerEditorBtn small" onClick={onClose}>{Sefaria._('Close')}</button>
      </div>
      {error && <div className="termDetailError">{error}</div>}
      {!detail && !error && <LoadingMessage />}
      {detail && (
        <div className="termDetailBody">
          <div className="termDetailActions">
            <button
              className="linkerEditorBtn small danger termDeleteBtn"
              disabled={deleting}
              onClick={deleteTerm}
            >
              {deleting ? Sefaria._('Deleting…') : Sefaria._('Delete NonUniqueTerm')}
            </button>
            <button
              className="linkerEditorBtn small"
              disabled={swapping}
              onClick={() => setSwapOpen(!swapOpen)}
            >
              {Sefaria._('Swap')}
            </button>
            {swapOpen && (
              <div className="termSwapForm">
                <TermAutocomplete
                  onSelect={setSwapTarget}
                  placeholder={Sefaria._('Swap to term…')}
                  autoFocus={true}
                />
                {swapTarget && <span className="termSwapTarget">{swapTarget.slug}</span>}
                <button
                  className="linkerEditorBtn small"
                  disabled={swapping || !swapTarget || swapTarget.slug === slug}
                  onClick={saveSwap}
                >
                  {swapping ? Sefaria._('Saving…') : Sefaria._('Save')}
                </button>
              </div>
            )}
          </div>
          <div className="termTitlesList">
            <span className="cardLabel">{Sefaria._('Titles')}</span>
            {(detail.titles || []).map((t, i) => (
              <span key={i} className="termTitleItem"><em>{t.lang}</em> {t.text}{t.primary ? ' ★' : ''}</span>
            ))}
          </div>
          <div className="termAddTitlesForm">
            <span className="cardLabel">{Sefaria._('Add alt titles')}</span>
            <input
              className="linkerEditorTermInput"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !savingTitles && newTitle.trim()) { addTitles(); } }}
              placeholder={Sefaria._('Alternate title')}
            />
            <button
              className="linkerEditorBtn small"
              disabled={savingTitles || !newTitle.trim()}
              onClick={addTitles}
            >
              {savingTitles ? Sefaria._('Saving…') : Sefaria._('Save')}
            </button>
          </div>
          <div className="termUsagesList">
            <span className="cardLabel">{Sefaria._('Used by')} ({(detail.usages || []).length})</span>
            {(detail.usages || []).map((u, i) => (
              <div key={i} className="termUsageItem">
                <span className="usageNodeTitle">{u.index_title}{u.node_title && u.node_title !== u.index_title ? ` › ${u.node_title}` : ''}</span>
                <span className="usageTemplate">[{(u.term_slugs || []).join(', ')}] · {u.scope}</span>
                {u.index_title && (!u.struct_name || (u.node_key_path || [])[0] === '__alt__') && (
                  <button className="linkerEditorBtn small" onClick={() => onJump(u.index_title, u.node_key_path)}>{Sefaria._('Jump')}</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Index search landing
// ---------------------------------------------------------------------------

const IndexSearch = ({ onSelect }) => {
  const getSuggestions = async (inputValue) => {
    if (!inputValue || inputValue.trim().length < 2) { return []; }
    try {
      const d = await Sefaria.getName(inputValue.trim(), 10, ['ref']);
      return (d.completion_objects || []).map(co => ({ name: co.title, key: co.key || co.title }));
    } catch (e) { return []; }
  };
  const select = async (item) => {
    // Resolve whatever was picked to its Index title.
    try {
      const d = await Sefaria.getName(item.name);
      onSelect(d.index || d.book || item.name);
    } catch (e) {
      onSelect(item.name);
    }
  };
  const renderInput = (highlightedIndex, highlightedSuggestion, getInputProps) => (
    <input {...getInputProps()} className="linkerEditorSearchInput" placeholder={Sefaria._('Search for a text…')} autoFocus />
  );
  const renderItems = (suggestions, highlightedIndex, getItemProps) => (
    suggestions.map((item, index) => (
      <div
        key={item.key + index}
        {...getItemProps({ item, index })}
        className={'linkerEditorSuggestion' + (highlightedIndex === index ? ' highlighted' : '')}
      >
        {item.name}
      </div>
    ))
  );
  return (
    <div className="linkerEditorSearchWrap">
      <GeneralAutocomplete
        containerClassString="linkerEditorAutocomplete large"
        dropdownMenuClassString="linkerEditorDropdown"
        getSuggestions={getSuggestions}
        renderInput={renderInput}
        renderItems={renderItems}
        onSelectedItemChange={({ selectedItem }) => { if (selectedItem) { select(selectedItem); } }}
        onEnter={({ event, highlightedSuggestion, suggestions }) => {
          const item = highlightedSuggestion || suggestions[0];
          if (!item) { return false; }
          event.preventDefault();
          select(item);
          return true;
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const LinkerEditorPage = () => {
  const [title, setTitle] = useState(null);
  const [rawIndex, setRawIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [addressTypeOptions, setAddressTypeOptions] = useState([]);
  const [termSlug, setTermSlug] = useState(null);
  const [addingTerm, setAddingTerm] = useState(false);
  const [searchingTerm, setSearchingTerm] = useState(false);
  const [termTitles, setTermTitles] = useState({});
  const [refreshToken, setRefreshToken] = useState(0);
  const [rebuildingResolver, setRebuildingResolver] = useState(null);
  // Dibur-hamatchil rebuild state: dirty = a DH-relevant edit was made since the last
  // rebuild, so the stored dibur_hamatchils are stale until "Rebuild Dibur Hamatchils".
  const [dhDirty, setDhDirty] = useState(false);
  const [dhRebuilding, setDhRebuilding] = useState(false);
  const [dhMsg, setDhMsg] = useState(null);

  const markDhDirty = useCallback(() => { setDhDirty(true); setDhMsg(null); }, []);

  const openTerm = useCallback((slug) => { setAddingTerm(false); setSearchingTerm(false); setTermSlug(slug); }, []);
  const closeTermDrawer = useCallback(() => { setTermSlug(null); setAddingTerm(false); }, []);
  const openSearchedTerm = useCallback((term) => { openTerm(term.slug); }, [openTerm]);

  useEffect(() => {
    editorApi.addressTypes().then(d => setAddressTypeOptions(d.address_types || []));
  }, []);

  const loadTermTitles = useCallback((rawIndexData) => {
    const slugs = collectTermSlugs(rawIndexData);
    if (!slugs.length) { setTermTitles({}); return; }
    editorApi.termTitles(slugs).then(d => setTermTitles(d.titles || {}), () => {});
  }, []);

  const loadIndex = useCallback((indexTitle) => {
    setLoading(true); setError(null); setRawIndex(null); setTitle(indexTitle);
    setDhDirty(false); setDhMsg(null);
    editorApi.loadRawIndex(indexTitle)
      .then(d => {
        if (d.error) { setError(d.error); }
        else {
          setRawIndex(d);
          setExpandedPaths(new Set(d.schema?.key ? [d.schema.key] : []));
          loadTermTitles(d);
        }
        setLoading(false);
      }, e => { setError(e.message || String(e)); setLoading(false); })
  }, [loadTermTitles]);

  const reload = useCallback(async () => {
    if (!title) { return; }
    const d = await editorApi.loadRawIndex(title);
    setRawIndex(d);
    loadTermTitles(d);
    setRefreshToken(t => t + 1);
  }, [title, loadTermTitles]);

  const toggleExpand = useCallback((path) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); } else { next.add(path); }
      return next;
    });
  }, []);

  const jumpToPath = useCallback((path) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      const parts = path.split('.');
      for (let i = 1; i <= parts.length; i++) { next.add(parts.slice(0, i).join('.')); }
      return next;
    });
    setTimeout(() => {
      document.getElementById(nodeDomId(path))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, []);

  const jumpToNode = useCallback((indexTitle, nodeKeyPath) => {
    if (indexTitle !== title) {
      loadIndex(indexTitle);
    }
    const path = pathString(nodeKeyPath);
    // Expand every ancestor path so the target node is visible.
    setExpandedPaths(prev => {
      const next = new Set(prev);
      for (let i = 1; i <= nodeKeyPath.length; i++) { next.add(nodeKeyPath.slice(0, i).join('.')); }
      return next;
    });
    setTimeout(() => {
      document.getElementById(nodeDomId(path))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [title, loadIndex]);

  const rebuildLinkerResolvers = async (langs, label) => {
    setRebuildingResolver(label);
    try {
      const { task_id } = await editorApi.rebuildLinkerResolvers(langs);
      await Sefaria.pollTask(task_id, { interval: 2000 });
      alert(Sefaria._('RefResolver rebuilt.'));
    } catch (e) { alert(e.message || String(e)); }
    setRebuildingResolver(null);
  };

  const rebuildDiburHamatchils = async () => {
    if (!title) { return; }
    setDhRebuilding(true); setDhMsg(null);
    try {
      const { task_id } = await editorApi.rebuildDiburHamatchils(title);
      const result = await Sefaria.pollTask(task_id, { interval: 2000 });
      const count = result && typeof result.count === 'number' ? result.count : null;
      setDhDirty(false);
      setDhMsg({ ok: true, text: Sefaria._('Dibur hamatchils rebuilt') + (count === null ? '' : ` (${count})`) });
    } catch (e) {
      setDhMsg({ ok: false, text: e.message || String(e) });
    }
    setDhRebuilding(false);
  };

  // Confirm before leaving an index (new search) with unbuilt DH changes. Returns
  // true if it's safe to proceed.
  const confirmLeaveIfDhDirty = () => {
    if (!dhDirty) { return true; }
    return confirm(Sefaria._('You changed Dibur Hamatchil settings for this index but haven’t rebuilt them yet. Leave without rebuilding?'));
  };

  const leaveIndex = () => {
    if (!confirmLeaveIfDhDirty()) { return; }
    setTitle(null); setRawIndex(null); setDhDirty(false); setDhMsg(null);
  };

  // Warn on tab close / navigation away while DH changes are unbuilt (browser shows
  // its own generic prompt; the text can't be customized).
  useEffect(() => {
    if (!dhDirty) { return undefined; }
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dhDirty]);

  const schema = rawIndex && rawIndex.schema;
  const altStructRootEntries = rawIndex ? altStructRoots(rawIndex) : [];
  const showDhRebuild = indexHasDiburHamatchil(rawIndex) || dhDirty;

  // Escape shouldn't bubble up to ReaderPanel and close the whole editor (which navigates
  // home if it's the only panel open). TermDetailPanel handles its own Escape and stops
  // propagation before it reaches here; this catches Escape everywhere else in the editor.
  const swallowEscape = (e) => { if (e.key === 'Escape') { e.stopPropagation(); } };

  return (
    <div className="readerNavMenu linkerEditorNavMenu sans-serif" onKeyDown={swallowEscape}>
      <div className="content linkerEditorContent">
        <div className="linkerEditorPage">
          <div className="linkerEditorTopBar">
            <h1><InterfaceText>Linker Editor</InterfaceText></h1>
            <div className="linkerEditorTopActions">
              {title && <button className="linkerEditorBtn" onClick={leaveIndex}>{Sefaria._('New search')}</button>}
              <button className="linkerEditorBtn" onClick={() => { setTermSlug(null); setAddingTerm(true); }}>{Sefaria._('Add New Term')}</button>
              <button className="linkerEditorBtn" onClick={() => setSearchingTerm(!searchingTerm)}>{Sefaria._('Search Term')}</button>
              {searchingTerm && (
                <div className="linkerEditorHeaderTermSearch">
                  <TermAutocomplete
                    onSelect={openSearchedTerm}
                    placeholder={Sefaria._('Search terms…')}
                    autoFocus={true}
                  />
                </div>
              )}
              <div className="linkerEditorRebuildResolverControl">
                <span className="linkerEditorRebuildResolverLabel">{Sefaria._('Rebuild RefResolver')}</span>
                <button
                  className="linkerEditorBtn small primary"
                  disabled={!!rebuildingResolver}
                  onClick={() => rebuildLinkerResolvers(['he'], 'he')}
                >
                  {rebuildingResolver === 'he' ? Sefaria._('Rebuilding…') : Sefaria._('He')}
                </button>
                <button
                  className="linkerEditorBtn small primary"
                  disabled={!!rebuildingResolver}
                  onClick={() => rebuildLinkerResolvers(['en'], 'en')}
                >
                  {rebuildingResolver === 'en' ? Sefaria._('Rebuilding…') : Sefaria._('En')}
                </button>
                <button
                  className="linkerEditorBtn small primary"
                  disabled={!!rebuildingResolver}
                  onClick={() => rebuildLinkerResolvers(['he', 'en'], 'both')}
                >
                  {rebuildingResolver === 'both' ? Sefaria._('Rebuilding…') : Sefaria._('Both')}
                </button>
              </div>
            </div>
          </div>

          {!title && <IndexSearch onSelect={loadIndex} />}

          {title && (
            <div className="linkerEditorTreeWrap">
              <div className="linkerEditorIndexTitleRow">
                <h2 className="linkerEditorIndexTitle">{title}</h2>
                {showDhRebuild && (
                  <span className="linkerDhRebuildControl">
                    <button
                      className={'linkerEditorBtn small' + (dhDirty ? ' dhDirty' : '')}
                      disabled={dhRebuilding}
                      onClick={rebuildDiburHamatchils}
                    >
                      {dhRebuilding ? Sefaria._('Rebuilding…') : Sefaria._('Rebuild Dibur Hamatchils')}
                    </button>
                    <HelpTip
                      what={Sefaria._('Re-extracts each segment’s dibur hamatchil (opening phrase) from its text using this index’s diburHamatchilRegexes, and replaces the stored dibur hamatchils the linker matches against. Run this after changing isSegmentLevelDiburHamatchil or diburHamatchilRegexes on any node, otherwise the linker keeps matching the old phrases. Runs in the background.')}
                      example={Sefaria._('You add a Bold regex to a Rashi commentary so comments are cited by their bolded lemma — rebuild to (re)generate those dibur hamatchils.')}
                    />
                  </span>
                )}
                {dhMsg && <span className={'linkerDhMsg' + (dhMsg.ok ? ' ok' : ' err')}>{dhMsg.text}</span>}
              </div>
              {loading && <LoadingMessage />}
              {error && <div className="linkerEditorError">{error}</div>}
              {schema && (
                <SchemaNodeCard
                  node={schema}
                  keyPath={[schema.key]}
                  title={title}
                  isRoot={true}
                  forceExpanded={false}
                  expandedPaths={expandedPaths}
                  toggleExpand={toggleExpand}
                  addressTypeOptions={addressTypeOptions}
                  termTitles={termTitles}
                  onTermClick={openTerm}
                  onChanged={reload}
                  onDhChanged={markDhDirty}
                  altStructRootEntries={altStructRootEntries}
                  collapseBranchBodyWhenCollapsed={true}
                  jumpToPath={jumpToPath}
                />
              )}
            </div>
          )}

          {(termSlug || addingTerm) && (
            <TermDetailPanel
              slug={termSlug}
              createMode={addingTerm}
              refreshToken={refreshToken}
              onClose={closeTermDrawer}
              onCreated={openTerm}
              onJump={jumpToNode}
              onChanged={reload}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default LinkerEditorPage;
