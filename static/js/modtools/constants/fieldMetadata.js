/**
 * Field metadata definitions for Index and Version editing tools.
 *
 * This file centralizes the field configuration for bulk editing operations,
 * making it easier to maintain consistency across the modtools components.
 *
 * Field types:
 * - text: Single-line text input
 * - textarea: Multi-line text input
 * - select: Dropdown with predefined options
 * - array: Comma-separated list that converts to array
 * - number: Numeric input with optional min/max
 * - daterange: Date or date range (year or [start, end] format)
 *
 * For AI agents: When adding new fields, ensure the backend model
 * (sefaria/model/text.py) supports the field as an optional_attr.
 */

/**
 * INDEX_FIELD_METADATA
 *
 * Defines editable fields for Index records (text metadata).
 * These correspond to fields in the Index model (sefaria/model/text.py).
 */
export const INDEX_FIELD_METADATA = {
  "enDesc": {
    label: "English Description",
    type: "textarea",
    placeholder: "A description of the text in English"
  },
  "enShortDesc": {
    label: "Short English Description",
    type: "textarea",
    placeholder: "Brief description (1-2 sentences)"
  },
  "heDesc": {
    label: "Hebrew Description",
    type: "textarea",
    placeholder: "תיאור הטקסט בעברית",
    dir: "rtl"
  },
  "heShortDesc": {
    label: "Hebrew Short Description",
    type: "textarea",
    placeholder: "תיאור קצר (משפט או שניים)",
    dir: "rtl"
  },
  "categories": {
    label: "Category",
    type: "array",
    placeholder: "Select category...",
    help: "The category path determines where this text appears in the library"
  },
  "authors": {
    label: "Authors",
    type: "array",
    placeholder: "Author names (one per line or comma-separated)",
    help: "Enter author names. Backend expects a list of strings. Use 'auto' to detect from title.",
    auto: true
  },
  "compDate": {
    label: "Composition Date",
    type: "daterange",
    placeholder: "[1040, 1105] or 1105 or -500",
    help: "Year or range [start, end]. Negative for BCE. Arrays auto-convert to single year if identical."
  },
  "compPlace": {
    label: "Composition Place",
    type: "text",
    placeholder: "e.g., 'Troyes, France'"
  },
  "heCompPlace": {
    label: "Hebrew Composition Place",
    type: "text",
    placeholder: "למשל: 'טרואה, צרפת'",
    dir: "rtl"
  },
  "pubDate": {
    label: "Publication Date",
    type: "daterange",
    placeholder: "[1475, 1475] or 1475",
    help: "First publication year or range"
  },
  "pubPlace": {
    label: "Publication Place",
    type: "text",
    placeholder: "e.g., 'Venice, Italy'"
  },
  "hePubPlace": {
    label: "Hebrew Publication Place",
    type: "text",
    placeholder: "למשל: 'ונציה, איטליה'",
    dir: "rtl"
  },
  "toc_zoom": {
    label: "TOC Zoom Level",
    type: "number",
    placeholder: "0-10",
    help: "Controls how deep the table of contents displays by default (0=fully expanded). Must be an integer.",
    validate: (value) => {
      if (value === "" || value === null || value === undefined) return true;
      const num = parseInt(value);
      return !isNaN(num) && num >= 0 && num <= 10;
    }
  },
  "dependence": {
    label: "Dependence Type",
    type: "select",
    placeholder: "Select dependence type",
    help: "Is this text dependent on another text? (e.g., Commentary on a base text)",
    options: [
      { value: "", label: "None" },
      { value: "Commentary", label: "Commentary" },
      { value: "Targum", label: "Targum" },
      { value: "auto", label: "Auto-detect from title" }
    ],
    auto: true
  },
  "base_text_titles": {
    label: "Base Text Titles",
    type: "array",
    placeholder: "Base text names (one per line or comma-separated)",
    help: "Enter base text names that this commentary depends on. Use 'auto' to detect from title (e.g., 'Genesis' for 'Rashi on Genesis'). Backend expects a list of strings.",
    auto: true
  },
  "collective_title": {
    label: "English Collective Title",
    type: "text",
    placeholder: "Collective title or 'auto' for auto-detection",
    help: "Enter collective title or type 'auto' to detect from title (e.g., 'Rashi' for 'Rashi on Genesis'). If Hebrew equivalent is provided, term will be created automatically.",
    auto: true
  },
  "he_collective_title": {
    label: "Hebrew Collective Title (Term)",
    type: "text",
    placeholder: "Hebrew equivalent of collective title",
    help: "Hebrew equivalent of the collective title. If the term doesn't exist, it will be created automatically with both English and Hebrew titles.",
    dir: "rtl"
  }
};

/**
 * VERSION_FIELD_METADATA
 *
 * Defines editable fields for Version records (text versions/translations).
 * These correspond to optional_attrs in the Version model (sefaria/model/text.py:1310).
 *
 * Note: "versionTitle" and "language" are required fields, not optional.
 *
 * Special field: "status"
 *   - When set to "locked", non-staff users cannot edit the version
 *   - See sefaria/tracker.py:33 for enforcement logic
 */
