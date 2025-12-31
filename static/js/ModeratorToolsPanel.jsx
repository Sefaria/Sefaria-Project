/**
 * ModeratorToolsPanel - Main container for Sefaria moderator tools
 *
 * Access at /modtools (requires staff permissions via Sefaria.is_moderator).
 *
 * This panel provides internal admin tools for:
 * - Bulk downloading text versions
 * - CSV upload of texts
 * - Workflowy OPML outline upload
 * - Links management (upload/download/remove)
 * - Bulk editing of Index and Version metadata
 * - Auto-linking commentaries to base texts
 * - Editing node titles in Index schemas
 *
 * For AI agents: See /docs/modtools/AI_AGENT_GUIDE.md for detailed documentation.
 *
 * CSS: Styles are in /static/css/modtools.css
 */
import React from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import $ from './sefaria/sefariaJquery';
import Component from 'react-class';
import Cookies from 'js-cookie';
import { saveAs } from 'file-saver';
import qs from 'qs';
import { useState } from 'react';
import { InterfaceText, EnglishText, HebrewText } from "./Misc";

// Import modtools styles
import '../css/modtools.css';

// Import refactored components
import BulkVersionEditor from './modtools/components/BulkVersionEditor';
import BulkIndexEditor from './modtools/components/BulkIndexEditor';
import AutoLinkCommentaryTool from './modtools/components/AutoLinkCommentaryTool';
import NodeTitleEditor from './modtools/components/NodeTitleEditor';
import HelpButton from './modtools/components/shared/HelpButton';


/**
 * Strip HTML tags from a string for safe display
 * Uses regex to remove HTML tags - safe approach without DOM parsing
 */
const stripHtmlTags = (text) => {
  if (!text) return '';
  // Remove HTML tags using regex
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
};


/**
 * Help content for WorkflowyModeratorTool
 */
const WORKFLOWY_HELP_CONTENT = (
  <>
    <h3>What This Tool Does</h3>
    <p>
      This tool imports <strong>Workflowy outlines</strong> (OPML files) and converts them
      into Sefaria Index records and/or Version text content. Workflowy is an outlining tool
      that exports hierarchical data in OPML format.
    </p>

    <h3>How It Works</h3>
    <ol>
      <li><strong>Export:</strong> In Workflowy, select your outline and export as OPML.</li>
      <li><strong>Upload:</strong> Select one or more .opml files here.</li>
      <li><strong>Configure:</strong> Choose what to create (Index, Version, or both).</li>
      <li><strong>Process:</strong> The tool parses the outline structure and creates records.</li>
    </ol>

    <h3>Options Explained</h3>
    <table className="field-table">
      <thead>
        <tr><th>Option</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Create Index Record</strong></td>
          <td>
            Creates the text's schema structure (hierarchy of chapters, sections, etc.)
            based on the outline's nesting structure.
          </td>
        </tr>
        <tr>
          <td><strong>Create Version From Notes</strong></td>
          <td>
            If outline items have notes attached, those notes become the text content
            for a new Version. Each note becomes the content for that segment.
          </td>
        </tr>
        <tr>
          <td><strong>Custom Delimiters</strong></td>
          <td>
            Characters used to parse special formatting in outline titles:
            <ol>
              <li>Title Language delimiter (separates English | Hebrew)</li>
              <li>Alt Titles delimiter (separates primary, alt1, alt2)</li>
              <li>Categories delimiter (separates Category, Subcategory)</li>
            </ol>
            Example: using "|" lets you write "Genesis | בראשית" in one item.
          </td>
        </tr>
        <tr>
          <td><strong>Term Scheme Name</strong></td>
          <td>
            Optional. If sections use standardized Terms (like "Chapter", "Verse"),
            specify the Term Scheme name to automatically link sections to those Terms.
          </td>
        </tr>
      </tbody>
    </table>

    <h3>Outline Structure Requirements</h3>
    <p>Your Workflowy outline should be structured like this:</p>
    <ul>
      <li><strong>Top level:</strong> The Index title</li>
      <li><strong>Second level:</strong> Major sections (books, parts)</li>
      <li><strong>Third level:</strong> Chapters or subsections</li>
      <li><strong>Deepest level:</strong> Individual segments (verses, paragraphs)</li>
    </ul>
    <p>
      The nesting depth determines the address depth (e.g., Book.Chapter.Verse).
    </p>

    <div className="warning">
      <strong>Important Notes:</strong>
      <ul>
        <li>Files must have <code>.opml</code> extension.</li>
        <li>Multiple files can be uploaded at once (batch processing).</li>
        <li>If an Index already exists, the tool may fail or update depending on server settings.</li>
        <li>Version content comes from <strong>notes</strong> (not the item titles themselves).</li>
        <li>Results show which files succeeded and which failed with error details.</li>
      </ul>
    </div>

    <h3>Common Use Cases</h3>
    <ul>
      <li>Creating new text structures from outlines prepared in Workflowy</li>
      <li>Bulk uploading texts where structure was planned in an outliner</li>
      <li>Converting hierarchical documents into Sefaria's nested schema format</li>
    </ul>

    <h3>Troubleshooting</h3>
    <ul>
      <li><strong>"Invalid OPML"</strong> - File may be corrupted or not valid XML. Re-export from Workflowy.</li>
      <li><strong>"Index already exists"</strong> - Delete or rename the existing Index first.</li>
      <li><strong>No content created</strong> - Make sure "Create Version From Notes" is checked and notes exist.</li>
    </ul>
  </>
);

