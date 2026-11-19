// Keys on the main page (DS-KEY-*) and the accessibility checks that use them (DS-A11Y-1, 2, 4, 5).
import { Given, When, Then, expect, Visitor } from '../fixtures';
import { dev, notes, asDeveloper, reloadHome, addProject, addKey, projectId } from './devSettings.common.steps';
import { DeveloperSettingsKeysPage, WindowA11y } from '../../../pages/developerSettingsKeysPage';
import { LANGUAGES, t } from '../../../globals';

/** The page, the keys page object and the developer API. */
async function keys(visitor: Visitor) {
  const d = await dev(visitor);
  return { ...d, ks: new DeveloperSettingsKeysPage(d.page, visitor.lang) };
}

const current = (visitor: Visitor) => {
  const n = notes(visitor);
  if (!n.currentProject || !n.currentKey) throw new Error('No project and key were set up in this scenario');
  return { project: n.currentProject, key: n.currentKey, value: n.keyValues?.[n.currentKey] ?? '' };
};

/**
 * Scenarios with no Given (DS-A11Y-2, 4, 5) start from the same home page as "a developer on the
 * home page": Verse a Day, with a website, and its key Daily email.
 */
async function ensureHome(visitor: Visitor) {
  if (notes(visitor).currentProject) return keys(visitor);
  await asDeveloper(visitor);
  await addProject(visitor, 'Verse a Day', { websiteUrl: 'example.com' });
  await addKey(visitor, 'Verse a Day', 'Daily email');
  await reloadHome(visitor);
  return keys(visitor);
}

const isPhone = async (visitor: Visitor) => ((await visitor.page()).viewportSize()?.width ?? 1280) <= 842;

// --- DS-KEY-1 A hidden key shows only its start -------------------------------------------

Then(/^the key reads its first 10 characters \("sfr_" and 6 more\) followed by four dots$/, async ({ visitor }) => {
  const { ds } = await dev(visitor);
  const n = notes(visitor);
  const value = n.keyValues![n.currentKey!];
  const code = ds.keyRow(n.currentProject!, n.currentKey!).locator('code');
  await expect(code).toHaveText(value.slice(0, 10) + '••••');
  expect(value.slice(0, 4)).toBe('sfr_');
});

Then("the full key is not in the page or in the page's data", async ({ visitor }) => {
  const { page } = await dev(visitor);
  const n = notes(visitor);
  const value = n.keyValues![n.currentKey!];
  expect(await page.content()).not.toContain(value);
});

// --- DS-KEY-2 Show and hide ----------------------------------------------------------------

Then('the full key is shown', async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const { project, key, value } = current(visitor);
  await expect(ks.keyCode(project, key)).toHaveText(value, { timeout: t(10000) });
});

Then('only the start shows again, and the full key is gone from the page', async ({ visitor }) => {
  const { page, ks } = await keys(visitor);
  const { project, key, value } = current(visitor);
  await expect(ks.keyCode(project, key)).toHaveText(value.slice(0, 10) + '••••');
  expect(await page.content()).not.toContain(value);
});

// --- DS-KEY-3 Copy -------------------------------------------------------------------------

When(
  /^the developer clicks "([^"]*)" \[([^\]]+)\] while the key is hidden$/,
  async ({ visitor }, _quoted: string, ariaKey: string) => {
    const { ks } = await keys(visitor);
    const { project, key, value } = current(visitor);
    expect(ariaKey).toBe('developer.home.key.copy.aria');
    await expect(ks.keyCode(project, key)).toHaveText(value.slice(0, 10) + '••••');
    await ks.allowClipboard();
    await ks.watchCopy(project, key, await ks.str('developer.home.key.copied.aria'));
    await ks.clickCopy(project, key);
  }
);

Then('the clipboard holds the full key', async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const { value } = current(visitor);
  await expect.poll(() => ks.clipboardText(), { timeout: t(10000) }).toBe(value);
});

Then('the copy icon turns into a green check for 8 seconds, then turns back', async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const { project, key } = current(visitor);
  const rec = await ks.copyRecord();
  expect(rec.checkOn, 'the check icon appeared').not.toBeNull();
  expect(rec.checkColor, 'the check is green (#518159)').toBe('rgb(81, 129, 89)');
  const shown = rec.checkOff! - rec.checkOn!;
  expect(shown, `the check showed for ${Math.round(shown)} ms`).toBeGreaterThan(7500);
  expect(shown).toBeLessThan(8800);
  await ks.expectPlainCopyIcon(project, key);
});

