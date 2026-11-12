/* global __dirname */
/**
 * SettingsPage: the settings tabs, Developer Settings setup (welcome, email confirmation, About you, the first project
 * and key), the pages an emailed confirmation link lands on, arriving from the Powered by link, the Hebrew interface,
 * and the developer API helpers. The home page once set up is in developerSettingsHome.test.js; refusals and the
 * confirmation poll in developerSettingsRefusals.test.js.
 */
import {
  EMAIL_NEW,
  READY,
  SSO_NEW,
  advance,
  blur,
  button,
  choose,
  cleanup,
  click,
  fakeServer,
  field,
  heading,
  key,
  loadSettings,
  project,
  projectSection,
  queryButton,
  renderElement,
  renderSettings,
  screen,
  settle,
  type,
  within,
} from './developerSettingsTestUtils';

jest.mock('../sefaria/sefaria', () => require('./developerSettingsTestUtils').sefariaMock());
jest.mock('../sefaria/sefariaJquery', () => require('./developerSettingsTestUtils').jqueryMock());
jest.mock('../Misc', () => require('./developerSettingsTestUtils').miscMock());
// The profile card's ProfilePic pulls in the image cropper's CSS, which Jest can't parse.
jest.mock('../ProfilePic', () => ({ ProfilePic: () => null }));

const HEBREW = /[֐-׿]/;

let lib = null;
let server = null;

/* The Developer tab, with the server holding the same state. */
const open = (developer, extra) => {
  server = fakeServer(developer || {});
  return renderSettings('developer', developer, extra);
};

beforeEach(() => {
  lib = loadSettings();
  window.scrollTo = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('settings tabs', () => {
  it('has an Account tab and a Developer tab, marking the open one', () => {
    fakeServer();
    renderSettings('account');
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')])).toEqual([
      ['Account Settings', '/settings/account'],
      ['Developer Settings', '/settings/developer'],
    ]);
    expect(links[0].getAttribute('aria-current')).toBe('page');
    expect(links[1].getAttribute('aria-current')).toBeNull();
  });

  it('switches tabs in place, without following the link', async () => {
    fakeServer();
    const page = renderSettings('account');
    await click(screen.getByRole('link', { name: 'Developer Settings' }));
    expect(page.props.setTab).toHaveBeenCalledWith('developer');
  });

  it('keeps developer settings out of the Account tab', () => {
    fakeServer();
    renderSettings('account');
    expect(screen.queryByRole('heading', { name: 'Get a free API key' })).toBeNull();
    expect(queryButton('Get started')).toBeNull();
  });

  it('has no Developer tab or agent instructions where developer settings are off', () => {
    fakeServer();
    const { container } = renderSettings('account', null);
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'))
    ).toEqual(['/settings/account']);
    expect(container.querySelectorAll('.settingsPanel').length).toBe(1);
    expect(container.querySelector('[data-agent-instructions]')).toBeNull();
  });

  it('reads the developer state again when the Developer tab is opened', async () => {
    const page = open(SSO_NEW, { tab: 'account' });
    expect(server.count('GET', 'state')).toBe(0);
    page.update({ tab: 'developer' });
    await settle();
    expect(server.count('GET', 'state')).toBe(1);
  });
});

describe('agent instructions', () => {
  it('are in the page, visually hidden but not hidden from assistive tech', () => {
    const { container } = open(SSO_NEW);
    const instructions = container.querySelector('[data-agent-instructions]');
    expect(instructions.className).toBe('sr-only');
    expect(instructions.closest('[aria-hidden="true"]')).toBeNull();
    expect(within(instructions).getByRole('heading', { name: 'Instructions for AI agents' })).toBeTruthy();
    expect(instructions.textContent).toContain('https://github.com/Sefaria/Sefaria-Export');
  });
});

