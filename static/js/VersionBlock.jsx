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
      "versionNotesInHebrew",
      "purchaseInformationImage",
      "purchaseInformationURL",

    ];
    let s = {
      editing: false,
      error: null,
      originalVersionTitle: props.version["versionTitle"]
    };
    this.updateableVersionAttributes.forEach(attr => s[attr] = props.version[attr]);
    this.state = s;
  }
  onVersionTitleClick(e) {
    e.preventDefault();
    if (!this.props.openVersionInSidebar && !this.props.openVersionInReader) return;
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
  handleInputChange(event) {
    const target = event.target;
    const name = target.name;
    const value = target.type === 'checkbox' ? (name === "status" ? (target.checked ? "locked" : null) : target.checked ) : target.value;

    this.setState({
      [name]: value,
      error: null
    });
  }

  saveVersionUpdate(event) {
    const v = this.props.version;
    let payloadVersion = {};
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

    const title = this.props.title;
    const url = "/api/texts/" + title + "/" + this.props.version.language + "/" + this.props.version.versionTitle;

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
    if(Sefaria.is_moderator){
      this.setState({editing:true});
    }else{
      return;
    }
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
    if (this.props.version.merged) {
      return "#"; // there's no url for a merged version
    }
    const withParam = versionParam === 'side' ? "&with=Version Open" : "";
    const nonSelectedVersionParams = Object.keys(this.props.currVersions)
                                      .filter(vlang=>!!this.props.currVersions[vlang] && (versionParam === 'side' || vlang !== this.props.version.language))  // in 'side' case, keep all version params
                                      .map(vlang=>`&v${vlang}=${this.props.currVersions[vlang].replace(/\s/g,'_')}`)
                                      .join("");
    const versionLink = nonSelectedVersionParams == "" ? null : `/${Sefaria.normRef(this.props.currentRef)}${nonSelectedVersionParams}&v${versionParam}=${this.props.version.versionTitle.replace(/\s/g,'_')}${withParam}`.replace("&","?");
    return versionLink;
  }
  makeVersionTitle(){
    if(this.props.version.merged){
      return {"className": "", "text": Sefaria._("Merged from") + " " + Array.from(new Set(this.props.version.sources)).join(", ")};
    }else if(Sefaria.interfaceLang=="english" || !this.props.version.versionTitleInHebrew){
      return {"className":"", "text":this.props.version.versionTitle};
    }else{
      return {"className": "he", "text": this.props.version.versionTitleInHebrew};
    }
  }
  makeVersionNotes(){
    if(Sefaria.interfaceLang=="english" && !!this.props.version.versionNotes){
      return this.props.version.versionNotes;
    }else if(Sefaria.interfaceLang=="hebrew" && !!this.props.version.versionNotesInHebrew){
      return this.props.version.versionNotesInHebrew;
    }else{
      return null;
    }
  }
  makeLicenseLink(){
    const license_map = this.props.getLicenseMap();
    return (this.props.version.license in license_map) ? license_map[this.props.version.license] : "#";
  }
  makeSelectVersionLanguage(){
    const langMap = {
      "en": "Translation",
      "he" : "Version"
    }
    let voc = langMap[this.props.version.language] || "Translation";
    return this.props.isCurrent ? Sefaria._("Current " + voc) : Sefaria._("Select "+ voc);
  }
  makeDigitizedByLanguage(){
    if(this.props.version.digitizedBySefaria){
      return ["versions-box", "about-box"].includes(this.props.rendermode) ? Sefaria._("Sefaria") : Sefaria._("Digitized by Sefaria");
    }else {
      return "";
    }
  }
  hasExtendedNotes(){
    return !!(this.props.version.extendedNotes || this.props.version.extendedNotesHebrew);
  }
  makeAttrClassNames(extraClassNames, attrToExist = null, attrIsMultilingual = false){
    if(attrIsMultilingual && Sefaria.interfaceLang != "english"){
      attrToExist = attrToExist+"In"+Sefaria.interfaceLang.toFirstCapital();
    }
    return {...extraClassNames, "n-a": (attrToExist ? !this.props.version[attrToExist] : 0)}
  }
  makeImageLink(){
    return !!this.props.version.purchaseInformationURL ? this.props.version.purchaseInformationURL : this.props.version.versionSource;
  }
  makeImageSrc(){
    return (["versions-box", "about-box"].includes(this.props.rendermode) && !!this.props.version.purchaseInformationImage) ? this.props.version.purchaseInformationImage : "data:,";
  }

  render() {
    const v = this.props.version;
    const vtitle = this.makeVersionTitle();
    const vnotes = this.makeVersionNotes();

    if (this.state.editing && Sefaria.is_moderator) {
      // Editing View
      let close_icon = (Sefaria.is_moderator)?<i className="fa fa-times-circle" aria-hidden="true" onClick={this.closeEditor}/>:"";

      let licenses = Object.keys(this.props.getLicenseMap());
      licenses = licenses.includes(v.license) ? licenses : [v.license].concat(licenses);

      return (
        <div className = "versionBlock">
          <div className="error">{this.state.error}</div>
          <div className="versionEditForm">

            <label htmlFor="versionTitle" className="">Version Title</label>
            {close_icon}
            <input id="versionTitle" name="versionTitle" className="" type="text" value={this.state.versionTitle} onChange={this.handleInputChange} />

            <label htmlFor="versionTitleInHebrew" className="">Hebrew Version Title</label>
            <input id="versionTitleInHebrew" name="versionTitleInHebrew" className="" type="text" value={this.state.versionTitleInHebrew} onChange={this.handleInputChange} />

            <label htmlFor="versionSource">Version Source</label>
            <input id="versionSource" name="versionSource" className="" type="text" value={this.state.versionSource} onChange={this.handleInputChange} />

            <label id="license_label" htmlFor="license">License</label>
            <select id="license" name="license" className=""  value={this.state.license} onChange={this.handleInputChange}>
              {licenses.map(v => <option key={v} value={v}>{v?v:"(None Listed)"}</option>)}
            </select>

            <label id="digitzedBySefaria_label" htmlFor="digitzedBySefaria">Digitized by Sefaria</label>
            <input type="checkbox" id="digitzedBySefaria" name="digitizedBySefaria" checked={this.state.digitizedBySefaria} onChange={this.handleInputChange}/>

            <label id="priority_label" htmlFor="priority">Priority</label>
            <input id="priority" name="priority" className="" type="text" value={this.state.priority} onChange={this.handleInputChange} />

            <label id="locked_label" htmlFor="locked">Locked</label>
            <input type="checkbox" id="locked" name="status" checked={this.state.status == "locked"} onChange={this.handleInputChange}/>

            <label id="versionNotes_label" htmlFor="versionNotes">VersionNotes</label>
            <textarea id="versionNotes" name="versionNotes" placeholder="Version Notes" onChange={this.handleInputChange} value={this.state.versionNotes} rows="5" cols="40"/>

            <label id="versionNotesInHebrew_label" htmlFor="versionNotes_in_hebrew">Hebrew VersionNotes</label>
            <textarea id="versionNotesInHebrew" name="versionNotesInHebrew" placeholder="Hebrew Version Notes" onChange={this.handleInputChange} value={this.state.versionNotesInHebrew} rows="5" cols="40"/>
            <div>
              <h3>Purchase Information</h3>
              <label htmlFor="purchase_url">Buy URL (Link to Store Item):</label>
              <input id="purchase_url" name="purchaseInformationURL" className="" type="text" value={this.state.purchaseInformationURL}  onChange={this.handleInputChange} />
              <label htmlFor="purchase_image">Buy Image (Image to Display for Link)</label>
              <input id="purchase_image" name="purchaseInformationImage" className="" type="text" value={this.state.purchaseInformationImage} onChange={this.handleInputChange} />
            </div>
            <div>
              <div id="delete_button" onClick={this.deleteVersion}>Delete Version</div>
              <div id="save_button" onClick={this.saveVersionUpdate}>SAVE</div>
              <div className="clearFix"></div>
            </div>
          </div>
        </div>
      );
    }
    else {
      return (
        <div className = "versionBlock">
            <div className="versionTitle">
              <a className={vtitle["className"]} href={this.makeVersionLink('side')} onClick={this.onVersionTitleClick}>
                {vtitle["text"]}
              </a>
              <i className={`fa fa-pencil versionEditIcon ${(Sefaria.is_moderator && this.props.rendermode == "version-list") ? "enabled" : ""}`} aria-hidden="true" onClick={this.openEditor}/>
            </div>
            <div className="versionSelect">
              <a className={`selectButton ${this.props.isCurrent ? "currSelectButton": ""}`}
                   href={this.makeVersionLink(v.language)}
                   onClick={this.onSelectVersionClick}>
                  {this.makeSelectVersionLanguage()}
              </a>
            </div>
            <div className={classNames(this.makeAttrClassNames({"versionNotes": 1}, "versionNotes", true))}>
              <span className="" dangerouslySetInnerHTML={ {__html: vnotes} } />
              <span className={`versionExtendedNotesLinks ${this.hasExtendedNotes() ? "": "n-a"}`}>
                <a onClick={this.openExtendedNotes} href={`/${this.props.title}/${this.props.version.language}/${this.props.version.versionTitle}/notes`}>
                  {Sefaria._("Read More")}
                </a>
              </span>
            </div>
          { !v.merged ?
            <div className="versionDetails">
              <div className="versionDetailsInformation">
                <div className={classNames(this.makeAttrClassNames({"versionSource": 1, "versionDetailsElement": 1}, "versionSource"))}>
                  <span className="versionDetailsLabel">
                    {`${Sefaria._("Source")}: `}
                  </span>
                  <a className="versionDetailsLink" href={v.versionSource} target="_blank">
                    { Sefaria.util.parseURL(v.versionSource).host.replace("www.", "") }
                  </a>
                </div>
                <div className={classNames(this.makeAttrClassNames({"versionDigitizedBySefaria": 1, "versionDetailsElement": 1}, "digitizedBySefaria"))}>
                  <span className="versionDetailsLabel">
                    {`${Sefaria._("Digitization")}: `}
                  </span>
                  <a className="versionDetailsLink" href="/digitized-by-sefaria" target="_blank">
                    {this.makeDigitizedByLanguage()}
                  </a>
                </div>
                <div className={classNames(this.makeAttrClassNames({"versionLicense": 1, "versionDetailsElement": 1}, "license" ))}>
                  <span className="versionDetailsLabel">
                    {`${Sefaria._("License")}: `}
                  </span>
                  <a className="versionDetailsLink" href={this.makeLicenseLink()} target="_blank">
                    {Sefaria._(v.license)}
                  </a>
                </div>
                <div className={classNames(this.makeAttrClassNames({"versionHistoryLink": 1, "versionDetailsElement": 1}, null))}>
                   <a className="versionDetailsLink" href={`/activity/${Sefaria.normRef(this.props.currentRef)}/${v.language}/${v.versionTitle && v.versionTitle.replace(/\s/g,"_")}`} target="_blank">
                     {Sefaria._("Revision History")}
                   </a>
                </div>
                <div className={classNames(this.makeAttrClassNames({"versionBuyLink": 1, "versionDetailsElement": 1}, "purchaseInformationURL"))}>
                   <a className="versionDetailsLink" href={v.purchaseInformationURL} target="_blank">
                    {Sefaria._("Buy in Print")}
                   </a>
                </div>
              </div>
              <div className="versionDetailsImage">
                <div className={classNames(this.makeAttrClassNames({"versionBuyImage": 1, "versionDetailsElement": 1} , "purchaseInformationImage"))}>
                  <a className="versionDetailsLink versionDetailsImageLink" href={this.makeImageLink()} target="_blank">
                    <img className="versionImage" src={this.makeImageSrc()} alt={Sefaria._("Buy Now")} />
                  </a>
                </div>
              </div>
            </div> : null
          }
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
  sidebarDisplay: PropTypes.bool,
  rendermode:     PropTypes.string,
};
VersionBlock.defaultProps = {
  showHistory: true,
  showNotes: true,
  sidebarDisplay: false
};


module.exports = VersionBlock;