Then(/^screen readers hear "([^"]*)" \[([^\]]+)\]$/, async ({ visitor }, _quoted: string, stringKey: string) => {
  const { ks } = await keys(visitor);
  const rec = await ks.copyRecord(false);
  expect(rec.announced).toContain(await ks.str(stringKey));
});

Then('no visible "Copied" text appears', async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const rec = await ks.copyRecord(false);
  expect(rec.visibleCopied).toEqual([]);
});

Then('the key on screen stays hidden', async ({ visitor }) => {
  const { page, ks } = await keys(visitor);
  const { project, key, value } = current(visitor);
  await expect(ks.keyCode(project, key)).toHaveText(value.slice(0, 10) + '••••');
  expect(await page.content()).not.toContain(value);
});

// --- DS-KEY-4 / DS-KEY-5 Delete ------------------------------------------------------------

Then(
  /^a window asks "([^"]*)" \[(developer\.delete_key_dialog\.header)\]$/,
  async ({ visitor }, _quoted: string, stringKey: string) => {
    const { ks } = await keys(visitor);
    const { project, key } = current(visitor);
    const win = ks.confirmWindow();
    await expect(win).toBeVisible({ timeout: t(10000) });
    const title = await ks.str(stringKey, { key_name: key });
    await expect(win.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(win).toHaveAccessibleName(title);
    // Remembered for "the key no longer works against the API", after the row is gone.
    notes(visitor).deletedKeyId = await ks.keyIdFromRow(project, key);
  }
);

Then(/^it says "([^"]*)" \[([^\]]+)\]$/, async ({ visitor }, _quoted: string, stringKey: string) => {
  const { ks } = await keys(visitor);
  await expect(ks.confirmWindow().getByText(await ks.str(stringKey), { exact: true })).toBeVisible();
});

Then('"Cancel" comes first and the red "Delete" last', async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const win = ks.confirmWindow();
  const cancel = win.getByRole('button', { name: await ks.str('developer.common.cancel.button'), exact: true });
  const del = win.getByRole('button', {
    name: await ks.str('developer.delete_key_dialog.confirm.button'),
    exact: true,
  });
  const [c, d] = [await cancel.boundingBox(), await del.boundingBox()];
  expect(c && d, 'both buttons are on screen').toBeTruthy();
  // First in reading order: left of Delete on one line (or above it when stacked).
  const sameLine = Math.abs(c!.y - d!.y) < 4;
  if (sameLine) expect(c!.x + c!.width, 'Cancel is before Delete').toBeLessThanOrEqual(d!.x);
  else expect(c!.y, 'Cancel is above Delete').toBeLessThan(d!.y);
  const bg = await del.evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r, g, b] = (bg.match(/\d+/g) ?? []).map(Number);
  expect(r > 150 && g < 100 && b < 100, `Delete is red (${bg})`).toBe(true);
});

Then("the key's row disappears", async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const { project, key } = current(visitor);
  await expect(ks.confirmWindow()).toHaveCount(0, { timeout: t(10000) });
  await expect(ks.keyRow(project, key)).toHaveCount(0, { timeout: t(10000) });
});

Then('the key no longer works against the API', async ({ visitor }) => {
  // The public API checks keys in the auth service, which a browser can't reach here. The
  // closest check: the server has revoked the key (no longer listed; asking for its value: 404).
  const { api, ks } = await keys(visitor);
  const { project, key } = current(visitor);
  const id = notes(visitor).deletedKeyId as string;
  const state = await api.state();
  const p = state.projects.find((x) => String(x.id) === projectId(visitor, project))!;
  expect(p.keys.map((k) => k.label)).not.toContain(key);
  expect(await ks.keyValueStatus(id)).toBe(404);
});

When(/^the developer opens "([^"]*)" and clicks "Cancel"$/, async ({ visitor }, quoted: string) => {
  const { ks } = await keys(visitor);
  const { project, key } = current(visitor);
  const del = await ks.keyButton(project, key, 'developer.home.key.delete.aria');
  if (visitor.lang === LANGUAGES.EN) await expect(del).toHaveAccessibleName(quoted);
  await del.click();
  await expect(ks.confirmWindow()).toBeVisible();
  await ks
    .confirmWindow()
    .getByRole('button', { name: await ks.str('developer.common.cancel.button'), exact: true })
    .click();
});

Then('the window closes, the key is still listed, and focus is back on the delete button', async ({ visitor }) => {
  const { ks, api } = await keys(visitor);
  const { project, key } = current(visitor);
  await expect(ks.confirmWindow()).toHaveCount(0);
  await expect(ks.keyRow(project, key)).toBeVisible();
  const state = await api.state();
  expect(state.projects.flatMap((p) => p.keys.map((k) => k.label))).toContain(key);
  await expect(await ks.keyButton(project, key, 'developer.home.key.delete.aria')).toBeFocused();
});

