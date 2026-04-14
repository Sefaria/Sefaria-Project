/**
 * BulkVersionEditor - Bulk edit Version metadata across multiple indices
 *
 * Workflow:
 * 1. User enters a versionTitle (e.g., "Kehati") and optionally filters by language
 * 2. Component loads all indices that have versions matching that versionTitle
 * 3. User selects which indices to update
 * 4. User fills in fields to change
 * 5. On save, bulk API updates all selected versions
 *
 * Backend API: POST /api/version-bulk-edit
 * - Returns detailed success/failure info for partial success handling
 * - See sefaria/views.py version_bulk_edit_api()
 *
 * Documentation:
 * - See /docs/modtools/MODTOOLS_GUIDE.md for quick reference
 * - See /docs/modtools/COMPONENT_LOGIC.md for detailed implementation logic
 * - Version fields are defined in ../constants/fieldMetadata.js
 */
import React, { useState, useCallback } from 'react';
import Sefaria from '../../sefaria/sefaria';
import { VERSION_FIELD_METADATA } from '../constants/fieldMetadata';
import ModToolsSection from './shared/ModToolsSection';
import IndexSelector from './shared/IndexSelector';
import StatusMessage, { MESSAGE_TYPES } from './shared/StatusMessage';

/**
 * Detailed help documentation for this tool
 */
const HELP_CONTENT = (
  <>
    <h3>What This Tool Does</h3>
    <p>
      This tool edits <strong>Version metadata</strong> across multiple texts simultaneously.
      A "Version" in Sefaria represents a specific translation or edition of a text
      (e.g., "Kehati" commentary on Mishnah, or "JPS 1917" translation of Tanakh).
    </p>
    <p>
      Use this tool when you need to update the same metadata fields across many versions
      that share a common version title. For example, updating the license information
      for all "Kehati" versions, or adding source URLs for all "Torat Emet 357" texts.
    </p>

    <h3>How It Works</h3>
    <ol>
      <li><strong>Search:</strong> Enter the exact version title (case-sensitive) to find all texts with matching versions.</li>
      <li><strong>Select:</strong> Choose which texts to update. All are selected by default.</li>
      <li><strong>Edit:</strong> Fill in only the fields you want to change. Empty fields are ignored.</li>
      <li><strong>Save:</strong> Click "Update" to apply changes to all selected versions.</li>
    </ol>

    <h3>Renaming Version Titles</h3>
    <p>
      You can rename the <code>versionTitle</code> (database identifier) across all selected texts
      using the "New Version Title" field. This is a significant operation — the rename cascades
      to history records, search index, links, and other collections. However, some side effects
      cannot be fixed automatically: existing bookmarks and shared links will break, user version
      preferences may reset, and source sheet references will keep the old title.
    </p>

    <h3>Available Fields</h3>
    <table className="field-table">
      <thead>
        <tr><th>Field</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><code>versionTitleInHebrew</code></td><td>Hebrew version of the title for Hebrew interface</td></tr>
        <tr><td><code>versionSource</code></td><td>URL where the original text was sourced from (must be valid URL)</td></tr>
        <tr><td><code>license</code></td><td>Copyright/license type (e.g., "Public Domain", "CC-BY")</td></tr>
        <tr><td><code>status</code></td><td>"locked" prevents non-staff from editing; empty/unset allows edits</td></tr>
        <tr><td><code>priority</code></td><td>Display priority (higher = shown first). Use decimal values like 1.5</td></tr>
        <tr><td><code>digitizedBySefaria</code></td><td>Whether Sefaria digitized this version (true/false)</td></tr>
        <tr><td><code>isPrimary</code></td><td>Whether this is the primary version for this language (true/false)</td></tr>
        <tr><td><code>isSource</code></td><td>Whether this is a source text, not a translation (true/false)</td></tr>
        <tr><td><code>direction</code></td><td>Text direction: "rtl" or "ltr"</td></tr>
        <tr><td><code>versionNotes</code></td><td>English notes about this version (shown to users)</td></tr>
        <tr><td><code>versionNotesInHebrew</code></td><td>Hebrew notes about this version</td></tr>
        <tr><td><code>purchaseInformationURL</code></td><td>Link to purchase the physical book</td></tr>
        <tr><td><code>purchaseInformationImage</code></td><td>Image URL for the purchase link</td></tr>
      </tbody>
    </table>

    <h3>Clearing Fields</h3>
    <p>
      Each field has a "Clear this field" checkbox below it.
      When checked, that field will be completely removed from all selected versions (not set to empty string).
    </p>
    <p>
      <strong>Use this when:</strong> You want to remove a field entirely from multiple versions.
      For example, removing outdated <code>purchaseInformationURL</code> links from all versions in a series.
    </p>
    <p>
      <strong>Note:</strong> When a field is marked for clearing, its input is disabled and any value you entered is ignored.
      The field will be deleted from the database, not set to an empty value.
    </p>

    <h3>Deleting Versions</h3>
    <p>
      The "Delete Versions" button <strong>permanently deletes</strong> all selected versions from the database.
      This action cannot be undone. A confirmation dialog will appear before deletion proceeds.
    </p>

    <div className="warning">
      <strong>Important Notes:</strong>
      <ul>
        <li>Version titles are <strong>case-sensitive</strong>. "Kehati" and "kehati" are different.</li>
        <li>URL fields are validated. Invalid URLs will prevent saving.</li>
        <li>Clearing a field removes it entirely from the database (not set to empty string).</li>
        <li>Setting <code>status: "locked"</code> prevents non-staff users from editing the version.</li>
        <li>Changes are applied immediately to production data. There is no undo.</li>
      </ul>
    </div>

    <h3>Common Use Cases</h3>
    <ul>
      <li>Adding license information to a publisher's versions</li>
      <li>Setting source URLs for versions missing attribution</li>
      <li>Renaming a versionTitle across many texts at once</li>
      <li>Permanently deleting outdated or duplicate versions</li>
      <li>Updating priority to control which version displays first</li>
      <li>Adding purchase links for commercially available texts</li>
    </ul>
  </>
);

