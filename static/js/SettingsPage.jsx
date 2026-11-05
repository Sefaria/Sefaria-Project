import React, { useEffect, useRef, useState } from 'react';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';
import {
  CONFIRMATION_SIGNAL_KEY,
  MAX_DESCRIPTION_LENGTH,
  accountVerified,
  cancelConfirmation,
  claimListing,
  confirmationLink,
  createKey,
  createProject,
  deleteKey,
  deleteProject,
  dismissListing,
  emptyState,
  enableDeveloper,
  mockAction,
  parseWebsite,
  readState,
  requestNewLink,
  saveProfile,
  sendConfirmation,
  setKeyRestriction,
  updateProject,
  websiteHost,
} from './developerSettingsApi';
import Input from './common/Input.jsx';
import Checkbox from './common/Checkbox.jsx';
import ToggleSwitch from './common/ToggleSwitch.jsx';
import Select from './common/Select.jsx';
import ErrorBanner from './auth/ErrorBanner.jsx';
import { requiredFieldValidate } from './auth/utils';

/* Account and developer settings, one page with a tab per settings section. The developer tab
   reads and writes the account's projects and API keys through developerSettingsApi.js. */

const KEY_SETUP_MS = 4000;

const API_DOCS_URL = "https://developers.sefaria.org/reference/getting-started";
const LIBRARY_EXPORT_URL = "https://github.com/Sefaria/Sefaria-Export";
const CONTACT_EMAIL = "hello@sefaria.org";
const API_TERMS_URL = "/api-terms";

const maskKey = (value) => {
  const prefix = value.match(/^sfr_(?:test_)?/);
  return (prefix ? prefix[0] : "") + "••••••••••••";
};

const formatDate = (iso) => {
  if (!iso) { return ""; }
  try {
    const locale = Sefaria.interfaceLang === "hebrew" ? "he-IL" : "en-GB";
    return new Date(iso).toLocaleDateString(locale, {day: "numeric", month: "short", year: "numeric"});
  } catch (e) { return iso; }
};

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
  <svg className="devPocExternalIcon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </svg>
);

const tipId = (fieldId) => fieldId + "Tip";

/* Text fields match :focus-visible even when clicked, so a tip would open on every click into its field. Track how
   focus last moved instead: a pointer press means the click put focus there, and the tip stays closed. */
let lastFocusByPointer = false;
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", () => { lastFocusByPointer = true; }, true);
  document.addEventListener("keydown", () => { lastFocusByPointer = false; }, true);
}
const keyboardFocused = (node) => {
  if (lastFocusByPointer) { return false; }
  try { return node.matches(":focus-visible"); } catch (e) { return true; }
};

/* An "i" for pointer users: it opens on hover and toggles on tap, and inside a <label> a tap
   doesn't tick the label's checkbox. It is not a tab stop. Its text is the field's
   description (aria-describedby={tipId(fieldId)}) for assistive tech, kept hidden so it
   stays out of the label, and it opens while the field has keyboard focus. */
/* Lucide "info" (lucide-static 1.49.0, the design system's icon), inline so it takes the
   button's colour. */
const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

/* Lucide "circle-question-mark" (in the design system's icon library), inline so it takes the
   button's colour. */
const HelpIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </svg>
);

/* icon: "info" (default) or "help". above: opens over the label instead of over the field. */
const InfoTip = ({fieldId, wide, icon = "info", above = false, children}) => {
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
      >{icon === "help" ? <HelpIcon /> : <InfoIcon />}</button>
      {open ?
        <span className={"devPocPopover" + (wide ? " devPocPopoverWide" : "") + (above ? " devPocPopoverAbove" : "")} aria-hidden="true">{children}</span> : null}
      <span id={tipId(fieldId)} hidden>{children}</span>
    </span>
  );
};

/* A field description read only through aria-describedby. Hidden content still counts
   there, and staying hidden keeps it out of any label it sits in. */
const FieldNote = ({fieldId, children}) => <span id={tipId(fieldId)} hidden>{children}</span>;

/* Escape closes, and the given button takes focus when the dialog opens. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* A modal dialog: focus moves in on open and back to where it was on close, Tab stays inside,
   and Escape closes it. */
const useDialogKeys = (focusRef, onEscape) => {
  useEffect(() => {
    const opener = typeof document !== "undefined" ? document.activeElement : null;
    if (focusRef.current) { focusRef.current.focus(); }
    const onKeyDown = (e) => {
      if (e.key === "Escape") { onEscape(); return; }
      if (e.key !== "Tab" || !focusRef.current) { return; }
      const dialog = focusRef.current.closest('[role="dialog"], [role="alertdialog"]');
      const focusable = dialog ? Array.from(dialog.querySelectorAll(FOCUSABLE)) : [];
      if (!focusable.length) { return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        e.preventDefault(); first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener && opener.isConnected && typeof opener.focus === "function") { opener.focus(); }
    };
  }, []);
};


const PANEL_OPEN_KEY = "sefariaDeveloperPocPanelOpen";

const readPanelOpen = () => {
  try { return window.localStorage.getItem(PANEL_OPEN_KEY) === "1"; } catch (e) { return false; }
};

const writePanelOpen = (open) => {
  try { window.localStorage.setItem(PANEL_OPEN_KEY, open ? "1" : "0"); } catch (e) { /* ignore */ }
};

/* Test controls, shown only where the server has DEVELOPER_SETTINGS_MOCKS on. Deliberately
   unlike the product: a floating panel pinned to the corner of the viewport, in colours the
   site never uses, and English only. They change the real data of the logged-in account. */
/* Starting points for a walkthrough; each one clears developer settings back to "Get started". */
const ACCOUNT_SCENARIOS = [
  {id: "sso", label: "Google or Apple account", ssoOverride: true},
  {id: "email", label: "Email account, unconfirmed", ssoOverride: false},
  {id: "email-confirmed", label: "Email account, confirmed", ssoOverride: false, emailVerified: true},
];

const accountStatus = (state) => {
  const kind = state.ssoConnected ? "Google or Apple account" : "Email account";
  const email = state.emailVerified ? "email confirmed"
    : state.confirmationSentAt ? "confirmation link sent" : "email not confirmed";
  const dev = !state.developerEnabled ? "developer settings not started"
    : !state.profile ? "at About you" : state.projects.length + " project" + (state.projects.length === 1 ? "" : "s");
  return "Now: " + kind + " · " + email + " · " + dev;
};

const TestPanel = ({state, mock, onOpenMockEmail}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(readPanelOpen()); }, []);

  const toggle = (next) => { setOpen(next); writePanelOpen(next); };

  const realProviders = state.mock.realSsoProviders || [];
  const realLabel = realProviders.length
    ? "Real account: " + realProviders.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" + ") + " connected"
    : "Real account: no Google or Apple connection";
  const pretending = state.mock.ssoOverride !== null;
  const email = accountEmail();

  return (
    <div className="devPocPanel" data-open={open ? "true" : "false"} lang="en">
      <button
        type="button"
        className="devPocPanelPill"
        aria-expanded={open}
        onClick={() => toggle(true)}
      >🧪 Test controls</button>
      <div className="devPocPanelBody">
        <div className="devPocPanelHeader">
          <div>
            <p className="devPocPanelTitle">TEST CONTROLS</p>
            <p className="devPocPanelSub">Test environments only. They change this account's real developer data.</p>
          </div>
          <button
            type="button"
            className="devPocPanelClose"
            aria-label="Collapse test controls"
            onClick={() => toggle(false)}
          >Hide</button>
        </div>

        <div className="devPocPanelGroup">
          <div className="devPocPanelGroupLabel">Start over as</div>
          <div className="devPocPanelRow devPocPanelScenarios">
            {ACCOUNT_SCENARIOS.map(sc => (
              <button
                key={sc.id}
                type="button"
                className="devPocPanelButton"
                data-scenario={sc.id}
                onClick={() => mock("start-over", {ssoOverride: sc.ssoOverride, emailVerified: !!sc.emailVerified})}
              >{sc.label}</button>
            ))}
          </div>
          <p className="devPocPanelNote">
            Each deletes this account's projects (revoking their keys), releases claimed listings and starts at "Get started".
          </p>
        </div>

        <div className="devPocPanelGroup">
          <div className="devPocPanelGroupLabel">Account state now</div>
          <p className="devPocPanelNote devPocPanelStatus" role="status">{accountStatus(state)}</p>
          <label className="devPocPanelChoice">
            <input
              type="checkbox"
              className="devPocSwitch"
              checked={!!state.ssoConnected}
              onChange={e => mock("sso", {ssoOverride: e.target.checked})}
              aria-label="Simulate Google or Apple connected"
            />
            <span>Google or Apple {state.ssoConnected ? "connected" : "not connected"}</span>
          </label>
          <label className="devPocPanelChoice">
            <input
              type="checkbox"
              className="devPocSwitch"
              checked={!!state.emailVerified}
              onChange={e => mock("email-verified", {emailVerified: e.target.checked})}
              aria-label="Email confirmed"
            />
            <span>Email {state.emailVerified ? "confirmed" : "not confirmed"}</span>
          </label>
          <p className="devPocPanelNote">{realLabel}{pretending ? " (simulated value in use)" : ""}</p>
          {pretending ?
            <div className="devPocPanelRow">
              <button type="button" className="devPocPanelButton" onClick={() => mock("sso", {ssoOverride: null})}>
                Use real Google or Apple status
              </button>
            </div> : null}
          <div className="devPocPanelRow">
            <button
              type="button"
              className="devPocPanelButton"
              disabled={!state.mock.confirmationKey}
              data-agent-action="mock-open-email"
              onClick={onOpenMockEmail}
            >Open the confirmation email</button>
          </div>
          <p className="devPocPanelNote">
            {state.mock.confirmationKey
              ? "A link was \"sent\" (no email goes out here). Open the email: its button is the real link, and this tab moves on within a few seconds."
              : "Enabled after \"Email me a confirmation link\"."}
          </p>
        </div>

        <div className="devPocPanelGroup">
          <div className="devPocPanelGroupLabel">Powered by listings</div>
          <div className="devPocPanelRow">
            <button
              type="button"
              className="devPocPanelButton"
              data-poc-control="create-listing"
              onClick={() => mock("create-listing")}
            >Add a listing submitted with my email</button>
          </div>
          <p className="devPocPanelNote">
            Creates an unclaimed Powered by row with {email || "the account email"} as its submitter, as if it came
            in through the public form. Once developer settings are set up, it asks "Is this your project?".
          </p>
        </div>
      </div>
    </div>
  );
};


/* One entry per settings section. A new section is an entry here, a panel in
   SettingsPage, and a URL in urls_library.py and ReaderApp's history. */
const SETTINGS_TABS = [
  {tab: "account", url: "/settings/account", label: {en: "Account Settings", he: "הגדרות חשבון"}},
  {tab: "developer", url: "/settings/developer", label: {en: "Developer Settings", he: "הגדרות מפתחים"}},
];

/* Tabs, not links: clicking switches the mounted tab and pushes the matching URL. The
   anchors keep the addresses linkable, so opening one in a new tab still works. */
/* Tab icons: Lucide circle-user-round and code-xml, used from Lucide directly, not yet in our
   icon library. 18px, the design system's icon size. */
const SETTINGS_TAB_ICONS = {
  account: [<circle key="a" cx="12" cy="12" r="10" />, <circle key="b" cx="12" cy="10" r="4" />,
    <path key="c" d="M18 20a6 6 0 0 0-12 0" />],
  developer: [<path key="a" d="m18 16 4-4-4-4" />, <path key="b" d="m6 8-4 4 4 4" />, <path key="c" d="m14.5 4-5 16" />],
};
const SettingsTabIcon = ({tab}) => SETTINGS_TAB_ICONS[tab] ? (
  <svg className="settingsNavIcon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {SETTINGS_TAB_ICONS[tab]}
  </svg>
) : null;

