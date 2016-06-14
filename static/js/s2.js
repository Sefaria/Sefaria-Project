'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

if (typeof require !== 'undefined') {
  var INBROWSER = false,
      React = require('react'),
      ReactDOM = require('react-dom'),
      $ = require('jquery'),
      extend = require('extend'),
      classNames = require('classnames'),
      Sefaria = require('./sefaria.js'),
      cookie = Sefaria.util.cookie;
} else {
  var INBROWSER = true,
      extend = $.extend,
      cookie = $.cookie;
}

var ReaderApp = React.createClass({
  displayName: 'ReaderApp',

  propTypes: {
    multiPanel: React.PropTypes.bool,
    headerMode: React.PropTypes.bool, // is S2 serving only as a header on top of another page?
    loggedIn: React.PropTypes.bool,
    interfaceLang: React.PropTypes.string,
    initialRefs: React.PropTypes.array,
    initialFilter: React.PropTypes.array,
    initialMenu: React.PropTypes.string,
    initialQuery: React.PropTypes.string,
    initialSearchFilters: React.PropTypes.array,
    initialSheetsTag: React.PropTypes.string,
    initialNavigationCategories: React.PropTypes.array,
    initialSettings: React.PropTypes.object,
    initialPanels: React.PropTypes.array,
    initialDefaultVersions: React.PropTypes.object,
    initialPath: React.PropTypes.string,
    initialPanelCap: React.PropTypes.number
  },
  getDefaultProps: function getDefaultProps() {
    return {
      multiPanel: true,
      headerMode: false, // is S2 serving only as a header on top of another page?
      interfaceLang: "english",
      initialRefs: [],
      initialFilter: null,
      initialMenu: null,
      initialQuery: null,
      initialSearchFilters: [],
      initialSheetsTag: null,
      initialNavigationCategories: [],
      initialPanels: [],
      initialDefaultVersions: {},
      initialPath: "/"
    };
  },
  getInitialState: function getInitialState() {
    // TODO clean up generation of initial panels objects.
    // Currently these get generated in reader/views.py, then regenerated in s2.html then regenerated again in ReaderApp.
    var panels = [];
    var header = {};
    var defaultVersions = Sefaria.util.clone(this.props.initialDefaultVersions) || {};
    var defaultPanelSettings = this.getDefaultPanelSettings();

    if (!this.props.multiPanel && !this.props.headerMode) {
      if (this.props.initialPanels && this.props.initialPanels.length > 0 && this.props.initialPanels[0].menuOpen == "book toc") {
        panels[0] = {
          settings: Sefaria.util.clone(defaultPanelSettings),
          menuOpen: "book toc",
          //mode: "Text",
          bookRef: this.props.initialPanels[0].bookRef
        };
      } else {
        var mode = this.props.initialFilter ? "TextAndConnections" : "Text";
        var initialPanel = this.props.initialPanels && this.props.initialPanels.length ? this.props.initialPanels[0] : {};
        panels[0] = {
          refs: this.props.initialRefs,
          mode: mode,
          filter: this.props.initialFilter,
          menuOpen: this.props.initialMenu,
          version: initialPanel.version || null,
          versionLanguage: initialPanel.versionLanguage || null,
          searchQuery: this.props.initialQuery,
          appliedSearchFilters: this.props.initialSearchFilters,
          settings: Sefaria.util.clone(defaultPanelSettings)
        };
        if (panels[0].versionLanguage) {
          panels[0].settings.language = panels[0].versionLanguage == "he" ? "hebrew" : "english";
        }
        if (mode === "TextAndConnections") {
          panels[0].highlightedRefs = this.props.initialRefs;
        }
      }
    } else {
      var headerState = {
        mode: "Header",
        refs: this.props.initialRefs,
        bookRef: this.props.initialBookRef,
        menuOpen: this.props.initialMenu,
        searchQuery: this.props.initialQuery,
        appliedSearchFilters: this.props.initialSearchFilters,
        navigationCategories: this.props.initialNavigationCategories,
        sheetsTag: this.props.initialSheetsTag,
        settings: Sefaria.util.clone(defaultPanelSettings)
      };
      header = this.makePanelState(headerState);
      if (this.props.initialRefs.length) {
        var p = {
          refs: this.props.initialRefs,
          mode: "Text",
          menuOpen: this.props.initialPanels[0].menuOpen,
          version: this.props.initialPanels.length ? this.props.initialPanels[0].version : null,
          versionLanguage: this.props.initialPanels.length ? this.props.initialPanels[0].versionLanguage : null,
          settings: Sefaria.util.clone(defaultPanelSettings)
        };
        if (p.versionLanguage) {
          p.settings.language = p.versionLanguage == "he" ? "hebrew" : "english";
        }
        panels.push(p);
        if (this.props.initialFilter) {
          panels.push({
            refs: this.props.initialRefs,
            filter: this.props.initialFilter,
            mode: "Connections",
            settings: Sefaria.util.clone(defaultPanelSettings)
          });
        }
      }
      for (var i = panels.length; i < this.props.initialPanels.length; i++) {
        var panel;
        if (this.props.initialPanels[i].menuOpen == "book toc") {
          panel = {
            settings: Sefaria.util.clone(defaultPanelSettings),
            menuOpen: this.props.initialPanels[i].menuOpen,
            bookRef: this.props.initialPanels[i].bookRef
          };
        } else {
          panel = this.clonePanel(this.props.initialPanels[i]);
          panel.settings = Sefaria.util.clone(defaultPanelSettings);
          if (panel.versionLanguage) {
            panel.settings.language = panel.versionLanguage == "he" ? "hebrew" : "english";
          }
        }
        panels.push(panel);
      }
    }
    panels = panels.map(function (panel) {
      return this.makePanelState(panel);
    }.bind(this));

    var layoutOrientation = "ltr";
    if (panels.length > 0 && panels[0].settings && panels[0].settings.language == "hebrew" || header.settings && header.settings.language == "hebrew") {
      layoutOrientation = "rtl";
    }

    return {
      panels: panels,
      header: header,
      headerMode: this.props.headerMode,
      defaultVersions: defaultVersions,
      defaultPanelSettings: Sefaria.util.clone(defaultPanelSettings),
      layoutOrientation: layoutOrientation,
      path: this.props.initialPath,
      panelCap: this.props.initialPanelCap
    };
  },
  componentDidMount: function componentDidMount() {
    this.updateHistoryState(true); // make sure initial page state is in history, (passing true to replace)
    window.addEventListener("popstate", this.handlePopState);
    window.addEventListener("resize", this.setPanelCap);
    window.addEventListener("beforeunload", this.saveOpenPanelsToRecentlyViewed);
    this.setPanelCap();
    // Set S2 cookie, putting user into S2 mode site wide
    cookie("s2", true, { path: "/" });
  },
  componentWillUnmount: function componentWillUnmount() {
    window.removeEventListener("popstate", this.handlePopState);
    window.removeEventListener("resize", this.setPanelCap);
    window.removeEventListener("beforeunload", this.saveOpenPanelsToRecentlyViewed);
  },
  componentWillUpdate: function componentWillUpdate(nextProps, nextState) {},
  componentDidUpdate: function componentDidUpdate(prevProps, prevState) {
    if (this.justPopped) {
      //console.log("Skipping history update - just popped")
      this.justPopped = false;
      return;
    }

    this.setContainerMode();
    this.updateHistoryState(this.replaceHistory);
  },
  handlePopState: function handlePopState(event) {
    var state = event.state;
    console.log("Pop - " + window.location.pathname);
    console.log(state);
    if (state) {
      var kind = "";
      if (Sefaria.site) {
        Sefaria.site.track.event("Reader", "Pop State", kind);
      }
      this.justPopped = true;
      this.setState(state);
      this.setContainerMode();
    }
  },
  shouldHistoryUpdate: function shouldHistoryUpdate() {
    // Compare the current state to the state last pushed to history,
    // Return true if the change warrants pushing to history.
    // If there's no history or the number or basic state of panels has changed
    if (!history.state || !history.state.panels && !history.state.header || history.state.panels && history.state.panels.length !== this.state.panels.length || history.state.header && history.state.header.menuOpen !== this.state.header.menuOpen) {
      return true;
    }

    if (this.props.multiPanel) {
      var prevPanels = [history.state.header];
      var nextPanels = [this.state.header];
    } else {
      var prevPanels = history.state.panels || [];
      var nextPanels = this.state.panels;
    }

    for (var i = 0; i < prevPanels.length; i++) {
      // Cycle through each panel, compare previous state to next state, looking for differences
      var prev = prevPanels[i];
      var next = nextPanels[i];

      if (!prev || !next) {
        return true;
      }

      if (prev.mode !== next.mode || prev.menuOpen !== next.menuOpen || next.mode === "Text" && prev.refs.slice(-1)[0] !== next.refs.slice(-1)[0] || next.mode === "TextAndConnections" && prev.highlightedRefs.slice(-1)[0] !== next.highlightedRefs.slice(-1)[0] || (next.mode === "Connections" || next.mode === "TextAndConnections") && prev.filter && !prev.filter.compare(next.filter) || next.mode === "Connections" && !prev.refs.compare(next.refs) || prev.navigationSheetTag !== next.navigationSheetTag || prev.version !== next.version || prev.versionLanguage !== next.versionLanguage || prev.searchQuery != next.searchQuery || prev.appliedSearchFilters && next.appliedSearchFilters && prev.appliedSearchFilters.length !== next.appliedSearchFilters.length || prev.appliedSearchFilters && next.appliedSearchFilters && !prev.appliedSearchFilters.compare(next.appliedSearchFilters)) {
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
  },
  clonePanel: function clonePanel(panel, trimFilters) {
    //Set aside self-referential objects before cloning
    //Todo: Move the multiple instances of this out to a utils file
    if (panel.availableFilters || panel.filterRegistry) {
      var savedAttributes = {
        availableFilters: panel.availableFilters,
        searchFiltersValid: panel.searchFiltersValid,
        filterRegistry: panel.filterRegistry
      };
      panel.searchFiltersValid = false;
      panel.availableFilters = [];
      panel.filterRegistry = {};
      var newPanel = trimFilters ? Sefaria.util.clone(panel) : extend(Sefaria.util.clone(panel), savedAttributes);
      extend(panel, savedAttributes);
      return newPanel;
    } else {
      return Sefaria.util.clone(panel);
    }
  },
  makeHistoryState: function makeHistoryState() {
    // Returns an object with state, title and url params for the current state
    var histories = [];
    // When the header has a panel open, only look at its content for history
    var headerPanel = this.state.header.menuOpen || !this.state.panels.length && this.state.header.mode === "Header";
    var panels = headerPanel ? [this.state.header] : this.state.panels;
    var states = [];
    for (var i = 0; i < panels.length; i++) {
      // Walk through each panel, create a history object as though for this panel alone
      states[i] = this.clonePanel(panels[i], true);
      if (!states[i]) {
        debugger;
      }
      var state = states[i];
      var hist = { url: "" };

      if (state.menuOpen) {
        switch (state.menuOpen) {
          case "home":
            hist.title = "Sefaria: a Living Library of Jewish Texts Online";
            hist.url = "";
            hist.mode = "home";
            break;
          case "navigation":
            var cats = state.navigationCategories ? state.navigationCategories.join("/") : "";
            hist.title = cats ? state.navigationCategories.join(", ") + " | Sefaria" : "Texts | Sefaria";
            hist.url = "texts" + (cats ? "/" + cats : "");
            hist.mode = "navigation";
            break;
          case "text toc":
            var ref = state.refs.slice(-1)[0];
            var bookTitle = ref ? Sefaria.parseRef(ref).book : "404";
            hist.title = bookTitle + " | Sefaria";
            hist.url = bookTitle.replace(/ /g, "_");
            hist.mode = "text toc";
            break;
          case "book toc":
            var bookTitle = state.bookRef;
            hist.title = bookTitle + " | Sefaria";
            hist.url = bookTitle.replace(/ /g, "_");
            hist.mode = "book toc";
            break;
          case "search":
            var query = state.searchQuery ? encodeURIComponent(state.searchQuery) : "";
            hist.title = state.searchQuery ? state.searchQuery + " | " : "";
            hist.title += "Sefaria Search";
            hist.url = "search" + (state.searchQuery ? "&q=" + query + (!!state.appliedSearchFilters && !!state.appliedSearchFilters.length ? "&filters=" + state.appliedSearchFilters.join("|") : "") : "");
            hist.mode = "search";
            break;
          case "sheets":
            if (states[i].navigationSheetTag) {
              if (states[i].navigationSheetTag == "My Sheets") {
                hist.url = "sheets/private";
                hist.title = "My Sheets | Sefaria Source Sheets";
                hist.mode = "sheets tag";
              } else {
                hist.url = "sheets/tags/" + state.navigationSheetTag;
                hist.title = state.navigationSheetTag + " | Sefaria Source Sheets";
                hist.mode = "sheets tag";
              }
            } else {
              hist.url = "sheets";
              hist.title = "Sefaria Source Sheets";
              hist.mode = "sheets";
            }
            break;
          case "account":
            hist.title = "Sefaria About";
            hist.url = "account";
            hist.mode = "account";
            break;
          case "notifications":
            hist.title = "Sefaria Notifcations";
            hist.url = "notifications";
            hist.mode = "notifications";
            break;
        }
      } else if (state.mode === "Text") {
        hist.title = state.refs.slice(-1)[0];
        hist.url = Sefaria.normRef(hist.title);
        hist.version = state.version;
        hist.versionLanguage = state.versionLanguage;
        hist.mode = "Text";
      } else if (state.mode === "Connections") {
        var ref = state.refs.slice(-1)[0];
        hist.sources = state.filter.length ? state.filter.join("+") : "all";
        hist.title = ref + " with " + (hist.sources === "all" ? "Connections" : hist.sources);
        hist.url = Sefaria.normRef(ref); // + "?with=" + sources;
        hist.mode = "Connections";
      } else if (state.mode === "TextAndConnections") {
        var ref = state.highlightedRefs.slice(-1)[0];
        hist.sources = state.filter.length ? state.filter[0] : "all";
        hist.title = ref + " with " + (hist.sources === "all" ? "Connections" : hist.sources);
        hist.url = Sefaria.normRef(ref); // + "?with=" + sources;
        hist.version = state.version;
        hist.versionLanguage = state.versionLanguage;
        hist.mode = "TextAndConnections";
      } else if (state.mode === "Header") {
        hist.title = document.title;
        hist.url = window.location.pathname.slice(1);
        if (window.location.search != "") {
          hist.url += window.location.search;
        }
        hist.mode = "Header";
      }
      if (state.mode !== "Header") {
        var lang = state.settings.language.substring(0, 2);
        hist.url += "&lang=" + lang;
      }
      histories.push(hist);
    }
    if (!histories.length) {
      debugger;
    }

    // Now merge all history objects into one
    var title = histories.length ? histories[0].title : "Sefaria";

    var url = "/" + (histories.length ? histories[0].url : "");
    if (histories[0] && histories[0].versionLanguage && histories[0].version) {
      url += "/" + histories[0].versionLanguage + "/" + histories[0].version.replace(/\s/g, "_");
    }
    if (histories[0].mode === "TextAndConnections") {
      url += "&with=" + histories[0].sources;
    }

    hist = headerPanel ? { state: { header: states[0] }, url: url, title: title } : { state: { panels: states }, url: url, title: title };

    for (var i = 1; i < histories.length; i++) {
      if (histories[i - 1].mode === "Text" && histories[i].mode === "Connections") {
        if (i == 1) {
          // short form for two panels text+commentary - e.g., /Genesis.1?with=Rashi
          hist.url = "/" + histories[1].url; // Rewrite the URL
          if (histories[0].versionLanguage && histories[0].version) {
            hist.url += "/" + histories[0].versionLanguage + "/" + histories[0].version.replace(/\s/g, "_");
          }
          hist.url += "&with=" + histories[1].sources;
          hist.title = histories[1].title;
        } else {
          var replacer = "&p" + i + "=";
          hist.url = hist.url.replace(RegExp(replacer + ".*"), "");
          hist.url += replacer + histories[i].url + "&w" + i + "=" + histories[i].sources; //.replace("with=", "with" + i + "=").replace("?", "&");
          hist.title += " & " + histories[i].title; // TODO this doesn't trim title properly
        }
      } else {
          var next = "&p=" + histories[i].url;
          next = next.replace("?", "&").replace(/=/g, i + 1 + "=");
          hist.url += next;
          if (histories[i].versionLanguage && histories[i].version) {
            hist.url += "&l" + (i + 1) + "=" + histories[i].versionLanguage + "&v" + (i + 1) + "=" + histories[i].version.replace(/\s/g, "_");
          }
          hist.title += " & " + histories[i].title;
        }
    }
    // Replace the first only & with a ?
    hist.url = hist.url.replace(/&/, "?");

    return hist;
  },
  updateHistoryState: function updateHistoryState(replace) {
    if (!this.shouldHistoryUpdate()) {
      return;
    }
    var hist = this.makeHistoryState();
    if (replace) {
      history.replaceState(hist.state, hist.title, hist.url);
      console.log("Replace History - " + hist.url);
      //console.log(hist);
    } else {
        if (window.location.pathname + window.location.search == hist.url) {
          return;
        } // Never push history with the same URL
        history.pushState(hist.state, hist.title, hist.url);
        console.log("Push History - " + hist.url);
        //console.log(hist);
      }

    $("title").html(hist.title);
    if (Sefaria.site) {
      Sefaria.site.track.pageview(hist.url);
    }
    this.replaceHistory = false;
  },
  makePanelState: function makePanelState(state) {
    // Return a full representation of a single panel's state, given a partial representation in `state`
    var panel = {
      mode: state.mode, // "Text", "TextAndConnections", "Connections"
      refs: state.refs || [], // array of ref strings
      filter: state.filter || [],
      connectionsMode: state.connectionsMode || "Connections",
      version: state.version || null,
      versionLanguage: state.versionLanguage || null,
      highlightedRefs: state.highlightedRefs || [],
      recentFilters: state.filter || [],
      menuOpen: state.menuOpen || null, // "navigation", "text toc", "display", "search", "sheets", "home", "book toc"
      navigationCategories: state.navigationCategories || [],
      navigationSheetTag: state.sheetsTag || null,
      searchQuery: state.searchQuery || null,
      appliedSearchFilters: state.appliedSearchFilters || [],
      searchFiltersValid: state.searchFiltersValid || false,
      availableFilters: state.availableFilters || [],
      filterRegistry: state.filterRegistry || {},
      orphanSearchFilters: state.orphanSearchFilters || [],
      bookRef: state.bookRef || null,
      settings: state.settings ? Sefaria.util.clone(state.settings) : Sefaria.util.clone(this.getDefaultPanelSettings()),
      displaySettingsOpen: false,
      tagSort: state.tagSort || "count",
      mySheetSort: state.mySheetSort || "date"

    };
    if (this.state && panel.refs.length && !panel.version) {
      var oRef = Sefaria.ref(panel.refs[0]);
      if (oRef) {
        var lang = panel.versionLanguage || (panel.settings.language == "hebrew" ? "he" : "en");
        panel.version = this.getCachedVersion(oRef.indexTitle, lang);
        if (panel.version) {
          panel.versionLanguage = lang;
        }
      }
    }
    return panel;
  },
  getDefaultPanelSettings: function getDefaultPanelSettings() {
    if (this.state && this.state.defaultPanelSettings) {
      return this.state.defaultPanelSettings;
    } else if (this.props.initialSettings) {
      return this.props.initialSettings;
    } else {
      return {
        language: "bilingual",
        layoutDefault: "segmented",
        layoutTalmud: "continuous",
        layoutTanakh: "segmented",
        color: "light",
        fontSize: 62.5
      };
    }
  },
  setContainerMode: function setContainerMode() {
    // Applies CSS classes to the React container so that S2 can function as a header only on top of another page.
    // todo: because headerMode CSS was messing stuff up, header links are reloads in headerMode.  So - not sure if this method is still needed.
    if (this.props.headerMode) {
      if (this.state.header.menuOpen || this.state.panels.length) {
        $("#s2").removeClass("headerOnly");
        $("body").css({ overflow: "hidden" });
      } else {
        $("#s2").addClass("headerOnly");
        $("body").css({ overflow: "auto" });
      }
    }
  },
  setPanelCap: function setPanelCap() {
    // In multi panel mode, set the maximum number of visible panels depending on the window width.
    var MIN_PANEL_WIDTH = 360;
    var width = $(window).width();
    var panelCap = Math.floor(width / MIN_PANEL_WIDTH);
    this.setState({ panelCap: panelCap });
  },
  handleNavigationClick: function handleNavigationClick(ref, version, versionLanguage, options) {
    this.saveOpenPanelsToRecentlyViewed();
    this.openPanel(ref, version, versionLanguage, options);
  },
  handleSegmentClick: function handleSegmentClick(n, ref) {
    // Handle a click on a text segment `ref` in from panel in position `n`
    // Update or add panel after this one to be a TextList
    this.setTextListHighlight(n, [ref]);
    this.openTextListAt(n + 1, [ref]);
  },
  handleCitationClick: function handleCitationClick(n, citationRef, textRef) {
    // Handle clicking on the citation `citationRef` which was found inside of `textRef` in panel `n`.
    this.openPanelAt(n, citationRef);
    this.setTextListHighlight(n, [textRef]);
  },
  handleRecentClick: function handleRecentClick(pos, ref, version, versionLanguage) {
    // Click on an item in your Recently Viewed
    if (this.props.multiPanel) {
      this.openPanel(ref, version, versionLanguage);
    } else {
      this.handleNavigationClick(ref, version, versionLanguage);
    }
  },
  handleCompareSearchClick: function handleCompareSearchClick(n, ref, version, versionLanguage, options) {
    // Handle clicking a search result in a compare panel, so that clicks don't clobber open panels
    // todo: support options.highlight, passed up from SearchTextResult.handleResultClick()
    this.saveOpenPanelsToRecentlyViewed();
    this.replacePanel(n, ref, version, versionLanguage);
  },
  updateQueryInHeader: function updateQueryInHeader(query) {
    var updates = { searchQuery: query, searchFiltersValid: false };
    this.setHeaderState(updates);
  },
  updateQueryInPanel: function updateQueryInPanel(query) {
    var updates = { searchQuery: query, searchFiltersValid: false };
    this.setPanelState(0, updates);
  },
  updateAvailableFiltersInHeader: function updateAvailableFiltersInHeader(availableFilters, registry, orphans) {
    this.setHeaderState({
      availableFilters: availableFilters,
      filterRegistry: registry,
      orphanSearchFilters: orphans,
      searchFiltersValid: true
    });
  },
  updateAvailableFiltersInPanel: function updateAvailableFiltersInPanel(availableFilters, registry, orphans) {
    this.setPanelState(0, {
      availableFilters: availableFilters,
      filterRegistry: registry,
      orphanSearchFilters: orphans,
      searchFiltersValid: true
    });
  },
  updateSearchFilterInHeader: function updateSearchFilterInHeader(filterNode) {
    if (filterNode.isUnselected()) {
      filterNode.setSelected(true);
    } else {
      filterNode.setUnselected(true);
    }
    this.setHeaderState({
      availableFilters: this.state.header.availableFilters,
      appliedSearchFilters: this.getAppliedSearchFilters(this.state.header.availableFilters)
    });
  },
  updateSearchFilterInPanel: function updateSearchFilterInPanel(filterNode) {
    if (filterNode.isUnselected()) {
      filterNode.setSelected(true);
    } else {
      filterNode.setUnselected(true);
    }
    this.setPanelState(0, {
      availableFilters: this.state.panels[0].availableFilters,
      appliedSearchFilters: this.getAppliedSearchFilters(this.state.panels[0].availableFilters)
    });
  },
  getAppliedSearchFilters: function getAppliedSearchFilters(availableFilters) {
    var results = [];
    //results = results.concat(this.orphanFilters);
    for (var i = 0; i < availableFilters.length; i++) {
      results = results.concat(availableFilters[i].getAppliedFilters());
    }
    return results;
  },
  setPanelState: function setPanelState(n, state, replaceHistory) {
    this.replaceHistory = Boolean(replaceHistory);
    //console.log(`setPanel State ${n}, replace: ` + this.replaceHistory);
    //console.log(state)

    // When the driving panel changes language, carry that to the dependent panel
    var langChange = state.settings && state.settings.language !== this.state.panels[n].settings.language;
    var next = this.state.panels[n + 1];
    if (langChange && next && next.mode === "Connections") {
      next.settings.language = state.settings.language;
    }

    this.state.panels[n] = extend(this.state.panels[n], state);
    this.setState({ panels: this.state.panels });
  },
  selectVersion: function selectVersion(n, versionName, versionLanguage) {
    // Set the version for panel `n`.
    var panel = this.state.panels[n];
    if (versionName && versionLanguage) {
      panel.version = versionName;
      panel.versionLanguage = versionLanguage;
      panel.settings.language = panel.versionLanguage == "he" ? "hebrew" : "english";

      var oRef = Sefaria.ref(panel.refs[0]);
      this.setCachedVersion(oRef.indexTitle, panel.versionLanguage, panel.version);
    } else {
      panel.version = null;
      panel.versionLanguage = null;
    }
    this.setState({ panels: this.state.panels });
  },
  // this.state.defaultVersion is a depth 2 dictionary - keyed: bookname, language
  getCachedVersion: function getCachedVersion(indexTitle, language) {
    if (!indexTitle || !this.state.defaultVersions[indexTitle]) {
      return null;
    }
    return language ? this.state.defaultVersions[indexTitle][language] || null : this.state.defaultVersions[indexTitle];
  },
  setCachedVersion: function setCachedVersion(indexTitle, language, versionTitle) {
    this.state.defaultVersions[indexTitle] = this.state.defaultVersions[indexTitle] || {};
    this.state.defaultVersions[indexTitle][language] = versionTitle; // Does this need a setState?  I think not.
  },
  setHeaderState: function setHeaderState(state, replaceHistory) {
    this.state.header = extend(this.state.header, state);
    this.setState({ header: this.state.header });
  },
  setDefaultOption: function setDefaultOption(option, value) {
    if (value !== this.state.defaultPanelSettings[option]) {
      this.state.defaultPanelSettings[option] = value;
      this.setState(this.state);
    }
  },
  openPanel: function openPanel(ref, version, versionLanguage, options) {
    // Opens a text panel, replacing all panels currently open.

    //todo: support options.highlight, passed up from SearchTextResult.handleResultClick()
    var highlight;
    if (options) {
      highlight = options.highlight;
    }

    // If book level, Open book toc
    var index = Sefaria.index(ref); // Do we have to worry about normalization, as in Header.submitSearch()?
    var panel;
    if (index) {
      panel = this.makePanelState({ "menuOpen": "book toc", "bookRef": index.title });
    } else {
      panel = this.makePanelState({ refs: [ref], version: version, versionLanguage: versionLanguage, mode: "Text" });
    }

    this.setState({
      panels: [panel],
      header: { menuOpen: null }
    });
  },
  openPanelAt: function openPanelAt(n, ref, version, versionLanguage) {
    // Open a new panel after `n` with the new ref

    // If book level, Open book toc
    var index = Sefaria.index(ref); // Do we have to worry about normalization, as in Header.subimtSearch()?
    var panel;
    if (index) {
      panel = this.makePanelState({ "menuOpen": "book toc", "bookRef": index.title });
    } else {
      panel = this.makePanelState({ refs: [ref], version: version, versionLanguage: versionLanguage, mode: "Text" });
    }

    this.state.panels.splice(n + 1, 0, panel);
    this.setState({ panels: this.state.panels, header: { menuOpen: null } });
  },
  openPanelAtEnd: function openPanelAtEnd(ref, version, versionLanguage) {
    this.openPanelAt(this.state.panels.length + 1, ref, version, versionLanguage);
  },
  openTextListAt: function openTextListAt(n, refs) {
    // Open a connections panel at position `n` for `refs`
    // Replace panel there if already a connections panel, otherwise splice new panel into position `n`
    // `refs` is an array of ref strings
    var panel = this.state.panels[n] || {};
    var parentPanel = n >= 1 && this.state.panels[n - 1].mode == 'Text' ? this.state.panels[n - 1] : null;

    if (panel.mode !== "Connections") {
      // No connctions panel is open yet, splice in a new one
      this.state.panels.splice(n, 0, {});
      panel = this.state.panels[n];
      panel.filter = [];
    }
    panel.refs = refs;
    panel.menuOpen = null;
    panel.mode = panel.mode || "Connections";
    if (parentPanel) {
      panel.version = parentPanel.version;
      panel.versionLanguage = parentPanel.versionLanguage;
    }
    this.state.panels[n] = this.makePanelState(panel);
    this.setState({ panels: this.state.panels });
  },
  setTextListHighlight: function setTextListHighlight(n, refs) {
    // Set the textListHighlight for panel `n` to `refs`
    refs = typeof refs === "string" ? [refs] : refs;
    this.state.panels[n].highlightedRefs = refs;
    this.setState({ panels: this.state.panels });

    // If a connections panel is opened after n, update its refs as well.
    var next = this.state.panels[n + 1];
    if (next && next.mode === "Connections" && !next.menuOpen) {
      this.openTextListAt(n + 1, refs);
    }
  },
  setSelectedWords: function setSelectedWords(n, words) {
    //console.log(this.state.panels[n].refs);
    words = typeof words !== "undefined" && words.length ? words : "";
    var next = this.state.panels[n + 1];
    if (next && !next.menuOpen) {
      this.state.panels[n + 1].selectedWords = words;
      this.setState({ panels: this.state.panels });
    }
  },
  setUnreadNotificationsCount: function setUnreadNotificationsCount(n) {
    Sefaria.notificationCount = n;
    this.forceUpdate();
  },
  replacePanel: function replacePanel(n, ref, version, versionLanguage) {
    // Opens a text in in place of the panel currently open at `n`.
    this.state.panels[n] = this.makePanelState({ refs: [ref], version: version, versionLanguage: versionLanguage, mode: "Text" });
    this.setState({ panels: this.state.panels });
  },
  openComparePanel: function openComparePanel(n) {
    var comparePanel = this.makePanelState({
      menuOpen: "compare"
    });
    this.state.panels[n] = comparePanel;
    this.setState({ panels: this.state.panels });
  },
  closePanel: function closePanel(n) {
    // Removes the panel in position `n`, as well as connections panel in position `n+1` if it exists.
    this.saveRecentlyViewed(this.state.panels[n], n);
    if (this.state.panels.length == 1 && n == 0) {
      this.state.panels = [];
    } else {
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
    var state = { panels: this.state.panels };
    if (state.panels.length == 0) {
      this.showLibrary();
      console.log("closed last panel, show library");
    }
    console.log("close panel, new state:");
    console.log(state);
    this.setState(state);
  },
  showLibrary: function showLibrary() {
    if (this.props.multiPanel) {
      this.setState({ header: this.makePanelState({ menuOpen: "navigation" }) });
    } else {
      if (this.state.panels.length) {
        this.state.panels[0].menuOpen = "navigation";
      } else {
        this.state.panels[0] = this.makePanelState({ menuOpen: "navigation" });
      }
      this.setState({ panels: this.state.panels });
    }
  },
  showSearch: function showSearch(query) {
    var updates = { menuOpen: "search", searchQuery: query, searchFiltersValid: false };
    if (this.props.multiPanel) {
      this.setHeaderState(updates);
    } else {
      this.setPanelState(0, updates);
    }
  },
  saveRecentlyViewed: function saveRecentlyViewed(panel, n) {
    if (panel.mode == "Connections" || !panel.refs.length) {
      return;
    }
    var ref = panel.refs[0];
    var oRef = Sefaria.ref(ref);
    var json = cookie("recentlyViewed");
    var recent = json ? JSON.parse(json) : [];
    recent = recent.filter(function (item) {
      return item.ref !== ref; // Remove this item if it's in the list already
    });
    var cookieData = {
      ref: ref,
      heRef: oRef.heRef,
      book: oRef.indexTitle,
      version: panel.version,
      versionLanguage: panel.versionLanguage,
      position: n
    };
    recent.splice(0, 0, cookieData);
    recent = recent.slice(0, 3);
    cookie("recentlyViewed", JSON.stringify(recent), { path: "/" });
  },
  saveOpenPanelsToRecentlyViewed: function saveOpenPanelsToRecentlyViewed() {
    for (var i = this.state.panels.length - 1; i >= 0; i--) {
      this.saveRecentlyViewed(this.state.panels[i], i);
    }
  },
  render: function render() {
    // Only look at the last N panels if we're above panelCap
    var panelStates = this.state.panels.slice(-this.state.panelCap);
    if (panelStates.length && panelStates[0].mode === "Connections") {
      panelStates = panelStates.slice(1); // Don't leave an orphaned connections panel at the beginning
    }

    var evenWidth = 100.0 / panelStates.length;
    if (panelStates.length == 2 && panelStates[0].mode == "Text" && panelStates[1].mode == "Connections") {
      var widths = [60.0, 40.0];
    } else {
      var widths = panelStates.map(function () {
        return evenWidth;
      });
    }
    var header = this.props.multiPanel || this.state.panels.length == 0 ? React.createElement(Header, {
      initialState: this.state.header,
      interfaceLang: this.props.interfaceLang,
      setCentralState: this.setHeaderState,
      onRefClick: this.handleNavigationClick,
      onRecentClick: this.handleRecentClick,
      setDefaultOption: this.setDefaultOption,
      showLibrary: this.showLibrary,
      showSearch: this.showSearch,
      onQueryChange: this.updateQueryInHeader,
      updateSearchFilter: this.updateSearchFilterInHeader,
      registerAvailableFilters: this.updateAvailableFiltersInHeader,
      setUnreadNotificationsCount: this.setUnreadNotificationsCount,
      headerMode: this.props.headerMode,
      panelsOpen: panelStates.length }) : null;

    var panels = [];
    for (var i = 0; i < panelStates.length; i++) {
      var panel = this.clonePanel(panelStates[i]);
      var offset = widths.reduce(function (prev, curr, index, arr) {
        return index < i ? prev + curr : prev;
      }, 0);
      var width = widths[i];
      var style = this.state.layoutOrientation == "ltr" ? { width: width + "%", left: offset + "%" } : { width: width + "%", right: offset + "%" };
      var onSegmentClick = this.props.multiPanel ? this.handleSegmentClick.bind(null, i) : null;
      var onCitationClick = this.handleCitationClick.bind(null, i);
      var onSearchResultClick = this.props.multiPanel ? this.handleCompareSearchClick.bind(null, i) : this.handleNavigationClick;
      var onTextListClick = null; // this.openPanelAt.bind(null, i);
      var onOpenConnectionsClick = this.openTextListAt.bind(null, i + 1);
      var setTextListHightlight = this.setTextListHighlight.bind(null, i);
      var setSelectedWords = this.setSelectedWords.bind(null, i);
      var openComparePanel = this.openComparePanel.bind(null, i);
      var closePanel = this.closePanel.bind(null, i);
      var setPanelState = this.setPanelState.bind(null, i);
      var selectVersion = this.selectVersion.bind(null, i);

      var ref = panel.refs && panel.refs.length ? panel.refs[0] : null;
      var oref = ref ? Sefaria.parseRef(ref) : null;
      var title = oref && oref.book ? oref.book : 0;
      // Keys must be constant as text scrolls, but changing as new panels open in new positions
      // Use a combination of the panel number and text title
      var key = i + title;
      var classes = classNames({ readerPanelBox: 1, sidebar: panel.mode == "Connections" });
      panels.push(React.createElement(
        'div',
        { className: classes, style: style, key: key },
        React.createElement(ReaderPanel, {
          initialState: panel,
          interfaceLang: this.props.interfaceLang,
          setCentralState: setPanelState,
          multiPanel: this.props.multiPanel,
          onSegmentClick: onSegmentClick,
          onCitationClick: onCitationClick,
          onTextListClick: onTextListClick,
          onSearchResultClick: onSearchResultClick,
          onNavigationClick: this.handleNavigationClick,
          onRecentClick: this.handleRecentClick,
          onOpenConnectionsClick: onOpenConnectionsClick,
          openComparePanel: openComparePanel,
          setTextListHightlight: setTextListHightlight,
          setSelectedWords: setSelectedWords,
          selectVersion: selectVersion,
          setDefaultOption: this.setDefaultOption,
          onQueryChange: this.updateQueryInPanel,
          updateSearchFilter: this.updateSearchFilterInPanel,
          registerAvailableFilters: this.updateAvailableFiltersInPanel,
          setUnreadNotificationsCount: this.setUnreadNotificationsCount,
          closePanel: closePanel,
          panelsOpen: panelStates.length,
          masterPanelLanguage: panel.mode === "Connections" ? panelStates[i - 1].settings.language : panel.settings.language,
          layoutWidth: width })
      ));
    }

    var classes = classNames({ readerApp: 1, multiPanel: this.props.multiPanel, singlePanel: !this.props.multiPanel });
    return React.createElement(
      'div',
      { className: classes },
      header,
      panels
    );
  }
});

var Header = React.createClass({
  displayName: 'Header',

  propTypes: {
    initialState: React.PropTypes.object.isRequired,
    headerMode: React.PropTypes.bool,
    setCentralState: React.PropTypes.func,
    interfaceLang: React.PropTypes.string,
    onRefClick: React.PropTypes.func,
    onRecentClick: React.PropTypes.func,
    showLibrary: React.PropTypes.func,
    showSearch: React.PropTypes.func,
    setDefaultOption: React.PropTypes.func,
    onQueryChange: React.PropTypes.func,
    updateSearchFilter: React.PropTypes.func,
    registerAvailableFilters: React.PropTypes.func,
    setUnreadNotificationsCount: React.PropTypes.func,
    panelsOpen: React.PropTypes.number
  },
  getInitialState: function getInitialState() {
    return this.props.initialState;
  },
  componentDidMount: function componentDidMount() {
    this.initAutocomplete();
  },
  componentWillReceiveProps: function componentWillReceiveProps(nextProps) {
    if (nextProps.initialState) {
      this.setState(nextProps.initialState);
    }
  },
  _searchOverridePre: 'Search for: "',
  _searchOverridePost: '"',
  _searchOverrideRegex: function _searchOverrideRegex() {
    return RegExp('^' + RegExp.escape(this._searchOverridePre) + '(.*)' + RegExp.escape(this._searchOverridePost));
  },
  initAutocomplete: function initAutocomplete() {
    $.widget("custom.sefaria_autocomplete", $.ui.autocomplete, {
      _renderItem: function (ul, item) {
        var override = item.label.match(this._searchOverrideRegex());
        return $("<li></li>").data("item.autocomplete", item).toggleClass("search-override", !!override).append($("<a></a>").text(item.label)).appendTo(ul);
      }.bind(this)
    });
    $(ReactDOM.findDOMNode(this)).find("input.search").sefaria_autocomplete({
      position: { my: "left-12 top+14", at: "left bottom" },
      select: function (event, ui) {
        $(ReactDOM.findDOMNode(this)).find("input.search").val(ui.item.value); //This will disappear when the next line executes, but the eye can sometimes catch it.
        this.submitSearch(ui.item.value);
        return false;
      }.bind(this),
      source: function (request, response) {
        // Commented out code will only put the "Search for: " in the list if the search is an exact match.
        //var exact = false;
        var matches = $.map(Sefaria.books, function (tag) {
          if (tag.toUpperCase().indexOf(request.term.toUpperCase()) === 0) {
            //if (tag.toUpperCase() == request.term.toUpperCase()) {
            //  exact = true;
            //}
            return tag;
          }
        });
        var resp = matches.slice(0, 16); // limits return to 16 items
        //if (exact) {
        if (resp.length > 0) {
          resp.push('' + this._searchOverridePre + request.term + this._searchOverridePost);
        }
        //}
        response(resp);
      }.bind(this)
    });
  },
  showDesktop: function showDesktop() {
    if (this.props.panelsOpen == 0) {
      var json = cookie("recentlyViewed");
      var recentlyViewed = json ? JSON.parse(json) : null;
      if (recentlyViewed && recentlyViewed.length) {
        this.handleRefClick(recentlyViewed[0].ref, recentlyViewed[0].version, recentlyViewed[0].versionLanguage);
      }
    }
    this.props.setCentralState({ menuOpen: null });
    this.clearSearchBox();
  },
  showLibrary: function showLibrary() {
    this.props.showLibrary();
    this.clearSearchBox();
  },
  showSearch: function showSearch(query) {
    if (typeof sjs !== "undefined") {
      query = encodeURIComponent(query);
      window.location = '/search?q=' + query;
      return;
    }
    this.props.showSearch(query);
    $(ReactDOM.findDOMNode(this)).find("input.search").sefaria_autocomplete("close");
  },
  showAccount: function showAccount() {
    if (typeof sjs !== "undefined") {
      window.location = "/account";
      return;
    }
    this.props.setCentralState({ menuOpen: "account" });
    this.clearSearchBox();
  },
  showNotifications: function showNotifications() {
    if (typeof sjs !== "undefined") {
      window.location = "/notifications";
      return;
    }
    this.props.setCentralState({ menuOpen: "notifications" });
    this.clearSearchBox();
  },
  showTestMessage: function showTestMessage() {
    this.props.setCentralState({ showTestMessage: true });
  },
  hideTestMessage: function hideTestMessage() {
    this.props.setCentralState({ showTestMessage: false });
  },
  submitSearch: function submitSearch(query, skipNormalization) {
    var override = query.match(this._searchOverrideRegex());
    if (override) {
      this.showSearch(override[1]);
      return;
    }

    if (query in Sefaria.booksDict) {
      var index = Sefaria.index(query);
      if (!index && !skipNormalization) {
        Sefaria.normalizeTitle(query, function (title) {
          this.submitSearch(title, true);
        }.bind(this));
        return;
      }
    }
    if (Sefaria.isRef(query)) {
      this.handleRefClick(query);
      if (Sefaria.site) {
        Sefaria.site.track.ui("Nav Query");
      }
      if (this.props.headerMode) {
        return;
      }
      this.showDesktop();
    } else {
      this.showSearch(query);
    }
  },
  clearSearchBox: function clearSearchBox() {
    $(ReactDOM.findDOMNode(this)).find("input.search").val("").sefaria_autocomplete("close");
  },
  handleLibraryClick: function handleLibraryClick(e) {
    e.preventDefault();
    if (typeof sjs !== "undefined") {
      window.location = "/texts";
      return;
    }
    if (this.state.menuOpen === "home") {
      return;
    } else if (this.state.menuOpen === "navigation" && this.state.navigationCategories.length == 0) {
      this.showDesktop();
    } else {
      this.showLibrary();
    }
  },
  handleRefClick: function handleRefClick(ref, version, versionLanguage) {
    if (this.props.headerMode) {
      window.location.assign("/" + ref);
      return;
    }
    this.props.onRefClick(ref, version, versionLanguage);
  },
  handleSearchKeyUp: function handleSearchKeyUp(event) {
    if (event.keyCode === 13) {
      var query = $(event.target).val();
      if (query) {
        this.submitSearch(query);
      }
    }
  },
  handleSearchButtonClick: function handleSearchButtonClick(event) {
    var query = $(ReactDOM.findDOMNode(this)).find(".search").val();
    if (query) {
      this.submitSearch(query);
    }
  },
  render: function render() {
    var viewContent = this.state.menuOpen ? React.createElement(ReaderPanel, {
      initialState: this.state,
      interfaceLang: this.props.interfaceLang,
      setCentralState: this.props.setCentralState,
      multiPanel: true,
      onNavTextClick: this.props.onRefClick,
      onSearchResultClick: this.props.onRefClick,
      onRecentClick: this.props.onRecentClick,
      setDefaultLanguage: this.props.setDefaultLanguage,
      onQueryChange: this.props.onQueryChange,
      updateSearchFilter: this.props.updateSearchFilter,
      registerAvailableFilters: this.props.registerAvailableFilters,
      setUnreadNotificationsCount: this.props.setUnreadNotificationsCount,
      hideNavHeader: true }) : null;

    var notificationCount = Sefaria.notificationCount || 0;
    var notifcationsClasses = classNames({ notifications: 1, unread: notificationCount > 0 });
    var nextParam = "?next=" + Sefaria.util.currentPath();
    var loggedInLinks = React.createElement(
      'div',
      { className: 'accountLinks' },
      React.createElement(
        'div',
        { className: 'account', onClick: this.showAccount },
        React.createElement('img', { src: '/static/img/user-64.png' })
      ),
      React.createElement(
        'div',
        { className: notifcationsClasses, onClick: this.showNotifications },
        notificationCount
      )
    );
    var loggedOutLinks = React.createElement(
      'div',
      { className: 'accountLinks' },
      React.createElement(
        'a',
        { className: 'login', href: "/register" + nextParam },
        React.createElement(
          'span',
          { className: 'en' },
          'Sign up'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'הירשם'
        )
      ),
      React.createElement(
        'a',
        { className: 'login', href: "/login" + nextParam },
        React.createElement(
          'span',
          { className: 'en' },
          'Log in'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'כניסה'
        )
      )
    );

    return React.createElement(
      'div',
      { className: 'header' },
      React.createElement(
        'div',
        { className: 'headerInner' },
        React.createElement(
          'div',
          { className: 'left' },
          React.createElement(
            'a',
            { href: '/texts' },
            React.createElement(
              'div',
              { className: 'library', onClick: this.handleLibraryClick },
              React.createElement('i', { className: 'fa fa-bars' })
            )
          )
        ),
        React.createElement(
          'div',
          { className: 'right' },
          React.createElement(
            'div',
            { className: 'testWarning', onClick: this.showTestMessage },
            'You are testing the New Sefaria'
          ),
          Sefaria.loggedIn ? loggedInLinks : loggedOutLinks
        ),
        React.createElement(
          'span',
          { className: 'searchBox' },
          React.createElement(ReaderNavigationMenuSearchButton, { onClick: this.handleSearchButtonClick }),
          React.createElement('input', { className: 'search', placeholder: 'Search', onKeyUp: this.handleSearchKeyUp })
        ),
        React.createElement(
          'a',
          { className: 'home', href: '/?home' },
          React.createElement('img', { src: '/static/img/sefaria.svg' })
        )
      ),
      viewContent ? React.createElement(
        'div',
        { className: 'headerNavContent' },
        viewContent
      ) : null,
      this.state.showTestMessage ? React.createElement(TestMessage, { hide: this.hideTestMessage }) : null
    );
  }
});

var ReaderPanel = React.createClass({
  displayName: 'ReaderPanel',

  propTypes: {
    initialRefs: React.PropTypes.array,
    initialMode: React.PropTypes.string,
    initialConnectionsMode: React.PropTypes.string,
    initialVersion: React.PropTypes.string,
    initialVersionLanguage: React.PropTypes.string,
    initialFilter: React.PropTypes.array,
    initialHighlightedRefs: React.PropTypes.array,
    initialMenu: React.PropTypes.string,
    initialQuery: React.PropTypes.string,
    initialAppliedSearchFilters: React.PropTypes.array,
    initialSheetsTag: React.PropTypes.string,
    initialState: React.PropTypes.object, // if present, trumps all props above
    interfaceLang: React.PropTypes.string,
    setCentralState: React.PropTypes.func,
    onSegmentClick: React.PropTypes.func,
    onCitationClick: React.PropTypes.func,
    onTextListClick: React.PropTypes.func,
    onNavTextClick: React.PropTypes.func,
    onRecentClick: React.PropTypes.func,
    onSearchResultClick: React.PropTypes.func,
    onUpdate: React.PropTypes.func,
    closePanel: React.PropTypes.func,
    closeMenus: React.PropTypes.func,
    setDefaultLanguage: React.PropTypes.func,
    selectVersion: React.PropTypes.func,
    onQueryChange: React.PropTypes.func,
    updateSearchFilter: React.PropTypes.func,
    registerAvailableFilters: React.PropTypes.func,
    openComparePanel: React.PropTypes.func,
    setUnreadNotificationsCount: React.PropTypes.func,
    highlightedRefs: React.PropTypes.array,
    hideNavHeader: React.PropTypes.bool,
    multiPanel: React.PropTypes.bool,
    masterPanelLanguage: React.PropTypes.string,
    panelsOpen: React.PropTypes.number,
    layoutWidth: React.PropTypes.number,
    setTextListHightlight: React.PropTypes.func,
    setSelectedWords: React.PropTypes.func
  },
  getInitialState: function getInitialState() {
    // When this component is managed by a parent, all it takes is initialState
    if (this.props.initialState) {
      var state = this.clonePanel(this.props.initialState);
      return state;
    }

    // When this component is independent and manages itself, it takes individual initial state props, with defaults listed here.
    return {
      refs: this.props.initialRefs || [], // array of ref strings
      bookRef: null,
      mode: this.props.initialMode, // "Text", "TextAndConnections", "Connections"
      connectionsMode: this.props.initialConnectionsMode,
      filter: this.props.initialFilter || [],
      version: this.props.initialVersion,
      versionLanguage: this.props.initialVersionLanguage,
      highlightedRefs: this.props.initialHighlightedRefs || [],
      recentFilters: [],
      settings: this.props.intialState.settings || {
        language: "bilingual",
        layoutDefault: "segmented",
        layoutTalmud: "continuous",
        layoutTanakh: "segmented",
        color: "light",
        fontSize: 62.5
      },
      menuOpen: this.props.initialMenu || null, // "navigation", "book toc", "text toc", "display", "search", "sheets", "home"
      navigationCategories: this.props.initialNavigationCategories || [],
      navigationSheetTag: this.props.initialSheetsTag || null,
      searchQuery: this.props.initialQuery || null,
      appliedSearchFilters: this.props.initialAppliedSearchFilters || [],
      searchFiltersValid: false,
      availableFilters: [],
      filterRegistry: {},
      orphanSearchFilters: [],
      displaySettingsOpen: false,
      tagSort: "count",
      mySheetSort: "date"

    };
  },
  componentDidMount: function componentDidMount() {
    window.addEventListener("resize", this.setWidth);
    this.setWidth();
    this.setHeadroom();
    this.trackPanelOpens();
  },
  componentWillUnmount: function componentWillUnmount() {
    window.removeEventListener("resize", this.setWidth);
  },
  componentWillReceiveProps: function componentWillReceiveProps(nextProps) {
    if (nextProps.initialFilter && !this.props.multiPanel) {
      this.openConnectionsInPanel(nextProps.initialRefs);
    }
    if (nextProps.searchQuery && this.state.menuOpen !== "search") {
      this.openSearch(nextProps.searchQuery);
    }
    if (this.state.menuOpen !== nextProps.initialMenu) {
      this.setState({ menuOpen: nextProps.initialMenu });
    }
    if (nextProps.initialState) {
      this.setState(nextProps.initialState);
    } else {
      this.setState({
        navigationCategories: nextProps.initialNavigationCategories || [],
        navigationSheetTag: nextProps.initialSheetsTag || null
      });
    }
  },
  componentDidUpdate: function componentDidUpdate(prevProps, prevState) {
    this.setHeadroom();
    if (prevState.refs.compare(this.state.refs)) {
      this.trackPanelOpens();
    }
    if (prevProps.layoutWidth !== this.props.layoutWidth) {
      this.setWidth();
    }
    this.replaceHistory = false;
  },
  conditionalSetState: function conditionalSetState(state) {
    // Set state either in the central app or in the local component,
    // depending on whether a setCentralState function was given.
    if (this.props.setCentralState) {
      this.props.setCentralState(state, this.replaceHistory);
      this.replaceHistory = false;
    } else {
      this.setState(state);
    }
  },
  clonePanel: function clonePanel(panel) {
    // Set aside self-referential objects before cloning
    // Todo: Move the multiple instances of this out to a utils file
    if (panel.availableFilters || panel.filterRegistry) {
      var savedAttributes = {
        availableFilters: panel.availableFilters,
        searchFiltersValid: panel.searchFiltersValid,
        filterRegistry: panel.filterRegistry
      };
      panel.availableFilters = panel.searchFiltersValid = panel.filterRegistry = null;
      var newpanel = extend(Sefaria.util.clone(panel), savedAttributes);
      extend(panel, savedAttributes);
      return newpanel;
    } else {
      return Sefaria.util.clone(panel);
    }
  },
  handleBaseSegmentClick: function handleBaseSegmentClick(ref) {
    if (this.state.mode === "TextAndConnections") {
      this.closeConnectionsInPanel();
    } else if (this.state.mode === "Text") {
      if (this.props.multiPanel) {
        this.props.onSegmentClick(ref);
      } else {
        this.openConnectionsInPanel(ref);
      }
    }
  },
  handleCitationClick: function handleCitationClick(citationRef, textRef) {
    if (this.props.multiPanel) {
      this.props.onCitationClick(citationRef, textRef);
    } else {
      this.showBaseText(citationRef);
    }
  },
  handleTextListClick: function handleTextListClick(ref) {
    this.showBaseText(ref);
  },
  setHeadroom: function setHeadroom() {
    if (this.props.multiPanel) {
      return;
    }
    var $node = $(ReactDOM.findDOMNode(this));
    var $header = $node.find(".readerControls");
    if (this.state.mode !== "TextAndConnections") {
      var scroller = $node.find(".textColumn")[0];
      $header.headroom({ scroller: scroller });
    }
  },
  openConnectionsInPanel: function openConnectionsInPanel(ref) {
    var refs = typeof ref == "string" ? [ref] : ref;
    this.replaceHistory = this.state.mode === "TextAndConnections"; // Don't push history for change in Connections focus
    this.conditionalSetState({ highlightedRefs: refs, mode: "TextAndConnections" }, this.replaceHistory);
  },
  closeConnectionsInPanel: function closeConnectionsInPanel() {
    // Return to the original text in the ReaderPanel contents
    this.conditionalSetState({ highlightedRefs: [], mode: "Text" });
  },
  showBaseText: function showBaseText(ref, replaceHistory) {
    // Set the current primary text
    // `replaceHistory` - bool whether to replace browser history rather than push for this change
    if (!ref) {
      return;
    }
    this.replaceHistory = Boolean(replaceHistory);
    this.conditionalSetState({
      mode: "Text",
      refs: [ref],
      filter: [],
      recentFilters: [],
      menuOpen: null
    });
  },
  updateTextColumn: function updateTextColumn(refs) {
    // Change the refs in the current TextColumn, for infinite scroll up/down.
    this.replaceHistory = true;
    this.conditionalSetState({ refs: refs }, this.replaceState);
  },
  setTextListHightlight: function setTextListHightlight(refs) {
    refs = typeof refs === "string" ? [refs] : refs;
    this.replaceHistory = true;
    this.conditionalSetState({ highlightedRefs: refs });
    if (this.props.multiPanel) {
      this.props.setTextListHightlight(refs);
    }
  },
  setSelectedWords: function setSelectedWords(words) {
    words = typeof words !== "undefined" && words.length ? words : "";
    words = words.trim();
    this.replaceHistory = false;
    this.conditionalSetState({ 'selectedWords': words });
    if (this.props.multiPanel) {
      this.props.setSelectedWords(words);
    }
  },
  closeMenus: function closeMenus() {
    var state = {
      // If there's no content to show, return to home
      menuOpen: this.state.refs.slice(-1)[0] ? null : "home",
      // searchQuery: null,
      // appliedSearchFilters: [],
      navigationCategories: null,
      navigationSheetTag: null
    };
    this.conditionalSetState(state);
  },
  openMenu: function openMenu(menu) {
    this.conditionalSetState({
      menuOpen: menu,
      // searchQuery: null,
      // appliedSearchFilters: [],
      navigationCategories: null,
      navigationSheetTag: null
    });
  },
  setNavigationCategories: function setNavigationCategories(categories) {
    this.conditionalSetState({ menuOpen: "navigation", navigationCategories: categories });
  },
  setSheetTag: function setSheetTag(tag) {
    this.conditionalSetState({ navigationSheetTag: tag });
  },
  setFilter: function setFilter(filter, updateRecent) {
    // Sets the current filter for Connected Texts (TextList)
    // If updateRecent is true, include the current setting in the list of recent filters.
    if (updateRecent && filter) {
      if (Sefaria.util.inArray(filter, this.state.recentFilters) !== -1) {
        this.state.recentFilters.toggle(filter);
      }
      this.state.recentFilters = [filter].concat(this.state.recentFilters);
    }
    filter = filter ? [filter] : [];
    this.conditionalSetState({ recentFilters: this.state.recentFilters, filter: filter });
  },
  toggleLanguage: function toggleLanguage() {
    if (this.state.settings.language == "hebrew") {
      this.setOption("language", "english");
    } else {
      this.setOption("language", "hebrew");
    }
  },
  openCommentary: function openCommentary(commentator) {
    // Tranforms a connections panel into an text panel with a particular commentary
    var baseRef = this.state.refs[0];
    var links = Sefaria._filterLinks(Sefaria.links(baseRef), [commentator]);
    if (links.length) {
      var ref = links[0].sourceRef;
      // TODO, Hack - stripping at last : to get section level ref for commentary. Breaks for Commentary2?
      ref = ref.substring(0, ref.lastIndexOf(':'));
      this.showBaseText(ref);
    }
  },
  openSearch: function openSearch(query) {
    this.conditionalSetState({
      menuOpen: "search",
      searchQuery: query
    });
  },
  openDisplaySettings: function openDisplaySettings() {
    this.conditionalSetState({ displaySettingsOpen: true });
  },
  closeDisplaySettings: function closeDisplaySettings() {
    this.conditionalSetState({ displaySettingsOpen: false });
  },
  setOption: function setOption(option, value) {
    if (option === "fontSize") {
      var step = 1.15;
      var size = this.state.settings.fontSize;
      value = value === "smaller" ? size / step : size * step;
    } else if (option === "layout") {
      var category = this.currentCategory();
      var option = category === "Tanakh" || category === "Talmud" ? "layout" + category : "layoutDefault";
    }

    this.state.settings[option] = value;
    var state = { settings: this.state.settings };
    if (option !== "fontSize") {
      state.displaySettingsOpen = false;
    }
    cookie(option, value, { path: "/" });
    if (option === "language") {
      cookie("contentLang", value, { path: "/" });
      this.props.setDefaultOption && this.props.setDefaultOption(option, value);
    }
    this.conditionalSetState(state);
  },
  setConnectionsMode: function setConnectionsMode(mode) {
    var loginRequired = {
      "Add to Source Sheet": 1,
      "Add Note": 1,
      "My Notes": 1,
      "Add Connections": 1,
      "Add Translation": 1
    };
    if (!Sefaria._uid && mode in loginRequired) {
      mode = "Login";
    };
    var state = { connectionsMode: mode };
    if (mode === "Connections") {
      state["filter"] = [];
    }
    this.conditionalSetState(state);
  },
  editNote: function editNote(note) {
    this.conditionalSetState({
      connectionsMode: "Edit Note",
      noteBeingEdited: note
    });
  },
  setWidth: function setWidth() {
    this.width = $(ReactDOM.findDOMNode(this)).width();
  },
  setSheetTagSort: function setSheetTagSort(sort) {
    this.conditionalSetState({
      tagSort: sort
    });
  },
  setMySheetSort: function setMySheetSort(sort) {
    this.conditionalSetState({
      mySheetSort: sort
    });
  },
  trackPanelOpens: function trackPanelOpens() {
    if (this.state.mode === "Connections") {
      return;
    }
    this.tracked = this.tracked || [];
    // Do a little dance to avoid tracking something we've already just tracked
    // e.g. when refs goes from ["Genesis 5"] to ["Genesis 4", "Genesis 5"] don't track 5 again
    for (var i = 0; i < this.state.refs.length; i++) {
      if (Sefaria.util.inArray(this.state.refs[i], this.tracked) == -1) {
        if (Sefaria.site) {
          Sefaria.site.track.open(this.state.refs[i]);
        }
        this.tracked.push(this.state.refs[i]);
      }
    }
  },
  currentMode: function currentMode() {
    return this.state.mode;
  },
  currentRef: function currentRef() {
    // Returns a string of the current ref, the first if there are many
    return this.state.refs && this.state.refs.length ? this.state.refs[0] : null;
  },
  lastCurrentRef: function lastCurrentRef() {
    // Returns a string of the current ref, the last if there are many
    var ret = this.state.refs && this.state.refs.length ? this.state.refs.slice(-1)[0] : null;
    if (ret && (typeof ret === 'undefined' ? 'undefined' : _typeof(ret)) == "object") {
      debugger;
    }
    return ret;
  },
  currentData: function currentData() {
    // Returns the data from the library of the current ref
    var ref = this.currentRef();
    if (!ref) {
      return null;
    }
    var data = Sefaria.ref(ref);
    return data;
  },
  currentBook: function currentBook() {
    var data = this.currentData();
    if (data) {
      return data.indexTitle;
    } else {
      var pRef = Sefaria.parseRef(this.currentRef());
      return "book" in pRef ? pRef.book : null;
    }
  },
  currentCategory: function currentCategory() {
    var book = this.currentBook();
    return Sefaria.index(book) ? Sefaria.index(book).categories[0] : null;
  },
  currentLayout: function currentLayout() {
    var category = this.currentCategory();
    if (!category) {
      return "layoutDefault";
    }
    var option = category === "Tanakh" || category === "Talmud" ? "layout" + category : "layoutDefault";
    return this.state.settings[option];
  },
  render: function render() {
    var items = [];
    if (this.state.mode === "Text" || this.state.mode === "TextAndConnections") {
      items.push(React.createElement(TextColumn, {
        srefs: this.state.refs,
        version: this.state.version,
        versionLanguage: this.state.versionLanguage,
        highlightedRefs: this.state.highlightedRefs,
        basetext: true,
        withContext: true,
        loadLinks: true,
        prefetchNextPrev: true,
        multiPanel: this.props.multiPanel,
        mode: this.state.mode,
        settings: Sefaria.util.clone(this.state.settings),
        setOption: this.setOption,
        showBaseText: this.showBaseText,
        updateTextColumn: this.updateTextColumn,
        onSegmentClick: this.handleBaseSegmentClick,
        onCitationClick: this.handleCitationClick,
        setTextListHightlight: this.setTextListHightlight,
        setSelectedWords: this.setSelectedWords,
        panelsOpen: this.props.panelsOpen,
        layoutWidth: this.props.layoutWidth,
        filter: this.state.filter,
        key: 'text' }));
    }
    if (this.state.mode === "Connections" || this.state.mode === "TextAndConnections") {
      var langMode = this.props.masterPanelLanguage || this.state.settings.language;
      var data = this.currentData();
      var canEditText = data && langMode === "hebrew" && data.heVersionStatus !== "locked" || langMode === "english" && data.versionStatus !== "locked" || Sefaria.is_moderator && langMode !== "bilingual";
      items.push(React.createElement(ConnectionsPanel, {
        srefs: this.state.mode === "Connections" ? this.state.refs : this.state.highlightedRefs,
        filter: this.state.filter || [],
        mode: this.state.connectionsMode || "Connections",
        recentFilters: this.state.recentFilters,
        interfaceLang: this.props.interfaceLang,
        version: this.state.version,
        versionLanguage: this.state.versionLanguage,
        fullPanel: this.props.multiPanel,
        multiPanel: this.props.multiPanel,
        canEditText: canEditText,
        setFilter: this.setFilter,
        setConnectionsMode: this.setConnectionsMode,
        closeConectionsInPanel: this.closeConnectionsInPanel,
        openNav: this.openMenu.bind(null, "navigation"),
        openDisplaySettings: this.openDisplaySettings,
        editNote: this.editNote,
        noteBeingEdited: this.state.noteBeingEdited,
        onTextClick: this.handleTextListClick,
        onCitationClick: this.handleCitationClick,
        onNavigationClick: this.props.onNavigationClick,
        onOpenConnectionsClick: this.props.onOpenConnectionsClick,
        onCompareClick: this.showBaseText,
        openComparePanel: this.props.openComparePanel,
        closePanel: this.props.closePanel,
        selectedWords: this.state.selectedWords,
        key: 'connections' }));
    }

    if (this.state.menuOpen === "home" || this.state.menuOpen == "navigation" || this.state.menuOpen == "compare") {
      var openInPanel = function (pos, ref) {
        this.showBaseText(ref);
      }.bind(this);
      var onRecentClick = this.state.menuOpen === "compare" || !this.props.onRecentClick ? openInPanel : this.props.onRecentClick;

      var menu = React.createElement(ReaderNavigationMenu, {
        home: this.state.menuOpen === "home",
        compare: this.state.menuOpen === "compare",
        interfaceLang: this.props.interfaceLang,
        multiPanel: this.props.multiPanel,
        categories: this.state.navigationCategories || [],
        settings: this.state.settings,
        setCategories: this.setNavigationCategories || [],
        setOption: this.setOption,
        toggleLanguage: this.toggleLanguage,
        closeNav: this.closeMenus,
        closePanel: this.props.closePanel,
        openNav: this.openMenu.bind(null, "navigation"),
        openSearch: this.openSearch,
        openMenu: this.openMenu,
        openDisplaySettings: this.openDisplaySettings,
        onTextClick: this.props.onNavTextClick || this.showBaseText,
        onRecentClick: onRecentClick,
        hideNavHeader: this.props.hideNavHeader });
    } else if (this.state.menuOpen === "text toc") {
      var menu = React.createElement(ReaderTextTableOfContents, {
        mode: this.state.menuOpen,
        interfaceLang: this.props.interfaceLang,
        close: this.closeMenus,
        title: this.currentBook(),
        version: this.state.version,
        versionLanguage: this.state.versionLanguage,
        settingsLanguage: this.state.settings.language == "hebrew" ? "he" : "en",
        category: this.currentCategory(),
        currentRef: this.lastCurrentRef(),
        openNav: this.openMenu.bind(null, "navigation"),
        openDisplaySettings: this.openDisplaySettings,
        selectVersion: this.props.selectVersion,
        showBaseText: this.showBaseText });
    } else if (this.state.menuOpen === "book toc") {
      var menu = React.createElement(ReaderTextTableOfContents, {
        mode: this.state.menuOpen,
        interfaceLang: this.props.interfaceLang,
        closePanel: this.props.closePanel,
        close: this.closeMenus,
        title: this.state.bookRef,
        settingsLanguage: this.state.settings.language == "hebrew" ? "he" : "en",
        category: Sefaria.index(this.state.bookRef) ? Sefaria.index(this.state.bookRef).categories[0] : null,
        currentRef: this.state.bookRef,
        key: this.state.bookRef,
        openNav: this.openMenu.bind(null, "navigation"),
        openDisplaySettings: this.openDisplaySettings,
        selectVersion: this.props.selectVersion,
        showBaseText: this.showBaseText });
    } else if (this.state.menuOpen === "search" && this.state.searchQuery) {
      var menu = React.createElement(SearchPage, {
        query: this.state.searchQuery,
        appliedFilters: this.state.appliedSearchFilters,
        settings: Sefaria.util.clone(this.state.settings),
        onResultClick: this.props.onSearchResultClick,
        openDisplaySettings: this.openDisplaySettings,
        toggleLanguage: this.toggleLanguage,
        close: this.closeMenus,
        hideNavHeader: this.props.hideNavHeader,
        onQueryChange: this.props.onQueryChange,
        updateAppliedFilter: this.props.updateSearchFilter,
        availableFilters: this.state.availableFilters,
        filtersValid: this.state.searchFiltersValid,
        registerAvailableFilters: this.props.registerAvailableFilters });
    } else if (this.state.menuOpen === "sheets") {
      var menu = React.createElement(SheetsNav, {
        interfaceLang: this.props.interfaceLang,
        openNav: this.openMenu.bind(null, "navigation"),
        close: this.closeMenus,
        multiPanel: this.props.multiPanel,
        hideNavHeader: this.props.hideNavHeader,
        toggleLanguage: this.toggleLanguage,
        tag: this.state.navigationSheetTag,
        tagSort: this.state.tagSort,
        mySheetSort: this.state.mySheetSort,
        setMySheetSort: this.setMySheetSort,
        setSheetTagSort: this.setSheetTagSort,
        setSheetTag: this.setSheetTag,
        key: this.state.key });
    } else if (this.state.menuOpen === "account") {
      var menu = React.createElement(AccountPanel, {
        interfaceLang: this.props.interfaceLang });
    } else if (this.state.menuOpen === "notifications") {
      var menu = React.createElement(NotificationsPanel, {
        setUnreadNotificationsCount: this.props.setUnreadNotificationsCount,
        interfaceLang: this.props.interfaceLang });
    } else {
      var menu = null;
    }

    var classes = { readerPanel: 1, narrowColumn: this.width < 730 };
    classes[this.currentLayout()] = 1;
    classes[this.state.settings.color] = 1;
    classes[this.state.settings.language] = 1;
    classes = classNames(classes);
    var style = { "fontSize": this.state.settings.fontSize + "%" };
    var hideReaderControls = this.state.mode === "TextAndConnections" || this.props.hideNavHeader;

    return React.createElement(
      'div',
      { className: classes },
      hideReaderControls ? null : React.createElement(ReaderControls, {
        showBaseText: this.showBaseText,
        currentRef: this.lastCurrentRef(),
        currentMode: this.currentMode,
        currentCategory: this.currentCategory,
        currentBook: this.currentBook,
        version: this.state.version,
        versionLanguage: this.state.versionLanguage,
        multiPanel: this.props.multiPanel,
        settings: this.state.settings,
        setOption: this.setOption,
        setConnectionsMode: this.setConnectionsMode,
        openMenu: this.openMenu,
        closeMenus: this.closeMenus,
        openDisplaySettings: this.openDisplaySettings,
        currentLayout: this.currentLayout,
        connectionsMode: this.state.filter.length && this.state.connectionsMode === "Connections" ? "Connection Text" : this.state.connectionsMode,
        closePanel: this.props.closePanel,
        toggleLanguage: this.toggleLanguage }),
      React.createElement(
        'div',
        { className: 'readerContent', style: style },
        items
      ),
      menu,
      this.state.displaySettingsOpen ? React.createElement(ReaderDisplayOptionsMenu, {
        settings: this.state.settings,
        multiPanel: this.props.multiPanel,
        setOption: this.setOption,
        currentLayout: this.currentLayout,
        menuOpen: this.state.menuOpen }) : null,
      this.state.displaySettingsOpen ? React.createElement('div', { className: 'mask', onClick: this.closeDisplaySettings }) : null
    );
  }
});

var ReaderControls = React.createClass({
  displayName: 'ReaderControls',

  // The Header of a Reader panel when looking at a text
  // contains controls for display, navigation etc.
  propTypes: {
    settings: React.PropTypes.object.isRequired,
    showBaseText: React.PropTypes.func.isRequired,
    setOption: React.PropTypes.func.isRequired,
    setConnectionsMode: React.PropTypes.func.isRequired,
    openMenu: React.PropTypes.func.isRequired,
    openDisplaySettings: React.PropTypes.func.isRequired,
    closeMenus: React.PropTypes.func.isRequired,
    currentMode: React.PropTypes.func.isRequired,
    currentCategory: React.PropTypes.func.isRequired,
    currentBook: React.PropTypes.func.isRequired,
    currentLayout: React.PropTypes.func.isRequired,
    closePanel: React.PropTypes.func,
    toggleLanguage: React.PropTypes.func,
    currentRef: React.PropTypes.string,
    version: React.PropTypes.string,
    versionLanguage: React.PropTypes.string,
    connectionsMode: React.PropTypes.string,
    multiPanel: React.PropTypes.bool
  },
  openTextToc: function openTextToc(e) {
    e.preventDefault();
    this.props.openMenu("text toc");
  },
  render: function render() {
    var title = this.props.currentRef;
    if (title) {
      var oref = Sefaria.ref(title);
      var heTitle = oref ? oref.heTitle : "";
    } else {
      var heTitle = "";
    }

    var mode = this.props.currentMode();
    var hideHeader = !this.props.multiPanel && mode === "Connections";
    var connectionsHeader = this.props.multiPanel && mode === "Connections";

    if (title && !oref) {
      // If we don't have this data yet, rerender when we do so we can set the Hebrew title
      Sefaria.text(title, { context: 1 }, function () {
        if (this.isMounted()) {
          this.setState({});
        }
      }.bind(this));
    }

    var versionTitle = this.props.version ? this.props.version.replace(/_/g, " ") : "";
    var url = Sefaria.ref(title) ? "/" + Sefaria.normRef(Sefaria.ref(title).book) : Sefaria.normRef(title);
    var centerContent = connectionsHeader ? React.createElement(
      'div',
      { className: 'readerTextToc' },
      React.createElement(ConnectionsPanelHeader, {
        activeTab: this.props.connectionsMode,
        setConnectionsMode: this.props.setConnectionsMode,
        closePanel: this.props.closePanel,
        toggleLanguage: this.props.toggleLanguage })
    ) : React.createElement(
      'a',
      { href: url },
      React.createElement(
        'div',
        { className: 'readerTextToc', onClick: this.openTextToc },
        title ? React.createElement('i', { className: 'fa fa-caret-down invisible' }) : null,
        React.createElement(
          'div',
          { className: 'readerTextTocBox' },
          React.createElement(
            'span',
            { className: 'en' },
            title
          ),
          React.createElement(
            'span',
            { className: 'he' },
            heTitle
          ),
          title ? React.createElement('i', { className: 'fa fa-caret-down' }) : null,
          this.props.versionLanguage == "en" && this.props.settings.language == "english" ? React.createElement(
            'span',
            { className: 'readerTextVersion' },
            React.createElement(
              'span',
              { className: 'en' },
              versionTitle
            )
          ) : null
        )
      )
    );
    var leftControls = hideHeader || connectionsHeader ? null : React.createElement(
      'div',
      { className: 'leftButtons' },
      this.props.multiPanel ? React.createElement(ReaderNavigationMenuCloseButton, { onClick: this.props.closePanel }) : null,
      this.props.multiPanel ? null : React.createElement(ReaderNavigationMenuMenuButton, { onClick: this.props.openMenu.bind(null, "navigation") })
    );
    var rightControls = hideHeader || connectionsHeader ? null : React.createElement(
      'div',
      { className: 'rightButtons' },
      React.createElement(ReaderNavigationMenuDisplaySettingsButton, { onClick: this.props.openDisplaySettings })
    );
    var classes = classNames({ readerControls: 1, headeroom: 1, connectionsHeader: mode == "Connections" });
    var readerControls = hideHeader ? null : React.createElement(
      'div',
      { className: classes },
      React.createElement(
        'div',
        { className: 'readerControlsInner' },
        leftControls,
        rightControls,
        centerContent
      )
    );
    return React.createElement(
      'div',
      null,
      React.createElement(CategoryColorLine, { category: this.props.currentCategory() }),
      readerControls
    );
  }
});

var ReaderDisplayOptionsMenu = React.createClass({
  displayName: 'ReaderDisplayOptionsMenu',

  propTyps: {
    setOption: React.PropTypes.func.isRequired,
    currentLayout: React.PropTypes.func.isRequired,
    menuOpen: React.PropTypes.string.isRequired,
    multiPanel: React.PropTypes.bool.isRequired,
    settings: React.PropTypes.object.isRequired
  },
  render: function render() {
    var languageOptions = [{ name: "english", content: "<span class='en'>A</span>" }, { name: "bilingual", content: "<span class='en'>A</span><span class='he'>א</span>" }, { name: "hebrew", content: "<span class='he'>א</span>" }];
    var languageToggle = React.createElement(ToggleSet, {
      name: 'language',
      options: languageOptions,
      setOption: this.props.setOption,
      settings: this.props.settings });

    var layoutOptions = [{ name: "continuous", fa: "align-justify" }, { name: "segmented", fa: "align-left" }];
    var layoutToggle = this.props.settings.language !== "bilingual" ? React.createElement(ToggleSet, {
      name: 'layout',
      options: layoutOptions,
      setOption: this.props.setOption,
      currentLayout: this.props.currentLayout,
      settings: this.props.settings }) : null;

    var colorOptions = [{ name: "light", content: "" }, { name: "sepia", content: "" }, { name: "dark", content: "" }];
    var colorToggle = React.createElement(ToggleSet, {
      name: 'color',
      separated: true,
      options: colorOptions,
      setOption: this.props.setOption,
      settings: this.props.settings });
    colorToggle = this.props.multiPanel ? null : colorToggle;

    var sizeOptions = [{ name: "smaller", content: "Aa" }, { name: "larger", content: "Aa" }];
    var sizeToggle = React.createElement(ToggleSet, {
      name: 'fontSize',
      options: sizeOptions,
      setOption: this.props.setOption,
      settings: this.props.settings });

    if (this.props.menuOpen === "search") {
      return React.createElement(
        'div',
        { className: 'readerOptionsPanel' },
        React.createElement(
          'div',
          { className: 'readerOptionsPanelInner' },
          languageToggle,
          React.createElement('div', { className: 'line' }),
          sizeToggle
        )
      );
    } else if (this.props.menuOpen) {
      return React.createElement(
        'div',
        { className: 'readerOptionsPanel' },
        React.createElement(
          'div',
          { className: 'readerOptionsPanelInner' },
          languageToggle
        )
      );
    } else {
      return React.createElement(
        'div',
        { className: 'readerOptionsPanel' },
        React.createElement(
          'div',
          { className: 'readerOptionsPanelInner' },
          languageToggle,
          layoutToggle,
          React.createElement('div', { className: 'line' }),
          colorToggle,
          sizeToggle
        )
      );
    }
  }
});

var ReaderNavigationMenu = React.createClass({
  displayName: 'ReaderNavigationMenu',

  // The Navigation menu for browsing and searching texts, plus some site links.
  propTypes: {
    categories: React.PropTypes.array.isRequired,
    settings: React.PropTypes.object.isRequired,
    setCategories: React.PropTypes.func.isRequired,
    setOption: React.PropTypes.func.isRequired,
    closeNav: React.PropTypes.func.isRequired,
    openNav: React.PropTypes.func.isRequired,
    openSearch: React.PropTypes.func.isRequired,
    onTextClick: React.PropTypes.func.isRequired,
    onRecentClick: React.PropTypes.func.isRequired,
    closePanel: React.PropTypes.func,
    hideNavHeader: React.PropTypes.bool,
    multiPanel: React.PropTypes.bool,
    home: React.PropTypes.bool,
    compare: React.PropTypes.bool
  },
  getInitialState: function getInitialState() {
    this.width = 1000;
    return {
      showMore: false
    };
  },
  componentDidMount: function componentDidMount() {
    this.setWidth();
    window.addEventListener("resize", this.setWidth);
  },
  componentWillUnmount: function componentWillUnmount() {
    window.removeEventListener("resize", this.setWidth);
  },
  setWidth: function setWidth() {
    var width = $(ReactDOM.findDOMNode(this)).width();
    console.log("Setting RNM width: " + width);
    var winWidth = $(window).width();
    var winHeight = $(window).height();
    console.log("Window width: " + winWidth + ", Window height: " + winHeight);
    var oldWidth = this.width;
    this.width = width;
    if (oldWidth <= 450 && width > 450 || oldWidth > 450 && width <= 450) {
      this.forceUpdate();
    }
  },
  navHome: function navHome() {
    this.props.setCategories([]);
    this.props.openNav();
  },
  closeNav: function closeNav() {
    if (this.props.compare) {
      this.props.closePanel();
    } else {
      this.props.setCategories([]);
      this.props.closeNav();
    }
  },
  showMore: function showMore() {
    this.setState({ showMore: true });
  },
  getRecentlyViewed: function getRecentlyViewed() {
    var json = cookie("recentlyViewed");
    var recentlyViewed = json ? JSON.parse(json) : null;
    return recentlyViewed;
  },
  handleClick: function handleClick(event) {
    event.preventDefault();
    if ($(event.target).hasClass("refLink") || $(event.target).parent().hasClass("refLink")) {
      var ref = $(event.target).attr("data-ref") || $(event.target).parent().attr("data-ref");
      var pos = $(event.target).attr("data-position") || $(event.target).parent().attr("data-position");
      var version = $(event.target).attr("data-version") || $(event.target).parent().attr("data-version");
      var versionLanguage = $(event.target).attr("data-versionlanguage") || $(event.target).parent().attr("data-versionlanguage");
      if ($(event.target).hasClass("recentItem") || $(event.target).parent().hasClass("recentItem")) {
        this.props.onRecentClick(parseInt(pos), ref, version, versionLanguage);
      } else {
        this.props.onTextClick(ref, version, versionLanguage);
      }
      if (Sefaria.site) {
        Sefaria.site.track.event("Reader", "Navigation Text Click", ref);
      }
    } else if ($(event.target).hasClass("catLink") || $(event.target).parent().hasClass("catLink")) {
      var cats = $(event.target).attr("data-cats") || $(event.target).parent().attr("data-cats");
      cats = cats.split("|");
      this.props.setCategories(cats);
      if (Sefaria.site) {
        Sefaria.site.track.event("Reader", "Navigation Sub Category Click", cats.join(" / "));
      }
    }
  },
  handleSearchKeyUp: function handleSearchKeyUp(event) {
    if (event.keyCode === 13) {
      var query = $(event.target).val();
      this.props.openSearch(query);
    }
  },
  handleSearchButtonClick: function handleSearchButtonClick(event) {
    var query = $(ReactDOM.findDOMNode(this)).find(".readerSearch").val();
    if (query) {
      this.props.openSearch(query);
    }
  },
  render: function render() {
    if (this.props.categories.length) {
      // List of Text in a Category
      return React.createElement(
        'div',
        { className: 'readerNavMenu', onClick: this.handleClick },
        React.createElement(ReaderNavigationCategoryMenu, {
          categories: this.props.categories,
          category: this.props.categories.slice(-1)[0],
          closeNav: this.closeNav,
          setCategories: this.props.setCategories,
          toggleLanguage: this.props.toggleLanguage,
          openDisplaySettings: this.props.openDisplaySettings,
          navHome: this.navHome,
          compare: this.props.compare,
          hideNavHeader: this.props.hideNavHeader,
          width: this.width })
      );
    } else {
      // Root Library Menu
      var categories = ["Tanakh", "Mishnah", "Talmud", "Midrash", "Halakhah", "Kabbalah", "Liturgy", "Philosophy", "Tosefta", "Chasidut", "Musar", "Responsa", "Apocrypha", "Other"];
      categories = categories.map(function (cat) {
        var style = { "borderColor": Sefaria.palette.categoryColor(cat) };
        var openCat = function (e) {
          e.preventDefault();this.props.setCategories([cat]);
        }.bind(this);
        var heCat = Sefaria.hebrewCategory(cat);
        return React.createElement(
          'a',
          { href: '/texts/' + cat },
          React.createElement(
            'div',
            { className: 'readerNavCategory', 'data-cat': cat, style: style, onClick: openCat },
            React.createElement(
              'span',
              { className: 'en' },
              cat
            ),
            React.createElement(
              'span',
              { className: 'he' },
              heCat
            )
          )
        );
      }.bind(this));
      var more = React.createElement(
        'div',
        { className: 'readerNavCategory readerNavMore', style: { "borderColor": Sefaria.palette.colors.darkblue }, onClick: this.showMore },
        React.createElement(
          'span',
          { className: 'en' },
          'More ',
          React.createElement('img', { src: '/static/img/arrow-right.png' })
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'עוד ',
          React.createElement('img', { src: '/static/img/arrow-left.png' })
        )
      );
      if (this.width < 450) {
        categories = this.state.showMore ? categories : categories.slice(0, 9).concat(more);
        categories = React.createElement(
          'div',
          { className: 'readerNavCategories' },
          React.createElement(TwoBox, { content: categories })
        );
      } else {
        categories = this.state.showMore ? categories : categories.slice(0, 8).concat(more);
        categories = React.createElement(
          'div',
          { className: 'readerNavCategories' },
          React.createElement(ThreeBox, { content: categories })
        );
      }

      var siteLinks = Sefaria._uid ? [React.createElement(
        'a',
        { className: 'siteLink', key: 'profile', href: '/my/profile' },
        React.createElement('i', { className: 'fa fa-user' }),
        React.createElement(
          'span',
          { className: 'en' },
          'Your Profile'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'הפרופיל שלי'
        )
      ), React.createElement(
        'span',
        { className: 'divider', key: 'd1' },
        '•'
      ), React.createElement(
        'a',
        { className: 'siteLink', key: 'about', href: '/about' },
        React.createElement(
          'span',
          { className: 'en' },
          'About Sefaria'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'אודות ספאריה'
        )
      ), React.createElement(
        'span',
        { className: 'divider', key: 'd2' },
        '•'
      ), React.createElement(
        'a',
        { className: 'siteLink', key: 'logout', href: '/logout' },
        React.createElement(
          'span',
          { className: 'en' },
          'Logout'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'התנתק'
        )
      )] : [React.createElement(
        'a',
        { className: 'siteLink', key: 'about', href: '/about' },
        React.createElement(
          'span',
          { className: 'en' },
          'About Sefaria'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'אודות ספאריה'
        )
      ), React.createElement(
        'span',
        { className: 'divider', key: 'd1' },
        '•'
      ), React.createElement(
        'a',
        { className: 'siteLink', key: 'login', href: '/login' },
        React.createElement(
          'span',
          { className: 'en' },
          'Sign In'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'התחבר'
        )
      )];
      siteLinks = React.createElement(
        'div',
        { className: 'siteLinks' },
        siteLinks
      );

      var calendar = Sefaria.calendar ? [React.createElement(TextBlockLink, { sref: Sefaria.calendar.parasha, title: Sefaria.calendar.parashaName, heTitle: 'פרשה', category: 'Tanakh' }), React.createElement(TextBlockLink, { sref: Sefaria.calendar.haftara, title: 'Haftara', heTitle: 'הפטרה', category: 'Tanakh' }), React.createElement(TextBlockLink, { sref: Sefaria.calendar.daf_yomi, title: 'Daf Yomi', heTitle: 'דף יומי', category: 'Talmud' })] : [];
      calendar = React.createElement(
        'div',
        { className: 'readerNavCalendar' },
        React.createElement(TwoOrThreeBox, { content: calendar, width: this.width })
      );

      var sheetsStyle = { "borderColor": Sefaria.palette.categoryColor("Sheets") };
      var resources = [React.createElement(
        'span',
        { className: 'resourcesLink', style: sheetsStyle, onClick: this.props.openMenu.bind(null, "sheets") },
        React.createElement('img', { src: '/static/img/sheet-icon.png' }),
        React.createElement(
          'span',
          { className: 'en' },
          'Source Sheets'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'דפי מקורות'
        )
      ), React.createElement(
        'a',
        { className: 'resourcesLink', style: sheetsStyle, href: '/visualizations' },
        React.createElement('img', { src: '/static/img/visualizations-icon.png' }),
        React.createElement(
          'span',
          { className: 'en' },
          'Visualizations'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'חזותיים'
        )
      ), React.createElement(
        'a',
        { className: 'resourcesLink', style: sheetsStyle, href: '/people' },
        React.createElement('img', { src: '/static/img/authors-icon.png' }),
        React.createElement(
          'span',
          { className: 'en' },
          'Authors'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'רשימת מחברים'
        )
      )];
      resources = React.createElement(
        'div',
        { className: 'readerNavCalendar' },
        React.createElement(TwoOrThreeBox, { content: resources, width: this.width })
      );

      var topContent = this.props.home ? React.createElement(
        'div',
        { className: 'readerNavTop search' },
        React.createElement(CategoryColorLine, { category: 'Other' }),
        React.createElement(ReaderNavigationMenuSearchButton, { onClick: this.navHome }),
        React.createElement(ReaderNavigationMenuDisplaySettingsButton, { onClick: this.props.openDisplaySettings }),
        React.createElement(
          'div',
          { className: 'sefariaLogo' },
          React.createElement('img', { src: '/static/img/sefaria.png' })
        )
      ) : React.createElement(
        'div',
        { className: 'readerNavTop search' },
        React.createElement(CategoryColorLine, { category: 'Other' }),
        React.createElement(ReaderNavigationMenuCloseButton, { onClick: this.closeNav }),
        React.createElement(ReaderNavigationMenuSearchButton, { onClick: this.handleSearchButtonClick }),
        React.createElement(ReaderNavigationMenuDisplaySettingsButton, { onClick: this.props.openDisplaySettings }),
        React.createElement('input', { className: 'readerSearch', placeholder: 'Search', onKeyUp: this.handleSearchKeyUp })
      );
      topContent = this.props.hideNavHeader ? null : topContent;

      var recentlyViewed = this.getRecentlyViewed();
      recentlyViewed = recentlyViewed ? recentlyViewed.map(function (item) {
        return React.createElement(TextBlockLink, {
          sref: item.ref,
          heRef: item.heRef,
          book: item.book,
          version: item.version,
          versionLanguage: item.versionLanguage,
          showSections: true,
          recentItem: true,
          position: item.position || 0 });
      }) : null;
      recentlyViewed = recentlyViewed ? React.createElement(TwoOrThreeBox, { content: recentlyViewed, width: this.width }) : null;

      var title = React.createElement(
        'h1',
        null,
        React.createElement(LanguageToggleButton, { toggleLanguage: this.props.toggleLanguage }),
        React.createElement(
          'span',
          { className: 'en' },
          'The Sefaria Library'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'האוסף של ספאריה'
        )
      );

      var classes = classNames({ readerNavMenu: 1, noHeader: !this.props.hideHeader, compare: this.props.compare, home: this.props.home });
      return React.createElement(
        'div',
        { className: classes, onClick: this.handleClick, key: '0' },
        topContent,
        React.createElement(
          'div',
          { className: 'content' },
          React.createElement(
            'div',
            { className: 'contentInner' },
            this.props.compare ? null : title,
            React.createElement(ReaderNavigationMenuSection, { title: 'Recent', heTitle: 'נצפו לאחרונה', content: recentlyViewed }),
            React.createElement(ReaderNavigationMenuSection, { title: 'Browse', heTitle: 'טקסטים', content: categories }),
            React.createElement(ReaderNavigationMenuSection, { title: 'Calendar', heTitle: 'לוח יומי', content: calendar }),
            this.props.compare ? null : React.createElement(ReaderNavigationMenuSection, { title: 'Resources', heTitle: 'קהילה', content: resources }),
            this.props.multiPanel ? null : siteLinks
          )
        )
      );
    }
  }
});

var ReaderNavigationMenuSection = React.createClass({
  displayName: 'ReaderNavigationMenuSection',

  propTypes: {
    title: React.PropTypes.string,
    heTitle: React.PropTypes.string,
    content: React.PropTypes.object
  },
  render: function render() {
    if (!this.props.content) {
      return null;
    }
    return React.createElement(
      'div',
      { className: 'readerNavSection' },
      React.createElement(
        'h2',
        null,
        React.createElement(
          'span',
          { className: 'en' },
          this.props.title
        ),
        React.createElement(
          'span',
          { className: 'he' },
          this.props.heTitle
        )
      ),
      this.props.content
    );
  }
});

var TextBlockLink = React.createClass({
  displayName: 'TextBlockLink',

  // Monopoly card style link with category color at top
  propTypes: {
    sref: React.PropTypes.string.isRequired,
    version: React.PropTypes.string,
    versionLanguage: React.PropTypes.string,
    heRef: React.PropTypes.string,
    book: React.PropTypes.string,
    category: React.PropTypes.string,
    title: React.PropTypes.string,
    heTitle: React.PropTypes.string,
    showSections: React.PropTypes.bool,
    recentItem: React.PropTypes.bool,
    position: React.PropTypes.number
  },
  render: function render() {
    var index = Sefaria.index(this.props.book);
    var category = this.props.category || index.categories[0];
    var style = { "borderColor": Sefaria.palette.categoryColor(category) };
    var title = this.props.title || (this.props.showSections ? this.props.sref : this.props.book);
    var heTitle = this.props.heTitle || (this.props.showSections ? this.props.heRef : index.heTitle);

    var position = this.props.position || 0;
    var classes = classNames({ refLink: 1, blockLink: 1, recentItem: this.props.recentItem });
    var url = "/" + Sefaria.normRef(this.props.sref) + (this.props.version ? '/' + this.props.versionLanguage + '/' + this.props.version : "");
    return React.createElement(
      'a',
      { href: url, className: classes, 'data-ref': this.props.sref, 'data-version': this.props.version, 'data-versionlanguage': this.props.versionLanguage, 'data-position': position, style: style },
      React.createElement(
        'span',
        { className: 'en' },
        title
      ),
      React.createElement(
        'span',
        { className: 'he' },
        heTitle
      )
    );
  }
});

var LanguageToggleButton = React.createClass({
  displayName: 'LanguageToggleButton',

  propTypes: {
    toggleLanguage: React.PropTypes.func.isRequired
  },
  render: function render() {
    return React.createElement(
      'div',
      { className: 'languageToggle', onClick: this.props.toggleLanguage },
      React.createElement(
        'span',
        { className: 'en' },
        React.createElement('img', { src: '/static/img/aleph.svg' })
      ),
      React.createElement(
        'span',
        { className: 'he' },
        React.createElement('img', { src: 'static/img/aye.svg' })
      )
    );
  }
});

var BlockLink = React.createClass({
  displayName: 'BlockLink',

  propTypes: {
    title: React.PropTypes.string,
    heTitle: React.PropTypes.string,
    target: React.PropTypes.string
  },
  render: function render() {
    return React.createElement(
      'a',
      { className: 'blockLink', href: this.props.target },
      React.createElement(
        'span',
        { className: 'en' },
        this.props.title
      ),
      React.createElement(
        'span',
        { className: 'he' },
        this.props.heTitle
      )
    );
  }
});

var ReaderNavigationCategoryMenu = React.createClass({
  displayName: 'ReaderNavigationCategoryMenu',

  // Navigation Menu for a single category of texts (e.g., "Tanakh", "Bavli")
  propTypes: {
    category: React.PropTypes.string.isRequired,
    categories: React.PropTypes.array.isRequired,
    closeNav: React.PropTypes.func.isRequired,
    setCategories: React.PropTypes.func.isRequired,
    navHome: React.PropTypes.func.isRequired,
    width: React.PropTypes.number,
    compare: React.PropTypes.bool,
    hideNavHeader: React.PropTypes.bool
  },
  render: function render() {

    // Show Talmud with Toggles
    var categories = this.props.categories[0] === "Talmud" && this.props.categories.length == 1 ? ["Talmud", "Bavli"] : this.props.categories;

    if (categories[0] === "Talmud") {
      var setBavli = function () {
        this.props.setCategories(["Talmud", "Bavli"]);
      }.bind(this);
      var setYerushalmi = function () {
        this.props.setCategories(["Talmud", "Yerushalmi"]);
      }.bind(this);
      var bClasses = classNames({ navToggle: 1, active: categories[1] === "Bavli" });
      var yClasses = classNames({ navToggle: 1, active: categories[1] === "Yerushalmi", second: 1 });

      var toggle = React.createElement(
        'div',
        { className: 'navToggles' },
        React.createElement(
          'span',
          { className: bClasses, onClick: setBavli },
          React.createElement(
            'span',
            { className: 'en' },
            'Bavli'
          ),
          React.createElement(
            'span',
            { className: 'he' },
            'בבלי'
          )
        ),
        React.createElement(
          'span',
          { className: 'navTogglesDivider' },
          '|'
        ),
        React.createElement(
          'span',
          { className: yClasses, onClick: setYerushalmi },
          React.createElement(
            'span',
            { className: 'en' },
            'Yerushalmi'
          ),
          React.createElement(
            'span',
            { className: 'he' },
            'ירושלמי'
          )
        )
      );
    } else {
      var toggle = null;
    }

    var catContents = Sefaria.tocItemsByCategories(categories);
    var navMenuClasses = classNames({ readerNavCategoryMenu: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader });
    var navTopClasses = classNames({ readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader });
    return React.createElement(
      'div',
      { className: navMenuClasses },
      React.createElement(
        'div',
        { className: navTopClasses },
        React.createElement(CategoryColorLine, { category: categories[0] }),
        this.props.hideNavHeader ? null : React.createElement(ReaderNavigationMenuMenuButton, { onClick: this.props.navHome, compare: this.props.compare }),
        this.props.hideNavHeader ? null : React.createElement(ReaderNavigationMenuDisplaySettingsButton, { onClick: this.props.openDisplaySettings }),
        this.props.hideNavHeader ? null : React.createElement(
          'h2',
          null,
          React.createElement(
            'span',
            { className: 'en' },
            this.props.category
          ),
          React.createElement(
            'span',
            { className: 'he' },
            Sefaria.hebrewCategory(this.props.category)
          )
        )
      ),
      React.createElement(
        'div',
        { className: 'content' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          this.props.hideNavHeader ? React.createElement(
            'h1',
            null,
            React.createElement(LanguageToggleButton, { toggleLanguage: this.props.toggleLanguage }),
            React.createElement(
              'span',
              { className: 'en' },
              this.props.category
            ),
            React.createElement(
              'span',
              { className: 'he' },
              Sefaria.hebrewCategory(this.props.category)
            )
          ) : null,
          toggle,
          React.createElement(ReaderNavigationCategoryMenuContents, { contents: catContents, categories: categories, width: this.props.width })
        )
      )
    );
  }
});

var ReaderNavigationCategoryMenuContents = React.createClass({
  displayName: 'ReaderNavigationCategoryMenuContents',

  // Inner content of Category menu (just category title and boxes of)
  propTypes: {
    contents: React.PropTypes.array.isRequired,
    categories: React.PropTypes.array.isRequired,
    width: React.PropTypes.number
  },
  render: function render() {
    var content = [];
    var cats = this.props.categories || [];
    for (var i = 0; i < this.props.contents.length; i++) {
      var item = this.props.contents[i];
      if (item.category) {
        if (item.category == "Commentary") {
          continue;
        }
        var newCats = cats.concat(item.category);
        // Special Case categories which should nest
        var subcats = ["Mishneh Torah", "Shulchan Arukh", "Midrash Rabbah", "Maharal"];
        if (Sefaria.util.inArray(item.category, subcats) > -1) {
          url = "/texts/" + newCats.join("/");
          content.push(React.createElement(
            'a',
            { href: url },
            React.createElement(
              'span',
              { className: 'catLink', 'data-cats': newCats.join("|"), key: i },
              React.createElement(
                'span',
                { className: 'en' },
                item.category
              ),
              React.createElement(
                'span',
                { className: 'he' },
                Sefaria.hebrewCategory(item.category)
              )
            )
          ));
          continue;
        }
        // Add a Category
        content.push(React.createElement(
          'div',
          { className: 'category', key: i },
          React.createElement(
            'h3',
            null,
            React.createElement(
              'span',
              { className: 'en' },
              item.category
            ),
            React.createElement(
              'span',
              { className: 'he' },
              item.heCategory
            )
          ),
          React.createElement(ReaderNavigationCategoryMenuContents, { contents: item.contents, categories: newCats, width: this.props.width })
        ));
      } else {
        // Add a Text
        var title = item.title.replace(/(Mishneh Torah,|Shulchan Arukh,|Jerusalem Talmud) /, "");
        var heTitle = item.heTitle.replace(/(משנה תורה,|תלמוד ירושלמי) /, "");
        var url = "/" + Sefaria.normRef(item.firstSection);
        content.push(React.createElement(
          'a',
          { href: url },
          React.createElement(
            'span',
            { className: 'refLink sparse' + item.sparseness, 'data-ref': item.firstSection, key: i },
            React.createElement(
              'span',
              { className: 'en' },
              title
            ),
            React.createElement(
              'span',
              { className: 'he' },
              heTitle
            )
          )
        ));
      }
    }
    var boxedContent = [];
    var currentRun = [];
    for (var i = 0; i < content.length; i++) {
      // Walk through content looking for runs of texts/subcats to group together into a table
      if (content[i].type == "div") {
        // this is a subcategory
        if (currentRun.length) {
          boxedContent.push(React.createElement(TwoOrThreeBox, { content: currentRun, width: this.props.width, key: i }));
          currentRun = [];
        }
        boxedContent.push(content[i]);
      } else {
        // this is a single text
        currentRun.push(content[i]);
      }
    }
    if (currentRun.length) {
      boxedContent.push(React.createElement(TwoOrThreeBox, { content: currentRun, width: this.props.width, key: i }));
    }
    return React.createElement(
      'div',
      null,
      boxedContent
    );
  }
});

var ReaderTextTableOfContents = React.createClass({
  displayName: 'ReaderTextTableOfContents',

  // Menu for the Table of Contents for a single text
  propTypes: {
    mode: React.PropTypes.string.isRequired,
    title: React.PropTypes.string.isRequired,
    category: React.PropTypes.string.isRequired,
    currentRef: React.PropTypes.string.isRequired,
    settingsLanguage: React.PropTypes.string.isRequired,
    versionLanguage: React.PropTypes.string,
    version: React.PropTypes.string,
    close: React.PropTypes.func.isRequired,
    openNav: React.PropTypes.func.isRequired,
    showBaseText: React.PropTypes.func.isRequired,
    selectVersion: React.PropTypes.func
  },
  getInitialState: function getInitialState() {
    return {
      versions: [],
      versionsLoaded: false,
      currentVersion: null
    };
  },
  componentDidMount: function componentDidMount() {
    this.loadHtml();
    this.loadVersions();
    this.bindToggles();
    this.shrinkWrap();
    window.addEventListener('resize', this.shrinkWrap);
  },
  componentWillUnmount: function componentWillUnmount() {
    window.removeEventListener('resize', this.shrinkWrap);
  },
  componentDidUpdate: function componentDidUpdate() {
    this.bindToggles();
    this.shrinkWrap();
  },
  loadHtml: function loadHtml() {
    var textTocHtml = Sefaria.textTocHtml(this.props.title);
    if (!textTocHtml) {
      Sefaria.textTocHtml(this.props.title, function () {
        this.forceUpdate();
      }.bind(this));
    }
  },
  loadVersions: function loadVersions() {
    var ref = Sefaria.sectionRef(this.props.currentRef) || this.props.currentRef;
    if (!ref) {
      this.setState({ versionsLoaded: true });
      return;
    }
    if (Sefaria.ref(ref)) {
      Sefaria.text(ref, { context: 1, version: this.state.version, language: this.state.versionLanguage }, this.loadVersionsDataFromText);
    } else {
      Sefaria.versions(ref, function (d) {
        this.setState({ versions: d, versionsLoaded: true });
      }.bind(this));
    }
  },
  loadVersionsDataFromText: function loadVersionsDataFromText(d) {
    // For now treat bilinguale as english. TODO show attribution for 2 versions in bilingual case.
    var currentLanguage = this.props.settingsLanguage == "he" ? "he" : "en";
    if (currentLanguage == "en" && !d.text.length) {
      currentLanguage = "he";
    }
    if (currentLanguage == "he" && !d.he.length) {
      currentLanguage = "en";
    }

    var currentVersion = {
      language: currentLanguage,
      versionTitle: currentLanguage == "he" ? d.heVersionTitle : d.versionTitle,
      versionSource: currentLanguage == "he" ? d.heVersionSource : d.versionSource,
      license: currentLanguage == "he" ? d.heLicense : d.license,
      sources: currentLanguage == "he" ? d.heSources : d.sources,
      versionNotes: currentLanguage == "he" ? d.heVersionNotes : d.versionNotes,
      digitizedBySefaria: currentLanguage == "he" ? d.heDigitizedBySefaria : d.digitizedBySefaria
    };
    currentVersion.merged = !!currentVersion.sources;

    this.setState({
      versions: d.versions,
      versionsLoaded: true,
      currentVersion: currentVersion
    });
  },
  handleClick: function handleClick(e) {
    var $a = $(e.target).closest("a");
    if ($a.length) {
      var ref = $a.attr("data-ref");
      ref = decodeURIComponent(ref);
      ref = Sefaria.humanRef(ref);
      this.props.close();
      this.props.showBaseText(ref);
      e.preventDefault();
    }
  },
  bindToggles: function bindToggles() {
    // Toggling TOC Alt structures
    var component = this;
    $(".altStructToggle").click(function () {
      $(".altStructToggle").removeClass("active");
      $(this).addClass("active");
      var i = $(this).closest("#structToggles").find(".altStructToggle").index(this);
      $(".altStruct").hide();
      $(".altStruct").eq(i).show();
      component.shrinkWrap();
    });
  },
  shrinkWrap: function shrinkWrap() {
    // Shrink the width of the container of a grid of inline-line block elements,
    // so that is is tight around its contents thus able to appear centered.
    // As far as I can tell, there's no way to do this in pure CSS.
    // TODO - flexbox should be able to solve this
    var shrink = function shrink(i, container) {
      var $container = $(container);
      // don't run on complex nodes without sectionlinks
      if ($container.hasClass("schema-node-toc") && !$container.find(".sectionLink").length) {
        return;
      }
      var maxWidth = $container.parent().innerWidth();
      var itemWidth = $container.find(".sectionLink").outerWidth(true);
      var nItems = $container.find(".sectionLink").length;

      if (maxWidth / itemWidth > nItems) {
        var width = nItems * itemWidth;
      } else {
        var width = Math.floor(maxWidth / itemWidth) * itemWidth;
      }
      $container.width(width + "px");
    };
    var $root = $(ReactDOM.findDOMNode(this)).find(".altStruct:visible");
    $root = $root.length ? $root : $(ReactDOM.findDOMNode(this)).find(".tocContent");
    if ($root.find(".tocSection").length) {// nested simple text
      //$root.find(".tocSection").each(shrink); // Don't bother with these for now
    } else if ($root.find(".schema-node-toc").length) {
        // complex text or alt struct
        $root.find(".schema-node-toc, .schema-node-contents").each(shrink);
      } else {
        $root.find(".tocLevel").each(shrink); // Simple text, no nesting
      }
  },
  onVersionSelectChange: function onVersionSelectChange(event) {
    if (event.target.value == 0) {
      this.props.selectVersion();
    } else {
      var i = event.target.value - 1;
      var v = this.state.versions[i];
      this.props.selectVersion(v.versionTitle, v.language);
    }
    if (this.isTextToc()) {
      this.props.close();
    }
  },
  isBookToc: function isBookToc() {
    return this.props.mode == "book toc";
  },
  isTextToc: function isTextToc() {
    return this.props.mode == "text toc";
  },
  render: function render() {
    var _this = this;

    var tocHtml = Sefaria.textTocHtml(this.props.title);

    tocHtml = tocHtml || '<div class="loadingMessage"><span class="en">Loading...</span><span class="he">טעינה...</span></div>';

    var title = this.props.title;
    var heTitle = Sefaria.index(title) ? Sefaria.index(title).heTitle : title;

    var currentVersionElement = null;
    var defaultVersionString = "Default Version";
    var defaultVersionObject = null;
    var versionBlocks = "";

    if (this.state.versionsLoaded) {
      var cv = this.state.currentVersion;
      if (cv && cv.merged) {
        var uniqueSources = cv.sources.filter(function (item, i, ar) {
          return ar.indexOf(item) === i;
        }).join(", ");
        defaultVersionString += " (Merged from " + uniqueSources + ")";
        currentVersionElement = React.createElement(
          'div',
          { className: 'versionTitle' },
          'Merged from ',
          uniqueSources
        );
      } else if (cv) {
        if (!this.props.version) {
          defaultVersionObject = this.state.versions.find(function (v) {
            return cv.language == v.language && cv.versionTitle == v.versionTitle;
          });
          defaultVersionString += defaultVersionObject ? " (" + defaultVersionObject.versionTitle + ")" : "";
        }
        currentVersionElement = React.createElement(VersionBlock, { version: cv, currentRef: this.props.currentRef, showHistory: true });
      }

      var _map = ["he", "en"].map(function (lang) {
        return _this.state.versions.filter(function (v) {
          return v.language == lang;
        }).map(function (v) {
          return React.createElement(VersionBlock, { version: v, showNotes: true, key: v.versionTitle + "/" + v.language });
        });
      });

      var _map2 = _slicedToArray(_map, 2);

      var heVersionBlocks = _map2[0];
      var enVersionBlocks = _map2[1];


      versionBlocks = React.createElement(
        'div',
        { className: 'versionBlocks' },
        !!heVersionBlocks.length ? React.createElement(
          'div',
          { className: 'versionLanguageBlock' },
          React.createElement(
            'div',
            { className: 'versionLanguageHeader' },
            React.createElement(
              'span',
              { className: 'en' },
              'Hebrew Versions'
            ),
            React.createElement(
              'span',
              { className: 'he' },
              'בעברית'
            )
          ),
          React.createElement(
            'div',
            null,
            heVersionBlocks
          )
        ) : "",
        !!enVersionBlocks.length ? React.createElement(
          'div',
          { className: 'versionLanguageBlock' },
          React.createElement(
            'div',
            { className: 'versionLanguageHeader' },
            React.createElement(
              'span',
              { className: 'en' },
              'English Versions'
            ),
            React.createElement(
              'span',
              { className: 'he' },
              'באנגלית'
            )
          ),
          React.createElement(
            'div',
            null,
            enVersionBlocks
          )
        ) : ""
      );
    }

    if (this.isTextToc()) {
      var sectionStrings = Sefaria.sectionString(this.props.currentRef);
      var section = sectionStrings.en.named;
      var heSection = sectionStrings.he.named;

      var selectOptions = [];
      selectOptions.push(React.createElement(
        'option',
        { key: '0', value: '0' },
        defaultVersionString
      )); // todo: add description of current version.
      var selectedOption = 0;
      for (var i = 0; i < this.state.versions.length; i++) {
        var v = this.state.versions[i];
        if (v == defaultVersionObject) {
          continue;
        }
        if (this.props.versionLanguage == v.language && this.props.version == v.versionTitle) {
          selectedOption = i + 1;
        }
        var versionString = v.versionTitle + " (" + v.language + ")"; // Can not inline this, because of https://github.com/facebook/react-devtools/issues/248
        selectOptions.push(React.createElement(
          'option',
          { key: i + 1, value: i + 1 },
          versionString
        ));
      }
      var selectElement = React.createElement(
        'div',
        { className: 'versionSelect' },
        React.createElement(
          'select',
          { value: selectedOption, onChange: this.onVersionSelectChange },
          selectOptions
        )
      );
    }

    var closeClick = this.isBookToc() ? this.props.closePanel : this.props.close;
    return React.createElement(
      'div',
      { className: 'readerTextTableOfContents readerNavMenu' },
      React.createElement(CategoryColorLine, { category: this.props.category }),
      React.createElement(
        'div',
        { className: 'readerControls' },
        React.createElement(
          'div',
          { className: 'readerControlsInner' },
          React.createElement(
            'div',
            { className: 'leftButtons' },
            React.createElement(ReaderNavigationMenuCloseButton, { onClick: closeClick })
          ),
          React.createElement(
            'div',
            { className: 'rightButtons' },
            React.createElement(ReaderNavigationMenuDisplaySettingsButton, { onClick: this.props.openDisplaySettings })
          ),
          React.createElement(
            'div',
            { className: 'readerTextToc readerTextTocHeader' },
            React.createElement(
              'div',
              { className: 'readerTextTocBox' },
              React.createElement(
                'span',
                { className: 'en' },
                'Table of Contents'
              ),
              React.createElement(
                'span',
                { className: 'he' },
                'תוכן העניינים'
              )
            )
          )
        )
      ),
      React.createElement(
        'div',
        { className: 'content' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          React.createElement(
            'div',
            { className: 'tocTitle' },
            React.createElement(
              'span',
              { className: 'en' },
              title
            ),
            React.createElement(
              'span',
              { className: 'he' },
              heTitle
            ),
            this.isTextToc() ? React.createElement(
              'div',
              { className: 'currentSection' },
              React.createElement(
                'span',
                { className: 'en' },
                section
              ),
              React.createElement(
                'span',
                { className: 'he' },
                heSection
              )
            ) : ""
          ),
          this.isTextToc() ? React.createElement(
            'div',
            { className: 'currentVersionBox' },
            !this.state.versionsLoaded ? React.createElement(
              'span',
              null,
              'Loading...'
            ) : "",
            this.state.versionsLoaded ? currentVersionElement : "",
            this.state.versionsLoaded && this.state.versions.length > 1 ? selectElement : ""
          ) : "",
          React.createElement('div', { className: 'tocContent', dangerouslySetInnerHTML: { __html: tocHtml }, onClick: this.handleClick }),
          versionBlocks
        )
      )
    );
  }
});

var VersionBlock = React.createClass({
  displayName: 'VersionBlock',

  propTypes: {
    version: React.PropTypes.object.isRequired,
    currentRef: React.PropTypes.string,
    showHistory: React.PropTypes.bool,
    showNotes: React.PropTypes.bool
  },
  getDefaultProps: function getDefaultProps() {
    return {
      ref: "",
      showHistory: false,
      showNotes: false
    };
  },
  render: function render() {
    var v = this.props.version;

    return React.createElement(
      'div',
      { className: 'versionBlock' },
      React.createElement(
        'div',
        { className: 'versionTitle' },
        v.versionTitle
      ),
      React.createElement(
        'div',
        null,
        React.createElement(
          'a',
          { className: 'versionSource', target: '_blank', href: v.versionSource },
          Sefaria.util.parseURL(v.versionSource).host
        ),
        React.createElement(
          'span',
          null,
          '-'
        ),
        React.createElement(
          'span',
          { className: 'versionLicense' },
          v.license == "unknown" || !v.license ? "License Unknown" : v.license + (v.digitizedBySefaria ? " - Digitized by Sefaria" : "")
        ),
        this.props.showHistory ? React.createElement(
          'span',
          null,
          '-'
        ) : "",
        this.props.showHistory ? React.createElement(
          'a',
          { className: 'versionHistoryLink', href: '/activity/' + Sefaria.normRef(this.props.currentRef) + '/' + v.language + '/' + (v.versionTitle && v.versionTitle.replace(/\s/g, "_")) },
          'Version History >'
        ) : ""
      ),
      this.props.showNotes ? React.createElement('div', { className: 'versionNotes', dangerouslySetInnerHTML: { __html: v.versionNotes } }) : ""
    );
  }
});

var SheetsNav = React.createClass({
  displayName: 'SheetsNav',

  // Navigation for Sheets
  propTypes: {
    multiPanel: React.PropTypes.bool,
    tag: React.PropTypes.string,
    tagSort: React.PropTypes.string,
    close: React.PropTypes.func.isRequired,
    openNav: React.PropTypes.func.isRequired,
    setSheetTag: React.PropTypes.func.isRequired,
    setSheetTagSort: React.PropTypes.func.isRequired,
    hideNavHeader: React.PropTypes.bool
  },
  getInitialState: function getInitialState() {
    return {
      width: this.props.multiPanel ? 1000 : 400
    };
  },
  componentDidMount: function componentDidMount() {
    this.setState({ width: $(ReactDOM.findDOMNode(this)).width() });
  },
  componentWillReceiveProps: function componentWillReceiveProps(nextProps) {},
  changeSort: function changeSort(sort) {
    this.props.setSheetTagSort(sort);
    //Sefaria.sheets.tagList(this.loadTags, event.target.value);
  },
  render: function render() {
    var enTitle = this.props.tag || "Source Sheets";
    var heTitle = this.props.tag || "דפי מקורות";

    if (this.props.tag == "My Sheets") {
      var content = React.createElement(MySheetsPage, {
        hideNavHeader: this.props.hideNavHeader,
        tagSort: this.props.tagSort,
        mySheetSort: this.props.mySheetSort,
        multiPanel: this.props.multiPanel,
        setMySheetSort: this.props.setMySheetSort,
        setSheetTag: this.props.setSheetTag,
        setSheetTagSort: this.props.setSheetTagSort,
        width: this.state.width });
    } else if (this.props.tag == "All Sheets") {
      var content = React.createElement(AllSheetsPage, {
        hideNavHeader: this.props.hideNavHeader });
    } else if (this.props.tag) {
      var content = React.createElement(TagSheetsPage, {
        tag: this.props.tag,
        setSheetTag: this.props.setSheetTag,
        multiPanel: this.props.multiPanel,
        hideNavHeader: this.props.hideNavHeader,
        width: this.state.width });
    } else {
      var content = React.createElement(SheetsHomePage, {
        tagSort: this.props.tagSort,
        setSheetTag: this.props.setSheetTag,
        setSheetTagSort: this.props.setSheetTagSort,
        multiPanel: this.props.multiPanel,
        hideNavHeader: this.props.hideNavHeader,
        width: this.state.width });
    }

    var classes = classNames({ readerNavMenu: 1, readerSheetsNav: 1, noHeader: this.props.hideNavHeader });
    return React.createElement(
      'div',
      { className: classes },
      React.createElement(CategoryColorLine, { category: 'Sheets' }),
      this.props.hideNavHeader ? null : React.createElement(
        'div',
        { className: 'readerNavTop searchOnly', key: 'navTop' },
        React.createElement(CategoryColorLine, { category: 'Sheets' }),
        React.createElement(ReaderNavigationMenuMenuButton, { onClick: this.props.openNav }),
        React.createElement(
          'h2',
          null,
          React.createElement(
            'span',
            { className: 'en' },
            enTitle
          ),
          React.createElement(
            'span',
            { className: 'he' },
            heTitle
          )
        )
      ),
      content
    );
  }
});

var SheetsHomePage = React.createClass({
  displayName: 'SheetsHomePage',

  // A set of options grouped together.
  propTypes: {
    setSheetTag: React.PropTypes.func.isRequired,
    setSheetTagSort: React.PropTypes.func.isRequired,
    hideNavHeader: React.PropTypes.bool
  },
  componentDidMount: function componentDidMount() {
    this.ensureData();
  },
  getTopSheetsFromCache: function getTopSheetsFromCache() {
    return Sefaria.sheets.topSheets();
  },
  getSheetsFromAPI: function getSheetsFromAPI() {
    Sefaria.sheets.topSheets(this.onDataLoad);
  },
  getTagListFromCache: function getTagListFromCache() {
    return Sefaria.sheets.tagList(this.props.tagSort);
  },
  getTagListFromAPI: function getTagListFromAPI() {
    Sefaria.sheets.tagList(this.props.tagSort, this.onDataLoad);
  },
  getTrendingTagsFromCache: function getTrendingTagsFromCache() {
    return Sefaria.sheets.trendingTags();
  },
  getTrendingTagsFromAPI: function getTrendingTagsFromAPI() {
    Sefaria.sheets.trendingTags(this.onDataLoad);
  },
  onDataLoad: function onDataLoad(data) {
    this.forceUpdate();
  },
  ensureData: function ensureData() {
    if (!this.getTopSheetsFromCache()) {
      this.getSheetsFromAPI();
    }
    if (!this.getTagListFromCache()) {
      this.getTagListFromAPI();
    }
    if (!this.getTrendingTagsFromCache()) {
      this.getTrendingTagsFromAPI();
    }
  },
  showYourSheets: function showYourSheets() {
    this.props.setSheetTag("My Sheets");
  },
  showAllSheets: function showAllSheets() {
    this.props.setSheetTag("All Sheets");
  },
  changeSort: function changeSort(sort) {
    this.props.setSheetTagSort(sort);
  },
  _type_sheet_button: function _type_sheet_button(en, he, on_click, active) {
    var classes = classNames({ "type-button": 1, active: active });

    return React.createElement(
      'div',
      { className: classes, onClick: on_click },
      React.createElement(
        'div',
        { className: 'type-button-title' },
        React.createElement(
          'span',
          { className: 'en' },
          en
        ),
        React.createElement(
          'span',
          { className: 'he' },
          he
        )
      )
    );
  },

  render: function render() {
    var _this2 = this;

    var trendingTags = this.getTrendingTagsFromCache();
    var topSheets = this.getTopSheetsFromCache();
    if (this.props.tagSort == "trending") {
      var tagList = this.getTrendingTagsFromCache();
    } else {
      var tagList = this.getTagListFromCache();
    }

    var makeTagButton = function makeTagButton(tag) {
      return React.createElement(SheetTagButton, { setSheetTag: _this2.props.setSheetTag, tag: tag.tag, count: tag.count, key: tag.tag });
    };

    var trendingTags = trendingTags ? trendingTags.slice(0, 6).map(makeTagButton) : [React.createElement(LoadingMessage, null)];
    var tagList = tagList ? tagList.map(makeTagButton) : [React.createElement(LoadingMessage, null)];
    var publicSheetList = topSheets ? topSheets.map(function (sheet) {
      return React.createElement(PublicSheetListing, { sheet: sheet, key: sheet.id });
    }) : [React.createElement(LoadingMessage, null)];

    var yourSheetsButton = Sefaria._uid ? React.createElement(
      'div',
      { className: 'yourSheetsLink navButton', onClick: this.showYourSheets },
      React.createElement(
        'span',
        { 'class': 'en' },
        'My Source Sheets ',
        React.createElement('i', { className: 'fa fa-chevron-right' })
      ),
      React.createElement('span', { 'class': 'he' })
    ) : null;

    return React.createElement(
      'div',
      { className: 'content' },
      React.createElement(
        'div',
        { className: 'contentInner' },
        this.props.hideNavHeader ? React.createElement(
          'h1',
          null,
          React.createElement(
            'span',
            { className: 'en' },
            'Source Sheets'
          ),
          React.createElement(
            'span',
            { className: 'he' },
            'דפי מקורות'
          )
        ) : null,
        this.props.multiPanel ? null : yourSheetsButton,
        this.props.multiPanel ? React.createElement(
          'h2',
          { className: 'splitHeader' },
          React.createElement(
            'span',
            { className: 'en' },
            'Public Sheets'
          ),
          React.createElement(
            'span',
            { className: 'en actionText', onClick: this.showAllSheets },
            'See All ',
            React.createElement('i', { className: 'fa fa-angle-right' })
          )
        ) : React.createElement(
          'h2',
          null,
          React.createElement(
            'span',
            { className: 'en' },
            'Public Sheets'
          )
        ),
        React.createElement(
          'div',
          { className: 'topSheetsBox' },
          publicSheetList
        ),
        this.props.multiPanel ? null : React.createElement(
          'h2',
          null,
          React.createElement(
            'span',
            { className: 'en' },
            'Trending Tags'
          )
        ),
        this.props.multiPanel ? null : React.createElement(TwoOrThreeBox, { content: trendingTags, width: this.props.width }),
        React.createElement('br', null),
        React.createElement('br', null),
        this.props.multiPanel ? React.createElement(
          'h2',
          null,
          React.createElement(
            'span',
            { className: 'en' },
            'All Tags'
          ),
          React.createElement(
            'span',
            { className: 'he' },
            'All Tags [he]'
          ),
          React.createElement(
            'div',
            { className: 'actionText' },
            React.createElement(
              'div',
              { className: 'type-buttons' },
              this._type_sheet_button("Most Used", "Most Used [he]", function () {
                return _this2.changeSort("count");
              }, this.props.tagSort == "count"),
              this._type_sheet_button("Alphabetical", "Alpha [he]", function () {
                return _this2.changeSort("alpha");
              }, this.props.tagSort == "alpha"),
              this._type_sheet_button("Trending", "Trending [he]", function () {
                return _this2.changeSort("trending");
              }, this.props.tagSort == "trending")
            )
          )
        ) : React.createElement(
          'h2',
          null,
          React.createElement(
            'span',
            { className: 'en' },
            'All Tags'
          )
        ),
        React.createElement(TwoOrThreeBox, { content: tagList, width: this.props.width })
      )
    );
  }
});

var TagSheetsPage = React.createClass({
  displayName: 'TagSheetsPage',

  // Page list all public sheets.
  propTypes: {
    hideNavHeader: React.PropTypes.bool
  },
  componentDidMount: function componentDidMount() {
    this.ensureData();
  },
  getSheetsFromCache: function getSheetsFromCache() {
    return Sefaria.sheets.sheetsByTag(this.props.tag);
  },
  getSheetsFromAPI: function getSheetsFromAPI() {
    Sefaria.sheets.sheetsByTag(this.props.tag, this.onDataLoad);
  },
  onDataLoad: function onDataLoad(data) {
    this.forceUpdate();
  },
  ensureData: function ensureData() {
    if (!this.getSheetsFromCache()) {
      this.getSheetsFromAPI();
    }
  },
  render: function render() {
    var sheets = this.getSheetsFromCache();
    sheets = sheets ? sheets.map(function (sheet) {
      return React.createElement(PublicSheetListing, { sheet: sheet });
    }) : React.createElement(LoadingMessage, null);
    return React.createElement(
      'div',
      { className: 'content sheetList' },
      React.createElement(
        'div',
        { className: 'contentInner' },
        this.props.hideNavHeader ? React.createElement(
          'h1',
          null,
          React.createElement(
            'span',
            { className: 'en' },
            this.props.tag
          ),
          React.createElement(
            'span',
            { className: 'he' },
            this.props.tag
          )
        ) : null,
        sheets
      )
    );
  }
});

var AllSheetsPage = React.createClass({
  displayName: 'AllSheetsPage',

  // Page list all public sheets.
  // TODO this is currently loading all public sheets at once, needs pagination
  propTypes: {
    hideNavHeader: React.PropTypes.bool
  },
  componentDidMount: function componentDidMount() {
    this.ensureData();
  },
  getSheetsFromCache: function getSheetsFromCache() {
    return Sefaria.sheets.publicSheets(0);
  },
  getSheetsFromAPI: function getSheetsFromAPI() {
    Sefaria.sheets.publicSheets(0, this.onDataLoad);
  },
  onDataLoad: function onDataLoad(data) {
    this.forceUpdate();
  },
  ensureData: function ensureData() {
    if (!this.getSheetsFromCache()) {
      this.getSheetsFromAPI();
    }
  },
  render: function render() {
    var sheets = this.getSheetsFromCache();
    sheets = sheets ? sheets.map(function (sheet) {
      return React.createElement(PublicSheetListing, { sheet: sheet });
    }) : React.createElement(LoadingMessage, null);
    return React.createElement(
      'div',
      { className: 'content sheetList' },
      React.createElement(
        'div',
        { className: 'contentInner' },
        this.props.hideNavHeader ? React.createElement(
          'h1',
          null,
          React.createElement(
            'span',
            { className: 'en' },
            'All Sheets'
          ),
          React.createElement('span', { className: 'he' })
        ) : null,
        sheets
      )
    );
  }
});

var PublicSheetListing = React.createClass({
  displayName: 'PublicSheetListing',

  propTypes: {
    sheet: React.PropTypes.object.isRequired
  },
  render: function render() {
    var sheet = this.props.sheet;
    var title = sheet.title.stripHtml();
    var url = "/sheets/" + sheet.id;
    return React.createElement(
      'a',
      { className: 'sheet', href: url, key: url },
      sheet.ownerImageUrl ? React.createElement('img', { className: 'sheetImg', src: sheet.ownerImageUrl }) : null,
      React.createElement(
        'span',
        { className: 'sheetViews' },
        React.createElement('i', { className: 'fa fa-eye' }),
        ' ',
        sheet.views
      ),
      React.createElement(
        'div',
        { className: 'sheetAuthor' },
        sheet.ownerName
      ),
      React.createElement(
        'div',
        { className: 'sheetTitle' },
        title
      )
    );
  }
});

var SheetTagButton = React.createClass({
  displayName: 'SheetTagButton',

  propTypes: {
    tag: React.PropTypes.string.isRequired,
    count: React.PropTypes.number.isRequired,
    setSheetTag: React.PropTypes.func.isRequired
  },
  handleTagClick: function handleTagClick(e) {
    e.preventDefault();
    this.props.setSheetTag(this.props.tag);
  },
  render: function render() {
    return React.createElement(
      'a',
      { href: '/sheets/tag/' + this.props.tag, className: 'navButton', onClick: this.handleTagClick },
      this.props.tag,
      ' (',
      this.props.count,
      ')'
    );
  }
});

var MySheetsPage = React.createClass({
  displayName: 'MySheetsPage',

  propTypes: {
    setSheetTag: React.PropTypes.func.isRequired,
    setSheetTagSort: React.PropTypes.func.isRequired,
    multiPanel: React.PropTypes.bool,
    hideNavHeader: React.PropTypes.bool

  },
  getInitialState: function getInitialState() {
    return {
      showYourSheetTags: false,
      sheetFilterTag: null
    };
  },
  componentDidMount: function componentDidMount() {
    this.ensureData();
  },
  getSheetsFromCache: function getSheetsFromCache() {
    return Sefaria.sheets.userSheets(Sefaria._uid, null, this.props.mySheetSort);
  },
  getSheetsFromAPI: function getSheetsFromAPI() {
    Sefaria.sheets.userSheets(Sefaria._uid, this.onDataLoad, this.props.mySheetSort);
  },
  getTagsFromCache: function getTagsFromCache() {
    return Sefaria.sheets.userTagList(Sefaria._uid);
  },
  getTagsFromAPI: function getTagsFromAPI() {
    Sefaria.sheets.userSheets(Sefaria._uid, this.onDataLoad);
  },
  onDataLoad: function onDataLoad(data) {
    this.forceUpdate();
  },
  ensureData: function ensureData() {
    if (!this.getSheetsFromCache()) {
      this.getSheetsFromAPI();
    }
    if (!this.getTagsFromCache()) {
      this.getTagsFromAPI();
    }
  },
  toggleSheetTags: function toggleSheetTags() {
    this.state.showYourSheetTags ? this.setState({ showYourSheetTags: false }) : this.setState({ showYourSheetTags: true });
  },
  filterYourSheetsByTag: function filterYourSheetsByTag(tag) {
    if (tag.tag == this.state.sheetFilterTag) {
      this.setState({ sheetFilterTag: null, showYourSheetTags: false });
    } else {
      this.setState({ sheetFilterTag: tag.tag, showYourSheetTags: false });
    }
  },
  changeSortYourSheets: function changeSortYourSheets(event) {
    this.props.setMySheetSort(event.target.value);
    Sefaria.sheets.userSheets(Sefaria._uid, this.onDataLoad, event.target.value);
  },
  render: function render() {
    var sheets = this.getSheetsFromCache();
    sheets = sheets && this.state.sheetFilterTag ? sheets.filter(function (sheet) {
      return Sefaria.util.inArray(this.state.sheetFilterTag, sheet.tags) >= 0;
    }.bind(this)) : sheets;
    sheets = sheets ? sheets.map(function (sheet) {
      return React.createElement(PrivateSheetListing, { sheet: sheet, multiPanel: this.props.multiPanel, setSheetTag: this.props.setSheetTag });
    }.bind(this)) : React.createElement(LoadingMessage, null);

    var userTagList = this.getTagsFromCache();
    userTagList = userTagList ? userTagList.map(function (tag) {
      var filterThisTag = this.filterYourSheetsByTag.bind(this, tag);
      var classes = classNames({ navButton: 1, sheetButton: 1, active: this.state.sheetFilterTag == tag.tag });
      return React.createElement(
        'div',
        { className: classes, onClick: filterThisTag, key: tag.tag },
        tag.tag,
        ' (',
        tag.count,
        ')'
      );
    }.bind(this)) : null;

    return React.createElement(
      'div',
      { className: 'content sheetList' },
      React.createElement(
        'div',
        { className: 'contentInner' },
        this.props.hideNavHeader ? React.createElement(
          'h1',
          null,
          React.createElement(
            'span',
            { className: 'en' },
            'My Source Sheets'
          )
        ) : null,
        this.props.hideNavHeader ? React.createElement(
          'div',
          { className: 'sheetsNewButton' },
          React.createElement(
            'a',
            { className: 'button white', href: '/sheets/new' },
            React.createElement(
              'span',
              { className: 'en' },
              'Create a Source Sheet'
            ),
            React.createElement(
              'span',
              { className: 'he' },
              'צור דף מקורות חדש'
            )
          )
        ) : null,
        this.props.hideNavHeader ? React.createElement(
          'h2',
          { className: 'splitHeader' },
          React.createElement(
            'span',
            { className: 'en', onClick: this.toggleSheetTags },
            'Filter By Tag ',
            React.createElement('i', { className: 'fa fa-angle-down' })
          ),
          React.createElement(
            'span',
            { className: 'en actionText' },
            'Sort By:',
            React.createElement(
              'select',
              { value: this.props.mySheetSort, onChange: this.changeSortYourSheets },
              React.createElement(
                'option',
                { value: 'date' },
                'Recent'
              ),
              React.createElement(
                'option',
                { value: 'views' },
                'Most Viewed'
              )
            ),
            ' ',
            React.createElement('i', { className: 'fa fa-angle-down' })
          )
        ) : null,
        this.state.showYourSheetTags ? React.createElement(TwoOrThreeBox, { content: userTagList, width: this.props.width }) : null,
        sheets
      )
    );
  }
});

var PrivateSheetListing = React.createClass({
  displayName: 'PrivateSheetListing',

  propTypes: {
    sheet: React.PropTypes.object.isRequired,
    multiPanel: React.PropTypes.bool,
    setSheetTag: React.PropTypes.func.isRequired
  },
  render: function render() {
    var sheet = this.props.sheet;
    var editSheetTags = function () {
      console.log(sheet.id);
    }.bind(this);
    var title = sheet.title.stripHtml();
    var url = "/sheets/" + sheet.id;

    if (sheet.tags === undefined) sheet.tags = [];
    var tagString = sheet.tags.map(function (tag) {
      return React.createElement(SheetTagLink, { setSheetTag: this.props.setSheetTag, tag: tag, key: tag });
    }, this);

    if (this.props.multiPanel) {
      return React.createElement(
        'div',
        { className: 'sheet userSheet', href: url, key: url },
        React.createElement(
          'a',
          { className: 'sheetEditButtons', href: url },
          React.createElement(
            'span',
            null,
            React.createElement('i', { className: 'fa fa-pencil' }),
            ' '
          )
        ),
        React.createElement(
          'div',
          { className: 'sheetEditButtons', onClick: editSheetTags },
          React.createElement(
            'span',
            null,
            React.createElement('i', { className: 'fa fa-tag' }),
            ' '
          )
        ),
        React.createElement(
          'a',
          { className: 'sheetTitle', href: url },
          title
        ),
        React.createElement(
          'div',
          null,
          sheet.views,
          ' Views · ',
          sheet.modified,
          ' · ',
          React.createElement(
            'span',
            { className: 'tagString' },
            tagString
          )
        )
      );
    } else {
      return React.createElement(
        'a',
        { className: 'sheet userSheet', href: url, key: url },
        React.createElement(
          'div',
          { className: 'sheetTitle' },
          title
        ),
        React.createElement(
          'div',
          null,
          sheet.views,
          ' Views · ',
          sheet.modified,
          ' · ',
          tagString
        )
      );
    }
  }
});

var SheetTagLink = React.createClass({
  displayName: 'SheetTagLink',

  propTypes: {
    tag: React.PropTypes.string.isRequired,
    setSheetTag: React.PropTypes.func.isRequired
  },
  handleTagClick: function handleTagClick(e) {
    e.preventDefault();
    this.props.setSheetTag(this.props.tag);
  },
  render: function render() {
    return React.createElement(
      'a',
      { href: '/sheets/tag/' + this.props.tag, onClick: this.handleTagClick },
      this.props.tag
    );
  }
});

var ToggleSet = React.createClass({
  displayName: 'ToggleSet',

  // A set of options grouped together.
  propTypes: {
    name: React.PropTypes.string.isRequired,
    setOption: React.PropTypes.func.isRequired,
    currentLayout: React.PropTypes.func,
    settings: React.PropTypes.object.isRequired,
    options: React.PropTypes.array.isRequired,
    separated: React.PropTypes.bool
  },
  render: function render() {
    var classes = { toggleSet: 1, separated: this.props.separated };
    classes[this.props.name] = 1;
    classes = classNames(classes);
    var value = this.props.name === "layout" ? this.props.currentLayout() : this.props.settings[this.props.name];
    var width = 100.0 - (this.props.separated ? (this.props.options.length - 1) * 3 : 0);
    var style = { width: width / this.props.options.length + "%" };
    return React.createElement(
      'div',
      { className: classes },
      this.props.options.map(function (option) {
        return React.createElement(ToggleOption, {
          name: option.name,
          key: option.name,
          set: this.props.name,
          on: value == option.name,
          setOption: this.props.setOption,
          style: style,
          image: option.image,
          fa: option.fa,
          content: option.content });
      }.bind(this))
    );
  }
});

var ToggleOption = React.createClass({
  displayName: 'ToggleOption',

  // A single option in a ToggleSet
  handleClick: function handleClick() {
    this.props.setOption(this.props.set, this.props.name);
    if (Sefaria.site) {
      Sefaria.site.track.event("Reader", "Display Option Click", this.props.set + " - " + this.props.name);
    }
  },
  render: function render() {
    var classes = { toggleOption: 1, on: this.props.on };
    classes[this.props.name] = 1;
    classes = classNames(classes);
    var content = this.props.image ? React.createElement('img', { src: this.props.image }) : this.props.fa ? React.createElement('i', { className: "fa fa-" + this.props.fa }) : React.createElement('span', { dangerouslySetInnerHTML: { __html: this.props.content } });
    return React.createElement(
      'div',
      {
        className: classes,
        style: this.props.style,
        onClick: this.handleClick },
      content
    );
  }
});

var ReaderNavigationMenuSearchButton = React.createClass({
  displayName: 'ReaderNavigationMenuSearchButton',

  render: function render() {
    return React.createElement(
      'span',
      { className: 'readerNavMenuSearchButton', onClick: this.props.onClick },
      React.createElement('i', { className: 'fa fa-search' })
    );
  }
});

var ReaderNavigationMenuMenuButton = React.createClass({
  displayName: 'ReaderNavigationMenuMenuButton',

  render: function render() {
    var icon = this.props.compare ? React.createElement('i', { className: 'fa fa-arrow-left' }) : React.createElement('i', { className: 'fa fa-bars' });
    return React.createElement(
      'span',
      { className: 'readerNavMenuMenuButton', onClick: this.props.onClick },
      icon
    );
  }
});

var ReaderNavigationMenuCloseButton = React.createClass({
  displayName: 'ReaderNavigationMenuCloseButton',

  render: function render() {
    var icon = this.props.icon === "arrow" ? React.createElement('i', { className: 'fa fa-caret-left' }) : "×";
    var classes = classNames({ readerNavMenuCloseButton: 1, arrow: this.props.icon === "arrow" });
    return React.createElement(
      'div',
      { className: classes, onClick: this.props.onClick },
      icon
    );
  }
});

var ReaderNavigationMenuDisplaySettingsButton = React.createClass({
  displayName: 'ReaderNavigationMenuDisplaySettingsButton',

  render: function render() {
    return React.createElement(
      'div',
      { className: 'readerOptions', onClick: this.props.onClick },
      React.createElement('img', { src: '/static/img/ayealeph.svg' })
    );
  }
});

var CategoryColorLine = React.createClass({
  displayName: 'CategoryColorLine',

  render: function render() {
    var style = { backgroundColor: Sefaria.palette.categoryColor(this.props.category) };
    return React.createElement('div', { className: 'categoryColorLine', style: style });
  }
});

var TextColumn = React.createClass({
  displayName: 'TextColumn',

  // An infinitely scrollable column of text, composed of TextRanges for each section.
  propTypes: {
    srefs: React.PropTypes.array.isRequired,
    version: React.PropTypes.string,
    versionLanguage: React.PropTypes.string,
    highlightedRefs: React.PropTypes.array,
    basetext: React.PropTypes.bool,
    withContext: React.PropTypes.bool,
    loadLinks: React.PropTypes.bool,
    prefetchNextPrev: React.PropTypes.bool,
    openOnClick: React.PropTypes.bool,
    lowlight: React.PropTypes.bool,
    multiPanel: React.PropTypes.bool,
    mode: React.PropTypes.string,
    settings: React.PropTypes.object,
    showBaseText: React.PropTypes.func,
    updateTextColumn: React.PropTypes.func,
    onSegmentClick: React.PropTypes.func,
    onCitationClick: React.PropTypes.func,
    setTextListHightlight: React.PropTypes.func,
    setSelectedWords: React.PropTypes.func,
    onTextLoad: React.PropTypes.func,
    panelsOpen: React.PropTypes.number,
    layoutWidth: React.PropTypes.number
  },
  componentDidMount: function componentDidMount() {
    this.initialScrollTopSet = false;
    this.justTransitioned = true;
    this.debouncedAdjustTextListHighlight = Sefaria.util.debounce(this.adjustTextListHighlight, 100);
    var node = ReactDOM.findDOMNode(this);
    node.addEventListener("scroll", this.handleScroll);
    this.setScrollPosition();
    this.adjustInfiniteScroll();
  },
  componentWillUnmount: function componentWillUnmount() {
    var node = ReactDOM.findDOMNode(this);
    node.removeEventListener("scroll", this.handleScroll);
  },
  componentWillReceiveProps: function componentWillReceiveProps(nextProps) {
    if (this.props.mode === "Text" && nextProps.mode === "TextAndConnections") {
      // When moving into text and connections, scroll to highlighted
      this.justTransitioned = true;
      this.scrolledToHighlight = false;
      this.initialScrollTopSet = true;
    } else if (this.props.mode === "TextAndConnections" && nextProps.mode === "TextAndConnections") {
      // Don't mess with scroll position within Text and Connections mode
      if (this.justTransitioned) {
        this.justTransitioned = false;
      } else if (!this.initialScrollTopSet) {
        this.scrolledToHighlight = true;
      }
    } else if (this.props.mode === "TextAndConnections" && nextProps.mode === "Text") {
      // Don't mess with scroll position within Text and Connections mode
      this.scrolledToHighlight = true;
      this.initialScrollTopSet = true;
    } else if (this.props.panelsOpen !== nextProps.panelsOpen) {
      this.scrolledToHighlight = false;
    } else if (nextProps.srefs.length == 1 && Sefaria.util.inArray(nextProps.srefs[0], this.props.srefs) == -1) {
      // If we are switching to a single ref not in the current TextColumn, treat it as a fresh open.
      this.initialScrollTopSet = false;
      this.scrolledToHighlight = false;
      this.loadingContentAtTop = false;
    }
  },
  componentDidUpdate: function componentDidUpdate(prevProps, prevState) {
    if (!this.props.highlightedRefs.compare(prevProps.highlightedRefs)) {
      this.setScrollPosition(); // highlight change
    }
    if (this.props.layoutWidth !== prevProps.layoutWidth || this.props.settings.language !== prevProps.settings.language) {
      this.scrollToHighlighted();
    }
  },
  handleScroll: function handleScroll(event) {
    if (this.justScrolled) {
      this.justScrolled = false;
      return;
    }
    if (this.props.highlightedRefs.length) {
      this.debouncedAdjustTextListHighlight();
    }
    this.adjustInfiniteScroll();
  },
  handleTextSelection: function handleTextSelection() {
    var selection = window.getSelection();

    if (selection.type === "Range") {
      var $start = $(Sefaria.util.getSelectionBoundaryElement(true)).closest(".segment");
      var $end = $(Sefaria.util.getSelectionBoundaryElement(false)).closest(".segment");
      var $segments = $start.is($end) ? $start : $start.nextUntil($end, ".segment").add($start).add($end);
      var refs = [];

      $segments.each(function () {
        refs.push($(this).attr("data-ref"));
      });

      this.props.setTextListHightlight(refs);
    }
    console.log("Currently selected words: " + selection.toString());
    this.props.setSelectedWords(selection.toString());
  },
  handleTextLoad: function handleTextLoad() {
    if (this.loadingContentAtTop || !this.initialScrollTopSet) {
      console.log("text load, setting scroll");
      this.setScrollPosition();
    }
    console.log("text load, ais");
    this.adjustInfiniteScroll();
  },
  setScrollPosition: function setScrollPosition() {
    console.log("ssp");
    // Called on every update, checking flags on `this` to see if scroll position needs to be set
    if (this.loadingContentAtTop) {
      // After adding content by infinite scrolling up, scroll back to what the user was just seeing
      console.log("loading at top");
      var $node = $(ReactDOM.findDOMNode(this));
      var adjust = 118; // Height of .loadingMessage.base
      var $texts = $node.find(".basetext");
      if ($texts.length < 2) {
        return;
      }
      var top = $texts.eq(1).position().top + $node.scrollTop() - adjust;
      if (!$texts.eq(0).hasClass("loading")) {
        this.loadingContentAtTop = false;
        this.initialScrollTopSet = true;
        this.justScrolled = true;
        ReactDOM.findDOMNode(this).scrollTop = top;
        this.scrollToHighlighted();
        //console.log(top)
      }
    } else if (!this.scrolledToHighlight && $(ReactDOM.findDOMNode(this)).find(".segment.highlight").length) {
        //console.log("scroll to highlighted")
        // scroll to highlighted segment
        this.scrollToHighlighted();
        this.scrolledToHighlight = true;
        this.initialScrollTopSet = true;
      } else if (!this.initialScrollTopSet) {
        //console.log("initial scroll to 30")
        // initial value set below 0 so you can scroll up for previous
        var node = ReactDOM.findDOMNode(this);
        node.scrollTop = 30;
        this.initialScrollTopSet = true;
      }
    // This fixes loading of next content when current content is short in viewport,
    // but breaks loading highlighted ref, jumping back up to top of section
    // this.adjustInfiniteScroll();
  },
  adjustInfiniteScroll: function adjustInfiniteScroll() {
    // Add or remove TextRanges from the top or bottom, depending on scroll position
    console.log("adjust Infinite Scroll");
    if (!this.isMounted()) {
      return;
    }
    var node = ReactDOM.findDOMNode(this);
    var refs = this.props.srefs;
    var $lastText = $(node).find(".textRange.basetext").last();
    if (!$lastText.length) {
      console.log("no last basetext");return;
    }
    var lastTop = $lastText.position().top;
    var lastBottom = lastTop + $lastText.outerHeight();
    var windowHeight = $(node).outerHeight();
    var windowTop = node.scrollTop;
    var windowBottom = windowTop + windowHeight;
    if (lastTop > windowHeight + 100 && refs.length > 1) {
      // Remove a section scrolled out of view on bottom
      refs = refs.slice(0, -1);
      this.props.updateTextColumn(refs);
    } else if (lastBottom < windowHeight + 80) {
      // DOWN: add the next section to bottom
      if ($lastText.hasClass("loading")) {
        console.log("last text is loading - don't add next section");
        return;
      }
      console.log("Down! Add next section");
      var currentRef = refs.slice(-1)[0];
      var data = Sefaria.ref(currentRef);
      if (data && data.next) {
        refs.push(data.next);
        this.props.updateTextColumn(refs);
        if (Sefaria.site) {
          Sefaria.site.track.event("Reader", "Infinite Scroll", "Down");
        }
      }
    } else if (windowTop < 21 && !this.loadingContentAtTop) {
      // UP: add the previous section above then adjust scroll position so page doesn't jump
      var topRef = refs[0];
      var data = Sefaria.ref(topRef);
      if (data && data.prev) {
        console.log("Up! Add previous section");
        refs.splice(refs, 0, data.prev);
        this.loadingContentAtTop = true;
        this.props.updateTextColumn(refs);
        if (Sefaria.site) {
          Sefaria.site.track.event("Reader", "Infinite Scroll", "Up");
        }
      }
    } else {
      // nothing happens
    }
  },
  adjustTextListHighlight: function adjustTextListHighlight() {
    console.log("atlh");
    // When scrolling while the TextList is open, update which segment should be highlighted.
    if (this.props.multipanel && this.props.layoutWidth == 100) {
      return; // Hacky - don't move around highlighted segment when scrolling a single panel,
    }
    // but we do want to keep the highlightedRefs value in the panel
    // so it will return to the right location after closing other panels.
    var adjustTextListHighlightInner = function () {
      //var start = new Date();
      if (!this.isMounted()) {
        return;
      }
      var $container = $(ReactDOM.findDOMNode(this));
      var $readerPanel = $container.closest(".readerPanel");
      var viewport = $container.outerHeight() - $readerPanel.find(".textList").outerHeight();
      var center = viewport / 2;
      var midTop = 300;
      var threshhold = this.props.multiPanel ? midTop : center;
      $container.find(".basetext .segment").each(function (i, segment) {
        var $segment = $(segment);
        if ($segment.offset().top + $segment.outerHeight() > threshhold) {
          var ref = $segment.attr("data-ref");
          this.props.setTextListHightlight(ref);
          //var end = new Date();
          //elapsed = end - start;
          //console.log("Adjusted Text Highlight in: " + elapsed);
          return false;
        }
      }.bind(this));
    }.bind(this);

    adjustTextListHighlightInner();
    //window.requestAnimationFrame(adjustTextListHighlightInner);

    /*
    // Caching segment heights
    // Incomplete, needs to update on infinite scroll, window resize
    // Not clear there's a great perfomance benefit
    if (!this.state.segmentHeights) {
      this.state.segmentHeights = [];
      $readerPanel.find(".basetext .segment").each(function(i, segment) {
        var $segment = $(segment);
        var top = $segment.offset().top;
        this.state.segmentHeights.push({
            top: top,
            bottom: top + $segment.outerHeight(),
            ref: $segment.attr("data-ref")})
      }.bind(this));
      this.setState(this.state);    
    }
     for (var i = 0; i < this.state.segmentHeights.length; i++) {
      var segment = this.state.segmentHeights[i];
      if (segment.bottom > center) {
        this.showTextList(segment.ref);
        return;
      }
    }
    */
  },
  scrollToHighlighted: function scrollToHighlighted() {
    window.requestAnimationFrame(function () {
      var $container = $(ReactDOM.findDOMNode(this));
      var $readerPanel = $container.closest(".readerPanel");
      var $highlighted = $container.find(".segment.highlight").first();
      if ($highlighted.length) {
        var height = $highlighted.outerHeight();
        var viewport = $container.outerHeight() - $readerPanel.find(".textList").outerHeight();
        var offset = height > viewport + 80 ? 80 : (viewport - height) / 2;
        this.justScrolled = true;
        $container.scrollTo($highlighted, 0, { offset: -offset });
      }
    }.bind(this));
  },
  render: function render() {
    var classes = classNames({ textColumn: 1, connectionsOpen: this.props.mode === "TextAndConnections" });
    var content = this.props.srefs.map(function (ref, k) {
      return React.createElement(TextRange, {
        sref: ref,
        version: this.props.version,
        versionLanguage: this.props.versionLanguage,
        highlightedRefs: this.props.highlightedRefs,
        basetext: true,
        withContext: true,
        loadLinks: true,
        prefetchNextPrev: true,
        settings: this.props.settings,
        setOption: this.props.setOption,
        showBaseText: this.props.showBaseText,
        onSegmentClick: this.props.onSegmentClick,
        onCitationClick: this.props.onCitationClick,
        onTextLoad: this.handleTextLoad,
        filter: this.props.filter,
        panelsOpen: this.props.panelsOpen,
        layoutWidth: this.props.layoutWidth,
        key: k + ref });
    }.bind(this));

    if (content.length) {
      // Add Next and Previous loading indicators
      var first = Sefaria.ref(this.props.srefs[0]);
      var last = Sefaria.ref(this.props.srefs.slice(-1)[0]);
      var hasPrev = first && first.prev;
      var hasNext = last && last.next;
      var topSymbol = " ";
      var bottomSymbol = " ";
      if (hasPrev && INBROWSER) {
        content.splice(0, 0, React.createElement(LoadingMessage, { className: 'base prev', key: 'prev' }));
      } else {
        content.splice(0, 0, React.createElement(LoadingMessage, { message: topSymbol, heMessage: topSymbol, className: 'base prev', key: 'prev' }));
      }
      if (hasNext) {
        content.push(React.createElement(LoadingMessage, { className: 'base next', key: 'next' }));
      } else {
        content.push(React.createElement(LoadingMessage, { message: bottomSymbol, heMessage: bottomSymbol, className: 'base next final', key: 'next' }));
      }
    }

    return React.createElement(
      'div',
      { className: classes, onMouseUp: this.handleTextSelection },
      content
    );
  }
});

var TextRange = React.createClass({
  displayName: 'TextRange',

  // A Range or text defined a by a single Ref. Specially treated when set as 'basetext'.
  // This component is responsible for retrieving data from `Sefaria` for the ref that defines it.
  propTypes: {
    sref: React.PropTypes.string.isRequired,
    version: React.PropTypes.string,
    versionLanguage: React.PropTypes.string,
    highlightedRefs: React.PropTypes.array,
    basetext: React.PropTypes.bool,
    withContext: React.PropTypes.bool,
    hideTitle: React.PropTypes.bool,
    loadLinks: React.PropTypes.bool,
    prefetchNextPrev: React.PropTypes.bool,
    openOnClick: React.PropTypes.bool,
    lowlight: React.PropTypes.bool,
    numberLabel: React.PropTypes.number,
    settings: React.PropTypes.object,
    filter: React.PropTypes.array,
    onTextLoad: React.PropTypes.func,
    onRangeClick: React.PropTypes.func,
    onSegmentClick: React.PropTypes.func,
    onCitationClick: React.PropTypes.func,
    onNavigationClick: React.PropTypes.func,
    onCompareClick: React.PropTypes.func,
    onOpenConnectionsClick: React.PropTypes.func,
    panelsOpen: React.PropTypes.number,
    layoutWidth: React.PropTypes.number,
    showActionLinks: React.PropTypes.bool
  },
  componentDidMount: function componentDidMount() {
    var data = this.getText();
    if (data && !this.dataPrefetched) {
      // If data was populated server side, onTextLoad was never called
      this.onTextLoad(data);
    }
    if (this.props.basetext || this.props.segmentNumber) {
      this.placeSegmentNumbers();
    }
    window.addEventListener('resize', this.handleResize);
  },
  componentWillUnmount: function componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize);
  },
  componentDidUpdate: function componentDidUpdate(prevProps, prevState) {
    /* Doesn't seem to be need in addition to below
    // Reload text if version changed
    if (this.props.version != prevProps.version || this.props.versionLanguage != prevProps.versionLanguage) {
      this.getText(true);
    }
    */
    // Place segment numbers again if update affected layout
    if (this.props.basetext || this.props.segmentNumber) {
      if (this.props.version != prevProps.version || this.props.versionLanguage != prevProps.versionLanguage || prevProps.settings.language !== this.props.settings.language || prevProps.settings.layoutDefault !== this.props.settings.layoutDefault || prevProps.settings.layoutTanakh !== this.props.settings.layoutTanakh || prevProps.settings.layoutTalmud !== this.props.settings.layoutTalmud || prevProps.settings.fontSize !== this.props.settings.fontSize || prevProps.layoutWidth !== this.props.layoutWidth) {
        // Rerender in case version has changed
        this.forceUpdate();
        // TODO: are these animationFrames still needed?
        window.requestAnimationFrame(function () {
          if (this.isMounted()) {
            this.placeSegmentNumbers();
          }
        }.bind(this));
      }
    }
  },
  handleResize: function handleResize() {
    if (this.props.basetext || this.props.segmentNumber) {
      this.placeSegmentNumbers();
    }
  },
  handleClick: function handleClick(event) {
    if (window.getSelection().type === "Range") {
      // Don't do anything if this click is part of a selection
      return;
    }
    if (this.props.onRangeClick) {
      //Click on the body of the TextRange itself from TextList
      this.props.onRangeClick(this.props.sref);
      if (Sefaria.site) {
        Sefaria.site.track.event("Reader", "Click Text from TextList", this.props.sref);
      }
    }
  },
  getText: function getText() {
    var settings = {
      context: this.props.withContext ? 1 : 0,
      version: this.props.version || null,
      language: this.props.versionLanguage || null
    };
    var data = Sefaria.text(this.props.sref, settings);
    if (!data) {
      // If we don't have data yet, call again with a callback to trigger API call
      Sefaria.text(this.props.sref, settings, this.onTextLoad);
    }
    return data;
  },
  onTextLoad: function onTextLoad(data) {
    console.log("onTextLoad in TextColumn");
    // Initiate additional API calls when text data first loads
    if (this.props.basetext && this.props.sref !== data.ref) {
      // Replace ReaderPanel contents ref with the normalized form of the ref, if they differ.
      // Pass parameter to showBaseText to replaceHistory - normalization should't add a step to history
      this.props.showBaseText(data.ref, true);
      return;
    }

    this.prefetchData();

    if (this.props.onTextLoad) {
      this.props.onTextLoad();
    }

    if (this.isMounted()) {
      this.forceUpdate();
      this.placeSegmentNumbers();
    }
  },
  prefetchData: function prefetchData() {
    // Prefetch addtional data (next, prev, links, notes etc) for this ref
    if (this.dataPrefetched) {
      return;
    }

    var data = this.getText();
    if (!data) {
      return;
    }

    // Load links at section level if spanning, so that cache is properly primed with section level refs
    var sectionRefs = data.isSpanning ? data.spanningRefs : [data.sectionRef];
    sectionRefs = sectionRefs.map(function (ref) {
      if (ref.indexOf("-") > -1) {
        ref = ref.split("-")[0];
        ref = ref.slice(0, ref.lastIndexOf(":"));
      }
      return ref;
    });

    if (this.props.loadLinks && !Sefaria.linksLoaded(sectionRefs)) {
      for (var i = 0; i < sectionRefs.length; i++) {
        Sefaria.related(sectionRefs[i], function () {
          if (this.isMounted()) {
            this.forceUpdate();
          }
        }.bind(this));
      }
    }

    if (this.props.prefetchNextPrev) {
      if (data.next) {
        Sefaria.text(data.next, {
          context: 1,
          version: this.props.version || null,
          language: this.props.versionLanguage || null
        }, function () {});
      }
      if (data.prev) {
        Sefaria.text(data.prev, {
          context: 1,
          version: this.props.version || null,
          language: this.props.versionLanguage || null
        }, function () {});
      }
      if (data.book) {
        Sefaria.textTocHtml(data.book, function () {});
      }
    }
    this.dataPrefetched = true;
  },
  makeSegments: function makeSegments(data) {
    // Returns a flat list of annotated segment objects,
    // derived from the walking the text in data
    if (!data || "error" in data) {
      return [];
    }
    var segments = [];
    var highlight = data.sections.length === data.textDepth;
    var wrap = typeof data.text == "string";
    var en = wrap ? [data.text] : data.text;
    var he = wrap ? [data.he] : data.he;
    var topLength = Math.max(en.length, he.length);
    en = en.pad(topLength, "");
    he = he.pad(topLength, "");

    var start = data.textDepth == data.sections.length && !this.props.withContext ? data.sections.slice(-1)[0] : 1;

    if (!data.isSpanning) {
      for (var i = 0; i < topLength; i++) {
        var number = i + start;
        var delim = data.textDepth == 1 ? " " : ":";
        var ref = data.sectionRef + delim + number;
        segments.push({
          ref: ref,
          en: en[i],
          he: he[i],
          number: number,
          highlight: highlight && number >= data.sections.slice(-1)[0] && number <= data.toSections.slice(-1)[0]
        });
      }
    } else {
      for (var n = 0; n < topLength; n++) {
        var en2 = typeof en[n] == "string" ? [en[n]] : en[n];
        var he2 = typeof he[n] == "string" ? [he[n]] : he[n];
        var length = Math.max(en2.length, he2.length);
        en2 = en2.pad(length, "");
        he2 = he2.pad(length, "");
        var baseRef = data.book;
        var baseSection = data.sections.slice(0, -2).join(":");
        var delim = baseSection ? ":" : " ";
        var baseRef = baseSection ? baseRef + " " + baseSection : baseRef;

        start = n == 0 ? start : 1;
        for (var i = 0; i < length; i++) {
          var section = n + data.sections.slice(-2)[0];
          var number = i + start;
          var ref = baseRef + delim + section + ":" + number;
          segments.push({
            ref: ref,
            en: en2[i],
            he: he2[i],
            number: number,
            highlight: highlight && (n == 0 && number >= data.sections.slice(-1)[0] || n == topLength - 1 && number <= data.toSections.slice(-1)[0] || n > 0 && n < topLength - 1)
          });
        }
      }
    }
    return segments;
  },
  placeSegmentNumbers: function placeSegmentNumbers() {
    // Set the vertical offsets for segment numbers and link counts, which are dependent
    // on the rendered height of the text of each segment.
    var $text = $(ReactDOM.findDOMNode(this));
    var elemsAtPosition = {}; // Keyed by top position, an array of elements found there
    var setTop = function setTop() {
      var $elem = $(this);
      var top = $elem.parent().position().top;
      $elem.css({ top: top });
      var list = elemsAtPosition[top] || [];
      list.push($elem);
      elemsAtPosition[top] = list;
    };
    $text.find(".linkCount").each(setTop);
    elemsAtPosition = {}; // resetting because we only want it to track segmentNumbers
    $text.find(".segmentNumber").each(setTop).show();
    var fixCollision = function fixCollision($elems) {
      // Takes an array of jQuery elements that all currenlty appear at the same top position
      if ($elems.length == 1) {
        return;
      }
      if ($elems.length == 2) {
        var adjust = 8;
        $elems[0].css({ top: "-=" + adjust });
        $elems[1].css({ top: "+=" + adjust });
      }
      /* Sketching a general solution for any number of elements, incomplete.
      var halfOrLess = Math.floor($elems.length / 2);
      var above = $elems.slice(0, halfOrLess);
      var below = $elems.slice(-halfOrLess);
      for (var i = 0; i < halfOrLess; i++) {
       }
      */
    };
    for (var top in elemsAtPosition) {
      if (elemsAtPosition.hasOwnProperty(top)) {
        fixCollision(elemsAtPosition[top]);
      }
    }
    $text.find(".segmentNumber").show();
    $text.find(".linkCount").show();
  },
  render: function render() {
    var data = this.getText();
    if (data && this.props.basetext) {
      var ref = this.props.withContext ? data.sectionRef : data.ref;
      var sectionStrings = Sefaria.sectionString(ref);
      var oref = Sefaria.ref(ref);
      var useShortString = oref && Sefaria.util.inArray(oref.categories[0], ["Tanakh", "Mishnah", "Talmud", "Tosefta", "Commentary"]) !== -1;
      var title = useShortString ? sectionStrings.en.numbered : sectionStrings.en.named;
      var heTitle = useShortString ? sectionStrings.he.numbered : sectionStrings.he.named;
    } else if (data && !this.props.basetext) {
      var title = data.ref;
      var heTitle = data.heRef;
    } else if (!data) {
      var title = "Loading...";
      var heTitle = "טעינה...";
    }
    var showNumberLabel = data && data.categories && data.categories[0] !== "Talmud" && data.categories[0] !== "Liturgy";

    var showSegmentNumbers = showNumberLabel && this.props.basetext;

    var segments = this.makeSegments(data);
    var textSegments = segments.map(function (segment, i) {
      var highlight = this.props.highlightedRefs && this.props.highlightedRefs.length ? // if highlighted refs are explicitly set
      Sefaria.util.inArray(segment.ref, this.props.highlightedRefs) !== -1 : // highlight if this ref is in highlighted refs prop
      this.props.basetext && segment.highlight; // otherwise highlight if this a basetext and the ref is specific
      return React.createElement(TextSegment, {
        sref: segment.ref,
        en: segment.en,
        he: segment.he,
        highlight: highlight,
        segmentNumber: showSegmentNumbers ? segment.number : 0,
        showLinkCount: this.props.basetext,
        filter: this.props.filter,
        onSegmentClick: this.props.onSegmentClick,
        onCitationClick: this.props.onCitationClick,
        key: i + segment.ref });
    }.bind(this));
    textSegments = textSegments.length ? textSegments : this.props.basetext ? "" : React.createElement(LoadingMessage, null);
    var classes = {
      textRange: 1,
      basetext: this.props.basetext,
      loading: !data,
      lowlight: this.props.lowlight
    };
    classes = classNames(classes);

    var open = function () {
      this.props.onNavigationClick(this.props.sref);
    }.bind(this);
    var compare = function () {
      this.props.onCompareClick(this.props.sref);
    }.bind(this);
    var connections = function () {
      this.props.onOpenConnectionsClick([this.props.sref]);
    }.bind(this);

    var actionLinks = React.createElement(
      'div',
      { className: 'actionLinks' },
      React.createElement(
        'span',
        { className: 'openLink', onClick: open },
        React.createElement('img', { src: '/static/img/open-64.png' }),
        React.createElement(
          'span',
          { className: 'en' },
          'Open'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'פתח'
        )
      ),
      React.createElement(
        'span',
        { className: 'compareLink', onClick: compare },
        React.createElement('img', { src: '/static/img/compare-64.png' }),
        React.createElement(
          'span',
          { className: 'en' },
          'Compare'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'השווה'
        )
      ),
      React.createElement(
        'span',
        { className: 'connectionsLink', onClick: connections },
        React.createElement('i', { className: 'fa fa-link' }),
        React.createElement(
          'span',
          { className: 'en' },
          'Connections'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'קשרים'
        )
      )
    );
    return React.createElement(
      'div',
      { className: classes, onClick: this.handleClick },
      showNumberLabel && this.props.numberLabel ? React.createElement(
        'div',
        { className: 'numberLabel sans' },
        React.createElement(
          'span',
          { className: 'numberLabelInner' },
          React.createElement(
            'span',
            { className: 'en' },
            this.props.numberLabel
          ),
          React.createElement(
            'span',
            { className: 'he' },
            Sefaria.hebrew.encodeHebrewNumeral(this.props.numberLabel)
          )
        )
      ) : null,
      this.props.hideTitle ? "" : React.createElement(
        'div',
        { className: 'title' },
        React.createElement(
          'div',
          { className: 'titleBox' },
          React.createElement(
            'span',
            { className: 'en' },
            title
          ),
          React.createElement(
            'span',
            { className: 'he' },
            heTitle
          )
        )
      ),
      React.createElement(
        'div',
        { className: 'text' },
        React.createElement(
          'div',
          { className: 'textInner' },
          textSegments,
          this.props.showActionLinks ? actionLinks : null
        )
      )
    );
  }
});

var TextSegment = React.createClass({
  displayName: 'TextSegment',

  propTypes: {
    sref: React.PropTypes.string,
    en: React.PropTypes.string,
    he: React.PropTypes.string,
    highlight: React.PropTypes.bool,
    segmentNumber: React.PropTypes.number,
    showLinkCount: React.PropTypes.bool,
    filter: React.PropTypes.array,
    onCitationClick: React.PropTypes.func,
    onSegmentClick: React.PropTypes.func
  },
  handleClick: function handleClick(event) {
    if ($(event.target).hasClass("refLink")) {
      //Click of citation
      var ref = Sefaria.humanRef($(event.target).attr("data-ref"));
      this.props.onCitationClick(ref, this.props.sref);
      event.stopPropagation();
      if (Sefaria.site) {
        Sefaria.site.track.event("Reader", "Citation Link Click", ref);
      }
    } else if (this.props.onSegmentClick) {
      this.props.onSegmentClick(this.props.sref);
      if (Sefaria.site) {
        Sefaria.site.track.event("Reader", "Text Segment Click", this.props.sref);
      }
    }
  },
  render: function render() {
    if (this.props.showLinkCount) {
      var linkCount = Sefaria.linkCount(this.props.sref, this.props.filter);
      var minOpacity = 20,
          maxOpacity = 70;
      var linkScore = linkCount ? Math.min(linkCount + minOpacity, maxOpacity) / 100.0 : 0;
      var style = { opacity: linkScore };
      var linkCount = this.props.showLinkCount ? React.createElement(
        'div',
        { className: 'linkCount sans' },
        React.createElement(
          'span',
          { className: 'en' },
          React.createElement('span', { className: 'linkCountDot', style: style })
        ),
        React.createElement(
          'span',
          { className: 'he' },
          React.createElement('span', { className: 'linkCountDot', style: style })
        )
      ) : null;
    } else {
      var linkCount = "";
    }
    var segmentNumber = this.props.segmentNumber ? React.createElement(
      'div',
      { className: 'segmentNumber sans' },
      React.createElement(
        'span',
        { className: 'en' },
        ' ',
        React.createElement(
          'span',
          { className: 'segmentNumberInner' },
          this.props.segmentNumber
        ),
        ' '
      ),
      React.createElement(
        'span',
        { className: 'he' },
        ' ',
        React.createElement(
          'span',
          { className: 'segmentNumberInner' },
          Sefaria.hebrew.encodeHebrewNumeral(this.props.segmentNumber)
        ),
        ' '
      )
    ) : null;
    var he = this.props.he || "";
    var en = this.props.en || "";
    var classes = classNames({ segment: 1,
      highlight: this.props.highlight,
      heOnly: !this.props.en,
      enOnly: !this.props.he });
    return React.createElement(
      'span',
      { className: classes, onClick: this.handleClick, 'data-ref': this.props.sref },
      segmentNumber,
      linkCount,
      React.createElement('span', { className: 'he', dangerouslySetInnerHTML: { __html: he + " " } }),
      React.createElement('span', { className: 'en', dangerouslySetInnerHTML: { __html: en + " " } })
    );
  }
});

var ConnectionsPanel = React.createClass({
  displayName: 'ConnectionsPanel',

  propTypes: {
    srefs: React.PropTypes.array.isRequired, // an array of ref strings
    filter: React.PropTypes.array.isRequired,
    recentFilters: React.PropTypes.array.isRequired,
    mode: React.PropTypes.string.isRequired, // "Connections", "Tools", etc. called `connectionsMode` above
    setFilter: React.PropTypes.func.isRequired,
    setConnectionsMode: React.PropTypes.func.isRequired,
    editNote: React.PropTypes.func.isRequired,
    openComparePanel: React.PropTypes.func.isRequired,
    version: React.PropTypes.string,
    versionLanguage: React.PropTypes.string,
    noteBeingEdited: React.PropTypes.object,
    fullPanel: React.PropTypes.bool,
    multiPanel: React.PropTypes.bool,
    canEditText: React.PropTypes.bool,
    onTextClick: React.PropTypes.func,
    onCitationClick: React.PropTypes.func,
    onNavigationClick: React.PropTypes.func,
    onCompareClick: React.PropTypes.func,
    onOpenConnectionsClick: React.PropTypes.func,
    openNav: React.PropTypes.func,
    openDisplaySettings: React.PropTypes.func,
    closePanel: React.PropTypes.func,
    toggleLanguage: React.PropTypes.func,
    selectedWords: React.PropTypes.string
  },
  render: function render() {
    var content = null;
    if (this.props.mode == "Connections") {
      content = React.createElement(TextList, {
        srefs: this.props.srefs,
        filter: this.props.filter,
        recentFilters: this.props.recentFilters,
        fullPanel: this.props.fullPanel,
        multiPanel: this.props.multiPanel,
        setFilter: this.props.setFilter,
        setConnectionsMode: this.props.setConnectionsMode,
        onTextClick: this.props.onTextClick,
        onCitationClick: this.props.onCitationClick,
        onNavigationClick: this.props.onNavigationClick,
        onCompareClick: this.props.onCompareClick,
        onOpenConnectionsClick: this.props.onOpenConnectionsClick,
        openNav: this.props.openNav,
        openDisplaySettings: this.props.openDisplaySettings,
        closePanel: this.props.closePanel,
        selectedWords: this.props.selectedWords });
    } else if (this.props.mode === "Tools") {
      content = React.createElement(ToolsPanel, {
        srefs: this.props.srefs,
        mode: this.props.mode,
        filter: this.props.filter,
        recentFilters: this.props.recentFilters,
        fullPanel: this.props.fullPanel,
        multiPanel: this.props.multiPanel,
        canEditText: this.props.canEditText,
        setFilter: this.props.setFilter,
        setConnectionsMode: this.props.setConnectionsMode,
        onTextClick: this.props.onTextClick,
        onCitationClick: this.props.onCitationClick,
        onNavigationClick: this.props.onNavigationClick,
        onCompareClick: this.props.onCompareClick,
        onOpenConnectionsClick: this.props.onOpenConnectionsClick,
        openNav: this.props.openNav,
        openDisplaySettings: this.props.openDisplaySettings,
        openComparePanel: this.props.openComparePanel,
        closePanel: this.props.closePanel,
        version: this.props.version,
        versionLanguage: this.props.versionLanguage });
    } else if (this.props.mode === "Share") {
      content = React.createElement(SharePanel, {
        url: window.location.href,
        fullPanel: this.props.fullPanel,
        closePanel: this.props.closePanel,
        setConnectionsMode: this.props.setConnectionsMode });
    } else if (this.props.mode === "Add to Source Sheet") {
      content = React.createElement(AddToSourceSheetPanel, {
        srefs: this.props.srefs,
        fullPanel: this.props.fullPanel,
        setConnectionsMode: this.props.setConnectionsMode });
    } else if (this.props.mode === "Add Note") {
      content = React.createElement(AddNotePanel, {
        srefs: this.props.srefs,
        fullPanel: this.props.fullPanel,
        closePanel: this.props.closePanel,
        setConnectionsMode: this.props.setConnectionsMode });
    } else if (this.props.mode === "Edit Note") {
      content = React.createElement(AddNotePanel, {
        srefs: this.props.srefs,
        noteId: this.props.noteBeingEdited._id,
        noteText: this.props.noteBeingEdited.text,
        noteTitle: this.props.noteBeingEdited.title,
        noteIsPublic: this.props.noteBeingEdited.isPublic,
        fullPanel: this.props.fullPanel,
        closePanel: this.props.closePanel,
        setConnectionsMode: this.props.setConnectionsMode });
    } else if (this.props.mode === "My Notes") {
      content = React.createElement(MyNotesPanel, {
        srefs: this.props.srefs,
        fullPanel: this.props.fullPanel,
        closePanel: this.props.closePanel,
        setConnectionsMode: this.props.setConnectionsMode,
        editNote: this.props.editNote });
    } else if (this.props.mode === "Add Connection") {
      content = React.createElement(LoadingMessage, { className: 'toolsMessage', message: 'Coming Soon.', heMessage: 'הרכיב הזה נמצא בבנייה...' });
    } else if (this.props.mode === "Edit Text") {
      content = React.createElement(LoadingMessage, { className: 'toolsMessage', message: 'Coming Soon.', heMessage: 'הרכיב הזה נמצא בבנייה...' });
    } else if (this.props.mode === "Add Translation") {
      content = React.createElement(LoadingMessage, { className: 'toolsMessage', message: 'Coming Soon.', heMessage: 'הרכיב הזה נמצא בבנייה...' });
    } else if (this.props.mode === "Login") {
      content = React.createElement(LoginPanel, { fullPanel: this.props.fullPanel });
    }
    return content;
  }
});

var ConnectionsPanelHeader = React.createClass({
  displayName: 'ConnectionsPanelHeader',

  propTypes: {
    activeTab: React.PropTypes.string.isRequired, // "Connections", "Tools"
    setConnectionsMode: React.PropTypes.func.isRequired,
    closePanel: React.PropTypes.func.isRequired,
    toggleLanguage: React.PropTypes.func.isRequired
  },
  render: function render() {
    return React.createElement(
      'div',
      { className: 'connectionsPanelHeader' },
      React.createElement(
        'div',
        { className: 'rightButtons' },
        React.createElement(LanguageToggleButton, { toggleLanguage: this.props.toggleLanguage }),
        React.createElement(ReaderNavigationMenuCloseButton, { icon: 'arrow', onClick: this.props.closePanel })
      ),
      React.createElement(ConnectionsPanelTabs, {
        activeTab: this.props.activeTab,
        setConnectionsMode: this.props.setConnectionsMode })
    );
  }
});

var ConnectionsPanelTabs = React.createClass({
  displayName: 'ConnectionsPanelTabs',

  propTypes: {
    activeTab: React.PropTypes.string.isRequired, // "Connections", "Tools"
    setConnectionsMode: React.PropTypes.func.isRequired
  },
  render: function render() {
    var tabNames = [{ "en": "Connections", "he": "קישורים" }, { "en": "Tools", "he": "כלים" }];
    var tabs = tabNames.map(function (item) {
      var tabClick = function () {
        this.props.setConnectionsMode(item["en"]);
      }.bind(this);
      var active = item["en"] === this.props.activeTab;
      var classes = classNames({ connectionsPanelTab: 1, sans: 1, active: active });
      return React.createElement(
        'div',
        { className: classes, onClick: tabClick, key: item["en"] },
        React.createElement(
          'span',
          { className: 'en' },
          item["en"]
        ),
        React.createElement(
          'span',
          { className: 'he' },
          item["he"]
        )
      );
    }.bind(this));

    return React.createElement(
      'div',
      { className: 'connectionsPanelTabs' },
      tabs
    );
  }
});

var TextList = React.createClass({
  displayName: 'TextList',

  propTypes: {
    srefs: React.PropTypes.array.isRequired, // an array of ref strings
    filter: React.PropTypes.array.isRequired,
    recentFilters: React.PropTypes.array.isRequired,
    fullPanel: React.PropTypes.bool,
    multiPanel: React.PropTypes.bool,
    setFilter: React.PropTypes.func,
    setConnectionsMode: React.PropTypes.func,
    onTextClick: React.PropTypes.func,
    onCitationClick: React.PropTypes.func,
    onNavigationClick: React.PropTypes.func,
    onCompareClick: React.PropTypes.func,
    onOpenConnectionsClick: React.PropTypes.func,
    openNav: React.PropTypes.func,
    openDisplaySettings: React.PropTypes.func,
    closePanel: React.PropTypes.func,
    selectedWords: React.PropTypes.string
  },
  getInitialState: function getInitialState() {
    return {
      linksLoaded: false,
      textLoaded: false
    };
  },
  componentDidMount: function componentDidMount() {
    this.loadConnections();
    this.scrollToHighlighted();
  },
  componentWillReceiveProps: function componentWillReceiveProps(nextProps) {
    this.preloadText(nextProps.filter);
  },
  componentWillUpdate: function componentWillUpdate(nextProps) {},
  componentDidUpdate: function componentDidUpdate(prevProps, prevState) {
    if (prevProps.filter.length && !this.props.filter.length) {
      this.scrollToHighlighted();
    }
    if (!prevProps.filter.compare(this.props.filter)) {
      this.scrollToHighlighted();
    } else if (!prevState.textLoaded && this.state.textLoaded) {
      this.scrollToHighlighted();
    } else if (!prevProps.srefs.compare(this.props.srefs)) {
      this.loadConnections();
      this.scrollToHighlighted();
    }
  },
  getSectionRef: function getSectionRef() {
    var ref = this.props.srefs[0]; // TODO account for selections spanning sections
    var sectionRef = Sefaria.sectionRef(ref) || ref;
    return sectionRef;
  },
  loadConnections: function loadConnections() {
    // Load connections data from server for this section
    var sectionRef = this.getSectionRef();
    if (!sectionRef) {
      return;
    }
    Sefaria.related(sectionRef, function (data) {
      if (this.isMounted()) {
        this.preloadText(this.props.filter);
        this.setState({
          linksLoaded: true
        });
      }
    }.bind(this));
  },
  preloadText: function preloadText(filter) {
    // Preload text of links if `filter` is a single commentary, or all commentary
    if (filter.length == 1 && Sefaria.index(filter[0]) && Sefaria.index(filter[0]).categories == "Commentary") {
      this.preloadSingleCommentaryText(filter);
    } else if (filter.length == 1 && filter[0] == "Commentary") {
      this.preloadAllCommentaryText(filter);
    } else {
      this.setState({ waitForText: false, textLoaded: false });
    }
  },
  preloadSingleCommentaryText: function preloadSingleCommentaryText(filter) {
    var basetext = this.getSectionRef();
    var commentary = filter[0] + " on " + basetext;
    this.setState({ textLoaded: false, waitForText: true });
    Sefaria.text(commentary, {}, function () {
      if (this.isMounted()) {
        this.setState({ textLoaded: true });
      }
    }.bind(this));
  },
  preloadAllCommentaryText: function preloadAllCommentaryText() {
    var basetext = this.getSectionRef();
    var summary = Sefaria.linkSummary(basetext);
    if (summary.length && summary[0].category == "Commentary") {
      this.setState({ textLoaded: false, waitForText: true });
      // Get a list of commentators on this section that we need don't have in the cache
      var links = Sefaria.links(basetext);
      var commentators = summary[0].books.map(function (item) {
        return item.book;
      }).filter(function (commentator) {
        var link = Sefaria._filterLinks(links, [commentator])[0];
        if (link.sourceRef.indexOf(link.anchorRef) == -1) {
          // Check if this is Commentary2, exclude if so
          return false;
        }
        // Exclude if we already have this in the cache
        return !Sefaria.text(commentator + " on " + basetext);
      });
      if (commentators.length) {
        this.waitingFor = Sefaria.util.clone(commentators);
        this.target = 0;
        for (var i = 0; i < commentators.length; i++) {
          Sefaria.text(commentators[i] + " on " + basetext, {}, function (data) {
            var index = this.waitingFor.indexOf(data.commentator);
            if (index == -1) {
              console.log("Failed to clear commentator:");
              console.log(data);
              this.target += 1;
            }
            if (index > -1) {
              this.waitingFor.splice(index, 1);
            }
            if (this.waitingFor.length == this.target) {
              if (this.isMounted()) {
                this.setState({ textLoaded: true });
              }
            }
          }.bind(this));
        }
      } else {
        // All commentaries have been loaded already
        this.setState({ textLoaded: true });
      }
    } else {
      // There were no commentaries to load
      this.setState({ textLoaded: true });
    }
  },
  scrollToHighlighted: function scrollToHighlighted() {
    if (this.props.fullPanel) {
      return; // We don't currently have any situations where there is lowlighted content in fullpanel sidebar
    }
    window.requestAnimationFrame(function () {
      if (!this.isMounted()) {
        return;
      }
      var $highlighted = $(ReactDOM.findDOMNode(this)).find(".texts .textRange").not(".lowlight").first();
      if ($highlighted.length) {
        var $texts = $(ReactDOM.findDOMNode(this)).find(".texts");
        var adjust = parseInt($texts.css("padding-top")) + 18;
        $texts.scrollTo($highlighted, 0, { offset: -adjust });
      }
    }.bind(this));
  },
  showAllFilters: function showAllFilters() {
    this.props.setFilter(null);
    if (Sefaria.site) {
      Sefaria.site.track.event("Reader", "Show All Filters Click", "1");
    }
  },
  render: function render() {
    var refs = this.props.srefs;
    var summary = Sefaria.relatedSummary(refs);
    var oref = Sefaria.ref(refs[0]);
    var filter = this.props.filter;
    var sectionRef = this.getSectionRef();
    var isSingleCommentary = filter.length == 1 && Sefaria.index(filter[0]) && Sefaria.index(filter[0]).categories == "Commentary";

    //if (summary.length && !links.length) { debugger; }
    var en = "No connections known" + (filter.length ? " for " + filter.join(", ") : "") + ".";
    var he = "אין קשרים ידועים" + (filter.length ? " ל" + filter.join(", ") : "") + ".";
    var loaded = Sefaria.linksLoaded(sectionRef);
    var message = !loaded ? React.createElement(LoadingMessage, null) : summary.length === 0 ? React.createElement(LoadingMessage, { message: en, heMessage: he }) : null;

    var showAllFilters = !filter.length;
    if (!showAllFilters) {
      if (filter.compare(["Sheets"])) {
        var sheets = Sefaria.sheets.sheetsByRef(refs);
        var content = sheets ? sheets.map(function (sheet) {
          return React.createElement(
            'div',
            { className: 'sheet', key: sheet.sheetUrl },
            React.createElement(
              'a',
              { href: sheet.ownerProfileUrl },
              React.createElement('img', { className: 'sheetAuthorImg', src: sheet.ownerImageUrl })
            ),
            React.createElement(
              'div',
              { className: 'sheetViews' },
              React.createElement('i', { className: 'fa fa-eye' }),
              ' ',
              sheet.views
            ),
            React.createElement(
              'a',
              { href: sheet.ownerProfileUrl, className: 'sheetAuthor' },
              sheet.ownerName
            ),
            React.createElement(
              'a',
              { href: sheet.sheetUrl, className: 'sheetTitle' },
              sheet.title
            )
          );
        }) : React.createElement(LoadingMessage, null);
        content = content.length ? content : React.createElement(LoadingMessage, { message: 'No sheets here.' });
      } else if (filter.compare(["Notes"])) {
        var notes = Sefaria.notes(refs);
        var content = notes ? notes.map(function (note) {
          return React.createElement(Note, {
            title: note.title,
            text: note.text,
            ownerName: note.ownerName,
            ownerProfileUrl: note.ownerProfileUrl,
            ownerImageUrl: note.ownerImageUrl,
            key: note._id });
        }) : React.createElement(LoadingMessage, null);
        content = content.length ? content : React.createElement(LoadingMessage, { message: 'No notes here.' });
      } else {
        // Viewing Text Connections
        var sectionLinks = Sefaria.links(sectionRef);
        var links = sectionLinks.filter(function (link) {
          if (Sefaria.util.inArray(link.anchorRef, refs) === -1 && (this.props.multiPanel || !isSingleCommentary)) {
            // Only show section level links for an individual commentary
            return false;
          }
          return filter.length == 0 || Sefaria.util.inArray(link.category, filter) !== -1 || Sefaria.util.inArray(link.commentator, filter) !== -1;
        }.bind(this)).sort(function (a, b) {
          if (a.anchorVerse !== b.anchorVerse) {
            return a.anchorVerse - b.anchorVerse;
          } else if (a.commentaryNum !== b.commentaryNum) {
            return a.commentaryNum - b.commentaryNum;
          } else {
            return a.sourceRef > b.sourceRef ? 1 : -1;
          }
        });
        var content = links.length == 0 ? message : this.state.waitForText && !this.state.textLoaded ? React.createElement(LoadingMessage, null) : links.map(function (link, i) {
          var hideTitle = link.category === "Commentary" && this.props.filter[0] !== "Commentary";
          return React.createElement(TextRange, {
            sref: link.sourceRef,
            key: i + link.sourceRef,
            lowlight: Sefaria.util.inArray(link.anchorRef, refs) === -1,
            hideTitle: hideTitle,
            numberLabel: link.category === "Commentary" ? link.anchorVerse : 0,
            basetext: false,
            onRangeClick: this.props.onTextClick,
            onCitationClick: this.props.onCitationClick,
            onNavigationClick: this.props.onNavigationClick,
            onCompareClick: this.props.onCompareClick,
            onOpenConnectionsClick: this.props.onOpenConnectionsClick });
        }, this);
      }
    }

    var classes = classNames({ textList: 1, fullPanel: this.props.fullPanel });
    if (showAllFilters) {
      return React.createElement(
        'div',
        { className: classes },
        React.createElement(
          'div',
          { className: 'textListTop' },
          message
        ),
        React.createElement(AllFilterSet, {
          srefs: this.props.srefs,
          summary: summary,
          showText: this.props.showText,
          filter: this.props.filter,
          recentFilters: this.props.recentFilters,
          setFilter: this.props.setFilter,
          selectedWords: this.props.selectedWords,
          oref: oref })
      );
    } else if (!this.props.fullPanel) {
      return React.createElement(
        'div',
        { className: classes },
        React.createElement(
          'div',
          { className: 'textListTop' },
          React.createElement(RecentFilterSet, {
            srefs: this.props.srefs,
            asHeader: true,
            showText: this.props.showText,
            filter: this.props.filter,
            recentFilters: this.props.recentFilters,
            textCategory: oref ? oref.categories[0] : null,
            setFilter: this.props.setFilter,
            showAllFilters: this.showAllFilters })
        ),
        React.createElement(
          'div',
          { className: 'texts' },
          React.createElement(
            'div',
            { className: 'contentInner' },
            content
          )
        )
      );
    } else {
      return React.createElement(
        'div',
        { className: classes },
        React.createElement(
          'div',
          { className: 'texts' },
          React.createElement(
            'div',
            { className: 'contentInner' },
            React.createElement(RecentFilterSet, {
              srefs: this.props.srefs,
              asHeader: false,
              showText: this.props.showText,
              filter: this.props.filter,
              recentFilters: this.props.recentFilters,
              textCategory: oref ? oref.categories[0] : null,
              setFilter: this.props.setFilter,
              showAllFilters: this.showAllFilters }),
            content
          )
        )
      );
    }
  }
});

var Note = React.createClass({
  displayName: 'Note',

  propTypes: {
    title: React.PropTypes.string.isRequired,
    text: React.PropTypes.string.isRequired,
    ownerName: React.PropTypes.string,
    ownerImageUrl: React.PropTypes.string,
    ownerProfileUrl: React.PropTypes.string,
    isPrivate: React.PropTypes.bool,
    editNote: React.PropTypes.func
  },
  render: function render() {

    var isInMyNotes = !this.props.ownerName; // public notes can appear inside myNotesPanel, use ownerName as a proxy for context

    var authorInfo = isInMyNotes ? null : React.createElement(
      'div',
      { className: 'noteAuthorInfo' },
      React.createElement(
        'a',
        { href: this.props.ownerProfileUrl },
        React.createElement('img', { className: 'noteAuthorImg', src: this.props.ownerImageUrl })
      ),
      React.createElement(
        'a',
        { href: this.props.ownerProfileUrl, className: 'noteAuthor' },
        this.props.ownerName
      )
    );

    var buttons = isInMyNotes ? React.createElement(
      'div',
      { className: 'noteButtons' },
      React.createElement('i', { className: 'fa fa-pencil', onClick: this.props.editNote }),
      this.props.isPrivate ? null : React.createElement('i', { className: 'fa fa-unlock-alt' })
    ) : null;

    return React.createElement(
      'div',
      { className: 'note' },
      authorInfo,
      React.createElement(
        'div',
        { className: 'noteTitle' },
        this.props.title
      ),
      React.createElement('span', { className: 'noteText', dangerouslySetInnerHTML: { __html: this.props.text } }),
      buttons
    );
  }
});

var AllFilterSet = React.createClass({
  displayName: 'AllFilterSet',

  render: function render() {
    var categories = this.props.summary.map(function (cat, i) {
      return React.createElement(CategoryFilter, {
        srefs: this.props.srefs,
        key: i,
        category: cat.category,
        heCategory: Sefaria.hebrewCategory(cat.category),
        count: cat.count,
        books: cat.books,
        filter: this.props.filter,
        updateRecent: true,
        setFilter: this.props.setFilter,
        on: Sefaria.util.inArray(cat.category, this.props.filter) !== -1 });
    }.bind(this));
    return React.createElement(
      'div',
      { className: 'fullFilterView filterSet' },
      React.createElement(LexiconPanel, { selectedWords: this.props.selectedWords, oref: this.props.oref }),
      categories
    );
  }
});

var CategoryFilter = React.createClass({
  displayName: 'CategoryFilter',

  handleClick: function handleClick(e) {
    e.preventDefault();
    this.props.setFilter(this.props.category, this.props.updateRecent);
    if (Sefaria.site) {
      Sefaria.site.track.event("Reader", "Category Filter Click", this.props.category);
    }
  },
  render: function render() {
    var textFilters = this.props.books.map(function (book, i) {
      return React.createElement(TextFilter, {
        srefs: this.props.srefs,
        key: i,
        book: book.book,
        heBook: book.heBook,
        count: book.count,
        category: this.props.category,
        hideColors: true,
        updateRecent: true,
        setFilter: this.props.setFilter,
        on: Sefaria.util.inArray(book.book, this.props.filter) !== -1 });
    }.bind(this));

    var notClickable = this.props.category == "Community";
    var color = Sefaria.palette.categoryColor(this.props.category);
    var style = notClickable ? {} : { "borderTop": "4px solid " + color };
    var classes = classNames({ categoryFilter: 1, on: this.props.on, notClickable: notClickable });
    var count = notClickable ? null : React.createElement(
      'span',
      { className: 'enInHe' },
      ' | ',
      this.props.count
    );
    var handleClick = notClickable ? null : this.handleClick;
    var url = this.props.srefs && this.props.srefs.length > 0 ? "/" + Sefaria.normRef(this.props.srefs[0]) + "?with=" + this.props.category : "";
    var innerFilter = React.createElement(
      'div',
      { className: classes, onClick: handleClick },
      React.createElement(
        'span',
        { className: 'en' },
        this.props.category,
        count
      ),
      React.createElement(
        'span',
        { className: 'he' },
        this.props.heCategory,
        count
      )
    );
    var wrappedFilter = notClickable ? innerFilter : React.createElement(
      'a',
      { href: url },
      innerFilter
    );
    return React.createElement(
      'div',
      { className: 'categoryFilterGroup', style: style },
      wrappedFilter,
      React.createElement(TwoBox, { content: textFilters })
    );
  }
});

var TextFilter = React.createClass({
  displayName: 'TextFilter',

  propTypes: {
    srefs: React.PropTypes.array.isRequired,
    book: React.PropTypes.string.isRequired,
    heBook: React.PropTypes.string.isRequired,
    on: React.PropTypes.bool.isRequired,
    setFilter: React.PropTypes.func.isRequired,
    updateRecent: React.PropTypes.bool
  },
  handleClick: function handleClick(e) {
    e.preventDefault();
    this.props.setFilter(this.props.book, this.props.updateRecent);
    if (Sefaria.site) {
      Sefaria.site.track.event("Reader", "Text Filter Click", this.props.book);
    }
  },
  render: function render() {
    var classes = classNames({ textFilter: 1, on: this.props.on, lowlight: this.props.count == 0 });

    if (!this.props.hideColors) {
      var color = Sefaria.palette.categoryColor(this.props.category);
      var style = { "borderTop": "4px solid " + color };
    }
    var name = this.props.book == this.props.category ? this.props.book.toUpperCase() : this.props.book;
    var count = this.props.hideCounts || !this.props.count ? "" : React.createElement(
      'span',
      { className: 'enInHe' },
      ' (',
      this.props.count,
      ')'
    );
    var url = this.props.srefs && this.props.srefs.length > 0 ? "/" + Sefaria.normRef(this.props.srefs[0]) + "?with=" + name : "";
    return React.createElement(
      'a',
      { href: url },
      React.createElement(
        'div',
        { 'data-name': name,
          className: classes,
          style: style,
          onClick: this.handleClick },
        React.createElement(
          'div',
          null,
          React.createElement(
            'span',
            { className: 'en' },
            name,
            count
          ),
          React.createElement(
            'span',
            { className: 'he' },
            this.props.heBook,
            count
          )
        )
      )
    );
  }
});

var RecentFilterSet = React.createClass({
  displayName: 'RecentFilterSet',

  propTypes: {
    srefs: React.PropTypes.array.isRequired,
    filter: React.PropTypes.array.isRequired,
    recentFilters: React.PropTypes.array.isRequired,
    textCategory: React.PropTypes.string.isRequired,
    setFilter: React.PropTypes.func.isRequired,
    showAllFilters: React.PropTypes.func.isRequired
  },
  toggleAllFilterView: function toggleAllFilterView() {
    this.setState({ showAllFilters: !this.state.showAllFilters });
  },
  render: function render() {
    var topLinks = [];

    // Filter top links to exclude items already in recent filter
    topLinks = topLinks.filter(function (link) {
      return Sefaria.util.inArray(link.book, this.props.recentFilters) == -1;
    }.bind(this));

    // Annotate filter texts with category           
    var recentFilters = this.props.recentFilters.map(function (filter) {
      var index = Sefaria.index(filter);
      return {
        book: filter,
        heBook: index ? index.heTitle : Sefaria.hebrewCategory(filter),
        category: index ? index.categories[0] : filter };
    });
    topLinks = recentFilters.concat(topLinks).slice(0, 5);

    // If the current filter is not already in the top set, put it first
    if (this.props.filter.length) {
      var filter = this.props.filter[0];
      for (var i = 0; i < topLinks.length; i++) {
        if (topLinks[i].book == filter || topLinks[i].category == filter) {
          break;
        }
      }
      if (i == topLinks.length) {
        var index = Sefaria.index(filter);
        if (index) {
          var annotatedFilter = { book: filter, heBook: index.heTitle, category: index.categories[0] };
        } else {
          var annotatedFilter = { book: filter, heBook: filter, category: "Other" };
        }

        topLinks = [annotatedFilter].concat(topLinks).slice(0, 5);
      } else {
        // topLinks.move(i, 0);
      }
    }
    var topFilters = topLinks.map(function (book) {
      return React.createElement(TextFilter, {
        srefs: this.props.srefs,
        key: book.book,
        book: book.book,
        heBook: book.heBook,
        category: book.category,
        hideCounts: true,
        hideColors: true,
        count: book.count,
        updateRecent: false,
        setFilter: this.props.setFilter,
        on: Sefaria.util.inArray(book.book, this.props.filter) !== -1 });
    }.bind(this));

    var moreButton = this.props.asHeader ? React.createElement(
      'div',
      { className: 'showMoreFilters textFilter', style: style,
        onClick: this.props.showAllFilters },
      React.createElement(
        'div',
        null,
        React.createElement(
          'span',
          { className: 'dot' },
          '●'
        ),
        React.createElement(
          'span',
          { className: 'dot' },
          '●'
        ),
        React.createElement(
          'span',
          { className: 'dot' },
          '●'
        )
      )
    ) : null;
    var style = this.props.asHeader ? { "borderTopColor": Sefaria.palette.categoryColor(this.props.textCategory) } : {};
    var classes = classNames({ recentFilterSet: 1, topFilters: this.props.asHeader, filterSet: 1 });
    return React.createElement(
      'div',
      { className: classes, style: style },
      React.createElement(
        'div',
        { className: 'topFiltersInner' },
        topFilters
      ),
      moreButton
    );
  }
});

var LexiconPanel = React.createClass({
  displayName: 'LexiconPanel',

  propTypes: {
    selectedWords: React.PropTypes.string,
    oref: React.PropTypes.object
  },
  getInitialState: function getInitialState() {
    return {
      resultsLoaded: false
    };
  },
  componentDidMount: function componentDidMount() {
    this.getLookups();
  },
  componentDidUpdate: function componentDidUpdate(prevProps, prevState) {
    if (prevProps.selectedWords != this.props.selectedWords) {
      this.getLookups();
    }
  },
  getLookups: function getLookups() {
    if (!this.shouldRenderSelf()) {
      return;
    }
    Sefaria.lexicon(this.props.selectedWords, this.props.oref.ref, function (data) {
      console.log(data);
      if (this.isMounted()) {
        this.setState({
          resultsLoaded: true,
          entries: data
        });
      }
    }.bind(this));
  },
  shouldRenderSelf: function shouldRenderSelf() {
    if (!this.props.selectedWords) {
      return false;
    }
    var wordList = this.props.selectedWords.split(/[\s:\u05c3\u05be\u05c0.]+/);
    var inputLength = wordList.length;
    return inputLength > 0 && inputLength <= 3;
  },
  filter: function filter(entries) {
    return entries.map();
  },
  render: function render() {
    var ref_cats = this.props.oref.categories.join(", ");
    var enEmpty = "No results found.";
    var heEmpty = "לא נמצאו תוצאות";
    if (!this.shouldRenderSelf()) {
      return null;
    }
    var content;
    if (!this.state.resultsLoaded) {
      content = React.createElement(LoadingMessage, { message: 'Looking up words...', heMessage: 'מחפש מילים...' });
    } else if ("error" in this.state.entries) {
      content = React.createElement(LoadingMessage, { message: enEmpty, heMessage: heEmpty });
    } else {
      var entries = this.state.entries;
      content = entries ? entries.filter(function (e) {
        return e['parent_lexicon_details']['text_categories'].indexOf(ref_cats) > -1;
      }).map(function (entry, i) {
        return React.createElement(LexiconEntry, { data: entry, key: i });
      }) : React.createElement(LoadingMessage, { message: enEmpty, heMessage: heEmpty });
      content = content.length ? content : React.createElement(LoadingMessage, { message: enEmpty, heMessage: heEmpty });
    }
    /*var header = (<div className="lexicon-header"><h4>{this.props.selectedWords}</h4></div>);*/
    return React.createElement(
      'div',
      { className: 'lexicon-content' },
      React.createElement(
        'div',
        { className: 'lexicon-results' },
        content
      )
    );
  }
});

var LexiconEntry = React.createClass({
  displayName: 'LexiconEntry',

  propTypes: {
    data: React.PropTypes.object.isRequired
  },
  render: function render() {
    var entry = this.props.data;
    var headwordClassNames = classNames('headword', entry['parent_lexicon_details']["to_language"].slice(0, 2));
    var definitionClassNames = classNames('definition-content', entry['parent_lexicon_details']["to_language"].slice(0, 2));
    var entryHeadHtml = React.createElement(
      'span',
      { className: 'headword' },
      entry['headword']
    );
    var morphologyHtml = 'morphology' in entry['content'] ? React.createElement(
      'span',
      { className: 'morphology' },
      '(',
      entry['content']['morphology'],
      ')'
    ) : "";
    var senses = this.renderLexiconEntrySenses(entry['content']);
    var attribution = this.renderLexiconAttribution();
    return React.createElement(
      'div',
      { className: 'entry' },
      React.createElement(
        'div',
        { className: headwordClassNames },
        entryHeadHtml
      ),
      React.createElement(
        'div',
        { className: definitionClassNames },
        morphologyHtml,
        React.createElement(
          'ol',
          { className: 'definition' },
          senses
        )
      ),
      React.createElement(
        'div',
        { className: 'attribution' },
        attribution
      )
    );
  },
  renderLexiconEntrySenses: function renderLexiconEntrySenses(content) {
    var _this3 = this;

    var grammar = 'grammar' in content ? '(' + content['grammar']['verbal_stem'] + ')' : "";
    var def = 'definition' in content ? content['definition'] : "";
    var notes = 'notes' in content ? React.createElement(
      'span',
      { className: 'notes' },
      content['notes']
    ) : "";
    var sensesElems = 'senses' in content ? content['senses'].map(function (sense) {
      return _this3.renderLexiconEntrySenses(sense);
    }) : "";
    var senses = sensesElems.length ? React.createElement(
      'ol',
      { className: 'senses' },
      sensesElems
    ) : "";
    return React.createElement(
      'li',
      { className: 'sense' },
      grammar,
      def,
      notes,
      senses
    );
  },
  renderLexiconAttribution: function renderLexiconAttribution() {
    var entry = this.props.data;
    var lexicon_dtls = entry['parent_lexicon_details'];
    return React.createElement(
      'div',
      null,
      React.createElement(
        'span',
        null,
        React.createElement(
          'a',
          { target: '_blank',
            href: 'source_url' in lexicon_dtls ? lexicon_dtls['source_url'] : "" },
          React.createElement(
            'span',
            { className: 'en' },
            'Source: '
          ),
          React.createElement(
            'span',
            { className: 'he' },
            'מקור:'
          ),
          'source' in lexicon_dtls ? lexicon_dtls['source'] : lexicon_dtls['source_url']
        )
      ),
      React.createElement(
        'span',
        null,
        React.createElement(
          'a',
          { target: '_blank',
            href: 'attribution_url' in lexicon_dtls ? lexicon_dtls['attribution_url'] : "" },
          React.createElement(
            'span',
            { className: 'en' },
            'Creator: '
          ),
          React.createElement(
            'span',
            { className: 'he' },
            'יוצר:'
          ),
          'attribution' in lexicon_dtls ? lexicon_dtls['attribution'] : lexicon_dtls['attribution_url']
        )
      )
    );
  }
});

var ToolsPanel = React.createClass({
  displayName: 'ToolsPanel',

  propTypes: {
    srefs: React.PropTypes.array.isRequired, // an array of ref strings
    mode: React.PropTypes.string.isRequired, // "Tools", "Share", "Add to Source Sheet", "Add Note", "My Notes", "Add Connection", "Edit Text", "Add Translation"
    filter: React.PropTypes.array.isRequired,
    recentFilters: React.PropTypes.array.isRequired,
    setConnectionsMode: React.PropTypes.func.isRequired,
    openComparePanel: React.PropTypes.func.isRequired,
    version: React.PropTypes.string,
    versionLanguage: React.PropTypes.string,
    fullPanel: React.PropTypes.bool,
    multiPanel: React.PropTypes.bool,
    canEditText: React.PropTypes.bool,
    setFilter: React.PropTypes.func,
    onTextClick: React.PropTypes.func,
    onCitationClick: React.PropTypes.func,
    onNavigationClick: React.PropTypes.func,
    onCompareClick: React.PropTypes.func,
    onOpenConnectionsClick: React.PropTypes.func,
    openNav: React.PropTypes.func,
    openDisplaySettings: React.PropTypes.func,
    closePanel: React.PropTypes.func
  },
  getInitialState: function getInitialState() {
    return {};
  },
  render: function render() {
    var editText = this.props.canEditText ? function () {
      var path = "/edit/" + this.props.srefs[0];
      if (this.props.version) {
        path += "/" + this.props.versionLanguage + "/" + this.props.version;
      }
      var nextParam = "?next=" + Sefaria.util.currentPath();
      path += nextParam;
      window.location = path;
    }.bind(this) : null;

    var addTranslation = function () {
      var nextParam = "?next=" + Sefaria.util.currentPath();
      window.location = "/translate/" + this.props.srefs[0] + nextParam;
    }.bind(this);

    var classes = classNames({ toolsPanel: 1, textList: 1, fullPanel: this.props.fullPanel });
    return React.createElement(
      'div',
      { className: classes },
      React.createElement(
        'div',
        { className: 'texts' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          React.createElement(ToolsButton, { en: 'Share', he: 'שתף', icon: 'share-square-o', onClick: function () {
              this.props.setConnectionsMode("Share");
            }.bind(this) }),
          React.createElement(ToolsButton, { en: 'Add to Source Sheet', he: 'הוסף לדף מקורות', icon: 'plus-circle', onClick: function () {
              this.props.setConnectionsMode("Add to Source Sheet");
            }.bind(this) }),
          React.createElement(ToolsButton, { en: 'Add Note', he: 'הוסף רשומה', icon: 'pencil', onClick: function () {
              this.props.setConnectionsMode("Add Note");
            }.bind(this) }),
          React.createElement(ToolsButton, { en: 'My Notes', he: 'הרשומות שלי', icon: 'file-text-o', onClick: function () {
              this.props.setConnectionsMode("My Notes");
            }.bind(this) }),
          React.createElement(ToolsButton, { en: 'Compare', he: 'השווה', image: 'compare-64.png', onClick: this.props.openComparePanel }),
          React.createElement(ToolsButton, { en: 'Add Translation', he: 'הוסף תרגום', icon: 'language', onClick: addTranslation }),
          React.createElement(ToolsButton, { en: 'Add Connection', he: 'הוסף קישור לטקסט אחר', icon: 'link', onClick: function () {
              this.props.setConnectionsMode("Add Connection");
            }.bind(this) }),
          editText ? React.createElement(ToolsButton, { en: 'Edit Text', he: 'ערוך טקסט', icon: 'edit', onClick: editText }) : null
        )
      )
    );
  }
});

var ToolsButton = React.createClass({
  displayName: 'ToolsButton',

  propTypes: {
    en: React.PropTypes.string.isRequired,
    he: React.PropTypes.string.isRequired,
    icon: React.PropTypes.string,
    image: React.PropTypes.string,
    onClick: React.PropTypes.func
  },
  render: function render() {
    var icon = null;
    if (this.props.icon) {
      var iconName = "fa-" + this.props.icon;
      var classes = { fa: 1, toolsButtonIcon: 1 };
      classes[iconName] = 1;
      icon = React.createElement('i', { className: classNames(classes) });
    } else if (this.props.image) {
      icon = React.createElement('img', { src: "/static/img/" + this.props.image, className: 'toolsButtonIcon' });
    }

    return React.createElement(
      'div',
      { className: 'toolsButton sans', onClick: this.props.onClick },
      icon,
      React.createElement(
        'div',
        { className: 'en' },
        this.props.en
      ),
      React.createElement(
        'div',
        { className: 'he' },
        this.props.he
      )
    );
  }
});

var SharePanel = React.createClass({
  displayName: 'SharePanel',

  propTypes: {
    url: React.PropTypes.string.isRequired,
    setConnectionsMode: React.PropTypes.func.isRequired,
    closePanel: React.PropTypes.func.isRequired,
    fullPanel: React.PropTypes.bool
  },
  componentDidMount: function componentDidMount() {
    this.focusInput();
  },
  componentDidUpdate: function componentDidUpdate() {
    this.focusInput();
  },
  focusInput: function focusInput() {
    $(ReactDOM.findDOMNode(this)).find("input").select();
  },
  render: function render() {
    var url = this.props.url;
    var shareFacebook = function shareFacebook() {
      openInNewTab("https://www.facebook.com/sharer/sharer.php?u=" + url);
    };
    var shareTwitter = function shareTwitter() {
      openInNewTab("https://twitter.com/home?status=" + url);
    };
    var shareEmail = function shareEmail() {
      openInNewTab("mailto:?&subject=Text on Sefaria&body=" + url);
    };
    var classes = classNames({ sharePanel: 1, textList: 1, fullPanel: this.props.fullPanel });
    return React.createElement(
      'div',
      { className: classes },
      React.createElement(
        'div',
        { className: 'texts' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          React.createElement('input', { className: 'shareInput', value: this.props.url }),
          React.createElement(ToolsButton, { en: 'Facebook', he: 'פייסבוק', icon: 'facebook', onClick: shareFacebook }),
          React.createElement(ToolsButton, { en: 'Twitter', he: 'טוויטר', icon: 'twitter', onClick: shareTwitter }),
          React.createElement(ToolsButton, { en: 'Email', he: 'אימייל', icon: 'envelope-o', onClick: shareEmail })
        )
      )
    );
  }
});

var AddToSourceSheetPanel = React.createClass({
  displayName: 'AddToSourceSheetPanel',

  propTypes: {
    srefs: React.PropTypes.array.isRequired,
    setConnectionsMode: React.PropTypes.func.isRequired,
    fullPanel: React.PropTypes.bool
  },
  getInitialState: function getInitialState() {
    return {
      selectedSheet: null
    };
  },
  componentDidMount: function componentDidMount() {
    this.loadSheets();
  },
  loadSheets: function loadSheets() {
    Sefaria.sheets.userSheets(Sefaria._uid, function () {
      this.forceUpdate();
    }.bind(this));
  },
  addToSourceSheet: function addToSourceSheet() {
    if (!this.state.selectedSheet) {
      return;
    }
    var url = "/api/sheets/" + this.state.selectedSheet + "/add";
    var source = { refs: this.props.srefs };
    $.post(url, { source: JSON.stringify(source) }, this.confirmAdd);
  },
  createSheet: function createSheet(refs) {
    var title = $(ReactDOM.findDOMNode(this)).find("input").val();
    if (!title) {
      return;
    }
    var sheet = {
      title: title,
      options: { numbered: 0 },
      sources: []
    };
    var postJSON = JSON.stringify(sheet);
    $.post("/api/sheets/", { "json": postJSON }, function (data) {
      this.setState({ selectedSheet: data.id }, function () {
        this.addToSourceSheet();
      });
      Sefaria.sheets.clearUserSheets(Sefaria._uid);
    }.bind(this));
  },
  openNewSheet: function openNewSheet() {
    this.setState({ showNewSheetInput: true });
  },
  confirmAdd: function confirmAdd() {
    this.setState({ confirm: true });
  },
  render: function render() {
    if (this.state.confirm) {
      return React.createElement(ConfirmAddToSheetPanel, { sheetId: this.state.selectedSheet });
    }
    var sheets = Sefaria.sheets.userSheets(Sefaria._uid);
    var sheetsContent = sheets ? sheets.map(function (sheet) {
      var classes = classNames({ sheet: 1, selected: this.state.selectedSheet == sheet.id });
      var selectSheet = function () {
        this.setState({ selectedSheet: sheet.id });
      }.bind(this);
      return React.createElement(
        'div',
        { className: classes, onClick: selectSheet, key: sheet.id },
        sheet.title.stripHtml()
      );
    }.bind(this)) : React.createElement(LoadingMessage, null);
    sheetsContent = sheets && sheets.length == 0 ? React.createElement(
      'div',
      { className: 'sheet' },
      React.createElement(
        'span',
        { className: 'en' },
        'You don’t have any Source Sheets yet.'
      ),
      React.createElement(
        'span',
        { className: 'he' },
        'טרם יצרת דפי מקורות'
      )
    ) : sheetsContent;
    var createSheet = this.state.showNewSheetInput ? React.createElement(
      'div',
      null,
      React.createElement('input', { className: 'newSheetInput', placeholder: 'Title your Sheet' }),
      React.createElement(
        'div',
        { className: 'button white small', onClick: this.createSheet },
        React.createElement(
          'span',
          { className: 'en' },
          'Create'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'צור חדש'
        )
      )
    ) : React.createElement(
      'div',
      { className: 'button white', onClick: this.openNewSheet },
      React.createElement(
        'span',
        { className: 'en' },
        'Create a Source Sheet'
      ),
      React.createElement(
        'span',
        { className: 'he' },
        'צור דף מקורות חדש'
      )
    );
    var classes = classNames({ addToSourceSheetPanel: 1, textList: 1, fullPanel: this.props.fullPanel });
    return React.createElement(
      'div',
      { className: classes },
      React.createElement(
        'div',
        { className: 'texts' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          createSheet,
          React.createElement(
            'div',
            { className: 'sourceSheetSelector' },
            sheetsContent
          ),
          React.createElement(
            'div',
            { className: 'button', onClick: this.addToSourceSheet },
            React.createElement(
              'span',
              { className: 'en' },
              'Add to Sheet'
            ),
            React.createElement(
              'span',
              { className: 'he' },
              'הוסף לדף המקורות'
            )
          )
        )
      )
    );
  }
});

var ConfirmAddToSheetPanel = React.createClass({
  displayName: 'ConfirmAddToSheetPanel',

  propType: {
    sheetId: React.PropTypes.number.isRequired
  },
  render: function render() {
    return React.createElement(
      'div',
      { className: 'confirmAddToSheetPanel' },
      React.createElement(
        'div',
        { className: 'message' },
        React.createElement(
          'span',
          { className: 'en' },
          'Your source has been added.'
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'הטקסט נוסף בהצלחה לדף המקורות'
        )
      ),
      React.createElement(
        'a',
        { className: 'button white', href: "/sheets/" + this.props.sheetId },
        React.createElement(
          'span',
          { className: 'en' },
          'Go to Source Sheet ',
          React.createElement('i', { className: 'fa fa-angle-right' })
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'עבור לדף המקורות',
          React.createElement('i', { className: 'fa fa-angle-left' })
        )
      )
    );
  }
});

var AddNotePanel = React.createClass({
  displayName: 'AddNotePanel',

  propTypes: {
    srefs: React.PropTypes.array.isRequired,
    setConnectionsMode: React.PropTypes.func.isRequired,
    closePanel: React.PropTypes.func.isRequired,
    fullPanel: React.PropTypes.bool,
    noteId: React.PropTypes.string,
    noteText: React.PropTypes.string,
    noteTitle: React.PropTypes.string,
    noteIsPublic: React.PropTypes.bool
  },
  getInitialState: function getInitialState() {
    return {
      isPrivate: !this.props.noteIsPublic,
      saving: false
    };
  },
  componentDidMount: function componentDidMount() {
    this.focusNoteText();
  },
  focusNoteText: function focusNoteText() {
    $(ReactDOM.findDOMNode(this)).find(".noteText").focus();
  },
  saveNote: function saveNote() {
    var note = {
      text: $(ReactDOM.findDOMNode(this)).find(".noteText").val(),
      refs: this.props.srefs,
      anchorText: "",
      type: "note",
      title: "",
      public: !this.state.isPrivate
    };
    var postData = { json: JSON.stringify(note) };
    var url = this.props.noteId ? "/api/notes/" + this.props.noteId : "/api/notes/";
    $.post(url, postData, function (data) {
      if (data.error) {
        alert(data.error);
      } else if (data) {
        if (this.props.noteId) {
          Sefaria.clearPrivateNotes(data);
        } else {
          Sefaria.addPrivateNote(data);
        }
        this.props.setConnectionsMode("My Notes");
      } else {
        alert("Sorry, there was a problem saving your note.");
      }
    }.bind(this)).fail(function (xhr, textStatus, errorThrown) {
      alert("Unfortunately, there was an error saving this note. Please try again or try reloading this page.");
    });
    this.setState({ saving: true });
  },
  setPrivate: function setPrivate() {
    this.setState({ isPrivate: true });
  },
  setPublic: function setPublic() {
    this.setState({ isPrivate: false });
  },
  cancel: function cancel() {
    this.props.setConnectionsMode("Tools");
  },
  deleteNote: function deleteNote() {
    if (!confirm("Are you sure you want to delete this note?")) {
      return;
    }
    var url = "/api/notes/" + this.props.noteId;
    $.ajax({
      type: "delete",
      url: url,
      success: function () {
        alert("Source deleted.");
        Sefaria.clearPrivateNotes();
        this.props.setConnectionsMode("My Notes");
      }.bind(this),
      error: function error() {
        alert("Something went wrong (that's all I know).");
      }
    });
  },
  render: function render() {
    var classes = classNames({ addNotePanel: 1, textList: 1, fullPanel: this.props.fullPanel });
    var privateClasses = classNames({ notePrivateButton: 1, active: this.state.isPrivate });
    var publicClasses = classNames({ notePublicButton: 1, active: !this.state.isPrivate });
    return React.createElement(
      'div',
      { className: classes },
      React.createElement(
        'div',
        { className: 'texts' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          React.createElement('textarea', { className: 'noteText', placeholder: 'Write a note...', defaultValue: this.props.noteText }),
          React.createElement(
            'div',
            { className: 'noteSharingToggle' },
            React.createElement(
              'div',
              { className: privateClasses, onClick: this.setPrivate },
              React.createElement(
                'span',
                { className: 'en' },
                React.createElement('i', { className: 'fa fa-lock' }),
                ' Private'
              ),
              React.createElement(
                'span',
                { className: 'he' },
                React.createElement('i', { className: 'fa fa-lock' }),
                'רשומה פרטית'
              )
            ),
            React.createElement(
              'div',
              { className: publicClasses, onClick: this.setPublic },
              React.createElement(
                'span',
                { className: 'en' },
                'Public'
              ),
              React.createElement(
                'span',
                { className: 'he' },
                'רשומה כללית'
              )
            )
          ),
          React.createElement('div', { className: 'line' }),
          React.createElement(
            'div',
            { className: 'button fillWidth', onClick: this.saveNote },
            React.createElement(
              'span',
              { className: 'en' },
              this.props.noteId ? "Save" : "Add Note"
            ),
            React.createElement(
              'span',
              { className: 'he' },
              this.props.noteId ? "שמור" : "הוסף רשומה"
            )
          ),
          React.createElement(
            'div',
            { className: 'button white fillWidth', onClick: this.cancel },
            React.createElement(
              'span',
              { className: 'en' },
              'Cancel'
            ),
            React.createElement(
              'span',
              { className: 'he' },
              'בטל'
            )
          ),
          this.props.noteId ? React.createElement(
            'div',
            { className: 'deleteNote', onClick: this.deleteNote },
            React.createElement(
              'span',
              { className: 'en' },
              'Delete Note'
            ),
            React.createElement(
              'span',
              { className: 'he' },
              'מחק רשומה'
            )
          ) : null
        )
      )
    );
  }
});

var MyNotesPanel = React.createClass({
  displayName: 'MyNotesPanel',

  propTypes: {
    srefs: React.PropTypes.array.isRequired,
    setConnectionsMode: React.PropTypes.func.isRequired,
    closePanel: React.PropTypes.func.isRequired,
    editNote: React.PropTypes.func.isRequired,
    fullPanel: React.PropTypes.bool
  },
  componentDidMount: function componentDidMount() {
    this.loadNotes();
  },
  componentDidUpdate: function componentDidUpdate(prevProps, prevState) {
    if (!prevProps.srefs.compare(this.props.srefs)) {
      this.loadNotes();
    }
  },
  loadNotes: function loadNotes() {
    // Rerender this component when privateNotes arrive.
    Sefaria.privateNotes(this.props.srefs, this.rerender);
  },
  rerender: function rerender() {
    this.forceUpdate();
  },
  render: function render() {
    var myNotesData = Sefaria.privateNotes(this.props.srefs);
    var myNotes = myNotesData ? myNotesData.map(function (note) {
      var editNote = function () {
        this.props.editNote(note);
      }.bind(this);
      return React.createElement(Note, {
        title: note.title,
        text: note.text,
        isPrivate: !note.public,
        editNote: editNote,
        key: note._id });
    }.bind(this)) : null;

    var classes = classNames({ myNotesPanel: 1, textList: 1, fullPanel: this.props.fullPanel });
    return React.createElement(
      'div',
      { className: classes },
      React.createElement(
        'div',
        { className: 'texts' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          myNotes,
          React.createElement(ToolsButton, {
            en: 'Add Note',
            he: 'הוסף רשומה',
            icon: 'pencil',
            onClick: function () {
              this.props.setConnectionsMode("Add Note");
            }.bind(this) })
        )
      )
    );
  }
});

var LoginPanel = React.createClass({
  displayName: 'LoginPanel',

  propTypes: {
    fullPanel: React.PropTypes.bool
  },
  render: function render() {
    var nextParam = "?next=" + Sefaria.util.currentPath();
    var classes = classNames({ loginPanel: 1, textList: 1, fullPanel: this.props.fullPanel });
    return React.createElement(
      'div',
      { className: classes },
      React.createElement(
        'div',
        { className: 'texts' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          React.createElement(
            'div',
            { className: 'loginPanelMessage' },
            React.createElement(
              'span',
              { className: 'en' },
              'You must be logged in to use this feature.'
            ),
            React.createElement(
              'span',
              { className: 'he' },
              'עליך להיות מחובר בכדי להשתמש באפשרות זו.'
            )
          ),
          React.createElement(
            'a',
            { className: 'button', href: "/login" + nextParam },
            React.createElement(
              'span',
              { className: 'en' },
              'Log In'
            ),
            React.createElement(
              'span',
              { className: 'he' },
              'התחבר'
            )
          ),
          React.createElement(
            'a',
            { className: 'button', href: "/register" + nextParam },
            React.createElement(
              'span',
              { className: 'en' },
              'Sign Up'
            ),
            React.createElement(
              'span',
              { className: 'he' },
              'הרשם'
            )
          )
        )
      )
    );
  }
});

var SearchPage = React.createClass({
  displayName: 'SearchPage',

  propTypes: {
    query: React.PropTypes.string,
    appliedFilters: React.PropTypes.array,
    settings: React.PropTypes.object,
    close: React.PropTypes.func,
    onResultClick: React.PropTypes.func,
    onQueryChange: React.PropTypes.func,
    updateAppliedFilter: React.PropTypes.func,
    registerAvailableFilters: React.PropTypes.func,
    availableFilters: React.PropTypes.array,
    filtersValid: React.PropTypes.bool,
    hideNavHeader: React.PropTypes.bool
  },
  getInitialState: function getInitialState() {
    return {};
  },

  getDefaultProps: function getDefaultProps() {
    return {
      appliedFilters: []
    };
  },
  render: function render() {
    var fontSize = 62.5; // this.props.settings.fontSize, to make this respond to user setting. disabled for now.
    var style = { "fontSize": fontSize + "%" };
    var classes = classNames({ readerNavMenu: 1, noHeader: this.props.hideNavHeader });
    return React.createElement(
      'div',
      { className: classes },
      this.props.hideNavHeader ? null : React.createElement(
        'div',
        { className: 'readerNavTop search' },
        React.createElement(CategoryColorLine, { category: 'Other' }),
        React.createElement(ReaderNavigationMenuCloseButton, { onClick: this.props.close }),
        React.createElement(ReaderNavigationMenuDisplaySettingsButton, { onClick: this.props.openDisplaySettings }),
        React.createElement(SearchBar, {
          initialQuery: this.props.query,
          updateQuery: this.props.onQueryChange })
      ),
      React.createElement(
        'div',
        { className: 'content' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          React.createElement(
            'div',
            { className: 'searchContentFrame' },
            React.createElement(
              'h1',
              null,
              React.createElement(LanguageToggleButton, { toggleLanguage: this.props.toggleLanguage }),
              React.createElement(
                'span',
                { className: 'en' },
                '“',
                this.props.query,
                '”'
              ),
              React.createElement(
                'span',
                { className: 'he' },
                '”',
                this.props.query,
                '“'
              )
            ),
            React.createElement('div', { className: 'searchControlsBox' }),
            React.createElement(
              'div',
              { className: 'searchContent', style: style },
              React.createElement(SearchResultList, {
                query: this.props.query,
                appliedFilters: this.props.appliedFilters,
                onResultClick: this.props.onResultClick,
                updateAppliedFilter: this.props.updateAppliedFilter,
                registerAvailableFilters: this.props.registerAvailableFilters,
                availableFilters: this.props.availableFilters,
                filtersValid: this.props.filtersValid })
            )
          )
        )
      )
    );
  }
});

var SearchBar = React.createClass({
  displayName: 'SearchBar',

  propTypes: {
    initialQuery: React.PropTypes.string,
    updateQuery: React.PropTypes.func
  },
  getInitialState: function getInitialState() {
    return { query: this.props.initialQuery };
  },
  handleKeypress: function handleKeypress(event) {
    if (event.charCode == 13) {
      this.updateQuery();
      // Blur search input to close keyboard
      $(ReactDOM.findDOMNode(this)).find(".readerSearch").blur();
    }
  },
  updateQuery: function updateQuery() {
    if (this.props.updateQuery) {
      this.props.updateQuery(this.state.query);
    }
  },
  handleChange: function handleChange(event) {
    this.setState({ query: event.target.value });
  },
  render: function render() {
    return React.createElement(
      'div',
      null,
      React.createElement(
        'div',
        { className: 'searchBox' },
        React.createElement('input', { className: 'readerSearch', value: this.state.query, onKeyPress: this.handleKeypress, onChange: this.handleChange, placeholder: 'Search' }),
        React.createElement(ReaderNavigationMenuSearchButton, { onClick: this.updateQuery })
      ),
      React.createElement('div', { className: 'description' })
    );
  }
});

var SearchResultList = React.createClass({
  displayName: 'SearchResultList',

  propTypes: {
    query: React.PropTypes.string,
    appliedFilters: React.PropTypes.array,
    onResultClick: React.PropTypes.func,
    filtersValid: React.PropTypes.bool,
    availableFilters: React.PropTypes.array,
    updateAppliedFilter: React.PropTypes.func,
    registerAvailableFilters: React.PropTypes.func
  },
  initialQuerySize: 100,
  backgroundQuerySize: 1000,
  maxResultSize: 10000,
  resultDisplayStep: 50,
  getDefaultProps: function getDefaultProps() {
    return {
      appliedFilters: []
    };
  },
  getInitialState: function getInitialState() {
    return {
      types: ["text", "sheet"],
      runningQueries: { "text": null, "sheet": null },
      isQueryRunning: { "text": false, "sheet": false },
      moreToLoad: { "text": true, "sheet": true },
      totals: { "text": 0, "sheet": 0 },
      displayedUntil: { "text": 50, "sheet": 50 },
      hits: { "text": [], "sheet": [] },
      activeTab: "text",
      error: false
    };
  },
  updateRunningQuery: function updateRunningQuery(type, ajax) {
    this.state.runningQueries[type] = ajax;
    this.state.isQueryRunning[type] = !!ajax;
    this.setState({
      runningQueries: this.state.runningQueries,
      isQueryRunning: this.state.isQueryRunning
    });
  },
  _abortRunningQueries: function _abortRunningQueries() {
    var _this4 = this;

    this.state.types.forEach(function (t) {
      return _this4._abortRunningQuery(t);
    });
  },
  _abortRunningQuery: function _abortRunningQuery(type) {
    if (this.state.runningQueries[type]) {
      this.state.runningQueries[type].abort();
    }
    this.updateRunningQuery(type, null);
  },
  componentDidMount: function componentDidMount() {
    this._executeQueries();
    $(ReactDOM.findDOMNode(this)).closest(".content").bind("scroll", this.handleScroll);
  },
  componentWillUnmount: function componentWillUnmount() {
    this._abortRunningQueries();
    $(ReactDOM.findDOMNode(this)).closest(".content").unbind("scroll", this.handleScroll);
  },
  handleScroll: function handleScroll() {
    var tab = this.state.activeTab;
    if (this.state.displayedUntil[tab] >= this.state.totals[tab]) {
      return;
    }
    var $scrollable = $(ReactDOM.findDOMNode(this)).closest(".content");
    var margin = 100;
    if ($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this._extendResultsDisplayed();
    }
  },
  _extendResultsDisplayed: function _extendResultsDisplayed() {
    console.log("displaying more search results");
    var tab = this.state.activeTab;
    this.state.displayedUntil[tab] += this.resultDisplayStep;
    if (this.state.displayedUntil[tab] >= this.state.totals[tab]) {
      this.state.displayedUntil[tab] = this.state.totals[tab];
    }
    this.setState({ displayedUntil: this.state.displayedUntil });
  },
  componentWillReceiveProps: function componentWillReceiveProps(newProps) {
    if (this.props.query != newProps.query) {
      this.setState({
        totals: { "text": 0, "sheet": 0 },
        hits: { "text": [], "sheet": [] },
        moreToLoad: { "text": true, "sheet": true },
        displayedUntil: { "text": 50, "sheet": 50 }
      });
      this._executeQueries(newProps);
    } else if (this.props.appliedFilters.length !== newProps.appliedFilters.length || !this.props.appliedFilters.every(function (v, i) {
      return v === newProps.appliedFilters[i];
    })) {
      this._executeQueries(newProps);
    }
    // Execute a second query to apply filters after an initial query which got available filters
    else if (this.props.filtersValid != newProps.filtersValid && this.props.appliedFilters.length > 0) {
        this._executeQueries(newProps);
      }
  },
  _loadRemainder: function _loadRemainder(type, last, total, currentHits) {
    // Having loaded "last" results, and with "total" results to load, load the rest, this.backgroundQuerySize at a time
    if (last >= total || last >= this.maxResultSize) {
      this.state.moreToLoad[type] = false;
      this.setState({ moreToLoad: this.state.moreToLoad });
      return;
    }
    var query_props = {
      query: this.props.query,
      type: type,
      size: this.backgroundQuerySize,
      from: last,
      error: function error() {
        console.log("Failure in SearchResultList._loadRemainder");
      },
      success: function (data) {
        var hitArray = type == "text" ? this._process_text_hits(data.hits.hits) : data.hits.hits;
        var nextHits = currentHits.concat(hitArray);
        this.state.hits[type] = nextHits;

        this.setState({ hits: this.state.hits });
        this._loadRemainder(type, last + this.backgroundQuerySize, total, nextHits);
      }.bind(this)
    };
    if (type == "text") {
      extend(query_props, {
        get_filters: false,
        applied_filters: this.props.appliedFilters
      });
    }
    Sefaria.search.execute_query(query_props);
  },
  _executeQueries: function _executeQueries(props) {
    //This takes a props object, so as to be able to handle being called from componentWillReceiveProps with newProps
    props = props || this.props;
    if (!props.query) {
      return;
    }

    this._abortRunningQueries();

    // If there are no available filters yet, don't apply filters.  Split into two queries:
    // 1) Get all potential filters and counts
    // 2) Apply filters (Triggered from componentWillReceiveProps)
    var request_applied = props.filtersValid && props.appliedFilters;
    var isCompletionStep = !!request_applied || props.appliedFilters.length == 0;

    var runningSheetQuery = Sefaria.search.execute_query({
      query: props.query,
      type: "sheet",
      size: this.initialQuerySize,
      success: function (data) {
        //debugger;
        this.updateRunningQuery("sheet", null);
        if (this.isMounted()) {
          this.setState({
            hits: extend(this.state.hits, { "sheet": data.hits.hits }),
            totals: extend(this.state.totals, { "sheet": data.hits.total })
          });
        }
        if (isCompletionStep) {
          this._loadRemainder("sheet", this.initialQuerySize, data.hits.total, data.hits.hits);
        }
      }.bind(this),
      error: this._handle_error
    });

    var runningTextQuery = Sefaria.search.execute_query({
      query: props.query,
      type: "text",
      get_filters: !props.filtersValid,
      applied_filters: request_applied,
      size: this.initialQuerySize,
      success: function (data) {
        //debugger;
        this.updateRunningQuery("text", null);
        if (this.isMounted()) {
          var hitArray = this._process_text_hits(data.hits.hits);
          this.setState({
            hits: extend(this.state.hits, { "text": hitArray }),
            totals: extend(this.state.totals, { "text": data.hits.total })
          });
          if (data.aggregations) {
            if (data.aggregations.category) {
              var ftree = this._buildFilterTree(data.aggregations.category.buckets);
              var orphans = this._applyFilters(ftree, this.props.appliedFilters);
              this.props.registerAvailableFilters(ftree.availableFilters, ftree.registry, orphans);
            }
          }
          if (isCompletionStep) {
            this._loadRemainder("text", this.initialQuerySize, data.hits.total, hitArray);
          }
        }
      }.bind(this),
      error: this._handle_error
    });

    this.updateRunningQuery("text", runningTextQuery);
    this.updateRunningQuery("sheet", runningSheetQuery);
  },
  _handle_error: function _handle_error(jqXHR, textStatus, errorThrown) {
    if (textStatus == "abort") {
      // Abort is immediately followed by new query, above.  Worried there would be a race if we call updateCurrentQuery(null) from here
      //this.updateCurrentQuery(null);
      return;
    }
    if (this.isMounted()) {
      this.setState({
        error: true
      });
      this.updateRunningQuery(null);
    }
  },
  _process_text_hits: function _process_text_hits(hits) {
    var comparingRef = null;
    var newHits = [];

    for (var i = 0, j = 0; i < hits.length; i++) {
      var currentRef = hits[i]._source.ref;
      if (currentRef == comparingRef) {
        newHits[j - 1].duplicates = newHits[j - 1].duplicates || [];
        newHits[j - 1].duplicates.push(hits[i]);
      } else {
        newHits[j] = hits[i];
        j++;
        comparingRef = currentRef;
      }
    }
    return newHits;
  },
  _buildFilterTree: function _buildFilterTree(aggregation_buckets) {
    var _this5 = this;

    //returns object w/ keys 'availableFilters', 'registry'
    //Add already applied filters w/ empty doc count?
    var rawTree = {};

    this.props.appliedFilters.forEach(function (fkey) {
      return _this5._addAvailableFilter(rawTree, fkey, { "docCount": 0 });
    });

    aggregation_buckets.forEach(function (f) {
      return _this5._addAvailableFilter(rawTree, f["key"], { "docCount": f["doc_count"] });
    });
    this._aggregate(rawTree);
    return this._build(rawTree);
  },

  _addAvailableFilter: function _addAvailableFilter(rawTree, key, data) {
    //key is a '/' separated key list, data is an arbitrary object
    //Based on http://stackoverflow.com/a/11433067/213042
    var keys = key.split("/");
    var base = rawTree;

    // If a value is given, remove the last name and keep it for later:
    var lastName = arguments.length === 3 ? keys.pop() : false;

    // Walk the hierarchy, creating new objects where needed.
    // If the lastName was removed, then the last object is not set yet:
    var i;
    for (i = 0; i < keys.length; i++) {
      base = base[keys[i]] = base[keys[i]] || {};
    }

    // If a value was given, set it to the last name:
    if (lastName) {
      base = base[lastName] = data;
    }

    // Could return the last object in the hierarchy.
    // return base;
  },
  _aggregate: function _aggregate(rawTree) {
    //Iterates the raw tree to aggregate doc_counts from the bottom up
    //Nod to http://stackoverflow.com/a/17546800/213042
    walker("", rawTree);
    function walker(key, branch) {
      if (branch !== null && (typeof branch === 'undefined' ? 'undefined' : _typeof(branch)) === "object") {
        // Recurse into children
        $.each(branch, walker);
        // Do the summation with a hacked object 'reduce'
        if (!("docCount" in branch) || branch["docCount"] === 0) {
          branch["docCount"] = Object.keys(branch).reduce(function (previous, key) {
            if (_typeof(branch[key]) === "object" && "docCount" in branch[key]) {
              previous += branch[key].docCount;
            }
            return previous;
          }, 0);
        }
      }
    }
  },
  _build: function _build(rawTree) {
    //returns dict w/ keys 'availableFilters', 'registry'
    //Aggregate counts, then sort rawTree into filter objects and add Hebrew using Sefaria.toc as reference
    //Nod to http://stackoverflow.com/a/17546800/213042
    var path = [];
    var filters = [];
    var registry = {};

    var commentaryNode = new Sefaria.search.FilterNode();

    for (var j = 0; j < Sefaria.toc.length; j++) {
      var b = walk.call(this, Sefaria.toc[j]);
      if (b) filters.push(b);

      // Remove after commentary refactor ?
      // If there is commentary on this node, add it as a sibling
      if (commentaryNode.hasChildren()) {
        var toc_branch = Sefaria.toc[j];
        var cat = toc_branch["category"];
        // Append commentary node to result filters, add a fresh one for the next round
        var docCount = 0;
        if (rawTree.Commentary && rawTree.Commentary[cat]) {
          docCount += rawTree.Commentary[cat].docCount;
        }
        if (rawTree.Commentary2 && rawTree.Commentary2[cat]) {
          docCount += rawTree.Commentary2[cat].docCount;
        }
        extend(commentaryNode, {
          "title": cat + " Commentary",
          "path": "Commentary/" + cat,
          "heTitle": "מפרשי" + " " + toc_branch["heCategory"],
          "docCount": docCount
        });
        registry[commentaryNode.path] = commentaryNode;
        filters.push(commentaryNode);
        commentaryNode = new Sefaria.search.FilterNode();
      }
    }

    return { availableFilters: filters, registry: registry };

    function walk(branch, parentNode) {
      var node = new Sefaria.search.FilterNode();

      //Remove after commentary refactor
      node["docCount"] = 0;
      //

      if ("category" in branch) {
        // Category node
        // Remove after commentary refactor
        if (branch["category"] == "Commentary") {
          // Special case commentary
          path.unshift(branch["category"]); // Place "Commentary" at the *beginning* of the path
          extend(node, {
            "title": parentNode.title,
            "path": path.join("/"),
            "heTitle": parentNode.heTitle
          });
        } else {
          // End commentary code

          path.push(branch["category"]); // Place this category at the *end* of the path
          extend(node, {
            "title": path.slice(-1)[0],
            "path": path.join("/"),
            "heTitle": branch["heCategory"]
          });

          // Remove after commentary refactor
        }
        // End commentary code

        for (var j = 0; j < branch["contents"].length; j++) {
          var b = walk.call(this, branch["contents"][j], node);
          if (b) node.append(b);
        }
      } else if ("title" in branch) {
        // Text Node
        path.push(branch["title"]);
        extend(node, {
          "title": path.slice(-1)[0],
          "path": path.join("/"),
          "heTitle": branch["heTitle"]
        });
      }

      try {
        var rawNode = rawTree;
        var i;

        // Remove try and entire catch after commentary refactor
        try {
          for (i = 0; i < path.length; i++) {
            //For TOC nodes that we don't have results for, we catch the exception below.  For commentary / commentary2, we catch it here.
            rawNode = rawNode[path[i]];
          }
          node["docCount"] += rawNode.docCount;
        } catch (e) {
          if (path[0] == "Commentary") {
            rawNode = rawTree["Commentary2"];
            for (i = 1; i < path.length; i++) {
              rawNode = rawNode[path[i]];
            }
            node["docCount"] += rawNode.docCount;
          } else {
            throw e;
          }
        }

        // Do we need both of these in the registry?
        registry[node.getId()] = node;
        registry[node.path] = node;

        // Remove after commentary refactor
        if ("category" in branch && branch["category"] == "Commentary") {
          // Special case commentary
          commentaryNode.append(node);
          path.shift();
          return false;
        }
        // End commentary code

        path.pop();
        return node;
      } catch (e) {
        // Remove after commentary refactor
        if ("category" in branch && branch["category"] == "Commentary") {
          // Special case commentary
          path.shift();
        } else {
          // End commentary code

          path.pop();

          // Remove after commentary refactor
        }
        // End commentary code

        return false;
      }
    }
  },
  _applyFilters: function _applyFilters(ftree, appliedFilters) {
    var orphans = []; // todo: confirm behavior
    appliedFilters.forEach(function (path) {
      var node = ftree.registry[path];
      if (node) {
        node.setSelected(true);
      } else {
        orphans.push(path);
      }
    });
    return orphans;
  },
  showSheets: function showSheets() {
    this.setState({ "activeTab": "sheet" });
  },
  showTexts: function showTexts() {
    this.setState({ "activeTab": "text" });
  },
  render: function render() {
    var _this6 = this;

    if (!this.props.query) {
      // Push this up? Thought is to choose on the SearchPage level whether to show a ResultList or an EmptySearchMessage.
      return null;
    }

    var tab = this.state.activeTab;
    var results = [];

    if (tab == "text") {
      results = this.state.hits.text.slice(0, this.state.displayedUntil["text"]).map(function (result) {
        return React.createElement(SearchTextResult, {
          data: result,
          query: _this6.props.query,
          key: result._id,
          onResultClick: _this6.props.onResultClick });
      });
    } else if (tab == "sheet") {
      results = this.state.hits.sheet.slice(0, this.state.displayedUntil["sheet"]).map(function (result) {
        return React.createElement(SearchSheetResult, {
          data: result,
          query: _this6.props.query,
          key: result._id });
      });
    }

    var loadingMessage = React.createElement(LoadingMessage, { message: 'Searching...', heMessage: 'מבצע חיפוש...' });
    var noResultsMessage = React.createElement(LoadingMessage, { message: '0 results.', heMessage: '0 תוצאות.' });

    var queryLoaded = !this.state.moreToLoad[tab] && !this.state.isQueryRunning[tab];
    var haveResults = !!results.length;
    results = haveResults ? results : noResultsMessage;
    var searchFilters = React.createElement(SearchFilters, {
      query: this.props.query,
      total: this.state.totals["text"] + this.state.totals["sheet"],
      textTotal: this.state.totals["text"],
      sheetTotal: this.state.totals["sheet"],
      availableFilters: this.props.availableFilters,
      appliedFilters: this.props.appliedFilters,
      updateAppliedFilter: this.props.updateAppliedFilter,
      isQueryRunning: this.state.isQueryRunning[tab],
      activeTab: this.state.activeTab,
      clickTextButton: this.showTexts,
      clickSheetButton: this.showSheets });
    return React.createElement(
      'div',
      null,
      searchFilters,
      queryLoaded ? results : loadingMessage
    );
  }
});

var SearchFilters = React.createClass({
  displayName: 'SearchFilters',

  propTypes: {
    query: React.PropTypes.string,
    total: React.PropTypes.number,
    textTotal: React.PropTypes.number,
    sheetTotal: React.PropTypes.number,
    appliedFilters: React.PropTypes.array,
    availableFilters: React.PropTypes.array,
    updateAppliedFilter: React.PropTypes.func,
    isQueryRunning: React.PropTypes.bool,
    activeTab: React.PropTypes.string,
    clickTextButton: React.PropTypes.func,
    clickSheetButton: React.PropTypes.func
  },
  getInitialState: function getInitialState() {
    return {
      openedCategory: null,
      openedCategoryBooks: [],
      displayFilters: !!this.props.appliedFilters.length
    };
  },
  getDefaultProps: function getDefaultProps() {
    return {
      appliedFilters: [],
      availableFilters: []
    };
  },
  componentWillReceiveProps: function componentWillReceiveProps(newProps) {
    // Save current filters
    // this.props
    // todo: check for cases when we want to rebuild / not

    if (newProps.query != this.props.query || newProps.availableFilters.length == 0) {
      this.setState({
        openedCategory: null,
        openedCategoryBooks: []
      });
    }
    // todo: logically, we should be unapplying filters as well.
    // Because we compute filter removal from teh same object, this ends up sliding in messily in the setState.
    // Hard to see how to get it through the front door.
    //if (this.state.openedCategory) {
    //   debugger;
    // }
    /*
    if (newProps.appliedFilters &&
             ((newProps.appliedFilters.length !== this.props.appliedFilters.length)
              || !(newProps.appliedFilters.every((v,i) => v === this.props.appliedFilters[i]))
             )
           ) {
     if (this.state.openedCategory) {
       this.handleFocusCategory(this.state.openedCategory);
     }
    } */
  },

  getSelectedTitles: function getSelectedTitles(lang) {
    var results = [];
    for (var i = 0; i < this.props.availableFilters.length; i++) {
      results = results.concat(this.props.availableFilters[i].getSelectedTitles(lang));
    }
    return results;
  },
  handleFocusCategory: function handleFocusCategory(filterNode) {
    var leaves = filterNode.getLeafNodes();
    this.setState({
      openedCategory: filterNode,
      openedCategoryBooks: leaves
    });
  },
  toggleFilterView: function toggleFilterView() {
    this.setState({ displayFilters: !this.state.displayFilters });
  },
  _type_button: function _type_button(en_singular, en_plural, he_singular, he_plural, total, on_click, active) {
    // if (!total) { return "" }
    var total_with_commas = this._add_commas(total);
    var classes = classNames({ "type-button": 1, active: active });

    return React.createElement(
      'div',
      { className: classes, onClick: on_click },
      React.createElement(
        'div',
        { className: 'type-button-total' },
        total_with_commas
      ),
      React.createElement(
        'div',
        { className: 'type-button-title' },
        React.createElement(
          'span',
          { className: 'en' },
          total != 1 ? en_plural : en_singular
        ),
        React.createElement(
          'span',
          { className: 'he' },
          total != 1 ? he_plural : he_singular
        )
      )
    );
  },
  _add_commas: function _add_commas(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  },
  render: function render() {

    var runningQueryLine = React.createElement(LoadingMessage, { message: 'Searching...', heMessage: 'מבצע חיפוש...' });

    var buttons = React.createElement(
      'div',
      { className: 'type-buttons' },
      this._type_button("Text", "Texts", "מקור", "מקורות", this.props.textTotal, this.props.clickTextButton, this.props.activeTab == "text"),
      this._type_button("Sheet", "Sheets", "דף מקורות", "דפי מקורות", this.props.sheetTotal, this.props.clickSheetButton, this.props.activeTab == "sheet")
    );

    var selected_filters = React.createElement(
      'div',
      { className: 'results-count' },
      React.createElement(
        'span',
        { className: 'en' },
        !!this.props.appliedFilters.length && !!this.props.total ? this.getSelectedTitles("en").join(", ") : ""
      ),
      React.createElement(
        'span',
        { className: 'he' },
        !!this.props.appliedFilters.length && !!this.props.total ? this.getSelectedTitles("he").join(", ") : ""
      )
    );
    var filter_panel = React.createElement(
      'div',
      null,
      React.createElement(
        'div',
        { className: 'searchFilterToggle', onClick: this.toggleFilterView },
        React.createElement(
          'span',
          { className: 'en' },
          'Filter by Text   '
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'סנן לפי כותר   '
        ),
        React.createElement('i', { className: this.state.displayFilters ? "fa fa-caret-down fa-angle-down" : "fa fa-caret-down" })
      ),
      React.createElement(
        'div',
        { className: 'searchFilterBoxes', style: { display: this.state.displayFilters ? "block" : "none" } },
        React.createElement(
          'div',
          { className: 'searchFilterCategoryBox' },
          this.props.availableFilters.map(function (filter) {
            return React.createElement(SearchFilter, {
              filter: filter,
              isInFocus: this.state.openedCategory === filter,
              focusCategory: this.handleFocusCategory,
              updateSelected: this.props.updateAppliedFilter,
              key: filter.path });
          }.bind(this))
        ),
        React.createElement(
          'div',
          { className: 'searchFilterBookBox' },
          this.state.openedCategoryBooks.map(function (filter) {
            return React.createElement(SearchFilter, {
              filter: filter,
              updateSelected: this.props.updateAppliedFilter,
              key: filter.path });
          }.bind(this))
        ),
        React.createElement('div', { style: { clear: "both" } })
      )
    );

    return React.createElement(
      'div',
      { className: classNames({ searchTopMatter: 1, loading: this.props.isQueryRunning }) },
      React.createElement(
        'div',
        { className: 'searchStatusLine' },
        this.props.isQueryRunning ? runningQueryLine : buttons,
        this.props.availableFilters.length > 0 && this.props.activeTab == "text" ? selected_filters : ""
      ),
      this.props.availableFilters.length > 0 && this.props.activeTab == "text" ? filter_panel : ""
    );
  }
});

var SearchFilter = React.createClass({
  displayName: 'SearchFilter',

  propTypes: {
    filter: React.PropTypes.object.isRequired,
    isInFocus: React.PropTypes.bool,
    updateSelected: React.PropTypes.func.isRequired,
    focusCategory: React.PropTypes.func
  },
  getInitialState: function getInitialState() {
    return { selected: this.props.filter.selected };
  },
  componentWillReceiveProps: function componentWillReceiveProps(newProps) {
    if (newProps.filter.selected != this.state.selected) {
      this.setState({ selected: newProps.filter.selected });
    }
  },

  // Can't set indeterminate in the render phase.  https://github.com/facebook/react/issues/1798
  componentDidMount: function componentDidMount() {
    ReactDOM.findDOMNode(this).querySelector("input").indeterminate = this.props.filter.isPartial();
  },
  componentDidUpdate: function componentDidUpdate() {
    ReactDOM.findDOMNode(this).querySelector("input").indeterminate = this.props.filter.isPartial();
  },
  handleFilterClick: function handleFilterClick(evt) {
    //evt.preventDefault();
    this.props.updateSelected(this.props.filter);
  },
  handleFocusCategory: function handleFocusCategory() {
    if (this.props.focusCategory) {
      this.props.focusCategory(this.props.filter);
    }
  },
  render: function render() {
    return React.createElement(
      'li',
      { onClick: this.handleFocusCategory },
      React.createElement('input', { type: 'checkbox', className: 'filter', checked: this.state.selected == 1, onChange: this.handleFilterClick }),
      React.createElement(
        'span',
        { className: 'en' },
        React.createElement(
          'span',
          { className: 'filter-title' },
          this.props.filter.title
        ),
        ' ',
        React.createElement(
          'span',
          { className: 'filter-count' },
          '(',
          this.props.filter.docCount,
          ')'
        )
      ),
      React.createElement(
        'span',
        { className: 'he', dir: 'rtl' },
        React.createElement(
          'span',
          { className: 'filter-title' },
          this.props.filter.heTitle
        ),
        ' ',
        React.createElement(
          'span',
          { className: 'filter-count' },
          '(',
          this.props.filter.docCount,
          ')'
        )
      ),
      this.props.isInFocus ? React.createElement(
        'span',
        { className: 'en' },
        React.createElement('i', { className: 'in-focus-arrow fa fa-caret-right' })
      ) : "",
      this.props.isInFocus ? React.createElement(
        'span',
        { className: 'he' },
        React.createElement('i', { className: 'in-focus-arrow fa fa-caret-left' })
      ) : ""
    );
  }
});

var SearchTextResult = React.createClass({
  displayName: 'SearchTextResult',

  propTypes: {
    query: React.PropTypes.string,
    data: React.PropTypes.object,
    onResultClick: React.PropTypes.func
  },
  getInitialState: function getInitialState() {
    return {
      duplicatesShown: false
    };
  },
  toggleDuplicates: function toggleDuplicates(event) {
    this.setState({
      duplicatesShown: !this.state.duplicatesShown
    });
  },
  handleResultClick: function handleResultClick(event) {
    if (this.props.onResultClick) {
      event.preventDefault();
      var s = this.props.data._source;
      this.props.onResultClick(s.ref, s.version, s.lang, { "highlight": this.props.query }); //highlight not yet handled, above in ReaderApp.handleNavigationClick()
    }
  },
  render: function render() {
    var data = this.props.data;
    var s = this.props.data._source;
    var href = '/' + Sefaria.normRef(s.ref) + "/" + s.lang + "/" + s.version.replace(/ +/g, "_") + '?qh=' + this.props.query;

    function get_snippet_markup() {
      var snippet;
      // if (data.highlight && data.highlight["content"]) {
      snippet = data.highlight["content"].join("...");
      // } else {
      //     snippet = s["content"];  // We're filtering out content, because it's *huge*, especially on Sheets
      // }
      snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").html();
      return { __html: snippet };
    }

    var more_results_caret = this.state.duplicatesShown ? React.createElement('i', { className: 'fa fa-caret-down fa-angle-down' }) : React.createElement('i', { className: 'fa fa-caret-down' });

    var more_results_indicator = !data.duplicates ? "" : React.createElement(
      'div',
      { className: 'similar-trigger-box', onClick: this.toggleDuplicates },
      React.createElement(
        'span',
        { className: 'similar-title he' },
        data.duplicates.length,
        ' ',
        data.duplicates.length > 1 ? " גרסאות נוספות" : " גרסה נוספת"
      ),
      React.createElement(
        'span',
        { className: 'similar-title en' },
        data.duplicates.length,
        ' more version',
        data.duplicates.length > 1 ? "s" : null
      ),
      more_results_caret
    );

    var shown_duplicates = data.duplicates && this.state.duplicatesShown ? React.createElement(
      'div',
      { className: 'similar-results' },
      data.duplicates.map(function (result) {
        var key = result._source.ref + "-" + result._source.version;
        return React.createElement(SearchTextResult, {
          data: result,
          key: key,
          query: this.props.query,
          onResultClick: this.props.onResultClick
        });
      }.bind(this))
    ) : null;

    return React.createElement(
      'div',
      { className: 'result text_result' },
      React.createElement(
        'a',
        { href: href, onClick: this.handleResultClick },
        React.createElement(
          'div',
          { className: 'result-title' },
          React.createElement(
            'span',
            { className: 'en' },
            s.ref
          ),
          React.createElement(
            'span',
            { className: 'he' },
            s.heRef
          )
        ),
        React.createElement('div', { className: 'snippet', dangerouslySetInnerHTML: get_snippet_markup() }),
        React.createElement(
          'div',
          { className: 'version' },
          s.version
        )
      ),
      more_results_indicator,
      shown_duplicates
    );
  }
});

var SearchSheetResult = React.createClass({
  displayName: 'SearchSheetResult',

  propTypes: {
    query: React.PropTypes.string,
    data: React.PropTypes.object
  },

  render: function render() {
    var data = this.props.data;
    var s = data._source;

    var snippet = data.highlight.content.join("..."); // data.highlight ? data.highlight.content.join("...") : s.content;
    snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").text();

    function get_version_markup() {
      return { __html: s.version };
    }
    var clean_title = $("<span>" + s.title + "</span>").text();
    var href = "/sheets/" + s.sheetId;
    return React.createElement(
      'div',
      { className: 'result sheet_result' },
      React.createElement(
        'div',
        { className: 'result_img_box' },
        React.createElement(
          'a',
          { href: s.profile_url },
          React.createElement('img', { className: 'owner_image', src: s.owner_image })
        )
      ),
      React.createElement(
        'div',
        { className: 'result_text_box' },
        React.createElement(
          'a',
          { href: s.profile_url, className: 'owner_name' },
          s.owner_name
        ),
        React.createElement(
          'a',
          { className: 'result-title', href: href },
          clean_title
        ),
        React.createElement(
          'div',
          { className: 'snippet' },
          snippet
        )
      )
    );
  }
});

var AccountPanel = React.createClass({
  displayName: 'AccountPanel',

  propTypes: {
    interfaceLang: React.PropTypes.string
  },
  render: function render() {
    var width = typeof window !== "undefined" ? $(window).width() : 1000;
    var accountContent = [React.createElement(BlockLink, { target: '/my/profile', title: 'Profile', heTitle: 'פרופיל' }), React.createElement(BlockLink, { target: '/sheets/private', title: 'My Source Sheets', heTitle: 'דפי מקורות' }), React.createElement(BlockLink, { target: '#', title: 'Reading History', heTitle: 'היסטוריה קריאה' }), React.createElement(BlockLink, { target: '#', title: 'My Notes', heTitle: 'רשומות' }), React.createElement(BlockLink, { target: '/settings/account', title: 'Settings', heTitle: 'הגדרות' }), React.createElement(BlockLink, { target: '/logout', title: 'Log Out', heTitle: 'ניתוק' })];
    accountContent = React.createElement(TwoOrThreeBox, { content: accountContent, width: width });

    var learnContent = [React.createElement(BlockLink, { target: '/about', title: 'About', heTitle: 'אודות' }), React.createElement(BlockLink, { target: '/faq', title: 'FAQ', heTitle: 'שאלות נפוצות' }), React.createElement(BlockLink, { target: 'http://blog.sefaria.org', title: 'Blog', heTitle: 'בלוג' }), React.createElement(BlockLink, { target: '/educators', title: 'Educators', heTitle: 'מחנכים' }), React.createElement(BlockLink, { target: '/help', title: 'Help', heTitle: 'עזרה' }), React.createElement(BlockLink, { target: '/team', title: 'Team', heTitle: 'צוות' })];
    learnContent = React.createElement(TwoOrThreeBox, { content: learnContent, width: width });

    var contributeContent = [React.createElement(BlockLink, { target: '/activity', title: 'Recent Activity', heTitle: 'פעילות אחרונה' }), React.createElement(BlockLink, { target: '/metrics', title: 'Metrics', heTitle: 'מדדים' }), React.createElement(BlockLink, { target: '/contribute', title: 'Contribute', heTitle: 'הצטרפות לעשיה' }), React.createElement(BlockLink, { target: '/donate', title: 'Donate', heTitle: 'תרומות' }), React.createElement(BlockLink, { target: '/supporters', title: 'Supporters', heTitle: 'תומכים' }), React.createElement(BlockLink, { target: '/jobs', title: 'Jobs', heTitle: 'דרושים' })];
    contributeContent = React.createElement(TwoOrThreeBox, { content: contributeContent, width: width });

    var connectContent = [React.createElement(BlockLink, { target: 'https://groups.google.com/forum/?fromgroups#!forum/sefaria', title: 'Forum', heTitle: 'פורום' }), React.createElement(BlockLink, { target: 'http://www.facebook.com/sefaria.org', title: 'Facebook', heTitle: 'פייסבוק' }), React.createElement(BlockLink, { target: 'http://twitter.com/SefariaProject', title: 'Twitter', heTitle: 'טוויטר' }), React.createElement(BlockLink, { target: 'http://www.youtube.com/user/SefariaProject', title: 'YouTube', heTitle: 'יוטיוב' }), React.createElement(BlockLink, { target: 'http://www.github.com/Sefaria', title: 'GitHub', heTitle: 'גיטהאב' }), React.createElement(BlockLink, { target: 'mailto:hello@sefaria.org', title: 'Email', heTitle: 'אימייל' })];
    connectContent = React.createElement(TwoOrThreeBox, { content: connectContent, width: width });

    var classes = { accountPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: 1 };
    classes[this.props.interfaceLang] = 1;
    var classStr = classNames(classes);
    return React.createElement(
      'div',
      { className: classStr },
      React.createElement(
        'div',
        { className: 'content' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          React.createElement(
            'h1',
            null,
            React.createElement(
              'span',
              { className: 'en' },
              'Account'
            ),
            React.createElement(
              'span',
              { className: 'he' },
              'חשבון משתמש'
            )
          ),
          React.createElement(ReaderNavigationMenuSection, { content: accountContent }),
          React.createElement(ReaderNavigationMenuSection, { title: 'Learn', heTitle: 'לימוד', content: learnContent }),
          React.createElement(ReaderNavigationMenuSection, { title: 'Contribute', heTitle: 'עשייה', content: contributeContent }),
          React.createElement(ReaderNavigationMenuSection, { title: 'Connect', heTitle: 'התחברות', content: connectContent })
        )
      )
    );
  }
});

var NotificationsPanel = React.createClass({
  displayName: 'NotificationsPanel',

  propTypes: {
    setUnreadNotificationsCount: React.PropTypes.func.isRequired,
    interfaceLang: React.PropTypes.string
  },
  getInitialState: function getInitialState() {
    return {
      page: 2,
      loadedToEnd: false,
      loading: false
    };
  },
  componentDidMount: function componentDidMount() {
    $(ReactDOM.findDOMNode(this)).find(".content").bind("scroll", this.handleScroll);
    this.markAsRead();
  },
  componentDidUpdate: function componentDidUpdate() {
    this.markAsRead();
  },
  handleScroll: function handleScroll() {
    if (this.state.loadedToEnd || this.state.loading) {
      return;
    }
    var $scrollable = $(ReactDOM.findDOMNode(this)).find(".content");
    var margin = 100;
    if ($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this.getMoreNotifications();
    }
  },
  markAsRead: function markAsRead() {
    // Marks each notification that is loaded into the page as read via API call
    var ids = [];
    $(".notification.unread").not(".marked").each(function () {
      ids.push($(this).attr("data-id"));
    });
    if (ids.length) {
      $.post("/api/notifications/read", { notifications: JSON.stringify(ids) }, function (data) {
        $(".notification.unread").addClass("marked");
        this.props.setUnreadNotificationsCount(data.unreadCount);
      }.bind(this));
    }
  },
  getMoreNotifications: function getMoreNotifications() {
    console.log("getting more notifications");
    $.getJSON("/api/notifications?page=" + this.state.page, this.loadMoreNotifications);
    this.setState({ loading: true });
  },
  loadMoreNotifications: function loadMoreNotifications(data) {
    if (data.count < data.page_size) {
      this.setState({ loadedToEnd: true });
    }
    Sefaria.notificationsHtml += data.html;
    this.setState({ page: data.page + 1, loading: false });
    this.forceUpdate();
  },
  render: function render() {
    var classes = { notificationsPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: 1 };
    classes[this.props.interfaceLang] = 1;
    var classStr = classNames(classes);
    return React.createElement(
      'div',
      { className: classStr },
      React.createElement(
        'div',
        { className: 'content' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          React.createElement(
            'h1',
            null,
            React.createElement(
              'span',
              { className: 'en' },
              'Notifications'
            ),
            React.createElement(
              'span',
              { className: 'he' },
              'התראות'
            )
          ),
          Sefaria.loggedIn ? React.createElement('div', { className: 'notificationsList', dangerouslySetInnerHTML: { __html: Sefaria.notificationsHtml } }) : React.createElement(LoginPanel, { fullPanel: true })
        )
      )
    );
  }
});

var ThreeBox = React.createClass({
  displayName: 'ThreeBox',

  // Wrap a list of elements into a three column table
  render: function render() {
    var content = this.props.content;
    var length = content.length;
    if (length % 3) {
      length += 3 - length % 3;
    }
    content.pad(length, "");
    var threes = [];
    for (var i = 0; i < length; i += 3) {
      threes.push([content[i], content[i + 1], content[i + 2]]);
    }
    return React.createElement(
      'table',
      { className: 'gridBox threeBox' },
      React.createElement(
        'tbody',
        null,
        threes.map(function (row, i) {
          return React.createElement(
            'tr',
            { key: i },
            row[0] ? React.createElement(
              'td',
              null,
              row[0]
            ) : null,
            row[1] ? React.createElement(
              'td',
              null,
              row[1]
            ) : null,
            row[2] ? React.createElement(
              'td',
              null,
              row[2]
            ) : null
          );
        })
      )
    );
  }
});

var TwoBox = React.createClass({
  displayName: 'TwoBox',

  // Wrap a list of elements into a three column table
  propTypes: {
    content: React.PropTypes.array.isRequired
  },
  render: function render() {
    var content = this.props.content;
    var length = content.length;
    if (length % 2) {
      length += 2 - length % 2;
    }
    content.pad(length, "");
    var twos = [];
    for (var i = 0; i < length; i += 2) {
      twos.push([content[i], content[i + 1]]);
    }
    return React.createElement(
      'table',
      { className: 'gridBox twoBox' },
      React.createElement(
        'tbody',
        null,
        twos.map(function (row, i) {
          return React.createElement(
            'tr',
            { key: i },
            row[0] ? React.createElement(
              'td',
              null,
              row[0]
            ) : null,
            row[1] ? React.createElement(
              'td',
              null,
              row[1]
            ) : null
          );
        })
      )
    );
  }
});

var TwoOrThreeBox = React.createClass({
  displayName: 'TwoOrThreeBox',

  // Wrap a list of elements into a two or three column table, depending on window width
  propTypes: {
    content: React.PropTypes.array.isRequired,
    width: React.PropTypes.number.isRequired,
    threshhold: React.PropTypes.number
  },
  render: function render() {
    var threshhold = this.props.threshhold || 450;
    if (this.props.width > threshhold) {
      return React.createElement(ThreeBox, { content: this.props.content });
    } else {
      return React.createElement(TwoBox, { content: this.props.content });
    }
  }
});

var LoadingMessage = React.createClass({
  displayName: 'LoadingMessage',

  propTypes: {
    message: React.PropTypes.string,
    heMessage: React.PropTypes.string,
    className: React.PropTypes.string
  },
  render: function render() {
    var message = this.props.message || "Loading...";
    var heMessage = this.props.heMessage || "טוען מידע...";
    var classes = "loadingMessage " + (this.props.className || "");
    return React.createElement(
      'div',
      { className: classes },
      React.createElement(
        'span',
        { className: 'en' },
        message
      ),
      React.createElement(
        'span',
        { className: 'he' },
        heMessage
      )
    );
  }
});

var TestMessage = React.createClass({
  displayName: 'TestMessage',

  // Modal explaining development status with links to send feedback or go back to the old site
  propTypes: {
    hide: React.PropTypes.func
  },
  render: function render() {
    return React.createElement(
      'div',
      { className: 'testMessageBox' },
      React.createElement('div', { className: 'overlay', onClick: this.props.hide }),
      React.createElement(
        'div',
        { className: 'testMessage' },
        React.createElement(
          'div',
          { className: 'title' },
          'The new Sefaria is still in development.',
          React.createElement('br', null),
          'Thank you for helping us test and improve it.'
        ),
        React.createElement(
          'a',
          { href: 'mailto:hello@sefaria.org', target: '_blank', className: 'button' },
          'Send Feedback'
        ),
        React.createElement(
          'div',
          { className: 'button', onClick: backToS1 },
          'Return to Old Sefaria'
        )
      )
    );
  }
});

var openInNewTab = function openInNewTab(url) {
  var win = window.open(url, '_blank');
  win.focus();
};

var backToS1 = function backToS1() {
  cookie("s2", "", { path: "/" });
  window.location = "/";
};

var setData = function setData(data) {
  // Set core data in the module that was loaded in a different scope
  Sefaria.toc = data.toc;
  Sefaria.books = data.books;
  Sefaria.calendar = data.calendar;
  if ("booksDict" in data) {
    Sefaria.booksDict = data.booksDict;
  } else {
    Sefaria._makeBooksDict();
  }

  Sefaria._cacheIndexFromToc(Sefaria.toc);

  if ("recentlyViewed" in data) {
    // Store data in a mock cookie function
    // (Node doesn't have direct access to Django's cookies, so pass through props in POST data)
    var json = decodeURIComponent(data.recentlyViewed);
    cookie("recentlyViewed", json);
  }

  Sefaria.util._defaultPath = data.path;
  Sefaria.loggedIn = data.loggedIn;
};

if (typeof exports !== 'undefined') {
  exports.ReaderApp = ReaderApp;
  exports.ReaderPanel = ReaderPanel;
  exports.ConnectionsPanel = ConnectionsPanel;
  exports.TextRange = TextRange;
  exports.TextColumn = TextColumn;
  exports.setData = setData;
  exports.unpackDataFromProps = Sefaria.unpackDataFromProps;
}

