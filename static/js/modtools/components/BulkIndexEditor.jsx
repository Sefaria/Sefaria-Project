/**
 * BulkIndexEditor - Bulk edit Index metadata across multiple indices
 *
 * NOTE: This component is currently DISABLED in ModeratorToolsPanel.
 * It is retained for future re-enablement but not rendered in the UI.
 *
 * Similar workflow to BulkVersionEditor, but operates on Index records
 * (the text metadata) rather than Version records (text content/translations).
 *
 * Workflow:
 * 1. User enters a versionTitle to find indices that have matching versions
 * 2. User selects which indices to update
 * 3. User fills in index metadata fields
 * 4. On save, updates each Index via the raw API
 *
 * Special features:
 * - Auto-detection for commentary texts ("X on Y" pattern)
 * - Automatic term creation for collective titles
 * - Author validation against AuthorTopic
 * - TOC zoom level setting on schema nodes
 *
 * Backend API: POST /api/v2/raw/index/{title}?update=1
 *
 * Documentation:
 * - See /docs/modtools/MODTOOLS_GUIDE.md for quick reference
 * - See /docs/modtools/COMPONENT_LOGIC.md for detailed implementation logic
 * - Index fields are defined in ../constants/fieldMetadata.js
 */
import { useState, useEffect } from 'react';
import Sefaria from '../../sefaria/sefaria';
import { INDEX_FIELD_METADATA } from '../constants/fieldMetadata';
import ModToolsSection from './shared/ModToolsSection';
import IndexSelector from './shared/IndexSelector';
import StatusMessage from './shared/StatusMessage';

/**
 * Detailed help documentation for this tool
 */
const HELP_CONTENT = (
  <>
    <h3>What This Tool Does</h3>
    <p>
      This tool edits <strong>Index metadata</strong> (text catalog records) across multiple texts.
      An "Index" in Sefaria is the master record for a text, containing its title, category,
      authorship, composition date, and structural information.
    </p>
    <p>
      Unlike the Version Editor which edits translations/editions, this tool edits the
      underlying text record itself. Use this when you need to update catalog information
      like descriptions, categories, authors, or commentary relationships.
    </p>

    <h3>How It Works</h3>
    <ol>
      <li><strong>Search:</strong> Enter a version title to find all indices that have versions with that title.</li>
      <li><strong>Select:</strong> Choose which indices to update.</li>
      <li><strong>Edit:</strong> Fill in the metadata fields you want to change.</li>
      <li><strong>Save:</strong> Each index is updated individually via the API, with cache clearing.</li>
    </ol>

    <h3>Available Fields</h3>
    <table className="field-table">
      <thead>
        <tr><th>Field</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><code>enDesc</code></td><td>English description of the text (shown in reader)</td></tr>
        <tr><td><code>heDesc</code></td><td>Hebrew description of the text</td></tr>
        <tr><td><code>enShortDesc</code></td><td>Brief English description for search results</td></tr>
        <tr><td><code>heShortDesc</code></td><td>Brief Hebrew description</td></tr>
        <tr><td><code>categories</code></td><td>Category path in the table of contents (e.g., "Mishnah, Seder Zeraim")</td></tr>
        <tr><td><code>authors</code></td><td>Author slugs (must exist in AuthorTopic). Comma-separated.</td></tr>
        <tr><td><code>compDate</code></td><td>Composition date. Single year or range like [1200, 1250]</td></tr>
        <tr><td><code>compPlace</code></td><td>Place of composition (English)</td></tr>
        <tr><td><code>heCompPlace</code></td><td>Place of composition (Hebrew)</td></tr>
        <tr><td><code>pubDate</code></td><td>Publication date</td></tr>
        <tr><td><code>pubPlace</code></td><td>Place of publication (English)</td></tr>
        <tr><td><code>hePubPlace</code></td><td>Place of publication (Hebrew)</td></tr>
        <tr><td><code>dependence</code></td><td>"Commentary" or "Targum" - marks text as dependent on another</td></tr>
        <tr><td><code>base_text_titles</code></td><td>For commentaries: exact titles of base texts. Comma-separated.</td></tr>
        <tr><td><code>collective_title</code></td><td>For commentaries: the commentary name (e.g., "Rashi")</td></tr>
        <tr><td><code>he_collective_title</code></td><td>Hebrew collective title (creates a Term if both en/he provided)</td></tr>
        <tr><td><code>toc_zoom</code></td><td>Table of contents zoom level (0-10, 0=fully expanded)</td></tr>
      </tbody>
    </table>

    <h3>Auto-Detection Feature</h3>
    <p>
      For texts with "X on Y" naming pattern (e.g., "Rashi on Genesis"), you can use
      <code>'auto'</code> as a value for certain fields:
    </p>
    <ul>
      <li><code>dependence: 'auto'</code> - Sets to "Commentary" if pattern detected</li>
      <li><code>base_text_titles: 'auto'</code> - Extracts the base text name (e.g., "Genesis")</li>
      <li><code>collective_title: 'auto'</code> - Extracts the commentary name (e.g., "Rashi")</li>
      <li><code>authors: 'auto'</code> - Looks up the commentary name as an AuthorTopic</li>
    </ul>

    <h3>Term Creation</h3>
    <p>
      If you provide both <code>collective_title</code> (English) and <code>he_collective_title</code>
      (Hebrew), the tool will automatically create a Term for that collective title if it
      doesn't already exist. This is required for the collective title to display properly.
    </p>

    <div className="warning">
      <strong>Important Notes:</strong>
      <ul>
        <li><strong>Authors must exist</strong> in the AuthorTopic database. Invalid author names will fail validation.</li>
        <li><strong>Base text titles must be exact</strong> index titles (e.g., "Mishnah Berakhot", not "Mishnah").</li>
        <li><strong>Categories</strong> must match existing category paths in the Sefaria table of contents.</li>
        <li>Changes trigger a <strong>cache reset</strong> for each index, which may take a moment.</li>
        <li>Changes are applied <strong>immediately to production</strong>. There is no undo.</li>
      </ul>
    </div>

    <h3>Common Use Cases</h3>
    <ul>
      <li>Adding descriptions to a set of related texts</li>
      <li>Setting up commentary metadata for a new commentary series</li>
      <li>Moving texts to a different category</li>
      <li>Adding authorship information to texts by the same author</li>
      <li>Configuring TOC display depth for complex texts</li>
    </ul>
  </>
);

