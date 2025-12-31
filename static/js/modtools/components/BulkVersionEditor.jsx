/**
 * BulkVersionEditor - Bulk edit Version metadata across multiple indices
 *
 * Primary focus of Shortcut #36475 (Kehati Tools).
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
 * For AI agents:
 * - Version fields are defined in VERSION_FIELD_METADATA
 * - "status: locked" prevents non-staff from editing (tracker.py:33)
 * - The API now returns {status, count, total, successes, failures}
 */
import React, { useState, useCallback } from 'react';
import $ from '../../sefaria/sefariaJquery';
import { VERSION_FIELD_METADATA } from '../constants/fieldMetadata';
import ModToolsSection from './shared/ModToolsSection';
import IndexSelector from './shared/IndexSelector';
import StatusMessage from './shared/StatusMessage';

/**
 * Field groupings for logical organization in the UI
 * Matches acceptance criteria: "Form groups related fields logically"
 */
const FIELD_GROUPS = [
  {
    id: 'identification',
    header: 'Version Identification',
    fields: ['versionTitle', 'versionTitleInHebrew']
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
 * URL fields that need validation
 */
const URL_FIELDS = ['versionSource', 'purchaseInformationURL', 'purchaseInformationImage'];

const BulkVersionEditor = () => {
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  /**
   * Clear search and reset state
   */
  const clearSearch = useCallback(() => {
    setIndices([]);
    setIndexMetadata({});
    setPick(new Set());
    setUpdates({});
    setValidationErrors({});
    setMsg("");
    setSearched(false);
  }, []);

  /**
   * Load indices that have versions matching the search criteria
   */
  const load = () => {
    if (!vtitle.trim()) {
      setMsg("❌ Please enter a version title");
      return;
    }

    setLoading(true);
    setSearched(true);
    setMsg("Loading indices...");

    const url = `/api/version-indices?versionTitle=${encodeURIComponent(vtitle)}&language=${lang}`;

    $.getJSON(url)
      .done(d => {
        const resultIndices = d.indices || [];
        const resultMetadata = d.metadata || {};
        setIndices(resultIndices);
        setIndexMetadata(resultMetadata);
        setPick(new Set(resultIndices)); // Pre-select all
        if (resultIndices.length > 0) {
          setMsg(`✅ Found ${resultIndices.length} texts with version "${vtitle}"`);
        } else {
          setMsg(""); // No message for empty results - will show noResults box
        }
      })
      .fail(xhr => {
        const errorMsg = xhr.responseJSON?.error || xhr.responseText || "Failed to load indices";
        setMsg(`❌ Error: ${errorMsg}`);
        setIndices([]);
        setIndexMetadata({});
        setPick(new Set());
      })
      .always(() => setLoading(false));
  };

  /**
   * Validate a field value
   */
  const validateField = useCallback((field, value) => {
    if (URL_FIELDS.includes(field) && value && !isValidUrl(value)) {
      return "Please enter a valid URL (e.g., https://example.com)";
    }
    return null;
  }, []);

  /**
   * Handle field value changes with validation
   */
  const handleFieldChange = useCallback((field, value) => {
    // Update the value
    setUpdates(prev => {
      const next = { ...prev };
      if (value) {
        next[field] = value;
      } else {
        delete next[field];
      }
      return next;
    });

    // Validate if needed
    const error = validateField(field, value);
    setValidationErrors(prev => {
      const next = { ...prev };
      if (error) {
        next[field] = error;
      } else {
        delete next[field];
      }
      return next;
    });
  }, [validateField]);

  /**
   * Save changes to selected versions
   */
  const save = () => {
    if (!pick.size) {
      setMsg("❌ No indices selected");
      return;
    }

    if (!Object.keys(updates).length) {
      setMsg("❌ No fields to update");
      return;
    }

    // Check for validation errors
    if (Object.keys(validationErrors).length > 0) {
      setMsg("❌ Please fix validation errors before saving");
      return;
    }

    setSaving(true);
    setMsg("Saving changes...");

    // Convert boolean string values to actual booleans for the API
    const processedUpdates = { ...updates };
    ['digitizedBySefaria', 'isPrimary', 'isSource'].forEach(field => {
      if (processedUpdates[field] === 'true') {
        processedUpdates[field] = true;
      } else if (processedUpdates[field] === 'false') {
        processedUpdates[field] = false;
      }
    });

    $.ajax({
      url: "/api/version-bulk-edit",
      type: "POST",
      contentType: "application/json",
      data: JSON.stringify({
        versionTitle: vtitle,
        language: lang,
        indices: Array.from(pick),
        updates: processedUpdates
      }),
      success: d => {
        // Handle detailed success/failure response
        if (d.status === "ok") {
          setMsg(`✅ Successfully updated ${d.count} versions`);
          setUpdates({});
          setValidationErrors({});
        } else if (d.status === "partial") {
          const failureDetails = d.failures.map(f => `${f.index}: ${f.error}`).join("; ");
          setMsg(`⚠️ Updated ${d.count}/${d.total} versions. Failures: ${failureDetails}`);
        } else {
          const failureDetails = d.failures?.map(f => `${f.index}: ${f.error}`).join("; ") || "Unknown error";
          setMsg(`❌ All updates failed: ${failureDetails}`);
        }
        setSaving(false);
      },
      error: xhr => {
        const errorMsg = xhr.responseJSON?.error || xhr.responseText || "Unknown error";
        setMsg(`❌ Error: ${errorMsg}`);
        setSaving(false);
      }
    });
  };

  /**
   * Mark selected versions for deletion (soft delete)
   * Adds a note to versionNotes marking them for review
   */
  const markForDeletion = () => {
    if (!pick.size) {
      setMsg("❌ No texts selected");
      return;
    }

    setSaving(true);
    setShowDeleteConfirm(false);
    setMsg("Marking versions for deletion review...");

    const deletionNote = `[MARKED FOR DELETION - ${new Date().toISOString().split('T')[0]}] This version has been marked for deletion review.`;

    $.ajax({
      url: "/api/version-bulk-edit",
      type: "POST",
      contentType: "application/json",
      data: JSON.stringify({
        versionTitle: vtitle,
        language: lang,
        indices: Array.from(pick),
        updates: {
          versionNotes: deletionNote
        }
      }),
      success: d => {
        if (d.status === "ok") {
          setMsg(`✅ Marked ${d.count} versions for deletion review. They can be found by searching for "[MARKED FOR DELETION" in version notes.`);
        } else if (d.status === "partial") {
          setMsg(`⚠️ Marked ${d.count}/${d.total} versions. Some failed.`);
        } else {
          setMsg(`❌ Failed to mark versions for deletion.`);
        }
        setSaving(false);
      },
      error: xhr => {
        const errorMsg = xhr.responseJSON?.error || xhr.responseText || "Unknown error";
        setMsg(`❌ Error: ${errorMsg}`);
        setSaving(false);
      }
    });
  };

  /**
   * Render a field input based on its metadata
   */
  const renderField = (fieldName) => {
    const meta = VERSION_FIELD_METADATA[fieldName];
    if (!meta) {
      // Fallback for fields without metadata
      return (
        <div key={fieldName} className="fieldGroup">
          <label>{fieldName}:</label>
          <input
            className="fieldInput"
            type="text"
            placeholder={fieldName}
            onChange={e => handleFieldChange(fieldName, e.target.value)}
          />
        </div>
      );
    }

    const value = updates[fieldName] || "";
    const error = validationErrors[fieldName];
    const hasError = !!error;

    return (
      <div key={fieldName} className={`fieldGroup ${hasError ? 'hasError' : ''}`}>
        <label>{meta.label}:</label>

        {meta.help && (
          <div className="fieldHelp">{meta.help}</div>
        )}

        {meta.type === "select" && meta.options ? (
          <select
            className="dlVersionSelect fieldInput"
            value={value}
            onChange={e => handleFieldChange(fieldName, e.target.value)}
            style={{ direction: meta.dir || "ltr" }}
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
          />
        ) : meta.type === "number" ? (
          <input
            className="dlVersionSelect fieldInput"
            type="number"
            placeholder={meta.placeholder}
            value={value}
            onChange={e => handleFieldChange(fieldName, e.target.value)}
            step="0.1"
          />
        ) : (
          <input
            className="dlVersionSelect fieldInput"
            type={URL_FIELDS.includes(fieldName) ? "url" : "text"}
            placeholder={meta.placeholder}
            value={value}
            onChange={e => handleFieldChange(fieldName, e.target.value)}
            style={{ direction: meta.dir || "ltr" }}
          />
        )}

        {hasError && (
          <div className="fieldError">{error}</div>
        )}
      </div>
    );
  };

  const hasChanges = Object.keys(updates).length > 0;
  const hasValidationErrors = Object.keys(validationErrors).length > 0;

  return (
    <ModToolsSection title="Bulk Edit Version Metadata" titleHe="עריכת גרסאות בכמות">
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
          onKeyPress={e => e.key === 'Enter' && load()}
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
          indexMetadata={indexMetadata}
        />
      )}

      {/* Field inputs grouped by section */}
      {pick.size > 0 && (
        <>
          <div style={{ marginTop: "24px", marginBottom: "16px", fontWeight: "500", fontSize: "15px" }}>
            Edit fields for {pick.size} selected {pick.size === 1 ? 'text' : 'texts'}:
          </div>

          {FIELD_GROUPS.map(group => (
            <div key={group.id} className="fieldGroupSection">
              <div className="fieldGroupHeader">{group.header}</div>
              <div className="fieldGroupGrid">
                {group.fields.map(fieldName => renderField(fieldName))}
              </div>
            </div>
          ))}

          {/* Changes preview */}
          {hasChanges && (
            <div className="changesPreview">
              <strong>Changes to apply:</strong>
              <ul>
                {Object.entries(updates).map(([k, v]) => (
                  <li key={k}>
                    <strong>{VERSION_FIELD_METADATA[k]?.label || k}:</strong> "{v}"
                  </li>
                ))}
              </ul>
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

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Save button */}
            <button
              className="modtoolsButton"
              onClick={save}
              disabled={!hasChanges || saving || hasValidationErrors}
            >
              {saving ? (
                <><span className="loadingSpinner" />Saving...</>
              ) : hasValidationErrors ? (
                "Fix errors to save"
              ) : (
                `Update ${pick.size} Selected Versions`
              )}
            </button>

            {/* Delete button */}
            <button
              className="modtoolsButton danger"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving}
              type="button"
            >
              Mark for Deletion
            </button>
          </div>

          {/* Delete confirmation dialog */}
          {showDeleteConfirm && (
            <div className="dangerBox" style={{ marginTop: "16px" }}>
              <strong>⚠️ Confirm Mark for Deletion</strong>
              <p style={{ margin: "8px 0" }}>
                This will mark <strong>{pick.size}</strong> versions for deletion review by adding a note to their versionNotes field.
                The versions will not be immediately deleted - they will be flagged for manual review.
              </p>
              <p style={{ margin: "8px 0", fontSize: "13px", color: "#666" }}>
                Affected texts: {Array.from(pick).slice(0, 5).join(", ")}
                {pick.size > 5 && ` and ${pick.size - 5} more...`}
              </p>
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button
                  className="modtoolsButton danger"
                  onClick={markForDeletion}
                  disabled={saving}
                >
                  {saving ? <><span className="loadingSpinner" />Processing...</> : "Yes, Mark for Deletion"}
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
        </>
      )}

      {/* Status message */}
      <StatusMessage message={msg} />
    </ModToolsSection>
  );
};

export default BulkVersionEditor;
