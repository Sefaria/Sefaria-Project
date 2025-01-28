import React, {useState}  from 'react';
import Component from 'react-class';
import classNames  from 'classnames';
import ReactDOM  from 'react-dom';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import {ReaderPanelContext} from './context';
import $  from './sefaria/sefariaJquery';
import TextColumn  from './TextColumn';
import TextsPage  from './TextsPage';
import {
  ConnectionsPanel,
  ConnectionsPanelHeader,
} from './ConnectionsPanel';
import BookPage  from './BookPage';
import Sheet  from './sheets/Sheet';
import SheetMetadata  from './SheetMetadata';
import TopicPageAll  from './TopicPageAll';
import {TopicPage, TopicCategory}  from './TopicPage';
import TopicsPage from './TopicsPage';
import CollectionPage from "./CollectionPage"
import { NotificationsPanel } from './NotificationsPanel';
import { UserProfile }  from './UserProfile';
import {SheetsUserHistoryPanelWrapper, LibraryUserHistoryPanelWrapper}  from './UserHistoryPanel';
import CommunityPage  from './CommunityPage';
import CalendarsPage from './CalendarsPage'
import UserStats  from './UserStats';
import ModeratorToolsPanel  from './ModeratorToolsPanel';
import PublicCollectionsPage from './PublicCollectionsPage';
import TranslationsPage from './TranslationsPage';
import { TextColumnBannerChooser } from './TextColumnBanner';
import {
  CloseButton,
  MenuButton,
  DisplaySettingsButton,
  SaveButton,
  CategoryColorLine,
  CategoryAttribution,
} from './Misc';
import {ContentText} from "./ContentText";
import SheetsWithRefPage from "./sheets/SheetsWithRefPage";
import {ElasticSearchQuerier} from "./ElasticSearchQuerier";
import {SheetsHomePage} from "./sheets/SheetsHomePage";
import ReaderDisplayOptionsMenu from "./ReaderDisplayOptionsMenu";
import {DropdownMenu} from "./common/DropdownMenu";


