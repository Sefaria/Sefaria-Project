import React, { useCallback, useEffect, useRef, useState } from 'react';
import { chatbotApiBaseUrl, laSettings } from './chatbotApi';
import { InterfaceText } from './Misc';
import Input from './common/Input.jsx';
import ToggleSwitch from './common/ToggleSwitch.jsx';
import { useDialogKeys } from './common/useDialogKeys';

// The Library Assistant tab of Settings. The assistant's on/off is a Sefaria profile setting;
// Instructions and Profile live in the assistant's own service and are read and written over HTTP
// with the same signed user token the widget gets (chatbotApi.laSettings).
//
// Design: Penina, 2026-11-18/19 (design/personalized-responses), built on Yotam's POC data layer. Every change
// saves on its own; the page header says "Saving changes…", then "Changes saved". Styled with
// @sefaria/design-system semantic tokens (s2.css, "Library Assistant settings" block). English strings only,
// until Weblate.
//
// ?la_mock=1 (not in production) swaps the server for an in-memory one, to look at the design without the
// personalization server.
const MAX_TEXT = 300;

const STRINGS = {
  title: 'Library Assistant Settings',
  assistant: 'Library Assistant',
  saving: 'Saving changes…',
  saved: 'Changes saved',
  notSaved: 'Changes not saved',
  personalized: 'Personalized answers',
  personalizedAbout:
    'The assistant can tailor its answers to you, based on what it learns about you and the instructions you give it. You can control both below.',
  learnMore: 'Learn more',
  newTab: ' (opens in a new tab)',
  turnOn: 'Turn on the Library Assistant to activate personalized answers.',
  loading: 'Loading…',
  profile: 'Profile',
  profileAbout: 'This information is gathered by the assistant from your questions. Sensitive details are never saved.',
  profileEmpty: 'As you use the Library Assistant, it will start to remember things about you and record them here.',
  justUpdated: 'Just updated',
  clear: 'Clear profile',
  clearTitle: 'Clear your profile?',
  clearText:
    'The assistant forgets everything it has learned about you and starts again from your next question. This can’t be undone.',
  cancel: 'Cancel',
  editLabel: 'Want to make changes to your profile? Tell the assistant what to change.',
  update: 'Update profile',
  updating: 'Updating…',
  instructions: 'Your instructions',
  instructionsAbout: 'The Library Assistant will keep these in mind as it responds to you.',
  instructionsPlaceholder:
    'For example: Answer in English, keep it short, and show the Hebrew source with a translation.',
  tooLong: `Keep it to ${MAX_TEXT} characters. Longer instructions aren’t saved.`,
  testing: 'Testing tools',
  testingNote: 'These tools appear only on test deployments.',
  runNow: 'Run now',
  dreamNow: 'Dream now',
  updateEvery: 'Update after every message',
  plainResponse: 'Include non-personalized response',
  health: 'Job health',
  checkHealth: 'Check job health',
  runNowHelp: 'Runs one Profile update now, from recent questions, to test a change without waiting.',
  dreamNowHelp: 'Runs the deeper Profile update now, over a wider set of questions, to check the full pass.',
  updateEveryHelp: 'Updates the Profile after every message instead of on the usual schedule, to watch changes land.',
  plainResponseHelp: 'Adds an answer without personalization to each reply, to compare it with the personalized one.',
  checkHealthHelp:
    'Shows when each Profile job last ran and wrote, and whether it is paused, for when updates seem to stop.',
  jobsHour: 'Profile updates this hour',
  jobRunning: 'Job running',
  jobParked: 'Paused after repeated failures',
  recentRuns: 'Recent runs',
  notAvailable: 'Personalization is not available here.',
  onWithoutToken: 'Your personalized answers settings will show here the next time you open this page.',
  notAvailableNoPreview:
    'Personalization is not available here. Open the test link you were sent; this page is not connected to the personalization test server.',
  signIn: 'Reload the page to sign in again.',
  quota: 'Too many changes. Try again in a while.',
  jobQuota: 'Hourly limit reached. Try again later.',
  unreachable: 'Could not reach the Library Assistant. Try again.',
  tryAgain: 'Try again',
  settingFailed: 'Could not save the setting. Try again.',
};

const T = ({ children }) => <InterfaceText text={{ en: children, he: children }} />;

