# ModeratorToolsPanel Architecture

This document describes the architecture, data structures, and API contracts of the ModeratorToolsPanel (`/modtools`).

## Overview

The ModeratorToolsPanel is an internal admin interface for Sefaria staff to perform bulk operations on texts, versions, indices, and links. Access is restricted to authenticated moderators (`Sefaria.is_moderator`).

**URL**: `/modtools`
**Frontend Entry**: `static/js/ModeratorToolsPanel.jsx`
**Backend Views**: `sefaria/views.py`

---

## Current Components

### 1. Bulk Download Text
Downloads versions matching title/version patterns.

**UI Elements**:
- Index title pattern input
- Version title pattern input
- Language selector (Hebrew/English/Both)
- Format selector (txt/plain.txt/csv/json)

**Endpoint**: `GET /download/bulk/versions/`
**Query Params**: `format`, `title_pattern`, `version_title_pattern`, `language`

---

### 2. Bulk Upload CSV
Uploads text content from CSV files.

**UI Elements**:
- File input (multiple files)
- Upload button

**Endpoint**: `POST /api/text-upload`
**Response**: `{ status: "ok", message: "..." }` or `{ error: "..." }`

---

### 3. Workflowy Outline Upload
Imports text structure from OPML (Workflowy export) files.

**UI Elements**:
- File input (multiple .opml files)
- "Create Index Record" checkbox
- "Create Version From Notes" checkbox
- Custom delimiters input
- Term scheme name input

**Endpoint**: `POST /modtools/upload_text`
**Request**: FormData with `workflowys[]`, `c_index`, `c_version`, `delims`, `term_scheme`
**Response**: `{ successes: [...], failures: [{ file, error }] }`

---

### 4. Upload Links (from CSV)
Creates link records from a CSV with two ref columns.

**UI Elements**:
- File input
- Link type dropdown (Commentary, Quotation, Related, etc.)
- Project name input

**Endpoint**: `POST /modtools/links`
**Response**: `{ data: { message, index, errors? } }`

---

### 5. Download Links
Exports links between two refs to CSV.

**UI Elements**:
- Two ref inputs (ref1 required, ref2 optional)
- Type filter input
- Generated_by filter input
- "Iterate by segments" checkbox

**Endpoint**: `GET /modtools/links/{ref1}/{ref2}` or `GET /modtools/index_links/{ref1}/{ref2}`
**Query Params**: `type`, `generated_by`

---

### 6. Remove Links (from CSV)
Deletes links specified in a CSV file.

**UI Elements**:
- File input

**Endpoint**: `POST /modtools/links` with `action: "DELETE"`
**Response**: `{ data: { message, errors? } }`

---

### 7. Bulk Edit Index Metadata
Edit metadata fields across multiple Index records that share a version.

**UI Elements**:
- Version title input
- Language selector
- Index checklist with select all
- Field editors for: enDesc, heDesc, enShortDesc, heShortDesc, categories, authors, compDate, compPlace, pubDate, pubPlace, toc_zoom, dependence, base_text_titles, collective_title, he_collective_title

**Workflow**:
1. Load indices by version title via `/api/version-indices`
2. Select indices to modify
3. Fill in fields to update (auto-detection available for commentaries)
4. Save via `/api/v2/raw/index/{title}?update=1`
5. Reset cache via `/admin/reset/{title}`

**Key Features**:
- Auto-detection of commentary metadata from "X on Y" title pattern
- Term creation for collective titles
- Author validation against AuthorTopic database

---

### 8. Bulk Edit Version Metadata
Edit metadata fields across multiple Version records.

**UI Elements**:
- Version title input
- Language selector
- Index checklist with select all
- Field editors for all Version optional_attrs

**Endpoints**:
- `GET /api/version-indices?versionTitle=...&language=...` - List matching indices
- `POST /api/version-bulk-edit` - Apply bulk updates

**Request Body** (POST):
```json
{
  "versionTitle": "Example 2025",
  "language": "he",
  "indices": ["Genesis", "Exodus"],
  "updates": { "license": "CC-BY", "versionNotes": "..." }
}
```

**Response**: `{ status: "ok", count: N }` or error

---

### 9. Auto-Link Commentaries
Creates automatic links between commentary texts and their base texts.

**UI Elements**:
- Version title input
- Language selector
- Commentary checklist (filtered to "X on Y" titles)
- base_text_mapping dropdown

**Workflow**:
1. Load commentaries by version title
2. Select commentaries to link
3. For each:
   - Patch index with dependence, base_text_titles, base_text_mapping
   - Call `/admin/rebuild/auto-links/{title}`

---

### 10. Edit Node Titles
Edit titles of schema nodes within an Index.

**UI Elements**:
- Index title input
- Node list with English/Hebrew title inputs
- "Remove shared title" checkbox per node

**Workflow**:
1. Load index via `Sefaria.getIndexDetails(title)`
2. Check dependencies via `/api/check-index-dependencies/{title}`
3. Edit node titles in schema
4. Save full index via `/api/v2/raw/index/{title}`
5. Reset cache

---

## Data Models

### Version Model (`sefaria/model/text.py:1270`)

**Collection**: `texts`

**Required Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `title` | string | FK to Index.title |
| `language` | string | "en" or "he" only |
| `versionTitle` | string | Name of this version |
| `versionSource` | string | Source attribution |
| `chapter` | list/dict | Text content matching Index schema |
| `actualLanguage` | string | ISO language code |
| `languageFamilyName` | string | Full language name |
| `isSource` | boolean | True if not a translation |
| `isPrimary` | boolean | True if primary version |
| `direction` | string | "rtl" or "ltr" |