describe('the welcome screen', () => {
  const steps = () =>
    within(screen.getByRole('region', { name: 'Get a free API key' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent.replace(/^\d/, ''));

  it('lists the steps, with confirming the email first for an email account', () => {
    open(EMAIL_NEW);
    expect(heading('Get a free API key')).toBeTruthy();
    expect(steps()).toEqual([
      'Confirm your email',
      'Tell us about yourself',
      'Add your project details',
      'Create your API key',
    ]);
    expect(button('Get started')).toBeTruthy();
  });

  it('leaves out confirming the email for a Google or Apple account', () => {
    open(SSO_NEW);
    expect(steps()).toEqual(['Tell us about yourself', 'Add your project details', 'Create your API key']);
  });

  it('links to the API docs and the library download, each saying it opens a new tab', () => {
    open(SSO_NEW);
    expect(
      screen.getByRole('link', { name: 'Technical documentation (opens in a new tab)' }).getAttribute('href')
    ).toBe('https://developers.sefaria.org/reference/getting-started');
    expect(screen.getByRole('link', { name: 'Download the library (opens in a new tab)' }).getAttribute('href')).toBe(
      'https://github.com/Sefaria/Sefaria-Export'
    );
  });
});

describe('confirming the email', () => {
  it('asks to send a link to the account email as step 1', async () => {
    open(EMAIL_NEW);
    await click(button('Get started'));
    expect(heading('Step 1 of 4: Confirm your email')).toBeTruthy();
    expect(screen.getByText('tova@example.org')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Change it in Account Settings' }).getAttribute('href')).toBe(
      '/settings/account#username-change'
    );
  });

  it('sends the link, then waits on "Check your email" with a resend countdown', async () => {
    jest.useFakeTimers();
    open(EMAIL_NEW);
    await click(button('Get started'));
    await click(button('Send confirmation link'));
    expect(server.count('POST', 'confirmation')).toBe(1);
    expect(heading('Check your email')).toBeTruthy();
    expect(screen.getByText(/We sent a confirmation link to/).textContent).toContain('tova@example.org');
    expect(button('Resend in 60s').disabled).toBe(true);
    await advance(60000);
    expect(button('Resend link').disabled).toBe(false);
    await click(button('Resend link'));
    expect(server.count('POST', 'confirmation')).toBe(2);
  });

  it('goes back to the welcome screen from the confirm step', async () => {
    open(EMAIL_NEW);
    await click(button('Get started'));
    await click(button('Back to Developer Settings'));
    expect(heading('Get a free API key')).toBeTruthy();
    expect(server.requests).toEqual([]);
  });

  it('goes straight to "Check your email" while a link sent earlier still works', async () => {
    open({ ...EMAIL_NEW, confirmationSentAt: new Date().toISOString() });
    await click(button('Get started'));
    expect(heading('Check your email')).toBeTruthy();
    expect(button('Resend link')).toBeTruthy();
  });

  it('asks for a new link once the one sent has expired', async () => {
    open({ ...EMAIL_NEW, confirmationSentAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString() });
    await click(button('Get started'));
    expect(heading('Step 1 of 4: Confirm your email')).toBeTruthy();
  });

  it('notices the link was opened, and carries on to About you as step 2', async () => {
    jest.useFakeTimers();
    open({ ...EMAIL_NEW, confirmationSentAt: new Date().toISOString() });
    await click(button('Get started'));
    server.state.emailVerified = true;
    server.state.developerEnabled = true;
    await advance(3000);
    expect(server.count('GET', 'state')).toBe(1);
    await advance(1200);
    expect(heading('Step 2 of 4: About you')).toBeTruthy();
  });

  it('checks at once when another tab in this browser signals the link was opened', async () => {
    open({ ...EMAIL_NEW, confirmationSentAt: new Date().toISOString() });
    await lib.act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: lib.api.CONFIRMATION_SIGNAL_KEY }));
    });
    await settle();
    expect(server.count('GET', 'state')).toBe(1);
  });
});

