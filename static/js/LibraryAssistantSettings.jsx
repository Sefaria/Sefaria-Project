import React, { useCallback, useEffect, useRef, useState } from 'react';
import { chatbotApiBaseUrl, laSettings } from './chatbotApi';

// The Library Assistant tab of Settings. The assistant's on/off is a Sefaria profile setting;
// Instructions and Profile live in the assistant's own service and are read and written over HTTP
// with the same signed user token the widget gets. English strings only, until Weblate.
const MAX_TEXT = 300;

const STRINGS = {
  title: 'Library Assistant',
  on: 'On',
  off: 'Off',
  saveSetting: 'Save assistant setting',
  about:
    'The Library Assistant can adapt its answers to how you learn. Instructions are yours to write. The Profile is written by the assistant from your questions; you can turn it off, clear it, or tell the assistant what to change.',
  turnOn: 'Turn the Library Assistant on to use personalization.',
  loading: 'Loading…',
  instructions: 'Instructions',
  instructionsPlaceholder: 'Tell LA the way you like to work',
  saveInstructions: 'Save instructions',
  profile: 'Profile',
  profileEmpty: 'LA will remember things about you as you move forward in your Sefaria career.',
  clear: 'Clear profile',
  clearConfirm: 'Clear your Profile? This cannot be undone.',
  clearYes: 'Yes, clear',
  cancel: 'Cancel',
  editTitle: 'Tell LA what to change',
  send: 'Send',
  processing: 'Processing…',
  testing: 'Testing tools',
  runNow: 'Run now',
  dreamNow: 'Dream now',
  updateEvery: 'Update after every message',
  plainResponse: 'Include non-personalized response',
  health: 'Job health',
  checkHealth: 'Check job health',
  notAvailable: 'Personalization is not available here.',
  notAvailableNoPreview:
    'Personalization is not available here. Open the test link you were sent; this page is not connected to the personalization test server.',
  jobsHour: 'Profile updates this hour',
  jobRunning: 'Job running',
  jobParked: 'Paused after repeated failures',
  recentRuns: 'Recent runs',
  signIn: 'Reload the page to sign in again.',
  quota: 'Too many changes. Try again in a while.',
  jobQuota: 'Hourly limit reached. Try again later.',
  unreachable: 'Could not reach the Library Assistant. Try again.',
  tryAgain: 'Try again',
  settingFailed: 'Could not save the setting. Try again.',
  personalization: 'Personalization',
  settingDescription: 'Turn the assistant on or off for your account.',
  instructionsDescription: 'Standing instructions that shape how the assistant answers you. You write these.',
  profileDescription: 'What the assistant has learned about how you learn. It writes this from your questions.',
  testingNote: 'These tools appear only on test deployments.',
  runNowHelp: 'Runs one Profile update now, from recent questions, to test a change without waiting.',
  dreamNowHelp: 'Runs the deeper Profile update now, over a wider set of questions, to check the full pass.',
  updateEveryHelp: 'Updates the Profile after every message instead of on the usual schedule, to watch changes land.',
  plainResponseHelp: 'Adds an answer without personalization to each reply, to compare it with the personalized one.',
  checkHealthHelp:
    'Shows when each Profile job last ran and wrote, and whether it is paused, for when updates seem to stop.',
  backToLearning: 'Back to Learning',
};

// A page with no preview server is one whose API base is not a `*.ai-server.coolifydev.sefaria.org` preview.
export const isPreviewBase = (base) => {
  try {
    return /^\d+\.ai-server\.coolifydev\.sefaria\.org$/.test(new URL(base).hostname.toLowerCase());
  } catch (e) {
    return false;
  }
};

// The Back to Learning target: only a same-site path is kept. Browsers drop tabs and newlines from a URL, so
// "/\n/evil.example" would become "//evil.example"; control characters and backslashes are refused, and the
// result must still resolve to this site.
export const safeReturnPath = (raw) => {
  // eslint-disable-next-line no-control-regex
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(raw)) {
    return '/';
  }
  try {
    const url = new URL(raw, 'https://same-site.invalid');
    return url.origin === 'https://same-site.invalid' ? raw : '/';
  } catch (e) {
    return '/';
  }
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const MAX_RUNS = 10;
// The first read gives up after this long, so a server that never answers ends in an error with
// Try again, not an endless "Loading…".
export const LOAD_TIMEOUT_MS = 15000;