// A page with no preview server is one whose API base is not a `*.ai-server.coolifydev.sefaria.org` preview.
export const isPreviewBase = (base) => {
  try {
    return /^\d+\.ai-server\.coolifydev\.sefaria\.org$/.test(new URL(base).hostname.toLowerCase());
  } catch (e) {
    return false;
  }
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const MAX_RUNS = 10;
// The first read gives up after this long, so a server that never answers ends in an error with
// Try again, not an endless "Loading…".
export const LOAD_TIMEOUT_MS = 15000;
// Instructions save themselves this long after typing stops (and on leaving the field).
export const INSTRUCTIONS_SAVE_MS = 800;
// A write that gets no answer in this time fails, so the serial queue moves on.
export const MUTATION_TIMEOUT_MS = 20000;

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
    : date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const PROFILE_AUTHOR = { la: 'the assistant', you_la: 'the assistant, at your request' };
const lastUpdated = (updatedAt, by) =>
  updatedAt ? `Last updated ${formatTime(updatedAt)}${by ? ` by ${by}` : ''}` : 'Never updated';

// The Profile is markdown-ish text: "# Heading" lines and paragraphs under them. Rendered as plain text
// nodes (never as HTML).
export const parseSections = (text) => {
  const sections = [];
  let current = null;
  (text || '').split('\n').forEach((line) => {
    const heading = /^\s*#{1,6}\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      current = { heading: heading[1], body: [] };
      sections.push(current);
    } else if (line.trim() || current) {
      if (!current) {
        current = { heading: null, body: [] };
        sections.push(current);
      }
      current.body.push(line.trimEnd());
    }
  });
  // A section keeps its line breaks and its blank-line paragraph breaks (several blank lines count as one);
  // `body` is the whole section text, so changedSectionIndex compares whole sections.
  return sections.map((s) => ({
    ...s,
    body: s.body
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  }));
};
// A section's paragraphs: its body split on blank lines. Each renders as its own <p> (single line breaks are kept
// by CSS white-space: pre-wrap).
const paragraphsOf = (body) => (body ? body.split('\n\n') : []);
// Sections are matched by heading and by how many times it has appeared so far, so a repeated heading does not
// collide; the untitled first section (heading null) is matched like any other.
const sectionKeys = (sections) => {
  const seen = new Map();
  return sections.map((s) => {
    const n = seen.get(s.heading) || 0;
    seen.set(s.heading, n + 1);
    return `${s.heading === null ? '' : `#${s.heading}`}@${n}`;
  });
};
// The index (in the new Profile) of the first section whose text changed, or that is new (for "Just updated");
// null when nothing changed.
export const changedSectionIndex = (before, after) => {
  const prev = parseSections(before);
  const prevKeys = sectionKeys(prev);
  const old = new Map(prev.map((s, i) => [prevKeys[i], s.body]));
  const next = parseSections(after);
  const nextKeys = sectionKeys(next);
  const hit = next.findIndex((s, i) => old.get(nextKeys[i]) !== s.body);
  return hit === -1 ? null : hit;
};

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

/* ---------- ?la_mock=1: an in-memory server, for looking at the design ---------- */

// The mock is for looks, so it is denied unless the host is known to be a development one: this machine, a
// cauldron (`*.cauldron.sefaria.org`) or a preview deployment. A trailing DNS dot (www.sefaria.org.) names the same host.
const MOCK_HOSTS =
  /^(localhost|127\.0\.0\.1|\[?::1\]?|([a-z0-9-]+\.)+cauldron\.sefaria\.org|\d+\.ai-server\.coolifydev\.sefaria\.org)$/;
export const shouldMock = (hostname, search) => {
  const host = String(hostname).toLowerCase().replace(/\.$/, '');
  if (!MOCK_HOSTS.test(host)) return false;
  return new URLSearchParams(search).get('la_mock') === '1';
};
// Read once, when the script loads (unlike the hash): the app rewrites the address bar (dropping the query) before
// the tab renders. It is only used through `useMock`, whose first render is always false: the server render has no
// window, so a first render that read ?la_mock=1 would not match it (hydration).
const MOCK = (() => {
  try {
    return shouldMock(window.location.hostname, window.location.search);
  } catch (e) {
    return false;
  }
})();
// Not a hook: a flag held in state, false on the first render and set after mount.
const useMock = () => {
  const [mock, setMock] = useState(false);
  useEffect(() => {
    if (MOCK) setMock(true);
  }, []);
  return mock;
};
// The chat's "Configure here" links to #personalization, "Learn more" to #about-personalization. Read when the
// tab becomes active (and its data is loaded), so in-app navigation to the tab with a hash works too.
const currentHash = () => {
  try {
    return window.location.hash;
  } catch (e) {
    return '';
  }
};
const scrollToId = (id) => {
  const el = typeof document !== 'undefined' && document.getElementById(id);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
};
const MOCK_PROFILE = [
  '# How you learn',
  'You like short answers that quote the source first and explain it in a few sentences.',
  "# What you're studying",
  'You are comparing how Rambam and Ramban read the same verses in Genesis.',
  '# What you write',
  'You write a short d’var Torah every week for your community newsletter.',
].join('\n');
// `store` is a ref owned by the mounted panel, so the mock's state never outlives it.
const mockLaSettings = (store, action, body = {}) =>
  new Promise((resolve) => {
    const now = new Date().toISOString();
    if (!store.current) {
      store.current = {
        instructions: { text: '', enabled: true, updatedAt: null },
        profile: { text: MOCK_PROFILE, enabled: true, updatedAt: '2026-11-17T14:14:00', updatedBy: 'la' },
        labEnabled: true,
        testing: { updateEveryMessage: false, showPlainResponse: true, jobState: { hourUsed: 2, hourLimit: 20 } },
      };
    }
    const s = store.current;
    let out = s;
    if (action === 'toggle') s[body.target] = { ...s[body.target], enabled: body.enabled };
    if (action === 'set_instructions') s.instructions = { ...s.instructions, text: body.text, updatedAt: now };
    if (action === 'clear_profile') s.profile = { ...s.profile, text: '', updatedAt: now, updatedBy: 'you_la' };
    if (action === 'set_testing') s.testing = { ...s.testing, ...body };
    if (action === 'edit_profile') {
      if (/\b(prefer|only)\b.*\b(commentar|rashi|ramban|rambam)/i.test(body.request)) {
        out = {
          edit: {
            status: 'refused',
            reason:
              'Preferring some commentaries over others belongs in your instructions, where you choose the words.',
          },
        };
      } else {
        s.profile = {
          ...s.profile,
          text: `${s.profile.text}${s.profile.text ? '\n' : ''}# Also\nYou told the assistant: ${body.request}`,
          updatedAt: now,
          updatedBy: 'you_la',
        };
        out = { ...s, edit: { status: 'applied' } };
      }
    }
    if (action === 'run_now') out = { ...s, run: { status: 'no_change', reason: 'no_new_prompts' } };
    if (action === 'health') out = { jobs: [{ name: 'session', lastRunAt: now, lastWriteAt: now, parked: false }] };
    setTimeout(() => resolve(JSON.parse(JSON.stringify(out))), action === 'edit_profile' ? 900 : 400);
  });

