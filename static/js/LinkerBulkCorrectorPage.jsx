import React, {useCallback, useEffect, useMemo, useState} from 'react';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';
import { GeneralAutocomplete } from './GeneralAutocomplete';

const STORAGE_KEY = 'linkerBulkCorrectorState';
const HISTORY_KEY = 'linkerBulkCorrectorHistory';
const STATUS_OPTIONS = ['unparsed', 'ambiguous', 'parsed'];
const LINKER_PART_COLORS = {
  NAMED: "#dbeafe",
  NUMBERED: "#dcfce7",
  DH: "#fef3c7",
  RANGE: "#fce7f3",
  RANGE_SYMBOL: "#ede9fe",
  IBID: "#e0f2fe",
  RELATIVE: "#ffedd5",
  NON_CTS: "#f3f4f6",
};
const CONTEXT_PART_CLASSES = ["ContextPart", "TermContext", "SectionContext"];
const CONTEXT_TYPE_LABELS = {
  CURRENT_BOOK: "curr. book",
  IBID: "ibid",
};

const defaultDataset = {
  type: 'book',
  bookTitle: '',
  versionTitle: null,
  lang: null,
  status: ['unparsed'],
};

const apiPost = (path, payload) => Sefaria.apiRequestWithBody(path, {}, payload, 'POST');

const loadStored = (key, fallback) => {
  if (typeof localStorage === 'undefined') {
    return fallback;
  }
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};

const resultKey = (item) => item ? `${item.ref}|${item.versionTitle}|${item.language}|${item.charRange?.join('-')}` : '';

const SmallMeta = ({item}) => (
  <div className="lbcMeta">{item.versionTitle} ({item.language})</div>
);

const StatusToggle = ({status, selected, onClick}) => (
  <button
    type="button"
    className={classNames('lbcSegmentButton', {active: selected})}
    onClick={onClick}>
    {status}
  </button>
);

const IndexTitleAutocomplete = ({value, onChange}) => {
  const getSuggestions = async (inputValue) => {
    if (!inputValue || inputValue.trim().length < 2) { return []; }
    try {
      const d = await Sefaria.getName(inputValue.trim(), 10, ['ref']);
      return (d.completion_objects || []).map(co => ({name: co.title, key: co.key || co.title}));
    } catch (e) {
      return [];
    }
  };
  const select = async (item) => {
    try {
      const d = await Sefaria.getName(item.name);
      onChange((d.index || d.book || item.name || '').trim());
    } catch (e) {
      onChange((item.name || '').trim());
    }
  };
  const renderInput = (highlightedIndex, highlightedSuggestion, getInputProps, setInputValue, suggestions) => {
    const inputProps = getInputProps({
      className: 'lbcSearchInput',
      placeholder: 'Book title',
      defaultValue: value || '',
      onKeyDown: (event) => {
        if (event.key !== 'Enter') { return; }
        const item = highlightedSuggestion || suggestions[0];
        if (!item) { return; }
        event.preventDefault();
        setInputValue(item.name);
        select(item);
      },
    });
    const originalOnChange = inputProps.onChange;
    return (
      <input
        {...inputProps}
        onChange={(event) => {
          if (originalOnChange) { originalOnChange(event); }
          onChange(event.target.value);
        }}
      />
    );
  };
  const renderItems = (suggestions, highlightedIndex, getItemProps) => (
    suggestions.map((item, index) => (
      <div
        key={item.key + index}
        {...getItemProps({item, index})}
        className={classNames('lbcSuggestion', {highlighted: highlightedIndex === index})}>
        {item.name}
      </div>
    ))
  );
  return (
    <GeneralAutocomplete
      containerClassString="lbcAutocomplete"
      dropdownMenuClassString="lbcDropdown"
      getSuggestions={getSuggestions}
      renderInput={renderInput}
      renderItems={renderItems}
      onSelectedItemChange={({selectedItem}) => { if (selectedItem) { select(selectedItem); } }}
    />
  );
};

const matchedPartCount = (parsing) => (parsing.pairings || []).reduce((n, pairing) => n + (pairing.parts?.length || 0), 0);

const LinkerPartChip = ({part, contextType}) => {
  const contextLabel = contextType && CONTEXT_PART_CLASSES.includes(part.class)
    ? (CONTEXT_TYPE_LABELS[contextType] || contextType)
    : null;
  return (
    <span className="linkerAdminPartChip" style={{backgroundColor: LINKER_PART_COLORS[part.type] || "#f3f4f6"}}>
      <span className="linkerAdminPartText">{part.text}</span>
      <span className="linkerAdminPartType">{part.type}</span>
      {contextLabel ? <span className="linkerAdminPartContext">from {contextLabel}</span> : null}
    </span>
  );
};

