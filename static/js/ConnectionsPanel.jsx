const {
  Dropdown,
  LoadingMessage,
  LoginPrompt,
  LanguageToggleButton,
  ReaderNavigationMenuCloseButton,
  Note,
  FeedbackBox,
}                            = require('./Misc');
const {
  CategoryFilter,
}                            = require('./ConnectionFilters');
const React                  = require('react');
const PropTypes              = require('prop-types');
const ReactDOM               = require('react-dom');
const Sefaria                = require('./sefaria/sefaria');
const $                      = require('./sefaria/sefariaJquery');
const TextRange              = require('./TextRange');
const TextList               = require('./TextList');
const ConnectionsPanelHeader = require('./ConnectionsPanelHeader');
const AddToSourceSheetBox    = require('./AddToSourceSheetBox');
const LexiconBox             = require('./LexiconBox');
const AboutBox               = require('./AboutBox');
const VersionsBox            = require('./VersionsBox');
const ExtendedNotes          = require('./ExtendedNotes');
const classNames             = require('classnames');
import Component             from 'react-class';



class ConnectionsPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      flashMessage: null,
      currObjectVersions: {en: null, he: null},
      mainVersionLanguage: props.masterPanelLanguage === "bilingual" ? "hebrew" : props.masterPanelLanguage,
      linksLoaded: false, // has the list of refs been loaded
    };
  }
  componentDidMount() {
    this._isMounted = true;
    this.loadData();
    this.getCurrentVersions();
  }
  componentWillUnmount() {
    this._isMounted = false;
  }
  componentDidUpdate(prevProps, prevState) {
    if (!prevProps.srefs.compare(this.props.srefs)) {
      this.loadData();
    }
    // Turn on the lexicon when receiving new words if they are less than 3
    // and don't span refs.
    if (!prevProps.selectedWords &&
        this.props.selectedWords &&
        this.props.selectedWords.match(/[\s:\u0590-\u05ff.]+/) &&
        this.props.selectedWords.split(" ").length < 3 &&
        this.props.srefs.length == 1) {
      this.props.setConnectionsMode("Lexicon");
    }
    // Go back to main sidebar when words are unselected
    if (prevProps.selectedWords && prevProps.mode === "Lexicon" && !this.props.selectedWords) {
      this.props.setConnectionsMode("Resources");
    }

    if (prevProps.currVersions.en     !== this.props.currVersions.en     ||
        prevProps.currVersions.he     !== this.props.currVersions.he     ||
        prevProps.masterPanelLanguage !== this.props.masterPanelLanguage ||
        prevProps.srefs[0]            !== this.props.srefs[0]) {
      this.getCurrentVersions();
    }
  }
  sectionRef() {
    return Sefaria.sectionRef(Sefaria.humanRef(this.props.srefs)) || this.props.srefs;
  }
  loadData() {
    var ref = this.sectionRef();
    if (!Sefaria.related(ref)) {
        Sefaria.related(ref, function (data) {
            if (this._isMounted) {
                this.setState({
                  linksLoaded: true,
                });
            }
        }.bind(this));
    }
    else {
        this.setState({
          linksLoaded: true,
        });
    }
  }
  reloadData() {
    this.setState({
      linksLoaded: false,
    });
    Sefaria.clearLinks();
    this.loadData();
  }
  flashMessage(msg) {
    this.setState({flashMessage: msg});
    setTimeout(function() {
      this.setState({flashMessage: null});
    }.bind(this), 3000);
  }
  onSave() {
    this.reloadData();
    this.props.setConnectionsMode("Resources");
    this.flashMessage("Success! You've created a new connection.");
  }
  getDataRef(props) {
    // Returns ref to be used to looking up data
    const secRef = Sefaria.sectionRef(props.srefs[0]);
    if (!secRef) {
      console.log("Sec ref is null for", props.srefs[0]);
    }
    return secRef || props.srefs[0];
  }
  getData(cb) {
    // Gets data about this text from cache, which may be null.
    return Sefaria.text(this.props.srefs[0], {context: 1, enVersion: this.props.currVersions.en, heVersion: this.props.currVersions.he}, cb);
  }
  getVersionFromData(d, lang) {
    //d - data received from this.getData()
    //language - the language of the version
    return {
      language:               lang,
      versionTitle:           lang == "he" ? d.heVersionTitle : d.versionTitle,
      versionSource:          lang == "he" ? d.heVersionSource : d.versionSource,
      versionStatus:          lang == "he" ? d.heVersionStatus : d.versionStatus,
      license:                lang == "he" ? d.heLicense : d.license,
      sources:                lang == "he" ? d.heSources : d.sources,
      versionNotes:           lang == "he" ? d.heVersionNotes : d.versionNotes,
      digitizedBySefaria:     lang == "he" ? d.heDigitizedBySefaria : d.digitizedBySefaria,
      versionTitleInHebrew:   lang == "he" ? d.heVersionTitleInHebrew : d.versionTitleInHebrew,
      versionNotesInHebrew:   lang == "he" ? d.heVersionNotesInHebrew : d.versionNotesInHebrew,
      extendedNotes:          lang == "he" ? d.extendedNotesHebrew : d.extendedNotes,
      merged:                 lang == "he" ? !!d.heSources : !!d.sources,
    }
  }
  getCurrentVersions() {
      const data = this.getData((data) => {
          let currentLanguage = this.props.masterPanelLanguage;
          if (currentLanguage == "bilingual") {
              currentLanguage = "hebrew"
          }
          if (!data || data.error) {
              this.setState({
                  currObjectVersions: {en: null, he: null},
                  mainVersionLanguage: currentLanguage,
              });
              return
          }
          if (currentLanguage == "hebrew" && !data.he.length) {
              currentLanguage = "english"
          }
          if (currentLanguage == "english" && !data.text.length) {
              currentLanguage = "hebrew"
          }
          this.setState({
              currObjectVersions: {
                  en: (this.props.masterPanelLanguage != "hebrew" && !!data.text.length) ? this.getVersionFromData(data, "en") : null,
                  he: (this.props.masterPanelLanguage != "english" && !!data.he.length) ? this.getVersionFromData(data, "he") : null,
              },
              mainVersionLanguage: currentLanguage,
          });
      });
  }

  checkSrefs(srefs) {
    // Mostly exists for properly displaying Ranging refs in TextList on page loads and on sheets
    if (typeof(srefs) == "object" && srefs.length == 1) {
      srefs = Sefaria.splitRangingRef(srefs[0]);
    }
    return(srefs)
  }
  showSheetNodeConnectionTools(ref,mode) {
      var dontShowModes = ["Share","Feedback","Sheets"];
      if (ref.indexOf("Sheet") !== -1 && !dontShowModes.includes(mode) ) {
          return true
      }

      else {
          return false
      }

  }

  render() {
    var content = null;
    if (!this.state.linksLoaded) {
      content = <LoadingMessage />;
    } else if (this.showSheetNodeConnectionTools(this.props.srefs, this.props.mode)) {
      content = (<div>
                    <SheetNodeConnectionTools
                    multiPanel={this.props.multiPanel}
                    setConnectionsMode={this.props.setConnectionsMode}
                    openComparePanel={this.props.openComparePanel}
                    srefs={this.props.srefs}
                    nodeRef = {this.props.nodeRef}
                    />
                 </div>);
    } else if (this.props.mode == "Resources") {
      content = (<div>
                  { this.state.flashMessage ?
                    <div className="flashMessage sans">{this.state.flashMessage}</div>
                    : null }
                  <ConnectionsSummary
                    srefs={this.props.srefs}
                    showBooks={false}
                    multiPanel={this.props.multiPanel}
                    filter={this.props.filter}
                    contentLang={this.props.contentLang}
                    setFilter={this.props.setFilter}
                    setConnectionsMode={this.props.setConnectionsMode}
                    setConnectionsCategory={this.props.setConnectionsCategory} />
                  <ResourcesList
                    multiPanel={this.props.multiPanel}
                    setConnectionsMode={this.props.setConnectionsMode}
                    openComparePanel={this.props.openComparePanel}
                    sheetsCount={Sefaria.sheets.sheetsTotalCount(this.props.srefs)}
                    notesCount={Sefaria.notesTotalCount(this.props.srefs)} />
                  </div>);

    } else if (this.props.mode === "ConnectionsList") {
      content = (<ConnectionsSummary
                    srefs={this.props.srefs}
                    category={this.props.connectionsCategory}
                    showBooks={true}
                    multiPanel={this.props.multiPanel}
                    contentLang={this.props.contentLang}
                    filter={this.props.filter}
                    setFilter={this.props.setFilter}
                    setConnectionsMode={this.props.setConnectionsMode}
                    setConnectionsCategory={this.props.setConnectionsCategory} />);

    } else if (this.props.mode === "TextList") {
      content = (<TextList
                    panelPosition ={this.props.panelPosition}
                    srefs={this.checkSrefs(this.props.srefs)}
                    filter={this.props.filter}
                    recentFilters={this.props.recentFilters}
                    fullPanel={this.props.fullPanel}
                    multiPanel={this.props.multiPanel}
                    contentLang={this.props.contentLang}
                    setFilter={this.props.setFilter}
                    setConnectionsMode={this.props.setConnectionsMode}
                    onTextClick={this.props.onTextClick}
                    onCitationClick={this.props.onCitationClick}
                    onNavigationClick={this.props.onNavigationClick}
                    onCompareClick={this.props.onCompareClick}
                    onOpenConnectionsClick={this.props.onOpenConnectionsClick}
                    openNav={this.props.openNav}
                    openDisplaySettings={this.props.openDisplaySettings}
                    closePanel={this.props.closePanel}
                    selectedWords={this.props.selectedWords}
                    checkIntentTimer={this.props.checkIntentTimer}
                  />);

    } else if (this.props.mode === "Sheets") {
      content = (<div>
                  <AddToSourceSheetBox
                    srefs={this.props.srefs}
                    nodeRef = {this.props.nodeRef}
                    fullPanel={this.props.fullPanel}
                    setConnectionsMode={this.props.setConnectionsMode}
                    addToSourceSheet={this.props.addToSourceSheet} />
                  { Sefaria._uid ?
                  <a href="/sheets/private" className="allSheetsLink button transparent bordered fillWidth">
                    <span className="int-en">Go to My Sheets</span>
                    <span className="int-he">דפי המקורות שלי</span>
                  </a>
                  : null }
                  { this.props.srefs[0].indexOf("Sheet") == -1 ?
                  <MySheetsList
                    srefs={this.props.srefs}
                    fullPanel={this.props.fullPanel}
                    handleSheetClick={this.props.handleSheetClick}
                  /> : null }

                  { this.props.srefs[0].indexOf("Sheet") == -1 ?
                  <PublicSheetsList
                    srefs={this.props.srefs}
                    fullPanel={this.props.fullPanel}
                    handleSheetClick={this.props.handleSheetClick}
                  /> : null }

                </div>);

    } else if (this.props.mode === "Notes") {
        console.log(this.props);
      content = (<div>
                  <AddNoteBox
                    srefs={this.props.srefs}
                    fullPanel={this.props.fullPanel}
                    closePanel={this.props.closePanel}
                    onSave={() => this.props.setConnectionsMode("Notes")}
                    onCancel={() => this.props.setConnectionsMode("Notes")} />
                  { Sefaria._uid ?
                  <a href="/my/notes" className="allNotesLink button transparent bordered fillWidth">
                    <span className="int-en">Go to My Notes</span>
                    <span className="int-he">הרשומות שלי</span>
                  </a>
                  : null }
                  <MyNotes
                    srefs={this.props.srefs}
                    editNote={this.props.editNote} />
                </div>);

    } else if (this.props.mode === "Lexicon") {
      content = (<LexiconBox
                    selectedWords={this.props.selectedWords}
                    oref={Sefaria.ref(this.props.srefs[0])}
                    onEntryClick={this.props.onTextClick}
                    onCitationClick={this.props.onCitationClick}
      />);

    } else if (this.props.mode === "Tools") {
        console.log(this.props.srefs);
        console.log(this.props.canEditText);
      content = (<ToolsList
                    srefs={this.props.srefs}
                    canEditText={this.props.canEditText}
                    setConnectionsMode={this.props.setConnectionsMode}
                    currVersions={this.props.currVersions}
                    masterPanelLanguage={this.props.masterPanelLanguage} />);

    } else if (this.props.mode === "Share") {
        console.log('share');
      content = (<ShareBox
                    url={window.location.href}
                    fullPanel={this.props.fullPanel}
                    closePanel={this.props.closePanel}
                    setConnectionsMode={this.props.setConnectionsMode} />);

    } else if (this.props.mode === "Feedback") {
      content = (<FeedbackBox
                    srefs={this.props.srefs}
                    url={window.location.href}
                    currVersions={this.props.currVersions}
                 />);

    } else if (this.props.mode === "Edit Note") {
      content = (<AddNoteBox
                    srefs={this.props.srefs}
                    noteId={this.props.noteBeingEdited._id}
                    noteText={this.props.noteBeingEdited.text}
                    noteTitle={this.props.noteBeingEdited.title}
                    noteIsPublic={this.props.noteBeingEdited.isPublic}
                    fullPanel={this.props.fullPanel}
                    closePanel={this.props.closePanel}
                    onSave={() => this.props.setConnectionsMode("Notes")}
                    onCancel={() => this.props.setConnectionsMode("Notes")}
                    onDelete={() => this.props.setConnectionsMode("Notes")} />);

    } else if (this.props.mode === "Add Connection") {
      content = <AddConnectionBox
                    srefs={this.props.allOpenRefs}
                    openComparePanel={this.props.openComparePanel}
                    onSave={this.onSave}
                    onCancel={() => this.props.setConnectionsMode("Resources")} />

    } else if (this.props.mode === "Login") {
      content = (<LoginPrompt fullPanel={this.props.fullPanel} />);
    } else if (this.props.mode === "About") {
      content = (<AboutBox
                  currObjectVersions={this.state.currObjectVersions}
                  mainVersionLanguage={this.state.mainVersionLanguage}
                  title={this.props.title}
                  srefs={this.props.srefs}
                  getLicenseMap={this.props.getLicenseMap}
                  viewExtendedNotes={this.props.viewExtendedNotes}
                />);
    } else if (this.props.mode === "Versions" || this.props.mode === "Version Open") {
      content = (<VersionsBox
                  currObjectVersions={this.state.currObjectVersions}
                  mainVersionLanguage={this.state.mainVersionLanguage}
                  mode={this.props.mode}
                  selectVersion={this.props.selectVersion}
                  srefs={this.props.srefs}
                  vFilter={this.props.versionFilter}
                  recentVFilters={this.props.recentVersionFilters}
                  translateISOLanguageCode={this.props.translateISOLanguageCode}
                  setConnectionsMode={this.props.setConnectionsMode}
                  getLicenseMap={this.props.getLicenseMap}
                  setFilter={this.props.setVersionFilter}
                  getDataRef={this.getDataRef}
                  onRangeClick={this.props.onTextClick}
                  viewExtendedNotes={this.props.viewExtendedNotes}
                  onCitationClick={this.props.onCitationClick}/>);
    } else if (this.props.mode === "extended notes") {
      content = (<ExtendedNotes
                  currVersions={this.props.currVersions}
                  title={this.props.title}/>);
    }
    var marginless = ["Resources", "ConnectionsList", "Tools", "Share"].indexOf(this.props.mode) != -1;

    //marginless = 0;
    var classes = classNames({connectionsPanel: 1, textList: 1, marginless: marginless, fullPanel: this.props.fullPanel, singlePanel: !this.props.fullPanel});
    return (
      <div className={classes} key={this.props.mode}>
        { this.props.fullPanel ? null :
          <ConnectionsPanelHeader
            connectionsMode={this.props.mode}
            previousCategory={this.props.connectionsCategory}
            setConnectionsMode={this.props.setConnectionsMode}
            setConnectionsCategory={this.props.setConnectionsCategory}
            multiPanel={this.props.multiPanel}
            filter={this.props.filter}
            recentFilters={this.props.recentFilters}
            baseRefs={this.props.srefs}
            setFilter={this.props.setFilter}
            closePanel={this.props.closePanel}
            toggleLanguage={this.props.toggleLanguage}
            interfaceLang={this.props.interfaceLang}/> }
        <div className="texts">
          <div className="contentInner">{content}</div>
        </div>
      </div>);

  }
}
ConnectionsPanel.propTypes = {
  srefs:                   PropTypes.array.isRequired,  // an array of ref strings
  filter:                  PropTypes.array.isRequired,
  recentFilters:           PropTypes.array.isRequired,
  mode:                    PropTypes.string.isRequired, // "Resources", "ConnectionsList", "TextList" etc., called `connectionsMode` above
  connectionsCategory:     PropTypes.string,            // with mode:"ConnectionsList", which category of connections to show
  setFilter:               PropTypes.func.isRequired,
  setConnectionsMode:      PropTypes.func.isRequired,
  setConnectionsCategory:  PropTypes.func.isRequired,
  editNote:                PropTypes.func.isRequired,
  openComparePanel:        PropTypes.func.isRequired,
  addToSourceSheet:        PropTypes.func.isRequired,
  title:                   PropTypes.string.isRequired,
  currVersions:            PropTypes.object.isRequired,
  selectVersion:           PropTypes.func.isRequired,
  noteBeingEdited:         PropTypes.object,
  fullPanel:               PropTypes.bool,
  multiPanel:              PropTypes.bool,
  canEditText:             PropTypes.bool,
  onTextClick:             PropTypes.func,
  onCitationClick:         PropTypes.func,
  onNavigationClick:       PropTypes.func,
  onCompareClick:          PropTypes.func,
  onOpenConnectionsClick:  PropTypes.func,
  openNav:                 PropTypes.func,
  openDisplaySettings:     PropTypes.func,
  closePanel:              PropTypes.func,
  toggleLanguage:          PropTypes.func,
  selectedWords:           PropTypes.string,
  interfaceLang:           PropTypes.string,
  contentLang:             PropTypes.string,
  getLicenseMap:           PropTypes.func.isRequired,
  masterPanelLanguage:     PropTypes.oneOf(["english", "bilingual", "hebrew"]),
  translateISOLanguageCode:PropTypes.func.isRequired,
  versionFilter:           PropTypes.array,
  recentVersionFilters:    PropTypes.array,
  setVersionFilter:        PropTypes.func.isRequired,
  checkIntentTimer:        PropTypes.func.isRequired,
};


