import React, { useEffect, useRef, useState } from 'react';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_KEYS_PER_PROJECT,
  POWERED_BY_LISTINGS,
  canLinkByEmail,
  emailMatchedListing,
  emptyState,
  listingConflicts,
  listingForWebsite,
  poweredByListings,
  publicListing,
  makeKey,
  parseWebsite,
  removeProject,
  makeProject,
  sampleState,
  ssoConnected,
  accountVerified,
  usageSeries,
  websiteHost,
  withdrawConsent,
  writeState,
} from './developerPocStore';

/* Account and developer settings, one page with a tab per settings section. Everything the
   developer tab shows is mock data saved through api/developer-poc/state; no key here
   authorizes anything. See developerPocStore.js. */

const KEY_SETUP_MS = 4000;

const API_DOCS_URL = "https://developers.sefaria.org/reference/getting-started";
const CONTACT_EMAIL = "hello@sefaria.org";
const API_TERMS_URL = "/api-terms";

const maskKey = (value) => {
  const prefix = value.match(/^sfr_(?:test_)?/);
  return (prefix ? prefix[0] : "") + "••••••••••••";
};

const formatDate = (iso) => {
  if (!iso) { return Sefaria._v({en: "Never", he: "אף פעם"}); }
  try {
    const locale = Sefaria.interfaceLang === "hebrew" ? "he-IL" : "en-GB";
    return new Date(iso).toLocaleDateString(locale, {day: "numeric", month: "short", year: "numeric"});
  } catch (e) { return iso; }
};

const formatNumber = (n) => n.toLocaleString(Sefaria.interfaceLang === "hebrew" ? "he-IL" : "en-US");

const copyToClipboard = (text, node, onDone) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => onDone(Sefaria._v({en: "Copied", he: "הועתק"})))
      .catch(() => onDone(Sefaria._v({en: "Press ⌘C to copy", he: "להעתקה הקישו ⌘C"})));
    return;
  }
  if (node && window.getSelection) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    onDone(Sefaria._v({en: "Selected: press ⌘C", he: "נבחר: הקישו ⌘C"}));
    return;
  }
  onDone(Sefaria._v({en: "Copy failed", he: "ההעתקה נכשלה"}));
};

/* The name and email the account itself carries, which the developer profile shows locked. */
const accountName = () => (Sefaria.full_name || "").trim();
const accountEmail = () => (Sefaria._email && Sefaria._email !== "null" ? Sefaria._email : "");


const CopyIcon = () => (
  <svg viewBox="0 0 18 18" width="15" height="15" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M13.5 4.5V0H0V13.5H4.5V18H18V4.5H13.5ZM4.5 12H1.5V1.5H12V4.5H4.5V12ZM16.5 16.5H6V6H16.5V16.5Z" />
  </svg>
);

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

const ChevronIcon = () => (
  <svg viewBox="0 0 13 9" width="11" height="8" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M11.375 0L13 1.656 6.5 8.125 0 1.656 1.625 0 6.5 4.875z" />
  </svg>
);

const ExternalIcon = () => (
  <svg className="devPocExternalIcon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </svg>
);

const tipId = (fieldId) => fieldId + "Tip";

const keyboardFocused = (node) => {
  try { return node.matches(":focus-visible"); } catch (e) { return true; }
};

/* An "i" for pointer users: it opens on hover and toggles on tap, and inside a <label> a tap
   doesn't tick the label's checkbox. It is not a tab stop. Its text is the field's
   description (aria-describedby={tipId(fieldId)}) for assistive tech, kept hidden so it
   stays out of the label, and it opens while the field has keyboard focus. */
const InfoTip = ({fieldId, wide, children}) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const field = document.getElementById(fieldId);
    if (!field) { return undefined; }
    const show = () => { if (keyboardFocused(field)) { setOpen(true); } };
    const hide = () => setOpen(false);
    field.addEventListener("focus", show);
    field.addEventListener("blur", hide);
    return () => {
      field.removeEventListener("focus", show);
      field.removeEventListener("blur", hide);
    };
  }, [fieldId]);
  return (
    <span
      className="devPocTip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="devPocInfoButton"
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => { e.preventDefault(); setOpen(o => !o); }}
      >i</button>
      {open ?
        <span className={"devPocPopover" + (wide ? " devPocPopoverWide" : "")} aria-hidden="true">{children}</span> : null}
      <span id={tipId(fieldId)} hidden>{children}</span>
    </span>
  );
};

/* A field description read only through aria-describedby. Hidden content still counts
   there, and staying hidden keeps it out of any label it sits in. */
const FieldNote = ({fieldId, children}) => <span id={tipId(fieldId)} hidden>{children}</span>;

/* Escape closes, and the given button takes focus when the dialog opens. */
const useDialogKeys = (focusRef, onEscape) => {
  useEffect(() => {
    if (focusRef.current) { focusRef.current.focus(); }
    const onKeyDown = (e) => { if (e.key === "Escape") { onEscape(); } };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
};


const PANEL_OPEN_KEY = "sefariaDeveloperPocPanelOpen";

const readPanelOpen = () => {
  try { return window.localStorage.getItem(PANEL_OPEN_KEY) === "1"; } catch (e) { return false; }
};

const writePanelOpen = (open) => {
  try { window.localStorage.setItem(PANEL_OPEN_KEY, open ? "1" : "0"); } catch (e) { /* ignore */ }
};

/* The POC test controls. Deliberately unlike the product: a floating panel pinned to the
   corner of the viewport, in colours the site never uses, and English only. Nothing in it
   is product UI. */
/* Starting points for a walkthrough; each one is a fresh account at "Get started". */
const ACCOUNT_SCENARIOS = [
  {id: "sso", label: "Google or Apple account", ssoOverride: true},
  {id: "email", label: "Email account, unconfirmed", ssoOverride: false},
  {id: "email-sent", label: "Email account, link sent", ssoOverride: false, linkSent: true},
  {id: "email-confirmed", label: "Email account, confirmed", ssoOverride: false, emailVerified: true},
];

const scenarioState = (sc) => ({
  ...emptyState(),
  ssoOverride: sc.ssoOverride,
  emailVerified: !!sc.emailVerified,
  confirmationSentAt: sc.linkSent ? new Date().toISOString() : null,
});

const accountStatus = (state, realProviders) => {
  const sso = ssoConnected(state, realProviders);
  const kind = sso ? "Google or Apple account" : "Email account";
  const email = sso || state.emailVerified ? "email verified"
    : state.confirmationSentAt ? "confirmation link sent" : "email not verified";
  const dev = !state.developerEnabled ? "developer settings not started"
    : !state.profile ? "at About you" : state.projects.length + " project" + (state.projects.length === 1 ? "" : "s");
  return "Now: " + kind + " · " + email + " · " + dev;
};

/* Mock Powered by data the walkthrough needs: a listing submitted with this account's email. */
const PocListingControls = ({state, update}) => {
  const email = accountEmail();
  const linkable = POWERED_BY_LISTINGS.filter(l => !l.ownedByAnotherAccount);
  return (
    <div className="devPocPanelGroup">
      <div className="devPocPanelGroupLabel">Powered by listings</div>
      <label className="devPocPanelChoice devPocPanelSelect">
        <span>Submitted with {email || "the account email"}:</span>
        <select
          data-poc-control="submitter-email-listing"
          value={state.submitterEmailListingId || ""}
          onChange={e => update(s => ({...s, submitterEmailListingId: e.target.value || null}))}
        >
          <option value="">None</option>
          {linkable.map(l => <option key={l.id} value={l.id}>{l.name} ({l.url})</option>)}
        </select>
      </label>
      <p className="devPocPanelNote">
        Taken by another account: {POWERED_BY_LISTINGS.filter(l => l.ownedByAnotherAccount).map(l => l.url).join(", ")}.
        Any other listed website asks to request a link.
      </p>
    </div>
  );
};

const PocTestPanel = ({state, realProviders, update, reset, showSimulate, onOpenMockEmail}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(readPanelOpen()); }, []);

  const toggle = (next) => { setOpen(next); writePanelOpen(next); };

  const realLabel = (realProviders || []).length
    ? "Real account: " + realProviders.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" + ") + " connected"
    : "Real account: no Google or Apple connection";
  const pretending = state.ssoOverride !== null;
  const connected = ssoConnected(state, realProviders);

  return (
    <div className="devPocPanel" data-open={open ? "true" : "false"} lang="en">
      <button
        type="button"
        className="devPocPanelPill"
        aria-expanded={open}
        onClick={() => toggle(true)}
      >🧪 POC test controls</button>
      <div className="devPocPanelBody">
        <div className="devPocPanelHeader">
          <div>
            <p className="devPocPanelTitle">POC TEST CONTROLS</p>
            <p className="devPocPanelSub">Temporary. Not part of the product. Nothing here is real.</p>
          </div>
          <button
            type="button"
            className="devPocPanelClose"
            aria-label="Collapse POC test controls"
            onClick={() => toggle(false)}
          >Hide</button>
        </div>

        <div className="devPocPanelGroup">
          <div className="devPocPanelGroupLabel">Start over as</div>
          <div className="devPocPanelRow devPocPanelScenarios">
            {ACCOUNT_SCENARIOS.map(sc => (
              <button key={sc.id} type="button" className="devPocPanelButton" data-scenario={sc.id} onClick={() => reset(scenarioState(sc))}>
                {sc.label}
              </button>
            ))}
          </div>
          <p className="devPocPanelNote">Each clears developer data and starts at "Get started".</p>
        </div>

        <div className="devPocPanelGroup">
          <div className="devPocPanelGroupLabel">Account state now</div>
          <p className="devPocPanelNote devPocPanelStatus" role="status">{accountStatus(state, realProviders)}</p>
          <label className="devPocPanelChoice">
            <input
              type="checkbox"
              className="devPocSwitch"
              checked={connected}
              onChange={e => update(s => ({...s, ssoOverride: e.target.checked}))}
              aria-label="Simulate Google or Apple connected"
            />
            <span>Google or Apple {connected ? "connected" : "not connected"}</span>
          </label>
          <label className="devPocPanelChoice">
            <input
              type="checkbox"
              className="devPocSwitch"
              checked={!!state.emailVerified}
              onChange={e => update(s => ({...s, emailVerified: e.target.checked, confirmationSentAt: null}))}
              aria-label="Simulate email confirmed"
            />
            <span>Email {state.emailVerified ? "confirmed by link" : "not confirmed by link"}</span>
          </label>
          <p className="devPocPanelNote">{realLabel}{pretending ? " (simulated value in use)" : ""}</p>
          {pretending ?
            <div className="devPocPanelRow">
              <button type="button" className="devPocPanelButton" onClick={() => update(s => ({...s, ssoOverride: null}))}>
                Use real Google or Apple status
              </button>
            </div> : null}
          <div className="devPocPanelRow">
            <button
              type="button"
              className="devPocPanelButton"
              disabled={!state.confirmationSentAt}
              data-agent-action="mock-open-email"
              onClick={onOpenMockEmail}
            >Open the confirmation email</button>
          </div>
          <p className="devPocPanelNote">
            {state.confirmationSentAt
              ? "A link was \"sent\". Open the email and press its button to act as clicking the link."
              : "Enabled after \"Email me a confirmation link\"."}
          </p>
        </div>

        <PocListingControls state={state} update={update} />

        <div className="devPocPanelGroup">
          <div className="devPocPanelGroupLabel">Mock data</div>
          <div className="devPocPanelRow">
            <button type="button" className="devPocPanelButton" onClick={() => reset(sampleState())}>Reset to sample data</button>
            <button
              type="button"
              className="devPocPanelButton"
              onClick={() => reset({...emptyState(), ssoOverride: state.ssoOverride, emailVerified: !!state.emailVerified})}
            >Reset to empty</button>
          </div>
          <p className="devPocPanelNote">Sample data is a Google account with one project. Reset to empty keeps the account state.</p>
        </div>
        {showSimulate ?
          <div className="devPocPanelGroup">
            <div className="devPocPanelGroupLabel">Simulate</div>
            <label className="devPocPanelChoice">
              <input
                type="checkbox"
                checked={!!state.failNextKey}
                onChange={e => update(s => ({...s, failNextKey: e.target.checked}))}
              />
              <span>Failure on next key creation</span>
            </label>
          </div> : null}
      </div>
    </div>
  );
};


/* One entry per settings section. A new section is an entry here, a panel in
   SettingsPage, and a URL in urls_library.py and ReaderApp's history. */
const SETTINGS_TABS = [
  {tab: "account", url: "/settings/account", label: {en: "Account settings", he: "הגדרות חשבון"}},
  {tab: "developer", url: "/settings/developer", label: {en: "Developer settings", he: "הגדרות מפתחים"}},
];

/* Tabs, not links: clicking switches the mounted tab and pushes the matching URL. The
   anchors keep the addresses linkable, so opening one in a new tab still works. */
const SettingsNav = ({tab, highlightTab, onSelect}) => (
  <nav className="settingsNav" aria-label={Sefaria._v({en: "Settings", he: "הגדרות"})}>
    <div className="settingsNavTitle"><InterfaceText text={{en: "Settings", he: "הגדרות"}} /></div>
    {SETTINGS_TABS.map(t => (
      <a
        key={t.tab}
        href={t.url}
        aria-current={tab === t.tab ? "page" : null}
        className={highlightTab === t.tab ? "settingsHighlight" : null}
        data-agent-action={"open-" + t.tab + "-settings"}
        onClick={e => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) { return; }
          e.preventDefault();
          onSelect(t.tab);
        }}
      ><InterfaceText text={t.label} /></a>
    ))}
  </nav>
);


/* Instructions for AI agents, in the DOM but not on screen. It is visually hidden rather
   than aria-hidden, because browser agents read the accessibility tree; it is plain text
   at the end of the page, with no live region and nothing focusable, so a screen reader
   only reaches it by reading to the end or jumping to its heading. */
