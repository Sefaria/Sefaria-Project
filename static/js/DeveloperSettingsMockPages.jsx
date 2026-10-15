import React, { useEffect, useState } from 'react';
import SettingsPage, { EmailConfirmedPage, EmailLinkPage } from './SettingsPage';
import { mockAction, mockContext, setMockAccount } from './developerSettingsApi';
import { MOCK_CHANGED_EVENT, cachedMockBlob, developerState } from './developerSettingsMock';

/* The settings page and confirmation link pages of the developer settings POC, with the mock
   in place of the server. SettingsPage.jsx is the product page, unchanged; everything mock-only
   lives here. */

const PANEL_OPEN_KEY = "sefariaDeveloperPocMorePanelOpen";

const readPanelOpen = () => {
  try { return window.localStorage.getItem(PANEL_OPEN_KEY) === "1"; } catch (e) { return false; }
};

const writePanelOpen = (open) => {
  try { window.localStorage.setItem(PANEL_OPEN_KEY, open ? "1" : "0"); } catch (e) { /* ignore */ }
};

/* Where an emailed link lands, for each way it can fail to confirm. */
const LINK_PAGES = [
  {status: null, label: "Confirmed (thank you)"},
  {status: "expired", label: "Expired link"},
  {status: "already-confirmed", label: "Already used link"},
  {status: "not-account-email", label: "Link for an old address"},
];

const linkPageUrl = (status) => "/settings/developer/email-confirmed" + (status ? "?link=" + status : "");

const QUIET_ACTIONS = ["fail-next", "send-limit"];

const PANEL_STYLE = {right: "auto", left: 16, alignItems: "flex-start", zIndex: 100000};

/* States the test controls in SettingsPage.jsx don't reach. Same look as those controls, in the
   other corner. Without onAction it only links to the confirmation link pages. */
const MoreTestStates = ({mock, projectId, onAction}) => {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setOpen(readPanelOpen()); }, []);

  const toggle = (next) => { setOpen(next); writePanelOpen(next); };

  /* Arming an error or changing the email limits leaves the page as it is; the other actions
     jump to a new state. */
  const act = (action, fields) => {
    setError("");
    const jump = !QUIET_ACTIONS.includes(action);
    mockAction(action, fields).then(data => onAction(data, jump), err => setError(err.message || "That didn't work."));
  };

  const button = (label, action, fields) => (
    <button type="button" className="devPocPanelButton" data-poc-control={action} onClick={() => act(action, fields)}>{label}</button>
  );

  const failNext = mock ? mock.failNext : null;
  const sendsToday = mock ? mock.confirmationSendsToday : 0;

  return (
    <div className="devPocPanel" data-open={open ? "true" : "false"} lang="en" style={PANEL_STYLE} data-poc-panel="more">
      <button type="button" className="devPocPanelPill" aria-expanded={open} onClick={() => toggle(true)}>
        🧪 More test states
      </button>
      <div className="devPocPanelBody">
        <div className="devPocPanelHeader">
          <div>
            <p className="devPocPanelTitle">MORE TEST STATES</p>
            <p className="devPocPanelSub">POC only. Everything here is mock data in this session.</p>
          </div>
          <button type="button" className="devPocPanelClose" aria-label="Collapse more test states" onClick={() => toggle(false)}>
            Hide
          </button>
        </div>

        {onAction ?
          <React.Fragment>
            <div className="devPocPanelGroup">
              <div className="devPocPanelGroupLabel">Jump to</div>
              <div className="devPocPanelRow">
                {button("Google account with a project", "sample")}
                {button("Email account, link sent", "link-sent")}
              </div>
              <div className="devPocPanelRow">
                {button("Account email changed", "email-changed")}
                {button("Listing added after outreach", "outreach")}
              </div>
              <p className="devPocPanelNote">
                "Account email changed" shows "Confirm your new email address": projects and keys stay,
                new ones wait until the new address is confirmed.
              </p>
            </div>

            <div className="devPocPanelGroup">
              <div className="devPocPanelGroupLabel">Keys</div>
              <div className="devPocPanelRow">
                {button("Fill a project to 5 keys", "fill-keys", {projectId})}
              </div>
              <p className="devPocPanelNote">Uses the open project, or the first one. Shows the key limit.</p>
            </div>

            <div className="devPocPanelGroup">
              <div className="devPocPanelGroupLabel">Errors</div>
              <div className="devPocPanelRow">
                {button("Next key creation fails", "fail-next", {failNext: "key"})}
                {button("Next change fails", "fail-next", {failNext: "any"})}
                {failNext ? button("Disarm", "fail-next", {failNext: null}) : null}
              </div>
              <p className="devPocPanelNote devPocPanelStatus" role="status">
                {failNext === "key" ? "Armed: the next key creation fails." :
                  failNext === "any" ? "Armed: the next change fails." : "Nothing armed."}
              </p>
              <div className="devPocPanelRow">
                {button("Use up today's confirmation emails", "send-limit", {reached: true})}
                {button("Reset email limits", "send-limit", {reached: false})}
              </div>
              <p className="devPocPanelNote">
                {sendsToday} of 5 confirmation emails sent today. A resend within a minute shows the cooldown error.
              </p>
            </div>
          </React.Fragment> : null}

        <div className="devPocPanelGroup">
          <div className="devPocPanelGroupLabel">Confirmation link pages</div>
          <div className="devPocPanelRow">
            {LINK_PAGES.map(page => (
              <a key={page.label} className="devPocPanelButton" href={linkPageUrl(page.status)} data-poc-link-page={page.status || "confirmed"}>
                {page.label}
              </a>
            ))}
          </div>
          <p className="devPocPanelNote">
            "Send a new link" on the expired page works while the email is unconfirmed, and is refused once it is.
          </p>
          {onAction ? null :
            <div className="devPocPanelRow">
              <a className="devPocPanelButton" href="/settings/developer">Back to developer settings</a>
            </div>}
        </div>

        {error ? <p className="devPocPanelNote" role="alert">{error}</p> : null}
      </div>
    </div>
  );
};


