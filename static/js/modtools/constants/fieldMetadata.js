/**
 * Field metadata definitions for Version editing tools.
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
 *
 * For AI agents: When adding new fields, ensure the backend model
 * (sefaria/model/text.py) supports the field as an optional_attr.
 */

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
