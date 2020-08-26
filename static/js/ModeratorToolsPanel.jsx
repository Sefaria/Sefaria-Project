import React  from 'react';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import Component from 'react-class';
import Cookies from 'js-cookie';


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
    const downloadButton = <div className="versionDownloadButton">
        <div className="downloadButtonInner">
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
    const uploadButton = <a><div className="versionDownloadButton" onClick={this.uploadFiles}><div className="downloadButtonInner">
       <span className="int-en">Upload</span>
       <span className="int-he">העלאה</span>
      </div></div></a>;
    const uploadForm = (
      <div className="modToolsSection">
        <div className="dlSectionTitle">
          <span className="int-en">Bulk Upload CSV</span>
          <span className="int-he">הורדת הטקסט</span>
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
    return (Sefaria.is_moderator)?<div className="modTools">{downloadSection}{uploadForm}{wflowyUpl}</div>:<div>Tools are only available to logged in moderators.</div>;
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
                this.setState({uploading: false, error: true, errorIsHTML: true, uploadResult: resp_text});
            })
        }else{
            response.json().then(resp_json=>{
                console.log("okay response", resp_json);
                this.setState({uploading: false, error: false, uploadMessage:resp_json["data"]["message"], uploadResult: JSON.stringify(resp_json["data"]["index"])})
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
        <>
        <div className="dlSectionTitle">
          <span className="int-en">Workflowy Outline Upload</span>
          <span className="int-he">העלאת קובץ - workflowy</span>
        </div>
        <form id="wf-file-form" onSubmit={this.handleWfSubmit}>
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
                name="delims"
                type="text"
                value={this.state.delims}
                onChange={this.handleInputChange} />
            </label>
            <label>
              Optional Term Scheme Name:
              <input
                name="term_scheme"
                type="text"
                value={this.state.term_scheme}
                onChange={this.handleInputChange} />
            </label>
             <button className="versionDownloadButton" name="wf-submit" type="submit">
                <span className="int-en">Upload</span>
                <span className="int-he">Upload</span>
             </button>
         </form>
        <div id="wf-upl-msg" className="wf-upl-msg">{this.state.uploadMessage || ""}</div>
        { (this.state.error && this.state.errorIsHTML) ?
              <div id="wf-upl-message" className="wf-upl-message" dangerouslySetInnerHTML={{__html: this.state.uploadResult}}/> :
              <div id="wf-upl-message" className="wf-upl-message">{this.state.uploadResult}</div> }
        </>);
  }
}


export default ModeratorToolsPanel;
