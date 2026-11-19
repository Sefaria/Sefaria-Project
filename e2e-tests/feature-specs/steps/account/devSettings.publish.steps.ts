// Publish a project on Powered by Sefaria (DS-PUB-*).
//
// Several scenarios start with a When and no Given. Their steps then set up the usual context
// themselves: the developer account with one project "Verse a Day" (website and description),
// and the publish form opened from that project.
import { Request } from '@playwright/test';
import { Given, When, Then, expect, test, Visitor } from '../fixtures';
import { DeveloperSettingsPublishPage } from '../../../pages/developerSettingsPublishPage';
import { asDeveloper, addProject, copyFor, dev, notes, projectId, reloadHome } from './devSettings.common.steps';
import { t } from '../../../globals';

const PROJECT = 'Verse a Day';
const NEW_PROJECT = 'Torah Tracker';

/**
 * The developer account, with its projects deleted. Each publish story does a full submit through the UI, and the
 * account lock (devSettings.common.steps.ts) makes it wait for every other Developer Settings story on the account, up
 * to the lock's own 10-minute limit: the scenario's time limit leaves room for both.
 */
async function developer(visitor: Visitor) {
  const info = test.info();
  if (!notes(visitor).publishTimeout) {
    notes(visitor).publishTimeout = true;
    info.setTimeout(info.timeout * 2 + 10 * 60 * 1000);
  }
  return asDeveloper(visitor);
}

async function pubFor(visitor: Visitor) {
  const d = await dev(visitor);
  return { ...d, pub: new DeveloperSettingsPublishPage(d.page, visitor.lang) };
}

/** The developer with a project that has a website and a description, unless a Given already set one up. */
async function ensureProject(visitor: Visitor, name = PROJECT) {
  const n = notes(visitor);
  if (!n.projectIds?.[name]) {
    await developer(visitor);
    await addProject(visitor, name, { websiteUrl: 'example.com', description: `${name} sends one verse a day` });
    await reloadHome(visitor);
  }
  n.currentProject = name;
  return pubFor(visitor);
}

/** The publish form, opened from the project's "Publish project" if it isn't open yet. */
async function ensureForm(visitor: Visitor, name = PROJECT) {
  const p = await ensureProject(visitor, name);
  if (!(await p.pub.isFormOpen())) {
    await reloadHome(visitor);
    await p.pub.openFromProject(name);
  }
  return p;
}

async function purposeValue(pub: DeveloperSettingsPublishPage, label: string): Promise<string> {
  for (const [value, key] of DeveloperSettingsPublishPage.PURPOSES) {
    if ((await pub.str(key)) === label) return value;
  }
  throw new Error(`"${label}" is not an answer to "What are you building?"`);
}

async function savedProject(visitor: Visitor, name?: string) {
  const { api } = await dev(visitor);
  const id = projectId(visitor, name);
  const project = (await api.state()).projects.find((p) => String(p.id) === id);
  if (!project) throw new Error(`Project ${name ?? notes(visitor).currentProject} is gone`);
  return project;
}

// --- DS-PUB-1 From a project --------------------------------------------------------------------

Given('a developer with a project {string} that has a website and a description', async ({ visitor }, name: string) => {
  await developer(visitor);
  await addProject(visitor, name, { websiteUrl: 'example.com', description: `${name} sends one verse a day` });
  await reloadHome(visitor);
});

When(
  /^the developer clicks "([^"]*)" \[([^\]]+)\] on (.+)$/,
  async ({ visitor }, quoted: string, key: string, name: string) => {
    const { page, pub } = await pubFor(visitor);
    const label = await copyFor(visitor, quoted, key);
    const button = pub.project(name).getByRole('button', { name: label, exact: true });
    await expect(button).toBeVisible({ timeout: t(15000) });
    await button.click();
    notes(visitor).currentProject = name;
    void page;
  }
);

Then(
  /^"([^"]*)" \[([^\]]+)\] opens with (.+) chosen$/,
  async ({ visitor }, quoted: string, key: string, name: string) => {
    const { pub } = await pubFor(visitor);
    await pub.expectStepTitle(await copyFor(visitor, quoted, key));
    await expect(pub.form()).toBeVisible();
    await expect(pub.picker()).toHaveText(name);
    await expect((await pub.projectSummary()).locator('.devE-summaryTitle')).toContainText(name);
  }
);

