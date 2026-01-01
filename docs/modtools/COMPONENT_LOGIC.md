# ModTools Component Logic Documentation

This document provides detailed logic flows, decision trees, and implementation rationale for each ModTools component. It is designed to help developers understand how each tool works and make informed modifications.

---

## Table of Contents

1. [Shared Components](#shared-components)
2. [BulkVersionEditor](#bulkversioneditor)
3. [BulkIndexEditor](#bulkindexeditor)
4. [AutoLinkCommentaryTool](#autolinkcommentarytool)
5. [NodeTitleEditor](#nodetitleeditor)
6. [State Management Patterns](#state-management-patterns)
7. [Error Handling Patterns](#error-handling-patterns)

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

## BulkIndexEditor

**Purpose**: Bulk edit Index (text catalog) metadata with auto-detection for commentaries.

### Key Differences from BulkVersionEditor

1. **Updates Index records** (text metadata) not Version records (translations)
2. **Auto-detection** for commentary fields using "X on Y" title pattern
3. **Author validation** against AuthorTopic database
4. **Term creation** for collective titles
5. **Sequential API calls** (one per index) instead of single bulk call

### Commentary Auto-Detection Logic

```javascript
const detectCommentaryPattern = (title) => {
  const match = title.match(/^(.+?)\s+on\s+(.+)$/);
  if (match) {
    return {
      commentaryName: match[1].trim(),  // e.g., "Rashi"
      baseText: match[2].trim()          // e.g., "Genesis"
    };
  }
  return null;
};
```

**Usage in auto-detection**:
```javascript
// If user enters 'auto' for a field:
if (indexSpecificUpdates.dependence === 'auto') {
  indexSpecificUpdates.dependence = pattern ? 'Commentary' : undefined;
}

if (indexSpecificUpdates.base_text_titles === 'auto') {
  indexSpecificUpdates.base_text_titles = pattern ? [pattern.baseText] : undefined;
}

if (indexSpecificUpdates.collective_title === 'auto') {
  indexSpecificUpdates.collective_title = pattern ? pattern.commentaryName : undefined;
}
```

### Term Creation Flow

Terms are required for collective titles to display properly:

```javascript
const createTermIfNeeded = async (enTitle, heTitle) => {
  // 1. Check if term exists
  try {
    await $.get(`/api/terms/${encodeURIComponent(enTitle)}`);
    return true; // Already exists
  } catch (e) {
    if (e.status === 404) {
      // 2. Create new term
      await $.post(`/api/terms/${encodeURIComponent(enTitle)}`, {
        json: JSON.stringify({
          name: enTitle,
          titles: [
            { lang: "en", text: enTitle, primary: true },
            { lang: "he", text: heTitle, primary: true }
          ]
        })
      });
    }
  }
};
```

### TOC Zoom Handling

TOC zoom is applied to schema nodes, not the index directly:

```javascript
if ('toc_zoom' in indexSpecificUpdates) {
  const tocZoomValue = indexSpecificUpdates.toc_zoom;
  delete indexSpecificUpdates.toc_zoom; // Remove from direct updates

  // Apply to all JaggedArrayNode nodes in schema
  if (existingIndexData.schema?.nodes) {
    existingIndexData.schema.nodes.forEach(node => {
      if (node.nodeType === "JaggedArrayNode") {
        node.toc_zoom = tocZoomValue;
      }
    });
  } else if (existingIndexData.schema) {
    existingIndexData.schema.toc_zoom = tocZoomValue;
  }
}
```

---

## AutoLinkCommentaryTool

**Purpose**: Create automatic links between commentaries and their base texts.

### Workflow

```
[SEARCH] --> Filter for " on " pattern --> [COMMENTARIES_FOUND]
                                                    |
                                                    v
                                            [SELECT_COMMENTARIES]
                                                    |
                                                    v
                                            [CHOOSE_MAPPING]
                                                    |
                                                    v
                                            [CREATE_LINKS]
                                                    |
                                            For each commentary:
                                            1. Fetch index data
                                            2. Extract base text from title
                                            3. Patch index with commentary metadata
                                            4. Clear caches
                                            5. Rebuild auto-links
```

### Mapping Algorithm Selection

| Algorithm | Use Case | Structure |
|-----------|----------|-----------|
| `many_to_one_default_only` | Most commentaries | Rashi 1:1:1, 1:1:2, 1:1:3 → Genesis 1:1 |
| `many_to_one` | With alt structures | Same + alternate verse numberings |
| `one_to_one_default_only` | Translations | Chapter 1:1 = Chapter 1:1 |
| `one_to_one` | Translations + alts | Same + alternate structures |

### Idempotency

The tool is idempotent - running it multiple times is safe:
```javascript
if (!raw.base_text_titles || !raw.base_text_mapping) {
  // Only patch if fields are missing
  const patched = { ...raw, dependence: "Commentary", ... };
  await $.post(url, { json: JSON.stringify(patched) });
}
// Always rebuild links (safe to re-run)
await $.get(`/admin/rebuild/auto-links/${title}`);
```

---

## NodeTitleEditor

**Purpose**: Edit titles of schema nodes within an Index.

### Node Extraction Logic

Recursively traverses the schema to build a flat list of editable nodes:

```javascript
const extractNodes = (schema, path = []) => {
  let nodes = [];

  if (schema.nodes) {
    schema.nodes.forEach((node, index) => {
      const nodePath = [...path, index];
      nodes.push({
        path: nodePath,
        pathStr: nodePath.join('.'),  // "0.1.2" for nodes[0].nodes[1].nodes[2]
        node: node,
        sharedTitle: node.sharedTitle,
        title: node.title,
        heTitle: node.heTitle
      });

      // Recurse into children
      if (node.nodes) {
        nodes = nodes.concat(extractNodes(node, nodePath));
      }
    });
  }

  return nodes;
};
```

### Validation Rules

```javascript
// English titles: ASCII only, no special characters
const isValidEnglishTitle = (title) => {
  const isAscii = title.match(/^[\x00-\x7F]*$/);
  const noForbidden = !title.match(/[:.\\/-]/);
  return isAscii && noForbidden;
};

// Hebrew titles: No restrictions (any Unicode allowed)
```

### Shared Title Handling

Some nodes use "shared titles" (Terms) that can be reused across texts:

```javascript
// When removing shared title:
if (edits.removeSharedTitle) {
  delete targetNode.sharedTitle;
  // Node will now use direct title/heTitle fields
}
```

### Dependency Warning

Before editing, the tool checks what depends on this index:
```javascript
const checkDependencies = async (title) => {
  const response = await $.get(`/api/check-index-dependencies/${title}`);
  // Response includes: dependent_count, dependent_indices, version_count, link_count
};
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

BulkIndexEditor.jsx
  ├── imports: INDEX_FIELD_METADATA (fieldMetadata.js)
  ├── imports: Sefaria (for getIndexDetails)
  ├── imports: ModToolsSection, IndexSelector, StatusMessage (shared/)
  └── API: /api/version-indices, /api/v2/raw/index, /admin/reset, /api/terms

AutoLinkCommentaryTool.jsx
  ├── imports: BASE_TEXT_MAPPING_OPTIONS (fieldMetadata.js)
  ├── imports: Sefaria (for getIndexDetails)
  ├── imports: ModToolsSection, IndexSelector, StatusMessage (shared/)
  └── API: /api/version-indices, /api/v2/raw/index, /admin/reset, /admin/rebuild/auto-links

NodeTitleEditor.jsx
  ├── imports: Sefaria (for getIndexDetails)
  ├── imports: ModToolsSection, StatusMessage (shared/)
  └── API: /api/v2/raw/index, /admin/reset, /api/check-index-dependencies
```
