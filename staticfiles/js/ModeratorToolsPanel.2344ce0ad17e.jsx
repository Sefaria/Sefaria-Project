import React  from 'react';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import Component from 'react-class';
import Cookies from 'js-cookie';
import { saveAs } from 'file-saver';
import qs from 'qs';
import { useState } from 'react';

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
          <span className={`${Sefaria.languageClassFont()}`}>{Sefaria._("text.download")}</span>
        </div>
      </div>;
    const downloadSection = (
      <div className="modToolsSection dlSection">
        <div className="dlSectionTitle">
          <span className={`${Sefaria.languageClassFont()}`}>Bulk Download Text</span>
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
       <span className={`${Sefaria.languageClassFont()}`}>{Sefaria._('Upload')}</span>
      </div></div></a>;
    const uploadForm = (
      <div className="modToolsSection">
        <div className="dlSectionTitle">
          <span className={`${Sefaria.languageClassFont()}`}>{Sefaria._('Bulk Upload CSV')}</span>
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
    return (Sefaria.is_moderator)?
        <div className="modTools"> {downloadSection}{uploadForm}{wflowyUpl}{uploadLinksFromCSV}{getLinks} </div> :
        <div className="modTools"> Tools are only available to logged in moderators.</div>;
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
          <span className={`${Sefaria.languageClassFont()}`}>{Sefaria._('Workflowy Outline Upload')}</span>
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
                <span className={`${Sefaria.languageClassFont()}`}>{Sefaria._("Upload")}</span>
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

export default ModeratorToolsPanel;
