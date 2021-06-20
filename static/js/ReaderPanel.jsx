import React  from 'react';
import classNames  from 'classnames';
import ReactDOM  from 'react-dom';
import PropTypes  from 'prop-types';
import extend  from 'extend';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import TextColumn  from './TextColumn';
import ReaderNavigationMenu  from './ReaderNavigationMenu';
import {
  ConnectionsPanel,
  ConnectionsPanelHeader,
} from './ConnectionsPanel';
import ReaderTextTableOfContents  from './ReaderTextTableOfContents';
import SearchPage  from './SearchPage';
import Sheet  from './Sheet';
import SheetMetadata  from './SheetMetadata';
import TopicPageAll  from './TopicPageAll';
import {TopicPage}  from './TopicPage';
import CollectionPage from "./CollectionPage"
import NotificationsPanel  from './NotificationsPanel';
import MyNotesPanel  from './MyNotesPanel';
import UserHistoryPanel  from './UserHistoryPanel';
import UserProfile  from './UserProfile';
import UpdatesPanel  from './UpdatesPanel';
import HomeFeed  from './HomeFeed';
import StoryEditor  from './StoryEditor';
import UserStats  from './UserStats';
import ModeratorToolsPanel  from './ModeratorToolsPanel';
import {
  PublicCollectionsPage
} from './PublicCollectionsPage';
import {
  ReaderNavigationMenuCloseButton,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  SaveButton,
  CategoryColorLine,
  CategoryAttribution,
  ToggleSet, ContentText,
} from './Misc';
import Component from 'react-class';
import {ContentLanguageContext} from './context';


