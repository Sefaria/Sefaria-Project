const React      = require('react');
const classNames = require('classnames');
const ReactDOM   = require('react-dom');
const PropTypes  = require('prop-types');
const extend     = require('extend');
const Sefaria    = require('./sefaria/sefaria');
const $          = require('./sefaria/sefariaJquery');
const TextColumn = require('./TextColumn');
const ReaderNavigationMenu      = require('./ReaderNavigationMenu');
const {
  ConnectionsPanel,
  ConnectionsPanelHeader,
}                               = require('./ConnectionsPanel');
const ReaderTextTableOfContents = require('./ReaderTextTableOfContents');
const SearchPage                = require('./SearchPage');
const SheetsNav                 = require('./SheetsNav');
const Sheet                     = require('./Sheet');
const SheetMetadata             = require('./SheetMetadata');
const TopicsPanel               = require('./TopicsPanel');
const TopicPage                 = require('./TopicPage');
const AccountPanel              = require('./AccountPanel');
const NotificationsPanel        = require('./NotificationsPanel');
const MyNotesPanel              = require('./MyNotesPanel');
const UserHistoryPanel          = require('./UserHistoryPanel');
const UserProfile               = require('./UserProfile');
const UpdatesPanel              = require('./UpdatesPanel');
const HomeFeed                  = require('./HomeFeed');
const StoryEditor               = require('./StoryEditor');
const UserStats                 = require('./UserStats');
const ModeratorToolsPanel       = require('./ModeratorToolsPanel');
const {
  MyGroupsPanel,
  PublicGroupsPanel
}                               = require('./MyGroupsPanel');
const {
  ReaderNavigationMenuCloseButton,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  SaveButton,
  CategoryColorLine,
  CategoryAttribution,
  ToggleSet,
}                                = require('./Misc');
import Component from 'react-class';


class ReaderPanel extends Component {
  constructor(props) {
    super(props);
    // When this component is managed by a parent, all it takes is initialState
    if (props.initialState) {
      var state = this.clonePanel(props.initialState);
      state["initialAnalyticsTracked"] = false;
      this.state = state;
      return;
    }

    // When this component is independent and manages itself, it takes individual initial state props, with defaults listed here.
    this.state = {
      refs: props.initialRefs || [], // array of ref strings
      bookRef: null,
      mode: props.initialMode, // "Text", "TextAndConnections", "Connections", "Sheet", "SheetAndConnections"
      connectionsMode: props.initialConnectionsMode,
      filter: props.initialFilter || [],
      versionFilter: props.initialVersionFilter || [],
      currVersions: props.initialCurrVersions || {en:null, he: null},
      highlightedRefs: props.initialHighlightedRefs || [],
      highlightedNodes: props.highlightedNodes || [],
      recentFilters: [],
      recentVersionFilters: [],
      settings: props.initialState.settings || {
        language:      Sefaria._siteSettings.TORAH_SPECIFIC ? "binlinual" : "english",
        layoutDefault: "segmented",
        layoutTalmud:  "continuous",
        layoutTanakh:  "segmented",
        aliyotTorah:   "aliyotOff",
        vowels:        "all",
        biLayout:      "stacked",
        color:         "light",
        fontSize:      62.5
      },
      menuOpen:             props.initialMenu || null, // "navigation", "book toc", "text toc", "display", "search", "sheets", "home", "compare", "homefeed"
      navigationCategories: props.initialNavigationCategories || [],
      navigationSheetTag:   props.initialSheetsTag || null,
      navigationTopic:      props.initialTopic || null,
      sheetsGroup:          props.initialGroup || null,
      sheet:                props.sheet || null,
      sheetID:              null,
      editSheet:            false,
      searchQuery:          props.initialQuery || null,
      searchTab:            props.initialSearchTab || "text",
      textSearchState: new SearchState({
        type:               'text',
        field:              props.initialTextSearchField,
        sortType:           props.initialTextSearchSortType,
        appliedFilters:     props.initialTextAppliedSearchFilters,
        appliedFilterAggTypes: props.initialTextSearchFilterAggTypes,
      }),
      sheetSearchState: new SearchState({
        type:               'sheet',
        sortType:           props.initialSheetSearchSortType,
        appliedFilters:     props.initialSheetAppliedSearchFilters,
        appliedFilterAggTypes: props.initialSheetSearchFilterAggTypes,
      }),
      selectedWords:        "",
      displaySettingsOpen:  false,
      tagSort: "count",
      mySheetSort: "date",
      profile: props.initialProfile || null,
      initialAnalyticsTracked: false
    }
  }
  componentDidMount() {
    window.addEventListener("resize", this.setWidth);
    this.setWidth();
    if (this.props.panelPosition) {  //Focus on the first focusable element of the newly loaded panel. Mostly for a11y
      var curPanel = $(".readerPanel")[this.props.panelPosition];
      $(curPanel).find(':focusable').first().focus();
    }

    if (this.state.mode == "Sheet") {
      var newSettings = this.state.settings
      newSettings["language"] = this.state.sheet.options.language || "bilingual"
      this.conditionalSetState({ settings: newSettings});
    }

  }
  componentWillUnmount() {
    window.removeEventListener("resize", this.setWidth);
  }
  componentWillReceiveProps(nextProps) {
    if (nextProps.initialFilter && !this.props.multiPanel) {
      this.openConnectionsInPanel(nextProps.initialRefs);
    }
    if (nextProps.searchQuery && this.state.menuOpen !== "search") {
      this.openSearch(nextProps.searchQuery);
    }
    if (this.state.menuOpen !== nextProps.initialMenu) {
      this.setState({menuOpen: nextProps.initialMenu});
    }
    if (nextProps.initialState) {
      this.setState(nextProps.initialState);
    } else {
      this.setState({
        navigationCategories: nextProps.initialNavigationCategories || [],
        navigationSheetTag:   nextProps.initialSheetsTag || null
      });
    }
  }
  componentDidUpdate(prevProps, prevState) {
    if (prevProps.layoutWidth !== this.props.layoutWidth) {
      this.setWidth();
    }
    if ($('*:focus').length == 0 && this.props.multiPanel && $("body").hasClass("user-is-tabbing")) {
        var curPanel = $(".readerPanel")[($(".readerPanel").length)-1];
        $(curPanel).find(':focusable').first().focus();
    }
    this.replaceHistory = false;
    if (this.state.displaySettingsOpen) {
      $(".readerOptionsPanel").find('.on:focusable').first().focus();
    }
  }
  conditionalSetState(state) {
    // Set state either in the central app or in the local component,
    // depending on whether a setCentralState function was given.
    if (this.props.setCentralState) {
      this.props.setCentralState(state, this.replaceHistory);
      this.replaceHistory = false;
    } else {
      this.setState(state);
    }
  }
  onError(message) {
    if (this.props.onError) {
      this.props.onError(message);
      return;
    }
    this.setState({"error": message})
  }
  _getClickTarget(event) {
    // searches for click target with the proper css class
    let target = $(event.target);
    let linkType;
    while (target.attr("data-ref-child")) {
      // go up known data-ref-children
      target = target.parent();
    }
    if (target.parent().hasClass("refLink") || target.parent().hasClass("catLink")) {
      target = target.parent();
    }
    if (target.hasClass("refLink")) {
      linkType = "ref";
    } else if (target.hasClass("catLink")) {
      linkType = "cat";
    } else if (target.hasClass("sheetLink")) {
      linkType = "sheet";
    } else {
      return {};  // couldn't find a known link
    }
    return { target, linkType };
  }
  handleClick(event) {
    if (!$(event.target).hasClass("outOfAppLink") && !$(event.target.parentElement).hasClass("outOfAppLink")) {
      event.preventDefault();
    }
    const { target, linkType } = this._getClickTarget(event);
    if (!target) { return; }
    if (linkType === "ref") {
      const ref       = target.attr("data-ref");
      const pos       = target.attr("data-position");
      const enVersion = target.attr("data-ven");
      const heVersion = target.attr("data-vhe");
      if (target.hasClass("recentItem")) {
        this.props.onRecentClick(parseInt(pos), ref, {en: enVersion, he: heVersion});
      } else {
        const onTextClick = this.props.onNavTextClick || this.showBaseText;
        onTextClick(ref, {en: enVersion, he: heVersion});
      }
      if (Sefaria.site) { Sefaria.track.event("Reader", "Navigation Text Click", ref); }
    } else if (linkType === "cat") {
      const cats = target.attr("data-cats").split("|");
      this.setNavigationCategories(cats);
      if (Sefaria.site) { Sefaria.track.event("Reader", "Navigation Sub Category Click", cats.join(" / ")); }
    } else if (linkType === "sheet") {
      const ref = target.attr("data-ref");
      const onTextClick = this.props.onNavTextClick || this.showBaseText;
      onTextClick(ref);
    }
  }
  clonePanel(panel) {
    // Todo: Move the multiple instances of this out to a utils file
    return Sefaria.util.clone(panel);
  }
  handleBaseSegmentClick(ref) {
    if (this.state.mode === "TextAndConnections") {
      this.closeConnectionsInPanel();
    } else if (this.state.mode === "Text") {
      if (this.props.multiPanel) {
        this.props.onSegmentClick(ref);
      } else {
        this.openConnectionsInPanel(ref);
      }
    }
  }
  handleSheetSegmentClick(source) {
    console.log(source);
    this.conditionalSetState({highlightedNodes: source.node});
    if (this.state.mode ==="SheetAndConnections") {
      this.closeSheetConnectionsInPanel();
    }
    else if (this.state.mode === "Sheet") {
      if (this.props.multiPanel) {
        if (source.ref) {
          this.props.onSegmentClick(Sefaria.splitRangingRef(source.ref), source.node);
        }
        else {
          this.props.onSegmentClick("Sheet " + this.state.sheet.id+":"+source.node, source.node)
        }
      } else {
          if (source.ref) {
            this.openSheetConnectionsInPanel(source.ref, source.node);
          }
      }
    }
  }
  handleSheetCitationClick(ref) {
    this.props.onCitationClick(ref);
  }
  handleCitationClick(citationRef, textRef) {
    if (this.props.multiPanel) {
      this.props.onCitationClick(citationRef, textRef);
    } else {
      this.showBaseText(citationRef);
    }
  }
  handleTextListClick(ref, replaceHistory, currVersions) {
    this.showBaseText(ref, replaceHistory, currVersions);
  }
  openConnectionsInPanel(ref) {
    var refs = typeof ref == "string" ? [ref] : ref;
    this.replaceHistory = this.state.mode === "TextAndConnections"; // Don't push history for change in Connections focus
    this.conditionalSetState({highlightedRefs: refs, mode: "TextAndConnections" }, this.replaceHistory);
  }
  closeConnectionsInPanel() {
    // Return to the original text in the ReaderPanel contents
    this.conditionalSetState({highlightedRefs: [], mode: "Text"});
  }
  openSheetConnectionsInPanel(ref, node) {
    var refs = typeof ref == "string" ? [ref] : ref;
    var nodes = typeof node == "string" ? [node] : node;
    this.replaceHistory = this.state.mode === "SheetAndConnections"; // Don't push history for change in Connections focus
    this.conditionalSetState({highlightedNodes: nodes, highlightedRefs: refs, mode: "SheetAndConnections" }, this.replaceHistory);
  }
  closeSheetConnectionsInPanel() {
    // Return to the original text in the ReaderPanel contents
    this.conditionalSetState({highlightedNodes: [], highlightedRefs: [], mode: "Sheet"});
  }
  handleSheetClick(e, sheet, highlightedNodes, highlightedRefsInSheet) {
    e.preventDefault();
    var newSettings = this.state.settings;
    newSettings["language"] = sheet.options.language;
    this.conditionalSetState({ mode: "Sheet", sheet, highlightedNodes, highlightedRefsInSheet, settings: newSettings});
  }
  showBaseText(ref, replaceHistory, currVersions={en: null, he: null}, filter=[]) {
    // Set the current primary text `ref`, which may be either a string or an array of strings.
    // `replaceHistory` - bool whether to replace browser history rather than push for this change
    if (!ref) { return; }
    //console.log("showBaseText", ref)
    this.replaceHistory = Boolean(replaceHistory);
    if (this.state.mode == "Connections" && this.props.masterPanelLanguage == "bilingual") {
      // Connections panels are forced to be mono-lingual. When opening a text from a connections panel,
      // allow it to return to bilingual.
      this.state.settings.language = "bilingual";
    }
    if (ref.constructor == Array) {
      // When called with an array, set highlight for the whole spanning range
      var refs = ref;
      var currentlyVisibleRef = Sefaria.humanRef(ref);
      var splitArray = refs.map(ref => Sefaria.splitRangingRef(ref));
      var highlightedRefs = [].concat.apply([], splitArray);
    } else {
      var refs = [ref];
      var currentlyVisibleRef = ref;
      var highlightedRefs = [];
    }
    //console.log("- highlightedRefs: ", highlightedRefs)
    if (this.replaceHistory) {
      this.props.saveLastPlace({ mode: "Text", refs, currVersions, settings: this.state.settings }, this.props.panelPosition);
    }
    this.conditionalSetState({
      mode: "Text",
      refs,
      filter,
      currentlyVisibleRef,
      currVersions,
      highlightedRefs,
      recentFilters: [],
      menuOpen: null,
      connectionsMode: "Resources",
      settings: this.state.settings
    });
  }

