import React, { useState, useEffect, useCallback } from 'react';
import Sefaria from './sefaria/sefaria';
import { GeneralAutocomplete } from './GeneralAutocomplete';
import { InterfaceText, LoadingMessage } from './Misc';

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

const detectTitleLang = (text) => {
  let heCount = 0;
  let otherCount = 0;
  const punctuationRE = /[\s.,'"?!;:\-=@#$%^&*()[\]{}\/<>\\|_+`~׳״]/;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x05D0 && code <= 0x05EA) {
      heCount++;
    } else if ((code >= 0x0591 && code <= 0x05C7) || punctuationRE.test(text[i])) {
      continue;
    } else {
      otherCount++;
    }
  }
  return heCount > otherCount ? 'he' : 'en';
};

const editorApi = {
  loadRawIndex: (title) => Sefaria._ApiPromise(`${Sefaria.apiHost}/api/v2/raw/index/${encPath(title)}`),
  searchTerms: (q) => Sefaria._ApiPromise(`${Sefaria.apiHost}/api/linker/non-unique-terms?q=${encPath(q)}`),
  termDetail: (slug) => Sefaria._ApiPromise(`${Sefaria.apiHost}/_api/linker-editor/non-unique-term/${encPath(slug)}`),
  termTitles: (slugs) => Sefaria._ApiPromise(`${Sefaria.apiHost}/_api/linker-editor/non-unique-term-titles?slugs=${encPath(slugs.join(','))}`),
  createTerm: (payload) =>
    Sefaria.apiRequestWithBody('/_api/linker-editor/non-unique-term', {}, payload, 'POST'),
  addTermTitles: (slug, payload) =>
    Sefaria.apiRequestWithBody(`/_api/linker-editor/non-unique-term/${encPath(slug)}`, {}, payload, 'POST'),
  addressTypes: () => Sefaria._ApiPromise(`${Sefaria.apiHost}/_api/linker-editor/address-types`),
  addMatchTemplate: (title, path, payload) =>
    Sefaria.apiRequestWithBody(`/_api/linker-editor/index/${encPath(title)}/node/${encPath(path)}/match-templates`, {}, payload, 'POST'),
  deleteMatchTemplate: (title, path, payload) =>
    Sefaria.apiRequestWithBody(`/_api/linker-editor/index/${encPath(title)}/node/${encPath(path)}/match-templates`, {}, payload, 'DELETE'),
  setAddressTypes: (title, path, payload) =>
    Sefaria.apiRequestWithBody(`/_api/linker-editor/index/${encPath(title)}/node/${encPath(path)}/address-type`, {}, payload, 'PUT'),
  rebuildLinker: () => Sefaria.apiRequestWithBody('/admin/reset/linker', {}, {}, 'POST'),
};

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
      // The API supports create/delete only; "add a term" = replace with an extended template.
      await editorApi.deleteMatchTemplate(title, path, { term_slugs: template.term_slugs, scope });
      await editorApi.addMatchTemplate(title, path, { term_slugs: [...template.term_slugs, term.slug], scope });
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
    <div className="addressTypeEditor">
      <span className="cardLabel">{Sefaria._('AddressTypes')}</span>
      {addressTypes.map((atype, i) => (
        <select key={i} value={atype} disabled={busy} onChange={e => changeAt(i, e.target.value)}>
          {(addressTypeOptions.includes(atype) ? addressTypeOptions : [atype, ...addressTypeOptions]).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ))}
      {msg && <span className={'addressTypeMsg' + (msg.ok ? ' ok' : ' err')}>{msg.text}</span>}
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
          <AddMatchTemplateForm title={title} keyPath={keyPath} termTitles={termTitles} onChanged={onChanged} />
        </div>

        <AddressTypeEditor
          node={node}
          title={title}
          keyPath={keyPath}
          addressTypeOptions={addressTypeOptions}
          onChanged={onChanged}
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
              jumpToPath={jumpToPath}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const AltStructGroup = ({ structName, nodes, title, expandedPaths, toggleExpand, addressTypeOptions, termTitles, onTermClick, onChanged, jumpToPath }) => {
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

const TermDetailPanel = ({ slug, createMode, refreshToken, onClose, onCreated, onJump }) => {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [savingTitles, setSavingTitles] = useState(false);
  // Create-mode state: primary English / Hebrew titles for a brand-new term.
  const [newEn, setNewEn] = useState('');
  const [newHe, setNewHe] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (createMode) { return; }
    setDetail(null); setError(null);
    editorApi.termDetail(slug).then(setDetail, e => setError(e.message || String(e)));
  }, [slug, createMode, refreshToken]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  if (createMode) {
    return (
      <div className="termDetailPanel">
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
    <div className="termDetailPanel">
      <div className="termDetailHeader">
        <span className="termDetailSlug">{slug}</span>
        <button className="linkerEditorBtn small" onClick={onClose}>{Sefaria._('Close')}</button>
      </div>
      {error && <div className="termDetailError">{error}</div>}
      {!detail && !error && <LoadingMessage />}
      {detail && (
        <div className="termDetailBody">
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
  const [termTitles, setTermTitles] = useState({});
  const [refreshToken, setRefreshToken] = useState(0);
  const [rebuilding, setRebuilding] = useState(false);

  const openTerm = useCallback((slug) => { setAddingTerm(false); setTermSlug(slug); }, []);
  const closeTermDrawer = useCallback(() => { setTermSlug(null); setAddingTerm(false); }, []);

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

  const rebuildLinker = async () => {
    setRebuilding(true);
    try {
      await editorApi.rebuildLinker();
      alert(Sefaria._('Linker rebuilt.'));
    } catch (e) { alert(e.message || String(e)); }
    setRebuilding(false);
  };

  const schema = rawIndex && rawIndex.schema;
  const altStructRootEntries = rawIndex ? altStructRoots(rawIndex) : [];

  return (
    <div className="readerNavMenu linkerEditorNavMenu sans-serif">
      <div className="content linkerEditorContent">
        <div className="linkerEditorPage">
          <div className="linkerEditorTopBar">
            <h1><InterfaceText>Linker Editor</InterfaceText></h1>
            <div className="linkerEditorTopActions">
              {title && <button className="linkerEditorBtn" onClick={() => { setTitle(null); setRawIndex(null); }}>{Sefaria._('New search')}</button>}
              <button className="linkerEditorBtn" onClick={() => { setTermSlug(null); setAddingTerm(true); }}>{Sefaria._('Add New Term')}</button>
              <button className="linkerEditorBtn primary" disabled={rebuilding} onClick={rebuildLinker}>
                {rebuilding ? Sefaria._('Rebuilding…') : Sefaria._('Rebuild linker')}
              </button>
            </div>
          </div>

          {!title && <IndexSearch onSelect={loadIndex} />}

          {title && (
            <div className="linkerEditorTreeWrap">
              <h2 className="linkerEditorIndexTitle">{title}</h2>
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
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default LinkerEditorPage;
