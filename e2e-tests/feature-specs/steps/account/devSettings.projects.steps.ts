// Projects (DS-PROJ-*) and Back / the Developer tab (DS-NAV-2, DS-NAV-3, DS-NAV-4).
//
// Sentences here are matched exactly (escaped regexes), so they can't catch another area's
// sentence that only looks similar ("a window asks ..." about a key, "Add key" is unavailable...).
import { Page } from '@playwright/test';
import { Before, Given, When, Then, expect, Visitor } from '../fixtures';
import { DeveloperApi, DevProject } from './developerApi';
import { addKey, addProject, asDeveloper, dev, notes, projectId, reloadHome } from './devSettings.common.steps';
import { DeveloperSettingsProjectsPage, PURPOSES, purposeKey } from '../../../pages/developerSettingsProjectsPage';
import { t } from '../../../globals';

/** The exact sentence as an anchored regex. */
const exact = (sentence: string) => new RegExp('^' + sentence.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '$');

type ProjDev = { page: Page; ds: DeveloperSettingsProjectsPage; api: DeveloperApi };

async function proj(visitor: Visitor): Promise<ProjDev> {
  const { page, api } = await dev(visitor);
  return { page, api, ds: new DeveloperSettingsProjectsPage(page, visitor.lang) };
}

/** Scenarios with no Given start from the developer account with no projects, on the home page. */
async function ensureDeveloper(visitor: Visitor): Promise<ProjDev> {
  if (visitor.who !== 'developer') {
    await asDeveloper(visitor);
    await reloadHome(visitor);
  }
  return proj(visitor);
}

const current = (visitor: Visitor): string => {
  const name = notes(visitor).currentProject;
  if (!name) throw new Error('No project was set up in this scenario');
  return name;
};

async function savedProject(visitor: Visitor, name = current(visitor)): Promise<DevProject | undefined> {
  const { api } = await proj(visitor);
  const id = notes(visitor).projectIds?.[name];
  return (await api.state()).projects.find((p) => (id ? String(p.id) === String(id) : p.name === name));
}

const host = (url?: string) => (url ?? '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');

/** Opens the edit form of the scenario's project unless a project form is already open. */
async function ensureEditForm(visitor: Visitor): Promise<ProjDev> {
  const p = await proj(visitor);
  if (!(await p.ds.siteField().isVisible())) await p.ds.openEditDetails(current(visitor));
  return p;
}

// DS-PROJ-5 opens with the shared "Given Verse a Day's website is example.com", which expects the
// project to exist already, and the Projects rule has no Background. Set the project up first.
// TODO: a fallback in that shared step (set up the project when none is) would replace this hook.
Before(async ({ $testInfo, visitor }) => {
  if (!/^DS-PROJ-5 /.test($testInfo.title)) return;
  await asDeveloper(visitor);
  await addProject(visitor, 'Verse a Day');
});

// --- DS-PROJ-1, DS-PROJ-2: a new project ---------------------------------------------------

Then(
  exact('there is a "Create a project" button [developer.home.empty.create_project.button]'),
  async ({ visitor }) => {
    const { ds } = await proj(visitor);
    await expect(await ds.createProjectButton()).toBeVisible({ timeout: t(15000) });
  }
);

Then(exact('the project form opens with no step counter and a back link to the projects'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  await ds.expectStepTitle(await ds.str('developer.home.new_project.button'));
  await expect(ds.nameField()).toBeVisible();
  await expect(ds.stepCounter()).toHaveCount(0);
  await expect(await ds.backToProjectsLink()).toBeVisible();
});

When(exact('the developer fills in the required fields and saves'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  const name = 'Verse a Day';
  await ds.nameField().fill(name);
  await ds.choosePurpose('Personal');
  await ds.descriptionField().fill('Sends one verse a day');
  await ds.button(await ds.str('developer.common.continue.button')).click();
  notes(visitor).currentProject = name;
});

Then(exact('the key step for the new project opens'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  const name = current(visitor);
  await ds.expectStepTitle(await ds.str('developer.key_form.intro', { project_name: name }));
  await expect(ds.keyNameField()).toBeVisible();
  expect((await savedProject(visitor, name))?.name, 'the new project is saved').toBe(name);
});

