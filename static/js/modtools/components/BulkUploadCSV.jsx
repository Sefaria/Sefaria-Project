/**
 * BulkUploadCSV - Upload text content from CSV files
 *
 * Accepts CSV files with text content and creates/updates Version records.
 * Multiple files can be uploaded at once.
 *
 * Backend endpoint: POST /api/text-upload
 */
import React, { useState, useRef } from 'react';
import Cookies from 'js-cookie';
import ModToolsSection from './shared/ModToolsSection';

/**
 * Help content for Bulk Upload CSV
 */
const HELP_CONTENT = (
  <>
    <h3>What This Tool Does</h3>
    <p>
      This tool <strong>uploads text content from CSV files</strong>. Each CSV file contains
      the content for a text version, formatted with one segment per row.
    </p>

    <h3>How It Works</h3>
    <ol>
      <li><strong>Prepare CSV:</strong> Create CSV file(s) with the correct column format.</li>
      <li><strong>Select files:</strong> Choose one or more CSV files to upload.</li>
      <li><strong>Upload:</strong> Submit to create or update Version records.</li>
    </ol>

    <h3>CSV Format</h3>
    <p>
      The CSV file should have a specific column structure. Check the backend documentation
      or existing exports for the exact format required, which typically includes:
    </p>
    <ul>
      <li>Reference column (the segment address)</li>
      <li>Text content column</li>
      <li>Optional metadata columns</li>
    </ul>

    <div className="info">
      <strong>Tip:</strong> Use the Bulk Download tool to export an existing text as CSV,
      then use that file as a template for the expected format.
    </div>

    <div className="warning">
      <strong>Important Notes:</strong>
      <ul>
        <li>CSV must be properly formatted UTF-8 with correct encoding for Hebrew.</li>
        <li>Multiple files can be selected for batch upload.</li>
        <li>Existing content may be overwritten - back up first if needed.</li>
        <li>Invalid refs or format errors will cause that row to fail.</li>
      </ul>
    </div>

    <h3>Common Use Cases</h3>
    <ul>
      <li>Uploading new text content prepared in a spreadsheet</li>
      <li>Bulk-updating corrected text from editorial review</li>
      <li>Migrating content from external sources</li>
      <li>Restoring content from backups</li>
    </ul>

    <h3>Troubleshooting</h3>
    <ul>
      <li><strong>Upload fails</strong> - Check CSV encoding (should be UTF-8).</li>
      <li><strong>Hebrew displays incorrectly</strong> - Ensure proper UTF-8 encoding.</li>
      <li><strong>Partial upload</strong> - Some rows may have invalid refs or format.</li>
    </ul>
  </>
);

function BulkUploadCSV() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const formRef = useRef(null);

  const handleFiles = (event) => {
    setFiles(Array.from(event.target.files));
  };

  const uploadFiles = async (event) => {
    event.preventDefault();
    setUploading(true);
    setUploadMessage("Uploading...");
    setUploadError(null);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('texts[]', files[i], files[i].name);
    }

    try {
      const response = await fetch('/api/text-upload', {
        method: 'POST',
        headers: {
          'X-CSRFToken': Cookies.get('csrftoken')
        },
        credentials: 'same-origin',
        body: formData
      });

      const data = await response.json();

      if (data.status === "ok") {
        setUploading(false);
        setUploadMessage(data.message);
        setUploadError(null);
        setFiles([]);
        if (formRef.current) {
          formRef.current.reset();
        }
      } else {
        setUploadError("Error - " + data.error);
        setUploading(false);
        setUploadMessage(data.message);
      }
    } catch (err) {
      setUploadError("Error - " + err.toString());
      setUploading(false);
      setUploadMessage(null);
    }
  };

  const isReady = !uploading && files.length > 0;

  return (
    <ModToolsSection
      title="Bulk Upload CSV"
      titleHe="העלאה מ-CSV"
      helpContent={HELP_CONTENT}
    >
      <form id="file-form" ref={formRef}>
        <input
          className="dlVersionSelect"
          type="file"
          id="file-select"
          multiple
          onChange={handleFiles}
        />
        {isReady && (
          <a>
            <div className="modtoolsButton" onClick={uploadFiles}>
              <div className="modtoolsButtonInner">
                <span className="int-en">Upload</span>
                <span className="int-he">העלאה</span>
              </div>
            </div>
          </a>
        )}
      </form>
      {uploadMessage && <div className="message">{uploadMessage}</div>}
      {uploadError && <div className="message error">{uploadError}</div>}
    </ModToolsSection>
  );
}

export default BulkUploadCSV;
