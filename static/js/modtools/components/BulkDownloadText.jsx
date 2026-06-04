/**
 * BulkDownloadText - Download text versions in bulk by pattern matching
 *
 * Allows downloading multiple text versions at once by specifying:
 * - Index title pattern (e.g., "Genesis" matches "Genesis", "Genesis Rabbah", etc.)
 * - Version title pattern (e.g., "Kehati", "JPS 1917")
 * - Language filter (Hebrew, English, or both)
 * - Output format (text, CSV, JSON)
 *
 * Backend endpoint: GET /download/bulk/versions/
 */
import React, { useState } from 'react';
import ModToolsSection from './shared/ModToolsSection';

/**
 * Help content for Bulk Download Text
 */
const HELP_CONTENT = (
  <>
    <h3>What This Tool Does</h3>
    <p>
      This tool <strong>downloads text versions in bulk</strong> as files. You can export
      multiple texts at once by specifying patterns for Index titles and/or Version titles.
    </p>

    <h3>How It Works</h3>
    <ol>
      <li><strong>Specify patterns:</strong> Enter search patterns to match titles.</li>
      <li><strong>Select language:</strong> Choose Hebrew, English, or both.</li>
      <li><strong>Select format:</strong> Choose the output file format.</li>
      <li><strong>Download:</strong> Get a file with all matching text content.</li>
    </ol>

    <h3>Pattern Matching</h3>
    <table className="field-table">
      <thead>
        <tr><th>Field</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Index Title Pattern</strong></td>
          <td>
            Matches against the text name (e.g., "Genesis", "Mishnah Berakhot").
            Partial matches work - "Genesis" matches "Genesis", "Genesis Rabbah", etc.
          </td>
        </tr>
        <tr>
          <td><strong>Version Title Pattern</strong></td>
          <td>
            Matches against the version title (e.g., "William Davidson Edition",
            "Tanakh: The Holy Scriptures"). Use this to export specific translations.
          </td>
        </tr>
      </tbody>
    </table>
    <p>
      At least one pattern is required. If both are specified, only versions matching
      both patterns are downloaded.
    </p>

    <h3>Output Formats</h3>
    <table className="field-table">
      <thead>
        <tr><th>Format</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Text (with tags)</strong></td>
          <td>Plain text with HTML formatting tags preserved</td>
        </tr>
        <tr>
          <td><strong>Text (without tags)</strong></td>
          <td>Plain text with all HTML tags stripped</td>
        </tr>
        <tr>
          <td><strong>CSV</strong></td>
          <td>Spreadsheet format with one segment per row</td>
        </tr>
        <tr>
          <td><strong>JSON</strong></td>
          <td>Structured data format with full metadata</td>
        </tr>
      </tbody>
    </table>

    <div className="warning">
      <strong>Important Notes:</strong>
      <ul>
        <li>Large downloads (entire books, many versions) may take time to generate.</li>
        <li>Pattern matching is <strong>case-sensitive</strong>.</li>
        <li>The Download button activates only when format is selected and at least one pattern is entered.</li>
      </ul>
    </div>

    <h3>Common Use Cases</h3>
    <ul>
      <li>Exporting a specific translation for review or backup</li>
      <li>Downloading all texts by a specific publisher</li>
      <li>Getting text content for external analysis tools</li>
      <li>Creating offline copies of texts</li>
    </ul>
  </>
);

/**
 * Download button component
 */
const DownloadButton = ({ enabled, href }) => {
  const button = (
    <div className="modtoolsButton">
      <div className="modtoolsButtonInner">
        <span className="int-en">Download</span>
        <span className="int-he">הורדה</span>
      </div>
    </div>
  );

  if (enabled && href) {
    return <a href={href} download>{button}</a>;
  }
  return button;
};

function BulkDownloadText() {
  const [format, setFormat] = useState('');
  const [titlePattern, setTitlePattern] = useState('');
  const [versionTitlePattern, setVersionTitlePattern] = useState('');
  const [language, setLanguage] = useState('');

  const buildDownloadLink = () => {
    const args = [
      format ? `format=${encodeURIComponent(format)}` : '',
      titlePattern ? `title_pattern=${encodeURIComponent(titlePattern)}` : '',
      versionTitlePattern ? `version_title_pattern=${encodeURIComponent(versionTitlePattern)}` : '',
      language ? `language=${encodeURIComponent(language)}` : ''
    ].filter(a => a).join("&");
    return "download/bulk/versions/?" + args;
  };

  const isReady = format && (titlePattern || versionTitlePattern);

  return (
    <ModToolsSection
      title="Bulk Download Text"
      titleHe="הורדת הטקסט"
      helpContent={HELP_CONTENT}
      className="dlSection"
    >
      <input
        className="dlVersionSelect"
        type="text"
        placeholder="Index Title Pattern"
        value={titlePattern}
        onChange={(e) => setTitlePattern(e.target.value)}
      />
      <input
        className="dlVersionSelect"
        type="text"
        placeholder="Version Title Pattern"
        value={versionTitlePattern}
        onChange={(e) => setVersionTitlePattern(e.target.value)}
      />
      <select
        className="dlVersionSelect dlVersionLanguageSelect"
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
      >
        <option disabled value="">Language</option>
        <option key="all" value="">Hebrew & English</option>
        <option key="he" value="he">Hebrew</option>
        <option key="en" value="en">English</option>
      </select>
      <select
        className="dlVersionSelect dlVersionFormatSelect"
        value={format}
        onChange={(e) => setFormat(e.target.value)}
      >
        <option disabled value="">File Format</option>
        <option key="txt" value="txt">Text (with tags)</option>
        <option key="plain.txt" value="plain.txt">Text (without tags)</option>
        <option key="csv" value="csv">CSV</option>
        <option key="json" value="json">JSON</option>
      </select>
      <DownloadButton enabled={isReady} href={isReady ? buildDownloadLink() : null} />
    </ModToolsSection>
  );
}

export default BulkDownloadText;
