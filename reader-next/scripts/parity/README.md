# Language parity harness

Checks that this client shows a text's languages the way www.sefaria.org does: the panel title, the line under it, the section
headers, the segment numbers (Hebrew letters or digits, and where they sit), which language columns show and in what order, and the
font, size, weight and colour actually rendered for each. It opens every case of a matrix on both sites and writes the differences.

It only reads www.sefaria.org: it opens pages, never signs in and never submits anything. Not part of the test suite (it needs the
network and the live site changes); run it by hand when changing how the reader shows languages.

## Files

- `lang-cases.mjs`: the matrix. Each case has an id, the text kind, the address, the content language (`lang=en|he|bi`), the
  interface language, desktop or phone, layout cookies (`biLayout`, `layoutTanakh`, `layoutTalmud`, `layoutDefault`: both clients
  read the same names) and how the reader arrives (direct load, scrolling into the next section, or a link that opens the
  connections sidebar). The comment at its top explains how the full cross product was pruned.
- `lang-parity.mjs`: opens each case on both sites, measures, compares, writes the report.
- `lang-compare.mjs`: the comparison and the list of root causes (each tied to a rule id of the language rules).

## Running

1. Start this client against the live API (from `reader-next/`):

   ```sh
   SEFARIA_PASS_THROUGH=1 PORT=3800 npx vite dev --port 3800 --strictPort
   ```

2. Run the matrix (or part of it):

   ```sh
   node scripts/parity/lang-parity.mjs --new http://localhost:3800 --out <dir> [--shots <dir>] [--jobs 3]
   node scripts/parity/lang-parity.mjs --new http://localhost:3800 --out <dir> --only C-ibnezra-owner-bi-E,S-tanakh-heLeft-E
   node scripts/parity/lang-parity.mjs --new http://localhost:3800 --out <dir> --group core,phone
   ```

   `--out` defaults to a folder in the system temp directory. Screenshots (`<id>-legacy.png`, `<id>-new.png`, the viewport after
   load) go to `--shots` (default `<out>/shots`); `--no-shots` skips them. Keep `--jobs` at 3 or less: every case opens two pages.

3. Read `<out>/lang-parity-run.md`: differences counted by root cause, then one row per case. `<out>/lang-parity-run.json` holds
   every measurement. After changing `lang-compare.mjs`, compare again without browsing:

   ```sh
   node scripts/parity/lang-parity.mjs --from-json <out>/lang-parity-run.json --out <out>
   ```

## How it measures

- The interface language is set as a reader sets it, `/interface/<english|hebrew>?next=<address>`, on both sites (the old site moves
  to its Hebrew domain).
- The old client: the first `.readerPanel`; title `.readerControlsTitle`; headers `.textRange.basetext > .title`; segments
  `.segment[data-ref]` with `.segmentNumber`; sides `.segmentText .contentSpan.primary|.translation`. Only what is visible counts
  (the old client hides the other language with CSS).
- This client: `header h1` and the line under it; `section[data-ref] h2`; `[role=group][data-ref]` with `[data-number]` and
  `[data-side]`.
- Sections and segments are compared by ref, so a client that loaded an extra section above or below is not a difference.
- A number's position is `left` or `right` of the text, `between` two side-by-side columns, or `over-text` (on top of a column).
- Fonts are the faces Chrome actually used (DevTools `CSS.getPlatformFontsForNode`), not the CSS font stacks.
