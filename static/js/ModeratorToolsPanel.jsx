const React      = require('react');
const PropTypes  = require('prop-types');
const Sefaria    = require('./sefaria/sefaria');
const $          = require('./sefaria/sefariaJquery');
import Component from 'react-class';


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
      uploadMessage: null
    };
  }
  handleFiles(event) {
    this.setState({files: event.target.files});
  }
  uploadFiles(event) {
    event.preventDefault();
    this.setState({uploading: true, uploadMessage:"Uploading..."});
    var formData = new FormData();
    for (var i = 0; i < this.state.files.length; i++) {
      var file = this.state.files[i];
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
    var args = ["format","title_pattern","version_title_pattern","language"].map(
        arg => this.state["bulk_" + arg]?`${arg}=${encodeURIComponent(this.state["bulk_"+arg])}`:""
    ).filter(a => a).join("&");
    return "download/bulk/versions/?" + args;
  }
  render () {
    // Bulk Download
    var dlReady = (this.state.bulk_format && (this.state.bulk_title_pattern || this.state.bulk_version_title_pattern));
    var downloadButton = <div className="versionDownloadButton">
        <div className="downloadButtonInner">
          <span className="int-en">Download</span>
          <span className="int-he">הורדה</span>
        </div>
      </div>;
    var downloadSection = (
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
    var ulReady = (!this.state.uploading) && this.state.files.length > 0;
    var uploadButton = <a><div className="versionDownloadButton" onClick={this.uploadFiles}><div className="downloadButtonInner">
       <span className="int-en">Upload</span>
       <span className="int-he">העלאה</span>
      </div></div></a>;
    var uploadForm = (
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

    return (Sefaria.is_moderator)?<div className="modTools">{downloadSection}{uploadForm}</div>:<div>Tools are only available to logged in moderators.</div>;
  }
}
ModeratorToolsPanel.propTypes = {
  interfaceLang: PropTypes.string
};


module.exports = ModeratorToolsPanel;
