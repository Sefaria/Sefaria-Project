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
- Removed emoji characters from user messages
- Better readability for multiple errors

✅ **Response Format Simplification**:
- Frontend calculates counts from array lengths
- Backend no longer sends redundant `count`/`total` fields
- Reduced response size and naming confusion

#### 2. Shared Components (static/js/modtools/components/shared/)

**IndexSelector.jsx** - Reusable index selection component
- List-based display with checkboxes
- Text search filtering (searches both title and categories)
- Select All/Deselect All functionality
- Category display for each index
- Used by BulkVersionEditor, BulkIndexEditor, and AutoLinkCommentaryTool

**ModToolsSection.jsx** - Collapsible section wrapper
- Consistent styling for all modtools sections
- Collapse/expand with chevron icon
- Optional help button integration
- Keyboard accessible
- All sections collapsed by default

**HelpButton.jsx** - Help modal component
- Question mark icon button
- Opens modal with detailed documentation
- ESC key support
- Focus management for accessibility

**StatusMessage.jsx** - Status message display
- Consistent message styling
- Type detection (success/error/warning/info)
- Handles multiline messages

#### 3. Field Metadata (static/js/modtools/constants/fieldMetadata.js)

Defines metadata for all editable fields:
- **VERSION_FIELD_METADATA**: Version fields (versionTitle, versionSource, license, etc.)
- **INDEX_FIELD_METADATA**: Index fields (categories, authors, descriptions, etc.)
- **BASE_TEXT_MAPPING_OPTIONS**: Commentary mapping algorithms
- Each field includes: label, type, placeholder, help text, validation rules, direction (rtl/ltr)

### Tests

**Backend Tests** (sefaria/tests/modtools_test.py)
- Tests for all three new API endpoints
- Validates partial success handling
- Tests field whitelisting
- Tests empty indices validation
- Updated to match simplified API response format

**Frontend Tests** (static/js/modtools/tests/)
- **fieldMetadata.test.js**: Validates field metadata structure
- **stripHtmlTags.test.js**: Tests HTML sanitization utility

### Components Disabled

The following components were disabled in ModeratorToolsPanel but their backend APIs remain functional:
- **BulkIndexEditor**: Bulk edit index metadata (NOT version metadata)
- **AutoLinkCommentaryTool**: Auto-link commentaries
- **NodeTitleEditor**: Edit node titles with dependency checking

**Note**: All disabled components have been modernized to use Sefaria API utilities for code consistency, even though they're not currently rendered in the UI.

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
- ✅ Extracted validation logic to pure function for better testability

**Bug Fixes:**
- ✅ Removed versionTitle from editable fields (both frontend and backend whitelist)
  - versionTitle is the search parameter - editing it would cause partial failures as the search key changes during bulk operations
  - Prevents data corruption where first edit succeeds but subsequent edits fail
  - Users should edit version titles individually, not in bulk

## Testing

The PR includes comprehensive test coverage:
- Backend API endpoint tests with partial success scenarios
- Field metadata structure validation
- All tests pass with updated response formats

## Ready for Review

This PR is ready for review. Key areas to focus on:
1. **Backend API design**: Partial success handling and field whitelisting
2. **Frontend UX**: Workflow clarity and error messaging
3. **Code modernization**: Sefaria API utility usage patterns
