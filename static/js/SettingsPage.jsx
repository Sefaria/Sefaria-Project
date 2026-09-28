import React, { useEffect, useRef, useState } from 'react';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';
import {
  MAX_KEYS_PER_PROJECT,
  POWERED_BY_LISTINGS,
  emptyState,
  makeKey,
  makeProject,
  sampleState,
  ssoConnected,
  usageSeries,
  websiteHost,
  writeState,
} from './developerPocStore';

/* Account and developer settings, one page with two tabs. Everything the developer tab
   shows is mock data saved through api/developer-poc/state; no key here authorizes
   anything. See developerPocStore.js. */

const KEY_SETUP_MS = 4000;

const maskKey = (value) => {
  const prefix = value.match(/^sfr_(?:test_)?/);
  return (prefix ? prefix[0] : "") + "••••••••••••";
};

const formatDate = (iso) => {
  if (!iso) { return "Never"; }
  try {
    return new Date(iso).toLocaleDateString("en-GB", {day: "numeric", month: "short", year: "numeric"});
  } catch (e) { return iso; }
};

const copyToClipboard = (text, node, onDone) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => onDone("Copied")).catch(() => onDone("Press ⌘C to copy"));
    return;
  }
  if (node && window.getSelection) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    onDone("Selected: press ⌘C");
    return;
  }
  onDone("Copy failed");
};


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

/* An "i" that opens on hover and on keyboard focus, and toggles on tap. */
const InfoTip = ({label, wide, children}) => {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="devPocTip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="devPocInfoButton"
        aria-expanded={open}
        aria-label={label}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(o => !o)}
      >i</button>
      {open ?
        <span className={"devPocPopover" + (wide ? " devPocPopoverWide" : "")} role="note">{children}</span> : null}
    </span>
  );
};


const PANEL_OPEN_KEY = "sefariaDeveloperPocPanelOpen";

const readPanelOpen = () => {
  try { return window.localStorage.getItem(PANEL_OPEN_KEY) === "1"; } catch (e) { return false; }
};

const writePanelOpen = (open) => {
  try { window.localStorage.setItem(PANEL_OPEN_KEY, open ? "1" : "0"); } catch (e) { /* ignore */ }
};

/* The POC test controls. Deliberately unlike the product: a floating panel pinned to the
   corner of the viewport, in colours the site never uses. Nothing in it is product UI. */
const PocTestPanel = ({state, realProviders, update, reset, showSimulate}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(readPanelOpen()); }, []);

  const toggle = (next) => { setOpen(next); writePanelOpen(next); };

  const realLabel = (realProviders || []).length
    ? "Real account: " + realProviders.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" + ") + " connected"
    : "Real account: no Google or Apple connection";
  const pretending = state.ssoOverride !== null;
  const connected = ssoConnected(state, realProviders);

  return (
    <div className="devPocPanel" data-open={open ? "true" : "false"}>
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
          <div className="devPocPanelGroupLabel">Account state</div>
          <label className="devPocPanelChoice">
            <input
              type="checkbox"
              className="devPocSwitch"
              checked={connected}
              onChange={e => update(s => ({...s, ssoOverride: e.target.checked}))}
              aria-label="Simulate SSO connected"
            />
            <span>Simulate: SSO {connected ? "connected" : "not connected"}</span>
          </label>
          <p className="devPocPanelNote">{realLabel}{pretending ? " (simulated value in use)" : ""}</p>
          {pretending ?
            <div className="devPocPanelRow">
              <button type="button" className="devPocPanelButton" onClick={() => update(s => ({...s, ssoOverride: null}))}>
                Use real status
              </button>
            </div> : null}
          <p className="devPocPanelNote">
            Connecting Google or Apple in this POC is auto-approved: no sign-in happens and no account changes.
          </p>
        </div>

        <div className="devPocPanelGroup">
          <div className="devPocPanelGroupLabel">Mock data</div>
          <div className="devPocPanelRow">
            <button type="button" className="devPocPanelButton" onClick={() => reset(sampleState())}>Reset to sample data</button>
            <button type="button" className="devPocPanelButton" onClick={() => reset(emptyState())}>Reset to empty</button>
          </div>
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


const SETTINGS_TABS = [
  {tab: "account", url: "/settings/account", label: "Account settings"},
  {tab: "developer", url: "/settings/developer", label: "Developer settings"},
];

/* Tabs, not links: clicking switches the mounted tab and pushes the matching URL. The
   anchors keep the addresses linkable, so opening one in a new tab still works. */
const SettingsNav = ({tab, onSelect}) => (
  <nav className="devPocNav" aria-label="Settings">
    <div className="devPocNavTitle">Settings</div>
    {SETTINGS_TABS.map(t => (
      <a
        key={t.tab}
        href={t.url}
        aria-current={tab === t.tab ? "page" : null}
        onClick={e => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) { return; }
          e.preventDefault();
          onSelect(t.tab);
        }}
      >{t.label}</a>
    ))}
  </nav>
);


/* The one way in. An account with Google or Apple goes straight in; any other account
   connects one first, then goes in. Developer settings stay on once they are on. */