export const VERSION_FIELD_METADATA = {
  "versionTitle": {
    label: "Version Title",
    type: "text",
    placeholder: "e.g., 'Torat Emet 357'",
    help: "The unique identifier for this version",
    required: true
  },
  "versionTitleInHebrew": {
    label: "Hebrew Version Title",
    type: "text",
    placeholder: "כותרת הגרסה בעברית",
    dir: "rtl"
  },
  "versionSource": {
    label: "Version Source URL",
    type: "text",
    placeholder: "https://...",
    help: "URL to the original source of this text version"
  },
  "license": {
    label: "License",
    type: "select",
    placeholder: "Select license",
    options: [
      { value: "", label: "None specified" },
      { value: "CC-BY", label: "CC-BY" },
      { value: "CC-BY-SA", label: "CC-BY-SA" },
      { value: "CC-BY-NC", label: "CC-BY-NC" },
      { value: "CC-BY-NC-SA", label: "CC-BY-NC-SA" },
      { value: "CC0", label: "CC0 (Public Domain)" },
      { value: "Public Domain", label: "Public Domain" },
      { value: "Copyright", label: "Copyright" }
    ]
  },
  "status": {
    label: "Status",
    type: "select",
    placeholder: "Select status",
    help: "When set to 'locked', non-staff users cannot edit this version (see tracker.py:33)",
    options: [
      { value: "", label: "None (editable)" },
      { value: "locked", label: "Locked (staff only)" }
    ]
  },
  "priority": {
    label: "Priority",
    type: "number",
    placeholder: "e.g., 1.0",
    help: "Float value for ordering. Higher priority versions appear first."
  },
  "digitizedBySefaria": {
    label: "Digitized by Sefaria",
    type: "select",
    options: [
      { value: "", label: "Not specified" },
      { value: "true", label: "Yes" },
      { value: "false", label: "No" }
    ]
  },
  "isPrimary": {
    label: "Is Primary Version",
    type: "select",
    help: "Mark as the primary version for this language",
    options: [
      { value: "", label: "Not specified" },
      { value: "true", label: "Yes" },
      { value: "false", label: "No" }
    ]
  },
  "isSource": {
    label: "Is Source (Original)",
    type: "select",
    help: "Is this the original text (not a translation)?",
    options: [
      { value: "", label: "Not specified" },
      { value: "true", label: "Yes (original)" },
      { value: "false", label: "No (translation)" }
    ]
  },
  "versionNotes": {
    label: "Version Notes (English)",
    type: "textarea",
    placeholder: "Notes about this version in English"
  },
  "versionNotesInHebrew": {
    label: "Version Notes (Hebrew)",
    type: "textarea",
    placeholder: "הערות על גרסה זו",
    dir: "rtl"
  },
  "purchaseInformationURL": {
    label: "Purchase URL",
    type: "text",
    placeholder: "https://..."
  },
  "purchaseInformationImage": {
    label: "Purchase Image URL",
    type: "text",
    placeholder: "https://..."
  },
  "direction": {
    label: "Text Direction",
    type: "select",
    help: "Override text direction (rarely needed)",
    options: [
      { value: "", label: "Auto (based on language)" },
      { value: "rtl", label: "Right-to-Left (RTL)" },
      { value: "ltr", label: "Left-to-Right (LTR)" }
    ]
  }
};

/**
 * ALL_VERSION_FIELDS
 *
 * Simple array of all version field names for backward compatibility
 * with the original BulkVersionEditor implementation.
 */
export const ALL_VERSION_FIELDS = [
  "versionTitle", "versionTitleInHebrew",
  "versionSource", "license", "status",
  "priority", "digitizedBySefaria",
  "isPrimary", "isSource",
  "versionNotes", "versionNotesInHebrew",
  "purchaseInformationURL", "purchaseInformationImage",
  "direction"
];

/**
 * BASE_TEXT_MAPPING_OPTIONS
 *
 * Options for the base_text_mapping field used in commentary linking.
 * See sefaria/model/link.py for implementation details.
 */
export const BASE_TEXT_MAPPING_OPTIONS = [
  { value: "many_to_one_default_only", label: "many_to_one_default_only (Mishnah / Tanakh)" },
  { value: "many_to_one", label: "many_to_one" },
  { value: "one_to_one_default_only", label: "one_to_one_default_only" },
  { value: "one_to_one", label: "one_to_one" }
];

/**
 * LINK_TYPE_OPTIONS
 *
 * Valid link types for the links upload/download tools.
 */
export const LINK_TYPE_OPTIONS = [
  { value: "commentary", label: "Commentary" },
  { value: "quotation", label: "Quotation" },
  { value: "related", label: "Related" },
  { value: "mesorat hashas", label: "Mesorat HaShas" },
  { value: "ein mishpat", label: "Ein Mishpat" },
  { value: "reference", label: "Reference" }
];
