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


const emptyProfile = () => ({
  developerName: "", description: "", additionalEmail: "",
  termsAccepted: false, notADeveloper: false,
});

const ABOUT_YOU_HELP = "Helps us understand your project if we need to contact you.";

/* Non-developers get the explanations inline; developers get them behind the "i". */
const AboutYouFields = ({fields, set, novice}) => (
  <React.Fragment>
    <label className="devPocChoice">
      <input type="checkbox" checked={fields.notADeveloper} onChange={e => set("notADeveloper", e.target.checked)} />
      <span>
        I'm not a developer
        <span className="devPocHelp">We add extra explanations for building with AI tools or without code.</span>
      </span>
    </label>
    <div className="devPocField">
      <label htmlFor="devPocName">Your name</label>
      <input id="devPocName" value={fields.developerName} onChange={e => set("developerName", e.target.value)} />
      <p className="devPocHelp">Your name, or your team's name.</p>
    </div>
    <div className="devPocField">
      <div className="devPocLabelRow">
        <label htmlFor="devPocDescription">About yourself <span className="devPocMuted">(optional)</span></label>
        {novice ? null : <InfoTip label="Why we ask about you">{ABOUT_YOU_HELP}</InfoTip>}
      </div>
      <input id="devPocDescription" value={fields.description} onChange={e => set("description", e.target.value)} />
      {novice ? <p className="devPocHelp">{ABOUT_YOU_HELP}</p> : null}
    </div>
    <div className="devPocField">
      <label htmlFor="devPocAccountEmail">Account email</label>
      <input id="devPocAccountEmail" value={Sefaria._email || ""} disabled readOnly />
      <p className="devPocHelp">
        {novice ? "We'll contact you here. Change it in Account settings." : "Change it in Account settings."}
      </p>
    </div>
    <div className="devPocField">
      <label htmlFor="devPocEmail2">Additional email <span className="devPocMuted">(optional)</span></label>
      <input id="devPocEmail2" type="email" value={fields.additionalEmail} onChange={e => set("additionalEmail", e.target.value)} />
      <p className="devPocHelp">
        {novice
          ? "Another address we can reach, yours or a colleague's."
          : "A second contact, or a work address."}
      </p>
    </div>
  </React.Fragment>
);

const TermsFields = ({fields, set, accepted}) => (
  <React.Fragment>
    {accepted ?
      <p className="devPocHelp">You accepted the API terms on this account.</p> :
      <div className="devPocAgreement">
        <label className="devPocChoice">
          <input type="checkbox" checked={fields.termsAccepted} onChange={e => set("termsAccepted", e.target.checked)} />
          <span><strong>I accept the API terms</strong> and agree to receive email about API changes.</span>
        </label>
      </div>}
  </React.Fragment>
);