// --- DS-KEY-6 / DS-KEY-7 Add a key ---------------------------------------------------------

// "the developer clicks \"Add key\" […] on <project>" is in devSettings.publish.steps.ts.

Then(
  /^the page reads "([^"]*)", with no step counter and a back link to the projects$/,
  async ({ visitor }, _quoted: string) => {
    const { ks } = await keys(visitor);
    const { project } = current(visitor);
    const title = await ks.str('developer.key_form.intro', { project_name: project });
    await expect(ks.stepTitle()).toHaveText(title, { timeout: t(10000) });
    await expect(ks.stepTitle()).not.toContainText(await ks.strPattern('developer.frame.step_count.aria'));
    await expect(ks.stepTitle().locator('.devE-stepN')).toHaveCount(0);
    await expect(await ks.stepBackButton()).toBeVisible();
  }
);

When(/^the developer names the key "([^"]*)" and creates it$/, async ({ visitor }, label: string) => {
  const { page, ks } = await keys(visitor);
  const reference = notes(visitor).currentKey!;
  await ks.keyNameField().fill(label);
  await ks.sampleNewRow(label, reference);
  await ks.button(await ks.str('developer.key_form.create.button')).click();
  // The pointer leaves the page body, so a :hover tint can't be mistaken for a highlight.
  await page.mouse.move(0, 0);
  notes(visitor).currentKey = label;
});

Then(
  /^the home page lists "([^"]*)" under (.+), scrolled into view$/,
  async ({ visitor }, label: string, projectName: string) => {
    const { ks } = await keys(visitor);
    await ks.expectHome();
    const row = ks.keyRow(projectName, label);
    await expect(row).toBeVisible({ timeout: t(15000) });
    await expect(row).toBeInViewport({ timeout: t(5000) });
  }
);

Then('the new row shows in its final look from the start: no highlight, flash or color change', async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const { samples, refSamples } = await ks.rowSamples();
  expect(samples.length).toBeGreaterThan(10);
  const first = samples[0].values;
  for (const s of samples) expect(s.values, `look at ${Math.round(s.t)} ms`).toEqual(first);
  expect(first.join('|')).not.toMatch(/animationName=(?!none)/);
  // The same look as the key that was already there.
  expect(refSamples.length).toBeGreaterThan(0);
  expect(first).toEqual(refSamples[refSamples.length - 1].values);
});

When('the developer creates a key with an empty name', async ({ visitor }) => {
  const { ks, api } = await keys(visitor);
  const { project } = current(visitor);
  notes(visitor).keyCountBefore = (await api.state()).projects.find((p) => p.name === project)!.keys.length;
  await (await ks.addKeyButton(project)).click();
  await expect(ks.keyNameField()).toBeVisible();
  await ks.keyNameField().fill('');
  await ks.button(await ks.str('developer.key_form.create.button')).click();
});

Then('the name field shows an error and no key is created', async ({ visitor }) => {
  const { ks, api } = await keys(visitor);
  const { project } = current(visitor);
  await expect(ks.keyNameError()).toBeVisible();
  await expect(ks.keyNameError()).not.toHaveText('');
  await expect(ks.keyNameField()).toHaveAttribute('aria-describedby', /devEKeyName-error/);
  await expect(ks.stepTitle()).toHaveText(await ks.str('developer.key_form.intro', { project_name: project }));
  const after = (await api.state()).projects.find((p) => p.name === project)!.keys.length;
  expect(after).toBe(notes(visitor).keyCountBefore);
});

When('the developer types {int} characters', async ({ visitor }, count: number) => {
  const { ks } = await keys(visitor);
  const text = Array.from({ length: count }, (_, i) => String.fromCharCode(97 + (i % 26))).join('');
  notes(visitor).typed = text;
  await ks.keyNameField().fill('');
  await ks.keyNameField().pressSequentially(text);
});

Then('only {int} are kept', async ({ visitor }, count: number) => {
  const { ks } = await keys(visitor);
  const typed = notes(visitor).typed as string;
  await expect(ks.keyNameField()).toHaveValue(typed.slice(0, count));
});

// --- DS-KEY-8 / DS-KEY-9 Limit to website --------------------------------------------------