/**
 * WorkflowyModeratorTool - Upload Workflowy OPML exports to create Index/Version records
 *
 * Accepts .opml files exported from Workflowy and creates text structure.
 * Options:
 * - Create Index Record: Creates the text metadata structure
 * - Create Version From Notes: Extracts text content from outline notes
 * - Custom Delimiters: For parsing title language, alt titles, categories
 * - Term Scheme: Optional term scheme for section names
 *
 * Backend endpoint: POST /modtools/upload_text
 */
class WorkflowyModeratorTool extends Component {
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
      files: []
    };
  }

  handleInputChange = (event) => {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const name = target.name;
    this.setState({ [name]: value });
  }

  handleFileChange = (event) => {
    const files = Array.from(event.target.files);
    this.setState({ files: files });
  }

  handleWfSubmit = (event) => {
    event.preventDefault();

    if (this.state.files.length === 0) {
      this.setState({ uploadMessage: "Please select at least one file", error: true });
      return;
    }

    this.setState({ uploading: true, uploadMessage: `Uploading ${this.state.files.length} file${this.state.files.length > 1 ? 's' : ''}...` });

    const data = new FormData(event.target);
    const request = new Request(
      '/modtools/upload_text',
      { headers: { 'X-CSRFToken': Cookies.get('csrftoken') } }
    );

    fetch(request, {
      method: 'POST',
      mode: 'same-origin',
      credentials: 'same-origin',
      body: data,
    }).then(response => {
      this.setState({ uploading: false, uploadMessage: "" });
      if (!response.ok) {
        response.text().then(resp_text => {
          this.setState({
            uploading: false,
            error: true,
            uploadResult: stripHtmlTags(resp_text)
          });
        });
      } else {
        response.json().then(resp_json => {
          const successes = resp_json.successes || [];
          const failures = resp_json.failures || [];

          let uploadMessage = "";
          if (failures.length === 0) {
            uploadMessage = `Successfully imported ${successes.length} file${successes.length > 1 ? 's' : ''}`;
          } else if (successes.length === 0) {
            uploadMessage = `All ${failures.length} file${failures.length > 1 ? 's' : ''} failed`;
          } else {
            uploadMessage = `${successes.length} succeeded, ${failures.length} failed`;
          }

          const parts = [];
          if (successes.length > 0) {
            parts.push("Successes:\n" + successes.map(f => `  ✓ ${f}`).join('\n'));
          }
          if (failures.length > 0) {
            parts.push("Failures:\n" + failures.map(f => `  ✗ ${f.file}: ${f.error}`).join('\n'));
          }

          this.setState({
            uploading: false,
            error: failures.length > 0,
            uploadMessage: uploadMessage,
            uploadResult: parts.join('\n\n'),
            files: []
          });

          if (this.wfFileInput.current) {
            this.wfFileInput.current.value = '';
          }
        });
      }
    }).catch(error => {
      this.setState({ uploading: false, error: true, uploadMessage: error.message });
    });
  }

  render() {
    return (
      <div className="modToolsSection">
        <div className="workflowy-tool">
          <div className="dlSectionTitle">
            <span className="int-en">Workflowy Outline Upload</span>
            <span className="int-he">העלאת קובץ - workflowy</span>
          </div>
          <HelpButton
            title="Workflowy Outline Upload"
            description={WORKFLOWY_HELP_CONTENT}
          />
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
                <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
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
                onChange={this.handleInputChange}
              />
            </label>
            <label>
              Create Version From Notes on Outline:
              <input
                name="c_version"
                type="checkbox"
                value="true"
                checked={this.state.c_version}
                onChange={this.handleInputChange}
              />
            </label>
            <label>
              Custom Delimiters (Order: 1. Title Language 2. Alt Titles 3. Categories):
              <input
                className="dlVersionSelect"
                name="delims"
                type="text"
                value={this.state.delims}
                onChange={this.handleInputChange}
              />
            </label>
            <label>
              Optional Term Scheme Name:
              <input
                className="dlVersionSelect"
                name="term_scheme"
                type="text"
                value={this.state.term_scheme}
                onChange={this.handleInputChange}
              />
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
          {this.state.uploadMessage && (
            <div id="wf-upl-msg" className="message">{this.state.uploadMessage}</div>
          )}
          {this.state.uploadResult && (
            <textarea
              id="wf-upl-message"
              className="wf-upl-message"
              cols="80"
              rows="20"
              value={this.state.uploadResult}
              readOnly
            />
          )}
        </div>
      </div>
    );
  }
}


