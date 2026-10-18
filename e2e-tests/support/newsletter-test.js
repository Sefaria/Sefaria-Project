import { test as base, expect } from '@playwright/test';

/**
 * `test` for the newsletter specs: fails any test whose /api/newsletter/** request
 * would reach the real server.
 *
 * Why: those endpoints read and change real subscriptions in ActiveCampaign. A spec
 * that forgets to stub them doesn't fail on its own. The request simply goes through
 * (or gets aborted), and a loose assertion still passes. That's how the responsive
 * spec subscribed john@example.com to a real list on every run.
 *
 * How: before each test, a route for /api/newsletter/** is added to the browser
 * context. It's added first, so it has the lowest priority (Playwright tries the most
 * recently added route first). HAR replays (support/har-fixture.js) and page.route
 * stubs, which specs add later, answer their requests before this route sees them.
 * Only a request nobody answered reaches it. It blocks that request and the test
 * fails, naming the request.
 *
 * Use it in every newsletter spec instead of @playwright/test:
 *   import { test, expect } from '../support/newsletter-test.js';
 *
 * While recording a HAR (RECORD_HAR=1), requests must reach the server, so the guard
 * is off.
 */
// Browser contexts that have the guard. support/har-fixture.js only lets unrecorded
// requests fall back past the HAR when the guard is there to catch them; otherwise it
// aborts them itself, so they still can't reach the real server.
export const guardedContexts = new WeakSet();

export const test = base.extend({
  newsletterApiGuard: [
    async ({ context }, use) => {
      if (process.env.RECORD_HAR === '1') {
        await use();
        return;
      }
      const unanswered = [];
      await context.route('**/api/newsletter/**', (route) => {
        const request = route.request();
        unanswered.push(`${request.method()} ${new URL(request.url()).pathname}`);
        return route.abort('blockedbyclient');
      });
      guardedContexts.add(context);
      await use();
      if (unanswered.length > 0) {
        throw new Error(
          'Newsletter API calls were not stubbed or replayed, so they would have reached ' +
            `the real server (and ActiveCampaign): ${unanswered.join(', ')}. ` +
            'Stub them with page.route or replay them with routeWithHarFixture.'
        );
      }
    },
    { auto: true },
  ],
});

export { expect };
