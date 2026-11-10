## 2026-11-10 — triage: every feature has a rebuild status (wave 1, lane f-atlas; LAUNCH_PLAN T-A07)

Script: `tools/apply_2026_11_10_f-atlas.py` (rebuild-status.json only; idempotent, prints each change).

### Statused

- **All 514 entries that had no rebuild status** now have one, decided from `reader-next/src` and its tests (each `done`/`partial`
  names the source files; each `partial` says what is missing). After the script: 426 done, 102 partial, 62 todo, 190 deferred,
  135 n/a, 46 replaced; 961 of 961 statused.
- **Voices** (sheets-view, sheets-editor, collections, profile-social, Voices search, Voices-only sidebar modules and host features):
  `deferred`, "Voices out of scope (owner 2026-11-10)". PRO-010 (Torah Tracker stats) is a Library page: `todo` (T-F21).
- **Admin tools**: Django tools (modtools, linker admin and editor, staff URLs, Django admin) `deferred` per LAUNCH_PLAN §8. The
  category editor (ADM-006), book-page Index Editor (ADM-008) and version editor (ADM-009) are ported and `done`; the shared
  moderator buttons and forms are `partial`, because topic and topic-source editing still opens Django's `?editor=1`.
  LAUNCH_PLAN §8 lists "index and version editors" as staying Django, but the book-page ones are already built.
- **Static pages**: `todo` under T-F31 (D-5). Jobs, team and products (STA-009…011) are React pages fed by the CMS inside a
  static template, so Django's content block alone will not render them (T-F32).
- **Linker and embeds** `deferred` (LAUNCH_PLAN §8). **API** entries `n/a`, because they are server behaviour; API-016 (version
  download links) is `done`. **Emails** (NTF-005…011) `n/a`.
- **Legacy pages**: /explore and visualizations `deferred` (D-6); leaderboard, /random, /metrics, /digitized-by-sefaria and the
  404/error pages `todo` (T-F25, T-F26, T-F31, T-F28).
- Features that are themselves legacy bugs or dead code (SHL-001…005, RTE-060/061, CON-010, CON-018, GUI-005/016/028, LIB-032/047/056/057,
  SRC-008, SRC-065, …) are `n/a` ("legacy bug, not ported" / "dead in legacy").

### Corrected (existing entries)

- **LIB-002** partial → done: the aleph/ayin toggle (`src/ui/ContentLanguage`) and the moderator buttons (`src/ui/AdminButtons`,
  `CategoryEditor`) are built; the note said they were not.
- The 10 `todo`: **RTE-009** → done (`/` 302 to `/texts`, Tanach → Tanakh). **RTE-029** → partial (`/search` has no robots noindex).
  **PLT-007** → partial (noindex on sparse topics and revision history only). **PLT-008, PLT-026, PLT-027** → deferred (SEO head
  builder and sitemaps wait, LAUNCH_PLAN §8; bots never get the opt-in reader). **SHL-032** → deferred (Voices). **SHL-034, SHL-060**
  → partial (pages are routes; the compare panel's menus, notifications and Torah Tracker are missing). **LIB-005** stays todo (T-G03).
- Voices entries deferred earlier as "owner decides" (RTE-001/004/021/022/039, PLT-014, SRC-027, SRC-088…093) now say "Voices
  out of scope (owner 2026-11-10)". SRC-099/100 are deferred because the sheet editor and the Django admin editors use them.
- **RTE-059** (language-domain redirect) deferred → todo: it is task T-E07, not a Voices question.
- **SRC-025/026** (compare-panel search) deferred → todo, in line with the other in-reader Compare Text entries (SHL-037/038, CON-066,
  BOK-004, LIB-003, LIB-018). Compare Text is not built and is not in LAUNCH_PLAN §8: the owner should confirm whether it is in scope.
- Stale `partial` notes found on the way: **GUI-003** (autocomplete, keyboard and account menu are built; only the notifications link is
  missing), **BOK-016** → done (the dictionary search box is on the book page), **ANL-014** (Sentry is removed, not built), **TOP-002**
  → done and **TOP-024** → deferred (their open part was the Voices host).
- GUI-012, TXT-002, TXT-005: `by` filled in (spot-check of 30 random `done` entries: all 30 confirmed).
