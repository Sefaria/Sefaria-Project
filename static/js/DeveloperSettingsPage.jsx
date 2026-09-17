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
  websiteHost,
  writeState,
} from './developerPocStore';

/* Developer settings, proof of concept. Every value on this page is mock data held in
   localStorage; no key here authorizes anything. See developerPocStore.js. */

const KEY_SETUP_MS = 1500;

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
            <button type="button" className="devPocPanelButton" onClick={() => {
              copyToClipboard(JSON.stringify(state, null, 2), null, () => {});
            }}>Copy state as JSON</button>
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


const ProfileForm = ({profile, onSave, onCancel}) => {
  const [fields, setFields] = useState(profile || {
    developerName: "", description: "", additionalEmail: "", phone: "",
    termsAccepted: false, notADeveloper: false,
  });
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
      <p className="devPocHelp">Use your name or the name of your organization.</p>
      <div className="devPocField">
        <label htmlFor="devPocName">Developer name</label>
        <input id="devPocName" value={fields.developerName} onChange={e => set("developerName", e.target.value)} />
      </div>
      <div className="devPocField">
        <label htmlFor="devPocDescription">Description <span className="devPocMuted">(optional)</span></label>
        <input id="devPocDescription" value={fields.description} onChange={e => set("description", e.target.value)} />
      </div>
      <div className="devPocFormGrid">
        <div className="devPocField">
          <label htmlFor="devPocEmail2">Additional email <span className="devPocMuted">(optional)</span></label>
          <input id="devPocEmail2" type="email" value={fields.additionalEmail} onChange={e => set("additionalEmail", e.target.value)} />
        </div>
        <div className="devPocField">
          <label htmlFor="devPocPhone">Phone number <span className="devPocMuted">(optional)</span></label>
          <input id="devPocPhone" value={fields.phone} onChange={e => set("phone", e.target.value)} />
        </div>
      </div>
      <div className="devPocField">
        <label htmlFor="devPocAccountEmail">Account email</label>
        <input id="devPocAccountEmail" value={Sefaria._email || ""} disabled readOnly />
        <p className="devPocHelp">We use your account email. Change it in Account settings.</p>
      </div>
      {profile && profile.termsAccepted ?
        <p className="devPocHelp">You accepted the API terms on this account.</p> :
        <label className="devPocChoice">
          <input type="checkbox" checked={fields.termsAccepted} onChange={e => set("termsAccepted", e.target.checked)} />
          <span>I accept the API terms and agree to receive email about API changes.</span>
        </label>}
      <label className="devPocChoice">
        <input type="checkbox" checked={fields.notADeveloper} onChange={e => set("notADeveloper", e.target.checked)} />
        <span>
          I'm not a developer
          <span className="devPocHelp">We add extra explanations for building with AI tools or without code.</span>
        </span>
      </label>
      {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
      <div className="devPocActions">
        <button type="submit" className="devPocButton">Save profile</button>
        {onCancel ? <button type="button" className="devPocButton quiet" onClick={onCancel}>Cancel</button> : null}
      </div>
    </form>
  );
};


const ProjectFields = ({fields, set}) => (
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
    <div className="devPocFormGrid">
      <div className="devPocField">
        <label htmlFor="devPocProjectOrg">Organization <span className="devPocMuted">(optional)</span></label>
        <input id="devPocProjectOrg" value={fields.organization} onChange={e => set("organization", e.target.value)} />
      </div>
      <div className="devPocField">
        <label htmlFor="devPocProjectUrl">Website URL <span className="devPocMuted">(optional)</span></label>
        <input id="devPocProjectUrl" value={fields.websiteUrl} onChange={e => set("websiteUrl", e.target.value)} />
        <p className="devPocHelp">A website lets you restrict individual keys to it.</p>
      </div>
    </div>
    <fieldset className="devPocFieldset">
      <legend>Visibility</legend>
      <label className="devPocChoice">
        <input type="radio" name="devPocVisibility" checked={fields.visibility === "private"} onChange={() => set("visibility", "private")} />
        <span>Private<span className="devPocHelp">Only you and Sefaria see the project details.</span></span>
      </label>
      <label className="devPocChoice">
        <input type="radio" name="devPocVisibility" checked={fields.visibility === "public"} onChange={() => set("visibility", "public")} />
        <span>Public<span className="devPocHelp">I'd like this project listed on Powered by Sefaria. Listing is at Sefaria's discretion; it may not appear publicly.</span></span>
      </label>
    </fieldset>
    <label className="devPocChoice">
      <input type="checkbox" checked={fields.aiAssisted} onChange={e => set("aiAssisted", e.target.checked)} />
      <span>Built with AI assistance</span>
    </label>
  </React.Fragment>
);


