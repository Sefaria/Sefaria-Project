/**
 * NodeTitleEditor - Edit node titles within an Index schema
 *
 * Allows editing English and Hebrew titles for individual nodes in a text's
 * schema structure. Useful for fixing title errors or adding missing translations.
 *
 * Workflow:
 * 1. User enters an index title to load
 * 2. Tool displays all schema nodes with their current titles
 * 3. User edits titles as needed
 * 4. On save, tool updates the entire Index with modified schema
 *
 * Validation:
 * - English titles must be ASCII only
 * - No periods, hyphens, colons, or slashes allowed in titles
 * - Hebrew titles can be changed freely
 *
 * Backend API: POST /api/v2/raw/index/{title}
 *
 * For AI agents:
 * - Nodes are nested within Index.schema.nodes
 * - Each node may have sharedTitle (term reference) that can be removed
 * - Changes to titles may affect dependent texts (commentaries, links)
 */
import React, { useState } from 'react';
import $ from '../../sefaria/sefariaJquery';
import Sefaria from '../../sefaria/sefaria';
import ModToolsSection from './shared/ModToolsSection';
import StatusMessage from './shared/StatusMessage';

const NodeTitleEditor = () => {
  // Index state
  const [indexTitle, setIndexTitle] = useState("");
  const [indexData, setIndexData] = useState(null);

  // Edit state
  const [editingNodes, setEditingNodes] = useState({});

  // Dependency state
  const [dependencies, setDependencies] = useState(null);
  const [checkingDeps, setCheckingDeps] = useState(false);

  // UI state
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * Check what depends on this index
   */
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

  /**
   * Load the index and extract nodes
   */
  const load = async () => {
    if (!indexTitle.trim()) {
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
      await checkDependencies(indexTitle);
    } catch (e) {
      setMsg(`❌ Error: Could not load index "${indexTitle}"`);
      setIndexData(null);
      setDependencies(null);
    }
    setLoading(false);
  };

  /**
   * Extract nodes from schema recursively
   */
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

  /**
   * Handle node edit
   */
  const handleNodeEdit = (pathStr, field, value) => {
    setEditingNodes(prev => ({
      ...prev,
      [pathStr]: {
        ...prev[pathStr],
        [field]: value,
        // Add validation for English titles
        [`${field}_valid`]: field === 'title'
          ? (value.match(/^[\x00-\x7F]*$/) && !value.match(/[:.\\/-]/))
          : true
      }
    }));
  };

  /**
   * Save changes
   */
  const save = async () => {
    if (Object.keys(editingNodes).length === 0) {
      setMsg("❌ No changes to save");
      return;
    }

    setSaving(true);
    setMsg("Saving changes...");

    try {
      // Validate changes
      const validationErrors = [];
      Object.entries(editingNodes).forEach(([, edits]) => {
        if (edits.title !== undefined) {
          if (!edits.title.match(/^[\x00-\x7F]*$/)) {
            validationErrors.push(`English title "${edits.title}" contains non-ASCII characters`);
          }
          if (edits.title.match(/[:.\\/-]/)) {
            validationErrors.push(`English title "${edits.title}" contains forbidden characters`);
          }
        }
      });

      if (validationErrors.length > 0) {
        setMsg(`❌ Validation errors: ${validationErrors.join('; ')}`);
        setSaving(false);
        return;
      }

      // Create deep copy
      const updatedIndex = JSON.parse(JSON.stringify(indexData));

      // Apply edits
      Object.entries(editingNodes).forEach(([pathStr, edits]) => {
        const path = pathStr.split('.').map(Number);
        let node = updatedIndex.schema || updatedIndex;

        for (let i = 0; i < path.length; i++) {
          if (i === path.length - 1) {
            const targetNode = node.nodes[path[i]];

            if (edits.removeSharedTitle) {
              delete targetNode.sharedTitle;
            }

            if (edits.title !== undefined) {
              targetNode.title = edits.title;
              const enTitleIndex = targetNode.titles?.findIndex(t => t.lang === "en" && t.primary);
              if (enTitleIndex >= 0) {
                targetNode.titles[enTitleIndex].text = edits.title;
              } else {
                if (!targetNode.titles) targetNode.titles = [];
                targetNode.titles.push({ text: edits.title, lang: "en", primary: true });
              }
            }

            if (edits.heTitle !== undefined) {
              targetNode.heTitle = edits.heTitle;
              const heTitleIndex = targetNode.titles?.findIndex(t => t.lang === "he" && t.primary);
              if (heTitleIndex >= 0) {
                targetNode.titles[heTitleIndex].text = edits.heTitle;
              } else {
                if (!targetNode.titles) targetNode.titles = [];
                targetNode.titles.push({ text: edits.heTitle, lang: "he", primary: true });
              }
            }
          } else {
            node = node.nodes[path[i]];
          }
        }
      });

      // Save
      const url = `/api/v2/raw/index/${encodeURIComponent(indexTitle.replace(/ /g, "_"))}`;
      await $.ajax({
        url,
        type: 'POST',
        data: { json: JSON.stringify(updatedIndex) },
        dataType: 'json'
      });

      await $.get(`/admin/reset/${encodeURIComponent(indexTitle)}`);

      setMsg(`✅ Successfully updated node titles`);
      setEditingNodes({});

      // Reload
      setTimeout(() => load(), 1000);
    } catch (e) {
      let errorMsg = e.responseJSON?.error || e.responseText || 'Unknown error';
      setMsg(`❌ Error: ${errorMsg}`);
    }

    setSaving(false);
  };

  const nodes = indexData ? extractNodes(indexData.schema || indexData) : [];
  const hasValidationErrors = Object.values(editingNodes).some(edits => edits.title_valid === false);
  const hasChanges = Object.keys(editingNodes).length > 0;

  return (
    <ModToolsSection title="Edit Node Titles" titleHe="עריכת כותרות צמתים">
      {/* Search bar */}
      <div className="inputRow">
        <input
          className="dlVersionSelect"
          type="text"
          placeholder="Index title (e.g., 'Binyan Olam')"
          value={indexTitle}
          onChange={e => setIndexTitle(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && load()}
        />
        <button
          className="modtoolsButton"
          onClick={load}
          disabled={loading || !indexTitle.trim()}
        >
          {loading ? "Loading..." : "Load Index"}
        </button>
      </div>

      {nodes.length > 0 && (
        <>
          <div style={{ marginBottom: "16px", fontSize: "14px", color: "#666" }}>
            Found {nodes.length} nodes. Edit titles below:
          </div>

          {/* Validation warning */}
          <div className="warningBox">
            <strong>⚠️ Important:</strong>
            <ul>
              <li><strong>English titles:</strong> ASCII only. No periods, hyphens, colons, slashes.</li>
              <li><strong>Hebrew titles:</strong> Can be changed freely.</li>
              <li><strong>Main index titles:</strong> May affect dependent texts.</li>
            </ul>
          </div>

          {/* Dependency warning */}
          {dependencies?.has_dependencies && (
            <div className="dangerBox">
              <strong>🚨 Dependency Warning for "{indexTitle}":</strong>
              <ul>
                {dependencies.dependent_count > 0 && (
                  <li><strong>{dependencies.dependent_count} dependent texts:</strong>{" "}
                    {dependencies.dependent_indices.slice(0, 5).join(', ')}
                    {dependencies.dependent_indices.length > 5 ? '...' : ''}
                  </li>
                )}
                {dependencies.version_count > 0 && (
                  <li><strong>{dependencies.version_count} versions</strong> reference this index</li>
                )}
                {dependencies.link_count > 0 && (
                  <li><strong>{dependencies.link_count} links</strong> reference this text</li>
                )}
              </ul>
            </div>
          )}

          {checkingDeps && (
            <div className="infoBox">Checking dependencies...</div>
          )}

          {/* Node list */}
          <div style={{ maxHeight: "400px", overflow: "auto", border: "1px solid #ddd", padding: "12px", marginBottom: "16px" }}>
            {nodes.map(({ path, pathStr, node, sharedTitle, title, heTitle }) => {
              const edits = editingNodes[pathStr] || {};
              const nodeHasChanges = edits.title !== undefined || edits.heTitle !== undefined || edits.removeSharedTitle;

              return (
                <div
                  key={pathStr}
                  style={{
                    marginBottom: "16px",
                    padding: "12px",
                    backgroundColor: nodeHasChanges ? "#fffbf0" : "#f9f9f9",
                    borderRadius: "4px",
                    border: nodeHasChanges ? "1px solid #ffa500" : "1px solid #eee"
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
                          ⚠️ Invalid: ASCII only, no special characters
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

          {hasChanges && (
            <button
              className="modtoolsButton"
              onClick={save}
              disabled={saving || hasValidationErrors}
              style={{ opacity: hasValidationErrors ? 0.5 : 1 }}
            >
              {saving ? "Saving..." :
               hasValidationErrors ? "Fix validation errors to save" :
               `Save Changes to ${Object.keys(editingNodes).length} Nodes`}
            </button>
          )}
        </>
      )}

      <StatusMessage message={msg} />
    </ModToolsSection>
  );
};

export default NodeTitleEditor;
