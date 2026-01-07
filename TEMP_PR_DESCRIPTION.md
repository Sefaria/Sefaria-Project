# PR #2974: Bulk Version Metadata Editor for Moderator Tools

## Summary

Adds bulk editing capabilities to the Moderator Tools panel, along with a complete UI overhaul introducing a shared component library and dedicated stylesheet.

**Primary Feature - Bulk Version Editor:**
- Search for versions by title (e.g., "Kehati") and see all indices containing that version
- Select which indices to update and apply metadata changes in bulk
- Partial success handling: if some updates fail, successful ones are preserved
- Field clearing: remove fields entirely from versions
- Soft delete: mark versions for deletion with a timestamped note

**UI Overhaul:**
- New shared component library (ModToolsSection, IndexSelector, HelpButton, StatusMessage)
- All tools now use collapsible sections with integrated help modals
- New dedicated stylesheet (`modtools.css`, ~1600 lines)
- Consistent patterns for state management, validation, and error display

**Backend:**
- 3 new API endpoints for version bulk operations
- PyMongo 4.x migration (deprecated `update()` → `update_many()`)
- Enhanced error handling with categorized responses
- Activity feed logging for version metadata changes (new rev_type: `edit version_metadata`)

**Additional tools built but disabled** (pending future tickets):
- BulkIndexEditor, AutoLinkCommentaryTool, NodeTitleEditor

**How to test:**
1. Navigate to `/admin/moderator-tools`
2. Expand "Bulk Edit Version Metadata"
3. Enter a version title and click Search
4. Select indices, modify fields, and save

**Note:** This is internal moderator tooling. Code prioritizes functionality over polish. CSS and Tests weren't thoroughly reviewed.

---

## Detailed Technical Documentation

The sections below provide a step-by-step walkthrough of all changes for code reviewers.

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
- **Field clearing**: `null` values are treated as "delete this field" - backend uses `delattr` to remove from MongoDB
- **History logging**: Uses `tracker.update_version_metadata()` to log changes to activity feed

**`/api/check-index-dependencies/<title>` (GET)** - Disabled in frontend
- Checks dependencies before index title changes
- Used by NodeTitleEditor (currently disabled)
- Returns: dependent indices, version count, link count, has_dependencies flag
- Retained for future re-enablement

#### 2. Activity Feed / History Logging

Added audit logging for version metadata changes. Previously, metadata edits (license, status, priority, etc.) were not tracked anywhere in the system.

**New rev_type: `edit version_metadata`**

Changes are now logged to the MongoDB `history` collection and displayed on the `/activity` page.

**Implementation:**

| File | Addition |
|------|----------|
| `sefaria/model/history.py` | `log_version_metadata(user, old_dict, new_dict, **kwargs)` - Creates history entry with old/new values, title, version, language |
| `sefaria/model/__init__.py` | Added `log_version_metadata` to exports |
| `sefaria/tracker.py` | `update_version_metadata(user, version, updates, **kwargs)` - Centralized function: captures old state → applies updates → saves → logs to history |

**Endpoints updated to use tracker:**
- `version_bulk_edit_api` (sefaria/views.py) - The new bulk editor
- `flag_text_api` (reader/views.py) - Flag text feature
- `lock_text_api` (reader/views.py) - Lock/unlock text feature

**Activity Feed Display:**
- `templates/elements/activity_feed.html` - Added template block for version_metadata events
- `templates/activity.html` - Added "Version Metadata" filter option to dropdown
- `sefaria/history.py` - Added `version_metadata` case to `filter_type_to_query()`

#### 3. Enhanced reader/views.py

**Index API Error Handling:**
Enhanced the `index_post` function with categorized error responses:
- Supports both old format (`{update: {...}}`) and new format (direct index data)
- Dependency pre-checks when renaming indices
- Categorized errors: `dependency_error`, `validation_error`, `title_validation_error`, `general_error`
- **Backward-compatible**: Works with both request formats
- Currently only called by BulkIndexEditor (disabled), but enhancements would benefit any future Index API POST callers
- **Enhanced error display**: Changed from semicolon-separated strings to bullet-list format with newlines for better readability