/**
 * Help content for UploadLinksFromCSV
 */
const UPLOAD_LINKS_HELP_CONTENT = (
  <>
    <h3>What This Tool Does</h3>
    <p>
      This tool creates <strong>links between text references</strong> by uploading a CSV file.
      Links connect related passages across Sefaria's library, enabling cross-references
      and the connections panel that users see when reading.
    </p>

    <h3>How It Works</h3>
    <ol>
      <li><strong>Prepare CSV:</strong> Create a CSV with two columns of references.</li>
      <li><strong>Select type:</strong> Choose the relationship type (Commentary, Quotation, etc.).</li>
      <li><strong>Name project:</strong> Enter a project name for tracking.</li>
      <li><strong>Upload:</strong> Submit to create all the link records.</li>
    </ol>

    <h3>CSV Format</h3>
    <p>Your CSV file should have:</p>
    <ul>
      <li><strong>First row:</strong> Column headers (any text, will be skipped)</li>
      <li><strong>Column 1:</strong> Source reference (e.g., "Genesis 1:1")</li>
      <li><strong>Column 2:</strong> Target reference (e.g., "Rashi on Genesis 1:1:1")</li>
    </ul>
    <p>Example:</p>
    <pre style={{background: '#f5f5f5', padding: '10px', borderRadius: '4px'}}>
{`Source,Target
Genesis 1:1,Rashi on Genesis 1:1:1
Genesis 1:2,Rashi on Genesis 1:1:2
Exodus 20:1,Mekhilta d'Rabbi Yishmael 20:1`}
    </pre>

    <h3>Link Types</h3>
    <table className="field-table">
      <thead>
        <tr><th>Type</th><th>Use For</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Commentary</strong></td>
          <td>When one text explains another (Rashi explaining Torah)</td>
        </tr>
        <tr>
          <td><strong>Quotation</strong></td>
          <td>When one text directly quotes another</td>
        </tr>
        <tr>
          <td><strong>Related</strong></td>
          <td>General thematic or topical connection</td>
        </tr>
        <tr>
          <td><strong>Mesorat HaShas</strong></td>
          <td>Talmudic cross-references (traditional marginal notes)</td>
        </tr>
        <tr>
          <td><strong>Ein Mishpat</strong></td>
          <td>Legal code references from Talmud margins</td>
        </tr>
        <tr>
          <td><strong>Reference</strong></td>
          <td>Generic citation or reference</td>
        </tr>
      </tbody>
    </table>

    <h3>Project Name</h3>
    <p>
      The project name is stored with each link for tracking purposes. Use a descriptive
      name like "Rashi-Torah Links 2024" or "Mekhilta Cross-References". This helps
      identify links if they need to be removed or audited later.
    </p>

    <div className="warning">
      <strong>Important Notes:</strong>
      <ul>
        <li>Both references must be <strong>valid refs</strong> that exist in Sefaria.</li>
        <li>Invalid refs will be reported in an errors file download.</li>
        <li>Duplicate links are typically ignored (won't create duplicates).</li>
        <li>Links are bidirectional - viewing either text shows the connection.</li>
        <li>Large files may take time to process.</li>
      </ul>
    </div>

    <h3>Common Use Cases</h3>
    <ul>
      <li>Importing scholarly cross-references from research</li>
      <li>Connecting a new commentary to its base text</li>
      <li>Adding traditional marginal references (Mesorat HaShas, etc.)</li>
      <li>Batch-creating thematic connections</li>
    </ul>

    <h3>Troubleshooting</h3>
    <ul>
      <li><strong>"Not a valid ref"</strong> - Check spelling and format. Use Sefaria's reference format.</li>
      <li><strong>Errors CSV downloaded</strong> - Review failed refs and fix in source file.</li>
      <li><strong>No links created</strong> - Ensure CSV has header row and correct column order.</li>
    </ul>
  </>
);

/**
 * UploadLinksFromCSV - Upload links between refs from a CSV file
 *
 * CSV format: Two columns with refs to link
 * Supports link types: Commentary, Quotation, Related, etc.
 *
 * Backend endpoint: POST /modtools/links
 */
class UploadLinksFromCSV extends Component {
  constructor(props) {
    super(props);
    this.state = { projectName: '', uploadMessage: null, uploadResult: null, error: false };
    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  isSubmitDisabled() {
    return !this.state.hasFile || !this.state.projectName.length;
  }

  handleChange(event) {
    const target = event.target;
    this.setState({ [target.name]: target.value });
  }

  handleFileChange = (event) => {
    this.setState({ hasFile: !!event.target.files[0] });
  }

  handleSubmit(event) {
    event.preventDefault();
    this.setState({ uploading: true, uploadMessage: "Uploading..." });
    const data = new FormData(event.target);
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
          this.setState({
            uploading: false,
            uploadMessage: "",
            error: true,
            uploadResult: stripHtmlTags(resp_text)
          });
        });
      } else {
        response.json().then(resp_json => {
          this.setState({
            uploading: false,
            error: false,
            uploadMessage: resp_json.data.message,
            uploadResult: JSON.stringify(resp_json.data.index, undefined, 4)
          });
          if (resp_json.data.errors) {
            let blob = new Blob([resp_json.data.errors], { type: "text/plain;charset=utf-8" });
            saveAs(blob, 'errors.csv');
          }
        });
      }
    }).catch(error => {
      this.setState({ uploading: false, error: true, uploadMessage: error.message });
    });
  }

  getOptions() {
    const options = ['Commentary', 'Quotation', 'Related', 'Mesorat hashas', 'Ein Mishpat', 'Reference'];
    return options.map((option) => (
      <option value={option.toLowerCase()} key={option}>{option}</option>
    ));
  }

  render() {
    return (
      <div className="modToolsSection">
        <div className="uploadLinksFromCSV">
          <div className="dlSectionTitle">Upload links</div>
          <HelpButton
            title="Upload Links"
            description={UPLOAD_LINKS_HELP_CONTENT}
          />
          <form id="upload-links-form" onSubmit={this.handleSubmit}>
            <label>
              Upload file:
              <input type="file" name="csv_file" onChange={this.handleFileChange} />
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
                value={this.state.projectName}
                onChange={this.handleChange}
              />
            </label>
            <input type="submit" value="Submit" disabled={this.isSubmitDisabled()} />
          </form>
          {this.state.uploadMessage && <div className="message">{this.state.uploadMessage}</div>}
          {this.state.error && this.state.uploadResult && (
            <div className="message error">{this.state.uploadResult}</div>
          )}
        </div>
      </div>
    );
  }
}