// --- DS-PROJ-3: edit a project -------------------------------------------------------------

Then(
  exact(
    'the page reads "Edit Verse a Day" [developer.edit_project.intro], with every field filled in, including the saved answer to "What are you building?"'
  ),
  async ({ visitor }) => {
    const { ds } = await proj(visitor);
    const saved = await savedProject(visitor);
    if (!saved) throw new Error('The project is missing from the state');
    await ds.expectStepTitle(await ds.str('developer.edit_project.intro', { project_name: saved.name }));
    await expect(ds.nameField()).toHaveValue(saved.name);
    await expect(ds.orgField()).toHaveValue(String(saved.organization ?? ''));
    await expect(ds.orgField()).not.toHaveValue('');
    await expect(ds.descriptionField()).toHaveValue(String(saved.description ?? ''));
    await expect(ds.siteField()).toHaveValue(host(saved.websiteUrl));
    await expect(ds.siteField()).not.toHaveValue('');
    expect(saved.purpose, 'the project has a saved answer').toBeTruthy();
    await expect(ds.purposeControl()).toHaveText(await ds.str(purposeKey(String(saved.purpose))));
  }
);

When(
  exact('the developer changes the description and clicks "Save project" [developer.edit_project.save.button]'),
  async ({ visitor }) => {
    const { ds } = await proj(visitor);
    const description = `A new description ${Date.now()}`;
    notes(visitor).newDescription = description;
    await ds.descriptionField().fill(description);
    await ds.saveProject();
  }
);

Then(exact('the home page shows the new description'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  await ds.expectHome();
  await expect(ds.projectBlock(current(visitor))).toContainText(String(notes(visitor).newDescription));
});

// --- DS-PROJ-4: the website field ----------------------------------------------------------

/** The project form's website field, opening a new-project form when no form is open. */
async function siteForm(visitor: Visitor): Promise<ProjDev> {
  const p = await ensureDeveloper(visitor);
  if (!(await p.ds.siteField().isVisible())) await p.ds.openNewProjectForm();
  return p;
}

When(/^the developer types "([^"]*)" in Website and leaves the field$/, async ({ visitor }, value: string) => {
  const { ds } = await siteForm(visitor);
  await ds.typeInSite(value);
});

When(/^the developer types "([^"]*)" and leaves the field$/, async ({ visitor }, value: string) => {
  const { ds } = await siteForm(visitor);
  await ds.typeInSite(value);
});

Then(/^the field reads "([^"]*)"$/, async ({ visitor }, value: string) => {
  const { ds } = await proj(visitor);
  await expect(ds.siteField()).toHaveValue(value);
});

Then(exact('the field shows an invalid-website error'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  await expect(ds.fieldError('devEProjSite')).toHaveText(await ds.str('developer.common.invalid_website.error'));
  await expect(ds.siteField()).toHaveAttribute('aria-invalid', 'true');
});

// --- DS-PROJ-5: the website on the home page -----------------------------------------------

Then(exact('the project shows "example.com" as a link that opens the site in a new tab'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  const link = ds.websiteLink(current(visitor), 'example.com');
  await expect(link).toHaveCount(1);
  await expect(link).toBeVisible();
  await expect(link).toHaveText('example.com');
  await expect(link).toHaveAttribute('href', /^https?:\/\/(www\.)?example\.com\/?$/);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAccessibleName(
    await ds.str('developer.home.project.website_link.aria', { host: 'example.com' })
  );
});

Given(exact('a project with no website'), async ({ visitor }) => {
  await ensureDeveloper(visitor);
  await addProject(visitor, 'Torah Notes', { websiteUrl: '' });
  await reloadHome(visitor);
});

Then(exact('it shows "Add website" [developer.home.project_menu.add_website.button] instead'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  const block = ds.projectBlock(current(visitor));
  const name = await ds.str('developer.home.project_menu.add_website.button');
  await expect(block.getByRole('button', { name, exact: true })).toBeVisible({ timeout: t(15000) });
  await expect(block.getByRole('link', { name: /new tab/ }).filter({ visible: true })).toHaveCount(0);
});

