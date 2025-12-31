# AI Agent Guide: ModeratorToolsPanel

This document provides context for AI coding agents working on the ModeratorToolsPanel.

## Quick Reference

### File Locations
| What | Where |
|------|-------|
| Main Component | `static/js/ModeratorToolsPanel.jsx` |
| BulkVersionEditor | `static/js/modtools/components/BulkVersionEditor.jsx` |
| BulkIndexEditor | `static/js/modtools/components/BulkIndexEditor.jsx` |
| AutoLinkCommentaryTool | `static/js/modtools/components/AutoLinkCommentaryTool.jsx` |
| NodeTitleEditor | `static/js/modtools/components/NodeTitleEditor.jsx` |
| Shared Components | `static/js/modtools/components/shared/` |
| Field Metadata | `static/js/modtools/constants/fieldMetadata.js` |
| Module Entry Point | `static/js/modtools/index.js` |
| Backend APIs | `sefaria/views.py` (search for "modtools" or "version_bulk") |
| URL Routes | `sefaria/urls.py` |
| CSS Styles | `static/css/modtools.css` |
| Version Model | `sefaria/model/text.py` (class Version, ~line 1270) |
| Index Model | `sefaria/model/text.py` (class Index, ~line 172) |

### Key API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/version-indices` | GET | Find indices with matching version |
| `/api/version-bulk-edit` | POST | Bulk update version metadata |
| `/api/check-index-dependencies/{title}` | GET | Check what depends on an index |
| `/api/v2/raw/index/{title}?update=1` | POST | Update index record |
| `/admin/reset/{title}` | GET | Clear caches for index |
| `/admin/rebuild/auto-links/{title}` | GET | Rebuild commentary links |

---

## Data Model Gotchas

### Version Fields
```javascript
// These are the VALID optional_attrs for Version (from text.py:1310)
const VERSION_EDITABLE_FIELDS = [
  "status",           // string - version status. "locked" = non-staff can't edit (see tracker.py:33)
  "priority",         // float - ordering priority
  "license",          // string - license info
  "versionNotes",     // string - English notes
  "versionNotesInHebrew",  // string - Hebrew notes
  "versionTitleInHebrew",  // string - Hebrew version title
  "digitizedBySefaria",    // boolean
  "isPrimary",        // boolean - is this the primary version?
  "isSource",         // boolean - is this original (not translation)?
  "purchaseInformationURL",    // string
  "purchaseInformationImage",  // string
  "direction",        // string - "rtl" or "ltr"
  // Note: "versionTitle" and "language" are required, not optional
];
```

### Index Commentary Fields
```javascript
// For commentary texts (e.g., "Rashi on Genesis")
{
  "dependence": "Commentary",  // or "Targum"
  "base_text_titles": ["Genesis"],  // what it comments on
  "base_text_mapping": "many_to_one_default_only",  // linker algorithm
  "collective_title": "Rashi"  // shared title across commentaries
}
```

### Title Validation Rules
```python
# Index titles must:
# - Be ASCII only (no Hebrew in title field)
# - Not contain: . : - / \
# - heTitle field is for Hebrew title

# Node titles within schema follow same rules
```

---

## Common Patterns

### Loading Indices by Version
```javascript
// Frontend - API returns indices with category metadata
$.getJSON(`/api/version-indices?versionTitle=${encodeURIComponent(vtitle)}&language=${lang}`)
  .done(d => {
    setIndices(d.indices);
    setIndexMetadata(d.metadata); // { "Genesis": { categories: [...] }, ... }
  })
  .fail(xhr => setError(xhr.responseText));
```

### Bulk Updating Versions
```javascript
// Frontend
$.ajax({
  url: "/api/version-bulk-edit",
  type: "POST",
  contentType: "application/json",
  data: JSON.stringify({
    versionTitle: vtitle,
    language: lang,
    indices: Array.from(selectedIndices),
    updates: { license: "CC-BY", priority: 1 }
  })
});

// Backend (views.py)
@staff_member_required
def version_bulk_edit_api(request):
    data = json.loads(request.body)
    for t in data["indices"]:
        v = Version().load({"title": t, "versionTitle": data["versionTitle"], "language": data["language"]})
        for k, val in data["updates"].items():
            setattr(v, k, val)
        v.save()  # This triggers history callbacks!
```

### Updating Index Records
```javascript
// Must use the raw API with full index object
const url = `/api/v2/raw/index/${encodeURIComponent(title.replace(/ /g, "_"))}?update=1`;
await $.ajax({
  url,
  type: 'POST',
  data: { json: JSON.stringify(indexObject) }
});
// Always reset cache after
await $.get(`/admin/reset/${encodeURIComponent(title)}`);
```

### Field Metadata Pattern
```javascript
// Current pattern for defining editable fields
const FIELD_METADATA = {
  "fieldName": {
    label: "Display Label",
    type: "text" | "textarea" | "select" | "array" | "number" | "daterange",
    placeholder: "Helper text",
    help: "Longer description",
    dir: "rtl",  // optional, for Hebrew fields
    auto: true,  // optional, supports 'auto' value for auto-detection
    options: [{ value: "", label: "None" }],  // for select type
    validate: (value) => boolean  // optional validation
  }
};
```

---

## Known Issues (Resolved)

The following issues have been fixed but are documented here for context:

### 1. PyMongo Deprecated Method - FIXED
**Location**: `sefaria/model/history.py`
**Resolution**: Changed `db.history.update()` to `db.history.update_many()` for PyMongo 4.x compatibility.

### 2. Partial Success Handling - FIXED
**Location**: `version_bulk_edit_api` in views.py
**Resolution**: API now returns `{status, count, total, successes, failures}` for detailed feedback.

