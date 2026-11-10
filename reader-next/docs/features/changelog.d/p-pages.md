### Wave 2, lane P — small Library pages (2026-11-10)

- **Notifications** (`/notifications`, T-F20): the reader's Library notifications in the new reader, all seven kinds, ten at a time
  as the reader scrolls, every loaded one marked read; signed out, sign in and back. No header badge: sefaria.org's Library header has
  none (owner question). NTF-001, NTF-002, NTF-003 done.
- **Torah Tracker** (`/torahtracker`, T-F21): from the account menu in the app; the old d3 charts ported without d3 (identical
  geometry). PRO-010 done.
- **New Additions** (`/updates`, T-F22): the About sidebar and the site's announcements, signed out too; the moderators' form.
  Measured against sefaria.org at 1280px and a phone, English and Hebrew. LIB-022, NTF-004 done.
- **Settings** (`/settings/account`, T-F23): stays Django's, recorded as an accepted exit with its way back (allowlist
  `settings-account`). ACC-003, ACC-004, RTE-013 deferred.
- **Explore and Visualizations** (T-F24, D-6): open in a new tab from the category sidebars and Resources.
- **Activity lists and leaderboard** (T-F25): not linked from any page of the new reader; they stay Django's. LEG-020 deferred.
- **Editors** (T-F27): Add Translation and Edit Text verified to return with `?next=` to the new reader; a gap after the index
  editor's `/admin/reset` (referrer lost on the redirect) reported for the book page's owner.