class ResourcesList extends Component {
  // A list of Resources in addition to connections
  render() {
    return (<div className="resourcesList">
              {this.props.multiPanel ?
                <ToolsButton en="Other Text" he="השווה" icon="search" onClick={this.props.openComparePanel} />
              : null }
              <ToolsButton en="Sheets" he="דפי מקורות" image="sheet.svg" count={this.props.sheetsCount} onClick={() => this.props.setConnectionsMode("Sheets")} />
              <ToolsButton en="Notes" he="הרשומות שלי" image="tools-write-note.svg" count={this.props.notesCount} onClick={() => this.props.setConnectionsMode("Notes")} />
              <ToolsButton en="About" he="אודות" image="book-64.png" onClick={() => this.props.setConnectionsMode("About")} />
              <ToolsButton en="Versions" he="גרסאות" image="layers.png" onClick={() => this.props.setConnectionsMode("Versions")} />
              <ToolsButton en="Dictionaries" he="מילונים" image="book-2.svg" onClick={() => this.props.setConnectionsMode("Lexicon")} />
              <ToolsButton en="Tools" he="כלים" icon="gear" onClick={() => this.props.setConnectionsMode("Tools")} />
              <ToolsButton en="Feedback" he="משוב" icon="comment" onClick={() => this.props.setConnectionsMode("Feedback")} />
            </div>);
  }
}
ResourcesList.propTypes = {
  multiPanel:         PropTypes.bool.isRequired,
  setConnectionsMode: PropTypes.func.isRequired,
  openComparePanel:   PropTypes.func.isRequired,
  sheetsCount:        PropTypes.number.isRequired,
  notesCount:         PropTypes.number.isRequired,
}


