import React  from 'react';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import Component from 'react-class';
import Cookies from 'js-cookie';
import { saveAs } from 'file-saver';
import qs from 'qs';
import { useState } from 'react';
import { InterfaceText, EnglishText, HebrewText } from "./Misc";

const INDEX_FIELD_METADATA = {
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
  // New fields:
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

const BulkIndexEditor = () => {
  const [vtitle, setVtitle] = React.useState("");
  const [lang, setLang] = React.useState("");
  const [indices, setIndices] = React.useState([]);
  const [pick, setPick] = React.useState(new Set());
  const [mapping, setMapping] = React.useState("many_to_one_default_only");
  const [updates, setUpdates] = React.useState({});
  const [msg, setMsg] = React.useState("");
  const [categories, setCategories] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Load categories on mount
  React.useEffect(() => {
    $.getJSON('/api/index', data => {
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
    });
  }, []);

  const load = () => {
    if (!vtitle) {
      setMsg("❌ Please enter a version title");
      return;
    }

    setLoading(true);
    setMsg("Loading indices...");

    $.getJSON(`/api/version-indices?versionTitle=${encodeURIComponent(vtitle)}&language=${lang}`)
      .done(d => {
        setIndices(d.indices);
        setPick(new Set(d.indices));
        setMsg(`Found ${d.indices.length} indices`);
      })
      .fail(xhr => {
        const errorMsg = xhr.responseJSON?.error || xhr.responseText || "Failed to load indices";
        setMsg(`❌ Error: ${errorMsg}`);
        setIndices([]);
        setPick(new Set());
      })
      .always(() => setLoading(false));
  };

// Better pattern detection that handles multi-word base texts
const detectCommentaryPattern = (title) => {
  // Match "X on Y" where Y can be multiple words
  const match = title.match(/^(.+?)\s+on\s+(.+)$/);
  if (match) {
    return {
      commentaryName: match[1].trim(),
      baseText: match[2].trim()  // This will be "Mishnah Bikkurim" not just "Bikkurim"
    };
  }
  return null;
};

// Function to create a term if it doesn't exist
const createTermIfNeeded = async (enTitle, heTitle) => {
  if (!enTitle || !heTitle) {
    throw new Error("Both English and Hebrew titles are required to create a term");
  }

  try {
    // Check if term already exists
    const response = await $.ajax({
      url: `/api/terms/${encodeURIComponent(enTitle)}`,
      method: 'GET'
    });

    // If we get here, term exists
    return response;
  } catch (e) {
    if (e.status === 404) {
      // Term doesn't exist, create it
      try {
        const newTerm = await $.ajax({
          url: `/api/terms/${encodeURIComponent(enTitle)}`,
          method: 'POST',
          data: {
            json: JSON.stringify({
              name: enTitle,
              titles: [
                {
                  lang: "en",
                  text: enTitle,
                  primary: true
                },
                {
                  lang: "he",
                  text: heTitle,
                  primary: true
                }
              ]
            })
          }
        });
        return newTerm;
      } catch (createError) {
        throw new Error(`Failed to create term: ${createError.responseJSON?.error || createError.statusText}`);
      }
    } else {
      throw new Error(`Error checking term: ${e.responseJSON?.error || e.statusText}`);
    }
  }
};

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
          processedUpdates[field] = 'auto'; // Keep as marker for auto-detection
        } else {
          processedUpdates[field] = value.split(',').map(v => v.trim()).filter(v => v);
        }
        break;
      case 'daterange':
        if (value.startsWith('[') && value.endsWith(']')) {
          try {
            processedUpdates[field] = JSON.parse(value);
          } catch (e) {
            setMsg(`❌ Invalid date format for ${field}`);
            setSaving(false);
            return;
          }
        } else {
          const year = parseInt(value);
          if (!isNaN(year)) {
            processedUpdates[field] = year;
          } else {
            setMsg(`❌ Invalid date format for ${field}`);
            setSaving(false);
            return;
          }
        }
        break;
      case 'number':
        const numValue = parseInt(value);
        if (isNaN(numValue)) {
          setMsg(`❌ Invalid number format for ${field}`);
          setSaving(false);
          return;
        }
        processedUpdates[field] = numValue;
        break;
      default:
        processedUpdates[field] = value;
    }
  }

  // Handle authors validation if present (but not if it's 'auto' - that's handled per-index)
  if (processedUpdates.authors && processedUpdates.authors !== 'auto') {
    try {
      const authorSlugs = [];
      for (const authorName of processedUpdates.authors) {
        const response = await $.ajax({
          url: `/api/name/${authorName}`,
          method: 'GET'
        });

        const matches = response.completion_objects?.filter(t => t.type === 'AuthorTopic') || [];
        const exactMatch = matches.find(t => t.title.toLowerCase() === authorName.toLowerCase());

        if (!exactMatch) {
          const closestMatches = matches.map(t => t.title).slice(0, 3);
          const msg = matches.length > 0
            ? `Invalid author "${authorName}". Did you mean: ${closestMatches.join(', ')}?`
            : `Invalid author "${authorName}". Make sure it exists in the Authors topic.`;
          setMsg(`❌ ${msg}`);
          setSaving(false);
          return;
        }
        authorSlugs.push(exactMatch.key);
      }
      processedUpdates.authors = authorSlugs;
    } catch (e) {
      setMsg(`❌ Error validating authors`);
      setSaving(false);
      return;
    }
  }

  let successCount = 0;
  let errors = [];

  for (const indexTitle of pick) {
    try {
      setMsg(`Fetching data for ${indexTitle}...`);
      
      const existingIndexData = await Sefaria.getIndexDetails(indexTitle);
      if (!existingIndexData) {
        errors.push(`${indexTitle}: Could not fetch existing index data.`);
        continue;
      }

      setMsg(`Updating ${indexTitle}...`);

      // Create a copy of updates for this specific index
      let indexSpecificUpdates = { ...processedUpdates };

      // Handle TOC zoom specially - it needs to be set on nodes
      let tocZoomValue = null;
      if ('toc_zoom' in indexSpecificUpdates) {
        tocZoomValue = indexSpecificUpdates.toc_zoom;
        delete indexSpecificUpdates.toc_zoom; // Don't include in regular updates
      }

      // Handle smart detection
      const pattern = detectCommentaryPattern(indexTitle);

      // Handle dependence auto-detection
      if (indexSpecificUpdates.dependence === 'auto') {
        if (pattern) {
          indexSpecificUpdates.dependence = 'Commentary';
        } else {
          delete indexSpecificUpdates.dependence;
          console.warn(`Could not auto-detect dependence for ${indexTitle}`);
        }
      }

      // Handle base_text_titles auto-detection
      if (indexSpecificUpdates.base_text_titles === 'auto') {
        if (pattern && pattern.baseText) {
          // For "Kehati on Mishnah Bikkurim", this will be ["Mishnah Bikkurim"]
          indexSpecificUpdates.base_text_titles = [pattern.baseText];
        } else {
          delete indexSpecificUpdates.base_text_titles;
          console.warn(`Could not auto-detect base text for ${indexTitle}`);
        }
      }

      // Handle collective_title auto-detection
      if (indexSpecificUpdates.collective_title === 'auto') {
        if (pattern && pattern.commentaryName) {
          // For "Kehati on Mishnah Bikkurim", this will be "Kehati"
          indexSpecificUpdates.collective_title = pattern.commentaryName;
        } else {
          delete indexSpecificUpdates.collective_title;
          console.warn(`Could not auto-detect collective title for ${indexTitle}`);
        }
      }

      // Handle term creation for collective_title
      if (indexSpecificUpdates.collective_title && indexSpecificUpdates.he_collective_title) {
        try {
          await createTermIfNeeded(indexSpecificUpdates.collective_title, indexSpecificUpdates.he_collective_title);
          // Remove he_collective_title from updates as it's not a direct index field
          delete indexSpecificUpdates.he_collective_title;
        } catch (e) {
          errors.push(`${indexTitle}: Failed to create term for collective title: ${e.message}`);
          continue;
        }
      } else if (indexSpecificUpdates.collective_title && !indexSpecificUpdates.he_collective_title) {
        // Check if term exists, if not, warn user
        try {
          await $.ajax({
            url: `/api/terms/${encodeURIComponent(indexSpecificUpdates.collective_title)}`,
            method: 'GET'
          });
          // Term exists, continue
        } catch (e) {
          if (e.status === 404) {
            errors.push(`${indexTitle}: Collective title "${indexSpecificUpdates.collective_title}" requires Hebrew equivalent to create term`);
            continue;
          }
        }
      }

      // Handle authors auto-detection
      if (indexSpecificUpdates.authors === 'auto') {
        if (pattern && pattern.commentaryName) {
          // Try to find the author based on the commentary name
          try {
            const response = await $.ajax({
              url: `/api/name/${pattern.commentaryName}`,
              method: 'GET'
            });
            const matches = response.completion_objects?.filter(t => t.type === 'AuthorTopic') || [];
            const exactMatch = matches.find(t => t.title.toLowerCase() === pattern.commentaryName.toLowerCase());

            if (exactMatch) {
              indexSpecificUpdates.authors = [exactMatch.key];
            } else {
              delete indexSpecificUpdates.authors;
              console.warn(`Could not auto-detect author for ${indexTitle}`);
            }
          } catch (e) {
            delete indexSpecificUpdates.authors;
            console.warn(`Error auto-detecting author for ${indexTitle}:`, e);
          }
        } else {
          delete indexSpecificUpdates.authors;
          console.warn(`Could not auto-detect author for ${indexTitle}`);
        }
      }

      // Apply TOC zoom to nodes if specified
      if (tocZoomValue !== null) {
        // The structure in the API response might be different from the Python object
        // Let's check multiple possible structures
        
        // First, let's see what structure we have
        console.log(`TOC zoom structure for ${indexTitle}:`, {
          hasNodes: !!existingIndexData.nodes,
          hasSchema: !!existingIndexData.schema,
          schemaNodes: existingIndexData.schema?.nodes,
          nodesType: typeof existingIndexData.nodes
        });

        // Try different ways to find the nodes
        let nodesToUpdate = [];
        
        // Method 1: If there's a schema with nodes array (like in your CLI: index.nodes.children)
        if (existingIndexData.schema?.nodes && Array.isArray(existingIndexData.schema.nodes)) {
          nodesToUpdate = existingIndexData.schema.nodes;
        }
        // Method 2: If nodes is at the top level
        else if (existingIndexData.nodes && Array.isArray(existingIndexData.nodes)) {
          nodesToUpdate = existingIndexData.nodes;
        }
        // Method 3: Check if it's a simple schema
        else if (existingIndexData.schema && !existingIndexData.schema.nodes) {
          // Simple text, set on schema itself
          existingIndexData.schema.toc_zoom = tocZoomValue;
          console.log(`Set toc_zoom=${tocZoomValue} on schema directly`);
        }

        // Update all nodes found
        if (nodesToUpdate.length > 0) {
          nodesToUpdate.forEach((node, index) => {
            if (node.nodeType === "JaggedArrayNode") {
              node.toc_zoom = tocZoomValue;
              console.log(`Set toc_zoom=${tocZoomValue} on node ${index}: ${node.title || 'default'}`);
            }
          });
        }
      }

      // Create postData with all the fields including modified schema
      const postData = {
        title: indexTitle,
        heTitle: existingIndexData.heTitle,
        categories: existingIndexData.categories,
        schema: existingIndexData.schema,  // This now includes our toc_zoom changes
        ...indexSpecificUpdates
      };

      const baseUrl = `/api/v2/raw/index/${encodeURIComponent(indexTitle.replace(/ /g, "_"))}`;
      const url = `${baseUrl}?update=1`;

      await $.ajax({
        url,
        type: 'POST',
        data: { json: JSON.stringify(postData) }
      });

      // After the cache reset, add a verification step
      await $.get(`/admin/reset/${encodeURIComponent(indexTitle)}`);

      // Verify the change (optional - for debugging)
      if (tocZoomValue !== null) {
        setTimeout(async () => {
          try {
            const updatedData = await Sefaria.getIndexDetails(indexTitle);
            console.log(`Verification for ${indexTitle} toc_zoom:`, {
              nodes: updatedData.schema?.nodes?.map(n => ({
                title: n.title || 'default',
                toc_zoom: n.toc_zoom
              }))
            });
          } catch (e) {
            console.error('Could not verify toc_zoom update');
          }
        }, 2000); // Wait 2 seconds for cache to clear
      }
      
      successCount++;

    } catch (e) {
      console.error(`Error updating ${indexTitle}:`, e);
      
      let errorMsg = 'Unknown error';
      if (e.responseJSON?.error) {
        errorMsg = e.responseJSON.error;
      } else if (e.responseText) {
        try {
          const parsed = JSON.parse(e.responseText);
          errorMsg = parsed.error || e.responseText;
        } catch {
          errorMsg = e.responseText || 'Server error';
        }
      } else if (e.statusText) {
        errorMsg = e.statusText;
      }
      
      errors.push(`${indexTitle}: ${errorMsg}`);
    }
  }

  if (errors.length) {
    setMsg(`⚠️ Finished. Updated ${successCount} of ${pick.size} indices. Errors: ${errors.join('; ')}`);
  } else {
    setMsg(`✅ Successfully updated ${successCount} indices`);
    setUpdates({});
    document.querySelectorAll('.field-input').forEach(el => el.value = '');
  }
  setSaving(false);
};
    
  const handleFieldChange = (fieldName, value) => {
    setUpdates(prev => ({...prev, [fieldName]: value}));
  };

  const renderField = (fieldName) => {
    const fieldMeta = INDEX_FIELD_METADATA[fieldName];
    const currentValue = updates[fieldName] || "";

    const commonProps = {
      className: "dlVersionSelect field-input",
      placeholder: fieldMeta.placeholder,
      value: currentValue,
      onChange: e => handleFieldChange(fieldName, e.target.value),
      style: { width: "100%", direction: fieldMeta.dir || "ltr" }
    };

    return (
      <div key={fieldName} style={{ marginBottom: "12px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
          {fieldMeta.label}:
        </label>

        {fieldMeta.help && (
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
            {fieldMeta.help}
            {fieldMeta.auto && (
              <span style={{ color: "#007cba", fontWeight: "500" }}>
                {" "}(Supports 'auto' for commentary texts)
              </span>
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
          <input
            {...commonProps}
            type="number"
            min="0"
            max="10"
            onBlur={(e) => {
              if (fieldMeta.validate && !fieldMeta.validate(e.target.value)) {
                e.target.style.borderColor = 'red';
                e.target.title = 'Invalid value';
              } else {
                e.target.style.borderColor = '';
                e.target.title = '';
              }
            }}
          />
        ) : (
          <input {...commonProps} type="text" />
        )}
      </div>
    );
  };

  return (
    <div className="modToolsSection">
      <div className="dlSectionTitle">Bulk Edit Index Metadata</div>

      <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#fff3cd", border: "1px solid #ffeaa7", borderRadius: "4px", fontSize: "14px" }}>
        <strong>⚠️ Important Notes:</strong>
        <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
          <li><strong>Authors:</strong> Must exist in the Authors topic. Use exact names or slugs.</li>
          <li><strong>Collective Title:</strong> If Hebrew equivalent is provided, terms will be created automatically if they don't exist.</li>
          <li><strong>Base Text Titles:</strong> Must be exact index titles (e.g., "Mishnah Berakhot", not "Berakhot").</li>
          <li><strong>Auto-detection:</strong> Works for commentary texts with "X on Y" format.</li>
          <li><strong>TOC Zoom:</strong> Integer 0-10 (0=fully expanded, higher=more collapsed).</li>
        </ul>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <input
          className="dlVersionSelect"
          placeholder="Version title"
          value={vtitle}
          onChange={e => setVtitle(e.target.value)}
          style={{ flex: 1 }}
        />
        <select
          className="dlVersionSelect"
          value={lang}
          onChange={e => setLang(e.target.value)}
          style={{ width: "100px" }}
        >
          <option value="">All langs</option>
          <option value="he">Hebrew</option>
          <option value="en">English</option>
        </select>
        <button
          className="modtoolsButton"
          onClick={load}
          disabled={loading || !vtitle}
        >
          {loading ? "Loading..." : "Find Indices"}
        </button>
      </div>

      {indices.length > 0 && (
        <>
          <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                checked={pick.size === indices.length}
                onChange={() => setPick(pick.size === indices.length ? new Set() : new Set(indices))}
              />
              <span style={{ fontWeight: "500" }}>
                Select all ({indices.length} indices)
              </span>
            </label>
          </div>

          <div
            className="indicesList"
            style={{
              maxHeight: "200px",
              overflow: "auto",
              border: "1px solid #ddd",
              padding: "8px",
              marginBottom: "16px",
              backgroundColor: "#f9f9f9"
            }}
          >
            {indices.map(t => (
              <label key={t} style={{ display: "block", padding: "4px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={pick.has(t)}
                  onChange={e => {
                    const s = new Set(pick);
                    e.target.checked ? s.add(t) : s.delete(t);
                    setPick(s);
                  }}
                /> {t}
              </label>
            ))}
          </div>
        </>
      )}

      {pick.size > 0 && (
        <>
          <div style={{ marginBottom: "12px", fontWeight: "500" }}>
            Edit fields for {pick.size} selected {pick.size === 1 ? 'index' : 'indices'}:
          </div>

          <div style={{ marginBottom: "16px" }}>
            {Object.keys(INDEX_FIELD_METADATA).map(f => renderField(f))}
          </div>

          {Object.keys(updates).filter(k => updates[k]).length > 0 && (
            <div style={{ marginBottom: "8px", padding: "8px", backgroundColor: "#e7f3ff", borderRadius: "4px" }}>
              <strong>Changes to apply:</strong>
              <ul style={{ margin: "4px 0 0 20px", padding: 0 }}>
                {Object.entries(updates).filter(([k,v]) => v || k === 'toc_zoom').map(([k, v]) => (
                  <li key={k} style={{ fontSize: "14px" }}>
                    {INDEX_FIELD_METADATA[k]?.label || k}: "{v}"
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            className="modtoolsButton"
            disabled={Object.keys(updates).filter(k=>updates[k] || k === 'toc_zoom').length === 0 || saving}
            onClick={save}
          >
            {saving ? "Saving..." : `Save Changes to ${pick.size} Indices`}
          </button>
        </>
      )}

      {msg && (
        <div
          className="message"
          style={{
            marginTop: "12px",
            padding: "8px",
            borderRadius: "4px",
            backgroundColor: msg.includes("✅") ? "#d4edda" :
                           msg.includes("❌") ? "#f8d7da" : 
                           msg.includes("⚠️") ? "#fff3cd" : "#d1ecf1",
            color: msg.includes("✅") ? "#155724" :
                   msg.includes("❌") ? "#721c24" : 
                   msg.includes("⚠️") ? "#856404" : "#0c5460"
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
};


class ModeratorToolsPanel extends Component {
  constructor(props) {
    super(props);
    this.handleWfSubmit = this.handleWfSubmit.bind(this);
    this.wfFileInput = React.createRef();

    this.state = {
      // Bulk Download
      bulk_format: null,
      bulk_title_pattern: null,
      bulk_version_title_pattern: null,
      bulk_language: null,
      // CSV Upload
      files: [],
      uploading: false,
      uploadError: null,
      uploadMessage: null,
    };
  }
  handleFiles(event) {
    this.setState({files: event.target.files});
  }
  uploadFiles(event) {
    event.preventDefault();
    this.setState({uploading: true, uploadMessage:"Uploading..."});
    let formData = new FormData();
    for (let i = 0; i < this.state.files.length; i++) {
      let file = this.state.files[i];
      formData.append('texts[]', file, file.name);
    }
    $.ajax({
      url: "api/text-upload",
      type: 'POST',
      data: formData,
      success: function(data) {
        if (data.status == "ok") {
          this.setState({uploading: false, uploadMessage: data.message, uploadError: null, files:[]});
          $("#file-form").get(0).reset(); //Remove selected files from the file selector
        } else {
          this.setState({"uploadError": "Error - " + data.error, uploading: false, uploadMessage: data.message});
        }
      }.bind(this),
      error: function(xhr, status, err) {
        this.setState({"uploadError": "Error - " + err.toString(), uploading: false, uploadMessage: null});
      }.bind(this),
      cache: false,
      contentType: false,
      processData: false
    });
  }
  onDlTitleChange(event) {
    this.setState({bulk_title_pattern: event.target.value});
  }
  onDlVersionChange(event) {
    this.setState({bulk_version_title_pattern: event.target.value});
  }
  onDlLanguageSelect(event) {
    this.setState({bulk_language: event.target.value});
  }
  onDlFormatSelect(event) {
    this.setState({bulk_format: event.target.value});
  }
  bulkVersionDlLink() {
    let args = ["format","title_pattern","version_title_pattern","language"].map(
        arg => this.state["bulk_" + arg]?`${arg}=${encodeURIComponent(this.state["bulk_"+arg])}`:""
    ).filter(a => a).join("&");
    return "download/bulk/versions/?" + args;
  }

  handleInputChange(event) {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const name = target.name;

    this.setState({
      [name]: value
    });
  }

  handleWfSubmit(event) {
    event.preventDefault();
    alert(
      `Selected file - ${this.wfFileInput.current.files[0].name}`
    );
  }

  render () {
    // Bulk Download
    const dlReady = (this.state.bulk_format && (this.state.bulk_title_pattern || this.state.bulk_version_title_pattern));
    const downloadButton = <div className="modtoolsButton">
        <div className="modtoolsButtonInner">
          <span className="int-en">Download</span>
          <span className="int-he">הורדה</span>
        </div>
      </div>;
    const downloadSection = (
      <div className="modToolsSection dlSection">
        <div className="dlSectionTitle">
          <span className="int-en">Bulk Download Text</span>
          <span className="int-he">הורדת הטקסט</span>
        </div>
        <input className="dlVersionSelect" type="text" placeholder="Index Title Pattern" onChange={this.onDlTitleChange} />
        <input className="dlVersionSelect" type="text" placeholder="Version Title Pattern" onChange={this.onDlVersionChange}/>
        <select className="dlVersionSelect dlVersionLanguageSelect" value={this.state.bulk_language || ""} onChange={this.onDlLanguageSelect}>
          <option disabled>Language</option>
          <option key="all" value="" >Hebrew & English</option>
          <option key="he" value="he" >Hebrew</option>
          <option key="en" value="en" >English</option>
        </select>
        <select className="dlVersionSelect dlVersionFormatSelect" value={this.state.bulk_format || ""} onChange={this.onDlFormatSelect}>
          <option disabled>File Format</option>
          <option key="txt" value="txt" >Text (with tags)</option>
          <option key="plain.txt" value="plain.txt" >Text (without tags)</option>
          <option key="csv" value="csv" >CSV</option>
          <option key="json" value="json" >JSON</option>
        </select>
        {dlReady?<a href={this.bulkVersionDlLink()} download>{downloadButton}</a>:downloadButton}
      </div>);

    // Uploading
    const ulReady = (!this.state.uploading) && this.state.files.length > 0;
    const uploadButton = <a><div className="modtoolsButton" onClick={this.uploadFiles}><div className="modtoolsButtonInner">
       <span className="int-en">Upload</span>
       <span className="int-he">העלאה</span>
      </div></div></a>;
    const uploadForm = (
      <div className="modToolsSection">
        <div className="dlSectionTitle">
          <span className="int-en">Bulk Upload CSV</span>
          <span className="int-he">העלאה מ-CSV</span>
        </div>
         <form id="file-form">
           <input className="dlVersionSelect" type="file" id="file-select"  multiple onChange={this.handleFiles}/>
           {ulReady?uploadButton:""}
         </form>
        {this.state.uploadMessage?<div className="message">{this.state.uploadMessage}</div>:""}
        {this.state.uploadError?<div className="error">{this.state.uploadError}</div>:""}
      </div>);
    const wflowyUpl = (
      <div className="modToolsSection">
          <WorkflowyModeratorTool />
      </div>);
    const uploadLinksFromCSV = (
      <div className="modToolsSection">
          <UploadLinksFromCSV />
      </div>);
    const getLinks = (
      <div className="modToolsSection">
          <GetLinks/>
      </div>);
    const removeLinksFromCsv = (
        <div className='modToolsSection'>
            <RemoveLinksFromCsv/>
        </div>
    );

     const bulkIndexEditor = (
      <div className="modToolsSection"><BulkIndexEditor /></div>
     );
     const bulkVersionEditor = (
       <div className="modToolsSection">
         <BulkVersionEditor />
       </div>
     );
    const autoLinkCommentaryTool = (
      <div className="modToolsSection"><AutoLinkCommentaryTool /></div>
    );

    const nodeTitleEditor = (
      <div className="modToolsSection"><NodeTitleEditor /></div>
    );

    // Add to the return statement:
    return Sefaria.is_moderator ? (
      <div className="modTools">
        {downloadSection}
        {uploadForm}
        {wflowyUpl}
        {uploadLinksFromCSV}
        {getLinks}
        {removeLinksFromCsv}
        {bulkIndexEditor}
        {bulkVersionEditor}
        {autoLinkCommentaryTool}
        {nodeTitleEditor}
      </div>
    ) : (
       <div className="modTools">
         Tools are only available to logged-in moderators.
       </div>
     );
   }
 }
ModeratorToolsPanel.propTypes = {
  interfaceLang: PropTypes.string
};


class WorkflowyModeratorTool extends Component{
    constructor(props) {
    super(props);
    this.wfFileInput = React.createRef();
    this.state = {
      c_index: true,
      c_version: false,
      delims: '',
      term_scheme: '',
      uploading: false,
      uploadMessage: null,
      uploadResult: null,
      error: false,
      errorIsHTML: false,
      files: []
    };
  }

  handleInputChange = (event) => {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const name = target.name;

    this.setState({
      [name]: value
    });
  }

  handleFileChange = (event) => {
    const files = Array.from(event.target.files);
    this.setState({
      files: files
    });
  }

  handleWfSubmit = (event) => {
    event.preventDefault();

    if (this.state.files.length === 0) {
      this.setState({uploadMessage: "Please select at least one file", error: true, errorIsHTML: false});
      return;
    }

    this.setState({uploading: true, uploadMessage: `Uploading ${this.state.files.length} file${this.state.files.length > 1 && 's'}...`});

    const data = new FormData(event.target);

    const request = new Request(
        '/modtools/upload_text',
        {headers: {'X-CSRFToken': Cookies.get('csrftoken')}}
    );

    fetch(request, {
      method: 'POST',
      mode: 'same-origin',
      credentials: 'same-origin',
      body: data,
    }).then(response => {
        this.setState({uploading: false, uploadMessage:""});
        if (!response.ok) {
            response.text().then(resp_text=> {
                console.log("error in html form", resp_text);
                this.setState({uploading: false,
                    error: true,
                    errorIsHTML: true,
                     uploadResult: resp_text});
            })
        }else{
            response.json().then(resp_json=>{
                console.log("okay response", resp_json);

                const successes = resp_json.successes || [];
                const failures = resp_json.failures || [];

                let uploadMessage = "";
                let uploadResult = "";

                // Build summary message
                if (failures.length === 0) {
                    uploadMessage = `Successfully imported ${successes.length} file${successes.length > 1 && 's'}`;
                } else if (successes.length === 0) {
                    uploadMessage = `All ${failures.length} file${failures.length > 1 && 's'} failed`;
                } else {
                    uploadMessage = `${successes.length} succeeded, ${failures.length} failed`;
                }

                // Build detailed result
                const parts = [];
                if (successes.length > 0) {
                    parts.push("Successes:\n" + successes.map(f => `  ✓ ${f}`).join('\n'));
                }
                if (failures.length > 0) {
                    parts.push("Failures:\n" + failures.map(f => `  ✗ ${f.file}: ${f.error}`).join('\n'));
                }
                uploadResult = parts.join('\n\n');

                this.setState({
                    uploading: false,
                    error: failures.length > 0,
                    errorIsHTML: false,
                    uploadMessage: uploadMessage,
                    uploadResult: uploadResult
                });

                // Clear files after upload
                this.setState({files: []});
                if (this.wfFileInput.current) {
                  this.wfFileInput.current.value = '';
                }
            });
        }
    }).catch(error => {
        console.log("network error", error);
        this.setState({uploading: false, error: true, errorIsHTML: false, uploadMessage:error.message});
    });
  }

  parseErrorHTML(htmltext){
    console.log("pparsing html", htmltext);
    // Initialize the DOM parser
    let parser = new DOMParser();
    // Parse the text
    let doc = parser.parseFromString(htmltext, "text/html");
    //return {__html: doc};
    return doc
  }

  render() {
    return(
        <div className="workflowy-tool">
        <div className="dlSectionTitle">
          <span className="int-en">Workflowy Outline Upload</span>
          <span className="int-he">העלאת קובץ - workflowy</span>
        </div>
        <form id="wf-file-form" className="workflowy-tool-form" onSubmit={this.handleWfSubmit}>
           <label>
              Upload Workflowy file(s):
              <input
                type="file"
                name="workflowys[]"
                ref={this.wfFileInput}
                multiple
                accept=".opml"
                onChange={this.handleFileChange}
              />
              {this.state.files.length > 0 && (
                <div style={{fontSize: "12px", color: "#666", marginTop: "4px"}}>
                  Selected: {this.state.files.map(f => f.name).join(', ')}
                </div>
              )}
           </label>
           <label>
              Create Index Record:
              <input
                name="c_index"
                type="checkbox"
                value="true"
                checked={this.state.c_index}
                onChange={this.handleInputChange} />
           </label>
           <label>
              Create Version From Notes on Outline:
              <input
                name="c_version"
                type="checkbox"
                value="true"
                checked={this.state.c_version}
                onChange={this.handleInputChange} />
           </label>
           <label>
            Custom Delimiters (In the following Order- 1. Title Language 2. Alt Titles 3. Categories):
              <input
                className="dlVersionSelect"
                name="delims"
                type="text"
                value={this.state.delims}
                onChange={this.handleInputChange} />
            </label>
            <label>
              Optional Term Scheme Name:
              <input
                className="dlVersionSelect"
                name="term_scheme"
                type="text"
                value={this.state.term_scheme}
                onChange={this.handleInputChange} />
            </label>
             <button
               className="modtoolsButton"
               name="wf-submit"
               type="submit"
               disabled={this.state.uploading || this.state.files.length === 0}
             >
              <InterfaceText>
                <EnglishText className="int-en">
                  {this.state.uploading ? 'Uploading...' :
                   this.state.files.length > 1 ? `Upload ${this.state.files.length} Files` : 'Upload'}
                </EnglishText>
                <HebrewText className="int-he">
                  {this.state.uploading ? 'מעלה...' :
                   this.state.files.length > 1 ? `העלאת ${this.state.files.length} קבצים` : 'העלאה'}
                </HebrewText>
              </InterfaceText>
             </button>
         </form>
        <div id="wf-upl-msg" className="wf-upl-msg">{this.state.uploadMessage || ""}</div>
        { (this.state.error && this.state.errorIsHTML) ?
              <div id="wf-upl-message" className="wf-upl-message" dangerouslySetInnerHTML={{__html: this.state.uploadResult}}/> :
              <textarea id="wf-upl-message" className="wf-upl-message" cols="80" rows="30" value={this.state.uploadResult}></textarea> }
        </div>);
  }
}

class UploadLinksFromCSV extends Component{
  constructor(props) {
    super(props);
    this.state = {projectName: ''};
    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }
  isSubmitDisabled() {
      return !this.state.hasFile || !this.state.projectName.length;
  }
  handleChange(event) {
    const target = event.target;
    this.setState({[target.name]: target.value});
  }
  handleFileChange(event) {
      this.setState({hasFile: !!event.target.files[0]});
  }
  handleSubmit(event) {
    event.preventDefault();
    this.setState({uploading: true, uploadMessage:"Uploading..."});
    const data = new FormData(event.target);
    const request = new Request(
        '/modtools/links',
        {headers: {'X-CSRFToken': Cookies.get('csrftoken')}}
    );
    fetch(request, {
      method: 'POST',
      mode: 'same-origin',
      credentials: 'same-origin',
      body: data
    }).then(response => {
        if (!response.ok) {
            response.text().then(resp_text => {
                this.setState({uploading: false,
                    uploadMessage: "",
                    error: true,
                    errorIsHTML: true,
                    uploadResult: resp_text});
            })
        } else {
            response.json().then(resp_json => {
                this.setState({uploading: false,
                    error: false,
                    uploadMessage: resp_json.data.message,
                    uploadResult: JSON.stringify(resp_json.data.index, undefined, 4)});
                if (resp_json.data.errors) {
                    let blob = new Blob([resp_json.data.errors], {type: "text/plain;charset=utf-8"});
                    saveAs(blob, 'errors.csv');
                }
            });
        }
    }).catch(error => {
        this.setState({uploading: false, error: true, errorIsHTML: false, uploadMessage:error.message});
    });

  }
  getOptions() {
      const options = ['Commentary', 'Quotation', 'Related', 'Mesorat hashas', 'Ein Mishpat', 'Reference'];
      return options.map((option) => {
          return <option value={option.toLowerCase()} key={option}>{option}</option>;
      });
  }

  render() {
    return (
        <div className="uploadLinksFromCSV">
            <div className="dlSectionTitle">Upload links</div>
            <form id="upload-links-form" onSubmit={this.handleSubmit}>
                <label>
                    Upload file:
                    <input type="file" name="csv_file"  onChange={this.handleFileChange} />
                    <br />
                    Choose a csv file with two columns. First row should include titles, and the others valid refs to link
                    <br />
                </label>
                <label>
                    Select links type:
                    <select name="linkType" value={this.state.linkType} onChange={this.handleChange}>
                        {this.getOptions()}
                    </select>
                </label>
                <label>
                    Project name
                    <input
                        name="projectName"
                        type="text"
                        value={this.state.generatedBy}
                        onChange={this.handleChange}
                    />
                </label>
                <input type="submit" value="Submit" disabled={this.isSubmitDisabled()} />
            </form>
            { this.state.uploadMessage && <div>{this.state.uploadMessage}</div> }
            { (this.state.errorIsHTML) && <div dangerouslySetInnerHTML={{__html: this.state.uploadResult}}/> }
        </div>
    );
  }
}

const RemoveLinksFromCsv = () => {
    const [fileName, setFileName] = useState(false);
    const [uploadMessage, setUploadMessage] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const handleFileChange = (event) => {
        setFileName(event.target.files[0] || null);
    }
    const handleSubmit = (event) => {
        event.preventDefault();
        setUploadMessage("Uploading...");
        const data = new FormData(event.target);
        data.append('action', 'DELETE');
        const request = new Request(
            '/modtools/links',
            {headers: {'X-CSRFToken': Cookies.get('csrftoken')}}
        );
        fetch(request, {
            method: 'POST',
            mode: 'same-origin',
            credentials: 'same-origin',
            body: data
        }).then(response => {
            if (!response.ok) {
                response.text().then(resp_text => {
                  setUploadMessage(null);
                  setErrorMessage(resp_text);
                })
            } else {
                response.json().then(resp_json => {
                    setUploadMessage(resp_json.data.message);
                    setErrorMessage(null);
                    if (resp_json.data.errors) {
                        let blob = new Blob([resp_json.data.errors], {type: "text/plain;charset=utf-8"});
                        saveAs(blob, `${fileName.name.split('.')[0]} - error report - undeleted links.csv`);
                    }
                });
            }
        }).catch(error => {
            setUploadMessage(error.message);
            setErrorMessage(null);
        });
    };
    return (
        <div className="remove-links-csv">
            <div className="dlSectionTitle">Remove links</div>
            <form id="remove-links-form" onSubmit={handleSubmit}>
                <label>
                    Upload file:
                    <input type="file" name="csv_file"  onChange={handleFileChange} />
                    <br/>
                    Choose a csv file with two columns. First row should include titles, and the others valid refs to delete.
                    <br/>
                    Please note that it should be the exact ref, so 'Genesis 1' is different than 'Genesis 1:1-31'
                </label>
                <br/>
                <input type="submit" value="Submit" disabled={!fileName} />
            </form>
            {uploadMessage && <div>{uploadMessage}</div>}
            {errorMessage && <div dangerouslySetInnerHTML={{__html: errorMessage}}/> }
        </div>
    );
};

const InputRef = ({ id, value, handleChange, handleBlur, error }) => (
  <label>
    Ref{id}
    <input
      type="text"
      name={`ref${id}`}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      style={error ? { backgroundColor: "rgba(255, 0, 0, 0.5)" } : {}}
      placeholder={id === 2 ? 'all library, limited to 15k links' : null}
    />
    <p role="alert" style={{ color: "rgb(255, 0, 0)" }}>{(error) ? "Not a valid ref" : ""}</p>
  </label>
);
InputRef.propTypes = {
  id: PropTypes.number.isRequired,
  value: PropTypes.string.isRequired,
  handleChange: PropTypes.func.isRequired,
  handleBlur: PropTypes.func.isRequired,
  error: PropTypes.bool,
};

const InputNonRef = ({ name, value, handleChange }) => (
  <label>
    {name.charAt(0).toUpperCase() + name.slice(1)}
    <input
      type="text"
      name={name}
      value={value}
      onChange={handleChange}
      placeholder="any"
    />
  </label>
);
InputNonRef.propTypes = {
  name: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  handleChange: PropTypes.func.isRequired,
};

const DownloadButton = () => (
  <div className="modtoolsButton">
    <div className="modtoolsButtonInner">
      Download
    </div>
  </div>
);

function GetLinks() {
  const [refs, setRefs] = useState({ ref1: '', ref2: '' });
  const [errors, setErrors] = useState({ref2: false});
  const [type, setType] = useState('');
  const [generatedBy, setGeneratedBy] = useState('');
  const [bySegment, setBySegment] = useState(false)

  const handleCheck = () => {
    setBySegment(!bySegment)
  }

  const handleChange = async (event) => {
    const { name, value } = event.target;
    setRefs(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      if (!value) {
          setErrors(prev => ({...prev, [name]: false}));
      }
      else {
          try {
              const response = await Sefaria.getName(value);
              setErrors(prev => ({...prev, [name]: !response.is_ref}));
          } catch (error) {
              console.error(error);
          }
      }
    }
  }


  const handleBlur = async (event) => {
    const name = event.target.name;
    if (refs[name]) {
      try {
        const response = await Sefaria.getName(refs[name]);
        setErrors(prev => ({ ...prev, [name]: !response.is_ref }));
      } catch (error) {
        console.error(error);
      }
    }
  }

  const formReady = () => {
    return refs.ref1 && errors.ref1 === false && errors.ref2 === false;
  }

  const linksDownloadLink = () => {
    const queryParams = qs.stringify({ type: (type) ? type : null, generated_by: (generatedBy) ? generatedBy : null },
        { addQueryPrefix: true, skipNulls: true });
    const tool = (bySegment) ? 'index_links' : 'links';
    return `modtools/${tool}/${refs.ref1}/${refs.ref2 || 'all'}${queryParams}`;
  }

  return (
    <div className="getLinks">
      <div className="dlSectionTitle">Download links</div>
      <form id="download-links-form">
        <fieldset>
            <InputRef id={1} value={refs.ref1} handleChange={handleChange} handleBlur={handleBlur} error={errors.ref1} />
            <label>
                <input
                    type="checkbox"
                    checked={bySegment}
                    onChange={handleCheck}
                />
                iterate by segments (include empties)
            </label>
        </fieldset>
        <br/>
        <InputRef id={2} value={refs.ref2} handleChange={handleChange} handleBlur={handleBlur} error={errors.ref2} />
        <br/>
        <InputNonRef name='type' value={type} handleChange={(e) => setType(e.target.value)} />
        <br/>
        <InputNonRef name='generated_by' value={generatedBy} handleChange={(e) => setGeneratedBy(e.target.value)} />
      </form>
      {formReady() ? <a href={linksDownloadLink()} download><DownloadButton /></a> : <DownloadButton />}
    </div>
  );
}


const ALL_FIELDS = [
  "versionTitle", "versionTitleInHebrew",
  "versionSource", "license", "status",        // locked = status:"locked"
  "priority", "digitizedBySefaria",
  "isPrimary", "isSource",
  "versionNotes", "versionNotesInHebrew",
  "purchaseInformationURL", "purchaseInformationImage",
  "direction"         // ltr / rtl  – rarely needed, but allowed
];

const BulkVersionEditor = () => {
  const [vtitle, setVtitle]   = useState("");
  const [lang,   setLang]     = useState("");
  const [indices, setIndices] = useState([]);
  const [pick,    setPick]    = useState(new Set());
  const [updates, setUpdates] = useState({});
  const [msg,     setMsg]     = useState("");

  /* ── helpers ──────────────────────────────────────────────── */
  const load = () =>
    $.getJSON(`/api/version-indices?versionTitle=${encodeURIComponent(vtitle)}&language=${lang}`,
      d => { setIndices(d.indices); setPick(new Set(d.indices)); }, // pre-select all
      xhr => setMsg(xhr.responseText));

  const toggleAll = () =>
    setPick(pick.size === indices.length ? new Set() : new Set(indices));

  const save = () =>
    $.ajax({
      url: "/api/version-bulk-edit",
      type: "POST",
      contentType: "application/json",
      data: JSON.stringify({
        versionTitle: vtitle, language: lang,
        indices: Array.from(pick), updates
      }),
      success: d => setMsg(`✅ Updated ${d.count} versions`),
      error:   x => setMsg(`❌ ${x.responseText}`)
    });

  /* ── UI ───────────────────────────────────────────────────── */
  return (
    <div className="modToolsSection">
      <div className="dlSectionTitle">Bulk Edit Version Metadata</div>

      {/* search bar */}
      <input  className="dlVersionSelect" placeholder="Version title"
              value={vtitle} onChange={e=>setVtitle(e.target.value)} />
      <select className="dlVersionSelect"
              value={lang} onChange={e=>setLang(e.target.value)}>
        <option value="">lang</option><option>he</option><option>en</option>
      </select>
      <button className="modtoolsButton" onClick={load}>Load</button>

      {/* index checklist */}
      {indices.length > 0 && (
        <>
          <label style={{display:"block",marginTop:"6px"}}>
            <input type="checkbox"
                   checked={pick.size===indices.length}
                   onChange={toggleAll}/> Select all
          </label>
          <div className="indicesList">
            {indices.map(t =>
              <label key={t}>
                <input type="checkbox"
                       checked={pick.has(t)}
                       onChange={e=>{
                         const s=new Set(pick);
                         e.target.checked ? s.add(t) : s.delete(t);
                         setPick(s);
                       }}/> {t}
              </label>)}
          </div>
        </>
      )}

      {/* field inputs */}
      {pick.size > 0 && (
        <>
          <div style={{marginTop:"8px"}}>Fields to change:</div>
          {ALL_FIELDS.map(f =>
            <input key={f} className="dlVersionSelect"
                   placeholder={f}
                   onChange={e=>{
                     const v=e.target.value;
                     setUpdates(u=>{
                       const n={...u}; v?n[f]=v:delete n[f]; return n;
                     });
                   }} />)}
          <button className="modtoolsButton"
                  disabled={!Object.keys(updates).length}
                  onClick={save}>Save</button>
        </>
      )}

      {msg && <div className="message">{msg}</div>}
    </div>
  );
};

const AutoLinkCommentaryTool = () => {
  const [vtitle,   setVtitle]   = React.useState("");
  const [lang,     setLang]     = React.useState("");
  const [indices,  setIndices]  = React.useState([]);
  const [pick,     setPick]     = React.useState(new Set());
  const [msg,      setMsg]      = React.useState("");
  const [loading,  setLoading]  = React.useState(false);
  const [linking,  setLinking]  = React.useState(false);
  const [mapping,  setMapping]  = React.useState("many_to_one_default_only");   // NEW

  /* ---------------------------------- LOAD --------------------------------- */

  const load = () => {
    if (!vtitle) { setMsg("❌ Please enter a version title"); return; }
    setLoading(true);  setMsg("Loading indices…");

    $.getJSON(`/api/version-indices?versionTitle=${encodeURIComponent(vtitle)}&language=${lang}`)
      .done(d => {
        const comm = d.indices.filter(t => t.includes(" on "));
        setIndices(comm);
        setPick(new Set(comm));
        setMsg(`Found ${comm.length} commentary indices`);
      })
      .fail(xhr => {
        const err = xhr.responseJSON?.error || xhr.responseText || "Failed to load indices";
        setMsg(`❌ Error: ${err}`);
        setIndices([]);  setPick(new Set());
      })
      .always(() => setLoading(false));
  };

  /* ------------------------------ CREATE LINKS ----------------------------- */

const createLinks = async () => {
  if (!pick.size) return;
  setLinking(true); setMsg("Creating links…");

  let successCount = 0;
  const errors = [];

  for (const indexTitle of pick) {
    try {
      /* 1️⃣ fetch current Index */
      const raw = await Sefaria.getIndexDetails(indexTitle);
      if (!raw) throw new Error("couldn’t fetch index JSON");

      /* 2️⃣ guess base work from “… on <Work>” pattern */
      const guess = (indexTitle.match(/ on (.+)$/) || [])[1];
      if (!guess) throw new Error("title pattern didn’t reveal base text");

      /* 3️⃣ add missing commentary metadata (idempotent) */
      if (!raw.base_text_titles || !raw.base_text_mapping) {
        const patched = {
          ...raw,
          dependence        : "Commentary",
          base_text_titles  : raw.base_text_titles  || [guess],
          base_text_mapping : raw.base_text_mapping || mapping
        };
        delete patched._id;
        const url = `/api/v2/raw/index/${encodeURIComponent(indexTitle.replace(/ /g,"_"))}?update=1`;
        await $.post(url, { json: JSON.stringify(patched) });
        /* 3b – clear in‑process + Redis + varnish caches */
        await $.get(`/admin/reset/${encodeURIComponent(indexTitle)}`);
      }

      /* 4️⃣ rebuild links */
      await $.get(`/admin/rebuild/auto-links/${encodeURIComponent(indexTitle.replace(/ /g,"_"))}`);
      successCount++;

    } catch (e) {
      const m = e.responseJSON?.error || e.statusText || e.message;
      errors.push(`${indexTitle}: ${m}`);
    }
  }

  setMsg(
    errors.length
      ? `⚠️ Finished. Linked ${successCount}/${pick.size}. Errors: ${errors.join("; ")}`
      : `✅ Links built for all ${successCount} indices`
  );
  setLinking(false);
};


  return (
    <div className="modToolsSection">
      <div className="dlSectionTitle">Auto-Link Commentaries</div>
      
      <div style={{ marginBottom: "8px", padding: "8px", backgroundColor: "#e7f3ff", borderRadius: "4px" }}>
        <strong>How it works:</strong> This tool automatically creates links between commentaries and their base texts.
        For example, "Rashi on Genesis 1:1:1" will be linked to "Genesis 1:1". Links update dynamically when text changes.
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <input
          className="dlVersionSelect"
          placeholder="Version title"
          value={vtitle}
          onChange={e => setVtitle(e.target.value)}
          style={{ flex: 1 }}
        />
        <select
          className="dlVersionSelect"
          value={lang}
          onChange={e => setLang(e.target.value)}
          style={{ width: "100px" }}
        >
          <option value="">All langs</option>
          <option value="he">Hebrew</option>
          <option value="en">English</option>
        </select>
        <button
          className="modtoolsButton"
          onClick={load}
          disabled={loading || !vtitle}
        >
          {loading ? "Loading..." : "Find Commentaries"}
        </button>
      </div>

      {indices.length > 0 && (
        <>
          <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                checked={pick.size === indices.length}
                onChange={() => setPick(pick.size === indices.length ? new Set() : new Set(indices))}
              />
              <span style={{ fontWeight: "500" }}>
                Select all ({indices.length} commentaries)
              </span>
            </label>
          </div>

          <div
            className="indicesList"
            style={{
              maxHeight: "200px",
              overflow: "auto",
              border: "1px solid #ddd",
              padding: "8px",
              marginBottom: "16px",
              backgroundColor: "#f9f9f9"
            }}
          >
            {indices.map(t => (
              <label key={t} style={{ display: "block", padding: "4px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={pick.has(t)}
                  onChange={e => {
                    const s = new Set(pick);
                    e.target.checked ? s.add(t) : s.delete(t);
                    setPick(s);
                  }}
                /> {t}
              </label>
            ))}
           </div>
 
          <div style={{ marginBottom:"12px" }}>
            <label style={{ fontWeight:500 }}>base_text_mapping:&nbsp;</label>
            <select
              className="dlVersionSelect"
              value={mapping}
              onChange={e => setMapping(e.target.value)}
            >
              <option value="many_to_one_default_only">many_to_one_default_only (✓ Mishnah / Tanakh)</option>
              <option value="many_to_one">many_to_one</option>
              <option value="one_to_one_default_only">one_to_one_default_only</option>
              <option value="one_to_one">one_to_one</option>
            </select>
          </div>

          <button
            className="modtoolsButton"
            disabled={!pick.size || linking}
            onClick={createLinks}
          >
            {linking ? "Creating Links…" : `Create Links for ${pick.size} Commentaries`}
          </button>
        </>
      )}

      {msg && (
        <div className="message" style={{
          marginTop:12, padding:8, borderRadius:4,
          backgroundColor: msg.includes("✅") ? "#d4edda"
                       : msg.includes("❌") ? "#f8d7da"
                       : msg.includes("⚠️") ? "#fff3cd"
                       : "#d1ecf1",
          color: msg.includes("✅") ? "#155724"
               : msg.includes("❌") ? "#721c24"
               : msg.includes("⚠️") ? "#856404"
               : "#0c5460"
        }}>{msg}</div>
      )}
    </div>
  );
};

const NodeTitleEditor = () => {
  const [indexTitle, setIndexTitle] = React.useState("");
  const [indexData, setIndexData] = React.useState(null);
  const [editingNodes, setEditingNodes] = React.useState({});
  const [msg, setMsg] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [dependencies, setDependencies] = React.useState(null);
  const [checkingDeps, setCheckingDeps] = React.useState(false);

  const checkDependencies = async (title) => {
    setCheckingDeps(true);
    try {
      const response = await $.get(`/api/check-index-dependencies/${encodeURIComponent(title)}`);
      setDependencies(response);
    } catch (e) {
      console.error('Failed to check dependencies:', e);
      setDependencies(null);
    }
    setCheckingDeps(false);
  };

  const load = async () => {
    if (!indexTitle) {
      setMsg("❌ Please enter an index title");
      return;
    }

    setLoading(true);
    setMsg("Loading index...");

    try {
      const data = await Sefaria.getIndexDetails(indexTitle);
      setIndexData(data);
      setEditingNodes({});
      setMsg(`✅ Loaded ${indexTitle}`);

      // Check dependencies for the main index
      await checkDependencies(indexTitle);
    } catch (e) {
      setMsg(`❌ Error: Could not load index "${indexTitle}"`);
      setIndexData(null);
      setDependencies(null);
    }
    setLoading(false);
  };

  const extractNodes = (schema, path = []) => {
    let nodes = [];
    
    if (schema.nodes) {
      schema.nodes.forEach((node, index) => {
        const nodePath = [...path, index];
        nodes.push({
          path: nodePath,
          pathStr: nodePath.join('.'),
          node: node,
          titles: node.titles || [],
          sharedTitle: node.sharedTitle,
          title: node.title,
          heTitle: node.heTitle
        });
        
        // Recursively get child nodes
        if (node.nodes) {
          nodes = nodes.concat(extractNodes(node, nodePath));
        }
      });
    }
    
    return nodes;
  };

  const handleNodeEdit = (pathStr, field, value) => {
    setEditingNodes(prev => ({
      ...prev,
      [pathStr]: {
        ...prev[pathStr],
        [field]: value,
        // Add validation flags
        [`${field}_valid`]: field === 'title' ?
          (value.match(/^[\x00-\x7F]*$/) && !value.match(/[:.\\/-]/)) :
          true
      }
    }));
  };

  const save = async () => {
    if (Object.keys(editingNodes).length === 0) {
      setMsg("❌ No changes to save");
      return;
    }

    setSaving(true);
    setMsg("Saving changes...");

    try {
      // Validate changes before saving
      const validationErrors = [];
      Object.entries(editingNodes).forEach(([, edits]) => {
        if (edits.title !== undefined) {
          // Check for ASCII characters only in English titles
          if (!edits.title.match(/^[\x00-\x7F]*$/)) {
            validationErrors.push(`English title "${edits.title}" contains non-ASCII characters`);
          }
          // Check for forbidden characters
          if (edits.title.match(/[:.\\/-]/)) {
            validationErrors.push(`English title "${edits.title}" contains forbidden characters (periods, colons, hyphens, slashes)`);
          }
        }
      });

      if (validationErrors.length > 0) {
        setMsg(`❌ Validation errors: ${validationErrors.join('; ')}`);
        setSaving(false);
        return;
      }

      // Create a deep copy of the index data
      const updatedIndex = JSON.parse(JSON.stringify(indexData));

      // Apply edits to the nodes
      Object.entries(editingNodes).forEach(([pathStr, edits]) => {
        const path = pathStr.split('.').map(Number);
        let node = updatedIndex.schema || updatedIndex;

        // Navigate to the correct node
        for (let i = 0; i < path.length; i++) {
          if (i === path.length - 1) {
            // Last step - this is our target node
            const targetNode = node.nodes[path[i]];

            // Apply edits
            if (edits.removeSharedTitle) {
              delete targetNode.sharedTitle;
            }

            if (edits.title !== undefined) {
              targetNode.title = edits.title;

              // Update or add English title in titles array
              const enTitleIndex = targetNode.titles?.findIndex(t => t.lang === "en" && t.primary);
              if (enTitleIndex >= 0) {
                targetNode.titles[enTitleIndex].text = edits.title;
              } else {
                if (!targetNode.titles) targetNode.titles = [];
                targetNode.titles.push({
                  text: edits.title,
                  lang: "en",
                  primary: true
                });
              }
            }

            if (edits.heTitle !== undefined) {
              targetNode.heTitle = edits.heTitle;

              // Update or add Hebrew title in titles array
              const heTitleIndex = targetNode.titles?.findIndex(t => t.lang === "he" && t.primary);
              if (heTitleIndex >= 0) {
                targetNode.titles[heTitleIndex].text = edits.heTitle;
              } else {
                if (!targetNode.titles) targetNode.titles = [];
                targetNode.titles.push({
                  text: edits.heTitle,
                  lang: "he",
                  primary: true
                });
              }
            }
          } else {
            node = node.nodes[path[i]];
          }
        }
      });

      // Save the updated index - remove the ?update=1 parameter since we're sending the full data
      const url = `/api/v2/raw/index/${encodeURIComponent(indexTitle.replace(/ /g, "_"))}`;

      await $.ajax({
        url,
        type: 'POST',
        data: { json: JSON.stringify(updatedIndex) },
        dataType: 'json'
      });

      // Reset cache
      await $.get(`/admin/reset/${encodeURIComponent(indexTitle)}`);

      setMsg(`✅ Successfully updated node titles`);
      setEditingNodes({});

      // Reload to show changes
      setTimeout(() => load(), 1000);

    } catch (e) {
      console.error('Save error:', e);

      // Handle different types of errors
      let errorMsg = 'Unknown error';
      let errorDetails = '';

      if (e.responseJSON) {
        errorMsg = e.responseJSON.error || 'Server error';
        errorDetails = e.responseJSON.details || '';

        // Provide specific guidance based on error type
        switch (e.responseJSON.type) {
          case 'dependency_error':
            errorMsg = `⚠️ Dependency Warning: ${errorMsg}`;
            errorDetails = 'This text has dependent commentaries. Changes may affect other texts.';
            break;
          case 'validation_error':
          case 'title_validation_error':
            errorMsg = `❌ Validation Error: ${errorMsg}`;
            break;
          default:
            errorMsg = `❌ Error: ${errorMsg}`;
        }

        if (errorDetails) {
          errorMsg += ` (${errorDetails})`;
        }
      } else if (e.responseText) {
        errorMsg = `❌ Error: ${e.responseText}`;
      }

      setMsg(errorMsg);
    }

    setSaving(false);
  };

  const nodes = indexData ? extractNodes(indexData.schema || indexData) : [];

  return (
    <div className="modToolsSection">
      <div className="dlSectionTitle">Edit Node Titles</div>
      
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <input
          className="dlVersionSelect"
          placeholder="Index title (e.g., 'Binyan Olam')"
          value={indexTitle}
          onChange={e => setIndexTitle(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && load()}
          style={{ flex: 1 }}
        />
        <button
          className="modtoolsButton"
          onClick={load}
          disabled={loading || !indexTitle}
        >
          {loading ? "Loading..." : "Load Index"}
        </button>
      </div>

      {nodes.length > 0 && (
        <>
          <div style={{ marginBottom: "16px", fontSize: "14px", color: "#666" }}>
            Found {nodes.length} nodes. Edit titles below:
          </div>

          <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#fff3cd", border: "1px solid #ffeaa7", borderRadius: "4px", fontSize: "14px" }}>
            <strong>⚠️ Important:</strong>
            <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
              <li><strong>English titles:</strong> Must contain only ASCII characters. No periods, hyphens, colons, or slashes.</li>
              <li><strong>Hebrew titles:</strong> Can be changed freely without affecting dependencies.</li>
              <li><strong>Main index titles:</strong> Changes may affect dependent commentaries and other texts.</li>
            </ul>
          </div>

          {dependencies && dependencies.has_dependencies && (
            <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f8d7da", border: "1px solid #f5c6cb", borderRadius: "4px", fontSize: "14px" }}>
              <strong>🚨 Dependency Warning for "{indexTitle}":</strong>
              <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                {dependencies.dependent_count > 0 && (
                  <li><strong>{dependencies.dependent_count} dependent texts:</strong> {dependencies.dependent_indices.slice(0, 5).join(', ')}{dependencies.dependent_indices.length > 5 ? '...' : ''}</li>
                )}
                {dependencies.version_count > 0 && (
                  <li><strong>{dependencies.version_count} text versions</strong> reference this index</li>
                )}
                {dependencies.link_count > 0 && (
                  <li><strong>{dependencies.link_count} links</strong> reference this text</li>
                )}
              </ul>
              <div style={{ marginTop: "8px", fontStyle: "italic", color: "#721c24" }}>
                Changing the main title will trigger cascading updates across all dependent texts, versions, and links.
              </div>
            </div>
          )}

          {checkingDeps && (
            <div style={{ marginBottom: "16px", padding: "8px", backgroundColor: "#d1ecf1", border: "1px solid #bee5eb", borderRadius: "4px", fontSize: "12px", color: "#0c5460" }}>
              Checking dependencies...
            </div>
          )}

          <div style={{ maxHeight: "400px", overflow: "auto", border: "1px solid #ddd", padding: "12px" }}>
            {nodes.map(({ path, pathStr, node, sharedTitle, title, heTitle }) => {
              const edits = editingNodes[pathStr] || {};
              const hasChanges = edits.title !== undefined || edits.heTitle !== undefined || edits.removeSharedTitle;
              
              return (
                <div 
                  key={pathStr} 
                  style={{ 
                    marginBottom: "16px", 
                    padding: "12px", 
                    backgroundColor: hasChanges ? "#fffbf0" : "#f9f9f9",
                    borderRadius: "4px",
                    border: hasChanges ? "1px solid #ffa500" : "1px solid #eee"
                  }}
                >
                  {sharedTitle && (
                    <div style={{ marginBottom: "8px", fontSize: "12px", color: "#666" }}>
                      Shared Title: "{sharedTitle}"
                      <label style={{ marginLeft: "12px" }}>
                        <input
                          type="checkbox"
                          checked={edits.removeSharedTitle || false}
                          onChange={e => handleNodeEdit(pathStr, 'removeSharedTitle', e.target.checked)}
                        />
                        Remove shared title
                      </label>
                    </div>
                  )}
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <label style={{ fontSize: "12px", color: "#666" }}>English Title:</label>
                      <input
                        className="dlVersionSelect"
                        value={edits.title !== undefined ? edits.title : title}
                        onChange={e => handleNodeEdit(pathStr, 'title', e.target.value)}
                        style={{
                          width: "100%",
                          borderColor: edits.title !== undefined && edits.title_valid === false ? "#dc3545" : undefined
                        }}
                      />
                      {edits.title !== undefined && edits.title_valid === false && (
                        <div style={{ fontSize: "11px", color: "#dc3545", marginTop: "2px" }}>
                          ⚠️ Invalid: Use only ASCII characters, no periods/hyphens/slashes
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: "12px", color: "#666" }}>Hebrew Title:</label>
                      <input
                        className="dlVersionSelect"
                        value={edits.heTitle !== undefined ? edits.heTitle : heTitle}
                        onChange={e => handleNodeEdit(pathStr, 'heTitle', e.target.value)}
                        style={{ width: "100%", direction: "rtl" }}
                      />
                    </div>
                  </div>
                  
                  {node.nodeType && (
                    <div style={{ marginTop: "4px", fontSize: "11px", color: "#999" }}>
                      Type: {node.nodeType} | Path: nodes[{path.join('][')}]
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {Object.keys(editingNodes).length > 0 && (
            <>
              {(() => {
                const hasValidationErrors = Object.values(editingNodes).some(edits =>
                  edits.title_valid === false
                );
                return (
                  <button
                    className="modtoolsButton"
                    onClick={save}
                    disabled={saving || hasValidationErrors}
                    style={{
                      marginTop: "12px",
                      opacity: hasValidationErrors ? 0.5 : 1
                    }}
                  >
                    {saving ? "Saving..." :
                     hasValidationErrors ? "Fix validation errors to save" :
                     `Save Changes to ${Object.keys(editingNodes).length} Nodes`}
                  </button>
                );
              })()}
            </>
          )}
        </>
      )}

      {msg && (
        <div
          className="message"
          style={{
            marginTop: "12px",
            padding: "8px",
            borderRadius: "4px",
            backgroundColor: msg.includes("✅") ? "#d4edda" :
                           msg.includes("❌") ? "#f8d7da" : "#d1ecf1",
            color: msg.includes("✅") ? "#155724" :
                   msg.includes("❌") ? "#721c24" : "#0c5460"
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
};


export default ModeratorToolsPanel;
