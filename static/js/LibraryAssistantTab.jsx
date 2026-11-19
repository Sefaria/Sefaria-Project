import React, { useEffect, useRef, useState } from 'react';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';
import Input from './common/Input.jsx';
import ToggleSwitch from './common/ToggleSwitch.jsx';
import { useDialogKeys, useAnnounce } from './SettingsPage.jsx';

/* DESIGN (Penina, 2026-11-18/19). The Library Assistant tab of Settings, built from the developer
   settings components (design/api-keys) and styled only with @sefaria/design-system semantic tokens
   (s2.css, "Library Assistant settings" block). Started as two drafts (A: Yotam's POC rebuilt; B: a
   direction); this is B with Penina's changes of 2026-11-19. Every change saves on its own, and the
   page header says when (no Save buttons, no toasts).
   Decisions and where each came from: design-notes/la-settings/decision-log.md in the main checkout.

   The data is a local mock: nothing is saved and nothing reaches the assistant's server. Yotam's
   wiring (chatbotApi.laSettings, the State shape, errors) stays in his branch; the mock uses the same
   State shape ({instructions:{text,enabled,updatedAt}, profile:{text,enabled,updatedAt,updatedBy}})
   so the two can meet. Strings are English only, not keyed for Weblate yet. */

const MAX_TEXT = 300; // Mickey's spec, as in the POC

const T = ({ children }) => <InterfaceText text={{ en: children, he: children }} />;

const DEMO_PROFILE = [
  '# How you learn',
  'You like short answers that quote the source first and explain it in a few sentences.',
  '',
  "# What you're studying",
  'You are comparing how Rambam and Ramban read the same verses in Genesis.',
  '',
  '# What you write',
  'You write a short d’var Torah every week for your community newsletter.',
].join('\n');

const demoState = () => ({
  assistantOn: true,
  instructions: { text: '', enabled: true, updatedAt: null },
  profile: {
    text: DEMO_PROFILE,
    enabled: true,
    updatedAt: '2026-11-17T14:14:00',
    updatedBy: 'la',
  },
  testing: { updateEveryMessage: false, showPlainResponse: true },
});

/* The POC's profile format: "# Heading" lines and paragraphs under them (Yotam's parseProfile). */
const parseSections = (text) => {
  const sections = [];
  let current = null;
  (text || '').split('\n').forEach((line) => {
    const heading = /^\s*#{1,6}\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      current = { heading: heading[1], body: [] };
      sections.push(current);
    } else if (line.trim()) {
      if (!current) {
        current = { heading: null, body: [] };
        sections.push(current);
      }
      current.body.push(line.trim());
    }
  });
  return sections.map((s) => ({ ...s, body: s.body.join(' ') }));
};
const joinSections = (sections) => sections.map((s) => (s.heading ? `# ${s.heading}\n${s.body}` : s.body)).join('\n\n');

/* A stand-in for the assistant rewriting its Profile from a request. The real one is an LLM call
   (Yotam's edit_profile); this only shows the UI states: changed, added, refused. */
