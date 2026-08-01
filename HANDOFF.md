# Community Book Upload — Backend Handoff

**Date:** 2026-05-20
**Branch:** `feat/community-books-backend` (pushed to origin)
**Base:** `origin/feature/sc-44454/community-book-upload-voices`
**Worktree:** `~/sefaria/sefaria-community-books-backend/`

---

## What Was Built

Complete backend for community book uploads: users upload DOCX files, system parses them into real Sefaria `Index` + `Version` records, staff reviews and approves/rejects.

### Commits (10 total)

| # | Commit | Description |
|---|--------|-------------|
| 1 | `chore: add python-docx dependency` | Added `python-docx==1.2.0` to requirements.txt |
| 2 | `feat: add communityBook field to Index model` | `communityBook` dict on `Index.optional_attrs`, validation in `_validate()`, `is_community_book` property |
| 3 | `feat: parser data structures` | `ParseResult`, `Chapter`, `Section` dataclasses, `build_schema()`, `build_jagged_array()` |
| 4 | `feat: strict DOCX parser` | `_parse_docx()` with heading detection (Word styles + markdown fallback), forbidden content checks (tables/images/footnotes), strict validation |
| 5 | `feat: GCS + admin settings` | `COMMUNITY_BOOKS_BUCKET` in site_settings + GoogleStorageManager, `COMMUNITY_BOOK_ADMIN_IDS` in local_settings_example |
| 6 | `feat: TocTree filtering` | Community books excluded from main Library navigation |
| 7 | `feat: management command` | `create_community_category` command to seed the "Community" category |
| 8 | `feat: upload + confirm endpoints` | `POST /api/community-books/upload` and `POST /api/community-books/confirm` |
| 9 | `feat: list/approve/reject/withdraw` | 4 remaining endpoints + URL registration |
| 10 | `fix: address all code review findings` | 22 issues fixed — CSRF, input validation, magic bytes, error handling, N+1, rollback, function decomposition |

### Code Review Summary

A parallel multi-agent code review (code quality + security) was run using CandleKeep books. All 22 findings (2 critical, 8 high, 7 medium, 5 low) were addressed in commit 10:

| Category | Fixes Applied |
|----------|--------------|
| **Critical** | Removed `@csrf_exempt` (CSRF protection restored); input validation for `depth`/`page`/`limit` with range checks |
| **High** | Magic byte validation (`PK\x03\x04`); parse-before-upload (invalid files never reach GCS); generic 500 error messages (no `str(e)` leak); N+1 batch loading in `list_books`; `deepcopy` rollback on re-submission failure; specific exception types (`InputError`, `ImportError`); function decomposition into helpers |
| **Medium** | Pinned `python-docx==1.2.0`; `CommunityBookStatus` constants; withdraw state machine check; `mine=true` auth enforcement; `status_filter` allowlist; title re-check in `confirm`; version deletion logging |
| **Low** | 404 for non-owner withdraw (no resource existence leak); title length limit (500); filename fallback for non-ASCII; status constants |

### Files Created

| File | Purpose |
|------|---------|
| `sefaria/helper/community_book_parser.py` | Strict DOCX parser — heading detection, validation, jagged array building (210 lines) |
| `sefaria/helper/tests/test_community_book_parser.py` | 18 unit tests for parser (242 lines) |
| `api/community_books.py` | 6 API endpoints with extracted helpers, status constants, input validation (420 lines) |
| `reader/management/commands/create_community_category.py` | One-time category seeding (20 lines) |

### Files Modified

| File | Change |
|------|--------|
| `sefaria/model/text.py` | `communityBook` in `optional_attrs`, `is_community_book` property, validation block |
| `sefaria/model/category.py` | TocTree filter — skip indexes with `communityBook` |
| `sefaria/urls_shared.py` | Import + 6 URL patterns |
| `sefaria/google_storage_manager.py` | `COMMUNITY_BOOKS_BUCKET` class attribute |
| `sites/sefaria/site_settings.py` | `COMMUNITY_BOOKS_BUCKET: "sefaria-community-books"` |
| `sites/s4d/site_settings.py` | `COMMUNITY_BOOKS_BUCKET: "jmc-community-books"` |
| `sefaria/local_settings_example.py` | `COMMUNITY_BOOK_ADMIN_IDS = []` |
| `requirements.txt` | `python-docx==1.2.0` |

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/community-books/upload` | User + CSRF | Upload DOCX, get preview + signed token |
| `POST` | `/api/community-books/confirm` | User + CSRF | Confirm upload, create Index + Version |
| `GET` | `/api/community-books/` | Public/Staff | List books (`?mine=true`, `?status=`, `?page=`, `?limit=`) |
| `POST` | `/api/community-books/{title}/approve` | Staff + CSRF | Approve submitted book, unhide |
| `POST` | `/api/community-books/{title}/reject` | Staff + CSRF | Reject with reason |
| `POST` | `/api/community-books/{title}/withdraw` | Owner + CSRF | Soft-delete (submitted/approved only) |

**CSRF note:** All POST endpoints require a CSRF token. Frontend must send `X-CSRFToken` header with the value from the `csrftoken` cookie.

### Upload Flow

```
1. POST /upload  (multipart: file + metadata)
   → validates magic bytes + extension + size
   → rate limits (3/day, 10 pending)
   → parses DOCX first (reject if invalid)
   → uploads to GCS only after successful parse
   → checks title uniqueness
   → returns { preview, upload_token }

