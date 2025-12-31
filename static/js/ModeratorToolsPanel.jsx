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