// A Run now / Dream now result in plain words, then the codes testers can quote.
const RUN_STATUS = {
  applied: 'Profile updated.',
  no_change: 'No change to the Profile.',
  rejected: 'The new Profile failed a check and was not saved.',
  failed: 'The run failed.',
  busy: 'An update is already running. Try again in a moment.',
};
const RUN_REASON = {
  no_new_prompts: 'No new questions since the last update. Instructions never change the Profile.',
  not_relevant: 'The new questions said nothing about how you learn or what interests you.',
  sensitive_only: 'The new questions held only sensitive details, which are never stored.',
  nothing_to_write: 'Nothing new to add.',
  all_screened: 'Every new question was screened out.',
  dream_unchanged: 'The review found nothing to change.',
  parked: 'Paused after repeated failures until you ask a new question.',
  profile_off: 'The Profile is off.',
  revision_moved: 'The Profile changed while the run was working.',
  batch_skipped: 'These questions failed three times and were skipped.',
};
export const describeRun = ({ status, reason }) => {
  const words = [RUN_STATUS[status], reason && RUN_REASON[reason]].filter(Boolean).join(' ');
  const codes = `${status}${reason ? `: ${reason}` : ''}`;
  return words ? `${words} (${codes})` : codes;
};

const errorMessage = (e, preview) => {
  if (e && e.status === 404) return preview ? STRINGS.notAvailable : STRINGS.notAvailableNoPreview;
  if (e && e.status === 401) return STRINGS.signIn;
  if (e && e.status === 429) return STRINGS.quota;
  if (e && e.status === 400 && e.body && e.body.error === 'too_long') return `Keep it to ${e.body.max} characters.`;
  return STRINGS.unreachable;
};

const formatTime = (value) => {
  const date = new Date(value);
  return isNaN(date)
    ? String(value)
    : date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
};

const lastUpdated = (updatedAt, by) => {
  if (!updatedAt) return 'Last updated: Never';
  return `Last updated: ${formatTime(updatedAt)}${by ? ` by ${by}` : ''}`;
};

const PROFILE_AUTHOR = { la: 'LA', you_la: 'You/LA' };

// The Profile is markdown-ish text: "# Heading" lines and paragraphs under them. Rendered as headings and
// paragraphs of plain text nodes (never as HTML).
const parseProfile = (text) => {
  const blocks = [];
  let lines = [];
  const flush = () => {
    if (lines.length) blocks.push({ type: 'p', text: lines.join('\n') });
    lines = [];
  };
  text.split('\n').forEach((line) => {
    const heading = /^\s*#{1,6}\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'h', text: heading[1] });
    } else if (line.trim() === '') {
      flush();
    } else {
      lines.push(line);
    }
  });
  flush();
  return blocks;
};

// The sign-in forms' error banner (auth/ErrorBanner), used the way the Developer tab shows a failed save.
const ErrorMessage = ({ children }) => (
  <div className="sefaria-auth-error laError" role="alert">
    <img className="sefaria-auth-error-icon" src="/static/icons/info-error.svg" alt="" aria-hidden="true" />
    <div className="sefaria-auth-error-content">{children}</div>
  </div>
);

const ProfileText = ({ text }) => (
  <div className="devE-note laProfileText">
    {text ? (
      parseProfile(text).map((block, i) =>
        block.type === 'h' ? (
          <h4 key={i} className="laProfileHeading">
            {block.text}
          </h4>
        ) : (
          <p key={i} className="laProfileBody">
            {block.text}
          </p>
        )
      )
    ) : (
      <p className="devE-hint laMuted">{STRINGS.profileEmpty}</p>
    )}
  </div>
);