Then('"About you" comes first, as a filled-in summary with "Edit"', async ({ visitor }) => {
  const { pub } = await pubFor(visitor);
  const first = pub.form().locator('section.devE-shareSection').first();
  await expect(first.getByRole('heading').first()).toHaveText(await pub.str('developer.publish_form.about_you.header'));
  const summary = first.locator('.devE-summary');
  await expect(summary).toBeVisible();
  await expect(summary.locator('.devE-summaryTitle')).not.toBeEmpty();
  await expect(
    summary.getByRole('button', { name: await pub.str('developer.publish_form.summary_edit.button'), exact: true })
  ).toBeVisible();
  // A summary, not questions: the role question stays closed until Edit.
  await expect(first.locator('#devEShareRole')).toHaveCount(0);
});

Then(/^"([^"]*)" \[([^\]]+)\] is unticked$/, async ({ visitor }, quoted: string, key: string) => {
  const { pub } = await pubFor(visitor);
  const box = pub.form().getByRole('checkbox', { name: await copyFor(visitor, quoted, key), exact: true });
  await expect(box).toHaveCount(1);
  await expect(box).not.toBeChecked();
});

// --- DS-PUB-2 From the header link ---------------------------------------------------------------

Given('a developer with two projects', async ({ visitor }) => {
  await developer(visitor);
  await addProject(visitor, 'Daily Daf', { websiteUrl: 'example.org' });
  await addProject(visitor, PROJECT, { websiteUrl: 'example.com' });
  await reloadHome(visitor);
});

Then(/^the form asks "([^"]*)" \[([^\]]+)\]$/, async ({ visitor }, quoted: string, key: string) => {
  const { pub } = await pubFor(visitor);
  await expect(pub.pickerLabel()).toHaveText(await copyFor(visitor, quoted, key), { timeout: t(15000) });
  await expect(pub.picker()).toBeVisible();
});

Then(/^the list includes "([^"]*)" \[([^\]]+)\]$/, async ({ visitor }, quoted: string, key: string) => {
  const { pub } = await pubFor(visitor);
  const label = await copyFor(visitor, quoted, key);
  await pub.openPicker();
  await expect(pub.pickerOptions().filter({ hasText: label })).toHaveCount(1);
  await pub.closePicker();
});

// --- DS-PUB-3 Create a project inside the form ---------------------------------------------------

When(/^the developer chooses "\+ Create a new project"$/, async ({ visitor }) => {
  const p = await ensureProject(visitor);
  if (!(await p.pub.isFormOpen())) {
    await reloadHome(visitor);
    await p.pub.openFromHeader();
  }
  await p.pub.pickProject(await p.pub.str('developer.publish_form.project_picker.option.new_project'));
});

Then('empty project fields open inside the form', async ({ visitor }) => {
  const { pub } = await pubFor(visitor);
  for (const field of [pub.nameField(), pub.descriptionField(), pub.websiteField()]) {
    await expect(field).toBeVisible();
    await expect(field).toHaveValue('');
  }
  await expect(pub.purposeField()).toHaveText(await pub.str('developer.common.choose_one.placeholder'));
  await expect(await pub.projectSummary()).toHaveCount(0);
});

Then(/^the submit button reads "([^"]*)" \[([^\]]+)\]$/, async ({ visitor }, quoted: string, key: string) => {
  const { pub } = await pubFor(visitor);
  await expect(pub.submitButton()).toHaveText(await copyFor(visitor, quoted, key));
});

When('the developer fills in the form and submits', async ({ visitor }) => {
  const { pub, api } = await pubFor(visitor);
  const n = notes(visitor);
  n.projectCountBefore = (await api.state()).projects.length;
  if (await pub.nameField().isVisible()) {
    await pub.fillProjectFields({
      name: NEW_PROJECT,
      purposeLabel: await pub.str('developer.project_form.purpose.option_03'),
      description: 'A reading tracker for Torah study',
      website: 'example.net',
    });
    n.submittedName = NEW_PROJECT;
  } else {
    n.submittedName = n.currentProject;
  }
  await pub.chooseCategories([0]);
  await pub.submitAndWait();
});

