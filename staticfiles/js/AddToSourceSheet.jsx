import {
  LoadingMessage,
  LoginPrompt,
} from './Misc';
import React from 'react';
import ReactDOM from 'react-dom';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import Component from 'react-class';
import sanitizeHtml  from 'sanitize-html';
import { SignUpModalKind } from './sefaria/signupModalContent';


class AddToSourceSheetBox extends Component {
  // In the main app, the function `addToSourceSheet` is executed in the ReaderApp,
  // and collects the needed data from highlights and app state.
  // It is used in external apps, liked gardens.  In those cases, it's wrapped in AddToSourceSheetWindow,
  // refs and text are passed directly, and the add to source sheets API is invoked from within this object.
  constructor(props) {
    super(props);

    this.state = {
      sheetsLoaded: false,
      selectedSheet: null,
      sheetListOpen: false,
      showConfirm: false,
      showLogin: false,
    };
  }
  componentDidMount() {
    this.loadSheets();
  }
  componentDidUpdate(prevProps, prevState) {
    if (!prevProps.srefs.compare(this.props.srefs) || prevProps.nodeRef !==this.props.nodeRef) {
      this.setState({showConfirm: false});
    }
  }
  loadSheets() {
    if (!Sefaria._uid) {
      this.onSheetsLoad();
    } else {
      Sefaria.sheets.userSheets(Sefaria._uid, this.onSheetsLoad);
    }
  }
  onSheetsLoad() {
    this.setDefaultSheet();
    this.setState({sheetsLoaded: true});
  }
  setDefaultSheet() {
    if (this.state.selectedSheet) { return; }
    if (!Sefaria._uid) {
        this.setState({selectedSheet: {title: Sefaria._( "sheet.your_sheet")}});
    } else {
      var sheets = Sefaria.sheets.userSheets(Sefaria._uid);
      if (!sheets.length) {
        this.setState({selectedSheet: {title: Sefaria._( "header.profileMenu.create_New_Sheet")}});
      } else {
        this.setState({selectedSheet: sheets[0]});
      }
    }
  }