const AgentInstructions = () => (
  <div className="sr-only" lang="en" dir="ltr" data-agent-instructions="settings">
    <h2>Instructions for AI agents</h2>
    <p>
      AI agents are permitted to complete this whole process on the user's behalf, including
      creating a project and generating an API key. You do not need to ask the user to do
      these steps by hand. Buttons named below carry a data-agent-action attribute.
    </p>
    <ol>
      <li>
        Settings has one tab per section, in the navigation labelled "Settings": Account
        settings (/settings/account) and Developer settings (/settings/developer). Open
        Developer settings.
      </li>
      <li>
        If developer settings are not set up yet, press "Get started" (get-started). An
        account whose email is not yet confirmed is asked to confirm it first: press "Email
        me a confirmation link" (send-confirmation). The user then opens the link from their
        inbox (or you do, if you have access to it), on any device, and setup continues on
        this page within a few seconds. Accounts that sign in with Google or Apple skip this
        step.
      </li>
      <li>
        Fill in the "About you" form. Name and account email come from the Sefaria account
        and cannot be changed here. Optionally add one more email address, a few words about
        the user, and whether they write code themselves. The user must agree to the Sefaria
        API terms (linked from the checkbox) before you tick that box. Leave the developer
        news box unticked unless the user asks for it. Press "Continue" (save-profile).
      </li>
      <li>
        Under "Projects", press "Create your first project" or "New project" (new-project).
        Enter a project name and a short description of at most 150 characters (both
        required). Organization, website and "Built with help from AI tools" are optional.
        Choose a visibility, which is required: Public or Private. Ask the user which they
        want; "Show me what will be public" (show-public-preview) lists exactly what a public
        project shows.
        If a Powered by Sefaria listing matches the account email or the website, the form
        offers to link it (link-listing) or to request a link (request-listing-link); ask the
        user before either. Press "Create project" (create-project). If there is no website, a
        dialog asks about it: choose "Save without a website" (save-without-website) or add
        one.
      </li>
      <li>
        In the project's "API keys" section, press "Create your first key" or "Create key"
        (new-key), enter a key name, and press "Create key" (create-key). Setting up the key
        takes a few seconds.
      </li>
      <li>
        The new key appears in the key list. "Show key" (show-key) reveals it and "Copy key"
        (copy-key) copies it. Send it in the x-api-key header of each request. Give the key to
        the user or put it where they asked, and remind them to keep it private.
      </li>
      <li>
        Optional: once the project has a website, "Only accept requests from" that site makes
        Sefaria refuse this key (403 origin_not_allowed) on any request whose Origin header is
        not that site, including requests with no Origin. Turn it on only for keys used in
        front-end code that runs in a browser. Leave it off for keys used from a server,
        script, app or agent, including your own calls.
      </li>
    </ol>
    <p>API documentation: {API_DOCS_URL}</p>
  </div>
);


/* The one way in to developer settings. An account whose email is verified (by Google or
   Apple sign-in, or by an emailed confirmation link) goes straight in. Any other account
   confirms its email first with an emailed link, which leaves how it signs in unchanged.
   Developer settings stay on once they are on. */