Then('the new project is created with no key, and submitted for review', async ({ visitor }) => {
  const { api } = await pubFor(visitor);
  const n = notes(visitor);
  const state = await api.state();
  expect(state.projects.length).toBe((n.projectCountBefore as number) + 1);
  const created = state.projects.find((p) => p.name === n.submittedName);
  expect(created, `a project named ${n.submittedName}`).toBeTruthy();
  expect(created!.keys).toHaveLength(0);
  expect(created!.visibility).toBe('public');
});

// --- DS-PUB-4 Required answers ---------------------------------------------------------------------

When('the developer submits with no project category chosen', async ({ visitor }) => {
  const { pub } = await ensureForm(visitor);
  await pub.chooseCategories([]);
  await pub.submitButton().scrollIntoViewIfNeeded();
  // Where the page was before submitting, so "the page scrolls to it" can tell a scroll from luck.
  notes(visitor).categoriesInViewBefore = await pub.inViewport(await pub.categories());
  await pub.submit();
});

Then(/^"([^"]*)" shows \[([^\]]+)\]$/, async ({ visitor }, question: string, key: string) => {
  const { pub } = await pubFor(visitor);
  const fieldset = await pub.categories();
  await expect(fieldset.locator('legend')).toContainText(await pub.str('developer.publish_form.category.label'));
  void question;
  await expect(fieldset.getByRole('alert')).toHaveText(await copyFor(visitor, undefined, key), { timeout: t(5000) });
});

Then('the page scrolls to it', async ({ visitor }) => {
  const { pub } = await pubFor(visitor);
  expect(notes(visitor).categoriesInViewBefore, 'the category question was out of view before submitting').toBe(false);
  await expect(await pub.categories()).toBeInViewport({ timeout: t(5000) });
});

Then('website, short description and "What are you building?" are required here', async ({ visitor }) => {
  const { pub } = await pubFor(visitor);
  const required = await pub.str('auth.required_field');
  const writes = pub.recordWrites();
  // Website and description: emptied on the chosen project.
  await pub.openProjectFields();
  await pub.websiteField().fill('');
  await pub.descriptionField().fill('');
  await pub.chooseCategories([0]);
  await pub.submit();
  await expect(pub.fieldError('devEProjSite')).toHaveText(required, { timeout: t(5000) });
  await expect(pub.fieldError('devEProjDesc')).toHaveText(required);
  // "What are you building?" can't be emptied once chosen: a new project starts with no answer.
  await pub.pickProject(await pub.str('developer.publish_form.project_picker.option.new_project'));
  await pub.nameField().fill('Unsent project');
  await pub.descriptionField().fill('Never sent');
  await pub.websiteField().fill('example.net');
  await pub.chooseCategories([0]);
  await pub.submit();
  await expect(pub.fieldError('devEProjPurpose')).toHaveText(required, { timeout: t(5000) });
  await expect(pub.fieldError('devEProjName')).toHaveCount(0);
  await expect(pub.form()).toBeVisible();
  expect(writes.map((r: Request) => r.url())).toEqual([]);
});

// --- DS-PUB-5 Changes here update the project ------------------------------------------------------

When("the developer edits the project's description in the publish form and submits", async ({ visitor }) => {
  const { pub } = await ensureForm(visitor);
  const description = `Edited in the publish form ${Date.now()}`;
  notes(visitor).newDescription = description;
  await pub.openProjectFields();
  await pub.descriptionField().fill(description);
  await pub.chooseCategories([0]);
  await pub.submitAndWait();
});

Then("the project's description on the home page is the new one", async ({ visitor }) => {
  const { pub } = await pubFor(visitor);
  const n = notes(visitor);
  await reloadHome(visitor);
  await expect(pub.project(n.currentProject!).locator('.devE-desc').first()).toHaveText(n.newDescription as string, {
    timeout: t(15000),
  });
});

// --- DS-PUB-6 Submitted ------------------------------------------------------------------------------

When(/^the developer submits a complete form for (.+)$/, async ({ visitor }, name: string) => {
  const { pub } = await ensureForm(visitor, name);
  await pub.chooseCategories([0]);
  await pub.submitAndWait();
});

