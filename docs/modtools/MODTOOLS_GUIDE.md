# ModTools Guide

This document provides comprehensive documentation for the ModeratorToolsPanel (`/modtools`), an internal admin interface for Sefaria staff to perform bulk operations on texts.

**Related**: [COMPONENT_LOGIC.md](./COMPONENT_LOGIC.md) - Detailed logic flows for each component

---

## Quick Start

### What is ModTools?

ModTools is an internal admin interface at `/modtools` for Sefaria staff. Access is restricted to authenticated moderators (`Sefaria.is_moderator`).

**URL**: `/modtools`
**Frontend Entry**: `static/js/ModeratorToolsPanel.jsx`
**Backend Views**: `sefaria/views.py`

### Key Files

| File | Purpose | When to Modify |
|------|---------|----------------|
| `static/js/ModeratorToolsPanel.jsx` | Main panel, imports tools | Adding new tools |
| `static/js/modtools/components/*.jsx` | Individual tools | Editing tool behavior |
| `static/js/modtools/components/shared/*.jsx` | Shared components | Editing shared UI |
| `static/js/modtools/constants/fieldMetadata.js` | Field definitions | Adding/editing fields |
| `static/css/modtools.css` | All styles | UI changes |
| `sefaria/views.py` | Backend APIs | API changes |

---

## File Structure

```
static/js/
├── ModeratorToolsPanel.jsx    # Main container, legacy tools
│
└── modtools/
    ├── index.js               # Module exports
    ├── constants/
    │   └── fieldMetadata.js   # VERSION_FIELD_METADATA, INDEX_FIELD_METADATA
    └── components/
        ├── BulkVersionEditor.jsx      # Version metadata bulk editor
        ├── BulkIndexEditor.jsx        # Index metadata (disabled)
        ├── AutoLinkCommentaryTool.jsx # Commentary linker (disabled)
        ├── NodeTitleEditor.jsx        # Node title editor (disabled)
        └── shared/
            ├── index.js
            ├── ModToolsSection.jsx    # Collapsible section wrapper
            ├── HelpButton.jsx         # Help modal button
            ├── IndexSelector.jsx      # Selection grid
            └── StatusMessage.jsx      # Message display

static/css/
└── modtools.css               # All modtools styles

sefaria/
├── views.py                   # Backend API handlers
├── urls.py                    # Route definitions
└── model/text.py              # Version and Index models
```

---

## Current Components

### Active Tools

**1. Bulk Download Text**
Downloads versions matching title/version patterns.
- Endpoint: `GET /download/bulk/versions/`

**2. Bulk Upload CSV**
Uploads text content from CSV files.
- Endpoint: `POST /api/text-upload`

**3. Workflowy Outline Upload**
Imports text structure from OPML files.
- Endpoint: `POST /modtools/upload_text`

**4. Upload Links (from CSV)**
Creates link records from CSV.
- Endpoint: `POST /modtools/links`

**5. Download Links**
Exports links between refs to CSV.
- Endpoint: `GET /modtools/links/{ref1}/{ref2}`

**6. Remove Links (from CSV)**
Deletes links from CSV.
- Endpoint: `POST /modtools/links` with `action: "DELETE"`

**7. Bulk Edit Version Metadata**
Edit metadata across multiple Version records.
- Endpoints: `GET /api/version-indices`, `POST /api/version-bulk-edit`

### Disabled Tools (Backend APIs Remain Functional)

- **BulkIndexEditor**: Bulk edit index metadata
- **AutoLinkCommentaryTool**: Auto-link commentaries
- **NodeTitleEditor**: Edit schema node titles

---

## API Endpoints

### ModTools-Specific APIs

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/version-indices` | GET | Find indices with matching version | None |
| `/api/version-bulk-edit` | POST | Bulk update version metadata | Staff |
| `/api/check-index-dependencies/{title}` | GET | Check index dependencies | Staff |

### Version Bulk Edit

**Request**:
```json
{
  "versionTitle": "Kehati",
  "language": "he",
  "indices": ["Mishnah Berakhot", "Mishnah Peah"],
  "updates": { "license": "CC-BY", "priority": 1.5 }
}
```

**Response**:
```json
{
  "status": "ok" | "partial" | "error",
  "successes": ["Mishnah Berakhot", ...],
  "failures": [{"index": "Mishnah Peah", "error": "..."}]
}
```

**Field Clearing**: Send `null` for a field to remove it entirely from MongoDB.

---

## Data Models

### Version Model (`sefaria/model/text.py`)

**Collection**: `texts`

**Editable Fields** (via bulk edit):
| Field | Type | Description |
|-------|------|-------------|
| `status` | string | "locked" = non-staff can't edit |
| `priority` | float | Display ordering |
| `license` | string | e.g., "CC-BY", "Public Domain" |
| `versionNotes` | string | English notes |
| `versionNotesInHebrew` | string | Hebrew notes |
| `versionTitleInHebrew` | string | Hebrew version title |
| `digitizedBySefaria` | boolean | Sefaria digitized flag |
| `isPrimary` | boolean | Primary version flag |
| `isSource` | boolean | Source (not translation) flag |
| `purchaseInformationURL` | string | Purchase link |
| `purchaseInformationImage` | string | Purchase image |
| `direction` | string | "rtl" or "ltr" |

### Index Model (`sefaria/model/text.py`)

**Collection**: `index`

**Key Fields for Commentaries**:
| Field | Type | Description |
|-------|------|-------------|
| `dependence` | string | "Commentary" or "Targum" |
| `base_text_titles` | list | What it comments on |
| `base_text_mapping` | string | AutoLinker mapping type |
| `collective_title` | string | Requires matching Term |
| `authors` | list | Slugs from AuthorTopic |

---

## Shared Components

### ModToolsSection

Collapsible wrapper with help button.

```jsx
<ModToolsSection
  title="My Tool"
  titleHe="כלי שלי"
  helpContent={<><h3>Help</h3><p>...</p></>}