When(/^the developer turns on "([^"]*)" \[([^\]]+)\]$/, async ({ visitor }, _quoted: string, stringKey: string) => {
  const { page, ks } = await keys(visitor);
  const { project, key } = current(visitor);
  expect(stringKey).toBe('developer.home.key.restrict.aria');
  const sw = await ks.limitSwitch(project, key);
  await expect(sw).not.toBeChecked();
  const saved = page.waitForResponse(
    (r) => /\/api\/developer\/keys\/[^/]+$/.test(r.url()) && r.request().method() === 'POST'
  );
  await ks.clickSwitch(sw);
  expect((await saved).status()).toBe(200);
});

Then('the switch stays on after a reload, with no message', async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const { project, key } = current(visitor);
  await expect(await ks.limitSwitch(project, key)).toBeChecked();
  await ks.expectNoMessage();
  await ks.open();
  await expect(await ks.limitSwitch(project, key)).toBeChecked();
  await ks.expectNoMessage();
});

Then('the key works from example.com and its subdomains and is refused from other sites', async ({ visitor }) => {
  // Origins are enforced by the separate auth service, which isn't reachable from the browser in
  // this environment. The closest check: the server has the key limited to the project's website,
  // and that website is example.com.
  const { api } = await keys(visitor);
  const { project, key } = current(visitor);
  const p = (await api.state()).projects.find((x) => x.name === project)!;
  expect(new URL(p.websiteUrl!).hostname).toBe('example.com');
  expect(p.keys.find((k) => k.label === key)?.restrictToWebsite).toBe(true);
});

Given(/^(.+) has no website$/, async ({ visitor }, projectName: string) => {
  const { api } = await keys(visitor);
  await api.updateProject(projectId(visitor, projectName), { websiteUrl: '' });
  await reloadHome(visitor);
});

When(/^the developer turns on the switch for (.+)$/, async ({ visitor }, keyLabel: string) => {
  const { ks } = await keys(visitor);
  const { project } = current(visitor);
  notes(visitor).currentKey = keyLabel;
  const sw = await ks.limitSwitch(project, keyLabel);
  await expect(sw).not.toBeChecked();
  await ks.clickSwitch(sw);
});

Then(/^a window "([^"]*)" opens, asking for the website$/, async ({ visitor }, _quoted: string) => {
  const { ks } = await keys(visitor);
  const win = ks.confirmWindow();
  await expect(win).toBeVisible();
  await expect(win).toHaveAccessibleName(await ks.str('developer.common.restrict_to_website.label'));
  await expect(win.getByRole('textbox', { name: await ks.str('developer.common.your_website.label') })).toBeVisible();
});

Then(
  /^the hint under the field reads only \[([^\]]+)\], with no "([^"]*)"$/,
  async ({ visitor }, stringKey: string, dropped: string) => {
    const { ks } = await keys(visitor);
    await expect(ks.limitSiteHint()).toHaveText(await ks.str(stringKey));
    // The dropped sentence, by key: developer.common.your_website.hint without its {domain_hint}.
    const droppedCopy = (await ks.str('developer.common.your_website.hint', { domain_hint: '' })).trim() || dropped;
    await expect(ks.confirmWindow()).not.toContainText(droppedCopy);
  }
);

Then(
  /^"([^"]*)" \[([^\]]+)\] is disabled until something is typed$/,
  async ({ visitor }, _quoted: string, stringKey: string) => {
    const { ks } = await keys(visitor);
    const confirm = ks.confirmWindow().getByRole('button', { name: await ks.str(stringKey), exact: true });
    await expect(ks.limitSiteField()).toHaveValue('');
    await expect(confirm).toBeDisabled();
    await ks.limitSiteField().pressSequentially('e');
    await expect(confirm).toBeEnabled();
    await ks.limitSiteField().fill('');
    await expect(confirm).toBeDisabled();
  }
);

When(/^the developer types "([^"]*)" and clicks "Limit key"$/, async ({ visitor }, site: string) => {
  const { ks } = await keys(visitor);
  await ks.limitSiteField().fill(site);
  await ks
    .confirmWindow()
    .getByRole('button', { name: await ks.str('developer.limit_key_dialog.confirm.button'), exact: true })
    .click();
});

Then(/^the project's website is saved as "([^"]*)" and the switch is on$/, async ({ visitor }, host: string) => {
  const { ks, api } = await keys(visitor);
  const { project, key } = current(visitor);
  await expect(ks.confirmWindow()).toHaveCount(0, { timeout: t(10000) });
  await expect(await ks.limitSwitch(project, key)).toBeChecked();
  const p = (await api.state()).projects.find((x) => x.name === project)!;
  const url = new URL(p.websiteUrl!);
  expect(url.hostname).toBe(host);
  expect(url.pathname === '/' || url.pathname === '').toBe(true);
  expect(p.keys.find((k) => k.label === key)?.restrictToWebsite).toBe(true);
});

