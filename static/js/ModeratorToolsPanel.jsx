import React  from 'react';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import Component from 'react-class';
import Cookies from 'js-cookie';
import { saveAs } from 'file-saver';
import qs from 'qs';
import { useState } from 'react';

// Define field metadata for proper handling
const INDEX_FIELD_METADATA = {
  "enDesc": { 
    label: "English Description", 
    type: "textarea",
    placeholder: "A description of the text in English"
  },
  "shortDesc": { 
    label: "Short Description", 
    type: "textarea",
    placeholder: "Brief description (1-2 sentences)"
  },
  "heDesc": { 
    label: "Hebrew Description", 
    type: "textarea",
    placeholder: "תיאור הטקסט בעברית",
    dir: "rtl"
  },
  "heShortDesc": { 
    label: "Hebrew Short Description", 
    type: "textarea",
    placeholder: "תיאור קצר (משפט או שניים)",
    dir: "rtl"
  },
  "category": { 
    label: "Category", 
    type: "select",
    placeholder: "Select category..."
  },
  "authors": { 
    label: "Authors", 
    type: "array",
    placeholder: "Comma-separated list of author names",
    help: "Enter author names separated by commas (e.g., 'Rashi, Rabbi Shlomo Yitzchaki')"
  },
  "altTitles": { 
    label: "Alternative Titles", 
    type: "array",
    placeholder: "Comma-separated alternative titles",
    help: "English alternative titles for this text"
  },
  "heAltTitles": { 
    label: "Hebrew Alternative Titles", 
    type: "array",
    placeholder: "כותרות חלופיות מופרדות בפסיקים",
    help: "כותרות חלופיות בעברית",
    dir: "rtl"
  },
  "compDate": { 
    label: "Composition Date", 
    type: "daterange",
    placeholder: "[1040, 1105] or 1105 or -500",
    help: "Year or range [start, end]. Negative for BCE. Arrays auto-convert to single year if identical."
  },
  "compPlace": { 
    label: "Composition Place", 
    type: "text",
    placeholder: "e.g., 'Troyes, France'"
  },
  "heCompPlace": { 
    label: "Hebrew Composition Place", 
    type: "text",
    placeholder: "למשל: 'טרואה, צרפת'",
    dir: "rtl"
  },
  "pubDate": { 
    label: "Publication Date", 
    type: "daterange",
    placeholder: "[1475, 1475] or 1475",
    help: "First publication year or range"
  },
  "pubPlace": { 
    label: "Publication Place", 
    type: "text",
    placeholder: "e.g., 'Venice, Italy'"
  },
  "hePubPlace": { 
    label: "Hebrew Publication Place", 
    type: "text",
    placeholder: "למשל: 'ונציה, איטליה'",
    dir: "rtl"
  },
};

