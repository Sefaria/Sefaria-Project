# AI Agent Guide: ModeratorToolsPanel

This document provides comprehensive context for AI coding agents working on the ModeratorToolsPanel. It is optimized for quick lookups, common tasks, and understanding the codebase structure.

---

## Quick Start

### What is ModTools?

ModTools is an internal admin interface at `/modtools` for Sefaria staff to perform bulk operations on texts. It consists of:

- **4 Refactored Tools** (React components with shared patterns)
- **6 Legacy Tools** (inline in ModeratorToolsPanel.jsx)
- **Shared Component Library** (IndexSelector, ModToolsSection, etc.)
- **Dedicated CSS** (modtools.css with design system)

### Key Files (Start Here)

| File | Purpose | When to Modify |
|------|---------|----------------|
| `static/js/ModeratorToolsPanel.jsx` | Main panel, imports tools | Adding new tools |
| `static/js/modtools/index.js` | Module exports | Adding new exports |
| `static/js/modtools/components/*.jsx` | Individual tools | Editing tool behavior |
| `static/js/modtools/components/shared/*.jsx` | Shared components | Editing shared UI |
| `static/js/modtools/constants/fieldMetadata.js` | Field definitions | Adding/editing fields |
| `static/css/modtools.css` | All styles | UI changes |
| `sefaria/views.py` | Backend APIs | API changes |

---

## File Structure

```
static/js/
├── ModeratorToolsPanel.jsx    # Main container, legacy tools, imports refactored
│
└── modtools/
    ├── index.js               # Module entry: exports all components
    │
    ├── constants/
    │   └── fieldMetadata.js   # VERSION_FIELD_METADATA, INDEX_FIELD_METADATA
    │
    └── components/
        ├── BulkVersionEditor.jsx      # Primary tool for SC-36475
        ├── BulkIndexEditor.jsx        # Index metadata bulk editor
        ├── AutoLinkCommentaryTool.jsx # Commentary auto-linker
        ├── NodeTitleEditor.jsx        # Schema node title editor
        │
        └── shared/
            ├── index.js               # Barrel export
            ├── ModToolsSection.jsx    # Collapsible section wrapper
            ├── HelpButton.jsx         # Help modal button
            ├── IndexSelector.jsx      # Card-based selection grid
            └── StatusMessage.jsx      # Auto-formatted messages

static/css/
└── modtools.css               # Complete design system

sefaria/
├── views.py                   # Backend API handlers
├── urls.py                    # Route definitions
└── model/
    └── text.py                # Version (~line 1270), Index (~line 172)

docs/modtools/
├── ARCHITECTURE.md            # Technical architecture
├── AI_AGENT_GUIDE.md          # This file
├── COMPONENT_LOGIC.md         # Detailed logic flows
├── DESIGN_SYSTEM.md           # UI/CSS documentation
└── PROGRESS.md                # Project tracking
```

---

## API Endpoints

### ModTools-Specific APIs

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/version-indices` | GET | Find indices with matching version | None |
| `/api/version-bulk-edit` | POST | Bulk update version metadata | Staff |
| `/api/check-index-dependencies/{title}` | GET | Check what depends on index | Staff |

### General APIs Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v2/raw/index/{title}?update=1` | POST | Create/update index |
| `/api/terms/{name}` | GET/POST | Check/create terms |
| `/api/name/{query}` | GET | Autocomplete/validate names |
| `/api/index` | GET | Full table of contents |
| `/admin/reset/{title}` | GET | Clear caches |
| `/admin/rebuild/auto-links/{title}` | GET | Rebuild commentary links |

### API Request/Response Patterns

**Version Bulk Edit Request**:
```json
{
  "versionTitle": "Kehati",
  "language": "he",
  "indices": ["Mishnah Berakhot", "Mishnah Peah"],
  "updates": { "license": "CC-BY", "priority": 1.5 }
}
```

**Version Bulk Edit Response**:
```json
{
  "status": "ok" | "partial" | "error",
  "count": 5,
  "total": 6,
  "successes": ["Mishnah Berakhot", ...],
  "failures": [{"index": "Mishnah Peah", "error": "..."}]
}
```

---

## Data Models

### Version Model (`sefaria/model/text.py:1270`)

**Collection**: `texts`

**Editable Fields** (via bulk edit):
```javascript
{
  status: string,           // "locked" = non-staff can't edit (tracker.py:33)
  priority: float,          // Display ordering
  license: string,          // e.g., "CC-BY", "Public Domain"
  versionNotes: string,     // English notes
  versionNotesInHebrew: string,
  versionTitleInHebrew: string,
  digitizedBySefaria: boolean,
  isPrimary: boolean,
  isSource: boolean,
  purchaseInformationURL: string,
  purchaseInformationImage: string,
  direction: string         // "rtl" or "ltr"
}
```