/* First visit: a two-step setup, so nothing else on the page competes with it. */
const ProfileOnboarding = ({onSave}) => {
  const [step, setStep] = useState(1);
  const [fields, setFields] = useState(emptyProfile);
  const [error, setError] = useState("");
  const set = (key, value) => setFields(f => ({...f, [key]: value}));

  const next = (e) => {
    e.preventDefault();
    if (!fields.developerName.trim()) { setError("Enter your name."); return; }
    setError("");
    setStep(2);
  };

  const finish = (e) => {
    e.preventDefault();
    if (!fields.termsAccepted) { setError("Accept the API terms to continue."); return; }
    setError("");
    onSave({...fields, developerName: fields.developerName.trim()});
  };

  return (
    <div className="devPocOnboarding">
      <h2>Set up your developer profile</h2>
      <p className="devPocStepper">Step {step} of 2 · {step === 1 ? "About you" : "Terms"}</p>
      <form className="devPocForm" onSubmit={step === 1 ? next : finish}>
        {step === 1 ?
          <AboutYouFields fields={fields} set={set} novice={fields.notADeveloper} /> :
          <TermsFields fields={fields} set={set} accepted={false} />}
        {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
        <div className="devPocActions">
          {step === 2 ?
            <button type="button" className="button small transparent" onClick={() => { setError(""); setStep(1); }}>Back</button> : null}
          <button type="submit" className="button small blue">{step === 1 ? "Next" : "Finish"}</button>
        </div>
      </form>
    </div>
  );
};

const ProfileForm = ({profile, onSave, onCancel}) => {
  const [fields, setFields] = useState(profile);
  const [error, setError] = useState("");
  const set = (key, value) => setFields(f => ({...f, [key]: value}));

  const submit = (e) => {
    e.preventDefault();
    if (!fields.developerName.trim()) { setError("Enter your name."); return; }
    if (!fields.termsAccepted) { setError("Accept the API terms to continue."); return; }
    setError("");
    onSave({...fields, developerName: fields.developerName.trim()});
  };

  return (
    <form className="devPocForm" onSubmit={submit}>
      <AboutYouFields fields={fields} set={set} novice={fields.notADeveloper} />
      <TermsFields fields={fields} set={set} accepted={!!(profile && profile.termsAccepted)} />
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
      <div className="devPocListingSearch">
        <p className="devPocHelp">
          Link requested to <strong>{listing.name}</strong> ({listing.url}), awaiting confirmation.
        </p>
        <button type="button" className="devPocTextButton" onClick={onClear}>Cancel request</button>
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" className="devPocTextButton" onClick={() => setOpen(true)}>
        Already on Powered by Sefaria? Link your listing
      </button>
    );
  }
  return (
    <div className="devPocListingSearch">
      <div className="devPocField">
        <label htmlFor="devPocListingSearch">Search existing listings by name or website</label>
        <input
          id="devPocListingSearch"
          type="search"
          placeholder="Search by project name or website"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      {normalized.length >= 2 && results.length === 0 ?
        <p className="devPocHelp">No matching listings. Try another name or website.</p> : null}
      {results.map(l => (
        <div className="devPocResult" key={l.url}>
          <div>
            <strong>{l.name}</strong>
            <p className="devPocHelp">{l.url}</p>
          </div>
          <button type="button" className="button small white" onClick={() => { onPick(l); setOpen(false); }}>Request link</button>
        </div>
      ))}
      <p className="devPocHelp">
        {novice
          ? "Sefaria checks the link, because someone else may have added the listing."
          : "Sefaria confirms the connection, because someone else may have submitted the listing. The listing and your project stay linked, not merged."}
      </p>
      <button type="button" className="devPocTextButton" onClick={() => setOpen(false)}>Close</button>
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
      <label htmlFor="devPocProjectDescription">One-line description</label>
      <input id="devPocProjectDescription" value={fields.description} onChange={e => set("description", e.target.value)} />
      {novice ?
        <p className="devPocHelp">One sentence, for example: a daily study tracker for my shul.</p> : null}
    </div>
    <label className="devPocChoice">
      <input type="checkbox" checked={fields.aiAssisted} onChange={e => set("aiAssisted", e.target.checked)} />
      <span>
        Built with AI assistance
        <span className="devPocHelp">
          {novice
            ? "Tick this if an AI tool wrote the code. It just helps us learn how people build."
            : "Helps us see how people build on Sefaria."}
        </span>
      </span>
    </label>
    <div className="devPocField">
      <label htmlFor="devPocProjectOrg">Organization <span className="devPocMuted">(optional)</span></label>
      <input id="devPocProjectOrg" value={fields.organization} onChange={e => set("organization", e.target.value)} />
    </div>
    <div className="devPocField">
      <label htmlFor="devPocProjectUrl">
        {novice ? "Website address " : "Website URL "}<span className="devPocMuted">(optional)</span>
      </label>
      <input id="devPocProjectUrl" value={fields.websiteUrl} onChange={e => set("websiteUrl", e.target.value)} />
      <p className="devPocHelp">
        {novice
          ? "The address people type to visit your project, like https://example.org."
          : "Needed only if you want to lock a key to a client-only site: front-end code with no backend of its own."}
      </p>
    </div>
    <fieldset className="devPocFieldset">
      <legend>Visibility</legend>
      <label className="devPocChoice">
        <input type="radio" name="devPocVisibility" checked={fields.visibility === "private"} onChange={() => set("visibility", "private")} />
        <span>Private<span className="devPocHelp">Only you and Sefaria can see this project.</span></span>
      </label>
      <label className="devPocChoice">
        <input type="radio" name="devPocVisibility" checked={fields.visibility === "public"} onChange={() => set("visibility", "public")} />
        <span>
          Public
          <span className="devPocHelp">
            I'm willing for this project to be shown publicly on Powered by Sefaria. Sefaria decides
            what gets listed, so it may or may not appear.
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


const NoWebsiteDialog = ({novice, onAddWebsite, onSaveAnyway}) => (
  <div
    className="devPocModalStage devPocConfirmStage"
    role="dialog"
    aria-label={novice ? "Add a website address?" : "Save without a website?"}
  >
    <section className="devPocDialog">
      <h2>{novice ? "Add a website address?" : "Save without a website?"}</h2>
      {novice ? <p>A website address helps in two ways:</p> : null}
      <ul className="devPocList">
        <li>
          {novice
            ? "If your project has a web address, we can lock your key to it, so nobody else can use your key."
            : "Lets you lock a key to your site's origin, for keys that live in front-end code."}
        </li>
        <li>
          {novice
            ? "It helps Sefaria see who we're serving."
            : "Tells Sefaria who is building on the API."}
        </li>
      </ul>
      <div className="devPocActions">
        <button type="button" className="button small white" onClick={onAddWebsite}>Add a website</button>
        <button type="button" className="button small blue" onClick={onSaveAnyway}>Save without it</button>
      </div>
    </section>
  </div>
);


const NewProjectDialog = ({novice, onCreate, onCancel}) => {
  const [fields, setFields] = useState({
    name: "", description: "", organization: "", websiteUrl: "",
    visibility: "private", aiAssisted: false, listingRequest: null,
  });
  const [error, setError] = useState("");
  const [askWebsite, setAskWebsite] = useState(false);
  const set = (key, value) => setFields(f => ({...f, [key]: value}));

  const save = () => onCreate({
    ...fields, name: fields.name.trim(), description: fields.description.trim(),
    websiteUrl: fields.websiteUrl.trim(),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!fields.name.trim()) { setError("Enter a project name."); return; }
    if (!fields.description.trim()) { setError("Enter a one-line description."); return; }
    setError("");
    if (!fields.websiteUrl.trim()) { setAskWebsite(true); return; }
    save();
  };

  return (
    <React.Fragment>
      <div className="devPocModalStage" role="dialog" aria-label="New project">
        <section className="devPocDialog">
          <header className="devPocDialogHeader">
            <h2>New project</h2>
            <p>{novice ? "Tell us what you're building. You'll add a key next." : "You can add a key next."}</p>
          </header>
          <form className="devPocForm" onSubmit={submit}>
            <ProjectFields fields={fields} set={set} novice={novice} />
            <p className="devPocNotice">This project belongs to your account and cannot be transferred.</p>
            {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
            <div className="devPocActions">
              <button type="submit" className="button small blue">Create project</button>
              <button type="button" className="button small transparent" onClick={onCancel}>Cancel</button>
            </div>
          </form>
        </section>
      </div>
      {askWebsite ?
        <NoWebsiteDialog novice={novice} onAddWebsite={() => setAskWebsite(false)} onSaveAnyway={save} /> : null}
    </React.Fragment>
  );
};


const EditProjectForm = ({project, novice, onSave, onCancel, onDelete}) => {
  const [fields, setFields] = useState({
    name: project.name, description: project.description, organization: project.organization,
    websiteUrl: project.websiteUrl, visibility: project.visibility, aiAssisted: project.aiAssisted,
    listingRequest: project.listingRequest,
  });
  const [error, setError] = useState("");
  const [askWebsite, setAskWebsite] = useState(false);
  const set = (key, value) => setFields(f => ({...f, [key]: value}));

  const save = () => onSave({
    ...fields, name: fields.name.trim(), description: fields.description.trim(),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!fields.name.trim()) { setError("Enter a project name."); return; }
    if (!fields.description.trim()) { setError("Enter a one-line description."); return; }
    setError("");
    if (!fields.websiteUrl.trim()) { setAskWebsite(true); return; }
    save();
  };

  return (
    <React.Fragment>
      <form className="devPocForm devPocEditProject" onSubmit={submit}>
        <ProjectFields fields={fields} set={set} novice={novice} />
        {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
        <div className="devPocActions">
          <button type="submit" className="button small blue">Save project</button>
          <button type="button" className="button small transparent" onClick={onCancel}>Cancel</button>
          <button type="button" className="button small transparent devPocDanger" onClick={onDelete}>Delete project</button>
        </div>
      </form>
      {askWebsite ?
        <NoWebsiteDialog novice={novice} onAddWebsite={() => setAskWebsite(false)} onSaveAnyway={save} /> : null}
    </React.Fragment>
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
            aria-label={"Restrict " + apiKey.label + " to " + host}
          />
          <span>
            {novice ? "Only let this key work on " : "Only accept requests from "}<code>{host}</code>
          </span>
        </label>
        {novice ? null :
          <InfoTip label="What does the website restriction do?">
            Use it when the key ships in front-end code. Leave it off for servers, scripts and
            apps: they send no origin and would be refused. Origins can be faked, so this stops
            casual copying, not a determined attacker.
          </InfoTip>}
      </div>
      {novice ?
        <React.Fragment>
          <p className="devPocHelp">
            Turn this on if your key is inside a website people can visit. It stops anyone who
            copies it from using it elsewhere.
          </p>
          <p className="devPocHelp">
            Leave it off if your key runs anywhere else, or your own project will stop working.
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


const KeyRow = ({project, apiKey, novice, isNew, onToggleRestriction, onDelete}) => (
  <article className={"devPocKey" + (isNew ? " devPocKeyNew" : "")}>
    <div className="devPocKeyHeading">
      <strong>{apiKey.label}</strong>
      <button type="button" className="button small transparent devPocDanger" onClick={onDelete}>Delete key</button>
    </div>
    <KeyValue value={apiKey.value} />
    <div className="devPocKeyMeta">
      <span>Created {formatDate(apiKey.created)}</span>
      <span>Last used: {formatDate(apiKey.lastUsed)}</span>
      <span>{apiKey.requests30.toLocaleString()} requests / 30 days</span>
    </div>
    {isNew ?
      <p className="devPocKeyReady" role="status">
        {novice ? "Ready to use. Copy it into your tool now." : "Ready to use."}
      </p> : null}
    {project.websiteUrl ?
      <RestrictionToggle project={project} apiKey={apiKey} novice={novice} onToggle={onToggleRestriction} /> :
      novice ? null :
      <p className="devPocHelp">
        Add a website URL to the project to lock this key to it. Worth doing if the key ships in
        front-end code with no backend.
      </p>}
  </article>
);


const KEY_HIGHLIGHT_MS = 4000;

const KeysSection = ({project, novice, update, setConfirm}) => {
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
    if (!label.trim()) { setError(novice ? "Give the key a name." : "Enter a label."); return; }
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
      ? "This key stops working right away. Anything using it will break. This cannot be undone."
      : "This key for " + project.name + " stops working immediately. This cannot be undone.",
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
          <p className="devPocHelp">{project.keys.length} of {MAX_KEYS_PER_PROJECT} keys used</p>
          {novice ?
            <p className="devPocHelp">
              A key is like a password for your project. Paste it into your tool wherever it asks
              for a Sefaria API key, and don't share it.
            </p> :
            <p className="devPocHelp">Send the key in the <code>x-api-key</code> header. Keys stay viewable here.</p>}
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
            ? "You have " + MAX_KEYS_PER_PROJECT + " keys, the most allowed. Delete one you don't use to make room."
            : MAX_KEYS_PER_PROJECT + " of " + MAX_KEYS_PER_PROJECT + " keys. Delete one before creating another."}
        </p> : null}

      {creating && phase === "idle" ?
        <form className="devPocForm devPocCreateKey" onSubmit={startCreate}>
          <div className="devPocField">
            <label htmlFor="devPocKeyLabel">{novice ? "Name this key" : "Key label"}</label>
            <input id="devPocKeyLabel" value={label} onChange={e => setLabel(e.target.value)} />
            {novice ?
              <p className="devPocHelp">A name just for you, so you can tell your keys apart.</p> : null}
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
            <span className="devPocHelp">This can take a few seconds.</span>
          </span>
        </div> : null}
      {phase === "error" ?
        <div className="devPocWarning" role="alert">
          <strong>We couldn't create your key.</strong>
          <p>No key was created. Please try again.</p>
          <button type="button" className="button small white" onClick={() => setPhase("idle")}>Try again</button>
        </div> : null}

      {firstKeyPrompt ?
        <div className="devPocInset devPocInsetEmpty">
          {novice ?
            <div className="devPocActions">
              <button type="button" className="button small blue" onClick={startCreating}>Create your first key</button>
            </div> :
            <p>Create a key to start using the API.</p>}
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
              />
            ))}
          </div>
        </div> : null}
    </section>
  );
};


const listingStatus = (project) => {
  if (project.listingRequest) {
    return "Link to " + project.listingRequest.name + " requested, awaiting Sefaria's confirmation.";
  }
  if (project.visibility === "public") {
    return "Public: may be listed on Powered by Sefaria.";
  }
  return "Not listed on Powered by Sefaria.";
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


const ProjectCard = ({project, expanded, novice, update, setConfirm, onToggleExpand, notice, clearNotice}) => {
  const [editing, setEditing] = useState(false);

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
        ? restrictedKeys.join(", ") + " is no longer locked to your website, because you removed the website address."
        : "Website restriction turned off on " + restrictedKeys.join(", ") + ": the project no longer has a website URL.");
    }
  };

  const deleteProject = () => setConfirm({
    title: "Delete " + project.name + "?",
    body: project.keys.length
      ? (novice
        ? "These keys stop working right away: " + project.keys.map(k => k.label).join(", ") + ". You can't get the project or its keys back."
        : "These keys stop working immediately: " + project.keys.map(k => k.label).join(", ") + ". The project and its keys cannot be recovered.")
      : (novice
        ? "This project has no keys. You can't get it back."
        : "This project has no keys. It cannot be recovered."),
    actionLabel: "Delete project",
    onConfirm: () => update(s => ({
      ...s,
      projects: s.projects.filter(p => p.id !== project.id),
      expandedProjectId: s.expandedProjectId === project.id ? null : s.expandedProjectId,
    })),
  });

  return (
    <article className={"devPocProject" + (expanded ? " expanded" : "")}>
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
            {project.aiAssisted ? <span className="devPocBadge">Built with AI assistance</span> : null}
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
              <EditProjectForm
                project={project}
                novice={novice}
                onSave={saveProject}
                onCancel={() => setEditing(false)}
                onDelete={deleteProject}
              />
            </section> : null}
          <KeysSection project={project} novice={novice} update={update} setConfirm={setConfirm} />
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