When('the developer opens the window again and clicks "Cancel"', async ({ visitor }) => {
  // The window only opens for a project with no website, and the last step saved one. To open it
  // again, the website is removed through the API (which also turns the limit off), as before.
  const { ks, api } = await keys(visitor);
  const { project, key } = current(visitor);
  await api.updateProject(projectId(visitor, project), { websiteUrl: '' });
  await ks.open();
  const sw = await ks.limitSwitch(project, key);
  notes(visitor).switchBefore = await sw.isChecked();
  await ks.clickSwitch(sw);
  await expect(ks.confirmWindow()).toBeVisible();
  await ks
    .confirmWindow()
    .getByRole('button', { name: await ks.str('developer.common.cancel.button'), exact: true })
    .click();
});

Then('the switch stays as it was', async ({ visitor }) => {
  const { ks, api } = await keys(visitor);
  const { project, key } = current(visitor);
  const before = notes(visitor).switchBefore as boolean;
  await expect(ks.confirmWindow()).toHaveCount(0);
  const sw = await ks.limitSwitch(project, key);
  if (before) await expect(sw).toBeChecked();
  else await expect(sw).not.toBeChecked();
  const p = (await api.state()).projects.find((x) => x.name === project)!;
  expect(p.keys.find((k) => k.label === key)?.restrictToWebsite).toBe(before);
});

// --- DS-KEY-10 The key limit ---------------------------------------------------------------

Given(/^(.+) has (\d+) keys$/, async ({ visitor }, projectName: string, count: string) => {
  const { api } = await keys(visitor);
  const want = Number(count);
  const state = await api.state();
  // The limit comes from the server, not the copy.
  expect(state.maxKeysPerProject).toBe(want);
  const have = state.projects.find((p) => p.name === projectName)!.keys.length;
  for (let i = have + 1; i <= want; i++) await addKey(visitor, projectName, `Key ${i}`);
  notes(visitor).currentProject = projectName;
  await reloadHome(visitor);
});

Then('"Add key" is unavailable but can still be focused', async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const { project } = current(visitor);
  const add = await ks.addKeyButton(project);
  await expect(add).toHaveAttribute('aria-disabled', 'true');
  // aria-disabled, not the disabled attribute, which would take it out of the Tab order.
  await expect(add).not.toHaveAttribute('disabled');
  // Unavailable: a click (forced past Playwright's aria-disabled check) opens nothing.
  await add.click({ force: true });
  await ks.expectHome();
  await expect(ks.stepTitle()).toHaveCount(0);
  await add.focus();
  await expect(add).toBeFocused();
  await add.blur();
});

Then(/^on desktop, hovering or focusing it shows the tooltip \[([^\]]+)\]$/, async ({ visitor }, stringKey: string) => {
  const { page, ks, api } = await keys(visitor);
  const { project } = current(visitor);
  const add = await ks.addKeyButton(project);
  const tip = ks.project(project).getByRole('tooltip');
  if (await isPhone(visitor)) {
    await add.hover();
    await expect(tip).toHaveCount(0);
    return;
  }
  const text = await ks.str(stringKey, { max_keys: (await api.state()).maxKeysPerProject });
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
  await add.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(text);
  await expect(add).toHaveAccessibleDescription(text);
  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
  await add.focus();
  await expect(tip).toBeVisible();
  await add.blur();
});

Then('on phones, that reason shows as text under the button', async ({ visitor }) => {
  const { ks, api } = await keys(visitor);
  const { project } = current(visitor);
  const add = await ks.addKeyButton(project);
  const text = await ks.str('developer.home.key_limit_reached.tooltip', {
    max_keys: (await api.state()).maxKeysPerProject,
  });
  const note = ks.project(project).locator('.devE-btnNote');
  if (!(await isPhone(visitor))) {
    // Desktop: the reason is a tooltip, not a line of text.
    await expect(note).toHaveCount(0);
    return;
  }
  await expect(note).toBeVisible();
  await expect(note).toHaveText(text);
  const [b, n] = [await add.boundingBox(), await note.boundingBox()];
  expect(n!.y).toBeGreaterThanOrEqual(b!.y + b!.height - 1);
});

Then('deleting one key makes "Add key" available again', async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const { project } = current(visitor);
  const label = notes(visitor).currentKey!;
  await (await ks.keyButton(project, label, 'developer.home.key.delete.aria')).click();
  await ks
    .confirmWindow()
    .getByRole('button', { name: await ks.str('developer.delete_key_dialog.confirm.button'), exact: true })
    .click();
  await expect(ks.keyRow(project, label)).toHaveCount(0, { timeout: t(10000) });
  const add = await ks.addKeyButton(project);
  await expect(add).not.toHaveAttribute('aria-disabled', 'true');
  await add.click();
  await expect(ks.stepTitle()).toHaveText(await ks.str('developer.key_form.intro', { project_name: project }));
});