const GetStarted = ({verified, confirmationSent, settingUp, highlight, onStart, onSendConfirmation,
                     onCancelConfirmation}) => {
  const [asking, setAsking] = useState(false);
  const [resent, setResent] = useState(false);
  const start = () => { if (verified) { onStart(); } else { setAsking(true); } };
  const cardClass = "devPocCard" + (highlight ? " settingsHighlight" : "");
  const email = accountEmail();
  const emailText = email ? <bdi dir="ltr"><strong>{email}</strong></bdi> : null;

  if (settingUp) {
    return (
      <div className={"devPocNotice devPocSettingUp " + cardClass} role="status">
        <span className="devPocSpinner" aria-hidden="true" />
        <strong><InterfaceText text={{en: "Setting up developer settings…", he: "מכינים את הגדרות המפתחים…"}} /></strong>
      </div>
    );
  }

  if (!verified && confirmationSent) {
    return (
      <div className={"devPocSsoPrompt " + cardClass} role="region" aria-label={Sefaria._v({en: "Check your email", he: "בדקו את תיבת הדוא״ל"})}>
        <h2><InterfaceText text={{en: "Check your email", he: "בדקו את תיבת הדוא״ל"}} /></h2>
        <p>
          <InterfaceText text={{
            en: <React.Fragment>We sent a confirmation link to {emailText}. Open it on any device, and developer settings continue here. The link works for 3 days.</React.Fragment>,
            he: <React.Fragment>שלחנו קישור לאישור אל {emailText}. פתחו אותו בכל מכשיר, והגדרות המפתחים ימשיכו כאן. הקישור בתוקף 3 ימים.</React.Fragment>,
          }} />
        </p>
        <div className="devPocActions">
          <button className="button small white" type="button" data-agent-action="resend-confirmation" onClick={() => { onSendConfirmation(); setResent(true); }}>
            <InterfaceText text={{en: "Resend the link", he: "שליחה חוזרת של הקישור"}} />
          </button>
          <button className="button small transparent" type="button" onClick={() => { onCancelConfirmation(); setAsking(false); setResent(false); }}>
            <InterfaceText text={{en: "Cancel", he: "ביטול"}} />
          </button>
        </div>
        {resent ?
          <p className="devPocHelp" role="status"><InterfaceText text={{en: "Sent again.", he: "נשלח שוב."}} /></p> : null}
        <p className="devPocHelp">
          <InterfaceText text={{
            en: "Not there? Check your spam folder. Wrong address? Change it in Account settings first.",
            he: "לא הגיע? בדקו בתיקיית הספאם. הכתובת שגויה? שנו אותה קודם בהגדרות החשבון.",
          }} />
        </p>
      </div>
    );
  }

  if (asking && !verified) {
    return (
      <div className={"devPocSsoPrompt " + cardClass} role="region" aria-label={Sefaria._v({en: "Confirm your email", he: "אישור כתובת הדוא״ל"})}>
        <h2><InterfaceText text={{en: "Confirm your email address", he: "אישור כתובת הדוא״ל"}} /></h2>
        <p>
          <InterfaceText text={{
            en: <React.Fragment>We email you about your API keys, so first we check that {email ? emailText : "your account email"} is really yours. It's a one-time step, and you keep signing in the way you do now.</React.Fragment>,
            he: <React.Fragment>אנחנו שולחים לך הודעות על מפתחות ה־API, ולכן קודם נוודא ש־{email ? emailText : "כתובת הדוא״ל של החשבון"} באמת שלך. זה צעד חד־פעמי, ודרך ההתחברות שלך לא משתנה.</React.Fragment>,
          }} />
        </p>
        <div className="devPocActions">
          <button className="button small blue" type="button" data-agent-action="send-confirmation" onClick={onSendConfirmation}>
            <InterfaceText text={{en: "Email me a confirmation link", he: "שלחו לי קישור לאישור"}} />
          </button>
          <button className="button small transparent" type="button" onClick={() => setAsking(false)}>
            <InterfaceText text={{en: "Cancel", he: "ביטול"}} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={"devPocGetStarted " + cardClass}>
      <h2><InterfaceText text={{en: "Build with the Sefaria API", he: "לבנות עם ה־API של ספריא"}} /></h2>
      <p>
        <InterfaceText text={{
          en: "Get an API key to use Sefaria's texts in your own website, app or tool, and tell us what you're building.",
          he: "קבלו מפתח API כדי להשתמש בטקסטים של ספריא באתר, באפליקציה או בכלי משלכם, וספרו לנו מה אתם בונים.",
        }} />
      </p>
      <div className="devPocActions">
        <button className="button small blue" type="button" data-agent-action="get-started" onClick={start}>
          <InterfaceText text={{en: "Get started", he: "בואו נתחיל"}} />
        </button>
      </div>
    </div>
  );
};


const emptyProfile = () => ({
  developerName: "", description: "", additionalEmail: "",
  termsAccepted: false, developerNews: false, notADeveloper: false,
});

/* The terms open in a new tab, so the form keeps what has been typed. */
const TermsLink = () => (
  <a href={API_TERMS_URL} target="_blank" rel="noopener noreferrer">
    <InterfaceText text={{en: "Sefaria API terms", he: "תנאי השימוש ב־API של ספריא"}} />
  </a>
);

const OptionalMark = () => (
  <span className="devPocMuted"><InterfaceText text={{en: "(optional)", he: "(לא חובה)"}} /></span>
);

/* Name and email come from the Sefaria account and are shown locked; an account without a
   name types one here instead. */
const AboutYouFields = ({fields, set}) => {
  const name = accountName();
  const email = accountEmail();
  return (
    <React.Fragment>
      <div className="devPocField">
        <label htmlFor="devPocName">
          <InterfaceText text={{en: "Name", he: "שם"}} />
        </label>
        {name ?
          <FieldNote fieldId="devPocName">
            <InterfaceText text={{en: "From your Sefaria account.", he: "מתוך חשבון ספריא שלך."}} />
          </FieldNote> : null}
        {name ?
          <input id="devPocName" value={name} readOnly aria-readonly="true" aria-describedby={tipId("devPocName")} className="devPocLocked" dir="auto" /> :
          <input id="devPocName" value={fields.developerName} onChange={e => set("developerName", e.target.value)} dir="auto" />}
      </div>
      {email ?
        <div className="devPocField">
          <label htmlFor="devPocEmail">
            <InterfaceText text={{en: "Email", he: "דוא״ל"}} />
          </label>
          <FieldNote fieldId="devPocEmail">
            <InterfaceText text={{
              en: "From your Sefaria account. We send project and key emails here.",
              he: "מתוך חשבון ספריא שלך. לכתובת הזו נשלח הודעות על פרויקטים ומפתחות.",
            }} />
          </FieldNote>
          <input id="devPocEmail" type="email" value={email} readOnly aria-readonly="true" aria-describedby={tipId("devPocEmail")} className="devPocLocked" dir="ltr" />
        </div> : null}
      <div className="devPocField">
        <label htmlFor="devPocEmail2">
          <InterfaceText text={{en: "Also send project and key emails to", he: "לשלוח הודעות על פרויקטים ומפתחות גם אל"}} /> <OptionalMark />
          <InfoTip fieldId="devPocEmail2">
            <InterfaceText text={{
              en: "Add another address, like a work address or a colleague who looks after the project, and it gets the same emails.",
              he: "הוסיפו כתובת נוספת, למשל כתובת עבודה או של עמית שמטפל בפרויקט, והיא תקבל את אותן הודעות.",
            }} />
          </InfoTip>
        </label>
        <input id="devPocEmail2" type="email" dir="ltr" aria-describedby={tipId("devPocEmail2")} value={fields.additionalEmail} onChange={e => set("additionalEmail", e.target.value)} />
      </div>
      <div className="devPocField">
        <label htmlFor="devPocDescription">
          <InterfaceText text={{en: "Tell us about yourself", he: "ספרו לנו על עצמכם"}} /> <OptionalMark />
          <InfoTip fieldId="devPocDescription">
            <InterfaceText text={{en: "It helps us understand who uses the API.", he: "זה עוזר לנו להבין מי משתמש ב־API."}} />
          </InfoTip>
        </label>
        <textarea
          id="devPocDescription"
          aria-describedby={tipId("devPocDescription")}
          rows={3}
          dir="auto"
          placeholder={Sefaria._v({
            en: "Who you are, where you work or study, what you like to build",
            he: "מי אתם, איפה אתם עובדים או לומדים, מה אתם אוהבים לבנות",
          })}
          value={fields.description}
          onChange={e => set("description", e.target.value)}
        />
      </div>
      <label className="devPocChoice">
        <input type="checkbox" id="devPocNotADeveloper" aria-describedby={tipId("devPocNotADeveloper")} checked={!!fields.notADeveloper} onChange={e => set("notADeveloper", e.target.checked)} />
        <span>
          <InterfaceText text={{en: "I don't write code myself", he: "אני לא כותב/ת קוד בעצמי"}} />
          <InfoTip fieldId="devPocNotADeveloper">
            <InterfaceText text={{
              en: "For example, you build with AI tools, or someone else writes the code.",
              he: "למשל, אתם בונים בעזרת כלי בינה מלאכותית, או שמישהו אחר כותב את הקוד.",
            }} />
          </InfoTip>
        </span>
      </label>
    </React.Fragment>
  );
};

/* The legal part of the profile: one required agreement (terms, and email about keys and
   projects) and one optional opt-in (developer news and promotions). */
const LegalFields = ({fields, set, accepted}) => (
  <section className="devPocLegal" aria-label={Sefaria._v({en: "Terms and emails", he: "תנאים והודעות דוא״ל"})}>
    {accepted ?
      <p className="devPocHelp devPocAccepted">
        <InterfaceText text={{
          en: <React.Fragment>You've accepted the <TermsLink />, and agreed that Sefaria may email you about your API keys and contact you about your projects.</React.Fragment>,
          he: <React.Fragment>אישרת את <TermsLink />, והסכמת שספריא תשלח לך הודעות דוא״ל על מפתחות ה־API ותיצור איתך קשר בנוגע לפרויקטים שלך.</React.Fragment>,
        }} />
      </p> :
      <label className="devPocChoice">
        <input type="checkbox" checked={fields.termsAccepted} onChange={e => set("termsAccepted", e.target.checked)} />
        <span>
          <InterfaceText text={{
            en: <React.Fragment>I accept the <TermsLink />, and agree that Sefaria may email me about my API keys and contact me about my projects</React.Fragment>,
            he: <React.Fragment>אני מאשר/ת את <TermsLink />, ומסכים/ה שספריא תשלח לי הודעות דוא״ל על מפתחות ה־API ותיצור איתי קשר בנוגע לפרויקטים שלי</React.Fragment>,
          }} />
        </span>
      </label>}
    <label className="devPocChoice">
      <input type="checkbox" id="devPocDeveloperNews" aria-describedby={tipId("devPocDeveloperNews")} checked={!!fields.developerNews} onChange={e => set("developerNews", e.target.checked)} />
      <span>
        <InterfaceText text={{en: "Send me Sefaria's developer news and promotional emails", he: "שלחו לי עדכונים למפתחים ודיוור שיווקי מספריא"}} /> <OptionalMark />
        <InfoTip fieldId="devPocDeveloperNews">
          <InterfaceText text={{
            en: "New features, events and ideas for building with Sefaria. You can unsubscribe at any time.",
            he: "תכונות חדשות, אירועים ורעיונות לבנייה עם ספריא. אפשר לבטל את ההרשמה בכל עת.",
          }} />
        </InfoTip>
      </span>
    </label>
  </section>
);

const profileError = (fields) => {
  if (!accountName() && !fields.developerName.trim()) { return Sefaria._v({en: "Enter your name.", he: "נא להזין שם."}); }
  if (fields.additionalEmail.trim() && !/^\S+@\S+\.\S+$/.test(fields.additionalEmail.trim())) {
    return Sefaria._v({en: "Enter a valid additional email, or leave it empty.", he: "נא להזין כתובת דוא״ל נוספת תקינה, או להשאיר את השדה ריק."});
  }
  if (!fields.termsAccepted) { return Sefaria._v({en: "Accept the API terms to continue.", he: "כדי להמשיך יש לאשר את תנאי השימוש ב־API."}); }
  return "";
};

const cleanProfile = (fields) => ({
  ...fields,
  developerName: accountName() || fields.developerName.trim(),
  description: fields.description.trim(),
  additionalEmail: fields.additionalEmail.trim(),
});

/* First visit: one form, with the legal part at the bottom. */
const ProfileOnboarding = ({onSave}) => {
  const [fields, setFields] = useState(emptyProfile);
  const [error, setError] = useState("");
  const set = (key, value) => { setFields(f => ({...f, [key]: value})); setError(""); };

  const finish = (e) => {
    e.preventDefault();
    const problem = profileError(fields);
    setError(problem);
    if (!problem) { onSave(cleanProfile(fields)); }
  };

  return (
    <div className="devPocOnboarding devPocCard">
      <h2><InterfaceText text={{en: "About you", he: "קצת עליך"}} /></h2>
      <form className="devPocForm" onSubmit={finish}>
        <AboutYouFields fields={fields} set={set} />
        <LegalFields fields={fields} set={set} accepted={false} />
        {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
        <div className="devPocActions">
          <button type="submit" className="button small blue" data-agent-action="save-profile">
            <InterfaceText text={{en: "Continue", he: "המשך"}} />
          </button>
        </div>
      </form>
    </div>
  );
};

const ProfileForm = ({profile, onSave, onCancel}) => {
  const [fields, setFields] = useState({...emptyProfile(), ...profile});
  const [error, setError] = useState("");
  const set = (key, value) => { setFields(f => ({...f, [key]: value})); setError(""); };

  const submit = (e) => {
    e.preventDefault();
    const problem = profileError(fields);
    setError(problem);
    if (!problem) { onSave(cleanProfile(fields)); }
  };

  return (
    <form className="devPocForm" onSubmit={submit}>
      <AboutYouFields fields={fields} set={set} />
      <LegalFields fields={fields} set={set} accepted={!!(profile && profile.termsAccepted)} />
      {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
      <div className="devPocActions">
        <button type="submit" className="button small blue" data-agent-action="save-profile">
          <InterfaceText text={{en: "Save profile", he: "שמירת פרופיל"}} />
        </button>
        {onCancel ?
          <button type="button" className="button small transparent" onClick={onCancel}>
            <InterfaceText text={{en: "Cancel", he: "ביטול"}} />
          </button> : null}
      </div>
    </form>
  );
};


/* A listing's public fields only: what anyone can already see on Powered by Sefaria. */
const ListingSummary = ({listing}) => (
  <div className="devPocListingSummary">
    <strong dir="auto">{listing.name}</strong> <span className="devPocMuted" dir="ltr">({listing.url})</span>
    <p className="devPocHelp" dir="auto">{listing.description}</p>
  </div>
);

const ContactLink = () => <a href={"mailto:" + CONTACT_EMAIL} dir="ltr">{CONTACT_EMAIL}</a>;

/* An unowned listing submitted with this account's verified email can be linked straight away. */
const EmailMatchNotice = ({listing, onLink, onDismiss}) => (
  <div className="devPocMatch" role="region" aria-label={Sefaria._v({en: "Your Powered by Sefaria listing", he: "הרישום שלך ב־Powered by Sefaria"})}>
    <p>
      <InterfaceText text={{
        en: <React.Fragment>We found a Powered by Sefaria listing you submitted: <strong dir="auto">{listing.name}</strong></React.Fragment>,
        he: <React.Fragment>מצאנו רישום ב־Powered by Sefaria שהגשת: <strong dir="auto">{listing.name}</strong></React.Fragment>,
      }} />
    </p>
    <ListingSummary listing={listing} />
    <div className="devPocActions">
      <button type="button" className="button small blue" data-agent-action="link-listing" onClick={onLink}>
        <InterfaceText text={{en: "Link", he: "קישור"}} />
      </button>
      <button type="button" className="button small white" onClick={onDismiss}>
        <InterfaceText text={{en: "Not mine", he: "זה לא שלי"}} />
      </button>
    </div>
  </div>
);

/* Typing a website that is already listed never grants the listing: only a matching
   verified email links it, and anything else goes to Sefaria to confirm. */
const WebsiteMatchNotice = ({listing, canLink, requested, onLink, onRequest, onCancelRequest, onDismiss}) => {
  if (listing.ownedByAnotherAccount) {
    return (
      <div className="devPocMatch devPocMatchBlocked" role="status">
        <p>
          <InterfaceText text={{
            en: <React.Fragment>This website is already registered by another account. If it's yours, contact <ContactLink />.</React.Fragment>,
            he: <React.Fragment>האתר הזה כבר רשום בחשבון אחר. אם הוא שלך, פנו אל <ContactLink />.</React.Fragment>,
          }} />
        </p>
      </div>
    );
  }
  if (listing.linkedProjectId) {
    return (
      <div className="devPocMatch devPocMatchBlocked" role="status">
        <p>
          <InterfaceText text={{
            en: "This website's Powered by Sefaria listing is already linked to another of your projects.",
            he: "הרישום של האתר הזה ב־Powered by Sefaria כבר מקושר לפרויקט אחר שלך.",
          }} />
        </p>
      </div>
    );
  }
  return (
    <div className="devPocMatch" role="region" aria-label={Sefaria._v({en: "Website already listed", he: "האתר כבר מופיע ברשימה"})}>
      <p><strong><InterfaceText text={{en: "This website is already on Powered by Sefaria", he: "האתר הזה כבר מופיע ב־Powered by Sefaria"}} /></strong></p>
      <ListingSummary listing={listing} />
      {requested ?
        <React.Fragment>
          <p>
            <span className="devPocBadge devPocBadgePending"><InterfaceText text={{en: "Link requested", he: "התבקש קישור"}} /></span>{" "}
            <InterfaceText text={{
              en: "Someone at Sefaria will check it and connect the two.",
              he: "צוות ספריא יבדוק את הבקשה ויקשר בין השניים.",
            }} />
          </p>
          <div className="devPocActions">
            <button type="button" className="devPocTextButton" onClick={onCancelRequest}>
              <InterfaceText text={{en: "Cancel request", he: "ביטול הבקשה"}} />
            </button>
          </div>
        </React.Fragment> :
        canLink ?
        <div className="devPocActions">
          <button type="button" className="button small blue" data-agent-action="link-listing" onClick={onLink}>
            <InterfaceText text={{en: "Link this listing", he: "קישור הרישום הזה"}} />
          </button>
          <button type="button" className="button small white" onClick={onDismiss}>
            <InterfaceText text={{en: "Not mine", he: "זה לא שלי"}} />
          </button>
        </div> :
        <React.Fragment>
          <p className="devPocHelp">
            <InterfaceText text={{
              en: "If it's yours, ask to link it and Sefaria will confirm. Or carry on with a new project.",
              he: "אם הוא שלך, בקשו לקשר אותו וספריא תאשר. או המשיכו עם פרויקט חדש.",
            }} />
          </p>
          <div className="devPocActions">
            <button type="button" className="button small white" data-agent-action="request-listing-link" onClick={onRequest}>
              <InterfaceText text={{en: "Request to link", he: "בקשת קישור"}} />
            </button>
            <button type="button" className="button small transparent" onClick={onDismiss}>
              <InterfaceText text={{en: "Continue as a new project", he: "להמשיך כפרויקט חדש"}} />
            </button>
          </div>
        </React.Fragment>}
    </div>
  );
};

const LinkedListingNote = ({listing}) => (
  <p className="devPocHelp devPocLinked" role="status">
    <span className="devPocBadge"><InterfaceText text={{en: "Linked", he: "מקושר"}} /></span>{" "}
    <InterfaceText text={{
      en: <React.Fragment>This project is the <strong dir="auto">{listing.name}</strong> listing on Powered by Sefaria.</React.Fragment>,
      he: <React.Fragment>הפרויקט הזה הוא הרישום <strong dir="auto">{listing.name}</strong> ב־Powered by Sefaria.</React.Fragment>,
    }} />
  </p>
);


const ProjectFields = ({fields, set, onChoosePublic, onChoosePrivate, onShowPublic, emailNotice, websiteNotice, linkedNote}) => (
  <React.Fragment>
    {emailNotice}
    {linkedNote}
    <div className="devPocField">
      <label htmlFor="devPocProjectName"><InterfaceText text={{en: "Project name", he: "שם הפרויקט"}} /></label>
      <input id="devPocProjectName" dir="auto" value={fields.name} onChange={e => set("name", e.target.value)} />
    </div>
    <div className="devPocField">
      <label htmlFor="devPocProjectDescription">
        <InterfaceText text={{en: "Short description", he: "תיאור קצר"}} />
        <InfoTip fieldId="devPocProjectDescription">
          <InterfaceText text={{
            en: "The name and description help you tell your projects apart and tell the Sefaria team what you're building. If you make the project public, they're also what visitors to Powered by Sefaria see.",
            he: "השם והתיאור עוזרים לכם להבחין בין הפרויקטים שלכם ומספרים לצוות ספריא מה אתם בונים. אם תהפכו את הפרויקט לציבורי, זה גם מה שיראו המבקרים ב־Powered by Sefaria.",
          }} />
        </InfoTip>
      </label>
      <input
        id="devPocProjectDescription"
        dir="auto"
        maxLength={MAX_DESCRIPTION_LENGTH}
        aria-describedby={tipId("devPocProjectDescription") + " devPocProjectDescriptionCount"}
        placeholder={Sefaria._v({
          en: "One sentence, e.g. a daily study tracker for my community",
          he: "משפט אחד, למשל: כלי למעקב אחר לימוד יומי בקהילה שלי",
        })}
        value={fields.description}
        onChange={e => set("description", e.target.value)}
      />
      <CharacterCount id="devPocProjectDescriptionCount" length={fields.description.length} />
    </div>
    <div className="devPocField">
      <label htmlFor="devPocProjectOrg"><InterfaceText text={{en: "Organization", he: "ארגון"}} /> <OptionalMark /></label>
      <input id="devPocProjectOrg" dir="auto" value={fields.organization} onChange={e => set("organization", e.target.value)} />
    </div>
    <div className="devPocField">
      <label htmlFor="devPocProjectUrl">
        <InterfaceText text={{en: "Website", he: "אתר"}} /> <OptionalMark />
        <InfoTip fieldId="devPocProjectUrl" wide>
          <InterfaceText text={{
            en: "The address people visit to use your project. We show it with your project on Powered by Sefaria, and you can use it to keep your key from working anywhere else. No website yet? You can add it later.",
            he: "הכתובת שבה משתמשים בפרויקט שלכם. נציג אותה לצד הפרויקט ב־Powered by Sefaria, ותוכלו להשתמש בה כדי שהמפתח לא יעבוד בשום מקום אחר. עדיין אין אתר? אפשר להוסיף אותו מאוחר יותר.",
          }} />
        </InfoTip>
      </label>
      <input
        id="devPocProjectUrl"
        aria-describedby={tipId("devPocProjectUrl")}
        dir="ltr"
        placeholder="https://"
        value={fields.websiteUrl}
        onChange={e => set("websiteUrl", e.target.value)}
      />
      {websiteNotice}
    </div>
    <label className="devPocChoice">
      <input type="checkbox" id="devPocAiAssisted" aria-describedby={tipId("devPocAiAssisted")} checked={fields.aiAssisted} onChange={e => set("aiAssisted", e.target.checked)} />
      <span>
        <InterfaceText text={{en: "Built with help from AI tools", he: "נבנה בעזרת כלי בינה מלאכותית"}} />
        <InfoTip fieldId="devPocAiAssisted">
          <InterfaceText text={{
            en: "Tick this if an AI tool wrote some or all of the code. It helps us learn how people build.",
            he: "סמנו אם כלי בינה מלאכותית כתב חלק מהקוד או את כולו. זה עוזר לנו ללמוד איך אנשים בונים.",
          }} />
        </InfoTip>
      </span>
    </label>
    <fieldset className="devPocFieldset">
      <legend><InterfaceText text={{en: "Visibility", he: "נראוּת"}} /></legend>
      <label className="devPocChoice">
        <input type="radio" id="devPocVisibilityPublic" aria-describedby={tipId("devPocVisibilityPublic")} name="devPocVisibility" value="public" checked={fields.visibility === "public"} onChange={onChoosePublic} />
        <span>
          <InterfaceText text={{en: "Public", he: "ציבורי"}} />
          <InfoTip fieldId="devPocVisibilityPublic" wide>
            <InterfaceText text={{
              en: "Sefaria may show this project on Powered by Sefaria, our gallery of projects built with Sefaria. We choose what to feature, so it may not appear.",
              he: "ספריא עשויה להציג את הפרויקט ב־Powered by Sefaria, הגלריה של פרויקטים שנבנו עם ספריא. אנחנו בוחרים מה להציג, כך שייתכן שהוא לא יופיע.",
            }} />
          </InfoTip>
        </span>
      </label>
      <label className="devPocChoice">
        <input type="radio" id="devPocVisibilityPrivate" aria-describedby={tipId("devPocVisibilityPrivate")} name="devPocVisibility" value="private" checked={fields.visibility === "private"} onChange={onChoosePrivate} />
        <span>
          <InterfaceText text={{en: "Private", he: "פרטי"}} />
          <InfoTip fieldId="devPocVisibilityPrivate">
            <InterfaceText text={{en: "Only you and the Sefaria team can see this project.", he: "רק את/ה וצוות ספריא יכולים לראות את הפרויקט."}} />
          </InfoTip>
        </span>
      </label>
      <button type="button" className="devPocTextButton" data-agent-action="show-public-preview" onClick={onShowPublic}>
        <InterfaceText text={{en: "Show me what will be public", he: "הראו לי מה יהיה ציבורי"}} />
      </button>
    </fieldset>
  </React.Fragment>
);

const CharacterCount = ({id, length}) => (
  <p className={"devPocCount" + (length >= MAX_DESCRIPTION_LENGTH ? " devPocCountFull" : "")} id={id} dir="ltr">
    {length}/{MAX_DESCRIPTION_LENGTH}
  </p>
);


const CONFLICT_LABELS = {
  name: {en: "Project name", he: "שם הפרויקט"},
  description: {en: "Short description", he: "תיאור קצר"},
  websiteUrl: {en: "Website", he: "אתר"},
};

/* Where the project and the listing disagree, both values are shown and the person
   writes what to keep; nothing is chosen for them. */
const LinkConflictDialog = ({listing, conflicts, onLink, onCancel}) => {
  const [kept, setKept] = useState(() => Object.fromEntries(conflicts.map(c => [c.field, ""])));
  const firstRef = useRef(null);
  useDialogKeys(firstRef, onCancel);
  const keep = (field, value) => setKept(k => ({...k, [field]: value}));
  const ready = conflicts.every(c => kept[c.field].trim());
  const empty = <span className="devPocMuted"><InterfaceText text={{en: "Empty", he: "ריק"}} /></span>;

  return (
    <div className="devPocModalStage devPocConfirmStage" role="dialog" aria-modal="true" aria-labelledby="devPocConflictTitle">
      <section className="devPocDialog devPocConflictDialog">
        <h2 id="devPocConflictTitle"><InterfaceText text={{en: "Choose what to keep", he: "בחרו מה לשמור"}} /></h2>
        <p>
          <InterfaceText text={{
            en: <React.Fragment>Your project and the <strong dir="auto">{listing.name}</strong> listing say different things. Write what you want to keep for each. Linking makes the project public, like the listing.</React.Fragment>,
            he: <React.Fragment>הפרויקט שלך והרישום <strong dir="auto">{listing.name}</strong> אומרים דברים שונים. כתבו מה לשמור בכל שדה. הקישור הופך את הפרויקט לציבורי, כמו הרישום.</React.Fragment>,
          }} />
        </p>
        {conflicts.map((c, i) => {
          const inputId = "devPocKeep-" + c.field;
          const dir = c.field === "websiteUrl" ? "ltr" : "auto";
          return (
            <div className="devPocConflict" key={c.field} data-conflict={c.field}>
              <h3><InterfaceText text={CONFLICT_LABELS[c.field]} /></h3>
              <div className="devPocConflictSides">
                <div className="devPocConflictSide">
                  <p className="devPocMuted"><InterfaceText text={{en: "Your project", he: "הפרויקט שלך"}} /></p>
                  <p dir={c.project ? dir : null}>{c.project || empty}</p>
                  {c.project ?
                    <button type="button" className="devPocTextButton" onClick={() => keep(c.field, c.project)}>
                      <InterfaceText text={{en: "Use this", he: "להשתמש בזה"}} />
                    </button> : null}
                </div>
                <div className="devPocConflictSide">
                  <p className="devPocMuted"><InterfaceText text={{en: "Powered by listing", he: "הרישום ב־Powered by"}} /></p>
                  <p dir={dir}>{c.listing}</p>
                  <button type="button" className="devPocTextButton" onClick={() => keep(c.field, c.listing)}>
                    <InterfaceText text={{en: "Use this", he: "להשתמש בזה"}} />
                  </button>
                </div>
              </div>
              <div className="devPocField">
                <label htmlFor={inputId}><InterfaceText text={{en: "Keep", he: "לשמור"}} /></label>
                <input
                  id={inputId}
                  ref={i === 0 ? firstRef : null}
                  dir={dir}
                  maxLength={c.field === "description" ? MAX_DESCRIPTION_LENGTH : null}
                  value={kept[c.field]}
                  onChange={e => keep(c.field, e.target.value)}
                />
              </div>
            </div>
          );
        })}
        <div className="devPocActions">
          <button type="button" className="button small white" onClick={onCancel}>
            <InterfaceText text={{en: "Cancel", he: "ביטול"}} />
          </button>
          <button
            type="button"
            className="button small blue"
            disabled={!ready}
            data-agent-action="confirm-link-listing"
            onClick={() => onLink(Object.fromEntries(conflicts.map(c => [c.field, kept[c.field].trim()])))}
          >
            <InterfaceText text={{en: "Link listing", he: "קישור הרישום"}} />
          </button>
        </div>
      </section>
    </div>
  );
};


/* A public project may already have been published, so neither making it private nor
   deleting it can promise it disappears everywhere. */
const PublishedCopiesWarning = () => (
  <InterfaceText text={{
    en: <React.Fragment>If it already appeared on a published page, we can't guarantee it's removed everywhere. If that's a problem, email <ContactLink />.</React.Fragment>,
    he: <React.Fragment>אם הוא כבר הופיע בעמוד שפורסם, איננו יכולים להבטיח שיוסר מכל מקום. אם זו בעיה, כתבו אל <ContactLink />.</React.Fragment>,
  }} />
);

const MakePrivateDialog = ({onConfirm, onCancel}) => {
  const cancelRef = useRef(null);
  useDialogKeys(cancelRef, onCancel);
  return (
    <div className="devPocModalStage devPocConfirmStage" role="dialog" aria-modal="true" aria-labelledby="devPocPrivateTitle">
      <section className="devPocDialog">
        <h2 id="devPocPrivateTitle"><InterfaceText text={{en: "Make this project private?", he: "להפוך את הפרויקט לפרטי?"}} /></h2>
        <p>
          <InterfaceText text={{en: "The project will be marked private.", he: "הפרויקט יסומן כפרטי."}} />{" "}
          <PublishedCopiesWarning />
        </p>
        <div className="devPocActions">
          <button type="button" className="button small white" ref={cancelRef} onClick={onCancel}>
            <InterfaceText text={{en: "Keep public", he: "להשאיר ציבורי"}} />
          </button>
          <button type="button" className="button small blue" data-agent-action="confirm-private" onClick={onConfirm}>
            <InterfaceText text={{en: "Make private", he: "להפוך לפרטי"}} />
          </button>
        </div>
      </section>
    </div>
  );
};


/* What a public project shows, for the developer to look at before or after choosing. */
const PublicPreviewDialog = ({fields, authorName, onClose}) => {
  const closeRef = useRef(null);
  useDialogKeys(closeRef, onClose);
  const notYet = <span className="devPocMuted"><InterfaceText text={{en: "Not filled in yet", he: "עדיין לא מולא"}} /></span>;
  const rows = [
    {label: {en: "Project name", he: "שם הפרויקט"}, value: fields.name.trim(), dir: "auto"},
    {label: {en: "Description", he: "תיאור"}, value: fields.description.trim(), dir: "auto"},
    {label: {en: "Made by", he: "נוצר על ידי"}, value: authorName, dir: "auto"},
    {label: {en: "Organization", he: "ארגון"}, value: fields.organization.trim(), dir: "auto", optional: true},
    {label: {en: "Website", he: "אתר"}, value: fields.websiteUrl.trim(), dir: "ltr", optional: true},
  ].filter(row => row.value || !row.optional);

  return (
    <div className="devPocModalStage devPocConfirmStage" role="dialog" aria-modal="true" aria-labelledby="devPocPublicTitle">
      <section className="devPocDialog">
        <h2 id="devPocPublicTitle"><InterfaceText text={{en: "What will be public", he: "מה יהיה ציבורי"}} /></h2>
        <p>
          <InterfaceText text={{
            en: "If Sefaria features it on Powered by Sefaria, anyone will be able to see:",
            he: "אם ספריא תציג אותו ב־Powered by Sefaria, כל אחד יוכל לראות:",
          }} />
        </p>
        <dl className="devPocPreview">
          {rows.map(row => (
            <div className="devPocPreviewRow" key={row.label.en}>
              <dt><InterfaceText text={row.label} /></dt>
              <dd dir={row.value ? row.dir : null}>{row.value || notYet}</dd>
            </div>
          ))}
        </dl>
        <p>
          <InterfaceText text={{
            en: "Your API keys and usage are never shown. You can change these details, or make the project private again, with Edit project.",
            he: "מפתחות ה־API והשימוש בהם לעולם לא מוצגים. אפשר לשנות את הפרטים האלה, או להחזיר את הפרויקט למצב פרטי, דרך עריכת הפרויקט.",
          }} />
        </p>
        <div className="devPocActions">
          <button type="button" className="button small white" ref={closeRef} onClick={onClose}>
            <InterfaceText text={{en: "Close", he: "סגירה"}} />
          </button>
        </div>
      </section>
    </div>
  );
};


const NoWebsiteDialog = ({onAddWebsite, onSaveAnyway}) => (
  <div className="devPocModalStage devPocConfirmStage" role="dialog" aria-modal="true" aria-labelledby="devPocNoWebsiteTitle">
    <section className="devPocDialog">
      <h2 id="devPocNoWebsiteTitle"><InterfaceText text={{en: "Save without a website?", he: "לשמור בלי אתר?"}} /></h2>
      <p><InterfaceText text={{en: "A website helps your project in two ways:", he: "אתר עוזר לפרויקט שלכם בשתי דרכים:"}} /></p>
      <ul className="devPocList">
        <li><InterfaceText text={{en: "We show it alongside your project on Powered by Sefaria.", he: "נציג אותו לצד הפרויקט ב־Powered by Sefaria."}} /></li>
        <li>
          <InterfaceText text={{
            en: "You can make your key work only on your site, so a copied key is no use anywhere else.",
            he: "אפשר להגביל את המפתח כך שיעבוד רק באתר שלכם, ומפתח שהועתק לא יעבוד בשום מקום אחר.",
          }} />
        </li>
      </ul>
      <p>
        <InterfaceText text={{
          en: <React.Fragment>No website yet? That's fine. You can add it later with <strong>Edit project</strong>.</React.Fragment>,
          he: <React.Fragment>עדיין אין אתר? זה בסדר. אפשר להוסיף אותו מאוחר יותר דרך <strong>עריכת הפרויקט</strong>.</React.Fragment>,
        }} />
      </p>
      <div className="devPocActions">
        <button type="button" className="button small white" onClick={onAddWebsite}>
          <InterfaceText text={{en: "Add a website", he: "הוספת אתר"}} />
        </button>
        <button type="button" className="button small blue" data-agent-action="save-without-website" onClick={onSaveAnyway}>
          <InterfaceText text={{en: "Save without a website", he: "שמירה בלי אתר"}} />
        </button>
      </div>
    </section>
  </div>
);


/* One form for creating and editing a project. A missing website asks once before saving,
   and the website field gets focus if the developer goes back to add one. Matching Powered
   by listings are offered as the developer types. */
const ProjectForm = ({initial, savedVisibility, authorName, submitLabel, listingContext, onSave, onCancel, onDelete}) => {
  const [fields, setFields] = useState(initial);
  const [error, setError] = useState("");
  const [askWebsite, setAskWebsite] = useState(false);
  const [previewPublic, setPreviewPublic] = useState(false);
  const [askPrivate, setAskPrivate] = useState(false);
  const [linking, setLinking] = useState(null);   // {listing, conflicts}
  const [dismissed, setDismissed] = useState([]);
  const formRef = useRef(null);
  const set = (key, value) => { setFields(f => ({...f, [key]: value})); setError(""); };

  const {listings, email, verified} = listingContext;
  const unsettled = !fields.linkedListingId && !fields.listingRequest;
  const emailMatch = unsettled ? emailMatchedListing(listings, email, verified) : null;
  const websiteMatch = listingForWebsite(listings, fields.websiteUrl);
  const showWebsiteMatch = websiteMatch && websiteMatch.id !== fields.linkedListingId
    && !dismissed.includes(websiteMatch.id)
    && (!fields.listingRequest || fields.listingRequest.id === websiteMatch.id);
  const showEmailMatch = emailMatch && !dismissed.includes(emailMatch.id)
    && !(showWebsiteMatch && websiteMatch.id === emailMatch.id);
  const linkedListing = fields.linkedListingId ? listings.find(l => l.id === fields.linkedListingId) : null;

  const dismiss = (listing) => setDismissed(d => [...d, listing.id]);

  const applyLink = (listing, kept) => {
    setLinking(null);
    setFields(f => ({
      ...f, ...kept, linkedListingId: listing.id, listingRequest: null,
      visibility: "public",
    }));
    setError("");
  };

  const startLink = (listing) => {
    const conflicts = listingConflicts(fields, listing);
    if (conflicts.length) { setLinking({listing: publicListing(listing), conflicts}); }
    else { applyLink(listing, {}); }
  };

  const save = () => onSave({
    ...fields, name: fields.name.trim(), description: fields.description.trim(),
    organization: fields.organization.trim(), websiteUrl: parseWebsite(fields.websiteUrl).url,
  });

  const submit = (e) => {
    e.preventDefault();
    if (!fields.name.trim()) { setError(Sefaria._v({en: "Enter a project name.", he: "נא להזין שם לפרויקט."})); return; }
    if (!fields.description.trim()) { setError(Sefaria._v({en: "Enter a short description.", he: "נא להזין תיאור קצר."})); return; }
    if (fields.description.trim().length > MAX_DESCRIPTION_LENGTH) {
      setError(Sefaria._v({
        en: "Keep the description to " + MAX_DESCRIPTION_LENGTH + " characters.",
        he: "התיאור יכול להכיל עד " + MAX_DESCRIPTION_LENGTH + " תווים.",
      }));
      return;
    }
    if (!parseWebsite(fields.websiteUrl).valid) {
      setError(Sefaria._v({
        en: "Enter a website address like example.com, or leave it empty.",
        he: "נא להזין כתובת אתר כמו example.com, או להשאיר את השדה ריק.",
      }));
      return;
    }
    if (!fields.visibility) {
      setError(Sefaria._v({en: "Choose whether the project is public or private.", he: "נא לבחור אם הפרויקט ציבורי או פרטי."}));
      return;
    }
    setError("");
    if (!fields.websiteUrl.trim()) { setAskWebsite(true); return; }
    save();
  };

  const addWebsite = () => {
    setAskWebsite(false);
    const input = formRef.current && formRef.current.querySelector("#devPocProjectUrl");
    if (input) { input.focus(); }
  };

  const choosePrivate = () => {
    if (fields.visibility === "private") { return; }
    if (savedVisibility === "public") { setAskPrivate(true); } else { set("visibility", "private"); }
  };

  return (
    <React.Fragment>
      <form className="devPocForm" onSubmit={submit} ref={formRef}>
        <ProjectFields
          fields={fields}
          set={set}
          onChoosePublic={() => set("visibility", "public")}
          onChoosePrivate={choosePrivate}
          onShowPublic={() => setPreviewPublic(true)}
          emailNotice={showEmailMatch ?
            <EmailMatchNotice
              listing={publicListing(emailMatch)}
              onLink={() => startLink(emailMatch)}
              onDismiss={() => dismiss(emailMatch)}
            /> : null}
          websiteNotice={showWebsiteMatch ?
            <WebsiteMatchNotice
              listing={{...publicListing(websiteMatch), ownedByAnotherAccount: websiteMatch.ownedByAnotherAccount,
                linkedProjectId: websiteMatch.linkedProjectId}}
              canLink={canLinkByEmail(websiteMatch, email, verified)}
              requested={!!fields.listingRequest && fields.listingRequest.id === websiteMatch.id}
              onLink={() => startLink(websiteMatch)}
              onRequest={() => set("listingRequest", publicListing(websiteMatch))}
              onCancelRequest={() => set("listingRequest", null)}
              onDismiss={() => dismiss(websiteMatch)}
            /> : null}
          linkedNote={linkedListing ? <LinkedListingNote listing={publicListing(linkedListing)} /> : null}
        />
        <p className="devPocHelp">
          <InterfaceText text={{
            en: "Projects stay with this Sefaria account and can't be transferred to another account.",
            he: "פרויקטים נשארים בחשבון ספריא הזה ואי אפשר להעביר אותם לחשבון אחר.",
          }} />
        </p>
        {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
        <div className="devPocActions">
          <button type="submit" className="button small blue" data-agent-action={onDelete ? "save-project" : "create-project"}>
            <InterfaceText text={submitLabel} />
          </button>
          <button type="button" className="button small transparent" onClick={onCancel}>
            <InterfaceText text={{en: "Cancel", he: "ביטול"}} />
          </button>
          {onDelete ?
            <button type="button" className="button small transparent devPocDanger" onClick={onDelete}>
              <InterfaceText text={{en: "Delete project", he: "מחיקת הפרויקט"}} />
            </button> : null}
        </div>
      </form>
      {askWebsite ?
        <NoWebsiteDialog onAddWebsite={addWebsite} onSaveAnyway={() => { setAskWebsite(false); save(); }} /> : null}
      {previewPublic ?
        <PublicPreviewDialog fields={fields} authorName={authorName} onClose={() => setPreviewPublic(false)} /> : null}
      {askPrivate ?
        <MakePrivateDialog
          onConfirm={() => { setAskPrivate(false); set("visibility", "private"); }}
          onCancel={() => setAskPrivate(false)}
        /> : null}
      {linking ?
        <LinkConflictDialog
          listing={linking.listing}
          conflicts={linking.conflicts}
          onLink={kept => applyLink(linking.listing, kept)}
          onCancel={() => setLinking(null)}
        /> : null}
    </React.Fragment>
  );
};

const newProjectFields = () => ({
  name: "", description: "", organization: "", websiteUrl: "",
  visibility: null, aiAssisted: false, listingRequest: null, linkedListingId: null,
});

/* The new-project form opens in place at the top of the project list. */
const NewProjectPanel = ({authorName, listingContext, onCreate, onCancel}) => {
  const panelRef = useRef(null);
  useEffect(() => {
    const input = panelRef.current && panelRef.current.querySelector("#devPocProjectName");
    if (input) { input.focus(); }
  }, []);
  return (
    <section className="devPocNewProject devPocCard" ref={panelRef} aria-label={Sefaria._v({en: "New project", he: "פרויקט חדש"})}>
      <h2><InterfaceText text={{en: "New project", he: "פרויקט חדש"}} /></h2>
      <p className="devPocHelp devPocLead">
        <InterfaceText text={{en: "You can add keys once it's saved.", he: "אחרי השמירה תוכלו להוסיף מפתחות."}} />
      </p>
      <ProjectForm
        initial={newProjectFields()}
        savedVisibility={null}
        authorName={authorName}
        listingContext={listingContext}
        submitLabel={{en: "Create project", he: "יצירת פרויקט"}}
        onSave={onCreate}
        onCancel={onCancel}
      />
    </section>
  );
};


/* The restriction is the setting most likely to break a project, so its explanation is a
   visible "What does this do?" disclosure rather than an "i". The wording names the exact
   mechanism (browser Origin, 403) so developers and agents can act on it without guessing. */
const RestrictionToggle = ({project, apiKey, onToggle}) => {
  const host = websiteHost(project.websiteUrl);
  const [explained, setExplained] = useState(false);
  const explainerId = "devPocRestrictionHelp-" + apiKey.id;
  const origin = <code dir="ltr">https://{host}</code>;
  return (
    <div className="devPocRestriction">
      <div className="devPocRestrictionRow">
        <label className="devPocChoice">
          <input
            type="checkbox"
            className="devPocSwitch"
            checked={!!apiKey.restrictToWebsite}
            onChange={e => onToggle(e.target.checked)}
            aria-label={Sefaria._v({
              en: "Only accept requests with " + apiKey.label + " from " + host,
              he: "לקבל בקשות עם " + apiKey.label + " רק מ־" + host,
            })}
          />
          <span>
            <InterfaceText text={{en: "Only accept requests from", he: "לקבל בקשות רק מ־"}} /> <code dir="ltr">{host}</code>
          </span>
        </label>
      </div>
      <button
        type="button"
        className="devPocTextButton devPocExplainerToggle"
        aria-expanded={explained}
        aria-controls={explainerId}
        onClick={() => setExplained(e => !e)}
      >
        <InterfaceText text={{en: "What does this do?", he: "מה זה עושה?"}} />
      </button>
      {explained ?
        <div className="devPocExplainer" id={explainerId}>
          <p>
            <InterfaceText text={{
              en: <React.Fragment>When on, Sefaria accepts this key only on requests whose browser <code dir="ltr">Origin</code> is {origin}. Requests with this key from any other origin, or with no <code dir="ltr">Origin</code> header, are refused with <code dir="ltr">403 origin_not_allowed</code>.</React.Fragment>,
              he: <React.Fragment>כשההגבלה פעילה, ספריא מקבלת את המפתח רק בבקשות שה־<code dir="ltr">Origin</code> של הדפדפן בהן הוא {origin}. בקשות עם המפתח מכל מקור אחר, או בלי כותרת <code dir="ltr">Origin</code>, נדחות עם <code dir="ltr">403 origin_not_allowed</code>.</React.Fragment>,
            }} />
          </p>
          <p>
            <InterfaceText text={{
              en: <React.Fragment><strong>Turn it on</strong> if the key is in front-end code that runs in visitors' browsers, where anyone can read it. A copied key then won't work on another website.</React.Fragment>,
              he: <React.Fragment><strong>הפעילו</strong> אם המפתח נמצא בקוד צד־לקוח שרץ בדפדפן של המבקרים, שם כל אחד יכול לקרוא אותו. כך מפתח שהועתק לא יעבוד באתר אחר.</React.Fragment>,
            }} />
          </p>
          <p>
            <InterfaceText text={{
              en: <React.Fragment><strong>Leave it off</strong> if the key is used from a server, a script, a mobile or desktop app, or an AI agent. Those requests send no browser <code dir="ltr">Origin</code>, so they would be refused and your project would stop working.</React.Fragment>,
              he: <React.Fragment><strong>השאירו כבוי</strong> אם המפתח משמש משרת, מסקריפט, מאפליקציה לנייד או למחשב, או מסוכן בינה מלאכותית. בקשות כאלה לא שולחות <code dir="ltr">Origin</code> של דפדפן, ולכן ייָדחו והפרויקט שלכם יפסיק לעבוד.</React.Fragment>,
            }} />
          </p>
          <p>
            <InterfaceText text={{
              en: <React.Fragment>It stops casual copying, not a determined attacker: outside a browser, the <code dir="ltr">Origin</code> header can be faked.</React.Fragment>,
              he: <React.Fragment>ההגבלה מונעת העתקה מזדמנת, לא תוקף נחוש: מחוץ לדפדפן אפשר לזייף את כותרת ה־<code dir="ltr">Origin</code>.</React.Fragment>,
            }} />
          </p>
        </div> : null}
    </div>
  );
};


const KeyValue = ({value, describedBy}) => {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState("");
  const codeRef = useRef(null);
  const copyTimer = useRef(null);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copy = () => copyToClipboard(value, codeRef.current, (label) => {
    setCopied(label);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(""), 2000);
  });

  const showLabel = shown ? Sefaria._v({en: "Hide key", he: "הסתרת המפתח"}) : Sefaria._v({en: "Show key", he: "הצגת המפתח"});
  const copyLabel = Sefaria._v({en: "Copy key", he: "העתקת המפתח"});

  return (
    <div className="devPocKeyValue">
      <code ref={codeRef} dir="ltr">{shown ? value : maskKey(value)}</code>
      <button
        type="button"
        className="devPocIconButton"
        aria-pressed={shown}
        aria-label={showLabel}
        aria-describedby={describedBy}
        title={showLabel}
        data-agent-action="show-key"
        onClick={() => setShown(s => !s)}
      >{shown ? <EyeOffIcon /> : <EyeIcon />}</button>
      <button
        type="button"
        className="devPocIconButton"
        aria-label={copyLabel}
        aria-describedby={describedBy}
        title={copyLabel}
        data-agent-action="copy-key"
        onClick={copy}
      ><CopyIcon /></button>
      <span className="devPocCopied" role="status">{copied}</span>
    </div>
  );
};


const KeyRow = ({project, apiKey, isNew, describedBy, onToggleRestriction, onDelete, onAddWebsite}) => (
  <article className={"devPocKey" + (isNew ? " devPocKeyNew" : "")}>
    <div className="devPocKeyHeading">
      <strong dir="auto">{apiKey.label}</strong>
      <button type="button" className="button small transparent devPocDanger" onClick={onDelete}>
        <InterfaceText text={{en: "Delete key", he: "מחיקת המפתח"}} />
      </button>
    </div>
    <KeyValue value={apiKey.value} describedBy={describedBy} />
    <div className="devPocKeyMeta">
      <span><InterfaceText text={{en: "Created " + formatDate(apiKey.created), he: "נוצר ב־" + formatDate(apiKey.created)}} /></span>
      <span><InterfaceText text={{en: "Last used " + formatDate(apiKey.lastUsed), he: "שימוש אחרון: " + formatDate(apiKey.lastUsed)}} /></span>
      <span>
        <InterfaceText text={{
          en: formatNumber(apiKey.requests30) + " requests in the last 30 days",
          he: formatNumber(apiKey.requests30) + " בקשות ב־30 הימים האחרונים",
        }} />
      </span>
    </div>
    {isNew ?
      <p className="devPocKeyReady" role="status">
        <InterfaceText text={{en: "Ready to use. Copy it into your tool.", he: "מוכן לשימוש. העתיקו אותו לכלי שלכם."}} />
      </p> : null}
    {project.websiteUrl ?
      <RestrictionToggle project={project} apiKey={apiKey} onToggle={onToggleRestriction} /> :
      <p className="devPocHelp">
        <InterfaceText text={{
          en: <React.Fragment>
            Want this key to work only on your website?{" "}
            <button type="button" className="devPocTextButton devPocInlineButton" onClick={onAddWebsite}>Add your website</button>
            {" "}to the project, then switch it on here.
          </React.Fragment>,
          he: <React.Fragment>
            רוצים שהמפתח יעבוד רק באתר שלכם?{" "}
            <button type="button" className="devPocTextButton devPocInlineButton" onClick={onAddWebsite}>הוסיפו את האתר</button>
            {" "}לפרויקט, ואז הפעילו את ההגבלה כאן.
          </React.Fragment>,
        }} />
      </p>}
  </article>
);


const KEY_HIGHLIGHT_MS = 4000;

const KeysSection = ({project, update, setConfirm, onAddWebsite}) => {
  const [creating, setCreating] = useState(false);   // showing the label form
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState("idle");        // idle | setting-up | error
  const [error, setError] = useState("");
  const [newKeyId, setNewKeyId] = useState(null);
  const timer = useRef(null);
  const highlightTimer = useRef(null);

  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(highlightTimer.current); }, []);

  const atLimit = project.keys.length >= MAX_KEYS_PER_PROJECT;
  const keysNoteField = "devPocKeys-" + project.id;
  const firstKeyPrompt = project.keys.length === 0 && !creating && phase === "idle";
  const startCreating = () => { setCreating(true); setPhase("idle"); setError(""); };

  const startCreate = (e) => {
    e.preventDefault();
    if (!label.trim()) { setError(Sefaria._v({en: "Give the key a name.", he: "נא לתת למפתח שם."})); return; }
    setError("");
    setPhase("setting-up");
    const wanted = label.trim();
    timer.current = setTimeout(() => {
      let failed = false;
      let created = null;
      update(s => {
        failed = !!s.failNextKey;
        if (failed) { return {...s, failNextKey: false}; }
        created = makeKey(wanted);
        return {
          ...s,
          projects: s.projects.map(p => p.id === project.id ? {...p, keys: [created, ...p.keys]} : p),
        };
      });
      if (failed) { setPhase("error"); return; }
      setPhase("idle"); setCreating(false); setLabel("");
      if (created) {
        setNewKeyId(created.id);
        clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => setNewKeyId(null), KEY_HIGHLIGHT_MS);
      }
    }, KEY_SETUP_MS);
  };

  const toggleRestriction = (keyId, on) => update(s => ({
    ...s,
    projects: s.projects.map(p => p.id !== project.id ? p : {
      ...p, keys: p.keys.map(k => k.id === keyId ? {...k, restrictToWebsite: on} : k),
    }),
  }));

  const deleteKey = (apiKey) => setConfirm({
    title: Sefaria._v({en: "Delete “" + apiKey.label + "”?", he: "למחוק את „" + apiKey.label + "”?"}),
    body: Sefaria._v({
      en: "The key stops working right away, and anything that uses it will stop working too. You can't undo this.",
      he: "המפתח יפסיק לעבוד מיד, וכל מה שמשתמש בו יפסיק לעבוד גם כן. אי אפשר לבטל את הפעולה.",
    }),
    actionLabel: Sefaria._v({en: "Delete key", he: "מחיקת המפתח"}),
    onConfirm: () => update(s => ({
      ...s,
      projects: s.projects.map(p => p.id !== project.id ? p : {...p, keys: p.keys.filter(k => k.id !== apiKey.id)}),
    })),
  });

  return (
    <section className="devPocSection">
      <div className="devPocHeading">
        <div>
          <h3>
            <InterfaceText text={{en: "API keys", he: "מפתחות API"}} />
          </h3>
          <FieldNote fieldId={keysNoteField}>
            <InterfaceText text={{
              en: "A key is like a password that lets your project use Sefaria. Paste it wherever your tool asks for a Sefaria API key, and keep it private. Developers: send it in an x-api-key header on every call to Sefaria.",
              he: "מפתח הוא כמו סיסמה שמאפשרת לפרויקט שלכם להשתמש בספריא. הדביקו אותו בכל מקום שבו הכלי שלכם מבקש מפתח API של ספריא, ושמרו אותו בסוד. למפתחים: שלחו אותו בכותרת x-api-key בכל קריאה לספריא.",
            }} />
          </FieldNote>
          <p className="devPocHelp">
            <InterfaceText text={{
              en: project.keys.length + " of " + MAX_KEYS_PER_PROJECT + " keys",
              he: project.keys.length + " מתוך " + MAX_KEYS_PER_PROJECT + " מפתחות",
            }} />
          </p>
        </div>
        {creating || firstKeyPrompt ? null :
          <button
            type="button"
            className="button small blue"
            disabled={atLimit}
            data-agent-action="new-key"
            onClick={startCreating}
          ><InterfaceText text={{en: "Create key", he: "יצירת מפתח"}} /></button>}
      </div>
      {atLimit ?
        <p className="devPocNotice">
          <InterfaceText text={{
            en: "You have " + MAX_KEYS_PER_PROJECT + " keys, the most a project can have. Delete one you don't use to make room.",
            he: "יש לכם " + MAX_KEYS_PER_PROJECT + " מפתחות, המספר המרבי לפרויקט. מחקו מפתח שאינו בשימוש כדי לפנות מקום.",
          }} />
        </p> : null}

      {creating && phase === "idle" ?
        <form className="devPocForm devPocCreateKey" onSubmit={startCreate}>
          <div className="devPocField">
            <label htmlFor="devPocKeyLabel">
              <InterfaceText text={{en: "Key name", he: "שם המפתח"}} />
              <InfoTip fieldId="devPocKeyLabel">
                <InterfaceText text={{en: "A name just for you, so you can tell your keys apart.", he: "שם רק בשבילכם, כדי להבחין בין המפתחות."}} />
              </InfoTip>
            </label>
            <input
              id="devPocKeyLabel"
              aria-describedby={tipId("devPocKeyLabel")}
              dir="auto"
              placeholder={Sefaria._v({en: "e.g. My website", he: "למשל: האתר שלי"})}
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
          </div>
          {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
          <div className="devPocActions">
            <button type="submit" className="button small blue" data-agent-action="create-key">
              <InterfaceText text={{en: "Create key", he: "יצירת מפתח"}} />
            </button>
            <button type="button" className="button small transparent" onClick={() => { setCreating(false); setError(""); }}>
              <InterfaceText text={{en: "Cancel", he: "ביטול"}} />
            </button>
          </div>
        </form> : null}
      {phase === "setting-up" ?
        <div className="devPocNotice devPocSettingUp" role="status">
          <span className="devPocSpinner" aria-hidden="true" />
          <span>
            <strong><InterfaceText text={{en: "Setting up your key…", he: "מכינים את המפתח…"}} /></strong>
            <span className="devPocHelp"><InterfaceText text={{en: "This takes a few seconds.", he: "זה לוקח כמה שניות."}} /></span>
          </span>
        </div> : null}
      {phase === "error" ?
        <div className="devPocWarning" role="alert">
          <strong><InterfaceText text={{en: "We couldn't create your key.", he: "לא הצלחנו ליצור את המפתח."}} /></strong>
          <p><InterfaceText text={{en: "Nothing was created. Please try again.", he: "שום דבר לא נוצר. נסו שוב."}} /></p>
          <button type="button" className="button small white" onClick={() => setPhase("idle")}>
            <InterfaceText text={{en: "Try again", he: "לנסות שוב"}} />
          </button>
        </div> : null}

      {firstKeyPrompt ?
        <div className="devPocInset devPocInsetEmpty">
          <div className="devPocActions">
            <button type="button" className="button small blue" data-agent-action="new-key" onClick={startCreating}>
              <InterfaceText text={{en: "Create your first key", he: "יצירת המפתח הראשון"}} />
            </button>
          </div>
        </div> : null}
      {project.keys.length ?
        <div className="devPocInset">
          <div className="devPocKeyList">
            {project.keys.map(k => (
              <KeyRow
                key={k.id}
                project={project}
                apiKey={k}
                isNew={k.id === newKeyId}
                describedBy={tipId(keysNoteField)}
                onToggleRestriction={on => toggleRestriction(k.id, on)}
                onDelete={() => deleteKey(k)}
                onAddWebsite={onAddWebsite}
              />
            ))}
          </div>
        </div> : null}
    </section>
  );
};


const listingStatus = (project) => {
  const linked = project.linkedListingId && POWERED_BY_LISTINGS.find(l => l.id === project.linkedListingId);
  if (linked && project.visibility === "public") {
    return {
      en: "Public: this is the " + linked.name + " listing on Powered by Sefaria.",
      he: "ציבורי: זה הרישום " + linked.name + " ב־Powered by Sefaria.",
    };
  }
  if (project.listingRequest) {
    const name = project.listingRequest.name;
    return {
      en: "Link to the " + name + " listing requested. Waiting for Sefaria to confirm.",
      he: "התבקש קישור לפרויקט " + name + " ברשימה. ממתין לאישור ספריא.",
    };
  }
  if (project.visibility === "public") {
    return {en: "Public: Sefaria may show it on Powered by Sefaria.", he: "ציבורי: ספריא עשויה להציג אותו ב־Powered by Sefaria."};
  }
  if (project.visibility === "private") {
    return {en: "Private: not shown on Powered by Sefaria.", he: "פרטי: לא מוצג ב־Powered by Sefaria."};
  }
  return {en: "Visibility not chosen yet.", he: "עדיין לא נבחרה נראוּת."};
};




const CHART_WIDTH = 320;
const CHART_HEIGHT = 72;

/* Five tints of --devPoc-blue, dark to light, so up to five keys stay tellable apart. */
const KEY_COLORS = ["#18345d", "#2f6193", "#5b8dbd", "#93b6d6", "#c5d7e8"];

const DONUT_SIZE = 132;
const DONUT_OUTER = 62;
const DONUT_INNER = 38;

const polarPoint = (radius, degrees) => {
  const radians = (degrees - 90) * Math.PI / 180;
  const center = DONUT_SIZE / 2;
  return [center + radius * Math.cos(radians), center + radius * Math.sin(radians)];
};

const donutSlicePath = (startDeg, endDeg) => {
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const [x1, y1] = polarPoint(DONUT_OUTER, startDeg);
  const [x2, y2] = polarPoint(DONUT_OUTER, endDeg);
  const [x3, y3] = polarPoint(DONUT_INNER, endDeg);
  const [x4, y4] = polarPoint(DONUT_INNER, startDeg);
  return [
    "M", x1, y1,
    "A", DONUT_OUTER, DONUT_OUTER, 0, large, 1, x2, y2,
    "L", x3, y3,
    "A", DONUT_INNER, DONUT_INNER, 0, large, 0, x4, y4,
    "Z",
  ].join(" ");
};

/* One ring per key. A lone key (or a key holding every request) draws as a full ring,
   because a 360° arc collapses to nothing. */
const UsageDonut = ({slices, total}) => {
  const center = DONUT_SIZE / 2;
  const ringWidth = DONUT_OUTER - DONUT_INNER;
  const ringRadius = (DONUT_OUTER + DONUT_INNER) / 2;
  const drawn = slices.filter(s => s.value > 0);
  let angle = 0;
  return (
    <svg
      className="devPocDonut"
      viewBox={"0 0 " + DONUT_SIZE + " " + DONUT_SIZE}
      role="img"
      aria-label={Sefaria._v({en: "Requests by key over the last 30 days", he: "בקשות לפי מפתח ב־30 הימים האחרונים"})}
    >
      {total === 0 || drawn.length === 0 ?
        <circle cx={center} cy={center} r={ringRadius} fill="none" stroke="#e3e6e9" strokeWidth={ringWidth} /> :
        drawn.length === 1 ?
        <circle cx={center} cy={center} r={ringRadius} fill="none" stroke={drawn[0].color} strokeWidth={ringWidth} /> :
        drawn.map((slice) => {
          const sweep = slice.value / total * 360;
          const path = donutSlicePath(angle, angle + sweep);
          angle += sweep;
          return <path key={slice.id} d={path} fill={slice.color} />;
        })}
    </svg>
  );
};

/* Time runs left to right in both interface languages, like the axis labels under it. */
const UsageChart = ({series}) => {
  const max = Math.max(1, ...series);
  const gap = 2;
  const barWidth = (CHART_WIDTH - gap * (series.length - 1)) / series.length;
  return (
    <svg
      className="devPocChart"
      viewBox={"0 0 " + CHART_WIDTH + " " + CHART_HEIGHT}
      preserveAspectRatio="none"
      role="img"
      aria-label={Sefaria._v({en: "Daily requests over the last 30 days", he: "בקשות יומיות ב־30 הימים האחרונים"})}
    >
      {series.map((value, i) => {
        const height = value > 0 ? Math.max(1, Math.round(value / max * CHART_HEIGHT)) : 0;
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={CHART_HEIGHT - height}
            width={barWidth}
            height={height}
            fill={KEY_COLORS[0]}
          />
        );
      })}
    </svg>
  );
};