### Index Model (`sefaria/model/text.py:172`)

**Collection**: `index`

**Key Fields for Commentaries**:
```javascript
{
  dependence: "Commentary" | "Targum",
  base_text_titles: ["Genesis"],        // What it comments on
  base_text_mapping: "many_to_one_default_only",
  collective_title: "Rashi",            // Requires matching Term
  authors: ["rashi"]                    // Slugs from AuthorTopic
}
```

---

## Shared Components

### ModToolsSection

**Purpose**: Collapsible wrapper with help button.

**Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | string | - | English section title |
| `titleHe` | string | - | Hebrew section title |
| `helpContent` | ReactNode | - | JSX for help modal |
| `helpTitle` | string | title | Modal title |
| `defaultCollapsed` | boolean | true | Start collapsed? |
| `className` | string | "" | Additional CSS classes |

**Usage**:
```jsx
<ModToolsSection
  title="My Tool"
  titleHe="כלי שלי"
  helpContent={<><h3>Help</h3><p>...</p></>}
>
  {/* Tool content */}
</ModToolsSection>
```

### IndexSelector

**Purpose**: Card-based grid for selecting indices.

**Props**:
| Prop | Type | Description |
|------|------|-------------|
| `indices` | string[] | Array of index titles |
| `selectedIndices` | Set<string> | Currently selected |
| `onSelectionChange` | (Set) => void | Selection callback |
| `label` | string | Item label (e.g., "texts") |
| `indexMetadata` | object | `{ title: { categories: [...] } }` |
| `maxHeight` | string | Optional scroll height |

**Key Behavior**:
- Search filters by title AND category
- Select All operates on FILTERED items only
- Cards show category from indexMetadata

### StatusMessage

**Purpose**: Auto-styled status display.

**Detection**:
```javascript
"✅ Success" → class="success" (green)
"❌ Error"   → class="error" (red)
"⚠️ Warning" → class="warning" (amber)
"Info"      → class="info" (teal)
```

### HelpButton

**Purpose**: Modal with documentation.

**Key Implementation**:
- ESC key closes modal (captured before other handlers)
- Body scroll locked when open
- Uses portal-style positioning (fixed overlay)

---

## Common Tasks

### Adding a New Field to BulkVersionEditor

1. **Add to fieldMetadata.js**:
```javascript
export const VERSION_FIELD_METADATA = {
  // ... existing fields
  "newField": {
    label: "New Field",
    type: "text" | "textarea" | "select" | "number",
    placeholder: "...",
    help: "Description",
    options: [{ value: "", label: "None" }], // if select
    dir: "rtl" // if Hebrew
  }
};
```

2. **Add to FIELD_GROUPS** (BulkVersionEditor.jsx):
```javascript
const FIELD_GROUPS = [
  { id: 'metadata', fields: [..., 'newField'] }
];
```

3. **Handle special processing** (if needed in `save()`):
```javascript
if (processedUpdates.newField === 'some_value') {
  // Transform before sending to API
}
```

### Adding a New Tool

1. **Create component**: `static/js/modtools/components/NewTool.jsx`
2. **Export from index**: Add to `static/js/modtools/index.js`
3. **Import in main panel**: Add to `ModeratorToolsPanel.jsx`
4. **Add CSS**: If new styles needed, add to `modtools.css`

**Template**:
```jsx
import React, { useState } from 'react';
import $ from '../../sefaria/sefariaJquery';
import ModToolsSection from './shared/ModToolsSection';
import StatusMessage from './shared/StatusMessage';

const HELP_CONTENT = (<>...</>);

const NewTool = () => {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <ModToolsSection
      title="New Tool"
      titleHe="כלי חדש"
      helpContent={HELP_CONTENT}
    >
      {/* Tool content */}
      <StatusMessage message={msg} />
    </ModToolsSection>
  );
};

export default NewTool;
```

### Adding URL Validation

```javascript
const URL_FIELDS = ['versionSource', 'myNewUrlField'];

const isValidUrl = (string) => {
  if (!string) return true;
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

// In handleFieldChange:
if (URL_FIELDS.includes(field) && value && !isValidUrl(value)) {
  setValidationErrors(prev => ({...prev, [field]: "Invalid URL"}));
}
```

### Testing API Responses