const BulkIndexEditor = () => {
  const [vtitle, setVtitle] = React.useState("");
  const [lang, setLang] = React.useState("");
  const [indices, setIndices] = React.useState([]);
  const [pick, setPick] = React.useState(new Set());
  const [updates, setUpdates] = React.useState({});
  const [msg, setMsg] = React.useState("");
  const [categories, setCategories] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Load categories on mount
  React.useEffect(() => {
    $.getJSON('/api/index', data => {
      const cats = [];
      const extractCategories = (node, path = []) => {
        if (node.category) {
          const fullPath = [...path, node.category].join(", ");
          cats.push(fullPath);
        }
        if (node.contents) {
          node.contents.forEach(item => {
            extractCategories(item, node.category ? [...path, node.category] : path);
          });
        }
      };
      data.forEach(cat => extractCategories(cat));
      setCategories(cats.sort());
    });
  }, []);

  const load = () => {
    if (!vtitle) {
      setMsg("❌ Please enter a version title");
      return;
    }
    
    setLoading(true);
    setMsg("Loading indices...");
    
    $.getJSON(`/api/indices-by-version?versionTitle=${encodeURIComponent(vtitle)}&language=${lang}`)
      .done(d => {
        setIndices(d.indices);
        setPick(new Set(d.indices));
        setMsg(`Found ${d.indices.length} indices`);
      })
      .fail(xhr => {
        const errorMsg = xhr.responseJSON?.error || xhr.responseText || "Failed to load indices";
        setMsg(`❌ Error: ${errorMsg}`);
        setIndices([]);
        setPick(new Set());
      })
      .always(() => setLoading(false));
  };

  const save = () => {
    if (!pick.size || !Object.keys(updates).length) return;
    
    setSaving(true);
    setMsg("Saving changes...");
    
    // Process updates to ensure correct data types
    const processedUpdates = {};
    for (const [field, value] of Object.entries(updates)) {
      const fieldMeta = INDEX_FIELD_METADATA[field];
      if (!fieldMeta) {
        processedUpdates[field] = value;
        continue;
      }

      switch (fieldMeta.type) {
        case 'array':
          // Convert comma-separated string to array
          processedUpdates[field] = value.split(',').map(v => v.trim()).filter(v => v);
          break;
        case 'daterange':
          // Handle date input - could be single year or range
          if (value.startsWith('[') && value.endsWith(']')) {
            try {
              processedUpdates[field] = JSON.parse(value);
            } catch (e) {
              setMsg(`❌ Invalid date format for ${field}`);
              setSaving(false);
              return;
            }
          } else {
            const year = parseInt(value);
            if (!isNaN(year)) {
              processedUpdates[field] = year;
            } else {
              setMsg(`❌ Invalid date format for ${field}`);
              setSaving(false);
              return;
            }
          }
          break;
        default:
          processedUpdates[field] = value;
      }
    }
    
    $.ajax({
      url: '/api/index-bulk-edit',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({
        indices: [...pick], 
        updates: processedUpdates
      }),
      success: d => {
        setMsg(`✅ Successfully updated ${d.count} indices`);
        setUpdates({}); // Clear updates after success
        // Clear form inputs
        document.querySelectorAll('.field-input').forEach(input => {
          if (input.tagName === 'SELECT') {
            input.value = '';
          } else {
            input.value = '';
          }
        });
      },
      error: xhr => {
        const errorMsg = xhr.responseJSON?.error || xhr.responseText || "Failed to save";
        setMsg(`❌ Error: ${errorMsg}`);
      },
      complete: () => setSaving(false)
    });
  };

  const handleFieldChange = (fieldName, value) => {
    setUpdates(u => {
      const newUpdates = {...u};
      if (value) {
        newUpdates[fieldName] = value;
      } else {
        delete newUpdates[fieldName];
      }
      return newUpdates;
    });
  };

  const renderField = (fieldName) => {
    const fieldMeta = INDEX_FIELD_METADATA[fieldName];
    const currentValue = updates[fieldName] || "";

    const commonProps = {
      className: "dlVersionSelect field-input",
      placeholder: fieldMeta.placeholder,
      value: currentValue,
      onChange: e => handleFieldChange(fieldName, e.target.value),
      style: { width: "100%", direction: fieldMeta.dir || "ltr" }
    };

    return (
      <div key={fieldName} style={{ marginBottom: "12px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
          {fieldMeta.label}:
        </label>
        
        {fieldMeta.help && (
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
            {fieldMeta.help}
          </div>
        )}

        {fieldMeta.type === "select" && fieldName === "category" ? (
          <select {...commonProps}>
            <option value="">Select category...</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        ) : fieldMeta.type === "textarea" ? (
          <textarea {...commonProps} rows={3} />
        ) : (
          <input {...commonProps} type="text" />
        )}
      </div>
    );
  };

  return (
    <div className="modToolsSection">
      <div className="dlSectionTitle">Bulk Edit Index Metadata</div>
      
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <input 
          className="dlVersionSelect" 
          placeholder="Version title"
          value={vtitle} 
          onChange={e => setVtitle(e.target.value)}
          style={{ flex: 1 }}
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
          disabled={loading || !vtitle}
        >
          {loading ? "Loading..." : "Find Indices"}
        </button>
      </div>

      {indices.length > 0 && (
        <>
          <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f5f5f5", borderRadius: "4px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input 
                type="checkbox"
                checked={pick.size === indices.length}
                onChange={() => setPick(pick.size === indices.length ? new Set() : new Set(indices))}
              />
              <span style={{ fontWeight: "500" }}>
                Select all ({indices.length} indices)
              </span>
            </label>
          </div>
          
          <div 
            className="indicesList" 
            style={{
              maxHeight: "200px", 
              overflow: "auto", 
              border: "1px solid #ddd", 
              padding: "8px",
              marginBottom: "16px",
              backgroundColor: "#f9f9f9"
            }}
          >
            {indices.map(t => (
              <label key={t} style={{ display: "block", padding: "4px", cursor: "pointer" }}>
                <input 
                  type="checkbox" 
                  checked={pick.has(t)}
                  onChange={e => {
                    const s = new Set(pick);
                    e.target.checked ? s.add(t) : s.delete(t);
                    setPick(s);
                  }}
                /> {t}
              </label>
            ))}
          </div>
        </>
      )}

      {pick.size > 0 && (
        <>
          <div style={{ marginBottom: "12px", fontWeight: "500" }}>
            Edit fields for {pick.size} selected {pick.size === 1 ? 'index' : 'indices'}:
          </div>
          
          <div style={{ marginBottom: "16px" }}>
            {Object.keys(INDEX_FIELD_METADATA).map(f => renderField(f))}
          </div>

          {Object.keys(updates).length > 0 && (
            <div style={{ marginBottom: "8px", padding: "8px", backgroundColor: "#e7f3ff", borderRadius: "4px" }}>
              <strong>Changes to apply:</strong>
              <ul style={{ margin: "4px 0 0 20px", padding: 0 }}>
                {Object.entries(updates).map(([k, v]) => (
                  <li key={k} style={{ fontSize: "14px" }}>
                    {INDEX_FIELD_METADATA[k]?.label || k}: "{v}"
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button 
            className="modtoolsButton"
            disabled={!Object.keys(updates).length || saving}
            onClick={save}
          >
            {saving ? "Saving..." : `Save Changes to ${pick.size} Indices`}
          </button>
        </>
      )}

      {msg && (
        <div 
          className="message" 
          style={{
            marginTop: "12px",
            padding: "8px",
            borderRadius: "4px",
            backgroundColor: msg.includes("✅") ? "#d4edda" : 
                           msg.includes("❌") ? "#f8d7da" : "#d1ecf1",
            color: msg.includes("✅") ? "#155724" : 
                   msg.includes("❌") ? "#721c24" : "#0c5460"
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
};

// Rest of the component remains the same...
class ModeratorToolsPanel extends Component {
  constructor(props) {
    super(props);
    this.handleWfSubmit = this.handleWfSubmit.bind(this);
    this.wfFileInput = React.createRef();

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
  handleFiles(event) {
    this.setState({files: event.target.files});
  }
  uploadFiles(event) {
    event.preventDefault();
    this.setState({uploading: true, uploadMessage:"Uploading..."});
    let formData = new FormData();
    for (let i = 0; i < this.state.files.length; i++) {
      let file = this.state.files[i];
      formData.append('texts[]', file, file.name);
    }
    $.ajax({
      url: "api/text-upload",
      type: 'POST',
      data: formData,
      success: function(data) {
        if (data.status == "ok") {
          this.setState({uploading: false, uploadMessage: data.message, uploadError: null, files:[]});
          $("#file-form").get(0).reset(); //Remove selected files from the file selector
        } else {
          this.setState({"uploadError": "Error - " + data.error, uploading: false, uploadMessage: data.message});
        }
      }.bind(this),
      error: function(xhr, status, err) {
        this.setState({"uploadError": "Error - " + err.toString(), uploading: false, uploadMessage: null});
      }.bind(this),
      cache: false,
      contentType: false,
      processData: false
    });
  }
  onDlTitleChange(event) {
    this.setState({bulk_title_pattern: event.target.value});
  }
  onDlVersionChange(event) {
    this.setState({bulk_version_title_pattern: event.target.value});
  }
  onDlLanguageSelect(event) {
    this.setState({bulk_language: event.target.value});
  }
  onDlFormatSelect(event) {
    this.setState({bulk_format: event.target.value});
  }
  bulkVersionDlLink() {
    let args = ["format","title_pattern","version_title_pattern","language"].map(
        arg => this.state["bulk_" + arg]?`${arg}=${encodeURIComponent(this.state["bulk_"+arg])}`:""
    ).filter(a => a).join("&");
    return "download/bulk/versions/?" + args;
  }

  handleInputChange(event) {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const name = target.name;

    this.setState({
      [name]: value
    });
  }

  handleWfSubmit(event) {
    event.preventDefault();
    alert(
      `Selected file - ${this.wfFileInput.current.files[0].name}`
    );
  }

  render () {
    // Bulk Download
    const dlReady = (this.state.bulk_format && (this.state.bulk_title_pattern || this.state.bulk_version_title_pattern));
    const downloadButton = <div className="modtoolsButton">
        <div className="modtoolsButtonInner">
          <span className="int-en">Download</span>
          <span className="int-he">הורדה</span>
        </div>
      </div>;
    const downloadSection = (
      <div className="modToolsSection dlSection">
        <div className="dlSectionTitle">
          <span className="int-en">Bulk Download Text</span>
          <span className="int-he">הורדת הטקסט</span>
        </div>
        <input className="dlVersionSelect" type="text" placeholder="Index Title Pattern" onChange={this.onDlTitleChange} />
        <input className="dlVersionSelect" type="text" placeholder="Version Title Pattern" onChange={this.onDlVersionChange}/>
        <select className="dlVersionSelect dlVersionLanguageSelect" value={this.state.bulk_language || ""} onChange={this.onDlLanguageSelect}>
          <option disabled>Language</option>
          <option key="all" value="" >Hebrew & English</option>
          <option key="he" value="he" >Hebrew</option>
          <option key="en" value="en" >English</option>
        </select>
        <select className="dlVersionSelect dlVersionFormatSelect" value={this.state.bulk_format || ""} onChange={this.onDlFormatSelect}>
          <option disabled>File Format</option>
          <option key="txt" value="txt" >Text (with tags)</option>
          <option key="plain.txt" value="plain.txt" >Text (without tags)</option>
          <option key="csv" value="csv" >CSV</option>
          <option key="json" value="json" >JSON</option>
        </select>
        {dlReady?<a href={this.bulkVersionDlLink()} download>{downloadButton}</a>:downloadButton}
      </div>);

    // Uploading
    const ulReady = (!this.state.uploading) && this.state.files.length > 0;
    const uploadButton = <a><div className="modtoolsButton" onClick={this.uploadFiles}><div className="modtoolsButtonInner">
       <span className="int-en">Upload</span>
       <span className="int-he">העלאה</span>
      </div></div></a>;
    const uploadForm = (
      <div className="modToolsSection">
        <div className="dlSectionTitle">
          <span className="int-en">Bulk Upload CSV</span>
          <span className="int-he">העלאה מ-CSV</span>
        </div>
         <form id="file-form">
           <input className="dlVersionSelect" type="file" id="file-select"  multiple onChange={this.handleFiles}/>
           {ulReady?uploadButton:""}
         </form>
        {this.state.uploadMessage?<div className="message">{this.state.uploadMessage}</div>:""}
        {this.state.uploadError?<div className="error">{this.state.uploadError}</div>:""}
      </div>);
    const wflowyUpl = (
      <div className="modToolsSection">
          <WorkflowyModeratorTool />
      </div>);
    const uploadLinksFromCSV = (
      <div className="modToolsSection">
          <UploadLinksFromCSV />
      </div>);
    const getLinks = (
      <div className="modToolsSection">
          <GetLinks/>
      </div>);
     const removeLinksFromCsv = (
         <div className='modToolsSection'>
             <RemoveLinksFromCsv/>
         </div>
     );
     const workflowyPanel  = (
       <div className="modToolsSection"><WorkflowyBulkPanel /></div>
     );
     const bulkIndexEditor = (
      <div className="modToolsSection"><BulkIndexEditor /></div>
     );
     const bulkVersionEditor = (
       <div className="modToolsSection">
         <BulkVersionEditor />
       </div>
     );
          return Sefaria.is_moderator ? (
       <div className="modTools">
         {downloadSection}
         {uploadForm}
         {wflowyUpl}
         {uploadLinksFromCSV}
         {getLinks}
         {removeLinksFromCsv}
         {workflowyPanel}
         {bulkIndexEditor}
         {bulkVersionEditor}
       </div>
     ) : (
       <div className="modTools">
         Tools are only available to logged-in moderators.
       </div>
     );
   }
 }
 
ModeratorToolsPanel.propTypes = {
  interfaceLang: PropTypes.string
};


class WorkflowyModeratorTool extends Component{
    constructor(props) {
    super(props);
    this.handleWfSubmit = this.handleWfSubmit.bind(this);
    this.wfFileInput = React.createRef();
    this.state = {c_index: true};
  }

  handleInputChange(event) {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const name = target.name;

    this.setState({
      [name]: value
    });
  }

  handleWfSubmit(event) {
    event.preventDefault();
    /*console.log(
      `Selected file - ${this.wfFileInput.current.files[0].name}`
    );*/
    this.setState({uploading: true, uploadMessage:"Uploading..."});
    const data = new FormData(event.target);
    console.log(data);
    const request = new Request(
        '/modtools/upload_text',
        {headers: {'X-CSRFToken': Cookies.get('csrftoken')}}
    );
    fetch(request, {
      method: 'POST',
      mode: 'same-origin',
      credentials: 'same-origin',
      body: data,
    }).then(response => {
        this.setState({uploading: false, uploadMessage:""});
        if (!response.ok) {
            response.text().then(resp_text=> {
                console.log("error in html form", resp_text);
                this.setState({uploading: false,
                    error: true,
                    errorIsHTML: true,
                     uploadResult: resp_text});
            })
        }else{
            response.json().then(resp_json=>{
                console.log("okay response", resp_json);
                this.setState({uploading: false,
                    error: false,
                    uploadMessage:resp_json["data"]["message"],
                    uploadResult: JSON.stringify(resp_json["data"]["index"], undefined, 4)})
            });
        }
    }).catch(error => {
        console.log("network error", error);
        this.setState({uploading: false, error: true, errorIsHTML: false, uploadMessage:error.message});
    });
  }

  parseErrorHTML(htmltext){
    console.log("pparsing html", htmltext);
    // Initialize the DOM parser
    let parser = new DOMParser();
    // Parse the text
    let doc = parser.parseFromString(htmltext, "text/html");
    //return {__html: doc};
    return doc
  }

  render() {
    return(
        <div className="workflowy-tool">
        <div className="dlSectionTitle">
          <span className="int-en">Workflowy Outline Upload</span>
          <span className="int-he">העלאת קובץ - workflowy</span>
        </div>
        <form id="wf-file-form" className="workflowy-tool-form" onSubmit={this.handleWfSubmit}>
           <label>
              Upload Workflowy file:
              <input type="file" name="wf_file" ref={this.wfFileInput} />
           </label>
           <label>
              Create Index Record:
              <input
                name="c_index"
                type="checkbox"
                checked={this.state.c_index}
                onChange={this.handleInputChange} />
           </label>
           <label>
              Create Version From Notes on Outline:
              <input
                name="c_version"
                type="checkbox"
                checked={this.state.c_version || false}
                onChange={this.handleInputChange} />
           </label>
           <label>
            Custom Delimiters (In the following Order- 1. Title Language 2. Alt Titles 3. Categories):
              <input
                className="dlVersionSelect"
                name="delims"
                type="text"
                value={this.state.delims}
                onChange={this.handleInputChange} />
            </label>
            <label>
              Optional Term Scheme Name:
              <input
                className="dlVersionSelect"
                name="term_scheme"
                type="text"
                value={this.state.term_scheme}
                onChange={this.handleInputChange} />
            </label>
             <button className="modtoolsButton" name="wf-submit" type="submit">
                <span className="int-en">Upload</span>
                <span className="int-he">Upload</span>
             </button>
         </form>
        <div id="wf-upl-msg" className="wf-upl-msg">{this.state.uploadMessage || ""}</div>
        { (this.state.error && this.state.errorIsHTML) ?
              <div id="wf-upl-message" className="wf-upl-message" dangerouslySetInnerHTML={{__html: this.state.uploadResult}}/> :
              <textarea id="wf-upl-message" className="wf-upl-message" cols="80" rows="30" value={this.state.uploadResult}></textarea> }
        </div>);        
  }
}

class UploadLinksFromCSV extends Component{
  constructor(props) {
    super(props);
    this.state = {projectName: ''};
    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }
  isSubmitDisabled() {
      return !this.state.hasFile || !this.state.projectName.length;
  }
  handleChange(event) {
    const target = event.target;
    this.setState({[target.name]: target.value});
  }
  handleFileChange(event) {
      this.setState({hasFile: !!event.target.files[0]});
  }
  handleSubmit(event) {
    event.preventDefault();
    this.setState({uploading: true, uploadMessage:"Uploading..."});
    const data = new FormData(event.target);
    const request = new Request(
        '/modtools/links',
        {headers: {'X-CSRFToken': Cookies.get('csrftoken')}}
    );
    fetch(request, {
      method: 'POST',
      mode: 'same-origin',
      credentials: 'same-origin',
      body: data
    }).then(response => {
        if (!response.ok) {
            response.text().then(resp_text => {
                this.setState({uploading: false,
                    uploadMessage: "",
                    error: true,
                    errorIsHTML: true,
                    uploadResult: resp_text});
            })
        } else {
            response.json().then(resp_json => {
                this.setState({uploading: false,
                    error: false,
                    uploadMessage: resp_json.data.message,
                    uploadResult: JSON.stringify(resp_json.data.index, undefined, 4)});
                if (resp_json.data.errors) {
                    let blob = new Blob([resp_json.data.errors], {type: "text/plain;charset=utf-8"});
                    saveAs(blob, 'errors.csv');
                }
            });
        }
    }).catch(error => {
        this.setState({uploading: false, error: true, errorIsHTML: false, uploadMessage:error.message});
    });

  }
  getOptions() {
      const options = ['Commentary', 'Quotation', 'Related', 'Mesorat hashas', 'Ein Mishpat', 'Reference'];
      return options.map((option) => {
          return <option value={option.toLowerCase()} key={option}>{option}</option>;
      });
  }

  render() {
    return (
        <div className="uploadLinksFromCSV">
            <div className="dlSectionTitle">Upload links</div>
            <form id="upload-links-form" onSubmit={this.handleSubmit}>
                <label>
                    Upload file:
                    <input type="file" name="csv_file"  onChange={this.handleFileChange} />
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
                        value={this.state.generatedBy}
                        onChange={this.handleChange}
                    />
                </label>
                <input type="submit" value="Submit" disabled={this.isSubmitDisabled()} />
            </form>
            { this.state.uploadMessage && <div>{this.state.uploadMessage}</div> }
            { (this.state.errorIsHTML) && <div dangerouslySetInnerHTML={{__html: this.state.uploadResult}}/> }
        </div>
    );
  }
}

const RemoveLinksFromCsv = () => {
    const [fileName, setFileName] = useState(false);
    const [uploadMessage, setUploadMessage] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const handleFileChange = (event) => {
        setFileName(event.target.files[0] || null);
    }
    const handleSubmit = (event) => {
        event.preventDefault();
        setUploadMessage("Uploading...");
        const data = new FormData(event.target);
        data.append('action', 'DELETE');
        const request = new Request(
            '/modtools/links',
            {headers: {'X-CSRFToken': Cookies.get('csrftoken')}}
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
                  setErrorMessage(resp_text);
                })
            } else {
                response.json().then(resp_json => {
                    setUploadMessage(resp_json.data.message);
                    setErrorMessage(null);
                    if (resp_json.data.errors) {
                        let blob = new Blob([resp_json.data.errors], {type: "text/plain;charset=utf-8"});
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
        <div className="remove-links-csv">
            <div className="dlSectionTitle">Remove links</div>
            <form id="remove-links-form" onSubmit={handleSubmit}>
                <label>
                    Upload file:
                    <input type="file" name="csv_file"  onChange={handleFileChange} />
                    <br/>
                    Choose a csv file with two columns. First row should include titles, and the others valid refs to delete.
                    <br/>
                    Please note that it should be the exact ref, so 'Genesis 1' is different than 'Genesis 1:1-31'
                </label>
                <br/>
                <input type="submit" value="Submit" disabled={!fileName} />
            </form>
            {uploadMessage && <div>{uploadMessage}</div>}
            {errorMessage && <div dangerouslySetInnerHTML={{__html: errorMessage}}/> }
        </div>
    );
};

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

function GetLinks() {
  const [refs, setRefs] = useState({ ref1: '', ref2: '' });
  const [errors, setErrors] = useState({ref2: false});
  const [type, setType] = useState('');
  const [generatedBy, setGeneratedBy] = useState('');
  const [bySegment, setBySegment] = useState(false)

  const handleCheck = () => {
    setBySegment(!bySegment)
  }

  const handleChange = async (event) => {
    const { name, value } = event.target;
    setRefs(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      if (!value) {
          setErrors(prev => ({...prev, [name]: false}));
      }
      else {
          try {
              const response = await Sefaria.getName(value);
              setErrors(prev => ({...prev, [name]: !response.is_ref}));
          } catch (error) {
              console.error(error);
          }
      }
    }
  }


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
  }

  const formReady = () => {
    return refs.ref1 && errors.ref1 === false && errors.ref2 === false;
  }

  const linksDownloadLink = () => {
    const queryParams = qs.stringify({ type: (type) ? type : null, generated_by: (generatedBy) ? generatedBy : null },
        { addQueryPrefix: true, skipNulls: true });
    const tool = (bySegment) ? 'index_links' : 'links';
    return `modtools/${tool}/${refs.ref1}/${refs.ref2 || 'all'}${queryParams}`;
  }

  return (
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
        <br/>
        <InputRef id={2} value={refs.ref2} handleChange={handleChange} handleBlur={handleBlur} error={errors.ref2} />
        <br/>
        <InputNonRef name='type' value={type} handleChange={(e) => setType(e.target.value)} />
        <br/>
        <InputNonRef name='generated_by' value={generatedBy} handleChange={(e) => setGeneratedBy(e.target.value)} />
      </form>
      {formReady() ? <a href={linksDownloadLink()} download><DownloadButton /></a> : <DownloadButton />}
    </div>
  );
}

const WorkflowyBulkPanel = () => {
  const [files, setFiles] = React.useState([]);
  const [src, setSrc] = React.useState("");
  const [targets, setTargets] = React.useState(new Set());
  const [msg, setMsg] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [duplicating, setDuplicating] = React.useState(false);

  // State for new form controls, matching the single uploader
  const [c_index, setCreateIndex] = React.useState(true);
  const [c_version, setCreateVersion] = React.useState(false);
  const [delims, setDelims] = React.useState("");
  const [term_scheme, setTermScheme] = React.useState("");


  // Define all books/tractates
  const BIBLE_BOOKS = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"];
  
  const MISHNAH_TRACTATES = [
    "Berakhot", "Peah", "Demai", "Kilayim", "Sheviit", "Terumot", "Maasrot", "Maaser Sheni",
    "Challah", "Orlah", "Bikkurim", "Shabbat", "Eruvin", "Pesachim", "Shekalim", "Yoma",
    "Sukkah", "Beitzah", "Rosh Hashanah", "Ta'anit", "Megillah", "Moed Katan", "Chagigah",
    "Yevamot", "Ketubot", "Nedarim", "Nazir", "Sotah", "Gittin", "Kiddushin",
    "Bava Kamma", "Bava Metzia", "Bava Batra", "Sanhedrin", "Makkot", "Shevuot",
    "Eduyot", "Avodah Zarah", "Pirkei Avot", "Horayot", "Zevachim", "Menachot",
    "Chullin", "Bekhorot", "Arakhin", "Temurah", "Keritot", "Meilah", "Tamid",
    "Middot", "Kinnim", "Kelim", "Oholot", "Negaim", "Parah", "Tahorot",
    "Mikvaot", "Niddah", "Makhshirin", "Zavim", "Tevul Yom", "Yadayim", "Oktzin"
  ];
  
  const TALMUD_TRACTATES = [
    "Berakhot", "Shabbat", "Eruvin", "Pesachim", "Shekalim", "Yoma", "Sukkah",
    "Beitzah", "Rosh Hashanah", "Ta'anit", "Megillah", "Moed Katan", "Chagigah",
    "Yevamot", "Ketubot", "Nedarim", "Nazir", "Sotah", "Gittin", "Kiddushin",
    "Bava Kamma", "Bava Metzia", "Bava Batra", "Sanhedrin", "Makkot", "Shevuot",
    "Avodah Zarah", "Horayot", "Zevachim", "Menachot", "Chullin", "Bekhorot",
    "Arakhin", "Temurah", "Keritot", "Meilah", "Tamid", "Niddah"
  ];

  const JERUSALEM_TALMUD_TRACTATES = [
    // Seder Zeraim (included in Jerusalem Talmud)
    "Berakhot", "Peah", "Demai", "Kilayim", "Sheviit", "Terumot", "Maasrot", 
    "Maaser Sheni", "Challah", "Orlah", "Bikkurim",
    // Seder Moed
    "Shabbat", "Eruvin", "Pesachim", "Beitzah", "Rosh Hashanah", "Yoma", "Sukkah",
    "Ta'anit", "Megillah", "Moed Katan", "Chagigah", "Shekalim",
    // Seder Nashim
    "Yevamot", "Ketubot", "Nedarim", "Nazir", "Sotah", "Gittin", "Kiddushin",
    // Seder Nezikin
    "Bava Kamma", "Bava Metzia", "Bava Batra", "Sanhedrin", "Makkot", "Shevuot",
    "Avodah Zarah", "Horayot",
    // Seder Toharot (only Niddah)
    "Niddah"
  ];

  // Extract the base text from the source commentary
  const getBaseText = (sourceTitle) => {
    // Handle patterns like "Rashi on Genesis", "Kehati on Mishnah Bekhorot", etc.
    const patterns = [
      /on\s+(.+)$/,                    // "X on Y"
      /to\s+(.+)$/,                    // "X to Y"
      /,\s+(.+)$/,                     // "X, Y"
    ];
    
    for (let pattern of patterns) {
      const match = sourceTitle.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  };

  // Determine which category and base book/tractate from the source
  const analyzeSource = () => {
    if (!src) return { category: null, baseBook: null, availableTargets: [] };
    
    const baseText = getBaseText(src);
    if (!baseText) return { category: null, baseBook: null, availableTargets: [] };
    
    // Check if it's Bible
    for (let book of BIBLE_BOOKS) {
      if (baseText.includes(book)) {
        const targets = BIBLE_BOOKS
          .filter(b => b !== book)
          .map(b => src.replace(book, b));
        return { category: "Bible", baseBook: book, availableTargets: targets };
      }
    }
    
    // Check if it's Jerusalem Talmud
    if (baseText.includes("Jerusalem Talmud") || baseText.includes("Talmud Yerushalmi")) {
      for (let tractate of JERUSALEM_TALMUD_TRACTATES) {
        if (baseText.includes(tractate)) {
          const targets = JERUSALEM_TALMUD_TRACTATES
            .filter(t => t !== tractate)
            .map(t => src.replace(tractate, t));
          return { category: "Jerusalem Talmud", baseBook: tractate, availableTargets: targets };
        }
      }
    }
    
    // Check if it's Mishnah
    if (baseText.includes("Mishnah")) {
      for (let tractate of MISHNAH_TRACTATES) {
        if (baseText.includes(tractate)) {
          const targets = MISHNAH_TRACTATES
            .filter(t => t !== tractate)
            .map(t => src.replace(tractate, t));
          return { category: "Mishnah", baseBook: tractate, availableTargets: targets };
        }
      }
    }
    
    // Check if it's Talmud (Bavli)
    for (let tractate of TALMUD_TRACTATES) {
      if (baseText.includes(tractate)) {
        const targets = TALMUD_TRACTATES
          .filter(t => t !== tractate)
          .map(t => src.replace(tractate, t));
        return { category: "Talmud", baseBook: tractate, availableTargets: targets };
      }
    }
    
    return { category: null, baseBook: null, availableTargets: [] };
  };

  const upload = () => {
    if (files.length === 0) return;
    
    setUploading(true);
    setMsg("Uploading files...");
    const fd = new FormData();
    files.forEach(f => fd.append("workflowys[]", f));
    
    // Append the new form data
    fd.append("c_index", c_index);
    fd.append("c_version", c_version);
    fd.append("delims", delims);
    fd.append("term_scheme", term_scheme);

    $.ajax({
      url: '/api/upload-workflowy-multi',
      type: 'POST', 
      data: fd, 
      processData: false, 
      contentType: false,
      success: d => {
        setMsg(`✅ ${d.message}`);
        setFiles([]); // Clear files after success
        // Reset file input
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) fileInput.value = '';
      },
      error: x => {
        const errorMsg = x.responseJSON?.error || x.responseText || "Upload failed";
        setMsg(`❌ Error: ${errorMsg}`);
      },
      complete: () => setUploading(false)
    });
  };

  const duplicate = () => {
    if (!src || targets.size === 0) return;
    
    setDuplicating(true);
    setMsg(`Creating ${targets.size} indices...`);
    
    $.ajax({
      url: '/api/duplicate-index', 
      type: 'POST', 
      contentType: 'application/json',
      data: JSON.stringify({src, targets: [...targets]}),
      success: d => {
        if (d.created && d.created.length > 0) {
          setMsg(`✅ Successfully created: ${d.created.join(', ')}`);
          setTargets(new Set()); // Clear selection after success
        } else {
          setMsg(`⚠️ No indices were created (they may already exist)`);
        }
      },
      error: x => {
        const errorMsg = x.responseJSON?.error || x.responseText || "Unknown error";
        setMsg(`❌ Error: ${errorMsg}`);
      },
      complete: () => setDuplicating(false)
    });
  };

  const selectAll = () => {
    const { availableTargets } = analyzeSource();
    setTargets(new Set(availableTargets));
  };

  const selectNone = () => {
    setTargets(new Set());
  };

  const { category: detectedCategory, baseBook, availableTargets } = analyzeSource();

  return (
    <div className="modToolsSection">
      <div className="dlSectionTitle">Bulk Workflowy Import</div>
      
      {/* Configuration options for the uploader */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
          <label>
              <input type="checkbox" checked={c_index} onChange={e => setCreateIndex(e.target.checked)} />
              Create Index Record
          </label>
          <label>
              <input type="checkbox" checked={c_version} onChange={e => setCreateVersion(e.target.checked)} />
              Create Version From Notes on Outline
          </label>
          <label>
              Custom Delimiters (Title Lang | Alt Titles | Categories):
              <input type="text" className="dlVersionSelect" value={delims} onChange={e => setDelims(e.target.value)} style={{ width: '100%' }} />
          </label>
          <label>
              Optional Term Scheme Name:
              <input type="text" className="dlVersionSelect" value={term_scheme} onChange={e => setTermScheme(e.target.value)} style={{ width: '100%' }} />
          </label>
      </div>

      <input 
        type="file" 
        multiple 
        onChange={e => setFiles([...e.target.files])}
        accept=".opml"
      />
      <button 
        className="modtoolsButton" 
        disabled={!files.length || uploading} 
        onClick={upload}
      >
        {uploading ? "Uploading..." : `Upload ${files.length} File${files.length !== 1 ? 's' : ''}`}
      </button>

      <div className="dlSectionTitle" style={{marginTop: "16px"}}>Duplicate Index</div>
      <input 
        className="dlVersionSelect" 
        placeholder="Source index (e.g., Rashi on Genesis, Kehati on Mishnah Berakhot)"
        value={src} 
        onChange={e => setSrc(e.target.value)}
      />
      
      {src && detectedCategory && (
        <>
          <div style={{margin: "8px 0", fontSize: "14px", color: "#666"}}>
            Detected: <strong>{detectedCategory}</strong> commentary on <strong>{baseBook}</strong>
          </div>
          
          <div style={{margin: "8px 0"}}>
            <button 
              className="modtoolsButton" 
              onClick={selectAll} 
              style={{marginRight: "5px"}}
            >
              Select All ({availableTargets.length})
            </button>
            <button className="modtoolsButton" onClick={selectNone}>
              Select None
            </button>
          </div>
          
          <div 
            className="indicesList" 
            style={{
              maxHeight: "400px", 
              overflow: "auto", 
              border: "1px solid #ddd", 
              padding: "10px",
              backgroundColor: "#f9f9f9"
            }}
          >
            {availableTargets.map(t =>
              <label key={t} style={{display: "block", padding: "3px", cursor: "pointer"}}>
                <input 
                  type="checkbox"
                  checked={targets.has(t)}
                  onChange={e => {
                    const s = new Set(targets);
                    e.target.checked ? s.add(t) : s.delete(t);
                    setTargets(s);
                  }}
                /> {t}
              </label>
            )}
          </div>
          
          {targets.size > 0 && (
            <div style={{margin: "8px 0", fontSize: "14px", color: "#666"}}>
              Selected: {targets.size} of {availableTargets.length} indices
            </div>
          )}
        </>
      )}
      
      {src && !detectedCategory && (
        <div style={{margin: "8px 0", color: "#d9534f", fontSize: "14px"}}>
          Could not detect commentary type. Please ensure the source follows patterns like:
          <ul style={{marginTop: "5px", marginBottom: "0"}}>
            <li>"Rashi on Genesis"</li>
            <li>"Kehati on Mishnah Bekhorot"</li>
            <li>"Steinsaltz on Talmud Berakhot"</li>
            <li>"Meiri on Jerusalem Talmud Berakhot"</li>
          </ul>
        </div>
      )}
      
      <button 
        className="modtoolsButton"
        disabled={!src || !targets.size || duplicating} 
        onClick={duplicate}
        style={{marginTop: "8px"}}
      >
        {duplicating ? "Creating..." : `Duplicate to ${targets.size} indices`}
      </button>
      
      {msg && (
        <div 
          className="message" 
          style={{
            marginTop: "8px",
            padding: "8px",
            borderRadius: "4px",
            backgroundColor: msg.includes("✅") ? "#d4edda" : 
                           msg.includes("❌") ? "#f8d7da" : 
                           msg.includes("⚠️") ? "#fff3cd" : "#d1ecf1",
            color: msg.includes("✅") ? "#155724" : 
                   msg.includes("❌") ? "#721c24" : 
                   msg.includes("⚠️") ? "#856404" : "#0c5460"
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
};

/*****************************************************************
 *  B U L K   V E R S I O N   E D I T O R   (full field list)
 *****************************************************************/
const ALL_FIELDS = [
  "versionTitle", "versionTitleInHebrew",
  "versionSource", "license", "status",        // locked = status:"locked"
  "priority", "digitizedBySefaria",
  "isPrimary", "isSource",
  "versionNotes", "versionNotesInHebrew",
  "purchaseInformationURL", "purchaseInformationImage",
  "direction"         // ltr / rtl  – rarely needed, but allowed
];

const BulkVersionEditor = () => {
  const [vtitle, setVtitle]   = useState("");
  const [lang,   setLang]     = useState("");
  const [indices, setIndices] = useState([]);
  const [pick,    setPick]    = useState(new Set());
  const [updates, setUpdates] = useState({});
  const [msg,     setMsg]     = useState("");

  /* ── helpers ──────────────────────────────────────────────── */
  const load = () =>
    $.getJSON(`/api/version-indices?versionTitle=${encodeURIComponent(vtitle)}&language=${lang}`,
      d => { setIndices(d.indices); setPick(new Set(d.indices)); }, // pre-select all
      xhr => setMsg(xhr.responseText));

  const toggleAll = () =>
    setPick(pick.size === indices.length ? new Set() : new Set(indices));

  const save = () =>
    $.ajax({
      url: "/api/version-bulk-edit",
      type: "POST",
      contentType: "application/json",
      data: JSON.stringify({
        versionTitle: vtitle, language: lang,
        indices: Array.from(pick), updates
      }),
      success: d => setMsg(`✅ Updated ${d.count} versions`),
      error:   x => setMsg(`❌ ${x.responseText}`)
    });

  /* ── UI ───────────────────────────────────────────────────── */
  return (
    <div className="modToolsSection">
      <div className="dlSectionTitle">Bulk Edit Version Metadata</div>

      {/* search bar */}
      <input  className="dlVersionSelect" placeholder="Version title"
              value={vtitle} onChange={e=>setVtitle(e.target.value)} />
      <select className="dlVersionSelect"
              value={lang} onChange={e=>setLang(e.target.value)}>
        <option value="">lang</option><option>he</option><option>en</option>
      </select>
      <button className="modtoolsButton" onClick={load}>Load</button>

      {/* index checklist */}
      {indices.length > 0 && (
        <>
          <label style={{display:"block",marginTop:"6px"}}>
            <input type="checkbox"
                   checked={pick.size===indices.length}
                   onChange={toggleAll}/> Select all
          </label>
          <div className="indicesList">
            {indices.map(t =>
              <label key={t}>
                <input type="checkbox"
                       checked={pick.has(t)}
                       onChange={e=>{
                         const s=new Set(pick);
                         e.target.checked ? s.add(t) : s.delete(t);
                         setPick(s);
                       }}/> {t}
              </label>)}
          </div>
        </>
      )}

      {/* field inputs */}
      {pick.size > 0 && (
        <>
          <div style={{marginTop:"8px"}}>Fields to change:</div>
          {ALL_FIELDS.map(f =>
            <input key={f} className="dlVersionSelect"
                   placeholder={f}
                   onChange={e=>{
                     const v=e.target.value;
                     setUpdates(u=>{
                       const n={...u}; v?n[f]=v:delete n[f]; return n;
                     });
                   }} />)}
          <button className="modtoolsButton"
                  disabled={!Object.keys(updates).length}
                  onClick={save}>Save</button>
        </>
      )}

      {msg && <div className="message">{msg}</div>}
    </div>
  );
};


export default ModeratorToolsPanel;