class SheetNodeConnectionTools extends Component {
  // A list of Resources in addition to connections
  render() {
    return (<div className="resourcesList">
              {this.props.multiPanel ?
                <ToolsButton en="Other Text" he="השווה" icon="search" onClick={this.props.openComparePanel} />
              : null }
                <ToolsButton en="Sheets" he="דפי מקורות" image="sheet.svg" count={this.props.sheetsCount} onClick={() => this.props.setConnectionsMode("Sheets")} />

                <ToolsButton en="Share" he="שתף" image="tools-share.svg" onClick={() => this.props.setConnectionsMode("Share")} />
                <ToolsButton en="Feedback" he="משוב" icon="comment" onClick={() => this.props.setConnectionsMode("Feedback")} />
            </div>);
  }
}
SheetNodeConnectionTools.propTypes = {
  multiPanel:         PropTypes.bool.isRequired,
  setConnectionsMode: PropTypes.func.isRequired,
  openComparePanel:   PropTypes.func.isRequired,
}


class ConnectionsSummary extends Component {
  // A summary of available connections on `srefs`.
  // If `category` is present, shows a single category, otherwise all categories.
  // If `showBooks`, show specific text counts beneath each category.
  render() {
    var refs       = this.props.srefs;
    var summary    = Sefaria.linkSummary(refs);
    var oref       = Sefaria.ref(refs[0]);
    var isTopLevel = !this.props.category;
    var baseCat    = oref ? oref["categories"][0] : null;

    if (!summary) { return (<LoadingMessage />); }

    if (this.props.category == "Commentary" ) {
      // Show Quoting Commentary & Modern Commentary together with Commentary
      summary = summary.filter(cat => (cat.category.indexOf("Commentary") != -1));
      summary.sort((a, b) => {
        var order = ["Commentary", "Modern Commentary", "Quoting Commentary"];
        var ia = order.indexOf(a.category)
        var ib = order.indexOf(b.category)
        return ia - ib;
      });

    } else if (this.props.category) {
      // Single Category Summary
      summary = summary.filter(function(cat) { return cat.category == this.props.category; }.bind(this));
      if (summary.length == 0) {
        summary = [{category: this.props.category, books: [], count: 0}];
      }

    } else if (isTopLevel) {
      // Top Level summary, don't show Quoting or Modern Commentary
      summary = summary.filter(cat => (cat.category.indexOf("Commentary") < 1));
    }

    var connectionsSummary = summary.map(function(cat, i) {

      var books = this.props.contentLang == "hebrew"
                    ? cat.books.concat().sort(Sefaria.linkSummaryBookSortHebrew.bind(null, baseCat))
                    : cat.books;
      return (
        <CategoryFilter
          srefs={this.props.srefs}
          category={cat.category}
          heCategory={Sefaria.hebrewTerm(cat.category)}
          showBooks={this.props.showBooks}
          count={cat.count}
          books={books}
          filter={this.props.filter}
          updateRecent={true}
          setFilter={this.props.setFilter}
          setConnectionsCategory={this.props.setConnectionsCategory}
          on={Sefaria.util.inArray(cat.category, this.props.filter) !== -1}
          key={cat.category} />
      );
    }.bind(this));

    return (<div>{connectionsSummary}</div>);
   }
}
ConnectionsSummary.propTypes = {
  srefs:                   PropTypes.array.isRequired, // an array of ref strings
  category:                PropTypes.string, // if present show connections for category, if null show category summary
  filter:                  PropTypes.array,
  fullPanel:               PropTypes.bool,
  multiPanel:              PropTypes.bool,
  contentLang:             PropTypes.string,
  showBooks:               PropTypes.bool,
  setConnectionsMode:      PropTypes.func,
  setFilter:               PropTypes.func,
  setConnectionsCategory:  PropTypes.func.isRequired,
};


