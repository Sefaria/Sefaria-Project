import React, {useCallback, useEffect, useMemo, useState} from 'react';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';
import { GeneralAutocomplete } from './GeneralAutocomplete';
import { LinkerPartChip, LinkerParsingList, LinkerTestStringBox } from './LinkerAdminParts';

const STORAGE_KEY = 'linkerBulkCorrectorState';
const HISTORY_KEY = 'linkerBulkCorrectorHistory';
const HISTORY_SIZE = 10;
const STATUS_OPTIONS = ['unparsed', 'ambiguous', 'parsed'];
const BULK_POLL_MS = 1500;
const EMPTY_STATS = {totalCitations: 0, parsedCitations: 0};

const defaultDataset = {
  type: 'book',
  bookTitle: '',
  versionTitle: null,
  lang: null,
  status: ['unparsed'],
};

const apiPost = (path, payload) => Sefaria.apiRequestWithBody(path, {}, payload, 'POST');

// apiRequestWithBody rejects with an Error; _ApiPromise (jQuery) rejects with a jqXHR.
const errorMessage = (e) => e?.responseJSON?.error || e?.message || String(e);

const loadStored = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};

const saveStored = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience; ignore quota/availability errors.
  }
};

const resultKey = (item) => item ? `${item.ref}|${item.versionTitle}|${item.language}|${item.charRange?.join('-')}` : '';

// CRRD test string (paste into linker_test.py). item.refParts already has RANGE parts flattened
// into NUMBERED/RANGE_SYMBOL/NUMBERED, so no range sections need to be passed separately.
const getCrrdTestString = (item) => {
  if (!item?.refParts?.length) { return null; }
  const parts = Sefaria._getLinkerTestStringForParts(
    item.refParts.map(part => part.text),
    item.refParts.map(part => part.type),
  );
  return `crrd([${parts}]${item.language === 'he' ? ')' : ", lang='en')"}`;
};