const mockEdit = (profileText, request) => {
  const sections = parseSections(profileText);
  const r = request.toLowerCase();
  if (/\b(prefer|only|always|never use)\b.*\b(commentar|rashi|ramban|rambam)/.test(r)) {
    // The POC's refusal: commentary preferences belong in Instructions (Mickey hit this on the call).
    return {
      status: 'refused',
      reason: 'Preferring some commentaries over others belongs in your instructions, where you choose the words.',
    };
  }
  if (/no longer|not anymore|stopped|moved on/.test(r)) {
    const i = sections.findIndex((s) => /studying/i.test(s.heading || ''));
    if (i > -1) {
      sections[i] = { ...sections[i], body: 'You recently finished comparing Rambam and Ramban on Genesis.' };
      return { status: 'applied', text: joinSections(sections), changed: sections[i].heading };
    }
  }
  if (/short|brief|longer|detail/.test(r)) {
    const i = sections.findIndex((s) => /how you learn/i.test(s.heading || ''));
    const body = /longer|detail/.test(r)
      ? 'You like detailed answers that quote the source first and walk through it step by step.'
      : 'You like very short answers: the source first, then one or two sentences.';
    if (i > -1) {
      sections[i] = { ...sections[i], body };
      return { status: 'applied', text: joinSections(sections), changed: sections[i].heading };
    }
  }
  const added = { heading: 'Also', body: `You told the assistant: ${request.trim()}` };
  const i = sections.findIndex((s) => s.heading === 'Also');
  if (i > -1) {
    sections[i] = { ...sections[i], body: `${sections[i].body} ${request.trim()}` };
  } else {
    sections.push(added);
  }
  return { status: 'applied', text: joinSections(sections), changed: 'Also' };
};

