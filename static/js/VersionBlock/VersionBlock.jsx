import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Sefaria from '../sefaria/sefaria';
import Util from '../sefaria/util';
import $ from '../sefaria/sefariaJquery';
import Component from 'react-class';
import {LoadingMessage} from "../Misc";
import VersionBlockHeader from "./VersionBlockHeader";
import VersionBlockSelectButton from "./VersionBlockSelectButton";
import VersionInformation from "./VersionInformation";
import VersionImage from "./VersionImage";
import VersionBlockWithPreview from "./VersionBlockWithPreview";

class VersionBlockUtils {
    static makeVersionTitle(version){
      if (version.merged) {
        return {"className" : "", "text": Sefaria._("Merged from") + " " + Array.from(new Set(version.sources)).join(", ")};
      } else if (Sefaria.interfaceLang === "english" || !version.versionTitleInHebrew) {
        return {"className" : "", "text" : version.versionTitle};
      } else {
        return {"className": "he", "text": version.versionTitleInHebrew};
      }
    }
    static makeVersionLink(currRef, version, currObjectVersions, mainPanel) {
      if (version.merged) {
        return "#"; // there's no url for a merged version
      }
      const withParam = mainPanel ? "" : "&with=Translation Open";
      const versionParam = mainPanel ? version.language : 'side';
      const nonSelectedVersionParams = Object.entries(currObjectVersions)
                                        .filter(([vlang, ver]) => !!ver && !!ver?.versionTitle && !version?.merged && (withParam || vlang === version.language))  // in 'side' case, keep all version params
                                        .map(([vlang, ver]) => `&v${vlang}=${ver.versionTitle.replace(/\s/g,'_')}`)
                                        .join("");
      const versionLink = nonSelectedVersionParams === "" ? null : `/${Sefaria.normRef(currRef)}${nonSelectedVersionParams}&v${versionParam}=${version.versionTitle.replace(/\s/g,'_')}${withParam}`.replace("&","?");
      return versionLink;
    }
    static makeAttrClassNames(version, extraClassNames, attrToExist = null, attrIsMultilingual = false){
      if(attrIsMultilingual && Sefaria.interfaceLang != "english"){
        attrToExist = attrToExist+"In"+Sefaria.interfaceLang.toFirstCapital();
      }
      return {...extraClassNames, "n-a": (attrToExist ? !version[attrToExist] : 0)};
    }
    static openVersionInSidebar(currRef, version, currObjectVersions, openVersionInSidebar, e) {
      e.preventDefault();
      try {
        gtag("event", "onClick_version_title", {element_name: `version_title`,
            change_to: `${version.versionTitle}`, change_from: `${currObjectVersions[version.language]['versionTitle']}`,
            categories: `${Sefaria.refCategories(currRef)}`, book: `${Sefaria.parseRef(currRef).index}` })
      }
      catch(err) {
        console.log(err);
      }
      openVersionInSidebar(version.versionTitle, version.language);
  }
  static openVersionInMainPanel(currRef, version, currObjectVersions, renderMode, firstSectionRef, openVersionInReader, e) {
      e.preventDefault();
      try {
        gtag("event", "onClick_select_version", {element_name: `select_version`,
        change_to: `${version.versionTitle}`, change_from: `${currObjectVersions[version.language]['versionTitle']}`,
        categories: `${Sefaria.refCategories(currRef)}`, book: `${Sefaria.parseRef(currRef).index}` })
      }
      catch(err) {
        console.log(err);
      }
      if (renderMode === 'book-page') {
          let urlVersionTitle = encodeURIComponent(version.versionTitle.replace(/\s/g,'_'));
          const language = (version.isPrimary) ? 'he' : 'en';
          window.location = `/${firstSectionRef}?v${language}=${version.languageFamilyName}|${urlVersionTitle}`;
      } else {
          const language = (renderMode === 'translation') ? 'en' : 'he';
          openVersionInReader(version.versionTitle, language, version.languageFamilyName);
      }
      const pseudoLang = !version.isSource ? 'en' : 'he';
      Sefaria.setVersionPreference(currRef, version.versionTitle, pseudoLang);
  }
}

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
      "direction",
      "isSource",
      "isPrimary",
      "versionTitleInHebrew",
      "shortVersionTitle",
      "shortVersionTitleInHebrew",
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
    const title = v.title.replace(/\?/g, "%3F");
    $.ajax({
      url: `/api/version/flags/${title}/${v.language}/${v.versionTitle}`,
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

    const url = "/api/texts/" + this.props.version.title + "/" + this.props.version.language + "/" + this.props.version.versionTitle;

    $.ajax({
      url: url,
      type: "DELETE",
      success: function(data) {
        if ("error" in data) {
          alert(data.error)
        } else {
          alert("Text Version Deleted.");
          window.location = "/" + Sefaria.normRef(this.props.version.title);
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
    this.props.viewExtendedNotes(this.props.version.title, this.props.version.language, this.props.version.versionTitle, this.props.version.languageFamilyName);
  }
  makeVersionNotes(){
    if (!this.props.showNotes) {
      return null;
    }
    if(Sefaria.interfaceLang=="english" && !!this.props.version.versionNotes){
      return this.props.version.versionNotes;
    }else if(Sefaria.interfaceLang=="hebrew" && !!this.props.version.versionNotesInHebrew){
      return this.props.version.versionNotesInHebrew;
    }else{
      return null;
    }
  }
  makeSelectVersionLanguage(){
    let voc = this.props.version.isSource ? 'Version' : "Translation";
    return this.props.isCurrent ? Sefaria._("Current " + voc) : Sefaria._("Select "+ voc);
  }

  hasExtendedNotes(){
    return !!(this.props.version.extendedNotes || this.props.version.extendedNotesHebrew);
  }

  render() {
    if(this.props.version.title == "Sheet") return null //why are we even getting here in such a case??;
    const v = this.props.version;
    const vtitle = VersionBlockUtils.makeVersionTitle(v);
    const vnotes = this.makeVersionNotes();
    const showLanguagLabel = this.props.rendermode == "book-page";
    const openVersionInSidebar = VersionBlockUtils.openVersionInSidebar.bind(null, this.props.currentRef, this.props.version,
        this.props.currObjectVersions, this.props.openVersionInSidebar);
    const openVersionInMainPanel = VersionBlockUtils.openVersionInMainPanel.bind(null, this.props.currentRef,
        this.props.version, this.props.currObjectVersions, this.props.rendermode, this.props.firstSectionRef, this.props.openVersionInReader);

    if (this.state.editing && Sefaria.is_moderator) {
      // Editing View
      let close_icon = (Sefaria.is_moderator)?<i className="fa fa-times-circle" aria-hidden="true" onClick={this.closeEditor}/>:"";

      let licenses = [...Object.keys(Sefaria.getLicenseMap()), ""];
      licenses = licenses.includes(v.license) ? licenses : [v.license].concat(licenses);
      if (!!this.state.error) {
        alert(this.state.error);
      }

      return (
        <div className = "versionBlock">
          <div className="error">{this.state.error}</div>
          <div className="versionEditForm">

            <label htmlFor="versionTitle" className="">Version Title</label>
            {close_icon}
            <input id="versionTitle" name="versionTitle" className="" type="text" value={this.state.versionTitle} onChange={this.handleInputChange}/>

            <label htmlFor="versionTitleInHebrew" className="">Hebrew Version Title</label>
            <input id="versionTitleInHebrew" name="versionTitleInHebrew" className="" type="text" value={this.state.versionTitleInHebrew} onChange={this.handleInputChange}/>

            <label htmlFor="shortVersionTitle" className="">Short Version Title</label>
            <input id="shortVersionTitle" name="shortVersionTitle" className="" type="text" value={this.state.shortVersionTitle} onChange={this.handleInputChange}/>

            <label htmlFor="shortVersionTitleInHebrew" className="">Short Hebrew Version Title</label>
            <input id="shortVersionTitleInHebrew" name="shortVersionTitleInHebrew" className="" type="text" value={this.state.shortVersionTitleInHebrew} onChange={this.handleInputChange}/>

            <label htmlFor="versionSource">Version Source</label>
            <input id="versionSource" name="versionSource" className="" type="text" value={this.state.versionSource} onChange={this.handleInputChange}/>

            <label id="license_label" htmlFor="license">License</label>
            <select id="license" name="license" className="" value={this.state.license} onChange={this.handleInputChange}>
              {licenses.map(v => <option key={v} value={v}>{v ? v : "(None Listed)"}</option>)}
            </select>

            <label id="direction_label" htmlFor="direction">Direction</label>
            <select id="direction" name="direction" className="" value={this.state.direction} onChange={this.handleInputChange}>
              <option value="ltr">Left to Right</option>
              <option value="rtl">Right to Left</option>
            </select>

            <label id="isSource_label" htmlFor="isSource">isSource</label>
            <input type="checkbox" id="isSource" name="isSource" checked={this.state.isSource} onChange={this.handleInputChange}/>

            <label id="isPrimary_label" htmlFor="isPrimary">isPrimary</label>
            <input type="checkbox" id="isPrimary" name="isPrimary" checked={this.state.isPrimary} onChange={this.handleInputChange}/>

            <label id="digitzedBySefaria_label" htmlFor="digitzedBySefaria">Digitized by Sefaria</label>
            <input type="checkbox" id="digitzedBySefaria" name="digitizedBySefaria" checked={this.state.digitizedBySefaria} onChange={this.handleInputChange}/>

            <label id="priority_label" htmlFor="priority">Priority</label>
            <input id="priority" name="priority" className="" type="text" value={this.state.priority} onChange={this.handleInputChange}/>

            <label id="locked_label" htmlFor="locked">Locked</label>
            <input type="checkbox" id="locked" name="status" checked={this.state.status == "locked"} onChange={this.handleInputChange}/>

            <label id="versionNotes_label" htmlFor="versionNotes">VersionNotes</label>
            <textarea id="versionNotes" name="versionNotes" placeholder="Version Notes" onChange={this.handleInputChange} value={this.state.versionNotes} rows="5" cols="40"/>

            <label id="versionNotesInHebrew_label" htmlFor="versionNotes_in_hebrew">Hebrew VersionNotes</label>
            <textarea id="versionNotesInHebrew" name="versionNotesInHebrew" placeholder="Hebrew Version Notes" onChange={this.handleInputChange} value={this.state.versionNotesInHebrew} rows="5" cols="40"/>
            <div>
              <h3>Purchase Information</h3>
              <label htmlFor="purchase_url">Buy URL (Link to Store Item):</label>
              <input id="purchase_url" name="purchaseInformationURL" className="" type="text" value={this.state.purchaseInformationURL} onChange={this.handleInputChange}/>
              <label htmlFor="purchase_image">Buy Image (Image to Display for Link)</label>
              <input id="purchase_image" name="purchaseInformationImage" className="" type="text" value={this.state.purchaseInformationImage} onChange={this.handleInputChange}/>
            </div>
            <div>
              <div id="delete_button" onClick={this.deleteVersion}>Delete Version</div>
              <div id="save_button" onClick={this.saveVersionUpdate}>SAVE</div>
              <div className="clearFix"></div>
            </div>
          </div>
        </div>
      );
    } else {
      return (
          <div className="versionBlock">
            <div className="versionBlockHeading">
              <div className="versionTitle" role="heading">
              <VersionBlockHeader
                    text={vtitle["text"]}
                    onClick={this.props.rendermode === 'book-page' ? openVersionInMainPanel : openVersionInSidebar}
                  renderMode='versionTitle'
                  link={VersionBlockUtils.makeVersionLink(this.props.currentRef, this.props.version,
                      this.props.currObjectVersions, this.props.rendermode === 'book-page')}
                 />
              </div>
              <i className={`fa fa-pencil versionEditIcon ${(Sefaria.is_moderator && this.props.rendermode == "book-page") ? "enabled" : ""}`} aria-hidden="true" onClick={this.openEditor}/>
              <div className="versionLanguage sans-serif">{showLanguagLabel ? Sefaria._(Sefaria.translateISOLanguageCode(v.actualLanguage)) : ""}</div>
            </div>
            <div className="versionSelect sans-serif">
              <VersionBlockSelectButton
                   isSelected={this.props.isCurrent}
                   openVersionInMainPanel={openVersionInMainPanel}
                   text={this.makeSelectVersionLanguage()}
                   link={VersionBlockUtils.makeVersionLink(this.props.currentRef, this.props.version,
                      this.props.currObjectVersions, true)}
             />
            </div>
            <div className={classNames(VersionBlockUtils.makeAttrClassNames(v, {"versionNotes": 1, "sans-serif": (this.props.rendermode == "book-page")}, "versionNotes", true))}>
              <span className="" dangerouslySetInnerHTML={ {__html: vnotes} } />
              <span className={`versionExtendedNotesLinks ${this.hasExtendedNotes() ? "": "n-a"}`}>
                <a onClick={this.openExtendedNotes} href={`/${this.props.version.title}/${this.props.version.language}/${this.props.version.versionTitle}/notes`}>
                  {Sefaria._("Read More")}
                </a>
              </span>
            </div>
          { !v.merged ?
            <div className="versionDetails sans-serif">
              <VersionInformation currentRef={this.props.currentRef} version={v}/>
              <VersionImage version={v}/>
            </div> : null
          }
        </div>
      );
    }
  }
}
VersionBlock.propTypes = {
  version:                PropTypes.object.isRequired,
  currObjectVersions:     PropTypes.object.isRequired,
  currentRef:             PropTypes.string,
  firstSectionRef:        PropTypes.string,
  showHistory:            PropTypes.bool,
  showNotes:              PropTypes.bool,
  openVersionInSidebar:   PropTypes.func,
  openVersionInReader:    PropTypes.func,
  isCurrent:              PropTypes.bool,
  viewExtendedNotes:      PropTypes.func,
  sidebarDisplay:         PropTypes.bool,
  rendermode:             PropTypes.string,
  inTranslationBox:          PropTypes.bool,
};
VersionBlock.defaultProps = {
  showHistory: true,
  showNotes: true,
  sidebarDisplay: false
};

class VersionsBlocksList extends Component{
  constructor(props) {
    super(props);
    this.state = {
      currentKeys: this.getCurrentVersionsKeys(this.props.currObjectVersions),
    }
  }
  sortVersions(prioritize=null){
    //sorts the languages of the available versions
    const standard_langs = ["en", "he"];
    //const activeLanguages = Object.values(this.props.currObjectVersions).map(({actualLanguage}) => actualLanguage);
    return Object.keys(this.props.versionsByLanguages).sort(
      (a, b) => {
        if      (!!prioritize && a === prioritize)                {return -1;}
        else if (!!prioritize && b === prioritize)                {return 1;}
        /*else if (a in standard_langs && !(b in standard_langs))   {return -1;}
        else if (b in standard_langs && !(a in standard_langs))   {return  1;}
        else if (this.props.activeLanguages.includes(a))          {return -1;}
        else if (this.props.activeLanguages.includes(b))          {return  1;}*/
        else if (a < b)                                           {return -1;}
        else if (b < a)                                           {return  1;}
        else                                                      {return  0;}
      }
    );
  }
  componentDidMount() {
    this.updateCurrentVersionKeys();
  }
  componentDidUpdate(prevProps, prevState) {
    if (!Sefaria.util.object_equals(this.props.currObjectVersions, prevProps.currObjectVersions)) {
      this.updateCurrentVersionKeys();
    }
  }
  updateCurrentVersionKeys() {
    this.setState({currentKeys : this.getCurrentVersionsKeys(this.props.currObjectVersions)});
  }
  isVersionCurrent(version){
    //make versions string key and check if that key is in the current keys array (hashing for morons)
    const {actualLanguage, versionTitle} = version;
    return this.state.currentKeys.includes(`${actualLanguage}|${versionTitle}`);
  }
  getCurrentVersionsKeys(currentVersions){
    //make an array of strings that are keys of the current versions
    return Object.values(currentVersions).map((v) => !!v ? `${v.actualLanguage}|${v.versionTitle}` : "");
  }
  render(){
      const sortedLanguages = this.sortVersions(this.props.sortPrioritizeLanugage);
      if (!Object.keys(this.props.versionsByLanguages).length) {
        return (
          <div className="versionsBox">
            <LoadingMessage />
          </div>
        );
      }
      return (
        <div className="versionsBox">
          {
            sortedLanguages.map((lang) => (
              <div className="language-block" key={lang}>
                { this.props.showLanguageHeaders ?
                  <div className="versionLanguage sans-serif">
                    {Sefaria._(Sefaria.translateISOLanguageCode(lang))}<span className="enInHe connectionsCount">{` (${this.props.versionsByLanguages[lang].length})`}</span>
                  </div>
                    :
                    null
                }
                {
                  this.props.versionsByLanguages[lang].map((v) => (
                        this.props.inTranslationBox ?
                            <VersionBlockWithPreview
                                currentRef={this.props.currentRef}
                                version={v}
                                currObjectVersions={this.props.currObjectVersions}
                                openVersionInReader={this.props.openVersionInReader}
                                openVersionInSidebar={this.props.openVersionInSidebar}
                                isSelected={this.isVersionCurrent(v)}
                                srefs={this.props.srefs}
                                onRangeClick={this.props.onRangeClick}
                            /> :
                            <VersionBlock
                                rendermode="versions-box"
                                sidebarDisplay={true}
                                version={v}
                                currObjectVersions={this.props.currObjectVersions}
                                currentRef={this.props.currentRef}
                                firstSectionRef={"firstSectionRef" in v ? v.firstSectionRef : null}
                                key={`${this.isVersionCurrent(v) ? "current" : ""}|${v.versionTitle}|${v.actualLanguage}`}
                                openVersionInReader={this.props.openVersionInReader}
                                openVersionInSidebar={this.props.openVersionInSidebar}
                                viewExtendedNotes={this.props.viewExtendedNotes}
                                isCurrent={this.isVersionCurrent(v)}
                                inTranslationBox={this.props.inTranslationBox}
                                showNotes={this.props.showNotes}
                            />
                      ))
                }
              </div>
            ))
          }
        </div>
      );
    }
}
VersionsBlocksList.propTypes={
  versionsByLanguages: PropTypes.object.isRequired,
  currObjectVersions: PropTypes.object,
  displayCurrentVersions: PropTypes.bool,
  sortPrioritizeLanugage: PropTypes.string,
  currentRef: PropTypes.string,
  openVersionInReader: PropTypes.func,
  openVersionInSidebar: PropTypes.func,
  viewExtendedNotes: PropTypes.func,
  showLanguageHeaders: PropTypes.bool,
  inTranslationBox: PropTypes.bool,
  showNotes: PropTypes.bool,
  srefs: PropTypes.array,
  onRangeClick: PropTypes.func,
};
VersionsBlocksList.defaultProps = {
  displayCurrentVersions: true,
  showLanguageHeaders: true,
};



export {VersionBlock as default, VersionsBlocksList, VersionBlockUtils};
