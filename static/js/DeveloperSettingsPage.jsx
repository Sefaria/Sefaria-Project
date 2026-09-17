import React, { useEffect, useRef, useState } from 'react';
import Sefaria from './sefaria/sefaria';
import {
  MAX_KEYS_PER_PROJECT,
  POWERED_BY_LISTINGS,
  emptyState,
  makeKey,
  makeProject,
  readState,
  sampleState,
  ssoConnected,
  usageSeries,
  websiteHost,
  writeState,
} from './developerPocStore';

/* Developer settings, proof of concept. Every value on this page is mock data held in
   localStorage; no key here authorizes anything. See developerPocStore.js. */

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
    onDone("Selected — press ⌘C");
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


const SettingsNav = () => (
  <nav className="devPocNav" aria-label="Settings">
    <div className="devPocNavTitle">Settings</div>
    <a href="/settings/account">Account settings</a>
    <a href="/settings/developer" aria-current="page">Developer settings</a>
  </nav>
);


const emptyProfile = () => ({
  developerName: "", description: "", additionalEmail: "",
  termsAccepted: false, notADeveloper: false,
});

const AboutYouFields = ({fields, set}) => (
  <React.Fragment>
    <div className="devPocField">
      <label htmlFor="devPocName">Developer name</label>
      <input id="devPocName" value={fields.developerName} onChange={e => set("developerName", e.target.value)} />
      <p className="devPocHelp">Your name, as Sefaria should address you.</p>
    </div>
    <div className="devPocField">
      <div className="devPocLabelRow">
        <label htmlFor="devPocDescription">About yourself <span className="devPocMuted">(optional)</span></label>
        <InfoTip label="Why we ask about you">
          Sefaria uses this to understand your project and its needs, if something goes wrong or
          we want to get in touch.
        </InfoTip>
      </div>
      <input id="devPocDescription" value={fields.description} onChange={e => set("description", e.target.value)} />
    </div>
    <div className="devPocField">
      <label htmlFor="devPocAccountEmail">Account email</label>
      <input id="devPocAccountEmail" value={Sefaria._email || ""} disabled readOnly />
      <p className="devPocHelp">We use your account email to contact you. Change it in Account settings.</p>
    </div>
    <div className="devPocField">
      <label htmlFor="devPocEmail2">Additional email <span className="devPocMuted">(optional)</span></label>
      <input id="devPocEmail2" type="email" value={fields.additionalEmail} onChange={e => set("additionalEmail", e.target.value)} />
      <p className="devPocHelp">Someone else we should contact, or a different work or personal address of yours.</p>
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
    <label className="devPocChoice">
      <input type="checkbox" checked={fields.notADeveloper} onChange={e => set("notADeveloper", e.target.checked)} />
      <span>
        I'm not a developer
        <span className="devPocHelp">We add extra explanations for building with AI tools or without code.</span>
      </span>
    </label>
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
    if (!fields.developerName.trim()) { setError("Developer name is required."); return; }
    setError("");
    setStep(2);
  };

  const finish = (e) => {
    e.preventDefault();
    if (!fields.termsAccepted) { setError("You need to accept the API terms."); return; }
    setError("");
    onSave({...fields, developerName: fields.developerName.trim()});
  };

  return (
    <div className="devPocOnboarding">
      <h2>Set up your developer profile</h2>
      <p className="devPocStepper">Step {step} of 2 · {step === 1 ? "About you" : "Terms"}</p>
      <form className="devPocForm" onSubmit={step === 1 ? next : finish}>
        {step === 1 ?
          <AboutYouFields fields={fields} set={set} /> :
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
    if (!fields.developerName.trim()) { setError("Developer name is required."); return; }
    if (!fields.termsAccepted) { setError("You need to accept the API terms."); return; }
    setError("");
    onSave({...fields, developerName: fields.developerName.trim()});
  };

  return (
    <form className="devPocForm" onSubmit={submit}>
      <AboutYouFields fields={fields} set={set} />
      <TermsFields fields={fields} set={set} accepted={!!(profile && profile.termsAccepted)} />
      {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
      <div className="devPocActions">
        <button type="submit" className="button small blue">Save profile</button>
        {onCancel ? <button type="button" className="button small transparent" onClick={onCancel}>Cancel</button> : null}
      </div>
    </form>
  );
};


const ListingPicker = ({listing, onPick, onClear}) => {
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
        Sefaria confirms the connection, because someone else may have submitted the listing. The
        listing and your project stay linked, not merged.
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
      <p className="devPocHelp">What are you building?</p>
    </div>
    <label className="devPocChoice">
      <input type="checkbox" checked={fields.aiAssisted} onChange={e => set("aiAssisted", e.target.checked)} />
      <span>
        Built with AI assistance
        <span className="devPocHelp">
          For example, built with an AI coding assistant. It helps us understand how people build on Sefaria.
        </span>
      </span>
    </label>
    <div className="devPocField">
      <label htmlFor="devPocProjectOrg">Organization <span className="devPocMuted">(optional)</span></label>
      <input id="devPocProjectOrg" value={fields.organization} onChange={e => set("organization", e.target.value)} />
    </div>
    <div className="devPocField">
      <label htmlFor="devPocProjectUrl">Website URL <span className="devPocMuted">(optional)</span></label>
      <input id="devPocProjectUrl" value={fields.websiteUrl} onChange={e => set("websiteUrl", e.target.value)} />
      <p className="devPocHelp">
        {novice
          ? "The address people type to visit your site, for example https://example.org."
          : "A website lets you restrict individual keys to it."}
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
            onPick={l => set("listingRequest", l)}
            onClear={() => set("listingRequest", null)}
          />
        </div> : null}
    </fieldset>
  </React.Fragment>
);


