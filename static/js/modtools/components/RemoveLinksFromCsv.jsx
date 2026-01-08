/**
 * RemoveLinksFromCsv - Remove links between refs from a CSV file
 *
 * CSV format: Two columns with exact refs to unlink
 * Note: Refs must match exactly (e.g., "Genesis 1" != "Genesis 1:1-31")
 *
 * Backend endpoint: POST /modtools/links (with action=DELETE)
 */
import React, { useState } from 'react';
import Cookies from 'js-cookie';
import { saveAs } from 'file-saver';
import ModToolsSection from './shared/ModToolsSection';
import { stripHtmlTags } from '../utils';

/**
 * Help content for RemoveLinksFromCsv
 */
const HELP_CONTENT = (
  <>
    <h3>What This Tool Does</h3>
    <p>
      This tool <strong>deletes links between text references</strong> by uploading a CSV file.
      Use this to remove incorrect, duplicate, or unwanted connections from the library.
    </p>

    <h3>How It Works</h3>
    <ol>
      <li><strong>Prepare CSV:</strong> Create a CSV with two columns of references to unlink.</li>
      <li><strong>Upload:</strong> Submit the file to delete all matching link records.</li>
      <li><strong>Review:</strong> Any refs that couldn't be deleted are reported in an errors file.</li>
    </ol>

    <h3>CSV Format</h3>
    <p>Same format as Upload Links:</p>
    <ul>
      <li><strong>First row:</strong> Column headers (any text, will be skipped)</li>
      <li><strong>Column 1:</strong> Source reference</li>
      <li><strong>Column 2:</strong> Target reference</li>
    </ul>

    <div className="warning">
      <strong>Critical: Exact Match Required</strong>
      <p>
        References must match <strong>exactly</strong> as they appear in the existing links.
        The tool does not expand ranges or normalize refs:
      </p>
      <ul>
        <li><code>Genesis 1</code> ≠ <code>Genesis 1:1-31</code></li>
        <li><code>Genesis 1:1</code> ≠ <code>Genesis 1:1-2</code></li>
        <li>Refs are case-sensitive and space-sensitive</li>
      </ul>
      <p>
        If you're unsure of the exact format, use the <strong>Download Links</strong> tool first
        to export existing links, then use those exact refs in your deletion file.
      </p>
    </div>

    <h3>Error Handling</h3>
    <p>
      If some links couldn't be deleted (refs not found, no matching link exists), the tool
      downloads an error report CSV file listing the failed deletions. Review this file
      and correct the refs if needed.
    </p>

    <div className="warning">
      <strong>Important Notes:</strong>
      <ul>
        <li>Link deletion is <strong>permanent</strong>. There is no undo.</li>
        <li>The order of refs in the CSV doesn't matter (links are bidirectional).</li>
        <li>Non-existent links are reported as errors but don't cause failure.</li>
        <li>Consider exporting links first to verify what exists before bulk deletion.</li>
      </ul>
    </div>

    <h3>Common Use Cases</h3>
    <ul>
      <li>Cleaning up incorrectly generated auto-links</li>
      <li>Removing outdated cross-references</li>
      <li>Deleting test links after development</li>
      <li>Reversing a batch upload that had errors</li>
    </ul>

    <h3>Troubleshooting</h3>
    <ul>
      <li><strong>Links not deleted</strong> - Check exact ref format. Download existing links to compare.</li>
      <li><strong>All refs in error report</strong> - Likely a format mismatch. Verify refs exist.</li>
      <li><strong>Some refs deleted, some not</strong> - Normal. Error report shows which failed.</li>
    </ul>
  </>
);

const RemoveLinksFromCsv = () => {
  const [fileName, setFileName] = useState(null);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleFileChange = (event) => {
    setFileName(event.target.files[0] || null);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setUploadMessage("Uploading...");
    const data = new FormData(event.target);
    data.append('action', 'DELETE');
    const request = new Request(
      '/modtools/links',
      { headers: { 'X-CSRFToken': Cookies.get('csrftoken') } }
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
          setErrorMessage(stripHtmlTags(resp_text));
        });
      } else {
        response.json().then(resp_json => {
          setUploadMessage(resp_json.data.message);
          setErrorMessage(null);
          if (resp_json.data.errors) {
            let blob = new Blob([resp_json.data.errors], { type: "text/plain;charset=utf-8" });
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
    <ModToolsSection
      title="Remove Links"
      titleHe="הסרת קישורים"
      helpContent={HELP_CONTENT}
    >
      <div className="remove-links-csv">
        <form id="remove-links-form" onSubmit={handleSubmit}>
          <label>
            Upload file:
            <input type="file" name="csv_file" onChange={handleFileChange} />
            <br />
            Choose a csv file with two columns. First row should include titles, and the others valid refs to delete.
            <br />
            Please note that it should be the exact ref, so 'Genesis 1' is different than 'Genesis 1:1-31'
          </label>
          <br />
          <input type="submit" value="Submit" disabled={!fileName} />
        </form>
        {uploadMessage && <div className="message">{uploadMessage}</div>}
        {errorMessage && <div className="message error">{errorMessage}</div>}
      </div>
    </ModToolsSection>
  );
};

export default RemoveLinksFromCsv;