const stateFor = (developerPoc, accountSettings) => developerState(
  cachedMockBlob() || developerPoc,
  {...mockContext(), realProviders: (accountSettings || {}).socialProviders || []},
);

/* The settings page with the mock's developer state. The developer tab is always there. A
   jump from the extra test panel starts the page over on the new state. */
export const MockSettingsPage = ({developerPoc, accountSettings, tab, projectId, setTab, setProjectId}) => {
  setMockAccount(accountSettings || {});
  const [initial, setInitial] = useState(() => stateFor(developerPoc, accountSettings));
  const [mountCount, setMountCount] = useState(0);
  const [mock, setMock] = useState(initial.mock);

  useEffect(() => {
    const refresh = () => setMock(stateFor(developerPoc, accountSettings).mock);
    window.addEventListener(MOCK_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(MOCK_CHANGED_EVENT, refresh);
  }, []);

  const jumped = (data, jump) => {
    setMock(data.mock);
    if (!jump) { return; }
    setTab("developer");
    setProjectId(data.projectId || null);
    setInitial(data);
    setMountCount(n => n + 1);
  };

  return (
    <React.Fragment>
      <SettingsPage
        key={mountCount}
        tab={tab}
        projectId={projectId}
        accountSettings={accountSettings}
        initialDeveloper={initial}
        setTab={setTab}
        setProjectId={setProjectId}
      />
      <MoreTestStates mock={mock} projectId={projectId} onAction={jumped} />
    </React.Fragment>
  );
};


const LINK_STATUSES = ["expired", "already-confirmed", "not-account-email"];

/* Where the mock emailed link lands. The server confirms any link it gets, so the pages for a
   link that can't confirm open from the test panel, as ?link=<status>. */
export const MockEmailLandingPage = () => {
  const [status] = useState(() => (
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("link")
  ));
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) { return null; }
  return (
    <React.Fragment>
      {LINK_STATUSES.includes(status) ?
        <EmailLinkPage link={{status, key: "mock"}} /> :
        <EmailConfirmedPage />}
      <MoreTestStates />
    </React.Fragment>
  );
};