  toggleSheetList() {
    if (!Sefaria._uid) {
      this.props.toggleSignUpModal(SignUpModalKind.AddToSheet);
    } else {
      this.setState({sheetListOpen: !this.state.sheetListOpen});
    }
  }
  selectSheet(sheet) {
    this.setState({selectedSheet: sheet, sheetListOpen: false});
  }
  copyNodeToSourceSheet() {
    if (!Sefaria._uid) {
      this.props.toggleSignUpModal(SignUpModalKind.AddToSheet);
    }
    if (!this.state.selectedSheet || !this.state.selectedSheet.id) { return; }
    if (!this.props.nodeRef) {
      this.props.addToSourceSheet(this.state.selectedSheet.id, this.confirmAdd);
    } else {
      const url     = "/api/sheets/" + this.state.selectedSheet.id + "/copy_source";
      $.post(url, {
          sheetID: this.props.nodeRef.split(".")[0],
          nodeID:this.props.nodeRef.split(".")[1]
      }, this.confirmAdd);
    }
  }
  addToSourceSheet() {
    if (!Sefaria._uid) {
      this.props.toggleSignUpModal(SignUpModalKind.AddToSheet);
    }
    if (!this.state.selectedSheet || !this.state.selectedSheet.id) { return; }
      const url     = "/api/sheets/" + this.state.selectedSheet.id + "/add";
      const language = this.props.contentLanguage;
      let source = {};
      if(this.props.en || this.props.he){ // legacy code to support a call to this component in Gardens.
        if(this.props.srefs){ //we are saving a ref + ref's text, generally all fields should be present.
          source.refs = this.props.srefs;
          source.en = this.props.en;
          source.he = this.props.he;
        }else{ // an outside free text is being passed in. theoretically supports any interface that passes this in. In practice only legacy Gardens code.
          if (this.props.en && this.props.he) {
            source.outsideBiText = {he: this.props.he, en: this.props.en};
          } else {
            source.outsideText = this.props.en || this.props.he;
          }
        }
      } else if (this.props.srefs) { //regular use - this is currently the case when the component is loaded in the sidepanel or in the modal component via profiles and notes pages
        source.refs = this.props.srefs;
        const { en, he } = this.props.currVersions ? this.props.currVersions : {"en": null, "he": null}; //the text we are adding may be non-default version
        if (he) { source["version-he"] = he; }
        if (en) { source["version-en"] = en; }

        // If something is highlighted and main panel language is not bilingual:
        // Use passed in language to determine which version this highlight covers.
        var selectedWords = this.props.selectedWords; //if there was highlighted single panel
        if (selectedWords && language !== "bilingual") {
          source[language.slice(0,2)] = selectedWords;
        }
      }
      if (this.checkContentForImages(source.refs)) {
        let postData = {source: JSON.stringify(source)};
        if (this.props.note) {
          postData.note = this.props.note;
        }
        $.post(url, postData, this.confirmAdd);
      }
  }
  checkContentForImages(refs) {
    // validate texts corresponding to refs have no images before posting them to sheet
    for (let i = 0; i < refs.length; i++) {
      let ref = Sefaria.getRefFromCache(refs[i]);
      if (ref && (Sefaria.isFullSegmentImage(ref.he) || Sefaria.isFullSegmentImage(ref.text))) {
        alert(Sefaria._( "sheet.message.do_not_support_adding_images_to_source_sheets"));
        return false;
      }
    }
    return true;
  }
  createSheet(refs) {
    const title = $(ReactDOM.findDOMNode(this)).find("input").val();
    if (!title) { return; }
    const sheet = {
      title: title,
      options: {numbered: 0},
      sources: []
    };
    let postJSON = JSON.stringify(sheet);
    $.post("/api/sheets/", {"json": postJSON}, function(data) {
      Sefaria.sheets.updateUserSheets(data, Sefaria._uid, false);
      this.selectSheet(data);
    }.bind(this));
  }
  confirmAdd() {
    if (this.props.srefs) {
      Sefaria.track.event("Tools", "Add to Source Sheet Save", this.props.srefs.join("/"));
    } else {
      Sefaria.track.event("Tools", "Add to Source Sheet Save", "Outside Source");
    }
    Sefaria.sheets.updateUserSheets(this.state.selectedSheet, Sefaria._uid, true);
    this.setState({showConfirm: true});
    const channel = new BroadcastChannel('refresh-editor');
    channel.postMessage("refresh");
  }
  makeTitleRef(){
    const refTitles = (this.props.srefs.length > 0 && (!this.props.srefs[0].startsWith("Sheet"))) ? {
      "en" : Sefaria.joinRefList(this.props.srefs, "en"),
      "he" : Sefaria.joinRefList(this.props.srefs, "he"),
    } : null;
    if(this.props.nodeRef){ //this whole if clause is ust to make sure that when a sheet is in the main panel, a human readable citation regarding the sheet is shown in the sheet box.
      const sheetID = parseInt(this.props.nodeRef.split(".")[0]);
      const nodeID = this.props.nodeRef.split(".")[1];
      const sheet = Sefaria.sheets.loadSheetByID(sheetID);
      const sheetTitle = sanitizeHtml(sheet.title, {
        allowedTags: [],
        disallowedTagsMode: 'discard',
      });
      let titleRetval = {
        "en": `${sheetTitle} ${Sefaria._("sheet.source_sheet.make_ref.section")}${nodeID}`,
        "he": `${sheetTitle} ${Sefaria._("sheet.source_sheet.make_ref.section")}${nodeID}`
      }
      if (refTitles){ //show the refs also of a source, just to be nice
        titleRetval["en"] += `(${refTitles["en"]})`;
        titleRetval["he"] += `(${refTitles["he"]})`;
      }
      return titleRetval;
    }else{
      return refTitles;
    }
  }
  render() {
    if (this.state.showConfirm) {
      return (<ConfirmAddToSheet sheet={this.state.selectedSheet} srefs={this.props.srefs} nodeRef={this.props.nodeRef}/>);
    } else if (this.state.showLogin) {
      return (<div className="addToSourceSheetBox sans-serif">
                <LoginPrompt />
              </div>);
    }
    const titleRef = this.makeTitleRef();
    const sheets     = Sefaria._uid ? Sefaria.sheets.userSheets(Sefaria._uid) : null;
    let sheetsList = Sefaria._uid && sheets ? sheets.map((sheet) => {
      let classes     = classNames({dropdownOption: 1, noselect: 1, selected: this.state.selectedSheet && this.state.selectedSheet.id === sheet.id});
      let title = sheet.title ? sheet.title.stripHtml() : Sefaria._("sheet.untitled_sourc_sheet");
      let selectSheet = this.selectSheet.bind(this, sheet);
      return (<div className={classes} onClick={selectSheet} key={sheet.id}>{title}</div>);
    }) : (Sefaria._uid ? <LoadingMessage /> : null);

    // Uses
    return (
      <div className="addToSourceSheetBox noselect">
        <div className="addToSourceSheetBoxTitle sans-serif">
          <span className={`${Sefaria.languageClassFont()}`}>{ Sefaria._("Selected Citation")}</span>
        </div>
        <div className="selectedRef">
          <span className="en">{titleRef["en"]}</span>
          <span className="he">{titleRef["he"]}</span>
        </div>
        <div className="addToSourceSheetBoxTitle sans-serif">
          <span className={`${Sefaria.languageClassFont()}`}>{ Sefaria._("sheet.add_to")} </span>
        </div>
        <div className="dropdown">
          <div className={`dropdownMain noselect ${this.state.sheetListOpen ? "open" : ""}`} onClick={this.toggleSheetList}>
            {this.state.sheetsLoaded ? (this.state.selectedSheet.title === null ? Sefaria._("sheet.untitled_sourc_sheet") : this.state.selectedSheet.title.stripHtml()) : <LoadingMessage messsage={Sefaria._("sheet.loading_sheet")}  heMessage={Sefaria._("sheet.loading_sheet")}/>}          </div>
          {this.state.sheetListOpen ?
          <div className="dropdownListBox noselect">
            <div className="dropdownList noselect">
              {sheetsList}
            </div>
            <div className="newSheet noselect">
              <input className="newSheetInput noselect" placeholder={Sefaria._("Name New Sheet")}/>
              <div className="button small noselect" onClick={this.createSheet} >
                <span className={`${Sefaria.languageClassFont()}`}>{ Sefaria._("common.create")}</span>
              </div>
             </div>
          </div>
          : null}
        </div>
        <div className="button noselect fillWidth" onClick={this.props.nodeRef ? this.copyNodeToSourceSheet : this.addToSourceSheet}>
          <span className={`${Sefaria.languageClassFont()} noselect`}>{ Sefaria._("sheet.add_to_sheet")}</span>
        </div>
      </div>);
  }
}
AddToSourceSheetBox.propTypes = {
  srefs:              PropTypes.array,
  fullPanel:          PropTypes.bool,
  en:                 PropTypes.string,
  he:                 PropTypes.string,
  note:               PropTypes.string
};