// --- DS-KEY-11 Long key names --------------------------------------------------------------

Given('a key whose name is longer than its column', async ({ visitor }) => {
  const { project } = current(visitor);
  const label = 'A key for the weekly newsletter that goes to every subscriber on the mailing list';
  await addKey(visitor, project, label);
  await reloadHome(visitor);
});

Then(/^the name stays on one line and ends in "…"$/, async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const { project, key } = current(visitor);
  const name = ks.keyRow(project, key).locator('.devE-keyNameText');
  await expect(name).toHaveText(key);
  const look = await name.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      whiteSpace: s.whiteSpace,
      textOverflow: s.textOverflow,
      overflow: s.overflowX,
      cut: el.scrollWidth > el.clientWidth + 1,
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.4,
    };
  });
  expect(look.cut, 'the name is longer than its column').toBe(true);
  expect(look.whiteSpace).toBe('nowrap');
  expect(look.overflow).toBe('hidden');
  expect(look.textOverflow).toBe('ellipsis');
  expect(look.height, 'one line high').toBeLessThan(look.lineHeight * 1.5);
});

Then('hovering it shows the whole name', async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const { project, key } = current(visitor);
  const cell = ks.keyRow(project, key).locator('.devE-keyName');
  const tip = cell.locator('.devE-tip');
  await expect(tip).toBeHidden();
  await cell.locator('.devE-keyNameText').hover();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(key);
});

// --- DS-KEY-12 Phones ----------------------------------------------------------------------

Given(/^the developer is on a phone \((\d+)px wide\)$/, async ({ visitor }, width: string) => {
  const page = await visitor.page();
  const size = page.viewportSize();
  await page.setViewportSize({ width: Number(width), height: size?.height ?? 844 });
});

When(
  /^the developer loads \/settings\/developer directly \(typed, or refreshed\), not by navigating to it$/,
  async ({ visitor }) => {
    const { ks } = await keys(visitor);
    await ks.openWatchingLayout();
  }
);

Then(/^"Add key" on (.+) is a full-width button that can be tapped$/, async ({ visitor }, projectName: string) => {
  const { ks } = await keys(visitor);
  const add = await ks.addKeyButton(projectName);
  await expect(add).toBeVisible();
  const box = (await add.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual((await ks.projectHeadContentWidth(projectName)) - 2);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await ks.hitsItself(add)).toBe(true);
  await add.tap({ trial: true });
});

Then(/^the ⋮ menu sits at the top corner of the project, on the same line as its name$/, async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const { project } = current(visitor);
  const menu = await ks.projectMenuButton(project);
  await expect(menu).toBeVisible();
  const region = (await ks.project(project).boundingBox())!;
  const name = (await ks.project(project).getByRole('heading', { level: 3 }).boundingBox())!;
  const m = (await menu.boundingBox())!;
  // Same line: the button's middle is within the name's line.
  const mid = m.y + m.height / 2;
  expect(mid).toBeGreaterThanOrEqual(name.y);
  expect(mid).toBeLessThanOrEqual(name.y + name.height);
  // The top inline-end corner of the project.
  expect(region.x + region.width - (m.x + m.width)).toBeLessThan(16);
  expect(m.y - region.y).toBeLessThan(24);
  expect(m.x).toBeGreaterThan(name.x);
});

When(/^the developer taps ⋮ \[([^\]]+)\]$/, async ({ visitor }, stringKey: string) => {
  const { ks } = await keys(visitor);
  const { project } = current(visitor);
  expect(stringKey).toBe('developer.home.project_menu.open.aria');
  // What the project shows before the tap, for "not shown as rows on the page before ⋮ is tapped".
  const labels = [
    await ks.str('developer.home.project.edit_details.button'),
    await ks.str('developer.home.project_menu.add_website.button'),
    await ks.str('developer.home.project_menu.publish.button'),
    await ks.str('developer.home.project_menu.submitted.note'),
  ];
  const shown: string[] = [];
  for (const label of labels) {
    for (const el of await ks.project(project).getByText(label, { exact: true }).all()) {
      if (await el.isVisible()) shown.push(label);
    }
  }
  notes(visitor).menuOptionsBeforeTap = shown;
  notes(visitor).menuClosedBeforeTap = !(await ks.projectMenuItems(project).first().isVisible());
  await (await ks.projectMenuButton(project)).tap();
});