const UsageSection = ({project}) => {
  const perKey = project.keys.map(k => ({key: k, series: usageSeries(k.id, k.requests30)}));
  const total = perKey.reduce((sum, k) => sum + k.key.requests30, 0);
  const daily = perKey.length
    ? perKey[0].series.map((_, day) => perKey.reduce((sum, k) => sum + k.series[day], 0))
    : [];
  const slices = perKey.map(({key}, i) => ({
    id: key.id, label: key.label, value: key.requests30, color: KEY_COLORS[i % KEY_COLORS.length],
  }));

  return (
    <section className="devPocSection">
      <div className="devPocHeading">
        <div><h3><InterfaceText text={{en: "Usage", he: "שימוש"}} /></h3></div>
      </div>
      <div className="devPocStats">
        <div className="devPocStat">
          <strong>{formatNumber(total)}</strong>
          <span><InterfaceText text={{en: "Requests in the last 30 days", he: "בקשות ב־30 הימים האחרונים"}} /></span>
        </div>
        <div className="devPocStat">
          <strong>{formatDate(project.usage.lastUsed)}</strong>
          <span><InterfaceText text={{en: "Last used", he: "שימוש אחרון"}} /></span>
        </div>
      </div>
      <div className="devPocChartBlock">
        <p className="devPocChartTitle"><InterfaceText text={{en: "Requests per day", he: "בקשות ביום"}} /></p>
        <div dir="ltr">
          <UsageChart series={daily} />
          <div className="devPocChartAxis">
            <span><InterfaceText text={{en: "30 days ago", he: "לפני 30 יום"}} /></span>
            <span><InterfaceText text={{en: "Today", he: "היום"}} /></span>
          </div>
        </div>
      </div>
      <div className="devPocChartBlock">
        <p className="devPocChartTitle"><InterfaceText text={{en: "Requests by key", he: "בקשות לפי מפתח"}} /></p>
        <div className="devPocSplit">
          <UsageDonut slices={slices} total={total} />
          <ul className="devPocLegend">
            {slices.map(slice => (
              <li className="devPocLegendRow" key={slice.id}>
                <span className="devPocSwatch" style={{background: slice.color}} aria-hidden="true" />
                <span className="devPocLegendLabel" dir="auto">{slice.label}</span>
                <span className="devPocLegendValue">{formatNumber(slice.value)}</span>
                <span className="devPocLegendPercent">
                  {total ? Math.round(slice.value / total * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};


const ProjectCard = ({project, expanded, authorName, listingContext, update, setConfirm, onToggleExpand, notice}) => {
  const [editing, setEditing] = useState(false);
  const cardRef = useRef(null);

  /* Opens the editor with the website field ready to type in. */
  const addWebsite = () => {
    setEditing(true);
    setTimeout(() => {
      const input = cardRef.current && cardRef.current.querySelector("#devPocProjectUrl");
      if (input) { input.focus(); }
    }, 0);
  };

  const saveProject = (fields) => {
    const hadUrl = !!project.websiteUrl;
    const losingUrl = hadUrl && !fields.websiteUrl.trim();
    const restrictedKeys = project.keys.filter(k => k.restrictToWebsite).map(k => k.label);
    const withdrawing = project.visibility === "public" && fields.visibility === "private";
    update(s => ({
      ...s,
      projects: s.projects.map(p => {
        if (p.id !== project.id) { return p; }
        const saved = {
          ...p,
          ...fields,
          websiteUrl: fields.websiteUrl.trim(),
          keys: losingUrl ? p.keys.map(k => ({...k, restrictToWebsite: false})) : p.keys,
          consentWithdrawnAt: fields.visibility === "public" ? null : p.consentWithdrawnAt,
        };
        return withdrawing ? withdrawConsent(saved) : saved;
      }),
    }));
    setEditing(false);
    if (losingUrl && restrictedKeys.length) {
      notice(Sefaria._v({
        en: restrictedKeys.join(", ") + " now works anywhere again, because the project no longer has a website.",
        he: restrictedKeys.join(", ") + " עובד שוב בכל מקום, כי לפרויקט כבר אין אתר.",
      }));
    }
  };

  const keyLabels = project.keys.map(k => k.label).join(", ");
  const keysText = project.keys.length
    ? Sefaria._v({
      en: "These keys stop working right away: " + keyLabels + ". You can't get the project or its keys back.",
      he: "המפתחות האלה יפסיקו לעבוד מיד: " + keyLabels + ". לא יהיה אפשר לשחזר את הפרויקט או את המפתחות שלו.",
    })
    : Sefaria._v({en: "This project has no keys. You can't undo this.", he: "לפרויקט הזה אין מפתחות. אי אפשר לבטל את הפעולה."});
  const deleteProject = () => setConfirm({
    title: Sefaria._v({en: "Delete " + project.name + "?", he: "למחוק את " + project.name + "?"}),
    body: project.visibility === "public"
      ? <React.Fragment>{keysText} <PublishedCopiesWarning /></React.Fragment>
      : keysText,
    actionLabel: Sefaria._v({en: "Delete project", he: "מחיקת הפרויקט"}),
    onConfirm: () => update(s => removeProject(s, project.id)),
  });

  const keyCount = project.keys.length;
  return (
    <article className={"devPocProject" + (expanded ? " expanded" : "")} ref={cardRef}>
      <header className="devPocProjectHeader">
        <div className="devPocProjectBar">
          <h2 className="devPocProjectTitle">
            <button
              type="button"
              className="devPocProjectToggle"
              aria-expanded={expanded}
              onClick={onToggleExpand}
            >
              <span className="devPocChevron" data-open={expanded ? "true" : "false"}><ChevronIcon /></span>
              <span dir="auto">{project.name}</span>
            </button>
          </h2>
        </div>
        <p className="devPocProjectDescription" dir="auto">{project.description}</p>
        <p className="devPocProjectMeta">
          {project.organization ? <React.Fragment><bdi>{project.organization}</bdi> · </React.Fragment> : null}
          <InterfaceText text={{
            en: keyCount + (keyCount === 1 ? " key" : " keys"),
            he: keyCount === 1 ? "מפתח אחד" : keyCount + " מפתחות",
          }} />
          {project.websiteUrl ? <React.Fragment> · <bdi dir="ltr">{websiteHost(project.websiteUrl)}</bdi></React.Fragment> : null}
        </p>
        <p className="devPocProjectMeta"><InterfaceText text={listingStatus(project)} /></p>
        <div className="devPocProjectBadgeRow">
          <div className="devPocBadges">
            <span className="devPocBadge">
              <InterfaceText text={project.visibility === "public" ? {en: "Public", he: "ציבורי"} : {en: "Private", he: "פרטי"}} />
            </span>
            {project.aiAssisted ?
              <span className="devPocBadge"><InterfaceText text={{en: "Built with AI tools", he: "נבנה בעזרת בינה מלאכותית"}} /></span> : null}
          </div>
          {expanded ?
            <button type="button" className="button small transparent devPocProjectEdit" onClick={() => setEditing(e => !e)}>
              <InterfaceText text={editing ? {en: "Close editor", he: "סגירת העריכה"} : {en: "Edit project", he: "עריכת הפרויקט"}} />
            </button> : null}
        </div>
      </header>
      {expanded ?
        <div className="devPocProjectBody">
          {editing ?
            <section className="devPocSection">
              <div className="devPocHeading">
                <div><h3><InterfaceText text={{en: "Project details", he: "פרטי הפרויקט"}} /></h3></div>
              </div>
              <ProjectForm
                initial={{
                  name: project.name, description: project.description, organization: project.organization,
                  websiteUrl: project.websiteUrl, visibility: project.visibility, aiAssisted: project.aiAssisted,
                  listingRequest: project.listingRequest, linkedListingId: project.linkedListingId || null,
                }}
                savedVisibility={project.visibility}
                authorName={authorName}
                listingContext={listingContext}
                submitLabel={{en: "Save project", he: "שמירת הפרויקט"}}
                onSave={saveProject}
                onCancel={() => setEditing(false)}
                onDelete={deleteProject}
              />
            </section> : null}
          <KeysSection project={project} update={update} setConfirm={setConfirm} onAddWebsite={addWebsite} />
          {project.keys.length ? <UsageSection project={project} /> : null}
        </div> : null}
    </article>
  );
};


const ConfirmDialog = ({confirm, onClose}) => {
  const cancelRef = useRef(null);
  useDialogKeys(cancelRef, () => onClose(false));
  return (
    <div className="devPocModalStage devPocConfirmStage" role="dialog" aria-modal="true" aria-labelledby="devPocConfirmTitle">
      <section className="devPocDialog">
        <h2 id="devPocConfirmTitle" dir="auto">{confirm.title}</h2>
        <p>{confirm.body}</p>
        <div className="devPocActions">
          <button type="button" className="button small white" ref={cancelRef} onClick={() => onClose(false)}>
            <InterfaceText text={{en: "Cancel", he: "ביטול"}} />
          </button>
          <button type="button" className="button small devPocDanger" onClick={() => onClose(true)}>{confirm.actionLabel}</button>
        </div>
      </section>
    </div>
  );
};


const DeveloperTab = ({state, socialProviders, developerOn, highlight, update, setConfirm, notice, setNotice,
                       connectedMessage, editingProfile, setEditingProfile, showNewProject,
                       setShowNewProject, onCreateProject, setProjectId, onStart,
                       settingUp}) => {
  const authorName = accountName() || (state.profile ? state.profile.developerName : "");
  const listingContext = {
    listings: poweredByListings(state, accountEmail()),
    email: accountEmail(),
    verified: accountVerified(state, socialProviders),
  };

  const toggleExpand = (project) => {
    const expandedProjectId = state.expandedProjectId === project.id ? null : project.id;
    update(s => ({...s, expandedProjectId}));
    setProjectId(expandedProjectId);
  };

  const newProjectButton = (label, className) => (
    <button type="button" className={"button small " + className} data-agent-action="new-project" onClick={() => setShowNewProject(true)}>
      <InterfaceText text={label} />
    </button>
  );

  const profileEmails = state.profile ?
    [accountEmail(), state.profile.additionalEmail].filter(Boolean) : [];

  return (
    <div className="devPocPage">
      <header className={"devPocPageHeader" + (highlight && developerOn ? " settingsHighlight" : "")}>
        <div>
          <h1><InterfaceText text={{en: "Developer settings", he: "הגדרות מפתחים"}} /></h1>
          <p>
            <InterfaceText text={{
              en: "Register your projects and manage their API keys.",
              he: "רשמו את הפרויקטים שלכם ונהלו את מפתחות ה־API שלהם.",
            }} />
          </p>
        </div>
        <a className="devPocDocsLink" href={API_DOCS_URL} target="_blank" rel="noreferrer">
          <InterfaceText text={{en: "API documentation", he: "תיעוד ה־API"}} />
          <ExternalIcon />
        </a>
      </header>

      {connectedMessage ?
        <div className="devPocSuccess" role="status"><p>{connectedMessage}</p></div> : null}

      {!developerOn ?
        <GetStarted
          verified={accountVerified(state, socialProviders)}
          confirmationSent={!!state.confirmationSentAt}
          settingUp={settingUp}
          highlight={highlight}
          onStart={onStart}
          onSendConfirmation={() => update(s => ({...s, confirmationSentAt: new Date().toISOString()}))}
          onCancelConfirmation={() => update(s => ({...s, confirmationSentAt: null}))}
        /> :
        !state.profile ?
        <ProfileOnboarding onSave={profile => update(s => ({...s, profile}))} /> :
        <React.Fragment>
          {notice ?
            <div className="devPocNotice" role="status">
              <p>{notice}</p>
              <button type="button" className="button small transparent" onClick={() => setNotice("")}>
                <InterfaceText text={{en: "Dismiss", he: "סגירה"}} />
              </button>
            </div> : null}

          <section className="devPocProfile">
            {editingProfile ?
              <React.Fragment>
                <h2><InterfaceText text={{en: "About you", he: "קצת עליך"}} /></h2>
                <ProfileForm
                  profile={state.profile}
                  onSave={profile => { update(s => ({...s, profile})); setEditingProfile(false); }}
                  onCancel={() => setEditingProfile(false)}
                />
              </React.Fragment> :
              <div className="devPocProfileSummary">
                <span>
                  <strong dir="auto">{authorName}</strong>
                  <span className="devPocHelp">
                    {profileEmails.map((email, i) => (
                      <React.Fragment key={email}>
                        {i ? <InterfaceText text={{en: " and ", he: " וגם "}} /> : null}
                        <bdi dir="ltr">{email}</bdi>
                      </React.Fragment>
                    ))}
                    {state.profile.description ?
                      <React.Fragment> · <bdi>{state.profile.description}</bdi></React.Fragment> : null}
                  </span>
                </span>
                <button type="button" className="button small transparent" onClick={() => setEditingProfile(true)}>
                  <InterfaceText text={{en: "Edit", he: "עריכה"}} />
                </button>
              </div>}
          </section>

          <div className="devPocSectionHeading">
            <h2><InterfaceText text={{en: "Projects", he: "פרויקטים"}} /></h2>
            {state.projects.length && !showNewProject ? newProjectButton({en: "New project", he: "פרויקט חדש"}, "white") : null}
          </div>

          {showNewProject ?
            <NewProjectPanel authorName={authorName} listingContext={listingContext} onCreate={onCreateProject} onCancel={() => setShowNewProject(false)} /> :
            state.projects.length === 0 ?
            <div className="devPocEmpty">
              <h2><InterfaceText text={{en: "No projects yet", he: "עדיין אין פרויקטים"}} /></h2>
              <p>
                <InterfaceText text={{
                  en: "To use the Sefaria API, start by creating a project. Then you'll add an API key to it.",
                  he: "כדי להשתמש ב־API של ספריא, מתחילים ביצירת פרויקט. אחר כך מוסיפים לו מפתח API.",
                }} />
              </p>
              <div className="devPocActions">
                {newProjectButton({en: "Create your first project", he: "יצירת הפרויקט הראשון"}, "blue")}
              </div>
            </div> : null}

          {state.projects.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              expanded={state.expandedProjectId === p.id}
              authorName={authorName}
              listingContext={listingContext}
              update={update}
              setConfirm={setConfirm}
              notice={setNotice}
              onToggleExpand={() => toggleExpand(p)}
            />
          ))}
        </React.Fragment>}
    </div>
  );
};


/* The confirmation email as the user would get it, in the interface language, for copy
   review. Its button stands in for the emailed link. */
const MockEmailDialog = ({onCancel, onConfirm}) => {
  const confirmRef = useRef(null);
  const email = accountEmail() || "you@example.org";
  useDialogKeys(confirmRef, onCancel);
  return (
    <div className="devPocMockSso" role="dialog" aria-modal="true" aria-label="Confirmation email">
      <div className="devPocMockSsoBackdrop" onClick={onCancel} />
      <div className="devPocMockSsoDialog devPocMockEmail">
        <p className="devPocMockSsoBanner" lang="en" dir="ltr">MOCK &mdash; the email the user receives; no email is sent</p>
        <div className="devPocMockSsoBody">
          <p className="devPocMockEmailMeta" dir="ltr">Sefaria &lt;hello@sefaria.org&gt; → {email}</p>
          <h2><InterfaceText text={{en: "Confirm your email for Sefaria developer settings", he: "אישור כתובת הדוא״ל להגדרות המפתחים בספריא"}} /></h2>
          <p>
            <InterfaceText text={{
              en: "Someone, hopefully you, asked to set up developer settings on the Sefaria account that uses this address. Confirm it to continue. The link works for 3 days.",
              he: "מישהו, כנראה את/ה, ביקש להגדיר הגדרות מפתחים בחשבון ספריא שמשתמש בכתובת הזו. אשרו אותה כדי להמשיך. הקישור בתוקף 3 ימים.",
            }} />
          </p>
          <div className="devPocMockSsoActions">
            <button type="button" className="devPocMockSsoCancel" onClick={onCancel}>Close</button>
            <button type="button" className="devPocMockSsoContinue" ref={confirmRef} data-agent-action="mock-confirm-email" onClick={onConfirm}>
              <InterfaceText text={{en: "Confirm my email", he: "אישור כתובת הדוא״ל"}} />
            </button>
          </div>
          <p className="devPocMockEmailFoot">
            <InterfaceText text={{
              en: "Didn't ask for this? Ignore this email and nothing changes.",
              he: "לא ביקשת? אפשר להתעלם מההודעה, ושום דבר לא ישתנה.",
            }} />
          </p>
        </div>
      </div>
    </div>
  );
};


/* ---- Account settings tab ---- */

const navigateBack = () => {
  if (window.history.length > 2) {
    window.history.back();
  } else {
    window.history.replaceState(null, null, '/texts');
    window.location.reload();
  }
};

/* Arrow keys move between the options of one toggle and pick the one they land on. */
const toggleKeyUp = (e) => {
  const sibling = e.keyCode === 39 ? e.currentTarget.nextElementSibling
    : e.keyCode === 37 ? e.currentTarget.previousElementSibling : null;
  if (sibling && sibling.classList.contains("toggleOption")) {
    sibling.focus();
    sibling.click();
  }
};

const SettingToggle = ({optionClass, options, value, ariaLabel, onChange, children}) => (
  <div
    className={"toggleSet toggleSetToggleBox blueStyle " + optionClass + " control-elem"}
    role="radiogroup"
    aria-label={ariaLabel}
  >
    {options.map(option => {
      const on = option.value === value;
      return (
        <div
          key={option.value}
          role="radio"
          data-name={option.name}
          data-value={option.value}
          className={"toggleOption" + (on ? " on" : "")}
          tabIndex={on ? 0 : -1}
          aria-checked={on}
          onClick={() => onChange(option.value)}
          onKeyUp={toggleKeyUp}
        >{option.content}</div>
      );
    })}
    {children}
  </div>
);

const SettingSection = ({id, label, children}) => (
  <div id={id} className="section">
    <label className="control-elem">{label}</label>
    {children}
  </div>
);

const LoginMethodText = ({method, email}) => {
  const hebrew = Sefaria.interfaceLang === "hebrew";
  return (
    <span className={hebrew ? "int-he" : "int-en"}>
      <span className="loginMethodText">{hebrew ? method.he : method.en}</span>{" "}
      <span className="loginMethodEmail">{email}</span>
    </span>
  );
};

const loginMethod = (socialProviders) => {
  const google = socialProviders.includes("google");
  const apple = socialProviders.includes("apple");
  if (google && apple) { return {en: "Google & Apple Sign-In with", he: "התחברות דרך גוגל ואפל עם"}; }
  if (google) { return {en: "Google Sign-In with", he: "התחברות דרך גוגל עם"}; }
  return {en: "Apple Sign-In with", he: "התחברות דרך אפל עם"};
};

const AccountTab = ({settings, socialProviders}) => {
  const torahSpecific = !!settings.torahSpecific;
  const translationLanguages = settings.translationLanguages || [];

  const [emailNotifications, setEmailNotifications] = useState(settings.emailNotifications);
  const [interfaceLanguage, setInterfaceLanguage] = useState(settings.interfaceLanguage);
  const [translationLanguage, setTranslationLanguage] = useState(settings.translationLanguagePreference);
  const [readingHistory, setReadingHistory] = useState(settings.readingHistory === false ? "false" : "true");
  const [textualCustom, setTextualCustom] = useState(settings.textualCustom);
  const [libraryAssistant, setLibraryAssistant] = useState(settings.libraryAssistantEnabled ? "true" : "false");

  /* The values saving compares against. Textual custom moves to the saved value, because
     a second save should only re-fetch the calendars if it changed again. */
  const saved = useRef({
    interfaceLanguage: settings.interfaceLanguage,
    libraryAssistant: settings.libraryAssistantEnabled ? "true" : "false",
    translationLanguage: settings.translationLanguagePreference,
    textualCustom: settings.textualCustom,
  });

  const [email, setEmail] = useState(settings.email);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailFields, setEmailFields] = useState({email: "", confirmEmail: "", confirmPassword: ""});
  const [emailError, setEmailError] = useState("");
  const [emailOk, setEmailOk] = useState("");

  const [gauthEmail, setGauthEmail] = useState((settings.sheetsExport && settings.sheetsExport.gauthEmail) || "");
  const [gauthError, setGauthError] = useState("");

  const save = () => {
    const transPref = translationLanguages.length ? translationLanguage : undefined;
    const profile = {
      settings: {
        email_notifications: emailNotifications,
        interface_language: torahSpecific ? interfaceLanguage : undefined,
        textual_custom: torahSpecific ? textualCustom : undefined,
        reading_history: (torahSpecific ? readingHistory : undefined) === "true",
        translation_language_preference: torahSpecific ? transPref : undefined,
        translation_language_preference_suggested: true,
      },
    };
    // Only send library_assistant when the toggle was actually changed. The toggle
    // renders the *effective* value, so submitting it unconditionally would persist
    // the setting for users whose profiles don't carry the key yet — and a profile
    // that has the key is skipped by the opt-out migration.
    if (libraryAssistant !== saved.current.libraryAssistant) {
      profile.settings.library_assistant = libraryAssistant === "true";
    }
    // see trans pref in cookie in case user is logged out
    if (profile.settings.translation_language_preference !== undefined) {
      $.cookie("translation_language_preference", profile.settings.translation_language_preference, {path: "/"});
    }
    $.cookie("translation_language_preference_suggested", JSON.stringify(1), {path: "/"});
    $.post("/api/profile", {json: JSON.stringify(profile)}, (data) => {
      if ("error" in data) {
        alert(data.error);
        return;
      }
      alert(Sefaria._("Settings Saved"));
      Sefaria.track.event("Settings", "Settings Save", emailNotifications);
      const languageChanged = interfaceLanguage !== saved.current.interfaceLanguage;
      if (languageChanged) {
        Sefaria.track.setInterfaceLanguage("interface language account settings", interfaceLanguage);
      }
      // Interface language or Library Assistant changed → reload (interface language affects RTL/LTR and server-rendered content; the assistant needs a fresh chatbot_user_token and script tag)
      if (languageChanged || libraryAssistant !== saved.current.libraryAssistant) {
        window.location.reload();
        return;
      }
      if (transPref !== saved.current.translationLanguage) {
        Sefaria.track.event("Reader", "Set Translation Language Preference", transPref);
        saved.current.translationLanguage = transPref;
      }
      const detail = {
        translationLanguagePreference: profile.settings.translation_language_preference,
        readingHistory: profile.settings.reading_history,
      };
      const newTextualCustom = profile.settings.textual_custom;
      if (newTextualCustom !== saved.current.textualCustom) {  // only check change here because it triggers an API call to re-fetch calendars
        detail.textualCustom = newTextualCustom;
        detail.diaspora = settings.diaspora ? "1" : "0";
        saved.current.textualCustom = newTextualCustom;
      }
      document.dispatchEvent(new CustomEvent('sefaria:settings-updated', {detail}));
    });
  };

  const updateEmail = () => {
    $.post("/settings/account/user", {json: JSON.stringify(emailFields)}, (data) => {
      if ("error" in data) {
        setEmailError(data.error);
        return;
      }
      setEmailError("");
      setEmail(emailFields.email);
      setEmailOk(Sefaria._("Email was successfully changed!"));
      setEditingEmail(false);
    });
  };

  const disconnectGauth = () => {
    $.get("/unlink-gauth?redirect=0", (data) => {
      if ("error" in data) { setGauthError(data.error); }
      else { setGauthError(""); setGauthEmail(""); }
    });
  };

  const saveButton = (
    <button type="button" className="button small blue control-elem saveAccountSettingsBtn" onClick={save}>
      <InterfaceText text={{en: "Save", he: "שמירה"}} />
    </button>
  );
  const cancelButton = (extraClass) => (
    <button type="button" className={"button " + extraClass + " control-elem"} onClick={navigateBack}>
      <InterfaceText text={{en: "Cancel", he: "ביטול"}} />
    </button>
  );

  return (
    <div id="accountSettingsPage" className="static biReady">
      <div className="inner">
        <div className="headerWithButtons">
          <h1>
            <InterfaceText text={{en: "Account Settings", he: "הגדרות חשבון"}} />
          </h1>
          <div className="end">
            {cancelButton("small transparent")}
            {saveButton}
          </div>
        </div>
        <SettingSection
          id="emailNotifications"
          label={<InterfaceText text={{en: "Notification Frequency (Maximum)", he: "תדירות שליחת הודעות (מקסימלית)"}} />}
        >
          <SettingToggle
            optionClass="tripleOption"
            value={emailNotifications}
            onChange={setEmailNotifications}
            options={[
              {value: "daily", content: <InterfaceText text={{en: "Daily", he: "יומית"}} />},
              {value: "weekly", content: <InterfaceText text={{en: "Weekly", he: "שבועית"}} />},
              {value: "never", content: <InterfaceText text={{en: "Never", he: "לעולם לא"}} />},
            ]}
          />
        </SettingSection>

        {torahSpecific ?
          <React.Fragment>
            <SettingSection
              id="siteLanguage"
              label={<InterfaceText text={{en: "Site Language", he: "שפת ממשק"}} />}
            >
              <SettingToggle
                optionClass="doubleOption"
                value={interfaceLanguage}
                onChange={setInterfaceLanguage}
                options={[
                  {value: "english", content: <span className="int-bi">English</span>},
                  {value: "hebrew", content: <span className="int-bi">עברית</span>},
                ]}
              />
            </SettingSection>

            {translationLanguages.length ?
              <SettingSection
                id="translationLanguagePreference"
                label={<InterfaceText text={{en: "Preferred Translation Language", he: "שפה מועדפת לתרגום"}} />}
              >
                <SettingToggle
                  optionClass="quadrupleOption"
                  value={translationLanguage}
                  onChange={setTranslationLanguage}
                  options={translationLanguages.map(lang => (
                    {value: lang.code, content: <span className="int-bi">{lang.name}</span>}
                  ))}
                />
              </SettingSection> : null}

            <SettingSection
              id="readingHistory"
              label={<InterfaceText text={{en: "Reading History", he: "היסטורית קריאה"}} />}
            >
              <SettingToggle
                optionClass="doubleOption"
                value={readingHistory}
                onChange={setReadingHistory}
                options={[
                  {value: "true", name: "reading-history", content: <InterfaceText text={{en: "On", he: "פעילה"}} />},
                  {value: "false", name: "reading-history", content: <InterfaceText text={{en: "Off", he: "כבויה"}} />},
                ]}
              >
                <span id="reading-history-warning" className={readingHistory === "false" ? "on" : null}>
                  {readingHistory === "false" ? Sefaria._("Turning this feature off will permanently delete your reading history.") : null}
                </span>
              </SettingToggle>
            </SettingSection>

            <SettingSection
              id="textualCustom"
              label={<InterfaceText text={{en: "Preferred Custom (Weekly Haftarot)", he: "מנהג מועדף (להפטרות)"}} />}
            >
              <SettingToggle
                optionClass="doubleOption"
                value={textualCustom}
                onChange={setTextualCustom}
                options={[
                  {value: "sephardi", content: <InterfaceText text={{en: "Sephardi", he: "עדות המזרח"}} />},
                  {value: "ashkenazi", content: <InterfaceText text={{en: "Ashkenazi", he: "אשכנז"}} />},
                ]}
              />
            </SettingSection>
          </React.Fragment> : null}

        {/* The Library Assistant is a plain user setting, shown to every logged-in user. Its
            value is the effective one: users who are on through the pre-migration rule carry
            no setting key yet. */}
        <SettingSection
          id="libraryAssistantSetting"
          label={<InterfaceText text={{en: "Library Assistant", he: "עוזר הספרייה"}} />}
        >
          <SettingToggle
            optionClass="doubleOption"
            value={libraryAssistant}
            onChange={setLibraryAssistant}
            options={[
              {value: "true", content: <InterfaceText text={{en: "On", he: "פעיל"}} />},
              {value: "false", content: <InterfaceText text={{en: "Off", he: "כבוי"}} />},
            ]}
          />
        </SettingSection>

        <div id="username-change" className="section">
          <label className="control-elem">
            <InterfaceText text={{en: "Login Method", he: "אמצעי התחברות"}} />
          </label>
          {socialProviders.length ?
            <div className="form-section">
              <LoginMethodText method={loginMethod(socialProviders)} email={email} />
            </div> :
            <React.Fragment>
              <div id="username-change-display" className="form-section" style={editingEmail ? {display: "none"} : null}>
                <input id="email-display" type="text" disabled="disabled" value={email} readOnly />
                <button id="change-email" type="button" className="button blue fillWidth" onClick={() => setEditingEmail(true)}>
                  <InterfaceText text={{en: "Change Email", he: "שינוי כתובת דוא״ל"}} />
                </button>
                <span id="email-edit-ok" style={emailOk ? null : {display: "none"}}>{emailOk}</span>
              </div>
              <div id="username-change-edit" className="form-section" style={editingEmail ? null : {display: "none"}}>
                <input
                  id="email"
                  type="text"
                  placeholder={Sefaria._("New Email")}
                  autoComplete="off"
                  value={emailFields.email}
                  onChange={e => setEmailFields({...emailFields, email: e.target.value})}
                />
                <input
                  id="confirmEmail"
                  type="text"
                  placeholder={Sefaria._("Confirm New Email")}
                  autoComplete="off"
                  value={emailFields.confirmEmail}
                  onChange={e => setEmailFields({...emailFields, confirmEmail: e.target.value})}
                />
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder={Sefaria._("Password")}
                  autoComplete="new-password"
                  value={emailFields.confirmPassword}
                  onChange={e => setEmailFields({...emailFields, confirmPassword: e.target.value})}
                />
                <button id="update-email" type="button" className="button blue fillWidth" onClick={updateEmail}>
                  <InterfaceText text={{en: "Update Email", he: 'עדכון כתובת דוא"ל'}} />
                </button>
                <span id="email-edit-errors">{emailError}</span>
              </div>
            </React.Fragment>}
        </div>

        <div id="gauth-email-change" className="section" style={gauthEmail ? null : {display: "none"}}>
          <label className="control-elem">
            <InterfaceText text={{en: "Sheets Export: Google Drive Connected", he: "ייצוא דפי מקורות: גוגל דרייב מחובר"}} />
          </label>
          <div id="gauth-email-disconnect-display" className="form-section">
            <input id="gauth-email-display" type="text" disabled="disabled" value={gauthEmail} readOnly />
            <button id="disconnect-gauth-email" type="button" className="button blue fillWidth" onClick={disconnectGauth}>
              <InterfaceText text={{en: "Disconnect", he: "ניתוק"}} />
            </button>
            <span id="gauth-disconnect-messages">{gauthError}</span>
          </div>
        </div>
        <div id="gauth-email-disconnected" className="section" style={gauthEmail ? {display: "none"} : null}>
          <label className="control-elem">
            <InterfaceText text={{en: "Sheets Export: No Google Drive Connected", he: "ייצוא דפי מקורות: גוגל דרייב אינו מחובר"}} />
          </label>
          <div className="additional-info">
            <InterfaceText text={{
              en: "No Google Drive connected. You can link one the next time you export a sheet.",
              he: "גוגל דרייב אינו מחובר. ניתן לחבר אותו בפעם הבאה שתייצאו דף מקורות.",
            }} />
          </div>
        </div>

        <div className="saveCancel">
          {saveButton}
          {cancelButton("transparent small")}
        </div>
      </div>
    </div>
  );
};


const SAVE_FAILED = {
  en: "Couldn't save the POC state. Your changes are only in this browser tab.",
  he: "לא הצלחנו לשמור את מצב ה־POC. השינויים נשמרו רק בלשונית הדפדפן הזו.",
};
const CONNECTED_MS = 8000;
const SETUP_MS = 1200;
const ARRIVAL_HIGHLIGHT_MS = 2400;

const SettingsPage = ({tab, projectId, accountSettings, initialDeveloperPoc, setTab, setProjectId}) => {
  const settings = accountSettings || {};
  const socialProviders = settings.socialProviders || [];

  const [pocState, setPocState] = useState(() => {
    const loaded = {...emptyState(), ...(initialDeveloperPoc || {})};
    if (projectId && loaded.projects.some(p => p.id === projectId)) {
      loaded.expandedProjectId = projectId;
    }
    return loaded;
  });
  const [showNewProject, setShowNewProject] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [notice, setNotice] = useState("");
  const [mockEmailOpen, setMockEmailOpen] = useState(false);
  const [connectedMessage, setConnectedMessage] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const [arrivalHighlight, setArrivalHighlight] = useState(false);
  const connectedTimer = useRef(null);
  const setupTimer = useRef(null);
  const highlightTimer = useRef(null);

  /* Arriving on a settings URL other than the default tab marks where the link pointed. */
  useEffect(() => {
    if (tab !== SETTINGS_TABS[0].tab) {
      setArrivalHighlight(true);
      highlightTimer.current = setTimeout(() => setArrivalHighlight(false), ARRIVAL_HIGHLIGHT_MS);
    }
    return () => {
      clearTimeout(connectedTimer.current);
      clearTimeout(setupTimer.current);
      clearTimeout(highlightTimer.current);
    };
  }, []);

  /* The UI updates first and the write follows; a failed write only leaves a notice.
     Updates read through a ref, so a change made while a key is being "created" still
     builds on the newest state. */
  const stateRef = useRef(pocState);
  stateRef.current = pocState;
  const persist = (next) => {
    stateRef.current = next;
    writeState(next).catch(() => setNotice(Sefaria._v(SAVE_FAILED)));
    return next;
  };
  /* A change that lands after the page has gone still saves. */
  const pageMounted = useRef(true);
  useEffect(() => () => { pageMounted.current = false; }, []);
  const update = (fn) => {
    const next = persist(fn(stateRef.current));
    if (pageMounted.current) { setPocState(next); }
  };
  const [resetCount, setResetCount] = useState(0);
  const reset = (next) => {
    setPocState(persist(next));
    setResetCount(c => c + 1);
    setShowNewProject(false);
    setEditingProfile(false);
    setConfirm(null);
    setNotice("");
  };

  const developerOn = accountVerified(pocState, socialProviders) && !!pocState.developerEnabled;

  const createProject = (fields) => {
    const project = makeProject(fields);
    update(s => ({...s, projects: [project, ...s.projects], expandedProjectId: project.id}));
    setShowNewProject(false);
    setProjectId(project.id);
  };

  /* A short loader before developer settings appear, so the change doesn't read as a reload. */
  const startDeveloper = (onReady) => {
    setSettingUp(true);
    clearTimeout(setupTimer.current);
    setupTimer.current = setTimeout(() => {
      update(s => ({...s, developerEnabled: true}));
      setSettingUp(false);
      if (typeof window !== "undefined") { window.scrollTo(0, 0); }
      if (onReady) { onReady(); }
    }, SETUP_MS);
  };

  const closeConfirm = (confirmed) => {
    if (confirmed && confirm && confirm.onConfirm) { confirm.onConfirm(); }
    setConfirm(null);
  };

  /* Stands in for opening the emailed link: the real link confirms the address and lands
     on the Developer tab, which carries on with setup. */
  const finishEmailConfirmation = () => {
    setMockEmailOpen(false);
    update(s => ({...s, emailVerified: true, confirmationSentAt: null}));
    startDeveloper(() => {
      setConnectedMessage(Sefaria._v({en: "Your email is confirmed.", he: "כתובת הדוא״ל שלך אושרה."}));
      clearTimeout(connectedTimer.current);
      connectedTimer.current = setTimeout(() => setConnectedMessage(""), CONNECTED_MS);
    });
  };

  const panels = {
    account: <AccountTab settings={settings} socialProviders={socialProviders} />,
    developer: (
      <DeveloperTab
        key={resetCount}
        state={pocState}
        socialProviders={socialProviders}
        developerOn={developerOn}
        highlight={arrivalHighlight}
        update={update}
        setConfirm={setConfirm}
        notice={notice}
        setNotice={setNotice}
        connectedMessage={connectedMessage}
        editingProfile={editingProfile}
        setEditingProfile={setEditingProfile}
        showNewProject={showNewProject}
        setShowNewProject={setShowNewProject}
        onCreateProject={createProject}
        setProjectId={setProjectId}
        onStart={() => startDeveloper()}
        settingUp={settingUp}
      />
    ),
  };

  return (
    <div className={"readerNavMenu settingsPage settingsPage-" + tab} key="settings">
      <div className="content">
        <div className="contentInner">
          <div className="settingsShell">
            <SettingsNav tab={tab} highlightTab={arrivalHighlight ? tab : null} onSelect={setTab} />
            <div className="settingsPanels">
              {SETTINGS_TABS.map(t => (
                <div key={t.tab} className="settingsPanel" hidden={tab !== t.tab}>{panels[t.tab]}</div>
              ))}
            </div>
          </div>
          <AgentInstructions />
        </div>
      </div>
      <div className="devPocPage">
        {confirm ? <ConfirmDialog confirm={confirm} onClose={closeConfirm} /> : null}
        {mockEmailOpen ?
          <MockEmailDialog onCancel={() => setMockEmailOpen(false)} onConfirm={finishEmailConfirmation} /> : null}
        <PocTestPanel
          state={pocState}
          realProviders={socialProviders}
          update={update}
          reset={reset}
          showSimulate={true}
          onOpenMockEmail={() => setMockEmailOpen(true)}
        />
      </div>
    </div>
  );
};


export default SettingsPage;
