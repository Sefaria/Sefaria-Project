/**
 * Developer Settings once set up: the profile card, projects with their keys, the website and "Limit to website",
 * the project and key limits, publishing a project, and the publish nudge.
 */
import {
  READY,
  button,
  choose,
  cleanup,
  click,
  fakeServer,
  field,
  heading,
  key,
  loadSettings,
  press,
  project,
  projectSection,
  queryButton,
  renderSettings,
  screen,
  advance,
  blur,
  type,
  within,
} from './developerSettingsTestUtils';

jest.mock('../sefaria/sefaria', () => require('./developerSettingsTestUtils').sefariaMock());
jest.mock('../sefaria/sefariaJquery', () => require('./developerSettingsTestUtils').jqueryMock());
jest.mock('../Misc', () => require('./developerSettingsTestUtils').miscMock());
// The profile card's ProfilePic pulls in the image cropper's CSS, which Jest can't parse.
jest.mock('../ProfilePic', () => ({ ProfilePic: () => null }));

let server = null;

/* The home page of an account that is set up, with the server holding the same state. */
const openHome = (developer = {}) => {
  const initial = { ...READY, projects: [], ...developer };
  server = fakeServer(initial);
  return renderSettings('developer', initial);
};

const SITE = 'https://daftracker.org';