const isRtl = (el) =>
  (typeof document !== 'undefined' && (document.dir === 'rtl' || document.documentElement.dir === 'rtl')) ||
  (!!el && typeof window !== 'undefined' && window.getComputedStyle(el).direction === 'rtl');

// Follows the WAI-ARIA radio group pattern: one tab stop per group, arrows move and select and wrap
// at the ends (Left/Right flipped in RTL), Space/Enter select. Busy uses aria-disabled so that focus
// stays on the control.
const OnOffGroup = ({ on, onSelect, disabled, labelledBy, optionAttrs }) => {
  const refs = useRef([]);
  const values = [true, false];
  const tabbable = on === false ? 1 : 0;
  const select = (i) => {
    if (!disabled && values[i] !== on) onSelect(values[i]);
  };
  const onKeyDown = (e, i) => {
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      e.preventDefault();
      select(i);
      return;
    }
    const rtl = isRtl(e.currentTarget);
    const steps = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    if (disabled) return;
    const next = (i + step + values.length) % values.length;
    if (refs.current[next]) refs.current[next].focus();
    select(next);
  };
  return (
    <div className="devE-tabs laOnOff" role="radiogroup" aria-labelledby={labelledBy}>
      {values.map((value, i) => (
        <button
          key={String(value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          className="laOnOffOption"
          aria-checked={on === value}
          aria-disabled={disabled ? 'true' : undefined}
          tabIndex={i === tabbable ? 0 : -1}
          onClick={() => select(i)}
          onKeyDown={(e) => onKeyDown(e, i)}
          {...optionAttrs(value)}
        >
          {value ? STRINGS.on : STRINGS.off}
        </button>
      ))}
    </div>
  );
};

const OnOff = ({ on, onChange, toggleName, disabled, labelledBy, title }) => (
  <OnOffGroup
    on={on}
    onSelect={onChange}
    disabled={disabled}
    labelledBy={labelledBy}
    optionAttrs={(value) => ({ 'data-toggle': on === value ? undefined : toggleName, title })}
  />
);

// Whether a server reply is a usable State: everything the panel reads on render must be there.
const isState = (res) =>
  !!res &&
  !!res.instructions &&
  typeof res.instructions === 'object' &&
  !!res.profile &&
  typeof res.profile === 'object' &&
  (!res.labEnabled || (!!res.testing && typeof res.testing === 'object'));

// A refused edit may come back without a State; anything else must be one.
const acceptEdit = (res) => isState(res) || (!!res && !!res.edit && res.edit.status === 'refused');

const readInitialEnabled = (prop) => {
  if (typeof prop === 'boolean') return prop;
  const el = typeof document !== 'undefined' ? document.getElementById('libraryAssistantSettings') : null;
  return !!el && el.getAttribute('data-library-assistant-enabled') === 'true';
};

const AssistantSwitch = ({ initial }) => {
  const [saved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  const fail = (message) => {
    inFlight.current = false;
    if (!mounted.current) return;
    setSaving(false);
    setError(message);
  };
  const save = () => {
    if (value === saved || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    // jQuery, so the page's CSRF setup applies; the endpoint takes a form field named "json".
    const request = $.post(
      '/api/profile',
      { json: JSON.stringify({ settings: { library_assistant: value } }) },
      (data) => {
        if (data && data.error) {
          fail(data.error);
          return;
        }
        // A fresh page mints a fresh token (and the widget script) for the new setting.
        window.location.reload();
      }
    );
    if (request && request.fail) request.fail(() => fail(STRINGS.settingFailed));
  };
  return (
    <section id="libraryAssistantSetting" className="devPocCard laCard">
      <h2 id="laSettingTitle" className="devE-title">
        {STRINGS.title}
      </h2>
      <p className="devE-lead">{STRINGS.settingDescription}</p>
      <div className="devE-row">
        <OnOffGroup
          on={value}
          onSelect={setValue}
          disabled={saving}
          labelledBy="laSettingTitle"
          optionAttrs={(v) => ({ 'data-la-value': String(v) })}
        />
        <button type="button" className="devE-pill" aria-disabled={saving ? 'true' : undefined} onClick={save}>
          {STRINGS.saveSetting}
        </button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </section>
  );
};

const Personalization = ({ base, token }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [editRequest, setEditRequest] = useState('');
  const [editResult, setEditResult] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [health, setHealth] = useState(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  // Runs one action. On success returns the response; `accept` says what a usable reply looks like
  // (a State by default). On failure, or a reply that is not usable, sets the message, leaves the
  // form as it was and returns null.
  const call = useCallback(
    async (action, body, accept = isState, onQuota) => {
      setError(null);
      setBusy(true);
      try {
        const res = await laSettings(base, token, action, body, action === 'get' ? { timeoutMs: LOAD_TIMEOUT_MS } : {});
        if (!accept(res)) throw new Error('unexpected response');
        return res;
      } catch (e) {
        // `onQuota`: a caller with its own result area shows the hourly limit there, not as the page error
        if (e && e.status === 429 && onQuota) {
          if (mounted.current) onQuota();
        } else if (mounted.current) setError(errorMessage(e, isPreviewBase(base)));
        return null;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [base, token]
  );

  const applyState = (res) => {
    if (mounted.current && isState(res)) setData(res);
  };

  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await call('get');
      if (cancelled || !res) return;
      setData(res);
      setDraft(res.instructions.text || '');
    })();
    return () => {
      cancelled = true;
    };
  }, [call, loadAttempt]);

  const act = async (action, body, accept, onQuota) => {
    const res = await call(action, body, accept, onQuota);
    applyState(res);
    return res;
  };

  const saveInstructions = async () => {
    const res = await act('set_instructions', { text: draft });
    if (!res || !mounted.current) return;
    setDraft(res.instructions.text || '');
  };
  const clearProfile = async () => {
    setConfirmClear(false);
    await act('clear_profile');
  };
  const sendEdit = async () => {
    setEditResult(STRINGS.processing);
    const res = await act('edit_profile', { request: editRequest }, acceptEdit);
    if (!mounted.current) return;
    if (!res) return setEditResult(null);
    const refused = res.edit && res.edit.status === 'refused';
    setEditResult(refused ? res.edit.reason : res.profile.text || '');
    if (res.edit && res.edit.status === 'applied') setEditRequest('');
  };
  const runNow = async (kind) => {
    setRunResult(null);
    const res = await act('run_now', { kind }, undefined, () => setRunResult(STRINGS.jobQuota));
    if (mounted.current && res && res.run) setRunResult(describeRun(res.run));
  };
  const checkHealth = async () => {
    const res = await call('health', undefined, (r) => !!r);
    if (mounted.current && res) setHealth(res.jobs || []);
  };

  if (!data) {
    return (
      <>
        {error ? (
          <div className="devPocCard laCard">
            <ErrorMessage>{error}</ErrorMessage>
            <div className="devE-row">
              <button type="button" className="devE-pill" disabled={busy} onClick={() => setLoadAttempt((n) => n + 1)}>
                {STRINGS.tryAgain}
              </button>
            </div>
          </div>
        ) : (
          <p className="devE-hint laMuted">{STRINGS.loading}</p>
        )}
      </>
    );
  }

  const { instructions, profile, testing } = data;
  const overLimit = draft.length > MAX_TEXT;
  return (
    <>
      {error && <ErrorMessage>{error}</ErrorMessage>}

      <div className="devPocCard laCard" id="profile">
        <h3 id="laProfileTitle" className="devE-title">
          {STRINGS.profile}
        </h3>
        <p className="devE-lead">{STRINGS.profileDescription}</p>
        <ProfileText text={profile.text} />
        <OnOff
          on={profile.enabled}
          toggleName="profile"
          labelledBy="laProfileTitle"
          disabled={busy}
          onChange={(enabled) => act('toggle', { target: 'profile', enabled })}
        />
        <div className="devPocHelp laUpdated">{lastUpdated(profile.updatedAt, PROFILE_AUTHOR[profile.updatedBy])}</div>
        {confirmClear ? (
          <div role="alertdialog" className="devE-note laConfirm">
            <p>{STRINGS.clearConfirm}</p>
            <div className="devE-row">
              <button type="button" className="devE-pill devE-pillDanger" disabled={busy} onClick={clearProfile}>
                {STRINGS.clearYes}
              </button>
              <button type="button" className="devE-pill devE-pillSec" onClick={() => setConfirmClear(false)}>
                {STRINGS.cancel}
              </button>
            </div>
          </div>
        ) : (
          <div className="devE-row">
            <button type="button" className="devE-pill devE-pillSec" onClick={() => setConfirmClear(true)}>
              {STRINGS.clear}
            </button>
          </div>
        )}
        <h4 id="laEditTitle" className="laSubheading">
          {STRINGS.editTitle}
        </h4>
        <textarea
          className="sefaria-input-control sefaria-input-control--multiline laEditRequest"
          aria-labelledby="laEditTitle"
          rows={2}
          maxLength={MAX_TEXT}
          value={editRequest}
          onChange={(e) => setEditRequest(e.target.value)}
        />
        <div className="devE-row">
          <button type="button" className="devE-pill" disabled={busy || !editRequest.trim()} onClick={sendEdit}>
            {STRINGS.send}
          </button>
        </div>
        {editResult && (
          <div className="devE-note laEditResult" role="status">
            {editResult}
          </div>
        )}
      </div>

      <div className="devPocCard laCard" id="instructions">
        <h3 id="laInstructionsTitle" className="devE-title">
          {STRINGS.instructions}
        </h3>
        <p className="devE-lead">{STRINGS.instructionsDescription}</p>
        <textarea
          className="sefaria-input-control sefaria-input-control--multiline laInstructions"
          aria-labelledby="laInstructionsTitle"
          rows={4}
          value={draft}
          placeholder={STRINGS.instructionsPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div
          className={`devE-count laInstructionsCount${overLimit ? ' devE-errorText laError' : ''}`}
          aria-live="polite"
        >{`${draft.length} / ${MAX_TEXT}`}</div>
        <OnOff
          on={instructions.enabled}
          toggleName="instructions"
          labelledBy="laInstructionsTitle"
          disabled={busy}
          onChange={(enabled) => act('toggle', { target: 'instructions', enabled })}
        />
        <div className="devE-row">
          <button type="button" className="devE-pill" disabled={overLimit || busy} onClick={saveInstructions}>
            {STRINGS.saveInstructions}
          </button>
        </div>
        <div className="devPocHelp laUpdated">{lastUpdated(instructions.updatedAt, 'You')}</div>
      </div>

      {data.labEnabled && (
        <div className="devPocCard laCard" id="testing-tools">
          <h3 className="devE-title">{STRINGS.testing}</h3>
          <p className="devE-lead">{STRINGS.testingNote}</p>
          <div className="devE-row">
            <button
              type="button"
              className="devE-pill"
              disabled={busy}
              title={STRINGS.runNowHelp}
              onClick={() => runNow('session')}
            >
              {STRINGS.runNow}
            </button>
            <button
              type="button"
              className="devE-pill"
              disabled={busy}
              title={STRINGS.dreamNowHelp}
              onClick={() => runNow('dream')}
            >
              {STRINGS.dreamNow}
            </button>
          </div>
          <p className="devE-hint laHelper">{STRINGS.runNowHelp}</p>
          <p className="devE-hint laHelper">{STRINGS.dreamNowHelp}</p>
          {runResult && (
            <div className="devE-note laRunResult" role="status">
              {runResult}
            </div>
          )}
          <div className="devE-row laTestRow">
            <span className="laTestLabel" id="laUpdateEveryLabel">
              {STRINGS.updateEvery}
            </span>
            <OnOff
              on={!!testing.updateEveryMessage}
              toggleName="updateEveryMessage"
              labelledBy="laUpdateEveryLabel"
              disabled={busy}
              title={STRINGS.updateEveryHelp}
              onChange={(updateEveryMessage) => act('set_testing', { updateEveryMessage })}
            />
          </div>
          <p className="devE-hint laHelper">{STRINGS.updateEveryHelp}</p>
          <div className="devE-row laTestRow">
            <span className="laTestLabel" id="laPlainResponseLabel">
              {STRINGS.plainResponse}
            </span>
            <OnOff
              on={!!testing.showPlainResponse}
              toggleName="showPlainResponse"
              labelledBy="laPlainResponseLabel"
              disabled={busy}
              title={STRINGS.plainResponseHelp}
              onChange={(showPlainResponse) => act('set_testing', { showPlainResponse })}
            />
          </div>
          <p className="devE-hint laHelper">{STRINGS.plainResponseHelp}</p>
          <div className="devE-row laHealthRow">
            <strong>{STRINGS.health}</strong>
            <button
              type="button"
              className="devE-pill devE-pillSec"
              disabled={busy}
              title={STRINGS.checkHealthHelp}
              onClick={checkHealth}
            >
              {STRINGS.checkHealth}
            </button>
          </div>
          <p className="devE-hint laHelper">{STRINGS.checkHealthHelp}</p>
          {isPlainObject(testing.jobState) &&
            typeof testing.jobState.hourUsed === 'number' &&
            typeof testing.jobState.hourLimit === 'number' && (
              <div className="devE-hint laJobState">
                <div>{`${STRINGS.jobsHour}: ${testing.jobState.hourUsed} of ${testing.jobState.hourLimit}`}</div>
                {typeof testing.jobState.lockHeld === 'boolean' && (
                  <div>{`${STRINGS.jobRunning}: ${testing.jobState.lockHeld ? 'yes' : 'no'}`}</div>
                )}
                {typeof testing.jobState.parked === 'boolean' && (
                  <div>{`${STRINGS.jobParked}: ${testing.jobState.parked ? 'yes' : 'no'}`}</div>
                )}
              </div>
            )}
          {Array.isArray(testing.recentRuns) && testing.recentRuns.some(isPlainObject) && (
            <div className="devE-hint laRuns">
              <strong>{STRINGS.recentRuns}</strong>
              {testing.recentRuns
                .filter(isPlainObject)
                .slice(0, MAX_RUNS)
                .map((run, i) => (
                  <div className="laRunsRow" key={`${String(run.startedAt)}-${i}`}>
                    {`${formatTime(run.startedAt)} · ${String(run.trigger)} · ${String(run.window)} · ${String(run.status)}${
                      run.reason ? `: ${String(run.reason)}` : ''
                    }`}
                  </div>
                ))}
            </div>
          )}
          {health && (
            <div className="devE-hint laHealthResult">
              {health.map((j) => (
                <div key={j.name}>
                  {`${j.name}: last run ${j.lastRunAt || 'never'}, last write ${j.lastWriteAt || 'never'}${j.parked ? ' (parked)' : ''}`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

const LibraryAssistantSettings = (props) => {
  const base = chatbotApiBaseUrl(props);
  const token = props.chatbot_user_token;
  const hasAccess = !!(token && base);
  const from = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('from');
  return (
    <div className="devPocPage libraryAssistantSettings">
      <a className="devE-back" href={safeReturnPath(from)}>
        <img src="/static/icons/arrow-left.svg" alt="" aria-hidden="true" />
        {STRINGS.backToLearning}
      </a>
      <AssistantSwitch initial={readInitialEnabled(props.libraryAssistantEnabled)} />
      <section id="personalization" className="laSection">
        <header className="devPocPageHeader laIntro">
          <div>
            <h2 className="laSectionTitle">{STRINGS.personalization}</h2>
            <p id="about-personalization" className="laSectionAbout">
              {STRINGS.about}
            </p>
          </div>
        </header>
        {hasAccess ? (
          <Personalization base={base} token={token} />
        ) : (
          <div className="devPocCard laCard">
            <p className="devE-hint laMuted">{STRINGS.turnOn}</p>
          </div>
        )}
      </section>
    </div>
  );
};

export default LibraryAssistantSettings;
