import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { DOC_PAGES, enterBlank, stubExternalSites } from '../developers-entry';

// The contact page and the Formstack forms (brief §4.4; C6 ContactForm): the frame, its title, the
// submission-form links and the contact-page Discord button. Every request to Formstack is answered
// locally (interceptFormstack, installed before the page loads), so no form is loaded or submitted.
test.describe('Developers Forms, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterBlank(context));
  });

  async function openContact() {
    const capture = await pm.onDevelopersDocs().interceptFormstack();
    await pm.onDevelopersShell().openPath(DOC_PAGES.contact);
    return capture;
  }

  test('DEV-FORM-001: The contact page shows its title, its text and the Formstack frame', async () => {
    await openContact();
    expect(await pm.onDevelopersShell().pageTitle()).toBe('Contact Us');
    await expect(page).toHaveTitle('Contact Us');
    expect(await pm.onDevelopersDocs().formstackFrameSrc()).toMatch(/^https:\/\/sefaria\.formstack\.com\/forms\//);
  });

  test('DEV-FORM-002: The frame has an accessible title', async () => {
    await openContact();
    expect(await pm.onDevelopersDocs().formstackFrameTitle()).toBe('Developer contact form');
  });

  test("DEV-FORM-003: The frame's requests are answered locally; nothing reaches Formstack", async () => {
    const capture = await openContact();
    await expect.poll(() => capture.requests.length, { timeout: t(10000) }).toBeGreaterThan(0);
    for (const request of capture.requests) expect(request.url).toMatch(/formstack\.com/);
    expect(capture.requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  test('DEV-FORM-004: The project-submission link points at the Powered-by-Sefaria form', async () => {
    await openContact();
    const links = await pm.onDevelopersDocs().articleLinks();
    expect(links).toContainEqual({
      name: 'here',
      href: 'https://sefaria.formstack.com/forms/powered_by_sefaria_submission_form',
    });
  });

  test('DEV-FORM-005: The contact page carries "Join our Discord" below the form', async ({ context }) => {
    await openContact();
    const shell = pm.onDevelopersShell();
    const button = await shell.discordButton('contact_page');
    expect(button).toMatchObject({ name: 'Join our Discord', opensInNewTab: true });
    expect(button!.href).toMatch(/^https:\/\/sefaria\.formstack\.com\/forms\/sefaria_developer_discord_community/);
    await stubExternalSites(context, /formstack\.com/);
    const tab = await shell.clickDiscordButton('contact_page');
    await expect(tab).toHaveURL(/sefaria_developer_discord_community/);
    await tab.close();
  });

  test('DEV-FORM-006: The contact-page Discord click is reported with placement contact_page', async ({ context }) => {
    const shell = pm.onDevelopersShell();
    const ga = await shell.captureAnalytics();
    await openContact();
    await stubExternalSites(context, /formstack\.com/);
    const tab = await shell.clickDiscordButton('contact_page');
    await tab.close();
    await expect
      .poll(() => ga.events.filter((e) => e.name === 'discord_cta_click').map((e) => e.params.placement), {
        timeout: t(10000),
      })
      .toEqual(['contact_page']);
  });

  test('DEV-FORM-007: "Get in Touch" is the active tab on the contact page', async () => {
    await openContact();
    expect(await pm.onDevelopersShell().activeHeaderTab()).toBe('Get in Touch');
  });

  test('DEV-FORM-008: The "Contact us" links in the docs lead to the contact page', async () => {
    await pm.onDevelopersShell().openPath(DOC_PAGES.welcome);
    const contactLinks = (await pm.onDevelopersDocs().articleLinks()).filter((l) => l.href === DOC_PAGES.contact);
    expect(contactLinks.length).toBeGreaterThan(0);
  });

  test('DEV-FORM-009: The contact page answers with the CSP that allows only Formstack and YouTube frames', async () => {
    const { headers } = await pm.onDevelopersCopyPage().httpGet(DOC_PAGES.contact);
    const frameSrc = headers['content-security-policy']
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('frame-src'));
    expect(frameSrc).toBe("frame-src 'self' https://sefaria.formstack.com https://www.youtube-nocookie.com");
  });
});