beforeEach(() => {
  loadSettings();
  window.scrollTo = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn(() => Promise.resolve()) },
    configurable: true,
  });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('the home page', () => {
  it('shows the profile, with the account name and both email addresses', () => {
    openHome({ profile: { ...READY.profile, additionalEmail: 'tova@work.example' } });
    expect(heading('Developer Settings')).toBeTruthy();
    expect(screen.getByText('Tova Levi')).toBeTruthy();
    expect(screen.getByText('tova@example.org')).toBeTruthy();
    expect(screen.getByText('tova@work.example')).toBeTruthy();
    expect(button('Edit profile')).toBeTruthy();
  });

  it('edits the profile in the About you form and comes back with a message', async () => {
    openHome();
    await click(button('Edit profile'));
    expect(heading('About you')).toBeTruthy();
    // Editing has no terms line, since they were accepted at setup.
    expect(screen.queryByText(/By continuing, you accept/)).toBeNull();
    type(field(/Tell us about yourself/), 'I teach Talmud');
    await click(button('Save'));
    expect(server.sent('POST', 'profile')[0].profile).toEqual(
      expect.objectContaining({ developerName: 'Tova Levi', description: 'I teach Talmud', termsAccepted: true })
    );
    expect(screen.getByText('Your profile is saved.')).toBeTruthy();
    expect(heading('Projects and API keys')).toBeTruthy();
  });

  it('goes back from Edit profile without saving', async () => {
    openHome();
    await click(button('Edit profile'));
    await click(button('Cancel'));
    expect(heading('Projects and API keys')).toBeTruthy();
    expect(server.count('POST', 'profile')).toBe(0);
  });

  it('links to the API docs and the library download, and to publishing a project', () => {
    openHome({ projects: [project(1)] });
    expect(screen.getAllByRole('link', { name: /Technical documentation/ })[0].getAttribute('href')).toBe(
      'https://developers.sefaria.org/reference/getting-started'
    );
    expect(screen.getAllByRole('link', { name: /Download the library/ })[0].getAttribute('href')).toBe(
      'https://github.com/Sefaria/Sefaria-Export'
    );
    expect(screen.getAllByRole('button', { name: 'Publish a project' }).length).toBeGreaterThan(0);
  });

  it('shows no usage on a project', () => {
    openHome({ projects: [project(1, { keys: [key(1)], usage: { used: 10, limit: 1000 } })] });
    expect(screen.queryByText(/monthly limit/i)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});

describe('a new project', () => {
  it('starts from the empty table on an account with no projects', async () => {
    openHome();
    expect(heading('No projects or keys yet')).toBeTruthy();
    expect(queryButton('New project')).toBeNull();
    await click(button('Create a project'));
    expect(heading('New project')).toBeTruthy();
  });

  it('requires a name, what is being built and a description', async () => {
    openHome();
    await click(button('Create a project'));
    await click(button('Continue'));
    expect(field(/Project name/).getAttribute('aria-invalid')).toBe('true');
    expect(field(/Short description/).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('button', { name: /What are you building\?/ }).getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field(/Project name/));
    expect(server.count('POST', 'projects')).toBe(0);
  });

  it('limits the description to 150 characters, with a counter', async () => {
    openHome();
    await click(button('Create a project'));
    const description = field(/Short description/);
    expect(description.getAttribute('maxLength')).toBe('150');
    type(description, 'Twelve chars');
    expect(screen.getByText('12/150')).toBeTruthy();
  });

  it('cleans a website down to its domain, and rejects one that is not an address', async () => {
    openHome();
    await click(button('Create a project'));
    const site = field(/^Website/);
    type(site, 'https://www.Example.com/app?x=1');
    blur(site);
    expect(site.value).toBe('example.com');
    type(site, 'not a website');
    blur(site);
    expect(screen.getByText('Invalid website')).toBeTruthy();
  });

  it('creates the project, then offers its first key, which can be skipped', async () => {
    openHome({ projects: [project(1)] });
    await click(button('New project'));
    type(field(/Project name/), '  Daf Tracker ');
    await choose('What are you building?', 'A personal project');
    type(field(/Short description/), 'Tracks the daf');
    type(field(/^Website/), 'daftracker.org');
    await click(button('Continue'));
    expect(server.sent('POST', 'projects')).toEqual([
      {
        project: {
          name: 'Daf Tracker',
          purpose: 'personal',
          description: 'Tracks the daf',
          organization: '',
          websiteUrl: 'https://daftracker.org',
          aiAssisted: false,
          visibility: 'private',
        },
      },
    ]);
    expect(heading(/Create an API key for Daf Tracker/)).toBeTruthy();
    await click(button('Skip for now'));
    const section = projectSection('Daf Tracker');
    expect(section.className).toContain('is-new');
    expect(within(section).getByRole('link', { name: 'daftracker.org (opens in a new tab)' })).toBeTruthy();
  });

  it('cancels back to the projects without saving', async () => {
    openHome({ projects: [project(1)] });
    await click(button('New project'));
    await click(button('Cancel'));
    expect(heading('Projects and API keys')).toBeTruthy();
    expect(server.count('POST', 'projects')).toBe(0);
  });

  it("keeps the form open with the server's reason when saving fails", async () => {
    openHome({ projects: [project(1)] });
    server.fail('POST', 'projects', 400, 'Give the project a name.');
    await click(button('New project'));
    type(field(/Project name/), 'Daf Tracker');
    await choose('What are you building?', 'Research');
    type(field(/Short description/), 'Tracks the daf');
    await click(button('Continue'));
    expect(screen.getByRole('alert').textContent).toContain('Give the project a name.');
    expect(heading('New project')).toBeTruthy();
    expect(button('Continue').disabled).toBe(false);
  });

  it('is unavailable at the project limit the server sends, saying why', async () => {
    const projects = [project(1), project(2), project(3)];
    openHome({ projects, maxProjects: 3 });
    const newProject = button('New project');
    expect(newProject.getAttribute('aria-disabled')).toBe('true');
    const tip = document.getElementById(newProject.getAttribute('aria-describedby'));
    expect(tip.textContent).toBe(
      'You have reached the maximum of 3 projects. To add another project, delete one no longer in use.'
    );
    await click(newProject);
    expect(heading('Projects and API keys')).toBeTruthy();
  });

  it('allows 10 projects when the server sends no limit', () => {
    const projects = Array.from({ length: 10 }, (_, i) => project(i + 1));
    openHome({ projects, maxProjects: undefined });
    expect(button('New project').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(/maximum of 10 projects/)).toBeTruthy();
  });
});

describe('keys', () => {
  it('lists each key with its name, a masked value and when it was created', () => {
    openHome({ projects: [project(1, { keys: [key(1)] })] });
    const row = screen.getByRole('row', { name: /Key 1/ });
    expect(within(row).getByText('sfr_••••xyz9')).toBeTruthy();
    expect(within(row).getByText('5 Nov 2026')).toBeTruthy();
    expect(screen.queryByText(key(1).value)).toBeNull();
  });

  it('shows and hides a key, naming it in the button', async () => {
    openHome({ projects: [project(1, { keys: [key(1), key(2)] })] });
    await click(button('Show key, Key 1'));
    expect(screen.getByText(key(1).value)).toBeTruthy();
    expect(screen.queryByText(key(2).value)).toBeNull();
    await click(button('Hide key, Key 1'));
    expect(screen.queryByText(key(1).value)).toBeNull();
    expect(button('Show key, Key 1')).toBeTruthy();
  });

  it('copies a key and says so', async () => {
    openHome({ projects: [project(1, { keys: [key(1)] })] });
    await click(button('Copy key, Key 1'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(key(1).value);
    expect(screen.getByText('Copied')).toBeTruthy();
  });

  it('deletes a key after asking, and says anything using it stops working', async () => {
    openHome({ projects: [project(1, { keys: [key(1), key(2)] })] });
    const opener = button('Delete key, Key 1');
    await click(opener);
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Key 1?' });
    expect(within(dialog).getByText(/Anything using this key stops working right away/)).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    await click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(server.calls()).toContain('DELETE keys/k1');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Key 1 is deleted. Anything using it stops working.')).toBeTruthy();
    expect(queryButton('Delete key, Key 1')).toBeNull();
    expect(button('Delete key, Key 2')).toBeTruthy();
  });

  it('keeps a key when deleting is cancelled, and returns focus to its button', async () => {
    openHome({ projects: [project(1, { keys: [key(1)] })] });
    const opener = button('Delete key, Key 1');
    opener.focus();
    await click(opener);
    await click(button('Cancel'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(server.count('DELETE', 'keys/k1')).toBe(0);
  });

  it('shows why a key could not be deleted, and the message can be dismissed', async () => {
    openHome({ projects: [project(1, { keys: [key(1)] })] });
    server.fail('DELETE', 'keys/k1', 404, 'No such key.');
    await click(button('Delete key, Key 1'));
    await click(button('Delete'));
    expect(screen.getByText('No such key.')).toBeTruthy();
    await click(within(screen.getByText('No such key.').closest('[role="alert"]')).getByRole('button'));
    expect(screen.queryByText('No such key.')).toBeNull();
  });

  it('adds a key to a project, with a short wait before it shows', async () => {
    jest.useFakeTimers();
    openHome({ projects: [project(1, { keys: [key(1)] })] });
    await click(button('Add a key to Project 1'));
    expect(heading(/Create an API key for Project 1/)).toBeTruthy();
    await click(button('Create API key'));
    expect(field(/API key name/).getAttribute('aria-invalid')).toBe('true');
    expect(server.count('POST', 'projects/p1/keys')).toBe(0);
    type(field(/API key name/), ' Server key ');
    await click(button('Create API key'));
    expect(server.sent('POST', 'projects/p1/keys')).toEqual([{ label: 'Server key' }]);
    expect(screen.getByText('Creating your key…')).toBeTruthy();
    await advance(4000);
    const row = screen.getByRole('row', { name: /Server key/ });
    expect(row.className).toContain('is-new');
    // Left off unless asked for: a key used from a server must not be limited to a website.
    expect(server.count('POST', /^keys\//)).toBe(0);
  });

  it('limits the key name to 100 characters', async () => {
    openHome({ projects: [project(1)] });
    await click(button('Add a key to Project 1'));
    expect(field(/API key name/).getAttribute('maxLength')).toBe('100');
  });

  it('goes back to the projects from the new key form', async () => {
    openHome({ projects: [project(1)] });
    await click(button('Add a key to Project 1'));
    await click(button('Projects and API keys'));
    expect(heading('Projects and API keys')).toBeTruthy();
  });

  it('is unavailable at the key limit, saying why', async () => {
    const keys = [1, 2, 3, 4, 5].map((n) => key(n));
    openHome({ projects: [project(1, { keys })] });
    const add = button('Add a key to Project 1');
    expect(add.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(add.getAttribute('aria-describedby')).textContent).toBe(
      'You have reached the maximum of 5 keys for this project. To add another key, delete one no longer in use.'
    );
    await click(add);
    expect(heading('Projects and API keys')).toBeTruthy();
  });

  it('follows the key limit the server sends', () => {
    openHome({ projects: [project(1, { keys: [key(1), key(2)] })], maxKeysPerProject: 2 });
    expect(button('Add a key to Project 1').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(/maximum of 2 keys/)).toBeTruthy();
  });
});

describe('Limit to website', () => {
  it('explains the switch in the column header', async () => {
    openHome({ projects: [project(1, { websiteUrl: SITE, keys: [key(1)] })] });
    const help = button('About Limit to website');
    await click(help);
    expect(screen.getByRole('tooltip').textContent).toContain("Limit a key to your project's website");
  });

  it("limits a key to the project's website, and lifts the limit", async () => {
    openHome({ projects: [project(1, { websiteUrl: SITE, keys: [key(1)] })] });
    const toggle = screen.getByRole('switch', { name: 'Only accept requests with Key 1 from daftracker.org' });
    expect(toggle.checked).toBe(false);
    await click(toggle);
    expect(server.sent('POST', 'keys/k1')).toEqual([{ restrictToWebsite: true }]);
    expect(toggle.checked).toBe(true);
    await click(toggle);
    expect(server.sent('POST', 'keys/k1')[1]).toEqual({ restrictToWebsite: false });
    expect(toggle.checked).toBe(false);
  });

  it('asks for the website first when the project has none, then limits the key', async () => {
    openHome({ projects: [project(1, { keys: [key(1)] })] });
    await click(screen.getByRole('switch', { name: "Limit Key 1 to the project's website" }));
    const dialog = screen.getByRole('dialog', { name: 'Limit this key to your website' });
    const site = within(dialog).getByLabelText('Your website');
    expect(document.activeElement).toBe(site);
    const limit = within(dialog).getByRole('button', { name: 'Limit key' });
    expect(limit.disabled).toBe(true);
    type(site, 'www.daftracker.org');
    await click(limit);
    expect(server.calls()).toEqual(['POST projects/p1', 'POST keys/k1']);
    expect(server.sent('POST', 'projects/p1')[0].project).toEqual(
      expect.objectContaining({ name: 'Project 1', websiteUrl: 'https://www.daftracker.org', visibility: 'private' })
    );
    expect(server.sent('POST', 'keys/k1')).toEqual([{ restrictToWebsite: true }]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('switch', { name: /Only accept requests with Key 1 from/ }).checked).toBe(true);
  });

  it('refuses a website that is not an address, and sends nothing', async () => {
    openHome({ projects: [project(1, { keys: [key(1)] })] });
    await click(screen.getByRole('switch', { name: "Limit Key 1 to the project's website" }));
    type(field('Your website'), 'localhost');
    await click(button('Limit key'));
    expect(screen.getByText('Invalid website')).toBeTruthy();
    expect(server.requests).toEqual([]);
  });

  it('closes on Cancel or Escape without saving', async () => {
    openHome({ projects: [project(1, { keys: [key(1)] })] });
    const toggle = screen.getByRole('switch', { name: "Limit Key 1 to the project's website" });
    await click(toggle);
    await click(button('Cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await click(toggle);
    press(document.activeElement, 'Escape');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(server.requests).toEqual([]);
    expect(toggle.checked).toBe(false);
  });

  it('keeps Tab inside the window', async () => {
    openHome({ projects: [project(1, { keys: [key(1)] })] });
    await click(screen.getByRole('switch', { name: "Limit Key 1 to the project's website" }));
    const cancel = button('Cancel');
    cancel.focus();
    press(cancel, 'Tab');
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(cancel);
  });

  it("shows the server's reason when the limit is refused", async () => {
    openHome({ projects: [project(1, { websiteUrl: SITE, keys: [key(1)] })] });
    server.fail('POST', 'keys/k1', 400, "Add the project's website before restricting a key to it.");
    await click(screen.getByRole('switch', { name: /Only accept requests with Key 1/ }));
    expect(screen.getByText("Add the project's website before restricting a key to it.")).toBeTruthy();
  });
});

describe('the project website', () => {
  it('links to the website, or offers to add one', () => {
    openHome({ projects: [project(1, { websiteUrl: SITE }), project(2)] });
    const link = within(projectSection('Project 1')).getByRole('link', { name: 'daftracker.org (opens in a new tab)' });
    expect(link.getAttribute('href')).toBe(SITE);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(within(projectSection('Project 2')).getByRole('button', { name: 'Add website' })).toBeTruthy();
    expect(within(projectSection('Project 1')).queryByRole('button', { name: 'Add website' })).toBeNull();
  });

  it('adds a website from the project row', async () => {
    openHome({ projects: [project(1)] });
    await click(button('Add website'));
    const dialog = screen.getByRole('dialog', { name: 'Add your website' });
    type(within(dialog).getByLabelText('Your website'), 'daftracker.org');
    await click(within(dialog).getByRole('button', { name: 'Save website' }));
    expect(server.calls()).toEqual(['POST projects/p1']);
    expect(server.sent('POST', 'projects/p1')[0].project.websiteUrl).toBe(SITE);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('link', { name: 'daftracker.org (opens in a new tab)' })).toBeTruthy();
  });
});

describe('editing a project', () => {
  const openEdit = async (extra = {}) => {
    openHome({ projects: [project(1, { websiteUrl: 'https://www.daftracker.org', ...extra })] });
    await click(button('Edit details of Project 1'));
  };

  it('opens the form filled in, with the website as its domain', async () => {
    await openEdit({ organization: 'Daf Org' });
    expect(heading('Edit Project 1')).toBeTruthy();
    expect(field(/Project name/).value).toBe('Project 1');
    expect(field(/Organization/).value).toBe('Daf Org');
    expect(field(/Short description/).value).toBe('What project 1 does');
    expect(field(/^Website/).value).toBe('daftracker.org');
  });

  it('saves the project and says so', async () => {
    await openEdit();
    type(field(/Project name/), 'Daf Tracker');
    await click(button('Save project'));
    expect(server.sent('POST', 'projects/p1')).toEqual([
      {
        project: {
          name: 'Daf Tracker',
          purpose: '',
          description: 'What project 1 does',
          organization: '',
          websiteUrl: 'https://daftracker.org',
          aiAssisted: false,
          visibility: 'private',
        },
      },
    ]);
    expect(screen.getByText('Daf Tracker is saved.')).toBeTruthy();
    expect(projectSection('Daf Tracker')).toBeTruthy();
  });

  it('keeps a published project published', async () => {
    await openEdit({ visibility: 'public', aiAssisted: true });
    await click(button('Save project'));
    expect(server.sent('POST', 'projects/p1')[0].project).toEqual(
      expect.objectContaining({ visibility: 'public', aiAssisted: true })
    );
  });

  it("keeps the form open with the server's reason when saving fails", async () => {
    await openEdit();
    server.fail('POST', 'projects/p1', 400, 'The website is not a valid web address.');
    await click(button('Save project'));
    expect(screen.getByRole('alert').textContent).toContain('The website is not a valid web address.');
    expect(heading('Edit Project 1')).toBeTruthy();
  });

  it('removes the website straight away when no key is limited to it', async () => {
    await openEdit({ keys: [key(1)] });
    type(field(/^Website/), '');
    await click(button('Save project'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(server.sent('POST', 'projects/p1')[0].project.websiteUrl).toBe('');
    expect(within(projectSection('Project 1')).getByRole('button', { name: 'Add website' })).toBeTruthy();
  });

  it('warns before removing a website that keys are limited to, naming only those keys', async () => {
    await openEdit({ keys: [key(1, { restrictToWebsite: true }), key(2), key(3, { restrictToWebsite: true })] });
    type(field(/^Website/), '');
    await click(button('Save project'));
    const dialog = screen.getByRole('alertdialog', { name: 'Remove the website?' });
    expect(within(dialog).getByText('www.daftracker.org')).toBeTruthy();
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['Key 1', 'Key 3']);
    expect(within(dialog).getByText(/allow these keys to be used on any site/)).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Keep the website' }));
    expect(server.count('POST', 'projects/p1')).toBe(0);
  });

  it("removes the website and turns its keys' limit off", async () => {
    await openEdit({ keys: [key(1, { restrictToWebsite: true })] });
    type(field(/^Website/), '');
    await click(button('Save project'));
    await click(button('Remove the website'));
    expect(server.sent('POST', 'projects/p1')[0].project.websiteUrl).toBe('');
    expect(screen.getByText('Project 1 is saved.')).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: "Limit Key 1 to the project's website" });
    expect(toggle.checked).toBe(false);
  });

  it("keeps the website but saves the form's other changes", async () => {
    await openEdit({ keys: [key(1, { restrictToWebsite: true })] });
    type(field(/Short description/), 'A new description');
    type(field(/^Website/), '');
    await click(button('Save project'));
    await click(button('Keep the website'));
    expect(server.sent('POST', 'projects/p1')[0].project).toEqual(
      expect.objectContaining({ description: 'A new description', websiteUrl: 'https://www.daftracker.org' })
    );
    expect(screen.getByRole('switch', { name: /Only accept requests with Key 1/ }).checked).toBe(true);
  });
});

describe('deleting a project', () => {
  it('names the keys that will stop working, then deletes', async () => {
    openHome({ projects: [project(1, { keys: [key(1), key(2)] }), project(2)] });
    await click(button('Edit details of Project 1'));
    await click(button('Delete this project'));
    const dialog = screen.getByRole('alertdialog', { name: /^Delete the project Project 1 ?\?$/ });
    expect(within(dialog).getByText('The following keys will stop working immediately:')).toBeTruthy();
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['Key 1', 'Key 2']);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    await click(within(dialog).getByRole('button', { name: 'Delete project' }));
    expect(server.calls()).toEqual(['DELETE projects/p1']);
    expect(screen.getByText('Project 1 and its keys are deleted.')).toBeTruthy();
    expect(projectSection('Project 1')).toBeUndefined();
    expect(projectSection('Project 2')).toBeTruthy();
  });

  it('uses the singular for one key', async () => {
    openHome({ projects: [project(1, { keys: [key(1)] })] });
    await click(button('Edit details of Project 1'));
    await click(button('Delete this project'));
    expect(screen.getByText('The following key will stop working immediately:')).toBeTruthy();
  });

  it("says only that it can't be undone for a project with no keys", async () => {
    openHome({ projects: [project(1)] });
    await click(button('Edit details of Project 1'));
    await click(button('Delete this project'));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText("You can't undo this action.")).toBeTruthy();
    expect(within(dialog).queryByRole('listitem')).toBeNull();
  });

  it('keeps the project when cancelled, or with Escape', async () => {
    openHome({ projects: [project(1)] });
    await click(button('Edit details of Project 1'));
    await click(button('Delete this project'));
    await click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await click(button('Delete this project'));
    press(document.activeElement, 'Escape');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(server.requests).toEqual([]);
  });

  it("shows the server's reason when deleting fails", async () => {
    openHome({ projects: [project(1)] });
    server.fail('DELETE', 'projects/p1', 404, 'No such project.');
    await click(button('Edit details of Project 1'));
    await click(button('Delete this project'));
    await click(button('Delete project'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('No such project.');
    expect(heading('Edit Project 1')).toBeTruthy();
  });
});

describe('publishing a project', () => {
  const openPublish = async (extra = {}) => {
    openHome({
      projects: [project(1, { websiteUrl: SITE, keys: [key(1)], ...extra })],
      profile: { ...READY.profile, description: 'I teach Talmud' },
    });
    await click(button('Publish project'));
  };

  it('opens the publish form with the profile and project as summaries to check', async () => {
    await openPublish();
    expect(heading('Publish your project')).toBeTruthy();
    expect(screen.getByText('Very technical')).toBeTruthy();
    expect(screen.getByText('I teach Talmud')).toBeTruthy();
    expect(screen.getByText('What project 1 does')).toBeTruthy();
    expect(button('Edit details about you')).toBeTruthy();
    expect(button('Edit project details')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Which project do you want to publish\?/ }).textContent).toContain(
      'Project 1'
    );
  });

  it('asks for a category before submitting', async () => {
    await openPublish();
    await click(button('Submit for review'));
    expect(screen.getByText('Choose at least one category.')).toBeTruthy();
    expect(document.activeElement).toBe(field('Learning & Study Tools'));
    expect(server.requests).toEqual([]);
  });

  it('opens the project details and asks for the website when the project has none', async () => {
    await openPublish({ websiteUrl: '' });
    const site = field(/^Website/);
    expect(site.required).toBe(true);
    await click(field('Learning & Study Tools'));
    await click(button('Submit for review'));
    expect(site.getAttribute('aria-invalid')).toBe('true');
    expect(server.requests).toEqual([]);
  });

  it('submits the project for review, then shows it as submitted', async () => {
    await openPublish();
    await click(field('Learning & Study Tools'));
    await click(field(/I would like to receive Sefaria's developer newsletter/));
    await click(button('Submit for review'));
    expect(server.calls()).toEqual(['POST profile', 'POST projects/p1']);
    expect(server.sent('POST', 'profile')[0].profile).toEqual(
      expect.objectContaining({ developerNews: true, description: 'I teach Talmud', termsAccepted: true })
    );
    expect(server.sent('POST', 'projects/p1')[0].project).toEqual(
      expect.objectContaining({ name: 'Project 1', websiteUrl: SITE, visibility: 'public' })
    );
    expect(heading('Your project was submitted for review')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Powered by Sefaria site' })).toBeTruthy();
    await click(button('Back to Developer Settings'));
    const section = projectSection('Project 1');
    expect(within(section).getByText('Submitted for review')).toBeTruthy();
    expect(within(section).queryByRole('button', { name: 'Publish project' })).toBeNull();
  });

  it("keeps the form with the server's reason when submitting fails", async () => {
    await openPublish();
    server.fail('POST', 'projects/p1', 400, 'The website is not a valid web address.');
    await click(field('Learning & Study Tools'));
    await click(button('Submit for review'));
    expect(screen.getAllByRole('alert')[0].textContent).toContain('The website is not a valid web address.');
    expect(heading('Publish your project')).toBeTruthy();
    expect(button('Submit for review').disabled).toBe(false);
  });

  it('cancels back to the projects', async () => {
    await openPublish();
    await click(button('Cancel'));
    expect(heading('Projects and API keys')).toBeTruthy();
    expect(server.requests).toEqual([]);
  });

  it('starts with a choice of project from "Publish a project"', async () => {
    openHome({ projects: [project(1, { websiteUrl: SITE }), project(2)] });
    await click(screen.getAllByRole('button', { name: 'Publish a project' })[0]);
    expect(heading('Publish your project')).toBeTruthy();
    expect(queryButton('Submit for review')).toBeNull();
    await click(screen.getByRole('button', { name: /Which project do you want to publish\?/ }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Project 1',
      'Project 2',
      '+ Create a new project',
    ]);
    await click(screen.getByRole('option', { name: 'Project 1' }));
    expect(button('Submit for review')).toBeTruthy();
  });

  it('offers no new project in the choice at the project limit', async () => {
    openHome({ projects: [project(1)], maxProjects: 1 });
    await click(screen.getAllByRole('button', { name: 'Publish a project' })[0]);
    await click(screen.getByRole('button', { name: /Which project do you want to publish\?/ }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Project 1']);
  });

  it('creates a new project from the choice and comes back to publish it', async () => {
    openHome({ projects: [] });
    await click(screen.getAllByRole('button', { name: 'Publish a project' })[0]);
    expect(screen.getByText(/To share a project with Sefaria, first create it/)).toBeTruthy();
    await choose('Which project do you want to publish?', '+ Create a new project');
    expect(heading('New project')).toBeTruthy();
    type(field(/Project name/), 'Daf Tracker');
    await choose('What are you building?', 'Research');
    type(field(/Short description/), 'Tracks the daf');
    await click(button('Continue'));
    await click(button('Skip for now'));
    expect(heading('Publish your project')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Which project do you want to publish\?/ }).textContent).toContain(
      'Daf Tracker'
    );
  });
});

describe('the publish nudge', () => {
  const used = (pct) => ({ used: pct * 10, limit: 1000 });

  it('suggests publishing a private project once it has real use', async () => {
    openHome({ projects: [project(1, { keys: [key(1)], usage: used(30) })] });
    const nudge = screen.getByRole('region', { name: 'Publish Project 1' });
    expect(within(nudge).getByText(/People are using/).textContent).toBe('People are using Project 1');
    await click(within(nudge).getByRole('button', { name: 'Publish Project 1' }));
    expect(heading('Publish your project')).toBeTruthy();
  });

  it('suggests only the most used project', () => {
    openHome({
      projects: [project(1, { keys: [key(1)], usage: used(30) }), project(2, { keys: [key(2)], usage: used(80) })],
    });
    expect(screen.getAllByText(/People are using/).map((p) => p.textContent)).toEqual(['People are using Project 2']);
  });

  it.each([
    ['without usage from the server', {}],
    ['under 25% of the limit', { usage: used(24) }],
    ['already public', { usage: used(90), visibility: 'public' }],
    ['with no keys', { usage: used(90), keys: [] }],
  ])('stays away for a project %s', (_, extra) => {
    openHome({ projects: [project(1, { keys: [key(1)], ...extra })] });
    expect(screen.queryByText(/People are using/)).toBeNull();
  });

  it('stays away once dismissed, this visit and the next', async () => {
    openHome({ projects: [project(1, { keys: [key(1)], usage: used(50) })] });
    await click(
      within(screen.getByRole('region', { name: 'Publish Project 1' })).getByRole('button', { name: 'Dismiss' })
    );
    expect(screen.queryByText(/People are using/)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('devEPublishNudgeDismissed'))).toEqual(['p1']);
    cleanup();
    openHome({ projects: [project(1, { keys: [key(1)], usage: used(50) })] });
    expect(screen.queryByText(/People are using/)).toBeNull();
  });
});