### 3. Timeout on Large Operations - KNOWN LIMITATION
**Issue**: Bulk operations on 50+ versions may timeout.
**Workaround**: Process in smaller batches. Consider async job queue for future improvement.

---

## CSS Class Reference

The new `modtools.css` uses CSS variables for consistent styling:

```css
/* CSS Variables (Sefaria Design System) */
:root {
  --modtools-primary: #18345D;
  --modtools-success: #28a745;
  --modtools-warning: #ffc107;
  --modtools-error: #dc3545;
}

/* Main container */
.modTools { width: 80%; max-width: 1200px; margin: 0 auto; }

/* Section wrapper */
.modToolsSection { border: 1px solid #ccc; padding: 24px; border-radius: 8px; }

/* Section title */
.dlSectionTitle { color: var(--modtools-primary); border-bottom: 2px solid; }

/* Buttons */
.modtoolsButton { background-color: var(--modtools-primary); }
.modtoolsButton.secondary { background: white; border: 1px solid var(--modtools-primary); }
.modtoolsButton.danger { background-color: var(--modtools-error); }
.modtoolsButton.small { padding: 6px 12px; font-size: 13px; }

/* Selection controls */
.indexSelectorContainer { }
.selectionControls { display: flex; justify-content: space-between; }
.indexCards { display: grid; grid-template-columns: repeat(3, 1fr); }
.indexCard { /* Card with optional blue left border when selected */ }

/* Field groups */
.fieldGroupSection { background: #f9f9f9; padding: 16px; border-radius: 6px; }
.fieldGroupHeader { text-transform: uppercase; color: #666; }
.fieldGroupGrid { display: grid; grid-template-columns: repeat(2, 1fr); }
.fieldGroup.hasError input { border-color: var(--modtools-error); }
.fieldError { color: var(--modtools-error); font-size: 12px; }

/* Messages */
.message.success { background: #d4edda; }
.message.warning { background: #fff3cd; }
.message.error { background: #f8d7da; }
.warningBox { background: #fff3cd; }
.dangerBox { background: #f8d7da; }
.infoBox { background: #d1ecf1; }
.noResults { text-align: center; background: #f9f9f9; }
.changesPreview { background: #e7f3ff; }
```

---

## Testing Approach

### Frontend (Jest)
```javascript
// Location: static/js/modtools/__tests__/
import { render, screen, fireEvent } from '@testing-library/react';
import BulkVersionEditor from '../components/BulkVersionEditor';

describe('BulkVersionEditor', () => {
  it('loads indices when Load button clicked', async () => {
    // Mock API
    global.$ = { getJSON: jest.fn().mockResolvedValue({ indices: ['Genesis'] }) };

    render(<BulkVersionEditor />);
    fireEvent.change(screen.getByPlaceholderText(/version title/i), { target: { value: 'Test' } });
    fireEvent.click(screen.getByText('Load'));

    expect(await screen.findByText('Genesis')).toBeInTheDocument();
  });
});
```

### Backend (Pytest)
```python
# Location: sefaria/tests/test_modtools_api.py
import pytest
from django.test import Client

@pytest.mark.django_db
def test_version_indices_api():
    client = Client()
    response = client.get('/api/version-indices', {'versionTitle': 'Tanach'})
    assert response.status_code == 200
    data = response.json()
    assert 'indices' in data
```

---

## Decisions Log

Track decisions made:

| Decision | Context | Status |
|----------|---------|--------|
| Bulk delete: soft delete | Version deletion adds note to versionNotes field with `[MARKED FOR DELETION - date]` prefix | ✅ Implemented |
| Status field values | "locked" = non-staff can't edit (tracker.py:33), "" = editable | ✅ Documented |
| CSS approach | Created dedicated `modtools.css` instead of extending s2.css | ✅ Implemented |
| Field grouping | Fields organized into: Identification, Source & License, Metadata, Notes | ✅ Implemented |
| URL validation | versionSource, purchaseInformationURL, purchaseInformationImage validate as URLs | ✅ Implemented |

---

## Current File Structure

The modtools have been refactored to this structure:

```
static/js/modtools/
  index.js                      # Module entry point with exports
  constants/
    fieldMetadata.js            # VERSION_FIELD_METADATA, INDEX_FIELD_METADATA
  components/
    BulkVersionEditor.jsx       # Primary tool for #36475
    BulkIndexEditor.jsx         # Bulk edit index metadata
    AutoLinkCommentaryTool.jsx  # Create commentary links
    NodeTitleEditor.jsx         # Edit schema node titles
    shared/
      ModToolsSection.jsx       # Section wrapper with title
      IndexSelector.jsx         # Card-based grid with search and Select All
      StatusMessage.jsx         # Status/error message display
      index.js                  # Barrel export

static/css/
  modtools.css                  # Dedicated styles (Sefaria design system)
```

### Shared Components

- **ModToolsSection**: Wrapper providing consistent section styling with title
- **IndexSelector**: Card-based grid with search filtering, Select All checkbox, and category display
- **StatusMessage**: Auto-detects message type from emoji prefix (✅, ❌, ⚠️)

---

## Useful Queries

### Find all versions with a specific versionTitle
```javascript
// MongoDB
db.texts.find({ versionTitle: "Torat Emet 357" }).count()

// Python
from sefaria.model import VersionSet
vs = VersionSet({"versionTitle": "Torat Emet 357"})
print(f"Found {vs.count()} versions")
```

### Check what depends on an Index
```python
from sefaria.model import library
deps = library.get_dependant_indices(title)
```

### Find versions missing a field
```javascript
// MongoDB
db.texts.find({ license: { $exists: false } }).count()
```