/* ---------- Pieces ---------- */

/* A label (and a helper line) with its control at the end of the row: developer settings' "Limit to your website" row. */
const SwitchRow = ({ name, label, hint, on, onChange, disabled }) => (
  <div className="laSwitchRow">
    <div className="laSwitchText">
      <span className="laSwitchLabel" id={`${name}-label`}>
        <T>{label}</T>
      </span>
      {hint ? (
        <p className="laHint" id={`${name}-hint`}>
          <T>{hint}</T>
        </p>
      ) : null}
    </div>
    <ToggleSwitch name={name} isChecked={!!on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
  </div>
);

const ToolRow = ({ name, label, hint, children }) => (
  <div className="laSwitchRow">
    <div className="laSwitchText">
      <span className="laSwitchLabel" id={`${name}-label`}>
        <T>{label}</T>
      </span>
      <p className="laHint" id={`${name}-hint`}>
        <T>{hint}</T>
      </p>
    </div>
    {children}
  </div>
);

/* A card title with its switch on the same row: the title is the switch's label. */
const CardHead = ({ name, title, hint, on, disabled, onChange }) => (
  <div className="laCardHead">
    <div className="laCardHeadText">
      <h3 className="laCardTitle" id={`${name}-label`}>
        <T>{title}</T>
      </h3>
      {hint ? (
        <p className="laHint" id={`${name}-hint`}>
          <T>{hint}</T>
        </p>
      ) : null}
    </div>
    {onChange ? (
      <ToggleSwitch name={name} isChecked={!!on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    ) : null}
  </div>
);

const Counter = ({ length }) => (
  <span className={'laCount' + (length > MAX_TEXT ? ' laCountOver' : '')} aria-live="polite">
    {`${length} / ${MAX_TEXT}`}
  </span>
);

/* Top right of the page header, where developer settings has its links. Nothing until the first change. */
/* `draft`: the Instructions text is 'clean', 'dirty' (typed, the save not started yet: say nothing) or 'over' (too
   long, never sent: "Changes not saved"). The element stays in the page, so a screen reader announces the text
   whenever it appears. */
const SaveStatus = ({ saving, saved, draft = 'clean' }) => (
  <p
    className={'laSaveStatus' + ((saved === 'fail' && !saving) || draft === 'over' ? ' laSaveStatusFail' : '')}
    role="status"
    aria-live="polite"
  >
    {draft === 'over' ? (
      <T>{STRINGS.notSaved}</T>
    ) : draft === 'dirty' ? null : saving ? (
      <>
        <span className="laSpinner" aria-hidden="true" />
        <T>{STRINGS.saving}</T>
      </>
    ) : saved === 'fail' ? (
      <T>{STRINGS.notSaved}</T>
    ) : saved ? (
      <>
        <svg className="laSavedIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <T>{STRINGS.saved}</T>
      </>
    ) : null}
  </p>
);

/* Developer settings' delete dialog: the same keys and focus (Cancel first, Escape closes). */
const ClearDialog = ({ onClear, onCancel }) => {
  const cancelRef = useRef(null);
  useDialogKeys(cancelRef, onCancel);
  return (
    <div
      className="devPocModalStage laDialogStage"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="laClearTitle"
      aria-describedby="laClearText"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <section className="laDialog">
        <h3 id="laClearTitle">
          <T>{STRINGS.clearTitle}</T>
        </h3>
        <p id="laClearText">
          <T>{STRINGS.clearText}</T>
        </p>
        <div className="laDialogActions">
          <button type="button" className="laButton laButtonDanger" onClick={onClear}>
            <T>{STRINGS.clear}</T>
          </button>
          <button type="button" className="laButton laButtonSecondary" ref={cancelRef} onClick={onCancel}>
            <T>{STRINGS.cancel}</T>
          </button>
        </div>
      </section>
    </div>
  );
};

/* ---------- Personalization: Profile, Instructions, Testing tools ---------- */

// The actions that write a setting or the profile.
const SAVE_ACTIONS = new Set(['toggle', 'set_instructions', 'set_testing', 'clear_profile', 'edit_profile']);

const Personalization = ({ base, token, off, onSaving, onDirty, active, mock }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [inFlight, setInFlight] = useState(0);
  const busy = inFlight > 0;
  const [draft, setDraft] = useState('');
  const savedDraft = useRef('');
  const latestDraft = useRef('');
  const mockStore = useRef(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [editRequest, setEditRequest] = useState('');
  const [editing, setEditing] = useState(false);
  const [refusal, setRefusal] = useState(null);
  const [changed, setChanged] = useState(null);
  const [runResult, setRunResult] = useState(null);
  // A switch stays clickable while something saves and shows what the reader chose until its own save, queued
  // behind the others, is answered; then the server's value (Penina, 2026-11-25).
  const [wanted, setWanted] = useState({});
  const wantedSeq = useRef({});
  const flip = (key, value, action, body) => {
    const seq = (wantedSeq.current[key] || 0) + 1;
    wantedSeq.current[key] = seq;
    setWanted((w) => ({ ...w, [key]: value }));
    Promise.resolve(act(action, body)).finally(() => {
      if (!mounted.current || wantedSeq.current[key] !== seq) return;
      setWanted((w) => {
        const rest = { ...w };
        delete rest[key];
        return rest;
      });
    });
  };
  const chosen = (key, serverValue) => (key in wanted ? wanted[key] : serverValue);
  const [health, setHealth] = useState(null);
  const mounted = useRef(true);
  const saveTimer = useRef(null);
  // Every mutating action runs one after another through this chain, so replies land in the order the actions were
  // sent and an older State can never replace a newer one.
  const queue = useRef(Promise.resolve());
  // Writes still waiting in, or running through, the queue.
  const outstanding = useRef(0);
  // The last instructions text put on the queue (not the last one acknowledged): a save is queued whenever the
  // field differs from it, which includes going back to the acknowledged text while a write is still out.
  const queuedDraft = useRef('');
  // Called when the tab goes away: a write of unqueued text goes behind any outstanding ones (the queue outlives
  // the component). Every instructions write is keepalive, so one already running survives unload. Residual: on a
  // full page unload, a write still waiting in the queue may never be sent; doing better needs server-side
  // revisions. Kept in a ref so it sees the latest props.
  const teardownSave = useRef(() => {});
  teardownSave.current = (keepalive) => {
    clearTimeout(saveTimer.current);
    const text = latestDraft.current;
    if (mock || text === queuedDraft.current || text.length > MAX_TEXT) return;
    enqueueDraft(text, keepalive ? { keepalive: true } : {});
  };
  useEffect(() => {
    const onPageHide = () => teardownSave.current(true);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      mounted.current = false;
      teardownSave.current(false);
    };
  }, []);

  // Runs one action. On success returns the response; `accept` says what a usable reply looks like
  // (a State by default). On failure, or a reply that is not usable, sets the message and returns null.
  // Every action but the reads counts as a save for the header's status.
  const call = useCallback(
    async (action, body, accept = isState, onQuota, sendOpts = {}) => {
      // Only real writes count as saves (header status, serial queue). Reads and job triggers (run_now, dream, ...)
      // do not: a 429 on a trigger must not leave "Changes not saved".
      const saves = SAVE_ACTIONS.has(action);
      const saveKey =
        action === 'toggle'
          ? `toggle:${body && body.target}`
          : action === 'set_testing'
            ? `set_testing:${Object.keys(body || {})
                .sort()
                .join(',')}`
            : action;
      if (mounted.current) {
        setError(null);
        setInFlight((n) => n + 1);
      }
      if (saves) onSaving(1);
      let ok = false;
      const send = () =>
        mock
          ? mockLaSettings(mockStore, action, body)
          : laSettings(
              base,
              token,
              action,
              body,
              action === 'get' ? { timeoutMs: LOAD_TIMEOUT_MS } : { timeoutMs: MUTATION_TIMEOUT_MS, ...sendOpts }
            );
      try {
        let res;
        if (saves) {
          // Nothing outstanding: send right now (a teardown cannot wait for a microtask hop).
          const idle = outstanding.current === 0;
          outstanding.current += 1;
          const turn = idle ? Promise.resolve(send()) : queue.current.then(send);
          queue.current = turn.catch(() => {});
          res = await turn;
        } else {
          res = await send();
        }
        if (!accept(res)) throw new Error('unexpected response');
        ok = true;
        return res;
      } catch (e) {
        // `onQuota`: a caller with its own result area shows the hourly limit there, not as the page error
        if (e && e.status === 429 && onQuota) {
          if (mounted.current) onQuota();
        } else if (mounted.current) setError(errorMessage(e, isPreviewBase(base)));
        return null;
      } finally {
        if (saves) outstanding.current -= 1;
        if (mounted.current) setInFlight((n) => Math.max(0, n - 1));
        if (saves) onSaving(-1, ok ? 'ok' : 'fail', saveKey);
      }
    },
    [base, token, mock, onSaving]
  );

  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await call('get');
      if (cancelled || !res) return;
      setData(res);
      setDraft(res.instructions.text || '');
      savedDraft.current = res.instructions.text || '';
      latestDraft.current = res.instructions.text || '';
      queuedDraft.current = res.instructions.text || '';
    })();
    return () => {
      cancelled = true;
    };
  }, [call, loadAttempt]);

  // Arriving from the chat's "Configure here" (#personalization) lands on the Profile (Penina, 2026-11-19).
  // The hash is read when the tab becomes active and its data is there, once per activation (the panel is mounted
  // hidden, so nothing could scroll before that).
  const scrolled = useRef(false);
  useEffect(() => {
    if (!active) {
      scrolled.current = false;
      return;
    }
    if (!data || scrolled.current) return;
    scrolled.current = true;
    const hash = currentHash();
    if (hash === '#personalization' || hash === '#profile') scrollToId('profile');
    if (hash === '#about-personalization') scrollToId('about-personalization');
  }, [data, active]);
  // A dialog left open on a tab that was switched away from would keep taking the Tab key.
  useEffect(() => {
    if (!active) setConfirmClear(false);
  }, [active]);

  const act = async (action, body, accept, onQuota, sendOpts) => {
    const res = await call(action, body, accept, onQuota, sendOpts);
    if (mounted.current && isState(res)) setData(res);
    return res;
  };

  // Queues one write of `text`. `savedDraft` moves only when the reply is a usable State; a write that fails frees
  // its text to be queued again.
  const enqueueDraft = async (text, sendOpts) => {
    queuedDraft.current = text;
    // Every instructions write is keepalive (the text is at most MAX_TEXT characters), so one still running when
    // the page unloads is not cancelled.
    const res = await act('set_instructions', { text }, isState, undefined, { ...sendOpts, keepalive: true });
    if (res) savedDraft.current = text;
    else if (queuedDraft.current === text) queuedDraft.current = savedDraft.current;
  };
  const saveDraft = () => {
    clearTimeout(saveTimer.current);
    const text = latestDraft.current;
    // Reported before the write starts, so the header goes from "nothing" straight to "Saving changes…".
    if (onDirty) onDirty(text.length > MAX_TEXT ? 'over' : 'clean');
    if (text !== queuedDraft.current && text.length <= MAX_TEXT) enqueueDraft(text);
  };
  // Tells the header whether the typed text is waiting to be saved ('dirty'), too long to be saved ('over'), or not.
  const reportDraft = (text) => {
    if (!onDirty) return;
    onDirty(text.length > MAX_TEXT ? 'over' : text !== queuedDraft.current ? 'dirty' : 'clean');
  };
  const onDraft = (text) => {
    setDraft(text);
    latestDraft.current = text;
    reportDraft(text);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveDraft, INSTRUCTIONS_SAVE_MS);
  };
  const sendEdit = async () => {
    const request = editRequest.trim();
    if (!request || busy || off || !data.profile.enabled) return;
    const before = data.profile.text;
    setEditing(true);
    setRefusal(null);
    setChanged(null);
    const res = await act('edit_profile', { request }, acceptEdit);
    if (!mounted.current) return;
    setEditing(false);
    if (!res) return;
    if (res.edit && res.edit.status === 'refused') {
      setRefusal(res.edit.reason);
      return;
    }
    setEditRequest((current) => (current.trim() === request ? '' : current));
    setChanged(changedSectionIndex(before, res.profile.text));
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
    return error ? (
      <div className="laCard">
        <p className="laMessage laError" role="alert">
          {error}
        </p>
        <div className="laActions">
          <button
            type="button"
            className="laButton laButtonSecondary"
            disabled={busy}
            onClick={() => setLoadAttempt((n) => n + 1)}
          >
            <T>{STRINGS.tryAgain}</T>
          </button>
        </div>
      </div>
    ) : (
      <p className="laHint">
        <T>{STRINGS.loading}</T>
      </p>
    );
  }

  const { instructions, profile, testing } = data;
  const sections = parseSections(profile.text);
  const over = draft.length > MAX_TEXT;
  const profileOn = !!chosen('profile', profile.enabled) && !off;
  const instructionsOn = !!chosen('instructions', instructions.enabled) && !off;
  return (
    <>
      {error ? (
        <p className="laMessage laError" role="alert">
          {error}
        </p>
      ) : null}

      {/* Profile first: it changes without the user doing anything, and it is what the chat's "Configure here" link
          comes to check. */}
      <section className="laCard" id="profile" aria-labelledby="laProfile-label">
        <CardHead
          name="laProfile"
          title={STRINGS.profile}
          hint={STRINGS.profileAbout}
          on={profileOn}
          disabled={off}
          onChange={(enabled) => flip('profile', enabled, 'toggle', { target: 'profile', enabled })}
        />
        {/* Off: what's under the switch is grayed, so it's clear it isn't in effect. */}
        <div className={'laBody' + (profileOn ? '' : ' laBodyOff')}>
          {sections.length ? (
            <ul className="laProfileList">
              {sections.map((s, i) => (
                <li key={i} className="laProfileItem">
                  {s.heading ? <h4 className="laProfileHeading">{s.heading}</h4> : null}
                  {paragraphsOf(s.body).map((para, j) => (
                    <p key={j} className="laProfileBody laProfileParagraph">
                      {para}
                    </p>
                  ))}
                  {changed !== null && i === changed ? (
                    <span className="laBadge">
                      <T>{STRINGS.justUpdated}</T>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="laEmpty">
              <p className="laProfileBody">
                <T>{STRINGS.profileEmpty}</T>
              </p>
            </div>
          )}
          {/* Clear profile sits with what it clears: under the profile, beside when it was last updated. */}
          <div className="laProfileMetaRow">
            <p className="laMeta">{lastUpdated(profile.updatedAt, PROFILE_AUTHOR[profile.updatedBy])}</p>
            <button
              type="button"
              className="laButton laButtonDangerSecondary"
              disabled={off || busy || !sections.length}
              onClick={() => setConfirmClear(true)}
            >
              <T>{STRINGS.clear}</T>
            </button>
          </div>
          <div className="laEdit">
            <Input
              id="laEdit"
              label={STRINGS.editLabel}
              multiline
              rows={2}
              maxLength={MAX_TEXT}
              value={editRequest}
              disabled={!profileOn}
              dir="auto"
              fieldAddon={<Counter length={editRequest.length} />}
              onChange={(e) => setEditRequest(e.target.value)}
              onKeyDown={(e) => {
                // Not the Enter that confirms an IME composition
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  sendEdit();
                }
              }}
              error={refusal}
            />
            <div className="laActions">
              <button
                type="button"
                className="laButton laButtonPrimary"
                aria-disabled={busy || !profileOn || !editRequest.trim() ? 'true' : undefined}
                onClick={sendEdit}
              >
                <T>{editing ? STRINGS.updating : STRINGS.update}</T>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="laCard" id="instructions" aria-labelledby="laInstructions-label">
        <CardHead
          name="laInstructions"
          title={STRINGS.instructions}
          hint={STRINGS.instructionsAbout}
          on={instructionsOn}
          disabled={off}
          onChange={(enabled) => flip('instructions', enabled, 'toggle', { target: 'instructions', enabled })}
        />
        <div className={'laBody' + (instructionsOn ? '' : ' laBodyOff')}>
          <Input
            id="laInstructionsText"
            multiline
            rows={4}
            aria-labelledby="laInstructions-label"
            placeholder={STRINGS.instructionsPlaceholder}
            value={draft}
            disabled={off}
            dir="auto"
            onChange={(e) => onDraft(e.target.value)}
            onBlur={saveDraft}
            error={over ? STRINGS.tooLong : null}
            fieldAddon={<Counter length={draft.length} />}
          />
          <p className="laMeta">{lastUpdated(instructions.updatedAt, instructions.updatedAt && 'you')}</p>
        </div>
      </section>

      {data.labEnabled ? (
        <section className="laCard laCardTools" id="testing-tools" aria-labelledby="laTools">
          <div className="laCardHeadText">
            <h3 className="laCardTitle" id="laTools">
              <T>{STRINGS.testing}</T>
            </h3>
            <p className="laHint">
              <T>{STRINGS.testingNote}</T>
            </p>
          </div>
          <ToolRow name="laRunNow" label={STRINGS.runNow} hint={STRINGS.runNowHelp}>
            <button
              type="button"
              className="laButton laButtonSecondary"
              aria-describedby="laRunNow-hint"
              disabled={busy || off}
              onClick={() => runNow('session')}
            >
              <T>{STRINGS.runNow}</T>
            </button>
          </ToolRow>
          <ToolRow name="laDreamNow" label={STRINGS.dreamNow} hint={STRINGS.dreamNowHelp}>
            <button
              type="button"
              className="laButton laButtonSecondary"
              aria-describedby="laDreamNow-hint"
              disabled={busy || off}
              onClick={() => runNow('dream')}
            >
              <T>{STRINGS.dreamNow}</T>
            </button>
          </ToolRow>
          {runResult ? (
            <p className="laMessage laRunResult" role="status">
              {runResult}
            </p>
          ) : null}
          <SwitchRow
            name="laEvery"
            label={STRINGS.updateEvery}
            hint={STRINGS.updateEveryHelp}
            on={!!chosen('updateEveryMessage', testing.updateEveryMessage) && !off}
            disabled={off}
            onChange={(updateEveryMessage) =>
              flip('updateEveryMessage', updateEveryMessage, 'set_testing', { updateEveryMessage })
            }
          />
          <SwitchRow
            name="laPlain"
            label={STRINGS.plainResponse}
            hint={STRINGS.plainResponseHelp}
            on={!!chosen('showPlainResponse', testing.showPlainResponse) && !off}
            disabled={off}
            onChange={(showPlainResponse) =>
              flip('showPlainResponse', showPlainResponse, 'set_testing', { showPlainResponse })
            }
          />
          <ToolRow name="laHealth" label={STRINGS.health} hint={STRINGS.checkHealthHelp}>
            <button
              type="button"
              className="laButton laButtonSecondary"
              aria-describedby="laHealth-hint"
              disabled={busy || off}
              onClick={checkHealth}
            >
              <T>{STRINGS.checkHealth}</T>
            </button>
          </ToolRow>
          {health ? (
            <div className="laMessage laHealthResult" role="status">
              {health.map((j) => (
                <div key={j.name}>
                  {`${j.name}: last run ${j.lastRunAt || 'never'}, last write ${j.lastWriteAt || 'never'}${
                    j.parked ? ' (parked)' : ''
                  }`}
                </div>
              ))}
            </div>
          ) : null}
          {isPlainObject(testing.jobState) &&
          typeof testing.jobState.hourUsed === 'number' &&
          typeof testing.jobState.hourLimit === 'number' ? (
            <div className="laMessage laJobState">
              <div>{`${STRINGS.jobsHour}: ${testing.jobState.hourUsed} of ${testing.jobState.hourLimit}`}</div>
              {typeof testing.jobState.lockHeld === 'boolean' ? (
                <div>{`${STRINGS.jobRunning}: ${testing.jobState.lockHeld ? 'yes' : 'no'}`}</div>
              ) : null}
              {typeof testing.jobState.parked === 'boolean' ? (
                <div>{`${STRINGS.jobParked}: ${testing.jobState.parked ? 'yes' : 'no'}`}</div>
              ) : null}
            </div>
          ) : null}
          {Array.isArray(testing.recentRuns) && testing.recentRuns.some(isPlainObject) ? (
            <div className="laMessage laRuns">
              <strong>{STRINGS.recentRuns}</strong>
              {testing.recentRuns
                .filter(isPlainObject)
                .slice(0, MAX_RUNS)
                .map((run, i) => (
                  <div className="laRunsRow" key={`${String(run.startedAt)}-${i}`}>
                    {`${formatTime(run.startedAt)} · ${String(run.trigger)} · ${String(run.window)} · ${String(
                      run.status
                    )}${run.reason ? `: ${String(run.reason)}` : ''}`}
                  </div>
                ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {confirmClear ? (
        <ClearDialog
          onCancel={() => setConfirmClear(false)}
          onClear={async () => {
            setConfirmClear(false);
            setChanged(null);
            await act('clear_profile');
          }}
        />
      ) : null}
    </>
  );
};

/* ---------- The tab ---------- */

const LibraryAssistantSettings = ({ active = true, ...props }) => {
  const base = chatbotApiBaseUrl(props);
  const token = props.chatbot_user_token;
  const mock = useMock();
  const hasAccess = mock || !!(token && base);
  const [assistantOn, setAssistantOn] = useState(!!props.libraryAssistantEnabled);
  const [settingError, setSettingError] = useState(null);
  const [pending, setPending] = useState(0);
  const [saved, setSaved] = useState(false);
  const [draftState, setDraftState] = useState('clean');
  const inFlight = useRef(false);
  // The server's value as last confirmed, and a value chosen while a save was running (sent when it ends).
  const acked = useRef(!!props.libraryAssistantEnabled);
  const wantedAssistant = useRef(null);
  const tabMounted = useRef(true);
  useEffect(
    () => () => {
      tabMounted.current = false;
    },
    []
  );
  // Follow the acknowledged setting (a save that finished after this panel was remounted updates the page, not
  // this panel's own request), except while this panel's own optimistic change is in flight.
  useEffect(() => {
    acked.current = !!props.libraryAssistantEnabled;
    if (!inFlight.current) setAssistantOn(!!props.libraryAssistantEnabled);
  }, [props.libraryAssistantEnabled]);
  // `result`: 'ok' or 'fail' when a save of `kind` (the action) ends. The header says "Changes saved" only when no
  // kind's latest save failed: a later toggle that succeeds does not hide unsaved instructions.
  const failedKinds = useRef(new Set());
  const onDirty = useCallback((state) => {
    if (tabMounted.current) setDraftState(state);
  }, []);
  const onSaving = useCallback((delta, result, kind = 'other') => {
    // A write queued at unmount finishes after the tab is gone.
    if (!tabMounted.current) return;
    setPending((n) => Math.max(0, n + delta));
    if (!result) return;
    if (result === 'fail') failedKinds.current.add(kind);
    else failedKinds.current.delete(kind);
    setSaved(failedKinds.current.size ? 'fail' : 'ok');
  }, []);

  // The assistant's on/off is a Sefaria profile setting. It saves at once, with no page reload (Penina, 2026-11-19).
  // ⚠ For engineering: turning it off takes effect at once: `onAssistantChanged(false)` reaches ReaderApp, which
  // hides the widget (and the LibraryAssistantContext). Turning it on shows the widget again only if the page was
  // loaded with it, and the user token personalization needs arrives with the next page load: turned on from off,
  // this page has no token yet (see `onWithoutToken`).
  // The switch stays clickable while it saves (Penina, 2026-11-25): a click during a save shows at once and is
  // sent when the running save ends, unless it puts back the value the server already has.
  const setAssistant = (on) => {
    if (mock) {
      setAssistantOn(on);
      setSaved('ok');
      return;
    }
    setAssistantOn(on);
    setSettingError(null);
    if (inFlight.current) {
      wantedAssistant.current = on;
      return;
    }
    sendAssistant(on);
  };
  const sendNextAssistant = () => {
    const next = wantedAssistant.current;
    wantedAssistant.current = null;
    if (next !== null && next !== acked.current) sendAssistant(next);
  };
  const sendAssistant = (on) => {
    inFlight.current = true;
    onSaving(1);
    const fail = () => {
      inFlight.current = false;
      onSaving(-1, 'fail', 'assistant');
      const waiting = wantedAssistant.current !== null;
      sendNextAssistant();
      if (!tabMounted.current) return;
      setSettingError(STRINGS.settingFailed);
      if (!waiting) setAssistantOn(acked.current);
    };
    // Anything but a JSON object without an error (a login page handed back with status 200 when the session
    // ended, for one) is a failure.
    const isJsonAnswer = (data) => typeof data === 'object' && data !== null;
    // jQuery, so the page's CSRF setup applies; the endpoint takes a form field named "json".
    const request = $.ajax({
      url: '/api/profile',
      method: 'POST',
      data: { json: JSON.stringify({ settings: { library_assistant: on } }) },
      // A request that never settles would keep the switch saving and the header saving
      timeout: MUTATION_TIMEOUT_MS,
      success: (data) => {
        if (!isJsonAnswer(data) || data.error) {
          fail();
          return;
        }
        inFlight.current = false;
        acked.current = on;
        onSaving(-1, 'ok', 'assistant');
        if (props.onAssistantChanged) props.onAssistantChanged(on);
        sendNextAssistant();
      },
    });
    if (request && request.fail) request.fail(fail);
  };

  const off = !assistantOn;
  return (
    <div className="devPocPage laTabPage">
      <div className="laSettings">
        <header className="laPageHeader">
          <h1>
            <T>{STRINGS.title}</T>
          </h1>
          <SaveStatus saving={pending > 0} saved={saved} draft={draftState} />
        </header>

        <section className="laCard" id="libraryAssistantSetting" aria-labelledby="laAssistant-label">
          <SwitchRow name="laAssistant" label={STRINGS.assistant} on={assistantOn} onChange={setAssistant} />
          {settingError ? (
            <p className="laMessage laError" role="alert">
              {settingError}
            </p>
          ) : null}
        </section>

        {/* Assistant off: the note on top, everything under it grayed and out of reach. */}
        {off ? (
          <p className="laOffNote">
            <T>{STRINGS.turnOn}</T>
          </p>
        ) : null}
        <div id="personalization" className={'laGroup' + (off ? ' laGroupOff' : '')} inert={off ? 'true' : undefined}>
          <div className="laSectionHead">
            <h2 className="laH2">
              <T>{STRINGS.personalized}</T>
            </h2>
            <p className="laHint" id="about-personalization">
              <T>{STRINGS.personalizedAbout}</T>{' '}
              <a className="laLink" href="/help" target="_blank" rel="noopener noreferrer">
                <T>{STRINGS.learnMore}</T>
                <span className="sr-only">{STRINGS.newTab}</span>
              </a>
            </p>
          </div>
          {hasAccess ? (
            <Personalization
              base={base}
              token={token}
              off={off}
              onSaving={onSaving}
              onDirty={onDirty}
              active={active}
              mock={mock}
            />
          ) : (
            <section className="laCard">
              <p className="laHint">
                <T>{off ? STRINGS.turnOn : !token ? STRINGS.onWithoutToken : STRINGS.notAvailableNoPreview}</T>
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default LibraryAssistantSettings;
