// Visual-parity hooks inside the article body (e2e-tests/developers-visual/README.md, "Local-side contract"):
// the harness measures `[data-visual="<key>"]` and frames states on `[data-visual-region="<id>"]`. The body is
// server-rendered Markdown, so the hooks are added here, on the first element of each kind, the one live's
// selector finds first (e2e-tests/developers-visual/mapped-elements.ts and regions.ts). Attributes only: nothing
// moves or changes colour.

/** Mapped elements (gates 1 and 2): key → selector inside the body. */
const MAPPED: readonly (readonly [key: string, selector: string])[] = [
  ['docP', ':scope > p'],
  ['docH2', 'h2'],
  ['docCode', 'pre code'],
  ['docCodeTabs', '.dp-codetabs'],
  ['docCallout', '.dp-callout'],
  ['docTable', '.dp-table table'],
];

/** Regions and framing anchors: id → selector inside the body. */
const REGIONS: readonly (readonly [id: string, selector: string])[] = [
  ['callout', '.dp-callout'],
  ['codeTabs', '.dp-codetabs'],
  ['table', '.dp-table'],
  ['lightboxImage', 'img'],
  ['embed', '.dp-embed'],
  ['htmlBlock', '.dp-htmlblock'],
];

/**
 * Tags every element of each kind, as live's selectors match every one: the harness takes the first match with a
 * box, so an element that is not laid out yet (a lazy image below the fold) passes the hook to the next one, on
 * both sides. The page header's excerpt carries docBody and docP when the page has one; it comes first in the
 * document, as on live.
 */
export function tagVisualHooks(body: HTMLElement): void {
  for (const [key, selector] of MAPPED)
    body.querySelectorAll(selector).forEach((el) => {
      if (!el.hasAttribute('data-visual')) el.setAttribute('data-visual', key);
    });
  for (const [id, selector] of REGIONS)
    body.querySelectorAll(selector).forEach((el) => {
      if (!el.hasAttribute('data-visual-region')) el.setAttribute('data-visual-region', id);
    });
}