```javascript
// In browser console at /modtools:
$.getJSON('/api/version-indices?versionTitle=Kehati&language=he')
  .done(d => console.log(d));

$.ajax({
  url: '/api/version-bulk-edit',
  type: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({...}),
  success: d => console.log(d)
});
```

---

## Patterns & Conventions

### State Pattern (All Tools)

```javascript
// Search state
const [vtitle, setVtitle] = useState("");
const [lang, setLang] = useState("");
const [searched, setSearched] = useState(false);

// Results state
const [indices, setIndices] = useState([]);
const [indexMetadata, setIndexMetadata] = useState({});
const [pick, setPick] = useState(new Set());

// Edit state
const [updates, setUpdates] = useState({});
const [validationErrors, setValidationErrors] = useState({});

// UI state
const [msg, setMsg] = useState("");
const [loading, setLoading] = useState(false);
const [saving, setSaving] = useState(false);
```

### Error Message Pattern

```javascript
setMsg("✅ Success message");   // Auto-styled green
setMsg("❌ Error: details");     // Auto-styled red
setMsg("⚠️ Partial success");    // Auto-styled amber
```

### Selection Pattern

```javascript
// Using Set for O(1) operations
const [pick, setPick] = useState(new Set());

// Toggle single item
const toggleOne = (idx, checked) => {
  const newSet = new Set(pick);
  if (checked) newSet.add(idx);
  else newSet.delete(idx);
  setPick(newSet);
};

// Pre-select all on load
setPick(new Set(resultIndices));
```

### CSS Class Pattern

```javascript
// Conditional classes
const className = `indexCard ${isSelected ? 'selected' : ''}`;

// Multiple conditions
const sectionClasses = [
  'modToolsSection',
  isCollapsed ? 'collapsed' : '',
  additionalClass
].filter(Boolean).join(' ');
```

---

## Troubleshooting

### "Version not found"

**Cause**: Version title is case-sensitive.
**Fix**: Ensure exact match including capitalization.

### "Author not found"

**Cause**: Author must exist in AuthorTopic.
**Fix**: Check `/api/name/{authorName}` for valid matches.

### "Timeout on large operations"

**Cause**: 50+ versions may exceed request timeout.
**Fix**: Process in smaller batches. Consider async job queue.

### "PyMongo TypeError"

**Cause**: PyMongo 4.x deprecated `.update()`.
**Fix**: Already fixed in history.py - use `.update_many()`.

### "Changes not appearing"

**Cause**: Cache not cleared.
**Fix**: Ensure `/admin/reset/{title}` is called after updates.

### "ESC key navigates away"

**Cause**: ESC handler not using capture phase.
**Fix**: Use `addEventListener('keydown', handler, true)`.

---

## Decision Trees

### When to use which tool?

```
Need to edit...
├── Version metadata (translations/editions)?
│   └── Use BulkVersionEditor
├── Index metadata (text catalog records)?
│   └── Use BulkIndexEditor
├── Commentary links?
│   └── Use AutoLinkCommentaryTool
└── Schema node titles?
    └── Use NodeTitleEditor
```

### Which mapping algorithm for auto-links?

```
Commentary structure:
├── Multiple comments per verse? (e.g., Rashi 1:1:1, 1:1:2)
│   └── Use "many_to_one_default_only"
├── One comment per verse? (e.g., translation)
│   └── Use "one_to_one_default_only"
└── Need alternate structures?
    └── Use "many_to_one" or "one_to_one"
```

### Boolean field handling?

```
HTML <select> returns string
├── User selects "Yes" → value = "true" (string)
├── API expects → value = true (boolean)
└── Before API call, convert:
    if (value === 'true') value = true;
    if (value === 'false') value = false;
```

---

## Useful Queries

### MongoDB

```javascript
// Find versions with specific versionTitle
db.texts.find({ versionTitle: "Kehati" }).count()

// Find versions marked for deletion
db.texts.find({ versionNotes: { $regex: "MARKED FOR DELETION" } })

// Find versions missing license
db.texts.find({ license: { $exists: false } }).count()
```

### Python

```python
from sefaria.model import VersionSet, Index

# Find versions
vs = VersionSet({"versionTitle": "Kehati"})
print(f"Found {vs.count()} versions")

# Get index dependencies
from sefaria.model import library
deps = library.get_dependant_indices("Genesis")
```

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - API contracts, data models
- [COMPONENT_LOGIC.md](./COMPONENT_LOGIC.md) - Detailed logic flows
- [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) - UI/CSS documentation
- [PROGRESS.md](./PROGRESS.md) - Project tracking

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-31 | Complete rewrite with comprehensive context |
| 2025-12-30 | Added shared components documentation |
| 2025-12-29 | Initial creation |
