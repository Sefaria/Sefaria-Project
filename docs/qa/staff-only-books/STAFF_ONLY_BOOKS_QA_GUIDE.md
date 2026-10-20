# QA: staff-only books on two cauldrons

> QA material for PR #3838 (staff-only books). It lives on the PR branch only for this round of testing: **remove `docs/qa/staff-only-books/` before merging.**

This guide is written for a person, step by step. An agent driving your logged-in browser can follow it too.

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
| **Staff cauldron** | https://www.staff-only-staff.cauldron.sefaria.org | the staff site | **yes**, marked with a red **STAFF ONLY** badge |
| **Public cauldron** | https://www.staff-only-public.cauldron.sefaria.org | sefaria.org | **no** |

Both cauldrons read **the same database**. Anything created on one exists on the other; only what's shown differs.

## Before you start
- **Logging in:** log in on **both** cauldrons with your usual dev / cauldron staff account. The buttons and badges only show for staff users. If you aren't staff there, ask Yonadav.
- **Sleeping cauldrons:** cauldrons sleep when idle. The first page load can show "Environment is starting up" or a 503 for a few minutes. Wait for the page to load.
- **Naming:** start every name with `Zzz QA <your first name>`, for example `Zzz QA Dana Ruth`.
- **No hyphens:** titles can't contain hyphens. That's a general Sefaria rule.
- **Leave the example alone:** don't rename, delete or publish the shared example set (`Zzz Staff Only Test ...`). Other testers use it.