/**
 * Help content for RemoveLinksFromCsv
 */
const REMOVE_LINKS_HELP_CONTENT = (
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

/**
 * RemoveLinksFromCsv - Remove links between refs from a CSV file
 *
 * CSV format: Two columns with exact refs to unlink
 * Note: Refs must match exactly (e.g., "Genesis 1" != "Genesis 1:1-31")
 *
 * Backend endpoint: POST /modtools/links (with action=DELETE)
 */
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
    <div className="modToolsSection">
      <div className="remove-links-csv">
        <div className="dlSectionTitle">Remove links</div>
        <HelpButton
          title="Remove Links"
          description={REMOVE_LINKS_HELP_CONTENT}
        />
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
    </div>
  );
};


/**
 * Helper components for GetLinks form
 */
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


/**
 * Help content for GetLinks
 */
const DOWNLOAD_LINKS_HELP_CONTENT = (
  <>
    <h3>What This Tool Does</h3>
    <p>
      This tool <strong>exports links as a CSV file</strong> for analysis or backup.
      You can download all connections from a specific text, or filter by type and source.
    </p>

    <h3>How It Works</h3>
    <ol>
      <li><strong>Enter Ref 1:</strong> The primary reference to get links from (required).</li>
      <li><strong>Enter Ref 2:</strong> Optional second reference to find links between two texts.</li>
      <li><strong>Apply filters:</strong> Optionally filter by link type or generator.</li>
      <li><strong>Download:</strong> Get a CSV file with all matching links.</li>
    </ol>

    <h3>Reference Fields</h3>
    <table className="field-table">
      <thead>
        <tr><th>Field</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Ref 1</strong></td>
          <td>
            Required. The text reference to get links from. Can be broad ("Genesis")
            or specific ("Genesis 1:1").
          </td>
        </tr>
        <tr>
          <td><strong>Ref 2</strong></td>
          <td>
            Optional. If blank, downloads links to the entire library (limited to 15k).
            If specified, downloads only links between Ref 1 and Ref 2.
          </td>
        </tr>
      </tbody>
    </table>

    <h3>Filter Options</h3>
    <table className="field-table">
      <thead>
        <tr><th>Filter</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Type</strong></td>
          <td>
            Filter by link type: Commentary, Quotation, Related, etc.
            Leave blank for all types.
          </td>
        </tr>
        <tr>
          <td><strong>Generated by</strong></td>
          <td>
            Filter by who/what created the link. Examples: "add_links_from_text",
            "auto-linker", or a username. Leave blank for all sources.
          </td>
        </tr>
        <tr>
          <td><strong>Iterate by segments</strong></td>
          <td>
            When checked, the output includes every segment in Ref 1, even if it
            has no links. Useful for finding gaps in link coverage.
          </td>
        </tr>
      </tbody>
    </table>

    <h3>Output Format</h3>
    <p>
      The downloaded CSV contains columns for source ref, target ref, link type,
      and other metadata. This format can be used with the Upload Links or Remove Links tools.
    </p>

    <div className="warning">
      <strong>Important Notes:</strong>
      <ul>
        <li>Results are <strong>limited to 15,000 links</strong> when Ref 2 is blank.</li>
        <li>Both refs are validated - red highlight indicates invalid reference.</li>
        <li>The Download button only becomes active when Ref 1 is valid.</li>
        <li>Large exports may take a moment to generate.</li>
      </ul>
    </div>

    <h3>Common Use Cases</h3>
    <ul>
      <li>Auditing existing links for a text before making changes</li>
      <li>Backing up links before bulk deletion</li>
      <li>Analyzing link coverage and finding gaps</li>
      <li>Exporting links for external analysis or documentation</li>
      <li>Getting exact ref formats for use with Remove Links tool</li>
    </ul>

    <h3>Troubleshooting</h3>
    <ul>
      <li><strong>Red input field</strong> - Reference is invalid. Check spelling and format.</li>
      <li><strong>Empty CSV</strong> - No links exist matching your criteria.</li>
      <li><strong>Download button disabled</strong> - Ref 1 must be entered and valid.</li>
      <li><strong>Missing links</strong> - Check type/generator filters aren't too restrictive.</li>
    </ul>
  </>
);

