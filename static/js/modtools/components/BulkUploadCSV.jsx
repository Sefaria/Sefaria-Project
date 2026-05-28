/**
 * BulkUploadCSV - Upload text content from CSV files
 *
 * Accepts CSV files with text content and creates/updates Version records.
 * Multiple files can be uploaded at once.
 *
 * Multi-format CSVs (one file containing rows for many books) are split
 * client-side into one single-index CSV per book before upload, so each
 * POST to `/api/text-upload` is bounded to a single book and the user
 * sees real per-book progress instead of one long-running request.
 *
 * Backend endpoint: POST /api/text-upload
 */
import React, { useState, useRef } from 'react';
import Cookies from 'js-cookie';
import ModToolsSection from './shared/ModToolsSection';
import { splitCsvByIndex } from '../utils';

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
      <li><strong>Upload:</strong> Submit to create or update Version records. Multi-book CSVs are split per book in the browser and uploaded one book at a time.</li>
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

const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });

const buildJobs = async (files) => {
  const jobs = [];
  const unresolvedRefs = [];
  const fileErrors = [];

  for (const file of files) {
    let text;
    try {
      text = await readFileAsText(file);
    } catch (err) {
      fileErrors.push({ file: file.name, error: err.message || String(err) });
      continue;
    }
    const split = splitCsvByIndex(text, file.name);
    if (split.error) {
      fileErrors.push({ file: file.name, error: split.error });
      continue;
    }
    for (const job of split.jobs) {
      jobs.push({ ...job, sourceFile: file.name });
    }
    for (const u of split.unresolvedRefs) {
      unresolvedRefs.push({ ...u, file: file.name });
    }
  }

  return { jobs, unresolvedRefs, fileErrors };
};

const postJob = async (job) => {
  const formData = new FormData();
  formData.append('texts[]', job.csvBlob, job.filename);
  formData.append('defer_toc_refresh', '1');

  const response = await fetch('/api/text-upload', {
    method: 'POST',
    headers: { 'X-CSRFToken': Cookies.get('csrftoken') },
    credentials: 'same-origin',
    body: formData,
  });

  const responseText = await response.text();
  let data = null;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} - non-JSON response (see console)`,
    );
  }
  if (!data || data.status !== 'ok') {
    throw new Error(data?.error || `HTTP ${response.status} ${response.statusText}`);
  }
  return data;
};

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
    setUploadMessage('Reading files...');
    setUploadError(null);

    const { jobs, unresolvedRefs, fileErrors } = await buildJobs(files);

    if (fileErrors.length > 0) {
      console.error('Bulk CSV upload: file read/parse errors', fileErrors);
    }

    if (jobs.length === 0) {
      const fileErrText = fileErrors
        .map((f) => `${f.file}: ${f.error}`)
        .join('; ');
      setUploading(false);
      setUploadMessage(null);
      setUploadError(
        fileErrText
          ? `No uploadable indices found. ${fileErrText}`
          : 'No uploadable indices found in selected files.',
      );
      return;
    }

    const succeeded = [];
    const failed = [];

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      setUploadMessage(`Uploading ${i + 1}/${jobs.length}: ${job.idxTitle}`);
      try {
        await postJob(job);
        succeeded.push(job.idxTitle);
        console.log('Bulk CSV upload succeeded for index', {
          index: i + 1,
          total: jobs.length,
          idxTitle: job.idxTitle,
          sourceFile: job.sourceFile,
          rowCount: job.rowCount,
        });
      } catch (err) {
        failed.push({ idxTitle: job.idxTitle, error: err.message || String(err) });
        console.error('Bulk CSV upload failed for index', {
          index: i + 1,
          total: jobs.length,
          idxTitle: job.idxTitle,
          sourceFile: job.sourceFile,
          error: err,
        });
      }
    }

    let tocRebuildError = null;
    if (succeeded.length > 0) {
      setUploadMessage(`Refreshing table of contents (${succeeded.length} books uploaded)...`);
      try {
        const tocResp = await fetch('/admin/reset/toc', {
          method: 'GET',
          credentials: 'same-origin',
        });
        if (!tocResp.ok) {
          tocRebuildError = `HTTP ${tocResp.status} ${tocResp.statusText}`;
        }
      } catch (err) {
        tocRebuildError = err.message || String(err);
      }
      if (tocRebuildError) {
        console.error('Bulk CSV upload: ToC rebuild failed', tocRebuildError);
      }
    }

    const summaryParts = [
      `Uploaded ${succeeded.length}/${jobs.length} indices`,
    ];
    if (failed.length > 0) {
      summaryParts.push(
        `${failed.length} failed: ${failed
          .map((f) => `${f.idxTitle} (${f.error})`)
          .join('; ')}`,
      );
    }
    if (unresolvedRefs.length > 0) {
      const sample = unresolvedRefs
        .slice(0, 5)
        .map((u) => u.ref)
        .join(', ');
      const more = unresolvedRefs.length > 5 ? `, +${unresolvedRefs.length - 5} more` : '';
      summaryParts.push(`Skipped ${unresolvedRefs.length} unresolved refs (${sample}${more})`);
      console.warn('Bulk CSV upload: unresolved refs', unresolvedRefs);
    }
    if (fileErrors.length > 0) {
      summaryParts.push(
        `File errors: ${fileErrors.map((f) => `${f.file} (${f.error})`).join('; ')}`,
      );
    }
    if (tocRebuildError) {
      summaryParts.push(
        `ToC rebuild failed (${tocRebuildError}). Trigger /admin/reset/toc manually.`,
      );
    }

    const message = summaryParts.join(' | ');
    setUploading(false);

    const cleanRun =
      failed.length === 0 && fileErrors.length === 0 && !tocRebuildError;
    if (cleanRun) {
      setUploadMessage(message);
      setUploadError(null);
      setFiles([]);
      if (formRef.current) {
        formRef.current.reset();
      }
    } else {
      setUploadMessage(succeeded.length > 0 ? message : null);
      setUploadError(
        succeeded.length > 0
          ? `Some indices failed - ${failed.length} of ${jobs.length}${tocRebuildError ? ' (ToC rebuild also failed)' : ''}`
          : message,
      );
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
          <button type="button" className="modtoolsButton" onClick={uploadFiles}>
            <div className="modtoolsButtonInner">
              <span className="int-en">Upload</span>
              <span className="int-he">העלאה</span>
            </div>
          </button>
        )}
      </form>
      {uploadMessage && <div className="message">{uploadMessage}</div>}
      {uploadError && <div className="message error">{uploadError}</div>}
    </ModToolsSection>
  );
}

export default BulkUploadCSV;