**The admin menu:** to open it on a category or book page, hover over the page title (for example "Tanakh", or "Ruth" on Ruth's book page). A small menu of buttons appears next to it for a few seconds. This guide uses three new entries:
- **QA: copy as staff-only** (temporary, for this test)
- **Publish (make public)**, which appears only on staff-only records

## Part 1: look at the example set
It's already uploaded, all staff-only:
- **Category** `Tanakh / Zzz Staff Only Test`
- **Book** `Zzz Staff Only Test Book`, with an English and a Hebrew version
- **Two links:** `Zzz Staff Only Test Book 1:1` to Genesis 1:1, and `Zzz Staff Only Test Book 1:2` to Exodus 1:1
- **A staff-only translation of a public book:** `Zzz Staff Only Translation` of Genesis 1

| Check | Staff cauldron | Public cauldron |
|---|---|---|
| `/texts/Tanakh`: is "Zzz Staff Only Test" listed? | yes | **no** |
| `/texts/Tanakh/Zzz_Staff_Only_Test`: the category page | loads, with a STAFF ONLY badge | **not found** |
| `/Zzz_Staff_Only_Test_Book` (book page) and `/Zzz_Staff_Only_Test_Book.1` (text) | load, with a STAFF ONLY badge on the book page | **not found** |
| `/Genesis.1.1`, then click verse 1: is "Zzz Staff Only Test Book" among its connections? | yes | **no** |
| `/Genesis`, the versions list: is "Zzz Staff Only Translation" there? | yes, with a STAFF ONLY badge | **no** |
| Search bar: type `Zzz Staff`. Is the book suggested? | yes | **no** |
| `/activity`: are there edits to these records? | yes | **no** |

## Part 2: make your own staff-only copies, on the staff cauldron
These buttons copy real content as staff-only.

**A. A category.** Open a category page, for example `/texts/Tanakh/Writings`. Hover over its title and choose **QA: copy as staff-only**. Enter an English name such as `Zzz QA Dana Category` and a Hebrew name.

You get an **empty** staff-only category next to the original, for example `/texts/Tanakh/Zzz_QA_Dana_Category`. Open it: it shows the STAFF ONLY badge.

**B. A book.** Open a book page, for example `/Ruth`. Pick something more complex if you like:
- with several parts: `/Pesach_Haggadah`
- a commentary: `/Rashi_on_Ruth`
- Talmud: `/Berakhot`

Hover over the book title and choose **QA: copy as staff-only**. Enter:
1. the copy's English title, for example `Zzz QA Dana Ruth`
2. its Hebrew title
3. its category. Either keep the original category, which tests a staff-only book in a public category, or type your category from A, for example `Tanakh/Zzz QA Dana Category`.

The copy gets the book's structure, **all** its versions, and up to 100 of its links, rewritten to point at the copy. It runs **in the background**: the confirmation appears right away with the copy's address. A book with many versions takes a minute or two. Then open the address: the book page shows the STAFF ONLY badge. If it still says the book doesn't exist after a few minutes, report it.

**C. A version.** On a public book's page, for example `/Genesis`, find the list of versions. Click the **pencil** next to a version to open its edit form. At the bottom, click **QA: copy as staff-only version** and give it a title, for example `Zzz QA Dana Translation`.

You get a staff-only copy of that version on the same public book. It shows the STAFF ONLY badge in the versions list.

**Expected on the staff cauldron:** each copy is there, with STAFF ONLY badges:
- the category page
- the book page
- the copied book's versions
- the new version in Genesis's list

The copied book's links appear on the books it links to. For example, a copy of Ruth appears among the connections of the commentaries on Ruth.

## Part 3: check the public cauldron
Open the same addresses on the public cauldron. **None of your copies should appear anywhere:**
- not in category lists
- not by URL (book, category, text)
- not in the connections of other books
- not in Genesis's versions list
- not in search suggestions
- not on `/activity`

Note anything that leaks, with its URL.

## Part 4: publish, refresh, check again
On the **staff** cauldron:
1. **Your category first**, if your book is in it: hover its title and choose **Publish (make public)**. Publishing a book while its category is still staff-only is refused. Try it first if you like: you should get a clear error.
2. **Your book:** hover its title and choose **Publish (make public)**. This also publishes its versions and its links. Links whose other book is still staff-only are skipped and reported.
3. **Your version copy:** open its pencil form and click **Publish (make public)**.

After each publish, the confirmation lists **refresh links**. The public site keeps the library in memory, so open those links on the **public** cauldron while logged in there as staff, in the order given. They look like `/admin/reset/toc` and `/admin/reset/<Title>`; put them after the public cauldron's address. Also open `/admin/reset/ac`, which refreshes the search-bar suggestions.

**Expected afterwards:**
- On the staff cauldron, the STAFF ONLY badges are gone from what you published.
- On the public cauldron, everything you published appears: category, book, versions, links and search suggestions.
- `/activity` on the public cauldron shows the publish, but **not** the edits made while the records were hidden. That's intended.

## Part 5: report
Send Yonadav:

```
Tester:            Date:
Part 1 (example)   staff: OK / problem    public: OK / problem
Part 2 (copies)    what you copied (A/B/C, which books), any errors, badges shown?
Part 3 (public)    anything visible that shouldn't be? (URL)
Part 4 (publish)   each publish OK? refused when expected?  public after refresh: OK / missing (URL)
Anything else odd (URL, expected, seen, screenshot):
```

## Known and accepted
- **Category names in the term list:** a staff-only category's name is stored as a "term". Terms aren't hidden, so the name can show up in places that list terms. Accepted.
- **Cached pages:** pages cached before you published, such as a Genesis page viewed earlier, may take a while to show new links, or need a hard reload.
- **Search:** results aren't part of this test.
- **Big books:** a very large book, such as a long Talmud tractate with many versions, takes a while to copy. Prefer smaller books.
- **Cleanup:** leave your records. Yonadav cleans the cauldrons up afterwards.

## Appendix: testing through the API
[`staff-only-books-qa-helper.js`](staff-only-books-qa-helper.js) does the same things through the site's APIs from the browser console. It's useful for agents or for repeating a test exactly. Load it on the staff cauldron:

```js
await fetch("https://raw.githubusercontent.com/Sefaria/Sefaria-Project/feature/sc-47550/staff-only-flag-on-records/docs/qa/staff-only-books/staff-only-books-qa-helper.js").then(r => r.text()).then(eval);
```

Then use `qa.status(title)`, `qa.createCategory`, `qa.createBook`, `qa.addVersion`, `qa.addLink`, `qa.copyBook`, `qa.publishCategory`, `qa.publishBook`, `qa.publishVersion` and `qa.refreshUrls`. Each one is documented in the file.