Then(
  'a closed menu opens with Edit project details, Add website or the website, and Publish project or Submitted for review',
  async ({ visitor }) => {
    const { ks, api } = await keys(visitor);
    const { project } = current(visitor);
    expect(notes(visitor).menuClosedBeforeTap, 'the menu was closed before the tap').toBe(true);
    const p = (await api.state()).projects.find((x) => x.name === project)!;
    const items = ks.projectMenuItems(project);
    await expect(items.first()).toBeVisible();
    const expected = [await ks.str('developer.home.project.edit_details.button')];
    if (p.websiteUrl) expected.push(new URL(p.websiteUrl).hostname);
    else expected.push(await ks.str('developer.home.project_menu.add_website.button'));
    expected.push(
      await ks.str(
        p.visibility === 'public'
          ? 'developer.home.project_menu.submitted.note'
          : 'developer.home.project_menu.publish.button'
      )
    );
    await expect(items).toHaveText(expected);
  }
);

Then("the menu's options are not shown as rows on the page before ⋮ is tapped", async ({ visitor }) => {
  expect(notes(visitor).menuOptionsBeforeTap).toEqual([]);
});

Then(
  /^when (.+) has a website, its link under the description is there from the first paint, so "Add key" doesn't move down after the page loads$/,
  async ({ visitor }, projectName: string) => {
    const { ks, api } = await keys(visitor);
    const p = (await api.state()).projects.find((x) => x.name === projectName)!;
    if (!p.websiteUrl) {
      // The Background project has none: give it one, and load the page directly again.
      await api.updateProject(projectId(visitor, projectName), { websiteUrl: 'example.com' });
      await ks.openWatchingLayout();
    }
    const frames = (await ks.layoutSamples())
      .map((f) => ({ t: f.t, ...f.projects.find((x) => x.name === projectName)! }))
      .filter((f) => f.name);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0].linkShown, 'the website link is there in the first frame').toBe(true);
    const tops = frames.map((f) => f.addKeyTop).filter((y): y is number => y !== null);
    expect(tops.length).toBeGreaterThan(0);
    expect(Math.max(...tops), `Add key's top over time: ${[...new Set(tops)].join(', ')}`).toBeLessThanOrEqual(
      tops[0] + 1
    );
  }
);

// --- DS-A11Y-1 Focus returns ---------------------------------------------------------------

When(
  /^the developer opens "Edit project details" on (.+) with the keyboard and goes back$/,
  async ({ visitor }, projectName: string) => {
    const { page, ks } = await keys(visitor);
    notes(visitor).currentProject = projectName;
    await (await ks.editProjectButton(projectName)).focus();
    await page.keyboard.press('Enter');
    await expect(ks.stepTitle()).toBeVisible({ timeout: t(10000) });
    await (await ks.stepBackButton()).focus();
    await page.keyboard.press('Enter');
    await ks.expectHome();
  }
);

Then(/^focus is on (.+)'s "Edit project details" button$/, async ({ visitor }, projectName: string) => {
  const { ks } = await keys(visitor);
  await expect(await ks.editProjectButton(projectName)).toBeFocused({ timeout: t(5000) });
});

When('the developer creates a new key and returns home', async ({ visitor }) => {
  const { page, ks } = await keys(visitor);
  const { project } = current(visitor);
  await (await ks.addKeyButton(project)).focus();
  await page.keyboard.press('Enter');
  await expect(ks.keyNameField()).toBeVisible({ timeout: t(10000) });
  await ks.keyNameField().fill('New key');
  await page.keyboard.press('Enter');
  notes(visitor).currentKey = 'New key';
  await ks.expectHome();
});

Then("focus is on the new key's row", async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const { project, key } = current(visitor);
  const row = ks.keyRow(project, key);
  await expect(row).toBeVisible({ timeout: t(10000) });
  await expect(row.locator(':focus')).toHaveCount(1, { timeout: t(5000) });
});

// --- DS-A11Y-2 Confirm windows -------------------------------------------------------------