**Optional Fields** (editable via bulk edit):
| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Version status (e.g., "locked") |
| `priority` | float | Priority ordering |
| `license` | string | License (checked for "Copyright") |
| `versionNotes` | string | English notes |
| `versionNotesInHebrew` | string | Hebrew notes |
| `versionTitleInHebrew` | string | Hebrew version title |
| `digitizedBySefaria` | boolean | Sefaria digitized flag |
| `isPrimary` | boolean | Primary version flag |
| `isSource` | boolean | Source (not translation) flag |
| `purchaseInformationURL` | string | Purchase link |
| `purchaseInformationImage` | string | Purchase image |
| `direction` | string | Text direction override |

### Index Model (`sefaria/model/text.py:172`)

**Collection**: `index`

**Required Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Primary English title (ASCII only, no `.:-/`) |
| `categories` | list | Non-empty list of category strings |

**Key Optional Fields** (for commentaries):
| Field | Type | Description |
|-------|------|-------------|
| `dependence` | string | "Commentary" or "Targum" |
| `base_text_titles` | list | Titles this text depends on |
| `base_text_mapping` | string | AutoLinker mapping type |
| `collective_title` | string | Group name (e.g., "Rashi") |
| `authors` | list | Author slugs |

---

## API Endpoints

### `/api/version-indices` (GET)
Returns list of Index titles that have a Version matching the query.

**Query Params**:
- `versionTitle` (required): Version title to match
- `language` (optional): "he" or "en"

**Response**: `{ indices: ["Genesis", "Exodus", ...] }`

**Auth**: None (public read)

### `/api/version-bulk-edit` (POST)
Bulk update Version metadata.

**Auth**: `@staff_member_required`

**Request Body**:
```json
{
  "versionTitle": "...",
  "language": "he",
  "indices": ["Title1", "Title2"],
  "updates": { "field": "value" }
}
```

**Response**:
```json
{
  "status": "ok" | "partial" | "error",
  "count": 5,
  "total": 6,
  "successes": ["Genesis", "Exodus", ...],
  "failures": [{"index": "Leviticus", "error": "..."}]
}
```

### `/api/check-index-dependencies/{title}` (GET)
Checks what depends on an Index before making changes.

**Auth**: `@staff_member_required`

**Response**:
```json
{
  "has_dependencies": true,
  "dependent_count": 5,
  "dependent_indices": ["Commentary on X", ...],
  "version_count": 12,
  "link_count": 1500
}
```

### `/api/v2/raw/index/{title}` (POST)
Create or update an Index record.

**Auth**: Staff only

**Query Params**:
- `update=1`: Update existing record

**Request Body**: `json=<JSON-encoded Index object>`

### `/admin/reset/{title}` (GET)
Clears all caches for an Index.

**Auth**: Staff only

### `/admin/rebuild/auto-links/{title}` (GET)
Rebuilds automatic links for a commentary Index.

**Auth**: Staff only

---

## CSS Classes

Current styles are in `static/css/modtools.css` (579 lines):

| Class | Purpose |
|-------|---------|
| `.modTools` | Main container with "Internal Admin Tool" banner |
| `.modToolsSection` | Section wrapper with border and shadow |
| `.dlSectionTitle` | Section header with underline |
| `.dlVersionSelect` | Input/select elements |
| `.modtoolsButton` | Action buttons (variants: `.secondary`, `.danger`, `.small`) |
| `.indexSelectorContainer` | Index selector wrapper |
| `.selectionControls` | Select All/Deselect All header |
| `.indicesList` | Checkbox list container |
| `.fieldGroupSection` | Grouped field sections |
| `.fieldGroupGrid` | 2-column grid for fields |
| `.message` | Status messages (`.success`, `.error`, `.warning`, `.info`) |
| `.warningBox`, `.dangerBox`, `.infoBox` | Alert boxes |
| `.changesPreview` | Preview of pending changes |

---

## Known Issues

1. ~~**PyMongo TypeError**~~: Fixed - now uses `update_many()` in history.py and helper/text.py.

2. ~~**Partial Success Handling**~~: Fixed - API now returns detailed success/failure info.

3. **Timeout Risk**: Large bulk operations (50+ versions) may hit request timeouts. Consider batch processing for very large sets.

4. ~~**Missing Deselect All**~~: Fixed - IndexSelector now has both Select All and Deselect All buttons.

5. ~~**Input Types**~~: Fixed - License and boolean fields now use dropdown selects.

---

## File Structure

```
static/js/
  ModeratorToolsPanel.jsx       # Main panel, imports refactored components
  modtools/
    index.js                    # Module entry point with exports
    constants/
      fieldMetadata.js          # VERSION_FIELD_METADATA, INDEX_FIELD_METADATA
    components/
      BulkVersionEditor.jsx     # Version metadata bulk editor (#36475)
      BulkIndexEditor.jsx       # Index metadata bulk editor
      AutoLinkCommentaryTool.jsx # Commentary auto-linker
      NodeTitleEditor.jsx       # Schema node title editor
      shared/
        ModToolsSection.jsx     # Section wrapper component
        IndexSelector.jsx       # Checkbox list with select all/deselect all
        StatusMessage.jsx       # Status message display
        index.js                # Barrel export

sefaria/
  views.py                      # Backend API handlers
  urls.py                       # Route definitions
  model/
    text.py                     # Version, Index models
    history.py                  # History tracking
    abstract.py                 # Base MongoDB record class
  helper/
    text.py                     # Text manipulation helpers

static/css/
  modtools.css                  # Dedicated modtools styles (Sefaria design system)
```