  toggleSheetEditMode(buttonstate) {
      if (buttonstate == true) {
          this.conditionalSetState({
              editSheet: false
          })
      } else {
          this.conditionalSetState({
              editSheet: true
          })
      }

  }
  updateTextColumn(refs) {
    // Change the refs in the current TextColumn, for infinite scroll up/down.
    this.replaceHistory = true;
    this.conditionalSetState({ refs: refs });
  }
  setTextListHighlight(refs) {
    refs = typeof refs === "string" ? [refs] : refs;
    this.replaceHistory = true;
    this.conditionalSetState({highlightedRefs: refs});
    if (this.props.multiPanel) {
      this.props.setTextListHighlight(refs);
    }
  }
  setSelectedWords(words){
    words = (typeof words !== "undefined" && words.length) ?  words : "";
    words = words.trim();
    this.replaceHistory = false;
    if (this.props.multiPanel) {
      this.props.setSelectedWords(words);
    } else {
      this.conditionalSetState({'selectedWords':  words});
    }
  }
  closeMenus() {
    var state = {
      // If there's no content to show, return to home
      menuOpen: this.state.refs.slice(-1)[0] ? null: "home",
      // searchQuery: null,
      // appliedSearchFilters: [],
      navigationCategories: null,
      navigationSheetTag: null
    };
    this.conditionalSetState(state);
  }
  onClose() {
    if (this.state.menuOpen === "compare") {
      this.props.closePanel();
    } else {
      this.setNavigationCategories([]);
      this.closeMenus();
    }
  }
  closeSheetMetaData() {
    var state = {
      // If there's no content to show, return to home
      menuOpen: null,
      navigationCategories: null,
      navigationSheetTag: null
    };
    this.conditionalSetState(state);

  }
  closePanelSearch() {
    // Assumption: Search in a panel is always within a "compare" panel
    var state = {
      // If there's no content to show, return to home
      menuOpen: this.state.refs.slice(-1)[0] ? null: "compare",
      // searchQuery: null,
      // appliedSearchFilters: [],
      navigationCategories: null,
      navigationSheetTag: null
    };
    this.conditionalSetState(state);
  }
  openMenu(menu) {
    this.conditionalSetState({
      menuOpen: menu,
      initialAnalyticsTracked: false,
      // searchQuery: null,
      // appliedSearchFilters: [],
      navigationSheetTag: null,
      navigationTopic: null,
    });
  }
  setNavigationCategories(categories) {
    this.conditionalSetState({navigationCategories: categories});
  }
  setSheetTag (tag) {
    this.conditionalSetState({navigationSheetTag: tag});
  }
  setGroupTag (tag) {
    this.conditionalSetState({navigationGroupTag: tag});
  }
  setFilter(filter, updateRecent) {
    // Sets the current filter for Connected Texts (TextList)
    // If updateRecent is true, include the current setting in the list of recent filters.
    if (this.props.setConnectionsFilter) {
      this.props.setConnectionsFilter(filter, updateRecent);
    } else {
      if (updateRecent && filter) {
        if (Sefaria.util.inArray(filter, this.state.recentFilters) !== -1) {
          this.state.recentFilters.toggle(filter);
        }
        this.state.recentFilters = [filter].concat(this.state.recentFilters);
      }
      filter = filter ? [filter] : [];
      this.conditionalSetState({recentFilters: this.state.recentFilters, filter: filter, connectionsMode: "TextList"});
    }

  }
  setVersionFilter(filter) {
    if (this.props.setVersionFilter) {
      this.props.setVersionFilter(filter);
    } else {
      const filtInd = Sefaria.util.inArray(filter, this.state.recentVersionFilters);
      if (filtInd === -1) {
        this.state.recentVersionFilters = [filter].concat(this.state.recentVersionFilters);
      }
      filter = filter ? [filter] : [];
      this.conditionalSetState({recentVersionFilters: this.state.recentVersionFilters, versionFilter: filter, connectionsMode: "Version Open"});
    }
  }
  setTopic(topic) {
    this.conditionalSetState({navigationTopic: topic});
  }
  toggleLanguage() {
    if (this.state.settings.language == "hebrew") {
        this.setOption("language", "english");
        if (Sefaria.site) { Sefaria.track.event("Reader", "Change Language", "english");}
    } else {
        this.setOption("language", "hebrew");
        if (Sefaria.site) { Sefaria.track.event("Reader", "Change Language", "hebrew");}
    }
  }
  openSearch(query) {
    this.conditionalSetState({
      menuOpen: "search",
      searchQuery: query
    });
  }
  openDisplaySettings() {
    this.conditionalSetState({displaySettingsOpen: true});
  }
  closeDisplaySettings() {
    this.conditionalSetState({displaySettingsOpen: false});
  }
  setOption(option, value) {
    if (option === "fontSize") {
      var step = 1.15;
      var size = this.state.settings.fontSize;
      value = (value === "smaller" ? size/step : size*step);
    } else if (option === "layout") {
      var category = this.currentCategory();
      var option = category === "Tanakh" || category === "Talmud" ? "layout" + category : "layoutDefault";
    }

    this.state.settings[option] = value;
    var state = {settings: this.state.settings};
    if (option !== "fontSize") { state.displaySettingsOpen = false; }
    $.cookie(option, value, {path: "/"});
    if (option === "language") {
      $.cookie("contentLang", value, {path: "/"});
      this.replaceHistory = true;
      this.props.setDefaultOption && this.props.setDefaultOption(option, value);
    }
    this.conditionalSetState(state);
  }
  setConnectionsMode(mode) {
    var loginRequired = {
      "Add Connection": 1,
    };
    if (mode == "Add Connection" && this.props.allOpenRefs.length == 1) {
      this.props.openComparePanel(true);
      return;
    }
    Sefaria.track.event("Tools", mode + " Click"); // TODO Shouldn't be tracking clicks here, this function is called programmatically
    if (!Sefaria._uid && mode in loginRequired) {
      Sefaria.track.event("Tools", "Prompt Login");
      mode = "Login";
    }
    var state = {connectionsMode: mode};
    if (mode === "Resources") {
      this.setFilter();
    }
    this.conditionalSetState(state);
  }
  setConnectionsCategory(category) {
    this.setFilter(category, false); // Set filter so that basetext shows link dots according to this category
    this.conditionalSetState({connectionsCategory: category, connectionsMode: "ConnectionsList"});
  }
  editNote(note) {
    this.conditionalSetState({
      connectionsMode: "Edit Note",
      noteBeingEdited: note
    });
  }
  setWidth() {
    this.setState({width: $(ReactDOM.findDOMNode(this)).width()});
    //console.log("Setting panel width", this.width);
  }
  setSheetTagSort(sort) {
    this.conditionalSetState({
      tagSort: sort,
    });
  }
  setMySheetSort(sort) {
    this.conditionalSetState({
      mySheetSort: sort,
    });
  }
  setCurrentlyVisibleRef(ref) {
     this.replaceHistory = true;
     //var ref = this.state.highlightedRefs.length ? Sefaria.normRef(this.state.highlightedRefs) : ref;
     this.conditionalSetState({
      currentlyVisibleRef: ref,
    });
  }
  currentMode() {
    return this.state.mode;
  }
  currentRef() {
    // Returns a string of the current ref, the first if there are many
    return this.state.refs && this.state.refs.length ? this.state.refs[0] : null;
  }
  currentData() {
    // Returns the data from the library of the current ref
    var ref  = this.currentRef();
    if (!ref) { return null; }
    var data = Sefaria.ref(ref);
    return data;
  }
  currentBook() {
    var data = this.currentData();
    if (data) {
      return data.indexTitle;
    } else {
      var pRef = Sefaria.parseRef(this.currentRef());
      return "book" in pRef ? pRef.book : null;
    }
  }
  currentCategory() {
    if (this.state.mode == "Sheet") {
      return "Sheets"
    }
    else {
      var book = this.currentBook();
      return (Sefaria.index(book) ? Sefaria.index(book)['primary_category'] : null);
    }
  }
  currentLayout() {
    if (this.state.settings.language == "bilingual") {
      return this.state.width > 500 ? this.state.settings.biLayout : "stacked";
    }
    var category = this.currentCategory();
    if (!category) { return "layoutDefault"; }
    var option = category === "Tanakh" || category === "Talmud" ? "layout" + category : "layoutDefault";
    return this.state.settings[option];
  }
  handleKeyPress(e) {
    if (e.keyCode === 27) {
      this.props.closePanel(e);
    }
  }
  backFromExtendedNotes(){
    let bookRef = this.state.bookRef ? this.state.bookRef : this.currentBook();
    this.props.backFromExtendedNotes(bookRef, this.state.currVersions);
  }
  render() {
    if (this.state.error) {
      return (
          <div className="readerContent">
            <div className="readerError">
              <span className="int-en">Something went wrong! Please use the back button or the menus above to get back on track.</span>
              <span className="int-he">ארעה תקלה במערכת. אנא חזרו לתפריט הראשי או אחורנית על ידי שימוש בכפתורי התפריט או החזור.</span>
              <div className="readerErrorText">
                <span className="int-en">Error Message: </span>
                <span className="int-he">שגיאה:</span>
                {this.state.error}
              </div>
            </div>
          </div>
        );
    }

    let items = [];
    let menu = null;
    let contentLangOverride = null;

    if (this.state.mode === "Sheet" || this.state.mode === "SheetAndConnections" ) {
      items.push(<Sheet
          panelPosition ={this.props.panelPosition}
          id={this.state.sheet.id}
          editor={this.state.editSheet}
          key={"sheet-"+this.state.sheet.id}
          highlightedNodes={this.state.highlightedNodes}
          highlightedRefsInSheet={this.state.highlightedRefsInSheet}
          onRefClick={this.handleSheetCitationClick}
          hasSidebar={this.props.hasSidebar}
          contentLang={this.state.settings.language}
          interfaceLang={this.props.interfaceLang}
          onSegmentClick={this.handleSheetSegmentClick}
          openProfile={this.props.openProfile}
      />);
    }
    if (this.state.mode === "Text" || this.state.mode === "TextAndConnections") {
      var oref  = Sefaria.parseRef(this.state.refs[0]);
      var title = oref && oref.index ? oref.index : "empty";
      var bookTitle = oref && oref.index ? oref.index  : "";
      var heBookTitle = oref ? oref.heTitle : "";
      items.push(<TextColumn
          panelPosition ={this.props.panelPosition}
          srefs={this.state.refs.slice()}
          currVersions={this.state.currVersions}
          highlightedRefs={this.state.highlightedRefs}
          basetext={true}
          bookTitle={bookTitle}
          heBookTitle={heBookTitle}
          withContext={true}
          loadLinks={true}
          prefetchNextPrev={true}
          multiPanel={this.props.multiPanel}
          mode={this.state.mode}
          settings={Sefaria.util.clone(this.state.settings)}
          hasSidebar={this.props.hasSidebar}
          interfaceLang={this.props.interfaceLang}
          setOption={this.setOption}
          showBaseText={this.showBaseText}
          updateTextColumn={this.updateTextColumn}
          onSegmentClick={this.handleBaseSegmentClick}
          onCitationClick={this.handleCitationClick}
          setTextListHighlight={this.setTextListHighlight}
          setCurrentlyVisibleRef={this.setCurrentlyVisibleRef}
          setSelectedWords={this.setSelectedWords}
          selectedWords={this.state.selectedWords}
          panelsOpen={this.props.panelsOpen}
          layoutWidth={this.props.layoutWidth}
          filter={this.state.filter}
          textHighlights={this.state.textHighlights}
          unsetTextHighlight={this.props.unsetTextHighlight}
          key={title + "-TextColumn"} />);
    }

    if (this.state.mode === "Connections" || this.state.mode === "TextAndConnections" || this.state.mode === "SheetAndConnections") {
      var langMode = this.props.masterPanelLanguage || this.state.settings.language;
      var data     = this.currentData();
      if (this.state.mode === "Connections" && Sefaria.interfaceLang === "hebrew") {
        contentLangOverride = "hebrew";
      }
      var canEditText = data &&
                        ((langMode === "hebrew" && data.heVersionStatus !== "locked") ||
                        (langMode === "english" && data.versionStatus !== "locked") ||
                        (Sefaria.is_moderator && langMode !== "bilingual"));
      items.push(<ConnectionsPanel
          panelPosition ={this.props.panelPosition}
          selectVersion={this.props.selectVersion}
          srefs={this.state.mode === "Connections" ? this.state.refs.slice() : this.state.highlightedRefs.slice()}
          filter={this.state.filter || []}
          mode={this.state.connectionsMode || "Resources"}
          recentFilters={this.state.recentFilters}
          connectionsCategory={this.state.connectionsCategory}
          interfaceLang={this.props.interfaceLang}
          contentLang={this.state.settings.language}
          title={this.currentBook()}
          currVersions={this.state.currVersions}
          fullPanel={this.props.multiPanel}
          multiPanel={this.props.multiPanel}
          allOpenRefs={this.props.allOpenRefs}
          addToSourceSheet={this.props.addToSourceSheet}
          canEditText={canEditText}
          setFilter={this.setFilter}
          toggleSignUpModal={this.props.toggleSignUpModal}
          setConnectionsMode={this.setConnectionsMode}
          setConnectionsCategory={this.setConnectionsCategory}
          sheetMetaData={this.state.sheet}
          nodeRef={this.state.nodeRef}
          closeConectionsInPanel={this.closeConnectionsInPanel}
          handleSheetClick={this.handleSheetClick}
          openNav={this.openMenu.bind(null, "navigation")}
          openDisplaySettings={this.openDisplaySettings}
          editNote={this.editNote}
          noteBeingEdited={this.state.noteBeingEdited}
          onTextClick={this.handleTextListClick}
          onCitationClick={this.handleCitationClick}
          onNavigationClick={this.props.onNavigationClick}
          onOpenConnectionsClick={this.props.onOpenConnectionsClick}
          onCompareClick={this.showBaseText}
          openComparePanel={this.props.openComparePanel}
          closePanel={this.props.closePanel}
          selectedWords={this.state.selectedWords}
          getLicenseMap={this.props.getLicenseMap}
          masterPanelLanguage={this.props.masterPanelLanguage}
          translateISOLanguageCode={this.props.translateISOLanguageCode}
          versionFilter={this.state.versionFilter}
          recentVersionFilters={this.state.recentVersionFilters}
          setVersionFilter={this.setVersionFilter}
          viewExtendedNotes={this.props.viewExtendedNotes.bind(null, "Connections")}
          checkIntentTimer={this.props.checkIntentTimer}
          openProfile={this.props.openProfile}
          key="connections" />
      );
    }
    if (this.state.menuOpen === "home" || this.state.menuOpen == "navigation" || this.state.menuOpen == "compare") {
      var openInPanel   = function(pos, ref) { this.showBaseText(ref) }.bind(this);
      var openNav       = this.state.menuOpen === "compare" ? this.openMenu.bind(null, "compare") : this.openMenu.bind(null, "navigation");
      var onRecentClick = this.state.menuOpen === "compare" || !this.props.onRecentClick ? openInPanel : this.props.onRecentClick;

      menu = (<ReaderNavigationMenu
                    key={this.state.navigationCategories ? this.state.navigationCategories.join("-") : "navHome"}
                    home={this.state.menuOpen === "home"}
                    compare={this.state.menuOpen === "compare"}
                    interfaceLang={this.props.interfaceLang}
                    multiPanel={this.props.multiPanel}
                    categories={this.state.navigationCategories || []}
                    settings={this.state.settings}
                    setCategories={this.setNavigationCategories}
                    setOption={this.setOption}
                    toggleLanguage={this.toggleLanguage}
                    onClose={this.onClose}
                    closePanel={this.props.closePanel}
                    handleClick={this.handleClick}
                    openNav={openNav}
                    openSearch={this.openSearch}
                    openMenu={this.openMenu}
                    openDisplaySettings={this.openDisplaySettings}
                    onTextClick={this.props.onNavTextClick || this.showBaseText}
                    onRecentClick={onRecentClick}
                    hideNavHeader={this.props.hideNavHeader}
                    toggleSignUpModal={this.props.toggleSignUpModal}
                  />);

    } else if (this.state.menuOpen === "sheet meta") {
      menu = (<SheetMetadata
                    mode={this.state.menuOpen}
                    toggleSignUpModal={this.props.toggleSignUpModal}
                    interfaceLang={this.props.interfaceLang}
                    close={this.closeSheetMetaData}
                    sheet={this.state.sheet}
                    versionLanguage={this.state.versionLanguage}
                    settingsLanguage={this.state.settings.language == "hebrew"?"he":"en"}
                    narrowPanel={!this.props.multiPanel}
                    currentRef={this.state.currentlyVisibleRef}
                    openNav={this.openMenu.bind(null, "navigation")}
                    openDisplaySettings={this.openDisplaySettings}
                    selectVersion={this.props.selectVersion}
                    showBaseText={this.showBaseText}/>);

    }
    else if (this.state.menuOpen === "text toc") {
      menu = (<ReaderTextTableOfContents
                    mode={this.state.menuOpen}
                    interfaceLang={this.props.interfaceLang}
                    close={this.closeMenus}
                    title={this.currentBook()}
                    currVersions={this.state.currVersions}
                    settingsLanguage={this.state.settings.language == "hebrew"?"he":"en"}
                    category={this.currentCategory()}
                    narrowPanel={!this.props.multiPanel}
                    currentRef={this.state.currentlyVisibleRef}
                    openNav={this.openMenu.bind(null, "navigation")}
                    openDisplaySettings={this.openDisplaySettings}
                    selectVersion={this.props.selectVersion}
                    viewExtendedNotes={this.props.viewExtendedNotes.bind(null, "toc")}
                    showBaseText={this.showBaseText}
                    getLicenseMap={this.props.getLicenseMap}/>);

    } else if (this.state.menuOpen === "book toc") {
      menu = (<ReaderTextTableOfContents
                    mode={this.state.menuOpen}
                    interfaceLang={this.props.interfaceLang}
                    closePanel={this.props.closePanel}
                    close={this.closeMenus}
                    title={this.state.bookRef}
                    currVersions={this.state.currVersions}
                    settingsLanguage={this.state.settings.language == "hebrew"?"he":"en"}
                    category={Sefaria.index(this.state.bookRef) ? Sefaria.index(this.state.bookRef).primary_category : null}
                    currentRef={this.state.bookRef}
                    narrowPanel={!this.props.multiPanel}
                    key={this.state.bookRef}
                    openNav={this.openMenu.bind(null, "navigation")}
                    openDisplaySettings={this.openDisplaySettings}
                    selectVersion={this.props.selectVersion}
                    showBaseText={this.showBaseText}
                    getLicenseMap={this.props.getLicenseMap}
                    viewExtendedNotes={this.props.viewExtendedNotes.bind(null, "toc")}/>);

    } else if (this.state.menuOpen === "extended notes" && this.state.mode !== "Connections") {
      menu = (<ReaderTextTableOfContents
                    mode={this.state.menuOpen}
                    interfaceLang={this.props.interfaceLang}
                    closePanel={this.props.closePanel}
                    close={this.closeMenus}
                    title={this.state.bookRef ? this.state.bookRef : this.currentBook()}
                    currVersions={this.state.currVersions}
                    settingsLanguage={this.state.settings.language == "hebrew"?"he":"en"}
                    category={Sefaria.index(this.state.bookRef) ? Sefaria.index(this.state.bookRef).primary_category : this.currentCategory()}
                    currentRef={this.state.bookRef ? this.state.bookRef : this.state.currentlyVisibleRef}
                    narrowPanel={!this.props.multiPanel}
                    openNav={this.openMenu.bind(null, "navigation")}
                    openDisplaySettings={this.openDisplaySettings}
                    selectVersion={this.props.selectVersion}
                    showBaseText={this.showBaseText}
                    backFromExtendedNotes={
                      this.state.mode==="Connections" ? this.closeMenus : this.backFromExtendedNotes
                    }
                    getLicenseMap={this.props.getLicenseMap}/>);

    } else if (this.state.menuOpen === "search" && this.state.searchQuery) {
      menu = (<SearchPage
                    key={"searchPage"}
                    query={this.state.searchQuery}
                    tab={this.state.searchTab}
                    textSearchState={this.state.textSearchState}
                    sheetSearchState={this.state.sheetSearchState}
                    settings={Sefaria.util.clone(this.state.settings)}
                    panelsOpen={this.props.panelsOpen}
                    onResultClick={this.props.onSearchResultClick}
                    openDisplaySettings={this.openDisplaySettings}
                    toggleLanguage={this.toggleLanguage}
                    close={this.closePanelSearch}
                    hideNavHeader={this.props.hideNavHeader}
                    onQueryChange={this.props.onQueryChange}
                    updateTab={this.props.updateSearchTab}
                    updateAppliedFilter={this.props.updateSearchFilter}
                    updateAppliedOptionField={this.props.updateSearchOptionField}
                    updateAppliedOptionSort={this.props.updateSearchOptionSort}
                    registerAvailableFilters={this.props.registerAvailableFilters}
                    openProfile={this.props.openProfile}
                  />);

    } else if (this.state.menuOpen === "sheets") {
      menu = (<SheetsNav
                    interfaceLang={this.props.interfaceLang}
                    openNav={this.openMenu.bind(null, "navigation")}
                    close={this.closeMenus}
                    multiPanel={this.props.multiPanel}
                    hideNavHeader={this.props.hideNavHeader}
                    toggleLanguage={this.toggleLanguage}
                    tag={this.state.navigationSheetTag}
                    tagSort={this.state.tagSort}
                    group={this.state.sheetsGroup}
                    groupTag={this.state.navigationGroupTag}
                    mySheetSort={this.state.mySheetSort}
                    setMySheetSort={this.setMySheetSort}
                    setSheetTagSort={this.setSheetTagSort}
                    setSheetTag={this.setSheetTag}
                    setGroupTag={this.setGroupTag}
                    searchInGroup={this.props.searchInGroup}
                    openProfile={this.props.openProfile}
                    key={"SheetsNav"}
                    openProfile={this.props.openProfile}
                  />);

    } else if (this.state.menuOpen === "topics") {
      if (this.state.navigationTopic) {
        menu = (<TopicPage
                      topic={this.state.navigationTopic}
                      interfaceLang={this.props.interfaceLang}
                      setTopic={this.setTopic}
                      openTopics={this.openMenu.bind(null, "topics")}
                      showBaseText={this.props.onNavTextClick || this.showBaseText}
                      openNav={this.openMenu.bind(null, "navigation")}
                      close={this.closeMenus}
                      multiPanel={this.props.multiPanel}
                      hideNavHeader={this.props.hideNavHeader}
                      toggleLanguage={this.toggleLanguage}
                      navHome={this.openMenu.bind(null, "navigation")}
                      openDisplaySettings={this.openDisplaySettings}
                      key={"TopicPage"} />);
      } else {
        menu = (<TopicsPanel
                      interfaceLang={this.props.interfaceLang}
                      width={this.state.width}
                      setTopic={this.setTopic}
                      openNav={this.openMenu.bind(null, "navigation")}
                      close={this.closeMenus}
                      multiPanel={this.props.multiPanel}
                      hideNavHeader={this.props.hideNavHeader}
                      toggleLanguage={this.toggleLanguage}
                      navHome={this.openMenu.bind(null, "navigation")}
                      openDisplaySettings={this.openDisplaySettings}
                      key={"TopicsPanel"} />);
      }

    } else if (this.state.menuOpen === "account") {
      menu = (<AccountPanel
                    handleInAppLinkClick={this.props.handleInAppLinkClick}
                    interfaceLang={this.props.interfaceLang} />);

    } else if (this.state.menuOpen === "notifications") {
      menu = (<NotificationsPanel
                    setUnreadNotificationsCount={this.props.setUnreadNotificationsCount}
                    interfaceLang={this.props.interfaceLang} />);

    } else if (this.state.menuOpen === "myNotes") {
      menu = (<MyNotesPanel
                    interfaceLang={this.props.interfaceLang}
                    multiPanel={this.props.multiPanel}
                    hideNavHeader={this.props.hideNavHeader}
                    navHome={this.openMenu.bind(null, "navigation")}
                    openDisplaySettings={this.openDisplaySettings}
                    toggleLanguage={this.toggleLanguage} />);

    } else if (this.state.menuOpen === "publicGroups") {
      menu = (<PublicGroupsPanel
                    multiPanel={this.props.multiPanel}
                    navHome={this.openMenu.bind(null, "navigation")}/>);

    } else if (this.state.menuOpen === "myGroups") {
      menu = (<MyGroupsPanel
                    multiPanel={this.props.multiPanel}
                    navHome={this.openMenu.bind(null, "navigation")}/>);

    } else if (this.state.menuOpen === "homefeed") {
      if (Sefaria.interfaceLang === "hebrew") {
        contentLangOverride = "hebrew";
      } else if (Sefaria.interfaceLang === "english") {
        contentLangOverride = "bilingual";
      }
      menu = (<HomeFeed
                    interfaceLang={this.props.interfaceLang}
                    toggleSignUpModal={this.props.toggleSignUpModal} />);

    } else if (this.state.menuOpen === "story_editor") {
      if (Sefaria.interfaceLang === "hebrew") {
        contentLangOverride = "hebrew";
      } else if (Sefaria.interfaceLang === "english") {
        contentLangOverride = "bilingual";
      }
      menu = (<StoryEditor
                    toggleSignUpModal={this.props.toggleSignUpModal}
                    interfaceLang={this.props.interfaceLang} />);


    } else if (this.state.menuOpen === "updates") {
      menu = (<UpdatesPanel
                    interfaceLang={this.props.interfaceLang}
                    multiPanel={this.props.multiPanel}
                    navHome={this.openMenu.bind(null, "navigation")} />);

    } else if (this.state.menuOpen === "user_stats") {
      menu = (<UserStats/>);

    } else if (this.state.menuOpen === "modtools") {
      menu = (<ModeratorToolsPanel
                    interfaceLang={this.props.interfaceLang} />);

    } else if (this.state.menuOpen === "saved" || this.state.menuOpen === "history") {
      menu = (
        <UserHistoryPanel
          multiPanel={this.props.multiPanel}
          menuOpen={this.state.menuOpen}
          handleClick={this.handleClick}
          openNav={this.openMenu.bind(null, "navigation")}
          openDisplaySettings={this.openDisplaySettings}
          toggleLanguage={this.toggleLanguage}
          compare={this.state.menuOpen === "compare"}
          hideNavHeader={this.props.hideNavHeader}
          interfaceLang={this.props.interfaceLang}
        />
      );
    } else if (this.state.menuOpen === "profile") {
      menu = (
        <UserProfile
          profile={this.state.profile}
          handleInAppLinkClick={this.props.handleInAppLinkClick}
          openProfile={this.props.openProfile}
          toggleSignUpModal={this.props.toggleSignUpModal}
        />
      );
    }

    let classes  = {readerPanel: 1, narrowColumn: this.state.width < 730};
    let contentLang = contentLangOverride || this.state.settings.language;
    classes[contentLang]              = 1
    classes[this.currentLayout()]      = 1;
    classes[this.state.settings.color] = 1;
    classes = classNames(classes);
    var style = {"fontSize": this.state.settings.fontSize + "%"};
    var hideReaderControls = (
        this.state.mode === "TextAndConnections" ||
        this.state.menuOpen ||
        this.props.hideNavHeader
    );

    return (
      <div className={classes} onKeyDown={this.handleKeyPress} role="region" id={"panel-"+this.props.panelPosition}>
        {hideReaderControls ? null :
        (<ReaderControls
          showBaseText={this.showBaseText}
          sheet={this.state.sheet}
          toggleSheetEditMode={this.toggleSheetEditMode}
          editSheet={this.state.editSheet}
          currentRef={this.state.currentlyVisibleRef}
          highlightedRef={(!!this.state.highlightedRefs && this.state.highlightedRefs.length) ? Sefaria.normRef(this.state.highlightedRefs) : null}
          currentMode={this.currentMode.bind(this)}
          currentCategory={this.currentCategory}
          currentBook={this.currentBook.bind(this)}
          currVersions={this.state.currVersions}
          multiPanel={this.props.multiPanel}
          settings={this.state.settings}
          setOption={this.setOption}
          setConnectionsMode={this.setConnectionsMode}
          setConnectionsCategory={this.setConnectionsCategory}
          openMenu={this.openMenu}
          closeMenus={this.closeMenus}
          openDisplaySettings={this.openDisplaySettings}
          currentLayout={this.currentLayout}
          onError={this.onError}
          connectionsMode={this.state.filter.length && this.state.connectionsMode === "Connections" ? "Connection Text" : this.state.connectionsMode}
          connectionsCategory={this.state.connectionsCategory}
          closePanel={this.props.closePanel}
          toggleLanguage={this.toggleLanguage}
          interfaceLang={this.props.interfaceLang}
          toggleSignUpModal={this.props.toggleSignUpModal}
          historyObject={this.props.getHistoryObject(this.state, this.props.hasSidebar)}
        />)}

        {(items.length > 0 && !menu) ?
            <div className="readerContent" style={style}>
              {items}
            </div>
        : null}

        {menu}

        {this.state.displaySettingsOpen ? (<ReaderDisplayOptionsMenu
                                              settings={this.state.settings}
                                              multiPanel={this.props.multiPanel}
                                              setOption={this.setOption}
                                              parentPanel={this.props.initialState.mode}
                                              currentLayout={this.currentLayout}
                                              currentBook={this.currentBook}
                                              currentData={this.currentData}
                                              width={this.state.width}
                                              menuOpen={this.state.menuOpen} />) : null}
        {this.state.displaySettingsOpen ? (<div className="mask" onClick={this.closeDisplaySettings}></div>) : null}

      </div>
    );
  }
}
ReaderPanel.propTypes = {
  initialRefs:                 PropTypes.array,
  initialMode:                 PropTypes.string,
  initialConnectionsMode:      PropTypes.string,
  initialVersion:              PropTypes.string,
  initialVersionLanguage:      PropTypes.string,
  initialFilter:               PropTypes.array,
  initialHighlightedRefs:      PropTypes.array,
  initialMenu:                 PropTypes.string,
  initialQuery:                PropTypes.string,
  initialTextAppliedSearchFilters: PropTypes.array,
  initialTextSearchField:          PropTypes.string,
  initialTextSearchSortType:       PropTypes.string,
  initialSheetAppliedSearchFilters: PropTypes.array,
  initialSheetSearchField:          PropTypes.string,
  initialSheetSearchSortType:       PropTypes.string,
  initialSheetsTag:            PropTypes.string,
  initialProfile:              PropTypes.object,
  initialState:                PropTypes.object, // if present, overrides all props above
  interfaceLang:               PropTypes.string,
  setCentralState:             PropTypes.func,
  onSegmentClick:              PropTypes.func,
  onCitationClick:             PropTypes.func,
  onNavTextClick:              PropTypes.func,
  onRecentClick:               PropTypes.func,
  onSearchResultClick:         PropTypes.func,
  onUpdate:                    PropTypes.func,
  onError:                     PropTypes.func,
  closePanel:                  PropTypes.func,
  closeMenus:                  PropTypes.func,
  setConnectionsFilter:        PropTypes.func,
  setDefaultOption:            PropTypes.func,
  selectVersion:               PropTypes.func,
  viewExtendedNotes:           PropTypes.func,
  backFromExtendedNotes:       PropTypes.func,
  unsetTextHighlight:          PropTypes.func,
  onQueryChange:               PropTypes.func,
  updateSearchTab:             PropTypes.func,
  updateSearchFilter:          PropTypes.func,
  updateSearchOptionField:     PropTypes.func,
  updateSearchOptionSort:      PropTypes.func,
  registerAvailableFilters:    PropTypes.func,
  searchInGroup:               PropTypes.func,
  openComparePanel:            PropTypes.func,
  setUnreadNotificationsCount: PropTypes.func,
  addToSourceSheet:            PropTypes.func,
  highlightedRefs:             PropTypes.array,
  hideNavHeader:               PropTypes.bool,
  multiPanel:                  PropTypes.bool,
  masterPanelLanguage:         PropTypes.string,
  panelsOpen:                  PropTypes.number,
  allOpenRefs:                 PropTypes.array,
  hasSidebar:                  PropTypes.bool,
  layoutWidth:                 PropTypes.number,
  setTextListHighlight:        PropTypes.func,
  setSelectedWords:            PropTypes.func,
  analyticsInitialized:        PropTypes.bool,
  getLicenseMap:               PropTypes.func.isRequired,
  translateISOLanguageCode:    PropTypes.func.isRequired,
  setVersionFilter:            PropTypes.func,
  saveLastPlace:               PropTypes.func,
  checkIntentTimer:            PropTypes.func,
  toggleSignUpModal:           PropTypes.func.isRequired,
  getHistoryRef:               PropTypes.func,
  profile:                     PropTypes.object,
  openProfile:                 PropTypes.func,
};


