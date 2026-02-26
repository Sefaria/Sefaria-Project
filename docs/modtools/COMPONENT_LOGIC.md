# ModTools Component Logic Documentation

This document provides detailed logic flows, decision trees, and implementation rationale for each ModTools component.

**Related**: [MODTOOLS_GUIDE.md](./MODTOOLS_GUIDE.md) - Overview, APIs, common tasks

---

## Table of Contents

1. [Shared Components](#shared-components)
2. [BulkVersionEditor](#bulkversioneditor)
3. [State Management Patterns](#state-management-patterns)
4. [Error Handling Patterns](#error-handling-patterns)

---

## Shared Components

### ModToolsSection

**Purpose**: Unified wrapper providing consistent section styling, collapsible behavior, and integrated help.

**State Machine**:
```
[COLLAPSED] <--toggle--> [EXPANDED]
     |                        |
     |--- ESC key ignored     |--- ESC key ignored
     |--- Click header: expand |--- Click header: collapse
     |--- Enter/Space: expand  |--- Enter/Space: collapse
```

**Key Logic**:
```javascript
// Default state: collapsed for cleaner initial page
const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed = true);

// Toggle on header click or keyboard
const toggleCollapse = () => setIsCollapsed(prev => !prev);

// Help button click must NOT toggle collapse
const handleHelpClick = (e) => e.stopPropagation();
```

**Layout Structure**:
```
┌─────────────────────────────────────────────────────────┐
│ [▼/▶] Title  ................................  [?]      │  <- sectionHeader
├─────────────────────────────────────────────────────────┤
│                                                         │
│     Section Content (animated hide/show)                │  <- sectionContent
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Animation**: CSS-based using `max-height` and `opacity` transitions. The collapsed state sets `max-height: 0` and `opacity: 0` with `pointer-events: none`.

---

### IndexSelector

**Purpose**: Card-based grid for selecting indices with search filtering and bulk selection.

**State**:
```javascript
const [searchFilter, setSearchFilter] = useState('');

// Computed: filter indices by search term (title OR category match)
const filteredIndices = useMemo(() => {
  if (!searchFilter.trim()) return indices;
  return indices.filter(idx =>
    titleMatches(idx, search) || categoryMatches(idx, search)
  );
}, [indices, searchFilter, indexMetadata]);
```

**Selection Logic**:
```
User Action          | Result
---------------------|------------------------------------------
Click card           | Toggle single item
Check card checkbox  | Toggle single item (same as click)
Select All checkbox  | Add ALL FILTERED items to selection
Uncheck Select All   | Remove ALL FILTERED items from selection
Clear search         | Reset filter, selection unchanged
```

**Important**: Select All operates on FILTERED items only, not all items. This allows users to filter and bulk-select subsets.

**Card Display**:
```
┌──────────────────────────┐
│ [✓] Genesis              │
│     Tanakh • Torah       │  <- category from indexMetadata
└──────────────────────────┘
```

---

### HelpButton

**Purpose**: Modal dialog with detailed tool documentation.

**State Machine**:
```
[CLOSED] <--click button--> [OPEN]
    ^                          |
    |--- ESC key: close        |--- Click overlay: close
    |--- Click "Got it": close |
```

**Key Implementation Details**:

1. **ESC Key Handling**: Uses capture phase (`addEventListener(..., true)`) to intercept ESC before other handlers. This prevents ESC from also closing the section or navigating away.

2. **Body Scroll Lock**: When modal is open, sets `document.body.style.overflow = 'hidden'` to prevent background scrolling.

3. **Focus Trap**: Modal content uses `onClick={e => e.stopPropagation()}` to prevent clicks inside from closing the modal.

---

### StatusMessage

**Purpose**: Auto-formatted status display based on emoji prefix.

**Detection Logic**:
```javascript
// Prefix detection for message type
if (message.startsWith('✅')) return 'success';
if (message.startsWith('❌')) return 'error';
if (message.startsWith('⚠️')) return 'warning';
return 'info';
```

This pattern allows components to simply set a message string like `"✅ Updated 5 versions"` and the UI automatically applies appropriate styling.

---

## BulkVersionEditor

**Purpose**: Bulk edit Version metadata across multiple indices sharing a version title.

### Workflow State Machine

```
[INITIAL]
    |
    v
[ENTER_VERSION_TITLE] --> (empty) --> Error: "Please enter a version title"
    |
    v
[LOADING] --> (API call to /api/version-indices)
    |
    ├── (success, results > 0) --> [RESULTS_LOADED]
    |                                    |
    |                                    v
    |                              [INDICES_SELECTED]
    |                                    |
    |                                    ├── [EDITING_FIELDS]
    |                                    |        |
    |                                    |        v
    |                                    |   [SAVING] --> (API call)
    |                                    |        |
    |                                    |        ├── (success) --> Clear fields, show success
    |                                    |        ├── (partial) --> Show warning with failures
    |                                    |        └── (error) --> Show error message
    |                                    |
    |                                    └── [MARK_FOR_DELETION]
    |                                              |
    |                                              v
    |                                         [CONFIRM_DIALOG]
    |                                              |
    |                                              ├── (confirm) --> Add deletion note
    |                                              └── (cancel) --> Return to editing
    |
    ├── (success, results = 0) --> [NO_RESULTS]
    |
    └── (error) --> [ERROR_STATE]
```

### Key Decision Points

#### 1. URL Validation
```javascript
const URL_FIELDS = ['versionSource', 'purchaseInformationURL', 'purchaseInformationImage'];

const isValidUrl = (string) => {
  if (!string) return true; // Empty is valid (field is optional)
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};
```

#### 2. Boolean Field Conversion
The API expects actual booleans, but HTML selects return strings:
```javascript
['digitizedBySefaria', 'isPrimary', 'isSource'].forEach(field => {
  if (processedUpdates[field] === 'true') processedUpdates[field] = true;
  else if (processedUpdates[field] === 'false') processedUpdates[field] = false;
});
```

#### 3. Field Grouping
Fields are organized into logical groups for UX:
```javascript
const FIELD_GROUPS = [
  { id: 'identification', header: 'Version Identification',
    fields: ['versionTitle', 'versionTitleInHebrew'] },
  { id: 'source', header: 'Source & License',
    fields: ['versionSource', 'license', 'purchaseInformationURL', 'purchaseInformationImage'] },
  { id: 'metadata', header: 'Metadata',
    fields: ['status', 'priority', 'digitizedBySefaria', 'isPrimary', 'isSource', 'direction'] },
  { id: 'notes', header: 'Notes',
    fields: ['versionNotes', 'versionNotesInHebrew'] }
];
```

#### 4. Soft Delete Implementation
Versions are NOT deleted immediately. Instead, a note is added:
```javascript
const deletionNote = `[MARKED FOR DELETION - ${new Date().toISOString().split('T')[0]}]`;
// This note is searchable in MongoDB for cleanup scripts
```

### API Interaction

**Load Indices**:
```
GET /api/version-indices?versionTitle=X&language=Y
Response: { indices: [...], metadata: { indexTitle: { categories: [...] } } }
```

**Save Changes**:
```
POST /api/version-bulk-edit
Body: { versionTitle, language, indices: [...], updates: {...} }
Response: { status: "ok"|"partial"|"error", count, total, successes, failures }
```

---

## State Management Patterns

### Common State Categories

All tools follow this pattern:

```javascript
// 1. Search/Filter State
const [vtitle, setVtitle] = useState("");
const [lang, setLang] = useState("");
const [searched, setSearched] = useState(false);

// 2. Results State
const [indices, setIndices] = useState([]);
const [indexMetadata, setIndexMetadata] = useState({});
const [pick, setPick] = useState(new Set());  // Selected items

// 3. Edit State
const [updates, setUpdates] = useState({});
const [validationErrors, setValidationErrors] = useState({});

// 4. UI State
const [msg, setMsg] = useState("");
const [loading, setLoading] = useState(false);
const [saving, setSaving] = useState(false);
```

### Selection Pattern (Set-based)

```javascript
// Using Set for O(1) add/remove/check
const [pick, setPick] = useState(new Set());

// Toggle single item
const toggleOne = (index, checked) => {
  const newSet = new Set(pick);
  if (checked) newSet.add(index);
  else newSet.delete(index);
  setPick(newSet);
};

// Bulk operations
const selectAll = () => setPick(new Set([...pick, ...filteredIndices]));
const deselectAll = () => {
  const newSet = new Set(pick);
  filteredIndices.forEach(idx => newSet.delete(idx));
  setPick(newSet);
};
```

---

## Error Handling Patterns

### API Error Extraction

```javascript
const extractErrorMessage = (xhr) => {
  return xhr.responseJSON?.error ||
         xhr.responseText ||
         xhr.statusText ||
         "Unknown error";
};
```

### Partial Success Handling

```javascript
// API returns detailed status
if (d.status === "ok") {
  setMsg(`✅ Successfully updated ${d.count} versions`);
} else if (d.status === "partial") {
  const failures = d.failures.map(f => `${f.index}: ${f.error}`).join("; ");
  setMsg(`⚠️ Updated ${d.count}/${d.total}. Failures: ${failures}`);
} else {
  setMsg(`❌ All updates failed`);
}
```

### Validation Before Save

```javascript
const save = () => {
  // 1. Check selections exist
  if (!pick.size) {
    setMsg("❌ No indices selected");
    return;
  }

  // 2. Check changes exist
  if (!Object.keys(updates).length) {
    setMsg("❌ No fields to update");
    return;
  }

  // 3. Check validation errors
  if (Object.keys(validationErrors).length > 0) {
    setMsg("❌ Please fix validation errors before saving");
    return;
  }

  // Proceed with save...
};
```

---

## Appendix: File Dependencies

```
BulkVersionEditor.jsx
  ├── imports: VERSION_FIELD_METADATA (fieldMetadata.js)
  ├── imports: ModToolsSection, IndexSelector, StatusMessage (shared/)
  └── API: /api/version-indices, /api/version-bulk-edit
```
