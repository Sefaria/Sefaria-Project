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
import React from 'react';
import Component from 'react-class';
import Cookies from 'js-cookie';
import { InterfaceText, EnglishText, HebrewText } from '../../Misc';
import ModToolsSection from './shared/ModToolsSection';
import { stripHtmlTags } from '../utils';

/**
 * Help content for WorkflowyModeratorTool
 */
const HELP_CONTENT = (
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
      <ModToolsSection
        title="Workflowy Outline Upload"
        titleHe="העלאת קובץ - workflowy"
        helpContent={HELP_CONTENT}
      >
        <div className="workflowy-tool">
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
      </ModToolsSection>
    );
  }
}

export default WorkflowyModeratorTool;
