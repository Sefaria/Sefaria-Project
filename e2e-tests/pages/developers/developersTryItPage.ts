import { Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import {
  CapturedRequest,
  RecentRequestRow,
  RecordedResponse,
  RequestCapture,
  notImplemented,
} from './developersCommon';

/** The API origin Try It calls directly from the browser (DEVPORTAL_API_ORIGIN). */
const API_REQUESTS = /^https:\/\/www\.sefaria\.org\/api\//;

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
   * after a delay so the loading state is observable. Nothing reaches the API.
   */
  async fulfillApiWith(response: RecordedResponse): Promise<RequestCapture> {
    const capture: { requests: CapturedRequest[] } = { requests: [] };
    await this.page.route(API_REQUESTS, async (route) => {
      const request = route.request();
      capture.requests.push({
        url: request.url(),
        method: request.method(),
        headers: await request.allHeaders(),
        body: request.postData(),
      });
      if (response.delayMs) await new Promise((resolve) => setTimeout(resolve, response.delayMs));
      await route.fulfill({
        status: response.status,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json', ...response.headers },
        body: response.body,
      });
    });
    return capture;
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

  // ---- Running ----------------------------------------------------------------------------

  /** Click "Try It!" (the button is enabled even with required fields empty). */
  async clickTryIt(): Promise<void> {
    return notImplemented('DevelopersTryItPage.clickTryIt');
  }

  async isLoading(): Promise<boolean> {
    return notImplemented('DevelopersTryItPage.isLoading');
  }

  /** Wait until the response card shows a result. */
  async waitForResult(): Promise<void> {
    return notImplemented('DevelopersTryItPage.waitForResult');
  }

  /** Background colours of the button at rest and on hover. */
  async tryItButtonColors(): Promise<{ normal: string; hover: string }> {
    return notImplemented('DevelopersTryItPage.tryItButtonColors');
  }

  // ---- Response card after a run ----------------------------------------------------------

  /** The status code and the colour of its dot (role="img", aria-label = the code). */
  async responseStatus(): Promise<{ code: number; dotColor: string }> {
    return notImplemented('DevelopersTryItPage.responseStatus');
  }

  /** The response body as displayed (without line numbers). */
  async responseBodyText(): Promise<string> {
    return notImplemented('DevelopersTryItPage.responseBodyText');
  }

  async hasLineNumbers(): Promise<boolean> {
    return notImplemented('DevelopersTryItPage.hasLineNumbers');
  }

  async hasFoldMarkers(): Promise<boolean> {
    return notImplemented('DevelopersTryItPage.hasFoldMarkers');
  }

  /** True if any elapsed-time display is present (it must not be). */
  async hasElapsedTime(): Promise<boolean> {
    return notImplemented('DevelopersTryItPage.hasElapsedTime');
  }

  /** Open the status dropdown; returns its entries (examples, then "Clear Response"). */
  async openStatusMenu(): Promise<string[]> {
    return notImplemented('DevelopersTryItPage.openStatusMenu');
  }

  async clearResponse(): Promise<void> {
    return notImplemented('DevelopersTryItPage.clearResponse');
  }

  /** Click the response copy button; returns its label afterwards. */
  async copyResponse(): Promise<string> {
    return notImplemented('DevelopersTryItPage.copyResponse');
  }

  // ---- Headers modal ----------------------------------------------------------------------

  /** Open "Headers"; returns the RESPONSE and REQUEST sections as name → value. */
  async openHeadersModal(): Promise<{ response: Record<string, string>; request: Record<string, string> }> {
    return notImplemented('DevelopersTryItPage.openHeadersModal');
  }

  async closeHeadersModal(): Promise<void> {
    return notImplemented('DevelopersTryItPage.closeHeadersModal');
  }

  // ---- Recent Requests --------------------------------------------------------------------

  /** Rows, newest first; [] when the list is empty. */
  async recentRequests(): Promise<RecentRequestRow[]> {
    return notImplemented('DevelopersTryItPage.recentRequests');
  }

  async selectRecentRequest(index: number): Promise<void> {
    return notImplemented('DevelopersTryItPage.selectRecentRequest');
  }
}
