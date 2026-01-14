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
 * Documentation:
 * - See /docs/modtools/MODTOOLS_GUIDE.md for quick reference
 * - See /docs/modtools/COMPONENT_LOGIC.md for detailed implementation logic
 */
import React, { useState } from 'react';
import $ from '../../sefaria/sefariaJquery';
import Sefaria from '../../sefaria/sefaria';
import ModToolsSection from './shared/ModToolsSection';
import StatusMessage from './shared/StatusMessage';

/**
 * Detailed help documentation for this tool
 */
const HELP_CONTENT = (
  <>
    <h3>What This Tool Does</h3>
    <p>
      This tool edits <strong>node titles</strong> within a text's schema structure.
      Every text in Sefaria has a schema that defines its structure (chapters, sections, etc.).
      Each structural unit is a "node" with English and Hebrew titles.
    </p>
    <p>
      Use this tool when you need to fix typos in section names, add missing Hebrew titles,
      or update how a text's internal structure is displayed.
    </p>

    <h3>How It Works</h3>
    <ol>
      <li><strong>Load:</strong> Enter the exact index title (e.g., "Mishneh Torah, Laws of Kings").</li>
      <li><strong>Review:</strong> All nodes in the schema are displayed with their current titles.</li>
      <li><strong>Edit:</strong> Modify English or Hebrew titles as needed.</li>
      <li><strong>Save:</strong> The entire Index is saved with the updated schema.</li>
    </ol>

    <h3>What Are Nodes?</h3>
    <p>
      Nodes are the structural building blocks of a text's schema. For example:
    </p>
    <ul>
      <li><strong>Mishneh Torah</strong> has nodes for each "Laws of X" section</li>
      <li><strong>Shulchan Arukh</strong> has nodes for Orach Chaim, Yoreh De'ah, etc.</li>
      <li><strong>Complex texts</strong> may have nested nodes (sections within sections)</li>
    </ul>
    <p>
      The "Path" shown for each node (e.g., <code>nodes[0][1][2]</code>) indicates its
      position in the nested structure.
    </p>

    <h3>Shared Titles</h3>
    <p>
      Some nodes use a "shared title" (Term) instead of direct title strings. This allows
      the same title to be reused across different texts. If a node has a shared title,
      you'll see it displayed with an option to remove it.
    </p>
    <p>
      When you remove a shared title, the node will use its direct <code>title</code>
      and <code>heTitle</code> fields instead. This is useful when a text uses a generic
      term but needs a more specific title.
    </p>

    <h3>Validation Rules</h3>
    <table className="field-table">
      <thead>
        <tr><th>Field</th><th>Rules</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>English titles</strong></td>
          <td>
            Must be ASCII characters only. Cannot contain: periods (.), hyphens (-),
            colons (:), forward slashes (/), or backslashes (\).
          </td>
        </tr>
        <tr>
          <td><strong>Hebrew titles</strong></td>
          <td>No restrictions. Can contain any Unicode characters.</td>
        </tr>
      </tbody>
    </table>

    <h3>Dependency Checking</h3>
    <p>
      Before you edit, the tool checks what depends on this index:
    </p>
    <ul>
      <li><strong>Dependent texts:</strong> Commentaries or other texts that reference this one</li>
      <li><strong>Versions:</strong> Translations and editions of this text</li>
      <li><strong>Links:</strong> Connections to other texts in the library</li>
    </ul>
    <p>
      A warning is shown if dependencies exist. Changing node titles on texts with many
      dependencies should be done carefully, as it may affect references.
    </p>

    <div className="warning">
      <strong>Important Notes:</strong>
      <ul>
        <li><strong>English title restrictions</strong> are enforced because titles become part of reference URLs.</li>
        <li>Changing titles does <strong>not</strong> automatically update existing references or links.</li>
        <li>The tool saves the <strong>entire Index</strong>, not just the changed nodes.</li>
        <li>A <strong>cache reset</strong> is triggered after saving, which may take a moment.</li>
        <li>Changes are applied <strong>immediately to production</strong>. There is no undo.</li>
      </ul>
    </div>

    <h3>Common Use Cases</h3>
    <ul>
      <li>Fixing typos in section or chapter names</li>
      <li>Adding missing Hebrew titles to nodes</li>
      <li>Standardizing title formats across similar texts</li>
      <li>Removing shared titles when a text needs custom naming</li>
      <li>Updating outdated or incorrect transliterations</li>
    </ul>

    <h3>Troubleshooting</h3>
    <ul>
      <li><strong>"Invalid: ASCII only"</strong> - English title contains non-ASCII characters. Remove accents or special characters.</li>
      <li><strong>"contains forbidden characters"</strong> - Title has periods, hyphens, colons, or slashes. Use spaces or other characters instead.</li>
      <li><strong>Changes not visible</strong> - Clear your browser cache or wait a few minutes for the cache reset to propagate.</li>
    </ul>
  </>
);

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
  // Check for validation errors - title_valid must be explicitly true to pass
  const hasValidationErrors = Object.values(editingNodes).some(edits => edits.title !== undefined && edits.title_valid !== true);
  const hasChanges = Object.keys(editingNodes).length > 0;

  return (
    <ModToolsSection
      title="Edit Node Titles"
      titleHe="עריכת כותרות צמתים"
      helpContent={HELP_CONTENT}
    >
      {/* Search bar */}
      <div className="searchRow">
        <input
          className="dlVersionSelect"
          type="text"
          placeholder="Index title (e.g., 'Binyan Olam')"
          value={indexTitle}
          onChange={e => setIndexTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
        />
        <button
          className="modtoolsButton"
          onClick={load}
          disabled={loading || !indexTitle.trim()}
        >
          {loading ? <><span className="loadingSpinner" />Loading...</> : "Load Index"}
        </button>
      </div>

      {nodes.length > 0 && (
        <>
          <div className="sectionIntro">
            Found {nodes.length} nodes. Edit titles below:
          </div>

          {/* Validation warning */}
          <div className="warningBox">
            <strong>Important:</strong>
            <ul>
              <li><strong>English titles:</strong> ASCII only. No periods, hyphens, colons, slashes.</li>
              <li><strong>Hebrew titles:</strong> Can be changed freely.</li>
              <li><strong>Main index titles:</strong> May affect dependent texts.</li>
            </ul>
          </div>

          {/* Dependency warning */}
          {dependencies?.has_dependencies && (
            <div className="dangerBox">
              <strong>Dependency Warning for "{indexTitle}":</strong>
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
          <div className="nodeListContainer">
            {nodes.map(({ path, pathStr, node, sharedTitle, title, heTitle }) => {
              const edits = editingNodes[pathStr] || {};
              const nodeHasChanges = edits.title !== undefined || edits.heTitle !== undefined || edits.removeSharedTitle;

              return (
                <div
                  key={pathStr}
                  className={`nodeItem ${nodeHasChanges ? 'modified' : ''}`}
                >
                  {sharedTitle && (
                    <div className="nodeSharedTitle">
                      Shared Title: "{sharedTitle}"
                      <label>
                        <input
                          type="checkbox"
                          checked={edits.removeSharedTitle || false}
                          onChange={e => handleNodeEdit(pathStr, 'removeSharedTitle', e.target.checked)}
                        />
                        Remove shared title
                      </label>
                    </div>
                  )}

                  <div className="nodeGrid">
                    <div>
                      <div className="fieldLabel">English Title:</div>
                      <input
                        className={`dlVersionSelect ${edits.title !== undefined && edits.title_valid === false ? 'hasError' : ''}`}
                        value={edits.title !== undefined ? edits.title : title}
                        onChange={e => handleNodeEdit(pathStr, 'title', e.target.value)}
                      />
                      {edits.title !== undefined && edits.title_valid === false && (
                        <div className="validationHint">
                          Invalid: ASCII only, no special characters
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="fieldLabel">Hebrew Title:</div>
                      <input
                        className="dlVersionSelect"
                        value={edits.heTitle !== undefined ? edits.heTitle : heTitle}
                        onChange={e => handleNodeEdit(pathStr, 'heTitle', e.target.value)}
                        style={{ direction: "rtl" }}
                      />
                    </div>
                  </div>

                  {node.nodeType && (
                    <div className="nodeMeta">
                      Type: {node.nodeType} | Path: nodes[{path.join('][')}]
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasChanges && (
            <div className="actionRow">
              <button
                className="modtoolsButton"
                onClick={save}
                disabled={saving || hasValidationErrors}
              >
                {saving ? <><span className="loadingSpinner" />Saving...</> :
                 hasValidationErrors ? "Fix validation errors to save" :
                 `Save Changes to ${Object.keys(editingNodes).length} Nodes`}
              </button>
            </div>
          )}
        </>
      )}

      <StatusMessage message={msg} />
    </ModToolsSection>
  );
};

export default NodeTitleEditor;
