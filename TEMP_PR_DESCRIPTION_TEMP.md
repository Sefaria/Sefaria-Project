# PR #2974: Bulk Version Metadata Editor for Moderator Tools

## Summary
This PR adds bulk editing capabilities to the Moderator Tools panel, specifically for updating Version metadata across multiple indices at once. It also includes enhanced error handling for Index API operations and PyMongo 4.x compatibility fixes.
It aslo includes a UI overhaul.

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
- Security: Whitelisted fields prevent arbitrary attribute injection
- Partial success handling: Failures don't stop the entire operation
- Detailed error reporting per index

**`/api/check-index-dependencies/<title>` (GET)** - Disabled in frontend
- Checks dependencies before index title changes
- Used by NodeTitleEditor (currently disabled)
- Returns: dependent indices, version count, link count, has_dependencies flag
- Retained for future re-enablement

#### 2. Enhanced Index API Error Handling (reader/views.py)

Enhanced the `index_post` function with better error categorization:
- Supports both old format (`{update: {...}}`) and new format (direct index data)
- Dependency pre-checks when renaming indices
- Categorized error responses
- Backward-compatible with all existing callers
- Added for disabled features (NodeTitleEditor, BulkIndexEditor) but benefits all Index API users

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

**TODO: Review and document frontend changes**

### Tests

#### Backend Tests (sefaria/tests/modtools_test.py)

**TODO: Review test coverage**

### Components Disabled

The following components were disabled in ModeratorToolsPanel but their backend APIs remain functional:
- **BulkIndexEditor**: Bulk edit index metadata (NOT version metadata)
- **AutoLinkCommentaryTool**: Auto-link commentaries
- **NodeTitleEditor**: Edit node titles with dependency checking

## Technical Decisions

### 1. Partial Success Handling
The bulk edit endpoint processes all indices even if some fail, returning detailed success/failure arrays. This allows users to fix specific issues without re-running successful updates.

### 2. Field Whitelisting
`VERSION_BULK_EDIT_ALLOWED_FIELDS` prevents security issues from arbitrary attribute injection. Only approved metadata fields can be updated.

### 3. Simplified Response Format
Removed redundant `count` and `total` fields from API responses. Frontend calculates these from array lengths, reducing response size and confusion.

### 4. Enhanced Error Display
Changed error display from semicolon-separated strings to bullet-list format with newlines for better readability.

### 5. Backward Compatibility
All changes maintain backward compatibility with existing code. Enhanced error handling in Index API works with both old and new request formats.


## Next Steps (TODO)

- [ ] Complete frontend component review
- [ ] Review and document test coverage
- [ ] Final integration testing
- [ ] Update this PR description with frontend details