const LinkerPairings = ({pairings, contextType}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="linkerAdminPairings">
      <button className="linkerAdminDisclosure" onClick={() => setOpen(!open)} aria-expanded={open}>
        <img
          src="/static/icons/chevron-down.svg"
          className={classNames("linkerAdminDisclosureChevron", {open})}
          alt=""
          aria-hidden={true}
        />
        Ref Part / Node Pairings
      </button>
      {open ? (pairings || []).map((pairing, i) => {
        const pairingRef = pairing.ref || pairing.node?.ref;
        return (
          <div className="linkerAdminPairing" key={i}>
            <div>{(pairing.parts || []).map((part, j) => <LinkerPartChip key={j} part={part} contextType={contextType} />)}</div>
            <div className="linkerAdminNode">
              {pairingRef
                ? <a className="linkerAdminRefValue" href={`/${Sefaria.normRef(pairingRef)}`} target="_blank">{pairingRef}</a>
                : (pairing.node?.key || "No node")}
            </div>
          </div>
        );
      }) : null}
    </div>
  );
};

const ResultDetails = ({item, onReparse, reparsing}) => {
  if (!item) {
    return <div className="lbcEmpty">Search for a book to load citations.</div>;
  }
  return (
    <div className="lbcResult">
      <div className="lbcResultHeader">
        <div>
          <h2>{item.ref}</h2>
          <SmallMeta item={item} />
        </div>
        <div className={`lbcStatus ${item.status}`}>{item.status}</div>
        <button type="button" className="button small" onClick={onReparse} disabled={reparsing}>
          {reparsing ? 'Re-parsing' : 'Re-parse'}
        </button>
      </div>
      <div className="lbcSnippet" dangerouslySetInnerHTML={{__html: item.snippet?.html || ''}} />
      <div className="lbcColumns">
        <section>
          <h3>Ref Parts</h3>
          <div className="linkerAdminParts">
            {(item.refParts || []).map((part, i) => <LinkerPartChip key={i} part={part} />)}
          </div>
        </section>
        <section>
          <h3>Options Considered</h3>
          <div className="linkerAdminParsingList">
            {(item.parsings || [])
              .map((parsing, i) => ({parsing, i}))
              .sort((a, b) => (a.parsing.valid === b.parsing.valid)
                ? (matchedPartCount(b.parsing) - matchedPartCount(a.parsing))
                : (a.parsing.valid ? -1 : 1))
              .map(({parsing, i}) => (
                <div className={classNames("linkerAdminParsing", {valid: parsing.valid, invalid: !parsing.valid})} key={`${resultKey(item)}-${i}`}>
                  <div className="linkerAdminParsingRef">{parsing.ref || "No Ref"}</div>
                  {!parsing.valid ? <div className="linkerAdminInvalidReason">{parsing.disqualificationReason}</div> : null}
                  <LinkerPairings pairings={parsing.pairings || []} contextType={parsing.contextType} />
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
};

const LinkerBulkCorrectorPage = () => {
  const stored = loadStored(STORAGE_KEY, {});
  const [dataset, setDataset] = useState(stored.dataset || defaultDataset);
  const [page, setPage] = useState(stored.page || 0);
  const [item, setItem] = useState(stored.item || null);
  const [total, setTotal] = useState(stored.total || 0);
  const [stats, setStats] = useState(stored.stats || {totalCitations: 0, parsedCitations: 0});
  const [history, setHistory] = useState(loadStored(HISTORY_KEY, []));
  const [loading, setLoading] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [bulkTask, setBulkTask] = useState(null);
  const [error, setError] = useState(null);

  const normalizedDataset = useMemo(() => ({
    ...dataset,
    bookTitle: (dataset.bookTitle || '').trim(),
    versionTitle: dataset.versionTitle || null,
    lang: dataset.lang || null,
  }), [dataset]);

  const persistState = useCallback((next = {}) => {
    if (typeof localStorage === 'undefined') { return; }
    const state = {dataset: normalizedDataset, page, item, total, stats, ...next};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [normalizedDataset, page, item, total, stats]);

  useEffect(() => {
    persistState();
  }, [persistState]);

  const rememberItem = useCallback((nextItem) => {
    if (!nextItem) { return; }
    setHistory(prev => {
      const filtered = prev.filter(entry => resultKey(entry) !== resultKey(nextItem));
      const next = [nextItem, ...filtered].slice(0, 10);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const applySearchResponse = useCallback((data, nextPage) => {
    const nextItem = data.results?.[0] || null;
    setPage(nextPage);
    setTotal(data.total || 0);
    setStats(data.stats || {totalCitations: 0, parsedCitations: 0});
    setItem(nextItem);
    rememberItem(nextItem);
  }, [rememberItem]);

  const search = useCallback(async (nextPage = 0) => {
    if (!normalizedDataset.bookTitle) { return; }
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost('/_api/linker-bulk-corrector/search', {dataset: normalizedDataset, page: nextPage, pageSize: 1});
      applySearchResponse(data, nextPage);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [normalizedDataset, applySearchResponse]);

  const navigate = useCallback(async (direction) => {
    if (!item) {
      search(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let cursor = {ref: item.ref, charRange: item.charRange};
      for (let i = 0; i < 20; i += 1) {
        const data = await apiPost('/_api/linker-bulk-corrector/navigate', {dataset: normalizedDataset, direction, cursor});
        if (data.found) {
          setItem(data.item);
          rememberItem(data.item);
          setPage(data.position || 0);
          return;
        }
        if (!data.continuationCursor) { return; }
        cursor = data.continuationCursor;
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [item, normalizedDataset, rememberItem, search]);

  const reparseCurrent = useCallback(async () => {
    if (!item) { return; }
    setReparsing(true);
    setError(null);
    try {
      const data = await apiPost('/_api/linker-bulk-corrector/citation/reparse', {
        ref: item.ref,
        versionTitle: item.versionTitle,
        language: item.language,
        charRange: item.charRange,
      });
      setItem(data);
      rememberItem(data);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setReparsing(false);
    }
  }, [item, rememberItem]);

  const reparseDataset = useCallback(async () => {
    if (!normalizedDataset.bookTitle) { return; }
    setError(null);
    const data = await apiPost('/_api/linker-bulk-corrector/reparse-dataset', {dataset: normalizedDataset});
    setBulkTask({task_id: data.task_id, current: 0, total: null, state: 'PENDING'});
  }, [normalizedDataset]);

  useEffect(() => {
    if (!bulkTask?.task_id || bulkTask.state === 'SUCCESS' || bulkTask.state === 'FAILURE') { return undefined; }
    const timer = setInterval(async () => {
      const data = await Sefaria._ApiPromise(`${Sefaria.apiHost}/api/async/${bulkTask.task_id}`);
      setBulkTask({
        ...bulkTask,
        state: data.status || data.state,
        current: data.meta?.current ?? data.current ?? bulkTask.current,
        total: data.meta?.total ?? data.total ?? bulkTask.total,
      });
    }, 1500);
    return () => clearInterval(timer);
  }, [bulkTask]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) { return; }
      if (event.key === 'ArrowRight' || event.key === 'l') { navigate('forward'); }
      if (event.key === 'ArrowLeft' || event.key === 'h') { navigate('backward'); }
      if (event.key === 'r') { reparseCurrent(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, reparseCurrent]);

  const toggleStatus = (status) => {
    const current = new Set(dataset.status || []);
    if (current.has(status)) {
      current.delete(status);
    } else {
      current.add(status);
    }
    setDataset({...dataset, status: Array.from(current)});
  };

  const parsedPct = stats.totalCitations ? Math.round((stats.parsedCitations / stats.totalCitations) * 100) : 0;

  return (
    <div className="linkerBulkCorrector sans-serif">
      <aside className="lbcSidebar">
        <section>
          <h2>Stats</h2>
          <div className="lbcStatNumber">{stats.parsedCitations} / {stats.totalCitations}</div>
          <div className="lbcProgress"><span style={{width: `${parsedPct}%`}} /></div>
        </section>
        <section className="lbcHistory">
          <h2>Previous 10</h2>
          {history.map(entry => (
            <button type="button" key={resultKey(entry)} onClick={() => setItem(entry)}>
              <span>{entry.ref}</span>
              <SmallMeta item={entry} />
            </button>
          ))}
        </section>
        <section className="lbcShortcuts">
          <h2>Shortcuts</h2>
          <div><kbd>right</kbd> / <kbd>l</kbd> Forward</div>
          <div><kbd>left</kbd> / <kbd>h</kbd> Back</div>
          <div><kbd>r</kbd> Re-parse</div>
        </section>
      </aside>
      <main className="lbcMain">
        <div className="lbcSearch">
          <IndexTitleAutocomplete
            value={dataset.bookTitle}
            onChange={bookTitle => setDataset({...dataset, bookTitle})}
          />
          <input
            type="text"
            placeholder="Version title"
            value={dataset.versionTitle || ''}
            onChange={e => setDataset({...dataset, versionTitle: e.target.value})}
          />
          <select value={dataset.lang || ''} onChange={e => setDataset({...dataset, lang: e.target.value || null})}>
            <option value="">he + en</option>
            <option value="he">he</option>
            <option value="en">en</option>
          </select>
          <div className="lbcSegmented">
            {STATUS_OPTIONS.map(status => (
              <StatusToggle key={status} status={status} selected={(dataset.status || []).includes(status)} onClick={() => toggleStatus(status)} />
            ))}
          </div>
          <button type="button" className="button" onClick={() => search(0)} disabled={loading}>Search</button>
          <button type="button" className="button" onClick={reparseDataset} disabled={loading}>Re-parse Results</button>
        </div>
        {error ? <div className="lbcError">{error}</div> : null}
        {bulkTask ? <div className="lbcTask">Re-parse: {bulkTask.current || 0} / {bulkTask.total || '?'} ({bulkTask.state})</div> : null}
        <ResultDetails item={item} onReparse={reparseCurrent} reparsing={reparsing} />
      </main>
      <nav className="lbcNavOverlay">
        <button type="button" onClick={() => navigate('backward')} disabled={loading}>Back</button>
        <span>{item ? `${page + 1} / ${total || '?'}` : 'No item'}</span>
        <button type="button" onClick={() => navigate('forward')} disabled={loading}>Forward</button>
      </nav>
    </div>
  );
};

export default LinkerBulkCorrectorPage;