const SmallMeta = ({item}) => (
  <div className="lbcMeta">{item.versionTitle} ({item.language})</div>
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
      const value = (d.is_ref && !d.is_book) ? d.ref : (d.index || d.book || item.name);
      onChange((value || '').trim());
    } catch (e) {
      onChange((item.name || '').trim());
    }
  };
  const renderInput = (highlightedIndex, highlightedSuggestion, getInputProps, setInputValue, suggestions) => {
    const inputProps = getInputProps({
      className: 'lbcSearchInput',
      placeholder: 'Book title, ref, or Sefaria URL',
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

const DatasetExampleControls = ({item}) => {
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const open = (nextAction) => {
    setAction(nextAction);
    setReason('');
    setMessage(null);
    setError(null);
  };

  const submit = async () => {
    const trimmedReason = reason.trim();
    if (!action || !trimmedReason || busy) { return; }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const isRefPart = action === 'ref-part';
      const result = await apiPost(
        isRefPart ? '/_api/linker-admin/dataset/ref-part' : '/_api/linker-admin/dataset/ref',
        {
          ref: item.ref,
          lang: item.language,
          versionTitle: item.versionTitle,
          reason: trimmedReason,
          charRange: item.charRange,
        },
      );
      setMessage(`Saved ${isRefPart ? 'Ref Part' : 'Ref'} dataset example (${result.numEntities} labels)`);
      setAction(null);
      setReason('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="button small" onClick={() => open('ref')} disabled={busy}>
        + Ref Dataset
      </button>
      <button type="button" className="button small" onClick={() => open('ref-part')} disabled={busy}>
        + Ref Part Dataset
      </button>
      {action ? (
        <div className="lbcDatasetReason">
          <input
            type="text"
            placeholder="Reason"
            value={reason}
            onChange={event => setReason(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { submit(); } }}
            autoFocus
          />
          <button type="button" className="button small" onClick={submit} disabled={busy || !reason.trim()}>
            Save
          </button>
        </div>
      ) : null}
      {message ? <div className="linkerAdminMessage lbcDatasetStatus">{message}</div> : null}
      {error ? <div className="lbcError lbcDatasetStatus">{error}</div> : null}
    </>
  );
};

const ResultDetails = ({item, onReparse, reparsing}) => {
  if (!item) {
    return <div className="lbcEmpty">Search for a book to load citations.</div>;
  }
  const testStringCrrd = getCrrdTestString(item);
  return (
    <div className="lbcResult">
      <div className="lbcResultHeader">
        <div>
          <h2><a className="linkerAdminRefValue" href={`/${Sefaria.normRef(item.ref)}`} target="_blank">{item.ref}</a></h2>
          <SmallMeta item={item} />
        </div>
        <div className={`lbcStatus ${item.status}`}>{item.status}</div>
        <div className="lbcResultActions">
          <button type="button" className="button small" onClick={onReparse} disabled={reparsing}>
            {reparsing ? 'Re-parsing' : 'Re-parse'}
          </button>
          {/* Keyed by citation so its reason/message state resets when the citation changes. */}
          <DatasetExampleControls key={resultKey(item)} item={item} />
        </div>
      </div>
      <div className="lbcSnippet" dir={item.language === 'he' ? 'rtl' : 'ltr'} dangerouslySetInnerHTML={{__html: item.snippet?.html || ''}} />
      <div className="lbcColumns">
        <section>
          <h3>Ref Parts</h3>
          <div className="linkerAdminParts">
            {(item.refParts || []).map((part, i) => <LinkerPartChip key={i} part={part} />)}
          </div>
          {testStringCrrd ? <LinkerTestStringBox testString={testStringCrrd} /> : null}
        </section>
        <section>
          <h3>Options Considered</h3>
          <LinkerParsingList parsings={item.parsings || []} keyPrefix={resultKey(item)} />
        </section>
      </div>
    </div>
  );
};

const BulkTaskStatus = ({task}) => (
  <div className={task.state === 'FAILURE' ? 'lbcError' : 'lbcTask'}>
    Re-parse: {task.current || 0} / {task.total ?? '?'} ({task.state})
    {task.skipped ? `, skipped ${task.skipped}` : ''}
    {task.error ? `: ${task.error}` : ''}
  </div>
);

const LinkerBulkCorrectorPage = () => {
  const [stored] = useState(() => loadStored(STORAGE_KEY, {}));
  const [dataset, setDataset] = useState(stored.dataset || defaultDataset);
  // Position of `item` in the filtered dataset; null when unknown (an entry outside the current dataset).
  const [page, setPage] = useState(stored.page !== undefined ? stored.page : 0);
  const [item, setItem] = useState(stored.item || null);
  const [total, setTotal] = useState(stored.total || 0);
  const [stats, setStats] = useState(stored.stats || EMPTY_STATS);
  const [statsBookTitle, setStatsBookTitle] = useState(stored.statsBookTitle || stored.dataset?.bookTitle || '');
  const [history, setHistory] = useState(() => loadStored(HISTORY_KEY, []));
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [reparsing, setReparsing] = useState(false);
  const [bulkTask, setBulkTask] = useState(null);
  const [error, setError] = useState(null);

  const normalizedDataset = useMemo(() => ({
    ...dataset,
    bookTitle: (dataset.bookTitle || '').trim(),
    versionTitle: dataset.versionTitle || null,
    lang: dataset.lang || null,
  }), [dataset]);

  useEffect(() => {
    saveStored(STORAGE_KEY, {dataset: normalizedDataset, page, item, total, stats, statsBookTitle});
  }, [normalizedDataset, page, item, total, stats, statsBookTitle]);

  const showItem = useCallback((nextItem, position) => {
    setItem(nextItem);
    setPage(position);
    if (!nextItem) { return; }
    setHistory(prev => {
      const next = [nextItem, ...prev.filter(entry => resultKey(entry) !== resultKey(nextItem))].slice(0, HISTORY_SIZE);
      saveStored(HISTORY_KEY, next);
      return next;
    });
  }, []);

  // Runs an API action with the shared loading/spinner/error state; ignored while another is in flight.
  const runAction = useCallback(async (action, request) => {
    if (loading) { return; }
    setLoading(true);
    setActiveAction(action);
    setError(null);
    try {
      await request();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  }, [loading]);

  const search = useCallback(() => {
    if (!normalizedDataset.bookTitle) { return; }
    runAction('search', async () => {
      const data = await apiPost('/_api/linker-bulk-corrector/search', {dataset: normalizedDataset, page: 0});
      showItem(data.result, data.page);
      setTotal(data.total);
      setStats(data.stats);
      setStatsBookTitle(data.dataset.bookTitle);
      setDataset(prev => ({...prev, bookTitle: data.dataset.bookTitle}));
    });
  }, [normalizedDataset, runAction, showItem]);

  const navigate = useCallback((direction, cursorItem = item) => {
    if (!cursorItem) {
      search();
      return;
    }
    runAction(direction, async () => {
      const cursor = {ref: cursorItem.ref, charRange: cursorItem.charRange};
      const data = await apiPost('/_api/linker-bulk-corrector/navigate', {dataset: normalizedDataset, direction, cursor});
      if (data.found) {
        showItem(data.item, data.position);
      } else if (direction === 'current') {
        // Not in the current dataset (e.g. a history entry from another book): show it as last seen.
        showItem(cursorItem, null);
      }
    });
  }, [item, normalizedDataset, runAction, search, showItem]);

  const reparseCurrent = useCallback(async () => {
    if (!item || reparsing) { return; }
    setReparsing(true);
    setError(null);
    try {
      const data = await apiPost('/_api/linker-bulk-corrector/citation/reparse', {
        ref: item.ref,
        versionTitle: item.versionTitle,
        language: item.language,
        charRange: item.charRange,
      });
      showItem(data, page);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setReparsing(false);
    }
  }, [item, page, reparsing, showItem]);

  const bulkTaskId = bulkTask?.taskId;
  const bulkTaskRunning = !!bulkTask && !['SUCCESS', 'FAILURE'].includes(bulkTask.state);
  const statusLabel = (dataset.status || []).join(' + ') || 'no status selected';

  const reparseDataset = useCallback(async () => {
    if (!normalizedDataset.bookTitle || bulkTaskRunning) { return; }
    const confirmed = window.confirm(
      `Re-parse and save every ${statusLabel} citation in ${normalizedDataset.bookTitle}? ` +
      'This rewrites stored citations and their links.'
    );
    if (!confirmed) { return; }
    setError(null);
    try {
      const data = await apiPost('/_api/linker-bulk-corrector/reparse-dataset', {dataset: normalizedDataset});
      setBulkTask({taskId: data.task_id, state: 'PENDING', current: 0, total: null, skipped: 0});
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [normalizedDataset, bulkTaskRunning, statusLabel]);

  useEffect(() => {
    if (!bulkTaskId) { return undefined; }
    let cancelled = false;
    let timer;
    const poll = async () => {
      let data;
      try {
        data = await Sefaria._ApiPromise(`${Sefaria.apiHost}/api/async/${bulkTaskId}`);
      } catch (e) {
        // The status endpoint responds 500 when the task itself failed.
        if (!cancelled) { setBulkTask(prev => ({...prev, state: 'FAILURE', error: errorMessage(e)})); }
        return;
      }
      if (cancelled) { return; }
      const progress = data.result || data.meta || {};
      setBulkTask(prev => ({
        ...prev,
        state: data.state,
        current: progress.current ?? prev.current,
        total: progress.total ?? prev.total,
        skipped: progress.skipped ?? prev.skipped,
      }));
      if (!data.ready) { timer = setTimeout(poll, BULK_POLL_MS); }
    };
    timer = setTimeout(poll, BULK_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bulkTaskId]);

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
  const editorBookTitle = statsBookTitle || normalizedDataset.bookTitle;

  const navButton = (direction, label) => (
    <button
      type="button"
      className={classNames('button', {disabled: loading && activeAction !== direction})}
      onClick={() => navigate(direction)}
      disabled={loading}
    >
      {activeAction === direction ? <span className="lbcSpinner" /> : label}
    </button>
  );

  return (
    <div className="linkerBulkCorrector sans-serif">
      <aside className="lbcSidebar">
        <section>
          <h2>Stats</h2>
          {statsBookTitle ? <div className="lbcStatBook">{statsBookTitle}</div> : null}
          <div className="lbcStatNumber">{stats.parsedCitations} / {stats.totalCitations} parsed</div>
          <div className="lbcProgress"><span style={{width: `${parsedPct}%`}} /></div>
          <div className="lbcMeta">Across all citations in the book, regardless of status filter</div>
          {stats.citationsPassed != null ? (
            <div className="lbcStatPassed">{stats.citationsPassed} passed to reach jump point</div>
          ) : null}
        </section>
        <section className="lbcHistory">
          <h2>Previous {HISTORY_SIZE}</h2>
          {history.map(entry => (
            <button type="button" key={resultKey(entry)} onClick={() => navigate('current', entry)}>
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
          {/* Remount when a search canonicalizes the title: the autocomplete input is uncontrolled. */}
          <IndexTitleAutocomplete
            key={statsBookTitle}
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
              <button
                type="button"
                key={status}
                className={classNames('lbcSegmentButton', {active: (dataset.status || []).includes(status)})}
                onClick={() => toggleStatus(status)}>
                {status}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={classNames('button', {disabled: loading && activeAction !== 'search'})}
            onClick={search}
            disabled={loading}
          >
            {activeAction === 'search' ? <span className="lbcSpinner" /> : 'Search'}
          </button>
          <button type="button" className="button" onClick={reparseDataset} disabled={loading || bulkTaskRunning}>
            Re-parse Results
          </button>
          <button
            type="button"
            className="button"
            onClick={() => window.open(`/linker-editor?book=${encodeURIComponent(editorBookTitle)}`, '_blank', 'noopener')}
            disabled={!editorBookTitle}
          >
            Linker Editor
          </button>
        </div>
        {error ? <div className="lbcError">{error}</div> : null}
        {bulkTask ? <BulkTaskStatus task={bulkTask} /> : null}
        <ResultDetails item={item} onReparse={reparseCurrent} reparsing={reparsing} />
      </main>
      <nav className="lbcNavOverlay">
        {navButton('backward', 'Back')}
        <span>{item ? `${page != null ? page + 1 : '?'} / ${total || '?'} (${statusLabel})` : 'No item'}</span>
        {navButton('forward', 'Forward')}
      </nav>
    </div>
  );
};

export default LinkerBulkCorrectorPage;