**Version Metadata Logging:**
Updated `flag_text_api` and `lock_text_api` to use `tracker.update_version_metadata()` for history logging (see section 2)

#### 4. PyMongo 4.x Migration

Updated deprecated MongoDB operations:
- `sefaria/model/history.py:210`: `update()` → `update_many()`
- `sefaria/helper/text.py:322`: `update()` → `update_many()`
- Both maintain identical functionality with updated API

#### 5. Minor Improvements
- `sefaria/export.py`: Fixed missing `user_id` parameter in `import_versions_from_file()`
- `sefaria/helper/link.py`: Added bytes decoding for CSV uploads (handles both bytes and str)

### Frontend Changes

#### 1. ModeratorToolsPanel Refactoring (static/js/ModeratorToolsPanel.jsx)

The existing ModeratorToolsPanel was refactored in two phases:

**Phase 1 - UI Integration:**
- Wrapped existing tools in `ModToolsSection` for consistent collapsible UI
- Added help content constants for each tool
- Integrated `BulkVersionEditor` component

**Phase 2 - Component Extraction:**

Extracted 6 pre-existing tools into separate component files (~1373 → ~98 lines):

| Component | Source |
|-----------|--------|
| `BulkDownloadText.jsx` | Extracted from inline render, converted to functional component |
| `BulkUploadCSV.jsx` | Extracted from inline render, converted to functional component |
| `WorkflowyModeratorTool.jsx` | Extracted existing class component |
| `UploadLinksFromCSV.jsx` | Extracted existing class component |
| `DownloadLinks.jsx` | Extracted existing function (renamed from GetLinks) |
| `RemoveLinksFromCsv.jsx` | Extracted existing function component |

Also created `utils/stripHtmlTags.js` for shared HTML sanitization utility.

**Logic Preserved:** All existing API calls and behavior unchanged.

**Key patterns in new code:**
- Uses `Sefaria.apiRequestWithBody` instead of jQuery/fetch (no jQuery dependency)
- MESSAGE_TYPES enum for type-safe status messages
- Proactive validation (button disabled when invalid, no click required)

#### 2. Main Component: BulkVersionEditor (static/js/modtools/components/BulkVersionEditor.jsx)

This is an **entirely new component** (~728 lines). The old ModeratorToolsPanel only had version _download_ functionality, not editing.

**User Workflow:**

1. User enters a version title (e.g., "Kehati") and optionally filters by language
2. Component fetches all indices that have matching versions via `/api/version-indices`
3. User selects which indices to update (all pre-selected by default)
4. User fills in metadata fields to change (empty fields are ignored)
5. On save, POST to `/api/version-bulk-edit` updates all selected versions
6. Results show which versions succeeded and which failed (partial success handling)

**Key Implementation Details:**

**State Management (lines 183-201):**

| State | Type | Purpose |
|-------|------|---------|
| `vtitle`, `lang` | string | Search parameters for finding versions |
| `searched` | boolean | Whether a search has been performed |
| `indices` | array | Index titles returned from API |
| `indexMetadata` | object | Category paths for each index |
| `pick` | Set | Selected indices for bulk edit |
| `updates` | object | Field names → new values |
| `validationErrors` | object | Field names → error messages |
| `fieldsToClear` | Set | Fields marked for deletion |
| `msg` | string/object | Current status message |
| `loading`, `saving` | boolean | Loading states |
| `showDeleteConfirm` | boolean | Delete confirmation dialog visibility |

**Computed Values (lines 499-524):**

- `hasChanges`: True if `updates` has entries OR `fieldsToClear` has entries
- `hasValidationErrors`: True if `validationErrors` has entries
- `getValidationState()`: Computes current message based on state (proactive validation)
- `currentMessage`: Result of `getValidationState()`
- `isButtonDisabled`: True if saving, has errors, or has WARNING message

**Helper Functions (lines 153-178):**