Then(exact('the project form opens with the website field focused'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  await ds.expectStepTitle(await ds.str('developer.edit_project.intro', { project_name: current(visitor) }));
  await expect(ds.siteField()).toBeFocused();
});

// --- DS-PROJ-6: delete a project -----------------------------------------------------------

Given(/^a project "([^"]*)" with (one key|two keys|no keys)$/, async ({ visitor }, name: string, keys: string) => {
  await asDeveloper(visitor);
  await addProject(visitor, name);
  const labels = { 'one key': ['Daily email'], 'two keys': ['Daily email', 'Weekly digest'], 'no keys': [] }[keys]!;
  const ids: string[] = [];
  for (const label of labels) ids.push(String((await addKey(visitor, name, label)).id));
  Object.assign(notes(visitor), { keyLabels: labels, keyIds: ids });
  await reloadHome(visitor);
  // "Delete this project" is on the project's edit form.
  const { ds } = await proj(visitor);
  await ds.openEditDetails(name);
});

Then(
  /^a window asks "(Delete the project [^"]*\?|Remove the website\?)" \[(developer\.delete_project_dialog\.header|developer\.remove_site_dialog\.header)\]$/,
  async ({ visitor }, _quoted: string, key: string) => {
    const { ds } = await proj(visitor);
    const title = await ds.str(key, { project_name: current(visitor) });
    await expect(ds.alertDialog()).toBeVisible({ timeout: t(15000) });
    await expect(ds.alertDialog()).toHaveAccessibleName(title);
  }
);

Then(exact("it says [developer.delete_project_dialog.key_list.body_one] and that key's name"), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  const dialog = ds.alertDialog();
  await expect(dialog).toContainText(await ds.str('developer.delete_project_dialog.key_list.body_one'));
  await expect(dialog.getByRole('listitem')).toHaveText(notes(visitor).keyLabels as string[]);
});

Then(
  exact("it says [developer.delete_project_dialog.key_list.body_other] and both keys' names"),
  async ({ visitor }) => {
    const { ds } = await proj(visitor);
    const dialog = ds.alertDialog();
    await expect(dialog).toContainText(await ds.str('developer.delete_project_dialog.key_list.body_other'));
    const labels = notes(visitor).keyLabels as string[];
    expect(labels).toHaveLength(2);
    await expect(dialog.getByRole('listitem')).toHaveCount(2);
    expect((await dialog.getByRole('listitem').allTextContents()).sort()).toEqual([...labels].sort());
  }
);

Then(exact('it says [developer.delete_project_dialog.undo_warning.note] and no list'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  const dialog = ds.alertDialog();
  await expect(dialog).toContainText(await ds.str('developer.delete_project_dialog.undo_warning.note'));
  await expect(dialog.getByRole('list')).toHaveCount(0);
});

Then(exact('focus starts on "Cancel"'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  const cancel = ds.alertDialog().getByRole('button', { name: await ds.str('developer.common.cancel.button') });
  await expect(cancel).toBeFocused();
});

Then(
  exact('the project and its keys are gone from the home page, and those keys no longer work'),
  async ({ visitor }) => {
    const { ds, api } = await proj(visitor);
    const name = current(visitor);
    await ds.expectHome();
    await expect(ds.projectBlock(name)).toHaveCount(0);
    for (const label of notes(visitor).keyLabels as string[]) {
      await expect(ds.root().getByRole('cell', { name: label, exact: true })).toHaveCount(0);
    }
    const state = await api.state();
    expect(state.projects.map((p) => String(p.id))).not.toContain(projectId(visitor, name));
    for (const id of notes(visitor).keyIds as string[]) {
      expect(await ds.keyStatus(id), `key ${id} is refused`).toBe(404);
    }
  }
);

// --- DS-PROJ-7, DS-PROJ-8: removing the website ---------------------------------------------

