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

This is an **entirely new component** (659 lines). The old ModeratorToolsPanel only had version _download_ functionality, not editing.

**Component Workflow:**

1. **Search Phase** (lines 187-220):
   - User enters `versionTitle` (case-sensitive) and optional `language` filter
   - Component calls `/api/version-indices` to find all indices with matching versions
   - Results show which texts have this version
   - All results pre-selected by default

2. **Selection Phase** (IndexSelector component):
   - User can select/deselect specific indices to update
   - Shows categories for each index (from metadata)
   - Search and filter capabilities

3. **Edit Phase** (lines 235-258):
   - User fills in fields they want to change (empty fields ignored)
   - **URL validation**: `versionSource`, `purchaseInformationURL`, `purchaseInformationImage` validated in real-time
   - **Boolean conversion**: String "true"/"false" → actual booleans for API (lines 283-291)
   - Field groups: Identification, Source & License, Metadata, Notes

4. **Save Phase** (lines 263-327):
   - Validates: selections exist, updates exist, no validation errors
   - POST to `/api/version-bulk-edit` with selected indices and updates
   - **Enhanced error display** (lines 313-314): Failures shown as bullet-list with newlines instead of semicolons
   - **Partial success handling** (lines 308-318): Shows which succeeded and which failed
   - **Frontend count calculation** (lines 304-306): Calculates counts from `successes`/`failures` array lengths

5. **Soft Delete Phase** (lines 333-378):
   - "Mark for Deletion" button adds `[MARKED FOR DELETION - DATE]` note to `versionNotes`
   - Requires confirmation dialog
   - Does NOT actually delete - safety mechanism for review
   - Uses same bulk edit API with prepared `versionNotes` value

**Key Features:**

- **Field Grouping**: Logically organized into 4 groups (lines 109-130)
- **URL Validation**: Real-time validation for URL fields (lines 225-230)
- **Comprehensive Help**: Detailed help documentation with field descriptions, use cases, warnings (lines 32-102)
- **Pre-selection**: All results selected by default for convenience (line 205)
- **Clear Search**: Button to reset and start over (lines 174-182)

**Changes Made During Code Review:**

✅ **Error Display Improvement** (lines 313-314, 364):
- Changed from semicolon-separated to bullet-list format with newlines
- Better readability for multiple errors

✅ **Response Format Simplification** (lines 304-306):
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
- ✅ Improved variable naming across all endpoints (vtitle→version_title, lang→language, j→json_data)
- ✅ Reordered functions to match URL endpoint order
- ✅ Removed redundant imports
- ✅ Added NOTE comments for disabled feature code
- ✅ Fixed empty indices status code (500→400)
- ✅ Updated docstrings to reflect actual behavior
- ✅ Updated tests to match simplified API responses

## Next Steps

- [ ] Complete frontend component review
- [ ] Review and document test coverage
- [ ] Final integration testing
