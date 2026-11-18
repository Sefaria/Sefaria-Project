// Contract C5: the portal's breakpoints, measured on live (REFERENCE_SPEC.md §1.6; PLAN §3, Phase 2).
// CSS cannot read custom properties in media queries, so CSS writes these numbers literally and
// TypeScript (matchMedia) uses the constants below. Each query is the narrow side of its threshold.
export const BREAKPOINTS = {
  /** ≥1300: three columns, playground inner width 432. Below: inner width 448. */
  wide: 1300,
  /** ≥1066: the playground is a third column. ≤1065: it stacks below the article. */
  playgroundColumn: 1066,
  /** ≥769: desktop header and sidebar. ≤768: 103px mobile header, sidebar dropdown, no sidebar. */
  desktop: 769,
  /** ≤700: article padding becomes 32px 20px. */
  articlePadding: 700,
  /** ≤414: the sidebar dropdown panel is repositioned. */
  narrow: 414,
} as const;

export const MEDIA = {
  belowWide: '(max-width: 1299px)',
  stackedPlayground: '(max-width: 1065px)',
  mobile: '(max-width: 768px)',
  narrowArticle: '(max-width: 700px)',
  narrow: '(max-width: 414px)',
} as const;