/**
 * Field groupings for logical organization in the UI
 */
const FIELD_GROUPS = [
  {
    id: 'identification',
    header: 'Version Identification',
    fields: ['versionTitleInHebrew']  // versionTitle rename is handled separately via newVersionTitle
  },
  {
    id: 'source',
    header: 'Source & License',
    fields: ['versionSource', 'license', 'purchaseInformationURL', 'purchaseInformationImage']
  },
  {
    id: 'metadata',
    header: 'Metadata',
    fields: ['status', 'priority', 'digitizedBySefaria', 'isPrimary', 'isSource', 'direction']
  },
  {
    id: 'notes',
    header: 'Notes',
    fields: ['versionNotes', 'versionNotesInHebrew']
  }
];

/**
 * URL validation helper
 * Validates URL format using native URL constructor
 * Prevents invalid URLs from being saved to database
 */
const isValidUrl = (string) => {
  if (!string) return true; // Empty is valid (not required)
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

/**
 * Fields that store URLs and require validation
 * These become clickable links in the UI, so we validate format on input
 */
const URL_FIELDS = ['versionSource', 'purchaseInformationURL', 'purchaseInformationImage'];

/**
 * Validate a field value and return error message if invalid
 * Only validates URL fields - returns null for all other fields
 */
const getFieldValidationError = (field, value) => {
  const isUrlField = URL_FIELDS.includes(field);
  if (isUrlField && value && !isValidUrl(value)) {
    return "Please enter a valid URL (e.g., https://example.com)";
  }
  return null;
};

const BulkVersionEditor = () => {
  // Search state
  const [vtitle, setVtitle] = useState("");
  const [lang, setLang] = useState("");
  const [searched, setSearched] = useState(false);

  // Results state
  // indices: Array of {title: string, categories?: string[]} objects
  const [indices, setIndices] = useState([]);
  const [pick, setPick] = useState(new Set());

  // Edit state
  const [updates, setUpdates] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [fieldsToClear, setFieldsToClear] = useState(new Set());
  const [newVersionTitle, setNewVersionTitle] = useState("");

  // UI state
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRenameConfirm, setShowRenameConfirm] = useState(false);

  /**
   * Clear search and reset state
   */
  const clearSearch = useCallback(() => {
    setIndices([]);
    setPick(new Set());
    setUpdates({});
    setValidationErrors({});
    setFieldsToClear(new Set());
    setNewVersionTitle("");
    setMsg("");
    setSearched(false);
  }, []);

  /**
   * Load indices that have versions matching the search criteria
   * @param {string} [overrideTitle] - If provided, search with this title instead of vtitle state
   */
  const load = async (overrideTitle) => {
    const searchTitle = overrideTitle || vtitle;
    if (!searchTitle.trim()) {
      setMsg({ type: MESSAGE_TYPES.WARNING, message: 'Please enter a version title' });
      return;
    }

    setLoading(true);
    setSearched(true);
    setMsg({ type: MESSAGE_TYPES.INFO, message: 'Loading indices...' });

    const urlParams = { versionTitle: searchTitle };
    if (lang) {
      urlParams.language = lang;
    }

    try {
      const data = await Sefaria.apiRequestWithBody('/api/version-indices', urlParams, null, 'GET');
      const resultIndices = data.indices || [];
      const resultMetadata = data.metadata || {};
      // Combine indices and metadata into single array of objects
      const combinedIndices = resultIndices.map(title => ({
        title,
        categories: resultMetadata[title]?.categories
      }));
      setIndices(combinedIndices);
      setPick(new Set(resultIndices)); // Pre-select all (Set of title strings)
      setMsg(""); // Clear loading message - result count shown in IndexSelector header
    } catch (error) {
      setMsg({ type: MESSAGE_TYPES.ERROR, message: `Error: ${error.message || "Failed to load indices"}` });
      setIndices([]);
      setPick(new Set());
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle field value changes with validation
   * Stores user input and validates URL fields in real-time
   */
  const handleFieldChange = useCallback((field, value) => {
    // Store the field value (remove if empty)
    setUpdates(prev => {
      const next = { ...prev };
      if (value) {
        next[field] = value;
      } else {
        delete next[field];
      }
      return next;
    });

    // Validate and update error state
    const errorMessage = getFieldValidationError(field, value);
    setValidationErrors(prev => {
      const next = { ...prev };
      if (errorMessage) {
        next[field] = errorMessage;
      } else {
        delete next[field];
      }
      return next;
    });
  }, []);

  /**
   * Handle clear checkbox toggle for a field
   * When checked, field will be cleared (removed) from all selected versions
   */
  const handleClearToggle = useCallback((field, checked) => {
    setFieldsToClear(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(field);
      } else {
        next.delete(field);
      }
      return next;
    });

    // When clearing, remove any pending updates for this field
    if (checked) {
      setUpdates(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, []);

  /**
   * Perform bulk edit API call and handle response
   * @param {Object} updatesToApply - The updates object to send to the API
   * @param {Function} getSuccessMsg - Function that takes successCount and returns success message
   * @param {Function} getPartialMsg - Function that takes successCount, total, failureList and returns partial success message
   * @param {Function} getErrorMsg - Function that takes failureCount, failureList and returns error message
   * @param {Function} onSuccess - Optional callback to run on successful completion
   */
  const performBulkEdit = async (updatesToApply, getSuccessMsg, getPartialMsg, getErrorMsg, onSuccess, renameTitle) => {
    setSaving(true);

    try {
      const payload = {
        versionTitle: vtitle,
        indices: Array.from(pick),
        updates: updatesToApply
      };
      if (renameTitle) {
        payload.newVersionTitle = renameTitle;
      }

      const data = await Sefaria.apiRequestWithBody('/api/version-bulk-edit', null, payload);
      const successCount = data.successes?.length || 0;
      const failureCount = data.failures?.length || 0;
      const total = successCount + failureCount;

      if (data.status === "ok") {
        setMsg({ type: MESSAGE_TYPES.SUCCESS, message: getSuccessMsg(successCount) });
        if (onSuccess) onSuccess();
        // After a fully successful rename, refresh search with the new title
        if (data.newVersionTitle) {
          setVtitle(data.newVersionTitle);
          setNewVersionTitle("");
          // Re-load indices under the new title (pass explicitly since state update is async)
          load(data.newVersionTitle);
        }
      } else if (data.status === "partial") {
        const failureList = data.failures.map(f => `• ${f.index}: ${f.error}`).join("\n");
        let partialMsg = getPartialMsg(successCount, total, failureList);
        if (data.newVersionTitle) {
          partialMsg += `\n\nSuccessfully renamed versions now appear under "${data.newVersionTitle}". Search for the new title to continue editing them.`;
        }
        setMsg({ type: MESSAGE_TYPES.WARNING, message: partialMsg });
      } else {
        const failureList = data.failures?.map(f => `• ${f.index}: ${f.error}`).join("\n") || "Unknown error";
        setMsg({ type: MESSAGE_TYPES.ERROR, message: getErrorMsg(failureCount, failureList) });
      }
    } catch (error) {
      const errorMsg = error.message || "Unknown error";
      setMsg({ type: MESSAGE_TYPES.ERROR, message: `Error: ${errorMsg}` });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Build the processed updates object from current state
   */
  const buildProcessedUpdates = () => {
    const processedUpdates = { ...updates };
    ['digitizedBySefaria', 'isPrimary', 'isSource'].forEach(field => {
      if (processedUpdates[field] === 'true') {
        processedUpdates[field] = true;
      } else if (processedUpdates[field] === 'false') {
        processedUpdates[field] = false;
      }
    });
    fieldsToClear.forEach(field => {
      processedUpdates[field] = null;
    });
    return processedUpdates;
  };

  /**
   * Save changes to selected versions.
   * If a rename is included, shows a confirmation dialog first.
   */
  const save = async () => {
    if (!pick.size || !hasChanges || hasValidationErrors) {
      return;
    }
    // If renaming, show confirmation dialog instead of saving directly
    if (isRenaming) {
      setShowRenameConfirm(true);
      return;
    }
    await doSave();
  };

  /**
   * Execute the save (called directly for non-rename, or after rename confirmation)
   */
  const doSave = async () => {
    setShowRenameConfirm(false);
    setMsg({ type: MESSAGE_TYPES.INFO, message: isRenaming ? 'Renaming and saving changes...' : 'Saving changes...' });

    const processedUpdates = buildProcessedUpdates();
    const renameTitle = isRenaming ? newVersionTitle.trim() : null;
    const renameLabel = renameTitle ? ` and renamed to "${renameTitle}"` : "";

    await performBulkEdit(
      processedUpdates,
      (successCount) => `Successfully updated ${successCount} versions${renameLabel}`,
      (successCount, total, failureList) => `Updated ${successCount}/${total} versions.\n\nFailed:\n${failureList}`,
      (failureCount, failureList) => `All ${failureCount} updates failed:\n${failureList}`,
      () => {
        setUpdates({});
        setValidationErrors({});
        setFieldsToClear(new Set());
        setNewVersionTitle("");
      },
      renameTitle
    );
  };

  /**
   * Delete selected versions permanently
   */
  const deleteVersions = async () => {
    if (!pick.size) return;

    setShowDeleteConfirm(false);
    setSaving(true);
    setMsg({ type: MESSAGE_TYPES.INFO, message: 'Deleting versions...' });

    try {
      const payload = {
        versionTitle: vtitle,
        indices: Array.from(pick),
      };
      const data = await Sefaria.apiRequestWithBody('/api/version-bulk-delete', null, payload);
      const successCount = data.successes?.length || 0;
      const failureCount = data.failures?.length || 0;
      const total = successCount + failureCount;

      if (data.status === "ok") {
        setMsg({ type: MESSAGE_TYPES.SUCCESS, message: `Successfully deleted ${successCount} versions.` });
        // Refresh the index list to reflect deletions
        load();
      } else if (data.status === "partial") {
        const failureList = data.failures.map(f => `• ${f.index}: ${f.error}`).join("\n");
        setMsg({ type: MESSAGE_TYPES.WARNING, message: `Deleted ${successCount}/${total} versions.\n\nFailed:\n${failureList}` });
        load();
      } else {
        const failureList = data.failures?.map(f => `• ${f.index}: ${f.error}`).join("\n") || "Unknown error";
        setMsg({ type: MESSAGE_TYPES.ERROR, message: `All ${failureCount} deletions failed:\n${failureList}` });
      }
    } catch (error) {
      const errorMsg = error.message || "Unknown error";
      setMsg({ type: MESSAGE_TYPES.ERROR, message: `Error: ${errorMsg}` });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Render a field input based on its metadata
   * All fields in FIELD_GROUPS are guaranteed to have metadata in VERSION_FIELD_METADATA
   */
  const renderField = (fieldName) => {
    const meta = VERSION_FIELD_METADATA[fieldName];
    const value = updates[fieldName] || "";
    const error = validationErrors[fieldName];
    const hasError = !!error;
    const isClearing = fieldsToClear.has(fieldName);

    return (
      <div key={fieldName} className={`fieldGroup ${hasError ? 'hasError' : ''}`}>
        <label>
          {meta.label}:
        </label>

        {meta.help && (
          <div className="fieldHelp">{meta.help}</div>
        )}

        {meta.type === "select" && meta.options ? (
          <select
            className="dlVersionSelect fieldInput"
            value={value}
            onChange={e => handleFieldChange(fieldName, e.target.value)}
            style={{ direction: meta.dir || "ltr" }}
            disabled={isClearing}
          >
            {meta.options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : meta.type === "textarea" ? (
          <textarea
            className="fieldInput"
            placeholder={meta.placeholder}
            value={value}
            onChange={e => handleFieldChange(fieldName, e.target.value)}
            style={{ direction: meta.dir || "ltr" }}
            rows={3}
            disabled={isClearing}
          />
        ) : meta.type === "number" ? (
          <input
            className="dlVersionSelect fieldInput"
            type="number"
            placeholder={meta.placeholder}
            value={value}
            onChange={e => handleFieldChange(fieldName, e.target.value)}
            step="0.1"
            disabled={isClearing}
          />
        ) : (
          <input
            className="dlVersionSelect fieldInput"
            type={URL_FIELDS.includes(fieldName) ? "url" : "text"}
            placeholder={meta.placeholder}
            value={value}
            onChange={e => handleFieldChange(fieldName, e.target.value)}
            style={{ direction: meta.dir || "ltr" }}
            disabled={isClearing}
          />
        )}

        {hasError && (
          <div className="fieldError">{error}</div>
        )}

        <div className="clearFieldOption">
          <label>
            <input
              type="checkbox"
              checked={isClearing}
              onChange={e => handleClearToggle(fieldName, e.target.checked)}
            />
            <span className="clearFieldLabel">
              Clear this field
            </span>
          </label>
        </div>
      </div>
    );
  };

  const isRenaming = newVersionTitle.trim() !== "" && newVersionTitle.trim() !== vtitle;
  const hasChanges = Object.keys(updates).length > 0 || fieldsToClear.size > 0 || isRenaming;
  const hasValidationErrors = Object.keys(validationErrors).length > 0
    || (newVersionTitle.trim() !== "" && newVersionTitle.trim() === vtitle);

  // Compute validation state message (shown proactively, not on click)
  const getValidationState = () => {
    // Don't show validation messages while saving or if there's an active result message
    if (saving) return null;
    if (msg && (msg.type === MESSAGE_TYPES.SUCCESS || msg.type === MESSAGE_TYPES.ERROR)) return msg;

    // Show validation warnings proactively
    if (indices.length > 0 && pick.size === 0) {
      return { type: MESSAGE_TYPES.WARNING, message: 'No indices selected' };
    }
    if (pick.size > 0 && !hasChanges) {
      return { type: MESSAGE_TYPES.WARNING, message: 'No fields to update or clear' };
    }
    if (hasValidationErrors) {
      return { type: MESSAGE_TYPES.WARNING, message: 'Please fix validation errors before saving' };
    }

    return msg; // Show any other message (like success/error from API)
  };

  const currentMessage = getValidationState();
  const isButtonDisabled = saving || hasValidationErrors ||
    (currentMessage?.type === MESSAGE_TYPES.WARNING);

  return (
    <ModToolsSection
      title="Bulk Edit Version Metadata"
      titleHe="עריכת גרסאות בכמות"
      helpContent={HELP_CONTENT}
    >
      {/* Info box */}
      <div className="infoBox">
        <strong>How it works:</strong> Enter a version title to find all texts with matching versions.
        Select which texts to update, fill in the fields you want to change, then save.
        Only filled-in fields will be modified.
      </div>

      {/* Search description */}
      <p className="sectionDescription">
        Enter the exact version title as it appears in the database. The search is case-sensitive.
      </p>

      {/* Search bar - input + button inline */}
      <div className="searchRow">
        <input
          className="dlVersionSelect"
          type="text"
          placeholder="e.g., 'Torat Emet 357'"
          value={vtitle}
          onChange={e => setVtitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
        />
        <button
          className="modtoolsButton"
          onClick={load}
          disabled={loading || !vtitle.trim()}
        >
          {loading ? <><span className="loadingSpinner" />Searching...</> : "Search"}
        </button>
      </div>

      {/* Language filter - inline row */}
      <div className="filterRow">
        <label>Filter by language:</label>
        <select
          className="dlVersionSelect"
          value={lang}
          onChange={e => setLang(e.target.value)}
        >
          <option value="">All languages</option>
          <option value="he">Hebrew only</option>
          <option value="en">English only</option>
        </select>
      </div>

      {/* Clear button - centered */}
      {searched && (
        <div className="clearSearchRow">
          <button
            className="modtoolsButton secondary"
            onClick={clearSearch}
            type="button"
          >
            Clear Search
          </button>
        </div>
      )}

      {/* No results message */}
      {searched && !loading && indices.length === 0 && (
        <div className="noResults">
          <strong>No texts found with version "{vtitle}"</strong>
          Please verify the exact version title. Version titles are case-sensitive
          and must match exactly (e.g., "Torat Emet 357" not "torat emet").
        </div>
      )}

      {/* Index selector */}
      {indices.length > 0 && (
        <IndexSelector
          indices={indices}
          selectedIndices={pick}
          onSelectionChange={setPick}
          label="texts"
        />
      )}

      {/* Field inputs grouped by section */}
      {pick.size > 0 && (
        <>
          <div className="subsectionHeading">
            Edit fields for {pick.size} selected {pick.size === 1 ? 'text' : 'texts'}:
          </div>

          {FIELD_GROUPS.map(group => (
            <div key={group.id} className="fieldGroupSection">
              <div className="fieldGroupHeader">{group.header}</div>
              <div className="fieldGroupGrid">
                {/* Rename field in the identification group */}
                {group.id === 'identification' && (
                  <div className={`fieldGroup ${newVersionTitle.trim() !== "" && newVersionTitle.trim() === vtitle ? 'hasError' : ''}`}>
                    <label>New Version Title (rename):</label>
                    <div className="fieldHelp">
                      Rename the versionTitle across all selected texts. This is a significant operation
                      that cascades to multiple database collections.
                    </div>
                    <input
                      className="dlVersionSelect fieldInput renameInput"
                      type="text"
                      placeholder={`Current: "${vtitle}"`}
                      value={newVersionTitle}
                      onChange={e => setNewVersionTitle(e.target.value)}
                    />
                    {newVersionTitle.trim() !== "" && newVersionTitle.trim() === vtitle && (
                      <div className="fieldError">New title must differ from current title</div>
                    )}
                  </div>
                )}
                {group.fields.map(fieldName => renderField(fieldName))}
              </div>
            </div>
          ))}

          {/* Changes preview */}
          {hasChanges && (
            <div className="changesPreview">
              <strong>Changes to apply:</strong>
              <ul>
                {isRenaming && (
                  <li key="rename" className="renameItem">
                    <strong>Rename version title:</strong> "{vtitle}" &rarr; "{newVersionTitle.trim()}"
                  </li>
                )}
                {Object.entries(updates).map(([k, v]) => (
                  <li key={k}>
                    <strong>{VERSION_FIELD_METADATA[k]?.label || k}:</strong> "{v}"
                  </li>
                ))}
                {Array.from(fieldsToClear).map(field => (
                  <li key={`clear-${field}`} className="clearItem">
                    <strong>{VERSION_FIELD_METADATA[field]?.label || field}:</strong> <em>(clear)</em>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Rename confirmation dialog */}
          {showRenameConfirm && (
            <div className="dangerBox">
              <strong>Confirm Version Title Rename</strong>
              <p className="sectionDescription">
                This will rename the database identifier for <strong>{pick.size}</strong> version{pick.size !== 1 ? 's' : ''} from
                "<strong>{vtitle}</strong>" to "<strong>{newVersionTitle.trim()}</strong>".
              </p>
              <p className="sectionDescription">
                The rename will cascade to history records, search index, links, and other database collections.
                However, the following side effects <strong>cannot be automatically fixed</strong>:
              </p>
              <ul className="sectionDescription">
                <li>Existing bookmarks and shared links containing the old version title will stop working</li>
                <li>Users who set this as their preferred version will have their preference reset to default</li>
                <li>Source sheet references to the old version title will not be updated</li>
                <li>Previously exported files will reference the old title</li>
              </ul>
              <p className="sectionDescription">
                This operation may take a moment as it updates multiple database collections.
              </p>
              <div className="actionRow">
                <button
                  className="modtoolsButton danger"
                  onClick={doSave}
                  disabled={saving}
                >
                  {saving ? <><span className="loadingSpinner" />Renaming...</> : "Yes, Rename"}
                </button>
                <button
                  className="modtoolsButton secondary"
                  onClick={() => setShowRenameConfirm(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Validation warning */}
          {hasValidationErrors && (
            <div className="warningBox">
              <strong>Please fix validation errors before saving:</strong>
              <ul>
                {Object.entries(validationErrors).map(([field, error]) => (
                  <li key={field}>{VERSION_FIELD_METADATA[field]?.label || field}: {error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Status message - shows validation feedback, success/error results */}
          <StatusMessage message={currentMessage} />

          {/* Save button */}
          <div className="actionRow">
            <button
              className="modtoolsButton"
              onClick={save}
              disabled={isButtonDisabled}
            >
              {saving ? (
                <><span className="loadingSpinner" />Saving...</>
              ) : (
                `Save Changes`
              )}
            </button>
          </div>

          {/* Delete section - separated at bottom */}
          <div className="deleteSectionSeparator" />

          {/* Delete confirmation dialog */}
          {showDeleteConfirm && (
            <div className="dangerBox">
              <strong>Confirm Permanent Deletion</strong>
              <p className="sectionDescription">
                This will <strong>permanently delete {pick.size} version{pick.size !== 1 ? 's' : ''}</strong> of "{vtitle}" from the database.
                This action cannot be undone.
              </p>
              <p className="sectionDescription">
                Affected texts: {Array.from(pick).slice(0, 5).join(", ")}
                {pick.size > 5 && ` and ${pick.size - 5} more...`}
              </p>
              <div className="actionRow">
                <button
                  className="modtoolsButton danger"
                  onClick={deleteVersions}
                  disabled={saving}
                >
                  {saving ? <><span className="loadingSpinner" />Deleting...</> : "Yes, Delete Permanently"}
                </button>
                <button
                  className="modtoolsButton secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Delete button - at very bottom */}
          {!showDeleteConfirm && (
            <div className="actionRow">
              <button
                className="modtoolsButton danger"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={saving}
                type="button"
              >
                Delete Versions
              </button>
            </div>
          )}
        </>
      )}
    </ModToolsSection>
  );
};

export default BulkVersionEditor;
