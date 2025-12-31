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
import HelpButton from './shared/HelpButton';

/**
 * Detailed help documentation for this tool
 */
const HELP_CONTENT = (
  <>
    <h3>What This Tool Does</h3>
    <p>
      This tool automatically creates <strong>links between commentaries and their base texts</strong>.
      When a user views "Genesis 1:1", they see connections to "Rashi on Genesis 1:1:1" and other
      commentaries. This tool generates those connections automatically.
    </p>
    <p>
      The tool works by setting up commentary metadata on the Index record and then triggering
      Sefaria's auto-linking system to generate the actual link records.
    </p>

    <h3>How It Works</h3>
    <ol>
      <li><strong>Search:</strong> Enter a version title to find commentary texts (texts with "X on Y" pattern).</li>
      <li><strong>Select:</strong> Choose which commentaries to link.</li>
      <li><strong>Choose mapping:</strong> Select how commentary sections map to base text sections.</li>
      <li><strong>Create Links:</strong> The tool patches each Index with commentary metadata, then triggers link building.</li>
    </ol>

    <h3>What Gets Changed</h3>
    <p>For each selected commentary, the tool sets:</p>
    <ul>
      <li><code>dependence: "Commentary"</code> - Marks the text as a commentary</li>
      <li><code>base_text_titles</code> - The text(s) being commented on (extracted from title pattern)</li>
      <li><code>base_text_mapping</code> - The algorithm for mapping commentary refs to base refs</li>
    </ul>
    <p>Then it calls <code>/admin/rebuild/auto-links/</code> to generate the actual link records.</p>

    <h3>Mapping Algorithms</h3>
    <table className="field-table">
      <thead>
        <tr><th>Algorithm</th><th>Use Case</th><th>Example</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><code>many_to_one_default_only</code></td>
          <td>Most common. Multiple commentary segments per verse.</td>
          <td>Rashi on Genesis 1:1:1, 1:1:2, 1:1:3 all link to Genesis 1:1</td>
        </tr>
        <tr>
          <td><code>many_to_one</code></td>
          <td>Like above but includes alt structures.</td>
          <td>Same as above, but also links to alt verse numberings</td>
        </tr>
        <tr>
          <td><code>one_to_one_default_only</code></td>
          <td>One commentary segment per base segment.</td>
          <td>Translation where Chapter 1:1 = Chapter 1:1</td>
        </tr>
        <tr>
          <td><code>one_to_one</code></td>
          <td>Like above but includes alt structures.</td>
          <td>Same as above with alt structures</td>
        </tr>
      </tbody>
    </table>

    <div className="info">
      <strong>Which mapping should I use?</strong><br/>
      For most Tanakh commentaries (Rashi, Ibn Ezra, etc.) and Mishnah commentaries (Kehati, Bartenura),
      use <code>many_to_one_default_only</code>. This is the default and works for commentaries where
      each verse/mishnah has multiple comment segments.
    </div>

    <h3>What "X on Y" Pattern Means</h3>
    <p>
      The tool only works with texts that follow the "X on Y" naming pattern:
    </p>
    <ul>
      <li>"Rashi on Genesis" - Commentary name is "Rashi", base text is "Genesis"</li>
      <li>"Kehati on Mishnah Berakhot" - Commentary is "Kehati", base is "Mishnah Berakhot"</li>
      <li>"Ibn Ezra on Psalms" - Commentary is "Ibn Ezra", base is "Psalms"</li>
    </ul>
    <p>
      The tool extracts the base text name from after " on " in the title and uses that
      to set <code>base_text_titles</code>.
    </p>

    <div className="warning">
      <strong>Important Notes:</strong>
      <ul>
        <li>This tool is <strong>idempotent</strong> - running it multiple times is safe.</li>
        <li>Only texts with " on " in their title are shown (non-commentaries are filtered out).</li>
        <li>The base text (e.g., "Genesis") must already exist in Sefaria for links to work.</li>
        <li>Link building may take a few seconds per text.</li>
        <li>Links update automatically when text content changes.</li>
      </ul>
    </div>

    <h3>Common Use Cases</h3>
    <ul>
      <li>Setting up links for a new commentary series just uploaded</li>
      <li>Re-linking commentaries after the base text structure changed</li>
      <li>Fixing commentaries that were uploaded without proper linking metadata</li>
    </ul>

    <h3>Troubleshooting</h3>
    <ul>
      <li><strong>"Title pattern didn't reveal base text"</strong> - The index title doesn't match "X on Y" pattern. Rename the index first.</li>
      <li><strong>Links not appearing</strong> - Make sure the base text exists and the ref structure matches.</li>
      <li><strong>Wrong links</strong> - Try a different mapping algorithm. "many_to_one" vs "one_to_one" depends on commentary structure.</li>
    </ul>
  </>
);

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
      <HelpButton
        title="Auto-Link Commentaries"
        description={HELP_CONTENT}
      />

      {/* Info box */}
      <div className="infoBox">
        <strong>How it works:</strong> This tool automatically creates links between commentaries
        and their base texts. For example, "Rashi on Genesis 1:1:1" will be linked to "Genesis 1:1".
        Links update dynamically when text changes.
      </div>

      {/* Search bar */}
      <div className="searchRow">
        <input
          className="dlVersionSelect"
          type="text"
          placeholder="Version title (e.g., 'Torat Emet 357')"
          value={vtitle}
          onChange={e => setVtitle(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && load()}
        />
        <button
          className="modtoolsButton"
          onClick={load}
          disabled={loading || !vtitle.trim()}
        >
          {loading ? <><span className="loadingSpinner" />Searching...</> : "Find Commentaries"}
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
          <div className="optionRow">
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
          <div className="actionRow">
            <button
              className="modtoolsButton"
              disabled={!pick.size || linking}
              onClick={createLinks}
            >
              {linking ? (
                <><span className="loadingSpinner" />Creating Links...</>
              ) : (
                `Create Links for ${pick.size} Commentaries`
              )}
            </button>
          </div>
        </>
      )}

      <StatusMessage message={msg} />
    </ModToolsSection>
  );
};

export default AutoLinkCommentaryTool;