Then(/^it names (.+) and links to the Powered by Sefaria site$/, async ({ visitor }, name: string) => {
  const { pub } = await pubFor(visitor);
  const lead = pub.root().locator('.devE-lead').first();
  await expect(lead).toContainText(name);
  const link = lead.getByRole('link', { name: await pub.str('developer.publish_submitted.powered_by_sefaria_link') });
  await expect(link).toHaveAttribute('href', await pub.str('developer.common.powered_by_gallery.url'));
});

Then(
  /^(.+) shows "([^"]*)" \[([^\]]+)\] instead of "([^"]*)"$/,
  async ({ visitor }, name: string, quoted: string, key: string, instead: string) => {
    const { pub } = await pubFor(visitor);
    await pub.expectHome();
    const region = pub.project(name);
    await expect(region.getByText(await copyFor(visitor, quoted, key), { exact: true })).toBeVisible();
    const publishLabel = await pub.str('developer.home.project_menu.publish.button');
    void instead;
    await expect(region.getByRole('button', { name: publishLabel })).toHaveCount(0);
    await expect(region.getByText(publishLabel, { exact: true })).toHaveCount(0);
  }
);

Then(
  'on desktop it is a note, not a button: gray text with a green check, and hovering it changes nothing',
  async ({ visitor }) => {
    const { pub, page } = await pubFor(visitor);
    const n = notes(visitor);
    const note = await pub.submittedNote(n.currentProject!);
    await expect(note).toBeVisible();
    const submitted = await pub.str('developer.home.project_menu.submitted.note');
    await expect(pub.project(n.currentProject!).getByRole('button', { name: submitted })).toHaveCount(0);
    await expect(pub.project(n.currentProject!).getByRole('link', { name: submitted })).toHaveCount(0);
    const before = await pub.look(note);
    expect(['button', 'a']).not.toContain(before.tag);
    expect(before.cursor).toBe('default');
    // Gray: red, green and blue close together, and not black.
    const [r, g, b] = before.color.match(/\d+/g)!.map(Number);
    expect(Math.max(r, g, b) - Math.min(r, g, b), `text color ${before.color}`).toBeLessThan(20);
    expect(r, `text color ${before.color}`).toBeGreaterThan(40);
    // A green check: #518159 (feedback-success).
    expect(before.iconColor).toBe('rgb(81, 129, 89)');
    await note.hover();
    await page.waitForTimeout(t(300)); // let any hover transition finish
    expect(await pub.look(note)).toEqual(before);
  }
);

// --- DS-PUB-8 Each tool option links to its page ---------------------------------------------------------

When('the developer looks at "Which Sefaria data or tools did you use"', async ({ visitor }) => {
  const { pub } = await ensureForm(visitor);
  const tools = await pub.tools();
  await tools.scrollIntoViewIfNeeded();
  await expect(tools.locator('legend')).toContainText(await pub.str('developer.publish_form.sefaria_tools.label'));
});

Then('each option links to its own page in a new tab', async ({ visitor }) => {
  const { pub, page } = await pubFor(visitor);
  const rows = await pub.toolRows();
  const count = await rows.count();
  expect(count).toBeGreaterThan(1);
  const hrefs: string[] = [];
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const label = (await row.innerText()).trim();
    // "Other" is the write-in choice, not a Sefaria tool: it has no page.
    if (label === 'Other') continue;
    const link = row.getByRole('link');
    await expect(link, `the link of "${label}"`).toHaveCount(1);
    await expect(link).toHaveAttribute('target', '_blank');
    const href = (await link.getAttribute('href')) ?? '';
    expect(href, `the link of "${label}"`).toMatch(/^https:\/\//);
    hrefs.push(href);
  }
  expect(new Set(hrefs).size, 'each option has its own page').toBe(hrefs.length);
  // Clicking one opens it in a new tab and leaves the form where it was.
  const link = rows.first().getByRole('link');
  const box = rows.first().getByRole('checkbox');
  const wasChecked = await box.isChecked();
  const [tab] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await tab.close();
  await expect(pub.form()).toBeVisible();
  expect(await box.isChecked()).toBe(wasChecked);
});

// --- DS-PUB-9 Link to source code --------------------------------------------------------------------------

When(
  /^the developer types "([^"]*)" in "([^"]*)" \[([^\]]+)\] and submits$/,
  async ({ visitor }, text: string, quoted: string, key: string) => {
    const { pub } = await ensureForm(visitor);
    await expect(pub.form().locator('label[for="devEShareSource"]')).toHaveText(await copyFor(visitor, quoted, key));
    await pub.sourceField().fill(text);
    await pub.chooseCategories([0]);
    await pub.submit();
  }
);