describe('About you', () => {
  const startSso = async () => {
    open(SSO_NEW);
    await click(button('Get started'));
  };

  it('is step 1 of 3 for a Google or Apple account, with the account name and email', async () => {
    await startSso();
    expect(heading('Step 1 of 3: About you')).toBeTruthy();
    expect(screen.getByText(/Signed in as/).textContent).toBe('Signed in as Tova Levi (tova@example.org)');
    // The account has a name, so there is no name field.
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(screen.getByRole('link', { name: 'Sefaria API terms' }).getAttribute('href')).toBe('/api-terms');
  });

  it('asks for a name when the account has none', async () => {
    lib.Sefaria.full_name = '';
    await startSso();
    await choose('What best describes you?', 'Very technical');
    await click(button('Continue'));
    expect(field('Name').getAttribute('aria-invalid')).toBe('true');
    expect(server.requests).toEqual([]);
  });

  it('requires what best describes you, and a valid additional email', async () => {
    await startSso();
    await click(button('Continue'));
    expect(screen.getByRole('button', { name: /What best describes you\?/ }).getAttribute('aria-invalid')).toBe('true');
    await choose('What best describes you?', 'Not technical');
    const extra = field(/Additional email address/);
    type(extra, 'not-an-email');
    blur(extra);
    expect(extra.getAttribute('aria-invalid')).toBe('true');
    await click(button('Continue'));
    expect(server.requests).toEqual([]);
  });

  it('explains the additional email in a tip read with the field', async () => {
    await startSso();
    const extra = field(/Additional email address/);
    const tip = extra.getAttribute('aria-describedby').split(' ')[0];
    expect(document.getElementById(tip).textContent).toContain("Emails will be sent to your Sefaria account's email");
  });

  it('counts the characters about yourself, up to 250', async () => {
    await startSso();
    const about = field(/Tell us about yourself/);
    expect(about.getAttribute('maxLength')).toBe('250');
    type(about, 'Hello');
    expect(screen.getByText('5/250')).toBeTruthy();
  });

  it('turns developer settings on and saves the profile, then asks for the project', async () => {
    await startSso();
    await choose('What best describes you?', 'Somewhat technical');
    type(field(/Tell us about yourself/), ' I teach ');
    type(field(/Additional email address/), ' tova@work.example ');
    await click(field(/developer newsletter/));
    expect(screen.getByRole('link', { name: 'Join our Discord' })).toBeTruthy();
    await click(button('Continue'));
    expect(server.calls()).toEqual(['POST enable', 'POST profile']);
    expect(server.sent('POST', 'profile')[0].profile).toEqual(
      expect.objectContaining({
        developerName: 'Tova Levi',
        description: 'I teach',
        additionalEmail: 'tova@work.example',
        termsAccepted: true,
        developerNews: true,
        notADeveloper: true,
      })
    );
    expect(heading('Step 2 of 3: Your project')).toBeTruthy();
  });

  it('goes back to the welcome screen on Cancel, saving nothing', async () => {
    await startSso();
    await click(button('Cancel'));
    expect(heading('Get a free API key')).toBeTruthy();
    expect(server.requests).toEqual([]);
  });

  it("keeps the form with the server's reason when saving fails", async () => {
    await startSso();
    server.fail('POST', 'profile', 400, 'Accept the API terms to continue.');
    await choose('What best describes you?', 'Very technical');
    await click(button('Continue'));
    expect(screen.getByRole('alert').textContent).toContain('Accept the API terms to continue.');
    expect(heading('Step 1 of 3: About you')).toBeTruthy();
    expect(button('Continue').disabled).toBe(false);
  });

  it('picks up at About you when arriving from the email-confirmed page', () => {
    lib = loadSettings({ search: '?continue' });
    open({ developerEnabled: true, ssoConnected: false, emailVerified: true });
    expect(heading('Step 2 of 4: About you')).toBeTruthy();
  });
});