Given(exact('Verse a Day\'s website is example.com and "Daily email" is limited to it'), async ({ visitor }) => {
  await asDeveloper(visitor);
  await addProject(visitor, 'Verse a Day', { websiteUrl: 'example.com', organization: 'Example Org' });
  const key = await addKey(visitor, 'Verse a Day', 'Daily email');
  const { api } = await proj(visitor);
  await api.restrictKey(String(key.id), true);
  notes(visitor).limitedKeyId = String(key.id);
  await reloadHome(visitor);
});

Given(exact('a project with a website and no limited keys'), async ({ visitor }) => {
  await asDeveloper(visitor);
  await addProject(visitor, 'Verse a Day', { websiteUrl: 'example.com' });
  await addKey(visitor, 'Verse a Day', 'Daily email');
  await reloadHome(visitor);
});

When(exact('the developer empties the Website field and saves'), async ({ visitor }) => {
  const { ds } = await ensureEditForm(visitor);
  // Another change in the same save, so a later step can tell the rest of the form was saved.
  const description = `Edited with the website ${Date.now()}`;
  notes(visitor).newDescription = description;
  await ds.descriptionField().fill(description);
  await ds.siteField().fill('');
  await ds.saveProject();
});

Then(
  exact('it lists "Daily email" under [developer.remove_site_dialog.key_list.body] with example.com'),
  async ({ visitor }) => {
    const { ds } = await proj(visitor);
    const dialog = ds.alertDialog();
    await expect(dialog).toContainText(
      await ds.str('developer.remove_site_dialog.key_list.body', { host: 'example.com' })
    );
    await expect(dialog.getByRole('listitem')).toHaveText(['Daily email']);
  }
);

Then(exact("the project's other changes are saved and the website stays"), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  await ds.expectHome();
  await expect(ds.alertDialog()).toHaveCount(0);
  const saved = await savedProject(visitor);
  expect(saved?.description).toBe(notes(visitor).newDescription);
  expect(host(saved?.websiteUrl)).toBe('example.com');
  expect(saved?.keys.find((k) => k.label === 'Daily email')?.restrictToWebsite).toBe(true);
  await expect(ds.websiteLink(current(visitor), 'example.com')).toBeVisible();
});

When(
  exact(
    'the developer empties the website again and clicks "Remove the website" [developer.remove_site_dialog.confirm.button]'
  ),
  async ({ visitor }) => {
    const { ds } = await ensureEditForm(visitor);
    await ds.siteField().fill('');
    const writes = ds.recordApiWrites();
    notes(visitor).apiWrites = writes.requests;
    notes(visitor).stopRecording = writes.stop;
    await ds.saveProject();
    await expect(ds.alertDialog()).toBeVisible({ timeout: t(15000) });
    await ds
      .alertDialog()
      .getByRole('button', { name: await ds.str('developer.remove_site_dialog.confirm.button'), exact: true })
      .click();
  }
);

Then(exact("the website is removed and Daily email's limit is off, in the same save"), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  await ds.expectHome();
  (notes(visitor).stopRecording as () => void)();
  const writes = notes(visitor).apiWrites as { method: string; path: string }[];
  const saved = await savedProject(visitor);
  expect(saved?.websiteUrl ?? '').toBe('');
  expect(saved?.keys.find((k) => k.label === 'Daily email')?.restrictToWebsite).toBe(false);
  // One save: a single project update, no separate call turning the key's limit off.
  expect(writes.map((w) => `${w.method} ${w.path}`)).toEqual([`POST /api/developer/projects/${projectId(visitor)}`]);
});

Then(exact('the website is removed with no window'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  // A window would hold the save until answered, so the home page coming back means none opened.
  await ds.expectHome();
  await expect(ds.anyDialog()).toHaveCount(0);
  const saved = await savedProject(visitor);
  expect(saved?.websiteUrl ?? '').toBe('');
  expect(saved?.description).toBe(notes(visitor).newDescription);
});

// --- DS-PROJ-9: the project limit ----------------------------------------------------------

Given(exact('a developer with 10 projects'), async ({ visitor }) => {
  const { api } = await asDeveloper(visitor);
  const { maxProjects } = await api.state();
  expect(maxProjects, 'the server allows 10 projects per account').toBe(10);
  for (let i = 1; i <= maxProjects; i++) await addProject(visitor, `Project ${i}`);
  await reloadHome(visitor);
});

