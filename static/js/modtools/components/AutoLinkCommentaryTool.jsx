/**
 * AutoLinkCommentaryTool - Automatically create links between commentaries and base texts
 *
 * This tool helps set up the commentary linking infrastructure for texts that follow
 * the "X on Y" naming pattern (e.g., "Rashi on Genesis").
 *
 * Workflow:
 * 1. User enters a versionTitle to find commentary indices
 * 2. Tool filters for indices with " on " in the title
 * 3. User selects which commentaries to process
 * 4. Tool patches each Index with:
 *    - dependence: "Commentary"
 *    - base_text_titles: [guessed base text]
 *    - base_text_mapping: selected algorithm
 * 5. Tool triggers /admin/rebuild/auto-links/ for each
 *
 * Backend APIs:
 * - POST /api/v2/raw/index/{title}?update=1 - Update index record
 * - GET /admin/reset/{title} - Clear caches
 * - GET /admin/rebuild/auto-links/{title} - Rebuild commentary links
 *
 * For AI agents:
 * - The base_text_mapping algorithm determines how commentary refs map to base refs
 * - "many_to_one_default_only" is correct for most Tanakh/Mishnah commentaries
 */
import React, { useState } from 'react';
import $ from '../../sefaria/sefariaJquery';
import Sefaria from '../../sefaria/sefaria';
import { BASE_TEXT_MAPPING_OPTIONS } from '../constants/fieldMetadata';
import ModToolsSection from './shared/ModToolsSection';
import IndexSelector from './shared/IndexSelector';
import StatusMessage from './shared/StatusMessage';

const AutoLinkCommentaryTool = () => {
  // Search state
  const [vtitle, setVtitle] = useState("");
  const [lang, setLang] = useState("");

  // Results state
  const [indices, setIndices] = useState([]);
  const [pick, setPick] = useState(new Set());

  // Options state
  const [mapping, setMapping] = useState("many_to_one_default_only");

  // UI state
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);

  /**
   * Load indices that have " on " in their title (commentary pattern)
   */
  const load = () => {
    if (!vtitle.trim()) {
      setMsg("❌ Please enter a version title");
      return;
    }

    setLoading(true);
    setMsg("Loading indices...");

    $.getJSON(`/api/version-indices?versionTitle=${encodeURIComponent(vtitle)}&language=${lang}`)
      .done(d => {
        // Filter for commentary pattern
        const comm = (d.indices || []).filter(t => t.includes(" on "));
        setIndices(comm);
        setPick(new Set(comm));
        setMsg(`Found ${comm.length} commentary indices`);
      })
      .fail(xhr => {
        const err = xhr.responseJSON?.error || xhr.responseText || "Failed to load indices";
        setMsg(`❌ Error: ${err}`);
        setIndices([]);
        setPick(new Set());
      })
      .always(() => setLoading(false));
  };

  /**
   * Create links for selected commentaries
   */
  const createLinks = async () => {
    if (!pick.size) return;

    setLinking(true);
    setMsg("Creating links...");

    let successCount = 0;
    const errors = [];

    for (const indexTitle of pick) {
      try {
        // 1. Fetch current Index
        const raw = await Sefaria.getIndexDetails(indexTitle);
        if (!raw) throw new Error("Couldn't fetch index JSON");

        // 2. Guess base work from "... on <Work>" pattern
        const guess = (indexTitle.match(/ on (.+)$/) || [])[1];
        if (!guess) throw new Error("Title pattern didn't reveal base text");

        // 3. Add missing commentary metadata (idempotent)
        if (!raw.base_text_titles || !raw.base_text_mapping) {
          const patched = {
            ...raw,
            dependence: "Commentary",
            base_text_titles: raw.base_text_titles || [guess],
            base_text_mapping: raw.base_text_mapping || mapping
          };
          delete patched._id;

          const url = `/api/v2/raw/index/${encodeURIComponent(indexTitle.replace(/ /g, "_"))}?update=1`;
          await $.post(url, { json: JSON.stringify(patched) });

          // Clear caches
          await $.get(`/admin/reset/${encodeURIComponent(indexTitle)}`);
        }

        // 4. Rebuild links
        setMsg(`Building links for ${indexTitle}...`);
        await $.get(`/admin/rebuild/auto-links/${encodeURIComponent(indexTitle.replace(/ /g, "_"))}`);

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
    <ModToolsSection title="Auto-Link Commentaries" titleHe="יצירת קישורים אוטומטית לפירושים">
      {/* Info box */}
      <div className="infoBox">
        <strong>How it works:</strong> This tool automatically creates links between commentaries
        and their base texts. For example, "Rashi on Genesis 1:1:1" will be linked to "Genesis 1:1".
        Links update dynamically when text changes.
      </div>

      {/* Search bar */}
      <div className="inputRow">
        <input
          className="dlVersionSelect"
          type="text"
          placeholder="Version title"
          value={vtitle}
          onChange={e => setVtitle(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && load()}
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
          disabled={loading || !vtitle.trim()}
        >
          {loading ? "Loading..." : "Find Commentaries"}
        </button>
      </div>

      {/* Index selector */}
      {indices.length > 0 && (
        <>
          <IndexSelector
            indices={indices}
            selectedIndices={pick}
            onSelectionChange={setPick}
            label="commentaries"
          />

          {/* Mapping selector */}
          <div className="fieldGroup" style={{ marginTop: "12px" }}>
            <label>base_text_mapping:</label>
            <select
              className="dlVersionSelect"
              value={mapping}
              onChange={e => setMapping(e.target.value)}
            >
              {BASE_TEXT_MAPPING_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Action button */}
          <button
            className="modtoolsButton"
            disabled={!pick.size || linking}
            onClick={createLinks}
            style={{ marginTop: "12px" }}
          >
            {linking ? (
              <><span className="loadingSpinner" />Creating Links...</>
            ) : (
              `Create Links for ${pick.size} Commentaries`
            )}
          </button>
        </>
      )}

      <StatusMessage message={msg} />
    </ModToolsSection>
  );
};

export default AutoLinkCommentaryTool;