describe('the first project and key', () => {
  /* At "Your project", with a profile saved. */
  const atProjectStep = async () => {
    open(SSO_NEW);
    await click(button('Get started'));
    await choose('What best describes you?', 'Very technical');
    await click(button('Continue'));
  };
  const fillProject = async () => {
    type(field(/Project name/), 'Daf Tracker');
    await choose('What are you building?', 'Just exploring the API');
    type(field(/Short description/), 'Tracks the daf');
  };
  const newProject = () => server.state.projects[0];

  it("says a project can't be moved to another account", async () => {
    await atProjectStep();
    expect(screen.getByText("Projects created in this account can't be moved to another account.")).toBeTruthy();
  });

  it('can be skipped, landing on the projects page with a message', async () => {
    await atProjectStep();
    await click(button('Skip for now'));
    expect(screen.getByText("Your profile is saved. Create a project whenever you're ready.")).toBeTruthy();
    expect(heading('No projects or keys yet')).toBeTruthy();
  });

  it('goes back to About you, filled in, and forward again', async () => {
    await atProjectStep();
    await click(button('Back'));
    expect(heading('Step 1 of 3: About you')).toBeTruthy();
    expect(screen.getByRole('button', { name: /What best describes you\?/ }).textContent).toContain('Very technical');
    await click(button('Continue'));
    expect(server.calls()).toEqual(['POST enable', 'POST profile', 'POST profile']);
    expect(heading('Step 2 of 3: Your project')).toBeTruthy();
  });

  it('creates the project, then names its first key as step 3', async () => {
    await atProjectStep();
    await fillProject();
    await click(button('Continue'));
    expect(server.sent('POST', 'projects')[0].project).toEqual(
      expect.objectContaining({ name: 'Daf Tracker', purpose: 'exploring', websiteUrl: '', visibility: 'private' })
    );
    expect(heading('Step 3 of 3: Create an API key for Daf Tracker')).toBeTruthy();
    expect(field(/API key name/).getAttribute('placeholder')).toBe('My key');
  });

  it('creates the key, waits a moment, and shows it on the projects page', async () => {
    jest.useFakeTimers();
    await atProjectStep();
    await fillProject();
    await click(button('Continue'));
    type(field(/API key name/), 'Website key');
    await click(button('Create API key'));
    expect(server.sent('POST', 'projects/' + newProject().id + '/keys')).toEqual([{ label: 'Website key' }]);
    expect(screen.getByText('Creating your key…')).toBeTruthy();
    await advance(3999);
    expect(screen.getByText('Creating your key…')).toBeTruthy();
    await advance(1);
    const section = projectSection('Daf Tracker');
    expect(within(section).getByRole('row', { name: /Website key/ }).className).toContain('is-new');
  });

  it('asks for the website when the new key is limited to one, and saves it to the project first', async () => {
    jest.useFakeTimers();
    await atProjectStep();
    await fillProject();
    await click(button('Continue'));
    type(field(/API key name/), 'Website key');
    await click(screen.getByRole('switch', { name: 'Limit this key to your website' }));
    await click(button('Create API key'));
    expect(field(/Your website/).getAttribute('aria-invalid')).toBe('true');
    type(field(/Your website/), 'daftracker.org');
    await click(button('Create API key'));
    await advance(4000);
    const id = newProject().id;
    expect(server.calls().slice(-3)).toEqual([
      'POST projects/' + id,
      'POST projects/' + id + '/keys',
      'POST keys/' + newProject().keys[0].id,
    ]);
    expect(newProject().websiteUrl).toBe('https://daftracker.org');
    expect(
      screen.getByRole('switch', { name: 'Only accept requests with Website key from daftracker.org' }).checked
    ).toBe(true);
  });

  it('names the website in the switch when the project has one', async () => {
    await atProjectStep();
    await fillProject();
    type(field(/^Website/), 'daftracker.org');
    await click(button('Continue'));
    expect(screen.getByRole('switch', { name: 'Limit this key to daftracker.org' })).toBeTruthy();
    expect(screen.getByText(/Leave it switched/).textContent).toContain('server or an AI tool');
  });

  it('goes back from the key step to edit the project, not to make another', async () => {
    await atProjectStep();
    await fillProject();
    await click(button('Continue'));
    await click(button('Back'));
    expect(heading('Step 2 of 3: Your project')).toBeTruthy();
    expect(field(/Project name/).value).toBe('Daf Tracker');
    type(field(/Project name/), 'Daf Tracker 2');
    await click(button('Save and continue'));
    expect(server.count('POST', 'projects')).toBe(1);
    expect(server.sent('POST', 'projects/' + newProject().id)[0].project.name).toBe('Daf Tracker 2');
    expect(heading('Step 3 of 3: Create an API key for Daf Tracker 2')).toBeTruthy();
  });

  it('can skip the key, landing on the projects page', async () => {
    await atProjectStep();
    await fillProject();
    await click(button('Continue'));
    await click(button('Skip for now'));
    expect(projectSection('Daf Tracker')).toBeTruthy();
    expect(server.calls().filter((c) => c.includes('keys'))).toEqual([]);
  });

  it("goes back to the key step when the key can't be made, saying so and keeping the name", async () => {
    await atProjectStep();
    await fillProject();
    await click(button('Continue'));
    server.fail('POST', /^projects\/[^/]+\/keys$/, 500);
    type(field(/API key name/), 'Website key');
    await click(button('Create API key'));
    expect(heading('Step 3 of 3: Create an API key for Daf Tracker')).toBeTruthy();
    expect(button('Create API key').disabled).toBe(false);
    expect(newProject().keys).toEqual([]);
    expect(screen.getByText("We couldn't create your key. Please try again.")).toBeTruthy();
    expect(field(/API key name/).value).toBe('Website key');
  });
});

describe('the email-confirmed page', () => {
  it('thanks the user, signals other tabs, and continues to developer settings', () => {
    renderElement(lib.React.createElement(lib.EmailConfirmedPage));
    expect(heading('Thank you for confirming your email')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Continue to Developer Settings' }).getAttribute('href')).toBe(
      '/settings/developer?continue'
    );
    expect(window.localStorage.getItem(lib.api.CONFIRMATION_SIGNAL_KEY)).toBeTruthy();
  });
});