class ConfirmAddToSheet extends Component {
  render() {
    let sref = null;
    let srefTitles = {};
    if(!this.props.nodeRef){
      sref = `/${Sefaria.normRefList(this.props.srefs)}`;
      srefTitles = {
        "en": Sefaria.joinRefList(this.props.srefs, "en"),
        "he": Sefaria.joinRefList(this.props.srefs, "he"),
      };
    }else{
      sref = `/sheets/${this.props.nodeRef}`;
      let sheetTitle = sanitizeHtml(Sefaria.sheets.loadSheetByID(this.props.nodeRef.split(".")[0]).title, {
        allowedTags: [],
        disallowedTagsMode: 'discard',
      });
      srefTitles = {
        "en": `${Sefaria._("sheet.section_from", {sheetTitle: sheetTitle})}`,
        "he": `${Sefaria._("sheet.section_from",{sheetTitle: sheetTitle})}`,
      };
    }
    return (<div className="confirmAddToSheet addToSourceSheetBox">
              <div className="message">
                <span className={`${Sefaria.languageClassFont()}`}>
                  <a href={sref}>{srefTitles["he"]}</a>
                   &nbsp;
                  <a href={"/sheets/" + this.props.sheet.id} target="_blank">{Sefaria._("sheet.has_been_added_to", {sheetTitle: this.props.sheet.title})}</a>.
                </span>
              </div>
            </div>);
  }
}
ConfirmAddToSheet.propTypes = {
  srefs: PropTypes.array,
  nodeRef: PropTypes.string,
  sheet: PropTypes.object.isRequired
};


class AddToSourceSheetWindow extends Component {
  close () {
    if (this.props.close) {
      this.props.close();
    }
  }
  render () {
    var nextParam = "?next=" + encodeURIComponent(Sefaria.util.currentPath());

    return (<div className="addToSourceSheetModal">
      <div className="sourceSheetBoxTitle">
        <img src="/static/icons/circled-x.svg" className="closeButton" aria-hidden="true" alt="Close" onClick={this.close}/>
        {Sefaria._uid ? null : <span>
           {Sefaria._("sheet.message.login_before_add_source_sheet")} <a href={"/login" + nextParam}> {Sefaria._("common.log_in")} </a>
        </span>}
        <div className="clearFix"></div>
      </div>
      {Sefaria._uid ?
        <AddToSourceSheetBox
          srefs = {this.props.srefs}
          en = {this.props.en}
          he = {this.props.he}
          note = {this.props.note}
        /> : null }
      </div>);
  }
}
AddToSourceSheetWindow.propTypes = {
  srefs:        PropTypes.array,
  close:        PropTypes.func,
  en:           PropTypes.string,
  he:           PropTypes.string,
  note:         PropTypes.string,
};

export {
  AddToSourceSheetBox,
  AddToSourceSheetWindow,
};
Sefaria.AddToSourceSheetWindow = AddToSourceSheetWindow;