class MySheetsList extends Component {
  // List of my sheets for a ref in the Sidebar
  render() {
    var sheets = Sefaria.sheets.userSheetsByRef(this.props.srefs);
    var content = sheets.length ? sheets.map(function(sheet) {
      return (<SheetListing sheet={sheet} key={sheet.sheetUrl} handleSheetClick={this.props.handleSheetClick} connectedRefs={this.props.srefs} />)
    }, this) : null;
    return content && content.length ? (<div className="sheetList">{content}</div>) : null;
  }
}
MySheetsList.propTypes = {
  srefs: PropTypes.array.isRequired,
};


class PublicSheetsList extends Component {
  // List of public sheets for a ref in the sidebar
  render() {
    var sheets = Sefaria.sheets.sheetsByRef(this.props.srefs);
    var content = sheets.length ? sheets.filter(function(sheet) {
      // My sheets are show already in MySheetList
      return sheet.owner !== Sefaria._uid;
    }).map(function(sheet) {
      return (<SheetListing sheet={sheet} key={sheet.sheetUrl} handleSheetClick={this.props.handleSheetClick} connectedRefs={this.props.srefs} />)
    }, this) : null;
    return content && content.length ? (<div className="sheetList">{content}</div>) : null;
  }
}
PublicSheetsList.propTypes = {
  srefs: PropTypes.array.isRequired,
};


