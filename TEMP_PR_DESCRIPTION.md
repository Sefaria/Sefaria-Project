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
- **Field clearing**: `null` values are treated as "delete this field" - backend uses `delattr` to remove from MongoDB (lines 1714-1718)

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

This is an **entirely new component** (~630 lines). The old ModeratorToolsPanel only had version _download_ functionality, not editing.

**User Workflow:**

1. User enters a version title (e.g., "Kehati") and optionally filters by language
2. Component fetches all indices that have matching versions via `/api/version-indices`
3. User selects which indices to update (all pre-selected by default)
4. User fills in metadata fields to change (empty fields are ignored)
5. On save, POST to `/api/version-bulk-edit` updates all selected versions
6. Results show which versions succeeded and which failed (partial success handling)

**Key Implementation Details:**

**State Management:**
- `vtitle`, `lang`: Search parameters for finding versions
- `indices`: List of index titles returned from API
- `pick`: Set of selected indices for bulk edit
- `updates`: Object mapping field names to new values
- `validationErrors`: Object mapping field names to error messages

**Core Functions:**

- **`load()` (lines 203-235)**: Fetches indices with matching versions
  - Calls `/api/version-indices` with URLSearchParams
  - Auto-selects all returned indices
  - Uses async/await with `Sefaria.apiRequestWithBody`

- **`getFieldValidationError(field, value)` (lines 151-158)**: Pure validation function
  - Only validates URL fields (`versionSource`, `purchaseInformationURL`, `purchaseInformationImage`)
  - Returns error message string or null

- **`handleFieldChange(field, value)` (lines 245-268)**: Field change handler
  - Updates `updates` state (adds/removes based on value presence)
  - Validates and updates `validationErrors` state
  - Uses useCallback for performance

- **`handleClearToggle(field, checked)` (lines 274-298)**: Clear checkbox handler
  - Toggles field in `fieldsToClear` Set
  - When checked, disables input and clears any pending updates/errors
  - Allows users to completely remove fields from versions

- **`performBulkEdit(...)` (lines 276-308)**: Shared API call logic
  - Builds payload with versionTitle, language, indices, updates
  - Calls `/api/version-bulk-edit`
  - Handles ok/partial/error status responses
  - Takes message generator functions for flexibility

- **`save()` (lines 313-352)**: Save user changes
  - Validates: indices selected, fields to update, no validation errors
  - Converts boolean string values ("true"/"false") to actual booleans
  - Delegates to `performBulkEdit` with custom messages
  - Clears form on success

- **`markForDeletion()` (lines 358-375)**: Soft delete feature
  - Adds timestamped note to `versionNotes` instead of deleting
  - Delegates to `performBulkEdit` with deletion note
  - Safety mechanism to prevent accidental data loss

- **`renderField(fieldName)` (lines 381-442)**: Dynamic field renderer
  - Reads metadata from `VERSION_FIELD_METADATA`
  - Renders select, textarea, number, or text/url inputs
  - Shows validation errors inline
  - Handles RTL/LTR text direction

**Field Organization:**

