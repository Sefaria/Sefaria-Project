const React                  = require('react');
const PropTypes              = require('prop-types');
const classNames             = require('classnames');
const Sefaria                = require('./sefaria/sefaria');
const $                      = require('./sefaria/sefariaJquery');
import Component             from 'react-class';


class VersionBlock extends Component {
  constructor(props) {
    super(props);
    this.updateableVersionAttributes = [
      "versionTitle",
      "versionSource",
      "versionNotes",
      "license",
      "priority",
      "digitizedBySefaria",
      "status",
      "versionTitleInHebrew",
      "versionNotesInHebrew"
    ];
    var s = {
      editing: false,
      error: null,
      originalVersionTitle: props.version["versionTitle"]
    };
    this.updateableVersionAttributes.forEach(attr => s[attr] = props.version[attr]);
    this.state = s;
  }
  onVersionTitleClick(e) {
    e.preventDefault();
    if (this.props.firstSectionRef) {
      window.location = `/${this.props.firstSectionRef}?v${this.props.version.language}=${this.props.version.versionTitle.replace(/\s/g,'_')}`;
    } else {
      const action = this.props.openVersionInSidebar ? this.props.openVersionInSidebar : this.props.openVersionInReader;
      if (action) {
        action(this.props.version.versionTitle, this.props.version.language);
      }
    }
  }
  onSelectVersionClick(e) {
    e.preventDefault();
    if (this.props.openVersionInReader) {
      this.props.openVersionInReader(this.props.version.versionTitle, this.props.version.language);
    }
  }
  onLicenseChange(event) {
    this.setState({license: event.target.value, "error": null});
  }
  onVersionSourceChange(event) {
    this.setState({versionSource: event.target.value, "error": null});
  }
  onVersionNotesChange(event) {
    this.setState({versionNotes: event.target.value, "error": null});
  }
  onVersionNotesInHebrewChange(event) {
    this.setState({versionNotesInHebrew: event.target.value, "error": null});
  }
  onPriorityChange(event) {
    this.setState({priority: event.target.value, "error": null});
  }
  onDigitizedBySefariaChange(event) {
    this.setState({digitizedBySefaria: event.target.checked, "error": null});
  }
  onLockedChange(event) {
    this.setState({status: event.target.checked ? "locked" : null, "error": null});
  }
  onVersionTitleChange(event) {
    this.setState({versionTitle: event.target.value, "error": null});
  }
  onVersionTitleInHebrewChange(event) {
    this.setState({versionTitleInHebrew: event.target.value, "error": null});
  }
  saveVersionUpdate(event) {
    var v = this.props.version;

    var payloadVersion = {};
    this.updateableVersionAttributes.forEach(function(attr) {
      if (this.state[attr] || this.state[attr] != this.props.version[attr]) {
        payloadVersion[attr] = this.state[attr];
      }
    }.bind(this));
    delete payloadVersion.versionTitle;
    if (this.state.versionTitle != this.state.originalVersionTitle) {
      payloadVersion.newVersionTitle = this.state.versionTitle;
    }
    this.setState({"error": "Saving.  Page will reload on success."});
    $.ajax({
      url: `/api/version/flags/${this.props.title}/${v.language}/${v.versionTitle}`,
      dataType: 'json',
      type: 'POST',
      data: {json: JSON.stringify(payloadVersion)},
      success: function(data) {
        if (data.status == "ok") {
          document.location.reload(true);
        } else {
          this.setState({error: data.error});
        }
      }.bind(this),
      error: function(xhr, status, err) {
        this.setState({error: err.toString()});
      }.bind(this)
    });
  }
  deleteVersion() {
    if (!confirm("Are you sure you want to delete this text version?")) { return; }

    var title = this.props.title;
    var url = "/api/texts/" + title + "/" + this.props.version.language + "/" + this.props.version.versionTitle;

    $.ajax({
      url: url,
      type: "DELETE",
      success: function(data) {
        if ("error" in data) {
          alert(data.error)
        } else {
          alert("Text Version Deleted.");
          window.location = "/" + Sefaria.normRef(title);
        }
      }
    }).fail(function() {
      alert("Something went wrong. Sorry!");
    });
  }
  openEditor() {
    this.setState({editing:true});
  }
  closeEditor() {
    this.setState({editing:false});
  }
  openExtendedNotes(e){
    e.preventDefault();
    this.props.viewExtendedNotes(this.props.title, this.props.version.language, this.props.version.versionTitle);
  }
  makeVersionLink(versionParam) {
    //versionParam - either version language (e.g. 'en') in the case when you're making a link for versions in reader
    //otherwise, 'side' for making link for versions in sidebar

    // maintain all versions for languages you're not currently selecting
    const nonSelectedVersionParams = versionParam !== "side" ? Object.keys(this.props.currVersions)
                                      .filter(vlang=>!!this.props.currVersions[vlang] && vlang !== this.props.version.language)
                                      .map(vlang=>`&v${vlang}=${this.props.currVersions[vlang].replace(/\s/g,'_')}`)
                                      .join("") : "";
    const versionLink = `/${(this.props.firstSectionRef ? Sefaria.normRef(this.props.firstSectionRef) : this.props.version.versionTitle)}${nonSelectedVersionParams}&v${versionParam}=${this.props.version.versionTitle.replace(/\s/g,'_')}`.replace("&","?");
    return versionLink;
  }
  render() {
    var v = this.props.version;

    if (this.state.editing) {
      // Editing View
      var close_icon = (Sefaria.is_moderator)?<i className="fa fa-times-circle" aria-hidden="true" onClick={this.closeEditor}/>:"";

      var licenses = Object.keys(this.props.getLicenseMap());
      licenses = licenses.includes(v.license) ? licenses : [v.license].concat(licenses);

      return (
        <div className = "versionBlock">
          <div className="error">{this.state.error}</div>
          <div className="versionEditForm">

            <label htmlFor="versionTitle" className="">Version Title</label>
            {close_icon}
            <input id="versionTitle" className="" type="text" value={this.state.versionTitle} onChange={this.onVersionTitleChange} />

            <label htmlFor="versionTitleInHebrew" className="">Hebrew Version Title</label>
            <input id="versionTitleInHebrew" className="" type="text" value={this.state.versionTitleInHebrew} onChange={this.onVersionTitleInHebrewChange} />

            <label htmlFor="versionSource">Version Source</label>
            <input id="versionSource" className="" type="text" value={this.state.versionSource} onChange={this.onVersionSourceChange} />

            <label id="license_label" htmlFor="license">License</label>
            <select id="license" className="" value={this.state.license} onChange={this.onLicenseChange}>
              {licenses.map(v => <option key={v} value={v}>{v?v:"(None Listed)"}</option>)}
            </select>

            <label id="digitzedBySefaria_label" htmlFor="digitzedBySefaria">Digitized by Sefaria</label>
            <input type="checkbox" id="digitzedBySefaria" checked={this.state.digitizedBySefaria} onChange={this.onDigitizedBySefariaChange}/>

            <label id="priority_label" htmlFor="priority">Priority</label>
            <input id="priority" className="" type="text" value={this.state.priority} onChange={this.onPriorityChange} />

            <label id="locked_label" htmlFor="locked">Locked</label>
            <input type="checkbox" id="locked" checked={this.state.status == "locked"} onChange={this.onLockedChange}/>

            <label id="versionNotes_label" htmlFor="versionNotes">VersionNotes</label>
            <textarea id="versionNotes" placeholder="Version Notes" onChange={this.onVersionNotesChange} value={this.state.versionNotes} rows="5" cols="40"/>

            <label id="versionNotesInHebrew_label" htmlFor="versionNotes_in_hebrew">Hebrew VersionNotes</label>
            <textarea id="versionNotesInHebrew" placeholder="Hebrew Version Notes" onChange={this.onVersionNotesInHebrewChange} value={this.state.versionNotesInHebrew} rows="5" cols="40"/>
            <div>
              <div id="delete_button" onClick={this.deleteVersion}>Delete Version</div>
              <div id="save_button" onClick={this.saveVersionUpdate}>SAVE</div>
              <div className="clearFix"></div>
            </div>
          </div>
        </div>
      );
    } else {
      // Presentation View
      var license = this.props.getLicenseMap()[v.license]?<a href={this.props.getLicenseMap()[v.license]} target="_blank">{Sefaria._(v.license)}</a>:v.license;
      var digitizedBySefaria = v.digitizedBySefaria
          ? <a className="versionDigitizedBySefaria" href="/digitized-by-sefaria">{Sefaria._("Digitized by Sefaria")}</a> : "";
      var licenseLine = "";
      if (v.license && v.license != "unknown") {
        licenseLine =
          <span className="versionLicense">
            {license}
            {digitizedBySefaria?" - ":""}{digitizedBySefaria}
          </span>
        ;
      }
      var edit_icon = (Sefaria.is_moderator)?<i className="fa fa-pencil" aria-hidden="true" onClick={this.openEditor}/>:"";

      var versionNotes = "";
      if (this.props.showNotes) {
        if (Sefaria.interfaceLang=="english" && !!(v.versionNotes)) {
          versionNotes = v.versionNotes;
        }
        else if (Sefaria.interfaceLang=="hebrew" && !!(v.versionNotesInHebrew)) {
          versionNotes = v.versionNotesInHebrew;
        }
      }

      const versionTitle = (Sefaria.interfaceLang=="english" || v.versionTitleInHebrew==="") ? v.versionTitle : v.versionTitleInHebrew;
      const selectButtonClasses = classNames({selectButton: 1, currSelectButton: this.props.isCurrent});

      const versionSidebarLink = this.makeVersionLink('sel');
      const versionReaderLink = this.makeVersionLink(this.props.version.language);
      return (
        <div className = "versionBlock">
          {!!this.props.openVersionInSidebar || !!this.props.openVersionInReader ?
            <div>
              <a className="versionTitle"
                href={versionReaderLink}
                onClick={this.onVersionTitleClick}>
                {versionTitle}
              </a>
              {edit_icon}
            </div> :
            <div className="versionTitle">
              {versionTitle}
            </div>
          }
          {versionNotes ? <div className="versionNotes">
            <span dangerouslySetInnerHTML={ {__html: versionNotes} } />
            {(this.props.version.extendedNotes || this.props.version.extendedNotesHebrew) ? <span className="extendedNotesLinks">
              &nbsp;<a onClick={this.openExtendedNotes} href={`/${this.props.title}/${this.props.version.language}/${this.props.version.versionTitle}/notes`}>
                {Sefaria.interfaceLang === "english" ? "Read More" : "קרא עוד"}
              </a>
            </span> : ""}
          </div> : ""}
          <div className="versionDetails">
            {!!this.props.openVersionInReader ?
              <a className={selectButtonClasses} href={versionSidebarLink} onClick={this.onSelectVersionClick}>
                {this.props.isCurrent ? Sefaria._("Current") : Sefaria._("Select")}
              </a> : null}
            {this.props.openVersionInReader ? <span className="separator">&#8226;</span>: null}
            <a className="versionSource" target="_blank" href={v.versionSource}>
            { Sefaria.util.parseURL(v.versionSource).host }
            </a>
            {licenseLine ? <span className="separator">&#8226;</span>: null}
            {licenseLine}
            {this.props.showHistory ? <span className="separator">&#8226;</span>: null}
            {this.props.showHistory ? <a className="versionHistoryLink" href={`/activity/${Sefaria.normRef(this.props.currentRef)}/${v.language}/${v.versionTitle && v.versionTitle.replace(/\s/g,"_")}`}>{Sefaria._("History") + " "}›</a>:""}
          </div>
        </div>
      );
    }

  }
}
VersionBlock.propTypes = {
  title:           PropTypes.string,
  version:         PropTypes.object.isRequired,
  currVersions:    PropTypes.object.isRequired,
  currentRef:      PropTypes.string,
  firstSectionRef: PropTypes.string,
  showHistory:     PropTypes.bool,
  showNotes:       PropTypes.bool,
  openVersionInSidebar: PropTypes.func,
  openVersionInReader: PropTypes.func,
  getLicenseMap:   PropTypes.func.isRequired,
  isCurrent:       PropTypes.bool,
  openVersion:     PropTypes.func,
  viewExtendedNotes: PropTypes.func,
};
VersionBlock.defaultProps = {
  showHistory: true,
  showNotes: true
};

module.exports = VersionBlock;
