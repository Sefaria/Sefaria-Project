# QA: staff-only books on two cauldrons

> QA material for PR #3838 (staff-only books). It lives on the PR branch only for this round of testing: **remove `docs/qa/staff-only-books/` before merging.**

**For the agent reading this:** you are helping a Sefaria QA or content person test a new feature. Follow the parts below in order. Use the browser the person is logged in with. Report results with the template at the end. Don't change anything that isn't prefixed with the person's own `Zzz QA <Name>`.

## What's being tested
Sefaria wants to upload books to the production database before releasing them. "Staff-only" (`admin_only`) records are visible on the **staff site** and invisible on the **public site**, even though both read the same database. Staff later **publish** them.

The flag lives on four kinds of records: **categories, books (indexes), versions and links**. A child of a staff-only record becomes staff-only automatically:
- a book in a staff-only category
- a commentary on a staff-only book
- a version of a staff-only book
- a link touching a staff-only book

Publishing only goes one way, from staff-only to public.

| | URL | Plays | Shows staff-only records? |
|---|---|---|---|
| **Staff cauldron** | https://www.staff-only-staff.cauldron.sefaria.org | the staff site | **yes** |
| **Public cauldron** | https://www.staff-only-public.cauldron.sefaria.org | sefaria.org | **no** |

Both cauldrons read **the same database**. Anything created on one exists on the other; only what's shown differs.

## Before you start
- **Logging in:** log in on **both** cauldrons with your usual dev / cauldron staff account. Both use the shared dev login database. If you aren't staff there, ask Yonadav.
- **Sleeping cauldrons:** cauldrons sleep when idle. The first page load can return 503 or time out for a few minutes. Keep reloading until the site appears.
- **Naming:** start every name with `Zzz QA <your first name>`, for example `Zzz QA Dana Book`.
- **No hyphens:** titles can't contain hyphens. That's a general Sefaria rule.
- **Leave the example alone:** don't rename, delete or publish the shared example set (`Zzz Staff Only Test ...`). Other testers use it.

