import {
  InterfaceText,
  LoadingMessage,
  LoginPrompt,
} from './Misc';
import React from 'react';
import Button from './common/Button';
import ReactDOM from 'react-dom';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import Util from './sefaria/util';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import Component from 'react-class';
import sanitizeHtml  from 'sanitize-html';
import { SignUpModalKind } from './sefaria/signupModalContent';
import { GDocAdvertBox } from './Promotions';
import * as sheetsUtils from './sefaria/sheetsUtils'




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
      focusedSheetIndex: 0,
    };
    this.listboxRef = null;
    this.triggerRef = null;
    this.activeOptionRef = null;
  }
  componentDidMount() {
    this.loadSheets();
  }
  
  componentDidUpdate(prevProps, prevState) {
    if (!prevProps.srefs.compare(this.props.srefs) || prevProps.nodeRef !=this.props.nodeRef) {
      this.setState({showConfirm: false});
    }
    
    // Move focus to the listbox when opened, back to trigger when closed
    if (!prevState.sheetListOpen && this.state.sheetListOpen && this.listboxRef) {
      this.listboxRef.focus();
    } else if (prevState.sheetListOpen && !this.state.sheetListOpen && this.triggerRef) {
      this.triggerRef.focus();
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
        this.setState({selectedSheet: {title: "Your Sheet"}});
    } else {
      var sheets = Sefaria.sheets.userSheets(Sefaria._uid);
      if (!sheets.length) {
        this.setState({selectedSheet: {title: "Create a New Sheet"}});
      } else {
        this.setState({selectedSheet: sheets[0]});
      }
    }
  }

  toggleSheetList() {
    if (!Sefaria._uid) {
      this.props.toggleSignUpModal(SignUpModalKind.AddToSheet);
    } else {
      const opening = !this.state.sheetListOpen;
      let focusedSheetIndex = this.state.focusedSheetIndex;
      if (opening) {
        const sheets = Sefaria._uid ? Sefaria.sheets.userSheets(Sefaria._uid) : [];
        const selectedId = this.state.selectedSheet && this.state.selectedSheet.id;
        const idx = selectedId && sheets ? sheets.findIndex(s => s.id === selectedId) : 0;
        focusedSheetIndex = idx >= 0 ? idx : 0;
      }
      this.setState({sheetListOpen: opening, focusedSheetIndex});
    }
  }
  selectSheet(sheet) {
    this.setState({selectedSheet: sheet, sheetListOpen: false});
  }
  /**
   * Handles keyboard navigation within the sheet list (arrow keys, Home, End).
   * Updates the focused sheet index and scrolls it into view if needed.
   * @param {number} newIndex - The new index to focus
   */
  handleSheetListNavigate = (newIndex) => {
    this.setState({ focusedSheetIndex: newIndex }, () => {
      // Scroll the newly focused option into view if it's outside the visible area
      this.activeOptionRef && this.activeOptionRef.scrollIntoView({ block: 'nearest' });
    });
  }
  /**
   * Handles selection of a sheet when user presses Enter or Space.
   * Selects the currently focused sheet from the list.
   */
  handleSheetListSelect = () => {
    const sheets = Sefaria.sheets.userSheets(Sefaria._uid);
    if (sheets?.[this.state.focusedSheetIndex]) {
      this.selectSheet(sheets[this.state.focusedSheetIndex]);
    }
  }
  onClose = () => {
    this.setState({ sheetListOpen: false });
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

  //return the initial index of the suffix of string1 which also constitutes a prefix for string2
  longestSuffixPrefixIndex(string1, string2) {
    let longestSuffixIndex = 0;
    for (let i = 0; i < string1.length; i++){
      let suffix = string1.slice(i);
      if (string2.startsWith(suffix)) {
        longestSuffixIndex = i;
      }
    }
    return longestSuffixIndex;
  }
  //return the final index of the prefix of string1 which also constitutes a suffix for string2
  longestPrefixSuffixIndex(string1, string2) {
    let longestPrefixIndex = 0;
    for (let i = 0; i < string1.length; i++) {
      let prefix = string1.slice(0, i + 1);
      if (string2.endsWith(prefix)) {
        longestPrefixIndex = i + 1;
      }
    }
    return longestPrefixIndex;
  }

  normalize(text){
    return(text.replaceAll(/(<br\/>)+/g, ' ').replace(/\u2009/g, ' ').replace(/<[^>]*>/g, ''));
  }

  async postToSheet(source) {
    if (this.checkContentForImages(source.refs)) {
      const url     = "/api/sheets/" + this.state.selectedSheet.id + "/add";
      let postData = {source: JSON.stringify(source)};
      if (this.props.note) {
        postData.note = this.props.note;
      }
      await $.post(url, postData, this.confirmAdd);
    }
  }

  makeSourceForEden() {
    if (this.props.srefs) { //we are saving a ref + ref's text, generally all fields should be present.
      source.refs = this.props.srefs;
      source.en = this.props.en;
      source.he = this.props.he;
    } else { // an outside free text is being passed in. theoretically supports any interface that passes this in. In practice only legacy Gardens code.
      if (this.props.en && this.props.he) {
        source.outsideBiText = {he: this.props.he, en: this.props.en};
      } else {
        source.outsideText = this.props.en || this.props.he;
      }
    }
  }

  async handleSelectedWords(source, lan) {
    // If something is highlighted and main panel language is not bilingual:
    // Use passed in language to determine which version this highlight covers.
    let selectedWords = this.props.selectedWords; //if there was highlighted single panel
    const language = this.props.contentLanguage;
    if (!selectedWords || language === "bilingual") {
      return;
    }
    let segments = await sheetsUtils.getSegmentObjs(source.refs);
    selectedWords = this.normalize(selectedWords);
    segments = segments.map(segment => ({
      ...segment,
      [lan]: this.normalize(segment[lan])
    }));
    for (let iSegment = 0; iSegment < segments.length; iSegment++) {
        const segment = segments[iSegment];
        if (iSegment === 0){
          let criticalIndex = this.longestSuffixPrefixIndex(segment[lan], selectedWords);
          const ellipse = criticalIndex === 0 ? "" : "...";
          segment[lan] = ellipse + segment[lan].slice(criticalIndex);
        }
        else if (iSegment == segments.length-1){
          let criticalIndex = this.longestPrefixSuffixIndex(segment[lan], selectedWords);
          const ellipse = criticalIndex === segment[lan].length-1 ? "" : "...";
          const chunk = segment[lan].slice(0, criticalIndex)
          segment[lan] = chunk + ellipse;
        }
    }
    source[lan] = sheetsUtils.segmentsToSourceText(segments, lan);
  }

  async handleSameDirectionVersions() {
    for (const lang of ['he', 'en']) {
      const version = this.props.currObjectVersions[lang];
      const source = {
        refs: this.props.srefs,
        [`version-${version.language}`]: version.versionTitle
      }
      await this.postToSheet(source);
    }
  }

  async addToSourceSheet() {
    if (!Sefaria._uid) {
      this.props.toggleSignUpModal(SignUpModalKind.AddToSheet);
    }
    if (!this.state.selectedSheet || !this.state.selectedSheet.id) {
      return;
    }

    const source = {};
    let en, he;
    if (this.props.en || this.props.he) { // legacy code to support a call to this component in Gardens.
      this.makeSourceForEden();
    } else if (this.props.srefs) { //regular use - this is currently the case when the component is loaded in the sidepanel or in the modal component via profiles and notes pages
      source.refs = this.props.srefs;

      ({ en, he } = this.props.currObjectVersions || {"en": null, "he": null}); //the text we are adding may be non-default version
      if (en?.direction && en?.direction === he?.direction) {
        await this.handleSameDirectionVersions();
        return;
      } else if (en?.direction === 'rtl' || he?.direction === 'ltr') {
        ([en, he] = [he, en]);
      }

      if (he) { source["version-he"] = he.versionTitle; }
      if (en) { source["version-en"] = en.versionTitle; }
    }
    const contentLang = he?.language || en?.language; // this matters only if one language is shown.
    await this.handleSelectedWords(source, contentLang);
    await this.postToSheet(source);
  }
  checkContentForImages(refs) {
    // validate texts corresponding to refs have no images before posting them to sheet
    for (let i = 0; i < refs.length; i++) {
      let ref = Sefaria.getRefFromCache(refs[i]);
      if (ref && (Sefaria.isFullSegmentImage(ref.he) || Sefaria.isFullSegmentImage(ref.text))) {
        alert("We do not currently support adding images to source sheets.");
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
        "en": `${sheetTitle}, Section #${nodeID}`,
        "he": `${sheetTitle}, סעיף ${nodeID}`
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
    let sheetsList = Sefaria._uid && sheets ? sheets.map((sheet, i) => {
const isSelected = this.state.selectedSheet?.id === sheet.id;
      const isFocused = i === this.state.focusedSheetIndex;
      const classes = classNames({dropdownOption: 1, noselect: 1, selected: isSelected, focused: isFocused});
      const title = Sefaria.sheets.getSheetTitle(sheet?.title);
      const selectSheet = this.selectSheet.bind(this, sheet);
      return (
        <div
          className={classes}
          onClick={selectSheet}
          key={sheet.id}
          role="option"
          aria-selected={!!isSelected}
          id={`user-sheet-option-${i}`}
          data-index={i}
          ref={el => { if (isFocused) { this.activeOptionRef = el; } }}
        >
          {title}
        </div>
      );
    }) : (Sefaria._uid ? <LoadingMessage /> : null);

    // Uses
    return (
      <div className="addToSourceSheetBox noselect">
        <div className="addToSourceSheetBoxTitle sans-serif">
          <span className="int-en">Selected Citation</span>
          <span className="int-he">מקור להוספה</span>
        </div>
        <div className="selectedRef" role="status" aria-live="polite">
          <span className="en">{titleRef["en"]}</span>
          <span className="he">{titleRef["he"]}</span>
        </div>
        <div className="addToSourceSheetBoxTitle sans-serif">
          <span className="int-en">Add to</span>
          <span className="int-he">יעד להוספה</span>
        </div>
        <div className="dropdown">
          <Button
            size="fillwidth"
            className={`dropdownMain noselect ${this.state.sheetListOpen ? "open" : ""}`}
            onClick={this.toggleSheetList}
            aria-haspopup="listbox"
            aria-expanded={this.state.sheetListOpen}
            aria-controls="user-sheets-listbox"
            aria-label={Sefaria._("Select a sheet to add to")}
            ref={(el) => { this.triggerRef = el; }}
            onKeyDown={(e) => Util.handleDropdownTriggerKeyDown(e, {
              onToggle: this.toggleSheetList,
              isOpen: this.state.sheetListOpen
            })}
          >
            {this.state.sheetsLoaded ? Sefaria.sheets.getSheetTitle(this.state.selectedSheet?.title) : <LoadingMessage messsage="Loading your sheets..." heMessage="טוען את דפי המקורות שלך"/>}
          </Button>
          {this.state.sheetListOpen ?
          <div className="dropdownListBox noselect">
            <div
              className="dropdownList noselect"
              tabIndex="0"
              role="listbox"
              aria-label="Your sheets list"
              id="user-sheets-listbox"
              ref={(el) => { this.listboxRef = el; }}
              aria-activedescendant={`user-sheet-option-${Math.min(Math.max(this.state.focusedSheetIndex, 0), (sheets ? sheets.length - 1 : 0))}`}
              onKeyDown={(e) => Util.handleListboxKeyDown(e, {
                currentIndex: this.state.focusedSheetIndex,
                maxIndex: sheets ? sheets.length - 1 : 0,
                // Update focus when user navigates with arrow keys
                onNavigate: this.handleSheetListNavigate,
                // Select the focused sheet when user presses Enter or Space
                onSelect: this.handleSheetListSelect,
                onClose: this.onClose,
                triggerRef: this.triggerRef
              })}
            >
              {sheetsList}
            </div>
            <div className="newSheet noselect">
              <input className="newSheetInput noselect" placeholder={Sefaria._("Name New Sheet")} aria-label={Sefaria._("Name New Sheet")} type="text"/>
              <Button 
                size="small"
                className="fillWidth noselect" 
                onClick={this.createSheet} 
                activeModule={Sefaria.VOICES_MODULE}
                aria-label={Sefaria._("Create Sheet")}
              >
                <InterfaceText text={{en: "Create", he: "יצירה"}} />
              </Button>
             </div>
          </div>
          : null}
        </div>
        <Button size="fillwidth" className="noselect" onClick={this.props.nodeRef ? this.copyNodeToSourceSheet : this.addToSourceSheet} activeModule={Sefaria.VOICES_MODULE}>
          <InterfaceText text={{en: "Add to Sheet", he: "הוספה לדף המקורות"}} />
        </Button>
        {!this.props.hideGDocAdvert && <GDocAdvertBox/>}
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
        "en": `Section from "${sheetTitle}"`,
        "he": `הקטע מתוך  "${sheetTitle}"`,
      };
    }
    return (<div className="confirmAddToSheet addToSourceSheetBox">
              <div className="message">
                <span className="int-en">
                  <a href={sref} data-target-module={!!this.props.nodeRef ? Sefaria.VOICES_MODULE : Sefaria.LIBRARY_MODULE}>{srefTitles["en"]}</a>
                  &nbsp;has been added to&nbsp;
                   <a href={"/sheets/" + this.props.sheet.id} data-target-module={Sefaria.VOICES_MODULE}>{this.props.sheet.title}</a>.
                </span>
                <span className="int-he">
                  <a href={sref}>{srefTitles["he"]}</a>
                   &nbsp;נוסף בהצלחה לדף המקורות&nbsp;
                  <a href={"/sheets/" + this.props.sheet.id} data-target-module={Sefaria.VOICES_MODULE}>{this.props.sheet.title}</a>.
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
        <img src="/static/icons/circled-x.svg" className="closeButton" aria-hidden="true" alt={Sefaria._("Close")} onClick={this.close}/>
        {Sefaria._uid ? null : <span>
            In order to add this source to a sheet, please <a href={"/login" + nextParam}>log in.</a>
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
