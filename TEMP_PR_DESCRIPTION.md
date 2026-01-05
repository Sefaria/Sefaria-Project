<!--
WORKING DOCUMENT - DO NOT COMMIT
This is a temporary file for building the PR description as we review the code.
We'll use this to understand all changes, then copy the final version to the actual PR.
This file will be deleted after the PR description is complete.
-->

# PR #2974: Bulk Version Metadata Editor for Moderator Tools

## Summary
This PR adds bulk editing capabilities to the Moderator Tools panel, specifically for updating Version metadata across multiple indices at once. It also includes enhanced error handling for Index API operations, PyMongo 4.x compatibility fixes, and a UI overhaul.

## Changes Overview

### Backend Changes

#### 1. New API Endpoints (sefaria/views.py)

Three new endpoints were added to support bulk version editing:

**`/api/version-indices` (GET)**
- Returns a list of indices that have versions matching a specific versionTitle
- Used by BulkVersionEditor to show which indices a version appears in
- Example: `?versionTitle=Tanach with Nikkud&language=he` → `{indices: ["Genesis", "Exodus", ...], metadata: {...}}`
- Includes metadata with categories for each index (uses cached `library.get_index()` for efficiency)

**`/api/version-bulk-edit` (POST)**
- Bulk updates Version metadata across multiple indices
- Request: `{versionTitle, language, indices: [...], updates: {...}}`
- Response: `{status: "ok"|"partial"|"error", successes: [...], failures: [{index, error}, ...]}`
- **Security**: Whitelisted fields (`VERSION_BULK_EDIT_ALLOWED_FIELDS`) prevent arbitrary attribute injection
- **Partial success handling**: Processes all indices even if some fail, returning detailed success/failure arrays. This allows users to fix specific issues without re-running successful updates.
- **Simplified response**: Removed redundant `count` and `total` fields - frontend calculates from array lengths

**`/api/check-index-dependencies/<title>` (GET)** - Disabled in frontend
- Checks dependencies before index title changes
- Used by NodeTitleEditor (currently disabled)
- Returns: dependent indices, version count, link count, has_dependencies flag
- Retained for future re-enablement

#### 2. Enhanced Index API Error Handling (reader/views.py)

Enhanced the `index_post` function with categorized error responses:
- Supports both old format (`{update: {...}}`) and new format (direct index data)
- Dependency pre-checks when renaming indices
- Categorized errors: `dependency_error`, `validation_error`, `title_validation_error`, `general_error`
- **Backward-compatible**: Works with both request formats
- Currently only called by BulkIndexEditor (disabled), but enhancements would benefit any future Index API POST callers
- **Enhanced error display**: Changed from semicolon-separated strings to bullet-list format with newlines for better readability

#### 3. PyMongo 4.x Migration

Updated deprecated MongoDB operations:
- `sefaria/model/history.py:210`: `update()` → `update_many()`
- `sefaria/helper/text.py:322`: `update()` → `update_many()`
- Both maintain identical functionality with updated API

#### 4. Minor Improvements
- `sefaria/export.py`: Fixed missing `user_id` parameter in `import_versions_from_file()`
- `sefaria/helper/link.py`: Added bytes decoding for CSV uploads (handles both bytes and str)

### Frontend Changes

#### 1. Main Component: BulkVersionEditor (static/js/modtools/components/BulkVersionEditor.jsx)

This is an **entirely new component** (650 lines). The old ModeratorToolsPanel only had version _download_ functionality, not editing.

**User Workflow:**

1. User enters a version title (e.g., "Kehati") and optionally filters by language
2. Component fetches all indices that have matching versions via `/api/version-indices`
3. User selects which indices to update (all pre-selected by default)
4. User fills in metadata fields to change (empty fields are ignored)
5. On save, POST to `/api/version-bulk-edit` updates all selected versions
6. Results show which versions succeeded and which failed (partial success handling)

**Special Features:**

- **Mark for Deletion**: Adds timestamped note to `versionNotes` instead of actually deleting (safety mechanism)
- **URL Validation**: Real-time validation for URL fields prevents invalid data
- **Partial Success**: If some versions fail, shows detailed error list while reporting successes
- **Field Organization**: Fields grouped into Identification, Source & License, Metadata, Notes

**Code Modernization:**

✅ **Migrated to Sefaria API utilities**:
- Replaced jQuery (`$.ajax`, `$.getJSON`) and manual `fetch` with `Sefaria.apiRequestWithBody`
- Automatic URL parameter building via `URLSearchParams`
- Consistent CSRF token handling and error management
- Converted callback-based code to async/await pattern
- Removed jQuery dependency
- Cleaner, more maintainable API call pattern

✅ **Error Display Improvement**:
- Changed from semicolon-separated to bullet-list format with newlines
- Removed emoji characters from messages
- Better readability for multiple errors

✅ **Response Format Simplification**:
- Frontend calculates counts from array lengths
- Backend no longer sends redundant `count`/`total` fields
- Reduced response size and naming confusion

### Tests

#### Backend Tests (sefaria/tests/modtools_test.py)

TODO: Review test coverage

### Components Disabled

The following components were disabled in ModeratorToolsPanel but their backend APIs remain functional:
- **BulkIndexEditor**: Bulk edit index metadata (NOT version metadata)
- **AutoLinkCommentaryTool**: Auto-link commentaries
- **NodeTitleEditor**: Edit node titles with dependency checking

## Code Quality Improvements

During review, the following improvements were made:

**Backend:**
- ✅ Improved variable naming across all endpoints (vtitle→version_title, lang→language, j→json_data)
- ✅ Reordered functions to match URL endpoint order
- ✅ Removed redundant imports
- ✅ Added NOTE comments for disabled feature code
- ✅ Fixed empty indices status code (500→400)
- ✅ Updated docstrings to reflect actual behavior
- ✅ Updated tests to match simplified API responses

**Frontend:**
- ✅ Modernized to Sefaria.apiRequestWithBody utility (removed jQuery dependency)
- ✅ Automatic URL parameter building with URLSearchParams
- ✅ Converted callback-based code to async/await
- ✅ Removed emoji characters from user messages
- ✅ Improved error handling with try/catch blocks
- ✅ Consistent CSRF token and error management across all API calls

## Next Steps

- [ ] Complete frontend component review
- [ ] Review and document test coverage
- [ ] Final integration testing