/**
 * GetLinks - Download links between refs as CSV
 *
 * Options:
 * - Ref 1 (required): Starting reference
 * - Ref 2 (optional): Target reference or "all" for entire library
 * - Type filter: Commentary, Quotation, etc.
 * - Generated by filter: Filter by who created the links
 * - Iterate by segments: Include empty segments in output
 *
 * Backend endpoint: GET /modtools/links/{ref1}/{ref2}
 */
function GetLinks() {
  const [refs, setRefs] = useState({ ref1: '', ref2: '' });
  const [errors, setErrors] = useState({ ref2: false });
  const [type, setType] = useState('');
  const [generatedBy, setGeneratedBy] = useState('');
  const [bySegment, setBySegment] = useState(false);

  const handleCheck = () => {
    setBySegment(!bySegment);
  };

  const handleChange = async (event) => {
    const { name, value } = event.target;
    setRefs(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      if (!value) {
        setErrors(prev => ({ ...prev, [name]: false }));
      } else {
        try {
          const response = await Sefaria.getName(value);
          setErrors(prev => ({ ...prev, [name]: !response.is_ref }));
        } catch (error) {
          console.error(error);
        }
      }
    }
  };

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
  };

  const formReady = () => {
    return refs.ref1 && errors.ref1 === false && errors.ref2 === false;
  };

  const linksDownloadLink = () => {
    const queryParams = qs.stringify(
      { type: (type) ? type : null, generated_by: (generatedBy) ? generatedBy : null },
      { addQueryPrefix: true, skipNulls: true }
    );
    const tool = (bySegment) ? 'index_links' : 'links';
    return `modtools/${tool}/${refs.ref1}/${refs.ref2 || 'all'}${queryParams}`;
  };

  return (
    <div className="modToolsSection">
      <div className="getLinks">
        <div className="dlSectionTitle">Download links</div>
        <HelpButton
          title="Download Links"
          description={DOWNLOAD_LINKS_HELP_CONTENT}
        />
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
          <br />
          <InputRef id={2} value={refs.ref2} handleChange={handleChange} handleBlur={handleBlur} error={errors.ref2} />
          <br />
          <InputNonRef name='type' value={type} handleChange={(e) => setType(e.target.value)} />
          <br />
          <InputNonRef name='generated_by' value={generatedBy} handleChange={(e) => setGeneratedBy(e.target.value)} />
        </form>
        {formReady() ? <a href={linksDownloadLink()} download><DownloadButton /></a> : <DownloadButton />}
      </div>
    </div>
  );
}