2. POST /confirm (JSON: { upload_token })
   → verifies signed token (1hr TTL, user-bound)
   → re-checks title uniqueness
   → re-parses from GCS, creates Index + Version
   → rollback on failure (deepcopy restore for re-submissions)
   → sends notifications to user + admins
   → returns 201 { status: "submitted", index_title }
```

### Input Validation

| Parameter | Validation |
|-----------|-----------|
| `file` | `.docx` extension + `PK\x03\x04` magic bytes + 10MB max |
| `depth` | Must be integer 1 or 2 |
| `page` | Must be positive integer |
| `limit` | Must be integer 1-100 |
| `status` (query) | Must be one of: `submitted`, `approved`, `rejected`, `withdrawn` |
| `title` (URL path) | Max 500 characters |
| `reason` (reject) | Non-empty string required |

### Index Document Shape

```json
{
  "title": "My Community Book",
  "categories": ["Community"],
  "hidden": true,
  "communityBook": {
    "status": "submitted",
    "submittedBy": 12345,
    "submittedAt": "2026-05-20T12:00:00Z",
    "reviewedBy": null,
    "rejectionReason": null
  }
}
```

### State Machine

```
submitted → approved   (staff approve)
submitted → rejected   (staff reject with reason)
submitted → withdrawn  (owner withdraw)
approved  → withdrawn  (owner withdraw)
rejected  → submitted  (owner re-uploads with same title)
withdrawn → submitted  (owner re-uploads with same title)
```

### Status Constants

Use `CommunityBookStatus.SUBMITTED`, `.APPROVED`, `.REJECTED`, `.WITHDRAWN` (defined in `api/community_books.py`).

---

## Infrastructure Done

- [x] GCS bucket `sefaria-community-books` created in `production-deployment` (multi-region US, standard, uniform ACL)
- [x] Bucket uses project-level IAM (projectEditor/projectOwner) — no extra SA binding needed
- [x] `python-docx==1.2.0` pinned in requirements.txt

## Infrastructure TODO

- [ ] Run `python manage.py create_community_category` on staging/prod
- [ ] Set `COMMUNITY_BOOK_ADMIN_IDS` in `local_settings.py` with staff user IDs
- [ ] Rebuild Docker image (picks up `python-docx==1.2.0` from requirements.txt)
- [ ] Consider GCS lifecycle policy: auto-delete objects >24h in `uploads/` prefix (orphan cleanup)

---

## Test Results

- **Parser unit tests:** 18/18 passing
- **Syntax checks:** All files clean
- **Code review:** All 22 findings addressed

Run parser tests:
```bash
cd ~/sefaria/sefaria-community-books-backend
.venv/bin/python -m pytest sefaria/helper/tests/test_community_book_parser.py -v --noconftest
```

---

## Frontend Contract

The frontend session (running in parallel) should build against these endpoints. Key integration points:

1. **Upload form** at `/community-upload` → calls `POST /api/community-books/upload` (multipart form with CSRF token)
2. **Preview + confirm** → calls `POST /api/community-books/confirm` (JSON with CSRF token)
3. **Community Books section** on Voices page → calls `GET /api/community-books/`
4. **My submissions** in user profile → calls `GET /api/community-books/?mine=true`
5. **Admin review** in BookPage → calls `POST /api/community-books/{title}/approve` or `/reject` (CSRF token)
6. **User withdraw** → calls `POST /api/community-books/{title}/withdraw` (CSRF token)

**Important:** All POST endpoints require `X-CSRFToken` header. Read from the `csrftoken` cookie.

---

## Design Docs

- **Spec:** `docs/superpowers/specs/2026-05-20-community-book-upload-backend-design.md`
- **Plan:** `docs/superpowers/plans/2026-05-20-community-book-upload-backend.md`
- **Code Review Reports:** `/tmp/code-review-quality.md`, `/tmp/code-review-security.md`