>
  {/* Tool content */}
</ModToolsSection>
```

**Props**: `title`, `titleHe`, `helpContent`, `helpTitle`, `defaultCollapsed`, `className`

### IndexSelector

Card-based grid for selecting indices.

**Props**: `indices`, `selectedIndices`, `onSelectionChange`, `label`, `indexMetadata`, `maxHeight`

**Key Behavior**:
- Search filters by title AND category
- Select All operates on FILTERED items only

### StatusMessage

Auto-styled status display. Accepts string or `{type, message}` object.

**MESSAGE_TYPES**: `SUCCESS`, `ERROR`, `WARNING`, `INFO`

### HelpButton

Modal with documentation. ESC key closes, body scroll locked when open.

---

## Common Tasks

### Adding a New Field to BulkVersionEditor

1. **Add to fieldMetadata.js**:
```javascript
"newField": {
  label: "New Field",
  type: "text" | "textarea" | "select" | "number",
  placeholder: "...",
  help: "Description",
  dir: "rtl" // if Hebrew
}
```

2. **Add to FIELD_GROUPS** (BulkVersionEditor.jsx):
```javascript
const FIELD_GROUPS = [
  { id: 'metadata', fields: [..., 'newField'] }
];
```

### Adding a New Tool

1. Create component: `static/js/modtools/components/NewTool.jsx`
2. Export from: `static/js/modtools/index.js`
3. Import in: `ModeratorToolsPanel.jsx`
4. Add CSS if needed: `modtools.css`

**Template**:
```jsx
import React, { useState } from 'react';
import ModToolsSection from './shared/ModToolsSection';
import StatusMessage from './shared/StatusMessage';

const NewTool = () => {
  const [msg, setMsg] = useState("");
  return (
    <ModToolsSection title="New Tool" titleHe="כלי חדש">
      {/* Tool content */}
      <StatusMessage message={msg} />
    </ModToolsSection>
  );
};
export default NewTool;
```

---

## Patterns & Conventions

### State Pattern

```javascript
// Search state
const [vtitle, setVtitle] = useState("");
const [searched, setSearched] = useState(false);

// Results state
const [indices, setIndices] = useState([]);
const [pick, setPick] = useState(new Set());

// Edit state
const [updates, setUpdates] = useState({});
const [validationErrors, setValidationErrors] = useState({});

// UI state
const [msg, setMsg] = useState("");
const [loading, setLoading] = useState(false);
```

### Selection Pattern

```javascript
const [pick, setPick] = useState(new Set());

const toggleOne = (idx, checked) => {
  const newSet = new Set(pick);
  if (checked) newSet.add(idx);
  else newSet.delete(idx);
  setPick(newSet);
};
```

### Boolean Field Handling

HTML `<select>` returns strings. Convert before API call:
```javascript
if (value === 'true') value = true;
if (value === 'false') value = false;
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "Version not found" | Case-sensitive matching | Use exact capitalization |
| "Author not found" | Author must exist in AuthorTopic | Check `/api/name/{name}` |
| Timeout on large operations | 50+ versions may timeout | Process in smaller batches |
| Changes not appearing | Cache not cleared | Call `/admin/reset/{title}` |

---

## CSS Classes

Key classes in `modtools.css`:

| Class | Purpose |
|-------|---------|
| `.modToolsSection` | Collapsible section wrapper |
| `.modtoolsButton` | Action buttons (`.secondary`, `.danger`, `.small`) |
| `.indexCard` | Selection card (`.selected` = blue border) |
| `.message` | Status messages (`.success`, `.error`, `.warning`, `.info`) |
| `.fieldGroupGrid` | 2-column field layout |