Then(exact('"New project" is unavailable but can still be focused'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  const button = await ds.newProjectButton();
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  // aria-disabled, not disabled: a disabled button can't take focus.
  await expect(button).not.toHaveAttribute('disabled');
  await button.focus();
  await expect(button).toBeFocused();
  await button.click({ force: true }); // the click must do nothing; Playwright waits on aria-disabled otherwise
  await expect(ds.stepTitle()).toHaveCount(0);
  await ds.expectHome();
});

Then(
  exact(
    'on desktop its tooltip says [developer.home.project_limit_reached.tooltip], with developers@sefaria.org as an email link'
  ),
  async ({ visitor }) => {
    const { ds, api } = await proj(visitor);
    const { maxProjects } = await api.state();
    const button = await ds.newProjectButton();
    await button.hover();
    const tip = ds.projectLimitReason();
    await expect(tip).toHaveAttribute('role', 'tooltip');
    await expect(tip).toBeVisible();
    const text = await ds.str('developer.home.project_limit_reached.tooltip', {
      max_projects: maxProjects,
      developers_sefaria_org_link: 'developers@sefaria.org',
    });
    await expect(tip).toHaveText(text);
    await expect(button).toHaveAccessibleDescription(text);
    await expect(tip.getByRole('link', { name: 'developers@sefaria.org' })).toHaveAttribute(
      'href',
      'mailto:developers@sefaria.org'
    );
  }
);

Then(exact('on phones that reason shows as text under the button'), async ({ visitor }) => {
  const { page, ds, api } = await proj(visitor);
  const { maxProjects } = await api.state();
  const desktop = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 812 });
  try {
    const note = ds.projectLimitReason();
    await expect(note).not.toHaveAttribute('role', 'tooltip', { timeout: t(10000) });
    await expect(note).toBeVisible();
    await expect(note).toHaveText(
      await ds.str('developer.home.project_limit_reached.tooltip', {
        max_projects: maxProjects,
        developers_sefaria_org_link: 'developers@sefaria.org',
      })
    );
    const button = await ds.newProjectButton();
    const [b, n] = [await button.boundingBox(), await note.boundingBox()];
    expect(n!.y, 'the note is under the button').toBeGreaterThanOrEqual(b!.y + b!.height - 1);
  } finally {
    if (desktop) await page.setViewportSize(desktop);
  }
});

// --- DS-PROJ-10 ----------------------------------------------------------------------------

When(exact('the developer opens a project form'), async ({ visitor }) => {
  const { ds } = await ensureDeveloper(visitor);
  await ds.openNewProjectForm();
});

Then(exact('the note [developer.project_form.account_note.note] is shown'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  await expect(ds.siteField()).toBeVisible();
  await ds.expectText(await ds.str('developer.project_form.account_note.note'));
});

// --- DS-PROJ-11: "What are you building?" is required --------------------------------------

Given(
  exact('a project "Verse a Day" with no answer to "What are you building?" (made before answers were saved)'),
  async ({ visitor }) => {
    await asDeveloper(visitor);
    // The developer API keeps purpose empty when a project is created without one.
    await addProject(visitor, 'Verse a Day', { purpose: null });
    const saved = await savedProject(visitor);
    expect(saved?.purpose ?? null, 'the project has no saved answer').toBeNull();
    await reloadHome(visitor);
  }
);

When(exact('the developer opens "Edit project details" and saves without choosing one'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  await ds.openEditDetails(current(visitor));
  await expect(ds.purposeControl()).toHaveText(await ds.str('developer.common.choose_one.placeholder'));
  const writes = ds.recordApiWrites();
  notes(visitor).apiWrites = writes.requests;
  notes(visitor).stopRecording = writes.stop;
  await ds.saveProject();
});