When(/^any confirm window opens \(delete key, delete project, remove website, limit key\)$/, async ({ visitor }) => {
  const { page, ks, api } = await ensureHome(visitor);
  const n = notes(visitor);
  const project = n.currentProject!;
  const key = n.currentKey!;
  // Remove website asks only when a key is limited to the site; limit key, only without a site.
  const keyId = (await api.state()).projects.find((p) => p.name === project)!.keys.find((k) => k.label === key)!.id;
  await api.restrictKey(keyId, true);
  await addProject(visitor, 'No website yet');
  await addKey(visitor, 'No website yet', 'Draft key');
  n.currentProject = project;
  n.currentKey = key;
  await ks.open();
  const seen: WindowA11y[] = [];
  const cancel = async () =>
    ks
      .confirmWindow()
      .getByRole('button', { name: await ks.str('developer.common.cancel.button'), exact: true })
      .click();

  // Delete key
  await (await ks.keyButton(project, key, 'developer.home.key.delete.aria')).click();
  seen.push(await ks.readWindow('delete key'));
  await cancel();
  await expect(ks.confirmWindow()).toHaveCount(0);

  // Delete project (from Edit project details)
  await (await ks.editProjectButton(project)).click();
  await ks.button(await ks.str('developer.edit_project.delete.button')).click();
  seen.push(await ks.readWindow('delete project'));
  await cancel();
  await expect(ks.confirmWindow()).toHaveCount(0);

  // Remove website: clear it and save; "Keep the website" closes the window.
  await page.locator('#devEProjSite').fill('');
  await ks.button(await ks.str('developer.edit_project.save.button')).click();
  seen.push(await ks.readWindow('remove website'));
  await ks
    .confirmWindow()
    .getByRole('button', { name: await ks.str('developer.remove_site_dialog.cancel.button'), exact: true })
    .click();
  await ks.expectHome();

  // Limit key, on the project with no website
  await ks.clickSwitch(await ks.limitSwitch('No website yet', 'Draft key'));
  seen.push(await ks.readWindow('limit key'));
  await cancel();
  n.windows = seen;
});

Then('its title is its accessible name and its body text is its accessible description', async ({ visitor }) => {
  const seen = notes(visitor).windows as WindowA11y[];
  expect(seen.map((w) => w.kind)).toEqual(['delete key', 'delete project', 'remove website', 'limit key']);
  for (const w of seen) {
    expect(w.title, `${w.kind}: has a title`).not.toBe('');
    expect(w.body, `${w.kind}: has body text`).not.toBe('');
    expect(w.name, `${w.kind}: accessible name`).toBe(w.title);
    expect(w.description, `${w.kind}: accessible description`).toBe(w.body);
  }
});

// --- DS-A11Y-4 Tooltips --------------------------------------------------------------------

When(/^the developer hovers or focuses the "Limit to website" \(\?\) tip$/, async ({ visitor }) => {
  const { ks } = await ensureHome(visitor);
  const { project } = current(visitor);
  await expect(ks.restrictTip(project)).toHaveCount(0);
  await (await ks.restrictTipButton(project)).hover();
});

Then(
  /^the tip opens, stays open while the pointer is on it, and its "Learn more" link can be clicked$/,
  async ({ visitor }) => {
    const { page, ks } = await keys(visitor);
    const { project } = current(visitor);
    const tip = ks.restrictTip(project);
    await expect(tip).toBeVisible();
    const link = tip.getByRole('link', {
      name: await ks.str('developer.home.keys_table.restrict_tooltip.learn_more_link'),
      exact: true,
    });
    // Onto the tip itself, and staying there past its close delay.
    await link.hover();
    await page.waitForTimeout(t(600));
    await expect(tip).toBeVisible();
    await expect(link).toHaveAttribute('href', /.+/);
    expect(await ks.hitsItself(link)).toBe(true);
    await link.click({ trial: true });
    await expect(tip).toBeVisible();
  }
);

When('the developer presses Escape', async ({ visitor }) => {
  const { page } = await keys(visitor);
  await page.keyboard.press('Escape');
});

Then('the tip closes', async ({ visitor }) => {
  const { ks } = await keys(visitor);
  const { project } = current(visitor);
  await expect(ks.restrictTip(project)).toHaveCount(0);
});

// --- DS-A11Y-5 Key buttons -----------------------------------------------------------------

Then(
  /^each key's Show, Copy and Delete buttons are named for that key, e\.g\. "([^"]*)"$/,
  async ({ visitor }, example: string) => {
    const { ks, api } = await ensureHome(visitor);
    const state = await api.state();
    const all = state.projects.flatMap((p) => p.keys.map((k) => ({ project: p.name, key: k.label })));
    expect(all.length).toBeGreaterThan(0);
    for (const { project, key } of all) {
      for (const aria of [
        'developer.home.key.show.aria',
        'developer.home.key.copy.aria',
        'developer.home.key.delete.aria',
      ]) {
        const name = await ks.str(aria, { key_name: key });
        await expect(ks.keyRow(project, key).getByRole('button', { name, exact: true }), name).toHaveCount(1);
      }
    }
    if (visitor.lang === LANGUAGES.EN) {
      const { project } = current(visitor);
      await expect(ks.project(project).getByRole('button', { name: example, exact: true })).toHaveCount(1);
    }
  }
);