class ReaderPanel extends Component {
  constructor(props) {
    super(props);
    let state = this.clonePanel(props.initialState);
    state["initialAnalyticsTracked"] = false;
    /*const contentLang = this.getContentLanguageOverride(state.settings.language, state.mode, state.menuOpen);
    state['contentLangSettings'] = {
      "language": contentLang,
    }*/
    this.state = state;
    return;
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
        navigationTopicCategory: nextProps.initialNavigationTopicCategory || "",
        navigationSheetTag:   nextProps.initialSheetsTag || null
      });
    }
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
  getContentLanguageOverride(originalLanguage, mode, menuOpen) {
    //Determines the actual content language used inside this ReaderPanel.
    //Because it's called in the constructor, assume state isnt necessarily defined and pass variables mode and menuOpen manually
    let contentLangOverride = originalLanguage;
    if (mode === "Connections"){
      contentLangOverride = (Sefaria.interfaceLang === "hebrew") ? "hebrew" : ((originalLanguage === "bilingual") ? "english" : originalLanguage);
    }else if (["topics", "homefeed", "story_editor" ].includes(menuOpen)) {
      contentLangOverride = (["english", "bilingual"].includes(Sefaria.interfaceLang)) ? "bilingual" : "hebrew";
    }else if (["text toc", "book toc"].includes(menuOpen)) {
      contentLangOverride = (Sefaria.interfaceLang === "hebrew") ? "hebrew" : ((originalLanguage === "bilingual") ? "english" : originalLanguage);
    }
    return contentLangOverride;
  }
  _getClickTarget(event) {
    // searches for click target with the proper css class
    let target = $(event.target);
    let linkType;
    while (target.attr("data-ref-child")) {
      // go up known data-ref-children
      target = target.parent();
    }
    if (["refLink", "catLink", "resourcesLink"].some(cls => target.parent().hasClass(cls))) {
      target = target.parent();
    }
    if (target.hasClass("refLink")) {
      linkType = "ref";
    } else if (target.hasClass("catLink")) {
      linkType = "cat";
    } else if (target.hasClass("sheetLink")) {
      linkType = "sheet";
    } else if (target.attr('href') === "/texts/history") {
      linkType = "history";
    } else if (target.attr('href') === "/texts/saved") {
      linkType = "saved";
    } else {
      return {};  // couldn't find a known link
    }
    return { target, linkType };
  }
  handleNavigationClick(event) {
    // Handles clicks within a ReaderNavigationMenu panel.
    // This logic for handling these links could be replaced by ReaderApp.handleInAppLinkClick()
    // except for the fact that navigation can occur inside a "compare" panel.
    const { target, linkType } = this._getClickTarget(event);
    if (!linkType) { return; }
    event.preventDefault();

    if (linkType === "ref") {
      const ref       = target.attr("data-ref");
      const pos       = target.attr("data-position");
      const enVersion = target.attr("data-ven");
      const heVersion = target.attr("data-vhe");
      if (this.props.onNavTextClick && !this.state.compare) {
        this.props.onNavTextClick(ref, {en: enVersion, he: heVersion});
      } else {
        this.showBaseText(ref, false, {en: enVersion, he: heVersion});
      }
      if (Sefaria.site) { Sefaria.track.event("Reader", "Navigation Text Click", ref); }

    } else if (linkType === "cat") {
      const cats = target.attr("data-cats").split("|");
      this.setNavigationCategories(cats);
      if (Sefaria.site) { Sefaria.track.event("Reader", "Navigation Sub Category Click", cats.join(" / ")); }

    } else if (linkType === "sheet") {
      const ref = target.attr("data-ref");
      this.props.onNavTextClick ? this.props.onNavTextClick(ref) : this.openSheet(ref);

    } else if (linkType === "history") {
      this.openMenu("history");

    } else if (linkType === "saved") {
      Sefaria._uid ? this.openMenu("saved") : this.props.toggleSignUpModal();

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
  handleCitationClick(citationRef, textRef, replace) {
    if (this.props.multiPanel) {
      this.props.onCitationClick(citationRef, textRef, replace);
    } else {
      this.showBaseText(citationRef);
    }
  }
  handleTextListClick(ref, replaceHistory, currVersions) {
    this.showBaseText(ref, replaceHistory, currVersions);
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
    this.conditionalSetState({highlightedNode: [], highlightedRefs: [], mode: "Sheet"});
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
    if (this.state.mode == "Connections" && this.props.masterPanelLanguage == "bilingual") {
      // Connections panels are forced to be mono-lingual. When opening a text from a connections panel,
      // allow it to return to bilingual.
      this.state.settings.language = "bilingual";
    }
    let refs, currentlyVisibleRef, highlightedRefs;
    if (ref.constructor == Array) {
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
  setTextListHighlight(refs) {
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
      // If there's no content to show, return to home
      menuOpen: this.state.refs.slice(-1)[0] ? null: "home",
      // searchQuery: null,
      // appliedSearchFilters: [],
      navigationCategories: null,
      navigationTopicCategory: null,
      navigationSheetTag: null
    };
    this.conditionalSetState(state);
  }
  onClose() {
    if (this.state.compare) {
      this.props.closePanel();
    } else {
      this.setNavigationCategories([]);
      this.closeMenus();
    }
  }
  closeSheetMetaData() {
    let state = {
      menuOpen: null,
      mode: "Sheet",
      navigationCategories: null,
      navigationTopicCategory: null,
      navigationSheetTag: null
    };
    this.conditionalSetState(state);

  }
  closePanelSearch() {
    let state = {
      menuOpen: "navigation",
      navigationCategories: null,
      navigationTopicCategory: null,
      navigationSheetTag: null
    };
    this.conditionalSetState(state);
  }
  openMenu(menu) {
    this.conditionalSetState({
      menuOpen: menu,
      mode: "Text",
      initialAnalyticsTracked: false,
      navigationSheetTag: null,
      navigationTopic: null,
      navigationTopicTitle: null,
      topicTitle: null,
    });
  }
  setNavigationCategories(categories) {
    this.conditionalSetState({navigationCategories: categories});
  }
  setNavigationTopic(topic, topicTitle) {
    this.conditionalSetState({menuOpen: 'navigation', navigationTopicCategory: topic, navigationTopicTitle: topicTitle, navigationTopic: null, topicTitle: null});
  }
  setMoreTexts(val) {
    this.replaceHistory = true;
    this.conditionalSetState({showMoreTexts: val});
  }
  setMoreTopics(val) {
    this.replaceHistory = true;
    this.conditionalSetState({showMoreTopics: val});
  }
  setSheetTag (tag) {
    this.conditionalSetState({navigationSheetTag: tag});
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
        navigationTopic,
        topicTitle
    });
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
      /*let adjustedValue = this.getContentLanguageOverride(value, this.state.mode, this.state.menuOpen);
      state['contentLangSettings'] = {
        "language": adjustedValue
      }*/
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
  setProfileTab(tab) {
    this.replaceHistory = true;
    this.conditionalSetState({profileTab: tab});
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
      return "book" in pRef ? pRef.book : null;
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
    const contextContentLang = {"language": this.getContentLanguageOverride(this.state.settings.language, this.state.mode, this.state.menuOpen)};

    if (this.state.mode === "Sheet" || this.state.mode === "SheetAndConnections" ) {
      items.push(
        <Sheet
          panelPosition ={this.props.panelPosition}
          id={this.state.sheetID}
          key={"sheet-"+this.state.sheetID}
          highlightedNode={this.state.highlightedNode}
          highlightedRefsInSheet={this.state.highlightedRefsInSheet}
          scrollToHighlighted={this.state.scrollToHighlighted}
          onRefClick={this.handleCitationClick}
          onSegmentClick={this.handleSheetSegmentClick}
          openSheet={this.openSheet}
          openURL={this.props.openURL}
          hasSidebar={this.props.hasSidebar}
          setSelectedWords={this.setSelectedWords}
          contentLang={this.state.settings.language}
        />
      );
    }
    if (this.state.mode === "Text" || this.state.mode === "TextAndConnections") {
      const oref  = Sefaria.parseRef(this.state.refs[0]);
      const index = oref && oref.index ? Sefaria.index(oref.index) : null;
      const [textColumnBookTitle, heTextColumnBookTitle] = index ? [index.title, index.heTitle] : [null, null];
      items.push(
        <TextColumn
          panelPosition ={this.props.panelPosition}
          srefs={this.state.refs.slice()}
          currVersions={this.state.currVersions}
          highlightedRefs={this.state.highlightedRefs}
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
          key={`${textColumnBookTitle ? textColumnBookTitle : "empty"}-TextColumn`} />
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
          currVersions={this.state.currVersions}
          fullPanel={this.props.multiPanel}
          multiPanel={this.props.multiPanel}
          allOpenRefs={this.props.allOpenRefs}
          canEditText={canEditText}
          setFilter={this.setFilter}
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
          selectedNamedEntity={this.state.selectedNamedEntity}
          selectedNamedEntityText={this.state.selectedNamedEntityText}
          clearSelectedWords={this.clearSelectedWords}
          clearNamedEntity={this.props.clearNamedEntity}
          getLicenseMap={this.props.getLicenseMap}
          masterPanelLanguage={this.props.masterPanelLanguage}
          versionFilter={this.state.versionFilter}
          recentVersionFilters={this.state.recentVersionFilters}
          setVersionFilter={this.setVersionFilter}
          viewExtendedNotes={this.props.viewExtendedNotes.bind(null, "Connections")}
          checkIntentTimer={this.props.checkIntentTimer}
          key="connections" />
      );
    }

    if (this.state.menuOpen === "home" || this.state.menuOpen == "navigation") {
      const openInPanel   = function(pos, ref) { this.showBaseText(ref) }.bind(this);
      const openNav       = this.state.compare ? this.props.openComparePanel : this.openMenu.bind(null, "navigation");

      menu = (<ReaderNavigationMenu
                    key={this.state.navigationCategories ? this.state.navigationCategories.join("-") : this.state.navigationTopicCategory ? this.state.navigationTopicCategory: "navHome"}
                    home={this.state.menuOpen === "home"}
                    compare={this.state.compare}
                    interfaceLang={this.props.interfaceLang}
                    multiPanel={this.props.multiPanel}
                    categories={this.state.navigationCategories || []}
                    topic={this.state.navigationTopicCategory || ""}
                    topicTitle={this.state.navigationTopicTitle}
                    showMoreTexts={this.state.showMoreTexts}
                    showMoreTopics={this.state.showMoreTopics}
                    settings={this.state.settings}
                    setCategories={this.setNavigationCategories}
                    setNavTopic={this.setNavigationTopic}
                    setTopic={this.setTopic}
                    setMoreTexts={this.setMoreTexts}
                    setMoreTopics={this.setMoreTopics}
                    setOption={this.setOption}
                    toggleLanguage={this.toggleLanguage}
                    onClose={this.onClose}
                    closePanel={this.props.closePanel}
                    handleClick={this.handleNavigationClick}
                    openNav={openNav}
                    openSearch={this.openSearch}
                    openMenu={this.openMenu}
                    openDisplaySettings={this.openDisplaySettings}
                    hideNavHeader={this.props.hideNavHeader}
                    toggleSignUpModal={this.props.toggleSignUpModal}
                  />);

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
                    close={this.state.compare ? this.props.closePanel : this.closePanelSearch}
                    hideNavHeader={this.props.hideNavHeader}
                    onQueryChange={this.props.onQueryChange}
                    updateTab={this.props.updateSearchTab}
                    updateAppliedFilter={this.props.updateSearchFilter}
                    updateAppliedOptionField={this.props.updateSearchOptionField}
                    updateAppliedOptionSort={this.props.updateSearchOptionSort}
                    registerAvailableFilters={this.props.registerAvailableFilters}
                    compare={this.state.compare}
                  />);

    } else if (this.state.menuOpen === "topics") {
      if (this.state.navigationTopic) {
        menu = (
          <TopicPage
            tab={this.state.topicsTab}
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
            onClose={this.onClose}
            multiPanel={this.props.multiPanel}
            hideNavHeader={this.props.hideNavHeader}
            navHome={this.openMenu.bind(null, "navigation")}
            openDisplaySettings={this.openDisplaySettings}
            toggleSignUpModal={this.props.toggleSignUpModal}
            updateTopicsTab={this.props.updateTopicsTab}
            key={"TopicPage"}
          />
        );
      } else {
        menu = (<TopicPageAll
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
                  key={"TopicPageAll"}
                />);
      }

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

    } else if (this.state.menuOpen === "collection") {
      menu = (<CollectionPage
                name={this.state.collectionName}
                slug={this.state.collectionSlug}
                tag={this.state.collectionTag}
                setCollectionTag={this.setCollectionTag}
                width={this.state.width}
                searchInCollection={this.props.searchInCollection}
                toggleLanguage={this.toggleLanguage}
                toggleSignUpModal={this.props.toggleSignUpModal}
                updateCollectionName={this.updateCollectionName}
                hideNavHeader={this.props.hideNavHeader}
                navHome={this.openMenu.bind(null, "navigation")}
                multiPanel={this.props.multiPanel}
                interfaceLang={this.props.interfaceLang} />);

    } else if (this.state.menuOpen === "collectionsPublic") {
      menu = (<PublicCollectionsPage
                    multiPanel={this.props.multiPanel}
                    navHome={this.openMenu.bind(null, "navigation")}/>);

    } else if (this.state.menuOpen === "homefeed") {
      menu = (<HomeFeed
                    interfaceLang={this.props.interfaceLang}
                    toggleSignUpModal={this.props.toggleSignUpModal}
      />);

    } else if (this.state.menuOpen === "story_editor") {
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
          handleClick={this.handleNavigationClick}
          compare={this.state.compare}
          hideNavHeader={this.props.hideNavHeader}
          interfaceLang={this.props.interfaceLang}
        />
      );
    } else if (this.state.menuOpen === "profile") {
      menu = (
        <UserProfile
          profile={this.state.profile}
          tab={this.state.profileTab}
          setProfileTab={this.setProfileTab}
          toggleSignUpModal={this.props.toggleSignUpModal}
          multiPanel={this.props.multiPanel}
          navHome={this.openMenu.bind(null, "navigation")}
        />
      );
    }

    let classes  = {readerPanel: 1, serif: 1, narrowColumn: this.state.width < 730};
    classes[contextContentLang.language] = 1
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
        <div className={classes} onKeyDown={this.handleKeyPress} role="region" id={"panel-"+this.props.panelPosition}>
        {hideReaderControls ? null :
          <ReaderControls
            showBaseText={this.showBaseText}
            toggleSheetEditMode={this.toggleSheetEditMode}
            currentRef={this.state.currentlyVisibleRef}
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
            connectionData={this.state.connectionData}
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
  openNamedEntityInNewPanel:   PropTypes.func,
  onNavTextClick:              PropTypes.func,
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
  updateTopicsTab:             PropTypes.func,
  updateSearchFilter:          PropTypes.func,
  updateSearchOptionField:     PropTypes.func,
  updateSearchOptionSort:      PropTypes.func,
  registerAvailableFilters:    PropTypes.func,
  searchInCollection:          PropTypes.func,
  openComparePanel:            PropTypes.func,
  setUnreadNotificationsCount: PropTypes.func,
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
  setVersionFilter:            PropTypes.func,
  saveLastPlace:               PropTypes.func,
  checkIntentTimer:            PropTypes.func,
  toggleSignUpModal:           PropTypes.func.isRequired,
  getHistoryRef:               PropTypes.func,
  profile:                     PropTypes.object,
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
  stopPropagation(e){
    e.stopPropagation();
  }
  render() {
    let title = this.props.currentRef || "";
    let heTitle = "";
    let sectionString = "";
    let heSectionString = "";
    let categoryAttribution = null;
    const oref = Sefaria.ref(this.props.currentRef);

    if (this.props.sheetID) {
      if (this.props.sheetTitle === null) {
        title = heTitle = Sefaria._("Loading...");
      } else {
        title = heTitle = this.props.sheetTitle;
        if (title === "") {
          title = heTitle = Sefaria._("Untitled")
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
    const showVersion = this.props.currVersions.en && (this.props.settings.language === "english" || this.props.settings.language === "bilingual");
    const versionTitle = this.props.currVersions.en ? this.props.currVersions.en.replace(/_/g," ") : "";
    const url = this.props.sheetID ? "/sheets/" + this.props.sheetID : oref ? "/" + Sefaria.normRef(oref.book) : Sefaria.normRef(this.props.currentRef);

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
      <div className={"readerTextToc" + (categoryAttribution ? ' attributed' : '')} onClick={this.props.sheetID ? this.openSheetMeta : this.openTextToc}>
        <div className={"readerTextTocBox" + (this.props.sheetID ? " sheetBox" : "")} role="heading" aria-level="1" aria-live="polite">
          <div>
            <a href={url} aria-label={"Show table of contents for " + title} >
              { title ?
              <i className="fa fa-angle-down invisible"></i> : null }

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
              { title ? (<i className="fa fa-angle-down"></i>) : null }
              { showVersion ?
              <span className="readerTextVersion">
                <span className="en">{versionTitle}</span>
              </span> : null}
            </a>
          </div>
          <div onClick={this.stopPropagation}>
            {categoryAttribution ?
            <CategoryAttribution categories={oref.categories} linked={false} /> : null }
          </div>
        </div>
      </div>;

    let leftControls = hideHeader || connectionsHeader ? null :
      (<div className="leftButtons">
          {this.props.multiPanel ? (<ReaderNavigationMenuCloseButton onClick={this.props.closePanel} />) : null}
          {this.props.multiPanel ? null : (<ReaderNavigationMenuMenuButton onClick={this.props.openMenu.bind(null, "navigation")}/>)}
          <SaveButton placeholder={true}/>
        </div>);

    let rightControls = hideHeader || connectionsHeader ? null :
      (<div className="rightButtons">
          <SaveButton
            historyObject={this.props.historyObject}
            tooltip={true}
            toggleSignUpModal={this.props.toggleSignUpModal}
          />
          <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
        </div>);

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
  currVersions:            PropTypes.object,
  connectionsMode:         PropTypes.string,
  connectionsCategory:     PropTypes.string,
  multiPanel:              PropTypes.bool,
  interfaceLang:           PropTypes.string,
  toggleSignUpModal:       PropTypes.func.isRequired,
  historyObject:           PropTypes.object,
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
  render() {
    let languageOptions = [
      {name: "english",   content: "<span class='en'>A</span>", role: "radio", ariaLabel: "Show English Text" },
      {name: "bilingual", content: "<span class='en'>A</span><span class='he'>א</span>", role: "radio", ariaLabel: "Show English & Hebrew Text" },
      {name: "hebrew",    content: "<span class='he'>א</span>", role: "radio", ariaLabel: "Show Hebrew Text" }
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
      this.props.parentPanel == "Sheet" ? null :
      (<ToggleSet
          ariaLabel="text layout toggle"
          label={Sefaria._("Layout")}
          name="layout"
          options={layoutOptions}
          setOption={this.props.setOption}
          currentValue={this.props.currentLayout()} />) :
      (this.props.width > 500 ?
        <ToggleSet
          ariaLabel="bidirectional text layout toggle"
          label={Sefaria._("Bilingual Layout")}
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
          label={Sefaria._("Color")}
          name="color"
          separated={true}
          options={colorOptions}
          setOption={this.props.setOption}
          currentValue={this.props.settings.color} />);
    colorToggle = this.props.multiPanel ? null : colorToggle;

    let sizeOptions = [
      {name: "smaller", content: Sefaria._("Aa"), role: "button", ariaLabel: Sefaria._("Decrease font size") },
      {name: "larger", content: Sefaria._("Aa"), role: "button", ariaLabel: Sefaria._("Increase font size")  }
    ];
    let sizeToggle = (
        <ToggleSet
          ariaLabel="Increase/Decrease Font Size Buttons"
          label={Sefaria._("Font Size")}
          name="fontSize"
          options={sizeOptions}
          setOption={this.props.setOption}
          currentValue={null} />);

    let aliyahOptions = [
      {name: "aliyotOn",   content: Sefaria._("On"), role: "radio", ariaLabel: Sefaria._("Show Parasha Aliyot") },
      {name: "aliyotOff", content: Sefaria._("Off"), role: "radio", ariaLabel: Sefaria._("Hide Parasha Aliyot") },
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
      {name: "all", content: "<span class='he'>אָ֑</span>", role: "radio", ariaLabel: Sefaria._("Show Vowels and Cantillation")},
      {name: "partial", content: "<span class='he'>אָ</span>", role: "radio", ariaLabel: Sefaria._("Show only vowel points")},
      {name: "none", content: "<span class='he'>א</span>", role: "radio", ariaLabel: Sefaria._("Show only consonantal text")}
    ];
    let vowelToggle = null;
    if(!this.props.menuOpen){
      let vowelOptionsSlice = this.vowelToggleAvailability();
      let vowelOptionsTitle = (vowelOptionsSlice == 0) ? Sefaria._("Vocalization") : Sefaria._("Vowels");
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


export default ReaderPanel;
