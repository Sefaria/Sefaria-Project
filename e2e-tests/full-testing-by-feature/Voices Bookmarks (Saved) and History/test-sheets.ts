/**
 * Public Voices sheets used by the Bookmarks/History suite.
 *
 * Every test owns a DISJOINT set of sheets so the suite stays safe at full
 * parallelism: the QA account's /saved list is shared server-side state across
 * workers, so two tests must never touch the same sheet. All ids were verified
 * `status: "public"` and HTTP 200 on `voices.sefaria.org/sheets/<id>` (2026-06-18).
 *
 * Titles/authors are the values the API annotates onto a saved item (which is
 * what /saved displays); kept here only for readable assertions.
 */
export const SHEETS = {
  // VBM-001 — bookmark from the sheet page
  create: { id: 1102, titleWord: 'Creation' },
  // VBM-002 — bookmark from a /history row
  history: { id: 5494, titleWord: 'Source Sheet' },
  // VBM-003 — icon state on load (one pre-saved, one not)
  iconSaved: { id: 124, titleWord: 'Time' },
  iconUnsaved: { id: 4304, titleWord: 'Purpose' },
  // VBM-004 — unbookmark from the sheet page
  removeFromSheet: { id: 1414, titleWord: 'Rest' },
  // VBM-005 — unbookmark from the /saved row's inline icon
  removeFromSaved: { id: 2692, titleWord: 'Peasch' },
  // VBM-006 — ordering (bookmarked A → B → C; expect C, B, A top→bottom)
  orderA: { id: 4365, titleWord: 'Bikkurim' },
  orderB: { id: 5156, titleWord: 'Verses' },
  orderC: { id: 1033, titleWord: 'Science' },
  // VBM-007 — persistence across a new browser session
  persistence: { id: 5273, titleWord: 'Kashrut' },
  // VBM-008 — clicking a /saved link navigates to the sheet
  navigation: { id: 5854, titleWord: 'Rose' },
  // VBM-009 — anonymous bookmark prompt (no state mutation)
  anon: { id: 1952, titleWord: 'Sources' },
  // VBM-010 — /saved shows correct title + author for multiple authors
  displayA: { id: 7257, titleWord: 'Parsing', author: 'Isabel Engel' },
  displayB: { id: 6608, titleWord: 'Shaye', author: 'Jeremy Kridel' },
} as const;