const NoWebsiteDialog = ({onAddWebsite, onSaveAnyway}) => (
  <div className="devPocModalStage devPocConfirmStage" role="dialog" aria-label="Save without a website?">
    <section className="devPocDialog">
      <h2>Save without a website?</h2>
      <p>A website address does two things:</p>
      <ul className="devPocList">
        <li>It lets you restrict a key, so the key only works on your own site.</li>
        <li>It helps Sefaria understand who we serve.</li>
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
    if (!fields.name.trim()) { setError("Project name is required."); return; }
    if (!fields.description.trim()) { setError("A one-line description is required."); return; }
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
            <p>Tell us what you're building. You can add a key next.</p>
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
        <NoWebsiteDialog onAddWebsite={() => setAskWebsite(false)} onSaveAnyway={save} /> : null}
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
    if (!fields.name.trim() || !fields.description.trim()) { setError("Name and one-line description are required."); return; }
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
        <NoWebsiteDialog onAddWebsite={() => setAskWebsite(false)} onSaveAnyway={save} /> : null}
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
          <span>Only accept requests from <code>{host}</code></span>
        </label>
        <InfoTip label="What does the website restriction do?" wide={true}>
          {novice ?
            <React.Fragment>
              If your key sits inside your website's code, anyone who views the page can copy it.
              Turn this on so the key only works on {host}. If your tool runs somewhere else — a
              server, a script, an app you installed — leave it off, or your own requests will be
              blocked.
            </React.Fragment> :
            <React.Fragment>
              Only accept requests from {host}. Requests that come from any other website are
              refused. Use this when the key is embedded in a website's front-end code, where anyone
              can read it. Leave it off if your requests come from a server, a script or an app:
              they have no website origin and would be refused. An origin can be faked, so this
              limits casual misuse; it is not a security guarantee.
            </React.Fragment>}
        </InfoTip>
      </div>
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
    {isNew ? <p className="devPocKeyReady" role="status">Ready to use.</p> : null}
    {project.websiteUrl ?
      <RestrictionToggle project={project} apiKey={apiKey} novice={novice} onToggle={onToggleRestriction} /> :
      <p className="devPocHelp">Add a website URL to this project to restrict this key to it.</p>}
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

  const startCreate = (e) => {
    e.preventDefault();
    if (!label.trim()) { setError("A label is required."); return; }
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
    body: "This key for " + project.name + " will stop working immediately. Anything using it loses access. This cannot be undone.",
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
        </div>
        {creating ? null :
          <button
            type="button"
            className="button small blue"
            disabled={atLimit}
            onClick={() => { setCreating(true); setPhase("idle"); setError(""); }}
          >Create key</button>}
      </div>
      {atLimit ?
        <p className="devPocNotice">This project has {MAX_KEYS_PER_PROJECT} keys, the maximum. Delete a key you no longer use before creating another.</p> : null}
      {novice ?
        <p className="devPocHelp">An API key is like a password that lets your app use Sefaria's texts. Keep it private.</p> :
        <p className="devPocHelp">Send your key in the <code>x-api-key</code> header. Keys stay available here.</p>}

      {creating && phase === "idle" ?
        <form className="devPocForm devPocCreateKey" onSubmit={startCreate}>
          <div className="devPocField">
            <label htmlFor="devPocKeyLabel">Key label</label>
            <input id="devPocKeyLabel" value={label} onChange={e => setLabel(e.target.value)} />
            <p className="devPocHelp">
              {novice
                ? "A name you'll recognize later, such as “Local development”, “Production” or “My website”."
                : "Choose a name you'll recognize, such as Production or Staging."}
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
            <span className="devPocHelp">This can take a few seconds.</span>
          </span>
        </div> : null}
      {phase === "error" ?
        <div className="devPocWarning" role="alert">
          <strong>We couldn't create your key.</strong>
          <p>No key was created. Please try again.</p>
          <button type="button" className="button small white" onClick={() => setPhase("idle")}>Try again</button>
        </div> : null}

      {project.keys.length === 0 && !creating && phase === "idle" ?
        <React.Fragment>
          <p className="devPocHelp">Your project is ready.</p>
          <div className="devPocNotice">Create a key to start using the API.</div>
        </React.Fragment> : null}
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
            fill="#18345d"
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

  return (
    <section className="devPocSection">
      <div className="devPocHeading">
        <div><h3>Usage</h3></div>
      </div>
      <div className="devPocStats">
        <div className="devPocStat">
          <strong>{total.toLocaleString()}</strong>
          <span>Requests in the last 30 days</span>
        </div>
        <div className="devPocStat">
          <strong>{formatDate(project.usage.lastUsed)}</strong>
          <span>Last request</span>
        </div>
      </div>
      <div className="devPocChartBlock">
        <UsageChart series={daily} />
        <div className="devPocChartAxis">
          <span>30 days ago</span>
          <span>Today</span>
        </div>
      </div>
      <div className="devPocKeyUsage">
        {perKey.map(({key}) => (
          <div className="devPocKeyUsageRow" key={key.id}>
            <span>{key.label}</span>
            <span className="devPocKeyUsageBar" aria-hidden="true">
              <span style={{width: (total ? Math.round(key.requests30 / total * 100) : 0) + "%"}} />
            </span>
            <span>{key.requests30.toLocaleString()}</span>
          </div>
        ))}
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
      notice("Website restriction was turned off on " + restrictedKeys.join(", ") + ", because this project no longer has a website URL.");
    }
  };

  const deleteProject = () => setConfirm({
    title: "Delete " + project.name + "?",
    body: project.keys.length
      ? "These keys stop working immediately: " + project.keys.map(k => k.label).join(", ") + ". The project and its keys cannot be recovered."
      : "This project has no keys. It cannot be recovered.",
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
          <div className="devPocProjectActions">
            <span className="devPocBadge">{project.visibility === "public" ? "Public" : "Private"}</span>
            {project.aiAssisted ? <span className="devPocBadge">Built with AI assistance</span> : null}
            {expanded ?
              <button type="button" className="button small transparent" onClick={() => setEditing(e => !e)}>
                {editing ? "Close editor" : "Edit project"}
              </button> : null}
          </div>
        </div>
        <p>{project.description}</p>
        <p className="devPocHelp">
          {project.organization ? project.organization + " · " : ""}
          {project.keys.length} {project.keys.length === 1 ? "key" : "keys"}
          {project.websiteUrl ? " · " + websiteHost(project.websiteUrl) : ""}
        </p>
        {expanded ? <p className="devPocHelp">{listingStatus(project)}</p> : null}
      </header>
      {expanded && editing ?
        <section className="devPocSection">
          <EditProjectForm
            project={project}
            novice={novice}
            onSave={saveProject}
            onCancel={() => setEditing(false)}
            onDelete={deleteProject}
          />
        </section> : null}
      {expanded ?
        <React.Fragment>
          <KeysSection project={project} novice={novice} update={update} setConfirm={setConfirm} />
          {project.keys.length ? <UsageSection project={project} /> : null}
        </React.Fragment> : null}
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


const DeveloperSettingsPage = ({socialProviders, initialProjectId, initialNavOn}) => {
  const [state, setState] = useState(null);   // null until mounted: the server has no localStorage
  const [showNewProject, setShowNewProject] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const loaded = readState();
    if (initialProjectId && loaded.projects.some(p => p.id === initialProjectId)) {
      loaded.expandedProjectId = initialProjectId;
    }
    setState(loaded);
  }, [initialProjectId]);

  const update = (fn) => setState(prev => writeState(fn(prev)));
  const reset = (next) => {
    setState(writeState(next));
    setShowNewProject(false);
    setEditingProfile(false);
    setConfirm(null);
    setNotice("");
  };

  if (state === null) {
    // The server renders this pass. The nav visibility comes from the cookie the store
    // mirrors, so the shell does not shift once localStorage is read.
    return (
      <div className="readerNavMenu devPocPage" key="developerSettings">
        <div className="content"><div className="contentInner">
          <div className={"devPocShell" + (initialNavOn ? "" : " devPocShellNoNav")}>
            {initialNavOn ? <SettingsNav /> : null}
            <main className="devPocMain"><p>Loading developer settings&hellip;</p></main>
          </div>
        </div></div>
      </div>
    );
  }

  const connected = ssoConnected(state, socialProviders);
  const off = !connected || !state.developerEnabled;
  const novice = !!(state.profile && state.profile.notADeveloper);
  const profileReady = !!(state.profile && state.profile.termsAccepted);
  const profileFirst = "Save your developer profile first (the API terms are part of it).";

  const createProject = (fields) => {
    const project = makeProject(fields);
    update(s => ({...s, projects: [...s.projects, project], expandedProjectId: project.id}));
    setShowNewProject(false);
  };

  const closeConfirm = (confirmed) => {
    if (confirmed && confirm && confirm.onConfirm) { confirm.onConfirm(); }
    setConfirm(null);
  };

  return (
    <div className="readerNavMenu devPocPage" key="developerSettings">
      <div className="content">
        <div className="contentInner">
          <div className={"devPocShell" + (off ? " devPocShellNoNav" : "")}>
            {off ? null : <SettingsNav />}
            <main className="devPocMain">
              <header className="devPocPageHeader">
                <h1>Developer settings</h1>
                <p>Register what you're building and manage its API keys.</p>
                <a href="https://developers.sefaria.org" target="_blank" rel="noreferrer">API documentation</a>
              </header>

              {off ?
                <div className="devPocEmpty">
                  <h2>Developer settings are off</h2>
                  <p>Turn them on in <a href="/settings/account">Account settings</a>.</p>
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
                        onClick={() => setShowNewProject(true)}
                      >New project</button> : null}
                  </div>
                  {state.projects.length > 0 && !profileReady ?
                    <p className="devPocHelp">{profileFirst}</p> : null}

                  {state.projects.length === 0 ?
                    <div className="devPocEmpty">
                      <h2>Your first project starts here</h2>
                      <p>Register what you're building, then create an API key for it.</p>
                      <div className="devPocActions">
                        <button
                          type="button"
                          className="button small blue"
                          disabled={!profileReady}
                          onClick={() => setShowNewProject(true)}
                        >Create your first project</button>
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
                        onToggleExpand={() => update(s => ({
                          ...s, expandedProjectId: s.expandedProjectId === p.id ? null : p.id,
                        }))}
                      />
                    ))}
                </React.Fragment>}
            </main>
          </div>
        </div>
      </div>
      {showNewProject ?
        <NewProjectDialog novice={novice} onCreate={createProject} onCancel={() => setShowNewProject(false)} /> : null}
      {confirm ? <ConfirmDialog confirm={confirm} onClose={closeConfirm} /> : null}
      <PocTestPanel state={state} realProviders={socialProviders} update={update} reset={reset} showSimulate={true} />
    </div>
  );
};


export default DeveloperSettingsPage;