- **`isValidUrl(string)` (line 153)**: URL validation using native URL constructor
- **`getFieldValidationError(field, value)` (line 173)**: Returns error message for URL fields

**Core Functions:**

- **`clearSearch()` (line 206)**: Resets all state to initial values

- **`load()` (lines 220-253)**: Fetches indices with matching versions
  - Calls `/api/version-indices` with versionTitle and optional language
  - Auto-selects all returned indices
  - Stores index metadata for category display

- **`handleFieldChange(field, value)` (lines 257-283)**: Field change handler
  - Updates `updates` state (adds/removes based on value presence)
  - Validates and updates `validationErrors` state
  - Uses useCallback for performance

- **`handleClearToggle(field, checked)` (lines 286-312)**: Clear checkbox handler
  - Toggles field in `fieldsToClear` Set
  - When checked, clears pending updates/errors for that field
  - Allows users to completely remove fields from versions

- **`performBulkEdit(...)` (lines 320-352)**: Shared API call logic
  - Builds payload with versionTitle, indices, updates
  - Calls `/api/version-bulk-edit`
  - Handles ok/partial/error status responses
  - Takes message generator functions for flexibility

- **`save()` (lines 356-393)**: Save user changes
  - Safety checks (validation handled proactively by disabled button)
  - Converts boolean string values ("true"/"false") to actual booleans
  - Adds cleared fields with `null` value
  - Delegates to `performBulkEdit` with custom messages

- **`markForDeletion()` (lines 397-414)**: Soft delete feature
  - Adds timestamped note to `versionNotes` instead of deleting
  - Delegates to `performBulkEdit` with deletion note

- **`renderField(fieldName)` (lines 418-498)**: Dynamic field renderer
  - Reads metadata from `VERSION_FIELD_METADATA`
  - Renders select, textarea, number, or text/url inputs
  - Shows validation errors inline
  - Includes "Clear this field" checkbox

**Render Sections (lines 526-725):**

The JSX is organized into these sections:
1. Info box - Usage instructions
2. Search bar - Version title input with Search button
3. Language filter - Dropdown for he/en filtering
4. Clear button - Reset search
5. No results message - Shown when search returns empty
6. Index selector - Checkbox list of matching indices
7. Field inputs - Grouped by FIELD_GROUPS
8. Changes preview - Shows pending updates and clears
9. Validation warning - Shows field validation errors
10. Status message - Proactive feedback (warnings, success, errors)
11. Save button - Disabled when validation fails
12. Delete section - Separated at bottom with confirmation dialog

**Field Organization:**