Then(exact('"What are you building?" shows an error and nothing is saved'), async ({ visitor }) => {
  const { page, ds } = await proj(visitor);
  await expect(ds.fieldError('devEProjPurpose')).toHaveText(await ds.str('auth.required_field'));
  await expect(ds.purposeControl()).toHaveAttribute('aria-invalid', 'true');
  await page.waitForTimeout(t(1000)); // give a save the chance to go out
  (notes(visitor).stopRecording as () => void)();
  expect(notes(visitor).apiWrites).toEqual([]);
  await ds.expectStepTitle(await ds.str('developer.edit_project.intro', { project_name: current(visitor) }));
  expect((await savedProject(visitor))?.purpose ?? null).toBeNull();
});

When(exact('the developer chooses "Research" and saves'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  await ds.choosePurpose('Research');
  await ds.saveProject();
  await ds.expectHome();
});

Then(exact('reopening "Edit project details" shows "Research"'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  await ds.openEditDetails(current(visitor));
  await expect(ds.purposeControl()).toHaveText(await ds.str(PURPOSES.Research.key));
  expect((await savedProject(visitor))?.purpose).toBe(PURPOSES.Research.value);
});

// --- DS-NAV-2, DS-NAV-3, DS-NAV-4: Back and the Developer tab ------------------------------

When(exact('the developer opens "Edit project details", then the browser\'s Back'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  await ds.openEditDetails(current(visitor));
  await ds.browserBack();
});

Then(exact('the developer is on the home page, and the address is still /settings/developer'), async ({ visitor }) => {
  const { page, ds } = await proj(visitor);
  await ds.expectHome();
  await expect(ds.stepTitle()).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/settings/developer');
});

When(exact("the developer finishes adding a key, then the browser's Back"), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  const name = current(visitor);
  const label = 'Back test';
  await (await ds.addKeyButton(name)).click();
  await ds.expectStepTitle(await ds.str('developer.key_form.intro', { project_name: name }));
  await ds.createKeyFromForm(label);
  // Finished: the home page shows the new key's row.
  await expect(ds.keyRow(name, label)).toBeVisible({ timeout: t(30000) });
  await ds.browserBack();
});

Then(
  exact('the developer does not land on the finished key form or the "Creating your key…" screen'),
  async ({ visitor }) => {
    const { page, ds } = await proj(visitor);
    await page.waitForTimeout(t(1000)); // let a step that Back brings back render
    const keyForm = await ds.str('developer.key_form.intro', { project_name: current(visitor) });
    const creating = await ds.str('developer.creating_key.header');
    await expect(ds.keyNameField()).toHaveCount(0);
    await expect(page.getByText(keyForm, { exact: true })).toHaveCount(0);
    await expect(page.getByText(creating, { exact: true })).toHaveCount(0);
  }
);

When(exact('the developer types in the project form and goes back'), async ({ visitor }) => {
  const { page, ds } = await ensureDeveloper(visitor);
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  notes(visitor).nativeDialogs = dialogs;
  await ds.openNewProjectForm();
  await ds.nameField().fill('Half-filled project');
  await ds.descriptionField().fill('Not finished');
  await (await ds.backToProjectsLink()).click();
});

Then(exact('no "Discard changes?" window appears'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  await ds.expectHome();
  await expect(ds.anyDialog()).toHaveCount(0);
  expect(notes(visitor).nativeDialogs).toEqual([]);
  await expect(ds.nameField()).toHaveCount(0);
});

Given(exact('the developer is in any step'), async ({ visitor }) => {
  await asDeveloper(visitor);
  await addProject(visitor, 'Verse a Day', { websiteUrl: 'example.com' });
  await reloadHome(visitor);
  const { ds } = await proj(visitor);
  await ds.openEditDetails('Verse a Day');
});

When(exact('the developer clicks the "Developer Settings" tab'), async ({ visitor }) => {
  const { ds } = await proj(visitor);
  const tab = await ds.developerTab();
  await expect(tab).toBeVisible();
  await tab.click();
});

Then(exact("the home page shows (or the welcome screen, if About you isn't saved yet)"), async ({ visitor }) => {
  const { page, ds, api } = await proj(visitor);
  await expect(ds.stepTitle()).toHaveCount(0, { timeout: t(15000) });
  if ((await api.state()).profile) await ds.expectHome();
  else await ds.expectText(await ds.str('developer.welcome.header'));
  expect(new URL(page.url()).pathname).toBe('/settings/developer');
});