/**
 * Detect commentary pattern from title (e.g., "Rashi on Genesis")
 * Returns { commentaryName, baseText } or null
 */
const detectCommentaryPattern = (title) => {
  const match = title.match(/^(.+?)\s+on\s+(.+)$/);
  if (match) {
    return {
      commentaryName: match[1].trim(),
      baseText: match[2].trim()
    };
  }
  return null;
};

/**
 * Create a term if it doesn't exist
 */
const createTermIfNeeded = async (enTitle, heTitle) => {
  if (!enTitle || !heTitle) {
    throw new Error("Both English and Hebrew titles are required to create a term");
  }

  try {
    // Check if term already exists
    await Sefaria.apiRequestWithBody(`/api/terms/${encodeURIComponent(enTitle)}`, null, null, 'GET');
    return true; // Term exists
  } catch (e) {
    if (e.message.includes('404') || e.message.includes('not found')) {
      // Create term
      const payload = {
        json: JSON.stringify({
          name: enTitle,
          titles: [
            { lang: "en", text: enTitle, primary: true },
            { lang: "he", text: heTitle, primary: true }
          ]
        })
      };
      await Sefaria.apiRequestWithBody(`/api/terms/${encodeURIComponent(enTitle)}`, null, payload);
      return true;
    }
    throw e;
  }
};