Then(
  /^the field shows "([^"]*)" \[([^\]]+)\], not "([^"]*)"$/,
  async ({ visitor }, quoted: string, key: string, not: string) => {
    const { pub } = await pubFor(visitor);
    const error = pub.fieldError('devEShareSource');
    await expect(error).toHaveText(await copyFor(visitor, quoted, key), { timeout: t(5000) });
    await expect(error).not.toHaveText(not);
    await expect(error).not.toHaveText(await pub.str('developer.common.invalid_website.error'));
  }
);

When(/^the developer types "([^"]*)" and submits$/, async ({ visitor }, text: string) => {
  const { pub } = await pubFor(visitor);
  await pub.sourceField().fill(text);
  await pub.submitAndWait();
});

Then(/^the link is saved whole, with its path, as "([^"]*)"$/, async ({ visitor }, url: string) => {
  const project = await savedProject(visitor);
  expect((project.poweredBy as any)?.sourceCode).toBe(url);
});

// --- DS-PUB-10 A project picked from the header link keeps its saved answers ---------------------------------

Given(
  /^a developer with a profile and a project "([^"]*)" whose answer to "What are you building\?" is "([^"]*)"$/,
  async ({ visitor }, name: string, answer: string) => {
    const d = await developer(visitor);
    const pub = new DeveloperSettingsPublishPage(d.page, visitor.lang);
    await addProject(visitor, name, {
      websiteUrl: 'example.com',
      description: `${name} sends one verse a day`,
      purpose: await purposeValue(pub, answer),
    });
    await reloadHome(visitor);
  }
);

When(
  'the developer clicks "Publish a project", chooses Verse a Day, chooses a category and submits',
  async ({ visitor }) => {
    const { pub } = await pubFor(visitor);
    await pub.openFromHeader();
    await pub.pickProject(PROJECT);
    notes(visitor).currentProject = PROJECT;
    await pub.chooseCategories([0]);
    await pub.submit();
  }
);

Then('the project is submitted for review, with no error on "What are you building?"', async ({ visitor }) => {
  const { pub } = await pubFor(visitor);
  await expect(pub.fieldError('devEProjPurpose')).toHaveCount(0);
  await pub.expectSubmittedPage();
  expect((await savedProject(visitor)).visibility).toBe('public');
});

Then(/^its saved answer is still "([^"]*)"$/, async ({ visitor }, answer: string) => {
  const { pub } = await pubFor(visitor);
  expect((await savedProject(visitor)).purpose).toBe(await purposeValue(pub, answer));
});

// --- DS-PUB-11 A project with no answer opens its details --------------------------------------------------

Given(/^a project "([^"]*)" with no answer to "What are you building\?"$/, async ({ visitor }, name: string) => {
  await developer(visitor);
  const project = await addProject(visitor, name, {
    websiteUrl: 'example.com',
    description: `${name} sends one verse a day`,
    purpose: null,
  });
  expect(project.purpose ?? null, 'the API saved the project with no purpose').toBeNull();
  await reloadHome(visitor);
});

When('the developer opens the publish form for it', async ({ visitor }) => {
  const { pub } = await pubFor(visitor);
  await pub.openFromProject(notes(visitor).currentProject!);
});

Then('the project\'s fields are open, not a summary, and "What are you building?" is empty', async ({ visitor }) => {
  const { pub } = await pubFor(visitor);
  await expect(await pub.projectSummary()).toHaveCount(0);
  await expect(pub.nameField()).toHaveValue(notes(visitor).currentProject!);
  await expect(pub.descriptionField()).toBeVisible();
  await expect(pub.websiteField()).toBeVisible();
  await expect(pub.purposeField()).toHaveText(await pub.str('developer.common.choose_one.placeholder'));
  await expect(pub.purposeField()).toHaveClass(/is-placeholder/);
});

