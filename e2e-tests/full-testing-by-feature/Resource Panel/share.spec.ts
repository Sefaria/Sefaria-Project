import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Share (RP-150 → RP-153).
 *
 * Mode anchor: `.shareBox, #sheetShareLink`. Reached from Resources by
 * clicking `data-name="Share"`. Source: ConnectionsPanel.jsx:1146 (ShareBox).
 *
 * Markup:
 *   <div class="shareInputBox">
 *     <button class="shareInputButton"><img class="copyLinkIcon" /></button>
 *     <input class="shareInput" id="sheetShareLink" value={url} />
 *   </div>
 *   <ToolsButton data-name="Share on Facebook" />
 *   <ToolsButton data-name="Share on X" />
 *   <ToolsButton data-name="Share by Email" />
 *
 * `copySheetLink()` uses `navigator.clipboard.writeText(copyText.value)` when
 * available, falling back to `document.execCommand('copy')`. RP-153 (fallback
 * test) is satisfied structurally — the JS code path exists for browsers
 * without Clipboard API. We verify the primary path works.
 */
test.describe('Resource Panel — Share — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().openShare();
  });

  test('RP-150: Share panel exposes copy-link input and social buttons', async () => {
    const state = await pm.onResourcePanel().getShareUIState();
    expect(state.hasShareInput).toBeTruthy();
    expect(state.hasCopyButton).toBeTruthy();
    expect(state.inputValue).toMatch(/Genesis/i); // current URL is reflected
    // All three social options should render.
    const dataNames = state.socialButtons;
    expect(dataNames.some((d) => /Facebook/i.test(d))).toBeTruthy();
    expect(dataNames.some((d) => /^X$|Share on X/.test(d))).toBeTruthy();
    expect(dataNames.some((d) => /Email/i.test(d))).toBeTruthy();
  });

  test('RP-151: Copy button writes the current URL to the clipboard', async () => {
    const { uiValue, clipboard } = await pm.onResourcePanel().copyShareLinkAndReadClipboard();
    expect(uiValue).toBeTruthy();
    expect(clipboard).toBe(uiValue);
  });

  test('RP-152: Social share buttons open the corresponding share URLs in new windows', async () => {
    // Facebook — sharer.php is reachable without auth, so the URL we capture
    // is the share endpoint directly.
    const fb = await pm.onResourcePanel().clickSocialShareAndCapture('Share on Facebook');
    expect(fb).not.toBeNull();
    await expect(fb!).toHaveURL(/facebook\.com\/(sharer\/sharer\.php|sharer\.php|dialog\/share)/, { timeout: t(15000) });
    // The Sefaria page URL must be present in the share endpoint (as `u=…`).
    // Match `sefaria` (case-insensitive) rather than `sefaria.org` literally
    // — sandboxes (sefariastaging.org, modularization.cauldron.sefaria.org)
    // don't have `.org` immediately after `sefaria`.
    expect(fb!.url()).toMatch(/sefaria/i);
    await fb!.close();

    // X (Twitter) — `twitter.com/share?url=…` redirects unauthenticated
    // visitors to `x.com/i/flow/login?redirect_after_login=…`. The Sefaria
    // URL is encoded into that `redirect_after_login` query param either
    // way. The contract we test: Sefaria passed the current page URL to X.
    const x = await pm.onResourcePanel().clickSocialShareAndCapture('Share on X');
    expect(x).not.toBeNull();
    const xUrl = x!.url();
    // Must land on Twitter/X (any subpath — share endpoint OR login flow).
    expect(xUrl).toMatch(/(twitter|x)\.com/);
    // Must carry the Sefaria URL through (decoded once unwraps the URL param;
    // a second decode unwraps the `redirect_after_login` nesting).
    const decoded = decodeURIComponent(decodeURIComponent(xUrl));
    // See note on line 64 — match `sefaria` (case-insensitive) to stay
    // sandbox-portable (sefariastaging.org, cauldron, etc.).
    expect(decoded).toMatch(/sefaria/i);
    await x!.close();
  });

  test('RP-153: The clipboard copy code-path falls back to execCommand when navigator.clipboard is missing', async () => {
    // Source (ConnectionsPanel.jsx:1193-1203):
    //   if (!navigator.clipboard) document.execCommand('copy');
    //   else navigator.clipboard.writeText(copyText.value);
    // We exercise the fallback path by null-ing `navigator.clipboard` and
    // spying on `document.execCommand`. The test passes if the fallback
    // branch fires *and* the click doesn't throw.
    const result = await page.evaluate(() => {
      // Spy on execCommand so we can prove the fallback ran.
      const calls: string[] = [];
      const orig = document.execCommand.bind(document);
      (document as any).execCommand = (cmd: string) => {
        calls.push(cmd);
        return orig(cmd);
      };
      // Remove clipboard so the React code's `if (!navigator.clipboard)`
      // branch is taken. `delete` on a non-configurable getter is a no-op,
      // so we override with `Object.defineProperty`.
      try {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      } catch {
        // ignore — clipboard may be non-configurable; fallback still tests
        // the execCommand spy below
      }
      const btn = document.querySelector('.shareInputButton') as HTMLElement | null;
      if (!btn) return { clicked: false, calls };
      try {
        btn.click();
      } catch (e) {
        return { clicked: true, errored: String(e), calls };
      }
      return { clicked: true, calls };
    });
    expect(result.clicked).toBeTruthy();
    // The fallback must have invoked execCommand('copy').
    expect(result.calls).toContain('copy');
  });
});