const BulkIndexEditor = () => {
  // Search state
  const [vtitle, setVtitle] = useState("");
  const [lang, setLang] = useState("");
  const [searched, setSearched] = useState(false);

  // Results state
  // indices: Array of {title: string, categories?: string[]} objects
  const [indices, setIndices] = useState([]);
  const [pick, setPick] = useState(new Set());
  const [categories, setCategories] = useState([]);

  // Edit state
  const [updates, setUpdates] = useState({});

  // UI state
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load categories on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const data = await Sefaria.apiRequestWithBody('/api/index', null, null, 'GET');
        const cats = [];
        const extractCategories = (node, path = []) => {
          if (node.category) {
            const fullPath = [...path, node.category].join(", ");
            cats.push(fullPath);
          }
          if (node.contents) {
            node.contents.forEach(item => {
              extractCategories(item, node.category ? [...path, node.category] : path);
            });
          }
        };
        data.forEach(cat => extractCategories(cat));
        setCategories(cats.sort());
      } catch (error) {
        console.error('Failed to load categories:', error);
      }
    };
    loadCategories();
  }, []);

  /**
   * Clear search and reset state
   */
  const clearSearch = () => {
    setIndices([]);
    setPick(new Set());
    setUpdates({});
    setMsg("");
    setSearched(false);
  };

  /**
   * Load indices matching the version title
   */
  const load = async () => {
    if (!vtitle.trim()) {
      setMsg("Please enter a version title");
      return;
    }

    setLoading(true);
    setSearched(true);
    setMsg("Loading indices...");

    const urlParams = { versionTitle: vtitle };
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
      setPick(new Set(resultIndices)); // Set of title strings
      if (resultIndices.length > 0) {
        setMsg(`Found ${resultIndices.length} indices with version "${vtitle}"`);
      } else {
        setMsg("");
      }
    } catch (error) {
      setMsg(`Error: ${error.message || "Failed to load indices"}`);
      setIndices([]);
      setPick(new Set());
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle field value changes
   */
  const handleFieldChange = (fieldName, value) => {
    setUpdates(prev => ({ ...prev, [fieldName]: value }));
  };

  /**
   * Save changes to selected indices
   */
  const save = async () => {
    if (!pick.size || !Object.keys(updates).length) return;

    setSaving(true);
    setMsg("Saving changes...");

    // Process updates to ensure correct data types
    const processedUpdates = {};

    for (const [field, value] of Object.entries(updates)) {
      if (!value && field !== "toc_zoom") continue;

      const fieldMeta = INDEX_FIELD_METADATA[field];
      if (!fieldMeta) {
        processedUpdates[field] = value;
        continue;
      }

      switch (fieldMeta.type) {
        case 'array':
          if (value === 'auto') {
            processedUpdates[field] = 'auto';
          } else {
            processedUpdates[field] = value.split(',').map(v => v.trim()).filter(v => v);
          }
          break;
        case 'daterange':
          if (value.startsWith('[') && value.endsWith(']')) {
            try {
              processedUpdates[field] = JSON.parse(value);
            } catch (e) {
              setMsg(`Invalid date format for ${field}`);
              setSaving(false);
              return;
            }
          } else {
            const year = parseInt(value);
            if (!isNaN(year)) {
              processedUpdates[field] = year;
            } else {
              setMsg(`Invalid date format for ${field}`);
              setSaving(false);
              return;
            }
          }
          break;
        case 'number':
          const numValue = parseInt(value);
          if (isNaN(numValue)) {
            setMsg(`Invalid number format for ${field}`);
            setSaving(false);
            return;
          }
          processedUpdates[field] = numValue;
          break;
        default:
          processedUpdates[field] = value;
      }
    }

    // Validate authors if present
    if (processedUpdates.authors && processedUpdates.authors !== 'auto') {
      try {
        const authorSlugs = [];
        for (const authorName of processedUpdates.authors) {
          const response = await Sefaria.apiRequestWithBody(`/api/name/${authorName}`, null, null, 'GET');
          const matches = response.completion_objects?.filter(t => t.type === 'AuthorTopic') || [];
          const exactMatch = matches.find(t => t.title.toLowerCase() === authorName.toLowerCase());

          if (!exactMatch) {
            const closestMatches = matches.map(t => t.title).slice(0, 3);
            const msg = matches.length > 0
              ? `Invalid author "${authorName}". Did you mean: ${closestMatches.join(', ')}?`
              : `Invalid author "${authorName}". Make sure it exists in the Authors topic.`;
            setMsg(`Error: ${msg}`);
            setSaving(false);
            return;
          }
          authorSlugs.push(exactMatch.key);
        }
        processedUpdates.authors = authorSlugs;
      } catch (e) {
        setMsg(`Error validating authors`);
        setSaving(false);
        return;
      }
    }

    let successCount = 0;
    const errors = [];

    for (const indexTitle of pick) {
      try {
        setMsg(`Updating ${indexTitle}...`);

        const existingIndexData = await Sefaria.getIndexDetails(indexTitle);
        if (!existingIndexData) {
          errors.push(`${indexTitle}: Could not fetch existing index data.`);
          continue;
        }

        let indexSpecificUpdates = { ...processedUpdates };
        const pattern = detectCommentaryPattern(indexTitle);

        // Handle auto-detection for various fields
        if (indexSpecificUpdates.dependence === 'auto') {
          indexSpecificUpdates.dependence = pattern ? 'Commentary' : undefined;
          if (!pattern) delete indexSpecificUpdates.dependence;
        }

        if (indexSpecificUpdates.base_text_titles === 'auto') {
          if (pattern?.baseText) {
            indexSpecificUpdates.base_text_titles = [pattern.baseText];
          } else {
            delete indexSpecificUpdates.base_text_titles;
          }
        }

        if (indexSpecificUpdates.collective_title === 'auto') {
          if (pattern?.commentaryName) {
            indexSpecificUpdates.collective_title = pattern.commentaryName;
          } else {
            delete indexSpecificUpdates.collective_title;
          }
        }

        // Handle term creation for collective_title
        if (indexSpecificUpdates.collective_title && indexSpecificUpdates.he_collective_title) {
          try {
            await createTermIfNeeded(indexSpecificUpdates.collective_title, indexSpecificUpdates.he_collective_title);
            delete indexSpecificUpdates.he_collective_title;
          } catch (e) {
            errors.push(`${indexTitle}: Failed to create term: ${e.message}`);
            continue;
          }
        }

        // Handle authors auto-detection
        if (indexSpecificUpdates.authors === 'auto' && pattern?.commentaryName) {
          try {
            const response = await Sefaria.apiRequestWithBody(`/api/name/${pattern.commentaryName}`, null, null, 'GET');
            const matches = response.completion_objects?.filter(t => t.type === 'AuthorTopic') || [];
            const exactMatch = matches.find(t => t.title.toLowerCase() === pattern.commentaryName.toLowerCase());
            if (exactMatch) {
              indexSpecificUpdates.authors = [exactMatch.key];
            } else {
              delete indexSpecificUpdates.authors;
            }
          } catch (e) {
            delete indexSpecificUpdates.authors;
          }
        }

        // Handle TOC zoom
        let tocZoomValue = null;
        if ('toc_zoom' in indexSpecificUpdates) {
          tocZoomValue = indexSpecificUpdates.toc_zoom;
          delete indexSpecificUpdates.toc_zoom;

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

        const postData = {
          title: indexTitle,
          heTitle: existingIndexData.heTitle,
          categories: existingIndexData.categories,
          schema: existingIndexData.schema,
          ...indexSpecificUpdates
        };

        const urlParams = { update: '1' };
        const indexPath = encodeURIComponent(indexTitle.replace(/ /g, "_"));
        const payload = { json: JSON.stringify(postData) };

        // Update index via raw API
        await Sefaria.apiRequestWithBody(`/api/v2/raw/index/${indexPath}`, urlParams, payload);

        // Clear caches (non-JSON endpoint)
        const resetResponse = await fetch(`/admin/reset/${encodeURIComponent(indexTitle)}`, {
          method: 'GET',
          credentials: 'same-origin'
        });
        if (!resetResponse.ok) {
          throw new Error("Failed to reset cache");
        }

        successCount++;
      } catch (e) {
        const errorMsg = e.message || 'Unknown error';
        errors.push(`${indexTitle}: ${errorMsg}`);
      }
    }

    if (errors.length) {
      setMsg(`Updated ${successCount} of ${pick.size} indices. Errors: ${errors.join('; ')}`);
    } else {
      setMsg(`Successfully updated ${successCount} indices`);
      setUpdates({});
    }
    setSaving(false);
  };

  /**
   * Render a field input based on its metadata
   */
  const renderField = (fieldName) => {
    const fieldMeta = INDEX_FIELD_METADATA[fieldName];
    const currentValue = updates[fieldName] || "";

    const commonProps = {
      className: "dlVersionSelect fieldInput",
      placeholder: fieldMeta.placeholder,
      value: currentValue,
      onChange: e => handleFieldChange(fieldName, e.target.value),
      style: { width: "100%", direction: fieldMeta.dir || "ltr" }
    };

    return (
      <div key={fieldName} className="fieldGroup">
        <label>{fieldMeta.label}:</label>

        {fieldMeta.help && (
          <div className="fieldHelp">
            {fieldMeta.help}
            {fieldMeta.auto && (
              <span className="autoSupport"> (Supports 'auto' for commentary texts)</span>
            )}
          </div>
        )}

        {fieldName === "categories" ? (
          <select {...commonProps}>
            <option value="">Select category...</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        ) : fieldMeta.type === "select" && fieldMeta.options ? (
          <select {...commonProps}>
            {fieldMeta.options.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : fieldMeta.type === "textarea" ? (
          <textarea {...commonProps} rows={3} />
        ) : fieldMeta.type === "number" ? (
          <input {...commonProps} type="number" min="0" max="10" />
        ) : (
          <input {...commonProps} type="text" />
        )}
      </div>
    );
  };

  // Check if there are actual changes - toc_zoom of 0 is valid, so check for undefined instead
  const hasChanges = Object.keys(updates).filter(k => updates[k] || (k === 'toc_zoom' && updates[k] !== undefined && updates[k] !== '')).length > 0;

  return (
    <ModToolsSection
      title="Bulk Edit Index Metadata"
      titleHe="עריכת אינדקסים בכמות"
      helpContent={HELP_CONTENT}
    >
      {/* Warning box */}
      <div className="warningBox">
        <strong>Important Notes:</strong>
        <ul>
          <li><strong>Authors:</strong> Must exist in the Authors topic. Use exact names or slugs.</li>
          <li><strong>Collective Title:</strong> If Hebrew equivalent is provided, terms will be created automatically.</li>
          <li><strong>Base Text Titles:</strong> Must be exact index titles (e.g., "Mishnah Berakhot").</li>
          <li><strong>Auto-detection:</strong> Works for commentary texts with "X on Y" format.</li>
          <li><strong>TOC Zoom:</strong> Integer 0-10 (0=fully expanded).</li>
        </ul>
      </div>

      {/* Search bar */}
      <div className="searchRow">
        <input
          className="dlVersionSelect"
          type="text"
          placeholder="Version title (e.g., 'Torat Emet 357')"
          value={vtitle}
          onChange={e => setVtitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
        />
        <button
          className="modtoolsButton"
          onClick={load}
          disabled={loading || !vtitle.trim()}
        >
          {loading ? <><span className="loadingSpinner" />Searching...</> : "Find Indices"}
        </button>
      </div>

      {/* Language filter - inline */}
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
          <strong>No indices found with version "{vtitle}"</strong>
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
          label="indices"
        />
      )}

      {/* Field inputs */}
      {pick.size > 0 && (
        <>
          <div className="subsectionHeading">
            Edit fields for {pick.size} selected {pick.size === 1 ? 'index' : 'indices'}:
          </div>

          <div className="fieldGroupSection">
            {Object.keys(INDEX_FIELD_METADATA).map(f => renderField(f))}
          </div>

          {hasChanges && (
            <div className="changesPreview">
              <strong>Changes to apply:</strong>
              <ul>
                {Object.entries(updates).filter(([k, v]) => v || k === 'toc_zoom').map(([k, v]) => (
                  <li key={k}>{INDEX_FIELD_METADATA[k]?.label || k}: "{v}"</li>
                ))}
              </ul>
            </div>
          )}

          <div className="actionRow">
            <button
              className="modtoolsButton"
              disabled={!hasChanges || saving}
              onClick={save}
            >
              {saving ? <><span className="loadingSpinner" />Saving...</> : `Save Changes to ${pick.size} Indices`}
            </button>
          </div>
        </>
      )}

      <StatusMessage message={msg} />
    </ModToolsSection>
  );
};

export default BulkIndexEditor;
