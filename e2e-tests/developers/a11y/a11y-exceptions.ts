// Registered accessibility exceptions (PLAN §6.6: "with any exception listed in the suite's README with
// its reason"). The product rule is "live wins": where live developers.sefaria.org has the same issue, the
// portal matches live and the issue is recorded here, and in README.md "Exceptions", for the product owner
// and designer instead of being changed. Only the Integrator adds entries; each one is a single (axe rule,
// element) pair, never a whole rule or a whole element, so any other violation on the same element, or the
// same rule on any other element, still fails.

/** One registered axe exception. */
export type A11yException = {
  /** Stable id, listed in README.md "Exceptions". */
  id: string;
  /** The axe rule id the exception covers (only this rule). */
  rule: string;
  /** Matches the axe node target (selector parts joined with a space) of exactly the excepted element. */
  target: RegExp;
  /** URL pathnames the exception applies on; omitted means every page (the element is in the header). */
  paths?: RegExp[];
  /** Why it is accepted. */
  reason: string;
  /** Where the portal's style comes from, and the live evidence. */
  source: string;
};

const LIVE_WINS = 'live wins; listed for the designer';

export const REGISTERED_EXCEPTIONS: readonly A11yException[] = [
  {
    id: 'EXC-01-header-kbd',
    rule: 'color-contrast',
    // axe names the element `kbd` when it is the document's only <kbd> (axe checks uniqueness over the
    // whole document, hidden elements included, and the header always renders this one), and by its
    // CSS-module class when the page has other <kbd> elements (the reference pages).
    target: /^(?:kbd|\.dp-PortalHeader-module__searchKbd--[\w-]+)$/,
    reason: `${LIVE_WINS}. Header search key hint "CTRL-K": #666b79 at opacity 0.6 (axe: #a3a6af) on white, 2.43:1.`,
    source: 'W2 PortalHeader (.searchKbd); live header search kbd computed colour #666b79, opacity 0.6',
  },
  {
    id: 'EXC-02-mobile-subnav-label',
    rule: 'color-contrast',
    target: /^\.dp-PortalHeader-module__subnavLabel--[\w-]+$/,
    reason: `${LIVE_WINS}. Mobile sub-nav label: rgb(72,76,88) (#484c58) on the 10% black tint over the purple header, 1.39:1.`,
    source: 'W2 PortalHeader (.subnavLabel); live mobile sub-nav label computed colour rgb(72,76,88)',
  },
  {
    id: 'EXC-03-reference-enum-select',
    rule: 'color-contrast',
    // The enum selects that show their default/placeholder on the endpoints this suite opens.
    target: /^#(?:query-getV3Texts_return_format|body-postFindRefs_lang)$/,
    paths: [/^\/reference\//],
    reason: `${LIVE_WINS}. Reference enum select default/placeholder text: #9499a6 on white, 2.85:1.`,
    source: 'W3 reference Article (.select, data-visual="paramSelect"); live select placeholder colour #9499a6',
  },
  {
    id: 'EXC-04-reference-line-numbers',
    rule: 'color-contrast',
    target:
      /^\.dp-CodeView-module__row--[\w-]+:nth-child\(\d+\) > \.dp-CodeView-module__number--[\w-]+\[aria-hidden="true"\]$/,
    paths: [/^\/reference\//],
    reason: `${LIVE_WINS}. Reference code sample / response line numbers (aria-hidden): #e0e2e5 on white, 1.29:1.`,
    source: 'W3 CodeView (.number); live response line-number colour #e0e2e5',
  },
  {
    id: 'EXC-05-reference-clear-example',
    rule: 'color-contrast',
    target: /^\.dp-Playground-module__clearItem--[\w-]+$/,
    paths: [/^\/reference\//],
    reason: `${LIVE_WINS}. Response-example menu "Clear Example": #e95f6a on white, 3.32:1.`,
    source: 'W3 Playground (.clearItem); live "Clear Example" colour #e95f6a',
  },
];

/**
 * DEV-A11Y-040: the number of h1 elements allowed per path. Live has two on these pages (the page-header
 * title plus the body's own top heading), so the portal matches; every other page must have exactly one.
 */
export const ALLOWED_H1_COUNT: Readonly<Record<string, number>> = {
  '/docs/welcome': 2,
  // Not /reference/get-v3-texts: live's second h1 there is the response-schema toggle wrapped in an h1, the
  // ReadMe bug the brief (§4.3) says to fix, so the portal has one h1 on endpoint pages.
};
export const DEFAULT_H1_COUNT = 1;

type Violation = { id: string; impact: string | null; help: string; targets: string[] };

function decodePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/** The registered exceptions that apply to a node (rule + target) on the page at `url`. */
export function matchingException(rule: string, target: string, url: string): A11yException | undefined {
  const path = decodePath(new URL(url).pathname);
  return REGISTERED_EXCEPTIONS.find(
    (e) => e.rule === rule && e.target.test(target) && (!e.paths || e.paths.some((p) => p.test(path)))
  );
}

/**
 * Removes the registered (rule, node) pairs from axe's violations. A violation keeps every node no exception
 * covers and is dropped only when none is left.
 */
export function withoutRegisteredExceptions<V extends Violation>(violations: V[], url: string): V[] {
  return violations
    .map((v) => ({ ...v, targets: v.targets.filter((target) => !matchingException(v.id, target, url)) }))
    .filter((v) => v.targets.length > 0);
}