class SheetListing extends Component {
  // A source sheet listed in the Sidebar
  handleSheetClick(e, sheet) {
      Sefaria.track.sheets("Opened via Connections Panel", this.props.connectedRefs.toString())
      //console.log("Sheet Click Handled");
    if (Sefaria._uid == this.props.sheet.owner) {
      Sefaria.track.event("Tools", "My Sheet Click", this.props.sheet.sheetUrl);
    } else {
      Sefaria.track.event("Tools", "Sheet Click", this.props.sheet.sheetUrl);
    }
    this.props.handleSheetClick(e,sheet);
  }
  handleSheetOwnerClick() {
    Sefaria.track.event("Tools", "Sheet Owner Click", this.props.sheet.ownerProfileUrl);
  }
  handleSheetTagClick(tag) {
    Sefaria.track.event("Tools", "Sheet Tag Click", tag);
  }
  render() {
    var sheet = this.props.sheet;
    var viewsIcon = sheet.public ?
      <div className="sheetViews sans"><i className="fa fa-eye" title={sheet.views + " views"}></i> {sheet.views}</div>
      : <div className="sheetViews sans"><i className="fa fa-lock" title="Private"></i></div>;

    return (
      <div className="sheet" key={sheet.sheetUrl}>
        <div className="sheetInfo">
          <div className="sheetUser">
            <a href={sheet.ownerProfileUrl} target="_blank" onClick={this.handleSheetOwnerClick}>
              <img className="sheetAuthorImg" src={sheet.ownerImageUrl} />
            </a>
            <a href={sheet.ownerProfileUrl} target="_blank" className="sheetAuthor" onClick={this.handleSheetOwnerClick}>{sheet.ownerName}</a>
          </div>
          {viewsIcon}
        </div>
        <a href={sheet.sheetUrl} target="_blank" className="sheetTitle" onClick={(e) => this.handleSheetClick(e,sheet)}>
          <img src="/static/img/sheet.svg" className="sheetIcon"/>
          <span className="sheetTitleText">{sheet.title}</span>
        </a>
        <div className="sheetTags">
          {sheet.tags.map(function(tag, i) {
            var separator = i == sheet.tags.length -1 ? null : <span className="separator">,</span>;
            return (<a href={"/sheets/tags/" + tag}
                        target="_blank"
                        className="sheetTag"
                        key={tag}
                        onClick={this.handleSheetTagClick.bind(null, tag)}>{tag}{separator}</a>)
          }.bind(this))}
        </div>
      </div>);
  }
}
SheetListing.propTypes = {
  sheet: PropTypes.object.isRequired,
};