describe('a confirmation link that cannot confirm', () => {
  const show = (status) => {
    server = fakeServer();
    return renderElement(lib.React.createElement(lib.EmailLinkPage, { link: { status, key: 'abc123' } }));
  };

  it('offers a new link when it has expired, then says to check the inbox', async () => {
    jest.useFakeTimers();
    show('expired');
    expect(heading('This link no longer works')).toBeTruthy();
    await click(button('Send a new link'));
    expect(server.sent('POST', 'confirmation/new-link')).toEqual([{ key: 'abc123' }]);
    expect(heading('Check your email')).toBeTruthy();
    expect(button('Resend in 60s').disabled).toBe(true);
  });

  it("shows the server's reason when a new link is refused", async () => {
    show('expired');
    server.fail('POST', 'confirmation/new-link', 400, "This link can't be renewed.");
    await click(button('Send a new link'));
    expect(screen.getByRole('alert').textContent).toBe("This link can't be renewed.");
  });

  it('sends a link for a former address to developer settings for a new one', () => {
    show('not-account-email');
    expect(heading('This link no longer works')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Send a new link' }).getAttribute('href')).toBe('/settings/developer');
  });

  it('says a used link is already confirmed', () => {
    show('already-confirmed');
    expect(heading('Already confirmed')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Continue to Developer Settings' })).toBeTruthy();
  });

  it('says a link for an address another account uses is no longer valid, with where to get help', () => {
    show('address-in-use');
    expect(heading('This link is no longer valid')).toBeTruthy();
    expect(screen.getByText(/This address can't be confirmed for this account/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'hello@sefaria.org' }).getAttribute('href')).toBe(
      'mailto:hello@sefaria.org'
    );
    expect(screen.getByRole('link', { name: 'Continue to Developer Settings' })).toBeTruthy();
    expect(queryButton('Send a new link')).toBeNull();
  });

  it('renders nothing for a status it does not know', () => {
    const { container } = show('something-else');
    expect(container.innerHTML).toBe('');
  });
});

describe('arriving from the Powered by link (?share)', () => {
  it('explains that setup comes first when there is no developer profile', async () => {
    lib = loadSettings({ search: '?share' });
    open(SSO_NEW);
    const dialog = screen.getByRole('dialog', { name: 'Looking to publish your project?' });
    await click(within(dialog).getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(heading('Get a free API key')).toBeTruthy();
  });

  it('opens the publish page with a project choice once set up', () => {
    lib = loadSettings({ search: '?share' });
    open({ ...READY, projects: [project(1)] });
    expect(heading('Publish your project')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Which project do you want to publish\?/ })).toBeTruthy();
  });
});

describe('Hebrew interface', () => {
  beforeEach(() => {
    lib.Sefaria.interfaceLang = 'hebrew';
  });

  it('shows the welcome screen in Hebrew', () => {
    open(SSO_NEW);
    expect(heading('קבלו מפתח API בחינם')).toBeTruthy();
    expect(button('בואו נתחיל')).toBeTruthy();
  });

  it('names the key buttons in Hebrew', () => {
    open({ ...READY, projects: [project(1, { keys: [key(1)] })] });
    expect(button('הצגת המפתח, Key 1')).toBeTruthy();
    expect(button('העתקת המפתח, Key 1')).toBeTruthy();
    expect(button('מחיקת המפתח, Key 1')).toBeTruthy();
  });

  it('shows a server error from the developer API in Hebrew', async () => {
    open({ ...READY, projects: [project(1, { keys: [key(1)] })] });
    server.fail('DELETE', 'keys/k1', 404, 'No such key.');
    await click(button('מחיקת המפתח, Key 1'));
    await click(button('מחיקה'));
    expect(screen.getByText('המפתח לא נמצא.')).toBeTruthy();
  });

  it('says the project limit in Hebrew', () => {
    open({ ...READY, projects: [project(1)], maxProjects: 1 });
    expect(screen.getByText(/הגעתם למספר המרבי של 1 פרויקטים/)).toBeTruthy();
  });
});

describe('server errors in Hebrew', () => {
  const fs = require('fs');
  const path = require('path');
  const serverSource = ['developer.py', 'developer_views.py']
    .map((file) => fs.readFileSync(path.join(__dirname, '../../../powered_by', file), 'utf8'))
    .join('\n');
  const fixedMessages = Array.from(
    serverSource.matchAll(/(?:InputError|PermissionError|LookupError)\("([^"{}]+)"\)|"error": "([^"{}]+)"/g),
    (match) => match[1] || match[2]
  );

  it('translates every fixed message the developer API sends', () => {
    lib.Sefaria.interfaceLang = 'hebrew';
    expect(fixedMessages.length).toBeGreaterThan(15);
    fixedMessages.forEach((message) =>
      expect([message, lib.api.serverErrorText(message)]).toEqual([message, expect.stringMatching(HEBREW)])
    );
  });

  it('translates messages that carry a number, an address or a field name', () => {
    lib.Sefaria.interfaceLang = 'hebrew';
    const { serverErrorText } = lib.api;
    expect(
      serverErrorText('An account can have at most 10 projects. To add more, contact developers@sefaria.org.')
    ).toBe('בחשבון אפשר ליצור עד 10 פרויקטים. כדי להוסיף עוד, כתבו אל developers@sefaria.org.');
    expect(serverErrorText('A project can have at most 5 keys.')).toBe('לפרויקט יכולים להיות עד 5 מפתחות.');
    expect(
      serverErrorText("You've asked for 5 links today. Try again tomorrow, or contact hello@sefaria.org.")
    ).toMatch(/^ביקשת היום 5 קישורים/);
    expect(serverErrorText('The project name can be at most 200 characters.')).toBe(
      'בשם הפרויקט אפשר להזין עד 200 תווים.'
    );
    expect(serverErrorText('The website must be text.')).toBe('יש להזין טקסט בכתובת האתר.');
  });

  it('leaves an unknown message, and every message on the English site, as it is', () => {
    const { serverErrorText } = lib.api;
    expect(serverErrorText('Give the project a name.')).toBe('Give the project a name.');
    lib.Sefaria.interfaceLang = 'hebrew';
    expect(serverErrorText('Something new went wrong.')).toBe('Something new went wrong.');
    expect(serverErrorText('The colour can be at most 3 characters.')).toBe('The colour can be at most 3 characters.');
    expect(serverErrorText('')).toBe('');
  });
});

describe('website addresses', () => {
  it('adds https:// to a bare domain and keeps a typed scheme', () => {
    const { parseWebsite } = lib.api;
    expect(parseWebsite('daftracker.org')).toEqual({ valid: true, url: 'https://daftracker.org' });
    expect(parseWebsite(' http://daftracker.org/app ')).toEqual({ valid: true, url: 'http://daftracker.org/app' });
    expect(parseWebsite('')).toEqual({ valid: true, url: '' });
  });

  it('rejects what is not a web address on a dotted host name', () => {
    const { parseWebsite } = lib.api;
    ['localhost', 'daf tracker.org', 'ftp://daftracker.org', 'https://-bad-.org', 'https://daftracker.c'].forEach(
      (input) => {
        expect([input, parseWebsite(input).valid]).toEqual([input, false]);
      }
    );
  });

  it("reads a website's host and the origin a browser sends from it", () => {
    const { websiteHost, websiteOrigin } = lib.api;
    expect(websiteHost('https://www.daftracker.org/app')).toBe('www.daftracker.org');
    expect(websiteHost('daftracker.org')).toBe('daftracker.org');
    expect(websiteHost('')).toBe('');
    expect(websiteOrigin('http://daftracker.org/app')).toBe('http://daftracker.org');
    expect(websiteOrigin('daftracker.org')).toBe('https://daftracker.org');
  });
});

describe('developer settings after Back', () => {
  it('shows the projects it last showed at once, then reloads them from the server', async () => {
    open({ ...READY, projects: [project(1)] });
    cleanup();
    server = fakeServer({ ...READY, projects: [project(2)] });
    renderSettings('developer', undefined, { accountSettings: undefined });
    // The state request is still in flight: the page shows what it remembered.
    expect(projectSection('Project 1')).toBeTruthy();
    await settle();
    expect(server.count('GET', 'state')).toBe(1);
    expect(projectSection('Project 1')).toBeUndefined();
    expect(projectSection('Project 2')).toBeTruthy();
  });

  it('has no Developer tab where developer settings are off', async () => {
    fakeServer();
    renderSettings('account', null);
    cleanup();
    server = fakeServer();
    renderSettings('account', undefined, { accountSettings: undefined });
    await settle();
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'))
    ).toEqual(['/settings/account']);
    expect(server.requests).toEqual([]);
  });
});