## The helper
Use [`staff-only-books-qa-helper.js`](https://github.com/Sefaria/Sefaria-Project/blob/feature/sc-47550/staff-only-flag-on-records/docs/qa/staff-only-books/staff-only-books-qa-helper.js), which sits next to this guide. It defines a `qa` object that calls the site's own APIs with your login.
1. Open the **staff** cauldron in the logged-in browser.
2. Load the helper in that page. Run this in the DevTools console, or with your browser tool's "run JavaScript in page":
   ```js
   await fetch("https://raw.githubusercontent.com/Sefaria/Sefaria-Project/feature/sc-47550/staff-only-flag-on-records/docs/qa/staff-only-books/staff-only-books-qa-helper.js").then(r => r.text()).then(eval);
   ```
   Or open the file, copy all of it, and paste it into the console. Either way it prints `qa-helper loaded`.
3. Every `qa.*` call prints the server's response. Errors print in red.
4. If you reload the page, load the helper again.

## Part 1: look at the example set (read only)
It's already uploaded, all staff-only:
- **Category** `Tanakh / Zzz Staff Only Test`
- **Book** `Zzz Staff Only Test Book`, with an English and a Hebrew version
- **Two links:** `Zzz Staff Only Test Book 1:1` to Genesis 1:1, and `Zzz Staff Only Test Book 1:2` to Exodus 1:1
- **A staff-only translation of a public book:** `Zzz Staff Only Translation` of Genesis 1

Run `qa.urls("Zzz Staff Only Test Book", {categoryPath: ["Tanakh", "Zzz Staff Only Test"]})`. It prints a table of pages to open on both cauldrons.

**Expected on the staff cauldron:** everything appears:
- the category under Tanakh
- the book page
- the book in the API responses
- a commentary link from the book on Genesis 1:1 (open Genesis 1, click verse 1 and look at the connections panel)
- `Zzz Staff Only Translation` among Genesis's versions
- edits to these records on `/activity`

**Expected on the public cauldron:** none of it appears:
- no category under Tanakh
- the book page and APIs report the book doesn't exist
- no such link on Genesis 1:1
- no such Genesis version
- nothing on `/activity`

Also check `qa.status("Zzz Staff Only Test Book")`, which only works on the staff cauldron.

## Part 2: create your own staff-only records
Run these on the **staff** cauldron. Replace `Dana` with your name.

```js
const me = "Zzz QA Dana";
const cat = ["Tanakh", `${me} Category`];

await qa.createCategory(`${me} Category`, "קטגוריה של דנה");              // staff-only (default)
await qa.createBook(`${me} Book`, "ספר של דנה", cat);                      // staff-only because its category is
await qa.addVersion(`${me} Book`, `${me} English`, "en",
                    [["First verse, about Genesis 1:1.", "Second verse."], ["Chapter two."]], {primary: true});
await qa.addVersion(`${me} Book`, `${me} Hebrew`, "he", [["פסוק ראשון", "פסוק שני"]], {primary: true});
await qa.addLink(`${me} Book 1:1`, "Genesis 1:1");                         // staff-only because the book is
await qa.addVersion("Genesis", `${me} Genesis Translation`, "en",
                    [["My translation of Genesis 1:1."]], {staffOnly: true}); // staff-only version of a PUBLIC book
await qa.status(`${me} Book`);
qa.urls(`${me} Book`, {categoryPath: cat});
```

**Expected:**
- Every create call answers without an error. The category response includes `"admin_only": true`.
- `qa.status` shows:
  - the book and your category as `admin_only: true`
  - both versions as `admin_only: true`
  - your link counted under `links.admin_only`
- On the staff cauldron, all of it is visible.
- On the public cauldron, none of it is. Check with the `qa.urls` table, and look at Genesis 1:1's connections and Genesis's versions.

## Part 2b: copy a real book of the tester's choice
This exercises real structures the dummy book doesn't have. Before running anything, **ask the tester** these questions, and wait for their answers.

1. **Which book should be copied?** Any non-dictionary book on Sefaria works, and more complex ones test more. Some suggestions:
   - simple: `Ruth`
   - with several parts: `Pesach Haggadah`
   - a commentary: `Rashi on Ruth`
   - Talmud: `Berakhot`
2. **The copy's English title.** It must start with their prefix and contain no hyphens, for example `Zzz QA Dana Haggadah`.
3. **The copy's Hebrew title.**
4. **Where should the copy go?**
   - **(a)** In their staff-only category from Part 2. The whole copy is then staff-only automatically.
   - **(b)** In the original book's own category, flagged staff-only explicitly. This tests a staff-only book in a public category.
5. **How much text?** Sections per part (default 5), versions (default 2: one English and one Hebrew, or exact version titles), and links (default 30). Keep these small: a big copy is slow.

Then run, with their answers filled in:

```js
// (a) in the staff-only category:
await qa.copyBook("<source>", "<English title>", "<Hebrew title>", {categoryPath: cat, maxSections: 5, versions: 2, maxLinks: 30});
// (b) in the original category, flagged explicitly:
await qa.copyBook("<source>", "<English title>", "<Hebrew title>", {staffOnly: true, maxSections: 5, versions: 2, maxLinks: 30});

await qa.status("<English title>");
qa.urls("<English title>", {categoryPath: cat /* or the original category */, linkedRef: "<a ref the copy links to>"});
```

`copyBook` takes up to a few minutes. It returns:
- which versions it copied
- which versions it skipped, with the reason (some versions can't be exported, usually because of their license)
- how many links it copied
- `alreadyLinked`: links that already existed. For a commentary, the site creates links to its base text automatically when the versions are saved, so these are expected.
- `skippedLinks`: essay links, which can't be copied this way
- the first section of the copy, so you can open it

**Expected:**
- The copy has the source's structure: its parts and section names. Its first sections have text in the copied versions.
- `qa.status` shows the copy, its versions and all its links as `admin_only: true`.
- On the staff cauldron, you can open the copy, and its links appear on both ends. For example, a copy of Ruth links to commentaries on Ruth, so those commentaries' connection panels show the copy.
- On the public cauldron, none of it appears:
  - not in the table of contents
  - not by URL
  - not in the connection panels of the books it links to
- For option (b): the original category still appears on the public cauldron, but without the copy.

Publish the copy in Part 4 with `qa.publishBook("<English title>")`. For option (a), publish the category first.

## Part 3: things that must be refused
Each of these should print an error and change nothing:

```js
// A public version can't be added to a staff-only book:
await qa.addVersion(`${me} Book`, `${me} Public Attempt`, "en", [["x"]], {forcePublic: true});
// -> an error saying it must be staff-only because its book is staff-only; the version must not appear anywhere

// A book can't be published while its category is still staff-only:
await qa.publishBook(`${me} Book`);   // -> "Can not publish ... while its category ... is staff-only."
```

## Part 4: publish and check the public site
Run this on the **staff** cauldron, in this order. Try the dry runs first: they report what would happen and change nothing.

```js
await qa.publishCategory(cat, {dryRun: true});
await qa.publishCategory(cat);
await qa.publishBook(`${me} Book`, {dryRun: true});
await qa.publishBook(`${me} Book`);                 // also publishes its versions and links
await qa.publishVersion("Genesis", `${me} Genesis Translation`, "en");
await qa.status(`${me} Book`);                      // everything admin_only: false
// and the copy from Part 2b, if you made one: qa.publishBook("<English title>")
qa.refreshUrls(`${me} Book`, "Genesis" /*, "<English title of the copy>", "<a book it links to>" */);
```

`qa.refreshUrls` prints links on the **public** cauldron. Open each one in order while logged in there as staff. They tell the public site to reload what it keeps in memory: the table of contents, the book, Genesis and the search-bar autocomplete. Each redirects to a page with a "Cache-Reset" style message.

**Expected on the public cauldron after the refresh links:**
- your category, book, both versions, the link on Genesis 1:1 and your Genesis translation all appear
- typing `Zzz QA` in the search bar suggests your book
- `/activity` shows the publish, but **not** the edits you made while the records were hidden. That's intended: those stay private.

Before the refresh links are opened, some of it already appears on the public cauldron (the category API, the Genesis translation) and some doesn't (the table of contents, the book page). Write down which, but it's expected.

## Part 5: report
Send Yonadav:

```
Tester: <name>          Agent: <which>         Date:
Part 1 (example set)    staff: OK / problem    public: OK / problem
Part 2 (create)         each call OK? flags as expected?   staff: ...   public: ...
Part 2b (copy)          which book, (a) or (b), what was copied/skipped, flags, staff: ...   public: ...
Part 3 (refusals)       both refused? anything created anyway?
Part 4 (publish)        each call OK?   public before refresh: ...   public after refresh: ...
Anything else odd (with URL, what you expected, what you saw, screenshot if visual):
```

## Known and accepted
- **Category names in the term list:** a staff-only category's name is stored as a "term". Terms aren't hidden, so the name can show up in places that list terms. Accepted.
- **Cached pages:** pages cached before you published, such as a Genesis page viewed earlier, may take a while to show new links, or need a hard reload.
- **Search:** results aren't part of this test.
- **Cleanup:** leave your records. Yonadav cleans the cauldrons up afterwards.