const DeveloperTab = ({state, socialProviders, navOn, update, setConfirm, notice, setNotice,
                       editingProfile, setEditingProfile, onNewProject, onSelectTab, setProjectId}) => {
  const connected = ssoConnected(state, socialProviders);
  const off = !connected || !state.developerEnabled;
  const novice = !!(state.profile && state.profile.notADeveloper);
  const profileReady = !!(state.profile && state.profile.termsAccepted);
  const profileFirst = novice
    ? "Finish your profile first. The API terms are part of it."
    : "Save your developer profile first. The API terms are part of it.";

  const toggleExpand = (project) => {
    const expandedProjectId = state.expandedProjectId === project.id ? null : project.id;
    update(s => ({...s, expandedProjectId}));
    setProjectId(expandedProjectId);
  };

  return (
    <div className="devPocPage">
      <div className={"devPocShell" + (navOn ? "" : " devPocShellNoNav")}>
        {navOn ? <SettingsNav tab="developer" onSelect={onSelectTab} /> : null}
        <main className="devPocMain">
          <header className="devPocPageHeader">
            <h1>Developer settings</h1>
            <p>
              {novice
                ? "Tell us what you're building, and get a key for it."
                : "Register your projects and manage their API keys."}
            </p>
            <a href="https://developers.sefaria.org" target="_blank" rel="noreferrer">
              {novice ? "API documentation (for developers)" : "API documentation"}
            </a>
          </header>

          {off ?
            <div className="devPocEmpty">
              <h2>Developer settings are off</h2>
              <p>Turn them on in <a href="/settings/account" onClick={e => { e.preventDefault(); onSelectTab("account"); }}>Account settings</a>.</p>
            </div> :
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
                    <h2>Developer profile</h2>
                    <ProfileForm
                      profile={state.profile}
                      onSave={profile => { update(s => ({...s, profile})); setEditingProfile(false); }}
                      onCancel={() => setEditingProfile(false)}
                    />
                  </React.Fragment> :
                  <div className="devPocProfileSummary">
                    <span>
                      <strong>{state.profile.developerName}</strong>
                      <span className="devPocHelp">{Sefaria._email}{state.profile.description ? " · " + state.profile.description : ""}</span>
                    </span>
                    <button type="button" className="button small transparent" onClick={() => setEditingProfile(true)}>Edit profile</button>
                  </div>}
              </section>

              <div className="devPocSectionHeading">
                <h2>Projects</h2>
                {state.projects.length ?
                  <button
                    type="button"
                    className="button small white"
                    disabled={!profileReady}
                    onClick={onNewProject}
                  >New project</button> : null}
              </div>
              {state.projects.length > 0 && !profileReady ?
                <p className="devPocHelp">{profileFirst}</p> : null}

              {state.projects.length === 0 ?
                <div className="devPocEmpty">
                  <h2>{novice ? "Your first project starts here" : "No projects yet"}</h2>
                  <p>
                    {novice
                      ? "Tell us what you're building. You'll get a key on the next step."
                      : "Create a project, then add a key to it."}
                  </p>
                  <div className="devPocActions">
                    <button
                      type="button"
                      className="button small blue"
                      disabled={!profileReady}
                      onClick={onNewProject}
                    >{novice ? "Create your first project" : "New project"}</button>
                  </div>
                  {profileReady ? null : <p className="devPocHelp">{profileFirst}</p>}
                  <p className="devPocHelp">A project can also be listed on Powered by Sefaria without an API key.</p>
                </div> :
                state.projects.map(p => (
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


/* The mock provider chooser. It stands in for the Google or Apple sign-in window. */
const MockSsoDialog = ({provider, onCancel, onContinue}) => {
  const continueRef = useRef(null);

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
            <span className="devPocMockSsoAvatar" aria-hidden="true">TL</span>
            <span className="devPocMockSsoAccountText">
              <strong>Tova Levi</strong>
              <span>tova@example.org</span>
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

const AccountTab = ({settings, pocState, socialProviders, navOn, update, onSelectTab,
                     onConnectSso, connectedMessage}) => {
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
            {connected ? null :
              <div id="developerSettingsGate" className="devPocGate">
                <strong>Connect Google or Apple to get started</strong>
                <p>We need a verified email so we can reach you about your API access.</p>
                <button className="button small white" type="button" onClick={() => onConnectSso("Google")}>Connect Google</button>
                <button className="button small white" type="button" onClick={() => onConnectSso("Apple")}>Connect Apple</button>
              </div>}
            {connected && connectedMessage ?
              <p className="devPocConnected">{connectedMessage}</p> : null}
            {connected ?
              <div id="developerSettingsToggleWrapper">
                <SettingToggle
                  optionClass="doubleOption"
                  ariaLabel="Developer Settings"
                  value={pocState.developerEnabled ? "true" : "false"}
                  onChange={value => update(s => ({...s, developerEnabled: value === "true"}))}
                  options={[
                    {value: "true", content: <span>On</span>},
                    {value: "false", content: <span>Off</span>},
                  ]}
                />
                <div className="additional-info">Register your projects and get API keys for the Sefaria API.</div>
                {developerOn ?
                  <p id="developerSettingsLink">
                    <a href="/settings/developer" onClick={e => { e.preventDefault(); onSelectTab("developer"); }}>
                      Open Developer settings
                    </a>
                  </p> : null}
              </div> : null}
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
const CONNECTED_MS = 4000;

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
  const connectedTimer = useRef(null);

  useEffect(() => () => clearTimeout(connectedTimer.current), []);

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

  const novice = !!(pocState.profile && pocState.profile.notADeveloper);
  const navOn = ssoConnected(pocState, socialProviders) && !!pocState.developerEnabled;

  const createProject = (fields) => {
    const project = makeProject(fields);
    update(s => ({...s, projects: [...s.projects, project], expandedProjectId: project.id}));
    setProjectId(project.id);
    setShowNewProject(false);
  };

  const closeConfirm = (confirmed) => {
    if (confirmed && confirm && confirm.onConfirm) { confirm.onConfirm(); }
    setConfirm(null);
  };

  const finishMockSso = () => {
    const provider = mockSso;
    setMockSso(null);
    update(s => ({...s, ssoOverride: true}));
    setConnectedMessage(provider + " connected.");
    clearTimeout(connectedTimer.current);
    connectedTimer.current = setTimeout(() => setConnectedMessage(""), CONNECTED_MS);
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
              update={update}
              onSelectTab={setTab}
              onConnectSso={setMockSso}
              connectedMessage={connectedMessage}
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
              editingProfile={editingProfile}
              setEditingProfile={setEditingProfile}
              onNewProject={() => setShowNewProject(true)}
              onSelectTab={setTab}
              setProjectId={setProjectId}
            />
          </div>
        </div>
      </div>
      <div className="devPocPage">
        {showNewProject ?
          <NewProjectDialog novice={novice} onCreate={createProject} onCancel={() => setShowNewProject(false)} /> : null}
        {confirm ? <ConfirmDialog confirm={confirm} onClose={closeConfirm} /> : null}
        {mockSso ?
          <MockSsoDialog provider={mockSso} onCancel={() => setMockSso(null)} onContinue={finishMockSso} /> : null}
        <PocTestPanel state={pocState} realProviders={socialProviders} update={update} reset={reset} showSimulate={true} />
      </div>
    </div>
  );
};


export default SettingsPage;
