/**
 * Developer Settings when the server refuses or the account changes: refused confirmation emails and saves, an
 * account email that changed after setup (the reconfirmation banner), and the poll that waits for the emailed link.
 */
import {
  EMAIL_NEW,
  READY,
  advance,
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
  queryButton,
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

const DAILY_LIMIT = "You've asked for 5 links today. Try again tomorrow, or contact hello@sefaria.org.";
const ONE_A_MINUTE = 'Wait a minute before asking for another email.';
const CONFIRM_TIP = 'Confirm your email in the banner above to create projects and keys.';
const now = () => new Date().toISOString();

let lib = null;
let server = null;

const open = (developer, extra) => {
  server = fakeServer(developer);
  return renderSettings('developer', developer, extra);
};

/* Set up earlier, but the account email changed since and isn't confirmed. */
const RECONFIRM = { ...READY, ssoConnected: false, emailVerified: false };

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

describe('refused confirmation emails during setup', () => {
  const atConfirmStep = async (developer = EMAIL_NEW) => {
    open(developer);
    await click(button('Get started'));
  };

  it('shows why sending was refused under the button, and stays on the step', async () => {
    await atConfirmStep();
    server.fail('POST', 'confirmation', 429, ONE_A_MINUTE);
    await click(button('Send confirmation link'));
    expect(screen.getByRole('alert').textContent).toBe(ONE_A_MINUTE);
    expect(heading('Step 1 of 4: Confirm your email')).toBeTruthy();
  });

  it('shows a generic message when the refusal has no reason', async () => {
    await atConfirmStep();
    server.fail('POST', 'confirmation', 500);
    await click(button('Send confirmation link'));
    expect(screen.getByRole('alert').textContent).toBe(
      "Something went wrong and your change wasn't saved. Please try again."
    );
  });

  it('treats the one-a-minute refusal as sent while a link is already out', async () => {
    await atConfirmStep({ ...EMAIL_NEW, confirmationSentAt: now() });
    server.fail('POST', 'confirmation', 429, ONE_A_MINUTE);
    await click(button('Resend link'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(button('Resend in 60s').disabled).toBe(true);
  });

  it('says so when the daily limit is reached, even with a link out', async () => {
    await atConfirmStep({ ...EMAIL_NEW, confirmationSentAt: now() });
    server.fail('POST', 'confirmation', 429, DAILY_LIMIT);
    await click(button('Resend link'));
    expect(screen.getByRole('alert').textContent).toBe(DAILY_LIMIT);
    expect(button('Resend link').disabled).toBe(false);
  });

  it('shows the refusal in Hebrew on the Hebrew site', async () => {
    lib.Sefaria.interfaceLang = 'hebrew';
    open(EMAIL_NEW);
    await click(button('בואו נתחיל'));
    server.fail('POST', 'confirmation', 429, DAILY_LIMIT);
    await click(button('שליחת קישור לאישור'));
    expect(screen.getByRole('alert').textContent).toMatch(/^ביקשת היום 5 קישורים/);
  });
});

describe('refused saves', () => {
  it('shows a refused profile edit on the form', async () => {
    open({ ...READY, projects: [] });
    server.fail('POST', 'profile', 400, 'The additional email is not a valid address.');
    await click(button('Edit profile'));
    await click(button('Save'));
    expect(screen.getByRole('alert').textContent).toContain('The additional email is not a valid address.');
    expect(heading('About you')).toBeTruthy();
  });

  it('shows the project limit when the server refuses a new project', async () => {
    open({ ...READY, projects: [project(1)] });
    server.fail(
      'POST',
      'projects',
      400,
      'An account can have at most 10 projects. To add more, contact developers@sefaria.org.'
    );
    await click(button('New project'));
    type(field(/Project name/), 'Daf Tracker');
    await choose('What are you building?', 'Research');
    type(field(/Short description/), 'Tracks the daf');
    await click(button('Continue'));
    expect(screen.getByRole('alert').textContent).toContain('An account can have at most 10 projects.');
    expect(heading('New project')).toBeTruthy();
  });

  it("returns to the key form with the server's reason when a key is refused", async () => {
    open({ ...READY, projects: [project(1)] });
    server.fail('POST', 'projects/p1/keys', 400, 'A project can have at most 5 keys.');
    await click(button('Add a key to Project 1'));
    type(field(/API key name/), 'One too many');
    await click(button('Create API key'));
    expect(heading('Create an API key for Project 1')).toBeTruthy();
    expect(server.state.projects[0].keys).toEqual([]);
    expect(screen.getByText('A project can have at most 5 keys.')).toBeTruthy();
    expect(field(/API key name/).value).toBe('One too many');
  });

  it('shows a refused website on the add-website window, which stays open', async () => {
    open({ ...READY, projects: [project(1)] });
    server.fail('POST', 'projects/p1', 400, 'The website is not a valid web address.');
    await click(button('Add website'));
    type(field('Your website'), 'daftracker.org');
    await click(button('Save website'));
    expect(screen.getByText('The website is not a valid web address.')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Add your website' })).toBeTruthy();
    expect(button('Save website').disabled).toBe(false);
  });

  it('does not limit the key when saving its website was refused', async () => {
    open({ ...READY, projects: [project(1, { keys: [key(1)] })] });
    server.fail('POST', 'projects/p1', 400, 'The website is not a valid web address.');
    await click(screen.getByRole('switch', { name: "Limit Key 1 to the project's website" }));
    type(field('Your website'), 'daftracker.org');
    await click(button('Limit key'));
    expect(server.calls()).toEqual(['POST projects/p1']);
    expect(screen.getByText('The website is not a valid web address.')).toBeTruthy();
  });
});

describe('after the account email changes', () => {
  it('asks to confirm the new address on the Developer tab without a reload', async () => {
    const setUp = { ...READY, ssoConnected: false, emailVerified: true, projects: [project(1)] };
    server = fakeServer(setUp);
    const page = renderSettings('account', setUp);
    const { container } = page;
    await click(container.querySelector('#change-email'));
    type(container.querySelector('#username-change-edit #email'), 'new@example.org');
    type(container.querySelector('#username-change-edit #confirmEmail'), 'new@example.org');
    type(container.querySelector('#username-change-edit #confirmPassword'), 'secret');
    await click(container.querySelector('#update-email'));
    const [, , callback] = lib.$.post.mock.calls[lib.$.post.mock.calls.length - 1];
    server.state.emailVerified = false;
    await lib.act(async () => {
      callback({ status: 'ok' });
    });
    await settle();
    page.update({ tab: 'developer' });
    await settle();
    const banner = screen.getByRole('region', { name: 'Confirm your new email address' });
    expect(within(banner).getByText('Confirm your email address')).toBeTruthy();
    expect(button('New project').getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps projects and keys on show, but offers no new ones until the address is confirmed', async () => {
    open({ ...RECONFIRM, projects: [project(1, { keys: [key(1)] })] });
    expect(screen.getByText('To create new projects and keys, first confirm your email.')).toBeTruthy();
    const newProject = button('New project');
    const addKey = button('Add a key to Project 1');
    [newProject, addKey].forEach((b) => {
      expect(b.getAttribute('aria-disabled')).toBe('true');
      expect(document.getElementById(b.getAttribute('aria-describedby')).textContent).toBe(CONFIRM_TIP);
    });
    await click(addKey);
    expect(heading('Projects and API keys')).toBeTruthy();
    // What already exists still works.
    await click(button('Show key, Key 1'));
    expect(screen.getByText(key(1).value)).toBeTruthy();
    expect(button('Edit details of Project 1')).toBeTruthy();
  });

  it('offers no first project on an empty account', () => {
    open({ ...RECONFIRM, projects: [] });
    const create = button('Create a project');
    expect(create.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(create.getAttribute('aria-describedby')).textContent).toBe(CONFIRM_TIP);
  });

  it('sends a link to the new address from the banner, with a resend countdown', async () => {
    jest.useFakeTimers();
    open({ ...RECONFIRM, projects: [project(1)] });
    await click(button('Send confirmation link'));
    expect(server.count('POST', 'confirmation')).toBe(1);
    const banner = screen.getByRole('region', { name: 'Confirm your new email address' });
    expect(within(banner).getByText('Check your email')).toBeTruthy();
    expect(within(banner).getByText(/We sent a confirmation link to/).textContent).toBe(
      'We sent a confirmation link to tova@example.org.'
    );
    expect(button('Resend in 60s').disabled).toBe(true);
    await advance(60000);
    await click(button('Resend link'));
    expect(server.count('POST', 'confirmation')).toBe(2);
  });

  it('says "Check your email" at once while a link sent earlier still works', () => {
    open({ ...RECONFIRM, confirmationSentAt: now(), projects: [] });
    expect(screen.getByText('Check your email')).toBeTruthy();
    expect(queryButton('Send confirmation link')).toBeNull();
  });

  it('asks again once the link sent has expired', () => {
    open({ ...RECONFIRM, confirmationSentAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString() });
    expect(button('Send confirmation link')).toBeTruthy();
  });

  it('shows a refused send in the banner', async () => {
    open({ ...RECONFIRM, projects: [] });
    server.fail('POST', 'confirmation', 429, DAILY_LIMIT);
    await click(button('Send confirmation link'));
    const banner = screen.getByRole('region', { name: 'Confirm your new email address' });
    expect(within(banner).getByRole('alert').textContent).toBe(DAILY_LIMIT);
    expect(button('Send confirmation link')).toBeTruthy();
  });

  it('treats the one-a-minute refusal as sent while a link is out', async () => {
    open({ ...RECONFIRM, confirmationSentAt: now(), projects: [] });
    server.fail('POST', 'confirmation', 429, ONE_A_MINUTE);
    await click(button('Resend link'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(button('Resend in 60s')).toBeTruthy();
  });

  it('offers new projects again once the new address is confirmed', async () => {
    jest.useFakeTimers();
    open({ ...RECONFIRM, confirmationSentAt: now(), projects: [project(1)] });
    server.state.emailVerified = true;
    server.state.confirmationSentAt = null;
    await advance(3000);
    await advance(1200);
    expect(screen.getByRole('status').textContent).toBe('Your email is confirmed.');
    expect(screen.queryByRole('region', { name: 'Confirm your new email address' })).toBeNull();
    expect(button('New project').getAttribute('aria-disabled')).toBeNull();
    await advance(8000);
    expect(screen.queryByText('Your email is confirmed.')).toBeNull();
  });
});

describe('the confirmation poll', () => {
  const setVisibility = (state) => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    Object.defineProperty(document, 'hidden', { value: state === 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => {
    setVisibility('visible');
  });
  const LINK_SENT = () => ({ ...EMAIL_NEW, confirmationSentAt: now() });

  it('checks every few seconds while a link is out', async () => {
    jest.useFakeTimers();
    open(LINK_SENT());
    await advance(3000);
    expect(server.count('GET', 'state')).toBe(1);
    await advance(3000);
    expect(server.count('GET', 'state')).toBe(2);
  });

  it('does not poll when no link has been sent', async () => {
    jest.useFakeTimers();
    open(EMAIL_NEW);
    await advance(60000);
    expect(server.count('GET', 'state')).toBe(0);
  });

  it('pauses while the tab is hidden, and checks at once when it is shown again', async () => {
    jest.useFakeTimers();
    open(LINK_SENT());
    await lib.act(async () => {
      setVisibility('hidden');
    });
    await advance(60000);
    expect(server.count('GET', 'state')).toBe(0);
    await lib.act(async () => {
      setVisibility('visible');
    });
    await settle();
    expect(server.count('GET', 'state')).toBe(1);
    await advance(3000);
    expect(server.count('GET', 'state')).toBe(2);
  });

  it('checks less often after the first minute', async () => {
    jest.useFakeTimers();
    let clock = Date.now();
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    open({ ...EMAIL_NEW, confirmationSentAt: new Date(clock).toISOString() });
    const wait = async (ms) => {
      clock += ms;
      await advance(ms);
    };
    for (let i = 0; i < 20; i++) {
      await wait(3000);
    }
    expect(server.count('GET', 'state')).toBe(20);
    for (let i = 0; i < 20; i++) {
      await wait(3000);
    }
    expect(server.count('GET', 'state')).toBeLessThan(25);
    spy.mockRestore();
  });

  it('stops after the session ends (401)', async () => {
    jest.useFakeTimers();
    open(LINK_SENT());
    server.fail('GET', 'state', 401, 'Log in to use developer settings.', { times: Infinity });
    await advance(60000);
    expect(server.count('GET', 'state')).toBe(1);
  });

  it('keeps checking after any other failure', async () => {
    jest.useFakeTimers();
    open(LINK_SENT());
    server.fail('GET', 'state', 500, undefined, { times: 1 });
    await advance(3000);
    await advance(3000);
    expect(server.count('GET', 'state')).toBe(2);
  });

  it('stops once the link has expired', async () => {
    jest.useFakeTimers();
    open({ ...EMAIL_NEW, confirmationSentAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString() });
    await advance(60000);
    expect(server.count('GET', 'state')).toBe(0);
  });
});