Fields grouped in `FIELD_GROUPS` (lines 109-130):
- **Identification**: versionTitleInHebrew (versionTitle excluded - it's the search key)
- **Source & License**: versionSource, license, purchaseInformationURL, purchaseInformationImage
- **Metadata**: status, priority, digitizedBySefaria, isPrimary, isSource, direction
- **Notes**: versionNotes, versionNotesInHebrew

**Special Features:**

- **Clear Fields**: Checkbox below each field to completely remove it from all selected versions
  - Uses `null` as sentinel value sent to backend
  - Backend uses `delattr` to remove field from MongoDB document
  - Input is disabled when field is marked for clearing
- **URL Validation**: Real-time validation for 3 URL fields using native URL constructor
- **Partial Success Handling**: Shows detailed failure list while reporting successes
- **Soft Delete**: Mark for deletion adds note instead of actually deleting
- **Boolean Conversion**: Converts "true"/"false" strings to booleans before API call

#### 2. Shared Components (static/js/modtools/components/shared/)

Four reusable components extracted for consistency across modtools:

**IndexSelector.jsx** (~80 lines)
- List-based display with checkboxes for selecting multiple indices
- Text search filtering (searches both title and categories)
- Select All/Deselect All buttons
- Shows category path for each index (e.g., "Tanakh > Torah")
- Props: `indices`, `selectedIndices` (Set), `onSelectionChange`, `label`, `indexMetadata`
- Used by: BulkVersionEditor, BulkIndexEditor (disabled), AutoLinkCommentaryTool (disabled)

**ModToolsSection.jsx** (~60 lines)
- Collapsible section wrapper with consistent styling
- Header with collapse/expand chevron icon
- Optional HelpButton integration via `helpContent` prop
- Bilingual title support (`title` and `titleHe`)
- Keyboard accessible (Enter/Space to toggle)
- All sections collapsed by default (controlled via `collapsed` state)

**HelpButton.jsx** (~70 lines)
- Question mark icon button that opens modal with documentation
- Modal overlay with close button and backdrop click to dismiss
- ESC key support for accessibility
- Focus trap management (focuses modal on open, returns focus on close)
- Accepts `helpContent` prop with JSX documentation

**StatusMessage.jsx** (~30 lines)
- Consistent message display with type-based styling
- Auto-detects type from message content: "Error:", "Warning:", "Successfully", etc.
- Handles multiline messages with preserved formatting
- Shows nothing when message is empty

#### 3. Field Metadata (static/js/modtools/constants/fieldMetadata.js)

Centralized field configuration (~300 lines) for bulk editing operations:

**VERSION_FIELD_METADATA** (lines 154-265)
- Defines 14 Version model fields with metadata
- Field types: text, textarea, select, number
- Each field includes: label, type, placeholder, help text, direction (rtl/ltr)
- Special fields:
  - `status`: "locked" prevents non-staff edits (see tracker.py:33)
  - Boolean fields: digitizedBySefaria, isPrimary, isSource (select with true/false/unspecified)
  - URL fields: versionSource, purchaseInformationURL, purchaseInformationImage

**INDEX_FIELD_METADATA** (lines 25-140)
- Defines 16 Index model fields with metadata
- Additional types: array (comma-separated), daterange (year or [start, end])
- Auto-detection support: authors, dependence, base_text_titles, collective_title (use "auto" value)
- Validation: toc_zoom must be integer 0-10

**BASE_TEXT_MAPPING_OPTIONS** (lines 289-294)
- 4 commentary mapping algorithms for auto-linking
- Used by AutoLinkCommentaryTool (disabled)
- Options: many_to_one_default_only, many_to_one, one_to_one_default_only, one_to_one

### Tests

**Backend Tests** (sefaria/tests/modtools_test.py)
- Tests for all three new API endpoints
- Validates partial success handling
- Tests field whitelisting
- Tests empty indices validation
- Updated to match simplified API response format
- **Field clearing tests**:
  - `test_bulk_edit_null_clears_field`: Verifies null values remove fields entirely from MongoDB
  - `test_bulk_edit_mixed_updates_and_clears`: Tests mixing field updates and clears in one request
  - `test_bulk_edit_clear_nonexistent_field`: Ensures clearing nonexistent fields doesn't error

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
- ✅ Migrated to Sefaria API utilities
  - Replaced jQuery (`$.ajax`, `$.getJSON`) and manual `fetch` with `Sefaria.apiRequestWithBody`
  - Automatic URL parameter building via `URLSearchParams`
  - Consistent CSRF token handling and error management
  - Removed jQuery dependency from all components
- ✅ Converted callback-based code to async/await pattern
- ✅ Extracted validation logic to pure function (`getFieldValidationError`) for testability
- ✅ Extracted duplicate API call logic into `performBulkEdit` helper function (~50 lines saved)
- ✅ Improved error display
  - Changed from semicolon-separated strings to bullet-list format with newlines
  - Removed emoji characters from user messages
  - Better readability for multiple errors
- ✅ Response format simplification
  - Frontend calculates counts from array lengths
  - Backend no longer sends redundant `count`/`total` fields
  - Reduced response size and naming confusion
- ✅ Removed unnecessary fallback in `renderField` (all fields guaranteed to have metadata)

**Bug Fixes:**
- ✅ Removed versionTitle from editable fields (both frontend FIELD_GROUPS and backend whitelist)
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
