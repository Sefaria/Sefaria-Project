import React, {useState}  from 'react';
import Component from 'react-class';
import classNames  from 'classnames';
import ReactDOM  from 'react-dom';
import PropTypes  from 'prop-types';
import extend  from 'extend';
import Sefaria  from './sefaria/sefaria';
import {ContentLanguageContext} from './context';
import $  from './sefaria/sefariaJquery';
import TextColumn  from './TextColumn';
import TextsPage  from './TextsPage';
import {
  ConnectionsPanel,
  ConnectionsPanelHeader,
} from './ConnectionsPanel';
import BookPage  from './BookPage';
import SearchPage  from './SearchPage';
import Sheet  from './Sheet';
import SheetMetadata  from './SheetMetadata';
import TopicPageAll  from './TopicPageAll';
import {TopicPage, TopicCategory}  from './TopicPage';
import TopicsPage from './TopicsPage';
import CollectionPage from "./CollectionPage"
import { NotificationsPanel } from './NotificationsPanel';
import UserHistoryPanel  from './UserHistoryPanel';
import UserProfile  from './UserProfile';
import UpdatesPanel  from './UpdatesPanel';
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
  ToggleSet, InterfaceText, EnglishText, HebrewText, SignUpModal,
} from './Misc';
import {ContentText} from "./ContentText";


