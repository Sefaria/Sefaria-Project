import { Locator, Page, Response, expect } from "@playwright/test";
import { HelperBase } from "./helperBase";
import { t } from "../globals";

/**
 * Developer settings (/settings/developer): onboarding, profile, projects and keys.
 * Selectors prefer the `data-agent-action` attributes SettingsPage.jsx sets for agents, which do not
 * change with the interface language; ids and roles otherwise. Scope project and key actions to
 * their card, because the edit and new-project forms can share input ids.
 */
export class DeveloperSettingsPage extends HelperBase {
    constructor(page: Page, language: string) {
        super(page, language);
    }

    static readonly PATH = '/settings/developer';

    action(name: string, within: Page | Locator = this.page): Locator {
        return within.locator(`[data-agent-action="${name}"]`);
    }

    async goto(path: string = DeveloperSettingsPage.PATH) {
        await this.page.goto(path, { waitUntil: 'domcontentloaded' });
        await this.page.waitForFunction(() => !!(window as any).Sefaria, null, { timeout: t(45000) });
    }

    settingsNav(): Locator {
        return this.page.locator('nav.settingsNav').first();
    }

    accountTabLink(): Locator {
        return this.action('open-account-settings');
    }

    developerTabLink(): Locator {
        return this.action('open-developer-settings');
    }

    /** Waits for the matching /api/developer/<path> response a click provokes. */
    waitForApi(path: string | RegExp, method = 'POST'): Promise<Response> {
        const matcher = typeof path === 'string' ? new RegExp(`/api/developer/${path}$`) : path;
        return this.page.waitForResponse(r => r.request().method() === method && matcher.test(new URL(r.url()).pathname), { timeout: t(30000) });
    }

    // Onboarding

    async clickGetStarted() {
        await this.action('get-started').click();
    }

    confirmEmailRegion(): Locator {
        return this.page.getByRole('region', { name: /Confirm your (new )?email/ });
    }

    async sendConfirmation(): Promise<Response> {
        const response = this.waitForApi('confirmation');
        await this.action('send-confirmation').click();
        return response;
    }

    async resendConfirmation(): Promise<Response> {
        const response = this.waitForApi('confirmation');
        await this.action('resend-confirmation').click();
        return response;
    }

    // Profile ("About you")

    onboardingCard(): Locator {
        return this.page.locator('.devPocOnboarding');
    }

    async fillProfile({ name, description, additionalEmail, acceptTerms = true }:
        { name?: string; description?: string; additionalEmail?: string; acceptTerms?: boolean }) {
        const nameField = this.page.locator('#devPocName');
        if (name !== undefined && await nameField.isEditable()) await nameField.fill(name);
        if (additionalEmail !== undefined) await this.page.locator('#devPocEmail2').fill(additionalEmail);
        if (description !== undefined) await this.page.locator('#devPocDescription').fill(description);
        if (acceptTerms) {
            const terms = this.page.getByRole('checkbox', { name: /I accept the Sefaria API terms/ });
            if (await terms.count()) await terms.check();
        }
    }

    async saveProfile(): Promise<Response> {
        const response = this.waitForApi('profile');
        await this.action('save-profile').click();
        return response;
    }

    // Listings ("Is this your project?")

    listingDialog(): Locator {
        return this.page.locator('[role="dialog"][aria-labelledby="devPocYourListingTitle"]');
    }

    // Projects

    newProjectButton(): Locator {
        return this.action('new-project');
    }

    newProjectPanel(): Locator {
        return this.page.locator('section.devPocNewProject');
    }

    async fillNewProject({ name, description, organization, website, visibility, aiAssisted }:
        { name: string; description: string; organization?: string; website?: string; visibility: 'public' | 'private'; aiAssisted?: boolean }) {
        const panel = this.newProjectPanel();
        await panel.locator('#devPocProjectName').fill(name);
        await panel.locator('#devPocProjectDescription').fill(description);
        if (organization !== undefined) await panel.locator('#devPocProjectOrg').fill(organization);
        if (website !== undefined) await panel.locator('#devPocProjectUrl').fill(website);
        if (aiAssisted) await panel.locator('#devPocAiAssisted').check();
        await panel.locator(visibility === 'public' ? '#devPocVisibilityPublic' : '#devPocVisibilityPrivate').check();
    }

    /** Submits the new-project panel, confirming "Save without a website?" when it appears. */
    async createProject({ withoutWebsite = false }: { withoutWebsite?: boolean } = {}): Promise<Response> {
        const response = this.waitForApi('projects');
        await this.action('create-project', this.newProjectPanel()).click();
        if (withoutWebsite) await this.action('save-without-website').click();
        return response;
    }

    projectCards(): Locator {
        return this.page.locator('article.devPocProject');
    }

    projectCard(name: string | RegExp): Locator {
        return this.projectCards().filter({ has: this.page.locator('button.devPocProjectToggle', { hasText: name }) });
    }

    async expandProject(name: string | RegExp) {
        const toggle = this.projectCard(name).locator('button.devPocProjectToggle');
        if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: t(10000) });
    }

    // Keys

    keyRows(project: Locator): Locator {
        return project.locator('article.devPocKey');
    }

    keyRow(project: Locator, label: string | RegExp): Locator {
        return this.keyRows(project).filter({ hasText: label });
    }

    /** Creates a key; the UI holds a progress state for at least four seconds. */
    async createKey(project: Locator, label: string): Promise<Response> {
        await this.action('new-key', project).click();
        await project.locator('#devPocKeyLabel').fill(label);
        const response = this.waitForApi(/\/api\/developer\/projects\/\d+\/keys$/);
        await this.action('create-key', project).click();
        const result = await response;
        await expect(project.locator('article.devPocKey.devPocKeyNew')).toBeVisible({ timeout: t(20000) });
        return result;
    }

    async deleteKey(project: Locator, label: string | RegExp): Promise<Response> {
        await this.keyRow(project, label).getByRole('button', { name: /Delete key|מחיקת המפתח/ }).click();
        const response = this.waitForApi(/\/api\/developer\/keys\/\d+$/, 'DELETE');
        await this.page.getByRole('dialog').getByRole('button', { name: /Delete key|מחיקת המפתח/ }).click();
        return response;
    }

    restrictionSwitch(project: Locator, label: string): Locator {
        return project.getByRole('checkbox', { name: new RegExp(`^Only accept requests from .+ \\(${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)$`) });
    }

    // Test controls (DEVELOPER_SETTINGS_MOCKS only)

    testControls(): Locator {
        return this.page.locator('.devPocPanel');
    }

    async collapseTestControls() {
        const hide = this.page.getByRole('button', { name: 'Collapse test controls' });
        if (await hide.isVisible()) await hide.click();
    }
}