const formatTime = (value) => {
  const date = new Date(value);
  return isNaN(date)
    ? String(value)
    : date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/* Same 18px drawn ✦ as the assistant's Ask button and window header (ai-chatbot LCChatbot.svelte). */
export const SparkleIcon = ({ size = 18, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 0C12.6 6.6 17.4 11.4 24 12C17.4 12.6 12.6 17.4 12 24C11.4 17.4 6.6 12.6 0 12C6.6 11.4 11.4 6.6 12 0Z"
    />
  </svg>
);

/* A label and a switch on one row: developer settings' "Limit to your website" row (EKeyRestrictField). */
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

/* A testing tool: its name and helper line, with its button at the end of the row (as SwitchRow). */
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

/* Developer settings' delete dialog (EDeleteProjectDialog): the same stage, focus and keys. */
const ClearDialog = ({ onClear, onCancel }) => {
  const cancelRef = useRef(null);
  useDialogKeys(cancelRef, onCancel);
  return (
    <div
      className="devPocModalStage devE-deleteStage laDialogStage"
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
      <section className="devE-deleteModal laDialog">
        <h3 id="laClearTitle">
          <T>Clear your profile?</T>
        </h3>
        <p id="laClearText">
          <T>
            The assistant forgets everything it has learned about you and starts again from your next question. This
            can’t be undone.
          </T>
        </p>
        <div className="devE-deleteActions">
          <button type="button" className="devE-deleteBtn devE-deleteBtnDanger" onClick={onClear}>
            <T>Clear profile</T>
          </button>
          <button type="button" className="devE-deleteBtn" ref={cancelRef} onClick={onCancel}>
            <T>Cancel</T>
          </button>
        </div>
      </section>
    </div>
  );
};

const Counter = ({ length }) => (
  <span className={'laCount' + (length > MAX_TEXT ? ' laCountOver' : '')} aria-live="polite">
    {`${length} / ${MAX_TEXT}`}
  </span>
);

/* Every change saves on its own. The mock marks the page as saving for a moment, then saved now. */
const useMockState = () => {
  const [state, setState] = useState(demoState);
  const [saving, setSaving] = useState(0);
  const [saved, setSaved] = useState(false);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const run = (change, delay = 500) =>
    new Promise((resolve) => {
      setSaving((n) => n + 1);
      timers.current.push(
        setTimeout(() => {
          let result;
          setState((s) => {
            const out = change(s);
            result = out.result;
            return out.state || s;
          });
          setSaving((n) => n - 1);
          setSaved(true);
          resolve(result);
        }, delay)
      );
    });
  const now = () => new Date().toISOString();
  return {
    state,
    busy: saving > 0,
    saving: saving > 0,
    saved,
    setAssistant: (on) => run((s) => ({ state: { ...s, assistantOn: on } }), 400),
    toggle: (target, enabled) => run((s) => ({ state: { ...s, [target]: { ...s[target], enabled } } }), 400),
    saveInstructions: (text) =>
      run((s) => ({ state: { ...s, instructions: { ...s.instructions, text, updatedAt: now() } } }), 600),
    clearProfile: () =>
      run((s) => ({ state: { ...s, profile: { ...s.profile, text: '', updatedAt: now(), updatedBy: 'you_la' } } })),
    editProfile: (request) =>
      run((s) => {
        const edit = mockEdit(s.profile.text, request);
        if (edit.status !== 'applied') {
          return { result: edit };
        }
        return {
          state: { ...s, profile: { ...s.profile, text: edit.text, updatedAt: now(), updatedBy: 'you_la' } },
          result: edit,
        };
      }, 900),
    setTesting: (patch) => run((s) => ({ state: { ...s, testing: { ...s.testing, ...patch } } }), 300),
  };
};

const lastUpdated = (updatedAt, by) =>
  updatedAt ? `Last updated ${formatTime(updatedAt)}${by ? ` by ${by}` : ''}` : 'Never updated';
const PROFILE_AUTHOR = { la: 'the assistant', you_la: 'the assistant, at your request' };

/* Top right of the page header, where developer settings has its links: "Saving changes…" while a change saves,
   then "Changes saved". Nothing until the first change (Penina, 2026-11-19). */
const SaveStatus = ({ saving, saved }) => (
  <p className="laSaveStatus" role="status" aria-live="polite">
    {saving ? (
      <>
        <span className="laSpinner" aria-hidden="true" />
        <T>Saving changes…</T>
      </>
    ) : saved ? (
      <>
        <svg className="laSavedIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <T>Changes saved</T>
      </>
    ) : null}
  </p>
);

/* A card title with its switch on the same row (as version A's switch rows: the title is the label). */
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

const INSTRUCTIONS_SAVE_MS = 800;

const LibraryAssistantTab = () => {
  const m = useMockState();
  const { state, busy } = m;
  const [draft, setDraft] = useState(state.instructions.text);
  const savedDraft = useRef(state.instructions.text);
  const [confirmClear, setConfirmClear] = useState(false);
  const [editRequest, setEditRequest] = useState('');
  const [editing, setEditing] = useState(false);
  const [refusal, setRefusal] = useState(null);
  const [changed, setChanged] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [health, setHealth] = useState(null);
  const [announcer, announce] = useAnnounce();
  const over = draft.length > MAX_TEXT;
  const sections = parseSections(state.profile.text);
  /* The assistant switch rules the others: while it's off they all show off and can't be changed. Their own
     settings are kept, so turning the assistant back on brings them back as they were. Turning one of them off
     never changes the assistant switch (Penina, 2026-11-18). */
  const off = !state.assistantOn;

  /* Instructions save themselves a moment after typing stops, and on leaving the field. */
  const saveTimer = useRef(null);
  useEffect(() => () => clearTimeout(saveTimer.current), []);
  const saveDraft = (text) => {
    clearTimeout(saveTimer.current);
    if (text === savedDraft.current || text.length > MAX_TEXT) {
      return;
    }
    savedDraft.current = text;
    m.saveInstructions(text);
  };
  const onDraft = (text) => {
    setDraft(text);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft(text), INSTRUCTIONS_SAVE_MS);
  };

  const sendEdit = async () => {
    const text = editRequest.trim();
    if (!text || busy || off) {
      return;
    }
    setEditing(true);
    setRefusal(null);
    setChanged(null);
    const res = await m.editProfile(text);
    setEditing(false);
    if (res.status === 'refused') {
      setRefusal(res.reason);
      return;
    }
    setEditRequest('');
    setChanged(res.changed);
    announce(`Profile updated: ${res.changed}`);
  };

  return (
    <div className="devPocPage laTabPage">
      <div className="laSettings">
        {announcer}
        {/* The page title as on Developer Settings, with the save status where that page has its links. */}
        <header className="devPocPageHeader devE-pageHeader laPageHeader">
          <h1>
            <T>Library Assistant Settings</T>
          </h1>
          <SaveStatus saving={m.saving} saved={m.saved} />
        </header>

        <section className="laCard devE-project" aria-labelledby="laAssistant-label">
          <SwitchRow name="laAssistant" label="Library Assistant" on={state.assistantOn} onChange={m.setAssistant} />
        </section>

        {/* Assistant off: the note on top, everything under it grayed (Penina, 2026-11-19). */}
        {off ? (
          <p className="laOffNote">
            <T>Turn on the Library Assistant to activate personalized answers.</T>
          </p>
        ) : null}
        <div className={'laGroup' + (off ? ' laGroupOff' : '')} inert={off ? 'true' : undefined}>
          <div className="devE-sectionHead laSectionHead">
            <div>
              <h2 className="devE-h laH2">
                <T>Personalized answers</T>
              </h2>
              <p className="laHint">
                <T>
                  The assistant can tailor its answers to you, based on what it learns about you and the instructions
                  you give it. You can control both below.
                </T>{' '}
                <a className="laLink" href="/help" target="_blank" rel="noopener noreferrer">
                  <T>Learn more</T>
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </p>
            </div>
          </div>

          {/* Profile first: it changes without the user doing anything, and it is what the chat's
              "Configure here" link comes to check. */}
          <section className="laCard devE-project" aria-labelledby="laProfile-label">
            <CardHead
              name="laProfile"
              title="Profile"
              hint="This information is gathered by the assistant from your questions. Sensitive details are never saved."
              on={state.profile.enabled && !off}
              disabled={off}
              onChange={(on) => m.toggle('profile', on)}
            />

            <div className={'laBody' + (state.profile.enabled && !off ? '' : ' laBodyOff')}>
              {sections.length ? (
                <ul className="laProfileList">
                  {sections.map((s, i) => (
                    <li
                      key={i}
                      className={'laProfileItem' + (changed && s.heading === changed ? ' laProfileItemChanged' : '')}
                    >
                      {s.heading ? <h4 className="laProfileHeading">{s.heading}</h4> : null}
                      <p className="laProfileBody">{s.body}</p>
                      {changed && s.heading === changed ? (
                        <span className="laBadge">
                          <T>Just updated</T>
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="laEmpty">
                  <p className="laProfileBody">
                    <T>
                      As you use the Library Assistant, it will start to remember things about you and record them here.
                    </T>
                  </p>
                </div>
              )}
              {/* Clear profile sits with what it clears: under the profile, beside when it was last updated (Penina, 2026-11-19). */}
              <div className="laProfileMetaRow">
                <p className="laMeta">
                  {lastUpdated(state.profile.updatedAt, PROFILE_AUTHOR[state.profile.updatedBy])}
                </p>
                <button
                  type="button"
                  className="laButton laButtonDangerSecondary"
                  disabled={off || !sections.length}
                  onClick={() => setConfirmClear(true)}
                >
                  <T>Clear profile</T>
                </button>
              </div>

              <div className="laEdit">
                <Input
                  id="laEdit"
                  label="Want to make changes to your profile? Tell the assistant what to change."
                  multiline
                  rows={2}
                  maxLength={MAX_TEXT}
                  value={editRequest}
                  disabled={off}
                  onChange={(e) => setEditRequest(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
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
                    aria-disabled={busy || off || !editRequest.trim() ? 'true' : undefined}
                    onClick={sendEdit}
                  >
                    {editing ? <T>Updating…</T> : <T>Update profile</T>}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="laCard devE-project" aria-labelledby="laInstructions-label">
            <CardHead
              name="laInstructions"
              title="Your instructions"
              hint="The Library Assistant will keep these in mind as it responds to you."
              on={state.instructions.enabled && !off}
              disabled={off}
              onChange={(on) => m.toggle('instructions', on)}
            />
            <div className={'laBody' + (state.instructions.enabled && !off ? '' : ' laBodyOff')}>
              <Input
                id="laInstructionsText"
                multiline
                rows={4}
                aria-labelledby="laInstructions-label"
                placeholder="For example: Answer in English, keep it short, and show the Hebrew source with a translation."
                value={draft}
                disabled={off}
                onChange={(e) => onDraft(e.target.value)}
                onBlur={() => saveDraft(draft)}
                error={over ? `Keep it to ${MAX_TEXT} characters. Longer instructions aren’t saved.` : null}
                fieldAddon={<Counter length={draft.length} />}
              />
              <p className="laMeta">
                {state.instructions.updatedAt
                  ? `Last updated ${formatTime(state.instructions.updatedAt)} by you`
                  : 'Never updated'}
              </p>
            </div>
          </section>

          {/* As in the POC: a card of its own, always open. Only on test deployments. One row per tool, with
              Yotam's helper line under its name (poc/la-personalization-settings c19dd7a60). */}
          <section className="laCard laCardTools" aria-labelledby="laTools">
            <div className="laCardHeadText">
              <h2 className="laCardTitle" id="laTools">
                <T>Testing tools</T>
              </h2>
              <p className="laHint">
                <T>These tools appear only on test deployments.</T>
              </p>
            </div>
            <ToolRow
              name="laRunNow"
              label="Run now"
              hint="Runs one Profile update now, from recent questions, to test a change without waiting."
            >
              <button
                type="button"
                className="laButton laButtonSecondary"
                aria-describedby="laRunNow-hint"
                disabled={busy || off}
                onClick={() => setRunResult('No new questions since the last update. (no_change: no_new_prompts)')}
              >
                <T>Run now</T>
              </button>
            </ToolRow>
            <ToolRow
              name="laDreamNow"
              label="Dream now"
              hint="Runs the deeper Profile update now, over a wider set of questions, to check the full pass."
            >
              <button
                type="button"
                className="laButton laButtonSecondary"
                aria-describedby="laDreamNow-hint"
                disabled={busy || off}
                onClick={() => setRunResult('The review found nothing to change. (no_change: dream_unchanged)')}
              >
                <T>Dream now</T>
              </button>
            </ToolRow>
            {runResult ? (
              <p className="laMessage" role="status">
                {runResult}
              </p>
            ) : null}
            <SwitchRow
              name="laEvery"
              label="Update after every message"
              hint="Updates the Profile after every message instead of on the usual schedule, to watch changes land."
              on={state.testing.updateEveryMessage && !off}
              disabled={off}
              onChange={(v) => m.setTesting({ updateEveryMessage: v })}
            />
            <SwitchRow
              name="laPlain"
              label="Include non-personalized response"
              hint="Adds an answer without personalization to each reply, to compare it with the personalized one."
              on={state.testing.showPlainResponse && !off}
              disabled={off}
              onChange={(v) => m.setTesting({ showPlainResponse: v })}
            />
            <ToolRow
              name="laHealth"
              label="Job health"
              hint="Shows when each Profile job last ran and wrote, and whether it is paused, for when updates seem to stop."
            >
              <button
                type="button"
                className="laButton laButtonSecondary"
                aria-describedby="laHealth-hint"
                disabled={busy || off}
                onClick={() =>
                  setHealth([
                    'session: last run Nov 19, 11:52 AM, last write Nov 19, 11:52 AM',
                    'dream: last run Nov 18, 3:00 AM, last write never',
                  ])
                }
              >
                <T>Check job health</T>
              </button>
            </ToolRow>
            {health ? (
              <div className="laMessage laHealthResult" role="status">
                {health.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        {confirmClear ? (
          <ClearDialog
            onCancel={() => setConfirmClear(false)}
            onClear={async () => {
              setConfirmClear(false);
              await m.clearProfile();
              setChanged(null);
              announce('Profile cleared');
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

export default LibraryAssistantTab;