const SettingsNav = ({tabs, tab, highlightTab, onSelect}) => (
  <nav className="settingsNav" aria-label={Sefaria._v({en: "Settings", he: "הגדרות"})}>
    <div className="settingsNavTitle"><InterfaceText text={{en: "Settings", he: "הגדרות"}} /></div>
    {tabs.map(t => (
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
      ><SettingsTabIcon tab={t.tab} /><InterfaceText text={t.label} /></a>
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
        inbox (or you do, if you have access to it), on any device and without signing in.
        The link opens a "Thank you for confirming your email" page; this page notices within
        a few seconds and setup continues here. Accounts that sign in with Google or Apple
        skip this step.
      </li>
      <li>
        Fill in the "About you" form. Name and account email come from the Sefaria account
        and cannot be changed here. Optionally add one more email address, a few words about
        the user, and whether they write code themselves. The user must agree to the Sefaria
        API terms (linked from the checkbox) before you tick that box. Leave the developer
        news box unticked unless the user asks for it. Press "Continue" (save-profile).
      </li>
      <li>
        If a dialog asks "Is this your project?" about a Powered by Sefaria listing, ask the
        user. "Yes, add it" (claim-listing) adds it as a public project linked to the listing;
        "No, it's not mine" (not-my-listing) stops the question; "Not now" (listing-not-now) asks again next visit.
      </li>
      <li>
        Under "Projects", press "Create your first project" or "New project" (new-project).
        Enter a project name and a short description of at most 150 characters (both
        required). Organization, website and "Built with help from AI tools" are optional.
        Choose a visibility, which is required: Public or Private. Ask the user which they
        want; "Show me what will be public" (show-public-preview) lists exactly what a public
        project shows.
        Press "Create project" (create-project). If there is no website, a
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
        Optional: once the project has a website, "Only accept requests from" that site is an
        allowed-origin restriction: Sefaria refuses this key (403 origin_not_allowed) on any
        request whose Origin header is not that site, including requests with no Origin. Turn it on only for keys used in
        front-end code that runs in a browser. Leave it off for keys used from a server,
        script, app or agent, including your own calls.
      </li>
    </ol>
    <p>
      If the user needs large amounts of text, or the whole library, the API may not be needed
      at all: the entire Sefaria library is free to download, with no key, from
      {" " + LIBRARY_EXPORT_URL}. Suggest it before planning many API calls.
    </p>
    <p>API documentation: {API_DOCS_URL}</p>
  </div>
);


/* The three steps of setting up, shown on the way in and as progress while setting up. */
const SETUP_STEPS = [
  {en: "Tell us about yourself", he: "ספרו לנו על עצמכם", short: {en: "About you", he: "קצת עליך"}},
  {en: "Add your project", he: "הוסיפו את הפרויקט שלכם", short: {en: "Project", he: "פרויקט"}},
  {en: "Create your API key", he: "צרו מפתח API", short: {en: "API key", he: "מפתח API"}},
];

const CheckGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5" /></svg>
);

/* `current` is the step in progress; -1 shows the steps as a plain list on the way in. */
const SetupSteps = ({current = -1, compact = false}) => (
  <ol className={"devSetupSteps" + (compact ? " devSetupSteps--compact" : "")}
    aria-label={compact ? Sefaria._v({en: "Setup progress", he: "התקדמות ההגדרה"}) : undefined}>
    {SETUP_STEPS.map((step, i) => {
      const state = current < 0 ? "" : i < current ? " is-done" : i === current ? " is-current" : " is-next";
      return (
        <li key={i} className={"devSetupStep" + state} aria-current={i === current ? "step" : undefined}>
          <span className="devSetupStepNum" aria-hidden="true">{i < current ? <CheckGlyph /> : i + 1}</span>
          <span className="devSetupStepLabel"><InterfaceText text={compact ? step.short : {en: step.en, he: step.he}} /></span>
        </li>
      );
    })}
  </ol>
);

/* The setup card: one white panel per step, in the sign-in pages' style. A view the person
   moved to (not the one the page opens on) takes focus on its heading, as the sign-in card does. */
const SetupCard = ({titleId, title, lead, onBack, focusTitle = false, className = "", children}) => {
  const titleRef = useRef(null);
  useEffect(() => { if (focusTitle && titleRef.current) { titleRef.current.focus(); } }, []);
  return (
    <section className={"devSetup " + className} aria-labelledby={titleId}>
      {onBack ?
        <button type="button" className="devSetupBack" onClick={onBack} aria-label={Sefaria._v({en: "Back", he: "חזרה"})}>
          <img src="/static/icons/arrow-left.svg" alt="" aria-hidden="true" />
        </button> : null}
      <div className="devSetupHeader">
        <h2 id={titleId} className="devSetupTitle" ref={titleRef} tabIndex={-1}><InterfaceText text={title} /></h2>
        {lead ? <p className="devSetupLead">{lead}</p> : null}
      </div>
      {children}
    </section>
  );
};

const PrimaryButton = ({children, type = "button", ...rest}) => (
  <button type={type} className="sefaria-common-button auth-primary fullwidth" {...rest}>{children}</button>
);

const SecondaryButton = ({children, ...rest}) => (
  <button type="button" className="sefaria-common-button fullwidth devSetupSecondary" {...rest}>{children}</button>
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
  const email = accountEmail();
  const emailText = email ? <bdi dir="ltr"><strong>{email}</strong></bdi> : null;

  if (settingUp) {
    return (
      <section className="devSetup devSetupLoading" role="status">
        <span className="devPocSpinner" aria-hidden="true" />
        <p className="devSetupLead"><InterfaceText text={{en: "Setting up Developer Settings…", he: "מכינים את הגדרות המפתחים…"}} /></p>
      </section>
    );
  }

  if (!verified && confirmationSent) {
    return (
      <SetupCard
        titleId="devSetupCheckTitle"
        title={{en: "Check your email", he: "בדקו את תיבת הדוא״ל"}}
        lead={<InterfaceText text={{
          en: <React.Fragment>We sent a link to {emailText}. Open it on any device to continue. It works for 3 days.</React.Fragment>,
          he: <React.Fragment>שלחנו קישור אל {emailText}. פתחו אותו בכל מכשיר כדי להמשיך. הקישור בתוקף 3 ימים.</React.Fragment>,
        }} />}
        onBack={() => { onCancelConfirmation(); setAsking(false); setResent(false); }}
        focusTitle
      >
        <div className="devSetupActions">
          <SecondaryButton data-agent-action="resend-confirmation" onClick={() => { onSendConfirmation(); setResent(true); }}>
            <InterfaceText text={{en: "Resend link", he: "שליחה חוזרת"}} />
          </SecondaryButton>
          <p className="devSetupNote" role="status">
            {resent ? <InterfaceText text={{en: "Sent again.", he: "נשלח שוב."}} /> : null}
          </p>
        </div>
        <p className="devSetupNote">
          <InterfaceText text={{
            en: "Can't find it? Check your spam folder. Wrong address? Change it in Account Settings.",
            he: "לא מוצאים? בדקו בתיקיית הספאם. הכתובת שגויה? שנו אותה בהגדרות החשבון.",
          }} />
        </p>
      </SetupCard>
    );
  }

  if (asking && !verified) {
    return (
      <SetupCard
        titleId="devSetupConfirmTitle"
        title={{en: "Confirm your email", he: "אישור כתובת הדוא״ל"}}
        lead={<InterfaceText text={{
          en: <React.Fragment>We'll send a link to {email ? emailText : "your account email"}. It's a one-time step, and you'll keep signing in the way you do now.</React.Fragment>,
          he: <React.Fragment>נשלח קישור אל {email ? emailText : "כתובת הדוא״ל של החשבון"}. זה צעד חד־פעמי, ודרך ההתחברות שלך לא משתנה.</React.Fragment>,
        }} />}
        onBack={() => setAsking(false)}
        focusTitle
      >
        <PrimaryButton data-agent-action="send-confirmation" onClick={onSendConfirmation}>
          <InterfaceText text={{en: "Send confirmation link", he: "שליחת קישור לאישור"}} />
        </PrimaryButton>
      </SetupCard>
    );
  }

  return (
    <SetupCard
      titleId="devSetupTitle"
      title={{en: "Build with Sefaria's library", he: "לבנות עם הספרייה של ספריא"}}
      lead={<InterfaceText text={{
        en: "Get a free API key to use Sefaria's texts in your website, app or tool.",
        he: "קבלו מפתח API בחינם כדי להשתמש בטקסטים של ספריא באתר, באפליקציה או בכלי שלכם.",
      }} />}
      className={"devSetupEntry" + (highlight ? " settingsHighlight" : "")}
    >
      <SetupSteps />
      <PrimaryButton data-agent-action="get-started" onClick={start}>
        <InterfaceText text={{en: "Get started", he: "בואו נתחיל"}} />
      </PrimaryButton>
      <p className="devSetupLinks">
        <a href={API_DOCS_URL} target="_blank" rel="noreferrer">
          <InterfaceText text={{en: "Technical documentation", he: "תיעוד טכני"}} />
          <ExternalIcon />
        </a>
        <span className="devSetupLinksDot" aria-hidden="true">·</span>
        <a href={LIBRARY_EXPORT_URL} target="_blank" rel="noopener noreferrer">
          <InterfaceText text={{en: "Download the whole library", he: "הורדת הספרייה כולה"}} />
          <ExternalIcon />
        </a>
      </p>
    </SetupCard>
  );
};


/* The account email changed since it was verified. Projects and keys keep working; new ones
   wait until the new address is confirmed. */
const ReconfirmEmail = ({confirmationSent, onSend}) => {
  const email = accountEmail();
  const emailText = <bdi dir="ltr"><strong>{email}</strong></bdi>;
  return (
    <div className="devPocNotice devPocReconfirm" role="region" aria-label={Sefaria._v({en: "Confirm your new email", he: "אישור כתובת הדוא״ל החדשה"})}>
      <h2><InterfaceText text={{en: "Confirm your new email address", he: "אישור כתובת הדוא״ל החדשה"}} /></h2>
      <p>
        <InterfaceText text={{
          en: <React.Fragment>Your account email changed to {emailText}. Your projects and keys keep working. To create new projects and keys, confirm the new address.</React.Fragment>,
          he: <React.Fragment>כתובת הדוא״ל של החשבון שונתה ל־{emailText}. הפרויקטים והמפתחות שלכם ממשיכים לעבוד. כדי ליצור פרויקטים ומפתחות חדשים, אשרו את הכתובת החדשה.</React.Fragment>,
        }} />
      </p>
      {confirmationSent ?
        <p className="devPocHelp" role="status">
          <InterfaceText text={{
            en: <React.Fragment>We sent a confirmation link to {emailText}. It works for 3 days.</React.Fragment>,
            he: <React.Fragment>שלחנו קישור לאישור אל {emailText}. הקישור בתוקף 3 ימים.</React.Fragment>,
          }} />
        </p> : null}
      <div className="devPocActions">
        <button className="button small white" type="button" data-agent-action="send-confirmation" onClick={onSend}>
          <InterfaceText text={confirmationSent ?
            {en: "Resend the link", he: "שליחה חוזרת של הקישור"} :
            {en: "Email me a confirmation link", he: "שלחו לי קישור לאישור"}} />
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

/* Field errors follow the sign-in forms (static/js/auth/utils.js): a field is checked when it
   loses focus and again on submit, and typing only clears an error once the value is valid.
   Each rule is {id, validate}, where validate(fields) returns an error (a keyed string or a
   node) or null. On submit every failing field shows its error and the first one gets focus. */
const useFieldErrors = (rules) => {
  const [fieldErrors, setFieldErrors] = useState({});
  const setFieldError = (key, message) => setFieldErrors(f => ({...f, [key]: message || null}));
  const check = (key, fields) => setFieldError(key, rules[key].validate(fields));
  const clearIfValid = (key, fields) => {
    if (rules[key] && fieldErrors[key] && !rules[key].validate(fields)) { setFieldError(key, null); }
  };
  const checkAll = (fields) => {
    const all = {};
    Object.keys(rules).forEach(key => { all[key] = rules[key].validate(fields) || null; });
    setFieldErrors(all);
    const failing = Object.keys(rules).filter(key => all[key]);
    const first = failing.length && document.getElementById(rules[failing[0]].id);
    if (first) { first.focus(); }
    return failing.length === 0;
  };
  return {fieldErrors, check, clearIfValid, checkAll};
};

/* The Input's inline error, for controls that aren't an Input yet (checkboxes, radios). */
const FieldError = ({id, error}) => error ? (
  <div className="sefaria-input-error" id={id} role="alert">
    <img className="sefaria-input-errorIcon" src="/static/icons/info-error.svg" alt="" aria-hidden="true" />
    {typeof error === 'string' ? <InterfaceText>{error}</InterfaceText> : error}
  </div>
) : null;

/* A failed save: the sign-in forms' error banner, at the top of the form. */
const saveFailure = (err) => ({message: (err && err.message) || Sefaria._v(SAVE_FAILED)});
/* A key that couldn't be made: say so, and nothing more (Penina, 2026-11-05). */
const keyFailure = (err) => ({message: (err && err.message) || Sefaria._v({en: "We couldn't create your key. Please try again.", he: "לא הצלחנו ליצור את המפתח. נסו שוב."})});

/* Name and email come from the Sefaria account and are shown locked; an account without a
   name types one here instead. */
const AboutYouFields = ({fields, set, errors = {}, check = () => {}}) => {
  const name = accountName();
  const email = accountEmail();
  return (
    <React.Fragment>
      <div className="devPocField">
        {name ?
          <FieldNote fieldId="devPocName">
            <InterfaceText text={{en: "From your Sefaria account.", he: "מתוך חשבון ספריא שלך."}} />
          </FieldNote> : null}
        {name ?
          <Input id="devPocName" label={<InterfaceText text={{en: "Name", he: "שם"}} />}
            value={name} readOnly aria-readonly="true" aria-describedby={tipId("devPocName")} dir="auto" /> :
          <Input id="devPocName" label={<InterfaceText text={{en: "Name", he: "שם"}} />}
            value={fields.developerName} onChange={e => set("developerName", e.target.value)} dir="auto"
            error={errors.developerName} onBlur={() => check("developerName")} />}
      </div>
      {email ?
        <div className="devPocField">
          <FieldNote fieldId="devPocEmail">
            <InterfaceText text={{
              en: "From your Sefaria account. We send project and key emails here.",
              he: "מתוך חשבון ספריא שלך. לכתובת הזו נשלח הודעות על פרויקטים ומפתחות.",
            }} />
          </FieldNote>
          <Input id="devPocEmail" type="email" inputDir="ltr" label={<InterfaceText text={{en: "Email", he: "דוא״ל"}} />}
            value={email} readOnly aria-readonly="true" aria-describedby={tipId("devPocEmail")} />
        </div> : null}
      <div className="devPocField">
        <Input
          id="devPocEmail2"
          type="email"
          inputDir="ltr"
          label={<InterfaceText text={{en: "Also send project and key emails to", he: "לשלוח הודעות על פרויקטים ומפתחות גם אל"}} />}
          labelAddon={<React.Fragment>
            <OptionalMark />
            <InfoTip fieldId="devPocEmail2">
              <InterfaceText text={{
                en: "Add another address, like a work address or a colleague who looks after the project, and it gets the same emails.",
                he: "הוסיפו כתובת נוספת, למשל כתובת עבודה או של עמית שמטפל בפרויקט, והיא תקבל את אותן הודעות.",
              }} />
            </InfoTip>
          </React.Fragment>}
          aria-describedby={tipId("devPocEmail2")}
          value={fields.additionalEmail}
          onChange={e => set("additionalEmail", e.target.value)}
          error={errors.additionalEmail}
          onBlur={() => check("additionalEmail")}
        />
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
const LegalFields = ({fields, set, accepted, errors = {}}) => (
  <section className="devPocLegal" aria-label={Sefaria._v({en: "Terms and emails", he: "תנאים והודעות דוא״ל"})}>
    {accepted ?
      <p className="devPocHelp devPocAccepted">
        <InterfaceText text={{
          en: <React.Fragment>You've accepted the <TermsLink />, and agreed that Sefaria may email you about your API keys and contact you about your projects.</React.Fragment>,
          he: <React.Fragment>אישרת את <TermsLink />, והסכמת שספריא תשלח לך הודעות דוא״ל על מפתחות ה־API ותיצור איתך קשר בנוגע לפרויקטים שלך.</React.Fragment>,
        }} />
      </p> :
      <div className="devPocField">
        <label className="devPocChoice">
          <input type="checkbox" id="devPocTerms" checked={fields.termsAccepted} onChange={e => set("termsAccepted", e.target.checked)}
            aria-invalid={errors.termsAccepted ? "true" : undefined} aria-describedby={errors.termsAccepted ? "devPocTerms-error" : undefined} />
          <span>
            <InterfaceText text={{
              en: <React.Fragment>I accept the <TermsLink />, and agree that Sefaria may email me about my API keys and contact me about my projects</React.Fragment>,
              he: <React.Fragment>אני מאשר/ת את <TermsLink />, ומסכים/ה שספריא תשלח לי הודעות דוא״ל על מפתחות ה־API ותיצור איתי קשר בנוגע לפרויקטים שלי</React.Fragment>,
            }} />
          </span>
        </label>
        <FieldError id="devPocTerms-error" error={errors.termsAccepted} />
      </div>}
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

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const PROFILE_RULES = {
  developerName: {id: "devPocName", validate: f => accountName() ? null : requiredFieldValidate(f.developerName)},
  additionalEmail: {id: "devPocEmail2", validate: f =>
    f.additionalEmail.trim() && !EMAIL_PATTERN.test(f.additionalEmail.trim()) ? "auth.invalid_email" : null},
  termsAccepted: {id: "devPocTerms", validate: f => f.termsAccepted ? null :
    <InterfaceText text={{en: "Accept the API terms to continue.", he: "כדי להמשיך יש לאשר את תנאי השימוש ב־API."}} />},
};

/* The state and submit for both profile forms. */
const useProfileForm = (initial, onSave) => {
  const [fields, setFields] = useState(initial);
  const [banner, setBanner] = useState(null);
  const {fieldErrors, check, clearIfValid, checkAll} = useFieldErrors(PROFILE_RULES);
  const set = (key, value) => {
    const next = {...fields, [key]: value};
    setFields(next);
    clearIfValid(key, next);
  };
  const submit = (e) => {
    e.preventDefault();
    setBanner(null);
    if (checkAll(fields)) {
      Promise.resolve(onSave(cleanProfile(fields))).catch(err => setBanner(saveFailure(err)));
    }
  };
  return {fields, set, banner, submit, errors: fieldErrors, check: key => check(key, fields)};
};

const cleanProfile = (fields) => ({
  ...fields,
  developerName: accountName() || fields.developerName.trim(),
  description: fields.description.trim(),
  additionalEmail: fields.additionalEmail.trim(),
});

/* First visit: step 1 of setup. Name and email come from the account and are shown, not
   asked for; the legal part sits at the bottom. */
const ProfileOnboarding = ({onSave}) => {
  const {fields, set, banner, submit, errors, check} = useProfileForm(emptyProfile(), onSave);
  const name = accountName();
  const email = accountEmail();
  const optional = <span className="devSetupOptional"><InterfaceText text={{en: "Optional", he: "לא חובה"}} /></span>;

  return (
    <SetupCard
      titleId="devSetupProfileTitle"
      title={{en: "About you", he: "קצת עליך"}}
      lead={<InterfaceText text={{
        en: "So we know who's building with Sefaria, and where to send news about your keys.",
        he: "כדי שנדע מי בונה עם ספריא, ולאן לשלוח עדכונים על המפתחות שלך.",
      }} />}
      className="devSetupProfile"
    >
      <SetupSteps current={0} compact />
      <form className="devSetupForm" onSubmit={submit} noValidate>
        <ErrorBanner error={banner} />

        {name || email ?
          <div className="devSetupAccount">
            <p className="devSetupAccountLabel"><InterfaceText text={{en: "From your Sefaria account", he: "מתוך חשבון ספריא שלך"}} /></p>
            {name ? <p className="devSetupAccountName" dir="auto">{name}</p> : null}
            {email ? <p className="devSetupAccountEmail"><bdi dir="ltr">{email}</bdi></p> : null}
            <p className="devSetupNote">
              <InterfaceText text={{en: "We email you here about your projects and keys.", he: "לכאן נשלח הודעות על הפרויקטים והמפתחות שלך."}} />
            </p>
          </div> : null}

        <div className="sefaria-auth-fields">
          {name ? null :
            <Input id="devPocName" label={<InterfaceText text={{en: "Name", he: "שם"}} />} dir="auto"
              value={fields.developerName} onChange={e => set("developerName", e.target.value)}
              error={errors.developerName} onBlur={() => check("developerName")} />}
          <Input
            id="devPocEmail2"
            type="email"
            inputDir="ltr"
            label={<InterfaceText text={{en: "Also send these emails to", he: "לשלוח את ההודעות האלה גם אל"}} />}
            labelAddon={optional}
            hint={<InterfaceText text={{
              en: "A work address, or a teammate who looks after the project.",
              he: "כתובת עבודה, או עמית שמטפל בפרויקט.",
            }} />}
            placeholder="name@example.com"
            value={fields.additionalEmail}
            onChange={e => set("additionalEmail", e.target.value)}
            error={errors.additionalEmail}
            onBlur={() => check("additionalEmail")}
          />
          <Input
            id="devPocDescription"
            multiline
            rows={3}
            dir="auto"
            label={<InterfaceText text={{en: "Tell us about yourself", he: "ספרו לנו על עצמכם"}} />}
            labelAddon={optional}
            placeholder={Sefaria._v({
              en: "Who you are, where you work or study, what you like to build",
              he: "מי אתם, איפה אתם עובדים או לומדים, מה אתם אוהבים לבנות",
            })}
            value={fields.description}
            onChange={e => set("description", e.target.value)}
          />
          <Checkbox
            id="devPocNotADeveloper"
            checked={!!fields.notADeveloper}
            onChange={e => set("notADeveloper", e.target.checked)}
            label={<InterfaceText text={{en: "I don't write code myself", he: "אני לא כותב/ת קוד בעצמי"}} />}
            description={<InterfaceText text={{
              en: "For example, you build with AI tools, or someone else writes the code.",
              he: "למשל, אתם בונים בעזרת כלי בינה מלאכותית, או שמישהו אחר כותב את הקוד.",
            }} />}
          />
        </div>

        <div className="devSetupLegal">
          <Checkbox
            id="devPocTerms"
            checked={fields.termsAccepted}
            onChange={e => set("termsAccepted", e.target.checked)}
            error={errors.termsAccepted}
            label={<InterfaceText text={{
              en: <React.Fragment>I accept the <TermsLink />, and agree that Sefaria may email me about my keys and projects</React.Fragment>,
              he: <React.Fragment>אני מאשר/ת את <TermsLink />, ומסכים/ה שספריא תשלח לי הודעות על המפתחות והפרויקטים שלי</React.Fragment>,
            }} />}
          />
          <Checkbox
            id="devPocDeveloperNews"
            checked={!!fields.developerNews}
            onChange={e => set("developerNews", e.target.checked)}
            label={<InterfaceText text={{en: "Send me Sefaria's developer newsletter", he: "שלחו לי את הניוזלטר למפתחים של ספריא"}} />}
            description={<InterfaceText text={{
              en: "New features, events and ideas. Unsubscribe any time.",
              he: "תכונות חדשות, אירועים ורעיונות. אפשר לבטל בכל עת.",
            }} />}
          />
        </div>

        <PrimaryButton type="submit" data-agent-action="save-profile">
          <InterfaceText text={{en: "Continue", he: "המשך"}} />
        </PrimaryButton>
      </form>
    </SetupCard>
  );
};

const ProfileForm = ({profile, onSave, onCancel}) => {
  const {fields, set, banner, submit, errors, check} = useProfileForm({...emptyProfile(), ...profile}, onSave);

  return (
    <form className="devPocForm" onSubmit={submit} noValidate>
      <ErrorBanner error={banner} />
      <AboutYouFields fields={fields} set={set} errors={errors} check={check} />
      <LegalFields fields={fields} set={set} accepted={!!(profile && profile.termsAccepted)} errors={errors} />
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

const LinkedListingNote = ({name}) => (
  <p className="devPocHelp devPocLinked" role="status">
    <span className="devPocBadge"><InterfaceText text={{en: "Linked", he: "מקושר"}} /></span>{" "}
    <InterfaceText text={{
      en: <React.Fragment>This project is the <strong dir="auto">{name}</strong> listing on Powered by Sefaria.</React.Fragment>,
      he: <React.Fragment>הפרויקט הזה הוא הרישום <strong dir="auto">{name}</strong> ב־Powered by Sefaria.</React.Fragment>,
    }} />
  </p>
);


const ProjectFields = ({fields, set, onChoosePublic, onChoosePrivate, onShowPublic, linkedNote, errors = {}, check = () => {}}) => (
  <React.Fragment>
    {linkedNote}
    <div className="devPocField">
      <Input id="devPocProjectName" dir="auto" label={<InterfaceText text={{en: "Project name", he: "שם הפרויקט"}} />}
        value={fields.name} onChange={e => set("name", e.target.value)}
        error={errors.name} onBlur={() => check("name")} />
    </div>
    <div className="devPocField">
      <Input
        id="devPocProjectDescription"
        label={<InterfaceText text={{en: "Short description", he: "תיאור קצר"}} />}
        labelAddon={
          <InfoTip fieldId="devPocProjectDescription">
            <InterfaceText text={{
              en: "The name and description help you tell your projects apart and tell the Sefaria team what you're building. If you make the project public, they're also what visitors to Powered by Sefaria see.",
              he: "השם והתיאור עוזרים לכם להבחין בין הפרויקטים שלכם ומספרים לצוות ספריא מה אתם בונים. אם תהפכו את הפרויקט לציבורי, זה גם מה שיראו המבקרים ב־Powered by Sefaria.",
            }} />
          </InfoTip>}
        dir="auto"
        maxLength={MAX_DESCRIPTION_LENGTH}
        aria-describedby={tipId("devPocProjectDescription") + " devPocProjectDescriptionCount"}
        placeholder={Sefaria._v({
          en: "One sentence, e.g. a daily study tracker for my community",
          he: "משפט אחד, למשל: כלי למעקב אחר לימוד יומי בקהילה שלי",
        })}
        value={fields.description}
        onChange={e => set("description", e.target.value)}
        error={errors.description}
        onBlur={() => check("description")}
      />
      <CharacterCount id="devPocProjectDescriptionCount" length={fields.description.length} />
    </div>
    <div className="devPocField">
      <Input id="devPocProjectOrg" dir="auto"
        label={<InterfaceText text={{en: "Organization", he: "ארגון"}} />} labelAddon={<OptionalMark />}
        value={fields.organization} onChange={e => set("organization", e.target.value)} />
    </div>
    <div className="devPocField">
      <Input
        id="devPocProjectUrl"
        label={<InterfaceText text={{en: "Website", he: "אתר"}} />}
        labelAddon={<React.Fragment>
          <OptionalMark />
          <InfoTip fieldId="devPocProjectUrl" wide>
            <InterfaceText text={{
              en: "The address people visit to use your project. We show it with your project on Powered by Sefaria, and you can use it to keep your key from working anywhere else. No website yet? You can add it later.",
              he: "הכתובת שבה משתמשים בפרויקט שלכם. נציג אותה לצד הפרויקט ב־Powered by Sefaria, ותוכלו להשתמש בה כדי שהמפתח לא יעבוד בשום מקום אחר. עדיין אין אתר? אפשר להוסיף אותו מאוחר יותר.",
            }} />
          </InfoTip>
        </React.Fragment>}
        aria-describedby={tipId("devPocProjectUrl")}
        inputDir="ltr"
        placeholder="https://"
        value={fields.websiteUrl}
        onChange={e => set("websiteUrl", e.target.value)}
        error={errors.websiteUrl}
        onBlur={() => check("websiteUrl")}
      />
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
        <input type="radio" id="devPocVisibilityPublic" aria-describedby={tipId("devPocVisibilityPublic") + (errors.visibility ? " devPocVisibility-error" : "")} aria-invalid={errors.visibility ? "true" : undefined} name="devPocVisibility" value="public" checked={fields.visibility === "public"} onChange={onChoosePublic} />
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
        <input type="radio" id="devPocVisibilityPrivate" aria-describedby={tipId("devPocVisibilityPrivate") + (errors.visibility ? " devPocVisibility-error" : "")} aria-invalid={errors.visibility ? "true" : undefined} name="devPocVisibility" value="private" checked={fields.visibility === "private"} onChange={onChoosePrivate} />
        <span>
          <InterfaceText text={{en: "Private", he: "פרטי"}} />
          <InfoTip fieldId="devPocVisibilityPrivate">
            <InterfaceText text={{en: "Only you and the Sefaria team can see this project.", he: "רק את/ה וצוות ספריא יכולים לראות את הפרויקט."}} />
          </InfoTip>
        </span>
      </label>
      <FieldError id="devPocVisibility-error" error={errors.visibility} />
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


/* A listing submitted with this account's verified email. "Yes" turns it into a public
   project linked to the listing; nothing is linked without that answer. */
const YourListingDialog = ({listing, onYes, onNo, onLater}) => {
  const yesRef = useRef(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useDialogKeys(yesRef, onLater);
  /* One answer at a time: the buttons are disabled until the server replies. */
  const answer = (send) => () => {
    if (busy.current) { return; }
    busy.current = true;
    setPending(true);
    Promise.resolve(send()).finally(() => {
      busy.current = false;
      if (mounted.current) { setPending(false); }
    });
  };
  return (
    <div className="devPocModalStage devPocConfirmStage" role="dialog" aria-modal="true" aria-labelledby="devPocYourListingTitle">
      <section className="devPocDialog">
        <h2 id="devPocYourListingTitle"><InterfaceText text={{en: "Is this your project?", he: "האם זה הפרויקט שלך?"}} /></h2>
        <p>
          <InterfaceText text={{
            en: "This project on Powered by Sefaria was submitted with your email address.",
            he: "הפרויקט הזה ב־Powered by Sefaria נשלח עם כתובת האימייל שלך.",
          }} />
        </p>
        <ListingSummary listing={listing} />
        <p>
          <InterfaceText text={{
            en: "If it's yours, we'll add it to your projects with these details, so you can create an API key for it. It stays public, like the listing, and you can edit it afterwards.",
            he: "אם הוא שלך, נוסיף אותו לפרויקטים שלך עם הפרטים האלה, כדי שתוכלו ליצור לו מפתח API. הוא יישאר ציבורי, כמו הרישום, ואפשר לערוך אותו אחר כך.",
          }} />
        </p>
        <div className="devPocActions">
          <button type="button" className="button small blue" ref={yesRef} data-agent-action="claim-listing" aria-disabled={pending} onClick={answer(onYes)}>
            <InterfaceText text={{en: "Yes, add it", he: "כן, להוסיף"}} />
          </button>
          <button type="button" className="button small white" data-agent-action="not-my-listing" aria-disabled={pending} onClick={answer(onNo)}>
            <InterfaceText text={{en: "No, it's not mine", he: "לא, זה לא שלי"}} />
          </button>
          <button type="button" className="button small transparent" data-agent-action="listing-not-now" onClick={onLater}>
            <InterfaceText text={{en: "Not now", he: "לא עכשיו"}} />
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
const PublicPreviewDialog = ({fields, onClose}) => {
  const closeRef = useRef(null);
  useDialogKeys(closeRef, onClose);
  const notYet = <span className="devPocMuted"><InterfaceText text={{en: "Not filled in yet", he: "עדיין לא מולא"}} /></span>;
  const rows = [
    {label: {en: "Project name", he: "שם הפרויקט"}, value: fields.name.trim(), dir: "auto"},
    {label: {en: "Description", he: "תיאור"}, value: fields.description.trim(), dir: "auto"},
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
            en: "Your name, email address and API keys are never shown. You can change these details, or make the project private again, with Edit project.",
            he: "השם, כתובת האימייל ומפתחות ה־API שלך לעולם לא מוצגים. אפשר לשנות את הפרטים האלה, או להחזיר את הפרויקט למצב פרטי, דרך עריכת הפרויקט.",
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


const NoWebsiteDialog = ({onAddWebsite, onSaveAnyway}) => {
  const addRef = useRef(null);
  useDialogKeys(addRef, onAddWebsite);
  return (
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
          <button type="button" className="button small white" ref={addRef} onClick={onAddWebsite}>
            <InterfaceText text={{en: "Add a website", he: "הוספת אתר"}} />
          </button>
          <button type="button" className="button small blue" data-agent-action="save-without-website" onClick={onSaveAnyway}>
            <InterfaceText text={{en: "Save without a website", he: "שמירה בלי אתר"}} />
          </button>
        </div>
      </section>
    </div>
  );
};


/* One form for creating and editing a project. A missing website asks once before saving,
   and the website field gets focus if the developer goes back to add one. */
const PROJECT_RULES = {
  name: {id: "devPocProjectName", validate: f => requiredFieldValidate(f.name)},
  description: {id: "devPocProjectDescription", validate: f => requiredFieldValidate(f.description) || (
    f.description.trim().length > MAX_DESCRIPTION_LENGTH ?
      <InterfaceText text={{
        en: "Keep the description to " + MAX_DESCRIPTION_LENGTH + " characters.",
        he: "התיאור יכול להכיל עד " + MAX_DESCRIPTION_LENGTH + " תווים.",
      }} /> : null)},
  websiteUrl: {id: "devPocProjectUrl", validate: f => parseWebsite(f.websiteUrl).valid ? null :
    <InterfaceText text={{en: "Enter a website address like example.com.", he: "נא להזין כתובת אתר כמו example.com."}} />},
  visibility: {id: "devPocVisibilityPublic", validate: f => f.visibility ? null :
    <InterfaceText text={{en: "Choose whether the project is public or private.", he: "נא לבחור אם הפרויקט ציבורי או פרטי."}} />},
};

const ProjectForm = ({initial, savedVisibility, linkedListingName, submitLabel, onSave, onCancel, onDelete}) => {
  const [fields, setFields] = useState(initial);
  const [banner, setBanner] = useState(null);
  const {fieldErrors, check, clearIfValid, checkAll} = useFieldErrors(PROJECT_RULES);
  const [askWebsite, setAskWebsite] = useState(false);
  const [previewPublic, setPreviewPublic] = useState(false);
  const [askPrivate, setAskPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const formRef = useRef(null);
  const set = (key, value) => {
    const next = {...fields, [key]: value};
    setFields(next);
    clearIfValid(key, next);
  };

  /* One request at a time, so a double click saves once. */
  const save = () => {
    if (savingRef.current) { return; }
    savingRef.current = true;
    setSaving(true);
    Promise.resolve(onSave({
      ...fields, name: fields.name.trim(), description: fields.description.trim(),
      organization: fields.organization.trim(), websiteUrl: parseWebsite(fields.websiteUrl).url,
    })).catch(err => { if (mounted.current) { setBanner(saveFailure(err)); } })
      .finally(() => {
        savingRef.current = false;
        if (mounted.current) { setSaving(false); }
      });
  };

  const submit = (e) => {
    e.preventDefault();
    if (savingRef.current) { return; }
    setBanner(null);
    if (!checkAll(fields)) { return; }
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
      <form className="devPocForm" onSubmit={submit} ref={formRef} noValidate>
        <ErrorBanner error={banner} />
        <ProjectFields
          fields={fields}
          set={set}
          errors={fieldErrors}
          check={key => check(key, fields)}
          onChoosePublic={() => set("visibility", "public")}
          onChoosePrivate={choosePrivate}
          onShowPublic={() => setPreviewPublic(true)}
          linkedNote={linkedListingName ? <LinkedListingNote name={linkedListingName} /> : null}
        />
        <p className="devPocHelp">
          <InterfaceText text={{
            en: "Projects stay with this Sefaria account and can't be transferred to another account.",
            he: "פרויקטים נשארים בחשבון ספריא הזה ואי אפשר להעביר אותם לחשבון אחר.",
          }} />
        </p>
        <div className="devPocActions">
          <button type="submit" className="button small blue" aria-disabled={saving} data-agent-action={onDelete ? "save-project" : "create-project"}>
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
        <PublicPreviewDialog fields={fields} onClose={() => setPreviewPublic(false)} /> : null}
      {askPrivate ?
        <MakePrivateDialog
          onConfirm={() => { setAskPrivate(false); set("visibility", "private"); }}
          onCancel={() => setAskPrivate(false)}
        /> : null}
    </React.Fragment>
  );
};

const newProjectFields = () => ({
  name: "", description: "", organization: "", websiteUrl: "",
  visibility: null, aiAssisted: false,
});

/* The new-project form opens in place at the top of the project list. */
const NewProjectPanel = ({onCreate, onCancel}) => {
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
        submitLabel={{en: "Create project", he: "יצירת פרויקט"}}
        onSave={onCreate}
        onCancel={onCancel}
      />
    </section>
  );
};


/* An allowed-origin restriction on the key. One visible technical sentence names the exact
   mechanism (Origin header, 403) so developers and agents can act on it without guessing;
   the plain-language explanation is a disclosure, because this setting is the one most
   likely to break a project. */
const RestrictionToggle = ({project, apiKey, onToggle}) => {
  const host = websiteHost(project.websiteUrl);
  const [explained, setExplained] = useState(false);
  const explainerId = "devPocRestrictionHelp-" + apiKey.id;
  const summaryId = "devPocRestrictionSummary-" + apiKey.id;
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
            aria-describedby={summaryId}
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
      <p className="devPocHelp devPocRestrictionSummary" id={summaryId}>
        <InterfaceText text={{
          en: <React.Fragment>Allowed origin: Sefaria refuses requests with this key (<code dir="ltr">403 origin_not_allowed</code>) unless their <code dir="ltr">Origin</code> header is {origin}.</React.Fragment>,
          he: <React.Fragment>מקור מורשה (allowed origin): ספריא דוחה בקשות עם המפתח (<code dir="ltr">403 origin_not_allowed</code>) אלא אם כותרת ה־<code dir="ltr">Origin</code> שלהן היא {origin}.</React.Fragment>,
        }} />
      </p>
      <button
        type="button"
        className="devPocTextButton devPocExplainerToggle"
        aria-expanded={explained}
        aria-controls={explainerId}
        onClick={() => setExplained(e => !e)}
      >
        <InterfaceText text={{en: "What does this mean?", he: "מה זה אומר?"}} />
      </button>
      {explained ?
        <div className="devPocExplainer" id={explainerId}>
          <p>
            <InterfaceText text={{
              en: <React.Fragment>When this is on, the key only works on your website, {origin}. Anywhere else, including a request with no website attached, Sefaria turns it away.</React.Fragment>,
              he: <React.Fragment>כשההגבלה פעילה, המפתח עובד רק באתר שלכם, {origin}. בכל מקום אחר, כולל בקשה שלא מגיעה מאתר, ספריא דוחה אותו.</React.Fragment>,
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

const KeysSection = ({project, maxKeys, canCreate, run, setConfirm, onAddWebsite}) => {
  const [creating, setCreating] = useState(false);   // showing the label form
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState("idle");        // idle | setting-up | error
  const [labelError, setLabelError] = useState(null);
  const [newKeyId, setNewKeyId] = useState(null);
  const mounted = useRef(true);
  const highlightTimer = useRef(null);
  const headingRef = useRef(null);

  useEffect(() => () => { mounted.current = false; clearTimeout(highlightTimer.current); }, []);

  const atLimit = project.keys.length >= maxKeys;
  const keysNoteField = "devPocKeys-" + project.id;
  const firstKeyPrompt = canCreate && project.keys.length === 0 && !creating && phase === "idle";
  const startCreating = () => { setCreating(true); setPhase("idle"); setLabelError(null); };

  /* The spinner stays up for at least KEY_SETUP_MS, about how long auth services take to
     pick up a new key. */
  const startCreate = (e) => {
    e.preventDefault();
    const problem = requiredFieldValidate(label);
    setLabelError(problem);
    if (problem) { document.getElementById("devPocKeyLabel").focus(); return; }
    setPhase("setting-up");
    const minimum = new Promise(resolve => setTimeout(resolve, KEY_SETUP_MS));
    const created = run(createKey(project.id, label.trim()), {quiet: true});
    Promise.all([created, minimum]).then(([data]) => {
      if (!mounted.current) { return; }
      setPhase("idle"); setCreating(false); setLabel("");
      setNewKeyId(data.keyId);
      clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setNewKeyId(null), KEY_HIGHLIGHT_MS);
    }, () => { if (mounted.current) { setPhase("error"); } });
  };

  const toggleRestriction = (keyId, on) => run(setKeyRestriction(keyId, on)).catch(() => {});

  const deleteApiKey = (apiKey) => setConfirm({
    title: Sefaria._v({en: "Delete “" + apiKey.label + "”?", he: "למחוק את „" + apiKey.label + "”?"}),
    body: Sefaria._v({
      en: "The key stops working right away, and anything that uses it will stop working too. You can't undo this.",
      he: "המפתח יפסיק לעבוד מיד, וכל מה שמשתמש בו יפסיק לעבוד גם כן. אי אפשר לבטל את הפעולה.",
    }),
    actionLabel: Sefaria._v({en: "Delete key", he: "מחיקת המפתח"}),
    /* The deleted key's row takes its buttons with it, so focus lands on the section. */
    onConfirm: () => run(deleteKey(apiKey.id)).then(() => {
      if (mounted.current && headingRef.current) { headingRef.current.focus(); }
    }, () => {}),
  });

  return (
    <section className="devPocSection">
      <div className="devPocHeading">
        <div>
          <h3 tabIndex={-1} ref={headingRef}>
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
              en: project.keys.length + " of " + maxKeys + " keys",
              he: project.keys.length + " מתוך " + maxKeys + " מפתחות",
            }} />
          </p>
        </div>
        {creating || firstKeyPrompt || !canCreate ? null :
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
            en: "You have " + maxKeys + " keys, the most a project can have. Delete one you don't use to make room.",
            he: "יש לכם " + maxKeys + " מפתחות, המספר המרבי לפרויקט. מחקו מפתח שאינו בשימוש כדי לפנות מקום.",
          }} />
        </p> : null}

      {creating && phase === "idle" ?
        <form className="devPocForm devPocCreateKey" onSubmit={startCreate} noValidate>
          <div className="devPocField">
            <Input
              id="devPocKeyLabel"
              label={<InterfaceText text={{en: "Key name", he: "שם המפתח"}} />}
              labelAddon={
                <InfoTip fieldId="devPocKeyLabel">
                  <InterfaceText text={{en: "A name just for you, so you can tell your keys apart.", he: "שם רק בשבילכם, כדי להבחין בין המפתחות."}} />
                </InfoTip>}
              aria-describedby={tipId("devPocKeyLabel")}
              dir="auto"
              placeholder={Sefaria._v({en: "e.g. My website", he: "למשל: האתר שלי"})}
              value={label}
              onChange={e => { setLabel(e.target.value); if (labelError && !requiredFieldValidate(e.target.value)) { setLabelError(null); } }}
              error={labelError}
              onBlur={() => setLabelError(requiredFieldValidate(label))}
            />
          </div>
          <div className="devPocActions">
            <button type="submit" className="button small blue" data-agent-action="create-key">
              <InterfaceText text={{en: "Create key", he: "יצירת מפתח"}} />
            </button>
            <button type="button" className="button small transparent" onClick={() => { setCreating(false); setLabelError(null); }}>
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
                onDelete={() => deleteApiKey(k)}
                onAddWebsite={onAddWebsite}
              />
            ))}
          </div>
        </div> : null}
    </section>
  );
};


const listingStatus = (project) => {
  if (project.linkedListing && project.visibility === "public") {
    return {
      en: "Public: this is the " + project.name + " listing on Powered by Sefaria.",
      he: "ציבורי: זה הרישום " + project.name + " ב־Powered by Sefaria.",
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


const ProjectCard = ({project, expanded, maxKeys, canCreateKeys, run, setConfirm, onToggleExpand, onDeleted, notice}) => {
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

  /* Rejects with the error for the form to show; a saved project closes the editor. */
  const saveProject = (fields) => {
    const losingUrl = !!project.websiteUrl && !fields.websiteUrl.trim();
    const restrictedKeys = project.keys.filter(k => k.restrictToWebsite).map(k => k.label);
    return run(updateProject(project.id, fields), {quiet: true}).then(() => {
      setEditing(false);
      if (losingUrl && restrictedKeys.length) {
        notice(Sefaria._v({
          en: restrictedKeys.join(", ") + " now works anywhere again, because the project no longer has a website.",
          he: restrictedKeys.join(", ") + " עובד שוב בכל מקום, כי לפרויקט כבר אין אתר.",
        }));
      }
    });
  };

  const keyLabels = project.keys.map(k => k.label).join(", ");
  const keysText = project.keys.length
    ? Sefaria._v({
      en: "These keys stop working right away: " + keyLabels + ". You can't get the project or its keys back.",
      he: "המפתחות האלה יפסיקו לעבוד מיד: " + keyLabels + ". לא יהיה אפשר לשחזר את הפרויקט או את המפתחות שלו.",
    })
    : Sefaria._v({en: "This project has no keys. You can't undo this.", he: "לפרויקט הזה אין מפתחות. אי אפשר לבטל את הפעולה."});
  const confirmDeleteProject = () => setConfirm({
    title: Sefaria._v({en: "Delete " + project.name + "?", he: "למחוק את " + project.name + "?"}),
    body: project.visibility === "public"
      ? <React.Fragment>{keysText} <PublishedCopiesWarning /></React.Fragment>
      : keysText,
    actionLabel: Sefaria._v({en: "Delete project", he: "מחיקת הפרויקט"}),
    onConfirm: () => run(deleteProject(project.id)).then(onDeleted, () => {}),
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
                }}
                savedVisibility={project.visibility}
                linkedListingName={project.linkedListing ? project.name : null}
                submitLabel={{en: "Save project", he: "שמירת הפרויקט"}}
                onSave={saveProject}
                onCancel={() => setEditing(false)}
                onDelete={confirmDeleteProject}
              />
            </section> : null}
          <KeysSection project={project} maxKeys={maxKeys} canCreate={canCreateKeys} run={run} setConfirm={setConfirm} onAddWebsite={addWebsite} />
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


/* ===========================================================================================
   Design trial E (design/api-keys branch): one short setup flow after OpenAI's onboarding, then
   a page of projects with their keys after the Coinbase keys page. Turn off with USE_DESIGN_E.
   =========================================================================================== */
const USE_DESIGN_E = true;
const tE = (en, he) => <InterfaceText text={{en, he}} />;
const vE = (en, he) => Sefaria._v({en, he});
/* "Tell us about yourself": 250 characters (the server allows up to 300). */
const E_ABOUT_MAX = 250;
const E_SAMPLE_URL = "https://www.sefaria.org/api/v3/texts/Genesis.1.1";
const E_ROLES = [
  {value: "developer", en: "Very technical", he: "טכני/ת מאוד"},
  {value: "ai", en: "Somewhat technical", he: "טכני/ת במידה מסוימת"},
  {value: "none", en: "Not technical", he: "לא טכני/ת"},
];

/* What a builder pastes into their AI tool so it can call the API with their key. */
const eSnippet = (key, projectName) =>
  `I'm building ${projectName} with the Sefaria API.\nMy Sefaria API key is ${key}.\nSend it in an x-api-key header on every request to https://www.sefaria.org/api/.\nKeep the key out of public code. API docs: ${API_DOCS_URL}`;

const ECopyIcon = ({size = 14}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

/* Lucide icons, pasted (not yet in our icon library): pencil, plus, sparkles, globe, star, check, trash-2. */
/* Lucide icons at the design system's sizes only: 12, 18 or 24px (18 by default). */
const eLucide = (paths, size = 18) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths}</svg>
);
const EPencilIcon = ({size} = {}) => eLucide(<React.Fragment><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" /></React.Fragment>, size);
const EPlusIcon = ({size} = {}) => eLucide(<React.Fragment><path d="M5 12h14" /><path d="M12 5v14" /></React.Fragment>, size);
const ESparklesIcon = ({size} = {}) => eLucide(<React.Fragment><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" /></React.Fragment>, size);
const EGlobeIcon = ({size} = {}) => eLucide(<React.Fragment><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></React.Fragment>, size);
const EStarIcon = ({size} = {}) => eLucide(<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />, size);
const ECheckIcon = ({size} = {}) => eLucide(<path d="M20 6 9 17l-5-5" />, size);
const EArrowLeftIcon = ({size} = {}) => eLucide(<React.Fragment><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></React.Fragment>, size);
const EMailIcon = ({size} = {}) => eLucide(<React.Fragment><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></React.Fragment>, size);
const ETrashIcon = ({size} = {}) => eLucide(<React.Fragment><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" /></React.Fragment>, size);

const eCopy = (text, done) => {
  try {
    navigator.clipboard.writeText(text).then(() => done && done(), () => {});
  } catch (e) { /* the key stays selectable */ }
};

/* A centered step. Steps of the first setup show progress dashes; single screens opened from
   the home show a way back instead. */
const EStep = ({icon, iconOk, title, lead, dots, onBack, backLabel, children}) => {
  const inFlow = !!(onBack && backLabel);
  const titleRef = useRef(null);
  /* A new step starts at the top of the page: the settings panel scrolls inside its own container,
     so scroll that, then move focus to the title without letting the browser scroll it again. */
  useEffect(() => {
    const title = titleRef.current;
    if (!title) { return; }
    const scroller = title.closest(".content");
    if (scroller) { scroller.scrollTop = 0; }
    if (typeof window !== "undefined") { window.scrollTo(0, 0); }
    try { title.focus({preventScroll: true}); } catch (e) { title.focus(); }
  }, []);
  return (
    <div className="devE-wrap">
      {onBack && !inFlow ?
        /* Back to the table, named for the table's heading: the page heading above already says
           "Developer Settings". */
        <button type="button" className="devE-back" onClick={onBack}>
          <img src="/static/icons/arrow-left.svg" alt="" aria-hidden="true" />{backLabel || tE("Projects and API keys", "פרויקטים ומפתחות API")}
        </button> : null}
      <section className="devE-card" aria-labelledby="devEStepTitle">
        <div className="devE-head">
          {inFlow ?
            /* the sign-in card's back arrow (AuthCard), in the same place: top-left of the step */
            <button type="button" className="devE-stepBack" onClick={onBack} aria-label={vE("Back", "חזרה")}>
              <span className="devE-arrow" aria-hidden="true" />
            </button> : null}
          {icon && !dots ? <span className={"devE-ico" + (iconOk ? " ok" : "")} aria-hidden="true">{icon}</span> : null}
          {/* Two or three steps is too few for a stepper: the step's number, in the same circle the
              welcome screen's list uses, sits beside the title. */}
          <h2 className="devE-title" id="devEStepTitle" tabIndex={-1} ref={titleRef}>
            {dots ? <span className="devE-n devE-stepN">
              <span aria-hidden="true">{dots.at + 1}</span>
              <span className="sr-only"><InterfaceText text={{en: "Step " + (dots.at + 1) + " of " + dots.of + ": ", he: "שלב " + (dots.at + 1) + " מתוך " + dots.of + ": "}} /></span>
            </span> : null}
            {title}
          </h2>
          {lead}
        </div>
        {children}
      </section>
    </div>
  );
};

/* Required fields carry no mark; optional ones say so, quietly. */
const EOpt = <span className="devE-opt">{tE("Optional", "לא חובה")}</span>;
/* Website (D54, 2026-10-26): still optional, but recommended because it lets keys be limited to the site. */
const ERec = <span className="devE-recBadge">{tE("Recommended", "מומלץ")}</span>;
const ESecRec = <span className="devE-recBadge">{tE("Security recommendation", "המלצת אבטחה")}</span>;

/* A note to read before acting: Lucide info icon, quiet panel. */
const ENote = ({children}) => (
  <p className="devE-note">
    <span className="devE-noteIcon" aria-hidden="true"><InfoIcon /></span>
    <span>{children}</span>
  </p>
);

/* The step's main button. */
const EPrimary = ({children, type = "submit", ...rest}) => (
  <button type={type} className="sefaria-common-button auth-primary fullwidth" {...rest}>{children}</button>
);

/* The way in: what this is for, and one button that starts the steps. */
/* withConfirm: an email sign-in still has to confirm the address, which comes first. */
const EEntry = ({onStart, withConfirm, share}) => {
  const [shareNote, setShareNote] = useState(!!share);
  const items = [
    ...(withConfirm ? [tE("Confirm your email", "אשרו את כתובת הדוא״ל")] : []),
    tE("Tell us about yourself", "ספרו לנו על עצמכם"),
    tE("Share your project details", "שתפו את פרטי הפרויקט"),
    tE("Create your API key", "צרו את מפתח ה־API שלכם"),
  ];
  return (
  <React.Fragment>
  {/* Arriving from the Powered by link (share) without a developer profile: a window over the welcome screen says
      why setup comes first. The page itself is unchanged. */}
  {shareNote ? <EShareFirstDialog onClose={() => setShareNote(false)} /> : null}
  <EStep title={tE("Get a free API key", "קבלו מפתח API בחינם")}
    lead={<p className="devE-lead">{tE("Use Sefaria's texts in your website, app or tool.", "השתמשו בטקסטים של ספריא באתר, באפליקציה או בכלי שלכם.")}</p>}>
    <div className="devE-form">
      <ol className="devE-path">
        {items.map((item, i) => <li key={i}><span className="devE-n" aria-hidden="true">{i + 1}</span>{item}</li>)}
      </ol>
      <button type="button" className="sefaria-common-button auth-primary fullwidth" data-agent-action="get-started" onClick={onStart}>
        {tE("Get started", "בואו נתחיל")}
      </button>
      <p className="devE-links">
        <a href={API_DOCS_URL} target="_blank" rel="noreferrer">{tE("Technical documentation", "תיעוד טכני")}<ExternalIcon /></a>
        <a href={LIBRARY_EXPORT_URL} target="_blank" rel="noopener noreferrer">{tE("Download the library", "הורדת הספרייה")}<ExternalIcon /></a>
      </p>
    </div>
  </EStep>
  </React.Fragment>
  );
};

const EShareFirstDialog = ({onClose}) => {
  const okRef = useRef(null);
  useDialogKeys(okRef, onClose);
  return (
    <div className="devPocModalStage devE-deleteStage" role="dialog" aria-modal="true" aria-labelledby="devEShareFirstTitle" aria-describedby="devEShareFirstText"
      onClick={e => { if (e.target === e.currentTarget) { onClose(); } }}>
      <section className="devE-deleteModal">
        <h3 id="devEShareFirstTitle">{tE("Looking to share your project with Sefaria?", "רוצים לשתף את הפרויקט עם ספריא?")}</h3>
        <p id="devEShareFirstText">{tE("First, set up your developer profile and create your project. Then you can share it with Sefaria. You don't need an API key.",
          "קודם הגדירו את פרופיל המפתחים שלכם וצרו את הפרויקט. אחר כך תוכלו לשתף אותו עם ספריא. אין צורך במפתח API.")}</p>
        <div className="devE-deleteActions">
          <button type="button" className="devE-deleteBtn devE-deleteBtnPrimary" ref={okRef} onClick={onClose}>{tE("Got it", "הבנתי")}</button>
        </div>
      </section>
    </div>
  );
};

/* Step 1: the profile on one screen. The terms are accepted by continuing. */
/* The setup's first step, and the same form again from "Edit profile" (edit: a way back, Save,
   no terms line since they were accepted at setup). */
const EWelcome = ({dots, onSave, initial, onCancel, edit}) => {
  const name = accountName();
  const email = accountEmail();
  const [fields, setFields] = useState({...emptyProfile(), ...(initial || {}),
    role: initial ? (initial.notADeveloper ? "ai" : "developer") : ""});
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (key, value) => {
    setFields(f => ({...f, [key]: value}));
    if (errors[key]) { setErrors(e => ({...e, [key]: null})); }
  };
  const emailError = (v) => v.trim() && !EMAIL_PATTERN.test(v.trim()) ? "auth.invalid_email" : null;
  const nameError = () => !name && !fields.developerName.trim() ? "auth.required_field" : null;
  const roleError = (v = fields.role) => v ? null : "auth.required_field";
  const submit = (e) => {
    e.preventDefault();
    const next = {additionalEmail: emailError(fields.additionalEmail), developerName: nameError(), role: roleError()};
    setErrors(next);
    if (next.developerName || next.role || next.additionalEmail) {
      const el = document.getElementById(next.developerName ? "devEName" : next.role ? "devERole" : "devEEmail2");
      if (el) { el.focus(); }
      return;
    }
    setBanner(null);
    setSaving(true);
    Promise.resolve(onSave(cleanProfile({
      ...fields,
      termsAccepted: true,
      notADeveloper: fields.role === "ai" || fields.role === "none",
    }))).catch(err => { setBanner(saveFailure(err)); setSaving(false); });
  };
  return (
    <EStep
      dots={dots}
      onBack={edit ? onCancel : null}
      title={tE("About you", "קצת עליך")}
      lead={<React.Fragment>
        {email ?
          <p className="devE-signed">
            {tE("Signed in as", "מחובר/ת בתור")} {name ? <strong dir="auto">{name}</strong> : null} <bdi dir="ltr">({email})</bdi>
          </p> : null}
      </React.Fragment>}
    >
      <form className="devE-form" onSubmit={submit} noValidate>
        <ErrorBanner error={banner} />
        {name ? null :
          <Input id="devEName" required label={tE("Name", "שם")} dir="auto" value={fields.developerName}
            onChange={e => set("developerName", e.target.value)} error={errors.developerName}
            onBlur={() => setErrors(x => ({...x, developerName: nameError()}))} />}
        <Select id="devERole" value={fields.role} onChange={v => set("role", v)} error={errors.role}
          label={tE("What best describes you?", "מה מתאר אותך הכי טוב?")}
          placeholder={{en: "Choose one", he: "בחרו אחת"}}
          options={E_ROLES.map(r => ({value: r.value, label: {en: r.en, he: r.he}}))} />
        <Input id="devEAbout" multiline rows={2} dir="auto" maxLength={E_ABOUT_MAX}
          label={tE("Tell us about yourself", "ספרו לנו על עצמכם")} labelAddon={EOpt}
          placeholder={vE("Where you work or study, what you like to build", "איפה אתם עובדים או לומדים, מה אתם אוהבים לבנות")}
          aria-describedby="devEAboutCount"
          value={fields.description} onChange={e => set("description", e.target.value)}
          fieldAddon={<span id="devEAboutCount" dir="ltr">{fields.description.length}/{E_ABOUT_MAX}</span>} />
        <Input id="devEEmail2" type="email" inputDir="ltr"
          label={tE("Additional email address", "כתובת דוא״ל נוספת")}
          labelAddon={<React.Fragment>{EOpt}<InfoTip fieldId="devEEmail2" icon="help" above>
            {tE("Emails will be sent to your Sefaria account's email address. You can add another email here to get those emails in that inbox as well.",
              "ההודעות יישלחו לכתובת הדוא״ל של חשבון ספריא שלך. אפשר להוסיף כאן כתובת נוספת כדי לקבל אותן גם בתיבה הזו.")}
          </InfoTip></React.Fragment>}
          aria-describedby={tipId("devEEmail2")}
          placeholder="name@example.com" value={fields.additionalEmail}
          onChange={e => set("additionalEmail", e.target.value)} error={errors.additionalEmail}
          onBlur={() => setErrors(x => ({...x, additionalEmail: emailError(fields.additionalEmail)}))} />
        {/* The two ways to join the developer community side by side (Penina, 2026-11-05): the newsletter and the
            Discord, which is a plain link rather than a checkbox (Sarah, D83). */}
        <section className="devE-note devE-community" aria-labelledby="devECommunityTitle">
          <h3 className="devE-communityTitle" id="devECommunityTitle">{tE("Join the developer community", "הצטרפו לקהילת המפתחים")}</h3>
          <Checkbox id="devENews" checked={!!fields.developerNews} onChange={e => set("developerNews", e.target.checked)}
            label={tE("I would like to receive Sefaria's developer newsletter to hear about new features, events and opportunities.",
              "אשמח לקבל את הניוזלטר למפתחים של ספריא כדי לשמוע על תכונות חדשות, אירועים והזדמנויות.")} />
          {/* A second, separate option. It's a place to go, not a setting, so it gets a link instead of a
              checkbox: an inline link, and no icon in the checkbox's column (Penina, 2026-11-05). */}
          <p className="devE-communityLink"><InterfaceText text={{
            en: <React.Fragment><a className="devE-inlineLink devE-communityJoin" href={E_DISCORD_URL} target="_blank" rel="noopener noreferrer">Join our Discord</a> to talk with other developers building on Sefaria.</React.Fragment>,
            he: <React.Fragment><a className="devE-inlineLink devE-communityJoin" href={E_DISCORD_URL} target="_blank" rel="noopener noreferrer">הצטרפו לדיסקורד שלנו</a> כדי לשוחח עם מפתחים אחרים שבונים עם ספריא.</React.Fragment>,
          }} /></p>
        </section>
        <div className="devE-footer">
          {onCancel ? <button type="button" className="devE-backBtn" onClick={onCancel}>{tE("Cancel", "ביטול")}</button> : null}
          <EPrimary data-agent-action="save-profile" disabled={saving}>{edit ? tE("Save", "שמירה") : tE("Continue", "המשך")}</EPrimary>
        </div>
        {edit ? null : <p className="devE-legal">
          <InterfaceText text={{
            en: <React.Fragment>By continuing, you accept the <TermsLink />, and agree that Sefaria may email you about your keys and projects.</React.Fragment>,
            he: <React.Fragment>בלחיצה על המשך, את/ה מאשר/ת את <TermsLink />, ומסכים/ה שספריא תשלח לך הודעות על המפתחות והפרויקטים שלך.</React.Fragment>,
          }} />
        </p>}
      </form>
    </EStep>
  );
};

/* A website as the domain it's matched on (Daniel, #api-keys-squad, 2026-11-02): no scheme, path, port or leading
   "www.". https://www.example.com/app becomes example.com. Anything that isn't a web address is left as typed, so
   its error still shows. Cleaned on blur, so typing isn't interrupted. */
const toDomain = (raw) => {
  const text = (raw || "").trim();
  if (!text || /\s/.test(text)) { return raw || ""; }
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : "https://" + text).hostname.toLowerCase();
    return host.includes(".") ? host.replace(/^www\./, "") : raw;
  } catch (e) { return raw; }
};
const E_DOMAIN_HINT = {en: "Includes www and any subdomain, like app.example.com.", he: "כולל www וכל תת־דומיין, למשל app.example.com."};
/* Security recommendation (PBS check-in, 2026-11-02): the badge says why the website matters, the hint explains it. */
/* "Learn more" points at the API docs until a Help Center article on website restriction exists (D64). */
const E_SITE_LEARN_MORE_URL = API_DOCS_URL;
const E_SITE_SECURITY_HINT = {
  en: <React.Fragment>Adding your website lets you limit a key to this site and its subdomains, so that no one else can use it.{" "}<a className="devE-inlineLink" href={E_SITE_LEARN_MORE_URL} target="_blank" rel="noopener noreferrer">Learn more</a></React.Fragment>,
  he: <React.Fragment>הוספת האתר מאפשרת להגביל מפתח לאתר הזה ולתתי־הדומיינים שלו, כך שאף אחד אחר לא יוכל להשתמש בו.{" "}<a className="devE-inlineLink" href={E_SITE_LEARN_MORE_URL} target="_blank" rel="noopener noreferrer">מידע נוסף</a></React.Fragment>,
};

/* "What are you building?" (PBS form check-in, 2026-11-02): a quick choice, so someone who is only trying the API
   has an honest answer, and the data is cleaner than free text. */
const E_PURPOSES = [
  {value: "exploring", en: "Just exploring the API", he: "רק בודק/ת את ה־API"},
  {value: "personal", en: "A personal project", he: "פרויקט אישי"},
  {value: "academic", en: "An academic or school project", he: "פרויקט אקדמי או לימודי"},
  {value: "research", en: "Research", he: "מחקר"},
  {value: "other", en: "Something else", he: "משהו אחר"},
];
/* Project fields shared by the setup step and the single screens. No public/private choice:
   featuring on Powered by Sefaria is a separate, optional step. */
const EProjectFields = ({fields, set, errors, check, showcase}) => (
  <React.Fragment>
    <Input id="devEProjName" required dir="auto" label={tE("Project name", "שם הפרויקט")}
      placeholder={vE("e.g. Shabbat Table Questions", "למשל: שאלות לשולחן השבת")}
      value={fields.name} onChange={e => set("name", e.target.value)} error={errors.name} onBlur={() => check("name")} />
    <Input id="devEProjOrg" dir="auto" label={tE("Organization", "ארגון")} labelAddon={EOpt}
      placeholder={vE("e.g. your company or organization", "למשל: החברה או הארגון שלכם")}
      value={fields.organization} onChange={e => set("organization", e.target.value)} error={errors.organization} />
    <Select id="devEProjPurpose" value={fields.purpose} onChange={v => set("purpose", v)} error={errors.purpose}
      label={tE("What are you building?", "מה אתם בונים?")}
      placeholder={{en: "Choose one", he: "בחרו אחת"}}
      options={E_PURPOSES.map(o => ({value: o.value, label: {en: o.en, he: o.he}}))} />
    <Input id="devEProjDesc" required multiline rows={3} dir="auto" maxLength={MAX_DESCRIPTION_LENGTH}
      label={tE("Short description", "תיאור קצר")}
      placeholder={vE("e.g. A site that turns each week's parashah into three discussion questions for the Shabbat table, with a printable version.", "למשל: אתר שהופך את פרשת השבוע לשלוש שאלות לדיון סביב שולחן השבת, עם גרסה להדפסה.")}
      value={fields.description} onChange={e => set("description", e.target.value)} error={errors.description}
      onBlur={() => check("description")} aria-describedby="devEProjDescCount"
      fieldAddon={<span id="devEProjDescCount" dir="ltr">{fields.description.length}/{MAX_DESCRIPTION_LENGTH}</span>} />
    <Input id="devEProjSite" inputDir="ltr" required={showcase} label={tE("Website", "אתר")}
      labelAddon={showcase ? null : ESecRec}
      placeholder="example.com" hint={<InterfaceText text={showcase ? E_DOMAIN_HINT : E_SITE_SECURITY_HINT} />}
      value={fields.websiteUrl} onChange={e => set("websiteUrl", e.target.value)}
      error={errors.websiteUrl} onBlur={() => { set("websiteUrl", toDomain(fields.websiteUrl)); check("websiteUrl"); }} />
  </React.Fragment>
);

/* One message for a website that isn't a real address (no domain ending like .com), shown on blur under every
   website field (Penina, 2026-11-05). https:// and www. are cleaned up, not errors. */
const E_SITE_INVALID = <InterfaceText text={{en: "Invalid website", he: "כתובת אתר לא תקינה"}} />;
const eSiteError = (value, required) => !(value || "").trim() ? (required ? "auth.required_field" : null)
  : parseWebsite(value).valid ? null : E_SITE_INVALID;
const E_PROJECT_RULES = {
  name: f => requiredFieldValidate(f.name),
  /* Not saved by the server yet, so a project being edited has none: only a new project must choose one. */
  purpose: f => f.isNew ? requiredFieldValidate(f.purpose) : null,
  description: f => requiredFieldValidate(f.description),
  websiteUrl: f => eSiteError(f.websiteUrl, false),
};
const E_FIELD_IDS = {name: "devEProjName", purpose: "devEProjPurpose", description: "devEProjDesc", websiteUrl: "devEProjSite", label: "devEKeyName"};

const useEProjectForm = (initial, withKey, initialLabel) => {
  const [fields, setFields] = useState(() => {
    const start = {name: "", purpose: "", description: "", organization: "", websiteUrl: "", isNew: !initial.name, ...initial};
    return {...start, websiteUrl: toDomain(start.websiteUrl)};   // a saved https://www.example.com shows as example.com
  });
  const [label, setLabel] = useState(initialLabel || "");
  const [errors, setErrors] = useState({});
  const set = (key, value) => {
    setFields(f => ({...f, [key]: value}));
    if (errors[key]) { setErrors(e => ({...e, [key]: null})); }   // any change clears the error; blur checks again (2026-11-05)
  };
  const check = (key) => setErrors(e => ({...e, [key]: E_PROJECT_RULES[key](fields)}));
  const setKeyLabel = (value) => {
    setLabel(value);
    if (errors.label && value.trim()) { setErrors(e => ({...e, label: null})); }
  };
  const validate = (needKey) => {
    const all = {};
    Object.keys(E_PROJECT_RULES).forEach(k => { all[k] = E_PROJECT_RULES[k](fields); });
    if (needKey) { all.label = requiredFieldValidate(label); }
    setErrors(all);
    const first = Object.keys(all).find(k => all[k]);
    if (first) { const el = document.getElementById(E_FIELD_IDS[first]); if (el) { el.focus(); } return false; }
    return true;
  };
  const projectBody = (extra) => ({
    organization: "", aiAssisted: false, visibility: "private", ...extra,
    name: fields.name.trim(), purpose: fields.purpose, description: fields.description.trim(), organization: fields.organization.trim(),
    websiteUrl: parseWebsite(fields.websiteUrl).url,
  });
  return {fields, set, check, errors, label, setKeyLabel, validate, projectBody};
};

const EKeyNameField = ({label, setLabel, error, hint, placeholder}) => (
  <Input id="devEKeyName" required dir="auto" label={tE("API key name", "שם המפתח")}
    hint={hint || null} placeholder={placeholder}
    value={label} onChange={e => setLabel(e.target.value)} error={error} />
);

/* Step 2, and the "Get your API key" and "New project" screens: the project and its key together. */
const EProjectKey = ({dots, mode, onBack, backLabel, onLater, onCreate, onProjectOnly}) => {
  const form = useEProjectForm({}, true);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (busy || !form.validate(true)) { return; }
    setBusy(true); setBanner(null);
    Promise.resolve(onCreate(form.projectBody(), form.label.trim()))
      .catch(err => { setBanner(saveFailure(err)); setBusy(false); });
  };
  const projectOnly = () => {
    if (busy || !form.validate(false)) { return; }
    setBusy(true); setBanner(null);
    Promise.resolve(onProjectOnly(form.projectBody())).catch(err => { setBanner(saveFailure(err)); setBusy(false); });
  };
  return (
    <EStep dots={dots} onBack={onBack} backLabel={backLabel} icon="</>"
      title={mode === "newproj" ? tE("New project", "פרויקט חדש") : tE("Get your API key", "קבלו מפתח API")}
      lead={mode === "setup" ? null : <p className="devE-lead">{mode === "newproj"
        ? tE("Each project gets its own API keys.", "לכל פרויקט מפתחות API משלו.")
        : tE("Tell us what you're building, and we'll create your key.", "ספרו לנו מה אתם בונים, וניצור לכם מפתח.")}</p>}
    >
      <form className="devE-form" onSubmit={submit} noValidate>
        <ErrorBanner error={banner} />
        <EProjectFields fields={form.fields} set={form.set} errors={form.errors} check={form.check} />
        <EKeyNameField label={form.label} setLabel={form.setKeyLabel} error={form.errors.label} placeholder={vE("My key", "המפתח שלי")} />
        <ENote>{tE("Projects created in this account can't be moved to another account.",
          "אי אפשר להעביר פרויקטים שנוצרו בחשבון הזה לחשבון אחר.")}</ENote>
        <EPrimary data-agent-action="create-key" disabled={busy}>
          {mode === "newproj" ? tE("Create project and key", "יצירת פרויקט ומפתח") : tE("Create API key", "יצירת מפתח API")}
        </EPrimary>
        {onLater ? <button type="button" className="devE-textBtn" onClick={onLater}>{tE("I'll do this later", "אעשה את זה אחר כך")}</button> : null}
        {onProjectOnly ? <button type="button" className="devE-textBtn" onClick={projectOnly}>{tE("Create the project without a key", "יצירת הפרויקט בלי מפתח")}</button> : null}
      </form>
    </EStep>
  );
};

const ENewKey = ({project, onBack, onCreate}) => {
  const restrict = useKeyRestrict(project);
  const [label, setLabel] = useState("");   // empty, with the "My key" placeholder, first key or not (2026-11-05)
  const [error, setError] = useState(null);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const problem = requiredFieldValidate(label);
    setError(problem);
    if (problem) { document.getElementById("devEKeyName").focus(); return; }
    if (!restrict.check() || busy) { return; }
    setBusy(true); setBanner(null);
    Promise.resolve(onCreate(label.trim(), restrict.options())).catch(err => { setBanner(keyFailure(err)); setBusy(false); });
  };
  return (
    /* Same one-line heading as the setup key step; a long project name wraps (Penina, 2026-11-05). */
    <EStep onBack={onBack} title={<InterfaceText text={{
        en: <React.Fragment>Create an API key for <bdi dir="auto">{project.name}</bdi></React.Fragment>,
        he: <React.Fragment>צרו מפתח API עבור <bdi dir="auto">{project.name}</bdi></React.Fragment>,
      }} />}>
      <form className="devE-form" onSubmit={submit} noValidate>
        <ErrorBanner error={banner} />
        <EKeyNameField label={label} setLabel={v => { setLabel(v); if (error && v.trim()) { setError(null); } }} error={error}
          placeholder={vE("My key", "המפתח שלי")} />
        {restrict.field}
        <EPrimary data-agent-action="create-key" disabled={busy}>{tE("Create API key", "יצירת מפתח API")}</EPrimary>
      </form>
    </EStep>
  );
};

/* Setup, option C (2026-11-01): the project and its first key are two steps, so a project can be saved without a key.
   Step "Your project" creates the project; step "Your API key" names the key and can be skipped (D51). */
const ESetupProject = ({dots, title, onBack, backLabel, onSkip, skipLabel, onCreate}) => {
  const form = useEProjectForm({});
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (busy || !form.validate(false)) { return; }
    setBusy(true); setBanner(null);
    Promise.resolve(onCreate(form.projectBody())).catch(err => { setBanner(saveFailure(err)); setBusy(false); });
  };
  return (
    <EStep dots={dots} onBack={onBack} backLabel={backLabel} title={title || tE("Your project", "הפרויקט שלך")}>
      <form className="devE-form" onSubmit={submit} noValidate>
        <ErrorBanner error={banner} />
        <EProjectFields fields={form.fields} set={form.set} errors={form.errors} check={form.check} />
        <ENote>{tE("Projects created in this account can't be moved to another account.",
          "אי אפשר להעביר פרויקטים שנוצרו בחשבון הזה לחשבון אחר.")}</ENote>
        <div className="devE-footer">
          <button type="button" className="devE-backBtn" onClick={onSkip}>{skipLabel || tE("Skip for now", "דילוג בינתיים")}</button>
          <EPrimary data-agent-action="save-project" disabled={busy}>{tE("Continue", "המשך")}</EPrimary>
        </div>
      </form>
    </EStep>
  );
};

/* "Limit to website" while creating a key (2026-11-01): the moment people pay most attention. Off by default, since
   a key used from a server or an AI tool must stay unlimited. Without a website on the project, turning it on asks
   for one right here; it's saved to the project. The switch stays on the key's row afterwards, to change either way. */
const EKeyRestrictField = ({project, on, setOn, site, setSite, siteError, setSiteError}) => {
  const host = websiteHost(project.websiteUrl);
  return (
    <div className="devE-restrict">
      <div className="devE-restrictRow">
        <span className="devE-restrictLabel" id="devEKeyRestrict-label">
          {host ? <InterfaceText text={{en: <React.Fragment>Limit this key to <bdi dir="ltr">{host}</bdi></React.Fragment>,
            he: <React.Fragment>הגבלת המפתח ל־<bdi dir="ltr">{host}</bdi></React.Fragment>}} />
            : tE("Limit this key to your website", "הגבלת המפתח לאתר שלכם")}
        </span>
        <ToggleSwitch name="devEKeyRestrict" isChecked={on} onChange={e => setOn(e.target.checked)} />
      </div>
      <ERestrictHint id="devEKeyRestrict-hint" />
      {on && !host ?
        <Input id="devEKeySite" inputDir="ltr" label={tE("Your website", "האתר שלכם")} placeholder="example.com"
          hint={<InterfaceText text={{en: E_DOMAIN_HINT.en + " We'll add it to the project's details.", he: E_DOMAIN_HINT.he + " נוסיף אותו לפרטי הפרויקט."}} />}
          value={site} onChange={e => setSite(e.target.value)} onBlur={() => { setSite(toDomain(site)); if (site.trim()) { setSiteError(eSiteError(site, true)); } }} error={siteError} /> : null}
    </div>
  );
};

/* When to limit a key, in three lines with on and off in bold (Penina, 2026-11-05). Used in the key forms and in
   the window that asks for a website from the key table. */
const ERestrictHint = ({id}) => (
  <div className="devE-hint devE-restrictHint" id={id}>
    <InterfaceText text={{
      en: <React.Fragment>
        <span>Turn this <strong>on</strong> if your key is going in your web page's code.</span>
        <span>Leave it switched <strong>off</strong> if your key is going in a server or an AI tool.</span>
        <span>You can change this setting at any time from the Developer Settings dashboard.</span>
      </React.Fragment>,
      he: <React.Fragment>
        <span><strong>הפעילו</strong> אם המפתח שלכם נכנס לקוד של דף האינטרנט שלכם.</span>
        <span>השאירו <strong>כבוי</strong> אם המפתח נכנס לשרת או לכלי AI.</span>
        <span>אפשר לשנות את ההגדרה הזו בכל עת מלוח הבקרה של הגדרות המפתחים.</span>
      </React.Fragment>,
    }} />
  </div>
);

/* The restriction state for a key form, and its check before submit. */
const useKeyRestrict = (project) => {
  const [on, setOn] = useState(false);
  const [site, setSite] = useState("");
  const [siteError, setSiteError] = useState(null);
  const check = () => {
    if (!on || websiteHost(project.websiteUrl)) { setSiteError(null); return true; }
    const problem = eSiteError(site, true);
    setSiteError(problem);
    if (problem) { document.getElementById("devEKeySite").focus(); }
    return !problem;
  };
  const options = () => ({restrict: on, websiteUrl: on && !websiteHost(project.websiteUrl) ? parseWebsite(site).url : ""});
  return {field: <EKeyRestrictField project={project} on={on} setOn={setOn} site={site}
    setSite={v => { setSite(v); if (siteError) { setSiteError(null); } }} siteError={siteError} setSiteError={setSiteError} />, check, options};
};

const ESetupKey = ({dots, project, onBack, backLabel, onSkip, onCreate}) => {
  const restrict = useKeyRestrict(project);
  const [label, setLabel] = useState("");
  const [error, setError] = useState(null);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const problem = requiredFieldValidate(label);
    setError(problem);
    if (problem) { document.getElementById("devEKeyName").focus(); return; }
    if (!restrict.check() || busy) { return; }
    setBusy(true); setBanner(null);
    Promise.resolve(onCreate(label.trim(), restrict.options())).catch(err => { setBanner(keyFailure(err)); setBusy(false); });
  };
  return (
    <EStep dots={dots} onBack={onBack} backLabel={backLabel} title={<InterfaceText text={{
        en: <React.Fragment>Create an API key for <bdi dir="auto">{project.name}</bdi></React.Fragment>,
        he: <React.Fragment>צרו מפתח API עבור <bdi dir="auto">{project.name}</bdi></React.Fragment>,
      }} />}>
      <form className="devE-form" onSubmit={submit} noValidate>
        <ErrorBanner error={banner} />
        <EKeyNameField label={label} setLabel={v => { setLabel(v); if (error && v.trim()) { setError(null); } }} error={error}
          placeholder={vE("My key", "המפתח שלי")} />
        {restrict.field}
        <div className="devE-footer">
          <button type="button" className="devE-backBtn" onClick={onSkip}>{tE("Skip for now", "דילוג בינתיים")}</button>
          <EPrimary data-agent-action="create-key" disabled={busy}>{tE("Create API key", "יצירת מפתח API")}</EPrimary>
        </div>
      </form>
    </EStep>
  );
};

/* The spinner is the sign-in flow's (LoadingSub: navy ring, 0.8s), drawn larger for a whole step. */
const EWaiting = ({dots}) => (
  <EStep dots={dots} title={<span role="status">{tE("Creating your key…", "יוצרים את המפתח…")}</span>}
    lead={<React.Fragment>
      <p className="devE-lead">{tE("This takes a few seconds.", "זה לוקח כמה שניות.")}</p>
      <span className="devE-spinner devE-spinnerBelow" aria-hidden="true" />
    </React.Fragment>} />
);

const EReveal = ({dots, apiKey, projectName, onContinue, continueLabel, onBack}) => {
  const [copied, setCopied] = useState("");
  const value = apiKey ? apiKey.value : "";
  return (
    <EStep dots={dots} icon="</>" onBack={onBack} backLabel={tE("Back", "חזרה")} title={tE("Your API key is ready", "מפתח ה־API שלך מוכן")}
      lead={<p className="devE-lead">{tE("It works now. You can always see it again in Developer Settings.", "הוא עובד עכשיו. תמיד אפשר לראות אותו שוב בהגדרות המפתחים.")}</p>}>
      <div className="devE-form">
        <div className="sefaria-input">
          <div className="sefaria-input-labelRow"><label className="sefaria-input-label" htmlFor="devEKeyOut" dir="auto">{apiKey ? apiKey.label : ""}</label></div>
          <div className="devE-keyRow">
            <input id="devEKeyOut" className="sefaria-input-control devE-mono" readOnly value={value} dir="ltr" onFocus={e => e.target.select()} />
            <button type="button" className="devE-keyCopy" aria-label={vE("Copy key", "העתקת המפתח")}
              onClick={() => eCopy(value, () => { setCopied("key"); setTimeout(() => setCopied(c => c === "key" ? "" : c), 2000); })}>
              <ECopyIcon size={18} />
            </button>
            <span className="devE-keyCopied" aria-live="polite">{copied === "key" ? tE("Copied", "הועתק") : null}</span>
          </div>
        </div>
        <div className="devE-try">
          <p className="devE-hint">{tE("Paste this into ChatGPT, Claude, Cursor or whatever you build with.", "הדביקו את זה ב־ChatGPT, ‏Claude, ‏Cursor או בכל כלי שאתם בונים איתו.")}</p>
          <pre className="devE-code" dir="ltr"><code>{eSnippet(value, projectName)}</code></pre>
          <button type="button" className="devE-textBtn devE-start" onClick={() => eCopy(eSnippet(value, projectName), () => setCopied("code"))}>
            {copied === "code" ? tE("Copied", "הועתק") : tE("Copy instructions", "העתקת ההוראות")}
          </button>
        </div>
        <EPrimary type="button" onClick={onContinue}>{continueLabel}</EPrimary>
      </div>
    </EStep>
  );
};

const EFeature = ({dots, project, onFeature, onLater, onBack}) => (
  <EStep dots={dots} icon="</>" onBack={onBack} backLabel={tE("Back", "חזרה")}
    title={<InterfaceText text={{en: "Want people to find " + project.name + "?", he: "רוצים שאנשים ימצאו את " + project.name + "?"}} />}
    lead={<p className="devE-lead">{tE("Feature it on Powered by Sefaria, our gallery of projects built with Sefaria. You can do this any time from your project.",
      "הציגו אותו ב־Powered by Sefaria, הגלריה של פרויקטים שנבנו עם ספריא. אפשר לעשות את זה בכל עת מהפרויקט.")}</p>}>
    <div className="devE-form">
      <EPrimary type="button" onClick={onFeature}>{tE("Feature my project", "הציגו את הפרויקט שלי")}</EPrimary>
      <button type="button" className="devE-textBtn" onClick={onLater}>{tE("Not now", "לא עכשיו")}</button>
    </div>
  </EStep>
);

/* Removing a project's website turns off "Limit to website" on its keys (product spec, 2026-09-16), so say so before
   saving. Keeping the website is the main action, since removing it can open those keys to any site. */
const ERemoveSiteDialog = ({host, keys, onKeep, onSave}) => {
  const keepRef = useRef(null);
  useDialogKeys(keepRef, onKeep);
  return (
    <div className="devPocModalStage devE-deleteStage" role="alertdialog" aria-modal="true" aria-labelledby="devERmSiteTitle" aria-describedby="devERmSiteText"
      onClick={e => { if (e.target === e.currentTarget) { onKeep(); } }}>
      <section className="devE-deleteModal">
        <h3 id="devERmSiteTitle">{tE("Remove the website?", "להסיר את האתר?")}</h3>
        <div id="devERmSiteText">
          <p><InterfaceText text={{
            en: <React.Fragment>{keys.length === 1 ? "This key is" : "These keys are"} limited to <bdi dir="ltr">{host}</bdi>. Without a website, the limit turns off and {keys.length === 1 ? "it works" : "they work"} from any site:</React.Fragment>,
            he: <React.Fragment>{keys.length === 1 ? "המפתח הזה מוגבל" : "המפתחות האלה מוגבלים"} ל־<bdi dir="ltr">{host}</bdi>. בלי אתר, ההגבלה תכובה {keys.length === 1 ? "והוא יעבוד" : "והם יעבדו"} מכל אתר:</React.Fragment>,
          }} /></p>
          <ul className="devE-dialogList">{keys.map(k => <li key={k.id} dir="auto"><strong>{k.label}</strong></li>)}</ul>
        </div>
        <div className="devE-deleteActions">
          <button type="button" className="devE-deleteBtn devE-deleteBtnPrimary" ref={keepRef} onClick={onKeep}>{tE("Keep the website", "השארת האתר")}</button>
          <button type="button" className="devE-deleteBtn" onClick={onSave}>{tE("Save details", "שמירת הפרטים")}</button>
        </div>
      </section>
    </div>
  );
};

/* Deleting a project (2026-11-01): a window like the delete-key one, naming the keys that will stop working, each on
   its own line. Focus starts on Cancel. */
const EDeleteProjectDialog = ({project, onDelete, onCancel}) => {
  const cancelRef = useRef(null);
  useDialogKeys(cancelRef, onCancel);
  const keys = project.keys;
  return (
    <div className="devPocModalStage devE-deleteStage" role="alertdialog" aria-modal="true" aria-labelledby="devEDelProjTitle" aria-describedby="devEDelProjText"
      onClick={e => { if (e.target === e.currentTarget) { onCancel(); } }}>
      <section className="devE-deleteModal">
        <h3 id="devEDelProjTitle"><InterfaceText text={{en: <React.Fragment>Delete the project <bdi dir="auto">{project.name}</bdi>?</React.Fragment>,
          he: <React.Fragment>למחוק את הפרויקט <bdi dir="auto">{project.name}</bdi>?</React.Fragment>}} /></h3>
        <div id="devEDelProjText">
          {keys.length ?
            <React.Fragment>
              <p>{keys.length === 1 ? tE("This key stops working right away:", "המפתח הזה יפסיק לעבוד מיד:")
                : tE("These keys stop working right away:", "המפתחות האלה יפסיקו לעבוד מיד:")}</p>
              <ul className="devE-dialogList">{keys.map(k => <li key={k.id} dir="auto"><strong>{k.label}</strong></li>)}</ul>
            </React.Fragment> : null}
          <p>{tE("You can't undo this action.", "אי אפשר לבטל את הפעולה.")}</p>
        </div>
        <div className="devE-deleteActions">
          <button type="button" className="devE-deleteBtn devE-deleteBtnDanger" onClick={onDelete}>{tE("Delete project", "מחיקת הפרויקט")}</button>
          <button type="button" className="devE-deleteBtn" ref={cancelRef} onClick={onCancel}>{tE("Cancel", "ביטול")}</button>
        </div>
      </section>
    </div>
  );
};

const EEditProject = ({project, onBack, backLabel, onSave, onDelete, dots, inSetup, focusField}) => {
  /* Opened to add a website: the cursor starts in that field (after the step has focused its title). */
  useEffect(() => {
    const el = focusField && document.getElementById(focusField);
    if (el) { el.focus({preventScroll: false}); }
  }, []);
  const form = useEProjectForm({name: project.name || "", description: project.description || "", organization: project.organization || "", websiteUrl: project.websiteUrl || ""});
  const [banner, setBanner] = useState(null);
  const [asking, setAsking] = useState(false);
  const [siteWarn, setSiteWarn] = useState(null);   // the limited keys, while asking about removing the website
  const save = () => {
    setBanner(null);
    Promise.resolve(onSave(form.projectBody({aiAssisted: !!project.aiAssisted, visibility: project.visibility || "private"})))
      .catch(err => setBanner(saveFailure(err)));
  };
  const submit = (e) => {
    e.preventDefault();
    if (!form.validate(false)) { return; }
    const limited = project.websiteUrl && !form.fields.websiteUrl.trim() ? project.keys.filter(k => k.restrictToWebsite) : [];
    if (limited.length) { setSiteWarn(limited); return; }
    save();
  };
  const keepSite = () => {
    setSiteWarn(null);
    form.set("websiteUrl", project.websiteUrl);
    const el = document.getElementById("devEProjSite");
    if (el) { el.focus(); }
  };
  const keys = project.keys.length;
  return (
    <EStep onBack={onBack} backLabel={backLabel} dots={dots}
      title={inSetup ? tE("Your project", "הפרויקט שלך") : <InterfaceText text={{en: "Edit " + project.name, he: "עריכת " + project.name}} />}>
      {siteWarn ? <ERemoveSiteDialog host={websiteHost(project.websiteUrl)} keys={siteWarn} onKeep={keepSite}
        onSave={() => { setSiteWarn(null); save(); }} /> : null}
      <form className="devE-form" onSubmit={submit} noValidate>
        <ErrorBanner error={banner} />
        <EProjectFields fields={form.fields} set={form.set} errors={form.errors} check={form.check} />
        <EPrimary data-agent-action="save-project">{inSetup ? tE("Save and continue", "שמירה והמשך") : tE("Save project", "שמירת הפרויקט")}</EPrimary>
      </form>
      {onDelete ? <div className="devE-danger">
        <button type="button" className="devE-textBtn devE-red" aria-haspopup="dialog" onClick={() => setAsking(true)}>{tE("Delete this project", "מחיקת הפרויקט")}</button>
      </div> : null}
      {asking ? <EDeleteProjectDialog project={project} onCancel={() => setAsking(false)}
        onDelete={() => Promise.resolve(onDelete()).catch(err => { setAsking(false); setBanner(saveFailure(err)); })} /> : null}
    </EStep>
  );
};

/* Deleting a key: the AI chatbot's "Delete chat?" modal (LCChatbot.svelte .delete-modal),
   brought over as is: small card, title, one line, Delete in red beside Cancel. Focus starts on
   Cancel, the safe choice. */
const EDeleteKeyDialog = ({apiKey, onDelete, onCancel}) => {
  const cancelRef = useRef(null);
  useDialogKeys(cancelRef, onCancel);
  return (
    <div className="devPocModalStage devE-deleteStage" role="alertdialog" aria-modal="true" aria-labelledby="devEDelTitle" aria-describedby="devEDelText"
      onClick={e => { if (e.target === e.currentTarget) { onCancel(); } }}>
      <section className="devE-deleteModal">
        <h3 id="devEDelTitle" dir="auto">{tE("Delete " + apiKey.label + "?", "למחוק את " + apiKey.label + "?")}</h3>
        <p id="devEDelText">{tE("Anything using this key stops working right away. You can't undo this action.",
          "כל מה שמשתמש במפתח הזה יפסיק לעבוד מיד. אי אפשר לבטל את הפעולה.")}</p>
        <div className="devE-deleteActions">
          <button type="button" className="devE-deleteBtn devE-deleteBtnDanger" onClick={onDelete}>{tE("Delete", "מחיקה")}</button>
          <button type="button" className="devE-deleteBtn" ref={cancelRef} onClick={onCancel}>{tE("Cancel", "ביטול")}</button>
        </div>
      </section>
    </div>
  );
};

/* Turning on "Limit to website" before the project has one: say why, and go add it. Same small
   card as the delete modal. */
/* Turning on "Limit to website" from the key table when the project has no website: the same explanation as the key
   forms, and the website asked for right here, saved to the project, then the key limited (Penina, 2026-11-05). */
const ELimitKeyDialog = ({project, apiKey, run, onDone, onCancel}) => {
  /* Without a key it's the plain "Add your website" window, opened from the project row's Add website. */
  const formRef = useRef(null);   // traps Tab inside the window; focus starts in the website field
  const [site, setSite] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useDialogKeys(formRef, onCancel);
  const focusSite = () => { const el = document.getElementById("devELimitSite"); if (el) { el.focus(); } };
  useEffect(focusSite, []);
  const save = (e) => {
    e.preventDefault();
    if (busy) { return; }
    const parsed = parseWebsite(site);
    const problem = eSiteError(site, true);
    setError(problem);
    if (problem) { focusSite(); return; }
    setBusy(true);
    run(updateProject(project.id, {
      name: project.name, description: project.description, organization: project.organization || "",
      websiteUrl: parsed.url, aiAssisted: !!project.aiAssisted, visibility: project.visibility || "private",
    })).then(() => apiKey ? run(setKeyRestriction(apiKey.id, true)) : null).then(onDone, () => setBusy(false));
  };
  return (
    <div className="devPocModalStage devE-deleteStage" role="dialog" aria-modal="true" aria-labelledby="devELimitTitle"
      onClick={e => { if (e.target === e.currentTarget) { onCancel(); } }}>
      <form className="devE-deleteModal devE-limitModal" onSubmit={save} noValidate ref={formRef}>
        <h3 id="devELimitTitle">{apiKey ? tE("Limit this key to your website", "הגבלת המפתח לאתר שלכם") : tE("Add your website", "הוספת האתר שלכם")}</h3>
        {apiKey ? <ERestrictHint id="devELimitHint" /> : <p className="devE-hint">{<InterfaceText text={E_SITE_SECURITY_HINT} />}</p>}
        <Input id="devELimitSite" inputDir="ltr" label={tE("Your website", "האתר שלכם")} placeholder="example.com"
          hint={<InterfaceText text={apiKey ? {en: E_DOMAIN_HINT.en + " We'll add it to the project's details.", he: E_DOMAIN_HINT.he + " נוסיף אותו לפרטי הפרויקט."} : E_DOMAIN_HINT} />}
          value={site} onChange={e => { setSite(e.target.value); if (error) { setError(null); } }} onBlur={() => { setSite(toDomain(site)); if (site.trim()) { setError(eSiteError(site, true)); } }} error={error} />
        <div className="devE-deleteActions">
          <button type="submit" className="devE-deleteBtn devE-deleteBtnPrimary" disabled={busy || !site.trim()}>{apiKey ? tE("Limit key", "הגבלת המפתח") : tE("Save website", "שמירת האתר")}</button>
          <button type="button" className="devE-deleteBtn" onClick={onCancel}>{tE("Cancel", "ביטול")}</button>
        </div>
      </form>
    </div>
  );
};

/* A key's prompt for an AI coding tool, to copy. Same modal frame as the other developer
   dialogs (devPocModalStage); Escape and Close shut it. */
const EAiDialog = ({apiKey, projectName, onClose}) => {
  const copyRef = useRef(null);
  const [copied, setCopied] = useState(false);
  useDialogKeys(copyRef, onClose);
  const text = eSnippet(apiKey.value, projectName);
  return (
    <div className="devPocModalStage devPocConfirmStage" role="dialog" aria-modal="true" aria-labelledby="devEAiTitle"
      onClick={e => { if (e.target === e.currentTarget) { onClose(); } }}>
      <section className="devPocDialog devE-aiDialog">
        <h2 id="devEAiTitle" dir="auto">{tE("Use " + apiKey.label + " with your AI tool", "שימוש ב־" + apiKey.label + " בכלי ה־AI שלך")}</h2>
        <p>{tE("Paste this into ChatGPT, Claude, Cursor or whatever you build with. It includes your key, so keep it private.",
          "הדביקו את זה ב־ChatGPT, ‏Claude, ‏Cursor או בכל כלי שאתם בונים איתו. המפתח שלך כלול, אז שמרו את זה פרטי.")}</p>
        <pre className="devE-code" dir="ltr"><code>{text}</code></pre>
        <div className="devE-dialogActions">
          <button type="button" className="devE-pill devE-pillSec" onClick={onClose}>{tE("Close", "סגירה")}</button>
          <button type="button" className="devE-pill" ref={copyRef} onClick={() => eCopy(text, () => setCopied(true))}>
            <ECopyIcon />{copied ? tE("Copied", "הועתק") : tE("Copy prompt", "העתקת ההנחיה")}</button>
        </div>
      </section>
    </div>
  );
};

/* The home: a page header, then each project as a section with its keys in a plain table. */
/* Usage against the project's monthly limit (D56, 2026-10-26): a bar that goes green, then yellow from 70%, then red
   from 90%. The words carry the same state, so color is never the only signal. The window is 30 days, not a calendar
   month, so the copy names the reset date and never says "this month". DESIGN PREVIEW: the API doesn't return usage
   yet (Yotam: rate-limit Redis, real time), so projects without project.usage get sample numbers by row. */
const E_USAGE_SAMPLES = [0.36, 0.78, 0.96, 1];
const eUsageOf = (project, index) => {
  if (project.usage) { return project.usage; }
  const limit = 5000;
  const reset = new Date(Date.now() + (5 + index * 9) * 86400000);
  return {used: Math.round(limit * E_USAGE_SAMPLES[index % E_USAGE_SAMPLES.length]), limit, resetsAt: reset.toISOString()};
};
const EUsage = ({usage, projectName}) => {
  const pct = usage.limit ? Math.min(100, Math.round(usage.used / usage.limit * 100)) : 0;
  const level = pct >= 90 ? "high" : pct >= 70 ? "mid" : "low";
  const he = Sefaria.interfaceLang === "hebrew";
  const date = new Date(usage.resetsAt).toLocaleDateString(he ? "he-IL" : "en-US", {month: "short", day: "numeric"});
  const status = pct >= 100 ? tE("Limit reached. Calls fail until " + date + ".", "הגעתם למגבלה. קריאות ייכשלו עד " + date + ".")
    : level === "high" ? tE("Almost at the limit", "קרוב למגבלה") : null;
  return (
    <div className={"devE-usage is-" + level}>
      <div className="devE-usageTop">
        <span className="devE-usageLabel">{tE("Monthly limit", "מגבלה חודשית")}</span>
        <span className="devE-usagePct"><InterfaceText text={{en: pct + "% used", he: pct + "% בשימוש"}} /></span>
      </div>
      <div className="devE-usageBar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        aria-label={vE("Monthly limit used for " + projectName, "השימוש במגבלה החודשית של " + projectName)}
        aria-valuetext={vE(pct + "% used, resets " + date, pct + "% בשימוש, מתאפס ב־" + date)}>
        <span style={{width: pct + "%"}} />
      </div>
      <div className="devE-usageSub">
        {status ? <strong className="devE-usageStatus">{status} </strong> : null}
        <InterfaceText text={{en: "Resets " + date, he: "מתאפס ב־" + date}} />
      </div>
    </div>
  );
};

/* The key table's column heads, repeated over each project's keys. Fixed widths keep the columns lined up
   from one project to the next. */
const EKeyColumns = ({id}) => (
  <React.Fragment>
    <colgroup><col className="devE-cName" /><col className="devE-cKey" /><col className="devE-cDate" /><col className="devE-cLimit" /><col className="devE-cEnd" /></colgroup>
    <thead><tr>
      <th scope="col">{tE("Name", "שם")}</th><th scope="col">{tE("Key", "מפתח")}</th><th scope="col">{tE("Created", "נוצר")}</th>
      <th scope="col">
        <span className="devE-thTip">{tE("Limit to website", "הגבלה לאתר")}
          <InfoTip fieldId={"devEWebsiteOnly-" + id} icon="help" above wide>
            {tE("When it's on, the key only works for requests from your project's website. Turn it on for a key that sits in a web page's code.",
              "כשהאפשרות פועלת, המפתח עובד רק לבקשות מהאתר של הפרויקט. הפעילו אותה למפתח שנמצא בקוד של דף אינטרנט.")}
          </InfoTip></span>
      </th><th scope="col"><span className="sr-only">{tE("Actions", "פעולות")}</span></th>
    </tr></thead>
  </React.Fragment>
);

/* "Share your project with Sefaria" (2026-11-01): the Powered by form as its own page in developer settings (D43),
   opened from a project. Fields follow the field review sheet ("Combining the Powered by and API key forms", tabs
   "Fields" and "Final draft (2026-10-25)"), with its "Let's add" and "Let's remove" notes applied. Every field also in
   the developer-settings forms is the same field, prefilled from the project or profile and saved back (D40), and is
   required here even where it's optional there (Penina, 2026-11-01), except Organization, which stays optional. The account's name and email stay locked.
   Not repeated here, since they live on the profile: the additional email and the developer newsletter opt-in.
   Removed: how did you hear, years of experience (merged into the developer-status question), endpoint categories
   and specific endpoints, the public/private question (submitting is the request to be shown).
   DESIGN PREVIEW: the profile and project fields save; the Powered by-only answers (show my name, current role, built
   with AI, category, source code, tools, other technologies, inspiration, monthly users, anything else, the logo)
   aren't stored on this branch yet. */
const E_PB_CATEGORIES = [
  {en: "Learning & Study Tools", he: "כלי לימוד"},
  {en: "AI Projects, Apps, & Other Tools", he: "פרויקטי AI, אפליקציות וכלים אחרים"},
  {en: "Visualization & Data Analysis", he: "ויזואליזציה וניתוח נתונים"},
  {en: "Community, Interaction, & Social", he: "קהילה, אינטראקציה וחברה"},
  {en: "Extensions and API Integrations", he: "תוספים ושילובי API"},
  {en: "Other", he: "אחר"},
];
const E_PB_TOOLS = ["Sefaria API", "Sefaria MCP", "Sefaria-Export", "Sefaria-Project code", "Sefaria ai-chatbot code",
  "Sefaria Embedded code", "Sefaria ML models on HuggingFace", "Tutorials", "Documentation", "Sefaria Patot", "Other"];

const E_PB_USERS = [
  {v: "poc", en: "None, it's mostly a proof of concept", he: "אף אחד, זו בעיקר הוכחת היתכנות"},
  {v: "10", en: "About 10", he: "כ־10"}, {v: "100", en: "About 100", he: "כ־100"}, {v: "1000", en: "About 1,000", he: "כ־1,000"},
  {v: "other", en: "Other", he: "אחר"},
];

const EFieldError = ({id, error}) => error ?
  <div className="sefaria-input-error" id={id} role="alert">
    <img className="sefaria-input-errorIcon" src="/static/icons/info-error.svg" alt="" aria-hidden="true" />
    {typeof error === "string" ? <InterfaceText>{error}</InterfaceText> : error}
  </div> : null;

/* The Powered by form's intro, word for word from the current Formstack form (wiki: Powered by Sefaria Submission Form). */
/* Gallery of featured projects (PBS check-in, 2026-11-02). Points at today's Powered by page until the new gallery is live. */
/* A confirmation link works for 3 days (the server's EMAIL_CONFIRMATION_EXPIRE_DAYS). While one is out, setup waits on
   "Check your email"; once it has expired, setup starts over from the welcome screen, since a new link is needed anyway. */
const E_LINK_DAYS = 3;
const eLinkLive = (sentAt) => !!sentAt && Date.now() - new Date(sentAt).getTime() < E_LINK_DAYS * 24 * 60 * 60 * 1000;
const E_CONFIRM_TIP = () => tE("Confirm your email in the banner above to create projects and keys.",
  "אשרו את כתובת הדוא״ל בבאנר למעלה כדי ליצור פרויקטים ומפתחות.");
const E_PB_GALLERY_URL = "https://developers.sefaria.org/docs/powered-by-sefaria";
const E_DISCORD_URL = "https://sefaria.formstack.com/forms/sefaria_developer_discord_community";  // a sign-up form, not a direct invite (2026-11-05)
const EShareLead = () => (
  <div className="devE-shareLead">
    <p className="devE-lead"><InterfaceText text={{
      en: <React.Fragment>Have you used Sefaria’s data to build an app, visualization, website, or other digital tool? <strong>We want to know about it!</strong> We’re always excited to see the projects you’re building.</React.Fragment>,
      he: <React.Fragment>השתמשתם בנתונים של ספריא כדי לבנות אפליקציה, ויזואליזציה, אתר או כלי דיגיטלי אחר? <strong>נשמח לשמוע!</strong> אנחנו תמיד שמחים לראות את הפרויקטים שאתם בונים.</React.Fragment>,
    }} /></p>
    <p className="devE-lead"><InterfaceText text={{
      en: <React.Fragment>If you have questions about our open-source data and API, you can always reach out at <a className="devE-inlineLink" href="mailto:developers@sefaria.org"><bdi dir="ltr">developers@sefaria.org</bdi></a>.</React.Fragment>,
      he: <React.Fragment>אם יש לכם שאלות על הנתונים בקוד פתוח ועל ה־API שלנו, אפשר תמיד לפנות אלינו בכתובת <a className="devE-inlineLink" href="mailto:developers@sefaria.org"><bdi dir="ltr">developers@sefaria.org</bdi></a>.</React.Fragment>,
    }} /></p>
    <a className="devE-inlineLink devE-galleryLink" href={E_PB_GALLERY_URL} target="_blank" rel="noopener noreferrer">
      {tE("See the projects already featured on Powered by Sefaria", "צפו בפרויקטים שכבר מוצגים ב־Powered by Sefaria")}<ExternalIcon />
    </a>
  </div>
);

const EShareProject = ({project, profile, picker, dots, onBack, onSubmit}) => {
  const name = accountName();
  const email = accountEmail();
  const form = useEProjectForm({name: project.name || "", description: project.description || "",
    organization: project.organization || "", websiteUrl: project.websiteUrl || ""});
  const [person, setPerson] = useState({...emptyProfile(), ...(profile || {}),
    role: profile ? (profile.notADeveloper ? "ai" : "developer") : ""});
  const [showName, setShowName] = useState(true);
  const [currentRole, setCurrentRole] = useState("");
  const [builtWithAi, setBuiltWithAi] = useState(project.aiAssisted ? "yes" : "");
  const [cats, setCats] = useState([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [tools, setTools] = useState([]);
  const [otherTech, setOtherTech] = useState("");
  const [inspired, setInspired] = useState("");
  const [users, setUsers] = useState("");
  const [usersOther, setUsersOther] = useState("");
  const [anythingElse, setAnythingElse] = useState("");
  const [logo, setLogo] = useState("");
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const clear = (key) => { if (errors[key]) { setErrors(e => ({...e, [key]: null})); } };
  const setP = (key, value) => { setPerson(f => ({...f, [key]: value})); clear(key); };
  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const required = (v) => (v || "").trim() ? null : "auth.required_field";
  const submit = (e) => {
    e.preventDefault();
    const projectOk = form.validate(false);
    const next = {
      websiteUrl: required(form.fields.websiteUrl),
      cats: cats.length ? null : <InterfaceText text={{en: "Choose at least one category.", he: "בחרו לפחות קטגוריה אחת."}} />,
      role: person.role ? null : "auth.required_field",
      logo: logo ? null : "auth.required_field",
    };
    setErrors(next);
    const order = [["websiteUrl", "devEProjSite"], ["cats", "devEShareCat0"],
      ["role", "devEShareRole"], ["logo", "devEShareLogoYes"]];
    const first = order.find(([k]) => next[k]);
    if (!projectOk) { return; }
    if (first) { const el = document.getElementById(first[1]); if (el) { el.focus(); } return; }
    if (busy) { return; }
    setBusy(true); setBanner(null);
    Promise.resolve(onSubmit(
      cleanProfile({...person, termsAccepted: true, notADeveloper: person.role === "ai" || person.role === "none"}),
      form.projectBody({aiAssisted: builtWithAi === "yes", visibility: "public"}),
    )).catch(err => { setBanner(saveFailure(err)); setBusy(false); });
  };
  return (
    <EStep onBack={onBack} backLabel={dots ? tE("Back", "חזרה") : null} dots={dots} title={tE("Share your project with Sefaria", "שתפו את הפרויקט עם ספריא")}
      lead={<EShareLead />}>
      <form className="devE-form devE-shareForm" onSubmit={submit} noValidate>
        <ErrorBanner error={banner} />

        <section className="devE-shareSection" aria-labelledby="devEShareProj">
          <h3 id="devEShareProj">{tE("Your project", "הפרויקט שלך")}</h3>
          {picker}
          {/* Section notes follow the Formstack form's ("will be shared" / "will not be displayed"). */}
          <p className="devE-shareNote"><InterfaceText text={{
            en: <React.Fragment>If submitted, these details <strong>will be shared</strong> on our site. Changes here also update your project.</React.Fragment>,
            he: <React.Fragment>אם הפרויקט יישלח, הפרטים האלה <strong>יוצגו</strong> באתר שלנו. שינויים כאן יעדכנו גם את הפרויקט.</React.Fragment>,
          }} /></p>
          <EProjectFields showcase fields={form.fields} set={(k, v) => { form.set(k, v); clear(k); }}
            errors={{...form.errors, websiteUrl: form.errors.websiteUrl || errors.websiteUrl}} check={form.check} />
          <fieldset className="devE-choices" aria-describedby={errors.cats ? "devEShareCats-error" : null}>
            <legend>{tE("Category", "קטגוריה")} <span className="devE-hintInline">{tE("Select all that apply.", "בחרו את כל המתאימות.")}</span></legend>
            {E_PB_CATEGORIES.map((c, i) => <Checkbox key={i} id={"devEShareCat" + i} checked={cats.includes(c.en)}
              onChange={() => { toggle(cats, setCats, c.en); clear("cats"); }} label={<InterfaceText text={c} />} />)}
            <EFieldError id="devEShareCats-error" error={errors.cats} />
          </fieldset>
          <Input id="devEShareSource" inputDir="ltr" label={tE("Link to source code", "קישור לקוד המקור")} labelAddon={EOpt}
            placeholder="github.com/…" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
          <fieldset className="devE-choices">
            <legend>{tE("Which Sefaria data or tools did you use?", "באילו נתונים או כלים של ספריא השתמשתם?")} {EOpt}</legend>
            {E_PB_TOOLS.map((t, i) => <Checkbox key={i} id={"devEShareTool" + i} checked={tools.includes(t)}
              onChange={() => toggle(tools, setTools, t)} label={<span dir="ltr">{t}</span>} />)}
            {/* Sheet: if "Sefaria API" is ticked, say whether the project has a key. */}
            {tools.includes("Sefaria API") ?
              <p className="devE-shareNote devE-shareNoteTight">{project.keys.length
                ? <InterfaceText text={{en: "This project has " + project.keys.length + " API key" + (project.keys.length === 1 ? "" : "s") + ".",
                    he: "לפרויקט הזה יש " + project.keys.length + " מפתחות API."}} />
                : tE("This project doesn't have an API key yet. You can add one from Projects and API keys.",
                    "לפרויקט הזה עדיין אין מפתח API. אפשר להוסיף אותו מתוך פרויקטים ומפתחות API.")}</p> : null}
          </fieldset>
          <fieldset className="devE-choices">
            <legend>{tE("Was this project built with AI?", "האם הפרויקט נבנה בעזרת AI?")} {EOpt}</legend>
            {[{v: "yes", en: "Yes", he: "כן"}, {v: "no", en: "No", he: "לא"}].map(o =>
              <label key={o.v} className="devE-radio"><input type="radio" name="devEShareAi" checked={builtWithAi === o.v}
                onChange={() => setBuiltWithAi(o.v)} /><InterfaceText text={{en: o.en, he: o.he}} /></label>)}
          </fieldset>
          <Input id="devEShareTech" dir="auto" label={tE("Which non-Sefaria technologies or tools did you use?", "באילו טכנולוגיות או כלים שאינם של ספריא השתמשתם?")} labelAddon={EOpt}
            placeholder={vE("e.g. React, Python, Claude", "למשל: React, Python, Claude")} value={otherTech} onChange={e => setOtherTech(e.target.value)} />
          <Input id="devEShareInspired" multiline rows={3} dir="auto" labelAddon={EOpt}
            label={tE("What inspired you to build it? What use case does it solve?", "מה נתן לכם השראה לבנות אותו? איזה צורך הוא פותר?")}
            value={inspired} onChange={e => setInspired(e.target.value)} />
          <fieldset className="devE-choices">
            <legend>{tE("About how many people use it each month?", "בערך כמה אנשים משתמשים בו בכל חודש?")} {EOpt}</legend>
            {E_PB_USERS.map(o => <label key={o.v} className="devE-radio"><input type="radio" name="devEShareUsers" checked={users === o.v}
              onChange={() => setUsers(o.v)} /><InterfaceText text={{en: o.en, he: o.he}} /></label>)}
            {users === "other" ? <Input id="devEShareUsersOther" dir="auto" label={tE("How many?", "כמה?")} value={usersOther}
              onChange={e => setUsersOther(e.target.value)} /> : null}
          </fieldset>
          <Input id="devEShareElse" multiline rows={3} dir="auto" label={tE("Anything else you'd like to add?", "יש עוד משהו שתרצו להוסיף?")} labelAddon={EOpt}
            value={anythingElse} onChange={e => setAnythingElse(e.target.value)} />
        </section>

        <section className="devE-shareSection" aria-labelledby="devEShareYou">
          <h3 id="devEShareYou">{tE("About you", "קצת עליך")}</h3>
          <p className="devE-shareNote"><InterfaceText text={{
            en: <React.Fragment>These details <strong>won't be shown</strong> on our site or shared, except your name if you choose to show it.</React.Fragment>,
            he: <React.Fragment>הפרטים האלה <strong>לא יוצגו</strong> באתר שלנו ולא ישותפו, מלבד השם שלך אם תבחרו להציג אותו.</React.Fragment>,
          }} /></p>
          {email ? <p className="devE-signed">{tE("Signed in as", "מחובר/ת בתור")} {name ? <strong dir="auto">{name}</strong> : null} <bdi dir="ltr">({email})</bdi></p> : null}
          <Checkbox id="devEShareShowName" checked={showName} onChange={e => setShowName(e.target.checked)}
            label={tE("Show my name with the project on Powered by Sefaria", "הצגת השם שלי עם הפרויקט ב־Powered by Sefaria")} />
          <Select id="devEShareRole" value={person.role} onChange={v => setP("role", v)} error={errors.role}
            label={tE("What best describes you?", "מה מתאר אותך הכי טוב?")}
            placeholder={{en: "Choose one", he: "בחרו אחת"}}
            options={E_ROLES.map(r => ({value: r.value, label: {en: r.en, he: r.he}}))} />
          <Input id="devEShareCurrentRole" dir="auto" label={tE("Current role", "תפקיד נוכחי")} labelAddon={EOpt}
            placeholder={vE("e.g. Teacher, student, software engineer", "למשל: מורה, סטודנט/ית, מהנדס/ת תוכנה")}
            value={currentRole} onChange={e => setCurrentRole(e.target.value)} />
          <Input id="devEShareAbout" multiline rows={2} dir="auto" maxLength={E_ABOUT_MAX}
            label={tE("Tell us about yourself", "ספרו לנו על עצמכם")} labelAddon={EOpt}
            placeholder={vE("Where you work or study, what you like to build", "איפה אתם עובדים או לומדים, מה אתם אוהבים לבנות")}
            aria-describedby="devEShareAboutCount" value={person.description} onChange={e => setP("description", e.target.value)}
            fieldAddon={<span id="devEShareAboutCount" dir="ltr">{person.description.length}/{E_ABOUT_MAX}</span>} />
          {/* Same field as in About you, prefilled from the profile (field review sheet: Elise and Genevieve want it here). */}
          <Checkbox id="devEShareNews" checked={!!person.developerNews} onChange={e => setP("developerNews", e.target.checked)}
            label={tE("I would like to receive Sefaria's developer newsletter to hear about new features, events and opportunities.",
              "אשמח לקבל את הניוזלטר למפתחים של ספריא כדי לשמוע על תכונות חדשות, אירועים והזדמנויות.")} />
        </section>

        <section className="devE-shareSection" aria-labelledby="devEShareLogo">
          <h3 id="devEShareLogo">{tE("Powered by Sefaria logo", "הלוגו Powered by Sefaria")}</h3>
          <p className="devE-shareNote"><InterfaceText text={{
            en: <React.Fragment>To be featured, your project needs the Powered by Sefaria logo. <a className="devE-inlineLink" href="https://developers.sefaria.org/docs/usage-of-our-name-and-logo" target="_blank" rel="noopener noreferrer">How to use our name and logo</a></React.Fragment>,
            he: <React.Fragment>כדי שהפרויקט יוצג, הוא צריך לכלול את הלוגו Powered by Sefaria. <a className="devE-inlineLink" href="https://developers.sefaria.org/docs/usage-of-our-name-and-logo" target="_blank" rel="noopener noreferrer">איך להשתמש בשם ובלוגו שלנו</a></React.Fragment>,
          }} /></p>
          <fieldset className="devE-choices" aria-describedby={errors.logo ? "devEShareLogo-error" : null}>
            <legend className="sr-only">{tE("Have you added the logo to your project?", "האם הוספתם את הלוגו לפרויקט?")}</legend>
            {[{v: "yes", id: "devEShareLogoYes", en: "Yes, I've added the Powered by Sefaria logo to my project.", he: "כן, הוספתי את הלוגו Powered by Sefaria לפרויקט."},
              {v: "no", id: "devEShareLogoNo", en: "I haven't added the logo yet.", he: "עדיין לא הוספתי את הלוגו."}].map(o =>
              <label key={o.v} className="devE-radio"><input type="radio" id={o.id} name="devEShareLogoAdded" checked={logo === o.v}
                onChange={() => { setLogo(o.v); clear("logo"); }} /><InterfaceText text={{en: o.en, he: o.he}} /></label>)}
            <EFieldError id="devEShareLogo-error" error={errors.logo} />
          </fieldset>
        </section>

        <div className="devE-footer">
          <button type="button" className="devE-backBtn" onClick={onBack}>{tE("Cancel", "ביטול")}</button>
          <EPrimary data-agent-action="share-project" disabled={busy}>{tE("Submit project", "שליחת הפרויקט")}</EPrimary>
        </div>
      </form>
    </EStep>
  );
};

/* The Powered by page reached from its own link (D43, D58): a project has to exist first, so the page starts with a
   choice of project, including "Create a new project", which runs the new-project steps and comes back here. */
const E_NEW_PROJECT = "__new__";
/* Read when the script loads: the app rewrites the address without the query once it starts. */
const E_SHARE_LINK = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("share");
/* "Continue to Developer Settings" on the email-confirmed page adds ?continue, so setup picks up at About you
   instead of the welcome screen. */
const E_CONTINUE = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("continue");
const EProjectPicker = ({projects, value, onPick}) => (
  <Select id="devESharePick" value={value || ""} onChange={onPick}
    label={tE("Which project do you want to share?", "איזה פרויקט תרצו לשתף?")}
    placeholder={projects.length ? {en: "Choose a project", he: "בחרו פרויקט"} : {en: "No projects yet", he: "עדיין אין פרויקטים"}}
    options={[...projects.map(p => ({value: p.id, label: {en: p.name, he: p.name}})),
      {value: E_NEW_PROJECT, label: {en: "+ Create a new project", he: "+ יצירת פרויקט חדש"}}]} />
);
const ESharePick = ({projects, onPick, onBack}) => (
  /* No project chosen yet: the page's intro and "Your project" with only the project choice. With no projects at all,
     the choice offers just "+ Create a new project". */
  <EStep onBack={onBack} title={tE("Share your project with Sefaria", "שתפו את הפרויקט עם ספריא")} lead={<EShareLead />}>
    <div className="devE-form devE-shareForm">
      <section className="devE-shareSection" aria-labelledby="devEShareProj">
        <h3 id="devEShareProj">{tE("Your project", "הפרויקט שלך")}</h3>
        {/* No projects yet (PBS check-in, 2026-11-02): say why the only choice is a new project, and that they come back here. */}
        {projects.length ? null : <p className="devE-shareNote">{tE(
          "To share a project with Sefaria, first create it. It only takes a minute, and you'll come straight back here to finish.",
          "כדי לשתף פרויקט עם ספריא, קודם צריך ליצור אותו. זה לוקח רק דקה, ומיד אחר כך תחזרו לכאן כדי לסיים.")}</p>}
        <EProjectPicker projects={projects} onPick={onPick} />
      </section>
    </div>
  </EStep>
);

const EHome = ({state, run, notice, setNotice, connectedMessage, toast, setToast, freshKeyId, open}) => {
  const [aiFor, setAiFor] = useState(null);   // {apiKey, project} whose AI prompt is open
  const [needSite, setNeedSite] = useState(null);   // the project whose key someone tried to limit before it had a website
  const [confirmDel, setConfirmDel] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [shownIds, setShownIds] = useState([]);   // keys shown in full; every key starts hidden
  const toggleShown = (id) => setShownIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const profile = state.profile || {};
  const emails = [accountEmail(), profile.additionalEmail].filter(Boolean);
  const canCreate = accountVerified(state);
  const maxProjects = state.maxProjects || 10;
  const atProjectLimit = state.projects.length >= maxProjects;
  const feature = (project) => run(updateProject(project.id, {
    name: project.name, description: project.description, organization: project.organization || "",
    websiteUrl: project.websiteUrl || "", aiAssisted: !!project.aiAssisted, visibility: "public",
  })).then(() => setToast(vE(project.name + " is submitted to Powered by Sefaria. We'll let you know if it's featured.",
    project.name + " נשלח ל־Powered by Sefaria. נעדכן אתכם אם יוצג.")), () => {});
  const removeKey = (apiKey) => run(deleteKey(apiKey.id)).then(() => {
    setConfirmDel(null);
    setToast(vE(apiKey.label + " is deleted. Anything using it stops working.", apiKey.label + " נמחק. כל מה שמשתמש בו יפסיק לעבוד."));
  }, () => {});
  return (
    <div className="devE-home">
      {connectedMessage ? <div className="devPocSuccess" role="status"><p>{connectedMessage}</p></div> : null}
      {notice ? <div className="devE-toast devE-toastWarn" role="alert"><img className="devE-toastIcon" src="/static/icons/info-error.svg" alt="" aria-hidden="true" /><span className="devE-toastText">{notice}</span><button type="button" className="devE-textBtn" onClick={() => setNotice("")}>{tE("Dismiss", "סגירה")}</button></div> : null}
      {toast ? <div className="devE-toast" role="status"><span className="devE-toastIcon" aria-hidden="true">✓</span><span className="devE-toastText">{toast}</span>
        <button type="button" className="devE-textBtn devE-muted" onClick={() => setToast("")}>{tE("Dismiss", "סגירה")}</button></div> : null}
      {confirmDel ? <EDeleteKeyDialog apiKey={confirmDel} onDelete={() => removeKey(confirmDel)} onCancel={() => setConfirmDel(null)} /> : null}
      {needSite ? <ELimitKeyDialog project={needSite.project} apiKey={needSite.apiKey} run={run} onCancel={() => setNeedSite(null)}
        onDone={() => setNeedSite(null)} /> : null}   {/* no message: the switch turning on says it (Penina, 2026-11-05) */}
      {aiFor ? <EAiDialog apiKey={aiFor.apiKey} projectName={aiFor.project.name} onClose={() => setAiFor(null)} /> : null}
      {!canCreate ? <EReconfirmBanner sentAt={state.confirmationSentAt} run={run} /> : null}

      {/* Edit profile opens the setup's About you step on its own, with the same fields. */}
      {
        <p className="devE-profile">
          <span dir="auto">{accountName() || profile.developerName}</span>
          <span className="devE-dot" aria-hidden="true">·</span>
          {emails.map((e, i) => <React.Fragment key={e}>{i ? ", " : null}<bdi dir="ltr">{e}</bdi></React.Fragment>)}
          <button type="button" className="devE-link" data-agent-action="edit-profile" onClick={() => open({screen: "profile"})}>{tE("Edit profile", "עריכת פרופיל")}</button>
        </p>}

      {/* The section header, then one block per project. */}
      <div className="devE-sectionHead">
        <div>
          <h2 className="devE-h">{tE("Projects and API keys", "פרויקטים ומפתחות API")}</h2>
        </div>
        {state.projects.length ?
          /* At the project limit (10 per account, raisable by staff) the button stays, disabled, and its tooltip
             says why. aria-disabled rather than disabled, so it can still be hovered and focused to read that. */
          <span className="devE-tipWrap">
            <button type="button" className="devE-pill" data-agent-action="new-project"
              aria-disabled={atProjectLimit || !canCreate ? "true" : null} aria-describedby={atProjectLimit || !canCreate ? "devEProjLimitTip" : null}
              onClick={() => { if (!atProjectLimit && canCreate) { open({screen: "newproj"}); } }}>
              <EPlusIcon />{tE("New project", "פרויקט חדש")}</button>
            {!canCreate ?
              <span className="devPocPopover devE-tip" id="devEProjLimitTip" role="tooltip">{E_CONFIRM_TIP()}</span> :
            atProjectLimit ?
              <span className="devPocPopover devE-tip" id="devEProjLimitTip" role="tooltip">
                {tE("You have " + maxProjects + " projects, the most an account can have. To add another, delete one you don't use.",
                  "יש לך " + maxProjects + " פרויקטים, המספר המרבי לחשבון. כדי להוסיף עוד, מחקו פרויקט שאינו בשימוש.")}
              </span> : null}
          </span> : null}
      </div>

      {/* No projects yet: the key table's columns, with its body asking for the first project. */}
      {!state.projects.length ?
        <div className="devE-board">
          <table className="devE-table">
            <EKeyColumns id="empty" />
            <tbody>
              <tr className="devE-emptyTableRow"><td colSpan={5}>
                <div className="devE-emptyState">
                  <h3>{tE("No projects or keys yet", "אין עדיין פרויקטים או מפתחות")}</h3>
                  <p>{tE("Create a project and we'll give you its first API key. Your projects and keys will show up here.",
                    "צרו פרויקט וניצור לכם את מפתח ה־API הראשון שלו. הפרויקטים והמפתחות שלכם יופיעו כאן.")}</p>
                  <span className="devE-tipWrap">
                    <button type="button" className="devE-pill" data-agent-action="new-project" aria-disabled={!canCreate ? "true" : null}
                      aria-describedby={!canCreate ? "devEFirstProjTip" : null}
                      onClick={() => { if (canCreate) { open({screen: "firstkey"}); } }}>{tE("Create a project", "יצירת פרויקט")}</button>
                    {!canCreate ? <span className="devPocPopover devE-tip" id="devEFirstProjTip" role="tooltip">{E_CONFIRM_TIP()}</span> : null}
                  </span>
                </div>
              </td></tr>
            </tbody>
          </table>
        </div> : null}

      {/* Each project: its details and actions above, then a table of only its keys, so every column
          head describes what's under it (2026-11-01). */}
      <div className="devE-projects">
        {state.projects.map((project, index) => {
          const host = websiteHost(project.websiteUrl);
          const atLimit = project.keys.length >= (state.maxKeysPerProject || 5);
          return (
            <section key={project.id} className="devE-project" aria-labelledby={"devEProj-" + project.id}>
              <div className="devE-projHead">
                <div className="devE-projInfo">
                  <h3 className="devE-projName" id={"devEProj-" + project.id}><bdi dir="auto">{project.name}</bdi>
                    {project.organization ? <span className="devE-org"> · <bdi dir="auto">{project.organization}</bdi></span> : null}</h3>
                  {project.description ? <span className="devE-desc" dir="auto">{project.description}</span> : null}
                  {/* The project's two optional extras, as chips: a button until done, then a quiet fact. */}
                  <span className="devE-chips">
                    {host ?
                      <span className="devE-chip devE-chipDone"><EGlobeIcon /><bdi dir="ltr">{host}</bdi></span> :
                      <button type="button" className="devE-chip" data-agent-action="add-website" onClick={() => setNeedSite({project})}>
                        <EPlusIcon />{tE("Add website", "הוספת אתר")}</button>}
                    {project.visibility === "public" ?
                      <span className="devE-chip devE-chipDone"><ECheckIcon />{tE("Submitted to Powered by Sefaria", "נשלח ל־Powered by Sefaria")}</span> :
                      <button type="button" className="devE-chip" onClick={() => open({screen: "share", projectId: project.id})}>
                        <EStarIcon />{tE("Share your project with Sefaria", "שתפו את הפרויקט עם ספריא")}</button>}
                  </span>
                </div>
                <div className="devE-projSide">
                <div className="devE-actions">
                  <button type="button" className="devE-quiet" data-agent-action="edit-project" onClick={() => open({screen: "editproj", projectId: project.id})}
                    aria-label={vE("Edit details of " + project.name, "עריכת הפרטים של " + project.name)}><EPencilIcon />{tE("Edit project details", "עריכת פרטי הפרויקט")}</button>
                  <span className="devE-tipWrap">
                    <button type="button" className="devE-pill devE-pillSm" data-agent-action="new-key" disabled={atLimit}
                      aria-disabled={!canCreate ? "true" : null} aria-describedby={!canCreate ? "devEKeyTip-" + project.id : null}
                      title={atLimit ? vE("5 keys is the most a project can have. Delete one you don't use to make room.", "חמישה מפתחות הם המקסימום לפרויקט. מחקו מפתח שאינו בשימוש כדי לפנות מקום.") : ""}
                      aria-label={vE("Add a key to " + project.name, "הוספת מפתח ל־" + project.name)}
                      onClick={() => { if (canCreate) { open({screen: "newkey", projectId: project.id}); } }}><EPlusIcon />{tE("Add key", "הוספת מפתח")}</button>
                    {!canCreate ? <span className="devPocPopover devE-tip" id={"devEKeyTip-" + project.id} role="tooltip">{E_CONFIRM_TIP()}</span> : null}
                  </span>
                </div>
                <EUsage usage={eUsageOf(project, index)} projectName={project.name} />
                </div>
              </div>
              <div className="devE-board">
                <table className="devE-table" aria-labelledby={"devEProj-" + project.id}>
                  <EKeyColumns id={project.id} />
                  <tbody>
                    {project.keys.length ? project.keys.map(apiKey => (
                      <tr key={apiKey.id} className={"devE-keyRowT" + (apiKey.id === freshKeyId ? " is-new" : "")}>
                        <td data-l={vE("Name", "שם")} dir="auto">{apiKey.label}</td>
                        <td data-l={vE("Key", "מפתח")}>
                          <span className="devE-keyCell">
                            <code className="devE-keyText" dir="ltr">{shownIds.includes(apiKey.id) ? apiKey.value : apiKey.value.slice(0, 4) + "••••" + apiKey.value.slice(-4)}</code>
                            {/* Show or hide the whole key: the eye from the sign-in password field. */}
                            <button type="button" className="devE-ico" aria-pressed={shownIds.includes(apiKey.id)}
                              aria-label={shownIds.includes(apiKey.id) ? vE("Hide " + apiKey.label, "הסתרת " + apiKey.label) : vE("Show " + apiKey.label, "הצגת " + apiKey.label)}
                              title={shownIds.includes(apiKey.id) ? vE("Hide key", "הסתרת המפתח") : vE("Show key", "הצגת המפתח")}
                              onClick={() => toggleShown(apiKey.id)}>
                              <span className={"devE-eye" + (shownIds.includes(apiKey.id) ? " is-off" : "")} aria-hidden="true" />
                            </button>
                            <button type="button" className="devE-ico" aria-label={vE("Copy " + apiKey.label, "העתקת " + apiKey.label)}
                              onClick={() => eCopy(apiKey.value, () => { setCopiedId(apiKey.id); setTimeout(() => setCopiedId(null), 2000); })}>
                              <ECopyIcon />
                            </button>
                            <span className="devE-keyCopied" aria-live="polite">{copiedId === apiKey.id ? tE("Copied", "הועתק") : null}</span>
                          </span>
                        </td>
                        <td data-l={vE("Created", "נוצר")}>{formatDate(apiKey.created)}</td>
                        <td data-l={vE("Limit to website", "הגבלה לאתר")}>
                          {/* Without a website the switch stays off; turning it on asks for the website first. */}
                          <span className="devE-tog">
                            <span className="sr-only" id={"devERes-" + apiKey.id + "-label"}>
                              {host ? vE("Only accept requests with " + apiKey.label + " from " + host, "לקבל בקשות עם " + apiKey.label + " רק מ־" + host)
                                : vE("Limit " + apiKey.label + " to the project's website", "הגבלת " + apiKey.label + " לאתר הפרויקט")}
                            </span>
                            <ToggleSwitch name={"devERes-" + apiKey.id} isChecked={!!host && !!apiKey.restrictToWebsite}
                              onChange={e => host ? run(setKeyRestriction(apiKey.id, e.target.checked)).catch(() => {}) : setNeedSite({project, apiKey})} />
                          </span>
                        </td>
                        <td className="devE-end">
                          <button type="button" className="devE-ico devE-icoDanger" aria-label={vE("Delete " + apiKey.label, "מחיקת " + apiKey.label)}
                            aria-haspopup="dialog" onClick={() => setConfirmDel(apiKey)}><ETrashIcon /></button>
                        </td>
                      </tr>
                    )) :
                      <tr className="devE-emptyRow"><td colSpan={5}>{tE("No keys yet.", "אין עדיין מפתחות.")}</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

/* Developer Settings, trial E: decides which step or screen shows from the server state plus
   where this visit is in the flow. */
/* The settings page scrolls inside its own panel, not the window. */
const eScrollTop = () => {
  if (typeof document === "undefined") { return; }
  const scroller = document.querySelector(".settingsPage .content");
  if (scroller) { scroller.scrollTop = 0; }
  window.scrollTo(0, 0);
};

/* Rule 14: the account email changed (or lost confirmation) after setup. Everything stays and keeps working; only
   creating projects and keys waits. The whole confirmation happens in this banner, so the projects stay in view. */
const EReconfirmBanner = ({sentAt, run}) => {
  const [sentHere, setSentHere] = useState(false);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!wait) { return; }
    const t = setTimeout(() => setWait(w => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const send = () => run(sendConfirmation(), {quiet: true}).then(() => { setError(""); setSentHere(true); setWait(60); }, err => {
    if (sentAt && !/today/.test(err.message || "")) { setError(""); setSentHere(true); setWait(60); }
    else { setError(err.message || Sefaria._v(SAVE_FAILED)); }
  });
  const email = <bdi dir="ltr" className="devE-noWrap"><strong>{accountEmail()}</strong></bdi>;
  /* Mirrors setup: a link older than 3 days has expired, so the banner goes back to asking for one. */
  const sent = sentHere || eLinkLive(sentAt);
  return (
    /* The design system's AnnouncementBanner, Warning variant (Figma Components library), without its close button:
       this notice goes away only once the email is confirmed. */
    <div className="devE-banner" role="region" aria-label={vE("Confirm your new email address", "אישור כתובת הדוא״ל החדשה")}>
      <div className="devE-bannerContent">
        <span className="devE-bannerIcon" aria-hidden="true"><EMailIcon /></span>
        <div className="devE-bannerText" aria-live="polite">
          {sent ? <React.Fragment>
            <p className="devE-bannerTitle">{tE("Check your email", "בדקו את תיבת הדוא״ל")}</p>
            <p><InterfaceText text={{
              en: <React.Fragment>We sent a confirmation link to {email}.</React.Fragment>,
              he: <React.Fragment>שלחנו קישור לאישור אל {email}.</React.Fragment>,
            }} /></p>
            <p>{tE("Didn't get the email?", "המייל לא הגיע?")}{" "}
              <button type="button" className="devE-inlineLink devE-linkBtn devE-resendLink" data-agent-action="resend-confirmation"
                disabled={!!wait} onClick={send}>
                {wait ? vE("Resend in " + wait + "s", "שליחה חוזרת בעוד " + wait + " שנ׳") : tE("Resend link", "שליחה חוזרת")}
              </button></p>
          </React.Fragment> : <React.Fragment>
            <p className="devE-bannerTitle">{tE("Confirm your email address", "אשרו את כתובת הדוא״ל")}</p>
            <p>{tE("To create new projects and keys, first confirm your email.", "כדי ליצור פרויקטים ומפתחות חדשים, קודם צריך לאשר את כתובת הדוא״ל.")}</p>
          </React.Fragment>}
          {error ? <p className="devE-errorText" role="alert">{error}</p> : null}
        </div>
      </div>
      {sent ? null :
        <div className="devE-bannerActions">
          <button type="button" className="devE-bannerBtn" data-agent-action="send-confirmation" onClick={send}>
            {tE("Send confirmation link", "שליחת קישור לאישור")}</button>
        </div>}
    </div>
  );
};

/* Kept outside the component: a request can re-mount it, and a link sent a moment ago must still
   show "Check your email". A reload starts a new visit. */
let eSentThisVisit = false;
let eStarted = E_CONTINUE;

const DeveloperE = ({state, developerOn, run, notice, setNotice, connectedMessage}) => {
  const [view, setView] = useState(null);   // {screen, projectId, keyId, inSetup}
  const [toast, setToast] = useState("");
  const [freshKeyId, setFreshKeyId] = useState(null);
  const [sent, setSent] = useState(false);
  /* A link sent during this visit shows "Check your email" at once, before the state's sent time arrives. */
  const [sentThisVisit, setSentThisVisitState] = useState(eSentThisVisit);
  const setSentThisVisit = (v) => { eSentThisVisit = v; setSentThisVisitState(v); };
  const [resendWait, setResendWait] = useState(0);
  const [sendError, setSendError] = useState("");
  useEffect(() => {
    if (!resendWait) { return; }
    const t = setTimeout(() => setResendWait(w => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendWait]);
  /* Kept outside the component, like the sent flag: confirming the email re-mounts it, and setup should carry on
     to About you rather than show the welcome screen again. */
  const [started, setStartedState] = useState(eStarted);
  const setStarted = (v) => { eStarted = v; setStartedState(v); };
  const [cancelled, setCancelled] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  /* The Powered by page's own link (D43): /settings/developer?share. Once there's a profile, it opens the page with
     a project picker; before that, the usual setup runs first and ends on this page instead of the table. Logged
     out, the login page sends people back to this link. */
  useEffect(() => {
    if (E_SHARE_LINK && developerOn && state.profile) { setView({screen: "share", fromLink: true}); }
  }, []);
  const verified = accountVerified(state);
  const needConfirm = !developerOn && !verified;
  /* Email sign-ups keep "Confirm your email" counted as step 1 after confirming, so About you reads "Step 2 of 4"
     (Penina, 2026-11-05). Google and Apple sign-ups skip it. */
  const confirmStep = !!(needConfirm || view && view.withConfirm || !state.ssoConnected);
  const stepLabels = [
    ...(confirmStep ? [{en: "Confirm email", he: "אישור דוא״ל"}] : []),
    {en: "About you", he: "קצת עליך"},
    {en: "Your project", he: "הפרויקט שלך"},
    E_SHARE_LINK ? {en: "Share your project", he: "שיתוף הפרויקט"} : {en: "Create your API key", he: "צרו את מפתח ה־API שלכם"},
  ];
  const dotsOf = stepLabels.length;
  const dots = (step) => ({at: step + (confirmStep ? 1 : 0), of: dotsOf, labels: stepLabels});
  const open = (next) => { setToast(""); setView(next); eScrollTop(); };
  const home = (message) => { setView(null); setToast(message || ""); eScrollTop(); };
  const projectById = (id) => state.projects.find(p => p.id === id);

  /* Create a project (when given) and a key, keep the loader up long enough, then go to the table
     with the new key marked. */
  const createWithKey = (projectBody, label, inSetup, existingProjectId, keyOptions, afterKey) => {
    const {restrict, websiteUrl} = keyOptions || {};
    const minimum = new Promise(resolve => setTimeout(resolve, KEY_SETUP_MS));
    const projectReady = existingProjectId ? Promise.resolve(existingProjectId)
      : run(createProject(projectBody), {quiet: true}).then(data => data.projectId);
    return projectReady.then(projectId => {
      setView({screen: "wait", projectId, inSetup, withConfirm: confirmStep});
      /* A website typed in the key form is saved to the project first, so the key can be limited to it. */
      const project = projectById(projectId);
      const siteReady = websiteUrl && project ? run(updateProject(projectId, {
        name: project.name, description: project.description, organization: project.organization || "",
        websiteUrl, aiAssisted: !!project.aiAssisted, visibility: project.visibility || "private",
      }), {quiet: true}) : Promise.resolve();
      const keyReady = siteReady.then(() => run(createKey(projectId, label), {quiet: true}))
        .then(data => restrict ? run(setKeyRestriction(data.keyId, true), {quiet: true}).then(() => data) : data);
      return Promise.all([keyReady, minimum]).then(([data]) => {
        if (!mounted.current) { return; }
        setFreshKeyId(data.keyId);
        if (afterKey) { afterKey(); return; }
        home();   // no message: the new key's row shows it, tinted for a moment
      }, err => {
        if (mounted.current) { setView(inSetup ? {screen: "setupKey", projectId, inSetup: true, withConfirm: confirmStep} : {screen: "newkey", projectId}); }
        throw err;
      });
    });
  };

  const header = (
    <header className="devPocPageHeader devE-pageHeader">
      <h1><InterfaceText text={{en: "Developer Settings", he: "הגדרות מפתחים"}} /></h1>
      {/* D57 (2026-10-26): the library download is only a small link beside the API docs, never a callout. */}
      {developerOn && state.profile && !view ?
        <p className="devE-headLinks">
          <a className="devE-docs" href={API_DOCS_URL} target="_blank" rel="noreferrer">{tE("Technical documentation", "תיעוד טכני")}<ExternalIcon /></a>
          <a className="devE-docsMinor" href={LIBRARY_EXPORT_URL} target="_blank" rel="noopener noreferrer">{tE("Download the library", "הורדת הספרייה")}<ExternalIcon /></a>
        </p> : null}
    </header>
  );
  let body;

  /* The welcome screen, until "Get started"; Cancel on About you comes back to it. */
  const linkLive = eLinkLive(state.confirmationSentAt);
  /* Every visit opens on the welcome screen, its steps including "Confirm your email". "Get started" goes to step 1,
     or straight to "Check your email" while a link sent earlier is still live. */
  if ((!developerOn || !state.profile) && !started) {
    body = <EEntry withConfirm={needConfirm} share={E_SHARE_LINK} onStart={() => { setStarted(true); eScrollTop(); }} />;
  } else if (needConfirm) {
    /* Modelled on common sign-up flows (Clerk, Notion, Linear, GitLab): once a link is out, the step
       number gives way to an inbox screen; resend is a quiet link with a short cooldown. */
    /* The server allows one email a minute. If a link went out moments ago (another tab, or a
       return visit), it refuses; that link is still good, so show "Check your email" anyway. */
    const sendLink = () => run(sendConfirmation(), {quiet: true}).then(() => {
      setSendError(""); setSentThisVisit(true); setSent(!!state.confirmationSentAt); setResendWait(60);
    }, err => {
      /* The one-a-minute limit while a link is out: that link still works. Anything else (such as
         the five-a-day limit) is said right here, under the button. */
      if (state.confirmationSentAt && !/today/.test(err.message || "")) { setSendError(""); setSentThisVisit(true); setResendWait(60); }
      else { setSendError(err.message || Sefaria._v(SAVE_FAILED)); }
    });
    const sendErrorLine = sendError ? <p className="devE-hint devE-hintCenter devE-errorText" role="alert">{sendError}</p> : null;
    const changeEmail = (
      <p className="devE-hint devE-hintCenter">
        <InterfaceText text={{
          en: <React.Fragment>Wrong address? <a className="devE-inlineLink" href="/settings/account#username-change">Change it in Account Settings</a></React.Fragment>,
          he: <React.Fragment>הכתובת שגויה? <a className="devE-inlineLink" href="/settings/account#username-change">שנו אותה בהגדרות החשבון</a></React.Fragment>,
        }} />
      </p>
    );
    /* Laid out like common "Check your email" screens: icon, title, the address on its own line, one
       action, then quiet links, with the way back last. */
    const emailLine = <React.Fragment><br /><bdi dir="ltr" className="devE-noWrap"><strong>{accountEmail()}</strong></bdi></React.Fragment>;
    const cancel = <button type="button" className="devE-ghostBtn" onClick={() => { setStarted(false); setCancelled(true); eScrollTop(); }}><EArrowLeftIcon />{tE("Back to Developer Settings", "חזרה להגדרות המפתחים")}</button>;
    const sendButton = <button type="button" className="sefaria-common-button auth-primary fullwidth" data-agent-action="send-confirmation"
      onClick={sendLink}>{tE("Send confirmation link", "שליחת קישור לאישור")}</button>;
    if (linkLive || (state.confirmationSentAt && sentThisVisit)) {
      /* While a link is live, Get started lands here; there's no way back from it until the link is confirmed or expires. */
      body = (
        <EStep icon={<EMailIcon size={24} />} title={tE("Check your email", "בדקו את תיבת הדוא״ל")}
          lead={<p className="devE-lead devE-leadCenter"><InterfaceText text={{
            en: <React.Fragment>We sent a confirmation link to{emailLine}</React.Fragment>,
            he: <React.Fragment>שלחנו קישור לאישור אל{emailLine}</React.Fragment>,
          }} /></p>}>
          <div className="devE-form devE-formCenter">
            {/* Disabled with a countdown right after a send, then enabled (Clerk, Slack). */}
            <p className="devE-hint devE-hintCenter" aria-live="polite">
              {tE("Didn't get the email?", "המייל לא הגיע?")}{" "}
              <button type="button" className="devE-inlineLink devE-linkBtn devE-resendLink" data-agent-action="resend-confirmation"
                disabled={!!resendWait} onClick={sendLink}>
                {resendWait ? vE("Resend in " + resendWait + "s", "שליחה חוזרת בעוד " + resendWait + " שנ׳") : tE("Resend link", "שליחה חוזרת")}
              </button>
            </p>
            {sendErrorLine}
            {changeEmail}
          </div>
        </EStep>
      );
    } else {
      body = (
        <EStep dots={{at: 0, of: dotsOf, labels: stepLabels}} icon="</>" title={tE("Confirm your email", "אישור כתובת הדוא״ל")}
          lead={<p className="devE-lead devE-leadCenter"><InterfaceText text={{
            en: <React.Fragment>We'll send a confirmation link to{emailLine}</React.Fragment>,
            he: <React.Fragment>נשלח קישור לאישור אל{emailLine}</React.Fragment>,
          }} /></p>}>
          <div className="devE-form">
            {sendButton}
            {sendErrorLine}
            {changeEmail}
            {cancel}
          </div>
        </EStep>
      );
    }
  } else if (!developerOn || !state.profile) {
    /* Cancel before any profile exists goes back to the welcome screen; nothing is saved. */
    body = <EWelcome dots={dots(0)} onCancel={() => { setStarted(false); setCancelled(true); eScrollTop(); }} onSave={profile =>
      (developerOn ? Promise.resolve() : run(enableDeveloper(), {quiet: true}))
        .then(() => run(saveProfile(profile), {quiet: true}))
        .then(() => setView({screen: "setupProject", inSetup: true, withConfirm: confirmStep}))} />;
  } else if (view && view.screen === "profile") {
    body = <EWelcome edit initial={state.profile} onCancel={() => home()}
      onSave={profile => run(saveProfile(profile), {quiet: true}).then(() => home(vE("Your profile is saved.", "הפרופיל שלך נשמר.")))} />;
  } else if (view && view.screen === "setupProfile") {
    body = <EWelcome dots={dots(0)} initial={state.profile} onSave={profile =>
      run(saveProfile(profile), {quiet: true}).then(() => setView(view.projectId
        /* the project and key already exist: go forward to editing them, never to creating another */
        ? {screen: "setupProjectEdit", projectId: view.projectId, inSetup: true, withConfirm: view.withConfirm}
        : {screen: "setupProject", inSetup: true, withConfirm: view.withConfirm}))} />;
  } else if (view && view.screen === "setupProjectEdit" && projectById(view.projectId)) {
    const project = projectById(view.projectId);
    const back = () => setView({screen: "setupProfile", projectId: project.id, inSetup: true, withConfirm: view.withConfirm});
    /* Back from the key step: the project exists, so this step edits it instead of creating another. */
    body = <EEditProject project={project} dots={dots(1)} inSetup onBack={back} backLabel={tE("Back", "חזרה")}
      onSave={fields => run(updateProject(project.id, fields), {quiet: true})
        .then(() => setView({screen: E_SHARE_LINK ? "share" : "setupKey", projectId: project.id, fromLink: E_SHARE_LINK,
          inSetup: true, withConfirm: view.withConfirm}))} />;
  } else if (view && view.screen === "setupProject") {
    body = <ESetupProject dots={dots(1)} backLabel={tE("Back", "חזרה")}
      onBack={() => setView({screen: "setupProfile", inSetup: true, withConfirm: view.withConfirm})}
      onSkip={() => E_SHARE_LINK ? open({screen: "share", fromLink: true})
        : home(vE("Your profile is saved. Create a project whenever you're ready.", "הפרופיל שלך נשמר. צרו פרויקט מתי שתרצו."))}
      onCreate={projectBody => run(createProject(projectBody), {quiet: true})
        .then(data => setView(E_SHARE_LINK
          /* from the Powered by link: no key step, straight to sharing */
          ? {screen: "share", projectId: data.projectId, fromLink: true, inSetup: true, withConfirm: view.withConfirm}
          : {screen: "setupKey", projectId: data.projectId, inSetup: true, withConfirm: view.withConfirm}))} />;
  } else if (view && view.screen === "setupKey" && projectById(view.projectId)) {
    const project = projectById(view.projectId);
    body = <ESetupKey dots={dots(2)} project={project} backLabel={tE("Back", "חזרה")}
      onBack={() => setView({screen: "setupProjectEdit", projectId: project.id, inSetup: true, withConfirm: view.withConfirm})}
      onSkip={() => E_SHARE_LINK ? open({screen: "share", projectId: project.id, fromLink: true})
        : home(vE(project.name + " is saved. Add a key when you're ready.", project.name + " נשמר. הוסיפו מפתח מתי שתרצו."))}
      onCreate={(label, opts) => createWithKey(null, label, true, project.id, opts,
        E_SHARE_LINK ? () => open({screen: "share", projectId: project.id, fromLink: true}) : null)} />;
  } else if (view && view.screen === "firstkey" || view && view.screen === "newproj") {
    /* A new project from the table: the same two steps as setup (project, then a key that can be skipped),
       without step numbers. */
    /* From the Powered by page (view.toShare), Cancel and the finished steps go back to it, with the new project
       chosen. */
    const toShare = view.toShare;
    const leave = () => toShare ? open({screen: "share", fromLink: true}) : home();
    body = <ESetupProject title={tE("New project", "פרויקט חדש")} onBack={leave}
      onSkip={leave} skipLabel={tE("Cancel", "ביטול")}
      onCreate={projectBody => run(createProject(projectBody), {quiet: true})
        .then(data => setView({screen: "projectKey", projectId: data.projectId, toShare}))} />;
  } else if (view && view.screen === "projectKey" && projectById(view.projectId)) {
    const project = projectById(view.projectId);
    const toShare = view.toShare;
    const backToShare = () => open({screen: "share", projectId: project.id, fromLink: true});
    body = <ESetupKey project={project} onBack={toShare ? backToShare : () => home()}
      onSkip={toShare ? backToShare : () => home(vE(project.name + " is saved. Add a key when you're ready.", project.name + " נשמר. הוסיפו מפתח מתי שתרצו."))}
      onCreate={(label, opts) => createWithKey(null, label, false, project.id, opts, toShare ? backToShare : null)} />;
  } else if (view && view.screen === "newkey" && projectById(view.projectId)) {
    body = <ENewKey project={projectById(view.projectId)} onBack={() => home()}
      onCreate={(label, opts) => createWithKey(null, label, false, view.projectId, opts)} />;
  } else if (view && view.screen === "wait") {
    body = <EWaiting dots={view.inSetup ? dots(2) : null} />;
  } else if (view && view.screen === "reveal" && projectById(view.projectId)) {
    const project = projectById(view.projectId);
    const apiKey = project.keys.find(k => k.id === view.keyId);
    body = <EReveal dots={view.inSetup ? dots(2) : null} apiKey={apiKey} projectName={project.name}
      onBack={view.inSetup ? () => setView({screen: "setupProjectEdit", projectId: project.id, keyId: view.keyId, inSetup: true, withConfirm: view.withConfirm}) : null}
      continueLabel={view.inSetup ? tE("Continue", "המשך") : tE("Back to Developer Settings", "חזרה להגדרות המפתחים")}
      onContinue={() => view.inSetup ? setView({screen: "feature", projectId: project.id, inSetup: true, withConfirm: view.withConfirm})
        : home(vE((apiKey ? apiKey.label : "Your key") + " works now.", (apiKey ? apiKey.label : "המפתח") + " עובד עכשיו."))} />;
  } else if (view && view.screen === "feature" && projectById(view.projectId)) {
    const project = projectById(view.projectId);
    body = <EFeature dots={dots(3)} project={project}
      onBack={() => setView({screen: "reveal", projectId: project.id, keyId: freshKeyId, inSetup: true, withConfirm: view.withConfirm})}
      onLater={() => home(vE("You're set up. Your key for " + project.name + " works now.", "הכול מוכן. המפתח של " + project.name + " עובד עכשיו."))}
      onFeature={() => run(updateProject(project.id, {
        name: project.name, description: project.description, organization: project.organization || "",
        websiteUrl: project.websiteUrl || "", aiAssisted: !!project.aiAssisted, visibility: "public",
      })).then(() => home(vE("You're set up, and " + project.name + " is submitted to Powered by Sefaria.", "הכול מוכן, ו־" + project.name + " נשלח ל־Powered by Sefaria.")), () => {})} />;
  } else if (view && view.screen === "share" && view.fromLink && !projectById(view.projectId)) {
    body = <ESharePick projects={state.projects} onBack={() => home()}
      onPick={id => id === E_NEW_PROJECT ? open({screen: "newproj", toShare: true}) : setView({screen: "share", projectId: id, fromLink: true})} />;
  } else if (view && view.screen === "share" && projectById(view.projectId)) {
    const project = projectById(view.projectId);
    body = <EShareProject key={project.id} project={project} profile={state.profile} dots={view.inSetup ? dots(2) : null}
      onBack={view.inSetup ? () => setView({screen: "setupProjectEdit", projectId: project.id, inSetup: true, withConfirm: view.withConfirm}) : () => home()}
      picker={<EProjectPicker projects={state.projects} value={project.id}
        onPick={id => id === E_NEW_PROJECT ? open({screen: "newproj", toShare: true}) : setView({screen: "share", projectId: id, fromLink: true})} />}
      onSubmit={(profile, fields) => run(saveProfile(profile), {quiet: true})
        .then(() => run(updateProject(project.id, fields), {quiet: true}))
        .then(() => home(vE(fields.name + " is submitted to Powered by Sefaria. We'll let you know if it's featured.",
          fields.name + " נשלח ל־Powered by Sefaria. נעדכן אתכם אם יוצג.")))} />;
  } else if (view && view.screen === "editproj" && projectById(view.projectId)) {
    const project = projectById(view.projectId);
    body = <EEditProject project={project} onBack={() => home()} focusField={view.focus}
      onSave={fields => run(updateProject(project.id, fields), {quiet: true}).then(() => home(vE(fields.name + " is saved.", fields.name + " נשמר.")))}
      onDelete={() => run(deleteProject(project.id), {quiet: true}).then(() => home(vE(project.name + " and its keys are deleted.", project.name + " והמפתחות שלו נמחקו.")))} />;
  } else {
    body = <EHome state={state} run={run} notice={notice} setNotice={setNotice} connectedMessage={connectedMessage}
      toast={toast} setToast={setToast} freshKeyId={freshKeyId} open={open} />;
  }

  return <div className="devPocPage devE">{header}{body}</div>;
};


const DeveloperTab = ({state, developerOn, highlight, run, setConfirm, notice, setNotice,
                       connectedMessage, editingProfile, setEditingProfile, showNewProject,
                       setShowNewProject, onCreateProject, expandedProjectId, expandProject, onStart,
                       settingUp, active}) => {
  const profileName = accountName() || (state.profile ? state.profile.developerName : "");
  const canCreate = accountVerified(state);
  const [askLaterListingId, setAskLaterListingId] = useState(null);
  const yourListing = state.yourListing;
  const projectsHeadingRef = useRef(null);
  /* The listing question is a modal, so it waits until this tab is the one showing. */
  const askAboutListing = active && yourListing && developerOn && state.profile && !showNewProject
    && askLaterListingId !== yourListing.id;

  const projectDeleted = () => {
    expandProject(null);
    if (projectsHeadingRef.current) { projectsHeadingRef.current.focus(); }
  };

  const toggleExpand = (project) => expandProject(expandedProjectId === project.id ? null : project.id);

  const newProjectButton = (label, className) => (
    <button type="button" className={"button small " + className} data-agent-action="new-project" onClick={() => setShowNewProject(true)}>
      <InterfaceText text={label} />
    </button>
  );

  /* Until the profile is saved, the page is just the setup card. */
  const inSetup = !developerOn || settingUp || !state.profile;

  const profileEmails = state.profile ?
    [accountEmail(), state.profile.additionalEmail].filter(Boolean) : [];

  return (
    <div className="devPocPage">
      {inSetup ?
        <header className="devPocPageHeader devSetupPageHeader">
          <h1><InterfaceText text={{en: "Developer Settings", he: "הגדרות מפתחים"}} /></h1>
        </header> :
        <header className={"devPocPageHeader" + (highlight && developerOn ? " settingsHighlight" : "")}>
          <div>
            <h1><InterfaceText text={{en: "Developer Settings", he: "הגדרות מפתחים"}} /></h1>
            <p>
              <InterfaceText text={{
                en: "Register your projects and manage their API keys.",
                he: "רשמו את הפרויקטים שלכם ונהלו את מפתחות ה־API שלהם.",
              }} />
            </p>
            <p className="devPocHelp devPocExportNote">
              <InterfaceText text={{
                en: <React.Fragment>Need a lot of text? The whole library is <a href={LIBRARY_EXPORT_URL} target="_blank" rel="noopener noreferrer">free to download</a>, no API key needed.</React.Fragment>,
                he: <React.Fragment>צריכים הרבה טקסט? את כל הספרייה אפשר <a href={LIBRARY_EXPORT_URL} target="_blank" rel="noopener noreferrer">להוריד בחינם</a>, בלי מפתח API.</React.Fragment>,
              }} />
            </p>
          </div>
          <a className="devPocDocsLink" href={API_DOCS_URL} target="_blank" rel="noreferrer">
            <InterfaceText text={{en: "Technical documentation", he: "תיעוד טכני"}} />
            <ExternalIcon />
          </a>
        </header>}

      {connectedMessage ?
        <div className="devPocSuccess" role="status"><p>{connectedMessage}</p></div> : null}

      {!developerOn || settingUp ?
        <GetStarted
          verified={accountVerified(state)}
          confirmationSent={!!state.confirmationSentAt}
          settingUp={settingUp}
          highlight={highlight}
          onStart={onStart}
          onSendConfirmation={() => run(sendConfirmation()).catch(() => {})}
          onCancelConfirmation={() => run(cancelConfirmation()).catch(() => {})}
        /> :
        !state.profile ?
        <ProfileOnboarding onSave={profile => run(saveProfile(profile), {quiet: true})} /> :
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
                  onSave={profile => run(saveProfile(profile), {quiet: true}).then(() => setEditingProfile(false))}
                  onCancel={() => setEditingProfile(false)}
                />
              </React.Fragment> :
              <div className="devPocProfileSummary">
                <span>
                  <strong dir="auto">{profileName}</strong>
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

          {canCreate ? null :
            <ReconfirmEmail
              confirmationSent={!!state.confirmationSentAt}
              onSend={() => run(sendConfirmation()).catch(() => {})}
            />}

          <div className="devPocSectionHeading">
            <h2 tabIndex={-1} ref={projectsHeadingRef}><InterfaceText text={{en: "Projects", he: "פרויקטים"}} /></h2>
            {state.projects.length && !showNewProject && canCreate ? newProjectButton({en: "New project", he: "פרויקט חדש"}, "white") : null}
          </div>

          {showNewProject ?
            <NewProjectPanel onCreate={onCreateProject} onCancel={() => setShowNewProject(false)} /> :
            state.projects.length === 0 ?
            <div className="devPocEmpty">
              <h2><InterfaceText text={{en: "No projects yet", he: "עדיין אין פרויקטים"}} /></h2>
              <p>
                <InterfaceText text={{
                  en: "To use the Sefaria API, start by creating a project. Then you'll add an API key to it.",
                  he: "כדי להשתמש ב־API של ספריא, מתחילים ביצירת פרויקט. אחר כך מוסיפים לו מפתח API.",
                }} />
              </p>
              {canCreate ?
                <div className="devPocActions">
                  {newProjectButton({en: "Create your first project", he: "יצירת הפרויקט הראשון"}, "blue")}
                </div> : null}
            </div> : null}

          {state.projects.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              expanded={expandedProjectId === p.id}
              maxKeys={state.maxKeysPerProject}
              canCreateKeys={canCreate}
              run={run}
              setConfirm={setConfirm}
              notice={setNotice}
              onToggleExpand={() => toggleExpand(p)}
              onDeleted={projectDeleted}
            />
          ))}
        </React.Fragment>}

      {askAboutListing ?
        <YourListingDialog
          key={yourListing.id}
          listing={yourListing}
          onYes={() => run(claimListing(yourListing.id), {refresh: true}).then(data => expandProject(data.projectId), () => {})}
          onNo={() => run(dismissListing(yourListing.id), {refresh: true}).catch(() => {})}
          onLater={() => setAskLaterListingId(yourListing.id)}
        /> : null}
    </div>
  );
};


/* The confirmation email as the user would get it, in the interface language, for copy
   review. Its button is the emailed link, and opens in a new tab as a mail client would. */
const MockEmailDialog = ({confirmationKey, onCancel}) => {
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
          <h2><InterfaceText text={{en: "Confirm your email for Sefaria Developer Settings", he: "אישור כתובת הדוא״ל להגדרות המפתחים בספריא"}} /></h2>
          <p>
            <InterfaceText text={{
              en: "Someone, hopefully you, asked to set up Developer Settings on the Sefaria account that uses this address. Confirm it to continue. The link works for 3 days.",
              he: "מישהו, כנראה את/ה, ביקש להגדיר הגדרות מפתחים בחשבון ספריא שמשתמש בכתובת הזו. אשרו אותה כדי להמשיך. הקישור בתוקף 3 ימים.",
            }} />
          </p>
          <div className="devPocMockSsoActions">
            <button type="button" className="devPocMockSsoCancel" onClick={onCancel}>Close</button>
            <a
              className="devPocMockSsoContinue"
              href={confirmationLink(confirmationKey)}
              target="_blank"
              rel="noopener"
              ref={confirmRef}
              data-agent-action="mock-confirm-email"
              onClick={onCancel}
            >
              <InterfaceText text={{en: "Confirm my email", he: "אישור כתובת הדוא״ל"}} />
            </a>
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

/* Switching tabs or opening a project adds history entries, so Cancel steps back until it
   leaves settings. */
const SETTINGS_PATH = /^\/settings(\/|$)/;
const navigateBack = () => {
  if (window.history.length <= 2) {
    window.history.replaceState(null, null, '/texts');
    window.location.reload();
    return;
  }
  const onPop = () => {
    if (SETTINGS_PATH.test(window.location.pathname)) { window.history.back(); return; }
    window.removeEventListener("popstate", onPop);
  };
  window.addEventListener("popstate", onPop);
  window.history.back();
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
  en: "Something went wrong and your change wasn't saved. Please try again.",
  he: "משהו השתבש והשינוי לא נשמר. נסו שוב.",
};
const CONNECTED_MS = 8000;
const CONFIRMATION_POLL_MS = 3000;
const SETUP_MS = 1200;
const ARRIVAL_HIGHLIGHT_MS = 2400;

const SettingsPage = ({tab, projectId, accountSettings, initialDeveloper, setTab, setProjectId}) => {
  const settings = accountSettings || {};
  const socialProviders = settings.socialProviders || [];

  const [developerState, setDeveloperState] = useState(() => ({...emptyState(), ...(initialDeveloper || {})}));
  const [expandedProjectId, setExpandedProjectId] = useState(() => (
    projectId && ((initialDeveloper || {}).projects || []).some(p => p.id === projectId) ? projectId : null
  ));
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

  const pageMounted = useRef(true);
  useEffect(() => () => { pageMounted.current = false; }, []);

  /* N-C8: an email change on the Account tab resets confirmation (rule 14). Opening the Developer tab reads the
     state again, so its banner and disabled create buttons show without a reload. */
  const firstTab = useRef(true);
  useEffect(() => {
    if (firstTab.current) { firstTab.current = false; return; }
    if (tab !== "developer") { return; }
    readState().then(server => { if (pageMounted.current) { setDeveloperState(server); } }, () => {});
  }, [tab]);

  /* Every API call answers with the whole developer state, which replaces the page's copy. A
     failure leaves a notice, unless the caller shows the error itself ({quiet: true}); either
     way the promise rejects, so callers can tell. With {refresh: true} a failure also reloads
     the state, for answers to something the server may no longer offer. */
  const run = (request, {quiet, refresh} = {}) => request.then(data => {
    if (pageMounted.current) { setDeveloperState(data); }
    return data;
  }, err => {
    if (!quiet && pageMounted.current) { setNotice(err.message || Sefaria._v(SAVE_FAILED)); }
    if (refresh) {
      readState().then(server => { if (pageMounted.current) { setDeveloperState(server); } }, () => {});
    }
    throw err;
  });

  const expandProject = (id) => {
    setExpandedProjectId(id);
    setProjectId(id);
  };

  /* Back and forward change the project in the URL, and the open card follows it. */
  useEffect(() => { setExpandedProjectId(projectId || null); }, [projectId]);

  /* Set up once, developer settings stay open: an account whose email changed since keeps its
     projects and keys, and confirms the new address before creating more. */
  const developerOn = !!developerState.developerEnabled && (accountVerified(developerState) || !!developerState.profile);

  const onCreateProject = (fields) => run(createProject(fields), {quiet: true}).then(data => {
    setShowNewProject(false);
    expandProject(data.projectId);
  });

  /* A short loader before developer settings appear, so the change doesn't read as a reload. */
  const showDeveloper = (onReady) => {
    setSettingUp(true);
    clearTimeout(setupTimer.current);
    setupTimer.current = setTimeout(() => {
      setSettingUp(false);
      if (typeof window !== "undefined") { window.scrollTo(0, 0); }
      if (onReady) { onReady(); }
    }, SETUP_MS);
  };

  const startDeveloper = () => run(enableDeveloper()).then(() => showDeveloper(), () => {});

  const closeConfirm = (confirmed) => {
    if (confirmed && confirm && confirm.onConfirm) { confirm.onConfirm(); }
    setConfirm(null);
  };

  /* The confirmation link may be opened anywhere, and opening it turns developer settings on,
     so a page waiting for it checks every few seconds, and at once when a tab in this browser
     signals it. */
  const awaitingConfirmation = !accountVerified(developerState) && !!developerState.confirmationSentAt;
  useEffect(() => {
    if (!awaitingConfirmation) { return undefined; }
    let active = true;
    const check = () => readState().then(server => {
      if (active && server.emailVerified) {
        active = false;
        emailConfirmed(server);
      }
    }).catch(() => {});
    const timer = setInterval(check, CONFIRMATION_POLL_MS);
    const onStorage = (e) => { if (e.key === CONFIRMATION_SIGNAL_KEY) { check(); } };
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [awaitingConfirmation]);

  const emailConfirmed = (server) => {
    setMockEmailOpen(false);
    showDeveloper(() => {
      if (pageMounted.current) { setDeveloperState(server); }
      setConnectedMessage(Sefaria._v({en: "Your email is confirmed.", he: "כתובת הדוא״ל שלך אושרה."}));
      clearTimeout(connectedTimer.current);
      connectedTimer.current = setTimeout(() => setConnectedMessage(""), CONNECTED_MS);
    });
  };

  const mock = (action, fields) => run(mockAction(action, fields)).then(() => {
    if (action === "start-over") {
      setShowNewProject(false);
      setEditingProfile(false);
      setConfirm(null);
      setNotice("");
      expandProject(null);
    }
  }, () => {});

  /* The server sends no developer state where developer settings are off, and then there is no developer tab. */
  const tabs = SETTINGS_TABS.filter(t => t.tab !== "developer" || initialDeveloper);

  const panels = {
    account: <AccountTab settings={settings} socialProviders={socialProviders} />,
    developer: USE_DESIGN_E ? (
      <DeveloperE
        state={developerState}
        developerOn={developerOn}
        run={run}
        notice={notice}
        setNotice={setNotice}
        connectedMessage={connectedMessage}
      />
    ) : (
      <DeveloperTab
        state={developerState}
        developerOn={developerOn}
        highlight={arrivalHighlight}
        run={run}
        setConfirm={setConfirm}
        notice={notice}
        setNotice={setNotice}
        connectedMessage={connectedMessage}
        editingProfile={editingProfile}
        setEditingProfile={setEditingProfile}
        showNewProject={showNewProject}
        setShowNewProject={setShowNewProject}
        onCreateProject={onCreateProject}
        expandedProjectId={expandedProjectId}
        expandProject={expandProject}
        onStart={startDeveloper}
        settingUp={settingUp}
        active={tab === "developer"}
      />
    ),
  };

  return (
    <div
      className={"readerNavMenu settingsPage settingsPage-" + tab}
      key="settings"
      onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); } }}
    >
      <div className="content">
        <div className="contentInner">
          <div className="settingsShell">
            <SettingsNav tabs={tabs} tab={tab} highlightTab={arrivalHighlight ? tab : null} onSelect={setTab} />
            <div className="settingsPanels">
              {tabs.map(t => (
                <div key={t.tab} className="settingsPanel" hidden={tab !== t.tab}>{panels[t.tab]}</div>
              ))}
            </div>
          </div>
          {initialDeveloper ? <AgentInstructions /> : null}
        </div>
      </div>
      <div className="devPocPage">
        {confirm ? <ConfirmDialog confirm={confirm} onClose={closeConfirm} /> : null}
        {mockEmailOpen && developerState.mock && developerState.mock.confirmationKey ?
          <MockEmailDialog confirmationKey={developerState.mock.confirmationKey} onCancel={() => setMockEmailOpen(false)} /> : null}
        {developerState.mock ?
          <TestPanel state={developerState} mock={mock} onOpenMockEmail={() => setMockEmailOpen(true)} /> : null}
      </div>
    </div>
  );
};


/* Where the emailed confirmation link lands. It needs no login: confirming is a fact about
   the account, and the settings page carries on by itself wherever it is open. */
export const EmailConfirmedPage = () => {
  useEffect(() => {
    try { window.localStorage.setItem(CONFIRMATION_SIGNAL_KEY, String(Date.now())); } catch (e) { /* ignore */ }
  }, []);
  return (
    <div className="readerNavMenu settingsPage" key="emailConfirmed">
      <div className="content">
        <div className="contentInner">
          {/* Same layout as the confirmation steps in developer settings: no box, icon, title, one action. */}
          <div className="devPocPage devPocEmailConfirmed">
            <div className="devE-wrap devE-standalone">
              <section className="devE-card" aria-labelledby="devEConfirmedTitle">
                <div className="devE-head">
                  <span className="devE-ico ok" aria-hidden="true"><ECheckIcon size={24} /></span>
                  <h1 className="devE-title" id="devEConfirmedTitle"><InterfaceText text={{en: "Thank you for confirming your email", he: "תודה שאישרת את כתובת הדוא״ל"}} /></h1>
                </div>
                <div className="devE-form">
                  <a className="sefaria-common-button auth-primary fullwidth" href="/settings/developer?continue" data-agent-action="continue-to-developer-settings">
                    <InterfaceText text={{en: "Continue to Developer Settings", he: "המשך להגדרות המפתחים"}} />
                  </a>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


/* Where an emailed confirmation link lands when it can't confirm: it expired, was already
   used, or was sent to an address that is no longer the account email. Needs no login. */
export const EmailLinkPage = ({link}) => {
  const {status, key} = link || {};
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (!wait) { return; }
    const t = setTimeout(() => setWait(w => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const sendNewLink = () => requestNewLink(key).then(() => { setSent(true); setError(""); setWait(60); }, err => setError(
    err.message || Sefaria._v({en: "We couldn't send a new link. Ask for one in Developer Settings.", he: "לא הצלחנו לשלוח קישור חדש. בקשו קישור בהגדרות המפתחים."})
  ));
  const continueLink = (
    <a className="sefaria-common-button auth-primary fullwidth" href="/settings/developer?continue" data-agent-action="continue-to-developer-settings">
      <InterfaceText text={{en: "Continue to Developer Settings", he: "המשך להגדרות המפתחים"}} />
    </a>
  );
  /* Expired and old-address links share one screen and one button. The server sends a fresh link for an expired
     one without a login; a link to a former address can't be renewed from here (it must be for the account email),
     so its button opens developer settings, where the banner sends one to the current address. */
  const newLinkButton = status === "expired" ?
    <button className="sefaria-common-button auth-primary fullwidth" type="button" data-agent-action="send-new-link" onClick={sendNewLink}>
      <InterfaceText text={{en: "Send a new link", he: "שליחת קישור חדש"}} />
    </button> :
    <a className="sefaria-common-button auth-primary fullwidth" href="/settings/developer" data-agent-action="send-new-link">
      <InterfaceText text={{en: "Send a new link", he: "שליחת קישור חדש"}} />
    </a>;
  const deadLink = {
    title: {en: "This link no longer works", he: "הקישור כבר לא פעיל"},
    body: {
      en: "It has expired, or it was sent to an email address that is no longer on your Sefaria account.",
      he: "תוקפו פג, או שהוא נשלח לכתובת דוא״ל שכבר אינה משויכת לחשבון ספריא שלך.",
    },
    action: newLinkButton,
  };
  /* Once a new link is sent, the page turns into the setup's "Check your email" screen. It has no login, so it
     can't name the address; the link goes to the account email. */
  const checkEmail = {
    title: {en: "Check your email", he: "בדקו את תיבת הדוא״ל"},
    body: {en: "We sent a new confirmation link to your account email.", he: "שלחנו קישור אישור חדש לכתובת הדוא״ל של החשבון."},
    action: <p className="devE-hint devE-hintCenter" aria-live="polite">
      {tE("Didn't get the email?", "המייל לא הגיע?")}{" "}
      <button type="button" className="devE-inlineLink devE-linkBtn devE-resendLink" data-agent-action="send-new-link"
        disabled={!!wait} onClick={sendNewLink}>
        {wait ? vE("Resend in " + wait + "s", "שליחה חוזרת בעוד " + wait + " שנ׳") : tE("Resend link", "שליחה חוזרת")}
      </button>
    </p>,
  };
  const content = sent ? checkEmail : {
    "already-confirmed": {
      title: {en: "Already confirmed", he: "כבר אושר"},
      body: {en: "This email address is already confirmed.", he: "כתובת הדוא״ל הזו כבר אושרה."},
      action: continueLink,
      ok: true,
    },
    "expired": deadLink,
    "not-account-email": deadLink,
  }[status];
  if (!content) { return null; }
  return (
    <div className="readerNavMenu settingsPage" key="emailLink">
      <div className="content">
        <div className="contentInner">
          {/* Same layout as the confirmation steps in developer settings: no box, icon, title, one action. */}
          <div className="devPocPage devPocEmailConfirmed">
            <div className="devE-wrap devE-standalone">
              <section className="devE-card" aria-labelledby="devELinkTitle">
                <div className="devE-head">
                  <span className={"devE-ico" + (content.ok ? " ok" : "")} aria-hidden="true">{content.ok ? <ECheckIcon size={24} /> : <EMailIcon size={24} />}</span>
                  <h1 className="devE-title" id="devELinkTitle"><InterfaceText text={content.title} /></h1>
                  <p className="devE-lead devE-leadCenter"><InterfaceText text={content.body} /></p>
                </div>
                <div className="devE-form">
                  {content.action}
                  {error ? <p className="devE-hint devE-hintCenter devE-errorText" role="alert">{error}</p> : null}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


export default SettingsPage;