Fields grouped in `FIELD_GROUPS` (lines 125-146):
- **Identification**: versionTitleInHebrew (versionTitle excluded - it's the search key)
- **Source & License**: versionSource, license, purchaseInformationURL, purchaseInformationImage
- **Metadata**: status, priority, digitizedBySefaria, isPrimary, isSource, direction
- **Notes**: versionNotes, versionNotesInHebrew

**Special Features:**

- **Clear Fields**: Checkbox below each field to completely remove it from all selected versions
  - Uses `null` as sentinel value sent to backend
  - Backend uses `delattr` to remove field from MongoDB document
  - Input is greyed out when field is marked for clearing
- **Proactive Validation**: Messages shown automatically based on state, not on click
  - "No indices selected" when none checked
  - "No fields to update or clear" when no changes
  - Save button disabled when validation fails
- **URL Validation**: Real-time validation for URL fields using native URL constructor
- **Partial Success Handling**: Shows detailed failure list while reporting successes
- **Soft Delete**: Mark for deletion adds note instead of actually deleting
- **Boolean Conversion**: Converts "true"/"false" strings to booleans before API call

#### 3. Shared Components (static/js/modtools/components/shared/)

Four reusable components extracted for consistency across modtools:

**IndexSelector.jsx** (~183 lines)
- List-based display with checkboxes for selecting multiple indices
- Text search filtering (searches both title and categories)
- Select All/Deselect All buttons
- Shows category path for each index (e.g., "Tanakh > Torah")
- Props: `indices` (Array<{title: string, categories?: string[]}>), `selectedIndices` (Set of titles), `onSelectionChange`, `label`
- Parent components transform API response to combine indices and metadata into single array
- Used by: BulkVersionEditor, BulkIndexEditor (disabled), AutoLinkCommentaryTool (disabled)

**ModToolsSection.jsx** (~137 lines)
- Collapsible section wrapper with consistent styling
- Header with collapse/expand chevron icon
- Optional HelpButton integration via `helpContent` prop
- Bilingual title support (`title` and `titleHe`)
- Keyboard accessible (Enter/Space to toggle)
- All sections collapsed by default (controlled via `collapsed` state)

**HelpButton.jsx** (~98 lines)
- Question mark icon button that opens modal with documentation
- Modal overlay with close button and backdrop click to dismiss
- ESC key support for accessibility
- Focus trap management (focuses modal on open, returns focus on close)
- Accepts `helpContent` prop with JSX documentation

**StatusMessage.jsx** (~51 lines)
- Consistent message display with type-based styling
- Exports `MESSAGE_TYPES` enum (SUCCESS, ERROR, WARNING, INFO)
- Accepts string (defaults to 'info') or `{type, message}` object
- Shows nothing when message is empty

#### 4. Constants (static/js/modtools/constants/)

**fieldMetadata.js** (~278 lines) - Centralized field configuration for bulk editing:

**VERSION_FIELD_METADATA** (lines 154-265)
- Defines 14 Version model fields with metadata
- Field types: text, textarea, select, number
- Each field includes: label, type, placeholder, help text, direction (rtl/ltr)
- Special fields:
  - Boolean fields: digitizedBySefaria, isPrimary, isSource (select with true/false/unspecified)
  - URL fields: versionSource, purchaseInformationURL, purchaseInformationImage
- Used by: BulkVersionEditor

**INDEX_FIELD_METADATA** (lines 25-140)
- Defines 16 Index model fields with metadata
- Used by: BulkIndexEditor (disabled)

**BASE_TEXT_MAPPING_OPTIONS** (lines 267-278)
- 4 commentary mapping algorithms for auto-linking
- Used by: AutoLinkCommentaryTool (disabled)

#### 5. Index/Export Files

**static/js/modtools/index.js**
- Exports all modtools components for convenient imports
- Pattern: `export { default as ComponentName } from './components/ComponentName'`

**static/js/modtools/components/shared/index.js**
- Exports shared utility components (IndexSelector, ModToolsSection, HelpButton, StatusMessage)

#### 6. Components Disabled

The following components were disabled in ModeratorToolsPanel but their backend APIs remain functional:
- **BulkIndexEditor**: Bulk edit index metadata (NOT version metadata)
- **AutoLinkCommentaryTool**: Auto-link commentaries
- **NodeTitleEditor**: Edit node titles with dependency checking

### CSS Styles (static/css/modtools.css)

New stylesheet (~1641 lines) for modtools components:
- Styling for all shared components (ModToolsSection, IndexSelector, HelpButton, StatusMessage)
- Form input styles with RTL support
- Validation error display
- Collapsible section animations
- Modal overlay for help content
- Field clearing visual feedback (greyed-out disabled inputs)

**Note:** CSS has not been thoroughly reviewed as this is internal tooling. Styling prioritizes functionality over polish.

### Tests

**Backend Tests** (sefaria/tests/modtools_test.py, ~569 lines)
- Tests for all three new API endpoints
- Validates partial success handling
- Tests field whitelisting
- Tests empty indices validation
- **Field clearing tests**:
  - `test_bulk_edit_null_clears_field`: Verifies null values remove fields entirely from MongoDB
  - `test_bulk_edit_mixed_updates_and_clears`: Tests mixing field updates and clears in one request
  - `test_bulk_edit_clear_nonexistent_field`: Ensures clearing nonexistent fields doesn't error

**Frontend Tests** (static/js/modtools/tests/)
- **fieldMetadata.test.js** (~201 lines): Validates field metadata structure
- **stripHtmlTags.test.js** (~108 lines): Tests HTML sanitization utility

**Note:** Tests are treated as a nice-to-have and haven't been thoroughly reviewed.

### Documentation (docs/modtools/)

Two documentation files provide guidance for developers:

- **MODTOOLS_GUIDE.md**: Comprehensive guide covering overview, APIs, data models, common tasks, and patterns
- **COMPONENT_LOGIC.md**: Detailed component behavior and logic flows

## Complete File List

All files changed in this PR:

**Backend (Python):**
- `sefaria/views.py` - New API endpoints, uses tracker for history logging
- `reader/views.py` - Enhanced Index API error handling, flag_text_api and lock_text_api now use tracker
- `sefaria/urls.py` - URL routing for new endpoints
- `sefaria/tracker.py` - New `update_version_metadata()` function for centralized version updates with history logging
- `sefaria/model/history.py` - PyMongo 4.x migration, new `log_version_metadata()` function
- `sefaria/model/__init__.py` - Added `log_version_metadata` export
- `sefaria/history.py` - Added `version_metadata` filter type, updated docstring
- `sefaria/helper/text.py` - PyMongo 4.x migration
- `sefaria/helper/link.py` - CSV bytes handling
- `sefaria/export.py` - user_id parameter fix
- `sefaria/tests/modtools_test.py` - Backend tests

**Frontend (React/JS):**
- `static/js/ModeratorToolsPanel.jsx` - Refactored (now imports extracted components)
- `static/js/modtools/components/BulkVersionEditor.jsx` - New component
- `static/js/modtools/components/BulkDownloadText.jsx` - Extracted from ModeratorToolsPanel
- `static/js/modtools/components/BulkUploadCSV.jsx` - Extracted from ModeratorToolsPanel
- `static/js/modtools/components/WorkflowyModeratorTool.jsx` - Extracted from ModeratorToolsPanel
- `static/js/modtools/components/UploadLinksFromCSV.jsx` - Extracted from ModeratorToolsPanel
- `static/js/modtools/components/DownloadLinks.jsx` - Extracted from ModeratorToolsPanel (was GetLinks)
- `static/js/modtools/components/RemoveLinksFromCsv.jsx` - Extracted from ModeratorToolsPanel
- `static/js/modtools/components/BulkIndexEditor.jsx` - Disabled component
- `static/js/modtools/components/AutoLinkCommentaryTool.jsx` - Disabled component
- `static/js/modtools/components/NodeTitleEditor.jsx` - Disabled component
- `static/js/modtools/components/shared/IndexSelector.jsx` - Shared component
- `static/js/modtools/components/shared/ModToolsSection.jsx` - Shared component
- `static/js/modtools/components/shared/HelpButton.jsx` - Shared component
- `static/js/modtools/components/shared/StatusMessage.jsx` - Shared component
- `static/js/modtools/components/shared/index.js` - Exports
- `static/js/modtools/constants/fieldMetadata.js` - Field definitions
- `static/js/modtools/utils/index.js` - Utils exports
- `static/js/modtools/utils/stripHtmlTags.js` - Shared HTML sanitization utility
- `static/js/modtools/index.js` - Exports
- `static/js/modtools/tests/fieldMetadata.test.js` - Frontend tests
- `static/js/modtools/tests/stripHtmlTags.test.js` - Frontend tests

**CSS:**
- `static/css/modtools.css` - New modtools styles

**Templates:**
- `templates/elements/activity_feed.html` - Added version_metadata display block
- `templates/activity.html` - Added "Version Metadata" filter option

**Documentation:**
- `docs/modtools/MODTOOLS_GUIDE.md` - Consolidated guide (overview, APIs, tasks)
- `docs/modtools/COMPONENT_LOGIC.md` - Detailed logic flows
- `TEMP_PR_DESCRIPTION.md` - This file

**Configuration:**
- `.gitignore` - Added CLAUDE.md to ignore list