const NewProjectDialog = ({onCreate, onCancel}) => {
  const [fields, setFields] = useState({
    name: "", description: "", organization: "", websiteUrl: "", visibility: "private", aiAssisted: false,
  });
  const [error, setError] = useState("");
  const set = (key, value) => setFields(f => ({...f, [key]: value}));

  const submit = (e) => {
    e.preventDefault();
    if (!fields.name.trim()) { setError("Project name is required."); return; }
    if (!fields.description.trim()) { setError("A one-line description is required."); return; }
    setError("");
    onCreate({...fields, name: fields.name.trim(), description: fields.description.trim()});
  };

  return (
    <div className="devPocModalStage" role="dialog" aria-label="New project">
      <section className="devPocDialog">
        <header className="devPocDialogHeader">
          <h2>New project</h2>
          <p>Tell us what you're building. You can add a key next.</p>
        </header>
        <form className="devPocForm" onSubmit={submit}>
          <ProjectFields fields={fields} set={set} />
          <p className="devPocNotice">This project belongs to your account and cannot be transferred.</p>
          {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
          <div className="devPocActions">
            <button type="submit" className="devPocButton">Create project</button>
            <button type="button" className="devPocButton quiet" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </section>
    </div>
  );
};


const EditProjectForm = ({project, onSave, onCancel, onDelete}) => {
  const [fields, setFields] = useState({
    name: project.name, description: project.description, organization: project.organization,
    websiteUrl: project.websiteUrl, visibility: project.visibility, aiAssisted: project.aiAssisted,
  });
  const [error, setError] = useState("");
  const set = (key, value) => setFields(f => ({...f, [key]: value}));

  const submit = (e) => {
    e.preventDefault();
    if (!fields.name.trim() || !fields.description.trim()) { setError("Name and one-line description are required."); return; }
    setError("");
    onSave({...fields, name: fields.name.trim(), description: fields.description.trim()});
  };

  return (
    <form className="devPocForm devPocEditProject" onSubmit={submit}>
      <ProjectFields fields={fields} set={set} />
      {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
      <div className="devPocActions">
        <button type="submit" className="devPocButton">Save project</button>
        <button type="button" className="devPocButton quiet" onClick={onCancel}>Cancel</button>
        <button type="button" className="devPocButton quiet danger" onClick={onDelete}>Delete project</button>
      </div>
    </form>
  );
};


const RestrictionToggle = ({project, apiKey, onToggle}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const host = websiteHost(project.websiteUrl);
  return (
    <div className="devPocRestriction">
      <label className="devPocChoice">
        <input
          type="checkbox"
          className="devPocSwitch"
          checked={!!apiKey.restrictToWebsite}
          onChange={e => onToggle(e.target.checked)}
          aria-label={"Restrict " + apiKey.label + " to " + host}
        />
        <span>
          Only accept requests from <code>{host}</code>. Requests with this key from any other website are refused.
        </span>
      </label>
      <button
        type="button"
        className="devPocInfoButton"
        aria-expanded={popoverOpen}
        onClick={() => setPopoverOpen(o => !o)}
      >What does this do?</button>
      {popoverOpen ?
        <p className="devPocPopover" role="note">
          This protects against someone copying your key into their own website. It does not stop a
          determined attacker, who can fake the origin. If your project has its own server, or is a
          script or an app, turn this off, otherwise your own requests will be refused.
        </p> : null}
    </div>
  );
};


const KeyRow = ({project, apiKey, novice, onToggleRestriction, onRevoke}) => {
  const [copyLabel, setCopyLabel] = useState("Copy");
  const codeRef = useRef(null);
  return (
    <article className="devPocKey">
      <div className="devPocKeyHeading">
        <strong>{apiKey.label}</strong>
        <button type="button" className="devPocButton quiet danger" onClick={onRevoke}>Revoke key</button>
      </div>
      <div className="devPocKeyValue">
        <code ref={codeRef}>{apiKey.value}</code>
        <button
          type="button"
          className="devPocButton secondary"
          onClick={() => copyToClipboard(apiKey.value, codeRef.current, setCopyLabel)}
        >{copyLabel}</button>
      </div>
      <div className="devPocKeyMeta">
        <span>Created {formatDate(apiKey.created)}</span>
        <span>Last used: {formatDate(apiKey.lastUsed)}</span>
        <span>{apiKey.requests30.toLocaleString()} requests / 30 days (sample data)</span>
      </div>
      {project.websiteUrl ?
        <RestrictionToggle project={project} apiKey={apiKey} onToggle={onToggleRestriction} /> :
        <p className="devPocHelp">Add a website URL to this project to restrict this key to it.</p>}
      {novice ?
        <p className="devPocHelp">Paste this key into the API-key setting in your tool. You can always find it here again.</p> : null}
    </article>
  );
};


const KeysSection = ({project, novice, update, setConfirm}) => {
  const [creating, setCreating] = useState(false);   // showing the label form
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState("idle");        // idle | setting-up | error
  const [error, setError] = useState("");
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const atLimit = project.keys.length >= MAX_KEYS_PER_PROJECT;

  const startCreate = (e) => {
    e.preventDefault();
    if (!label.trim()) { setError("A label is required."); return; }
    setError("");
    setPhase("setting-up");
    const wanted = label.trim();
    timer.current = setTimeout(() => {
      let failed = false;
      update(s => {
        failed = !!s.failNextKey;
        if (failed) { return {...s, failNextKey: false}; }
        return {
          ...s,
          projects: s.projects.map(p => p.id === project.id ? {...p, keys: [...p.keys, makeKey(wanted)]} : p),
        };
      });
      if (failed) { setPhase("error"); } else { setPhase("idle"); setCreating(false); setLabel(""); }
    }, KEY_SETUP_MS);
  };

  const toggleRestriction = (keyId, on) => update(s => ({
    ...s,
    projects: s.projects.map(p => p.id !== project.id ? p : {
      ...p, keys: p.keys.map(k => k.id === keyId ? {...k, restrictToWebsite: on} : k),
    }),
  }));

  const revoke = (apiKey) => setConfirm({
    title: "Revoke “" + apiKey.label + "”?",
    body: "This key for " + project.name + " will stop working immediately. Anything using it loses access. This cannot be undone.",
    actionLabel: "Revoke key",
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
            className="devPocButton"
            disabled={atLimit}
            onClick={() => { setCreating(true); setPhase("idle"); setError(""); }}
          >Create key</button>}
      </div>
      {atLimit ?
        <p className="devPocNotice">This project has {MAX_KEYS_PER_PROJECT} keys, the maximum. Revoke a key you no longer use before creating another.</p> : null}
      {novice ?
        <p className="devPocNotice">An API key connects your tool to Sefaria. Copy it into the API-key setting in your tool. You can always find it here again.</p> :
        <p className="devPocHelp">Send your key in the <code>x-api-key</code> header. Keys stay available here.</p>}

      {creating && phase === "idle" ?
        <form className="devPocForm devPocCreateKey" onSubmit={startCreate}>
          <div className="devPocField">
            <label htmlFor="devPocKeyLabel">Key label</label>
            <input id="devPocKeyLabel" value={label} onChange={e => setLabel(e.target.value)} />
            <p className="devPocHelp">Choose a name you'll recognize, such as Production or Staging.</p>
          </div>
          {error ? <p className="devPocWarning" role="alert">{error}</p> : null}
          <div className="devPocActions">
            <button type="submit" className="devPocButton">Create key</button>
            <button type="button" className="devPocButton quiet" onClick={() => { setCreating(false); setError(""); }}>Cancel</button>
          </div>
        </form> : null}
      {phase === "setting-up" ?
        <div className="devPocNotice" role="status">
          <strong>Setting up your key</strong>
          <p>It appears here as soon as it works.</p>
        </div> : null}
      {phase === "error" ?
        <div className="devPocWarning" role="alert">
          <strong>We couldn't create your key.</strong>
          <p>No key was created. Please try again.</p>
          <button type="button" className="devPocButton secondary" onClick={() => setPhase("idle")}>Try again</button>
        </div> : null}

      <div className="devPocKeyList">
        {project.keys.length === 0 && !creating && phase === "idle" ?
          <p className="devPocNotice">Your project is ready. Create a key to start using the API.</p> : null}
        {project.keys.map(k => (
          <KeyRow
            key={k.id}
            project={project}
            apiKey={k}
            novice={novice}
            onToggleRestriction={on => toggleRestriction(k.id, on)}
            onRevoke={() => revoke(k)}
          />
        ))}
      </div>
    </section>
  );
};


const ListingSection = ({project, update}) => {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const isPublic = project.visibility === "public";
  const normalized = query.trim().toLowerCase();
  const results = normalized
    ? POWERED_BY_LISTINGS.filter(l => (l.name + " " + l.url).toLowerCase().includes(normalized))
    : POWERED_BY_LISTINGS;

  const requestLink = (listing) => update(s => ({
    ...s,
    projects: s.projects.map(p => p.id === project.id ? {...p, listingRequest: listing} : p),
  }));
  const cancelLink = () => update(s => ({
    ...s,
    projects: s.projects.map(p => p.id === project.id ? {...p, listingRequest: null} : p),
  }));

  return (
    <section className="devPocSection">
      <div className="devPocHeading">
        <div>
          <h3>Powered by Sefaria</h3>
          <p className="devPocHelp">{isPublic ? "This project is public." : "This project is private."}</p>
        </div>
      </div>
      <p className="devPocHelp">
        {isPublic
          ? "You've consented to a possible Powered by Sefaria listing. Listing is at Sefaria's discretion; your project may not appear publicly."
          : "Make it public in Edit project if you'd like it listed. Listing is at Sefaria's discretion; your project may not appear publicly."}
      </p>
      {project.listingRequest ?
        <div className="devPocSuccess" role="status">
          <strong>Link requested, awaiting confirmation</strong>
          <p>You asked to link <strong>{project.listingRequest.name}</strong> ({project.listingRequest.url}) to this project.</p>
          <button type="button" className="devPocButton quiet" onClick={cancelLink}>Cancel request</button>
        </div> :
        searching ?
          <div className="devPocListingSearch">
            <div className="devPocField">
              <label htmlFor="devPocListingSearch">Search existing listings by name or website</label>
              <input id="devPocListingSearch" type="search" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            {results.length === 0 ? <p className="devPocHelp">No matching listings. Try another name or website.</p> : null}
            {results.map(l => (
              <div className="devPocResult" key={l.url}>
                <div>
                  <strong>{l.name}</strong>
                  <p className="devPocHelp">{l.url}</p>
                </div>
                <button type="button" className="devPocButton secondary" onClick={() => requestLink(l)}>Request link</button>
              </div>
            ))}
            <p className="devPocHelp">
              Sefaria confirms the connection, because someone else may have submitted the listing. The listing and your project stay linked, not merged.
            </p>
            <div className="devPocActions">
              <button type="button" className="devPocButton quiet" onClick={() => setSearching(false)}>Close</button>
            </div>
          </div> :
          <button type="button" className="devPocTextButton" onClick={() => setSearching(true)}>
            Already listed? Link your listing
          </button>}
    </section>
  );
};


const UsageSection = ({project}) => (
  <section className="devPocSection">
    <div className="devPocHeading">
      <div>
        <h3>Usage</h3>
        <p className="devPocHelp">Sample data. Real usage numbers are not part of this POC.</p>
      </div>
    </div>
    <div className="devPocStats">
      <div className="devPocStat">
        <strong>{project.usage.requests30.toLocaleString()}</strong>
        <span>Requests in the last 30 days</span>
      </div>
      <div className="devPocStat">
        <strong>{formatDate(project.usage.lastUsed)}</strong>
        <span>Last request</span>
      </div>
      <div className="devPocStat">
        <strong>{project.keys.length}</strong>
        <span>Keys in this project</span>
      </div>
    </div>
  </section>
);


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
        <div className="devPocHeading">
          <div>
            <h2>{project.name}</h2>
            <span className="devPocBadge">{project.visibility === "public" ? "Public" : "Private"}</span>
            {project.aiAssisted ? <span className="devPocBadge">Built with AI assistance</span> : null}
          </div>
          <div className="devPocProjectActions">
            {expanded ?
              <button type="button" className="devPocButton quiet" onClick={() => setEditing(e => !e)}>
                {editing ? "Close editor" : "Edit project"}
              </button> : null}
            <button type="button" className="devPocButton secondary" onClick={onToggleExpand}>
              {expanded ? "Collapse" : "Open"}
            </button>
          </div>
        </div>
        <p>{project.description}</p>
        <p className="devPocHelp">
          {project.organization ? project.organization + " · " : ""}
          {project.keys.length} {project.keys.length === 1 ? "key" : "keys"}
          {project.websiteUrl ? " · " + websiteHost(project.websiteUrl) : ""}
        </p>
      </header>
      {expanded && editing ?
        <section className="devPocSection">
          <EditProjectForm
            project={project}
            onSave={saveProject}
            onCancel={() => setEditing(false)}
            onDelete={deleteProject}
          />
        </section> : null}
      {expanded ?
        <React.Fragment>
          <KeysSection project={project} novice={novice} update={update} setConfirm={setConfirm} />
          <UsageSection project={project} />
          <ListingSection project={project} update={update} />
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
        <button type="button" className="devPocButton secondary" onClick={() => onClose(false)}>Cancel</button>
        <button type="button" className="devPocButton danger" onClick={() => onClose(true)}>{confirm.actionLabel}</button>
      </div>
    </section>
  </div>
);


const DeveloperSettingsPage = ({socialProviders, initialProjectId}) => {
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
    return (
      <div className="readerNavMenu devPocPage" key="developerSettings">
        <div className="content"><div className="contentInner"><p>Loading developer settings&hellip;</p></div></div>
      </div>
    );
  }

  const connected = ssoConnected(state, socialProviders);
  const off = !connected || !state.developerEnabled;
  const novice = !!(state.profile && state.profile.notADeveloper);

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
                <React.Fragment>
                  {notice ?
                    <div className="devPocNotice" role="status">
                      <p>{notice}</p>
                      <button type="button" className="devPocButton quiet" onClick={() => setNotice("")}>Dismiss</button>
                    </div> : null}

                  <section className="devPocProfile">
                    {!state.profile || editingProfile ?
                      <React.Fragment>
                        <h2>Developer profile</h2>
                        <ProfileForm
                          profile={state.profile}
                          onSave={profile => { update(s => ({...s, profile})); setEditingProfile(false); }}
                          onCancel={state.profile ? () => setEditingProfile(false) : null}
                        />
                      </React.Fragment> :
                      <div className="devPocProfileSummary">
                        <span>
                          <strong>{state.profile.developerName}</strong>
                          <span className="devPocHelp">{Sefaria._email}{state.profile.description ? " · " + state.profile.description : ""}</span>
                        </span>
                        <button type="button" className="devPocButton quiet" onClick={() => setEditingProfile(true)}>Edit profile</button>
                      </div>}
                  </section>

                  <div className="devPocSectionHeading">
                    <h2>Projects</h2>
                    {state.projects.length ?
                      <button type="button" className="devPocButton secondary" onClick={() => setShowNewProject(true)}>New project</button> : null}
                  </div>

                  {state.projects.length === 0 ?
                    <div className="devPocEmpty">
                      <h2>Your first project starts here</h2>
                      <p>Register what you're building, then create an API key for it.</p>
                      <div className="devPocActions">
                        <button type="button" className="devPocButton" onClick={() => setShowNewProject(true)}>Create your first project</button>
                      </div>
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

                  {novice ?
                    <section className="devPocSection devPocNoviceHelp">
                      <h3>How do I use my key?</h3>
                      <ol>
                        <li>Copy a key above.</li>
                        <li>Paste it into your tool's API-key setting. If you are writing code, send it in the <code>x-api-key</code> header, never in a URL.</li>
                        <li>If your tool runs on a server, leave the website restriction off.</li>
                      </ol>
                      <p className="devPocHelp">Keep keys out of public code.</p>
                    </section> : null}
                </React.Fragment>}
            </main>
          </div>
        </div>
      </div>
      {showNewProject ? <NewProjectDialog onCreate={createProject} onCancel={() => setShowNewProject(false)} /> : null}
      {confirm ? <ConfirmDialog confirm={confirm} onClose={closeConfirm} /> : null}
      <PocTestPanel state={state} realProviders={socialProviders} update={update} reset={reset} showSimulate={true} />
    </div>
  );
};


export default DeveloperSettingsPage;
