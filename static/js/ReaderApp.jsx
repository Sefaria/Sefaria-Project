import React from 'react';
import classNames from 'classnames';
import extend from 'extend';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import Header from './Header';
import ReaderPanel from './ReaderPanel';
import $ from './sefaria/sefariaJquery';
import EditCollectionPage from './EditCollectionPage';
import Footer from './Footer';
import SearchState from './sefaria/searchState';
import {ContentLanguageContext, AdContext} from './context';
import {
  ContestLandingPage,
  RemoteLearningPage,
  SheetsLandingPage,
  PBSC2020LandingPage,
  PBSC2021LandingPage,
  RambanLandingPage,
  EducatorsPage
} from './StaticPages';
import {
  SignUpModal,
  InterruptingMessage,
  CookiesNotification,
  CommunityPagePreviewControls
} from './Misc';
import { Promotions } from './Promotions';
import Component from 'react-class';
import BeitMidrash, {BeitMidrashClosed} from './BeitMidrash';
import  { io }  from 'socket.io-client';

class ReaderApp extends Component {
  constructor(props) {
    super(props);
    // TODO clean up generation of initial panels objects.
    // Currently these get generated in reader/views.py then regenerated again in ReaderApp.
    this.MIN_PANEL_WIDTH       = 360.0;
    let panels                 = [];

    if (props.initialMenu) {
      // If a menu is specified in `initialMenu`, make a panel for it
      panels[0] = {
        mode:                    "Menu",
        menuOpen:                props.initialMenu,
        searchQuery:             props.initialQuery,
        searchTab:               props.initialSearchTab,
        topicsTab:               props.initialTopicsTab,
        textSearchState: new SearchState({
          type: 'text',
          appliedFilters:        props.initialTextSearchFilters,
          field:                 props.initialTextSearchField,
          appliedFilterAggTypes: props.initialTextSearchFilterAggTypes,
          sortType:              props.initialTextSearchSortType,
        }),
        sheetSearchState: new SearchState({
          type: 'sheet',
          appliedFilters:        props.initialSheetSearchFilters,
          appliedFilterAggTypes: props.initialSheetSearchFilterAggTypes,
          sortType:              props.initialSheetSearchSortType,
        }),
        navigationCategories:    props.initialNavigationCategories,
        navigationTopicCategory: props.initialNavigationTopicCategory,
        navigationTopic:         props.initialTopic,
        navigationTopicTitle:    props.initialNavigationTopicTitle,
        navigationTopicLetter:   props.initialNavigationTopicLetter,
        topicTitle:              props.initialTopicTitle,
        profile:                 props.initialProfile,
        profileTab:              props.initialProfileTab,
        collectionName:          props.initialCollectionName,
        collectionSlug:          props.initialCollectionSlug,
        collectionTag:           props.initialCollectionTag,
      };
    }

    const defaultPanelSettings = this.getDefaultPanelSettings();

    const initialPanels = props.initialPanels || [];
    panels = panels.concat(initialPanels.map(this.clonePanel));

    panels = panels.map(panel => {
      if (!panel.hasOwnProperty("settings") && !!panel.currVersions) {
        // If a panel doesn't have its own settings, but it does have a text version set
        // make sure the settings show the language of the version set.
        if (panel.currVersions.he && panel.currVersions.en) { panel.settings = {language: "bilingual"}; }
        else if (panel.currVersions.he)                     { panel.settings = {language: "hebrew"}; }
        else if (panel.currVersions.en)                     { panel.settings = {language: "english"}; }
      }
      panel.settings = extend(Sefaria.util.clone(defaultPanelSettings), (panel.settings || {}));

      if (panel.mode.endsWith("AndConnections")) {
        panel.highlightedRefs = panel.refs;
      }
      return panel;
    }).map(panel => this.makePanelState(panel));

    const defaultVersions   = Sefaria.util.clone(props.initialDefaultVersions) || {};
    const layoutOrientation = (props.interfaceLang == "hebrew") ? "rtl" : "ltr";

    this.state = {
      panels: panels,
      headerMode: props.headerMode,
      defaultVersions: defaultVersions,
      defaultPanelSettings: Sefaria.util.clone(defaultPanelSettings),
      layoutOrientation: layoutOrientation,
      path: props.initialPath,
      panelCap: props.initialPanelCap,
      initialAnalyticsTracked: false,
      showSignUpModal: false,
      translationLanguagePreference: props.translationLanguagePreference,
      beitMidrashStatus: Sefaria._uid && props.customBeitMidrashId ? true : false,
      beitMidrashId: props.customBeitMidrashId ? props.customBeitMidrashId : "Sefaria",
      inCustomBeitMidrash: !!props.customBeitMidrashId,
    };
  }
  makePanelState(state) {
    // Return a full representation of a single panel's state, given a partial representation in `state`
    var panel = {
      mode:                    state.mode,                   // "Text", "TextAndConnections", "Connections", "Sheet", "SheetAndConnection", "Menu"
      refs:                    state.refs                    || [], // array of ref strings
      filter:                  state.filter                  || [],
      versionFilter:           state.versionFilter           || [],
      connectionsMode:         state.connectionsMode         || "Resources",
      currVersions:            state.currVersions            || {en:null,he:null},
      highlightedRefs:         state.highlightedRefs         || [],
      highlightedNode:         state.highlightedNode         || null,
      scrollToHighlighted:     state.scrollToHighlighted     || false,
      currentlyVisibleRef:     state.refs && state.refs.length ? state.refs[0] : null,
      recentFilters:           state.recentFilters           || state.filter || [],
      recentVersionFilters:    state.recentVersionFilters    || state.versionFilter || [],
      menuOpen:                state.menuOpen                || null, // "navigation", "text toc", "display", "search", "sheets", "community", "book toc"
      navigationCategories:    state.navigationCategories    || [],
      navigationTopicCategory: state.navigationTopicCategory || "",
      sheetID:                 state.sheetID                 || null,
      sheetNodes:              state.sheetNodes              || null,
      nodeRef:                 state.nodeRef                 || null,
      navigationTopic:         state.navigationTopic         || null,
      navigationTopicTitle:    state.navigationTopicTitle    || null,
      navigationTopicLetter:   state.navigationTopicLetter   || null,
      topicTitle:              state.topicTitle              || null,
      collectionName:          state.collectionName          || null,
      collectionSlug:          state.collectionSlug          || null,
      collectionTag:           state.collectionTag           || null,
      searchQuery:             state.searchQuery             || null,
      searchTab:               state.searchTab               || 'text',
      showHighlight:           state.showHighlight           || null,
      topicsTab:               state.topicsTab               || 'sources',
      textSearchState:         state.textSearchState         || new SearchState({ type: 'text' }),
      sheetSearchState:        state.sheetSearchState        || new SearchState({ type: 'sheet' }),
      compare:                 state.compare                 || false,
      openSidebarAsConnect:    state.openSidebarAsConnect    || false,
      bookRef:                 state.bookRef                 || null,
      settings:                state.settings ? Sefaria.util.clone(state.settings) : Sefaria.util.clone(this.getDefaultPanelSettings()),
      displaySettingsOpen:     false,
      initialAnalyticsTracked: state.initialAnalyticsTracked || false,
      selectedWords:           state.selectedWords           || "",
      selectedNamedEntity:     state.selectedNamedEntity     || null,
      selectedNamedEntityText: state.selectedNamedEntityText || null,
      textHighlights:          state.textHighlights          || null,
      profile:                 state.profile                 || null,
      profileTab:              state.profileTab              || "sheets",
      beitMidrashId:           state.beitMidrashId           || null,
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
  componentDidMount() {
    this.updateHistoryState(true); // make sure initial page state is in history, (passing true to replace)
    window.addEventListener("popstate", this.handlePopState);
    window.addEventListener("resize", this.setPanelCap);
    document.addEventListener('copy', this.handleCopyEvent);
    this.setPanelCap();
    if (this.props.headerMode) {
      // Handle in app links on static pages outside of react container
      $("a").not($(ReactDOM.findDOMNode(this)).find("a"))
        .on("click", this.handleInAppLinkClick);
    }
    // Save all initial panels to recently viewed
    this.state.panels.map(this.saveLastPlace);

    this.setBeitMidrashId()
  }
  componentWillUnmount() {
    window.removeEventListener("popstate", this.handlePopState);
    window.removeEventListener("resize", this.setPanelCap);
  }
  componentDidUpdate(prevProps, prevState) {
    $(".content").off("scroll.scrollPosition").on("scroll.scrollPosition", this.setScrollPositionInHistory); // when .content may have rerendered
    
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
    this.setBeitMidrashId(prevState)
  }

  setBeitMidrashId (prevState) {
    if (!this.state.inCustomBeitMidrash) {
      for (let i=this.state.panels.length-1; i >= 0; i--) {
        if (this.state.panels[i].bookRef && (!prevState || prevState.beitMidrashId !== this.state.panels[i].bookRef)) {
          this.setState({beitMidrashId: this.state.panels[i].bookRef})
          break
        }
      }
    }
  }

  handlePopState(event) {
    var state = event.state;
    // console.log("Pop - " + window.location.pathname);
    // console.log(event.state);
    if (state) {
      this.justPopped = true;

      // history does not preserve custom objects
      if (state.panels) {
        for (let p of state.panels) {
          p.textSearchState = p.textSearchState && new SearchState(p.textSearchState);
          p.sheetSearchState = p.sheetSearchState && new SearchState(p.sheetSearchState);
        }
      } else {
        state.panels = [];
      }
      this.setState(state, () => {
        if (state.scrollPosition) {
          $(".content").scrollTop(event.state.scrollPosition)
            .trigger("scroll");
        }
      });

      this.setContainerMode();
    }
  }
  trackPageview() {
      var panels = this.state.panels;
      var textPanels = panels.filter(panel => (panel.refs.length || panel.bookRef) && panel.mode !== "Connections");
      var connectionPanels = panels.filter(panel => panel.mode == "Connections");

      // Set Page Type
      // Todo: More specificity for sheets - browsing, reading, writing
      const pageType = !panels.length ? "Static" : (panels[0].menuOpen || panels[0].mode);
      Sefaria.track.setPageType(pageType);

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
    if (!history.state
        || (!history.state.panels && !!this.state.panels)
        || (history.state.panels && (history.state.panels.length !== this.state.panels.length))
      ) {
      // If there's no history or the number or basic state of panels has changed
      return true;
    }

    const prevPanels = history.state.panels || [];
    const nextPanels = this.state.panels || [];

    for (let i = 0; i < prevPanels.length; i++) {
      // Cycle through each panel, compare previous state to next state, looking for differences
      const prev  = prevPanels[i];
      const next  = nextPanels[i];
      if (!prev || !next) { return true; }
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
          (next.mode === "Translation Open" && prev.versionFilter && !prev.versionFilter(next.versionFilter)) ||
          (next.mode === "Connections" && !prev.refs.compare(next.refs)) ||
          (next.currentlyVisibleRef === prev.currentlyVisibleRef) ||
          (next.connectionsMode !== prev.connectionsMode) ||
          (prev.currVersions.en !== next.currVersions.en) ||
          (prev.currVersions.he !== next.currVersions.he) ||
          (prev.searchQuery != next.searchQuery) ||
          (prev.searchTab != next.searchTab) ||
          (prev.topicsTab != next.topicsTab) ||
          (prev.profileTab !== next.profileTab) ||
          (prev.collectionName !== next.collectionName) ||
          (prev.collectionTag !== next.collectionTag) ||
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

      } else if (prev.navigationTopicCategory !== next.navigationTopicCategory) {
        // Handle array comparison, !== could mean one is null or both are arrays
        if (!prev.navigationTopicCategory || !next.navigationTopicCategory) {
          return true; // They are not equal and one is null
        } else if (!prev.navigationTopicCategory.compare(next.navigationTopicCategory)) {
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
              .map(vlang=>`&v${vlang}${i > 1 ? i : ""}=${Sefaria.util.encodeVtitle(currVersions[vlang])}`)
              .join("");
    } else {
      return "";
    }
  }
  makeHistoryState() {
    // Returns an object with state, title and url params for the current state
    var histories = [];
    var states = this.state.panels;
    var siteName = Sefaria._siteSettings["SITE_NAME"]["en"]; // e.g. "Sefaria"
    const shortLang = Sefaria.interfaceLang == 'hebrew' ? 'he' : 'en';

    // List of modes that the ConnectionsPanel may have which can be represented in a URL. 
    const sidebarModes = new Set(["Sheets", "Notes", "Translations", "Translation Open",
      "About", "AboutSheet", "Navigation", "WebPages", "extended notes", "Topics", "Torah Readings", "manuscripts", "Lexicon"]);

    for (var i = 0; i < states.length; i++) {
      // Walk through each panel, create a history object as though for this panel alone
      states[i] = this.clonePanel(states[i], true);
      if (!states[i]) { debugger; }
      var state = states[i];
      var hist  = {url: ""};

      if (state.menuOpen) {
        hist.menuPage = true;
        switch (state.menuOpen) {
          case "navigation":
            var cats   = state.navigationCategories ? state.navigationCategories.join("/") : "";
            hist.title = cats ? state.navigationCategories.map(Sefaria._).join(", ") + " | " + Sefaria._(siteName) : Sefaria._("Sefaria: a Living Library of Jewish Texts Online");
            hist.url   = "texts" + (cats ? "/" + cats : "");
            hist.mode  = "navigation";
            break;
          case "text toc":
            var ref    = state.refs.slice(-1)[0];
            var bookTitle  = ref ? Sefaria.parseRef(ref).index : "404";
            hist.title = Sefaria._(bookTitle) + " | " + Sefaria._(siteName);
            hist.url   = bookTitle.replace(/ /g, "_");
            hist.mode  = "text toc";
            break;
          case "book toc":
            var bookTitle = state.bookRef;
            hist.title = Sefaria._(bookTitle) + " | " + Sefaria._(siteName);
            hist.url = bookTitle.replace(/ /g, "_");
            hist.mode = "book toc";
            break;
          case "sheet meta":
            const sheet = Sefaria.sheets.loadSheetByID(state.sheetID);
            const sheetTitle = sheet? sheet.title.stripHtml() : "";
            hist.title = Sefaria._(siteName + " Source Sheets")+": " + sheetTitle;
            hist.url = i == 0 ? "sheets/"+ state.sheetID : "sheet&s="+ state.sheetID;
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
          case "topics":
            if (state.navigationTopic) {
              hist.url = `topics/${state.navigationTopic}?tab=${state.topicsTab}`;
              hist.title = `${state.topicTitle[shortLang]} | ${ Sefaria._("Texts & Source Sheets from Torah, Talmud and Sefaria's library of Jewish sources.")}`;
              hist.mode  = "topic";
            } else if (state.navigationTopicCategory) {
              hist.title = state.navigationTopicTitle[shortLang] + " | " + Sefaria._("Texts & Source Sheets from Torah, Talmud and Sefaria's library of Jewish sources.");
              hist.url   =  "topics/category/" + state.navigationTopicCategory;
              hist.mode  = "topicCat";
            } else {
              hist.url   = "topics";
              hist.title = Sefaria._("Topics | " + siteName);
              hist.mode  = "topics";
            }
            break;
          case "allTopics":
              hist.url   = "topics/all/" + state.navigationTopicLetter;
              hist.title = Sefaria._("Explore Jewish Texts by Topic") + " - " + state.navigationTopicLetter + " | " + Sefaria._(siteName);
              hist.mode  = "topics";
            break;
          case "community":
            hist.title = Sefaria._("From the Community: Today on Sefaria");
            hist.url   = "community";
            hist.mode  = "community";
            break;
          case "profile":
            hist.title = `${state.profile.full_name} ${Sefaria._("on Sefaria")}`;
            hist.url   = `profile/${state.profile.slug}?tab=${state.profileTab}`;
            hist.mode = "profile";
            break;
          case "notifications":
            hist.title = Sefaria._(siteName + " Notifications");
            hist.url   = "notifications";
            hist.mode  = "notifications";
            break;
          case "collection":
            hist.url   = "collections/" + state.collectionSlug;
            if (states[i].collectionTag) {
              hist.url  += "?tag=" + state.collectionTag.replace("#","%23");
            }
            hist.title = (state.collectionName ? state.collectionName + " | " : "") + Sefaria._(siteName + " Collections");
            hist.mode  = "collection";
            break;          
          case "collectionsPublic":
            hist.title = Sefaria._("Collections") + " | " + Sefaria._(siteName);
            hist.url = "collections";
            hist.mode = "collcetionsPublic";
            break;
          case "calendars":
            hist.title = Sefaria._("Learning Schedules") + " | " + Sefaria._(siteName);
            hist.url = "calendars";
            hist.mode = "calendars";
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
          case "user_stats":
            hist.title = Sefaria._("Torah Tracker");
            hist.url = "torahtracker";
            hist.mode = "user_stats";
            break;
          case "saved":
            hist.title = Sefaria._("My Saved Content");
            hist.url = "texts/saved";
            hist.mode = "saved";
            break;
          case "history":
            hist.title = Sefaria._("My Reading History");
            hist.url = "texts/history";
            hist.mode = "history";
            break;
          case "beit_midrash":
            hist.title = Sefaria._("Sefaria Beit Midrash");
            hist.url = "beit-midrash";
            hist.mode = "beit-midrash";
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
                          (sidebarModes.has(state.connectionsMode) ? [state.connectionsMode] : ["all"]);
        hist.sources  = filter.join("+");
        if (state.connectionsMode === "Translation Open" && state.versionFilter.length) {
          hist.versionFilter = state.versionFilter[0];
        }
        if (state.connectionsMode === "Lexicon") {
          if (state.selectedWords.length) { hist.selectedWords = state.selectedWords; }
          if (state.selectedNamedEntity) { hist.selectedNamedEntity = state.selectedNamedEntity; }
          if (state.selectedNamedEntityText) { hist.selectedNamedEntityText = state.selectedNamedEntityText; }
        }
        hist.title    = Sefaria._r(ref)  + Sefaria._(" with ") + Sefaria._(hist.sources === "all" ? "Connections" : hist.sources);
        hist.url      = Sefaria.normRef(ref); // + "?with=" + sources;
        hist.mode     = "Connections";

      } else if (state.mode === "TextAndConnections") {
        var highlighted = state.highlightedRefs.length ? Sefaria.normRefList(state.highlightedRefs) : null;
        var filter    = state.filter.length ? state.filter :
                          (sidebarModes.has(state.connectionsMode) ? [state.connectionsMode] : ["all"]);
        hist.sources  = filter.join("+");
        if (highlighted &&
            (Sefaria.refContains(highlighted, state.currentlyVisibleRef)
             || Sefaria.refContains(state.currentlyVisibleRef, highlighted))) {
          var htitle = highlighted;
        } else {
          var htitle = state.currentlyVisibleRef;
        }
        if (state.connectionsMode === "Translation Open" && state.versionFilter.length) {
          hist.versionFilter = state.versionFilter[0];
        }
        hist.title    = Sefaria._r(htitle)  + Sefaria._(" with ") + Sefaria._(hist.sources === "all" ? "Connections" : hist.sources);
        hist.url      = Sefaria.normRef(htitle); // + "?with=" + sources;
        hist.currVersions = state.currVersions;
        hist.mode     = "TextAndConnections";
        if(Sefaria.titleIsTorah(htitle)){
          hist.aliyot = (state.settings.aliyotTorah == "aliyotOff") ? 0 : 1;
        }

      } else if (state.mode === "Sheet") {
        const sheet = Sefaria.sheets.loadSheetByID(state.sheetID);
        hist.title = sheet ? sheet.title.stripHtml() : "";
        const sheetURLSlug = state.highlightedNode ? state.sheetID + "." + state.highlightedNode : state.sheetID;
        const filter    = state.filter.length ? state.filter :
                          (sidebarModes.has(state.connectionsMode) ? [state.connectionsMode] : ["all"]);
        hist.sources  = filter.join("+");
        hist.url = i == 0 ? "sheets/" + sheetURLSlug : "sheet&s=" + sheetURLSlug;
        hist.mode     = "Sheet"

      } else if (state.mode === "SheetAndConnections") {
        const filter    = state.filter.length ? state.filter :
                          (sidebarModes.has(state.connectionsMode) ? [state.connectionsMode] : ["all"]);
        hist.sources  = filter.join("+");
        if (state.connectionsMode === "Translation Open" && state.versionFilter.length) {
          hist.versionFilter = state.versionFilter[0];
        }
        const sheet = Sefaria.sheets.loadSheetByID(state.sheetID);
        const title = sheet ? sheet.title.stripHtml() : "";
        hist.title  = title + Sefaria._(" with ") + Sefaria._(hist.sources === "all" ? "Connections" : hist.sources);
        hist.url    = i == 0 ? "sheets/" + state.sheetID : "sheet&s=" + state.sheetID + "?with=" + Sefaria._(hist.sources === "all" ? "Connections" : hist.sources);
        hist.mode   = "SheetAndConnections";
      }

      if (!state.settings) { debugger; }
      if (!hist.menuPage) {
        hist.lang = state.settings.language ? state.settings.language.substring(0,2) : "bi";
      }
      histories.push(hist);
    }

    if (!histories.length) {
      // If there were no panels, we're in headerMode over a static page
      histories[0] = {
        title: document.title,
        url: window.location.pathname.slice(1),
        mode: "Header",
      };
      if (window.location.search != ""){
        // Replace initial ? of query string with & which logic below expects
        histories[0].url += "&" + window.location.search.slice(1);
      }
    }

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
    hist = {state: {panels: states}, url: url, title: title, mode: histories[0].mode};
    for (var i = 1; i < histories.length; i++) {
      if ((histories[i-1].mode === "Text" && histories[i].mode === "Connections") ||
        (histories[i-1].mode === "Sheet" && histories[i].mode === "Connections")) {
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
            hist.url += "&vside=" + Sefaria.util.encodeVtitle(histories[1].versionFilter);
          }
          if (histories[1].selectedWords) {
            hist.url += "&lookup=" + encodeURIComponent(histories[1].selectedWords);
          }
          if (histories[1].selectedNamedEntity) {
            hist.url += "&namedEntity=" + histories[1].selectedNamedEntity;
          }
          if (histories[1].selectedNamedEntityText) {
            hist.url += "&namedEntityText=" + encodeURIComponent(histories[1].selectedNamedEntityText);
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
            hist.url += "&vside" + (i) + "=" + Sefaria.util.encodeVtitle(histories[i].versionFilter);
          }
          if (histories[i].selectedWords) {
            hist.url += `&lookup${i}=${encodeURIComponent(histories[i].selectedWords)}`;
          }
          if (histories[i].selectedNamedEntity) {
            hist.url += `&namedEntity${i}=${histories[i].selectedNamedEntity}`;
          }
          if (histories[i].selectedNamedEntityText) {
            hist.url += `&namedEntityText${i}=${encodeURIComponent(histories[i].selectedNamedEntityText)}`;
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
      // console.log("Replace History - " + hist.url);
      if (currentUrl != hist.url) { this.checkScrollIntentAndTrack(); }
      //console.log(hist);
    } else {
      if (currentUrl == hist.url) { return; } // Never push history with the same URL
      history.pushState(hist.state, hist.title, hist.url);
      // console.log("Push History - " + hist.url);
      this.trackPageview();
    }

    $("title").html(hist.title);
    this.replaceHistory = false;

    this.setPaddingForScrollbar() // Called here to save duplicate calls to shouldHistoryUpdate
  }
  _refState() {
    // Return a single flat list of all the refs across all panels
    return [].concat(...this.state.panels.map(p => p.refs || []))
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
  checkIntentTimer(timer, cb, intentDelay) {
    intentDelay = intentDelay || 3000;  // Number of milliseconds to demonstrate intent
    if (timer) { clearTimeout(timer); }
    return window.setTimeout(cb, intentDelay);
  }
  setScrollPositionInHistory(e) {
    const $scrollContainer = $(e.target);
    this.scrollPositionTimer = this.checkIntentTimer(this.scrollPositionTimer, () => {
      const scrollTop = $scrollContainer.scrollTop();
      const state = history.state;
      if (scrollTop == state.scrollPosition) { return; }
      state.scrollPosition = scrollTop;
      history.replaceState(state, window.location.href);      
    }, 300);
  }
  getDefaultPanelSettings() {
    if (this.state && this.state.defaultPanelSettings) {
      return this.state.defaultPanelSettings;
    } else if (this.props.initialSettings) {
      return this.props.initialSettings;
    } else {
      return {
        language:          "bilingual",
        layoutDefault:     "segmented",
        layoutTalmud:      "continuous",
        layoutTanakh:      "segmented",
        aliyotTorah:       "aliyotOff",
        vowels:            "all",
        punctuationTalmud: "punctuationOn",
        biLayout:          "stacked",
        color:             "light",
        fontSize:          62.5
      };
    }
  }
  setContainerMode() {
    // Applies CSS classes to the React container and body so that the App can function as a  
    // header only on top of a static page.
    if (this.props.headerMode) {
      if (this.state.panels && this.state.panels.length) {
        $("#s2").removeClass("headerOnly");
        $("body").css({overflow: "hidden"})
          .addClass("inApp")
          .removeClass("hasBannerMessage");
      } else {
        $("#s2").addClass("headerOnly");
        $("body").css({overflow: "auto"})
          .removeClass("inApp");
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
    var $container = $(ReactDOM.findDOMNode(this)).find(".textColumn, .sheetsInPanel");
    if (this.state.panels.length > 1) {
      $container.css({paddingRight: "", paddingLeft: ""});
    } else {
      $container.css({paddingRight: 0, paddingLeft: width});
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
    const refs = typeof ref == "string" ? [ref] : ref;

    if (sheetNode) {
      this.setSheetHighlight(n, sheetNode);
    }
    else {
      this.setTextListHighlight(n, refs);
    }

    const nodeRef = sheetNode ? this.state.panels[n].sheetID + "." + sheetNode : null;

    if (this.currentlyConnecting()) { return }

    this.openTextListAt(n+1, refs, nodeRef);

    if ($(".readerPanel")[n+1] && window.getSelection().isCollapsed && window.getSelection().anchorNode.nodeType !== 3) {
      //Focus on the first focusable element of the newly loaded panel if text not selected and not actively typing
      // in editor. Exists for a11y
      var curPanel = $(".readerPanel")[n+1];
      $(curPanel).find(':focusable').first().focus();
    }
  }
  closeConnectionPanel(n) {
    if (this.state.panels.length > n+1  && this.state.panels[n+1].mode === "Connections") {
      this.closePanel(n+1);
    }
  }
  handleCitationClick(n, citationRef, textRef, replace, currVersions) {
    // Handle clicking on the citation `citationRef` which was found inside of `textRef` in panel `n`.
    // If `replace`, replace a following panel with this citation, otherwise open a new panel after.
    if (this.state.panels.length > n+1  &&
      (replace || this.state.panels[n+1].mode === "Connections")) {
      this.closePanel(n+1);
    }
    if (textRef) {
      this.setTextListHighlight(n, textRef);
    }
    this.openPanelAt(n, citationRef, currVersions, {scrollToHighlighted: !!replace});
  }
  openNamedEntityInNewPanel(n, textRef, namedEntityState) {
    //this.setTextListHighlight(n, [textRef]);
    this.openTextListAt(n+1, [textRef], null, namedEntityState);
  }
  clearSelectedWords(n) {
    this.setPanelState(n, {selectedWords: ""});
  }
  clearNamedEntity(n) {
    this.setPanelState(n, {selectedNamedEntity: null, selectedNamedEntityText: null});
  }
  handleCompareSearchClick(n, ref, currVersions, options) {
    // Handle clicking a search result in a compare panel, so that clicks don't clobber open panels
    this.replacePanel(n, ref, currVersions, options);
  }
  handleInAppLinkClick(e) {
    // If a default has been prevented, assume a custom handler is already in place
    if (e.isDefaultPrevented()) {
      return;
    }
    // Don't trigger from v1 Sheet Builder which has conflicting CSS
    if (typeof sjs !== "undefined") {
      return;
    }
    // https://github.com/STRML/react-router-component/blob/master/lib/CaptureClicks.js
    // Get the <a> element.
    var el = e.target;
    while (el && el.nodeName !== 'A') {
      el = el.parentNode;
    }
    // Ignore clicks from non-a elements.
    if (!el) {
      return;
    }
    // Ignore the click if the element has a target.
    if (el.target && el.target !== '_self') {
      return;
    }
    const href = el.getAttribute('href');
    if (!href) {
      return;
    }
    //on mobile just replace panel w/ any link
    if (!this.props.multiPanel) {
      const handled = this.openURL(href, true);
      if (handled) {
        e.preventDefault();
      }
      return
    }
    //All links within sheet content should open in a new panel
    const isSheet = !!(el.closest(".sheetItem"))
    const replacePanel = !(isSheet)
    const handled = this.openURL(href,replacePanel);
    if (handled) {
      e.preventDefault();
    }
  }
  openURL(href, replace=true) {
    // Attempts to open `href` in app, return true if successful.
    href = href.startsWith("/") ? "https://www.sefaria.org" + href : href;
    let url;
    try {
      url = new URL(href);
    } catch {
      return false;
    }
    // Open non-Sefaria urls in new tab/window
    // TODO generalize to any domain of current deploy.
    if (url.hostname.indexOf("www.sefaria.org") === -1) {
      window.open(url, '_blank')
      return true;
    }
    const path = url.pathname;
    const params = url.searchParams;
    const openPanel = replace ? this.openPanel : this.openPanelAtEnd;
    if (path === "/") {
      this.showLibrary();

    } else if (path === "/texts") {
      this.showLibrary();

    } else if (path === "/texts/history") {
      this.showHistory();

    } else if (path === "/texts/saved") {
      this.showSaved();

    } else if (path.match(/\/texts\/.+/)) {
      this.showLibrary(path.slice(7).split("/").map(decodeURI));

    } else if (path === "/collections") {
      this.showCollections();

    } else if (path === "/community") {
      this.showCommunity();

    } else if (path === "/my/profile") {
      this.openProfile(Sefaria.slug, params.get("tab"));

    } else if (path === "/notifications") {
      this.showNotifications();

    } else if (path === "/calendars") {
      this.showCalendars();

    } else if (path === "/torahtracker") {
      this.showUserStats();

    } else if (path.match(/^\/sheets\/\d+/)) {
      openPanel("Sheet " + path.slice(8));

    } else if (path === "/topics") {
      this.showTopics();

    } else if (path.match(/^\/topics\/category\/[^\/]/)) {
      this.openTopicCategory(path.slice(17));

    } else if (path.match(/^\/topics\/all\/[^\/]/)) {
      this.openAllTopics(path.slice(12));

    } else if (path.match(/^\/topics\/[^\/]+/)) {
      this.openTopic(path.slice(8), params.get("tab"));

    } else if (path.match(/^\/profile\/.+/)) {
      this.openProfile(path.slice(9), params.get("tab"));

    } else if (path.match(/^\/collections\/.+/) && !path.endsWith("/settings") && !path.endsWith("/new")) {
      this.openCollection(path.slice(13));

    } else if (Sefaria.isRef(path.slice(1))) {
      const currVersions = {en: params.get("ven"), he: params.get("vhe")};
      const options = {showHighlight: path.slice(1).indexOf("-") !== -1};   // showHighlight when ref is ranged
      openPanel(Sefaria.humanRef(path.slice(1)), currVersions, options);
    } else {
      return false
    }
    return true;
  }
  unsetTextHighlight(n) {
    this.setPanelState(n, { textHighlights: null });
  }
  _getSearchStateName(type) {
    return `${type}SearchState`;
  }
  _getSearchState(state, type) {
    return !!state && state[this._getSearchStateName(type)];
  }
  updateQuery(n, query) {
    const state = this.state.panels[n];
    const updates = {
      searchQuery: query,
      textSearchState: state.textSearchState.update({ filtersValid: false }),
      sheetSearchState: state.sheetSearchState.update({ filtersValid: false }),
    };
    this.setPanelState(n, updates);
  }
  updateSearchTab(n, searchTab) {
    this.setPanelState(n, { searchTab });
  }
  updateAvailableFilters(n, type, availableFilters, filterRegistry, orphanFilters, aggregationsToUpdate) {
    const state = this.state.panels[n];
    const searchState = this._getSearchState(state, type);
    const searchStateName = this._getSearchStateName(type);
    this.setPanelState(n, {
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
  updateSearchFilter(n, type, filterNode) {
    const state = this.state.panels[n];
    const searchState = this._getSearchState(state, type);
    const searchStateName = this._getSearchStateName(type);
    if (filterNode.isUnselected()) {
      filterNode.setSelected(true);
    } else {
      filterNode.setUnselected(true);
    }
    const update = Sefaria.search.getAppliedSearchFilters(searchState.availableFilters)
    this.setPanelState(n, {
      [searchStateName]: searchState.update(update)
    });
  }
  updateSearchOptionField(n, type, field) {
    const state = this.state.panels[n];
    const searchState = this._getSearchState(state, type);
    const searchStateName = this._getSearchStateName(type);
    this.setPanelState(n, {
      [searchStateName]: searchState.update({ field, filtersValid: false })
    });
  }
  updateSearchOptionSort(n, type, sortType) {
    const state = this.state.panels[n];
    const searchState = this._getSearchState(state, type);
    const searchStateName = this._getSearchStateName(type);
    this.setPanelState(n, {
      [searchStateName]: searchState.update({ sortType })
    });
  }
  updateTopicsTab(n, topicsTab) {
    this.setPanelState(n, { topicsTab });
  }
  setPanelState(n, state, replaceHistory) {
    this.replaceHistory  = Boolean(replaceHistory);
    //console.log(`setPanel State ${n}, replace: ` + this.replaceHistory);
    //console.log(state)
    // When the driving panel changes language, carry that to the dependent panel
    // However, when carrying a language change to the Tools Panel, do not carry over an incorrect version
    if (!this.state.panels[n]) { debugger; }
    let langChange  = state.settings && state.settings.language !== this.state.panels[n].settings.language;
    let next        = this.state.panels[n+1];
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
    let new_state = {panels: this.state.panels};
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
      if (prevPanel.sheetID !== nextPanel.sheetID) { return true; }
      return prevPanel.highlightedNode !== nextPanel.highlightedNode
    } else {
      return true;
    }
  }
  selectVersion(n, versionName, versionLanguage) {
    // Set the version for panel `n`.
    var panel = this.state.panels[n];
    var oRef = Sefaria.ref(panel.refs[0]);
    let panelLang;
    if (versionName && versionLanguage) {
      panel.currVersions[versionLanguage] = versionName;
      if ((versionLanguage === "he" && panel.settings.language === 'english') ||
          (versionLanguage === "en" && panel.settings.language === 'hebrew')) { // if lang of version isn't visible, display it
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
  navigatePanel(n, ref, currVersions={en: null, he: null}) {
    // Sets the ref on panel `n` and cascades to any attached panels (Text + Connections)
    let panel = this.state.panels[n];
    // next few lines adapted from ReaderPanel.showBaseText()
    let refs, currentlyVisibleRef, highlightedRefs;
    if (ref.constructor == Array) {
      // When called with an array, set highlight for the whole spanning range
      refs = ref;
      currentlyVisibleRef = Sefaria.humanRef(ref);
      let splitArray = refs.map(ref => Sefaria.splitRangingRef(ref));
      highlightedRefs = [].concat.apply([], splitArray);
    } else {
      refs = [ref];
      currentlyVisibleRef = ref;
      highlightedRefs = (panel.mode == "TextAndConnections") ? [ref] : [];
    }
    let updatePanelObj = {refs: refs, currentlyVisibleRef: currentlyVisibleRef, highlightedRefs: highlightedRefs}
    if((this.state.panels.length > n+1) && this.state.panels[n+1].mode == "Connections"){
      let connectionsPanel =  this.state.panels[n+1];
      Object.assign(connectionsPanel, {refs: refs, currentlyVisibleRef: currentlyVisibleRef, highlightedRefs: highlightedRefs});
    } else if (n-1 >= 0 && this.state.panels[n].mode === "Connections") {
      let masterPanel = this.state.panels[n-1];
      Object.assign(masterPanel, {refs: refs, currentlyVisibleRef: currentlyVisibleRef, highlightedRefs: highlightedRefs});
    }
    Object.assign(panel, updatePanelObj);
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
    this.state.panels = []; // temporarily clear panels directly in state, set properly with setState in openPanelAt
    this.openPanelAt(0, ref, currVersions, options);
  }
  openPanelAt(n, ref, currVersions, options, replace) {
    // Open a new panel after `n` with the new ref
    // If `replace`, replace existing panel at `n`, otherwise insert new panel at `n`
    // If book level, Open book toc
    const parsedRef = Sefaria.parseRef(ref);
    var index = Sefaria.index(ref); // Do we have to worry about normalization, as in Header.subimtSearch()?
    var panel;
    if (index) {
      panel = this.makePanelState({"menuOpen": "book toc", "bookRef": index.title});
    } else if (parsedRef.book === "Sheet") {
      const [sheetID, sheetNode] = parsedRef.sections;
      panel = this.makePanelState({
        mode: 'Sheet',
        sheetID: parseInt(sheetID),
        highlightedNode: parseInt(sheetNode),
        refs: null,
        ...options
      });
    } else {  // Text
      if (ref.constructor === Array) {
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
      panel = this.makePanelState({
        refs,
        currVersions,
        highlightedRefs,
        currentlyVisibleRef, mode: "Text",
        ...options
      });
    }

    var newPanels = this.state.panels.slice();
    newPanels.splice(replace ? n : n+1, replace ? 1 : 0, panel);
    this.setState({panels: newPanels});
    this.saveLastPlace(panel, n+1);
  }
  openPanelAtEnd(ref, currVersions) {
    this.openPanelAt(this.state.panels.length+1, ref, currVersions);
  }
  replacePanel(n, ref, currVersions, options) {
    // Opens a text in in place of the panel currently open at `n`.
    this.openPanelAt(n, ref, currVersions, options, true);
  }
  openComparePanel(n, connectAfter) {
    var comparePanel = this.makePanelState({
      menuOpen: "navigation",
      compare: true,
      openSidebarAsConnect: typeof connectAfter !== "undefined" ? connectAfter : false,
    });
    Sefaria.track.event("Reader", "Other Text Click");
    this.state.panels[n] = comparePanel;
    this.setState({panels: this.state.panels});
  }
  openTextListAt(n, refs, sheetNodes, textListState) {
    // Open a connections panel at position `n` for `refs`
    // Replace panel there if already a connections panel, otherwise splice new panel into position `n`
    // `refs` is an array of ref strings
    // `textListState` is an object of initial state to pass to the new panel. if `undefined`, no-op
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
    if (textListState) {
      panel = {...panel, ...textListState};
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
    this.state.panels[n].highlightedNode = node;
    this.state.panels[n].scrollToHighlighted = false;
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
      var filterAndSuffix = filter.split("|");
      connectionsPanel.connectionsMode = filterAndSuffix.length == 2 && filterAndSuffix[1] == "Essay" ? "EssayList" : "TextList";
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
      connectionsPanel.connectionsMode = "Translation Open";
    } else {
      connectionsPanel.versionFilter = [];
      connectionsPanel.connectionsMode = "Translations";
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
  closePanel(n) {
    // Removes the panel in position `n`, as well as connections panel in position `n+1` if it exists.
    if (this.state.panels.length == 1 && n == 0) {
      this.state.panels = [];
    } else {
      // If this is a Connection panel, we need to unset the filter in the base panel
      if (n > 0 && this.state.panels[n] && this.state.panels[n].mode === "Connections"){
        const parent = this.state.panels[n-1];
        parent.filter = [];
        parent.highlightedRefs = [];
        parent.refs = parent.refs.map(ref => Sefaria.ref(ref).sectionRef);
        parent.currentlyVisibleRef = parent.currentlyVisibleRef ? Sefaria.ref(parent.currentlyVisibleRef).sectionRef : null;
      }
      this.state.panels.splice(n, 1);
      if (this.state.panels[n] && (this.state.panels[n].mode === "Connections" || this.state.panels[n].compare)) {
        // Close connections panel or compare panel when text panel is closed
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
    } else {
      this.setState(state);
    }
  }
  convertToTextList(n) {
    console.log("convert")
    var base = this.state.panels[n-1];
    this.closePanel(n);
    if (base.mode == "Sheet") {
      const sheet = Sefaria.sheets.loadSheetByID(base.sheetID);
      if (!sheet) { return; }
      for(var i in sheet.sources){
        if (sheet.sources[i].node == base.highlightedNode) {
          this.openTextListAt(n, [sheet.sources[i].ref]);
        }
      }
    }
    else {
      this.openTextListAt(n, base.highlightedRefs);
    }
  }
  showLibrary(categories) {
    let state = {menuOpen: "navigation", navigationCategories: categories, "mode": "Menu"};
    state = this.makePanelState(state);
    if (!Sefaria._siteSettings.TORAH_SPECIFIC) {
      this.state.panels[0].settings.language = "english";
    }
    this.setSinglePanelState(state);
  }
  showSearch(searchQuery) {
    let panel;
    const textSearchState =  (!!this.state.panels && this.state.panels.length && !!this.state.panels[0].textSearchState)  ? this.state.panels[0].textSearchState.update({ filtersValid: false })  : new SearchState({ type: 'text' });
    const sheetSearchState = (!!this.state.panels && this.state.panels.length && !!this.state.panels[0].searchStateSheet) ? this.state.panels[0].searchStateSheet.update({ filtersValid: false }) : new SearchState({ type: 'sheet' });

    const searchTab = !!this.state.panels && this.state.panels.length ? this.state.panels[0].searchTab : "text";
    this.setSinglePanelState({mode: "Menu", menuOpen: "search", searchQuery, searchTab, textSearchState, sheetSearchState });
  }
  searchInCollection(searchQuery, collection) {
    let panel;
    const textSearchState =  new SearchState({ type: 'text' });
    const sheetSearchState = new SearchState({ type: 'sheet',  appliedFilters: [collection], appliedFilterAggTypes: ['collections']});

    this.setSinglePanelState({mode: "Menu", menuOpen: "search", "searchTab": "sheet", searchQuery, textSearchState, sheetSearchState });
  }
  showCommunity() {
    this.setSinglePanelState({menuOpen: "community"});
  }
  showSaved() {
    this.setSinglePanelState({menuOpen: "saved"});
  }
  showHistory() {
    this.setSinglePanelState({menuOpen: "history"});
  }
  showTopics() {
    this.setSinglePanelState({menuOpen: "topics", navigationTopicCategory: null, navigationTopic: null});
  }
  showNotifications() {
    this.setSinglePanelState({menuOpen: "notifications"});
  }
  showCalendars() {
    this.setSinglePanelState({menuOpen: "calendars"});
  }
  showUserStats() {
    this.setSinglePanelState({menuOpen: "user_stats"});
  }
  showCollections() {
    this.setSinglePanelState({menuOpen: "collectionsPublic"});
  }
  setSinglePanelState(state) {
    // Sets state to be a single panel with properties of `state`
    state = this.makePanelState(state);
    this.setState({panels: [state], headerMode: false});
  }
  openTopic(slug, topicsTab) {
    if (!topicsTab) {
      topicsTab = "sources";
    }
    Sefaria.getTopic(slug, {annotate_time_period: true}).then(topic => {
      this.setSinglePanelState({ menuOpen: "topics", navigationTopic: slug, topicTitle: topic.primaryTitle, topicsTab });
    });
  }
  openTopicCategory(slug) {
    this.setSinglePanelState({ 
      menuOpen: "topics",
      navigationTopicCategory: slug,
      navigationTopicTitle: Sefaria.topicTocCategoryTitle(slug), 
      navigationTopic: null,
    });
  }
  openAllTopics(letter) {
    this.setSinglePanelState({menuOpen: "allTopics", navigationTopicLetter: letter});
  }
  openProfile(slug, tab) {
    tab = tab || "sheets";
    Sefaria.profileAPI(slug).then(profile => {
      this.setSinglePanelState({ menuOpen: "profile", profile, profileTab: tab});
    });
  }
  openCollection(slug) {
    this.setSinglePanelState({menuOpen: "collection",  collectionSlug: slug});
  }
  toggleMobileNavMenu() {
    this.setState({mobileNavMenuOpen: !this.state.mobileNavMenuOpen});
  }
  toggleLanguageInFirstPanel() {
    if (this.state.panels[0].settings.language === "hebrew") {
      this.state.panels[0].settings.language = "english";
    } else {
      this.state.panels[0].settings.language = "hebrew";
    }
    this.setState({panels: this.state.panels});
  }
  getHistoryObject(panel, hasSidebar) {
    // get rave to send to /api/profile/user_history
    let ref, sheet_owner, sheet_title;
    if (panel.mode === 'Sheet' || panel.mode === "SheetAndConnections") {
      const sheet = Sefaria.sheets.loadSheetByID(panel.sheetID);
      if (!sheet) { return null; }
      ref = `Sheet ${sheet.id}${panel.highlightedNode ? `:${panel.highlightedNode}`: ''}`;
      sheet_owner = sheet.ownerName;
      sheet_title = sheet.title;
    } else {
      ref = (hasSidebar && panel.highlightedRefs && panel.highlightedRefs.length) ? Sefaria.normRef(panel.highlightedRefs) : (panel.currentlyVisibleRef || panel.refs.slice(-1)[0]);  // Will currentlyVisibleRef ever not be available?
    }
    const parsedRef = Sefaria.parseRef(ref);
    if (!ref) { debugger; }
    return {
      ref,
      versions: panel.currVersions,
      book: parsedRef.book,
      language: panel.settings.language,
      sheet_owner,
      sheet_title,
    };
  }
  setTranslationLanguagePreference(lang) {
    let suggested = true;
    if (lang === null) {
      suggested = false;
      $.removeCookie("translation_language_preference", {path: "/"});
      $.removeCookie("translation_language_preference_suggested", {path: "/"});
    } else {
      $.cookie("translation_language_preference", lang, {path: "/"});
      $.cookie("translation_language_preference_suggested", JSON.stringify(1), {path: "/"});
    }
    Sefaria.track.event("Reader", "Set Translation Language Preference", lang);
    Sefaria.editProfileAPI({settings: {translation_language_preference: lang, translation_language_preference_suggested: suggested}});
    this.setState({translationLanguagePreference: lang});
  }
  doesPanelHaveSidebar(n) {
    return this.state.panels.length > n+1 && this.state.panels[n+1].mode == "Connections";
  }
  saveLastPlace(panel, n, openingSidebar) {
    //openingSidebar is true when you call `saveLastPlace` at the time you're opening the sidebar. In this case, `doesPanelHaveSidebar` will be false
    const hasSidebar = this.doesPanelHaveSidebar(n) || openingSidebar;
    // if panel is sheet, panel.refs isn't set
    if ((panel.mode !== 'Sheet' && !panel.refs.length ) || panel.mode === 'Connections') { return; }
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
  getDisplayString(mode) {
    const learningStatus = ["text toc", "book toc", "sheet meta",  "Text", "TextAndConnections", "SheetAndConnections"];
    const topicStatus = ["topicCat", "topic"]
    if(mode.includes("sheet")) {
      return "learning the Sheet"
    } else if (topicStatus.includes(mode)) {
      return "viewing the topic"
    }
    else if(learningStatus.includes(mode)) {
      return "learning";
    } else {
      return "currently viewing"
    }
  }
  generateCurrentlyReading() {
    const currentHistoryState = this.makeHistoryState();
    const inBeitMidrash = ["navigation", "text toc", "book toc", "sheet meta", "topics", "topic", "topicCat", "Text", "TextAndConnections", "Sheet", "SheetAndConnections"];
    currentHistoryState.title = currentHistoryState.title.match(/[^|]*/)[0];
    if (inBeitMidrash.includes(currentHistoryState.mode)) {
      return {title: currentHistoryState.title, url: currentHistoryState.url, mode: currentHistoryState.mode, display: this.getDisplayString(currentHistoryState.mode)};
    } else {
      return null;
    }

  }

  handleCopyEvent(e) {
    // Custom processing of Copy/Paste
    // - Ensure we don't copy hidden English or Hebrew text
    // - Remove elements like link dots
    // - Strip links inline in the text
    const selection = document.getSelection()
    const textOnly = selection.toString();
    let html = textOnly;

    if (selection.rangeCount) {
      const container = document.createElement("div");
      for (let i = 0, len = selection.rangeCount; i < len; ++i) {
        container.appendChild(selection.getRangeAt(i).cloneContents());
      }

      // Elements to Remove
      const classesToRemove = ["segmentNumber", "linkCount", "clearFix"];
      classesToRemove.map(cls => {
        let elsToRemove = container.getElementsByClassName(cls);
        while(elsToRemove.length > 0){
          elsToRemove[0].parentNode.removeChild(elsToRemove[0]);
        }
      });

      // Links to Strip
      const linksToStrip = ".segment a.namedEntityLink, .segment a.refLink";
      let elsToStrip = container.querySelectorAll(linksToStrip);
      elsToStrip.forEach(el => el.outerHTML = el.innerText);


      // Remove invisible languages based on the class of the readerPanel you're
      // copying from. 
      const selectionAncestor = selection.getRangeAt(0).commonAncestorContainer;
      if (selectionAncestor.nodeType == 1) {

        const curReaderPanel = selectionAncestor.closest('.readerPanel');

        if (curReaderPanel && curReaderPanel.classList.contains('hebrew')) {
          let elsToRemove = container.getElementsByClassName('en')
          while(elsToRemove.length > 0){
            elsToRemove[0].parentNode.removeChild(elsToRemove[0]);
          }
        }

        else if (curReaderPanel && curReaderPanel.classList.contains('english')) {
          let elsToRemove = container.getElementsByClassName('he')
          while(elsToRemove.length > 0){
            elsToRemove[0].parentNode.removeChild(elsToRemove[0]);
          }
        }
      }

      html = container.innerHTML;
    }

    const clipdata = e.clipboardData || window.clipboardData;
    clipdata.setData('text/plain', textOnly);
    clipdata.setData('text/html', html);
    e.preventDefault();
  }
  rerender() {
    this.forceUpdate();
    this.setContainerMode();
  }

  getUserContext() {
    const refs = this.state.panels.map(panel => panel.currentlyVisibleRef || panel.bookRef || panel.navigationCategories || panel.navigationTopic).flat();
    const books = refs.map(ref => Sefaria.parseRef(ref).book);
    const triggers = refs.map(ref => Sefaria.refCategories(ref))
          .concat(books)
          .concat(refs)
          .flat()
          .filter(ref => !!ref);
    const deDupedTriggers = [...new Set(triggers.map(JSON.stringify))].map(JSON.parse);
    const context = {
      isLoggedIn: Sefaria._uid,
      interfaceLang: Sefaria.interfaceLang,
      dt: Sefaria.util.epoch_time(new Date())*1000,
      keywordTargets: refs ? deDupedTriggers : []
    };
    return context
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
        (panelStates[1].mode == "Connections" || panelStates[1].menuOpen === "search" || panelStates[1].compare)) {
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
    
    // Header should not show box-shadow over panels that have color line
    const menuOpen = this.state.panels?.[0]?.menuOpen;
    const hasColorLine = [null, "book toc", "sheets", "sheets meta"];
    const headerHasBoxShadow = hasColorLine.indexOf(menuOpen) === -1 || !this.props.multiPanel;
    // Header is hidden on certain mobile panels, but still rendered so the mobileNavMenu can be opened
    const hideHeader = !this.props.multiPanel && !this.state.headerMode && (!menuOpen || menuOpen === "text toc");
    const header = (
      <Header
        multiPanel={this.props.multiPanel}
        onRefClick={this.handleNavigationClick}
        showSearch={this.showSearch}
        openURL={this.openURL}
        headerMode={this.props.headerMode}
        openTopic={this.openTopic}
        hidden={hideHeader}
        mobileNavMenuOpen={this.state.mobileNavMenuOpen}
        onMobileMenuButtonClick={this.toggleMobileNavMenu}
        hasLanguageToggle={!this.props.multiPanel && Sefaria.interfaceLang !== "hebrew" && this.state.panels?.[0]?.menuOpen === "navigation"}
        toggleLanguage={this.toggleLanguageInFirstPanel}
        firstPanelLanguage={this.state.panels?.[0]?.settings?.language}
        hasBoxShadow={headerHasBoxShadow}
        translationLanguagePreference={this.state.translationLanguagePreference}
        setTranslationLanguagePreference={this.setTranslationLanguagePreference} />
    );

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
      var openNamedEntityInNewPanel      = this.openNamedEntityInNewPanel.bind(null, i);
      var onCloseConnectionClick         = this.closeConnectionPanel.bind(null,i);
      var onSearchResultClick            = i > 0 ? this.handleCompareSearchClick.bind(null, i) : this.handleNavigationClick;
      var unsetTextHighlight             = this.unsetTextHighlight.bind(null, i);
      var updateQuery                    = this.updateQuery.bind(null, i);
      var updateSearchTab                = this.updateSearchTab.bind(null, i);
      var updateAvailableFilters         = this.updateAvailableFilters.bind(null, i);
      var updateSearchFilter             = this.updateSearchFilter.bind(null, i);
      var updateSearchOptionField        = this.updateSearchOptionField.bind(null, i);
      var updateSearchOptionSort         = this.updateSearchOptionSort.bind(null, i);
      var updateTopicsTab                = this.updateTopicsTab.bind(null, i);
      var onOpenConnectionsClick         = this.openTextListAt.bind(null, i+1);
      var setTextListHighlight           = this.setTextListHighlight.bind(null, i);
      var setSelectedWords               = this.setSelectedWords.bind(null, i);
      var clearSelectedWords             = this.clearSelectedWords.bind(null, i);
      var clearNamedEntity               = this.clearNamedEntity.bind(null, i);
      var openComparePanel               = this.openComparePanel.bind(null, i);
      var closePanel                     = panel.compare ? this.convertToTextList.bind(null, i) : this.closePanel.bind(null, i);
      var setPanelState                  = this.setPanelState.bind(null, i);
      var setConnectionsFilter           = this.setConnectionsFilter.bind(this, i);
      var setVersionFilter               = this.setVersionFilter.bind(this, i);
      var selectVersion                  = this.selectVersion.bind(null, i);
      var viewExtendedNotes              = this.viewExtendedNotes.bind(this, i);
      var backFromExtendedNotes          = this.backFromExtendedNotes.bind(this, i);
      var navigatePanel                  = this.navigatePanel.bind(null, i)

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
                      openNamedEntityInNewPanel={openNamedEntityInNewPanel}
                      closeConnectionPanel={onCloseConnectionClick}
                      onSearchResultClick={onSearchResultClick}
                      onNavigationClick={this.handleNavigationClick}
                      updateTopicsTab={updateTopicsTab}
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
                      searchInCollection={this.searchInCollection}
                      setUnreadNotificationsCount={this.setUnreadNotificationsCount}
                      closePanel={closePanel}
                      panelsOpen={panelStates.length}
                      allOpenRefs={allOpenRefs}
                      hasSidebar={this.doesPanelHaveSidebar(i)}
                      masterPanelLanguage={panel.mode === "Connections" ? panelStates[i-1].settings.language : panel.settings.language}
                      masterPanelMode={panel.mode === "Connections" ? panelStates[i-1].mode : null}
                      masterPanelSheetId={panel.mode === "Connections" ? panelStates[i-1].sheetID : null}
                      layoutWidth={width}
                      analyticsInitialized={this.state.initialAnalyticsTracked}
                      saveLastPlace={this.saveLastPlace}
                      checkIntentTimer={this.checkIntentTimer}
                      openMobileNavMenu={this.toggleMobileNavMenu}
                      toggleSignUpModal={this.toggleSignUpModal}
                      getHistoryObject={this.getHistoryObject}
                      clearSelectedWords={clearSelectedWords}
                      clearNamedEntity={clearNamedEntity}
                      translationLanguagePreference={this.state.translationLanguagePreference}
                      setTranslationLanguagePreference={this.setTranslationLanguagePreference}
                      navigatePanel={navigatePanel}
                    />
                  </div>);
    }
    var boxClasses = classNames({wrapBoxScroll: wrapBoxScroll});
    var boxWidth = wrapBoxScroll ? this.state.windowWidth + "px" : "100%";
    var boxStyle = this.state.beitMidrashStatus ? {width: `calc(${boxWidth} - 330px)`} : {width: boxWidth};
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
          onClose={this.rerender} />) : <Promotions rerender={this.rerender} adType="banner"/>;
    const sefariaModal = (
      <SignUpModal onClose={this.toggleSignUpModal} show={this.state.showSignUpModal} />
    );
    const communityPagePreviewControls = this.props.communityPreview ?
      <CommunityPagePreviewControls date={this.props.communityPreview} /> : null;

    const beitMidrashPanel = this.state.beitMidrashStatus ? (
      <div id='beitMidrash' style={{width: 330,
                                    marginInlineStart: "auto",
                                    marginInlineEnd: 0,
                                    height: `calc(100% - 60px)`,
                                    marginTop: 60}}>
          <BeitMidrash
            socket={io(`//${Sefaria.rtc_server}`, {autoConnect: false})}
            beitMidrashId = {this.state.beitMidrashId}
            currentlyReading = {this.generateCurrentlyReading()}
          />
      </div>
    ) : null
    
    var classDict = {readerApp: 1, multiPanel: this.props.multiPanel, singlePanel: !this.props.multiPanel};
    var interfaceLangClass = `interface-${this.props.interfaceLang}`;
    classDict[interfaceLangClass] = true;
    var classes = classNames(classDict);
  
    return (
      <AdContext.Provider value={this.getUserContext()}>
      <div id="readerAppWrap">
        {interruptingMessage}
        <div className={classes} onClick={this.handleInAppLinkClick}>
          {header}
          {panels}
          {sefariaModal}
          {communityPagePreviewControls}
          {beitMidrashPanel}
          <CookiesNotification />
        </div>
      </div>
      </AdContext.Provider>
    );
  }
}
ReaderApp.propTypes = {
  multiPanel:                  PropTypes.bool,
  headerMode:                  PropTypes.bool,  // is the App serving only as a header on top of another page?
  interfaceLang:               PropTypes.string,
  initialRefs:                 PropTypes.array,
  initialFilter:               PropTypes.array,
  initialMenu:                 PropTypes.string,
  initialCollection:           PropTypes.string,
  initialQuery:                PropTypes.string,
  initialTextSearchFilters:    PropTypes.array,
  initialTextSearchField:      PropTypes.string,
  initialTextSearchSortType:   PropTypes.string,
  initialSheetSearchFilters:   PropTypes.array,
  initialSheetSearchField:     PropTypes.string,
  initialSheetSearchSortType:  PropTypes.string,
  initialTopic:                PropTypes.string,
  initialProfile:              PropTypes.object,
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
  initialCollection:           null,
  initialQuery:                null,
  initialTopic:                null,
  initialProfile:              null,
  initialNavigationCategories: [],
  initialPanels:               [],
  initialDefaultVersions:      {},
  initialPanelCap:             2,
  initialPath:                 "/"
};

const sefariaSetup = Sefaria.setup;
const { unpackDataFromProps, loadServerData } = Sefaria;
export {
  ReaderApp,
  Footer,
  sefariaSetup,
  unpackDataFromProps,
  loadServerData,
  EditCollectionPage,
  RemoteLearningPage,
  SheetsLandingPage,
  ContestLandingPage,
  PBSC2020LandingPage,
  PBSC2021LandingPage,
  RambanLandingPage,
  EducatorsPage
};
