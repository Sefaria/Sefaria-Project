import { expect, Locator, Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import { t } from '../../globals';
import { CapturedRequest, HttpMethod, RecentRequestRow, RecordedResponse, RequestCapture } from './developersCommon';

/** The API origin Try It calls directly from the browser (DEVPORTAL_API_ORIGIN). */
const API_REQUESTS = /^https:\/\/www\.sefaria\.org\/api\//;

/** CORS headers a recorded response needs so the browser hands it to the page. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*',
};

/**
 * Try It on an endpoint page (DEV-TRY; PLAN §6.2 E): running the request, the response card
 * after a run, the Headers modal and Recent Requests. Fill parameters with
 * DevelopersReferencePage first.
 */
export class DevelopersTryItPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ---- Network control --------------------------------------------------------------------

  /**
   * Answer every Try It call to the API with a recorded response (PLAN §6.1.2), optionally
   * after a delay so the loading state is observable. Nothing reaches the API. A CORS preflight
   * is answered without being recorded.
   */
  async fulfillApiWith(response: RecordedResponse): Promise<RequestCapture> {
    const capture: { requests: CapturedRequest[] } = { requests: [] };
    await this.page.route(API_REQUESTS, async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS, body: '' });
      capture.requests.push({
        url: request.url(),
        method: request.method(),
        headers: await request.allHeaders(),
        body: request.postData(),
      });
      if (response.delayMs) await new Promise((resolve) => setTimeout(resolve, response.delayMs));
      await route.fulfill({
        status: response.status,
        headers: { ...CORS, 'content-type': 'application/json', ...response.headers },
        body: response.body,
      });
    });
    return capture;
  }

  /** Make every Try It call fail without a response (network error, CORS). Added by W14. */
  async failApiRequests(): Promise<void> {
    await this.page.route(API_REQUESTS, (route) => route.abort('failed'));
  }

  /** Record (without changing) every request the page sends to the API, with all its headers. */
  async watchApiRequests(): Promise<RequestCapture> {
    const capture: { requests: CapturedRequest[] } = { requests: [] };
    this.page.on('request', (request) => {
      if (!API_REQUESTS.test(request.url())) return;
      const entry: CapturedRequest = {
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        body: request.postData(),
      };
      capture.requests.push(entry);
      request
        .allHeaders()
        .then((headers) => (entry.headers = headers))
        .catch(() => {});
    });
    return capture;
  }

  // ---- Locators ---------------------------------------------------------------------------

  private get playground() {
    return this.page.locator('#ReferencePlayground');
  }

  private get tryItButton() {
    return this.playground.getByRole('button', { name: 'Try It!' });
  }

  private get responseCard() {
    return this.playground.getByRole('region', { name: 'Response', exact: true });
  }

  private get statusButton() {
    return this.responseCard
      .locator('button[aria-haspopup]')
      .filter({ has: this.page.getByRole('img') })
      .first();
  }

  private get responseBody() {
    return this.responseCard.locator('pre[aria-label="Response body"]');
  }

  private get headersDialog() {
    return this.page.getByRole('dialog', { name: 'Headers' });
  }

  private get recentRows() {
    return this.page
      .locator('article#content table tbody tr')
      .filter({ has: this.page.locator('button[aria-pressed]') });
  }

  private static async definitions(list: Locator): Promise<Record<string, string>> {
    return list.evaluate((dl) => {
      const out: Record<string, string> = {};
      for (const row of Array.from(dl.querySelectorAll('dt'))) {
        out[(row.textContent ?? '').trim().toLowerCase()] = (row.nextElementSibling?.textContent ?? '').trim();
      }
      return out;
    });
  }

  // ---- Running ----------------------------------------------------------------------------

  /** Click "Try It!" (the button is enabled even with required fields empty). */
  async clickTryIt(): Promise<void> {
    // Right after a navigation the client may replace the server-rendered button once; retry the click.
    await expect(async () => {
      await this.tryItButton.scrollIntoViewIfNeeded({ timeout: t(3000) });
      await this.tryItButton.click({ timeout: t(3000) });
    }).toPass({ timeout: t(15000) });
  }

  async isLoading(): Promise<boolean> {
    return this.responseCard.getByRole('progressbar', { name: 'Loading…' }).isVisible();
  }

  /** Wait until the response card shows a result. */
  async waitForResult(): Promise<void> {
    await expect(this.responseCard.getByRole('progressbar')).toHaveCount(0, { timeout: t(30000) });
    await expect(this.statusButton.or(this.responseCard.getByRole('img').first()).first()).toBeVisible({
      timeout: t(30000),
    });
  }

  /** Background colours of the button at rest and on hover. */
  async tryItButtonColors(): Promise<{ normal: string; hover: string }> {
    await this.tryItButton.scrollIntoViewIfNeeded({ timeout: t(10000) });
    await this.page.mouse.move(0, 0);
    const color = () => this.tryItButton.evaluate((el) => getComputedStyle(el).backgroundColor);
    const normal = await color();
    await this.tryItButton.hover();
    await expect.poll(color, { timeout: t(5000) }).not.toBe(normal);
    return { normal, hover: await color() };
  }

  // ---- Response card after a run ----------------------------------------------------------

  /** The status code and the colour of its dot (role="img", aria-label = the code). */
  async responseStatus(): Promise<{ code: number; dotColor: string }> {
    const dot = this.responseCard.getByRole('img').first();
    await expect(dot).toBeVisible({ timeout: t(15000) });
    return {
      code: Number(await dot.getAttribute('aria-label')),
      dotColor: await dot.evaluate((el) => getComputedStyle(el).backgroundColor),
    };
  }

  /** The response body as displayed (without line numbers). */
  async responseBodyText(): Promise<string> {
    const pre = this.responseBody.or(this.responseCard.locator('pre')).first();
    await expect(pre).toBeVisible({ timeout: t(15000) });
    return pre.evaluate((el) => {
      const rows = Array.from(el.querySelectorAll('[class*="__content"]'));
      if (rows.length === 0) return el.textContent ?? '';
      return rows.map((r) => r.textContent ?? '').join('\n');
    });
  }

  async hasLineNumbers(): Promise<boolean> {
    await expect(this.responseBody).toBeVisible({ timeout: t(15000) });
    return this.responseBody.evaluate((el) => {
      const numbers = Array.from(el.querySelectorAll('[class*="__number"]'));
      return numbers.length > 0 && (numbers[0].textContent ?? '').trim() === '1';
    });
  }

  async hasFoldMarkers(): Promise<boolean> {
    return (await this.responseCard.getByRole('button', { name: /^(Fold|Unfold) lines / }).count()) > 0;
  }

  /** True if any elapsed-time display is present (it must not be). */
  async hasElapsedTime(): Promise<boolean> {
    await expect(this.responseCard).toBeVisible({ timeout: t(10000) });
    const header = await this.responseCard.locator('header').first().innerText();
    return /\b\d+(\.\d+)?\s?(ms|s)\b/.test(header);
  }

  /** Open the status dropdown; returns its entries (examples, then "Clear Response"). */
  async openStatusMenu(): Promise<string[]> {
    await this.statusButton.click();
    const items = this.page.getByRole('menu', { name: 'Response examples' }).getByRole('menuitem');
    await expect(items.first()).toBeVisible({ timeout: t(5000) });
    return (await items.allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
  }

  async clearResponse(): Promise<void> {
    const menu = this.page.getByRole('menu', { name: 'Response examples' });
    if (!(await menu.isVisible())) await this.statusButton.click();
    await menu.getByRole('menuitem', { name: 'Clear Response' }).click();
    await expect(menu).toBeHidden({ timeout: t(5000) });
  }

  /** Click the response copy button; returns its label afterwards. */
  async copyResponse(): Promise<string> {
    await this.page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'])
      .catch(() => undefined);
    const button = this.responseCard.getByRole('button', { name: 'Copy to clipboard' });
    await button.click();
    const status = button.getByRole('status');
    await expect(status).toBeVisible({ timeout: t(5000) });
    return (await status.innerText()).trim();
  }

  /** The screen-reader announcement after a run (C6 ResponseLiveRegion, e.g. "Response 200"). Added by W14. */
  async liveRegionText(): Promise<string> {
    return ((await this.responseCard.locator('[aria-live="polite"]').textContent()) ?? '').trim();
  }

  // ---- Headers modal ----------------------------------------------------------------------

  /** Open "Headers"; returns the RESPONSE and REQUEST sections as name → value. */
  async openHeadersModal(): Promise<{ response: Record<string, string>; request: Record<string, string> }> {
    await this.responseCard.getByRole('button', { name: 'Headers' }).click();
    await expect(this.headersDialog).toBeVisible({ timeout: t(5000) });
    const response = this.headersDialog
      .getByRole('heading', { name: 'Response', exact: true })
      .locator('xpath=following-sibling::dl[1]');
    const request = this.headersDialog
      .getByRole('heading', { name: 'Request', exact: true })
      .locator('xpath=following-sibling::dl[1]');
    return {
      response: await DevelopersTryItPage.definitions(response),
      request: await DevelopersTryItPage.definitions(request),
    };
  }

  async closeHeadersModal(): Promise<void> {
    await this.headersDialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(this.headersDialog).toBeHidden({ timeout: t(5000) });
  }

  /** True while the Headers modal is open. Added by W14. */
  async isHeadersModalOpen(): Promise<boolean> {
    return this.headersDialog.isVisible();
  }

  // ---- Recent Requests --------------------------------------------------------------------

  /** Rows, newest first; [] when the list is empty. */
  async recentRequests(): Promise<RecentRequestRow[]> {
    await expect(this.page.getByRole('heading', { name: 'Recent Requests' })).toBeVisible({ timeout: t(10000) });
    const method = ((await this.page.locator('article#content').getByTestId('http-method').first().textContent()) ?? '')
      .trim()
      .toUpperCase() as HttpMethod;
    const path = (
      (await this.page.locator('article#content').getByTestId('serverurl').getAttribute('title')) ?? ''
    ).replace(/^https?:\/\/[^/]+/, '');
    const rows = await this.recentRows.evaluateAll((trs) =>
      trs.map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td'));
        const status = (cells[1]?.textContent ?? '').trim();
        return {
          status: status === 'Error' ? 0 : Number(status),
          when: (cells[0]?.textContent ?? '').trim(),
          selected: tr.querySelector('button[aria-pressed]')?.getAttribute('aria-pressed') === 'true',
        };
      })
    );
    return rows.map((row) => ({ method, path, ...row }));
  }

  async selectRecentRequest(index: number): Promise<void> {
    const button = this.recentRows.nth(index).locator('button[aria-pressed]');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: t(5000) });
  }
}
