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
  profileEmpty: 'LA will remember things about you as you move forward in your Sefaria career',
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
  signIn: 'Reload the page to sign in again.',
  quota: 'Too many changes. Try again in a while.',
  unreachable: 'Could not reach the Library Assistant. Try again.',
  settingFailed: 'Could not save the setting. Try again.',
  personalization: 'Personalization',
  settingDescription: 'Turn the assistant on or off for your account.',
  instructionsDescription: 'Standing instructions that shape how the assistant answers you. You write these.',
  profileDescription: 'What the assistant has learned about how you learn. It writes this from your questions.',
  testingNote: 'These tools appear only on test deployments.',
};

const errorMessage = (e) => {
  if (e && e.status === 404) return STRINGS.notAvailable;
  if (e && e.status === 401) return STRINGS.signIn;
  if (e && e.status === 429) return STRINGS.quota;
  if (e && e.status === 400 && e.body && e.body.error === 'too_long') return `Keep it to ${e.body.max} characters.`;
  return STRINGS.unreachable;
};

const lastUpdated = (updatedAt, by) => {
  if (!updatedAt) return 'Last updated: Never';
  const date = new Date(updatedAt);
  const when = isNaN(date)
    ? updatedAt
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  return `Last updated: ${when}${by ? ` by ${by}` : ''}`;
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

const ProfileText = ({ text }) => (
  <div className="laProfileText">
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
      <p className="laMuted">{STRINGS.profileEmpty}</p>
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
    <div className="toggleSet toggleSetToggleBox blueStyle doubleOption" role="radiogroup" aria-labelledby={labelledBy}>
      {values.map((value, i) => (
        <button
          key={String(value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          className={`toggleOption${on === value ? ' on' : ''}`}
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

const OnOff = ({ on, onChange, toggleName, disabled, labelledBy }) => (
  <OnOffGroup
    on={on}
    onSelect={onChange}
    disabled={disabled}
    labelledBy={labelledBy}
    optionAttrs={(value) => ({ 'data-toggle': on === value ? undefined : toggleName })}
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
    <section id="libraryAssistantSetting" className="section laCard">
      <h2 id="laSettingTitle" className="laCardTitle">
        {STRINGS.title}
      </h2>
      <p className="laDescription">{STRINGS.settingDescription}</p>
      <div className="laSwitchRow">
        <OnOffGroup
          on={value}
          onSelect={setValue}
          disabled={saving}
          labelledBy="laSettingTitle"
          optionAttrs={(v) => ({ 'data-la-value': String(v) })}
        />
        <button type="button" className="button small blue" aria-disabled={saving ? 'true' : undefined} onClick={save}>
          {STRINGS.saveSetting}
        </button>
      </div>
      {error && (
        <p className="laMessage laError" role="alert">
          {error}
        </p>
      )}
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
    async (action, body, accept = isState) => {
      setError(null);
      setBusy(true);
      try {
        const res = await laSettings(base, token, action, body);
        if (!accept(res)) throw new Error('unexpected response');
        return res;
      } catch (e) {
        if (mounted.current) setError(errorMessage(e));
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
  }, [call]);

  const act = async (action, body, accept) => {
    const res = await call(action, body, accept);
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
    const res = await act('run_now', { kind });
    if (mounted.current && res && res.run)
      setRunResult(`${res.run.status}${res.run.reason ? `: ${res.run.reason}` : ''}`);
  };
  const checkHealth = async () => {
    const res = await call('health', undefined, (r) => !!r);
    if (mounted.current && res) setHealth(res.jobs || []);
  };

  if (!data) {
    return (
      <>
        {error ? (
          <p className="laMessage laError" role="alert">
            {error}
          </p>
        ) : (
          <p className="laMuted">{STRINGS.loading}</p>
        )}
      </>
    );
  }

  const { instructions, profile, testing } = data;
  const overLimit = draft.length > MAX_TEXT;
  return (
    <>
      {error && (
        <p className="laMessage laError" role="alert">
          {error}
        </p>
      )}

      <div className="laBlock laCard" id="instructions">
        <h3 id="laInstructionsTitle" className="laCardTitle">
          {STRINGS.instructions}
        </h3>
        <p className="laDescription">{STRINGS.instructionsDescription}</p>
        <textarea
          className="sefaria-input-control laTextarea laInstructions"
          aria-labelledby="laInstructionsTitle"
          rows={4}
          value={draft}
          placeholder={STRINGS.instructionsPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div
          className={`laInstructionsCount${overLimit ? ' laError' : ''}`}
          aria-live="polite"
        >{`${draft.length} / ${MAX_TEXT}`}</div>
        <OnOff
          on={instructions.enabled}
          toggleName="instructions"
          labelledBy="laInstructionsTitle"
          disabled={busy}
          onChange={(enabled) => act('toggle', { target: 'instructions', enabled })}
        />
        <div className="laActions">
          <button type="button" className="button small blue" disabled={overLimit || busy} onClick={saveInstructions}>
            {STRINGS.saveInstructions}
          </button>
        </div>
        <div className="laUpdated">{lastUpdated(instructions.updatedAt, 'You')}</div>
      </div>

      <div className="laBlock laCard" id="profile">
        <h3 id="laProfileTitle" className="laCardTitle">
          {STRINGS.profile}
        </h3>
        <p className="laDescription">{STRINGS.profileDescription}</p>
        <ProfileText text={profile.text} />
        <OnOff
          on={profile.enabled}
          toggleName="profile"
          labelledBy="laProfileTitle"
          disabled={busy}
          onChange={(enabled) => act('toggle', { target: 'profile', enabled })}
        />
        <div className="laUpdated">{lastUpdated(profile.updatedAt, PROFILE_AUTHOR[profile.updatedBy])}</div>
        {confirmClear ? (
          <div role="alertdialog" className="laConfirm">
            <p>{STRINGS.clearConfirm}</p>
            <div className="laActions">
              <button type="button" className="button small blue" disabled={busy} onClick={clearProfile}>
                {STRINGS.clearYes}
              </button>
              <button type="button" className="button small transparent" onClick={() => setConfirmClear(false)}>
                {STRINGS.cancel}
              </button>
            </div>
          </div>
        ) : (
          <div className="laActions">
            <button type="button" className="button small transparent" onClick={() => setConfirmClear(true)}>
              {STRINGS.clear}
            </button>
          </div>
        )}
        <h4 id="laEditTitle" className="laSubheading">
          {STRINGS.editTitle}
        </h4>
        <textarea
          className="sefaria-input-control laTextarea laEditRequest"
          aria-labelledby="laEditTitle"
          rows={2}
          maxLength={MAX_TEXT}
          value={editRequest}
          onChange={(e) => setEditRequest(e.target.value)}
        />
        <div className="laActions">
          <button type="button" className="button small blue" disabled={busy || !editRequest.trim()} onClick={sendEdit}>
            {STRINGS.send}
          </button>
        </div>
        {editResult && (
          <div className="laMessage laEditResult" role="status">
            {editResult}
          </div>
        )}
      </div>

      {data.labEnabled && (
        <div className="laBlock laCard laCardTools" id="testing-tools">
          <h3 className="laCardTitle">{STRINGS.testing}</h3>
          <p className="laDescription">{STRINGS.testingNote}</p>
          <div className="laActions">
            <button type="button" className="button small" disabled={busy} onClick={() => runNow('session')}>
              {STRINGS.runNow}
            </button>
            <button type="button" className="button small" disabled={busy} onClick={() => runNow('dream')}>
              {STRINGS.dreamNow}
            </button>
          </div>
          {runResult && (
            <div className="laMessage laRunResult" role="status">
              {runResult}
            </div>
          )}
          <div className="laTestRow">
            <span className="laTestLabel" id="laUpdateEveryLabel">
              {STRINGS.updateEvery}
            </span>
            <OnOff
              on={!!testing.updateEveryMessage}
              toggleName="updateEveryMessage"
              labelledBy="laUpdateEveryLabel"
              disabled={busy}
              onChange={(updateEveryMessage) => act('set_testing', { updateEveryMessage })}
            />
          </div>
          <div className="laTestRow">
            <span className="laTestLabel" id="laPlainResponseLabel">
              {STRINGS.plainResponse}
            </span>
            <OnOff
              on={!!testing.showPlainResponse}
              toggleName="showPlainResponse"
              labelledBy="laPlainResponseLabel"
              disabled={busy}
              onChange={(showPlainResponse) => act('set_testing', { showPlainResponse })}
            />
          </div>
          <div className="laHealthRow">
            <strong>{STRINGS.health}</strong>
            <button type="button" className="button small transparent" disabled={busy} onClick={checkHealth}>
              {STRINGS.checkHealth}
            </button>
          </div>
          {health && (
            <div className="laHealthResult">
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
  return (
    <div className="libraryAssistantSettings">
      <AssistantSwitch initial={readInitialEnabled(props.libraryAssistantEnabled)} />
      <section id="personalization" className="section laSection">
        <div className="laCard laIntro">
          <h2 className="laSectionTitle">{STRINGS.personalization}</h2>
          <p id="about-personalization" className="laSectionAbout">
            {STRINGS.about}
          </p>
        </div>
        {hasAccess ? (
          <Personalization base={base} token={token} />
        ) : (
          <div className="laCard">
            <p className="laMuted">{STRINGS.turnOn}</p>
          </div>
        )}
      </section>
    </div>
  );
};

export default LibraryAssistantSettings;