class ReaderControls extends Component {
  // The Header of a Reader panel when looking at a text
  // contains controls for display, navigation etc.
  constructor(props) {
    super(props);
    this.state = {};
  }
  openTextToc(e) {
    e.preventDefault();
    this.props.openMenu("text toc");
  }
  openSheetMeta(e) {
    e.preventDefault();
    this.props.openMenu("sheet meta");
  }
  componentDidMount() {
    const title = this.props.currentRef;
    if (title) {
      // If we don't have this data yet, rerender when we do so we can set the Hebrew title
      const getTextPromise = Sefaria.getText(title, {context: 1}).then(data => {
        if ("error" in data) { this.props.onError(data.error); }
        this.setState({runningQuery: null});   // Causes re-render
      });
      this.setState({runningQuery: Sefaria.makeCancelable(getTextPromise)});
    }
  }
  componentWillUnmount() {
    if (this.state.runningQuery) {
      this.state.runningQuery.cancel();
    }
  }
  render() {
    var title  = this.props.sheet ? this.props.sheet.title.stripHtmlKeepLineBreaks().replace(/&amp;/g, '&').replace(/(<br>|\n)+/g,' ') : this.props.currentRef;
    var heTitle, categoryAttribution;

    if (title) {
      if (this.props.sheet) {
        heTitle = title;
      }
      else {
        var oref    = Sefaria.ref(title);
        heTitle = oref ? oref.heRef : "";
      }

      categoryAttribution = oref && Sefaria.categoryAttribution(oref.categories) ?
                                  <CategoryAttribution categories={oref.categories} linked={false} /> : null;
    } else {
      heTitle = "";
      categoryAttribution = null;
    }

    var mode              = this.props.currentMode();
    var hideHeader        = !this.props.multiPanel && mode === "Connections";
    var connectionsHeader = this.props.multiPanel && mode === "Connections";
    var showVersion = this.props.currVersions.en && (this.props.settings.language == "english" || this.props.settings.language == "bilingual");
    var versionTitle = this.props.currVersions.en ? this.props.currVersions.en.replace(/_/g," ") : "";
    var url = this.props.sheet ? "/sheets/"+ this.props.sheet.id : Sefaria.ref(title) ? "/" + Sefaria.normRef(Sefaria.ref(title).book) : Sefaria.normRef(title);

    var centerContent = connectionsHeader ?
      (<div className="readerTextToc">
          <ConnectionsPanelHeader
            connectionsMode={this.props.connectionsMode}
            previousCategory={this.props.connectionsCategory}
            multiPanel={this.props.multiPanel}
            setConnectionsMode={this.props.setConnectionsMode}
            setConnectionsCategory={this.props.setConnectionsCategory}
            closePanel={this.props.closePanel}
            toggleLanguage={this.props.toggleLanguage}
            interfaceLang={this.props.interfaceLang}/>
        </div>) :
      (<div className={"readerTextToc" + (categoryAttribution ? ' attributed' : '')} onClick={this.props.sheet? this.openSheetMeta : this.openTextToc}>
        <div className={"readerTextTocBox" + (this.props.sheet ? " sheetBox":"")} role="heading" aria-level="1" aria-live="polite">
          <a href={url} aria-label={"Show table of contents for " + title} >
            { title ? (<i className="fa fa-angle-down invisible"></i>) : null }
            { this.props.sheet? <img src={"/static/img/sheet.svg"} className="sheetTocIcon" alt="" /> : null}
            { this.props.sheet? <div style={{"direction": Sefaria.hebrew.isHebrew(title) ? "rtl" :"ltr"}}><span>{title}</span></div> :
            <div><span className="en">{title}</span>
            <span className="he">{heTitle}</span></div> }
            { title ? (<i className="fa fa-angle-down"></i>) : null }
            { showVersion ? (<span className="readerTextVersion"><span className="en">{versionTitle}</span></span>) : null}
          </a>
          <div onClick={(e) => {e.stopPropagation();}}>
            {categoryAttribution}
          </div>
        </div>
      </div>);
    var leftControls = hideHeader || connectionsHeader ? null :
      (<div className="leftButtons">
          {this.props.multiPanel ? (<ReaderNavigationMenuCloseButton onClick={this.props.closePanel} />) : null}
          {this.props.multiPanel ? null : (<ReaderNavigationMenuMenuButton onClick={this.props.openMenu.bind(null, "navigation")}/>)}
          <SaveButton placeholder={true}/>
        </div>);
    var rightControls = hideHeader || connectionsHeader ? null :
      (<div className="rightButtons">
          {this.props.sheet && Sefaria._uid == this.props.sheet.owner ? <button onClick={() => this.props.toggleSheetEditMode(this.props.editSheet)}>{this.props.editSheet == true ? "View" : "Edit"}</button> : null }
          <SaveButton
            historyObject={this.props.historyObject}
            tooltip={true}
            toggleSignUpModal={this.props.toggleSignUpModal}
          />
          <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
        </div>);
    var classes = classNames({readerControls: 1, connectionsHeader: mode == "Connections", fullPanel: this.props.multiPanel});
    var readerControls = hideHeader ? null :
        (<div className={classes}>
          <div className="readerControlsInner">
            {leftControls}
            {centerContent}
            {rightControls}
          </div>
        </div>);
    return (
      <div>
        {connectionsHeader ? null : <CategoryColorLine category={this.props.currentCategory()} />}
        {readerControls}
      </div>
    );
  }
}
ReaderControls.propTypes = {
  settings:                PropTypes.object.isRequired,
  showBaseText:            PropTypes.func.isRequired,
  setOption:               PropTypes.func.isRequired,
  setConnectionsMode:      PropTypes.func.isRequired,
  setConnectionsCategory:  PropTypes.func.isRequired,
  openMenu:                PropTypes.func.isRequired,
  openDisplaySettings:     PropTypes.func.isRequired,
  closeMenus:              PropTypes.func.isRequired,
  currentMode:             PropTypes.func.isRequired,
  currentCategory:         PropTypes.func.isRequired,
  currentBook:             PropTypes.func.isRequired,
  currentLayout:           PropTypes.func.isRequired,
  onError:                 PropTypes.func.isRequired,
  closePanel:              PropTypes.func,
  toggleLanguage:          PropTypes.func,
  currentRef:              PropTypes.string,
  highlightedRef:          PropTypes.string,
  currVersions:            PropTypes.object,
  connectionsMode:         PropTypes.string,
  connectionsCategory:     PropTypes.string,
  multiPanel:              PropTypes.bool,
  interfaceLang:           PropTypes.string,
  toggleSignUpModal:       PropTypes.func.isRequired,
  historyObject:           PropTypes.object.isRequired,
};