class ToolsList extends Component {
  render() {
      console.log(this.props.srefs)
      console.log(this.props.canEditText)
      console.log(this.props.currVersions)
      console.log(this.props.setConnectionsMode)
      console.log(this.props.masterPanelLanguage)
    var editText  = this.props.canEditText ? function() {
        var refString = this.props.srefs[0];
        var currentPath = Sefaria.util.currentPath();
        var currentLangParam;
        const langCode = this.props.masterPanelLanguage.slice(0,2);
        if (this.props.currVersions[langCode]) {
          refString += "/" + encodeURIComponent(langCode) + "/" + encodeURIComponent(this.props.currVersions[langCode]);
        }
        var path = "/edit/" + refString;
        var nextParam = "?next=" + encodeURIComponent(currentPath);
        path += nextParam;
        //console.log(path);
        Sefaria.track.event("Tools", "Edit Text Click", refString,
          {hitCallback: () =>  window.location = path}
        );
    }.bind(this) : null;

    var addTranslation = function() {
      var nextParam = "?next=" + Sefaria.util.currentPath();
      Sefaria.track.event("Tools", "Add Translation Click", this.props.srefs[0],
          {hitCallback: () => {window.location = "/translate/" + this.props.srefs[0] + nextParam}}
      );
    }.bind(this);

    return (
      <div>
        <ToolsButton en="Share" he="שתף" image="tools-share.svg" onClick={() => this.props.setConnectionsMode("Share")} />
        <ToolsButton en="Add Translation" he="הוסף תרגום" image="tools-translate.svg" onClick={addTranslation} />
        <ToolsButton en="Add Connection" he="הוסף קישור לטקסט אחר" image="tools-add-connection.svg"onClick={() => this.props.setConnectionsMode("Add Connection")} />
        { editText ? (<ToolsButton en="Edit Text" he="ערוך טקסט" image="tools-edit-text.svg" onClick={editText} />) : null }
      </div>);
  }
}
ToolsList.propTypes = {
  srefs:               PropTypes.array.isRequired,  // an array of ref strings
  canEditText:         PropTypes.bool,
  currVersions:        PropTypes.object,
  setConnectionsMode:  PropTypes.func.isRequired,
  masterPanelLanguage: PropTypes.oneOf(["english", "hebrew", "bilingual"]),
};


class ToolsButton extends Component {
  onClick(e) {
    e.preventDefault();
    this.props.onClick();
  }
  render() {
    var icon = null;
    if (this.props.icon) {
      var iconName = "fa-" + this.props.icon;
      var classes = {fa: 1, toolsButtonIcon: 1};
      classes[iconName] = 1;
      icon = (<i className={classNames(classes)} />)
    } else if (this.props.image) {
      icon = (<img src={"/static/img/" + this.props.image} className="toolsButtonIcon" alt="" />);
    }

    var count = this.props.count ? (<span className="connectionsCount">({this.props.count})</span>) : null;
    var url = Sefaria.util.replaceUrlParam("with", this.props.en);
    return (
      <a href={url} className="toolsButton sans noselect" onClick={this.onClick}>
        {icon}
        <span className="toolsButtonText">
          <span className="int-en noselect">{this.props.en} {count}</span>
          <span className="int-he noselect">{this.props.he} {count}</span>
        </span>
      </a>)
  }
}
ToolsButton.propTypes = {
  en:      PropTypes.string.isRequired,
  he:      PropTypes.string.isRequired,
  icon:    PropTypes.string,
  image:   PropTypes.string,
  count:   PropTypes.number,
  onClick: PropTypes.func
};


