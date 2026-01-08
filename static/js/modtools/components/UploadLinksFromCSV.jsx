/**
 * UploadLinksFromCSV - Upload links between refs from a CSV file
 *
 * CSV format: Two columns with refs to link
 * Supports link types: Commentary, Quotation, Related, etc.
 *
 * Backend endpoint: POST /modtools/links
 */
import React from 'react';
import Component from 'react-class';
import Cookies from 'js-cookie';
import { saveAs } from 'file-saver';
import ModToolsSection from './shared/ModToolsSection';
import { stripHtmlTags } from '../utils';

/**
 * Help content for UploadLinksFromCSV
 */
const HELP_CONTENT = (
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
          <td><strong>Mesorat hashas</strong></td>
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
 * Link type options for the select dropdown
 */
const LINK_TYPE_OPTIONS = [
  'Commentary',
  'Quotation',
  'Related',
  'Mesorat hashas',
  'Ein Mishpat',
  'Reference'
];

class UploadLinksFromCSV extends Component {
  constructor(props) {
    super(props);
    this.state = {
      projectName: '',
      linkType: 'commentary',
      hasFile: false,
      uploading: false,
      uploadMessage: null,
      uploadResult: null,
      error: false
    };
  }

  isSubmitDisabled() {
    return !this.state.hasFile || !this.state.projectName.length;
  }

  handleChange = (event) => {
    const target = event.target;
    this.setState({ [target.name]: target.value });
  }

  handleFileChange = (event) => {
    this.setState({ hasFile: !!event.target.files[0] });
  }

  handleSubmit = (event) => {
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

  renderOptions() {
    return LINK_TYPE_OPTIONS.map((option) => (
      <option value={option.toLowerCase()} key={option}>{option}</option>
    ));
  }

  render() {
    return (
      <ModToolsSection
        title="Upload Links"
        titleHe="העלאת קישורים"
        helpContent={HELP_CONTENT}
      >
        <div className="uploadLinksFromCSV">
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
                {this.renderOptions()}
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
      </ModToolsSection>
    );
  }
}

export default UploadLinksFromCSV;