class ReaderDisplayOptionsMenu extends Component {
  renderAliyotToggle() {
    let torah = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Onkelos Genesis", "Onkelos Exodus", "Onkelos Leviticus", "Onkelos Numbers", "Onkelos Deuteronomy"];
    return this.props.currentBook ? torah.includes(this.props.currentBook()) : false;
  }
  vowelToggleAvailability(){
    var data = this.props.currentData();
    if(!data) return 2;
    var sample = data["he"];
    while (Array.isArray(sample)) {
        sample = sample[0];
    }
    var vowels_re = /[\u05b0-\u05c3\u05c7]/g;
    var cantillation_re = /[\u0591-\u05af]/g;
    if(cantillation_re.test(sample)){
      //console.log("all");
      return 0;
    }else if(vowels_re.test(sample)){
      //console.log("partial");
      return 1;
    }else{
      //console.log("none");
      return 2;
    }
  }
  showLangaugeToggle() {
    if (Sefaria._siteSettings.TORAH_SPECIFIC) return true;

    var data = this.props.currentData();
    if (!data) return true // Sheets don't have currentData, also show for now (4x todo)

    var hasHebrew = !!data.he.length;
    var hasEnglish = !!data.text.length;
    var singleLanguage = !(hasHebrew && hasEnglish);

    return !singleLanguage;
  }
  render() {
    var languageOptions = [
      {name: "english",   content: "<span class='en'>A</span>", role: "radio", ariaLabel: "Show English Text" },
      {name: "bilingual", content: "<span class='en'>A</span><span class='he'>א</span>", role: "radio", ariaLabel: "Show English & Hebrew Text" },
      {name: "hebrew",    content: "<span class='he'>א</span>", role: "radio", ariaLabel: "Show Hebrew Text" }
    ];
    var languageToggle = this.showLangaugeToggle() ? (
        <ToggleSet
          role="radiogroup"
          ariaLabel="Language toggle"
          label={Sefaria._("Language")}
          name="language"
          options={languageOptions}
          setOption={this.props.setOption}
          settings={this.props.settings} />) : null;

    var layoutOptions = [
      {name: "continuous", fa: "align-justify", role: "radio", ariaLabel: "Show Text as a paragram" },
      {name: "segmented", fa: "align-left", role: "radio", ariaLabel: "Show Text segmented" },
    ];
    var biLayoutOptions = [
      {name: "stacked", content: "<img src='/static/img/stacked.png' alt='Stacked Language Toggle'/>", role: "radio", ariaLabel: "Show Hebrew & English Stacked"},
      {name: "heLeft", content: "<img src='/static/img/backs.png' alt='Hebrew Left Toggle' />", role: "radio", ariaLabel: "Show Hebrew Text Left of English Text"},
      {name: "heRight", content: "<img src='/static/img/faces.png' alt='Hebrew Right Toggle' />", role: "radio", ariaLabel: "Show Hebrew Text Right of English Text"}
    ];
    var layoutToggle = this.props.settings.language !== "bilingual" ?
      this.props.parentPanel == "Sheet" ? null :
      (<ToggleSet
          role="radiogroup"
          ariaLabel="text layout toggle"
          label={Sefaria._("Layout")}
          name="layout"
          options={layoutOptions}
          setOption={this.props.setOption}
          currentLayout={this.props.currentLayout}
          settings={this.props.settings} />) :
      (this.props.width > 500 ?
        <ToggleSet
          role="radiogroup"
          ariaLabel="bidirectional text layout toggle"
          label={Sefaria._("Bilingual Layout")}
          name="biLayout"
          options={biLayoutOptions}
          setOption={this.props.setOption}
          currentLayout={this.props.currentLayout}
          settings={this.props.settings} /> : null);

    var colorOptions = [
      {name: "light", content: "", role: "radio", ariaLabel: "Toggle light mode" },
      /*{name: "sepia", content: "", role: "radio", ariaLabel: "Toggle sepia mode" },*/
      {name: "dark", content: "", role: "radio", ariaLabel: "Toggle dark mode" }
    ];
    var colorToggle = (
        <ToggleSet
          role="radiogroup"
          ariaLabel="Color toggle"
          label={Sefaria._("Color")}
          name="color"
          separated={true}
          options={colorOptions}
          setOption={this.props.setOption}
          settings={this.props.settings} />);
    colorToggle = this.props.multiPanel ? null : colorToggle;

    var sizeOptions = [
      {name: "smaller", content: Sefaria._("Aa"), role: "button", ariaLabel: Sefaria._("Decrease font size") },
      {name: "larger", content: Sefaria._("Aa"), role: "button", ariaLabel: Sefaria._("Increase font size")  }
    ];
    var sizeToggle = (
        <ToggleSet
          role="group"
          ariaLabel="Increase/Decrease Font Size Buttons"
          label={Sefaria._("Font Size")}
          name="fontSize"
          options={sizeOptions}
          setOption={this.props.setOption}
          settings={this.props.settings} />);

    var aliyahOptions = [
      {name: "aliyotOn",   content: Sefaria._("On"), role: "radio", ariaLabel: Sefaria._("Show Parasha Aliyot") },
      {name: "aliyotOff", content: Sefaria._("Off"), role: "radio", ariaLabel: Sefaria._("Hide Parasha Aliyot") },
    ];
    var aliyahToggle = this.renderAliyotToggle() ? (
      this.props.parentPanel == "Sheet" ? null :
        <ToggleSet
          role="radiogroup"
          ariaLabel="Toggle Aliyot"
          label={Sefaria._("Aliyot")}
          name="aliyotTorah"
          options={aliyahOptions}
          setOption={this.props.setOption}
          settings={this.props.settings} />) : null;
    var vowelsOptions = [
      {name: "all", content: "<span class='he'>אָ֑</span>", role: "radio", ariaLabel: Sefaria._("Show Vowels and Cantillation")},
      {name: "partial", content: "<span class='he'>אָ</span>", role: "radio", ariaLabel: Sefaria._("Show only vowel points")},
      {name: "none", content: "<span class='he'>א</span>", role: "radio", ariaLabel: Sefaria._("Show only consonantal text")}
    ];
    if(!this.props.menuOpen){
      let vowelOptionsSlice = this.vowelToggleAvailability();
      let vowelOptionsTitle = (vowelOptionsSlice == 0) ? Sefaria._("Vocalization") : Sefaria._("Vowels");
      vowelsOptions = vowelsOptions.slice(vowelOptionsSlice);
      var vowelToggle = (this.props.settings.language !== "english" && vowelsOptions.length > 1) ?
        this.props.parentPanel == "Sheet" ? null :
        (<ToggleSet
            role="radiogroup"
            ariaLabel="vowels and cantillation toggle"
            label={vowelOptionsTitle}
            name="vowels"
            options={vowelsOptions}
            setOption={this.props.setOption}
            currentLayout={this.props.currentLayout}
            settings={this.props.settings} />): null;
    }
    if (this.props.menuOpen === "search") {
      return (<div className="readerOptionsPanel" role="dialog">
                <div className="readerOptionsPanelInner">
                  {languageToggle}
                  {sizeToggle}
                </div>
            </div>);
    } else if (this.props.menuOpen) {
      return (<div className="readerOptionsPanel" role="dialog">
                <div className="readerOptionsPanelInner">
                  {languageToggle}
                </div>
            </div>);
    } else {
      return (<div className="readerOptionsPanel" role="dialog">
                <div className="readerOptionsPanelInner">
                  {languageToggle}
                  {layoutToggle}
                  {colorToggle}
                  {sizeToggle}
                  {aliyahToggle}
                  {vowelToggle}
                </div>
              </div>);
    }
  }
}
ReaderDisplayOptionsMenu.propTypes = {
  setOption:     PropTypes.func.isRequired,
  currentLayout: PropTypes.func.isRequired,
  currentBook:   PropTypes.func,
  currentData:   PropTypes.func,
  menuOpen:      PropTypes.string,
  multiPanel:    PropTypes.bool.isRequired,
  width:         PropTypes.number.isRequired,
  settings:      PropTypes.object.isRequired,
};


module.exports = ReaderPanel;