class ReaderPanel extends Component {
  constructor(props) {
    super(props);
    let state = this.clonePanel(props.initialState);
    state["initialAnalyticsTracked"] = false;
    state.width = this.props.multiPanel ? 1000 : 500; // Assume we're in a small panel not using multipanel
    this.state = state;
    this.sheetRef = React.createRef();
    this.readerContentRef = React.createRef();
  }
  componentDidMount() {
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
  getContentLanguageOverride(originalLanguage, mode, menuOpen) {
    // Determines the actual content language used inside this ReaderPanel.
    // Because it's called in the constructor, assume state isnt necessarily defined and pass
    // variables mode and menuOpen manually
    let contentLangOverride = originalLanguage;
    if (["topics", "allTopics", "calendars", "community", "collection" ].includes(menuOpen)) {   //  "story_editor",
      // Always bilingual for English interface, always Hebrew for Hebrew interface
      contentLangOverride = (Sefaria.interfaceLang === "english") ? "bilingual" : "hebrew";

    } else if (mode === "Connections" || !!menuOpen){
      // Always Hebrew for Hebrew interface, treat bilingual as English for English interface
      contentLangOverride = (Sefaria.interfaceLang === "hebrew") ? "hebrew" : ((originalLanguage === "bilingual") ? "english" : originalLanguage);

    }
    return contentLangOverride;
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
    if(source === 0){
      //the click may be coming from the sheet reader controls, and so we need to find
      // the first node or the node thats in the url
      const sheet = Sefaria.sheets.loadSheetByID(this.state.sheetID); // Should already be loaded and in cache
      source = this.state.highlightedNode ? sheet.sources.find(source => source.node === this.state.highlightedNode) : sheet.sources[0];
    }
    this.conditionalSetState({highlightedNode: source.node});
    const sheetRef = "Sheet " + this.state.sheetID + ":" + source.node;
    if (this.state.mode ==="SheetAndConnections") {
      this.closeSheetConnectionsInPanel();
    }
    else if (this.state.mode === "Sheet") {
      if (this.props.multiPanel) {
        if (source.ref) {
          this.props.onSegmentClick(Sefaria.splitRangingRef(source.ref), source.node);
        } else {
          this.props.onSegmentClick(sheetRef, source.node)
        }
      } else {
        this.openSheetConnectionsInPanel(source.ref || sheetRef, source.node);
      }
    }
  }
  handleCitationClick(citationRef, textRef, replace, currVersions) {
    if (this.props.multiPanel) {
      this.props.onCitationClick(citationRef, textRef, replace, currVersions);
    } else {
      this.showBaseText(citationRef, replace, currVersions);
    }
  }
  handleTextListClick(ref, replaceHistory, currVersions) {
    this.showBaseText(ref, replaceHistory, currVersions);
  }
  updateCurrVersionsToMatchAPIResult(enVTitle, heVTitle) {
    const newVersions = {
        ...this.state.currVersions,
        enAPIResult: enVTitle,
        heAPIResult: heVTitle,
    };
    if (Sefaria.util.object_equals(this.state.currVersions, newVersions)) { return; }
    this.conditionalSetState({ currVersions: newVersions });
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
  openSheetConnectionsInPanel(ref, node) {
    let refs = typeof ref == "string" ? [ref] : ref;
    this.replaceHistory = this.state.mode === "SheetAndConnections"; // Don't push history for change in Connections focus
    this.conditionalSetState({highlightedNode: node, highlightedRefs: refs, mode: "SheetAndConnections" }, this.replaceHistory);
  }
  closeSheetConnectionsInPanel() {
    // Return to the original text in the ReaderPanel contents
    this.conditionalSetState({highlightedNode: null, highlightedRefs: [], mode: "Sheet"});
  }
  handleSheetClick(e, sheet, highlightedNode, highlightedRefsInSheet) {
    e.preventDefault();
    this.conditionalSetState({
      mode: "Sheet",
      sheetID: sheet.id,
      highlightedNode,
      highlightedRefsInSheet
    });
  }
  showBaseText(ref, replaceHistory, currVersions={en: null, he: null}, filter=[]) {
    // Set the current primary text `ref`, which may be either a string or an array of strings.
    // `replaceHistory` - bool whether to replace browser history rather than push for this change
    if (!ref) { return; }
    this.replaceHistory = Boolean(replaceHistory);
    // console.log("showBaseText", ref, replaceHistory);
    if (this.state.mode === "Connections" && this.props.masterPanelLanguage === "bilingual") {
      // Connections panels are forced to be mono-lingual. When opening a text from a connections panel,
      // allow it to return to bilingual.
      this.state.settings.language = "bilingual";
    }
    let refs, currentlyVisibleRef, highlightedRefs;
    if (ref.constructor === Array) {
      // When called with an array, set highlight for the whole spanning range
      refs = ref;
      currentlyVisibleRef = Sefaria.humanRef(ref);
      let splitArray = refs.map(ref => Sefaria.splitRangingRef(ref));
      highlightedRefs = [].concat.apply([], splitArray);
    } else {
      const oRef = Sefaria.parseRef(ref);
      if (oRef.book === "Sheet") {
        this.openSheet(ref);
        return;
      }
      refs = [ref];
      currentlyVisibleRef = ref;
      highlightedRefs = [];
    }

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
      compare: false,
      sheetID: null,
      connectionsMode: "Resources",
      settings: this.state.settings
    });
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
  setVersionFilter(filter) {
    if (this.props.setVersionFilter) {
      this.props.setVersionFilter(filter);
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
    // Opens the Text TOC in a compare panel
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
  openDisplaySettings() {
    this.conditionalSetState({displaySettingsOpen: true});
  }
  closeDisplaySettings() {
    this.conditionalSetState({displaySettingsOpen: false});
  }
  setOption(option, value) {
    if (option === "fontSize") {
      const step = 1.15;
      const size = this.state.settings.fontSize;
      value = (value === "smaller" ? size/step : size*step);
    } else if (option === "layout") {
      const category = this.currentCategory();
      option = category === "Tanakh" || category === "Talmud" ? "layout" + category : "layoutDefault";
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
  currentData() {
    // Returns the data from the library of the current ref
    const ref  = this.currentRef();
    if (!ref) { return null; }
    if (typeof ref !== "string") { debugger; }
    let data = Sefaria.ref(ref);
    return data;
  }
  currentBook() {
    let data = this.currentData();
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
    const category = this.currentCategory();
    const option = (category && (category === "Tanakh" || category === "Talmud")) ? "layout" + category : "layoutDefault";
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
  render() {
    if (this.state.error) {
      return (
        <div
        ref={this.readerContentRef}
        className="readerContent">
          <div className="readerError">
            <span className={`${Sefaria.languageClassFont()}`}>Something went wrong! Please use the back button or the menus above to get back on track.</span>
            <div className="readerErrorText">
              <span className={`${Sefaria.languageClassFont()}`}>Error Message: </span>
              {this.state.error}
            </div>
          </div>
        </div>
      );
    }

    let items = [];
    let menu = null;
    let isNarrowColumn = false;
    const contextContentLang = {"language": this.getContentLanguageOverride(this.state.settings.language, this.state.mode, this.state.menuOpen)};
    (this.state.width < 730) ? isNarrowColumn = true  : false;
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
          updateCurrVersionsToMatchAPIResult={this.updateCurrVersionsToMatchAPIResult}
          navigatePanel={this.props.navigatePanel}
          key={`${textColumnBookTitle ? textColumnBookTitle : "empty"}-TextColumn`} />
      );
    }
    if (this.state.mode === "Sheet" || this.state.mode === "SheetAndConnections" ) {
      items.push(
        <Sheet
          nodeRef={this.sheetRef}
          adjustHighlightedAndVisible={this.adjustSheetHighlightedAndVisible}
          panelPosition ={this.props.panelPosition}
          id={this.state.sheetID}
          key={"sheet-"+this.state.sheetID}
          multiPanel={this.props.multiPanel}
          highlightedNode={this.state.highlightedNode}
          highlightedRefsInSheet={this.state.highlightedRefsInSheet}
          scrollToHighlighted={this.state.scrollToHighlighted}
          onRefClick={this.handleCitationClick}
          onSegmentClick={this.handleSheetSegmentClick}
          onCitationClick={this.handleCitationClick}
          openSheet={this.openSheet}
          hasSidebar={this.props.hasSidebar}
          setSelectedWords={this.setSelectedWords}
          contentLang={this.state.settings.language}
          setDivineNameReplacement={this.props.setDivineNameReplacement}
          divineNameReplacement={this.props.divineNameReplacement}
        />
      );
    }

    if (this.state.mode === "Connections" || this.state.mode === "TextAndConnections" || this.state.mode === "SheetAndConnections") {
      const langMode = this.props.masterPanelLanguage || this.state.settings.language;
      let data     = this.currentData();
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
          openDisplaySettings={this.openDisplaySettings}
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
          masterPanelMode={this.props.initialState.mode === "SheetAndConnections" && this.props.multiPanel === false ? "Sheet" : this.props.masterPanelMode}
          masterPanelSheetId={this.props.initialState.mode === "SheetAndConnections" && this.props.multiPanel === false ? this.props.initialState.sheetID : this.props.masterPanelSheetId}
          versionFilter={this.state.versionFilter}
          recentVersionFilters={this.state.recentVersionFilters}
          setVersionFilter={this.setVersionFilter}
          viewExtendedNotes={this.props.viewExtendedNotes.bind(null, "Connections")}
          checkIntentTimer={this.props.checkIntentTimer}
          navigatePanel={this.props.navigatePanel}
          translationLanguagePreference={this.props.translationLanguagePreference}
          setDivineNameReplacement={this.props.setDivineNameReplacement}
          divineNameReplacement={this.props.divineNameReplacement}
          key="connections" />
      );
    }

    if (this.state.menuOpen === "navigation") {

      const openNav     = this.state.compare ? this.props.openComparePanel : this.openMenu.bind(null, "navigation");
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
                    openDisplaySettings={this.openDisplaySettings}
                    initialWidth={this.state.width}
                    toggleSignUpModal={this.props.toggleSignUpModal} />);

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

    } else if (this.state.menuOpen === "text toc") {
      console.log(this.state.menuOpen)
      menu = (<BookPage
                    tab={this.state.tab}
                    isNarrowColumn={false}
                    setTab={this.setTab}
                    mode={this.state.menuOpen}
                    multiPanel={this.props.multiPanel}
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
                    showBaseText={this.showBaseText}/>);

    } else if (this.state.menuOpen === "book toc") {
      const onCompareBack = () => {
        this.conditionalSetState({
          menuOpen: "navigation",
          navigationCategories: this.state.previousCategories,
        });
      };
      menu = (<BookPage
                    isNarrowColumn={isNarrowColumn}
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
                    openDisplaySettings={this.openDisplaySettings}
                    selectVersion={this.props.selectVersion}
                    showBaseText={this.showBaseText}
                    viewExtendedNotes={this.props.viewExtendedNotes.bind(null, "toc")} />);

    } else if (this.state.menuOpen === "extended notes" && this.state.mode !== "Connections") {
      menu = (<BookPage
                    isNarrowColumn={false}
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
                    openDisplaySettings={this.openDisplaySettings}
                    selectVersion={this.props.selectVersion}
                    showBaseText={this.showBaseText}
                    backFromExtendedNotes={
                      this.state.mode==="Connections" ? this.closeMenus : this.backFromExtendedNotes
                    }/>);

    } else if (this.state.menuOpen === "search" && this.state.searchQuery) {
      menu = (<SearchPage
                    mongoSearch= {this.props.mongoSearch}
                    key={"searchPage"}
                    interfaceLang={this.props.interfaceLang}
                    query={this.state.searchQuery}
                    tab={this.state.searchTab}
                    textSearchState={this.state.textSearchState}
                    sheetSearchState={this.state.sheetSearchState}
                    settings={Sefaria.util.clone(this.state.settings)}
                    panelsOpen={this.props.panelsOpen}
                    onResultClick={this.props.onSearchResultClick}
                    openDisplaySettings={this.openDisplaySettings}
                    toggleLanguage={this.toggleLanguage}
                    close={this.props.closePanel}
                    onQueryChange={this.props.onQueryChange}
                    updateTab={this.props.updateSearchTab}
                    updateAppliedFilter={this.props.updateSearchFilter}
                    updateAppliedOptionField={this.props.updateSearchOptionField}
                    updateAppliedOptionSort={this.props.updateSearchOptionSort}
                    registerAvailableFilters={this.props.registerAvailableFilters}
                    compare={this.state.compare}
                  />);

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
            openDisplaySettings={this.openDisplaySettings}
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
            openDisplaySettings={this.openDisplaySettings}
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
          openDisplaySettings={this.openDisplaySettings}
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

    } else if (this.state.menuOpen === "updates") {
      menu = (
        <UpdatesPanel
          interfaceLang={this.props.interfaceLang}
          multiPanel={this.props.multiPanel}
          navHome={this.openMenu.bind(null, "navigation")} />
      );

    } else if (this.state.menuOpen === "user_stats") {
      menu = (<UserStats />);

    } else if (this.state.menuOpen === "modtools") {
      menu = (
        <ModeratorToolsPanel
          interfaceLang={this.props.interfaceLang} />
      );

    } else if (this.state.menuOpen === "saved" || this.state.menuOpen === "history") {
      menu = (
        <UserHistoryPanel
          multiPanel={this.props.multiPanel}
          menuOpen={this.state.menuOpen}
          openMenu={this.openMenu}
          openNav={this.openMenu.bind(null, "navigation")}
          openDisplaySettings={this.openDisplaySettings}
          toggleLanguage={this.toggleLanguage}
          compare={this.state.compare}
          toggleSignUpModal={this.props.toggleSignUpModal} />
      );

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
    classes[contextContentLang.language] = 1;
    classes[this.currentLayout()]        = 1;
    classes[this.state.settings.color]   = 1;
    classes = classNames(classes);

    const style = {"fontSize": this.state.settings.fontSize + "%"};

    const sheet = Sefaria.sheets.loadSheetByID(this.state.sheetID);
    const sheetTitle = !!sheet ? sheet.title.stripHtmlConvertLineBreaks() : null;

    const hideReaderControls = (
      this.state.mode === "TextAndConnections" ||
      this.state.menuOpen ||
      this.props.hideNavHeader
    );
    return (
      <ContentLanguageContext.Provider value={contextContentLang}>
        <div ref={this.readerContentRef} className={classes} onKeyDown={this.handleKeyPress} role="region" id={"panel-"+this.props.panelPosition}>
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
            openDisplaySettings={this.openDisplaySettings}
            currentLayout={this.currentLayout}
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
          />}

          {(items.length > 0 && !menu) ?
            <div className="readerContent" style={style}>
            {items}
          </div> : null}

          {menu}

          {this.state.displaySettingsOpen ?
          <ReaderDisplayOptionsMenu
            settings={this.state.settings}
            multiPanel={this.props.multiPanel}
            setOption={this.setOption}
            parentPanel={this.props.initialState.mode}
            currentLayout={this.currentLayout}
            currentBook={this.currentBook}
            currentData={this.currentData}
            width={this.state.width}
            menuOpen={this.state.menuOpen} /> : null}

          {this.state.displaySettingsOpen ?
          <div className="mask" onClick={this.closeDisplaySettings}></div> : null}

        </div>
      </ContentLanguageContext.Provider>
    );
  }
}
ReaderPanel.propTypes = {
  mongoSearch: PropTypes.object,
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
  updateSearchTab:             PropTypes.func,
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
      status: ""
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
    if (!this.shouldShowVersion()) { return; }
    Sefaria.getTranslations(this.props.currentRef).then(versions => {
      const enVTitle = this.props.currVersions.enAPIResult;
      if (!enVTitle) {
        // merged version from API
        this.setDisplayVersionTitle({});
        return;
      }
      for (let version of Object.values(versions).flat()) {
        if (version.versionTitle === enVTitle) {
          this.setDisplayVersionTitle(version);
          break;
        }
      }
    });
  }
  openTranslations() {
    this.props.openConnectionsPanel([this.props.currentRef], {"connectionsMode": "Translations"});
  }
  componentDidMount() {
    const title = this.props.currentRef;
    if (title) {
      // If we don't have this data yet, rerender when we do so we can set the Hebrew title
      const versionPref = Sefaria.versionPreferences.getVersionPref(title);
      const getTextPromise = Sefaria.getText(title, {context: 1, translationLanguagePreference: this.props.translationLanguagePreference, versionPref}).then(data => {
        if ("error" in data) { this.props.onError(data.error); }
        this.setState({runningQuery: null});   // Causes re-render
      });
      this.setState({runningQuery: Sefaria.makeCancelable(getTextPromise)});
    }
    this.loadTranslations();
  }
  componentDidUpdate(prevProps, prevState) {
    if (
      this.shouldShowVersion() !== this.shouldShowVersion(prevProps) ||
      this.props.currVersions !== prevProps.currVersions
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
  setTextCompletionStatus(status){
    let ribbonStyle
    Sefaria.interfaceLang == "hebrew" ? ribbonStyle = 'ribbon-wrap ribbon-padding' : ribbonStyle = 'ribbon-wrap'
    if (status == "done") {
      return null
    } else {
      return (
        <div>{Sefaria._("")}</div>
      )
    } 
  }
  render() {
    let title = this.props.currentRef || "";
    let heTitle = "";
    let sectionString = "";
    let heSectionString = "";
    let categoryAttribution = null;
    let status = ""
    const oref = Sefaria.getRefFromCache(this.props.currentRef);
    if(oref) {
      oref?.versions.forEach(version => {
        if(version.languageFamilyName == "hebrew"){
          status = version.iscompleted
        }
  
      }) 
    }
    
    if (this.props.sheetID) {
      if (this.props.sheetTitle === null) {
        title = heTitle = Sefaria._("common.loading");
      } else {
        title = heTitle = this.props.sheetTitle;
        if (title === "") {
          title = heTitle = Sefaria._("sheet.untitled")
        }
      }

    } else if (oref) {
      sectionString = oref.ref.replace(oref.indexTitle, "");
      heSectionString = oref.heRef.replace(oref.heIndexTitle, "");
      title = oref.indexTitle;
      heTitle = oref.heIndexTitle;
      categoryAttribution = oref && Sefaria.categoryAttribution(oref.categories);
    }

    const mode              = this.props.currentMode();
    const hideHeader        = !this.props.multiPanel && mode === "Connections";
    const connectionsHeader = this.props.multiPanel && mode === "Connections";
    let displayVersionTitle = this.props.settings.language === 'hebrew' ? this.state.displayVersionTitle.he : this.state.displayVersionTitle.en;
    if (categoryAttribution && displayVersionTitle) { displayVersionTitle = `(${displayVersionTitle})`; }
    const url = this.props.sheetID ? "/sheets/" + this.props.sheetID : oref ? "/" + Sefaria.normRef(oref.book) : Sefaria.normRef(this.props.currentRef);
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
                <h1 style={{direction: Sefaria.hebrew.isHebrew(title) ? "ltr" : "ltr"}}>
                  {title}
                </h1>
                :
                
                <div className='bookTitle'> 
                  
                  <h1 className='titleHepadding'>
                    <ContentText text={{en: title, he: heTitle}} defaultToInterfaceOnBilingual={true} />
                    <span className="sectionString">
                      <ContentText text={{en: sectionString, he: heSectionString }} defaultToInterfaceOnBilingual={true} />
                    </span>
                  </h1>
                  
                </div>
                }
              </div>
              <div className="readerTextVersion">
                {categoryAttribution ? <CategoryAttribution categories={oref.categories} linked={false} /> : null }
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
          <div className='textStatus'>
            {this.setTextCompletionStatus(status)}
          </div>
          
          <SaveButton placeholder={true}/>  
        </div>);

    let rightControls = hideHeader || connectionsHeader ? null :
    
      (<div className="rightButtons">
          <SaveButton
            historyObject={this.props.historyObject}
            tooltip={true}
            toggleSignUpModal={this.props.toggleSignUpModal}
          />
          <DisplaySettingsButton onClick={this.props.openDisplaySettings} />
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
      <div>
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
  openDisplaySettings:     PropTypes.func.isRequired,
  openMobileNavMenu:       PropTypes.func.isRequired,
  closeMenus:              PropTypes.func.isRequired,
  currentMode:             PropTypes.func.isRequired,
  currentCategory:         PropTypes.func.isRequired,
  currentBook:             PropTypes.func.isRequired,
  currentLayout:           PropTypes.func.isRequired,
  onError:                 PropTypes.func.isRequired,
  closePanel:              PropTypes.func,
  toggleLanguage:          PropTypes.func,
  currentRef:              PropTypes.string,
  currVersions:            PropTypes.object,
  connectionsMode:         PropTypes.string,
  connectionsCategory:     PropTypes.string,
  multiPanel:              PropTypes.bool,
  openSidePanel:           PropTypes.func,
  interfaceLang:           PropTypes.string,
  toggleSignUpModal:       PropTypes.func.isRequired,
  historyObject:           PropTypes.object,
  setTranslationLanguagePreference: PropTypes.func.isRequired,
};


class ReaderDisplayOptionsMenu extends Component {
  renderAliyotToggle() {
    let torah = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Onkelos Genesis", "Onkelos Exodus", "Onkelos Leviticus", "Onkelos Numbers", "Onkelos Deuteronomy"];
    return this.props.currentBook ? torah.includes(this.props.currentBook()) : false;
  }
  vowelToggleAvailability(){
    let data = this.props.currentData();
    if(!data) return 2;
    let sample = data["he"];
    while (Array.isArray(sample)) {
        sample = sample[0];
    }
    const vowels_re = /[\u05b0-\u05c3\u05c7]/g;
    const cantillation_re = /[\u0591-\u05af]/g;
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

    let data = this.props.currentData();
    if (!data) return true // Sheets don't have currentData, also show for now (4x todo)

    const hasHebrew = !!data.he.length;
    const hasEnglish = !!data.text.length;
    return !(hasHebrew && hasEnglish);
  }
  shouldPunctuationToggleRender() {
    if (this.props.currentData?.()?.primary_category === "Talmud" && (this.props.settings?.language === "hebrew" || this.props.settings?.language === "bilingual")) { return true; }
    else { return false; }
  }

  render() {
    let languageOptions = [
      {name: "english",   content: "<span class='en'>A</span>", role: "radio", ariaLabel: "Show English Text" },
      {name: "bilingual", content: "<span class='en'>A</span><span class='he'>ཀ</span>", role: "radio", ariaLabel: "Show English & Hebrew Text" },
      {name: "hebrew",    content: "<span class='he'>ཀ</span>", role: "radio", ariaLabel: "Show Hebrew Text" }
    ];
    let languageToggle = this.showLangaugeToggle() ? (
        <ToggleSet
          ariaLabel="Language toggle"
          label={Sefaria._("Language")}
          name="language"
          options={languageOptions}
          setOption={this.props.setOption}
          currentValue={this.props.settings.language} />) : null;

    let layoutOptions = [
      {name: "continuous", fa: "align-justify", role: "radio", ariaLabel: "Show Text as a paragram" },
      {name: "segmented", fa: "align-left", role: "radio", ariaLabel: "Show Text segmented" },
    ];
    let biLayoutOptions = [
      {name: "stacked", content: "<img src='/static/img/stacked.png' alt='Stacked Language Toggle'/>", role: "radio", ariaLabel: "Show Hebrew & English Stacked"},
      {name: "heLeft", content: "<img src='/static/img/backs.png' alt='Hebrew Left Toggle' />", role: "radio", ariaLabel: "Show Hebrew Text Left of English Text"},
      {name: "heRight", content: "<img src='/static/img/faces.png' alt='Hebrew Right Toggle' />", role: "radio", ariaLabel: "Show Hebrew Text Right of English Text"}
    ];
    let layoutToggle = this.props.settings.language !== "bilingual" ?
      this.props.parentPanel === "Sheet" ? null :
      (<ToggleSet
          ariaLabel="text layout toggle"
          label={Sefaria._("text.reader_option_menu.layout")}
          name="layout"
          options={layoutOptions}
          setOption={this.props.setOption}
          currentValue={this.props.currentLayout()} />) :
      (this.props.width > 500 ?
        <ToggleSet
          ariaLabel="bidirectional text layout toggle"
          label={Sefaria._("text.reader_option_menu.bilingual_layout")}
          name="biLayout"
          options={biLayoutOptions}
          setOption={this.props.setOption}
          currentValue={this.props.currentLayout()} /> : null);

    let colorOptions = [
      {name: "light", content: "", role: "radio", ariaLabel: "Toggle light mode" },
      /*{name: "sepia", content: "", role: "radio", ariaLabel: "Toggle sepia mode" },*/
      {name: "dark", content: "", role: "radio", ariaLabel: "Toggle dark mode" }
    ];
    let colorToggle = (
        <ToggleSet
          ariaLabel="Color toggle"
          label={Sefaria._("text.reader_option_menu.color")}
          name="color"
          separated={true}
          options={colorOptions}
          setOption={this.props.setOption}
          currentValue={this.props.settings.color} />);
    colorToggle = this.props.multiPanel ? null : colorToggle;

    let sizeOptions = [
      {name: "smaller", content: Sefaria._("text.reader_option_menu.font_size_lable"), role: "button", ariaLabel: Sefaria._("decrease_font_size") },
      {name: "larger", content: Sefaria._("text.reader_option_menu.font_size_lable"), role: "button", ariaLabel: Sefaria._("increase_font_size")  }
    ];
    let sizeToggle = (
        <ToggleSet
          ariaLabel="Increase/Decrease Font Size Buttons"
          label={Sefaria._("text.reader_option_menu.font_size")}
          name="fontSize"
          options={sizeOptions}
          setOption={this.props.setOption}
          currentValue={null} />);

    let aliyahOptions = [
      {name: "aliyotOn",   content: Sefaria._("common.on"), role: "radio", ariaLabel: Sefaria._("Show Parasha Aliyot") },
      {name: "aliyotOff", content: Sefaria._("common.off"), role: "radio", ariaLabel: Sefaria._("Hide Parasha Aliyot") },
    ];
    let aliyahToggle = this.renderAliyotToggle() ? (
      this.props.parentPanel == "Sheet" ? null :
        <ToggleSet
          ariaLabel="Toggle Aliyot"
          label={Sefaria._("Aliyot")}
          name="aliyotTorah"
          options={aliyahOptions}
          setOption={this.props.setOption}
          currentValue={this.props.settings.aliyotTorah} />) : null;

    let vowelsOptions = [
      {name: "all", content: "<span class='he'>אָ֑</span>", role: "radio", ariaLabel: Sefaria._("text.reader_option_menu.show_vowels")},
      {name: "partial", content: "<span class='he'>אָ</span>", role: "radio", ariaLabel: Sefaria._("text.reader_option_menu.show_only_vowels")},
      {name: "none", content: "<span class='he'>א</span>", role: "radio", ariaLabel: Sefaria._("text.reader_option_menu.show_only_consonenetal_text")}
    ];
    let vowelToggle = null;
    if(!this.props.menuOpen){
      let vowelOptionsSlice = this.vowelToggleAvailability();
      let vowelOptionsTitle = (vowelOptionsSlice == 0) ? Sefaria._("text.reader_option_menu.vocalization") : Sefaria._("text.reader_option_menu.vowels");
      vowelsOptions = vowelsOptions.slice(vowelOptionsSlice);
      vowelToggle = (this.props.settings.language !== "english" && vowelsOptions.length > 1) ?
        this.props.parentPanel == "Sheet" ? null :
        (<ToggleSet
          ariaLabel="vowels and cantillation toggle"
          label={vowelOptionsTitle}
          name="vowels"
          options={vowelsOptions}
          setOption={this.props.setOption}
          currentValue={this.props.settings.vowels} />): null;
    }

    let punctuationOptions = [
      {name: "punctuationOn", content: Sefaria._("common.on"), role: "radio", ariaLabel: Sefaria._("text.reader_option_menu.show_puntuation")},
      {name: "punctuationOff", content: Sefaria._("common.off"), role: "radio", ariaLabel: Sefaria._("text.reader_option_menu.hide_puntuation")}
    ]
    let punctuationToggle = this.shouldPunctuationToggleRender() ? (
        <ToggleSet
          ariaLabel="Punctuation Toggle"
          label={Sefaria._("text.reader_option_menu.punctuation")}
          name="punctuationTalmud"
          options={punctuationOptions}
          setOption={this.props.setOption}
          currentValue={this.props.settings.punctuationTalmud} />) : null;
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
                  {punctuationToggle}
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


export default ReaderPanel;