const GetStarted = ({connected, card, settingUp, onStart, onConnectSso}) => {
  const [askSso, setAskSso] = useState(false);
  const start = () => { if (connected) { onStart(); } else { setAskSso(true); } };

  if (settingUp) {
    return (
      <div className={"devPocNotice devPocSettingUp" + (card ? " devPocCard" : "")} role="status">
        <span className="devPocSpinner" aria-hidden="true" />
        <strong>Setting up Developer settings&hellip;</strong>
      </div>
    );
  }

  if (askSso && !connected) {
    return (
      <div className={"devPocSsoPrompt" + (card ? " devPocCard" : "")} role="region" aria-label="Sign in with Google or Apple">
        <h2>Sign in once with Google or Apple</h2>
        <p>
          Developer settings need a Google or Apple sign-in, so we know the email we use to
          reach you about your keys is really yours.
        </p>
        <ul className="devPocList">
          <li>
            You're verifying the Sefaria account you're signed in to now
            {Sefaria._email ? <React.Fragment> (<strong>{Sefaria._email}</strong>)</React.Fragment> : null}.
            It doesn't add a second account.
          </li>
          <li>
            This changes how you sign in: from now on you'll use Google or Apple to sign in to
            this same account.
          </li>
        </ul>
        <div className="devPocActions">
          <button className="button small blue" type="button" onClick={() => onConnectSso("Google")}>Continue with Google</button>
          <button className="button small blue" type="button" onClick={() => onConnectSso("Apple")}>Continue with Apple</button>
          <button className="button small transparent" type="button" onClick={() => setAskSso(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className={"devPocGetStarted" + (card ? " devPocCard" : "")}>
      {card ? <h2>Build with the Sefaria API</h2> : null}
      <p>
        Get an API key to use Sefaria's texts in your own website, app or tool, and tell us
        what you're building.
      </p>
      <div className="devPocActions">
        <button className="button small blue" type="button" onClick={start}>Get started</button>
      </div>
    </div>
  );
};


const emptyProfile = () => ({
  developerName: "", description: "", additionalEmail: "",
  termsAccepted: false, developerNews: false, notADeveloper: false,
});

const ABOUT_YOU_HELP = "A sentence or two about you and what you work on. It helps us understand your project if we need to get in touch.";

const API_TERMS_URL = "/api-terms";

/* The terms open in a new tab, so the form keeps what has been typed. */
const TermsLink = () => (
  <a href={API_TERMS_URL} target="_blank" rel="noopener noreferrer">Sefaria API terms</a>
);

/* Non-developers get the explanations inline; developers get them behind the "i". */
const AboutYouFields = ({fields, set, novice}) => (
  <React.Fragment>
    <label className="devPocChoice devPocNoviceChoice">
      <input type="checkbox" checked={fields.notADeveloper} onChange={e => set("notADeveloper", e.target.checked)} />
      <span>
        I don't write code myself
        <span className="devPocHelp">
          For example, you build with AI tools, or someone else writes the code. We'll explain
          each step in plain language.
        </span>
      </span>
    </label>
    <div className="devPocField">
      <label htmlFor="devPocName">Name</label>
      <input id="devPocName" value={fields.developerName} onChange={e => set("developerName", e.target.value)} />
      <p className="devPocHelp">You, your team, or your organization.</p>
    </div>
    <div className="devPocField">
      <div className="devPocLabelRow">
        <label htmlFor="devPocDescription">What you work on <span className="devPocMuted">(optional)</span></label>
        {novice ? null : <InfoTip label="Why we ask about you">{ABOUT_YOU_HELP}</InfoTip>}
      </div>
      <input id="devPocDescription" value={fields.description} onChange={e => set("description", e.target.value)} />
      {novice ? <p className="devPocHelp">{ABOUT_YOU_HELP}</p> : null}
    </div>
    <div className="devPocField">
      <label htmlFor="devPocEmail2">Also send project and key emails to <span className="devPocMuted">(optional)</span></label>
      <input id="devPocEmail2" type="email" value={fields.additionalEmail} onChange={e => set("additionalEmail", e.target.value)} />
      <p className="devPocHelp">
        We always email your account address{Sefaria._email ? " (" + Sefaria._email + ")" : ""}.
        {novice
          ? " Add another address, like a work address or a colleague who looks after the project, and it gets the same emails."
          : " An address added here, such as a work address or a team inbox, gets the same emails."}
      </p>
    </div>
  </React.Fragment>
);

/* The legal part of the profile: one required agreement (terms, and email about keys and
   projects) and one optional opt-in (developer news and promotions). */
const LegalFields = ({fields, set, accepted, novice}) => (
  <section className="devPocLegal" aria-label="Terms and emails">
    {accepted ?
      <p className="devPocHelp devPocAccepted">
        You've accepted the <TermsLink />, and agreed that Sefaria
        may email you about your API keys and contact you about your projects.
      </p> :
      <label className="devPocChoice">
        <input type="checkbox" checked={fields.termsAccepted} onChange={e => set("termsAccepted", e.target.checked)} />
        <span>
          I accept the <TermsLink />, and agree that Sefaria may
          email me about my API keys and contact me about my projects
          <span className="devPocHelp">
            {novice ? "Required. You need this to get a key." : "Required to create projects and keys."}
          </span>
        </span>
      </label>}
    <label className="devPocChoice">
      <input type="checkbox" checked={!!fields.developerNews} onChange={e => set("developerNews", e.target.checked)} />
      <span>
        Send me Sefaria's developer news and promotional emails <span className="devPocMuted">(optional)</span>
        <span className="devPocHelp">New features, events and ideas for building with Sefaria. You can unsubscribe at any time.</span>
      </span>
    </label>
  </section>
);

const profileError = (fields) => {
  if (!fields.developerName.trim()) { return "Enter your name."; }
  if (fields.additionalEmail.trim() && !/^\S+@\S+\.\S+$/.test(fields.additionalEmail.trim())) { return "Enter a valid additional email, or leave it empty."; }
  if (!fields.termsAccepted) { return "Accept the API terms to continue."; }
  return "";
};

const cleanProfile = (fields) => ({
  ...fields, developerName: fields.developerName.trim(), additionalEmail: fields.additionalEmail.trim(),
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
      <h2>About you</h2>
      <p className="devPocHelp devPocLead">
        This takes a minute. Next, you'll describe your project and get a key.
      </p>
      <form className="devPocForm" onSubmit={finish}>
        <AboutYouFields fields={fields} set={set} novice={fields.notADeveloper} />
        <LegalFields fields={fields} set={set} accepted={false} novice={fields.notADeveloper} />
        {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
        <div className="devPocActions">
          <button type="submit" className="button small blue">Continue</button>
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
      <AboutYouFields fields={fields} set={set} novice={fields.notADeveloper} />
      <LegalFields fields={fields} set={set} accepted={!!(profile && profile.termsAccepted)} novice={fields.notADeveloper} />
      {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
      <div className="devPocActions">
        <button type="submit" className="button small blue">Save profile</button>
        {onCancel ? <button type="button" className="button small transparent" onClick={onCancel}>Cancel</button> : null}
      </div>
    </form>
  );
};


const ListingPicker = ({listing, novice, onPick, onClear}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const results = normalized.length >= 2
    ? POWERED_BY_LISTINGS.filter(l => (l.name + " " + l.url).toLowerCase().includes(normalized))
    : [];

  if (listing) {
    return (
      <div className="devPocListingSearch devPocListingPending">
        <p>
          <span className="devPocBadge devPocBadgePending">Link requested</span>{" "}
          <strong>{listing.name}</strong> <span className="devPocMuted">({listing.url})</span>
        </p>
        <p className="devPocHelp">
          {novice
            ? "Someone at Sefaria will check it and connect the two. Until then it shows as requested."
            : "Pending until Sefaria confirms it. Your project and the listing stay separate records, linked together."}
        </p>
        <button type="button" className="devPocTextButton" onClick={onClear}>Cancel request</button>
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" className="devPocTextButton" onClick={() => setOpen(true)}>
        Already on Powered by Sefaria? Find your listing
      </button>
    );
  }
  return (
    <div className="devPocListingSearch">
      <div className="devPocField">
        <label htmlFor="devPocListingSearch">Find your listing</label>
        <input
          id="devPocListingSearch"
          type="search"
          placeholder="Project name or website"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <p className="devPocHelp">Search by the name or website it's listed under.</p>
      </div>
      {normalized.length >= 2 && results.length === 0 ?
        <p className="devPocHelp">No listings match. Try another name or website.</p> : null}
      {results.map(l => (
        <div className="devPocResult" key={l.url}>
          <div>
            <strong>{l.name}</strong> <span className="devPocMuted">{l.url}</span>
            <p className="devPocHelp">{l.description}</p>
          </div>
          <button type="button" className="button small white" onClick={() => { onPick(l); setOpen(false); }}>Request link</button>
        </div>
      ))}
      <p className="devPocHelp">
        {novice
          ? "Sefaria checks each request before connecting it, because anyone can submit a listing."
          : "Sefaria confirms each request, because someone else may have submitted the listing. The listing and your project stay separate records, linked together."}
      </p>
      <button type="button" className="devPocTextButton" onClick={() => setOpen(false)}>Close search</button>
    </div>
  );
};


const ProjectFields = ({fields, set, novice}) => (
  <React.Fragment>
    <div className="devPocField">
      <label htmlFor="devPocProjectName">Project name</label>
      <input id="devPocProjectName" value={fields.name} onChange={e => set("name", e.target.value)} />
    </div>
    <div className="devPocField">
      <label htmlFor="devPocProjectDescription">Short description</label>
      <input id="devPocProjectDescription" value={fields.description} onChange={e => set("description", e.target.value)} />
      <p className="devPocHelp">
        {novice
          ? "One sentence, for example: a daily study tracker for my community."
          : "One sentence on what it does."}
      </p>
    </div>
    <div className="devPocField">
      <label htmlFor="devPocProjectOrg">Organization <span className="devPocMuted">(optional)</span></label>
      <input id="devPocProjectOrg" value={fields.organization} onChange={e => set("organization", e.target.value)} />
    </div>
    <div className="devPocField">
      <label htmlFor="devPocProjectUrl">Website <span className="devPocMuted">(optional)</span></label>
      <input
        id="devPocProjectUrl"
        placeholder="https://"
        value={fields.websiteUrl}
        onChange={e => set("websiteUrl", e.target.value)}
      />
      <p className="devPocHelp">
        {novice
          ? "The address people visit to use your project. We show it with your project on Powered by Sefaria, and you can use it to keep your key from working anywhere else."
          : "Shown with your project on Powered by Sefaria, and lets you limit a key to your site."}
        {" "}No website yet? You can add it later.
      </p>
    </div>
    <label className="devPocChoice">
      <input type="checkbox" checked={fields.aiAssisted} onChange={e => set("aiAssisted", e.target.checked)} />
      <span>
        Built with help from AI tools
        <span className="devPocHelp">
          {novice
            ? "Tick this if an AI tool wrote some or all of the code. It helps us learn how people build."
            : "Helps us learn how people build on Sefaria."}
        </span>
      </span>
    </label>
    <fieldset className="devPocFieldset">
      <legend>Visibility</legend>
      <label className="devPocChoice">
        <input type="radio" name="devPocVisibility" checked={fields.visibility === "private"} onChange={() => set("visibility", "private")} />
        <span>Private<span className="devPocHelp">Only you and the Sefaria team can see this project.</span></span>
      </label>
      <label className="devPocChoice">
        <input type="radio" name="devPocVisibility" checked={fields.visibility === "public"} onChange={() => set("visibility", "public")} />
        <span>
          Public
          <span className="devPocHelp">
            Sefaria may show this project on Powered by Sefaria, our gallery of projects built
            with Sefaria. We choose what to feature, so it may not appear.
          </span>
        </span>
      </label>
      {fields.visibility === "public" ?
        <div className="devPocListingArea">
          <ListingPicker
            listing={fields.listingRequest}
            novice={novice}
            onPick={l => set("listingRequest", l)}
            onClear={() => set("listingRequest", null)}
          />
        </div> : null}
    </fieldset>
  </React.Fragment>
);


/* The only dialog in the project flow: the form itself stays on the page. */
const NoWebsiteDialog = ({novice, onAddWebsite, onSaveAnyway}) => (
  <div className="devPocModalStage devPocConfirmStage" role="dialog" aria-modal="true" aria-label="Save without a website?">
    <section className="devPocDialog">
      <h2>Save without a website?</h2>
      <p>A website helps your project in two ways:</p>
      <ul className="devPocList">
        <li>We show it alongside your project on Powered by Sefaria.</li>
        <li>
          {novice
            ? "You can make your key work only on your site, so a copied key is no use anywhere else."
            : "You can limit a key so it only works on your site."}
        </li>
      </ul>
      <p>No website yet? That's fine. You can add it later with <strong>Edit project</strong>.</p>
      <div className="devPocActions">
        <button type="button" className="button small white" onClick={onAddWebsite}>Add a website</button>
        <button type="button" className="button small blue" onClick={onSaveAnyway}>Save without a website</button>
      </div>
    </section>
  </div>
);


/* One form for creating and editing a project. A missing website asks once before saving,
   and the website field gets focus if the developer goes back to add one. */
const ProjectForm = ({initial, novice, submitLabel, onSave, onCancel, onDelete}) => {
  const [fields, setFields] = useState(initial);
  const [error, setError] = useState("");
  const [askWebsite, setAskWebsite] = useState(false);
  const formRef = useRef(null);
  const set = (key, value) => { setFields(f => ({...f, [key]: value})); setError(""); };

  const save = () => onSave({
    ...fields, name: fields.name.trim(), description: fields.description.trim(),
    organization: fields.organization.trim(), websiteUrl: fields.websiteUrl.trim(),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!fields.name.trim()) { setError("Enter a project name."); return; }
    if (!fields.description.trim()) { setError("Enter a short description."); return; }
    setError("");
    if (!fields.websiteUrl.trim()) { setAskWebsite(true); return; }
    save();
  };

  const addWebsite = () => {
    setAskWebsite(false);
    const input = formRef.current && formRef.current.querySelector("#devPocProjectUrl");
    if (input) { input.focus(); }
  };

  return (
    <React.Fragment>
      <form className="devPocForm" onSubmit={submit} ref={formRef}>
        <ProjectFields fields={fields} set={set} novice={novice} />
        <p className="devPocHelp">This project belongs to your Sefaria account and can't be moved to another account.</p>
        {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
        <div className="devPocActions">
          <button type="submit" className="button small blue">{submitLabel}</button>
          <button type="button" className="button small transparent" onClick={onCancel}>Cancel</button>
          {onDelete ?
            <button type="button" className="button small transparent devPocDanger" onClick={onDelete}>Delete project</button> : null}
        </div>
      </form>
      {askWebsite ?
        <NoWebsiteDialog novice={novice} onAddWebsite={addWebsite} onSaveAnyway={() => { setAskWebsite(false); save(); }} /> : null}
    </React.Fragment>
  );
};

const newProjectFields = () => ({
  name: "", description: "", organization: "", websiteUrl: "",
  visibility: "private", aiAssisted: false, listingRequest: null,
});

/* The new-project form opens in place at the top of the project list. */
const NewProjectPanel = ({novice, onCreate, onCancel}) => {
  const panelRef = useRef(null);
  useEffect(() => {
    const input = panelRef.current && panelRef.current.querySelector("#devPocProjectName");
    if (input) { input.focus(); }
  }, []);
  return (
    <section className="devPocNewProject devPocCard" ref={panelRef} aria-label="New project">
      <h2>New project</h2>
      <p className="devPocHelp devPocLead">
        {novice ? "Tell us what you're building. You'll get a key right after." : "You can add keys once it's saved."}
      </p>
      <ProjectForm
        initial={newProjectFields()}
        novice={novice}
        submitLabel="Create project"
        onSave={onCreate}
        onCancel={onCancel}
      />
    </section>
  );
};


const RestrictionToggle = ({project, apiKey, novice, onToggle}) => {
  const host = websiteHost(project.websiteUrl);
  return (
    <div className="devPocRestriction">
      <div className="devPocRestrictionRow">
        <label className="devPocChoice">
          <input
            type="checkbox"
            className="devPocSwitch"
            checked={!!apiKey.restrictToWebsite}
            onChange={e => onToggle(e.target.checked)}
            aria-label={"Only allow " + apiKey.label + " on " + host}
          />
          <span>Only allow this key on <code>{host}</code></span>
        </label>
        {novice ? null :
          <InfoTip label="What does this do?" wide>
            Sefaria refuses requests with this key that come from web pages on any other site.
            Turn it on when the key is in code that runs in the browser, where anyone can read
            it. Leave it off for servers, scripts and apps: their requests don't come from a
            web page, so they would be refused. A determined attacker can get around it; it
            stops casual copying.
          </InfoTip>}
      </div>
      {novice ?
        <React.Fragment>
          <p className="devPocHelp">
            Turn this on if your key is inside a web page people visit. Then a copied key won't
            work on anyone else's site.
          </p>
          <p className="devPocHelp">
            Leave it off if your key is used anywhere else, or your own project will stop working.
          </p>
        </React.Fragment> : null}
    </div>
  );
};


const KeyValue = ({value}) => {
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

  return (
    <div className="devPocKeyValue">
      <code ref={codeRef}>{shown ? value : maskKey(value)}</code>
      <button
        type="button"
        className="devPocIconButton"
        aria-pressed={shown}
        aria-label={shown ? "Hide key" : "Show key"}
        title={shown ? "Hide key" : "Show key"}
        onClick={() => setShown(s => !s)}
      >{shown ? <EyeOffIcon /> : <EyeIcon />}</button>
      <button
        type="button"
        className="devPocIconButton"
        aria-label="Copy key"
        title="Copy key"
        onClick={copy}
      ><CopyIcon /></button>
      <span className="devPocCopied" role="status">{copied}</span>
    </div>
  );
};


const KeyRow = ({project, apiKey, novice, isNew, onToggleRestriction, onDelete, onAddWebsite}) => (
  <article className={"devPocKey" + (isNew ? " devPocKeyNew" : "")}>
    <div className="devPocKeyHeading">
      <strong>{apiKey.label}</strong>
      <button type="button" className="button small transparent devPocDanger" onClick={onDelete}>Delete key</button>
    </div>
    <KeyValue value={apiKey.value} />
    <div className="devPocKeyMeta">
      <span>Created {formatDate(apiKey.created)}</span>
      <span>Last used {formatDate(apiKey.lastUsed)}</span>
      <span>{apiKey.requests30.toLocaleString()} requests in the last 30 days</span>
    </div>
    {isNew ?
      <p className="devPocKeyReady" role="status">
        {novice ? "Ready to use. Copy it into your tool." : "Ready to use."}
      </p> : null}
    {project.websiteUrl ?
      <RestrictionToggle project={project} apiKey={apiKey} novice={novice} onToggle={onToggleRestriction} /> :
      novice ? null :
      <p className="devPocHelp">
        Want this key to work only on your website?{" "}
        <button type="button" className="devPocTextButton devPocInlineButton" onClick={onAddWebsite}>Add your website</button>
        {" "}to the project, then switch it on here.
      </p>}
  </article>
);


const KEY_HIGHLIGHT_MS = 4000;

const KeysSection = ({project, novice, update, setConfirm, onAddWebsite}) => {
  const [creating, setCreating] = useState(false);   // showing the label form
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState("idle");        // idle | setting-up | error
  const [error, setError] = useState("");
  const [newKeyId, setNewKeyId] = useState(null);
  const timer = useRef(null);
  const highlightTimer = useRef(null);

  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(highlightTimer.current); }, []);

  const atLimit = project.keys.length >= MAX_KEYS_PER_PROJECT;
  const firstKeyPrompt = project.keys.length === 0 && !creating && phase === "idle";
  const startCreating = () => { setCreating(true); setPhase("idle"); setError(""); };

  const startCreate = (e) => {
    e.preventDefault();
    if (!label.trim()) { setError("Give the key a name."); return; }
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
    title: "Delete “" + apiKey.label + "”?",
    body: novice
      ? "The key stops working right away, and anything that uses it will stop working too. You can't undo this."
      : "This key for " + project.name + " stops working immediately, and requests that use it will be refused. You can't undo this.",
    actionLabel: "Delete key",
    onConfirm: () => update(s => ({
      ...s,
      projects: s.projects.map(p => p.id !== project.id ? p : {...p, keys: p.keys.filter(k => k.id !== apiKey.id)}),
    })),
  });

  return (
    <section className="devPocSection">
      <div className="devPocHeading">
        <div>
          <h3>API keys</h3>
          <p className="devPocHelp">{project.keys.length} of {MAX_KEYS_PER_PROJECT} keys</p>
          {novice ?
            <p className="devPocHelp">
              A key is like a password that lets your project use Sefaria. Paste it wherever your
              tool asks for a Sefaria API key, and keep it private.
            </p> :
            <p className="devPocHelp">
              Send the key in the <code>x-api-key</code> header of each request.{" "}
              <InfoTip label="What is a header?">
                A header is a named value sent along with a request. Add one called x-api-key,
                with your key as its value, to every call your project makes to Sefaria.
              </InfoTip>
              {" "}You can come back and copy a key at any time.
            </p>}
        </div>
        {creating || (novice && firstKeyPrompt) ? null :
          <button
            type="button"
            className="button small blue"
            disabled={atLimit}
            onClick={startCreating}
          >Create key</button>}
      </div>
      {atLimit ?
        <p className="devPocNotice">
          {novice
            ? "You have " + MAX_KEYS_PER_PROJECT + " keys, the most a project can have. Delete one you don't use to make room."
            : "A project can have up to " + MAX_KEYS_PER_PROJECT + " keys. Delete one to create another."}
        </p> : null}

      {creating && phase === "idle" ?
        <form className="devPocForm devPocCreateKey" onSubmit={startCreate}>
          <div className="devPocField">
            <label htmlFor="devPocKeyLabel">Key name</label>
            <input id="devPocKeyLabel" value={label} onChange={e => setLabel(e.target.value)} />
            <p className="devPocHelp">
              {novice
                ? "A name just for you, so you can tell your keys apart. For example: My website."
                : "For telling your keys apart, for example Production or Local testing."}
            </p>
          </div>
          {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
          <div className="devPocActions">
            <button type="submit" className="button small blue">Create key</button>
            <button type="button" className="button small transparent" onClick={() => { setCreating(false); setError(""); }}>Cancel</button>
          </div>
        </form> : null}
      {phase === "setting-up" ?
        <div className="devPocNotice devPocSettingUp" role="status">
          <span className="devPocSpinner" aria-hidden="true" />
          <span>
            <strong>Setting up your key&hellip;</strong>
            <span className="devPocHelp">This takes a few seconds.</span>
          </span>
        </div> : null}
      {phase === "error" ?
        <div className="devPocWarning" role="alert">
          <strong>We couldn't create your key.</strong>
          <p>Nothing was created. Please try again.</p>
          <button type="button" className="button small white" onClick={() => setPhase("idle")}>Try again</button>
        </div> : null}

      {firstKeyPrompt ?
        <div className="devPocInset devPocInsetEmpty">
          {novice ?
            <div className="devPocActions">
              <button type="button" className="button small blue" onClick={startCreating}>Create your first key</button>
            </div> :
            <p>Create a key to start making requests.</p>}
        </div> : null}
      {project.keys.length ?
        <div className="devPocInset">
          <div className="devPocKeyList">
            {project.keys.map(k => (
              <KeyRow
                key={k.id}
                project={project}
                apiKey={k}
                novice={novice}
                isNew={k.id === newKeyId}
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
  if (project.listingRequest) {
    return "Link to the " + project.listingRequest.name + " listing requested. Waiting for Sefaria to confirm.";
  }
  if (project.visibility === "public") {
    return "Public: Sefaria may show it on Powered by Sefaria.";
  }
  return "Private: not shown on Powered by Sefaria.";
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
      aria-label="Requests by key over the last 30 days"
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
      aria-label="Daily requests over the last 30 days"
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


const UsageSection = ({project, novice}) => {
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
        <div><h3>Usage</h3></div>
      </div>
      <div className="devPocStats">
        <div className="devPocStat">
          <strong>{total.toLocaleString()}</strong>
          <span>{novice ? "Times your project used Sefaria in the last 30 days" : "Requests in the last 30 days"}</span>
        </div>
        <div className="devPocStat">
          <strong>{formatDate(project.usage.lastUsed)}</strong>
          <span>{novice ? "Last used" : "Last request"}</span>
        </div>
      </div>
      <div className="devPocChartBlock">
        <p className="devPocChartTitle">Requests per day</p>
        <UsageChart series={daily} />
        <div className="devPocChartAxis">
          <span>30 days ago</span>
          <span>Today</span>
        </div>
      </div>
      <div className="devPocChartBlock">
        <p className="devPocChartTitle">Requests by key</p>
        <div className="devPocSplit">
          <UsageDonut slices={slices} total={total} />
          <ul className="devPocLegend">
            {slices.map(slice => (
              <li className="devPocLegendRow" key={slice.id}>
                <span className="devPocSwatch" style={{background: slice.color}} aria-hidden="true" />
                <span className="devPocLegendLabel">{slice.label}</span>
                <span className="devPocLegendValue">{slice.value.toLocaleString()}</span>
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


const ProjectCard = ({project, expanded, novice, update, setConfirm, onToggleExpand, notice}) => {
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
    update(s => ({
      ...s,
      projects: s.projects.map(p => p.id !== project.id ? p : {
        ...p,
        ...fields,
        websiteUrl: fields.websiteUrl.trim(),
        keys: losingUrl ? p.keys.map(k => ({...k, restrictToWebsite: false})) : p.keys,
      }),
    }));
    setEditing(false);
    if (losingUrl && restrictedKeys.length) {
      notice(novice
        ? restrictedKeys.join(", ") + " now works anywhere again, because the project no longer has a website."
        : "“Only allow this key on your site” is now off for " + restrictedKeys.join(", ") + ", because the project no longer has a website.");
    }
  };

  const deleteProject = () => setConfirm({
    title: "Delete " + project.name + "?",
    body: project.keys.length
      ? (novice
        ? "These keys stop working right away: " + project.keys.map(k => k.label).join(", ") + ". You can't get the project or its keys back."
        : "These keys stop working immediately: " + project.keys.map(k => k.label).join(", ") + ". You can't undo this.")
      : "This project has no keys. You can't undo this.",
    actionLabel: "Delete project",
    onConfirm: () => update(s => ({
      ...s,
      projects: s.projects.filter(p => p.id !== project.id),
      expandedProjectId: s.expandedProjectId === project.id ? null : s.expandedProjectId,
    })),
  });

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
              <span>{project.name}</span>
            </button>
          </h2>
        </div>
        <p className="devPocProjectDescription">{project.description}</p>
        <p className="devPocProjectMeta">
          {project.organization ? project.organization + " · " : ""}
          {project.keys.length} {project.keys.length === 1 ? "key" : "keys"}
          {project.websiteUrl ? " · " + websiteHost(project.websiteUrl) : ""}
        </p>
        <p className="devPocProjectMeta">{listingStatus(project)}</p>
        <div className="devPocProjectBadgeRow">
          <div className="devPocBadges">
            <span className="devPocBadge">{project.visibility === "public" ? "Public" : "Private"}</span>
            {project.aiAssisted ? <span className="devPocBadge">Built with AI tools</span> : null}
          </div>
          {expanded ?
            <button type="button" className="button small transparent devPocProjectEdit" onClick={() => setEditing(e => !e)}>
              {editing ? "Close editor" : "Edit project"}
            </button> : null}
        </div>
      </header>
      {expanded ?
        <div className="devPocProjectBody">
          {editing ?
            <section className="devPocSection">
              <div className="devPocHeading">
                <div><h3>Project details</h3></div>
              </div>
              <ProjectForm
                initial={{
                  name: project.name, description: project.description, organization: project.organization,
                  websiteUrl: project.websiteUrl, visibility: project.visibility, aiAssisted: project.aiAssisted,
                  listingRequest: project.listingRequest,
                }}
                novice={novice}
                submitLabel="Save project"
                onSave={saveProject}
                onCancel={() => setEditing(false)}
                onDelete={deleteProject}
              />
            </section> : null}
          <KeysSection project={project} novice={novice} update={update} setConfirm={setConfirm} onAddWebsite={addWebsite} />
          {project.keys.length ? <UsageSection project={project} novice={novice} /> : null}
        </div> : null}
    </article>
  );
};


const ConfirmDialog = ({confirm, onClose}) => (
  <div className="devPocModalStage devPocConfirmStage" role="dialog" aria-label={confirm.title}>
    <section className="devPocDialog">
      <h2>{confirm.title}</h2>
      <p>{confirm.body}</p>
      <div className="devPocActions">
        <button type="button" className="button small white" onClick={() => onClose(false)}>Cancel</button>
        <button type="button" className="button small devPocDanger" onClick={() => onClose(true)}>{confirm.actionLabel}</button>
      </div>
    </section>
  </div>
);


const ExternalIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </svg>
);

const API_DOCS_URL = "https://developers.sefaria.org/reference/getting-started";

const DeveloperTab = ({state, socialProviders, navOn, update, setConfirm, notice, setNotice,
                       connectedMessage, editingProfile, setEditingProfile, showNewProject,
                       setShowNewProject, onCreateProject, onSelectTab, setProjectId, onStart,
                       onConnectSso, settingUp}) => {
  const novice = !!(state.profile && state.profile.notADeveloper);

  const toggleExpand = (project) => {
    const expandedProjectId = state.expandedProjectId === project.id ? null : project.id;
    update(s => ({...s, expandedProjectId}));
    setProjectId(expandedProjectId);
  };

  const newProjectButton = (label, className) => (
    <button type="button" className={"button small " + className} onClick={() => setShowNewProject(true)}>{label}</button>
  );

  return (
    <div className="devPocPage">
      <div className={"devPocShell" + (navOn ? "" : " devPocShellNoNav")}>
        {navOn ? <SettingsNav tab="developer" onSelect={onSelectTab} /> : null}
        <main className="devPocMain">
          <header className="devPocPageHeader">
            <div>
              <h1>Developer settings</h1>
              <p>
                {novice
                  ? "Tell us what you're building, and get a key for it."
                  : "Register your projects and manage their API keys."}
              </p>
            </div>
            <a className="devPocDocsLink" href={API_DOCS_URL} target="_blank" rel="noreferrer">
              <span>API documentation</span>
              <ExternalIcon />
            </a>
          </header>

          {connectedMessage ?
            <div className="devPocSuccess" role="status"><p>{connectedMessage}</p></div> : null}

          {!navOn ?
            <GetStarted
              connected={ssoConnected(state, socialProviders)}
              card={true}
              settingUp={settingUp}
              onStart={onStart}
              onConnectSso={onConnectSso}
            /> :
            !state.profile ?
            <ProfileOnboarding onSave={profile => update(s => ({...s, profile}))} /> :
            <React.Fragment>
              {notice ?
                <div className="devPocNotice" role="status">
                  <p>{notice}</p>
                  <button type="button" className="button small transparent" onClick={() => setNotice("")}>Dismiss</button>
                </div> : null}

              <section className="devPocProfile">
                {editingProfile ?
                  <React.Fragment>
                    <h2>About you</h2>
                    <ProfileForm
                      profile={state.profile}
                      onSave={profile => { update(s => ({...s, profile})); setEditingProfile(false); }}
                      onCancel={() => setEditingProfile(false)}
                    />
                  </React.Fragment> :
                  <div className="devPocProfileSummary">
                    <span>
                      <strong>{state.profile.developerName}</strong>
                      <span className="devPocHelp">
                        {Sefaria._email}{state.profile.additionalEmail ? " and " + state.profile.additionalEmail : ""}
                        {state.profile.description ? " · " + state.profile.description : ""}
                      </span>
                    </span>
                    <button type="button" className="button small transparent" onClick={() => setEditingProfile(true)}>Edit</button>
                  </div>}
              </section>

              <div className="devPocSectionHeading">
                <h2>Projects</h2>
                {state.projects.length && !showNewProject ? newProjectButton("New project", "white") : null}
              </div>

              {showNewProject ?
                <NewProjectPanel novice={novice} onCreate={onCreateProject} onCancel={() => setShowNewProject(false)} /> :
                state.projects.length === 0 ?
                <div className="devPocEmpty">
                  <h2>{novice ? "Your first project starts here" : "No projects yet"}</h2>
                  <p>
                    {novice
                      ? "Tell us what you're building. You'll get a key right after."
                      : "Create a project, then add keys to it."}
                  </p>
                  <div className="devPocActions">
                    {newProjectButton(novice ? "Create your first project" : "New project", "blue")}
                  </div>
                  <p className="devPocHelp">A project can be shown on Powered by Sefaria even without a key.</p>
                </div> : null}

              {state.projects.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  expanded={state.expandedProjectId === p.id}
                  novice={novice}
                  update={update}
                  setConfirm={setConfirm}
                  notice={setNotice}
                  onToggleExpand={() => toggleExpand(p)}
                />
              ))}
            </React.Fragment>}
        </main>
      </div>
    </div>
  );
};


/* The mock provider chooser. It stands in for the Google or Apple sign-in window, and
   offers the Sefaria account's own email, because that is the account being verified. */
const MockSsoDialog = ({provider, onCancel, onContinue}) => {
  const continueRef = useRef(null);
  const email = Sefaria._email || "you@example.org";
  const name = Sefaria.full_name || email.split("@")[0];
  const initials = name.split(/\s+/).map(w => w.charAt(0)).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    if (continueRef.current) { continueRef.current.focus(); }
    const onKeyDown = (e) => { if (e.key === "Escape") { onCancel(); } };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="devPocMockSso" role="dialog" aria-modal="true" aria-label="Choose an account">
      <div className="devPocMockSsoBackdrop" onClick={onCancel} />
      <div className="devPocMockSsoDialog">
        <p className="devPocMockSsoBanner">MOCK &mdash; no real sign-in happens</p>
        <div className="devPocMockSsoBody">
          <p className="devPocMockSsoBrand">{provider}</p>
          <h2>Choose an account</h2>
          <p className="devPocMockSsoSub">to continue to Sefaria</p>
          <div className="devPocMockSsoAccount">
            <span className="devPocMockSsoAvatar" aria-hidden="true">{initials}</span>
            <span className="devPocMockSsoAccountText">
              <strong>{name}</strong>
              <span>{email}</span>
            </span>
          </div>
          <div className="devPocMockSsoActions">
            <button type="button" className="devPocMockSsoCancel" onClick={onCancel}>Cancel</button>
            <button type="button" className="devPocMockSsoContinue" ref={continueRef} onClick={onContinue}>Continue</button>
          </div>
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

const AccountTab = ({settings, pocState, socialProviders, navOn, onSelectTab, onStart, onConnectSso, settingUp}) => {
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

  const connected = ssoConnected(pocState, socialProviders);
  const developerOn = connected && !!pocState.developerEnabled;

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
      <div className={"devPocShell" + (navOn ? "" : " devPocShellNoNav")}>
        {navOn ? <SettingsNav tab="account" onSelect={onSelectTab} /> : null}
        <div className="devPocSettingsBody">
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

          <div id="developerSettings" className="section">
            <label className="control-elem">Developer Settings</label>
            {developerOn ?
              <div className="additional-info devPocOn">
                Your projects and API keys are in{" "}
                <a href="/settings/developer" onClick={e => { e.preventDefault(); onSelectTab("developer"); }}>Developer settings</a>.
              </div> :
              <GetStarted connected={connected} card={false} settingUp={settingUp} onStart={onStart} onConnectSso={onConnectSso} />}
          </div>

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
    </div>
  );
};


const SAVE_FAILED = "Couldn't save the POC state. Your changes are only in this browser tab.";
const CONNECTED_MS = 8000;
const SETUP_MS = 1200;

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
  const [mockSso, setMockSso] = useState(null);
  const [connectedMessage, setConnectedMessage] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const connectedTimer = useRef(null);
  const setupTimer = useRef(null);

  useEffect(() => () => { clearTimeout(connectedTimer.current); clearTimeout(setupTimer.current); }, []);

  /* The UI updates first and the write follows; a failed write only leaves a notice.
     Updates read through a ref, so a change made while a key is being "created" still
     builds on the newest state. */
  const stateRef = useRef(pocState);
  stateRef.current = pocState;
  const persist = (next) => {
    stateRef.current = next;
    writeState(next).catch(() => setNotice(SAVE_FAILED));
    return next;
  };
  const update = (fn) => setPocState(persist(fn(stateRef.current)));
  const reset = (next) => {
    setPocState(persist(next));
    setShowNewProject(false);
    setEditingProfile(false);
    setConfirm(null);
    setNotice("");
  };

  const navOn = ssoConnected(pocState, socialProviders) && !!pocState.developerEnabled;

  const createProject = (fields) => {
    const project = makeProject(fields);
    update(s => ({...s, projects: [project, ...s.projects], expandedProjectId: project.id}));
    setProjectId(project.id);
    setShowNewProject(false);
  };

  /* Turning developer settings on is one action, and it lands in Developer settings. */
  const openDeveloper = () => {
    setTab("developer");
    if (typeof window !== "undefined") { window.scrollTo(0, 0); }
  };
  /* A short loader before the switch, so the jump to the other tab doesn't read as a reload. */
  const startDeveloper = (onReady) => {
    setSettingUp(true);
    clearTimeout(setupTimer.current);
    setupTimer.current = setTimeout(() => {
      update(s => ({...s, developerEnabled: true}));
      setSettingUp(false);
      openDeveloper();
      if (onReady) { onReady(); }
    }, SETUP_MS);
  };

  const closeConfirm = (confirmed) => {
    if (confirmed && confirm && confirm.onConfirm) { confirm.onConfirm(); }
    setConfirm(null);
  };

  const finishMockSso = () => {
    const provider = mockSso;
    setMockSso(null);
    update(s => ({...s, ssoOverride: true}));
    startDeveloper(() => {
      setConnectedMessage(provider + " is connected. From now on, you sign in to this account with " + provider + ".");
      clearTimeout(connectedTimer.current);
      connectedTimer.current = setTimeout(() => setConnectedMessage(""), CONNECTED_MS);
    });
  };

  return (
    <div className={"readerNavMenu settingsPage" + (tab === "developer" ? " settingsPageDeveloper" : "")} key="settings">
      <div className="content">
        <div className="contentInner">
          <div
            id="accountSettingsPage"
            className="static biReady"
            style={tab === "account" ? null : {display: "none"}}
          >
            <AccountTab
              settings={settings}
              pocState={pocState}
              socialProviders={socialProviders}
              navOn={navOn}
              onSelectTab={setTab}
              onStart={() => startDeveloper()}
              onConnectSso={setMockSso}
              settingUp={settingUp}
            />
          </div>
          <div style={tab === "developer" ? null : {display: "none"}}>
            <DeveloperTab
              state={pocState}
              socialProviders={socialProviders}
              navOn={navOn}
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
              onSelectTab={setTab}
              setProjectId={setProjectId}
              onStart={() => startDeveloper()}
              onConnectSso={setMockSso}
              settingUp={settingUp}
            />
          </div>
        </div>
      </div>
      <div className="devPocPage">
        {confirm ? <ConfirmDialog confirm={confirm} onClose={closeConfirm} /> : null}
        {mockSso ?
          <MockSsoDialog provider={mockSso} onCancel={() => setMockSso(null)} onContinue={finishMockSso} /> : null}
        <PocTestPanel state={pocState} realProviders={socialProviders} update={update} reset={reset} showSimulate={true} />
      </div>
    </div>
  );
};


export default SettingsPage;