When('the developer submits without choosing one', async ({ visitor }) => {
  const { pub } = await pubFor(visitor);
  notes(visitor).writes = pub.recordWrites();
  await pub.chooseCategories([0]);
  await pub.submit();
});

Then('"What are you building?" shows an error and nothing is sent', async ({ visitor }) => {
  const { pub, page } = await pubFor(visitor);
  await expect(pub.fieldError('devEProjPurpose')).toHaveText(await pub.str('auth.required_field'), {
    timeout: t(5000),
  });
  await page.waitForTimeout(t(1000)); // give a request time to go out, if one were sent
  expect((notes(visitor).writes as Request[]).map((r) => r.url())).toEqual([]);
  await expect(pub.form()).toBeVisible();
  const saved = await savedProject(visitor);
  expect(saved.purpose ?? null).toBeNull();
  expect(saved.visibility).toBe('private');
});

// --- DS-PUB-12 Publish answers are saved and come back -------------------------------------------------

const ANSWERS = {
  categories: [0, 2],
  tools: [0, 2],
  source: 'github.com/someone/verse-a-day',
  anythingElse: 'We would love feedback on the daily email.',
};

Given(
  /^the developer submitted (.+) with categories, tools, a link to source code and "([^"]*)" \[([^\]]+)\] filled in$/,
  async ({ visitor }, name: string, quoted: string, key: string) => {
    const { pub } = await ensureForm(visitor, name);
    await expect(pub.form().locator('label[for="devEShareElse"]')).toHaveText(await copyFor(visitor, quoted, key));
    await pub.chooseCategories(ANSWERS.categories);
    await pub.chooseTools(ANSWERS.tools);
    await pub.sourceField().fill(ANSWERS.source);
    await pub.anythingElseField().fill(ANSWERS.anythingElse);
    await pub.submitAndWait();
  }
);

When(/^the developer opens the publish form for (.+) again$/, async ({ visitor }, name: string) => {
  const { pub } = await reloadHome(visitor).then(() => pubFor(visitor));
  // Submitted, the project shows "Submitted for review" instead of its own Publish button: the header's link opens the form.
  await pub.openFromHeader();
  await pub.pickProject(name);
});

Then('every answer shows as it was submitted, including "Anything else"', async ({ visitor }) => {
  const { pub } = await pubFor(visitor);
  const cats = await pub.categoryBoxes();
  for (let i = 0; i < (await cats.count()); i++) {
    if (ANSWERS.categories.includes(i)) await expect(cats.nth(i)).toBeChecked();
    else await expect(cats.nth(i)).not.toBeChecked();
  }
  const tools = (await pub.tools()).getByRole('checkbox');
  for (let i = 0; i < (await tools.count()); i++) {
    if (ANSWERS.tools.includes(i)) await expect(tools.nth(i)).toBeChecked();
    else await expect(tools.nth(i)).not.toBeChecked();
  }
  await expect(pub.sourceField()).toHaveValue(`https://${ANSWERS.source}`);
  await expect(pub.anythingElseField()).toHaveValue(ANSWERS.anythingElse);
});

Then('staff notes on the project are never shown to the developer', async ({ visitor }) => {
  const { pub, api, page } = await pubFor(visitor);
  // Not in the data the page gets...
  const state = await api.state();
  const project = state.projects.find((p) => String(p.id) === projectId(visitor));
  expect(project).toBeTruthy();
  const keys: string[] = [];
  const walk = (o: unknown) => {
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        keys.push(k);
        walk(v);
      }
    }
  };
  walk(state);
  expect(keys.filter((k) => /notes?$/i.test(k) && /staff|^notes?$|internal|admin/i.test(k))).toEqual([]);
  // ...nor on the form or the home page.
  for (const where of ['form', 'home']) {
    if (where === 'home') await reloadHome(visitor);
    await expect(pub.root().getByText(/staff notes?/i)).toHaveCount(0);
    await expect(pub.root().getByRole('textbox', { name: /notes?/i })).toHaveCount(0);
    expect(await page.locator('[id*="otes"], [name*="otes"]').count(), `a notes field on the ${where}`).toBe(0);
  }
});
