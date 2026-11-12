import React, { useCallback, useEffect, useState } from 'react';
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

const OnOff = ({ on, onChange, toggleName, disabled }) => (
  <div className="toggleSet toggleSetToggleBox blueStyle doubleOption" role="radiogroup">
    {[true, false].map((value) => (
      <button
        key={String(value)}
        type="button"
        role="radio"
        className={`toggleOption${on === value ? ' on' : ''}`}
        aria-checked={on === value}
        tabIndex={on === value ? 0 : -1}
        disabled={disabled}
        data-toggle={on === value ? undefined : toggleName}
        onClick={() => on !== value && onChange(value)}
      >
        {value ? STRINGS.on : STRINGS.off}
      </button>
    ))}
  </div>
);

const readInitialEnabled = (prop) => {
  if (typeof prop === 'boolean') return prop;
  const el = typeof document !== 'undefined' ? document.getElementById('libraryAssistantSettings') : null;
  return !!el && el.getAttribute('data-library-assistant-enabled') === 'true';
};

const AssistantSwitch = ({ initial }) => {
  const [saved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(null);
  const save = () => {
    if (value === saved) return;
    setError(null);
    // jQuery, so the page's CSRF setup applies; the endpoint takes a form field named "json".
    const request = $.post(
      '/api/profile',
      { json: JSON.stringify({ settings: { library_assistant: value } }) },
      (data) => {
        if (data && data.error) {
          setError(data.error);
          return;
        }
        // A fresh page mints a fresh token (and the widget script) for the new setting.
        window.location.reload();
      }
    );
    if (request && request.fail) request.fail(() => setError(STRINGS.settingFailed));
  };
  return (
    <section id="libraryAssistantSetting" className="section">
      <h2>{STRINGS.title}</h2>
      <div className="laSwitchRow">
        <div className="toggleSet toggleSetToggleBox blueStyle doubleOption" role="radiogroup">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              className={`toggleOption${value === v ? ' on' : ''}`}
              aria-checked={value === v}
              tabIndex={value === v ? 0 : -1}
              data-la-value={String(v)}
              onClick={() => setValue(v)}
            >
              {v ? STRINGS.on : STRINGS.off}
            </button>
          ))}
        </div>
        <button type="button" className="button small blue" onClick={save}>
          {STRINGS.saveSetting}
        </button>
      </div>
      {error && (
        <p className="laError" role="alert">
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

  // Runs one action. On success returns the response (and keeps `data` as the latest State);
  // on failure sets the message, leaves the form as it was and returns null.
  const call = useCallback(
    async (action, body) => {
      setError(null);
      setBusy(true);
      try {
        const res = await laSettings(base, token, action, body);
        return res;
      } catch (e) {
        setError(errorMessage(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [base, token]
  );

  const applyState = (res) => {
    if (res && res.instructions && res.profile) setData(res);
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

  const act = async (action, body) => {
    const res = await call(action, body);
    applyState(res);
    return res;
  };

  const saveInstructions = async () => {
    const res = await act('set_instructions', { text: draft });
    if (res) setDraft(res.instructions.text || '');
  };
  const clearProfile = async () => {
    setConfirmClear(false);
    await act('clear_profile');
  };
  const sendEdit = async () => {
    setEditResult(STRINGS.processing);
    const res = await act('edit_profile', { request: editRequest });
    if (!res) return setEditResult(null);
    setEditResult(res.edit && res.edit.status === 'refused' ? res.edit.reason : res.profile.text || '');
    if (res.edit && res.edit.status === 'applied') setEditRequest('');
  };
  const runNow = async (kind) => {
    const res = await act('run_now', { kind });
    if (res && res.run) setRunResult(`${res.run.status}${res.run.reason ? `: ${res.run.reason}` : ''}`);
  };
  const checkHealth = async () => {
    const res = await call('health');
    if (res) setHealth(res.jobs || []);
  };

  if (!data) {
    return (
      <>
        {error ? (
          <p className="laError" role="alert">
            {error}
          </p>
        ) : (
          <p>{STRINGS.loading}</p>
        )}
      </>
    );
  }

  const { instructions, profile, testing } = data;
  const overLimit = draft.length > MAX_TEXT;
  return (
    <>
      {error && (
        <p className="laError" role="alert">
          {error}
        </p>
      )}

      <div className="laBlock" id="instructions">
        <h3>{STRINGS.instructions}</h3>
        <textarea
          className="laInstructions"
          rows={4}
          value={draft}
          placeholder={STRINGS.instructionsPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="laInstructionsCount" aria-live="polite">{`${draft.length} / ${MAX_TEXT}`}</div>
        <OnOff
          on={instructions.enabled}
          toggleName="instructions"
          disabled={busy}
          onChange={(enabled) => act('toggle', { target: 'instructions', enabled })}
        />
        <button type="button" className="button small blue" disabled={overLimit || busy} onClick={saveInstructions}>
          {STRINGS.saveInstructions}
        </button>
        <div className="laUpdated">{lastUpdated(instructions.updatedAt, 'You')}</div>
      </div>

      <div className="laBlock" id="profile">
        <h3>{STRINGS.profile}</h3>
        <div className="laProfileText">{profile.text || STRINGS.profileEmpty}</div>
        <OnOff
          on={profile.enabled}
          toggleName="profile"
          disabled={busy}
          onChange={(enabled) => act('toggle', { target: 'profile', enabled })}
        />
        <div className="laUpdated">{lastUpdated(profile.updatedAt, PROFILE_AUTHOR[profile.updatedBy])}</div>
        {confirmClear ? (
          <div role="alertdialog">
            <p>{STRINGS.clearConfirm}</p>
            <button type="button" className="button small blue" disabled={busy} onClick={clearProfile}>
              {STRINGS.clearYes}
            </button>
            <button type="button" className="button small transparent" onClick={() => setConfirmClear(false)}>
              {STRINGS.cancel}
            </button>
          </div>
        ) : (
          <button type="button" className="button small transparent" onClick={() => setConfirmClear(true)}>
            {STRINGS.clear}
          </button>
        )}
        <h4>{STRINGS.editTitle}</h4>
        <textarea
          className="laEditRequest"
          rows={2}
          maxLength={MAX_TEXT}
          value={editRequest}
          onChange={(e) => setEditRequest(e.target.value)}
        />
        <button type="button" className="button small blue" disabled={busy || !editRequest.trim()} onClick={sendEdit}>
          {STRINGS.send}
        </button>
        {editResult && <div className="laEditResult">{editResult}</div>}
      </div>

      {data.labEnabled && (
        <div className="laBlock" id="testing-tools">
          <h3>{STRINGS.testing}</h3>
          <button type="button" className="button small" disabled={busy} onClick={() => runNow('session')}>
            {STRINGS.runNow}
          </button>
          <button type="button" className="button small" disabled={busy} onClick={() => runNow('dream')}>
            {STRINGS.dreamNow}
          </button>
          {runResult && <div className="laRunResult">{runResult}</div>}
          <label>
            <input
              type="checkbox"
              checked={!!testing.updateEveryMessage}
              onChange={(e) => act('set_testing', { updateEveryMessage: e.target.checked })}
            />{' '}
            {STRINGS.updateEvery}
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!testing.showPlainResponse}
              onChange={(e) => act('set_testing', { showPlainResponse: e.target.checked })}
            />{' '}
            {STRINGS.plainResponse}
          </label>
          <div>
            <strong>{STRINGS.health}</strong>{' '}
            <button type="button" className="button small transparent" disabled={busy} onClick={checkHealth}>
              {STRINGS.checkHealth}
            </button>
            {health && (
              <ul>
                {health.map((j) => (
                  <li key={j.name}>
                    {`${j.name}: last run ${j.lastRunAt || 'never'}, last write ${j.lastWriteAt || 'never'}${j.parked ? ' (parked)' : ''}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
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
      <section id="personalization" className="section">
        <h2>Personalization</h2>
        <p id="about-personalization">{STRINGS.about}</p>
        {hasAccess ? <Personalization base={base} token={token} /> : <p>{STRINGS.turnOn}</p>}
      </section>
    </div>
  );
};

export default LibraryAssistantSettings;