class ShareBox extends Component {
  componentDidMount() {
    this.focusInput();
  }
  componentDidUpdate() {
    this.focusInput();
  }
  focusInput() {
    $(ReactDOM.findDOMNode(this)).find("input").select();
  }
  render() {
    var url = this.props.url;

    // Not quite working...
    // var fbButton = <iframe src={"https://www.facebook.com/plugins/share_button.php?href=" + encodeURIComponent(this.props.url) + '&layout=button&size=large&mobile_iframe=true&appId=206308089417064&width=73&height=28'} width="73" height="28" style={{border:"none", overflow: "hidden"}} scrolling="no" frameborder="0" allowTransparency="true"></iframe>

    var shareFacebook = function() {
      Sefaria.util.openInNewTab("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url));
    };
    var shareTwitter = function() {
      Sefaria.util.openInNewTab("https://twitter.com/home?status=" + url);
    };
    var shareEmail = function() {
      Sefaria.util.openInNewTab("mailto:?&subject=Text on Sefaria&body=" + url);
    };
    var classes = classNames({textList: 1, fullPanel: this.props.fullPanel});
    return (
      <div>
        <div className="shareInputBox">
          <input className="shareInput" value={this.props.url} />
        </div>
        <ToolsButton en="Facebook" he="פייסבוק" icon="facebook-official" onClick={shareFacebook} />
        <ToolsButton en="Twitter" he="טוויטר" icon="twitter" onClick={shareTwitter} />
        <ToolsButton en="Email" he="אימייל" icon="envelope-o" onClick={shareEmail} />
      </div>);
  }
}
ShareBox.propTypes = {
  url:                PropTypes.string.isRequired,
  setConnectionsMode: PropTypes.func.isRequired,
  closePanel:         PropTypes.func.isRequired,
  fullPanel:          PropTypes.bool
};


class AddNoteBox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isPrivate: !props.noteIsPublic,
      saving: false
    };
  }
  componentDidMount() {
    this.focusNoteText();
  }
  focusNoteText() {
    $(ReactDOM.findDOMNode(this)).find(".noteText").focus();
  }
  saveNote() {
    console.log(this.props)
      var text = $(ReactDOM.findDOMNode(this)).find(".noteText").val();
    if (!text) { return; }
    var note = {
      text: text,
      refs: this.props.srefs,
      type:  "note",
      public: !this.state.isPrivate
    };
   console.log(note)

    if (this.props.noteId) { note._id = this.props.noteId; }
    var postData = { json: JSON.stringify(note) };
    var url = "/api/notes/";
    $.post(url, postData, function(data) {
      if (data.error) {
        alert(data.error);
      } else if (data) {
        if (this.props.noteId) {
          Sefaria.clearPrivateNotes(data);
        } else {
          Sefaria.addPrivateNote(data);
        }
        Sefaria.track.event("Tools", "Note Save " + ((this.state.isPrivate)?"Private":"Public"), this.props.srefs.join("/"));
        $(ReactDOM.findDOMNode(this)).find(".noteText").val("");
        this.props.onSave();
      } else {
        alert(Sefaria._("Sorry, there was a problem saving your note."));
      }
    }.bind(this)).fail( function(xhr, textStatus, errorThrown) {
      alert(Sefaria._("Unfortunately, there was an error saving this note. Please try again or try reloading this page."));
    });
    this.setState({saving: true});
  }
  setPrivate() {
    this.setState({isPrivate: true});
  }
  setPublic() {
    this.setState({isPrivate: false});
  }
  deleteNote() {
    if (!confirm(Sefaria._("Are you sure you want to delete this note?"))) { return; }
    var url = "/api/notes/" + this.props.noteId;
    $.ajax({
      type: "delete",
      url: url,
      success: function() {
        Sefaria.clearPrivateNotes();
        Sefaria.track.event("Tools", "Delete Note", this.props.noteId);
        this.props.onDelete();
      }.bind(this),
      error: function() {
        alert(Sefaria._("Something went wrong (that's all I know)."));
      }
    });
  }
  render() {
    if (!Sefaria._uid) {
      return (<div className="addNoteBox"><LoginPrompt /></div>);
    }
    var privateClasses = classNames({notePrivateButton: 1, active: this.state.isPrivate});
    var publicClasses  = classNames({notePublicButton: 1, active: !this.state.isPrivate});
    return (
      <div className="addNoteBox">
        <textarea className="noteText" placeholder={Sefaria._("Write a note...")} defaultValue={this.props.noteText}></textarea>
        <div className="button fillWidth" onClick={this.saveNote}>
          <span className="int-en">{this.props.noteId ? "Save" : "Add Note"}</span>
          <span className="int-he">{this.props.noteId ? "שמור": "הוסף רשומה"}</span>
        </div>
        {this.props.noteId ?
          <div className="button white fillWidth" onClick={this.props.onCancel}>
            <span className="int-en">Cancel</span>
            <span className="int-he">בטל</span>
          </div> : null }
        {this.props.noteId ?
          (<div className="deleteNote" onClick={this.deleteNote}>
            <span className="int-en">Delete Note</span>
            <span className="int-he">מחק רשומה</span>
           </div>): null }
      </div>);

    /* Leaving out public / private toggle until public notes are reintroduced
    <div className="noteSharingToggle">
      <div className={privateClasses} onClick={this.setPrivate}>

        <span className="int-en"><i className="fa fa-lock"></i> Private</span>
        <span className="int-he"><i className="fa fa-lock"></i>רשומה פרטית</span>
      </div>
      <div className={publicClasses} onClick={this.setPublic}>
        <span className="int-en">Public</span>
        <span className="int-he">רשומה כללית</span>
      </div>
    </div>
    */
  }
}
AddNoteBox.propTypes = {
  srefs:          PropTypes.array.isRequired,
  onSave:         PropTypes.func.isRequired,
  onCancel:       PropTypes.func.isRequired,
  onDelete:       PropTypes.func,
  noteId:         PropTypes.string,
  noteText:       PropTypes.string,
  noteTitle:      PropTypes.string,
  noteIsPublic:   PropTypes.bool
};