class ReaderPanel extends Component {
  constructor(props) {
    super(props);

    this.state = {
      ...this.clonePanel(props.initialState),
      initialAnalyticsTracked: false,
      width: this.props.multiPanel ? 1000 : 500, // Assume we're in a small panel not using multipanel
      backButtonSettings: null,
      data: null,
    };
    this.sheetRef = React.createRef();
    this.readerContentRef = React.createRef();
  }
  conditionalSetTextData() {
    this.setState({data: null});
    if (this.state.mode === "Text" || this.state.mode === "TextAndConnections" || this.state.connectionsMode === 'Advanced Tools') {
      const ref = this.state.currentlyVisibleRef;
      Sefaria.getTextFromCurrVersions(ref, this.state.currVersions, this.props.translationLanguagePreference, true).then(data => {
        this.setState({data: data});
      })
    }
  }
  componentDidMount() {
    this.conditionalSetTextData();
    window.addEventListener("resize", this.setWidth);
    this.setWidth();
    if (this.props.panelPosition) {  //Focus on the first focusable element of the newly loaded panel. Mostly for a11y
      const curPanel = $(".readerPanel")[this.props.panelPosition];
      $(curPanel).find(':focusable').first().focus();
    }
  }
  componentWillUnmount() {
    window.removeEventListener("resize", this.setWidth);
  }
  componentWillReceiveProps(nextProps) {
    if (nextProps.searchQuery && this.state.menuOpen !== "search") {
      this.openSearch(nextProps.searchQuery);
    }
    if (this.state.menuOpen !== nextProps.initialMenu) {
      this.setState({menuOpen: nextProps.initialMenu});
    }
    this.setState(nextProps.initialState);
  }
  componentDidUpdate(prevProps, prevState) {
    if (prevProps.layoutWidth !== this.props.layoutWidth) {
      this.setWidth();
    }
    if ($('*:focus').length == 0 && this.props.multiPanel && $("body").hasClass("user-is-tabbing")) {
        const curPanel = $(".readerPanel")[($(".readerPanel").length)-1];
        $(curPanel).find(':focusable').first().focus();
    }
    this.replaceHistory = false;
    if (this.state.displaySettingsOpen) {
      $(".readerOptionsPanel").find('.on:focusable').first().focus();
    }
    if (!Sefaria.areBothVersionsEqual(prevState.currVersions, this.state.currVersions) ||
        this.state.currentlyVisibleRef !== prevState.currentlyVisibleRef ||
        this.state.connectionsMode !== prevState.connectionsMode) {
      this.conditionalSetTextData();
    }
    if (this.shouldLayoutUpdate(prevState)) {
      const newLayout = (this.state.data.primaryDirection === 'rtl') ? 'heRight' : 'heLeft';
      this.setOption('biLayout', newLayout);
    }
  }
  shouldLayoutUpdate(prevState) {
    //when we switch to two rtl (or ltr) texts and layout is side by side, we want the primary to be first
    const [data, prevData] = [this.state.data, prevState.data];
    return this.getContentLanguageOverride() === 'bilingual' &&
        this.state.settings.biLayout !== 'stacked' &&
        data !== null &&
        (data?.primaryDirection !== prevData?.primaryDirection || data?.translationDirection !== prevData?.translationDirection) &&
        data?.primaryDirection === data?.translationDirection;
  }
  conditionalSetState(state) {
    // Set state either in the central app or in the local component.
    // If setCentralState function is present, then this ReaderPanel's state is managed from within the ReaderApp component.
    // If it is not present, then the state for this ReaderPanel is managed from the component itself.
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
  getContentLanguageOverride() {
    // Determines the actual content language used inside this ReaderPanel.
    // Because it's called in the constructor, assume state isnt necessarily defined and pass
    // variables mode and menuOpen manually
    const {mode, menuOpen, connectionsMode} = this.state;
    const originalLanguage = this.state.settings.language;
    let contentLangOverride = originalLanguage;
    if (["topics", "allTopics", "calendars", "community", "collection" ].includes(menuOpen)) {   //  "story_editor",
      // Always bilingual for English interface, always Hebrew for Hebrew interface
      contentLangOverride = (Sefaria.interfaceLang === "english") ? "bilingual" : "hebrew";

    } else if ((mode === "Connections" && connectionsMode !== 'TextList') || !!menuOpen){
      // Default bilingual to interface language
      contentLangOverride = (originalLanguage === "bilingual") ? Sefaria.interfaceLang : originalLanguage;
    }
    return contentLangOverride;
  }
  getContentLanguageOverrideStateful() {
    // same as getContentLanguageOverride() but relies on values in this.state
    return this.getContentLanguageOverride(this.state.settings.language, this.state.mode, this.state.menuOpen);
  }
  clonePanel(panel) {
    // Todo: Move the multiple instances of this out to a utils file
    return Sefaria.util.clone(panel);
  }
  handleBaseSegmentClick(ref, showHighlight = true) {
    if (this.state.mode === "TextAndConnections") {
      this.closeConnectionsInPanel();
    } else if (this.state.mode === "Text") {
      Sefaria.track.event("Reader", "Open Connections Panel", ref);
      if (this.props.multiPanel) {
        this.conditionalSetState({showHighlight: showHighlight});
        this.props.onSegmentClick(ref);
      } else {
        this.openConnectionsInPanel(ref);
      }
    }
  }
  handleSheetSegmentClick(source) {
    const highlightedRefs = source.ref ? Sefaria.splitRangingRef(source.ref) : [`Sheet ${this.state.sheetID}:${source.node}`];
    this.conditionalSetState({highlightedNode: source.node, highlightedRefs});
  }
  handleCitationClick(citationRef, textRef, replace, currVersions) {
    if (this.props.multiPanel) {
      this.props.onCitationClick(citationRef, textRef, replace, currVersions);
    } else {
      this.showBaseText(citationRef, replace, currVersions, [], true);
    }
  }
  handleTextListClick(ref, replaceHistory, currVersions) {
    this.showBaseText(ref, replaceHistory, currVersions, [], false);  // don't attempt to convert commentary to base ref when opening from connections panel
  }
  openConnectionsPanel(ref, additionalState) {
    /**
     * Decides whether to open a new connections panel or to open connections in the current panel
     * depending on whether we're in multi-panel mode
     */
    if (this.props.multiPanel) {
      this.props.openConnectionsPanel(ref, null, additionalState);
    } else {
      this.openConnectionsInPanel(ref, additionalState);
    }
  }
  openConnectionsInPanel(ref, additionalState) {
    let refs = typeof ref == "string" ? [ref] : ref;
    this.replaceHistory = this.state.mode === "TextAndConnections"; // Don't push history for change in Connections focus
    let newState = {highlightedRefs: refs, mode: "TextAndConnections" };
    if (additionalState) {
      newState = {...newState, ...additionalState};
    }
    this.conditionalSetState(newState, this.replaceHistory);
  }
  onNamedEntityClick(slug, textRef, namedEntityText) {
    // make sure text list is highlighted for segment with named entity
    this.setTextListHighlight(textRef, true);

    // decide whether to open side panel in current panel or in new panel based on whether app is multipanel
    const namedEntityState = { connectionsMode: "Lexicon", selectedNamedEntity: slug, selectedNamedEntityText: namedEntityText };
    if (this.props.multiPanel) {
      this.props.openNamedEntityInNewPanel(textRef, namedEntityState);
    } else {
      this.openConnectionsInPanel([textRef], namedEntityState);
    }
  }
  closeConnectionsInPanel() {
    // Return to the original text in the ReaderPanel contents
    this.conditionalSetState({highlightedRefs: [], mode: "Text"});
  }
  handleSheetClick(e, sheet, highlightedNode, highlightedRefsInSheet) {
    e.preventDefault();
    this.conditionalSetState({
      mode: "Sheet",
      sheetID: typeof sheet === 'object' ? sheet.id : sheet, // latter case is for when 'sheet' passed is ID
      highlightedNode,
      highlightedRefsInSheet,
      menuOpen: null,
    });
  }
  setPreviousSettings(backButtonSettings) {
    this.setState({ backButtonSettings });
  }
  showBaseText(ref, replaceHistory, currVersions={en: null, he: null}, filter=[],
               convertCommentaryRefToBaseRef=true, forceOpenCommentaryPanel = false) {
    /* Set the current primary text `ref`, which may be either a string or an array of strings.
    * @param {bool} `replaceHistory` - whether to replace browser history rather than push for this change
    * @param {bool} `convertCommentaryRefToBaseRef` - whether to try to convert commentary refs like "Rashi on Genesis 3:2" to "Genesis 3:2"
    * @param {bool} `forceOpenCommentaryPanel` - see `Sefaria.isCommentaryRefWithBaseText()`
    */
    if (!ref) { return; }
    this.replaceHistory = Boolean(replaceHistory);
    convertCommentaryRefToBaseRef = this.state.compare ? false : convertCommentaryRefToBaseRef;
    // console.log("showBaseText", ref, replaceHistory);
    if (this.state.mode === "Connections" && this.props.masterPanelLanguage === "bilingual") {
      // Connections panels are forced to be mono-lingual. When opening a text from a connections panel,
      // allow it to return to bilingual.
      this.state.settings.language = "bilingual";
    }
    let refs;
    if (!Array.isArray(ref)) {
      const oRef = Sefaria.parseRef(ref);
      if (oRef.book === "Sheet") {
        this.openSheet(ref);
        return;
      }
      refs = [ref];
    }
    else {
      refs = ref;
    }
    if (this.replaceHistory) {
      this.props.saveLastPlace({ mode: "Text", refs, currVersions, settings: this.state.settings }, this.props.panelPosition);
    }
    this.props.openPanelAt(this.props.panelPosition, ref, currVersions, {settings: this.state.settings},
                          true, convertCommentaryRefToBaseRef, this.replaceHistory, false, forceOpenCommentaryPanel);
  }
  openSheet(sheetRef, replaceHistory) {
    this.replaceHistory = Boolean(replaceHistory);
    const parsedRef = Sefaria.parseRef(sheetRef);
    let [sheetID, sheetNode] = parsedRef.sections;
    sheetID = parseInt(sheetID);
    sheetNode = sheetNode ? parseInt(sheetNode) : null;
    if (this.replaceHistory) {
      // Replacing sheet history occurs after sheet data has been loaded,
      // when we have all the data we need to store history.
      this.props.saveLastPlace({ mode: "Sheet", sheetID, settings: this.state.settings}, this.props.panelPosition);
    }
    this.conditionalSetState({
      mode: 'Sheet',
      sheetID,
      highlightedNode: sheetNode,
      menuOpen: null
    });
  }
  updateTextColumn(refs) {
    // Change the refs in the current TextColumn, for infinite scroll up/down.
    this.replaceHistory = true;
    this.conditionalSetState({ refs: refs });
  }
  setTextListHighlight(refs, showHighlight) {
    refs = typeof refs === "string" ? [refs] : refs;
    this.replaceHistory = true;
    if (!Sefaria.util.object_equals(refs, this.state.highlightedRefs)) {
      this.props.closeNamedEntityInConnectionPanel();
    }
    this.conditionalSetState({highlightedRefs: refs, showHighlight: showHighlight});
    this.props.setTextListHighlight(refs);
  }
  setFocusedText(refs) {
    refs = typeof refs === "string" ? [refs] : refs;
    this.replaceHistory = true;
    this.conditionalSetState({highlightedRefs: refs});
    if (this.props.multiPanel) {
      this.props.setTextListHighlight(refs);
    }
  }
  updateCollectionName(name) {
    // Replace history with collection name, which may be loaded from API with slug
    // after the CollectionPage has initiall rendered.
    this.replaceHistory = true;
    this.conditionalSetState({ collectionName: name });
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
  clearSelectedWords() {
    this.replaceHistory = false;
    if (this.props.multiPanel) {
      this.props.clearSelectedWords();
    } else {
      this.conditionalSetState({'selectedWords':  ''});
    }
  }
  closeMenus() {
    let state = {
      // If there's no content to show, return to navigation
      menuOpen: this.state.refs.slice(-1)[0] ? null: "navigation",
      navigationCategories: null,
      navigationTopicCategory: null,
    };
    this.conditionalSetState(state);
  }
  closeSheetMetaData() {
    let state = {
      menuOpen: null,
      mode: "Sheet",
      navigationCategories: null,
      navigationTopicCategory: null,
    };
    this.conditionalSetState(state);

  }
  openMenu(menu) {
    this.conditionalSetState({
      menuOpen: menu,
      mode: "Text",
      initialAnalyticsTracked: false,
      navigationCategories: null,
      navigationTopic: null,
      navigationTopicTitle: null,
      topicTitle: null,
    });
  }
  setNavigationCategories(categories) {
    this.conditionalSetState({navigationCategories: categories});
  }
  setNavigationTopic(topic, topicTitle) {
    this.conditionalSetState({
      menuOpen: 'topics',
      navigationTopicCategory: topic,
      navigationTopicTitle: topicTitle,
      navigationTopic: null,
      topicTitle: null,
      navigationCategories: null,
    });
  }
  setCollectionTag (tag) {
    this.conditionalSetState({collectionTag: tag});
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
  setVersionFilter(filter, prevConnectionsMode) {
    if (this.props.setVersionFilter) {
      this.props.setVersionFilter(filter, prevConnectionsMode);
    } else {
      const filtInd = Sefaria.util.inArray(filter, this.state.recentVersionFilters);
      if (filtInd === -1) {
        this.state.recentVersionFilters = [filter].concat(this.state.recentVersionFilters);
      }
      filter = filter ? [filter] : [];
      this.conditionalSetState({recentVersionFilters: this.state.recentVersionFilters, versionFilter: filter, connectionsMode: "Translation Open"});
    }
  }
  setWebPagesFilter(filter) {
    this.conditionalSetState({webPagesFilter: filter, connectionsMode: "WebPagesList"});
  }
  setTopic(navigationTopic, topicTitle) {
    this.conditionalSetState({
      menuOpen: "topics",
      navigationTopicCategory: null,
      topicTestVersion: this.props.topicTestVersion,
      navigationTopic,
      topicTitle
    });
  }
  openCompareTextTOC(title) {
    // Opens the book TOC in a compare panel
    console.log("openCompareTextTOC")
    this.conditionalSetState({
      menuOpen: "book toc",
      compare: true,
      bookRef: title,
      previousCategories: this.state.navigationCategories,
    });
  }
  toggleLanguage() {
    if (this.state.settings.language === "hebrew") {
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
  setDisplaySettingsOpen(bool) {
    this.conditionalSetState({displaySettingsOpen: bool});
  }
  getLayoutCategory() {
    const category = this.currentCategory();
    return category === "Tanakh" || category === "Talmud" ? "layout" + category : "layoutDefault";
  }
  setOption(option, value) {
    if (option === "fontSize") {
      const step = 1.15;
      const size = this.state.settings.fontSize;
      value = (value === "smaller" ? size/step : size*step);
    } else if (option === "layout") {
      option = this.getLayoutCategory();
    }

    this.state.settings[option] = value;
    let state = {settings: this.state.settings};
    if (option !== "fontSize") { state.displaySettingsOpen = false; }
    if (option === "language") {
      $.cookie("contentLang", value, {path: "/"});
      this.replaceHistory = true;
      this.props.setDefaultOption && this.props.setDefaultOption(option, value);
    }
    $.cookie(option, value, {path: "/"});
    this.conditionalSetState(state);
  }
  setConnectionsMode(mode, connectionData = null) {
    let loginRequired = {
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
    let state = {connectionsMode: mode};
    if (mode === "Resources") {
      this.setFilter();
    }
    state["connectionData"] = !!connectionData ? connectionData : null;
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
  setCurrentlyVisibleRef(ref) {
    this.replaceHistory = true;
    //var ref = this.state.highlightedRefs.length ? Sefaria.normRef(this.state.highlightedRefs) : ref;
    this.conditionalSetState({
      currentlyVisibleRef: ref,
    });
  }
  setTab(tab, replaceHistoryIfReaderAppUpdated=false) {
    // There is a race condition such that when navigating to a new page that has a TabView component, sometimes TabView
    // mounts before ReaderApp's componentDidUpdate gets called, which results in setTab calling conditionalSetState
    // before the previous page's history state has been pushed to the history object. If this happens, we want
    // this.replaceHistory to be false so that we don't override the previous page's history.
    // If history.state.panels[0].mode is undefined, we know that conditionalSetState has been called already, and we
    // can replace the history state. Otherwise, we want to push the history state, so we set replaceHistory to false.
    this.replaceHistory = replaceHistoryIfReaderAppUpdated ?
        history.state ? !history.state.panels[0].mode : true // on page load history state may not yet exist -- in that case force update
        : false
    this.conditionalSetState({tab: tab})
  }
  onSetTopicSort(topicSort) {
    this.conditionalSetState({topicSort});
  }
  currentMode() {
    return this.state.mode;
  }
  currentRef() {
    // Returns a string of the current ref, the first if there are many
    return this.state.refs && this.state.refs.length ? this.state.refs[0]
            : this.state.highlightedRefs && this.state.highlightedRefs ? this.state.highlightedRefs[0]
              : null;
  }
  currentBook() {
    let data = this.state.data;
    if (data) {
      return data.indexTitle;
    } else {
      let pRef = Sefaria.parseRef(this.currentRef());
      return "index" in pRef ? pRef.index : ("book" in pRef ? pRef.book : null);
    }
  }
  currentCategory() {
    if (this.state.mode == "Sheet") {
      return "Sheets"
    }
    else {
      const book = this.currentBook();
      return (Sefaria.index(book) ? Sefaria.index(book)['primary_category'] : null);
    }
  }
  currentLayout() {
    if (this.state.settings.language == "bilingual") {
      return this.state.width > 500 ? this.state.settings.biLayout : "stacked";
    }
    // dont allow continuous mode in sidebar since it's currently not possible to control layout from sidebar
    if (this.state.mode === "Connections") {return "segmented"}
    const option = this.getLayoutCategory();
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
  whereIsElementInViewport(element) {
    const elementbbox = element.getBoundingClientRect();
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
    if (elementbbox.top >= 200 && elementbbox.bottom < vh) {
        return "in viewport"
    }
    if (elementbbox.bottom >= vh/2 && element) {
        return "past half"
    }
  };
  getHighlightedByScrollPos() {
    let segmentToHighlight = null

    const segments = this.readerContentRef.current.querySelectorAll(".sheetItem");

    for (let segment of segments) {
        const elementLoc = this.whereIsElementInViewport(segment);
        if (elementLoc === "in viewport" || elementLoc === "past half") {
            segmentToHighlight = segment;
            break;
        }
    }

    return segmentToHighlight
  };
  openSidePanel() {
    const highlighted = this.getHighlightedByScrollPos();
    highlighted.click();
  }
  getPanelType() {
    const {menuOpen, tab, navigationTopic, navigationTopicCategory} = this.state;
    if (menuOpen === "topics") {
      if (navigationTopicCategory) {
        return "Topic Navigation";
      } else if (navigationTopic) {
        return `${menuOpen}_${tab}`;
      } else {
        return "Topic Landing";
      }
    }
  }
  getPanelName() {
    const {menuOpen, navigationTopic, navigationTopicCategory} = this.state;
    if (menuOpen === "topics") {
      return navigationTopicCategory || navigationTopic || "Explore by Topic";
    }
  }
  getPanelNumber() {
    // TODO update for commentary panels
    return this.props.panelPosition+1;
  }
  getAnalyticsData() {
    return {
      panel_type: this.getPanelType(),
      panel_number: this.getPanelNumber(),
      content_lang: this.getContentLanguageOverrideStateful(),
      panel_name: this.getPanelName(),
    };
  }
  render() {
    if (this.state.error) {
      return (
        <div
        ref={this.readerContentRef}
        className="readerContent">
          <div className="readerError">
            <span className="int-en">Something went wrong! Please use the back button or the menus above to get back on track.</span>
            <span className="int-he">ארעה תקלה במערכת. אנא חזרו לתפריט הראשי או אחורנית על ידי שימוש בכפתורי התפריט או החזור.</span>
            <div className="readerErrorText">
              <span className="int-en">Error Message: </span>
              <span className="int-he">שגיאה: </span>
              {this.state.error}
            </div>
          </div>
        </div>
      );
    }

    let items = [];
    let menu = null;
    const readerPanelContextData = {
      language: this.getContentLanguageOverride(),
      isMenuOpen: this.state.displaySettingsOpen,
      setIsMenuOpen: this.setDisplaySettingsOpen,
      setOption: this.setOption,
      textsData: this.state.data,
      layout: this.currentLayout(),
      panelMode: this.state.mode,
      aliyotShowStatus: this.state.settings.aliyotTorah,
      vowelsAndCantillationState: this.state.settings.vowels,
      punctuationState: this.state.settings.punctuationTalmud,
      width: this.state.width,
    };
    const contextContentLang = {"language": this.getContentLanguageOverrideStateful()};

    if (this.state.mode === "Text" || this.state.mode === "TextAndConnections") {
      const oref  = Sefaria.parseRef(this.state.refs[0]);
      const showHighlight = this.state.showHighlight || (this.state.highlightedRefs.length > 1);
      const index = oref && oref.index ? Sefaria.index(oref.index) : null;
      const [textColumnBookTitle, heTextColumnBookTitle] = index ? [index.title, index.heTitle] : [null, null];
      items.push(
        <TextColumn
          panelPosition ={this.props.panelPosition}
          srefs={this.state.refs.slice()}
          currVersions={this.state.currVersions}
          highlightedRefs={this.state.highlightedRefs}
          currentlyVisibleRef={this.state.currentlyVisibleRef}
          showHighlight={showHighlight}
          basetext={true}
          bookTitle={textColumnBookTitle}
          heBookTitle={heTextColumnBookTitle}
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
          onNamedEntityClick={this.onNamedEntityClick}
          setTextListHighlight={this.setTextListHighlight}
          setCurrentlyVisibleRef={this.setCurrentlyVisibleRef}
          setSelectedWords={this.setSelectedWords}
          selectedWords={this.state.selectedWords}
          panelsOpen={this.props.panelsOpen}
          layoutWidth={this.props.layoutWidth}
          filter={this.state.filter}
          textHighlights={this.state.textHighlights}
          unsetTextHighlight={this.props.unsetTextHighlight}
          translationLanguagePreference={this.props.translationLanguagePreference}
          navigatePanel={this.props.navigatePanel}
          key={`${textColumnBookTitle ? textColumnBookTitle : "empty"}-TextColumn`} />
      );
    }
    if (this.state.mode === "Sheet") {
      menu = <Sheet
          panelPosition ={this.props.panelPosition}
          id={this.state.sheetID}
          key={"sheet-"+this.state.sheetID}
          multiPanel={this.props.multiPanel}
          highlightedNode={this.state.highlightedNode}
          highlightedRefs={this.state.highlightedRefs}
          highlightedRefsInSheet={this.state.highlightedRefsInSheet}
          scrollToHighlighted={this.state.scrollToHighlighted}
          onSegmentClick={this.handleSheetSegmentClick}
          onCitationClick={this.handleCitationClick}
          openSheet={this.openSheet}
          setSelectedWords={this.setSelectedWords}
          contentLang={this.state.settings.language}
          setDivineNameReplacement={this.props.setDivineNameReplacement}
          divineNameReplacement={this.props.divineNameReplacement}
          historyObject={this.props.getHistoryObject(this.state, false)}
          toggleSignUpModal={this.props.toggleSignUpModal}
        />;
    }

    if (this.state.mode === "Connections" || this.state.mode === "TextAndConnections") {
      const langMode = this.props.masterPanelLanguage || this.state.settings.language;
      let data     = this.state.data;
      const canEditText = data &&
                        ((langMode === "hebrew" && data.heVersionStatus !== "locked") ||
                        (langMode === "english" && data.versionStatus !== "locked") ||
                        (Sefaria.is_moderator && langMode !== "bilingual"));
      items.push(
        <ConnectionsPanel
          panelPosition ={this.props.panelPosition}
          selectVersion={this.props.selectVersion}
          srefs={this.state.mode === "Connections" ? this.state.refs.slice() : this.state.highlightedRefs.slice()}
          filter={this.state.filter || []}
          mode={this.state.connectionsMode || "Resources"}
          recentFilters={this.state.recentFilters}
          connectionsCategory={this.state.connectionsCategory}
          connectionData={this.state.connectionData}
          interfaceLang={this.props.interfaceLang}
          contentLang={this.state.settings.language}
          title={this.currentBook()}
          currentlyVisibleRef={this.state.currentlyVisibleRef}
          currVersions={this.state.currVersions}
          fullPanel={this.props.multiPanel}
          multiPanel={this.props.multiPanel}
          allOpenRefs={this.props.allOpenRefs}
          canEditText={canEditText}
          setFilter={this.setFilter}
          scrollPosition={this.state.sideScrollPosition || 0}
          setSideScrollPosition={this.props.setSideScrollPosition}
          toggleSignUpModal={this.props.toggleSignUpModal}
          setConnectionsMode={this.setConnectionsMode}
          setConnectionsCategory={this.setConnectionsCategory}
          webPagesFilter={this.state.webPagesFilter}
          setWebPagesFilter={this.setWebPagesFilter}
          nodeRef={this.state.nodeRef}
          closeConectionsInPanel={this.closeConnectionsInPanel}
          handleSheetClick={this.handleSheetClick}
          openNav={this.openMenu.bind(null, "navigation")}
          editNote={this.editNote}
          noteBeingEdited={this.state.noteBeingEdited}
          onTextClick={this.handleTextListClick}
          onCitationClick={this.handleCitationClick}
          openComparePanel={this.props.openComparePanel}
          closePanel={this.props.closePanel}
          selectedWords={this.state.selectedWords}
          sidebarSearchQuery={this.state.sidebarSearchQuery}
          onSidebarSearchClick={this.props.onSidebarSearchClick}
          selectedNamedEntity={this.state.selectedNamedEntity}
          selectedNamedEntityText={this.state.selectedNamedEntityText}
          clearSelectedWords={this.clearSelectedWords}
          clearNamedEntity={this.props.clearNamedEntity}
          setSidebarSearchQuery={this.props.setSidebarSearchQuery}
          masterPanelLanguage={this.props.masterPanelLanguage}
          masterPanelMode={this.props.masterPanelMode}
          versionFilter={this.state.versionFilter}
          recentVersionFilters={this.state.recentVersionFilters}
          setVersionFilter={this.setVersionFilter}
          viewExtendedNotes={this.props.viewExtendedNotes.bind(null, "Connections")}
          checkIntentTimer={this.props.checkIntentTimer}
          navigatePanel={this.props.navigatePanel}
          translationLanguagePreference={this.props.translationLanguagePreference}
          setDivineNameReplacement={this.props.setDivineNameReplacement}
          divineNameReplacement={this.props.divineNameReplacement}
          setPreviousSettings={this.setPreviousSettings}
          filterRef={this.state.filterRef}
          backButtonSettings={this.state.backButtonSettings}
          key="connections" />
      );
    }

    if (this.state.menuOpen === "navigation") {

      const openNav = this.state.compare ? this.props.openComparePanel : this.openMenu.bind(null, "navigation");
      const openTextTOC = this.state.compare ? this.openCompareTextTOC : null;

      menu = (<TextsPage
                    key={this.state.navigationCategories ? this.state.navigationCategories.join("-") : this.state.navigationTopicCategory ? this.state.navigationTopicCategory: "navHome"}
                    compare={this.state.compare}
                    multiPanel={this.props.multiPanel}
                    categories={this.state.navigationCategories || []}
                    settings={this.state.settings}
                    setCategories={this.setNavigationCategories}
                    openTextTOC={openTextTOC}
                    setOption={this.setOption}
                    toggleLanguage={this.toggleLanguage}
                    onCompareBack={this.props.closePanel}
                    openSearch={this.openSearch}
                    initialWidth={this.state.width}
                    toggleSignUpModal={this.props.toggleSignUpModal} />);
    } else if (this.state.menuOpen === "sheetsWithRef") {
      menu = (<SheetsWithRefPage srefs={this.state.sheetsWithRef.en}
                                 searchState={this.state['searchState']}
                                 updateSearchState={this.props.updateSearchState}
                                 updateAppliedFilter={this.props.updateSearchFilter}
                                 updateAppliedOptionField={this.props.updateSearchOptionField}
                                 updateAppliedOptionSort={this.props.updateSearchOptionSort}
                                 registerAvailableFilters={this.props.registerAvailableFilters}
                                 resetSearchFilters={this.props.resetSearchFilters}
                                 onResultClick={this.handleSheetClick}/>);
    } else if (this.state.menuOpen === "sheet meta") {
      menu = (<SheetMetadata
                    mode={this.state.menuOpen}
                    toggleSignUpModal={this.props.toggleSignUpModal}
                    interfaceLang={this.props.interfaceLang}
                    close={this.closeSheetMetaData}
                    id={this.state.sheetID}
                    versionLanguage={this.state.versionLanguage}
                    settingsLanguage={this.state.settings.language == "hebrew"?"he":"en"}
                    narrowPanel={!this.props.multiPanel}
                    currentRef={this.state.currentlyVisibleRef}
                    openNav={this.openMenu.bind(null, "navigation")}
                    openDisplaySettings={this.openDisplaySettings}
                    selectVersion={this.props.selectVersion}
                    showBaseText={this.showBaseText} />);
    } else if (this.state.menuOpen === "book toc") {
      const onCompareBack = () => {
        this.conditionalSetState({
          menuOpen: "navigation",
          navigationCategories: this.state.previousCategories,
        });
      };
      menu = (<BookPage
                    tab={this.state.tab}
                    setTab={this.setTab}
                    mode={this.state.menuOpen}
                    multiPanel={this.props.multiPanel}
                    close={this.closeMenus}
                    title={this.state.bookRef}
                    currVersions={this.state.currVersions}
                    settingsLanguage={this.state.settings.language == "hebrew"?"he":"en"}
                    toggleLanguage={this.toggleLanguage}
                    category={Sefaria.index(this.state.bookRef).primary_category}
                    currentRef={this.state.bookRef}
                    compare={this.state.compare}
                    onCompareBack={onCompareBack}
                    narrowPanel={!this.props.multiPanel}
                    key={this.state.bookRef}
                    selectVersion={this.props.selectVersion}
                    showBaseText={this.showBaseText}
                    viewExtendedNotes={this.props.viewExtendedNotes.bind(null, "toc")} />);

    } else if (this.state.menuOpen === "extended notes" && this.state.mode !== "Connections") {
      menu = (<BookPage
                    tab={this.state.tab}
                    setTab={this.setTab}
                    mode={this.state.menuOpen}
                    interfaceLang={this.props.interfaceLang}
                    close={this.closeMenus}
                    title={this.state.bookRef ? this.state.bookRef : this.currentBook()}
                    currVersions={this.state.currVersions}
                    settingsLanguage={this.state.settings.language == "hebrew"?"he":"en"}
                    category={Sefaria.index(this.state.bookRef) ? Sefaria.index(this.state.bookRef).primary_category : this.currentCategory()}
                    currentRef={this.state.bookRef ? this.state.bookRef : this.state.currentlyVisibleRef}
                    narrowPanel={!this.props.multiPanel}
                    selectVersion={this.props.selectVersion}
                    showBaseText={this.showBaseText}
                    backFromExtendedNotes={
                      this.state.mode==="Connections" ? this.closeMenus : this.backFromExtendedNotes
                    }/>);

    } else if (this.state.menuOpen === "search" && this.state.searchQuery) {
      menu = (<ElasticSearchQuerier
                    query={this.state.searchQuery}
                    searchState={this.state['searchState']}
                    resetSearchFilters={this.props.resetSearchFilters}
                    settings={Sefaria.util.clone(this.state.settings)}
                    panelsOpen={this.props.panelsOpen}
                    onResultClick={this.props.onSearchResultClick}
                    toggleLanguage={this.toggleLanguage}
                    close={this.props.closePanel}
                    onQueryChange={this.props.onQueryChange}
                    updateAppliedFilter={this.props.updateSearchFilter}
                    updateAppliedOptionField={this.props.updateSearchOptionField}
                    updateAppliedOptionSort={this.props.updateSearchOptionSort}
                    registerAvailableFilters={this.props.registerAvailableFilters}
                    compare={this.state.compare}/>);
    } else if (this.state.menuOpen === "topics") {
      if (this.state.navigationTopicCategory) {
        menu = (
          <TopicCategory
            topic={this.state.navigationTopicCategory}
            topicTitle={this.state.navigationTopicTitle}
            setTopic={this.setTopic}
            setNavTopic={this.setNavigationTopic}
            interfaceLang={this.props.interfaceLang}
            compare={this.state.compare}
            initialWidth={this.state.width}
            openSearch={this.openSearch}
          />
        );
      } else if (this.state.navigationTopic) {
        menu = (
          <TopicPage
            tab={this.state.tab}
            setTab={this.setTab}
            onSetTopicSort={this.onSetTopicSort}
            topicSort={this.state.topicSort}
            topic={this.state.navigationTopic}
            topicTitle={this.state.topicTitle}
            interfaceLang={this.props.interfaceLang}
            setTopic={this.setTopic}
            setNavTopic={this.setNavigationTopic}
            openTopics={this.openMenu.bind(null, "topics")}
            showBaseText={this.props.onNavTextClick || this.showBaseText}
            openNav={this.openMenu.bind(null, "navigation")}
            openSearch={this.openSearch}
            close={this.closeMenus}
            multiPanel={this.props.multiPanel}
            navHome={this.openMenu.bind(null, "navigation")}
            toggleSignUpModal={this.props.toggleSignUpModal}
            translationLanguagePreference={this.props.translationLanguagePreference}
            topicTestVersion={this.props.topicTestVersion}
            key={"TopicPage"}
          />
        );
      } else {
        menu = (
          <TopicsPage
            key={"TopicsPage"}
            setNavTopic={this.setNavigationTopic}
            multiPanel={this.props.multiPanel}
            initialWidth={this.state.width}
          />
        );
      }

    } else if (this.state.menuOpen === "allTopics") {
      menu = (
        <TopicPageAll
          interfaceLang={this.props.interfaceLang}
          topicLetter={this.state.navigationTopicLetter}
          intiialWidth={this.state.width}
          setTopic={this.setTopic}
          openNav={this.openMenu.bind(null, "navigation")}
          close={this.closeMenus}
          multiPanel={this.props.multiPanel}
          toggleLanguage={this.toggleLanguage}
          navHome={this.openMenu.bind(null, "navigation")}
          key={"TopicPageAll"} />
      );

    } else if (this.state.menuOpen === "notifications") {
      menu = (
        <NotificationsPanel
          setUnreadNotificationsCount={this.props.setUnreadNotificationsCount}
          interfaceLang={this.props.interfaceLang} />
      );

    } else if (this.state.menuOpen === "collection") {
      menu = (
        <CollectionPage
          name={this.state.collectionName}
          setTab={this.setTab}
          tab={this.state.tab}
          slug={this.state.collectionSlug}
          tag={this.state.collectionTag}
          setCollectionTag={this.setCollectionTag}
          width={this.state.width}
          searchInCollection={this.props.searchInCollection}
          toggleLanguage={this.toggleLanguage}
          toggleSignUpModal={this.props.toggleSignUpModal}
          updateCollectionName={this.updateCollectionName}
          navHome={this.openMenu.bind(null, "navigation")}
          multiPanel={this.props.multiPanel}
          initialWidth={this.state.width}
          interfaceLang={this.props.interfaceLang} />
      );

    } else if (this.state.menuOpen === "collectionsPublic") {
      menu = (
        <PublicCollectionsPage
          multiPanel={this.props.multiPanel}
          initialWidth={this.state.width} />
      );

    } else if (this.state.menuOpen === "translationsPage") {
      menu = <TranslationsPage
        translationsSlug={this.state.translationsSlug}
      />
    }
    else if (this.state.menuOpen === "community") {
      menu = (
        <CommunityPage
          multiPanel={this.props.multiPanel}
          toggleSignUpModal={this.props.toggleSignUpModal}
          initialWidth={this.state.width} />
      );

    } else if (this.state.menuOpen === "user_stats") {
      menu = (<UserStats />);

    } else if (this.state.menuOpen === "modtools") {
      menu = (
        <ModeratorToolsPanel
          interfaceLang={this.props.interfaceLang} />
      );

    } else if (["texts-saved", "texts-history", "notes"].includes(this.state.menuOpen)) {
      menu = (
          <LibraryUserHistoryPanelWrapper
              multiPanel={this.props.multiPanel}
              menuOpen={this.state.menuOpen}
              openMenu={this.openMenu}
              openNav={this.openMenu.bind(null, "navigation")}
              openDisplaySettings={this.openDisplaySettings}
              toggleLanguage={this.toggleLanguage}
              compare={this.state.compare}
              toggleSignUpModal={this.props.toggleSignUpModal}/>
      );

    } else if (["sheets-saved", "sheets-history"].includes(this.state.menuOpen)) {
      menu = (
          <SheetsUserHistoryPanelWrapper
              multiPanel={this.props.multiPanel}
              menuOpen={this.state.menuOpen}
              openMenu={this.openMenu}
              openNav={this.openMenu.bind(null, "navigation")}
              openDisplaySettings={this.openDisplaySettings}
              toggleLanguage={this.toggleLanguage}
              compare={this.state.compare}
              toggleSignUpModal={this.props.toggleSignUpModal}/>
      );

    } else if (this.state.menuOpen === "sheets") {
      menu = (<SheetsHomePage setNavTopic={this.setNavigationTopic}
                              multiPanel={this.props.multiPanel}
                              setTopic={this.setTopic}/>);
    } else if (this.state.menuOpen === "profile") {
      menu = (
        <UserProfile
          profile={this.state.profile}
          tab={this.state.tab}
          setTab={this.setTab}
          toggleSignUpModal={this.props.toggleSignUpModal}
          multiPanel={this.props.multiPanel}
          navHome={this.openMenu.bind(null, "navigation")} />
      );

    } else if (this.state.menuOpen === "calendars") {
      menu = (
        <CalendarsPage
          multiPanel={this.props.multiPanel}
          initialWidth={this.state.width} />
      );
    }

    let classes  = {readerPanel: 1, serif: 1, narrowColumn: this.state.width < 730};
    classes[readerPanelContextData.language] = 1;
    classes[this.currentLayout()]        = 1;
    classes[this.state.settings.color]   = 1;
    if (readerPanelContextData.language !== 'bilingual' || !this.state.data?.text?.length) {
      let isPrimaryShown = readerPanelContextData.language === 'hebrew' || !this.state.data?.text?.length;
      let primaryOrTranslation = isPrimaryShown ? 'primary' : 'translation';
      let direction = this.state.data?.[`${primaryOrTranslation}Direction`];
      classes[direction] = 1;
    }
    classes = classNames(classes);

    const style = {"fontSize": this.state.settings.fontSize + "%"};

    const sheet = Sefaria.sheets.loadSheetByID(this.state.sheetID);
    const sheetTitle = !!sheet ? sheet.title.stripHtmlConvertLineBreaks() : null;

    const hideReaderControls = (
      this.state.mode === "TextAndConnections" ||
      this.state.mode === "Sheet" ||
      this.state.menuOpen ||
      this.props.hideNavHeader
    );
    return (
      <ReaderPanelContext.Provider value={readerPanelContextData}>
        <div ref={this.readerContentRef} className={classes} onKeyDown={this.handleKeyPress} role="region"
             id={"panel-"+this.props.panelPosition} data-anl-batch={JSON.stringify(this.getAnalyticsData())}>
          {hideReaderControls ? null :
            <ReaderControls
              showBaseText={this.showBaseText}
              hasSidebar={this.state.hasSidebar}
              toggleSheetEditMode={this.toggleSheetEditMode}
              currentRef={this.state.currentlyVisibleRef}
              highlightedRefs={this.state.highlightedRefs}
              sheetID={this.state.sheetID}
              sheetTitle={sheetTitle}
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
              onTextTitleClick={this.handleBaseSegmentClick}
              onSheetTitleClick={this.handleSheetSegmentClick}
              openMobileNavMenu={this.props.openMobileNavMenu}
              onError={this.onError}
              openConnectionsPanel={this.openConnectionsPanel}
              connectionsMode={this.state.filter.length && this.state.connectionsMode === "Connections" ? "Connection Text" : this.state.connectionsMode}
              connectionsCategory={this.state.connectionsCategory}
              closePanel={this.props.closePanel}
              toggleLanguage={this.toggleLanguage}
              interfaceLang={this.props.interfaceLang}
              toggleSignUpModal={this.props.toggleSignUpModal}
              historyObject={this.props.getHistoryObject(this.state, this.props.hasSidebar)}
              connectionData={this.state.connectionData}
              translationLanguagePreference={this.props.translationLanguagePreference}
              setTranslationLanguagePreference={this.props.setTranslationLanguagePreference}
              data={this.state.data}
              backButtonSettings={this.state.backButtonSettings}
            />}

          {(items.length > 0 && !menu) ?
          <div className="readerContent" style={style}>
            {items}
          </div> : null}

          {menu}

        </div>
      </ReaderPanelContext.Provider>
    );
  }
}
ReaderPanel.propTypes = {
  initialState:                PropTypes.object,
  interfaceLang:               PropTypes.string,
  setCentralState:             PropTypes.func,
  onSegmentClick:              PropTypes.func,
  onCitationClick:             PropTypes.func,
  openNamedEntityInNewPanel:   PropTypes.func,
  onNavTextClick:              PropTypes.func,
  onSearchResultClick:         PropTypes.func,
  onUpdate:                    PropTypes.func,
  onError:                     PropTypes.func,
  closePanel:                  PropTypes.func,
  closeMenus:                  PropTypes.func,
  setConnectionsFilter:        PropTypes.func,
  setSideScrollPosition:       PropTypes.func,
  setDefaultOption:            PropTypes.func,
  selectVersion:               PropTypes.func,
  viewExtendedNotes:           PropTypes.func,
  backFromExtendedNotes:       PropTypes.func,
  unsetTextHighlight:          PropTypes.func,
  onQueryChange:               PropTypes.func,
  updateSearchFilter:          PropTypes.func,
  updateSearchOptionField:     PropTypes.func,
  updateSearchOptionSort:      PropTypes.func,
  registerAvailableFilters:    PropTypes.func,
  searchInCollection:          PropTypes.func,
  openComparePanel:            PropTypes.func,
  setUnreadNotificationsCount: PropTypes.func,
  highlightedRefs:             PropTypes.array,
  multiPanel:                  PropTypes.bool,
  masterPanelLanguage:         PropTypes.string,
  panelsOpen:                  PropTypes.number,
  allOpenRefs:                 PropTypes.array,
  hasSidebar:                  PropTypes.bool,
  layoutWidth:                 PropTypes.number,
  setTextListHighlight:        PropTypes.func,
  setSelectedWords:            PropTypes.func,
  analyticsInitialized:        PropTypes.bool,
  setVersionFilter:            PropTypes.func,
  saveLastPlace:               PropTypes.func,
  setDivineNameReplacement:    PropTypes.func,
  checkIntentTimer:            PropTypes.func,
  toggleSignUpModal:           PropTypes.func.isRequired,
  getHistoryRef:               PropTypes.func,
  profile:                     PropTypes.object,
  masterPanelMode:             PropTypes.string,
  masterPanelSheetId:          PropTypes.number,
  translationLanguagePreference: PropTypes.string,
  setTranslationLanguagePreference: PropTypes.func.isRequired,
  topicTestVersion:            PropTypes.string,
};


class ReaderControls extends Component {
  // The Header of a Reader panel when looking at a text
  // contains controls for display, navigation etc.
  constructor(props) {
    super(props);
    this.state = {
      displayVersionTitle: {},  // lang codes as keys and version title to display in header as values. prefers shortVersionTitle when available but falls back on versionTitle
    };
  }
  openTextConnectionsPanel(e) {
    e.preventDefault();
    if(!this.props.hasSidebar){ //Prevent click on title from opening connections panel if its already open
      Sefaria.track.event("Reader", "Open Connections Panel from Header", this.props.currentRef);
      this.props.onTextTitleClick(this.props.currentRef, false);
    }
  }
  openSheetConnectionsPanel(e) {
    e.preventDefault();
    this.props.onSheetTitleClick(0);
  }
  shouldShowVersion(props) {
    props = props || this.props;
    // maybe one day sheets will have versions (e.g Nachama) but for now, let's ignore that possibility
    return !props.sheetID && (props.settings.language === "english" || props.settings.language === "bilingual");
  }
  setDisplayVersionTitle(version) {
    const en = version.shortVersionTitle || version.versionTitle;
    this.setState({
      displayVersionTitle: {
        en,
        he: version.shortVersionTitleInHebrew || en,
      }
    });
  }
  loadTranslations() {
    /**
     * Preload translation versions to get shortVersionTitle to display
     */
    const data = this.props.data;
    if (!data) {return;}
    if (data.sources) {
      // merged version from API
      this.setDisplayVersionTitle({});
      return;
    }
    for (const version of Object.values(data.available_versions)) {
      if (!version.isSource && version.versionTitle === data.versionTitle) {
        this.setDisplayVersionTitle(version);
        break;
      }
    }
  }
  openTranslations() {
    this.props.openConnectionsPanel([this.props.currentRef], {"connectionsMode": "Translations"});
  }
  componentDidMount() {
    this.loadTranslations();
  }
  componentDidUpdate(prevProps, prevState) {
    if (this.props.data && (
      this.shouldShowVersion() !== this.shouldShowVersion(prevProps) ||
      this.props.data.versionTitle !== prevProps.data?.versionTitle ||
      this.props.currentRef !== prevProps.currentRef
      )
    ) {
      this.loadTranslations();
    }
  }
  componentWillUnmount() {
    if (this.state.runningQuery) {
      this.state.runningQuery.cancel();
    }
  }
  stopPropagation(e){
    e.stopPropagation();
  }
  render() {
    let title = this.props.currentRef || "";
    let heTitle = "";
    let sectionString = "";
    let heSectionString = "";
    let categoryAttribution = null;
    const data = this.props.data;

    if (this.props.sheetID) {
      if (this.props.sheetTitle === null) {
        title = heTitle = Sefaria._("Loading...");
      } else {
        title = heTitle = this.props.sheetTitle;
        if (title === "") {
          title = heTitle = Sefaria._("Untitled")
        }
      }

    } else if (data) {
      sectionString = data.ref.replace(data.indexTitle, "");
      heSectionString = data.heRef.replace(data.heIndexTitle, "");
      title = data.indexTitle;
      heTitle = data.heIndexTitle;
      categoryAttribution = data && Sefaria.categoryAttribution(data.categories);
    }

    const mode              = this.props.currentMode();
    const hideHeader        = !this.props.multiPanel && mode === "Connections";
    const connectionsHeader = this.props.multiPanel && mode === "Connections";
    let displayVersionTitle = this.props.settings.language === 'hebrew' ? this.state.displayVersionTitle.he : this.state.displayVersionTitle.en;
    if (categoryAttribution && displayVersionTitle) { displayVersionTitle = `(${displayVersionTitle})`; }
    const url = this.props.sheetID ? "/sheets/" + this.props.sheetID : data ? "/" + Sefaria.normRef(data.book) : Sefaria.normRef(this.props.currentRef);
    const readerTextTocClasses = classNames({readerTextToc: 1, attributed: !!categoryAttribution || this.shouldShowVersion(), connected: this.props.hasSidebar});


    let centerContent = connectionsHeader ?
      <div className="readerTextToc">
        <ConnectionsPanelHeader
          connectionsMode={this.props.connectionsMode}
          previousCategory={this.props.connectionsCategory}
          previousMode={this.props.connectionData?.previousMode}
          multiPanel={this.props.multiPanel}
          setConnectionsMode={this.props.setConnectionsMode}
          setConnectionsCategory={this.props.setConnectionsCategory}
          closePanel={this.props.closePanel}
          toggleLanguage={this.props.toggleLanguage}
          interfaceLang={this.props.interfaceLang}
          backButtonSettings={this.props.backButtonSettings}
        />
      </div>
      :
      <div className={readerTextTocClasses} onClick={this.props.sheetID ? this.openSheetConnectionsPanel : this.openTextConnectionsPanel}>
        <div className={"readerTextTocBox" + (this.props.sheetID ? " sheetBox" : "")} role="heading" aria-level="1" aria-live="polite">
          <div>
            <a href={url} aria-label={"Show Connection Panel contents for " + title} >
              <div className="readerControlsTitle">
                { this.props.sheetID ?
                <img src={"/static/img/sheet.svg"} className="sheetTocIcon" alt="" /> : null}
                { this.props.sheetID ?
                <h1 style={{direction: Sefaria.hebrew.isHebrew(title) ? "rtl" : "ltr"}}>
                  {title}
                </h1>
                :
                <h1>
                  <ContentText text={{en: title, he: heTitle}} defaultToInterfaceOnBilingual={true} />
                  <span className="sectionString">
                    <ContentText text={{en: sectionString, he: heSectionString }} defaultToInterfaceOnBilingual={true} />
                  </span>
                </h1>
                }
              </div>
              <div className="readerTextVersion">
                {categoryAttribution ? <CategoryAttribution categories={data.categories} linked={false} /> : null }
                {
                  this.shouldShowVersion() && displayVersionTitle ?
                  <span className="readerTextVersion">
                    <span className="en">{displayVersionTitle}</span>
                  </span> : null
                }
              </div>
            </a>
          </div>
        </div>
      </div>;

    let leftControls = hideHeader || connectionsHeader ? null :
      (<div className="leftButtons">
          {this.props.multiPanel ? (<CloseButton onClick={this.props.closePanel} />) : null}
          {this.props.multiPanel ? null : (<MenuButton onClick={this.props.openMobileNavMenu}/>)}
          <SaveButton placeholder={true}/>
        </div>);


    const displaySettingsButton = (<DisplaySettingsButton/>);
    let displaySettingsMenu = (<ReaderDisplayOptionsMenu/>);
    let rightControls = hideHeader || connectionsHeader ? null :
      (<div className="rightButtons">
          <SaveButton
            historyObject={this.props.historyObject}
            tooltip={true}
            toggleSignUpModal={this.props.toggleSignUpModal}
          />
        <DropdownMenu positioningClass="readerDropdownMenu" buttonComponent={displaySettingsButton}>{displaySettingsMenu}</DropdownMenu>
        </div>);
    const openTransBannerApplies = () => Sefaria.openTransBannerApplies(this.props.currentBook(), this.props.settings.language);
    let banner = (hideHeader || connectionsHeader) ? null : (
        <TextColumnBannerChooser
            setTranslationLanguagePreference={this.props.setTranslationLanguagePreference}
            openTranslations={this.openTranslations}
            openTransBannerApplies={openTransBannerApplies}
        />
    );
    const classes = classNames({
      readerControls: 1,
      connectionsHeader: mode == "Connections",
      fullPanel: this.props.multiPanel,
      sheetReaderControls: !!this.props.sheetID
    });

    let readerControls = hideHeader ? null :
        (<header className={classes}>
          <div className="readerControlsInner">
            {leftControls}
            {centerContent}
            {rightControls}
          </div>
        </header>);
    return (
      <div className='readerControlsOuter'>
        {connectionsHeader ? null : <CategoryColorLine category={this.props.currentCategory()} />}
        {readerControls}
        {banner}
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
  openMobileNavMenu:       PropTypes.func.isRequired,
  closeMenus:              PropTypes.func.isRequired,
  currentMode:             PropTypes.func.isRequired,
  currentCategory:         PropTypes.func.isRequired,
  currentBook:             PropTypes.func.isRequired,
  onError:                 PropTypes.func.isRequired,
  closePanel:              PropTypes.func,
  toggleLanguage:          PropTypes.func,
  currentRef:              PropTypes.string,
  currVersions:            PropTypes.object,
  connectionsMode:         PropTypes.string,
  connectionsCategory:     PropTypes.string,
  multiPanel:              PropTypes.bool,
  openSidePanel:           PropTypes.func.isRequired,
  interfaceLang:           PropTypes.string,
  toggleSignUpModal:       PropTypes.func.isRequired,
  historyObject:           PropTypes.object,
  setTranslationLanguagePreference: PropTypes.func.isRequired,
  backButtonSettings:      PropTypes.object,
};

export default ReaderPanel;