/**
 * Help content for Bulk Download Text
 */
const BULK_DOWNLOAD_HELP_CONTENT = (
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
 * Help content for Bulk Upload CSV
 */
const BULK_UPLOAD_HELP_CONTENT = (
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

/**
 * ModeratorToolsPanel - Main container component
 *
 * Renders all modtools sections when user has moderator permissions.
 * Tools are organized in logical order:
 * 1. Download/Upload (bulk operations)
 * 2. Links management
 * 3. Bulk editing (Index, Version)
 * 4. Commentary tools
 * 5. Schema tools
 */
class ModeratorToolsPanel extends Component {
  constructor(props) {
    super(props);
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

  handleFiles = (event) => {
    this.setState({ files: event.target.files });
  }

  uploadFiles = (event) => {
    event.preventDefault();
    this.setState({ uploading: true, uploadMessage: "Uploading..." });
    let formData = new FormData();
    for (let i = 0; i < this.state.files.length; i++) {
      let file = this.state.files[i];
      formData.append('texts[]', file, file.name);
    }
    $.ajax({
      url: "api/text-upload",
      type: 'POST',
      data: formData,
      success: (data) => {
        if (data.status === "ok") {
          this.setState({ uploading: false, uploadMessage: data.message, uploadError: null, files: [] });
          $("#file-form").get(0).reset();
        } else {
          this.setState({ "uploadError": "Error - " + data.error, uploading: false, uploadMessage: data.message });
        }
      },
      error: (xhr, status, err) => {
        this.setState({ "uploadError": "Error - " + err.toString(), uploading: false, uploadMessage: null });
      },
      cache: false,
      contentType: false,
      processData: false
    });
  }

  onDlTitleChange = (event) => {
    this.setState({ bulk_title_pattern: event.target.value });
  }

  onDlVersionChange = (event) => {
    this.setState({ bulk_version_title_pattern: event.target.value });
  }

  onDlLanguageSelect = (event) => {
    this.setState({ bulk_language: event.target.value });
  }

  onDlFormatSelect = (event) => {
    this.setState({ bulk_format: event.target.value });
  }

  bulkVersionDlLink() {
    let args = ["format", "title_pattern", "version_title_pattern", "language"].map(
      arg => this.state["bulk_" + arg] ? `${arg}=${encodeURIComponent(this.state["bulk_" + arg])}` : ""
    ).filter(a => a).join("&");
    return "download/bulk/versions/?" + args;
  }

  render() {
    // Check moderator access
    if (!Sefaria.is_moderator) {
      return (
        <div className="modTools">
          <div className="message error">
            Tools are only available to logged-in moderators.
          </div>
        </div>
      );
    }

    // Bulk Download section
    const dlReady = (this.state.bulk_format && (this.state.bulk_title_pattern || this.state.bulk_version_title_pattern));
    const downloadButton = (
      <div className="modtoolsButton">
        <div className="modtoolsButtonInner">
          <span className="int-en">Download</span>
          <span className="int-he">הורדה</span>
        </div>
      </div>
    );

    const downloadSection = (
      <div className="modToolsSection dlSection">
        <div className="dlSectionTitle">
          <span className="int-en">Bulk Download Text</span>
          <span className="int-he">הורדת הטקסט</span>
        </div>
        <HelpButton
          title="Bulk Download Text"
          description={BULK_DOWNLOAD_HELP_CONTENT}
        />
        <input className="dlVersionSelect" type="text" placeholder="Index Title Pattern" onChange={this.onDlTitleChange} />
        <input className="dlVersionSelect" type="text" placeholder="Version Title Pattern" onChange={this.onDlVersionChange} />
        <select className="dlVersionSelect dlVersionLanguageSelect" value={this.state.bulk_language || ""} onChange={this.onDlLanguageSelect}>
          <option disabled>Language</option>
          <option key="all" value="">Hebrew & English</option>
          <option key="he" value="he">Hebrew</option>
          <option key="en" value="en">English</option>
        </select>
        <select className="dlVersionSelect dlVersionFormatSelect" value={this.state.bulk_format || ""} onChange={this.onDlFormatSelect}>
          <option disabled>File Format</option>
          <option key="txt" value="txt">Text (with tags)</option>
          <option key="plain.txt" value="plain.txt">Text (without tags)</option>
          <option key="csv" value="csv">CSV</option>
          <option key="json" value="json">JSON</option>
        </select>
        {dlReady ? <a href={this.bulkVersionDlLink()} download>{downloadButton}</a> : downloadButton}
      </div>
    );

    // CSV Upload section
    const ulReady = (!this.state.uploading) && this.state.files.length > 0;
    const uploadButton = (
      <a>
        <div className="modtoolsButton" onClick={this.uploadFiles}>
          <div className="modtoolsButtonInner">
            <span className="int-en">Upload</span>
            <span className="int-he">העלאה</span>
          </div>
        </div>
      </a>
    );

    const uploadForm = (
      <div className="modToolsSection">
        <div className="dlSectionTitle">
          <span className="int-en">Bulk Upload CSV</span>
          <span className="int-he">העלאה מ-CSV</span>
        </div>
        <HelpButton
          title="Bulk Upload CSV"
          description={BULK_UPLOAD_HELP_CONTENT}
        />
        <form id="file-form">
          <input className="dlVersionSelect" type="file" id="file-select" multiple onChange={this.handleFiles} />
          {ulReady && uploadButton}
        </form>
        {this.state.uploadMessage && <div className="message">{this.state.uploadMessage}</div>}
        {this.state.uploadError && <div className="message error">{this.state.uploadError}</div>}
      </div>
    );

    return (
      <div className="modTools">
        {/* Download/Upload Tools */}
        {downloadSection}
        {uploadForm}
        <WorkflowyModeratorTool />

        {/* Links Management */}
        <UploadLinksFromCSV />
        <GetLinks />
        <RemoveLinksFromCsv />

        {/* Bulk Editing Tools */}
        <BulkIndexEditor />
        <BulkVersionEditor />

        {/* Commentary Tools */}
        <AutoLinkCommentaryTool />

        {/* Schema Tools */}
        <NodeTitleEditor />
      </div>
    );
  }
}

ModeratorToolsPanel.propTypes = {
  interfaceLang: PropTypes.string
};


export default ModeratorToolsPanel;