class MyNotes extends Component {
  componentDidMount() {
    this.loadNotes();
  }
  componentDidUpdate(prevProps, prevState) {
    if (!prevProps.srefs.compare(this.props.srefs)) {
      this.loadNotes();
    }
  }
  loadNotes() {
    // Rerender this component when privateNotes arrive.
    Sefaria.privateNotes(this.props.srefs, this.rerender);
  }
  rerender() {
    this.forceUpdate();
  }
  render() {
    var myNotesData = Sefaria.privateNotes(this.props.srefs);
    console.log(this.props.srefs)
    console.log(myNotesData)
    var myNotes = myNotesData ? myNotesData.map(function(note) {
      var editNote = function() {
        this.props.editNote(note);
      }.bind(this);
      return (<Note
                text={note.text}
                isPrivate={!note.public}
                isMyNote={true}
                ownerName={note.ownerName}
                ownerProfileUrl={note.ownerProfileUrl}
                ownerImageUrl={note.ownerImageUrl}
                editNote={editNote}
                key={note._id} />);
    }.bind(this)) : null ;

    return myNotes ? (
      <div className="noteList myNoteList">
        {myNotes}
      </div>) : null;
  }
}
MyNotes.propTypes = {
  srefs:    PropTypes.array.isRequired,
  editNote: PropTypes.func.isRequired,
}


class PublicNotes extends Component {
  // List of Publc notes a ref or range or refs.
  render() {
    var notes   = Sefaria.notes(this.props.srefs);
    var content = notes ? notes.filter(function(note) {
      // Exlude my notes, shown already in MyNotes.
      return note.owner !== Sefaria._uid;
    }).map(function(note) {
      return (<Note
                text={note.text}
                ownerName={note.ownerName}
                ownerProfileUrl={note.ownerProfileUrl}
                ownerImageUrl={note.ownerImageUrl}
                isPrivate={false}
                key={note._id} />)
    }) : null;

    return content && content.length ? (<div className="noteList publicNoteList">{content}</div>) : null;
  }
}
PublicNotes.propTypes = {
  srefs: PropTypes.array.isRequired,
};


class AddConnectionBox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      refs: this.props.srefs,
      heRefs: this.getHeRefs(this.props.srefs),
      type: "",
    };
  }
  componentWillReceiveProps(nextProps) {
    if (!this.props.srefs.compare(nextProps.srefs)) {
      this.setState({
        refs: nextProps.srefs,
        heRefs: this.getHeRefs(nextProps.srefs),
      })
    }
  }
  getHeRefs(refs) {
    var heRefs = refs.map( ref =>  {
      var oRef = Sefaria.ref(ref);
      if (!oRef) {
        // If a range was selected, the ref cache may not have a Hebrew ref for us, so ask the API
        Sefaria.ref(ref, this.setHeRefs);
        return "...";
      }
      return oRef.heRef;
    });
    return heRefs;
  }
  setHeRefs() {
    this.setState({heRefs: this.getHeRefs(this.state.refs)});
  }
  setType(type) {
    this.setState({type: type});
  }
  addConnection() {
    var connection = {
      refs: this.props.srefs,
      type: this.state.type,
    };
    var postData = { json: JSON.stringify(connection) };
    var url = "/api/links/";
    $.post(url, postData, function(data) {
      if (data.error) {
        alert(data.error);
      } else {
        Sefaria.track.event("Tools", "Add Connection", this.props.srefs.join("/"));
        Sefaria.clearLinks();
        this.props.onSave();
      }
    }.bind(this)).fail( function(xhr, textStatus, errorThrown) {
      alert("Unfortunately, there was an error saving this connection. Please try again or try reloading this page.");
    });
    this.setState({saving: true});
  }
  render() {
    var refs = this.state.refs;
    var heRefs = this.state.heRefs;
    return (<div className="addConnectionBox">

            { this.props.srefs.length == 1 ?
              <div>
                <span className="int-en">Choose a text to connect.</span>
                <span className="int-he">בחר טקסט לקישור</span>

                <div className="button fillWidth" onClick={this.props.openComparePanel}>
                  <span className="int-en">Browse</span>
                  <span className="int-he">סייר</span>
                </div>
              </div>
              : null }

            { this.props.srefs.length > 2 ?
              <div>
                <span className="int-en">We currently only understand connections between two texts.</span>
                <span className="int-he">ניתן לקשר רק בין 2 טקסטים</span>
              </div>
              : null }

            { this.props.srefs.length == 2 ?
              <div>

                <div className="addConnectionSummary">
                  <span className="en">{ refs[0] }<br/>&<br/>{ refs[1]}</span>
                  <span className="he">{ heRefs[0] }<br/>&<br/>{ heRefs[1] }</span>
                </div>

                <Dropdown
                  options={[
                            {value: "",               label: "None"},
                            {value: "commentary",     label: "Commentary"},
                            {value: "quotation",      label: "Quotation"},
                            {value: "midrash",        label: "Midrash"},
                            {value: "ein mishpat",    label: "Ein Mishpat / Ner Mitsvah"},
                            {value: "mesorat hashas", label: "Mesorat HaShas"},
                            {value: "reference",      label: "Reference"},
                            {value: "related",        label: "Related Passage"}
                          ]}
                  placeholder={"Select Type"}
                  onSelect={this.setType} />

                <div className="button fillWidth" onClick={this.addConnection}>
                  <span className="int-en">Add Connection</span>
                  <span className="int-he">הוסף קישור</span>
                </div>

              </div>
              : null }

          </div>);
  }
}
AddConnectionBox.propTypes = {
  srefs:    PropTypes.array.isRequired,
  onSave:   PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
};


module.exports.ConnectionsPanel = ConnectionsPanel;
module.exports.ConnectionsPanelHeader = ConnectionsPanelHeader;
