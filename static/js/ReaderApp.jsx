const React         = require('react');
const classNames    = require('classnames');
const extend        = require('extend');
const PropTypes     = require('prop-types');
const Sefaria       = require('./sefaria/sefaria');
const Header        = require('./Header');
const ReaderPanel   = require('./ReaderPanel');
const $             = require('./sefaria/sefariaJquery');
const EditGroupPage = require('./EditGroupPage');
const Footer        = require('./Footer');
const SearchState   = require('./sefaria/searchState');
const {
  SignUpModal,
  InterruptingMessage,
  CookiesNotification,
}                   = require('./Misc');
import Component from 'react-class';


class ReaderApp extends Component {
  constructor(props) {
    super(props);
    // TODO clean up generation of initial panels objects.
    // Currently these get generated in reader/views.py then regenerated again in ReaderApp.
    this.MIN_PANEL_WIDTH = 360.0;

    var panels               = [];
    var header               = {};
    var defaultVersions      = Sefaria.util.clone(props.initialDefaultVersions) || {};
    var defaultPanelSettings = this.getDefaultPanelSettings();

    if (!props.multiPanel && !props.headerMode) {
      if (props.initialPanels && props.initialPanels.length > 0 && props.initialPanels[0].menuOpen == "book toc") {
        panels[0] = {
            settings: Sefaria.util.clone(defaultPanelSettings),
            menuOpen: "book toc",
            //mode: "Text",
            bookRef:  props.initialPanels[0].bookRef
        };
      } else if (props.initialPanels && props.initialPanels.length > 0 && props.initialPanels[0].menuOpen === "extended notes"){
         panels[0] = {
            settings:      Sefaria.util.clone(defaultPanelSettings),
            menuOpen:      "extended notes",
            currVersions:  props.initialPanels[0].currVersions,
            bookRef:       props.initialPanels[0].bookRef
        };
      } else if (props.initialPath.search(/\/sheets\/\d+/g) !== -1) {
        var mode = props.initialFilter ? "SheetAndConnections" : "Sheet";
        var initialPanel = props.initialPanels && props.initialPanels.length ? props.initialPanels[0] : {};

        panels[0] = {
          highlightedNodes: initialPanel.highlightedNodes,
          naturalDateCreated: initialPanel.sheet && initialPanel.sheet.naturalDateCreated,
          groupLogo: initialPanel.sheet && initialPanel.sheet.groupLogo,
          sheetID: initialPanel.sheetID,
          sheet: initialPanel.sheet,
          refs: props.initialRefs,
          mode: mode,
          filter: props.initialFilter,
          versionFilter: props.initialVersionFilter,
          menuOpen: props.initialMenu,
          connectionsMode: initialPanel.connectionsMode || "Resources",
          currVersions: initialPanel.currVersions || {en:null, he:null},
          searchQuery: props.initialQuery,
          searchTab: props.initialSearchTab || "text",
          textSearchState: new SearchState({
            type: 'text',
            appliedFilters: props.initialTextSearchFilters,
            field: props.initialTextSearchField,
            appliedFilterAggTypes: props.initialTextSearchFilterAggTypes,
            sortType: props.initialTextSearchSortType,
          }),
          sheetSearchState: new SearchState({
            type: 'sheet',
            appliedFilters: props.initialSheetSearchFilters,
            appliedFilterAggTypes: props.initialSheetSearchFilterAggTypes,
            sortType: props.initialSheetSearchSortType,
          }),
          navigationCategories: props.initialNavigationCategories,
          navigationTopic: props.initialTopic,
          sheetsTag: props.initialSheetsTag,
          group: props.initialGroup,
          settings: Sefaria.util.clone(defaultPanelSettings)
        };
        if (panels[0].currVersions.he && panels[0].currVersions.en) { panels[0].settings.language = "bilingual"; }
        else if (panels[0].currVersions.he)                         { panels[0].settings.language = "hebrew"; }
        else if (panels[0].currVersions.en)                         { panels[0].settings.language = "english"; }
        if (mode === "SheetAndConnections") {
          panels[0].highlightedRefs = props.initialRefs;
        }
      }
      else {
        var mode = props.initialFilter ? "TextAndConnections" : "Text";
        var initialPanel = props.initialPanels && props.initialPanels.length ? props.initialPanels[0] : {};

        panels[0] = {
          refs: props.initialRefs,
          mode: mode,
          filter: props.initialFilter,
          versionFilter: props.initialVersionFilter,
          menuOpen: props.initialMenu,
          connectionsMode: initialPanel.connectionsMode || "Resources",
          currVersions: initialPanel.currVersions || {en:null, he:null},
          searchQuery: props.initialQuery,
          searchTab: props.initialSearchTab || "text",
          textSearchState: new SearchState({
            type: 'text',
            appliedFilters: props.initialTextSearchFilters,
            field: props.initialTextSearchField,
            appliedFilterAggTypes: props.initialTextSearchFilterAggTypes,
            sortType: props.initialTextSearchSortType,
          }),
          sheetSearchState: new SearchState({
            type: 'sheet',
            appliedFilters: props.initialSheetSearchFilters,
            appliedFilterAggTypes: props.initialSheetSearchFilterAggTypes,
            sortType: props.initialSheetSearchSortType,
          }),
          navigationCategories: props.initialNavigationCategories,
          navigationTopic: props.initialTopic,
          sheetsTag: props.initialSheetsTag,
          group: props.initialGroup,
          navigationGroupTag: props.initialGroupTag,
          settings: Sefaria.util.clone(defaultPanelSettings)
        };
        if (panels[0].currVersions.he && panels[0].currVersions.en) { panels[0].settings.language = "bilingual"; }
        else if (panels[0].currVersions.he)                         { panels[0].settings.language = "hebrew"; }
        else if (panels[0].currVersions.en)                         { panels[0].settings.language = "english"; }
        if (mode === "TextAndConnections") {
          panels[0].highlightedRefs = props.initialRefs;
        }
      }
    } else {
      var headerState = {
        mode: "Header",
        refs: props.initialRefs,
        bookRef: props.initialBookRef,
        menuOpen: props.initialMenu,
        searchQuery: props.initialQuery,
        searchTab: props.initialSearchTab || "text",
        textSearchState: new SearchState({
          type: 'text',
          appliedFilters: props.initialTextSearchFilters,
          field: props.initialTextSearchField,
          appliedFilterAggTypes: props.initialTextSearchFilterAggTypes,
          sortType: props.initialTextSearchSortType,
        }),
        sheetSearchState: new SearchState({
          type: 'sheet',
          appliedFilters: props.initialSheetSearchFilters,
          appliedFilterAggTypes: props.initialSheetSearchFilterAggTypes,
          sortType: props.initialSheetSearchSortType,
        }),
        navigationCategories: props.initialNavigationCategories,
        navigationTopic: props.initialTopic,
        sheetsTag: props.initialSheetsTag,
        group: props.initialGroup,
        navigationGroupTag: props.initialGroupTag,
        settings: Sefaria.util.clone(defaultPanelSettings)
      };
      header = this.makePanelState(headerState);
      if (props.initialRefs.length) {
        var p = {
          refs: props.initialRefs,
          mode: "Text",
          filter: props.initialPanels[0].filter,
          versionFilter: props.initialPanels[0].versionFilter,
          menuOpen: props.initialPanels[0].menuOpen,
          highlightedRefs: props.initialPanels[0].highlightedRefs || [],
          currVersions: props.initialPanels.length ? props.initialPanels[0].currVersions : {en:null,he:null},
          settings: ("settings" in props.initialPanels[0]) ? extend(Sefaria.util.clone(defaultPanelSettings), props.initialPanels[0].settings) : Sefaria.util.clone(defaultPanelSettings)
        };
        if (!"settings" in props.initialPanels[0]) {
          if (p.currVersions.he && p.currVersions.en) { p.settings.language = "bilingual"; }
          else if (p.currVersions.he)                 { p.settings.language = "hebrew" }
          else if (p.currVersions.en)                 { p.settings.language = "english" }
        }
        panels.push(p);
      }
      for (var i = panels.length; i < props.initialPanels.length; i++) {
        var panel;
        if (props.initialPanels[i].menuOpen == "book toc") {
          panel = {
              menuOpen: props.initialPanels[i].menuOpen,
              bookRef:  props.initialPanels[i].bookRef,
              settings: ("settings" in props.initialPanels[i]) ? extend(Sefaria.util.clone(defaultPanelSettings), props.initialPanels[i].settings) : Sefaria.util.clone(defaultPanelSettings)
          };
        } else {
          panel = this.clonePanel(props.initialPanels[i]);
          panel.settings = Sefaria.util.clone(defaultPanelSettings);
          if (!"settings" in props.initialPanels[i]) {
            if (panel.currVersions.he && p.currVersions.en) { panel.settings.language = "bilingual"; }
            else if (panel.currVersions.he)                 { panel.settings.language = "hebrew" }
            else if (panel.currVersions.en)                 { panel.settings.language = "english" }
          }
        }
        panels.push(panel);
      }
    }
    panels = panels.map(panel => this.makePanelState(panel));

    var layoutOrientation = (props.interfaceLang == "english") ? "ltr" : "rtl";

    this.state = {
      panels: panels,
      header: header,
      headerMode: props.headerMode,
      defaultVersions: defaultVersions,
      defaultPanelSettings: Sefaria.util.clone(defaultPanelSettings),
      layoutOrientation: layoutOrientation,
      path: props.initialPath,
      panelCap: props.initialPanelCap,
      initialAnalyticsTracked: false,
      showSignUpModal: false,
    };
  }
  componentDidMount() {
    this.updateHistoryState(true); // make sure initial page state is in history, (passing true to replace)
    window.addEventListener("popstate", this.handlePopState);
    window.addEventListener("resize", this.setPanelCap);
    this.setPanelCap();
    if (this.props.headerMode) {
      $(".inAppLink").on("click", this.handleInAppLinkClick);
    }
    // Save all initial panels to recently viewed
    this.state.panels.map(this.saveLastPlace);
  }
  componentWillUnmount() {
    window.removeEventListener("popstate", this.handlePopState);
    window.removeEventListener("resize", this.setPanelCap);
  }
  componentDidUpdate(prevProps, prevState) {
    if (this.justPopped) {
      //console.log("Skipping history update - just popped")
      this.justPopped = false;
      return;
    }

    // Set initial page view (deferred from analytics.js instanciation)
    if (!this.state.initialAnalyticsTracked) { this.trackPageview(); }
    // If a new panel has been added, and the panels extend beyond the viewable area, check horizontal scroll
    if (this.state.panels.length > this.state.panelCap && this.state.panels.length > prevState.panels.length) {
      var elem = document.getElementById("panelWrapBox");
      var viewExtent = (this.state.layoutOrientation == "ltr")                      // How far (px) current view extends into viewable area
          ? elem.scrollLeft + this.state.windowWidth
          : elem.scrollWidth - elem.scrollLeft;
      var lastCompletelyVisible = Math.floor(viewExtent / this.MIN_PANEL_WIDTH);    // # of last visible panel - base 1
      var leftover = viewExtent % this.MIN_PANEL_WIDTH;                             // Leftover viewable pixels after last fully visible panel

      var newPanelPosition;                                                         // # of newly inserted panel - base 1
      for (var i = 0; i < this.state.panels.length; i++) {
        if (!prevState.panels[i] || this.state.panels[i] != prevState.panels[i]) {
          newPanelPosition = i+1;
          break;
        }
      }
      if(newPanelPosition > lastCompletelyVisible) {
        var scrollBy = 0;      // Pixels to scroll by
        var panelOffset = 0;   // Account for partial panel scroll
        if (leftover > 0) {    // If a panel is half scrolled, bring it fully into view
          scrollBy += this.MIN_PANEL_WIDTH - leftover;
          panelOffset += 1;
        }
        scrollBy += (newPanelPosition - lastCompletelyVisible - panelOffset) * this.MIN_PANEL_WIDTH;
        elem.scrollLeft = (this.state.layoutOrientation == "ltr")
            ? elem.scrollLeft + scrollBy
            : elem.scrollLeft - scrollBy;
      }
    }

    this.setContainerMode();
    this.updateHistoryState(this.replaceHistory);
  }
  handlePopState(event) {
    var state = event.state;
    //console.log("Pop - " + window.location.pathname);
    //console.log(state);
    if (state) {
      this.justPopped = true;
      // history does not preserve custom objects
      const h = state.header;
      if (!!h) {
        h.textSearchState = h.textSearchState && new SearchState(h.textSearchState);
        h.sheetSearchState = h.sheetSearchState && new SearchState(h.sheetSearchState);
      }
      if (state.panels) {
        for (let p of state.panels) {
          p.textSearchState = p.textSearchState && new SearchState(p.textSearchState);
        }
      }
      this.setState(state);
      if (!h && state.panels) {
        // potentially going back to panel state from header state
        // make sure header is closed
        this.setHeaderState({menuOpen: null});
      }
      this.setContainerMode();
    }
  }
  trackPageview() {
      var headerPanel = this.state.header.menuOpen || (!this.state.panels.length && this.state.header.mode === "Header");
      var panels = headerPanel ? [this.state.header] : this.state.panels;
      var textPanels = panels.filter(panel => (panel.refs.length || panel.bookRef) && panel.mode !== "Connections");
      var connectionPanels = panels.filter(panel => panel.mode == "Connections");

      // Set Page Type
      // Todo: More specificity for sheets - browsing, reading, writing
      if (panels.length < 1) { debugger; }
      else { Sefaria.track.setPageType(panels[0].menuOpen || panels[0].mode); }

      // Number of panels as e.g. "2" meaning 2 text panels or "3.2" meaning 3 text panels and 2 connection panels
      if (connectionPanels.length == 0) {
        Sefaria.track.setNumberOfPanels(textPanels.length.toString());
      } else {
        Sefaria.track.setNumberOfPanels(`${textPanels.length}.${connectionPanels.length}`);
      }

      // refs - per text panel
      var refs =  textPanels.map(panel => (panel.refs.length) ? panel.refs.slice(-1)[0] : panel.bookRef);
      Sefaria.track.setRef(refs.join(" | "));

      // Book name (Index record primary name) - per text panel
      var bookNames = refs.map(ref => Sefaria.parseRef(ref).index).filter(b => !!b);
      Sefaria.track.setBookName(bookNames.join(" | "));

      // Indexes - per text panel
      var indexes = bookNames.map(b => Sefaria.index(b)).filter(i => !!i);

      // categories - per text panel
      var primaryCats = indexes.map(i => (i.dependence === "Commentary")? i.categories[0] + " Commentary": i.categories[0]);
      Sefaria.track.setPrimaryCategory(primaryCats.join(" | "));

      var secondaryCats = indexes.map(i => {
          var cats = i.categories.filter(cat=> cat != "Commentary").slice(1);
          return (cats.length >= 1) ? cats[0] : ""
      });
      Sefaria.track.setSecondaryCategory(secondaryCats.join(" | "));

      // panel content languages - per text panel
      var contentLanguages = textPanels.map(panel => panel.settings.language);
      Sefaria.track.setContentLanguage(contentLanguages.join(" | "));

      // Set Versions - per text panel
      var versionTitles = textPanels.map(p => p.currVersions.en ? `${p.currVersions.en}(en)`: (p.currVersions.he ? `${p.currVersions.he}(he)` : 'default version'));
      Sefaria.track.setVersionTitle(versionTitles.join(" | "));

      // Set Sidebar usages
      // todo: handle toolbar selections
      var sidebars = connectionPanels.map(panel => panel.filter.length ? panel.filter.join("+") : "all");
      Sefaria.track.setSidebars(sidebars.join(" | "));

      // After setting the dimensions, post the hit
      var url = window.location.pathname + window.location.search;
      Sefaria.track.pageview(url);

      if (!this.state.initialAnalyticsTracked) {
        this.setState({initialAnalyticsTracked: true});
      }
  }
  shouldHistoryUpdate() {
    // Compare the current state to the state last pushed to history,
    // Return true if the change warrants pushing to history.
    // If there's no history or the number or basic state of panels has changed
    if (!history.state
        || (!history.state.panels && !history.state.header)
        || (!history.state.panels && this.state.panels)
        || (history.state.panels && (history.state.panels.length !== this.state.panels.length))
        || (history.state.header && (history.state.header.menuOpen !== this.state.header.menuOpen))
      ) {
      return true;
    }

    var prevPanels, nextPanels;
    if (this.props.multiPanel) {
      var headerPanel = this.state.header.menuOpen || (!this.state.panels.length && this.state.header.mode === "Header");
      prevPanels = headerPanel ? [history.state.header] : history.state.panels;
      nextPanels = headerPanel ? [this.state.header] : this.state.panels;
    } else {
      prevPanels = history.state.panels;
      nextPanels = this.state.panels;
    }

    for (let i = 0; i < prevPanels.length; i++) {
      // Cycle through each panel, compare previous state to next state, looking for differences
      const prev  = prevPanels[i];
      const next  = nextPanels[i];
      if (!prev || ! next) { return true; }
      // history does not preserve custom objects
      const prevTextSearchState = new SearchState(prev.textSearchState);
      const prevSheetSearchState = new SearchState(prev.sheetSearchState);
      const nextTextSearchState = new SearchState(next.textSearchState);
      const nextSheetSearchState = new SearchState(next.sheetSearchState);

      if ((prev.mode !== next.mode) ||
          (prev.menuOpen !== next.menuOpen) ||
          (prev.menuOpen === "book toc" && prev.bookRef !== next.bookRef) ||
          (next.mode === "Text" && prev.refs.slice(-1)[0] !== next.refs.slice(-1)[0]) ||
          (next.mode === "Text" && !prev.highlightedRefs.compare(next.highlightedRefs)) ||
          (next.mode === "TextAndConnections" && prev.highlightedRefs.slice(-1)[0] !== next.highlightedRefs.slice(-1)[0]) ||
          ((next.mode === "Connections" || next.mode === "TextAndConnections") && prev.filter && !prev.filter.compare(next.filter)) ||
          (next.mode === "Version Open" && prev.versionFilter && !prev.versionFilter(next.versionFilter)) ||
          (next.mode === "Connections" && !prev.refs.compare(next.refs)) ||
          (next.currentlyVisibleRef === prev.currentlyVisibleRef) ||
          (next.connectionsMode !== prev.connectionsMode) ||
          (prev.navigationSheetTag !== next.navigationSheetTag) ||
          (prev.navigationGroupTag !== next.navigationGroupTag) ||
          (prev.currVersions.en !== next.currVersions.en) ||
          (prev.currVersions.he !== next.currVersions.he) ||
          (prev.searchQuery != next.searchQuery) ||
          (prev.searchTab != next.searchTab) ||
          (!prevTextSearchState.isEqual({ other: nextTextSearchState, fields: ["appliedFilters", "field", "sortType"]})) ||
          (!prevSheetSearchState.isEqual({ other: nextSheetSearchState, fields: ["appliedFilters", "field", "sortType"]})) ||
          (prev.settings.language != next.settings.language) ||
          (prev.settings.aliyotTorah != next.settings.aliyotTorah))

          {
         return true;
      } else if (prev.navigationCategories !== next.navigationCategories) {
        // Handle array comparison, !== could mean one is null or both are arrays
        if (!prev.navigationCategories || !next.navigationCategories) {
          return true; // They are not equal and one is null
        } else if (!prev.navigationCategories.compare(next.navigationCategories)) {
          return true; // both are set, compare arrays
        }
      }
    }
    return false;
  }
  clonePanel(panel, trimFilters) {
    return Sefaria.util.clone(panel, trimFilters);
  }
  _getUrlVersionsParams(currVersions, i) {
    if (currVersions) {
      return Object.keys(currVersions)
              .filter(vlang=>!!currVersions[vlang])
              .map(vlang=>`&v${vlang}${i > 1 ? i : ""}=${currVersions[vlang].replace(/\s/g,"_")}`)
              .join("");
    } else {
      return "";
    }

  }
  makeHistoryState() {
    // Returns an object with state, title and url params for the current state
    var histories = [];
    // When the header has a panel open, only look at its content for history
    var headerPanel = this.state.header.menuOpen || (!this.state.panels.length && this.state.header.mode === "Header");
    var panels = headerPanel ? [this.state.header] : this.state.panels;
    var states = [];
    var siteName = Sefaria._siteSettings["SITE_NAME"]["en"]; // e.g. "Sefaria"

    for (var i = 0; i < panels.length; i++) {
      // Walk through each panel, create a history object as though for this panel alone
      states[i] = this.clonePanel(panels[i], true);
      if (!states[i]) { debugger; }
      var state = states[i];
      var hist  = {url: ""};

      if (state.menuOpen) {
        switch (state.menuOpen) {
          case "home":
            hist.title = Sefaria._("Sefaria: a Living Library of Jewish Texts Online");
            hist.url   = "oldhome";
            hist.mode  = "home";
            break;
          case "navigation":
            var cats   = state.navigationCategories ? state.navigationCategories.join("/") : "";
            hist.title = cats ? Sefaria._va(state.navigationCategories).join(", ") + " | " + Sefaria._(siteName) : Sefaria._("The " + siteName + " Library");
            hist.title = hist.title;
            hist.url   = "texts" + (cats ? "/" + cats : "");
            hist.mode  = "navigation";
            break;
          case "text toc":
            var ref    = state.refs.slice(-1)[0];
            var bookTitle  = ref ? Sefaria.parseRef(ref).index : "404";
            hist.title = Sefaria._v(bookTitle) + " | " + Sefaria._(siteName);
            hist.url   = bookTitle.replace(/ /g, "_");
            hist.mode  = "text toc";
            break;
          case "book toc":
            var bookTitle = state.bookRef;
            hist.title = Sefaria._v(bookTitle) + " | " + Sefaria._(siteName);
            hist.url = bookTitle.replace(/ /g, "_");
            hist.mode = "book toc";
            break;
          case "sheet meta":
            var sheetTitle = state.sheet.title.stripHtml();
            hist.title = Sefaria._(siteName + " Source Sheets")+": " + sheetTitle;
            hist.url = i == 0 ? "sheets/"+ state.sheet.id : "sheet&s="+ state.sheet.id;
            hist.mode = "sheet meta";
            break;
          case "extended notes":
            var bookTitle = state.mode==="Connections" ?Sefaria.parseRef(state.currentlyVisibleRef).index : state.bookRef;
            hist.currVersions = state.currVersions;
            hist.url = `${bookTitle}&notes${i>1 ? i : ''}=1`.replace(/ /g, "_");
            hist.mode = "extended notes";
            break;
          case "search":
            const query = state.searchQuery ? encodeURIComponent(state.searchQuery) : "";
            hist.title = state.searchQuery ? state.searchQuery + " | " : "";
            hist.title += Sefaria._(siteName + " Search");
            hist.url   = "search" + (state.searchQuery ? (`&q=${query}&tab=${state.searchTab}` +
              state.textSearchState.makeURL({ prefix: 't', isStart: false }) +
              state.sheetSearchState.makeURL({ prefix: 's', isStart: false })) : "");
            hist.mode  = "search";
            break;
          case "sheets":
            if (states[i].sheetsGroup) {
                hist.url   = "groups/" + state.sheetsGroup.replace(/\s/g,"-");
                if (states[i].navigationGroupTag) {
                  hist.url  += "?tag=" + state.navigationGroupTag.replace("#","%23");
                }
                hist.title = state.sheetsGroup + " | " + Sefaria._(siteName + " Group");
                hist.mode  = "sheets tag";
            } else if (states[i].navigationSheetTag) {
              if (states[i].navigationSheetTag == "My Sheets") {
                hist.url   = "sheets/private";
                hist.title = Sefaria._("My Source Sheets | " + siteName + " Source Sheets");
                hist.mode  = "sheets tag";
              }
              else if (states[i].navigationSheetTag == "All Sheets") {
                hist.url   = "sheets/tags/" + state.navigationSheetTag;
                hist.title = Sefaria._("Public Source Sheets | " + siteName + " Source Sheets");
                hist.mode  = "sheets tag";
              }
              else {
                hist.url   = "sheets/tags/" + state.navigationSheetTag.replace("#","%23");
                hist.title = state.navigationSheetTag + " | " + Sefaria._(siteName + " Source Sheets");
                hist.mode  = "sheets tag";
              }
            } else {
              hist.url   = "sheets";
              hist.title = Sefaria._(siteName + " Source Sheets");
              hist.mode  = "sheets";
            }
            break;
          case "topics":
            if (states[i].navigationTopic) {
              hist.url   = "topics/" + state.navigationTopic;
              hist.title = state.navigationTopic + " | " + Sefaria._(siteName);
              hist.mode  = "topic";
            } else {
              hist.url   = "topics";
              hist.title = Sefaria._("Topics | " + siteName);
              hist.mode  = "topics";
            }
            break;
          case "account":
            hist.title = Sefaria._(siteName + " Account");
            hist.url   = "account";
            hist.mode  = "account";
            break;
          case "notifications":
            hist.title = Sefaria._(siteName + " Notifcations");
            hist.url   = "notifications";
            hist.mode  = "notifications";
            break;
          case "publicGroups":
            hist.title = Sefaria._(siteName + " Groups");
            hist.url = "groups";
            hist.mode = "publicGroups";
            break;
          case "myGroups":
            hist.title = Sefaria._(siteName + " Groups");
            hist.url = "my/groups";
            hist.mode = "myGroups";
            break;
          case "myNotes":
            hist.title = Sefaria._("My Notes on " + siteName);
            hist.url = "my/notes";
            hist.mode = "myNotes";
            break;
          case "updates":
            hist.title = Sefaria._("New Additions to the " + siteName + " Library");
            hist.url = "updates";
            hist.mode = "updates";
            break;
          case "modtools":
            hist.title = Sefaria._("Moderator Tools");
            hist.url = "modtools";
            hist.mode = "modtools";
            break;
          case "story_editor":
            hist.title = Sefaria._("Story Editor");
            hist.url = "story_editor";
            hist.mode = "story_editor";
            break;
          case "saved":
            hist.title = Sefaria._("My Saved Content");
            hist.url = "texts/saved";
            hist.mode = "saved";
            break;
          case "history":
            hist.title = Sefaria._("My User History");
            hist.url = "texts/history";
            hist.mode = "history";
            break;
          case "homefeed":
            hist.title = Sefaria._("Sefaria Stories");
            hist.url = "";
            hist.mode = "homefeed";
            break;
        }
      } else if (state.mode === "Text") {
        var highlighted = state.highlightedRefs.length ? Sefaria.normRefList(state.highlightedRefs) : null;

        if (highlighted &&
            (Sefaria.refContains(highlighted, state.currentlyVisibleRef)
             || Sefaria.refContains(state.currentlyVisibleRef, highlighted))) {
          var htitle = highlighted;
        } else {
          var htitle = state.currentlyVisibleRef;
        }
        hist.title        = Sefaria._r(htitle);
        hist.url          = Sefaria.normRef(htitle);
        hist.currVersions = state.currVersions;
        hist.mode         = "Text";
        if(Sefaria.titleIsTorah(htitle)){
          hist.aliyot = (state.settings.aliyotTorah == "aliyotOff") ? 0 : 1;
        }
      } else if (state.mode === "Connections") {
        var ref       = Sefaria.normRefList(state.refs);
        var filter    = state.filter.length ? state.filter :
                          (state.connectionsMode in {"Sheets": 1, "Notes": 1, "Versions": 1, "Version Open": 1, "About": 1, "extended notes" : 1,} ? [state.connectionsMode] : ["all"]);
        hist.sources  = filter.join("+");
        if (state.connectionsMode === "Version Open" && state.versionFilter.length) {
          hist.versionFilter = state.versionFilter[0];
        }
        hist.title    = Sefaria._r(ref)  + Sefaria._(" with ") + Sefaria._(hist.sources === "all" ? "Connections" : hist.sources);
        hist.url      = Sefaria.normRef(ref); // + "?with=" + sources;
        hist.mode     = "Connections";


      } else if (state.mode === "TextAndConnections") {
        var ref       = Sefaria.normRefList(state.highlightedRefs);
        var filter    = state.filter.length ? state.filter :
                          (state.connectionsMode in {"Sheets": 1, "Notes": 1, "Versions": 1, "Version Open": 1, "About": 1, "extended notes": 1,} ? [state.connectionsMode] : ["all"]);
        hist.sources  = filter.join("+");
        if (state.connectionsMode === "Version Open" && state.versionFilter.length) {
          hist.versionFilter = state.versionFilter[0];
        }
        hist.title    = Sefaria._r(ref)  + Sefaria._(" with ") + Sefaria._(hist.sources === "all" ? "Connections" : hist.sources);
        hist.url      = Sefaria.normRef(ref); // + "?with=" + sources;
        hist.currVersions = state.currVersions;
        hist.mode     = "TextAndConnections";
        if(Sefaria.titleIsTorah(ref)){
          hist.aliyot = (state.settings.aliyotTorah == "aliyotOff") ? 0 : 1;
        }
      } else if (state.mode === "Header") {
        hist.title    = document.title;
        hist.url      = window.location.pathname.slice(1);
        if (window.location.search != ""){
          hist.url += window.location.search;
        }
        hist.mode   = "Header"

      } else if (state.mode === "Sheet") {
        hist.title = state.sheet.title.stripHtml();
        var sheetURLSlug = state.highlightedNodes ? state.sheet.id + "." + state.highlightedNodes : state.sheet.id;
        hist.url = i == 0 ? "sheets/"+ sheetURLSlug : "sheet&s="+ sheetURLSlug;
        hist.mode     = "Sheet"
      } else if (state.mode === "SheetAndConnections") {
        var filter    = state.filter.length ? state.filter :
                          (state.connectionsMode in {"Sheets": 1, "Notes": 1, "Versions": 1, "Version Open": 1, "About": 1} ? [state.connectionsMode] : ["all"]);
        hist.sources  = filter.join("+");
        if (state.connectionsMode === "Version Open" && state.versionFilter.length) {
          hist.versionFilter = state.versionFilter[0];
        }
        hist.title    = state.sheet.title.stripHtml()  + Sefaria._(" with ") + Sefaria._(hist.sources === "all" ? "Connections" : hist.sources);
        hist.url = i == 0 ? "sheets/"+state.sheet.id : "sheet&s="+ state.sheet.id + "?with=" + Sefaria._(hist.sources === "all" ? "Connections" : hist.sources);
        hist.mode     = "SheetAndConnections";
      }
      if (state.mode !== "Header") {
        hist.lang =  state.settings.language ? state.settings.language.substring(0,2) : "bi";
      }
      histories.push(hist);
    }
    if (!histories.length) {debugger;}

    // Now merge all history objects into one
    var title =  histories.length ? histories[0].title : "Sefaria";

    var url   = "/" + (histories.length ? histories[0].url : "");
    url += this._getUrlVersionsParams(histories[0].currVersions, 0);
    if (histories[0].mode === "TextAndConnections" || histories[0].mode === "SheetAndConnections") {
        url += "&with=" + histories[0].sources;
    }
    if(histories[0].lang) {
        url += "&lang=" + histories[0].lang;
    }
    if("aliyot" in histories[0]) {
        url += "&aliyot=" + histories[0].aliyot;
    }
    hist = (headerPanel)
        ? {state: {header: states[0]}, url: url, title: title}
        : {state: {panels: states}, url: url, title: title};
    for (var i = 1; i < histories.length; i++) {
      if ((histories[i-1].mode === "Text" && histories[i].mode === "Connections") || (histories[i-1].mode === "Sheet" && histories[i].mode === "Connections")) {
        if (i == 1) {
          var sheetAndCommentary = histories[i-1].mode === "Sheet" ? true : false;
          // short form for two panels text+commentary - e.g., /Genesis.1?with=Rashi
          hist.url  = sheetAndCommentary ? "/" + histories[0].url : "/" + histories[1].url; // Rewrite the URL
          hist.url += this._getUrlVersionsParams(histories[0].currVersions, 0);
          if(histories[0].lang) {
            hist.url += "&lang=" + histories[0].lang;
          }
          if("aliyot" in histories[0]) {
              url += "&aliyot=" + histories[0].aliyot;
          }
          if(histories[1].versionFilter) {
            hist.url += "&vside=" + histories[1].versionFilter.replace(/\s/g, '_');
          }
          hist.url += "&with=" + histories[1].sources;

          hist.title = sheetAndCommentary ? histories[0].title : histories[1].title;
        } else {
          var replacer = "&p" + i + "=";
          hist.url    = hist.url.replace(RegExp(replacer + ".*"), "");
          hist.url   += replacer + histories[i].url;
          hist.url += this._getUrlVersionsParams(histories[i-1].currVersions, i);
          if(histories[i-1].lang) {
            hist.url += "&lang" + (i) + "=" + histories[i-1].lang;
          }
          if("aliyot" in histories[i-1]) {
            hist.url += "&aliyot" + (i) + "=" + histories[i-1].aliyot;
          }
          if(histories[i].versionFilter) {
            hist.url += "&vside" + (i) + "=" + histories[i].versionFilter.replace(/\s/g, '_');
          }
          hist.url   += "&w" + i + "=" + histories[i].sources; //.replace("with=", "with" + i + "=").replace("?", "&");
          hist.title += Sefaria._(" & ") + histories[i].title; // TODO this doesn't trim title properly
        }
      } else {
        var next    = "&p=" + histories[i].url;
        next        = next.replace("?", "&").replace(/=/g, (i+1) + "=");
        hist.url   += next;
        hist.url += this._getUrlVersionsParams(histories[i].currVersions, i+1);
        hist.title += Sefaria._(" & ") + histories[i].title;
      }
      if(histories[i].lang) {
        hist.url += "&lang" + (i+1) + "=" + histories[i].lang;
      }
      if("aliyot" in histories[i]) {
            hist.url += "&aliyot" + (i+1) + "=" + histories[i].aliyot;
      }
    }
    // Replace the first only & with a ?
    hist.url = hist.url.replace(/&/, "?");

    return hist;
  }
  _refState() {
    // Return a single flat list of all the refs across all panels
    var panels = (this.props.multiPanel)? this.state.panels : [this.state.header];
    return [].concat(...panels.map(p => p.refs || []))
  }
  // These two methods to check scroll intent have similar implementations on the panel level.  Refactor?
  // Dec 2018 - somewhat refactored
  checkScrollIntentAndTrack() {
    // Record current state of panel refs, and check if it has changed after some delay.  If it remains the same, track analytics.
    const initialRefs = this._refState();
    this.scrollIntentTimer = this.checkIntentTimer(this.scrollIntentTimer, () => {
      if (initialRefs.compare(this._refState())) {
        console.log("TRACK PAGE VIEW");
        this.trackPageview();
      }
      this.scrollIntentTimer = null;
    });
  }
  checkPanelScrollIntentAndSaveRecent(state, n) {
    // Record current state of panel refs, and check if it has changed after some delay.  If it remains the same, track analytics.
    this.panelScrollIntentTimer = this.panelScrollIntentTimer || [];
    this.panelScrollIntentTimer[n] = this.checkIntentTimer(this.panelScrollIntentTimer[n], () => {
      if (!this.didPanelRefChange(state, this.state.panels[n])) {
        //const ref  = (state.highlightedRefs && state.highlightedRefs.length) ? Sefaria.normRef(state.highlightedRefs) : (state.currentlyVisibleRef || state.refs.slice(-1)[0]);  // Will currentlyVisibleRef ever not be available?
        //console.log("Firing last viewed " + ref + " in panel " + n);
        this.saveLastPlace(this.state.panels[n], n);
      }
      this.panelScrollIntentTimer[n] = null;
    });
  }
  checkIntentTimer(timer, cb) {
    const intentDelay = 3000;  // Number of milliseconds to demonstrate intent
    if (timer) { clearTimeout(timer); }
    return window.setTimeout(cb, intentDelay);
  }
  updateHistoryState(replace) {
    if (!this.shouldHistoryUpdate()) {
      return;
    }
    let currentUrl = (window.location.pathname + window.location.search);
    let hist       = this.makeHistoryState();
    if(window.location.hash.length){
      currentUrl += window.location.hash;
      hist.url += window.location.hash;
    }
    if (replace) {
      history.replaceState(hist.state, hist.title, hist.url);
      //console.log("Replace History - " + hist.url);
      if (currentUrl != hist.url) { this.checkScrollIntentAndTrack(); }
      //console.log(hist);
    } else {
      if (currentUrl == hist.url) { return; } // Never push history with the same URL
      history.pushState(hist.state, hist.title, hist.url);
      //console.log("Push History - " + hist.url);
      this.trackPageview();
    }

    $("title").html(hist.title);
    this.replaceHistory = false;

    this.setPaddingForScrollbar() // Called here to save duplicate calls to shouldHistoryUpdate
  }
  makePanelState(state) {
    // Return a full representation of a single panel's state, given a partial representation in `state`
    var panel = {
      mode:                    state.mode,                   // "Text", "TextAndConnections", "Connections", "Sheet", "SheetAndConnection"
      refs:                    state.refs                    || [], // array of ref strings
      filter:                  state.filter                  || [],
      versionFilter:           state.versionFilter           || [],
      connectionsMode:         state.connectionsMode         || "Resources",
      currVersions:            state.currVersions            || {en:null,he:null},
      highlightedRefs:         state.highlightedRefs         || [],
      highlightedNodes:        state.highlightedNodes        || null,
      currentlyVisibleRef:     state.refs && state.refs.length ? state.refs[0] : null,
      recentFilters:           state.recentFilters           || state.filter || [],
      recentVersionFilters:    state.recentVersionFilters    || state.versionFilter || [],
      menuOpen:                state.menuOpen                || null, // "navigation", "text toc", "display", "search", "sheets", "home", "book toc"
      navigationCategories:    state.navigationCategories    || [],
      navigationSheetTag:      state.sheetsTag               || null,
      navigationGroupTag:      state.navigationGroupTag      || null,
      sheet:                   state.sheet                   || null,
      sheetNodes:              state.sheetNodes              || null,
      nodeRef:                 state.nodeRef                 || null,
      navigationTopic:         state.navigationTopic         || null,
      sheetsGroup:             state.group                   || null,
      searchQuery:             state.searchQuery             || null,
      searchTab:               state.searchTab               || 'text',
      textSearchState:         state.textSearchState         || new SearchState({ type: 'text' }),
      sheetSearchState:        state.sheetSearchState        || new SearchState({ type: 'sheet' }),
      openSidebarAsConnect:    state.openSidebarAsConnect    || false,
      bookRef:                 state.bookRef                 || null,
      settings:                state.settings ? Sefaria.util.clone(state.settings) : Sefaria.util.clone(this.getDefaultPanelSettings()),
      displaySettingsOpen:     false,
      tagSort:                 state.tagSort                 || "count",
      mySheetSort:             state.mySheetSort             || "date",
      initialAnalyticsTracked: state.initialAnalyticsTracked || false,
      selectedWords:           state.selectedWords           || "",
      textHighlights:          state.textHighlights          || null,
    };
    // if version is not set for the language you're in, see if you can retrieve it from cache
    if (this.state && panel.refs.length && ((panel.settings.language === "hebrew" && !panel.currVersions.he) || (panel.settings.language !== "hebrew" && !panel.currVersions.en ))) {
      var oRef = Sefaria.ref(panel.refs[0]);
      if (oRef) {
        const lang = panel.settings.language == "hebrew"?"he":"en";
        panel.currVersions[lang] = this.getCachedVersion(oRef.indexTitle, lang);
      }
    }
    return panel;
  }
  getDefaultPanelSettings() {
    if (this.state && this.state.defaultPanelSettings) {
      return this.state.defaultPanelSettings;
    } else if (this.props.initialSettings) {
      return this.props.initialSettings;
    } else {
      return {
        language:      "bilingual",
        layoutDefault: "segmented",
        layoutTalmud:  "continuous",
        layoutTanakh:  "segmented",
        aliyotTorah:   "aliyotOff",
        vowels:        "all",
        biLayout:      "stacked",
        color:         "light",
        fontSize:      62.5
      };
    }
  }
  setContainerMode() {
    // Applies CSS classes to the React container so that the App can function as a header only on top of another page.
    // todo: because headerMode CSS was messing stuff up, header links are reloads in headerMode.  So - not sure if this method is still needed.
    if (this.props.headerMode) {
      if (this.state.header.menuOpen || this.state.panels.length) {
        $("#s2").removeClass("headerOnly");
        $("body").css({overflow: "hidden"})
                  .removeClass("hasBannerMessage");
      } else {
        $("#s2").addClass("headerOnly");
        $("body").css({overflow: "auto"});
      }
    }
  }
  setPanelCap() {
    // In multi panel mode, set the maximum number of visible panels depending on the window width.
    this.setWindowWidth();
    var panelCap = Math.floor($(window).outerWidth() / this.MIN_PANEL_WIDTH);
    this.setState({panelCap: panelCap});
  }
  setWindowWidth() {
    // console.log("Setting window width: " + $(window).outerWidth());
    this.setState({windowWidth: $(window).outerWidth()});
  }
  setPaddingForScrollbar() {
    // Scrollbars take up spacing, causing the centering of panels to be slightly off
    // compared to the header. This functions sets appropriate padding to compensate.
    var width = Sefaria.util.getScrollbarWidth();
    // These are the divs that actually scroll
    var $container = $(ReactDOM.findDOMNode(this)).find(".content, .textColumn");
    if (this.state.panels.length > 1) {
      $container.css({paddingRight: "", paddingLeft: ""});
    } else {
      if (this.props.interfaceLang == "hebrew") {
        $container.css({paddingRight: width, paddingLeft: 0});
      } else {
        $container.css({paddingRight: 0, paddingLeft: width});
      }
    }
  }
  toggleSignUpModal() {
    this.setState({ showSignUpModal: !this.state.showSignUpModal });
  }
  handleNavigationClick(ref, currVersions, options) {
    this.openPanel(ref, currVersions, options);
  }
  handleSegmentClick(n, ref, sheetNode) {
    // Handle a click on a text segment `ref` in from panel in position `n`
    // Update or add panel after this one to be a TextList
    var refs = typeof ref == "string" ? [ref] : ref;

    if (sheetNode) {
      this.setSheetHighlight(n, sheetNode);
    }
    else {
      this.setTextListHighlight(n, refs);
    }

    var nodeRef = sheetNode ? this.state.panels[n].sheet.id + "." + sheetNode : null;

    if (this.currentlyConnecting()) { return }

    this.openTextListAt(n+1, refs, nodeRef);
    if ($(".readerPanel")[n+1] && window.getSelection().isCollapsed) { //Focus on the first focusable element of the newly loaded panel if text not selected. Mostly for a11y
      var curPanel = $(".readerPanel")[n+1];
      $(curPanel).find(':focusable').first().focus();
    }
  }
  handleCitationClick(n, citationRef, textRef) {
    // Handle clicking on the citation `citationRef` which was found inside of `textRef` in panel `n`.
    if (this.state.panels.length > n+1  && this.state.panels[n+1].mode === "Connections") {
      this.closePanel(n+1);
    }
    this.setTextListHighlight(n, [textRef]);
    this.openPanelAt(n, citationRef);
  }
  handleRecentClick(pos, ref, currVersions) {
    // Click on an item in your Recently Viewed
    if (this.props.multiPanel) {
      this.openPanel(ref, currVersions);
    } else {
      this.handleNavigationClick(ref, currVersions);
    }
  }
  handleCompareSearchClick(n, ref, currVersions, options) {
    // Handle clicking a search result in a compare panel, so that clicks don't clobber open panels
    // todo: support options.highlight, passed up from SearchTextResult.handleResultClick()
    this.replacePanel(n, ref, currVersions);
  }
  handleInAppLinkClick(e) {
    e.preventDefault();
    var path = $(e.currentTarget).attr("href").slice(1);
    if (path == "texts") {
      this.showLibrary();
    } else if (path == "sheets") {
      this.showSheets();
    } else if (path == "sheets/private") {
      this.showMySheets();
    } else if (path == "my/groups") {
      this.showMyGroups();
    } else if (path == "my/notes") {
      this.showMyNotes();
    } else if (Sefaria.isRef(path)) {
      this.openPanel(Sefaria.humanRef(path));
    }
    $(".wrapper").remove();
    $("#footer").remove();
  }
  _getStateAndSetStateForHeaderPanelFuncs(n) {
    // helper func to avoid code duplication in funcs of type `updateXInHeader` / `updateXInPanel`
    return {
      tempState:    (typeof n === 'undefined') ? this.state.header : this.state.panels[n],
      tempSetState: (typeof n === 'undefined') ? this.setHeaderState : this.setPanelState.bind(this, n),
    };
  }
  unsetTextHighlight(n) {
    this.setPanelState(n, { textHighlights: null });
  }
  _getSearchStateName(type) { return `${type}SearchState`; }
  _getSearchState(state, type) { return !!state && state[this._getSearchStateName(type)]; }
  updateQueryInHeader(query) {
    this.updateQuery(undefined, query);
  }
  updateQuery(n, query) {
    const { tempState, tempSetState } = this._getStateAndSetStateForHeaderPanelFuncs(n);
    const updates = {
      searchQuery: query,
      textSearchState: tempState.textSearchState.update({ filtersValid: false }),
      sheetSearchState: tempState.sheetSearchState.update({ filtersValid: false }),
    };
    tempSetState(updates);
  }
  updateSearchTabInHeader(searchTab) {
    this.updateSearchTab(undefined, searchTab);
  }
  updateSearchTab(n, searchTab) {
    const { tempState, tempSetState } = this._getStateAndSetStateForHeaderPanelFuncs(n);
    tempSetState({ searchTab });
  }
  updateAvailableFiltersInHeader(type, availableFilters, filterRegistry, orphanFilters, aggregationsToUpdate) {
    this.updateAvailableFilters(undefined, ...arguments);
  }
  updateAvailableFilters(n, type, availableFilters, filterRegistry, orphanFilters, aggregationsToUpdate) {
    const { tempState, tempSetState } = this._getStateAndSetStateForHeaderPanelFuncs(n);
    const searchState = this._getSearchState(tempState, type);
    const searchStateName = this._getSearchStateName(type);
    tempSetState({
      [searchStateName]: !!searchState ?
        searchState.update({
          availableFilters,
          filterRegistry,
          orphanFilters,
          filtersValid: true,
          aggregationsToUpdate,
        }) : new SearchState({
        type,
        availableFilters,
        filterRegistry,
        orphanFilters,
        filtersValid: true,
      })
    });
  }
  updateSearchFilterInHeader(type, filterNode) {
    this.updateSearchFilter(undefined, ...arguments);
  }
  updateSearchFilter(n, type, filterNode) {
    const { tempState, tempSetState } = this._getStateAndSetStateForHeaderPanelFuncs(n);
    const searchState = this._getSearchState(tempState, type);
    const searchStateName = this._getSearchStateName(type);
    if (filterNode.isUnselected()) {
      filterNode.setSelected(true);
    } else {
      filterNode.setUnselected(true);
    }
    tempSetState({
      [searchStateName]: searchState.update(
        Sefaria.search.getAppliedSearchFilters(searchState.availableFilters)
      )
    });
  }
  updateSearchOptionFieldInHeader(type, field) {
    this.updateSearchOptionField(undefined, ...arguments);
  }
  updateSearchOptionField(n, type, field) {
    const { tempState, tempSetState } = this._getStateAndSetStateForHeaderPanelFuncs(n);
    const searchState = this._getSearchState(tempState, type);
    const searchStateName = this._getSearchStateName(type);
    tempSetState({
      [searchStateName]: searchState.update({ field, filtersValid: false })
    });
  }
  updateSearchOptionSortInHeader(type, sortType) {
    this.updateSearchOptionSort(undefined, ...arguments);
  }
  updateSearchOptionSort(n, type, sortType) {
    const { tempState, tempSetState } = this._getStateAndSetStateForHeaderPanelFuncs(n);
    const searchState = this._getSearchState(tempState, type);
    const searchStateName = this._getSearchStateName(type);
    tempSetState({
      [searchStateName]: searchState.update({ sortType })
    });
  }
  setPanelState(n, state, replaceHistory) {
    this.replaceHistory  = Boolean(replaceHistory);
    //console.log(`setPanel State ${n}, replace: ` + this.replaceHistory);
    //console.log(state)
    // When the driving panel changes language, carry that to the dependent panel
    // However, when carrying a language change to the Tools Panel, do not carry over an incorrect version
    if (!this.state.panels[n]) { debugger; }
    var langChange  = state.settings && state.settings.language !== this.state.panels[n].settings.language;
    var next        = this.state.panels[n+1];
    if (langChange && next && next.mode === "Connections" && state.settings.language !== "bilingual") {
        next.settings.language = state.settings.language;
    }
    // state is not always a full panel state. make sure it has necessary fields needed to run saveLastPlace()
    state = {
      ...this.state.panels[n],
      ...state,
    };
    if (this.didPanelRefChange(this.state.panels[n], state)) {
      this.checkPanelScrollIntentAndSaveRecent(state, n);
    }
    this.state.panels[n] = extend(this.state.panels[n], state);
    var new_state = {panels: this.state.panels};
    if(this.didDefaultPanelSettingsChange(state)){
      new_state["defaultPanelSettings"] = Sefaria.util.clone(state.settings);
    }
    this.setState(new_state);
  }
  didDefaultPanelSettingsChange(state){
    if ("settings" in state){
      let defaultSettings = this.getDefaultPanelSettings();
      let defaultKeys = Object.keys(defaultSettings);
      for (let i of defaultKeys) {
        //console.log(i); // logs 3, 5, 7
        if (state.settings[i] != defaultSettings[i]){
          return true;
        }

      }
    } else {
      return false;
    }
  }
  didPanelRefChange(prevPanel, nextPanel) {
    // Returns true if nextPanel represents a change in current ref (including version change) from prevPanel.
    if (!prevPanel && !!nextPanel) { return true; }
    if (!!prevPanel && !nextPanel) { return true; }
    if (!prevPanel && !nextPanel) { return false; }
    if (prevPanel.mode === 'Connections' && nextPanel.mode === 'Text') { return false; }  // special case. when opening new panel from commentary, ref is already logged in history
    if (prevPanel.mode === 'Text' && nextPanel.mode === 'Sheet') { return true; }
    if (prevPanel.mode === 'Sheet' && nextPanel.mode === 'Text') { return true; }
    if (nextPanel.mode === 'Text') {
      if (nextPanel.menu || nextPanel.mode == "Connections" ||
          !nextPanel.refs || nextPanel.refs.length == 0 ||
          !prevPanel.refs || prevPanel.refs.length == 0 ) { return false; }
      if (nextPanel.refs.compare(prevPanel.refs)) {
        if (nextPanel.currVersions.en !== prevPanel.currVersions.en) { return true; }
        if (nextPanel.currVersions.he !== prevPanel.currVersions.he) { return true; }
        //console.log('didPanelRefChange?', nextPanel.highlightedRefs, prevPanel.highlightedRefs);
        return !((nextPanel.highlightedRefs || []).compare(prevPanel.highlightedRefs || []));
      } else {
        return true;
      }
    } else if (nextPanel.mode === 'Sheet') {
      if (!prevPanel.sheet && !!nextPanel.sheet) { return true; }
      if (!nextPanel.sheet && !!prevPanel.sheet) { return true; }
      if (!prevPanel.sheet && !nextPanel.sheet) { return false; }
      if (prevPanel.sheet.id !== nextPanel.sheet.id) { return true; }
      return prevPanel.highlightedNodes !== nextPanel.highlightedNodes
    } else {
      return true;
    }
  }
  addToSourceSheet(n, selectedSheet, confirmFunction) {
    // This is invoked from a connections panel.
    // It sends a ref-based (i.e. "inside") source
    var connectionsPanel = this.state.panels[n];
    var textPanel = this.state.panels[n-1];

    var source  = { refs: connectionsPanel.refs };

    // If version exists in main panel, pass it along, use that for the target language.
    const { en, he } = textPanel.currVersions;
    if (he)      { source.version = he; source.versionLanguage = "he"; }
    else if (en) { source.version = en; source.versionLanguage = "en"; }
    // If something is highlighted and main panel language is not bilingual:
    // Use main panel language to determine which version this highlight covers.
    var language = textPanel.settings.language;
    var selectedWords = connectionsPanel.selectedWords;
    if (selectedWords && language != "bilingual") {
      source[language.slice(0,2)] = selectedWords;
    }

    var url     = "/api/sheets/" + selectedSheet + "/add";
    $.post(url, {source: JSON.stringify(source)}, confirmFunction);

  }
  getLicenseMap() {
    const licenseMap = {
      "Public Domain": "https://en.wikipedia.org/wiki/Public_domain",
      "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
      "CC-BY": "https://creativecommons.org/licenses/by/3.0/",
      "CC-BY-SA": "https://creativecommons.org/licenses/by-sa/3.0/",
      "CC-BY-NC": "https://creativecommons.org/licenses/by-nc/4.0/"
    }
    return licenseMap;
  }
  translateISOLanguageCode(code) {
    //takes two-letter ISO 639.2 code and returns full language name
    const codeMap = {
      "en": "English",
      "he": "Hebrew",
      "yi": "Yiddish",
      "fi": "Finnish",
      "pt": "Portuguese",
      "es": "Spanish",
      "fr": "French",
      "de": "German",
      "ar": "Arabic",
      "it": "Italian",
      "pl": "Polish",
      "ru": "Russian",
    };
    return codeMap[code.toLowerCase()];
  }
  selectVersion(n, versionName, versionLanguage) {
    // Set the version for panel `n`.
    var panel = this.state.panels[n];
    var oRef = Sefaria.ref(panel.refs[0]);
    let panelLang;
    if (versionName && versionLanguage) {
      panel.currVersions[versionLanguage] = versionName;
      if ((versionLanguage === "he" && !!panel.currVersions["en"]) ||
          (versionLanguage === "en" && !!panel.currVersions["he"])) { // if both versionLanguages are set, try to show them both
        panelLang = "bilingual";
      } else if (versionLanguage === "he") {
        panelLang = "hebrew";
      } else {
        panelLang = "english";
      }

      this.setCachedVersion(oRef.indexTitle, versionLanguage, versionName);
      Sefaria.track.event("Reader", "Choose Version", `${oRef.indexTitle} / ${versionName} / ${versionLanguage}`)
    } else {
      panel.currVersions[versionLanguage] = null;
      Sefaria.track.event("Reader", "Choose Version", `${oRef.indexTitle} / default version / ${panel.settings.language}`)
    }
    if((this.state.panels.length > n+1) && this.state.panels[n+1].mode == "Connections"){
      var connectionsPanel =  this.state.panels[n+1];
      connectionsPanel.currVersions = panel.currVersions;
      if (panelLang) {
        panel.settings.language = panelLang;
        connectionsPanel.settings.language = panelLang !== "bilingual" ? panelLang : (versionLanguage === "he" ? "hebrew" : "english");
      }
    } else if (n-1 >= 0 && this.state.panels[n].mode === "Connections") {
      const masterPanel = this.state.panels[n-1];
      masterPanel.currVersions = panel.currVersions;
      if (panelLang) {
        panel.settings.language = panelLang !== "bilingual" ? panelLang : (versionLanguage === "he" ? "hebrew" : "english");
        masterPanel.settings.language = panelLang;
      }
    }
    this.setState({panels: this.state.panels});
  }
  viewExtendedNotes(n, method, title, versionLanguage, versionName) {
    var panel = this.state.panels[n];
    panel.bookRef = title;
    panel.currVersions = {'en': null, 'he': null}; // ensure only 1 version is set
    panel.currVersions[versionLanguage] = versionName;
    if (method === "toc") {
      panel.menuOpen = "extended notes";
    }
    else if (method === "Connections") {
      panel.connectionsMode = "extended notes";
    }
    this.setState({panels: this.state.panels});
  }
  backFromExtendedNotes(n, bookRef, currVersions){
    var panel = this.state.panels[n];
    panel.menuOpen = panel.currentlyVisibleRef ? "text toc" : "book toc";
    panel.bookRef = bookRef;
    panel.currVersions = currVersions;
    this.setState({panels: this.state.panels});
  }
  // this.state.defaultVersion is a depth 2 dictionary - keyed: bookname, language
  getCachedVersion(indexTitle, language) {
    if ((!indexTitle) || (!(this.state.defaultVersions[indexTitle]))) { return null; }
    return (language) ? (this.state.defaultVersions[indexTitle][language] || null) : this.state.defaultVersions[indexTitle];
  }
  setCachedVersion(indexTitle, language, versionTitle) {
    this.state.defaultVersions[indexTitle] = this.state.defaultVersions[indexTitle] || {};
    this.state.defaultVersions[indexTitle][language] = versionTitle;  // Does this need a setState?  I think not.
  }
  setHeaderState(state, replaceHistory) {
    this.state.header = extend(this.state.header, state);
    this.setState({header: this.state.header});
  }
  setDefaultOption(option, value) {
    if (value !== this.state.defaultPanelSettings[option]) {
      this.state.defaultPanelSettings[option] = value;
      this.setState(this.state);
    }
  }
  openPanel(ref, currVersions, options) {
    // Opens a text panel, replacing all panels currently open.
    // options can contain {
    //  'textHighlights': array of strings to highlight in focused segment. used when clicking on search query result
    // }
    this.state.panels = [] // temporarily clear panels directly in state, set properly with setState in openPanelAt
    this.openPanelAt(0, ref, currVersions, options);
  }
  async openPanelAt(n, ref, currVersions, options) {
    // Open a new panel after `n` with the new ref

    // If book level, Open book toc
    const parsedRef = Sefaria.parseRef(ref);
    var index = Sefaria.index(ref); // Do we have to worry about normalization, as in Header.subimtSearch()?
    var panel;
    if (index) {
      panel = this.makePanelState({"menuOpen": "book toc", "bookRef": index.title});
    } else if (parsedRef.book === "Sheet") {
      const [sheetId, sheetNode] = parsedRef.sections;
      // a bit messy to put async func here. Ideally `sheet` would not be stored in props
      const sheet = await (new Promise((resolve, reject) => Sefaria.sheets.loadSheetByID(sheetId, sheet => resolve(sheet))));
      panel = this.makePanelState({mode: 'Sheet', sheet});
    } else {  // Text
      if (ref.constructor == Array) {
        // When called with an array, set highlight for the whole spanning range of the array
        var refs = ref;
        var currentlyVisibleRef = Sefaria.normRef(ref);
        var splitArray = refs.map(ref => Sefaria.splitRangingRef(ref));
        var highlightedRefs = [].concat.apply([], splitArray);
      } else {
        var refs = [ref];
        var currentlyVisibleRef = ref;
        var highlightedRefs = [];
      }
      //console.log("Higlighted refs:", highlightedRefs)
      panel = this.makePanelState({refs, currVersions, highlightedRefs, currentlyVisibleRef, mode: "Text", ...options });
    }

    var newPanels = this.state.panels.slice();
    newPanels.splice(n+1, 0, panel);
    this.setState({panels: newPanels});
    this.setHeaderState({menuOpen: null});
    this.saveLastPlace(panel, n+1);
  }
  openPanelAtEnd(ref, currVersions) {
    this.openPanelAt(this.state.panels.length+1, ref, currVersions);
  }
  openTextListAt(n, refs, sheetNodes) {
    // Open a connections panel at position `n` for `refs`
    // Replace panel there if already a connections panel, otherwise splice new panel into position `n`
    // `refs` is an array of ref strings
    var newPanels = this.state.panels.slice();
    var panel = newPanels[n] || {};
    var parentPanel = (n >= 1 && newPanels[n-1].mode == 'Text' || n >= 1 && newPanels[n-1].mode == 'Sheet') ? newPanels[n-1] : null;

    if (panel.mode !== "Connections") {
      // No connections panel is open yet, splice in a new one
      this.saveLastPlace(parentPanel, n, true);
      newPanels.splice(n, 0, {});
      panel = newPanels[n];
      panel.filter = [];
      panel.versionFilter = [];
    }
    panel.refs              = refs;
    panel.sheetNodes        = sheetNodes ? sheetNodes.split(".")[1] : null;
    panel.nodeRef           = sheetNodes;
    panel.menuOpen          = null;
    panel.mode              = panel.mode || "Connections";
    panel.settings          = panel.settings ? panel.settings : Sefaria.util.clone(this.getDefaultPanelSettings());
    panel.settings.language = panel.settings.language == "hebrew" ? "hebrew" : "english"; // Don't let connections panels be bilingual
    if(parentPanel) {
      panel.filter = parentPanel.filter;
      panel.versionFilter = parentPanel.versionFilter;
      panel.connectionsMode   = parentPanel.openSidebarAsConnect ? "Add Connection" : panel.connectionsMode;
      panel.recentFilters = parentPanel.recentFilters;
      panel.recentVersionFilters = parentPanel.recentVersionFilters;
      panel.currVersions = parentPanel.currVersions;
    }
    newPanels[n] = this.makePanelState(panel);
    this.setState({panels: newPanels});
  }
  setTextListHighlight(n, refs) {
    // Set the textListHighlight for panel `n` to `refs`
    refs = typeof refs === "string" ? [refs] : refs;
    this.state.panels[n].highlightedRefs = refs;
    this.setState({panels: this.state.panels});
    // If a connections panel is opened after n, update its refs as well.
    var next = this.state.panels[n+1];
    if (next && next.mode === "Connections" && !next.menuOpen) {
      this.openTextListAt(n+1, refs);
    }
  }
  setSheetHighlight(n, node) {
    // Set the sheetListHighlight for panel `n` to `node`
    node = typeof node === "string" ? [node] : node;
    this.state.panels[n].highlightedNodes = node;
    this.setState({panels: this.state.panels});
    }
  setConnectionsFilter(n, filter, updateRecent) {
    // Set the filter for connections panel at `n`, carry data onto the panel's basetext as well.
    var connectionsPanel = this.state.panels[n];
    var basePanel        = this.state.panels[n-1];
    if (filter) {
      if (updateRecent) {
        if (Sefaria.util.inArray(filter, connectionsPanel.recentFilters) !== -1) {
          connectionsPanel.recentFilters.toggle(filter);
        }
        connectionsPanel.recentFilters = [filter].concat(connectionsPanel.recentFilters);
      }
      connectionsPanel.filter = [filter];
      connectionsPanel.connectionsMode = "TextList";
    } else {
      connectionsPanel.filter = [];
      connectionsPanel.connectionsMode = "ConnectionsList";
    }
    if (basePanel) {
      basePanel.filter        = connectionsPanel.filter;
      basePanel.recentFilters = connectionsPanel.recentFilters;
    }
    this.setState({panels: this.state.panels});
  }
  setVersionFilter(n, filter) {
    var connectionsPanel = this.state.panels[n];
    var basePanel        = this.state.panels[n-1];
    if (filter) {
      if (Sefaria.util.inArray(filter, connectionsPanel.recentVersionFilters) === -1) {
        connectionsPanel.recentVersionFilters = [filter].concat(connectionsPanel.recentVersionFilters);
      }
      connectionsPanel.versionFilter = [filter];
      connectionsPanel.connectionsMode = "Version Open";
    } else {
      connectionsPanel.versionFilter = [];
      connectionsPanel.connectionsMode = "Versions";
    }
    if (basePanel) {
      basePanel.versionFilter        = connectionsPanel.versionFilter;
      basePanel.recentVersionFilters = connectionsPanel.recentVersionFilters;
    }
    this.setState({panels: this.state.panels});
  }
  setSelectedWords(n, words){
    //console.log(this.state.panels[n].refs);
    var next = this.state.panels[n+1];
    if (next && !next.menuOpen) {
      this.state.panels[n+1].selectedWords = words;
      this.setState({panels: this.state.panels});
    }
  }
  setUnreadNotificationsCount(n) {
    Sefaria.notificationCount = n;
    this.forceUpdate();
  }
  replacePanel(n, ref, currVersions) {
    // Opens a text in in place of the panel currently open at `n`.
    this.state.panels[n] = this.makePanelState({refs: [ref], currVersions, mode: "Text"});
    this.setState({panels: this.state.panels});
    this.saveLastPlace(this.state.panels[n], n);
  }
  openComparePanel(n, connectAfter) {
    var comparePanel = this.makePanelState({
      menuOpen: "compare",
      openSidebarAsConnect: typeof connectAfter !== "undefined" ? connectAfter : false,
    });
    Sefaria.track.event("Reader", "Other Text Click");
    this.state.panels[n] = comparePanel;
    this.setState({panels: this.state.panels});
  }
  closePanel(n) {
    // Removes the panel in position `n`, as well as connections panel in position `n+1` if it exists.
    if (this.state.panels.length == 1 && n == 0) {
      this.state.panels = [];
    } else {
      // If this is a Connection panel, we need to unset the filter in the base panel
      if (n > 0 && this.state.panels[n] && this.state.panels[n].mode === "Connections"){
        const parent = this.state.panels[n-1];
        console.log("close connections panel");
        parent.filter = [];
        parent.highlightedRefs = [];
        parent.currentlyVisibleRef = !parent.currentlyVisibleRef ? parent.currentlyVisibleRef : Sefaria.ref(parent.currentlyVisibleRef).sectionRef;
      }
      this.state.panels.splice(n, 1);
      if (this.state.panels[n] && this.state.panels[n].mode === "Connections") {
        // Close connections panel when text panel is closed
        if (this.state.panels.length == 1) {
          this.state.panels = [];
        } else {
          this.state.panels.splice(n, 1);
        }
      }
    }
    var state = {panels: this.state.panels};
    if (state.panels.length == 0) {
      this.showLibrary();
    }
    this.setState(state);
  }
  convertToTextList(n) {
    var base = this.state.panels[n-1];
    this.closePanel(n);
    if (base.mode == "Sheet") {
      for(var i in base.sheet.sources){
        if (base.sheet.sources[i].node == base.highlightedNodes) {
          this.openTextListAt(n, [base.sheet.sources[i].ref]);
        }
      }
    }
    else {
      this.openTextListAt(n, base.highlightedRefs);
    }
  }
  showLibrary(categories) {
    if (this.props.multiPanel) {
      var headerState = this.makePanelState({mode: "Header", menuOpen: "navigation", navigationCategories: categories});
      if (!Sefaria._siteSettings.TORAH_SPECIFIC) {
        headerState.settings.language = "english";
      }
      this.setState({header: headerState});

    } else {
      if (this.state.panels.length) {
        this.state.panels[0].menuOpen = "navigation";
      } else {
        this.state.panels[0] = this.makePanelState({menuOpen: "navigation", navigationCategories: categories});
      }
      if (!Sefaria._siteSettings.TORAH_SPECIFIC) {
        this.state.panels[0].settings.language = "english";
      }
      this.setState({panels: this.state.panels});
    }
  }
  showSearch(searchQuery) {
    let panel;
    const textSearchState =  (!!this.state.header && !!this.state.header.textSearchState)  ? this.state.header.textSearchState.update({ filtersValid: false })  : new SearchState({ type: 'text' });
    const sheetSearchState = (!!this.state.header && !!this.state.header.searchStateSheet) ? this.state.header.searchStateSheet.update({ filtersValid: false }) : new SearchState({ type: 'sheet' });

    if (this.props.multiPanel) {
      panel = this.makePanelState({mode: "Header", menuOpen: "search", searchQuery, textSearchState, sheetSearchState });
      this.setState({header: panel, panels: []});
    } else {
      panel = this.makePanelState({menuOpen: "search", searchQuery, textSearchState, sheetSearchState });
      this.setState({panels: [panel]});
    }
  }
  showSheets() {
    var updates = {menuOpen: "sheets"};
    this.setStateInHeaderOrSinglePanel(updates);
  }
  showMySheets() {
    var updates = {menuOpen: "sheets", navigationSheetTag: "My Sheets"};
    this.setStateInHeaderOrSinglePanel(updates);
  }
  showMyGroups() {
    var updates = {menuOpen: "myGroups"};
    this.setStateInHeaderOrSinglePanel(updates);
  }
  showMyNotes() {
    var updates = {menuOpen: "myNotes"};
    this.setStateInHeaderOrSinglePanel(updates);
  }
  setStateInHeaderOrSinglePanel(state) {
    // Updates state in the header panel if we're in mutli-panel, else in the first panel if we're in single panel
    // If we're in single panel mode but `this.state.panels` is empty, make a default first panel
    if (this.props.multiPanel) {
      this.setHeaderState(state);
    } else {
      state = this.makePanelState(state);
      this.setState({panels: [state]});
    }
  }
  getHistoryObject(panel, hasSidebar) {
    // get rave to send to /api/profile/user_history
    let ref, sheet_owner, sheet_title;
    if (panel.mode === 'Sheet') {
      ref = `Sheet ${panel.sheet.id}${panel.highlightedNodes ? `:${panel.highlightedNodes}`: ''}`;
      sheet_owner = panel.sheet.ownerName;
      sheet_title = panel.sheet.title;
    } else {
      ref = (hasSidebar && panel.highlightedRefs && panel.highlightedRefs.length) ? Sefaria.normRef(panel.highlightedRefs) : (panel.currentlyVisibleRef || panel.refs.slice(-1)[0]);  // Will currentlyVisibleRef ever not be available?
    }
    const parsedRef = Sefaria.parseRef(ref);
    return {
      ref,
      versions: panel.currVersions,
      book: parsedRef.book,
      language: panel.settings.language,
      sheet_owner,
      sheet_title,
    };
  }
  doesPanelHaveSidebar(n) {
    return this.state.panels.length > n+1 && this.state.panels[n+1].mode == "Connections";
  }
  saveLastPlace(panel, n, openingSidebar) {
    //openingSidebar is true when you call `saveLastPlace` at the time you're opening the sidebar. In this case, `doesPanelHaveSidebar` will be false
    const hasSidebar = this.doesPanelHaveSidebar(n) || openingSidebar;
    // if panel is sheet, panel.refs isn't set
    if ((!panel.refs.length && panel.mode !== 'Sheet') || panel.mode === 'Connections') { return; }
    Sefaria.saveUserHistory(this.getHistoryObject(panel, hasSidebar));
  }
  currentlyConnecting() {
    // returns true if there is currently an "Add Connections" Panel open
    for (var i = 0; i < this.state.panels.length; i++) {
      //console.log(this.state.panels[i].connectionsMode)
      if (this.state.panels[i].connectionsMode === "Add Connection") {
        return true;
      }
    }
    return false;
  }
  rerender() {
    this.forceUpdate();
    this.setContainerMode();
  }
  render() {
    var panelStates = this.state.panels;

    var evenWidth;
    var widths;
    var unit;
    var wrapBoxScroll = false;

    if (panelStates.length <= this.state.panelCap || !this.state.panelCap) {
      evenWidth = (100.0 / panelStates.length);
      unit = "%";
    } else {
      evenWidth = this.MIN_PANEL_WIDTH;
      unit = "px";
      wrapBoxScroll = true;
    }

    if (panelStates.length == 2 &&
        (panelStates[0].mode == "Text" || panelStates[0].mode == "Sheet") &&
        (panelStates[1].mode == "Connections" || panelStates[1].menuOpen === "compare" || panelStates[1].menuOpen === "search" )) {
      widths = [68.0, 32.0];
      unit = "%";
    } else if (panelStates.length == 3 &&
        (panelStates[0].mode == "Text" || panelStates[0].mode == "Sheet") &&
        panelStates[1].mode == "Connections" &&
        (panelStates[2].mode == "Text" || panelStates[2].mode == "Sheet")) {
      widths = [37.0, 26.0, 37.0];
      unit = "%";
    } else if (panelStates.length == 3 &&
        (panelStates[0].mode == "Text"|| panelStates[0].mode == "Sheet") &&
        (panelStates[1].mode == "Text"|| panelStates[1].mode == "Sheet") &&
        panelStates[2].mode == "Connections") {
      widths = [37.0, 37.0, 26.0];
      unit = "%";
    } else {
      widths = panelStates.map( panel => evenWidth );
    }

    var header = this.props.multiPanel || this.state.panels.length == 0 ?
                  (<Header
                    initialState={this.state.header}
                    interfaceLang={this.props.interfaceLang}
                    setCentralState={this.setHeaderState}
                    onRefClick={this.handleNavigationClick}
                    onRecentClick={this.handleRecentClick}
                    setDefaultOption={this.setDefaultOption}
                    showLibrary={this.showLibrary}
                    showSearch={this.showSearch}
                    onQueryChange={this.updateQueryInHeader}
                    updateSearchTab={this.updateSearchTabInHeader}
                    updateSearchFilter={this.updateSearchFilterInHeader}
                    updateSearchOptionField={this.updateSearchOptionFieldInHeader}
                    updateSearchOptionSort={this.updateSearchOptionSortInHeader}
                    registerAvailableFilters={this.updateAvailableFiltersInHeader}
                    setUnreadNotificationsCount={this.setUnreadNotificationsCount}
                    handleInAppLinkClick={this.handleInAppLinkClick}
                    headerMode={this.props.headerMode}
                    panelsOpen={panelStates.length}
                    analyticsInitialized={this.state.initialAnalyticsTracked}
                    getLicenseMap={this.getLicenseMap}
                    translateISOLanguageCode={this.translateISOLanguageCode}
                    toggleSignUpModal={this.toggleSignUpModal} />) : null;

    var panels = [];
    var allOpenRefs = panelStates.filter( panel => panel.mode == "Text" && !panel.menuOpen)
                                  .map( panel => Sefaria.humanRef(panel.highlightedRefs.length ? panel.highlightedRefs : panel.refs));

    for (var i = 0; i < panelStates.length; i++) {
      var panel                    = this.clonePanel(panelStates[i]);
      if (!("settings" in panel )) { debugger; }
      var offset                         = widths.reduce(function(prev, curr, index, arr) { return index < i ? prev+curr : prev}, 0);
      var width                          = widths[i];
      var style                          = (this.state.layoutOrientation=="ltr")?{width: width + unit, left: offset + unit}:{width: width + unit, right: offset + unit};
      var onSegmentClick                 = this.props.multiPanel ? this.handleSegmentClick.bind(null, i) : null;
      var onCitationClick                = this.handleCitationClick.bind(null, i);
      var onSearchResultClick            = this.props.multiPanel ? this.handleCompareSearchClick.bind(null, i) : this.handleNavigationClick;
      var unsetTextHighlight             = this.unsetTextHighlight.bind(null, i);
      var updateQuery                    = this.updateQuery.bind(null, i);
      var updateSearchTab                = this.updateSearchTab.bind(null, i);
      var updateAvailableFilters         = this.updateAvailableFilters.bind(null, i);
      var updateSearchFilter             = this.updateSearchFilter.bind(null, i);
      var updateSearchOptionField        = this.updateSearchOptionField.bind(null, i);
      var updateSearchOptionSort         = this.updateSearchOptionSort.bind(null, i);
      var onOpenConnectionsClick         = this.openTextListAt.bind(null, i+1);
      var setTextListHighlight           = this.setTextListHighlight.bind(null, i);
      var setSelectedWords               = this.setSelectedWords.bind(null, i);
      var openComparePanel               = this.openComparePanel.bind(null, i);
      var closePanel                     = panel.menuOpen == "compare" ? this.convertToTextList.bind(null, i) : this.closePanel.bind(null, i);
      var setPanelState                  = this.setPanelState.bind(null, i);
      var setConnectionsFilter           = this.setConnectionsFilter.bind(this, i);
      var setVersionFilter               = this.setVersionFilter.bind(this, i);
      var selectVersion                  = this.selectVersion.bind(null, i);
      var addToSourceSheet               = this.addToSourceSheet.bind(null, i);
      var viewExtendedNotes              = this.viewExtendedNotes.bind(this, i);
      var backFromExtendedNotes          = this.backFromExtendedNotes.bind(this, i);

      var ref   = panel.refs && panel.refs.length ? panel.refs[0] : null;
      var oref  = ref ? Sefaria.parseRef(ref) : null;
      var title = oref && oref.indexTitle ? oref.indexTitle : 0;
      // Keys must be constant as text scrolls, but changing as new panels open in new positions
      // Use a combination of the panel number and text title
      var key   = i + title;
      var classes = classNames({readerPanelBox: 1, sidebar: panel.mode == "Connections"});
      panels.push(<div className={classes} style={style} key={key}>
                    <ReaderPanel
                      panelPosition={i}
                      initialState={panel}
                      interfaceLang={this.props.interfaceLang}
                      setCentralState={setPanelState}
                      multiPanel={this.props.multiPanel}
                      onSegmentClick={onSegmentClick}
                      onCitationClick={onCitationClick}
                      onSearchResultClick={onSearchResultClick}
                      onNavigationClick={this.handleNavigationClick}
                      onRecentClick={this.handleRecentClick}
                      addToSourceSheet={addToSourceSheet}
                      onOpenConnectionsClick={onOpenConnectionsClick}
                      openComparePanel={openComparePanel}
                      setTextListHighlight={setTextListHighlight}
                      setConnectionsFilter={setConnectionsFilter}
                      setVersionFilter={setVersionFilter}
                      setSelectedWords={setSelectedWords}
                      selectVersion={selectVersion}
                      viewExtendedNotes={viewExtendedNotes}
                      backFromExtendedNotes={backFromExtendedNotes}
                      setDefaultOption={this.setDefaultOption}
                      unsetTextHighlight={unsetTextHighlight}
                      onQueryChange={updateQuery}
                      updateSearchTab={updateSearchTab}
                      updateSearchFilter={updateSearchFilter}
                      updateSearchOptionField={updateSearchOptionField}
                      updateSearchOptionSort={updateSearchOptionSort}
                      registerAvailableFilters={updateAvailableFilters}
                      setUnreadNotificationsCount={this.setUnreadNotificationsCount}
                      closePanel={closePanel}
                      panelsOpen={panelStates.length}
                      allOpenRefs={allOpenRefs}
                      hasSidebar={this.doesPanelHaveSidebar(i)}
                      masterPanelLanguage={panel.mode === "Connections" ? panelStates[i-1].settings.language : panel.settings.language}
                      layoutWidth={width}
                      analyticsInitialized={this.state.initialAnalyticsTracked}
                      getLicenseMap={this.getLicenseMap}
                      translateISOLanguageCode={this.translateISOLanguageCode}
                      saveLastPlace={this.saveLastPlace}
                      checkIntentTimer={this.checkIntentTimer}
                      toggleSignUpModal={this.toggleSignUpModal}
                      getHistoryObject={this.getHistoryObject}
                    />
                  </div>);
    }
    var boxClasses = classNames({wrapBoxScroll: wrapBoxScroll});
    var boxWidth = wrapBoxScroll ? this.state.windowWidth + "px" : "100%";
    var boxStyle = {width: boxWidth};
    panels = panels.length ?
              (<div id="panelWrapBox" className={boxClasses} style={boxStyle}>
                {panels}
              </div>) : null;

    var interruptingMessage = Sefaria.interruptingMessage ?
      (<InterruptingMessage
          messageName={Sefaria.interruptingMessage.name}
          messageHTML={Sefaria.interruptingMessage.html}
          style={Sefaria.interruptingMessage.style}
          repetition={Sefaria.interruptingMessage.repetition}
          onClose={this.rerender} />) : null;
    const sefariaModal = (
      <SignUpModal onClose={this.toggleSignUpModal} show={this.state.showSignUpModal} />
    );

    var classDict = {readerApp: 1, multiPanel: this.props.multiPanel, singlePanel: !this.props.multiPanel};
    var interfaceLangClass = `interface-${this.props.interfaceLang}`;
    classDict[interfaceLangClass] = true;
    var classes = classNames(classDict);
    return (<div id="readerAppWrap">
              {interruptingMessage}
              <div className={classes}>
                {header}
                {panels}
                {sefariaModal}
                <CookiesNotification />
              </div>
            </div>);
  }
}
ReaderApp.propTypes = {
  multiPanel:                  PropTypes.bool,
  headerMode:                  PropTypes.bool,  // is the App serving only as a header on top of another page?
  loggedIn:                    PropTypes.bool,
  interfaceLang:               PropTypes.string,
  initialRefs:                 PropTypes.array,
  initialFilter:               PropTypes.array,
  initialMenu:                 PropTypes.string,
  initialGroup:                PropTypes.string,
  initialQuery:                PropTypes.string,
  initialTextSearchFilters:    PropTypes.array,
  initialTextSearchField:      PropTypes.string,
  initialTextSearchSortType:   PropTypes.string,
  initialSheetSearchFilters:   PropTypes.array,
  initialSheetSearchField:     PropTypes.string,
  initialSheetSearchSortType:  PropTypes.string,
  initialSheetsTag:            PropTypes.string,
  initialTopic:                PropTypes.string,
  initialNavigationCategories: PropTypes.array,
  initialSettings:             PropTypes.object,
  initialPanels:               PropTypes.array,
  initialDefaultVersions:      PropTypes.object,
  initialPath:                 PropTypes.string,
  initialPanelCap:             PropTypes.number
};
ReaderApp.defaultProps = {
  multiPanel:                  true,
  headerMode:                  false,  // is the App serving only as a header on top of another page?
  interfaceLang:               "english",
  initialRefs:                 [],
  initialFilter:               null,
  initialMenu:                 null,
  initialGroup:                null,
  initialQuery:                null,
  initialSheetsTag:            null,
  initialTopic:                null,
  initialNavigationCategories: [],
  initialPanels:               [],
  initialDefaultVersions:      {},
  initialPanelCap:             2,
  initialPath:                 "/"
};


module.exports.ReaderApp           = ReaderApp;
module.exports.Footer              = Footer;
module.exports.sefariaSetup        = Sefaria.setup;
module.exports.unpackDataFromProps = Sefaria.unpackDataFromProps;
module.exports.EditGroupPage       = EditGroupPage;
