'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

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
    initialGroup: React.PropTypes.string,
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
      initialGroup: null,
      initialQuery: null,
      initialSearchFilters: [],
      initialSheetsTag: null,
      initialNavigationCategories: [],
      initialPanels: [],
      initialDefaultVersions: {},
      initialPanelCap: 2,
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
          navigationCategories: this.props.initialNavigationCategories,
          sheetsTag: this.props.initialSheetsTag,
          group: this.props.initialGroup,
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
        group: this.props.initialGroup,
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
          settings: "settings" in this.props.initialPanels[0] ? extend(Sefaria.util.clone(defaultPanelSettings), this.props.initialPanels[0].settings) : Sefaria.util.clone(defaultPanelSettings)
        };
        if (p.versionLanguage && !"settings" in this.props.initialPanels[0]) {
          p.settings.language = p.versionLanguage == "he" ? "hebrew" : "english";
        }
        panels.push(p);
      }
      for (var i = panels.length; i < this.props.initialPanels.length; i++) {
        var panel;
        if (this.props.initialPanels[i].menuOpen == "book toc") {
          panel = {
            menuOpen: this.props.initialPanels[i].menuOpen,
            bookRef: this.props.initialPanels[i].bookRef,
            settings: "settings" in this.props.initialPanels[i] ? extend(Sefaria.util.clone(defaultPanelSettings), this.props.initialPanels[i].settings) : Sefaria.util.clone(defaultPanelSettings)
          };
        } else {
          panel = this.clonePanel(this.props.initialPanels[i]);
          panel.settings = Sefaria.util.clone(defaultPanelSettings);
          if (panel.versionLanguage && !"settings" in this.props.initialPanels[i]) {
            panel.settings.language = panel.versionLanguage == "he" ? "hebrew" : "english";
          }
        }
        panels.push(panel);
      }
    }
    panels = panels.map(function (panel) {
      return this.makePanelState(panel);
    }.bind(this));

    var layoutOrientation = this.props.interfaceLang == "english" ? "ltr" : "rtl";
    /*if ((panels.length > 0 && panels[0].settings && panels[0].settings.language == "hebrew")
       || (header.settings && header.settings.language == "hebrew")) {
      layoutOrientation = "rtl";
    }*/

    return {
      panels: panels,
      header: header,
      headerMode: this.props.headerMode,
      defaultVersions: defaultVersions,
      defaultPanelSettings: Sefaria.util.clone(defaultPanelSettings),
      layoutOrientation: layoutOrientation,
      path: this.props.initialPath,
      panelCap: this.props.initialPanelCap,
      initialAnalyticsTracked: false
    };
  },
  componentDidMount: function componentDidMount() {
    this.updateHistoryState(true); // make sure initial page state is in history, (passing true to replace)
    window.addEventListener("popstate", this.handlePopState);
    window.addEventListener("resize", this.setPanelCap);
    this.setPanelCap();
    if (this.props.headerMode) {
      $(".inAppLink").on("click", this.handleInAppLinkClick);
    }
    // Save all initial panels to recently viewed
    this.state.panels.map(this.saveRecentlyViewed);

    // Set S2 cookie, putting user into S2 mode site wide
    cookie("s2", true, { path: "/" });
  },
  componentWillUnmount: function componentWillUnmount() {
    window.removeEventListener("popstate", this.handlePopState);
    window.removeEventListener("resize", this.setPanelCap);
  },
  componentWillUpdate: function componentWillUpdate(nextProps, nextState) {},
  componentDidUpdate: function componentDidUpdate(prevProps, prevState) {
    if (this.justPopped) {
      //console.log("Skipping history update - just popped")
      this.justPopped = false;
      return;
    }

    // Set initial page view (deferred from analytics.js instanciation)
    if (!this.state.initialAnalyticsTracked) {
      this.trackPageview();
    }

    // If a new panel has been added, and the panels extend beyond the viewable area, check horizontal scroll
    if (this.state.panels.length > this.state.panelCap && this.state.panels.length > prevState.panels.length) {
      var elem = document.getElementById("panelWrapBox");
      var viewExtent = this.state.layoutOrientation == "ltr" ? // How far (px) current view extends into viewable area
      elem.scrollLeft + this.state.windowWidth : elem.scrollWidth - elem.scrollLeft;
      var lastCompletelyVisible = Math.floor(viewExtent / this.MIN_PANEL_WIDTH); // # of last visible panel - base 1
      var leftover = viewExtent % this.MIN_PANEL_WIDTH; // Leftover viewable pixels after last fully visible panel

      var newPanelPosition; // # of newly inserted panel - base 1
      for (var i = 0; i < this.state.panels.length; i++) {
        if (!prevState.panels[i] || this.state.panels[i] != prevState.panels[i]) {
          newPanelPosition = i + 1;
          break;
        }
      }
      if (newPanelPosition > lastCompletelyVisible) {
        var scrollBy = 0; // Pixels to scroll by
        var panelOffset = 0; // Account for partial panel scroll
        if (leftover > 0) {
          // If a panel is half scrolled, bring it fully into view
          scrollBy += this.MIN_PANEL_WIDTH - leftover;
          panelOffset += 1;
        }
        scrollBy += (newPanelPosition - lastCompletelyVisible - panelOffset) * this.MIN_PANEL_WIDTH;
        elem.scrollLeft = this.state.layoutOrientation == "ltr" ? elem.scrollLeft + scrollBy : elem.scrollLeft - scrollBy;
      }
    }

    this.setContainerMode();
    this.updateHistoryState(this.replaceHistory);
  },
  handlePopState: function handlePopState(event) {
    var state = event.state;
    // console.log("Pop - " + window.location.pathname);
    // console.log(state);
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
  _canTrackPageview: function _canTrackPageview() {
    if (!Sefaria.site) {
      return false;
    }
    return true;
  },
  trackPageview: function trackPageview() {
    if (!this._canTrackPageview()) {
      return;
    }

    var headerPanel = this.state.header.menuOpen || !this.state.panels.length && this.state.header.mode === "Header";
    var panels = headerPanel ? [this.state.header] : this.state.panels;
    var textPanels = panels.filter(function (panel) {
      return (panel.refs.length || panel.bookRef) && panel.mode !== "Connections";
    });
    var connectionPanels = panels.filter(function (panel) {
      return panel.mode == "Connections";
    });

    // Set Page Type
    // Todo: More specificity for sheets - browsing, reading, writing
    if (panels.length < 1) {
      debugger;
    } else {
      Sefaria.site.track.setPageType(panels[0].menuOpen || panels[0].mode);
    }

    // Number of panels as e.g. "2" meaning 2 text panels or "3.2" meaning 3 text panels and 2 connection panels
    if (connectionPanels.length == 0) {
      Sefaria.site.track.setNumberOfPanels(textPanels.length.toString());
    } else {
      Sefaria.site.track.setNumberOfPanels(textPanels.length + '.' + connectionPanels.length);
    }

    // refs - per text panel
    var refs = textPanels.map(function (panel) {
      return panel.refs.length ? panel.refs.slice(-1)[0] : panel.bookRef;
    });
    Sefaria.site.track.setRef(refs.join(" | "));

    // Book name (Index record primary name) - per text panel
    var bookNames = refs.map(function (ref) {
      return Sefaria.parseRef(ref).index;
    }).filter(function (b) {
      return !!b;
    });
    Sefaria.site.track.setBookName(bookNames.join(" | "));

    // Indexes - per text panel
    var indexes = bookNames.map(function (b) {
      return Sefaria.index(b);
    }).filter(function (i) {
      return !!i;
    });

    // categories - per text panel
    var primaryCats = indexes.map(function (i) {
      return i.dependence === "Commentary" ? i.categories[0] + " Commentary" : i.categories[0];
    });
    Sefaria.site.track.setPrimaryCategory(primaryCats.join(" | "));

    var secondaryCats = indexes.map(function (i) {
      var cats = i.categories.filter(function (cat) {
        return cat != "Commentary";
      }).slice(1);
      return cats.length >= 1 ? cats[0] : "";
    });
    Sefaria.site.track.setSecondaryCategory(secondaryCats.join(" | "));

    // panel content languages - per text panel
    var contentLanguages = textPanels.map(function (panel) {
      return panel.settings.language;
    });
    Sefaria.site.track.setContentLanguage(contentLanguages.join(" | "));

    // Set Versions - per text panel
    var versionTitles = textPanels.map(function (p) {
      return p.version ? p.version + '(' + p.versionLanguage + ')' : "default version";
    });
    Sefaria.site.track.setVersionTitle(versionTitles.join(" | "));

    // Set Sidebar usages
    // todo: handle toolbar selections
    var sidebars = connectionPanels.map(function (panel) {
      return panel.filter.length ? panel.filter.join("+") : "all";
    });
    Sefaria.site.track.setSidebars(sidebars.join(" | "));

    // After setting the dimensions, post the hit
    var url = window.location.pathname + window.location.search;
    Sefaria.site.track.pageview(url);

    if (!this.state.initialAnalyticsTracked) {
      this.setState({ initialAnalyticsTracked: true });
    }
  },
  shouldHistoryUpdate: function shouldHistoryUpdate() {
    // Compare the current state to the state last pushed to history,
    // Return true if the change warrants pushing to history.
    // If there's no history or the number or basic state of panels has changed
    if (!history.state || !history.state.panels && !history.state.header || !history.state.panels && this.state.panels || history.state.panels && history.state.panels.length !== this.state.panels.length || history.state.header && history.state.header.menuOpen !== this.state.header.menuOpen) {
      return true;
    }

    var prevPanels, nextPanels;
    if (this.props.multiPanel) {
      var headerPanel = this.state.header.menuOpen || !this.state.panels.length && this.state.header.mode === "Header";
      prevPanels = headerPanel ? [history.state.header] : history.state.panels;
      nextPanels = headerPanel ? [this.state.header] : this.state.panels;
    } else {
      prevPanels = history.state.panels;
      nextPanels = this.state.panels;
    }

    for (var i = 0; i < prevPanels.length; i++) {
      // Cycle through each panel, compare previous state to next state, looking for differences
      var prev = prevPanels[i];
      var next = nextPanels[i];

      if (!prev || !next) {
        return true;
      }

      if (prev.mode !== next.mode || prev.menuOpen !== next.menuOpen || prev.menuOpen === "book toc" && prev.bookRef !== next.bookRef || next.mode === "Text" && prev.refs.slice(-1)[0] !== next.refs.slice(-1)[0] || next.mode === "Text" && !prev.highlightedRefs.compare(next.highlightedRefs) || next.mode === "TextAndConnections" && prev.highlightedRefs.slice(-1)[0] !== next.highlightedRefs.slice(-1)[0] || (next.mode === "Connections" || next.mode === "TextAndConnections") && prev.filter && !prev.filter.compare(next.filter) || next.mode === "Connections" && !prev.refs.compare(next.refs) || prev.navigationSheetTag !== next.navigationSheetTag || prev.version !== next.version || prev.versionLanguage !== next.versionLanguage || prev.searchQuery != next.searchQuery || prev.appliedSearchFilters && next.appliedSearchFilters && prev.appliedSearchFilters.length !== next.appliedSearchFilters.length || prev.appliedSearchFilters && next.appliedSearchFilters && !prev.appliedSearchFilters.compare(next.appliedSearchFilters) || prev.settings.language != next.settings.language) {
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
            hist.title = cats ? state.navigationCategories.join(", ") + " | Sefaria" : "Table of Contents | Sefaria";
            hist.title = cats == "recent" ? "Recently Viewed Texts | Sefaria" : hist.title;
            hist.url = "texts" + (cats ? "/" + cats : "");
            hist.mode = "navigation";
            break;
          case "text toc":
            var ref = state.refs.slice(-1)[0];
            var bookTitle = ref ? Sefaria.parseRef(ref).index : "404";
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
            if (states[i].sheetsGroup) {
              hist.url = "groups/" + state.sheetsGroup.replace(/\s/g, "-");
              hist.title = state.sheetsGroup + " | Sefaria Group";
              hist.mode = "sheets tag";
            } else if (states[i].navigationSheetTag) {
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
            hist.title = "Sefaria Account";
            hist.url = "account";
            hist.mode = "account";
            break;
          case "notifications":
            hist.title = "Sefaria Notifcations";
            hist.url = "notifications";
            hist.mode = "notifications";
            break;
          case "myGroups":
            hist.title = "Sefaria Groups";
            hist.url = "my/groups";
            hist.mode = "myGroups";
            break;
          case "updates":
            hist.title = "New on Sefaria";
            hist.url = "updates";
            hist.mode = "updates";
            break;
          case "modtools":
            hist.title = "Moderator Tools";
            hist.url = "modtools";
            hist.mode = "modtools";
            break;
        }
      } else if (state.mode === "Text") {
        hist.title = state.highlightedRefs.length ? Sefaria.normRefList(state.highlightedRefs) : state.refs.slice(-1)[0];
        hist.url = Sefaria.normRef(hist.title);
        hist.version = state.version;
        hist.versionLanguage = state.versionLanguage;
        hist.mode = "Text";
      } else if (state.mode === "Connections") {
        var ref = Sefaria.normRefList(state.refs);
        hist.sources = state.filter.length ? state.filter.join("+") : "all";
        hist.title = ref + " with " + (hist.sources === "all" ? "Connections" : hist.sources);
        hist.url = Sefaria.normRef(ref); // + "?with=" + sources;
        hist.mode = "Connections";
      } else if (state.mode === "TextAndConnections") {
        var ref = Sefaria.normRefList(state.highlightedRefs);
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
        hist.lang = state.settings.language.substring(0, 2);
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
    if (histories[0].lang) {
      url += "&lang=" + histories[0].lang;
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
          if (histories[0].lang) {
            hist.url += "&lang=" + histories[0].lang;
          }
          hist.url += "&with=" + histories[1].sources;
          hist.title = histories[1].title;
        } else {
          var replacer = "&p" + i + "=";
          hist.url = hist.url.replace(RegExp(replacer + ".*"), "");
          hist.url += replacer + histories[i].url;
          if (histories[i - 1].versionLanguage && histories[i - 1].version) {
            hist.url += "&l" + i + "=" + histories[i - 1].versionLanguage + "&v" + i + "=" + histories[i - 1].version.replace(/\s/g, "_");
          }
          if (histories[i - 1].lang) {
            hist.url += "&lang" + i + "=" + histories[i - 1].lang;
          }
          hist.url += "&w" + i + "=" + histories[i].sources; //.replace("with=", "with" + i + "=").replace("?", "&");
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
      if (histories[i].lang) {
        hist.url += "&lang" + (i + 1) + "=" + histories[i].lang;
      }
    }
    // Replace the first only & with a ?
    hist.url = hist.url.replace(/&/, "?");

    return hist;
  },
  // These two methods to check scroll intent have similar implementations on the panel level.  Refactor?
  _refState: function _refState() {
    var _ref;

    // Return a single flat list of all the refs across all panels
    var panels = this.props.multiPanel ? this.state.panels : [this.state.header];
    return (_ref = []).concat.apply(_ref, _toConsumableArray(panels.map(function (p) {
      return p.refs || [];
    })));
  },
  checkScrollIntentAndTrack: function checkScrollIntentAndTrack() {
    // Record current state of panel refs, and check if it has changed after some delay.  If it remains the same, track analytics.
    var intentDelay = 3000; // Number of milliseconds to demonstrate intent
    // console.log("Setting scroll intent check");
    window.setTimeout(function (initialRefs) {
      // console.log("Checking scroll intent");
      if (initialRefs.compare(this._refState())) {
        this.trackPageview();
      }
    }.bind(this), intentDelay, this._refState());
  },
  updateHistoryState: function updateHistoryState(replace) {
    if (!this.shouldHistoryUpdate()) {
      return;
    }
    var hist = this.makeHistoryState();
    if (replace) {
      history.replaceState(hist.state, hist.title, hist.url);
      // console.log("Replace History - " + hist.url);
      if (this.state.initialAnalyticsTracked) {
        this.checkScrollIntentAndTrack();
      }
      //console.log(hist);
    } else {
        if (window.location.pathname + window.location.search == hist.url) {
          return;
        } // Never push history with the same URL
        history.pushState(hist.state, hist.title, hist.url);
        // console.log("Push History - " + hist.url);
        this.trackPageview();
        //console.log(hist);
      }

    $("title").html(hist.title);
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
      recentFilters: state.recentFilters || state.filter || [],
      menuOpen: state.menuOpen || null, // "navigation", "text toc", "display", "search", "sheets", "home", "book toc"
      navigationCategories: state.navigationCategories || [],
      navigationSheetTag: state.sheetsTag || null,
      sheetsGroup: state.group || null,
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
      mySheetSort: state.mySheetSort || "date",
      initialAnalyticsTracked: state.initialAnalyticsTracked || false,
      selectedWords: state.selectedWords || null
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
        biLayout: "stacked",
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
  MIN_PANEL_WIDTH: 360.0,
  setPanelCap: function setPanelCap() {
    // In multi panel mode, set the maximum number of visible panels depending on the window width.
    this.setWindowWidth();
    var panelCap = Math.floor($(window).outerWidth() / this.MIN_PANEL_WIDTH);
    // console.log("Setting panelCap: " + panelCap);
    this.setState({ panelCap: panelCap });
  },
  setWindowWidth: function setWindowWidth() {
    // console.log("Setting window width: " + $(window).outerWidth());
    this.setState({ windowWidth: $(window).outerWidth() });
  },
  handleNavigationClick: function handleNavigationClick(ref, version, versionLanguage, options) {
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
    if (this.state.panels.length > n + 1 && this.state.panels[n + 1].mode === "Connections") {
      this.closePanel(n + 1);
    }
    this.setTextListHighlight(n, [textRef]);
    this.openPanelAt(n, citationRef);
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
    this.replacePanel(n, ref, version, versionLanguage);
  },
  handleInAppLinkClick: function handleInAppLinkClick(e) {
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
    } else if (Sefaria.isRef(path)) {
      this.openPanel(Sefaria.humanRef(path));
    }
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
    // However, when carrying a language change to the Tools Panel, do not carry over an incorrect version
    var langChange = state.settings && state.settings.language !== this.state.panels[n].settings.language;
    var next = this.state.panels[n + 1];
    if (langChange && next && next.mode === "Connections" && state.settings.language !== "bilingual") {
      next.settings.language = state.settings.language;
      if (next.settings.language.substring(0, 2) != this.state.panels[n].versionLanguage) {
        next.versionLanguage = null;
        next.version = null;
      } else {
        next.versionLanguage = this.state.panels[n].versionLanguage;
        next.version = this.state.panels[n].version;
      }
    }
    if (this.didPanelRefChange(this.state.panels[n], state)) {
      this.saveRecentlyViewed(state);
    }
    this.state.panels[n] = extend(this.state.panels[n], state);
    this.setState({ panels: this.state.panels });
  },
  didPanelRefChange: function didPanelRefChange(prevPanel, nextPanel) {
    // Returns true if nextPanel represents a change in current ref (including version change) from prevPanel.
    if (nextPanel.menu || nextPanel.mode == "Connections" || !nextPanel.refs || nextPanel.refs.length == 0 || !prevPanel.refs || prevPanel.refs.length == 0) {
      return false;
    }
    if (nextPanel.refs.compare(prevPanel.refs)) {
      if (nextPanel.version !== prevPanel.version) {
        return true;
      }
    } else {
      return true;
    }
    return false;
  },
  addToSourceSheet: function addToSourceSheet(n, selectedSheet, confirmFunction) {
    // This is invoked from a connections panel.
    // It sends a ref-based (i.e. "inside") source
    var connectionsPanel = this.state.panels[n];
    var textPanel = this.state.panels[n - 1];

    var source = { refs: connectionsPanel.refs };

    // If version exists in main panel, pass it along, use that for the target language.
    var version = textPanel.version;
    var versionLanguage = textPanel.versionLanguage;
    if (version && versionLanguage) {
      source["version"] = version;
      source["versionLanguage"] = versionLanguage;
    }

    // If something is highlighted and main panel language is not bilingual:
    // Use main panel language to determine which version this highlight covers.
    var language = textPanel.settings.language;
    var selectedWords = connectionsPanel.selectedWords;
    if (selectedWords && language != "bilingual") {
      source[language.slice(0, 2)] = selectedWords;
    }

    var url = "/api/sheets/" + selectedSheet + "/add";
    $.post(url, { source: JSON.stringify(source) }, confirmFunction);
  },
  selectVersion: function selectVersion(n, versionName, versionLanguage) {
    // Set the version for panel `n`.
    var panel = this.state.panels[n];
    var oRef = Sefaria.ref(panel.refs[0]);
    if (versionName && versionLanguage) {
      panel.version = versionName;
      panel.versionLanguage = versionLanguage;
      panel.settings.language = panel.versionLanguage == "he" ? "hebrew" : "english";

      this.setCachedVersion(oRef.indexTitle, panel.versionLanguage, panel.version);
      Sefaria.site.track.event("Reader", "Choose Version", oRef.indexTitle + ' / ' + panel.version + ' / ' + panel.versionLanguage);
    } else {
      panel.version = null;
      panel.versionLanguage = null;
      Sefaria.site.track.event("Reader", "Choose Version", oRef.indexTitle + ' / default version / ' + panel.settings.language);
    }

    if (this.state.panels.length > n + 1 && this.state.panels[n + 1].mode == "Connections") {
      var connectionsPanel = this.state.panels[n + 1];
      connectionsPanel.version = panel.version;
      connectionsPanel.versionLanguage = panel.versionLanguage;
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

    this.setHeaderState({ menuOpen: null });
    this.setState({ panels: [panel] });
    this.saveRecentlyViewed(panel);
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

    var newPanels = this.state.panels.slice();
    newPanels.splice(n + 1, 0, panel);
    this.setState({ panels: newPanels });
    this.setHeaderState({ menuOpen: null });
    this.saveRecentlyViewed(panel);
  },
  openPanelAtEnd: function openPanelAtEnd(ref, version, versionLanguage) {
    this.openPanelAt(this.state.panels.length + 1, ref, version, versionLanguage);
  },
  openTextListAt: function openTextListAt(n, refs) {
    // Open a connections panel at position `n` for `refs`
    // Replace panel there if already a connections panel, otherwise splice new panel into position `n`
    // `refs` is an array of ref strings
    var newPanels = this.state.panels.slice();
    var panel = newPanels[n] || {};
    var parentPanel = n >= 1 && newPanels[n - 1].mode == 'Text' ? newPanels[n - 1] : null;

    if (panel.mode !== "Connections") {
      // No connections panel is open yet, splice in a new one
      newPanels.splice(n, 0, {});
      panel = newPanels[n];
      panel.filter = [];
    }
    panel.refs = refs;
    panel.menuOpen = null;
    panel.mode = panel.mode || "Connections";
    panel.settings = panel.settings ? panel.settings : Sefaria.util.clone(this.getDefaultPanelSettings());
    panel.settings.language = panel.settings.language == "hebrew" ? "hebrew" : "english"; // Don't let connections panels be bilingual
    if (parentPanel) {
      panel.filter = parentPanel.filter;
      panel.recentFilters = parentPanel.recentFilters;
      if (panel.settings.language.substring(0, 2) == parentPanel.versionLanguage) {
        panel.version = parentPanel.version;
        panel.versionLanguage = parentPanel.versionLanguage;
      } else {
        panel.version = null;
        panel.versionLanguage = null;
      }
    }

    newPanels[n] = this.makePanelState(panel);
    this.setState({ panels: newPanels });
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
  setConnectionsFilter: function setConnectionsFilter(n, filter, updateRecent) {
    // Set the filter for connections panel at `n`, carry data onto the panel's basetext as well.
    var connectionsPanel = this.state.panels[n];
    var basePanel = this.state.panels[n - 1];
    if (filter) {
      if (updateRecent) {
        if (Sefaria.util.inArray(filter, connectionsPanel.recentFilters) !== -1) {
          connectionsPanel.recentFilters.toggle(filter);
        }
        connectionsPanel.recentFilters = [filter].concat(connectionsPanel.recentFilters);
      }
      connectionsPanel.filter = [filter];
    } else {
      connectionsPanel.filter = [];
    }
    if (basePanel) {
      basePanel.filter = connectionsPanel.filter;
      basePanel.recentFilters = connectionsPanel.recentFilters;
    }
    this.setState({ panels: this.state.panels });
  },
  setSelectedWords: function setSelectedWords(n, words) {
    //console.log(this.state.panels[n].refs);
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
    this.saveRecentlyViewed(this.state.panels[n]);
  },
  openComparePanel: function openComparePanel(n) {
    var comparePanel = this.makePanelState({
      menuOpen: "compare"
    });
    Sefaria.site.track.event("Tools", "Compare Click");
    this.state.panels[n] = comparePanel;
    this.setState({ panels: this.state.panels });
  },
  closePanel: function closePanel(n) {
    // Removes the panel in position `n`, as well as connections panel in position `n+1` if it exists.
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
    }
    this.setState(state);
  },
  showLibrary: function showLibrary(categories) {
    if (this.props.multiPanel) {
      this.setState({ header: this.makePanelState({ mode: "Header", menuOpen: "navigation", navigationCategories: categories }) });
    } else {
      if (this.state.panels.length) {
        this.state.panels[0].menuOpen = "navigation";
      } else {
        this.state.panels[0] = this.makePanelState({ menuOpen: "navigation", navigationCategories: categories });
      }
      this.setState({ panels: this.state.panels });
    }
  },
  showSearch: function showSearch(query) {
    var panel;
    if (this.props.multiPanel) {
      panel = this.makePanelState({ mode: "Header", menuOpen: "search", searchQuery: query, searchFiltersValid: false });
      this.setState({ header: panel, panels: [] });
    } else {
      panel = this.makePanelState({ menuOpen: "search", searchQuery: query, searchFiltersValid: false });
      this.setState({ panels: [panel] });
    }
  },
  showSheets: function showSheets() {
    var updates = { menuOpen: "sheets" };
    this.setStateInHeaderOrSinglePanel(updates);
  },
  showMySheets: function showMySheets() {
    var updates = { menuOpen: "sheets", navigationSheetTag: "My Sheets" };
    this.setStateInHeaderOrSinglePanel(updates);
  },
  showMyGroups: function showMyGroups() {
    var updates = { menuOpen: "myGroups" };
    this.setStateInHeaderOrSinglePanel(updates);
  },
  setStateInHeaderOrSinglePanel: function setStateInHeaderOrSinglePanel(state) {
    // Updates state in the header panel if we're in mutli-panel, else in the first panel if we're in single panel
    // If we're in single panel mode but `this.state.panels` is empty, make a default first panel
    if (this.props.multiPanel) {
      this.setHeaderState(state);
    } else {
      state = this.makePanelState(state);
      this.setState({ panels: [state] });
    }
  },
  saveRecentlyViewed: function saveRecentlyViewed(panel) {
    if (panel.mode == "Connections" || !panel.refs.length) {
      return;
    }
    var ref = panel.refs.slice(-1)[0];
    Sefaria.ref(ref, function (oRef) {
      var recentItem = {
        ref: ref,
        heRef: oRef.heRef,
        book: oRef.indexTitle,
        version: panel.version,
        versionLanguage: panel.versionLanguage
      };
      Sefaria.saveRecentItem(recentItem);
    });
  },
  saveOpenPanelsToRecentlyViewed: function saveOpenPanelsToRecentlyViewed() {
    for (var i = this.state.panels.length - 1; i >= 0; i--) {
      this.saveRecentlyViewed(this.state.panels[i], i);
    }
  },
  rerender: function rerender() {
    this.forceUpdate();
  },
  render: function render() {
    // Only look at the last N panels if we're above panelCap
    //var panelStates = this.state.panels.slice(-this.state.panelCap);
    //if (panelStates.length && panelStates[0].mode === "Connections") {
    //  panelStates = panelStates.slice(1); // Don't leave an orphaned connections panel at the beginning
    //}
    var panelStates = this.state.panels;

    var evenWidth;
    var widths;
    var unit;
    var wrapBoxScroll = false;

    if (panelStates.length <= this.state.panelCap || !this.state.panelCap) {
      evenWidth = 100.0 / panelStates.length;
      unit = "%";
    } else {
      evenWidth = this.MIN_PANEL_WIDTH;
      unit = "px";
      wrapBoxScroll = true;
    }

    if (panelStates.length == 2 && panelStates[0].mode == "Text" && panelStates[1].mode == "Connections") {
      widths = [60.0, 40.0];
      unit = "%";
    } else {
      widths = panelStates.map(function () {
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
      handleInAppLinkClick: this.handleInAppLinkClick,
      headerMode: this.props.headerMode,
      panelsOpen: panelStates.length,
      analyticsInitialized: this.state.initialAnalyticsTracked }) : null;

    var panels = [];
    for (var i = 0; i < panelStates.length; i++) {
      var panel = this.clonePanel(panelStates[i]);
      if (!("settings" in panel)) {
        debugger;
      }
      var offset = widths.reduce(function (prev, curr, index, arr) {
        return index < i ? prev + curr : prev;
      }, 0);
      var width = widths[i];
      var style = this.state.layoutOrientation == "ltr" ? { width: width + unit, left: offset + unit } : { width: width + unit, right: offset + unit };
      var onSegmentClick = this.props.multiPanel ? this.handleSegmentClick.bind(null, i) : null;
      var onCitationClick = this.handleCitationClick.bind(null, i);
      var onSearchResultClick = this.props.multiPanel ? this.handleCompareSearchClick.bind(null, i) : this.handleNavigationClick;
      var onTextListClick = null; // this.openPanelAt.bind(null, i);
      var onOpenConnectionsClick = this.openTextListAt.bind(null, i + 1);
      var setTextListHighlight = this.setTextListHighlight.bind(null, i);
      var setSelectedWords = this.setSelectedWords.bind(null, i);
      var openComparePanel = this.openComparePanel.bind(null, i);
      var closePanel = this.closePanel.bind(null, i);
      var setPanelState = this.setPanelState.bind(null, i);
      var setConnectionsFilter = this.setConnectionsFilter.bind(null, i);
      var selectVersion = this.selectVersion.bind(null, i);
      var addToSourceSheet = this.addToSourceSheet.bind(null, i);

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
          addToSourceSheet: addToSourceSheet,
          onOpenConnectionsClick: onOpenConnectionsClick,
          openComparePanel: openComparePanel,
          setTextListHighlight: setTextListHighlight,
          setConnectionsFilter: setConnectionsFilter,
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
          layoutWidth: width,
          analyticsInitialized: this.state.initialAnalyticsTracked
        })
      ));
    }
    var boxClasses = classNames({ wrapBoxScroll: wrapBoxScroll });
    var boxWidth = wrapBoxScroll ? this.state.windowWidth + "px" : "100%";
    var boxStyle = { width: boxWidth };
    panels = panels.length ? React.createElement(
      'div',
      { id: 'panelWrapBox', className: boxClasses, style: boxStyle },
      panels
    ) : null;

    var interruptingMessage = Sefaria.interruptingMessage ? React.createElement(InterruptingMessage, {
      messageName: Sefaria.interruptingMessage.name,
      messageHTML: Sefaria.interruptingMessage.html,
      onClose: this.rerender }) : null;
    var classDict = { readerApp: 1, multiPanel: this.props.multiPanel, singlePanel: !this.props.multiPanel };
    var interfaceLangClass = 'interface-' + this.props.interfaceLang;
    classDict[interfaceLangClass] = true;
    var classes = classNames(classDict);
    return React.createElement(
      'div',
      { className: classes },
      header,
      panels,
      interruptingMessage
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
    handleInAppLinkClick: React.PropTypes.func,
    headerMesssage: React.PropTypes.string,
    panelsOpen: React.PropTypes.number,
    analyticsInitialized: React.PropTypes.bool
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
      minLength: 3,
      select: function (event, ui) {
        $(ReactDOM.findDOMNode(this)).find("input.search").val(ui.item.value); // This will disappear when the next line executes, but the eye can sometimes catch it.
        this.submitSearch(ui.item.value);
        return false;
      }.bind(this),

      source: function (request, response) {
        var _this = this;

        Sefaria.lookup(request.term, function (d) {
          if (d["completions"].length > 0) {
            response(d["completions"].concat(['' + _this._searchOverridePre + request.term + _this._searchOverridePost]));
          } else {
            response([]);
          }
        }, function (e) {
          return response([]);
        });
      }.bind(this)
    });
  },
  showVirtualKeyboardIcon: function showVirtualKeyboardIcon(show) {
    if (document.getElementById('keyboardInputMaster')) {
      //if keyboard is open, ignore.
      return; //this prevents the icon from flashing on every key stroke.
    }
    if (this.props.interfaceLang == 'english') {
      var opacity = show ? 0.4 : 0;
      $(ReactDOM.findDOMNode(this)).find(".keyboardInputInitiator").css({ "opacity": opacity });
    }
  },
  showDesktop: function showDesktop() {
    if (this.props.panelsOpen == 0) {
      var recentlyViewed = Sefaria.recentlyViewed;
      if (recentlyViewed && recentlyViewed.length) {
        this.handleRefClick(recentlyViewed[0].ref, recentlyViewed[0].version, recentlyViewed[0].versionLanguage);
      }
    }
    this.props.setCentralState({ menuOpen: null });
    this.clearSearchBox();
  },
  showLibrary: function showLibrary(categories) {
    this.props.showLibrary(categories);
    this.clearSearchBox();
  },
  showSearch: function showSearch(query) {
    query = query.trim();
    if (typeof sjs !== "undefined") {
      query = encodeURIComponent(query);
      window.location = '/search?q=' + query;
      return;
    }
    this.props.showSearch(query);
    $(ReactDOM.findDOMNode(this)).find("input.search").sefaria_autocomplete("close");
  },
  showAccount: function showAccount(e) {
    e.preventDefault();
    if (typeof sjs !== "undefined") {
      window.location = "/account";
      return;
    }
    this.props.setCentralState({ menuOpen: "account" });
    this.clearSearchBox();
  },
  showNotifications: function showNotifications(e) {
    e.preventDefault();
    if (typeof sjs !== "undefined") {
      window.location = "/notifications";
      return;
    }
    this.props.setCentralState({ menuOpen: "notifications" });
    this.clearSearchBox();
  },
  showUpdates: function showUpdates() {
    // todo: not used yet
    if (typeof sjs !== "undefined") {
      window.location = "/updates";
      return;
    }
    this.props.setCentralState({ menuOpen: "updates" });
    this.clearSearchBox();
  },
  showTestMessage: function showTestMessage() {
    this.props.setCentralState({ showTestMessage: true });
  },
  hideTestMessage: function hideTestMessage() {
    this.props.setCentralState({ showTestMessage: false });
  },
  submitSearch: function submitSearch(query) {
    var override = query.match(this._searchOverrideRegex());
    if (override) {
      if (Sefaria.site) {
        Sefaria.site.track.event("Search", "Search Box Navigation - Book Override", override[1]);
      }
      this.closeSearchAutocomplete();
      this.showSearch(override[1]);
      return;
    }

    Sefaria.lookup(query, function (d) {
      // If the query isn't recognized as a ref, but only for reasons of capitalization. Resubmit with recognizable caps.
      if (Sefaria.isACaseVariant(query, d)) {
        this.submitSearch(Sefaria.repairCaseVariant(query, d));
        return;
      }

      if (d["is_ref"]) {
        var action = d["is_book"] ? "Search Box Navigation - Book" : "Search Box Navigation - Citation";
        Sefaria.site.track.event("Search", action, query);
        this.clearSearchBox();
        this.handleRefClick(d["ref"]); //todo: pass an onError function through here to the panel onError function which redirects to search
      } else if (d["type"] == "Person") {
          Sefaria.site.track.event("Search", "Search Box Navigation - Person", query);
          this.closeSearchAutocomplete();
          this.showPerson(d["key"]);
        } else if (d["type"] == "TocCategory") {
          Sefaria.site.track.event("Search", "Search Box Navigation - Category", query);
          this.closeSearchAutocomplete();
          this.showLibrary(d["key"]); // "key" holds the category path
        } else {
            Sefaria.site.track.event("Search", "Search Box Search", query);
            this.closeSearchAutocomplete();
            this.showSearch(query);
          }
    }.bind(this));
  },
  closeSearchAutocomplete: function closeSearchAutocomplete() {
    $(ReactDOM.findDOMNode(this)).find("input.search").sefaria_autocomplete("close");
  },
  clearSearchBox: function clearSearchBox() {
    $(ReactDOM.findDOMNode(this)).find("input.search").val("").sefaria_autocomplete("close");
  },
  showPerson: function showPerson(key) {
    //todo: move people into React
    window.location = "/person/" + key;
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
    $(".wrapper").remove();
    $("#footer").remove();
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
      setDefaultOption: this.props.setDefaultOption,
      onQueryChange: this.props.onQueryChange,
      updateSearchFilter: this.props.updateSearchFilter,
      registerAvailableFilters: this.props.registerAvailableFilters,
      setUnreadNotificationsCount: this.props.setUnreadNotificationsCount,
      handleInAppLinkClick: this.props.handleInAppLinkClick,
      hideNavHeader: true,
      analyticsInitialized: this.props.analyticsInitialized }) : null;

    var notificationCount = Sefaria.notificationCount || 0;
    var notifcationsClasses = classNames({ notifications: 1, unread: notificationCount > 0 });
    var nextParam = "?next=" + encodeURIComponent(Sefaria.util.currentPath());
    var headerMessage = this.props.headerMessage ? React.createElement(
      'div',
      { className: 'testWarning', onClick: this.showTestMessage },
      this.props.headerMessage
    ) : null;
    var loggedInLinks = React.createElement(
      'div',
      { className: 'accountLinks' },
      React.createElement(
        'a',
        { href: '/account', className: 'account', onClick: this.showAccount },
        React.createElement('img', { src: '/static/img/user-64.png', alt: 'My Account' })
      ),
      React.createElement(
        'a',
        { href: '/notifications', 'aria-label': 'See New Notifications', className: notifcationsClasses, onClick: this.showNotifications },
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
          { className: 'int-en' },
          'Sign up'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'הרשם'
        )
      ),
      React.createElement(
        'a',
        { className: 'login', href: "/login" + nextParam },
        React.createElement(
          'span',
          { className: 'int-en' },
          'Log in'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'התחבר'
        )
      )
    );
    var langSearchPlaceholder = this.props.interfaceLang == 'english' ? "Search" : "חיפוש";
    var vkClassActivator = this.props.interfaceLang == 'english' ? " keyboardInput" : "";
    return React.createElement(
      'div',
      { className: 'header' },
      React.createElement(
        'div',
        { className: 'headerInner' },
        React.createElement(
          'div',
          { className: 'headerNavSection' },
          React.createElement(
            'a',
            { href: '/texts', 'aria-label': 'Toggle Text Table of Contents', className: 'library', onClick: this.handleLibraryClick },
            React.createElement('i', { className: 'fa fa-bars' })
          ),
          React.createElement(
            'div',
            { className: 'searchBox' },
            React.createElement(ReaderNavigationMenuSearchButton, { onClick: this.handleSearchButtonClick }),
            React.createElement('input', { className: "search" + vkClassActivator,
              placeholder: langSearchPlaceholder,
              onKeyUp: this.handleSearchKeyUp,
              onFocus: this.showVirtualKeyboardIcon.bind(this, true),
              onBlur: this.showVirtualKeyboardIcon.bind(this, false),
              title: 'Search for Texts or Keywords Here' })
          )
        ),
        React.createElement(
          'div',
          { className: 'headerHomeSection' },
          React.createElement(
            'a',
            { className: 'home', href: '/?home' },
            React.createElement('img', { src: '/static/img/sefaria.svg', alt: 'Sefaria Logo' })
          )
        ),
        React.createElement(
          'div',
          { className: 'headerLinksSection' },
          headerMessage,
          Sefaria.loggedIn ? loggedInLinks : loggedOutLinks
        )
      ),
      viewContent ? React.createElement(
        'div',
        { className: 'headerNavContent' },
        viewContent
      ) : null,
      this.state.showTestMessage ? React.createElement(TestMessage, { hide: this.hideTestMessage }) : null,
      React.createElement(GlobalWarningMessage, null)
    );
  }
});

var GlobalWarningMessage = React.createClass({
  displayName: 'GlobalWarningMessage',

  close: function close() {
    Sefaria.globalWarningMessage = null;
    this.forceUpdate();
  },
  render: function render() {
    return Sefaria.globalWarningMessage ? React.createElement(
      'div',
      { id: 'globalWarningMessage' },
      React.createElement('i', { className: 'close fa fa-times', onClick: this.close }),
      React.createElement('div', { dangerouslySetInnerHTML: { __html: Sefaria.globalWarningMessage } })
    ) : null;
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
    initialState: React.PropTypes.object, // if present, overrides all props above
    interfaceLang: React.PropTypes.string,
    setCentralState: React.PropTypes.func,
    onSegmentClick: React.PropTypes.func,
    onCitationClick: React.PropTypes.func,
    onTextListClick: React.PropTypes.func,
    onNavTextClick: React.PropTypes.func,
    onRecentClick: React.PropTypes.func,
    onSearchResultClick: React.PropTypes.func,
    onUpdate: React.PropTypes.func,
    onError: React.PropTypes.func,
    closePanel: React.PropTypes.func,
    closeMenus: React.PropTypes.func,
    setConnectionsFilter: React.PropTypes.func,
    setDefaultOption: React.PropTypes.func,
    selectVersion: React.PropTypes.func,
    onQueryChange: React.PropTypes.func,
    updateSearchFilter: React.PropTypes.func,
    registerAvailableFilters: React.PropTypes.func,
    openComparePanel: React.PropTypes.func,
    setUnreadNotificationsCount: React.PropTypes.func,
    addToSourceSheet: React.PropTypes.func,
    highlightedRefs: React.PropTypes.array,
    hideNavHeader: React.PropTypes.bool,
    multiPanel: React.PropTypes.bool,
    masterPanelLanguage: React.PropTypes.string,
    panelsOpen: React.PropTypes.number,
    layoutWidth: React.PropTypes.number,
    setTextListHighlight: React.PropTypes.func,
    setSelectedWords: React.PropTypes.func,
    analyticsInitialized: React.PropTypes.bool
  },
  getInitialState: function getInitialState() {
    // When this component is managed by a parent, all it takes is initialState
    if (this.props.initialState) {
      var state = this.clonePanel(this.props.initialState);
      state["initialAnalyticsTracked"] = false;
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
      settings: this.props.initialState.settings || {
        language: "bilingual",
        layoutDefault: "segmented",
        layoutTalmud: "continuous",
        layoutTanakh: "segmented",
        biLayout: "stacked",
        color: "light",
        fontSize: 62.5
      },
      menuOpen: this.props.initialMenu || null, // "navigation", "book toc", "text toc", "display", "search", "sheets", "home", "compare"
      navigationCategories: this.props.initialNavigationCategories || [],
      navigationSheetTag: this.props.initialSheetsTag || null,
      sheetsGroup: this.props.initialGroup || null,
      searchQuery: this.props.initialQuery || null,
      appliedSearchFilters: this.props.initialAppliedSearchFilters || [],
      selectedWords: null,
      searchFiltersValid: false,
      availableFilters: [],
      filterRegistry: {},
      orphanSearchFilters: [],
      displaySettingsOpen: false,
      tagSort: "count",
      mySheetSort: "date",
      initialAnalyticsTracked: false
    };
  },
  componentDidMount: function componentDidMount() {
    window.addEventListener("resize", this.setWidth);
    this.setWidth();
    this.setHeadroom();
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
  onError: function onError(message) {
    if (this.props.onError) {
      this.props.onError(message);
      return;
    }
    this.setState({ "error": message });
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
    var version = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];
    var versionLanguage = arguments.length <= 3 || arguments[3] === undefined ? null : arguments[3];

    // Set the current primary text
    // `replaceHistory` - bool whether to replace browser history rather than push for this change
    if (!ref) {
      return;
    }
    this.replaceHistory = Boolean(replaceHistory);
    if (this.state.mode == "Connections" && this.props.masterPanelLanguage == "bilingual") {
      // Connections panels are forced to be mono-lingual. When opening a text from a connections panel,
      // allow it to return to bilingual.
      this.state.settings.language = "bilingual";
    }
    this.conditionalSetState({
      mode: "Text",
      refs: [ref],
      filter: [],
      recentFilters: [],
      menuOpen: null,
      version: version,
      versionLanguage: versionLanguage,
      settings: this.state.settings
    });
  },
  updateTextColumn: function updateTextColumn(refs) {
    // Change the refs in the current TextColumn, for infinite scroll up/down.
    this.replaceHistory = true;
    this.conditionalSetState({ refs: refs }, this.replaceState);
  },
  setTextListHighlight: function setTextListHighlight(refs) {
    refs = typeof refs === "string" ? [refs] : refs;
    this.replaceHistory = true;
    this.conditionalSetState({ highlightedRefs: refs });
    if (this.props.multiPanel) {
      this.props.setTextListHighlight(refs);
    }
  },
  setSelectedWords: function setSelectedWords(words) {
    words = typeof words !== "undefined" && words.length ? words : "";
    words = words.trim();
    this.replaceHistory = false;
    if (this.props.multiPanel) {
      this.props.setSelectedWords(words);
    } else {
      this.conditionalSetState({ 'selectedWords': words });
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
  closePanelSearch: function closePanelSearch() {
    // Assumption: Search in a panel is always within a "compare" panel
    var state = {
      // If there's no content to show, return to home
      menuOpen: this.state.refs.slice(-1)[0] ? null : "compare",
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
      initialAnalyticsTracked: false,
      // searchQuery: null,
      // appliedSearchFilters: [],
      navigationCategories: null,
      navigationSheetTag: null
    });
  },
  setNavigationCategories: function setNavigationCategories(categories) {
    this.conditionalSetState({ navigationCategories: categories });
  },
  setSheetTag: function setSheetTag(tag) {
    this.conditionalSetState({ navigationSheetTag: tag });
  },
  setFilter: function setFilter(filter, updateRecent) {
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
      this.conditionalSetState({ recentFilters: this.state.recentFilters, filter: filter });
    }
  },
  toggleLanguage: function toggleLanguage() {
    if (this.state.settings.language == "hebrew") {
      this.setOption("language", "english");
      if (Sefaria.site) {
        Sefaria.site.track.event("Reader", "Change Language", "english");
      }
    } else {
      this.setOption("language", "hebrew");
      if (Sefaria.site) {
        Sefaria.site.track.event("Reader", "Change Language", "hebrew");
      }
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
      this.replaceHistory = true;
      this.props.setDefaultOption && this.props.setDefaultOption(option, value);
    }
    this.conditionalSetState(state);
  },
  setConnectionsMode: function setConnectionsMode(mode) {
    var loginRequired = {
      "Add to Source Sheet": 1,
      "Add Note": 1,
      "My Notes": 1,
      "Add Connection": 1,
      "Add Translation": 1
    };
    Sefaria.site.track.event("Tools", mode + " Click");
    if (!Sefaria._uid && mode in loginRequired) {
      Sefaria.site.track.event("Tools", "Prompt Login");
      mode = "Login";
    }
    var state = { connectionsMode: mode };
    if (mode === "Connections") {
      this.setFilter();
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
    this.setState({ width: $(ReactDOM.findDOMNode(this)).width() });
    //console.log("Setting panel width", this.width);
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
    return Sefaria.index(book) ? Sefaria.index(book)['primary_category'] : null;
  },
  currentLayout: function currentLayout() {
    if (this.state.settings.language == "bilingual") {
      return this.state.width > 500 ? this.state.settings.biLayout : "stacked";
    }
    var category = this.currentCategory();
    if (!category) {
      return "layoutDefault";
    }
    var option = category === "Tanakh" || category === "Talmud" ? "layout" + category : "layoutDefault";
    return this.state.settings[option];
  },
  render: function render() {
    if (this.state.error) {
      return React.createElement(
        'div',
        { className: 'readerContent' },
        React.createElement(
          'div',
          { className: 'readerError' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Something went wrong! Please use the back button or the menus above to get back on track.'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'ארעה תקלה במערכת. אנא חזרו לתפריט הראשי או אחורנית על ידי שימוש בכפתורי התפריט או החזור.'
          ),
          React.createElement(
            'div',
            { className: 'readerErrorText' },
            React.createElement(
              'span',
              { className: 'int-en' },
              'Error Message: '
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'שגיאה:'
            ),
            this.state.error
          )
        )
      );
    }
    var items = [];
    if (this.state.mode === "Text" || this.state.mode === "TextAndConnections") {
      items.push(React.createElement(TextColumn, {
        srefs: this.state.refs.slice(),
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
        interfaceLang: this.props.interfaceLang,
        setOption: this.setOption,
        showBaseText: this.showBaseText,
        updateTextColumn: this.updateTextColumn,
        onSegmentClick: this.handleBaseSegmentClick,
        onCitationClick: this.handleCitationClick,
        setTextListHighlight: this.setTextListHighlight,
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
        srefs: this.state.mode === "Connections" ? this.state.refs.slice() : this.state.highlightedRefs.slice(),
        filter: this.state.filter || [],
        mode: this.state.connectionsMode || "Connections",
        recentFilters: this.state.recentFilters,
        interfaceLang: this.props.interfaceLang,
        version: this.state.version,
        versionLanguage: this.state.versionLanguage,
        fullPanel: this.props.multiPanel,
        multiPanel: this.props.multiPanel,
        addToSourceSheet: this.props.addToSourceSheet,
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
      var openNav = this.state.menuOpen === "compare" ? this.openMenu.bind(null, "compare") : this.openMenu.bind(null, "navigation");
      var onRecentClick = this.state.menuOpen === "compare" || !this.props.onRecentClick ? openInPanel : this.props.onRecentClick;

      var menu = React.createElement(ReaderNavigationMenu, {
        key: this.state.navigationCategories ? this.state.navigationCategories.join("-") : "navHome",
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
        openNav: openNav,
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
        narrowPanel: !this.props.multiPanel,
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
        category: Sefaria.index(this.state.bookRef) ? Sefaria.index(this.state.bookRef).primary_category : null,
        currentRef: this.state.bookRef,
        narrowPanel: !this.props.multiPanel,
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
        close: this.closePanelSearch,
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
        group: this.state.sheetsGroup,
        tagSort: this.state.tagSort,
        mySheetSort: this.state.mySheetSort,
        setMySheetSort: this.setMySheetSort,
        setSheetTagSort: this.setSheetTagSort,
        setSheetTag: this.setSheetTag,
        key: "SheetsNav" });
    } else if (this.state.menuOpen === "account") {
      var menu = React.createElement(AccountPanel, {
        handleInAppLinkClick: this.props.handleInAppLinkClick,
        interfaceLang: this.props.interfaceLang });
    } else if (this.state.menuOpen === "notifications") {
      var menu = React.createElement(NotificationsPanel, {
        setUnreadNotificationsCount: this.props.setUnreadNotificationsCount,
        interfaceLang: this.props.interfaceLang });
    } else if (this.state.menuOpen === "myGroups") {
      var menu = React.createElement(MyGroupsPanel, {
        interfaceLang: this.props.interfaceLang });
    } else if (this.state.menuOpen === "updates") {
      var menu = React.createElement(UpdatesPanel, {
        interfaceLang: this.props.interfaceLang });
    } else if (this.state.menuOpen === "modtools") {
      var menu = React.createElement(ModeratorToolsPanel, {
        interfaceLang: this.props.interfaceLang });
    } else {
      var menu = null;
    }

    var classes = { readerPanel: 1, narrowColumn: this.state.width < 730 };
    classes[this.currentLayout()] = 1;
    classes[this.state.settings.color] = 1;
    classes[this.state.settings.language] = 1;
    classes = classNames(classes);
    var style = { "fontSize": this.state.settings.fontSize + "%" };
    var hideReaderControls = this.state.mode === "TextAndConnections" || this.state.menuOpen === "text toc" || this.state.menuOpen === "book toc" || this.state.menuOpen === "compare" || this.props.hideNavHeader;

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
        onError: this.onError,
        connectionsMode: this.state.filter.length && this.state.connectionsMode === "Connections" ? "Connection Text" : this.state.connectionsMode,
        closePanel: this.props.closePanel,
        toggleLanguage: this.toggleLanguage,
        interfaceLang: this.props.interfaceLang }),
      items.length > 0 && !menu ? React.createElement(
        'div',
        { className: 'readerContent', style: style },
        items
      ) : "",
      menu,
      this.state.displaySettingsOpen ? React.createElement(ReaderDisplayOptionsMenu, {
        settings: this.state.settings,
        multiPanel: this.props.multiPanel,
        setOption: this.setOption,
        currentLayout: this.currentLayout,
        width: this.state.width,
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
    onError: React.PropTypes.func.isRequired,
    closePanel: React.PropTypes.func,
    toggleLanguage: React.PropTypes.func,
    currentRef: React.PropTypes.string,
    version: React.PropTypes.string,
    versionLanguage: React.PropTypes.string,
    connectionsMode: React.PropTypes.string,
    multiPanel: React.PropTypes.bool,
    interfaceLang: React.PropTypes.string
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
      var categoryAttribution = oref && Sefaria.categoryAttribution(oref.categories) ? React.createElement(CategoryAttribution, { categories: oref.categories }) : null;
    } else {
      var heTitle = "";
      var categoryAttribution = null;
    }

    var mode = this.props.currentMode();
    var hideHeader = !this.props.multiPanel && mode === "Connections";
    var connectionsHeader = this.props.multiPanel && mode === "Connections";

    if (title && !oref) {
      // If we don't have this data yet, rerender when we do so we can set the Hebrew title
      Sefaria.text(title, { context: 1 }, function (data) {
        if ("error" in data) {
          this.props.onError(data.error);
          return;
        }
        if (this.isMounted()) {
          this.setState({});
        }
      }.bind(this));
    }

    var showVersion = this.props.versionLanguage == "en" && (this.props.settings.language == "english" || this.props.settings.language == "bilingual");
    var versionTitle = this.props.version ? this.props.version.replace(/_/g, " ") : "";
    var url = Sefaria.ref(title) ? "/" + Sefaria.normRef(Sefaria.ref(title).book) : Sefaria.normRef(title);
    var centerContent = connectionsHeader ? React.createElement(
      'div',
      { className: 'readerTextToc' },
      React.createElement(ConnectionsPanelHeader, {
        activeTab: this.props.connectionsMode,
        setConnectionsMode: this.props.setConnectionsMode,
        closePanel: this.props.closePanel,
        toggleLanguage: this.props.toggleLanguage,
        interfaceLang: this.props.interfaceLang })
    ) : React.createElement(
      'div',
      { className: "readerTextToc" + (categoryAttribution ? ' attributed' : ''), onClick: this.openTextToc },
      React.createElement(
        'div',
        { className: 'readerTextTocBox' },
        React.createElement(
          'a',
          { href: url },
          title ? React.createElement('i', { className: 'fa fa-caret-down invisible' }) : null,
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
          showVersion ? React.createElement(
            'span',
            { className: 'readerTextVersion' },
            React.createElement(
              'span',
              { className: 'en' },
              versionTitle
            )
          ) : null
        ),
        React.createElement(
          'div',
          { onClick: function onClick(e) {
              e.stopPropagation();
            } },
          categoryAttribution
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
    width: React.PropTypes.number.isRequired,
    settings: React.PropTypes.object.isRequired
  },
  render: function render() {
    var languageOptions = [{ name: "english", content: "<span class='en'>A</span>", role: "radio", ariaLabel: "Show English Text" }, { name: "bilingual", content: "<span class='en'>A</span><span class='he'>א</span>", role: "radio", ariaLabel: "Show English & Hebrew Text" }, { name: "hebrew", content: "<span class='he'>א</span>", role: "radio", ariaLabel: "Show Hebrew Text" }];
    var languageToggle = React.createElement(ToggleSet, {
      role: 'radiogroup',
      ariaLabel: 'Language toggle',
      name: 'language',
      options: languageOptions,
      setOption: this.props.setOption,
      settings: this.props.settings });

    var layoutOptions = [{ name: "continuous", fa: "align-justify", role: "radio", ariaLabel: "Show Text as a paragram" }, { name: "segmented", fa: "align-left", role: "radio", ariaLabel: "Show Text segmented" }];
    var biLayoutOptions = [{ name: "stacked", content: "<img src='/static/img/stacked.png' alt='Stacked Language Toggle'/>", role: "radio", ariaLabel: "Show Hebrew & English Stacked" }, { name: "heLeft", content: "<img src='/static/img/backs.png' alt='Hebrew Left Toggle' />", role: "radio", ariaLabel: "Show Hebrew Text Left of English Text" }, { name: "heRight", content: "<img src='/static/img/faces.png' alt='Hebrew Right Toggle' />", role: "radio", ariaLabel: "Show Hebrew Text Right of English Text" }];
    var layoutToggle = this.props.settings.language !== "bilingual" ? React.createElement(ToggleSet, {
      role: 'radiogroup',
      ariaLabel: 'text layout toggle',
      name: 'layout',
      options: layoutOptions,
      setOption: this.props.setOption,
      currentLayout: this.props.currentLayout,
      settings: this.props.settings }) : this.props.width > 500 ? React.createElement(ToggleSet, {
      role: 'radiogroup',
      ariaLabel: 'bidirectional text layout toggle',
      name: 'biLayout',
      options: biLayoutOptions,
      setOption: this.props.setOption,
      currentLayout: this.props.currentLayout,
      settings: this.props.settings }) : null;

    var colorOptions = [{ name: "light", content: "", role: "radio", ariaLabel: "Toggle light mode" }, { name: "sepia", content: "", role: "radio", ariaLabel: "Toggle sepia mode" }, { name: "dark", content: "", role: "radio", ariaLabel: "Toggle dark mode" }];
    var colorToggle = React.createElement(ToggleSet, {
      role: 'radiogroup',
      ariaLabel: 'Color toggle',
      name: 'color',
      separated: true,
      options: colorOptions,
      setOption: this.props.setOption,
      settings: this.props.settings });
    colorToggle = this.props.multiPanel ? null : colorToggle;

    var sizeOptions = [{ name: "smaller", content: "Aa", role: "button", ariaLabel: "Decrease font size" }, { name: "larger", content: "Aa", role: "button", ariaLabel: "Increase font size" }];
    var sizeToggle = React.createElement(ToggleSet, {
      role: 'group',
      ariaLabel: 'Increase/Decrease Font Size Buttons',
      name: 'fontSize',
      options: sizeOptions,
      setOption: this.props.setOption,
      settings: this.props.settings });

    if (this.props.menuOpen === "search") {
      return React.createElement(
        'div',
        { className: 'readerOptionsPanel', role: 'dialog', tabindex: '0' },
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
        { className: 'readerOptionsPanel', role: 'dialog', tabindex: '0' },
        React.createElement(
          'div',
          { className: 'readerOptionsPanelInner' },
          languageToggle
        )
      );
    } else {
      return React.createElement(
        'div',
        { className: 'readerOptionsPanel', role: 'dialog', tabindex: '0' },
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
    openMenu: React.PropTypes.func.isRequired,
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
    // console.log("Setting RNM width: " + width);
    var winWidth = $(window).width();
    var winHeight = $(window).height();
    // console.log("Window width: " + winWidth + ", Window height: " + winHeight);
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
  showMore: function showMore(event) {
    event.preventDefault();
    this.setState({ showMore: true });
  },
  handleClick: function handleClick(event) {
    if (!$(event.target).hasClass("outOfAppLink") && !$(event.target.parentElement).hasClass("outOfAppLink")) {
      event.preventDefault();
    }
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
    if (this.props.categories.length && this.props.categories[0] == "recent") {
      return React.createElement(
        'div',
        { onClick: this.handleClick },
        React.createElement(RecentPanel, {
          multiPanel: this.props.multiPanel,
          closeNav: this.closeNav,
          toggleLanguage: this.props.toggleLanguage,
          openDisplaySettings: this.props.openDisplaySettings,
          navHome: this.navHome,
          compare: this.props.compare,
          hideNavHeader: this.props.hideNavHeader,
          width: this.width,
          interfaceLang: this.props.interfaceLang })
      );
    } else if (this.props.categories.length) {
      // List of Texts in a Category
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
          width: this.width,
          interfaceLang: this.props.interfaceLang })
      );
    } else {
      // Root Library Menu
      var categories = ["Tanakh", "Mishnah", "Talmud", "Midrash", "Halakhah", "Kabbalah", "Liturgy", "Philosophy", "Tanaitic", "Chasidut", "Musar", "Responsa", "Apocrypha", "Modern Works", "Other"];
      categories = categories.map(function (cat) {
        var style = { "borderColor": Sefaria.palette.categoryColor(cat) };
        var openCat = function (e) {
          e.preventDefault();this.props.setCategories([cat]);
        }.bind(this);
        var heCat = Sefaria.hebrewTerm(cat);
        return React.createElement(
          'a',
          { href: '/texts/' + cat, className: 'readerNavCategory', 'data-cat': cat, style: style, onClick: openCat },
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
        );
      }.bind(this));
      var more = React.createElement(
        'a',
        { href: '#', className: 'readerNavCategory readerNavMore', style: { "borderColor": Sefaria.palette.colors.darkblue }, onClick: this.showMore },
        React.createElement(
          'span',
          { className: 'en' },
          'More ',
          React.createElement('img', { src: '/static/img/arrow-right.png', alt: '' })
        ),
        React.createElement(
          'span',
          { className: 'he' },
          'עוד ',
          React.createElement('img', { src: '/static/img/arrow-left.png', alt: '' })
        )
      );
      var nCats = this.width < 450 ? 9 : 8;
      categories = this.state.showMore ? categories : categories.slice(0, nCats).concat(more);
      categories = React.createElement(
        'div',
        { className: 'readerNavCategories' },
        React.createElement(TwoOrThreeBox, { content: categories, width: this.width })
      );

      var siteLinks = Sefaria._uid ? [React.createElement(
        'a',
        { className: 'siteLink outOfAppLink', key: 'profile', href: '/my/profile' },
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
        { className: 'siteLink outOfAppLink', key: 'about', href: '/about' },
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
        { className: 'siteLink outOfAppLink', key: 'logout', href: '/logout' },
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
        { className: 'siteLink outOfAppLink', key: 'about', href: '/about' },
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
        { className: 'siteLink outOfAppLink', key: 'login', href: '/login' },
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

      var calendar = Sefaria.calendar ? [React.createElement(TextBlockLink, { sref: Sefaria.calendar.parasha, title: Sefaria.calendar.parashaName, heTitle: Sefaria.calendar.heParashaName, category: 'Tanakh' }), React.createElement(TextBlockLink, { sref: Sefaria.calendar.haftara, title: 'Haftara', heTitle: 'הפטרה', category: 'Tanakh' }), React.createElement(TextBlockLink, { sref: Sefaria.calendar.daf_yomi, title: 'Daf Yomi', heTitle: 'דף יומי', category: 'Talmud' })] : [];
      calendar = React.createElement(
        'div',
        { className: 'readerNavCalendar' },
        React.createElement(TwoOrThreeBox, { content: calendar, width: this.width })
      );

      var sheetsStyle = { "borderColor": Sefaria.palette.categoryColor("Sheets") };
      var resources = [React.createElement(
        'a',
        { className: 'resourcesLink', style: sheetsStyle, href: '/sheets', onClick: this.props.openMenu.bind(null, "sheets") },
        React.createElement('img', { src: '/static/img/sheet-icon.png', alt: '' }),
        React.createElement(
          'span',
          { className: 'int-en' },
          'Source Sheets'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'דפי מקורות'
        )
      ), React.createElement(
        'a',
        { className: 'resourcesLink outOfAppLink', style: sheetsStyle, href: '/visualizations' },
        React.createElement('img', { src: '/static/img/visualizations-icon.png', alt: '' }),
        React.createElement(
          'span',
          { className: 'int-en' },
          'Visualizations'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'חזותיים'
        )
      ), React.createElement(
        'a',
        { className: 'resourcesLink outOfAppLink', style: sheetsStyle, href: '/people' },
        React.createElement('img', { src: '/static/img/authors-icon.png', alt: '' }),
        React.createElement(
          'span',
          { className: 'int-en' },
          'Authors'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
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
          React.createElement('img', { src: '/static/img/sefaria.svg', alt: 'Sefaria Logo' })
        )
      ) : React.createElement(
        'div',
        { className: 'readerNavTop search' },
        React.createElement(CategoryColorLine, { category: 'Other' }),
        React.createElement(ReaderNavigationMenuCloseButton, { onClick: this.closeNav }),
        React.createElement(ReaderNavigationMenuSearchButton, { onClick: this.handleSearchButtonClick }),
        React.createElement(ReaderNavigationMenuDisplaySettingsButton, { onClick: this.props.openDisplaySettings }),
        React.createElement('input', { className: 'readerSearch', title: 'Search for Texts or Keywords Here', placeholder: 'Search', onKeyUp: this.handleSearchKeyUp })
      );
      topContent = this.props.hideNavHeader ? null : topContent;

      var nRecent = this.width < 450 ? 4 : 6;
      var recentlyViewed = Sefaria.recentlyViewed;
      var hasMore = recentlyViewed.length > nRecent;
      recentlyViewed = recentlyViewed.filter(function (item) {
        // after a text has been deleted a recent ref may be invalid,
        // but don't try to check when booksDict is not available during server side render
        if (Object.keys(Sefaria.booksDict).length === 0) {
          return true;
        }
        return Sefaria.isRef(item.ref);
      }).map(function (item) {
        return React.createElement(TextBlockLink, {
          sref: item.ref,
          heRef: item.heRef,
          book: item.book,
          version: item.version,
          versionLanguage: item.versionLanguage,
          showSections: true,
          recentItem: true });
      }).slice(0, hasMore ? nRecent - 1 : nRecent);
      if (hasMore) {
        recentlyViewed.push(React.createElement(
          'a',
          { href: '/texts/recent', className: 'readerNavCategory readerNavMore', style: { "borderColor": Sefaria.palette.colors.darkblue }, onClick: this.props.setCategories.bind(null, ["recent"]) },
          React.createElement(
            'span',
            { className: 'en' },
            'More ',
            React.createElement('img', { src: '/static/img/arrow-right.png', alt: '' })
          ),
          React.createElement(
            'span',
            { className: 'he' },
            'עוד ',
            React.createElement('img', { src: '/static/img/arrow-left.png', alt: '' })
          )
        ));
      }
      recentlyViewed = recentlyViewed.length ? React.createElement(TwoOrThreeBox, { content: recentlyViewed, width: this.width }) : null;

      var title = React.createElement(
        'h1',
        null,
        this.props.multiPanel ? React.createElement(LanguageToggleButton, { toggleLanguage: this.props.toggleLanguage }) : null,
        React.createElement(
          'span',
          { className: 'int-en' },
          'The Sefaria Library'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'האוסף של ספאריה'
        )
      );

      var footer = this.props.compare ? null : React.createElement(
        'footer',
        { id: 'footer', className: 'interface-' + this.props.interfaceLang + ' static sans' },
        React.createElement(Footer, null)
      );
      var classes = classNames({ readerNavMenu: 1, noHeader: !this.props.hideHeader, compare: this.props.compare, home: this.props.home });
      var contentClasses = classNames({ content: 1, hasFooter: footer != null });
      return React.createElement(
        'div',
        { className: classes, onClick: this.handleClick, key: '0' },
        topContent,
        React.createElement(
          'div',
          { className: contentClasses },
          React.createElement(
            'div',
            { className: 'contentInner' },
            this.props.compare ? null : title,
            React.createElement(ReaderNavigationMenuSection, { title: 'Recent', heTitle: 'נצפו לאחרונה', content: recentlyViewed }),
            React.createElement(ReaderNavigationMenuSection, { title: 'Browse', heTitle: 'טקסטים', content: categories }),
            React.createElement(ReaderNavigationMenuSection, { title: 'Calendar', heTitle: 'לוח יומי', content: calendar }),
            this.props.compare ? null : React.createElement(ReaderNavigationMenuSection, { title: 'Resources', heTitle: 'קהילה', content: resources }),
            this.props.multiPanel ? null : siteLinks
          ),
          footer
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
      this.props.title ? React.createElement(
        'h2',
        null,
        React.createElement(
          'span',
          { className: 'int-en' },
          this.props.title
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          this.props.heTitle
        )
      ) : null,
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
    var category = this.props.category || (index ? index.primary_category : "Other");
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
        React.createElement('img', { src: '/static/img/aleph.svg', alt: 'Hebrew Language Toggle Icon' })
      ),
      React.createElement(
        'span',
        { className: 'he' },
        React.createElement('img', { src: '/static/img/aye.svg', alt: 'English Language Toggle Icon' })
      )
    );
  }
});

var BlockLink = React.createClass({
  displayName: 'BlockLink',

  propTypes: {
    title: React.PropTypes.string,
    heTitle: React.PropTypes.string,
    target: React.PropTypes.string,
    image: React.PropTypes.string,
    inAppLink: React.PropTypes.bool,
    interfaceLink: React.PropTypes.bool
  },
  getDefaultProps: function getDefaultProps() {
    return {
      interfaceLink: false
    };
  },
  render: function render() {
    var interfaceClass = this.props.interfaceLink ? 'int-' : '';
    var classes = classNames({ blockLink: 1, inAppLink: this.props.inAppLink });
    return React.createElement(
      'a',
      { className: classes, href: this.props.target },
      this.props.image ? React.createElement('img', { src: this.props.image, alt: '' }) : null,
      React.createElement(
        'span',
        { className: interfaceClass + 'en' },
        this.props.title
      ),
      React.createElement(
        'span',
        { className: interfaceClass + 'he' },
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
    toggleLanguage: React.PropTypes.func.isRequired,
    openDisplaySettings: React.PropTypes.func.isRequired,
    navHome: React.PropTypes.func.isRequired,
    width: React.PropTypes.number,
    compare: React.PropTypes.bool,
    hideNavHeader: React.PropTypes.bool,
    interfaceLang: React.PropTypes.string
  },
  render: function render() {
    var footer = this.props.compare ? null : React.createElement(
      'footer',
      { id: 'footer', className: 'interface-' + this.props.interfaceLang + ' static sans' },
      React.createElement(Footer, null)
    );
    // Show Talmud with Toggles
    var categories = this.props.categories[0] === "Talmud" && this.props.categories.length == 1 ? ["Talmud", "Bavli"] : this.props.categories;

    if (categories[0] === "Talmud" && categories.length <= 2) {
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
      var catTitle = categories.length > 1 ? categories[0] + " " + categories[1] : categories[0];
      var heCatTitle = categories.length > 1 ? Sefaria.hebrewTerm(categories[0]) + " " + Sefaria.hebrewTerm(categories[1]) : categories[0];
    } else {
      var toggle = null;
      var catTitle = this.props.category;
      var heCatTitle = Sefaria.hebrewTerm(this.props.category);
    }
    var catContents = Sefaria.tocItemsByCategories(categories);
    var navMenuClasses = classNames({ readerNavCategoryMenu: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader });
    var navTopClasses = classNames({ readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader });
    var contentClasses = classNames({ content: 1, hasFooter: footer != null });
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
            catTitle
          ),
          React.createElement(
            'span',
            { className: 'he' },
            heCatTitle
          )
        )
      ),
      React.createElement(
        'div',
        { className: contentClasses },
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
              catTitle
            ),
            React.createElement(
              'span',
              { className: 'he' },
              heCatTitle
            )
          ) : null,
          toggle,
          React.createElement(CategoryAttribution, { categories: categories }),
          React.createElement(ReaderNavigationCategoryMenuContents, { contents: catContents, categories: categories, width: this.props.width, category: this.props.category, nestLevel: 0 })
        ),
        footer
      )
    );
  }
});

var ReaderNavigationCategoryMenuContents = React.createClass({
  displayName: 'ReaderNavigationCategoryMenuContents',

  // Inner content of Category menu (just category title and boxes of)
  propTypes: {
    category: React.PropTypes.string.isRequired,
    contents: React.PropTypes.array.isRequired,
    categories: React.PropTypes.array.isRequired,
    width: React.PropTypes.number,
    nestLevel: React.PropTypes.number
  },
  getRenderedTextTitleString: function getRenderedTextTitleString(title, heTitle) {
    var whiteList = ['Midrash Mishlei', 'Midrash Tehillim', 'Midrash Tanchuma'];
    var displayCategory = this.props.category;
    var displayHeCategory = Sefaria.hebrewTerm(this.props.category);
    if (whiteList.indexOf(title) == -1) {
      var replaceTitles = {
        "en": ['Jerusalem Talmud', displayCategory],
        "he": ['תלמוד ירושלמי', displayHeCategory]
      };
      var replaceOther = {
        "en": [", ", " on ", " to ", " of "],
        "he": [", ", " על "]
      };
      //this will replace a category name at the beginning of the title string and any connector strings (0 or 1) that follow.
      var titleRe = new RegExp('^(' + replaceTitles['en'].join("|") + ')(' + replaceOther['en'].join("|") + ')?');
      var heTitleRe = new RegExp('^(' + replaceTitles['he'].join("|") + ')(' + replaceOther['he'].join("|") + ')?');
      title = title == displayCategory ? title : title.replace(titleRe, "");
      heTitle = heTitle == displayHeCategory ? heTitle : heTitle.replace(heTitleRe, "");
    }
    return [title, heTitle];
  },
  render: function render() {
    var content = [];
    var cats = this.props.categories || [];
    for (var i = 0; i < this.props.contents.length; i++) {
      var item = this.props.contents[i];
      if (item.category) {
        // Category
        var newCats = cats.concat(item.category);
        // Special Case categories which should nest but normally wouldn't given their depth
        var subcats = ["Mishneh Torah", "Shulchan Arukh", "Maharal"];
        if (Sefaria.util.inArray(item.category, subcats) > -1 || this.props.nestLevel > 0) {
          if (item.contents.length == 1 && !("category" in item.contents[0])) {
            var chItem = item.contents[0];

            var _getRenderedTextTitle = this.getRenderedTextTitleString(chItem.title, chItem.heTitle);

            var _getRenderedTextTitle2 = _slicedToArray(_getRenderedTextTitle, 2);

            var title = _getRenderedTextTitle2[0];
            var heTitle = _getRenderedTextTitle2[1];

            var url = "/" + Sefaria.normRef(chItem.firstSection);
            content.push(React.createElement(
              'a',
              { href: url, className: 'refLink sparse' + chItem.sparseness, 'data-ref': chItem.firstSection, key: "text." + this.props.nestLevel + "." + i },
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
            ));
          } else {
            // Create a link to a subcategory
            url = "/texts/" + newCats.join("/");
            content.push(React.createElement(
              'a',
              { href: url, className: 'catLink', 'data-cats': newCats.join("|"), key: "cat." + this.props.nestLevel + "." + i },
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
            ));
          }
        } else {
          // Add a Category
          content.push(React.createElement(
            'div',
            { className: 'category', key: "cat." + this.props.nestLevel + "." + i },
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
            React.createElement(ReaderNavigationCategoryMenuContents, { contents: item.contents, categories: newCats, width: this.props.width, nestLevel: this.props.nestLevel + 1, category: this.props.category })
          ));
        }
      } else {
        // Add a Text

        var _getRenderedTextTitle3 = this.getRenderedTextTitleString(item.title, item.heTitle);

        var _getRenderedTextTitle4 = _slicedToArray(_getRenderedTextTitle3, 2);

        var title = _getRenderedTextTitle4[0];
        var heTitle = _getRenderedTextTitle4[1];

        var ref = Sefaria.recentRefForText(item.title) || item.firstSection;
        var url = "/" + Sefaria.normRef(ref);
        content.push(React.createElement(
          'a',
          { href: url, className: 'refLink sparse' + item.sparseness, 'data-ref': ref, key: "text." + this.props.nestLevel + "." + i },
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
    narrowPanel: React.PropTypes.bool,
    close: React.PropTypes.func.isRequired,
    openNav: React.PropTypes.func.isRequired,
    showBaseText: React.PropTypes.func.isRequired,
    selectVersion: React.PropTypes.func
  },
  getInitialState: function getInitialState() {
    return {
      versions: [],
      versionsLoaded: false,
      currentVersion: null,
      showAllVersions: false,
      dlVersionTitle: null,
      dlVersionLanguage: null,
      dlVersionFormat: null,
      dlReady: false
    };
  },
  componentDidMount: function componentDidMount() {
    this.loadData();
  },
  componentDidUpdate: function componentDidUpdate(prevProps, prevState) {
    if (this.props.settingsLanguage != prevProps.settingsLanguage) {
      this.forceUpdate();
    }
  },
  getDataRef: function getDataRef() {
    // Returns ref to be used to looking up data
    return Sefaria.sectionRef(this.props.currentRef) || this.props.currentRef;
  },
  getData: function getData() {
    // Gets data about this text from cache, which may be null.
    var data = Sefaria.text(this.getDataRef(), { context: 1, version: this.props.version, language: this.props.versionLanguage });
    return data;
  },
  loadData: function loadData() {
    var _this2 = this;

    // Ensures data this text is in cache, rerenders after data load if needed
    var details = Sefaria.indexDetails(this.props.title);
    if (!details) {
      Sefaria.indexDetails(this.props.title, function () {
        return _this2.forceUpdate();
      });
    }
    if (this.isBookToc()) {
      var ref = this.getDataRef();
      var versions = Sefaria.versions(ref);
      if (!versions) {
        Sefaria.versions(ref, function () {
          return _this2.forceUpdate();
        });
      }
    } else if (this.isTextToc()) {
      var ref = this.getDataRef();
      var data = this.getData();
      if (!data) {
        Sefaria.text(ref, { context: 1, version: this.props.version, language: this.props.versionLanguage }, function () {
          return _this2.forceUpdate();
        });
      }
    }
  },
  getVersionsList: function getVersionsList() {
    if (this.isTextToc()) {
      var data = this.getData();
      if (!data) {
        return null;
      }
      return data.versions;
    } else if (this.isBookToc()) {
      return Sefaria.versions(this.props.title);
    }
  },
  getCurrentVersion: function getCurrentVersion() {
    // For now treat bilingual as english. TODO show attribution for 2 versions in bilingual case.
    if (this.isBookToc()) {
      return null;
    }
    var d = this.getData();
    if (!d) {
      return null;
    }
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
      versionStatus: currentLanguage == "he" ? d.heVersionStatus : d.versionStatus,
      license: currentLanguage == "he" ? d.heLicense : d.license,
      sources: currentLanguage == "he" ? d.heSources : d.sources,
      versionNotes: currentLanguage == "he" ? d.heVersionNotes : d.versionNotes,
      digitizedBySefaria: currentLanguage == "he" ? d.heDigitizedBySefaria : d.digitizedBySefaria
    };
    currentVersion.merged = !!currentVersion.sources;

    return currentVersion;
  },
  handleClick: function handleClick(e) {
    var $a = $(e.target).closest("a");
    if ($a.length && ($a.hasClass("sectionLink") || $a.hasClass("linked"))) {
      var ref = $a.attr("data-ref");
      ref = decodeURIComponent(ref);
      ref = Sefaria.humanRef(ref);
      this.props.close();
      this.props.showBaseText(ref, false, this.props.version, this.props.versionLanguage);
      e.preventDefault();
    }
  },
  openVersion: function openVersion(version, language) {
    // Selects a version and closes this menu to show it.
    // Calling this functon wihtout parameters resets to default
    this.props.selectVersion(version, language);
    this.props.close();
  },
  onDlVersionSelect: function onDlVersionSelect(event) {
    var versionTitle, versionLang;

    var _event$target$value$s = event.target.value.split("/");

    var _event$target$value$s2 = _slicedToArray(_event$target$value$s, 2);

    versionTitle = _event$target$value$s2[0];
    versionLang = _event$target$value$s2[1];

    this.setState({
      dlVersionTitle: versionTitle,
      dlVersionLanguage: versionLang
    });
  },
  onDlFormatSelect: function onDlFormatSelect(event) {
    this.setState({ dlVersionFormat: event.target.value });
  },
  versionDlLink: function versionDlLink() {
    return '/download/version/' + this.props.title + ' - ' + this.state.dlVersionLanguage + ' - ' + this.state.dlVersionTitle + '.' + this.state.dlVersionFormat;
  },
  recordDownload: function recordDownload() {
    Sefaria.site.track.event("Reader", "Version Download", this.props.title + ' / ' + this.state.dlVersionTitle + ' / ' + this.state.dlVersionLanguage + ' / ' + this.state.dlVersionFormat);
    return true;
  },
  isBookToc: function isBookToc() {
    return this.props.mode == "book toc";
  },
  isTextToc: function isTextToc() {
    return this.props.mode == "text toc";
  },
  isVersionPublicDomain: function isVersionPublicDomain(v) {
    return !(v.license && v.license.startsWith("Copyright"));
  },
  render: function render() {
    var title = this.props.title;
    var heTitle = Sefaria.index(title) ? Sefaria.index(title).heTitle : title;
    var category = this.props.category;

    var currentVersionElement = null;
    var defaultVersionString = "Default Version";
    var defaultVersionObject = null;
    var versionBlocks = null;
    var downloadSection = null;

    // Text Details
    var details = Sefaria.indexDetails(this.props.title);
    var detailsSection = details ? React.createElement(TextDetails, { index: details, narrowPanel: this.props.narrowPanel }) : null;

    if (this.isTextToc()) {
      var sectionStrings = Sefaria.sectionString(this.props.currentRef);
      var section = sectionStrings.en.named;
      var heSection = sectionStrings.he.named;
    }

    // Current Version (Text TOC only)
    var cv = this.getCurrentVersion();
    if (cv) {
      if (cv.merged) {
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
      } else {
        if (!this.props.version) {
          defaultVersionObject = this.state.versions.find(function (v) {
            return cv.language == v.language && cv.versionTitle == v.versionTitle;
          });
          defaultVersionString += defaultVersionObject ? " (" + defaultVersionObject.versionTitle + ")" : "";
        }
        currentVersionElement = React.createElement(VersionBlock, { title: title, version: cv, currentRef: this.props.currentRef, showHistory: true });
      }
    }

    // Versions List
    var versions = this.getVersionsList();

    var moderatorSection = Sefaria.is_moderator || Sefaria.is_editor ? React.createElement(ModeratorButtons, { title: title }) : null;

    // Downloading
    if (versions) {
      var dlReady = this.state.dlVersionTitle && this.state.dlVersionFormat && this.state.dlVersionLanguage;
      var dl_versions = [React.createElement(
        'option',
        { key: '/', value: '0', disabled: true },
        'Version Settings'
      )];
      var pdVersions = versions.filter(this.isVersionPublicDomain);
      if (cv && cv.merged) {
        var other_lang = cv.language == "he" ? "en" : "he";
        dl_versions = dl_versions.concat([React.createElement(
          'option',
          { value: "merged/" + cv.language, key: "merged/" + cv.language, 'data-lang': cv.language, 'data-version': 'merged' },
          'Current Merged Version (',
          cv.language,
          ')'
        ), React.createElement(
          'option',
          { value: "merged/" + other_lang, key: "merged/" + other_lang, 'data-lang': other_lang, 'data-version': 'merged' },
          'Merged Version (',
          other_lang,
          ')'
        )]);
        dl_versions = dl_versions.concat(pdVersions.map(function (v) {
          return React.createElement(
            'option',
            { value: v.versionTitle + "/" + v.language, key: v.versionTitle + "/" + v.language },
            v.versionTitle + " (" + v.language + ")"
          );
        }));
      } else if (cv) {
        if (this.isVersionPublicDomain(cv)) {
          dl_versions.push(React.createElement(
            'option',
            { value: cv.versionTitle + "/" + cv.language, key: cv.versionTitle + "/" + cv.language },
            'Current Version (',
            cv.versionTitle + " (" + cv.language + ")",
            ')'
          ));
        }
        dl_versions = dl_versions.concat([React.createElement(
          'option',
          { value: 'merged/he', key: 'merged/he' },
          'Merged Version (he)'
        ), React.createElement(
          'option',
          { value: 'merged/en', key: 'merged/en' },
          'Merged Version (en)'
        )]);
        dl_versions = dl_versions.concat(pdVersions.filter(function (v) {
          return v.language != cv.language || v.versionTitle != cv.versionTitle;
        }).map(function (v) {
          return React.createElement(
            'option',
            { value: v.versionTitle + "/" + v.language, key: v.versionTitle + "/" + v.language },
            v.versionTitle + " (" + v.language + ")"
          );
        }));
      } else {
        dl_versions = dl_versions.concat([React.createElement(
          'option',
          { value: 'merged/he', key: 'merged/he' },
          'Merged Version (he)'
        ), React.createElement(
          'option',
          { value: 'merged/en', key: 'merged/en' },
          'Merged Version (en)'
        )]);
        dl_versions = dl_versions.concat(pdVersions.map(function (v) {
          return React.createElement(
            'option',
            { value: v.versionTitle + "/" + v.language, key: v.versionTitle + "/" + v.language },
            v.versionTitle + " (" + v.language + ")"
          );
        }));
      }
      var downloadButton = React.createElement(
        'div',
        { className: 'versionDownloadButton' },
        React.createElement(
          'div',
          { className: 'downloadButtonInner' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Download'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'הורדה'
          )
        )
      );
      var downloadSection = React.createElement(
        'div',
        { className: 'dlSection' },
        React.createElement(
          'h2',
          { className: 'dlSectionTitle' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Download Text'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'הורדת הטקסט'
          )
        ),
        React.createElement(
          'select',
          { className: 'dlVersionSelect dlVersionTitleSelect', value: this.state.dlVersionTitle && this.state.dlVersionLanguage ? this.state.dlVersionTitle + "/" + this.state.dlVersionLanguage : "0", onChange: this.onDlVersionSelect },
          dl_versions
        ),
        React.createElement(
          'select',
          { className: 'dlVersionSelect dlVersionFormatSelect', value: this.state.dlVersionFormat || "0", onChange: this.onDlFormatSelect },
          React.createElement(
            'option',
            { key: 'none', value: '0', disabled: true },
            'File Format'
          ),
          React.createElement(
            'option',
            { key: 'txt', value: 'txt' },
            'Text'
          ),
          React.createElement(
            'option',
            { key: 'csv', value: 'csv' },
            'CSV'
          ),
          React.createElement(
            'option',
            { key: 'json', value: 'json' },
            'JSON'
          )
        ),
        dlReady ? React.createElement(
          'a',
          { onClick: this.recordDownload, href: this.versionDlLink(), download: true },
          downloadButton
        ) : downloadButton
      );
    }

    var closeClick = this.isBookToc() ? this.props.closePanel : this.props.close;
    var classes = classNames({ readerTextTableOfContents: 1, readerNavMenu: 1, narrowPanel: this.props.narrowPanel });
    var categories = Sefaria.index(this.props.title).categories;

    return React.createElement(
      'div',
      { className: classes },
      React.createElement(CategoryColorLine, { category: category }),
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
                { className: 'int-en' },
                'Table of Contents'
              ),
              React.createElement(
                'span',
                { className: 'int-he' },
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
            { className: 'tocTop' },
            React.createElement(CategoryAttribution, { categories: categories }),
            React.createElement(
              'div',
              { className: 'tocCategory' },
              React.createElement(
                'span',
                { className: 'en' },
                category
              ),
              React.createElement(
                'span',
                { className: 'he' },
                Sefaria.hebrewTerm(category)
              )
            ),
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
              moderatorSection
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
            ) : null,
            detailsSection
          ),
          this.isTextToc() ? React.createElement(
            'div',
            { className: 'currentVersionBox' },
            currentVersionElement || React.createElement(LoadingMessage, null)
          ) : null,
          details ? React.createElement(
            'div',
            { onClick: this.handleClick },
            React.createElement(TextTableOfContentsNavigation, {
              schema: details.schema,
              commentatorList: Sefaria.commentaryList(this.props.title),
              alts: details.alts,
              versionsList: versions,
              openVersion: this.openVersion,
              defaultStruct: "default_struct" in details && details.default_struct in details.alts ? details.default_struct : "default",
              currentRef: this.props.currentRef,
              narrowPanel: this.props.narrowPanel,
              title: this.props.title })
          ) : React.createElement(LoadingMessage, null),
          downloadSection
        )
      )
    );
  }
});

var TextDetails = React.createClass({
  displayName: 'TextDetails',

  propTypes: {
    index: React.PropTypes.object.isRequired,
    narrowPanel: React.PropTypes.bool
  },
  render: function render() {
    var makeDescriptionText = function makeDescriptionText(compWord, compPlace, compDate, description) {
      var composed = compPlace || compDate ? compWord + [compPlace, compDate].filter(function (x) {
        return !!x;
      }).join(" ") : null;
      //return [composed, description].filter(x => !!x).join(". ");
      // holding on displaying descriptions for now
      return composed;
    };
    var enDesc = makeDescriptionText("Composed in ", "compPlaceString" in this.props.index ? this.props.index.compPlaceString.en : null, "compDateString" in this.props.index ? this.props.index.compDateString.en : null, this.props.index.enDesc);
    var heDesc = makeDescriptionText("נוצר/נערך ב", "compPlaceString" in this.props.index ? this.props.index.compPlaceString.he : null, "compDateString" in this.props.index ? this.props.index.compDateString.he : null, this.props.index.heDesc);

    var authors = "authors" in this.props.index ? this.props.index.authors : [];

    if (!authors.length && !enDesc) {
      return null;
    }

    var initialWords = this.props.narrowPanel ? 12 : 30;

    return React.createElement(
      'div',
      { className: 'tocDetails' },
      authors.length ? React.createElement(
        'div',
        { className: 'tocDetail' },
        React.createElement(
          'span',
          { className: 'int-he' },
          'מחבר: ',
          authors.map(function (author) {
            return React.createElement(
              'a',
              { key: author.en, href: "/person/" + author.en },
              author.he
            );
          })
        ),
        React.createElement(
          'span',
          { className: 'int-en' },
          'Author: ',
          authors.map(function (author) {
            return React.createElement(
              'a',
              { key: author.en, href: "/person/" + author.en },
              author.en
            );
          })
        )
      ) : null,
      !!enDesc ? React.createElement(
        'div',
        { className: 'tocDetail description' },
        React.createElement(
          'div',
          { className: 'int-he' },
          React.createElement(ReadMoreText, { text: heDesc, initialWords: initialWords })
        ),
        React.createElement(
          'div',
          { className: 'int-en' },
          React.createElement(ReadMoreText, { text: enDesc, initialWords: initialWords })
        )
      ) : null
    );
  }
});

var TextTableOfContentsNavigation = React.createClass({
  displayName: 'TextTableOfContentsNavigation',

  // The content section of the text table of contents that includes links to text sections,
  // and tabs for alternate structures, commentary and versions.
  propTypes: {
    schema: React.PropTypes.object.isRequired,
    commentatorList: React.PropTypes.array,
    alts: React.PropTypes.object,
    versionsList: React.PropTypes.array,
    openVersion: React.PropTypes.func,
    defaultStruct: React.PropTypes.string,
    currentRef: React.PropTypes.string,
    narrowPanel: React.PropTypes.bool,
    title: React.PropTypes.string.isRequired
  },
  getInitialState: function getInitialState() {
    return {
      tab: this.props.defaultStruct
    };
  },
  componentDidMount: function componentDidMount() {
    this.shrinkWrap();
    window.addEventListener('resize', this.shrinkWrap);
  },
  componentWillUnmount: function componentWillUnmount() {
    window.removeEventListener('resize', this.shrinkWrap);
  },
  componentDidUpdate: function componentDidUpdate(prevProps, prevState) {
    if (prevState.tab != this.state.tab && this.state.tab !== "commentary" && this.state.tab != "versions") {
      this.shrinkWrap();
    }
  },
  setTab: function setTab(tab) {
    this.setState({ tab: tab });
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
    var $root = $(ReactDOM.findDOMNode(this));
    if ($root.find(".tocSection").length) {// nested simple text
      //$root.find(".tocSection").each(shrink); // Don't bother with these for now
    } else if ($root.find(".schema-node-toc").length) {// complex text or alt struct
        // $root.find(".schema-node-toc, .schema-node-contents").each(shrink);
      } else {
          $root.find(".tocLevel").each(shrink); // Simple text, no nesting
        }
  },
  render: function render() {
    var options = [{
      name: "default",
      text: "sectionNames" in this.props.schema ? this.props.schema.sectionNames[0] : "Contents",
      heText: "sectionNames" in this.props.schema ? Sefaria.hebrewTerm(this.props.schema.sectionNames[0]) : "תוכן",
      onPress: this.setTab.bind(null, "default")
    }];
    if (this.props.alts) {
      for (var alt in this.props.alts) {
        if (this.props.alts.hasOwnProperty(alt)) {
          options.push({
            name: alt,
            text: alt,
            heText: Sefaria.hebrewTerm(alt),
            onPress: this.setTab.bind(null, alt)
          });
        }
      }
    }
    options = options.sort(function (a, b) {
      return a.name == this.props.defaultStruct ? -1 : b.name == this.props.defaultStruct ? 1 : 0;
    }.bind(this));

    if (this.props.commentatorList.length) {
      options.push({
        name: "commentary",
        text: "Commentary",
        heText: "מפרשים",
        onPress: this.setTab.bind(null, "commentary")
      });
    }

    options.push({
      name: "versions",
      text: "Versions",
      heText: "גרסאות",
      onPress: this.setTab.bind(null, "versions")
    });

    var toggle = React.createElement(TabbedToggleSet, {
      options: options,
      active: this.state.tab,
      narrowPanel: this.props.narrowPanel });

    switch (this.state.tab) {
      case "default":
        var content = React.createElement(SchemaNode, {
          schema: this.props.schema,
          addressTypes: this.props.schema.addressTypes,
          refPath: this.props.title });
        break;
      case "commentary":
        var content = React.createElement(CommentatorList, {
          commentatorList: this.props.commentatorList });
        break;
      case "versions":
        var content = React.createElement(VersionsList, {
          versionsList: this.props.versionsList,
          openVersion: this.props.openVersion,
          title: this.props.title,
          currentRef: this.props.currentRef });
        break;
      default:
        var content = React.createElement(SchemaNode, {
          schema: this.props.alts[this.state.tab],
          addressTypes: this.props.schema.addressTypes,
          refPath: this.props.title });
        break;
    }

    return React.createElement(
      'div',
      { className: 'tocContent' },
      toggle,
      content
    );
  }
});

var TabbedToggleSet = React.createClass({
  displayName: 'TabbedToggleSet',

  propTypes: {
    options: React.PropTypes.array.isRequired, // array of object with `name`. `text`, `heText`, `onPress`
    active: React.PropTypes.string.isRequired,
    narrowPanel: React.PropTypes.bool
  },
  render: function render() {
    var options = this.props.options.map(function (option, i) {
      var classes = classNames({ altStructToggle: 1, active: this.props.active === option.name });
      return React.createElement(
        'div',
        { className: 'altStructToggleBox', key: i },
        React.createElement(
          'span',
          { className: classes, onClick: option.onPress },
          React.createElement(
            'span',
            { className: 'int-he' },
            option.heText
          ),
          React.createElement(
            'span',
            { className: 'int-en' },
            option.text
          )
        )
      );
    }.bind(this));

    if (this.props.narrowPanel) {
      var rows = [];
      var rowSize = options.length == 4 ? 2 : 3;
      for (var i = 0; i < options.length; i += rowSize) {
        rows.push(options.slice(i, i + rowSize));
      }
    } else {
      var rows = [options];
    }

    return React.createElement(
      'div',
      { className: 'structToggles' },
      rows.map(function (row, i) {
        return React.createElement(
          'div',
          { className: 'structTogglesInner', key: i },
          row
        );
      })
    );
  }
});

var SchemaNode = React.createClass({
  displayName: 'SchemaNode',

  propTypes: {
    schema: React.PropTypes.object.isRequired,
    refPath: React.PropTypes.string.isRequired
  },
  getInitialState: function getInitialState() {
    return {
      // Collapse everything except default nodes to start.
      collapsed: "nodes" in this.props.schema ? this.props.schema.nodes.map(function (node) {
        return !(node.default || node.includeSections);
      }) : []
    };
  },
  toggleCollapse: function toggleCollapse(i) {
    this.state.collapsed[i] = !this.state.collapsed[i];
    this.setState({ collapsed: this.state.collapsed });
  },
  render: function render() {
    if (!("nodes" in this.props.schema)) {
      if (this.props.schema.nodeType === "JaggedArrayNode") {
        return React.createElement(JaggedArrayNode, {
          schema: this.props.schema,
          refPath: this.props.refPath });
      } else if (this.props.schema.nodeType === "ArrayMapNode") {
        return React.createElement(ArrayMapNode, { schema: this.props.schema });
      }
    } else {
      var content = this.props.schema.nodes.map(function (node, i) {
        if ("nodes" in node || "refs" in node && node.refs.length) {
          // SchemaNode with children (nodes) or ArrayMapNode with depth (refs)
          return React.createElement(
            'div',
            { className: 'schema-node-toc', key: i },
            React.createElement(
              'span',
              { className: 'schema-node-title', onClick: this.toggleCollapse.bind(null, i) },
              React.createElement(
                'span',
                { className: 'he' },
                node.heTitle,
                ' ',
                React.createElement('i', { className: "schema-node-control fa fa-angle-" + (this.state.collapsed[i] ? "left" : "down") })
              ),
              React.createElement(
                'span',
                { className: 'en' },
                node.title,
                ' ',
                React.createElement('i', { className: "schema-node-control fa fa-angle-" + (this.state.collapsed[i] ? "right" : "down") })
              )
            ),
            !this.state.collapsed[i] ? React.createElement(
              'div',
              { className: 'schema-node-contents' },
              React.createElement(SchemaNode, {
                schema: node,
                refPath: this.props.refPath + ", " + node.title })
            ) : null
          );
        } else if (node.nodeType == "ArrayMapNode") {
          // ArrayMapNode with only wholeRef
          return React.createElement(ArrayMapNode, { schema: node, key: i });
        } else if (node.depth == 1 && !node.default) {
          // SchemaNode title that points straight to content
          var path = this.props.refPath + ", " + node.title;
          return React.createElement(
            'a',
            { className: 'schema-node-toc linked', href: Sefaria.normRef(path), 'data-ref': path, key: i },
            React.createElement(
              'span',
              { className: 'schema-node-title' },
              React.createElement(
                'span',
                { className: 'he' },
                node.heTitle
              ),
              React.createElement(
                'span',
                { className: 'en' },
                node.title
              )
            )
          );
        } else {
          // SchemaNode that has a JaggedArray below it
          return React.createElement(
            'div',
            { className: 'schema-node-toc', key: i },
            !node.default ? React.createElement(
              'span',
              { className: 'schema-node-title', onClick: this.toggleCollapse.bind(null, i) },
              React.createElement(
                'span',
                { className: 'he' },
                node.heTitle,
                ' ',
                React.createElement('i', { className: "schema-node-control fa fa-angle-" + (this.state.collapsed[i] ? "left" : "down") })
              ),
              React.createElement(
                'span',
                { className: 'en' },
                node.title,
                ' ',
                React.createElement('i', { className: "schema-node-control fa fa-angle-" + (this.state.collapsed[i] ? "right" : "down") })
              )
            ) : null,
            !this.state.collapsed[i] ? React.createElement(
              'div',
              { className: 'schema-node-contents' },
              React.createElement(JaggedArrayNode, {
                schema: node,
                contentLang: this.props.contentLang,
                refPath: this.props.refPath + (node.default ? "" : ", " + node.title) })
            ) : null
          );
        }
      }.bind(this));
      return React.createElement(
        'div',
        { className: 'tocLevel' },
        content
      );
    }
  }
});

var JaggedArrayNode = React.createClass({
  displayName: 'JaggedArrayNode',

  propTypes: {
    schema: React.PropTypes.object.isRequired,
    refPath: React.PropTypes.string.isRequired
  },
  render: function render() {
    if ("toc_zoom" in this.props.schema) {
      var zoom = this.props.schema.toc_zoom - 1;
      return React.createElement(JaggedArrayNodeSection, {
        depth: this.props.schema.depth - zoom,
        sectionNames: this.props.schema.sectionNames.slice(0, -zoom),
        addressTypes: this.props.schema.addressTypes.slice(0, -zoom),
        contentCounts: this.props.schema.content_counts,
        refPath: this.props.refPath });
    }
    return React.createElement(JaggedArrayNodeSection, {
      depth: this.props.schema.depth,
      sectionNames: this.props.schema.sectionNames,
      addressTypes: this.props.schema.addressTypes,
      contentCounts: this.props.schema.content_counts,
      refPath: this.props.refPath });
  }
});

var JaggedArrayNodeSection = React.createClass({
  displayName: 'JaggedArrayNodeSection',

  propTypes: {
    depth: React.PropTypes.number.isRequired,
    sectionNames: React.PropTypes.array.isRequired,
    addressTypes: React.PropTypes.array.isRequired,
    contentCounts: React.PropTypes.oneOfType([React.PropTypes.array, React.PropTypes.number]),
    refPath: React.PropTypes.string.isRequired
  },
  contentCountIsEmpty: function contentCountIsEmpty(count) {
    // Returns true if count is zero or is an an array (of arrays) of zeros.
    if (typeof count == "number") {
      return count == 0;
    }
    var innerCounts = count.map(this.contentCountIsEmpty);
    return innerCounts.unique().compare([true]);
  },
  refPathTerminal: function refPathTerminal(count) {
    // Returns a string to be added to the end of a section link depending on a content count
    // Used in cases of "zoomed" JaggedArrays, where `contentCounts` is deeper than `depth` so that zoomed section
    // links still point to section level.
    if (typeof count == "number") {
      return "";
    }
    var terminal = ":";
    for (var i = 0; i < count.length; i++) {
      if (count[i]) {
        terminal += i + 1 + this.refPathTerminal(count[i]);
        break;
      }
    }
    return terminal;
  },
  render: function render() {
    if (this.props.depth > 2) {
      var content = [];
      for (var i = 0; i < this.props.contentCounts.length; i++) {
        if (this.contentCountIsEmpty(this.props.contentCounts[i])) {
          continue;
        }
        if (this.props.addressTypes[0] === "Talmud") {
          var enSection = Sefaria.hebrew.intToDaf(i);
          var heSection = Sefaria.hebrew.encodeHebrewDaf(enSection);
        } else {
          var enSection = i + 1;
          var heSection = Sefaria.hebrew.encodeHebrewNumeral(i + 1);
        }
        content.push(React.createElement(
          'div',
          { className: 'tocSection', key: i },
          React.createElement(
            'div',
            { className: 'sectionName' },
            React.createElement(
              'span',
              { className: 'he' },
              Sefaria.hebrewTerm(this.props.sectionNames[0]) + " " + heSection
            ),
            React.createElement(
              'span',
              { className: 'en' },
              this.props.sectionNames[0] + " " + enSection
            )
          ),
          React.createElement(JaggedArrayNodeSection, {
            depth: this.props.depth - 1,
            sectionNames: this.props.sectionNames.slice(1),
            addressTypes: this.props.addressTypes.slice(1),
            contentCounts: this.props.contentCounts[i],
            refPath: this.props.refPath + ":" + enSection })
        ));
      }
      return React.createElement(
        'div',
        { className: 'tocLevel' },
        content
      );
    }
    var contentCounts = this.props.depth == 1 ? new Array(this.props.contentCounts).fill(1) : this.props.contentCounts;
    var sectionLinks = [];
    for (var i = 0; i < contentCounts.length; i++) {
      if (this.contentCountIsEmpty(contentCounts[i])) {
        continue;
      }
      if (this.props.addressTypes[0] === "Talmud") {
        var section = Sefaria.hebrew.intToDaf(i);
        var heSection = Sefaria.hebrew.encodeHebrewDaf(section);
      } else {
        var section = i + 1;
        var heSection = Sefaria.hebrew.encodeHebrewNumeral(i + 1);
      }
      var ref = (this.props.refPath + ":" + section).replace(":", " ") + this.refPathTerminal(contentCounts[i]);
      var link = React.createElement(
        'a',
        { className: 'sectionLink', href: Sefaria.normRef(ref), 'data-ref': ref, key: i },
        React.createElement(
          'span',
          { className: 'he' },
          heSection
        ),
        React.createElement(
          'span',
          { className: 'en' },
          section
        )
      );
      sectionLinks.push(link);
    }
    return React.createElement(
      'div',
      { className: 'tocLevel' },
      sectionLinks
    );
  }
});

var ArrayMapNode = React.createClass({
  displayName: 'ArrayMapNode',

  propTypes: {
    schema: React.PropTypes.object.isRequired
  },
  render: function render() {
    if ("refs" in this.props.schema && this.props.schema.refs.length) {
      var sectionLinks = this.props.schema.refs.map(function (ref, i) {
        i += this.props.schema.offset || 0;
        if (this.props.schema.addressTypes[0] === "Talmud") {
          var section = Sefaria.hebrew.intToDaf(i);
          var heSection = Sefaria.hebrew.encodeHebrewDaf(section);
        } else {
          var section = i + 1;
          var heSection = Sefaria.hebrew.encodeHebrewNumeral(i + 1);
        }
        return React.createElement(
          'a',
          { className: 'sectionLink', href: Sefaria.normRef(ref), 'data-ref': ref, key: i },
          React.createElement(
            'span',
            { className: 'he' },
            heSection
          ),
          React.createElement(
            'span',
            { className: 'en' },
            section
          )
        );
      }.bind(this));

      return React.createElement(
        'div',
        null,
        sectionLinks
      );
    } else {
      return React.createElement(
        'a',
        { className: 'schema-node-toc linked', href: Sefaria.normRef(this.props.schema.wholeRef), 'data-ref': this.props.schema.wholeRef },
        React.createElement(
          'span',
          { className: 'schema-node-title' },
          React.createElement(
            'span',
            { className: 'he' },
            this.props.schema.heTitle,
            ' ',
            React.createElement('i', { className: 'schema-node-control fa fa-angle-left' })
          ),
          React.createElement(
            'span',
            { className: 'en' },
            this.props.schema.title,
            ' ',
            React.createElement('i', { className: 'schema-node-control fa fa-angle-right' })
          )
        )
      );
    }
  }
});

var CommentatorList = React.createClass({
  displayName: 'CommentatorList',

  propTypes: {
    commentatorList: React.PropTypes.array.isRequired
  },
  render: function render() {
    var content = this.props.commentatorList.map(function (commentator, i) {
      var ref = commentator.firstSection;
      return React.createElement(
        'a',
        { className: 'refLink linked', href: Sefaria.normRef(ref), 'data-ref': ref, key: i },
        React.createElement(
          'span',
          { className: 'he' },
          commentator.heCollectiveTitle
        ),
        React.createElement(
          'span',
          { className: 'en' },
          commentator.collectiveTitle
        )
      );
    }.bind(this));

    return React.createElement(TwoBox, { content: content });
  }
});

var VersionsList = React.createClass({
  displayName: 'VersionsList',

  propTypes: {
    versionsList: React.PropTypes.array.isRequired,
    openVersion: React.PropTypes.func.isRequired,
    title: React.PropTypes.string.isRequired,
    currentRef: React.PropTypes.string
  },
  render: function render() {
    var _this3 = this;

    var versions = this.props.versionsList;

    var _map = ["he", "en"].map(function (lang) {
      return versions.filter(function (v) {
        return v.language == lang;
      }).map(function (v) {
        return React.createElement(VersionBlock, {
          title: _this3.props.title,
          version: v,
          currentRef: _this3.props.currentRef || _this3.props.title,
          firstSectionRef: "firstSectionRef" in v ? v.firstSectionRef : null,
          openVersion: _this3.props.openVersion,
          key: v.versionTitle + "/" + v.language });
      });
    });

    var _map2 = _slicedToArray(_map, 2);

    var heVersionBlocks = _map2[0];
    var enVersionBlocks = _map2[1];


    return React.createElement(
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
            { className: 'int-en' },
            'Hebrew Versions'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'בעברית'
          )
        ),
        React.createElement(
          'div',
          null,
          heVersionBlocks
        )
      ) : null,
      !!enVersionBlocks.length ? React.createElement(
        'div',
        { className: 'versionLanguageBlock' },
        React.createElement(
          'div',
          { className: 'versionLanguageHeader' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'English Versions'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'באנגלית'
          )
        ),
        React.createElement(
          'div',
          null,
          enVersionBlocks
        )
      ) : null
    );
  }
});

var VersionBlock = React.createClass({
  displayName: 'VersionBlock',

  propTypes: {
    title: React.PropTypes.string.isRequired,
    version: React.PropTypes.object.isRequired,
    currentRef: React.PropTypes.string,
    firstSectionref: React.PropTypes.string,
    showHistory: React.PropTypes.bool,
    showNotes: React.PropTypes.bool,
    openVersion: React.PropTypes.func
  },
  getDefaultProps: function getDefaultProps() {
    return {
      showHistory: true,
      showNotes: true
    };
  },
  getInitialState: function getInitialState() {
    var _this4 = this;

    var s = {
      editing: false,
      error: null,
      originalVersionTitle: this.props.version["versionTitle"]
    };
    this.updateableVersionAttributes.forEach(function (attr) {
      return s[attr] = _this4.props.version[attr];
    });
    return s;
  },
  updateableVersionAttributes: ["versionTitle", "versionSource", "versionNotes", "license", "priority", "digitizedBySefaria", "status"],
  licenseMap: {
    "Public Domain": "https://en.wikipedia.org/wiki/Public_domain",
    "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
    "CC-BY": "https://creativecommons.org/licenses/by/3.0/",
    "CC-BY-SA": "https://creativecommons.org/licenses/by-sa/3.0/",
    "CC-BY-NC": "https://creativecommons.org/licenses/by-nc/4.0/"
  },
  openVersion: function openVersion() {
    if (this.props.firstSectionRef) {
      window.location = "/" + this.props.firstSectionRef + "/" + this.props.version.language + "/" + this.props.version.versionTitle;
    } else if (this.props.openVersion) {
      this.props.openVersion(this.props.version.versionTitle, this.props.version.language);
    }
  },
  onLicenseChange: function onLicenseChange(event) {
    this.setState({ license: event.target.value, "error": null });
  },
  onVersionSourceChange: function onVersionSourceChange(event) {
    this.setState({ versionSource: event.target.value, "error": null });
  },
  onVersionNotesChange: function onVersionNotesChange(event) {
    this.setState({ versionNotes: event.target.value, "error": null });
  },
  onPriorityChange: function onPriorityChange(event) {
    this.setState({ priority: event.target.value, "error": null });
  },
  onDigitizedBySefariaChange: function onDigitizedBySefariaChange(event) {
    this.setState({ digitizedBySefaria: event.target.checked, "error": null });
  },
  onLockedChange: function onLockedChange(event) {
    this.setState({ status: event.target.checked ? "locked" : null, "error": null });
  },
  onVersionTitleChange: function onVersionTitleChange(event) {
    this.setState({ versionTitle: event.target.value, "error": null });
  },
  saveVersionUpdate: function saveVersionUpdate(event) {
    var v = this.props.version;

    var payloadVersion = {};
    this.updateableVersionAttributes.forEach(function (attr) {
      if (this.state[attr] || this.state[attr] != this.props.version[attr]) {
        payloadVersion[attr] = this.state[attr];
      }
    }.bind(this));
    delete payloadVersion.versionTitle;
    if (this.state.versionTitle != this.state.originalVersionTitle) {
      payloadVersion.newVersionTitle = this.state.versionTitle;
    }
    this.setState({ "error": "Saving.  Page will reload on success." });
    $.ajax({
      url: '/api/version/flags/' + this.props.title + '/' + v.language + '/' + v.versionTitle,
      dataType: 'json',
      type: 'POST',
      data: { json: JSON.stringify(payloadVersion) },
      success: function (data) {
        if (data.status == "ok") {
          document.location.reload(true);
        } else {
          this.setState({ error: data.error });
        }
      }.bind(this),
      error: function (xhr, status, err) {
        this.setState({ error: err.toString() });
      }.bind(this)
    });
  },
  deleteVersion: function deleteVersion() {
    if (!confirm("Are you sure you want to delete this text version?")) {
      return;
    }

    var title = this.props.title;
    var url = "/api/texts/" + title + "/" + this.props.version.language + "/" + this.props.version.versionTitle;

    $.ajax({
      url: url,
      type: "DELETE",
      success: function success(data) {
        if ("error" in data) {
          alert(data.error);
        } else {
          alert("Text Version Deleted.");
          window.location = "/" + Sefaria.normRef(title);
        }
      }
    }).fail(function () {
      alert("Something went wrong. Sorry!");
    });
  },
  openEditor: function openEditor() {
    this.setState({ editing: true });
  },
  closeEditor: function closeEditor() {
    this.setState({ editing: false });
  },
  render: function render() {
    var v = this.props.version;

    if (this.state.editing) {
      // Editing View
      var close_icon = Sefaria.is_moderator ? React.createElement('i', { className: 'fa fa-times-circle', 'aria-hidden': 'true', onClick: this.closeEditor }) : "";

      var licenses = Object.keys(this.licenseMap);
      licenses = licenses.includes(v.license) ? licenses : [v.license].concat(licenses);

      return React.createElement(
        'div',
        { className: 'versionBlock' },
        React.createElement(
          'div',
          { className: 'error' },
          this.state.error
        ),
        React.createElement(
          'div',
          { className: 'versionEditForm' },
          React.createElement(
            'label',
            { 'for': 'versionTitle', className: '' },
            'Version Title'
          ),
          close_icon,
          React.createElement('input', { id: 'versionTitle', className: '', type: 'text', value: this.state.versionTitle, onChange: this.onVersionTitleChange }),
          React.createElement(
            'label',
            { 'for': 'versionSource' },
            'Version Source'
          ),
          React.createElement('input', { id: 'versionSource', className: '', type: 'text', value: this.state.versionSource, onChange: this.onVersionSourceChange }),
          React.createElement(
            'label',
            { id: 'license_label', 'for': 'license' },
            'License'
          ),
          React.createElement(
            'select',
            { id: 'license', className: '', value: this.state.license, onChange: this.onLicenseChange },
            licenses.map(function (v) {
              return React.createElement(
                'option',
                { key: v, value: v },
                v ? v : "(None Listed)"
              );
            })
          ),
          React.createElement(
            'label',
            { id: 'digitzedBySefaria_label', 'for': 'digitzedBySefaria' },
            'Digitized by Sefaria'
          ),
          React.createElement('input', { type: 'checkbox', id: 'digitzedBySefaria', checked: this.state.digitizedBySefaria, onChange: this.onDigitizedBySefariaChange }),
          React.createElement(
            'label',
            { id: 'priority_label', 'for': 'priority' },
            'Priority'
          ),
          React.createElement('input', { id: 'priority', className: '', type: 'text', value: this.state.priority, onChange: this.onPriorityChange }),
          React.createElement(
            'label',
            { id: 'locked_label', 'for': 'locked' },
            'Locked'
          ),
          React.createElement('input', { type: 'checkbox', id: 'locked', checked: this.state.status == "locked", onChange: this.onLockedChange }),
          React.createElement(
            'label',
            { id: 'versionNotes_label', 'for': 'versionNotes' },
            'VersionNotes'
          ),
          React.createElement('textarea', { id: 'versionNotes', placeholder: 'Version Notes', onChange: this.onVersionNotesChange, value: this.state.versionNotes, rows: '5', cols: '40' }),
          React.createElement(
            'div',
            null,
            React.createElement(
              'div',
              { id: 'delete_button', onClick: this.deleteVersion },
              'Delete Version'
            ),
            React.createElement(
              'div',
              { id: 'save_button', onClick: this.saveVersionUpdate },
              'SAVE'
            ),
            React.createElement('div', { className: 'clearFix' })
          )
        )
      );
    } else {
      // Presentation View
      var license = this.licenseMap[v.license] ? React.createElement(
        'a',
        { href: this.licenseMap[v.license], target: '_blank' },
        v.license
      ) : v.license;
      var digitizedBySefaria = v.digitizedBySefaria ? React.createElement(
        'a',
        { className: 'versionDigitizedBySefaria', href: '/digitized-by-sefaria' },
        'Digitized by Sefaria'
      ) : "";
      var licenseLine = "";
      if (v.license && v.license != "unknown") {
        licenseLine = React.createElement(
          'span',
          { className: 'versionLicense' },
          license,
          digitizedBySefaria ? " - " : "",
          digitizedBySefaria
        );
      }
      var edit_icon = Sefaria.is_moderator ? React.createElement('i', { className: 'fa fa-pencil', 'aria-hidden': 'true', onClick: this.openEditor }) : "";

      return React.createElement(
        'div',
        { className: 'versionBlock' },
        React.createElement(
          'div',
          { className: 'versionTitle' },
          React.createElement(
            'span',
            { onClick: this.openVersion },
            v.versionTitle
          ),
          edit_icon
        ),
        React.createElement(
          'div',
          { className: 'versionDetails' },
          React.createElement(
            'a',
            { className: 'versionSource', target: '_blank', href: v.versionSource },
            Sefaria.util.parseURL(v.versionSource).host
          ),
          licenseLine ? React.createElement(
            'span',
            { className: 'separator' },
            '-'
          ) : null,
          licenseLine,
          this.props.showHistory ? React.createElement(
            'span',
            { className: 'separator' },
            '-'
          ) : null,
          this.props.showHistory ? React.createElement(
            'a',
            { className: 'versionHistoryLink', href: '/activity/' + Sefaria.normRef(this.props.currentRef) + '/' + v.language + '/' + (v.versionTitle && v.versionTitle.replace(/\s/g, "_")) },
            'Version History ›'
          ) : ""
        ),
        this.props.showNotes && !!v.versionNotes ? React.createElement('div', { className: 'versionNotes', dangerouslySetInnerHTML: { __html: v.versionNotes } }) : ""
      );
    }
  }
});

var ModeratorButtons = React.createClass({
  displayName: 'ModeratorButtons',

  propTypes: {
    title: React.PropTypes.string.isRequired
  },
  getInitialState: function getInitialState() {
    return {
      expanded: false,
      message: null
    };
  },
  expand: function expand() {
    this.setState({ expanded: true });
  },
  editIndex: function editIndex() {
    window.location = "/edit/textinfo/" + this.props.title;
  },
  addSection: function addSection() {
    window.location = "/add/" + this.props.title;
  },
  deleteIndex: function deleteIndex() {
    var title = this.props.title;

    var confirm = prompt("Are you sure you want to delete this text version? Doing so will completely delete this text from Sefaria, including all existing versions and links. This action CANNOT be undone. Type DELETE to confirm.", "");
    if (confirm !== "DELETE") {
      alert("Delete canceled.");
      return;
    }

    var url = "/api/index/" + title;
    $.ajax({
      url: url,
      type: "DELETE",
      success: function success(data) {
        if ("error" in data) {
          alert(data.error);
        } else {
          alert("Text Deleted.");
          window.location = "/";
        }
      }
    }).fail(function () {
      alert("Something went wrong. Sorry!");
    });
    this.setState({ message: "Deleting text (this may time a while)..." });
  },
  render: function render() {
    if (!this.state.expanded) {
      return React.createElement(
        'div',
        { className: 'moderatorSectionExpand', onClick: this.expand },
        React.createElement('i', { className: 'fa fa-cog' })
      );
    }
    var editTextInfo = React.createElement(
      'div',
      { className: 'button white', onClick: this.editIndex },
      React.createElement(
        'span',
        null,
        React.createElement('i', { className: 'fa fa-info-circle' }),
        ' Edit Text Info'
      )
    );
    var addSection = React.createElement(
      'div',
      { className: 'button white', onClick: this.addSection },
      React.createElement(
        'span',
        null,
        React.createElement('i', { className: 'fa fa-plus-circle' }),
        ' Add Section'
      )
    );
    var deleteText = React.createElement(
      'div',
      { className: 'button white', onClick: this.deleteIndex },
      React.createElement(
        'span',
        null,
        React.createElement('i', { className: 'fa fa-exclamation-triangle' }),
        ' Delete ',
        this.props.title
      )
    );
    var textButtons = React.createElement(
      'span',
      { className: 'moderatorTextButtons' },
      Sefaria.is_moderator ? editTextInfo : null,
      Sefaria.is_moderator || Sefaria.is_editor ? addSection : null,
      Sefaria.is_moderator ? deleteText : null
    );
    var message = this.state.message ? React.createElement(
      'div',
      { className: 'moderatorSectionMessage' },
      this.state.message
    ) : null;
    return React.createElement(
      'div',
      { className: 'moderatorSection' },
      textButtons,
      message
    );
  }
});

var CategoryAttribution = React.createClass({
  displayName: 'CategoryAttribution',

  propTypes: {
    categories: React.PropTypes.array.isRequired
  },
  render: function render() {
    var attribution = Sefaria.categoryAttribution(this.props.categories);
    return attribution ? React.createElement(
      'div',
      { className: 'categoryAttribution' },
      React.createElement(
        'a',
        { href: attribution.link, className: 'outOfAppLink' },
        React.createElement(
          'span',
          { className: 'en' },
          attribution.english
        ),
        React.createElement(
          'span',
          { className: 'he' },
          attribution.hebrew
        )
      )
    ) : null;
  }
});

var ReadMoreText = React.createClass({
  displayName: 'ReadMoreText',

  propTypes: {
    text: React.PropTypes.string.isRequired,
    initialWords: React.PropTypes.number
  },
  getDefaultProps: function getDefaultProps() {
    return {
      initialWords: 30
    };
  },
  getInitialState: function getInitialState() {
    return { expanded: this.props.text.split(" ").length < this.props.initialWords };
  },
  render: function render() {
    var _this5 = this;

    var text = this.state.expanded ? this.props.text : this.props.text.split(" ").slice(0, this.props.initialWords).join(" ") + "...";
    return React.createElement(
      'div',
      { className: 'readMoreText' },
      text,
      this.state.expanded ? null : React.createElement(
        'span',
        { className: 'readMoreLink', onClick: function onClick() {
            return _this5.setState({ expanded: true });
          } },
        React.createElement(
          'span',
          { className: 'int-en' },
          'Read More ›'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'קרא עוד ›'
        )
      )
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
    } else if (this.props.tag == "sefaria-groups") {
      var content = React.createElement(GroupPage, {
        hideNavHeader: this.props.hideNavHeader,
        multiPanel: this.props.multiPanel,
        group: this.props.group,
        width: this.state.width });
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
        React.createElement('div', { className: 'readerOptions' }),
        React.createElement(
          'h2',
          null,
          React.createElement(
            'span',
            { className: 'int-en' },
            enTitle
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
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
          { className: 'int-en' },
          en
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          he
        )
      )
    );
  },
  render: function render() {
    var _this6 = this;

    var trendingTags = this.getTrendingTagsFromCache();
    var topSheets = this.getTopSheetsFromCache();
    if (this.props.tagSort == "trending") {
      var tagList = this.getTrendingTagsFromCache();
    } else {
      var tagList = this.getTagListFromCache();
    }

    var makeTagButton = function makeTagButton(tag) {
      return React.createElement(SheetTagButton, { setSheetTag: _this6.props.setSheetTag, tag: tag.tag, count: tag.count, key: tag.tag });
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
        { className: 'int-en' },
        'My Source Sheets ',
        React.createElement('i', { className: 'fa fa-chevron-right' })
      ),
      React.createElement(
        'span',
        { className: 'int-he' },
        'דפי המקורות שלי ',
        React.createElement('i', { className: 'fa fa-chevron-left' })
      )
    ) : null;

    return React.createElement(
      'div',
      { className: 'content hasFooter' },
      React.createElement(
        'div',
        { className: 'contentInner' },
        this.props.hideNavHeader ? React.createElement(
          'h1',
          null,
          React.createElement(
            'span',
            { className: 'int-en' },
            'Source Sheets'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'דפי מקורות'
          )
        ) : null,
        this.props.multiPanel ? null : yourSheetsButton,
        this.props.multiPanel ? React.createElement(
          'h2',
          { className: 'splitHeader' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Public Sheets'
          ),
          React.createElement(
            'span',
            { className: 'int-en actionText', onClick: this.showAllSheets },
            'See All ',
            React.createElement('i', { className: 'fa fa-angle-right' })
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'דפי מקורות פומביים'
          ),
          React.createElement(
            'span',
            { className: 'int-he actionText', onClick: this.showAllSheets },
            'צפה בהכל ',
            React.createElement('i', { className: 'fa fa-angle-left' })
          )
        ) : React.createElement(
          'h2',
          null,
          React.createElement(
            'span',
            { className: 'int-en' },
            'Public Sheets'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'דפי מקורות פומביים'
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
            { className: 'int-en' },
            'Trending Tags'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'תוויות פופולריות'
          )
        ),
        this.props.multiPanel ? null : React.createElement(TwoOrThreeBox, { content: trendingTags, width: this.props.width }),
        this.props.multiPanel ? React.createElement(
          'h2',
          { className: 'tagsHeader' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'All Tags'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'כל התוויות'
          ),
          React.createElement(
            'div',
            { className: 'actionText' },
            React.createElement(
              'div',
              { className: 'type-buttons' },
              this._type_sheet_button("Most Used", "הכי בשימוש", function () {
                return _this6.changeSort("count");
              }, this.props.tagSort == "count"),
              this._type_sheet_button("Alphabetical", "אלפביתי", function () {
                return _this6.changeSort("alpha");
              }, this.props.tagSort == "alpha"),
              this._type_sheet_button("Trending", "פופולרי", function () {
                return _this6.changeSort("trending");
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
          ),
          React.createElement(
            'span',
            { className: 'he' },
            'כל התוויות'
          )
        ),
        React.createElement(TwoOrThreeBox, { content: tagList, width: this.props.width })
      ),
      React.createElement(
        'footer',
        { id: 'footer', className: 'static sans' },
        React.createElement(Footer, null)
      )
    );
  }
});

var GroupPage = React.createClass({
  displayName: 'GroupPage',

  propTypes: {
    group: React.PropTypes.string.isRequired,
    width: React.PropTypes.number
  },
  getInitialState: function getInitialState() {
    return {
      showTags: false,
      sheetFilterTag: null,
      sheetSort: "date",
      tab: "sheets"
    };
  },
  componentDidMount: function componentDidMount() {
    this.ensureData();
  },
  onDataLoad: function onDataLoad(data) {
    this.forceUpdate();
  },
  ensureData: function ensureData() {
    if (!Sefaria.groups(this.props.group)) {
      Sefaria.groups(this.props.group, this.onDataLoad);
    }
  },
  getData: function getData() {
    return Sefaria.groups(this.props.group, this.state.sheetSort);
  },
  setTab: function setTab(tab) {
    this.setState({ tab: tab });
  },
  toggleSheetTags: function toggleSheetTags() {
    this.state.showTags ? this.setState({ showTags: false }) : this.setState({ showTags: true });
  },
  setSheetTag: function setSheetTag(tag) {
    this.setState({ sheetFilterTag: tag, showTags: false });
  },
  handleTagButtonClick: function handleTagButtonClick(tag) {
    if (tag == this.state.sheetFilterTag) {
      this.setState({ sheetFilterTag: null, showTags: false });
    } else {
      this.setSheetTag(tag);
    }
  },
  changeSheetSort: function changeSheetSort(event) {
    this.setState({ sheetSort: event.target.value });
  },
  memberList: function memberList() {
    var group = this.getData();
    if (!group) {
      return null;
    }
    var admins = group.admins.map(function (member) {
      member.role = "Admin";return member;
    });
    var publishers = group.publishers.map(function (member) {
      member.role = "Publisher";return member;
    });
    var members = group.members.map(function (member) {
      member.role = "Member";return member;
    });
    var invitations = group.invitations.map(function (member) {
      member.role = "Invitation";return member;
    });

    return admins.concat(publishers, members, invitations);
  },
  pinSheet: function pinSheet(sheetId) {
    if (this.pinning) {
      return;
    }
    $.post("/api/groups/" + this.props.group + "/pin-sheet/" + sheetId, function (data) {
      if ("error" in data) {
        alert(data.error);
      } else {
        Sefaria._groups[this.props.group] = data.group;
        this.onDataLoad();
      }
      this.pinning = false;
    }.bind(this)).fail(function () {
      alert("There was an error pinning your sheet.");
      this.pinning = false;
    }.bind(this));
    this.pinning = true;
  },
  render: function render() {
    var group = this.getData();
    var sheets = group ? group.sheets : null;
    var groupTagList = group ? group.tags : null;
    var members = this.memberList();
    var isMember = members && members.filter(function (x) {
      return x.uid == Sefaria._uid;
    }).length !== 0;
    var isAdmin = group && group.admins.filter(function (x) {
      return x.uid == Sefaria._uid;
    }).length !== 0;

    groupTagList = groupTagList ? groupTagList.map(function (tag) {
      var filterThisTag = this.handleTagButtonClick.bind(this, tag.tag);
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

    sheets = sheets && this.state.sheetFilterTag ? sheets.filter(function (sheet) {
      return Sefaria.util.inArray(this.state.sheetFilterTag, sheet.tags) >= 0;
    }.bind(this)) : sheets;
    sheets = sheets ? sheets.map(function (sheet) {
      return React.createElement(GroupSheetListing, {
        sheet: sheet,
        pinned: group.pinnedSheets.indexOf(sheet.id) != -1,
        isAdmin: isAdmin,
        multiPanel: this.props.multiPanel,
        pinSheet: this.pinSheet.bind(null, sheet.id),
        setSheetTag: this.setSheetTag,
        key: sheet.id });
    }.bind(this)) : [React.createElement(LoadingMessage, null)];

    return React.createElement(
      'div',
      { className: 'content groupPage sheetList hasFooter' },
      React.createElement(
        'div',
        { className: 'contentInner' },
        group.imageUrl ? React.createElement('img', { className: 'groupImage', src: group.imageUrl, alt: this.props.group }) : null,
        React.createElement(
          'div',
          { className: 'groupInfo' },
          React.createElement(
            'h1',
            null,
            React.createElement(
              'span',
              { className: 'int-en' },
              this.props.group
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              this.props.group
            )
          ),
          group.websiteUrl ? React.createElement(
            'a',
            { className: 'groupWebsite', target: '_blank', href: group.websiteUrl },
            group.websiteUrl
          ) : null,
          group.description ? React.createElement(
            'div',
            { className: 'groupDescription' },
            group.description
          ) : null
        ),
        React.createElement(
          'div',
          { className: 'tabs' },
          React.createElement(
            'a',
            { className: classNames({ bubbleTab: 1, active: this.state.tab == "sheets" }), onClick: this.setTab.bind(null, "sheets") },
            React.createElement(
              'span',
              { className: 'int-en' },
              'Sheets'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'Sheets'
            )
          ),
          React.createElement(
            'a',
            { className: classNames({ bubbleTab: 1, active: this.state.tab == "members" }), onClick: this.setTab.bind(null, "members") },
            React.createElement(
              'span',
              { className: 'int-en' },
              'Members'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'Members'
            )
          ),
          isAdmin ? React.createElement(
            'a',
            { className: 'bubbleTab', href: "/groups/" + this.props.group.replace(/\s/g, "-") + "/settings" },
            React.createElement(
              'span',
              { className: 'int-en' },
              'Settings'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'Settings'
            )
          ) : null
        ),
        this.state.tab == "sheets" ? React.createElement(
          'div',
          null,
          sheets.length ? React.createElement(
            'h2',
            { className: 'splitHeader' },
            groupTagList && groupTagList.length ? React.createElement(
              'span',
              { className: 'filterByTag', onClick: this.toggleSheetTags },
              React.createElement(
                'span',
                { className: 'int-en' },
                'Filter By Tag ',
                React.createElement('i', { className: 'fa fa-angle-down' })
              ),
              React.createElement(
                'span',
                { className: 'int-he' },
                'סנן לפי תווית',
                React.createElement('i', { className: 'fa fa-angle-down' })
              )
            ) : null,
            React.createElement(
              'span',
              { className: 'int-en actionText' },
              'Sort By:',
              React.createElement(
                'select',
                { value: this.state.sheetSort, onChange: this.changeSheetSort },
                React.createElement(
                  'option',
                  { value: 'date' },
                  'Recent'
                ),
                React.createElement(
                  'option',
                  { value: 'alphabetical' },
                  'Alphabetical'
                ),
                React.createElement(
                  'option',
                  { value: 'views' },
                  'Most Viewed'
                )
              ),
              ' ',
              React.createElement('i', { className: 'fa fa-angle-down' })
            ),
            React.createElement(
              'span',
              { className: 'int-he actionText' },
              'סנן לפי:',
              React.createElement(
                'select',
                { value: this.state.sheetSort, onChange: this.changeSheetSort },
                React.createElement(
                  'option',
                  { value: 'date' },
                  'הכי חדש'
                ),
                React.createElement(
                  'option',
                  { value: 'alphabetical' },
                  'Alphabetical'
                ),
                React.createElement(
                  'option',
                  { value: 'views' },
                  'הכי נצפה'
                )
              ),
              ' ',
              React.createElement('i', { className: 'fa fa-angle-down' })
            )
          ) : null,
          this.state.showTags ? React.createElement(TwoOrThreeBox, { content: groupTagList, width: this.props.width }) : null,
          sheets.length ? sheets : isMember ? React.createElement(
            'div',
            { className: 'emptyMessage' },
            React.createElement(
              'span',
              { className: 'int-en' },
              'There are no sheets in this group yet. ',
              React.createElement(
                'a',
                { href: '/sheets/new' },
                'Start a sheet'
              ),
              '.'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'There are no sheets in this group yet. ',
              React.createElement(
                'a',
                { href: '/sheets/new' },
                'Start a sheet'
              ),
              '.'
            )
          ) : React.createElement(
            'div',
            { className: 'emptyMessage' },
            React.createElement(
              'span',
              { className: 'int-en' },
              'There are no public sheets in this group yet.'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'There are no public sheets in this group yet.'
            )
          )
        ) : null,
        this.state.tab == "members" ? React.createElement(
          'div',
          null,
          isAdmin ? React.createElement(GroupInvitationBox, { groupName: this.props.group, onDataChange: this.onDataLoad }) : null,
          members.map(function (member) {
            return React.createElement(GroupMemberListing, {
              member: member,
              isAdmin: isAdmin,
              isSelf: member.uid == Sefaria._uid,
              groupName: this.props.group,
              onDataChange: this.onDataLoad,
              key: member.uid });
          }.bind(this))
        ) : null
      ),
      React.createElement(
        'footer',
        { id: 'footer', className: 'static sans' },
        React.createElement(Footer, null)
      )
    );
  }
});

var GroupSheetListing = React.createClass({
  displayName: 'GroupSheetListing',

  propTypes: {
    sheet: React.PropTypes.object.isRequired,
    setSheetTag: React.PropTypes.func.isRequired,
    pinSheet: React.PropTypes.func,
    pinned: React.PropTypes.bool,
    isAdmin: React.PropTypes.bool
  },
  render: function render() {
    var sheet = this.props.sheet;
    var title = sheet.title ? sheet.title.stripHtml() : "Untitled Source Sheet";
    var url = "/sheets/" + sheet.id;

    if (sheet.tags === undefined) {
      sheet.tags = [];
    }
    var tagString = sheet.tags.map(function (tag) {
      return React.createElement(SheetTagLink, { setSheetTag: this.props.setSheetTag, tag: tag, key: tag });
    }, this);

    var pinButtonClasses = classNames({ groupSheetListingPinButton: 1, pinned: this.props.pinned, active: this.props.isAdmin });
    var pinMessage = this.props.pinned && this.props.isAdmin ? "Pinned Sheet - click to unpin" : this.props.pinned ? "Pinned Sheet" : "Pin Sheet";
    var pinButton = React.createElement(
      'div',
      { className: pinButtonClasses, onClick: this.props.isAdmin ? this.props.pinSheet : null },
      React.createElement('img', { src: '/static/img/pin.svg', title: pinMessage })
    );

    return React.createElement(
      'div',
      { className: 'sheet userSheet' },
      pinButton,
      React.createElement(
        'a',
        { className: 'sheetTitle', href: url, key: url },
        title
      ),
      ' ',
      React.createElement(SheetAccessIcon, { sheet: sheet }),
      React.createElement(
        'div',
        null,
        sheet.ownerName,
        ' · ',
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
  }
});

var GroupInvitationBox = React.createClass({
  displayName: 'GroupInvitationBox',

  propTypes: {
    groupName: React.PropTypes.string.isRequired,
    onDataChange: React.PropTypes.func.isRequired
  },
  getInitialState: function getInitialState() {
    return {
      inviting: false,
      message: null
    };
  },
  onInviteClick: function onInviteClick() {
    if (!this.state.inviting) {
      this.inviteByEmail($("#groupInvitationInput").val());
    }
  },
  flashMessage: function flashMessage(message) {
    this.setState({ message: message });
    setTimeout(function () {
      this.setState({ message: null });
    }.bind(this), 3000);
  },
  inviteByEmail: function inviteByEmail(email) {
    if (!this.validateEmail(email)) {
      this.flashMessage("That isn't a valid email address.");
      return;
    }
    this.setState({ inviting: true, message: "Inviting..." });
    $.post("/api/groups/" + this.props.groupName + "/invite/" + email, function (data) {
      if ("error" in data) {
        alert(data.error);
        this.setState({ message: null, inviting: false });
      } else {
        Sefaria._groups[this.props.groupName] = data.group;
        $("#groupInvitationInput").val("");
        this.flashMessage(data.message);
        this.setState({ inviting: false });
        this.props.onDataChange();
      }
    }.bind(this)).fail(function () {
      alert("There was an error sending your invitation.");
      this.setState({ message: null, inviting: false });
    }.bind(this));
  },
  validateEmail: function validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
  },
  render: function render() {
    return React.createElement(
      'div',
      { className: 'groupInvitationBox' },
      React.createElement('input', { id: 'groupInvitationInput', placeholder: 'Email Address' }),
      React.createElement(
        'div',
        { className: 'button', onClick: this.onInviteClick },
        React.createElement(
          'span',
          { className: 'int-en' },
          'Invite'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'Invite'
        )
      ),
      this.state.message ? React.createElement(
        'div',
        { className: 'groupInvitationBoxMessage' },
        this.state.message
      ) : null
    );
  }
});

var GroupMemberListing = React.createClass({
  displayName: 'GroupMemberListing',

  propTypes: {
    member: React.PropTypes.object.isRequired,
    isAdmin: React.PropTypes.bool,
    isSelf: React.PropTypes.bool,
    groupName: React.PropTypes.string,
    onDataChange: React.PropTypes.func
  },
  render: function render() {
    if (this.props.member.role == "Invitation") {
      return this.props.isAdmin ? React.createElement(GroupInvitationListing, {
        member: this.props.member,
        groupName: this.props.groupName,
        onDataChange: this.props.onDataChange }) : null;
    }

    return React.createElement(
      'div',
      { className: 'groupMemberListing' },
      React.createElement(
        'a',
        { href: this.props.member.profileUrl },
        React.createElement('img', { className: 'groupMemberListingProfileImage', src: this.props.member.imageUrl, alt: '' })
      ),
      React.createElement(
        'a',
        { href: this.props.member.profileUrl, className: 'groupMemberListingName' },
        this.props.member.name
      ),
      React.createElement(
        'div',
        { className: 'groupMemberListingRoleBox' },
        React.createElement(
          'span',
          { className: 'groupMemberListingRole' },
          this.props.member.role
        ),
        this.props.isAdmin || this.props.isSelf ? React.createElement(GroupMemberListingActions, {
          member: this.props.member,
          groupName: this.props.groupName,
          isAdmin: this.props.isAdmin,
          isSelf: this.props.isSelf,
          onDataChange: this.props.onDataChange }) : null
      )
    );
  }
});

var GroupInvitationListing = React.createClass({
  displayName: 'GroupInvitationListing',

  propTypes: {
    member: React.PropTypes.object.isRequired,
    groupName: React.PropTypes.string,
    onDataChange: React.PropTypes.func
  },
  render: function render() {
    return React.createElement(
      'div',
      { className: 'groupMemberListing' },
      React.createElement(
        'span',
        { className: 'groupInvitationListing' },
        this.props.member.email
      ),
      React.createElement(
        'div',
        { className: 'groupMemberListingRoleBox' },
        React.createElement(
          'span',
          { className: 'groupMemberListingRole' },
          'Invited'
        ),
        React.createElement(GroupMemberListingActions, {
          member: this.props.member,
          groupName: this.props.groupName,
          isInvitation: true,
          onDataChange: this.props.onDataChange })
      )
    );
  }
});

var GroupMemberListingActions = React.createClass({
  displayName: 'GroupMemberListingActions',

  propTypes: {
    member: React.PropTypes.object.isRequired,
    groupName: React.PropTypes.string.isRequired,
    isAdmin: React.PropTypes.bool,
    isSelf: React.PropTypes.bool,
    isInvitation: React.PropTypes.bool,
    onDataChange: React.PropTypes.func.isRequired
  },
  getInitialState: function getInitialState() {
    return {
      menuOpen: false,
      invitationResent: false
    };
  },
  toggleMenu: function toggleMenu() {
    this.setState({ menuOpen: !this.state.menuOpen });
  },
  setRole: function setRole(role) {
    if (this.props.isSelf && this.props.isAdmin && role !== "admin") {
      if (!confirm("Are you want to change your group role? You won't be able to undo this action unless another admin restores your permissions.")) {
        return;
      }
    }

    $.post("/api/groups/" + this.props.groupName + "/set-role/" + this.props.member.uid + "/" + role, function (data) {
      if ("error" in data) {
        alert(data.error);
      } else {
        Sefaria._groups[data.name] = data;
        this.props.onDataChange();
      }
    }.bind(this));
  },
  removeMember: function removeMember() {
    var message = this.props.isSelf ? "Are you sure you want to leave this group?" : "Are you sure you want to remove " + this.props.member.name + " from this group?";

    if (confirm(message)) {
      this.setRole("remove");
    }
  },
  resendInvitation: function resendInvitation() {
    $.post("/api/groups/" + this.props.groupName + "/invite/" + this.props.member.email, function (data) {
      if ("error" in data) {
        alert(data.error);
      } else {
        Sefaria._groups[this.props.groupName] = data.group;
        this.props.onDataChange();
        this.setState({ "invitationResent": true });
      }
    }.bind(this));
  },
  removeInvitation: function removeInvitation() {
    if (confirm("Are you sure you want to remove this invitation?")) {
      $.post("/api/groups/" + this.props.groupName + "/invite/" + this.props.member.email + "/uninvite", function (data) {
        if ("error" in data) {
          alert(data.error);
        } else {
          Sefaria._groups[this.props.groupName] = data.group;
          this.props.onDataChange();
        }
      }.bind(this));
    }
  },
  render: function render() {
    return React.createElement(
      'div',
      { className: 'groupMemberListingActions', onClick: this.toggleMenu },
      React.createElement(
        'div',
        { className: 'groupMemberListingActionsButton' },
        React.createElement('i', { className: 'fa fa-gear' })
      ),
      this.state.menuOpen ? React.createElement(
        'div',
        { className: 'groupMemberListingActionsMenu' },
        this.props.isAdmin ? React.createElement(
          'div',
          { className: 'action', onClick: this.setRole.bind(this, "admin") },
          React.createElement(
            'span',
            { className: classNames({ role: 1, current: this.props.member.role == "Admin" }) },
            'Admin'
          ),
          '- can invite & edit settings'
        ) : null,
        this.props.isAdmin ? React.createElement(
          'div',
          { className: 'action', onClick: this.setRole.bind(this, "publisher") },
          React.createElement(
            'span',
            { className: classNames({ role: 1, current: this.props.member.role == "Publisher" }) },
            'Publisher'
          ),
          '- can publish'
        ) : null,
        this.props.isAdmin ? React.createElement(
          'div',
          { className: 'action', onClick: this.setRole.bind(this, "member") },
          React.createElement(
            'span',
            { className: classNames({ role: 1, current: this.props.member.role == "Member" }) },
            'Member'
          ),
          '- can view & share within group'
        ) : null,
        this.props.isAdmin || this.props.isSelf ? React.createElement(
          'div',
          { className: 'action', onClick: this.removeMember },
          React.createElement(
            'span',
            { className: 'role' },
            this.props.isSelf ? "Leave Group" : "Remove"
          )
        ) : null,
        this.props.isInvitation && !this.state.invitationResent ? React.createElement(
          'div',
          { className: 'action', onClick: this.resendInvitation },
          React.createElement(
            'span',
            { className: 'role' },
            'Resend Invitation'
          )
        ) : null,
        this.props.isInvitation && this.state.invitationResent ? React.createElement(
          'div',
          { className: 'action' },
          React.createElement(
            'span',
            { className: 'role' },
            'Invitation Resent'
          )
        ) : null,
        this.props.isInvitation ? React.createElement(
          'div',
          { className: 'action', onClick: this.removeInvitation },
          React.createElement(
            'span',
            { className: 'role' },
            'Remove'
          )
        ) : null
      ) : null
    );
  }
});

var EditGroupPage = React.createClass({
  displayName: 'EditGroupPage',

  propTypes: {
    initialData: React.PropTypes.object // If present this view is for editing a group, otherwise for creating a new group
  },
  getInitialState: function getInitialState() {
    return this.props.initialData || {
      name: null,
      description: null,
      websiteUrl: null,
      imageUrl: null,
      headerUrl: null
    };
  },
  componentDidMount: function componentDidMount() {
    $(window).on("beforeunload", function () {
      if (this.changed) {
        return "You have unsaved changes to your group.";
      }
    }.bind(this));
  },
  handleImageChange: function handleImageChange(e) {
    var MAX_IMAGE_MB = 2;
    var MAX_IMAGE_SIZE = MAX_IMAGE_MB * 1024 * 1024;
    var idToField = {
      groupHeader: "headerUrl",
      groupImage: "imageUrl"
    };
    var field = idToField[e.target.id];
    var file = e.currentTarget.files[0];
    if (file.size > MAX_IMAGE_SIZE) {
      alert("Images must be smaller than " + MAX_IMAGE_MB + "MB.");
      return;
    }
    var formData = new FormData();
    formData.append("file", e.currentTarget.files[0]);
    $.ajax({
      url: '/api/file/upload',
      data: formData,
      type: 'POST',
      contentType: false,
      processData: false,
      success: function (data) {
        if ("error" in data) {
          alert(data.error);
          this.clearUploading(field);
        } else {
          var state = {};
          state[field] = data.url;
          this.setState(state);
          this.changed = true;
        }
      }.bind(this),
      fail: function fail() {
        alert("Unfortunately an error occurred uploading your file.");
        this.clearUploading(field);
      }
    });
    this.setUploading(field);
  },
  setUploading: function setUploading(field) {
    var state = {};
    state[field] = "/static/img/loading.gif";
    this.setState(state);
  },
  clearUploading: function clearUploading(field) {
    var state = {};
    state[field] = null;
    this.setState(state);
  },
  handleInputChange: function handleInputChange(e) {
    var idToField = {
      groupName: "name",
      groupWebsite: "websiteUrl",
      groupDescription: "description"
    };
    var field = idToField[e.target.id];
    var state = {};
    state[field] = e.target.value;
    this.setState(state);
    this.changed = true;
  },
  delete: function _delete() {
    if (confirm("Are you sure you want to delete this group? This cannot be undone.")) {
      $.ajax({
        url: "/api/groups/" + this.props.initialData.name,
        type: "DELETE",
        success: function success(data) {
          if ("error" in data) {
            alert(data.error);
          } else {
            window.location = "/my/groups";
          }
        },
        fail: function fail() {
          alert("Sorry, an error occurred.");
        }
      });
    }
  },
  save: function save() {
    var groupData = Sefaria.util.clone(this.state);
    if (!this.props.initialData) {
      groupData["new"] = true;
    }
    if (this.props.initialData && this.props.initialData.name !== groupData.name) {
      groupData["previousName"] = this.props.initialData.name;
    }
    if (groupData["headerUrl"] == "/static/img/loading.gif") {
      groupData["headerUrl"] = null;
    }
    if (groupData["imageUrl"] == "/static/img/loading.gif") {
      groupData["imageUrl"] = null;
    }

    $.post("/api/groups", { json: JSON.stringify(groupData) }, function (data) {
      if ("error" in data) {
        alert(data.error);
      } else {
        this.changed = false;
        window.location = "/groups/" + this.state.name.replace(/ /g, "-");
      }
    }.bind(this)).fail(function () {
      alert("Sorry, an error occurred.");
    });
  },
  render: function render() {
    return React.createElement(
      'div',
      { id: 'editGroupPage' },
      this.props.initialData ? React.createElement(
        'h1',
        null,
        React.createElement(
          'span',
          { className: 'int-en' },
          'Edit Group'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'Edit Group'
        )
      ) : React.createElement(
        'h1',
        null,
        React.createElement(
          'span',
          { className: 'int-en' },
          'Create a Group'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'Create a Group'
        )
      ),
      React.createElement(
        'div',
        { id: 'saveCancelButtons' },
        React.createElement(
          'a',
          { className: 'button transparent control-elem', href: this.props.initialData ? "/groups/" + this.state.name.replace(/ /g, "-") : "/my/groups" },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Cancel'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'בטל'
          )
        ),
        React.createElement(
          'div',
          { id: 'saveGroup', className: 'button blue control-elem', onClick: this.save },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Save'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'שמור'
          )
        )
      ),
      React.createElement(
        'div',
        { className: 'field halfWidth' },
        React.createElement(
          'label',
          null,
          React.createElement(
            'span',
            { className: 'int-en' },
            'Group Name'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'Group Name'
          )
        ),
        React.createElement('input', { id: 'groupName', value: this.state.name || "", onChange: this.handleInputChange })
      ),
      React.createElement(
        'div',
        { className: 'field halfWidth' },
        React.createElement(
          'label',
          null,
          React.createElement(
            'span',
            { className: 'int-en' },
            'Website'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'Website'
          )
        ),
        React.createElement('input', { id: 'groupWebsite', value: this.state.websiteUrl || "", onChange: this.handleInputChange })
      ),
      React.createElement(
        'div',
        { className: 'field' },
        React.createElement(
          'label',
          null,
          React.createElement(
            'span',
            { className: 'int-en' },
            'Description'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'Description'
          )
        ),
        React.createElement('textarea', { id: 'groupDescription', onChange: this.handleInputChange, value: this.state.description || null })
      ),
      React.createElement(
        'div',
        { className: 'field' },
        React.createElement(
          'label',
          null,
          React.createElement(
            'span',
            { className: 'int-en' },
            'Group Image'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'Group Image'
          )
        ),
        this.state.imageUrl ? React.createElement('img', { className: 'groupImage', src: this.state.imageUrl, alt: 'Group Image' }) : React.createElement('div', { className: 'groupImage placeholder' }),
        React.createElement(FileInput, {
          name: 'groupImage',
          accept: 'image/*',
          text: 'Upload Image',
          className: 'button white',
          onChange: this.handleImageChange }),
        React.createElement(
          'div',
          { className: 'helperText' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Recommended size: 350px x 350px or larger'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'Recommended size: 350px x 350px or larger'
          )
        )
      ),
      React.createElement(
        'div',
        { className: 'field' },
        React.createElement(
          'label',
          null,
          React.createElement(
            'span',
            { className: 'int-en' },
            'Default Sheet Header'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'Default Sheet Header'
          )
        ),
        this.state.headerUrl ? React.createElement(
          'div',
          { className: 'groupHeaderBox' },
          React.createElement('img', { className: 'groupHeader', src: this.state.headerUrl, alt: 'Group Header Image' }),
          React.createElement('div', { className: 'clearFix' })
        ) : React.createElement('div', { className: 'groupHeader placeholder' }),
        React.createElement(FileInput, {
          name: 'groupHeader',
          accept: 'image/*',
          text: 'Upload Image',
          className: 'button white',
          onChange: this.handleImageChange }),
        React.createElement(
          'div',
          { className: 'helperText' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Recommended size: 1000px width to fill sheet, smaller images align right'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'Recommended size: 1000px width to fill sheet, smaller images align right'
          )
        )
      ),
      this.props.initialData ? React.createElement(
        'div',
        { className: 'deleteGroup', onClick: this.delete },
        React.createElement(
          'span',
          { className: 'int-en' },
          'Delete Group'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'Delete Group'
        )
      ) : null
    );
  }
});

var FileInput = React.createClass({
  displayName: 'FileInput',

  handleChange: function handleChange(e) {
    if (this.props.onChange) {
      this.props.onChange(e);
    }
  },
  render: function render() {
    return React.createElement(
      'div',
      null,
      React.createElement(
        'label',
        { htmlFor: this.props.name, className: this.props.className },
        this.props.text
      ),
      React.createElement('input', {
        type: 'file',
        id: this.props.name,
        name: this.props.name,
        className: 'hiddenFileInput',
        accept: this.props.accept,
        onChange: this.handleChange })
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
      return React.createElement(PublicSheetListing, { sheet: sheet, key: sheet.id });
    }) : React.createElement(LoadingMessage, null);
    return React.createElement(
      'div',
      { className: 'content sheetList hasFooter' },
      React.createElement(
        'div',
        { className: 'contentInner' },
        this.props.hideNavHeader ? React.createElement(
          'h1',
          null,
          React.createElement(
            'span',
            { className: 'int-en' },
            this.props.tag
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            this.props.tag
          )
        ) : null,
        sheets
      ),
      React.createElement(
        'footer',
        { id: 'footer', className: 'static sans' },
        React.createElement(Footer, null)
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
  getInitialState: function getInitialState() {
    return {
      page: 1,
      loadedToEnd: false,
      loading: false,
      curSheets: []
    };
  },
  componentDidMount: function componentDidMount() {
    $(ReactDOM.findDOMNode(this)).bind("scroll", this.handleScroll);
    this.ensureData();
  },
  handleScroll: function handleScroll() {
    if (this.state.loadedToEnd || this.state.loading) {
      return;
    }
    var $scrollable = $(ReactDOM.findDOMNode(this));
    var margin = 100;
    if ($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this.getMoreSheets();
    }
  },
  getMoreSheets: function getMoreSheets() {
    if (this.state.page == 1) {
      Sefaria.sheets.publicSheets(0, 100, this.loadMoreSheets);
    } else {
      Sefaria.sheets.publicSheets(this.state.page * 50, 50, this.loadMoreSheets);
    }
    this.setState({ loading: true });
  },
  loadMoreSheets: function loadMoreSheets(data) {
    this.setState({ page: this.state.page + 1 });
    this.createSheetList(data);
  },
  createSheetList: function createSheetList(newSheets) {

    if (newSheets) {
      this.setState({ curSheets: this.state.curSheets.concat(newSheets), loading: false });
    }
  },
  getSheetsFromCache: function getSheetsFromCache(offset) {
    if (!offset) offset = 0;
    return Sefaria.sheets.publicSheets(offset, 50);
  },
  getSheetsFromAPI: function getSheetsFromAPI(offset) {
    if (!offset) offset = 0;
    Sefaria.sheets.publicSheets(offset, 50, this.onDataLoad);
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
    if (this.state.page == 1) {
      var sheets = this.getSheetsFromCache();
    } else {
      var sheets = this.state.curSheets;
    }
    sheets = sheets ? sheets.map(function (sheet) {
      return React.createElement(PublicSheetListing, { sheet: sheet });
    }) : React.createElement(LoadingMessage, null);
    return React.createElement(
      'div',
      { className: 'content sheetList hasFooter' },
      React.createElement(
        'div',
        { className: 'contentInner' },
        this.props.hideNavHeader ? React.createElement(
          'h1',
          null,
          React.createElement(
            'span',
            { className: 'int-en' },
            'All Sheets'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'כל דפי המקורות'
          )
        ) : null,
        sheets
      ),
      React.createElement(
        'footer',
        { id: 'footer', className: 'static sans' },
        React.createElement(Footer, null)
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
    var title = sheet.title ? sheet.title.stripHtml() : "Untitled Source Sheet";
    var url = "/sheets/" + sheet.id;
    return React.createElement(
      'a',
      { className: 'sheet', href: url, key: url },
      sheet.ownerImageUrl ? React.createElement('img', { className: 'sheetImg', src: sheet.ownerImageUrl, alt: sheet.ownerName }) : null,
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
      { href: '/sheets/tags/' + this.props.tag, className: 'navButton', onClick: this.handleTagClick },
      this.props.tag,
      ' (',
      React.createElement(
        'span',
        { className: 'enInHe' },
        this.props.count
      ),
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
      return React.createElement(PrivateSheetListing, { sheet: sheet, setSheetTag: this.props.setSheetTag, key: sheet.id });
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
            { className: 'int-en' },
            'My Source Sheets'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'דפי המקורות שלי'
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
              { className: 'int-en' },
              'Create a Source Sheet'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'צור דף מקורות חדש'
            )
          )
        ) : null,
        this.props.hideNavHeader ? React.createElement(
          'h2',
          { className: 'splitHeader' },
          React.createElement(
            'span',
            { className: 'int-en', onClick: this.toggleSheetTags },
            'Filter By Tag ',
            React.createElement('i', { className: 'fa fa-angle-down' })
          ),
          React.createElement(
            'span',
            { className: 'int-he', onClick: this.toggleSheetTags },
            'סנן לפי תווית',
            React.createElement('i', { className: 'fa fa-angle-down' })
          ),
          React.createElement(
            'span',
            { className: 'int-en actionText' },
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
          ),
          React.createElement(
            'span',
            { className: 'int-he actionText' },
            'סנן לפי:',
            React.createElement(
              'select',
              { value: this.props.mySheetSort, onChange: this.changeSortYourSheets },
              React.createElement(
                'option',
                { value: 'date' },
                'הכי חדש'
              ),
              React.createElement(
                'option',
                { value: 'views' },
                'הכי נצפה'
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
    setSheetTag: React.PropTypes.func.isRequired
  },
  render: function render() {
    var sheet = this.props.sheet;
    var title = sheet.title ? sheet.title.stripHtml() : "Untitled Source Sheet";
    var url = "/sheets/" + sheet.id;

    if (sheet.tags === undefined) sheet.tags = [];
    var tagString = sheet.tags.map(function (tag) {
      return React.createElement(SheetTagLink, { setSheetTag: this.props.setSheetTag, tag: tag, key: tag });
    }, this);

    return React.createElement(
      'div',
      { className: 'sheet userSheet', href: url, key: url },
      React.createElement(
        'a',
        { className: 'sheetTitle', href: url },
        title
      ),
      '  ',
      React.createElement(SheetAccessIcon, { sheet: sheet }),
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
  }
});

var SheetAccessIcon = React.createClass({
  displayName: 'SheetAccessIcon',

  propTypes: {
    sheet: React.PropTypes.object.isRequired
  },
  render: function render() {
    var sheet = this.props.sheet;
    var msg = "group" in sheet ? "Listed for Group members only" : "Private";
    return sheet.status == "unlisted" ? React.createElement('i', { className: 'fa fa-lock', title: msg }) : null;
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
      { href: '/sheets/tags/' + this.props.tag, onClick: this.handleTagClick },
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
    separated: React.PropTypes.bool,
    role: React.PropTypes.string,
    ariaLabel: React.PropTypes.string
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
      { className: classes, role: this.props.role, 'aria-label': this.props.ariaLabel },
      this.props.options.map(function (option) {
        return React.createElement(ToggleOption, {
          name: option.name,
          key: option.name,
          set: this.props.name,
          role: option.role,
          ariaLable: option.ariaLabel,
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
    var tabIndexValue = this.props.on ? 0 : -1;
    var ariaCheckedValue = this.props.on ? "true" : "false";
    classes[this.props.name] = 1;
    classes = classNames(classes);
    var content = this.props.image ? React.createElement('img', { src: this.props.image, alt: '' }) : this.props.fa ? React.createElement('i', { className: "fa fa-" + this.props.fa }) : React.createElement('span', { dangerouslySetInnerHTML: { __html: this.props.content } });
    return React.createElement(
      'div',
      {
        role: this.props.role,
        'aria-label': this.props.ariaLabel,
        tabIndex: this.props.role == "radio" ? tabIndexValue : "0",
        'aria-value': ariaCheckedValue,
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
    var icon = this.props.compare ? React.createElement('i', { className: 'fa fa-chevron-left' }) : React.createElement('i', { className: 'fa fa-bars' });
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
    if (this.props.icon == "arrow") {
      var icon_dir = this.props.interfaceLang == 'english' ? 'left' : 'right';
      var icon_class = "fa fa-caret-" + icon_dir;
      var icon = React.createElement('i', { className: icon_class });
    } else {
      var icon = "×";
    }
    /*var icon = this.props.icon === "arrow" ? (<i className="fa fa-caret-{icon_dir}"></i>) : "×";*/
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
      { className: 'readerOptions', role: 'button', 'aria-haspopup': 'true', tabIndex: '0', onClick: this.props.onClick, onKeyPress: function (e) {
          e.charCode == 13 ? this.props.onClick(e) : null;
        }.bind(this) },
      React.createElement('img', { src: '/static/img/ayealeph.svg', alt: 'Toggle Reader Menu Display Settings' })
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
    interfaceLang: React.PropTypes.string,
    showBaseText: React.PropTypes.func,
    updateTextColumn: React.PropTypes.func,
    onSegmentClick: React.PropTypes.func,
    onCitationClick: React.PropTypes.func,
    setTextListHighlight: React.PropTypes.func,
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
    this.setPaddingForScrollbar();
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
    //console.log("scroll");
    if (this.justScrolled) {
      this.justScrolled = false;
      return;
    }
    if (this.props.highlightedRefs.length) {
      //console.log("Calling debouncedAdjustTextListHighlight");
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

      this.props.setTextListHighlight(refs);
    }
    this.props.setSelectedWords(selection.toString());
  },
  handleTextLoad: function handleTextLoad() {
    if (this.loadingContentAtTop || !this.initialScrollTopSet) {
      // console.log("text load, setting scroll");
      this.setScrollPosition();
    } else if (!this.scrolledToHighlight && $(ReactDOM.findDOMNode(this)).find(".segment.highlight").length) {
      // console.log("scroll to highlighted")
      this.scrollToHighlighted();
      this.scrolledToHighlight = true;
      this.initialScrollTopSet = true;
    }

    // console.log("text load, ais");
    this.adjustInfiniteScroll();
  },
  setScrollPosition: function setScrollPosition() {
    // Called on every update, checking flags on `this` to see if scroll position needs to be set
    if (this.loadingContentAtTop) {
      var $node = $(ReactDOM.findDOMNode(this));
      // After adding content by infinite scrolling up, scroll back to what the user was just seeing

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
      }
    } else if (!this.scrolledToHighlight && $(ReactDOM.findDOMNode(this)).find(".segment.highlight").length) {
      // scroll to highlighted segment
      this.scrollToHighlighted();
      this.scrolledToHighlight = true;
      this.initialScrollTopSet = true;
      this.justScrolled = true;
    } else if (!this.initialScrollTopSet) {
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
    // console.log("adjust Infinite Scroll");
    if (!this.isMounted()) {
      return;
    }
    var node = ReactDOM.findDOMNode(this);
    var refs = this.props.srefs;
    var $lastText = $(node).find(".textRange.basetext").last();
    if (!$lastText.length) {
      return;
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
    } else if (windowTop < 21 && !this.loadingContentAtTop) {
      // UP: add the previous section above then adjust scroll position so page doesn't jump
      var topRef = refs[0];
      var data = Sefaria.ref(topRef);
      if (data && data.prev) {
        refs.splice(refs, 0, data.prev);
        this.loadingContentAtTop = true;
        this.props.updateTextColumn(refs);
        if (Sefaria.site) {
          Sefaria.site.track.event("Reader", "Infinite Scroll", "Up");
        }
      }
    } else if (lastBottom < windowHeight + 80) {
      // DOWN: add the next section to bottom
      if ($lastText.hasClass("loading")) {
        // console.log("last text is loading - don't add next section");
        return;
      }

      var currentRef = refs.slice(-1)[0];
      var data = Sefaria.ref(currentRef);
      if (data && data.next) {
        refs.push(data.next);
        this.props.updateTextColumn(refs);
        if (Sefaria.site) {
          Sefaria.site.track.event("Reader", "Infinite Scroll", "Down");
        }
      }
    } else {
      // nothing happens
    }
  },
  adjustTextListHighlight: function adjustTextListHighlight() {

    // When scrolling while the TextList is open, update which segment should be highlighted.
    if (this.props.multiPanel && this.props.layoutWidth == 100) {
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
          this.props.setTextListHighlight(ref);
          //var end = new Date();
          //elapsed = end - start;
          //console.log("Adjusted Text Highlight in: " + elapsed);
          return false;
        }
      }.bind(this));
    }.bind(this);

    adjustTextListHighlightInner();

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
      if (!this.isMounted()) {
        return;
      }

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
  setPaddingForScrollbar: function setPaddingForScrollbar() {
    // Scrollbars take up spacing, causing the centering of TextColumn to be slightly off center
    // compared to the header. This functions sets appropriate padding to compensate.
    var width = Sefaria.util.getScrollbarWidth();
    var $container = $(ReactDOM.findDOMNode(this));
    if (this.props.interfaceLang == "hebrew") {
      $container.css({ paddingRight: width, paddingLeft: 0 });
    } else {
      $container.css({ paddingRight: 0, paddingLeft: width });
    }
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
    showBaseText: React.PropTypes.func,
    panelsOpen: React.PropTypes.number,
    layoutWidth: React.PropTypes.number,
    showActionLinks: React.PropTypes.bool
  },
  componentDidMount: function componentDidMount() {
    var data = this.getText();
    if (data && !this.dataPrefetched) {
      // If data was populated server side, onTextLoad was never called
      this.onTextLoad(data);
    } else if (this.props.basetext || this.props.segmentNumber) {
      this.placeSegmentNumbers();
    }
    window.addEventListener('resize', this.handleResize);
  },
  componentWillUnmount: function componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize);
  },
  componentDidUpdate: function componentDidUpdate(prevProps, prevState) {
    // Place segment numbers again if update affected layout
    if (this.props.basetext || this.props.segmentNumber) {
      if (this.props.version != prevProps.version || this.props.versionLanguage != prevProps.versionLanguage || prevProps.settings.language !== this.props.settings.language || prevProps.settings.layoutDefault !== this.props.settings.layoutDefault || prevProps.settings.layoutTanakh !== this.props.settings.layoutTanakh || prevProps.settings.layoutTalmud !== this.props.settings.layoutTalmud || prevProps.settings.biLayout !== this.props.settings.biLayout || prevProps.settings.fontSize !== this.props.settings.fontSize || prevProps.layoutWidth !== this.props.layoutWidth) {
        // Rerender in case version has changed
        this.forceUpdate(function () {
          if (this.isMounted()) {
            this.placeSegmentNumbers();
          }
        }.bind(this));

        // TODO: are these animationFrames still needed?
        /*
        window.requestAnimationFrame(function() { 
          if (this.isMounted()) {
            this.placeSegmentNumbers();
          }
        }.bind(this));
        */
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
    if (!data || "updateFromAPI" in data) {
      // If we don't have data yet, call again with a callback to trigger API call
      Sefaria.text(this.props.sref, settings, this.onTextLoad);
    }
    return data;
  },
  onTextLoad: function onTextLoad(data) {
    //console.log("onTextLoad in TextRange", data.ref);
    // Initiate additional API calls when text data first loads
    if (this.props.basetext && this.props.sref !== data.ref) {
      // Replace ReaderPanel contents ref with the normalized form of the ref, if they differ.
      // Pass parameter to showBaseText to replaceHistory - normalization should't add a step to history
      this.props.showBaseText(data.ref, true, this.props.version, this.props.versionLanguage);
      return;
    }

    // If this is a ref to a super-section, rewrite it to first available section
    if (data.textDepth - data.sections.length > 1 && data.firstAvailableSectionRef) {
      this.props.showBaseText(data.firstAvailableSectionRef, true, this.props.version, this.props.versionLanguage);
      return;
    }

    this.prefetchData();

    if (this.props.onTextLoad) {
      this.props.onTextLoad();
    }

    if (this.isMounted()) {
      this.forceUpdate(function () {
        this.placeSegmentNumbers();
      }.bind(this));
    }
  },
  prefetchData: function prefetchData() {
    // Prefetch additional data (next, prev, links, notes etc) for this ref
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
      if (data.indexTitle) {
        // Preload data that is used on Text TOC page
        Sefaria.indexDetails(data.indexTitle, function () {});
      }
    }
    this.dataPrefetched = true;
  },
  placeSegmentNumbers: function placeSegmentNumbers() {
    //console.log("placeSegmentNumbers", this.props.sref);
    //debugger
    //console.trace();
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
      // Takes an array of jQuery elements that all currently appear at the same top position
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
  onFootnoteClick: function onFootnoteClick(event) {
    $(event.target).closest("sup").next("i.footnote").toggle();
    this.placeSegmentNumbers();
  },
  render: function render() {
    var data = this.getText();
    if (data && this.props.basetext) {
      var ref = this.props.withContext ? data.sectionRef : data.ref;
      var sectionStrings = Sefaria.sectionString(ref);
      var oref = Sefaria.ref(ref);
      var useShortString = oref && Sefaria.util.inArray(oref.primary_category, ["Tanakh", "Mishnah", "Talmud", "Tanaitic", "Commentary"]) !== -1;
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

    var segments = Sefaria.makeSegments(data, this.props.withContext);
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
        onFootnoteClick: this.onFootnoteClick,
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
        React.createElement('img', { src: '/static/img/open-64.png', alt: '' }),
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
        React.createElement('img', { src: '/static/img/compare-64.png', alt: '' }),
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
    onSegmentClick: React.PropTypes.func,
    onFootnoteClick: React.PropTypes.func
  },
  handleClick: function handleClick(event) {
    if ($(event.target).hasClass("refLink")) {
      //Click of citation
      event.preventDefault(); //add prevent default
      var ref = Sefaria.humanRef($(event.target).attr("data-ref"));
      this.props.onCitationClick(ref, this.props.sref);
      event.stopPropagation();
      Sefaria.site.track.event("Reader", "Citation Link Click", ref);
    } else if ($(event.target).is("sup") || $(event.target).parents("sup").size()) {
      this.props.onFootnoteClick(event);
      event.stopPropagation();
    } else if (this.props.onSegmentClick) {
      this.props.onSegmentClick(this.props.sref);
      Sefaria.site.track.event("Reader", "Text Segment Click", this.props.sref);
    }
  },
  render: function render() {
    var linkCountElement;
    if (this.props.showLinkCount) {
      var linkCount = Sefaria.linkCount(this.props.sref, this.props.filter);
      var minOpacity = 20,
          maxOpacity = 70;
      var linkScore = linkCount ? Math.min(linkCount + minOpacity, maxOpacity) / 100.0 : 0;
      var style = { opacity: linkScore };
      linkCountElement = this.props.showLinkCount ? React.createElement(
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
      linkCountElement = "";
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
    if (!this.props.en && !this.props.he) {
      return false;
    }
    return React.createElement(
      'span',
      { className: classes, onClick: this.handleClick, 'data-ref': this.props.sref },
      segmentNumber,
      linkCountElement,
      React.createElement('span', { className: 'he', dangerouslySetInnerHTML: { __html: he + " " } }),
      React.createElement('span', { className: 'en', dangerouslySetInnerHTML: { __html: en + " " } }),
      React.createElement('div', { className: 'clearFix' })
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
    addToSourceSheet: React.PropTypes.func.isRequired,
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
    selectedWords: React.PropTypes.string,
    interfaceLang: React.PropTypes.string
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
        setConnectionsMode: this.props.setConnectionsMode,
        version: this.props.version,
        versionLanguage: this.props.versionLanguage,
        addToSourceSheet: this.props.addToSourceSheet
      });
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
      var url = "/s1?next=" + window.location.pathname;
      var link = React.createElement(
        'a',
        { href: url },
        React.createElement(
          'span',
          { className: 'int-en' },
          'old Sefaria'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'ממשק הישן'
        )
      );
      content = React.createElement(
        'div',
        { className: 'toolsMessage sans' },
        React.createElement(
          'span',
          { className: 'int-en' },
          'We\'re still working on updating this feature for the new Sefaria. In the meantime, to add a connection please use the ',
          link,
          '.'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'האפשרות הזו עדיין בבניה בממשק החדש. בינתיים ניתן להשתמש ב',
          link,
          '.'
        )
      );
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
    toggleLanguage: React.PropTypes.func.isRequired,
    interfaceLang: React.PropTypes.string.isRequired
  },
  render: function render() {
    return React.createElement(
      'div',
      { className: 'connectionsPanelHeader' },
      React.createElement(ConnectionsPanelTabs, {
        activeTab: this.props.activeTab,
        setConnectionsMode: this.props.setConnectionsMode,
        interfaceLang: this.props.interfaceLang }),
      React.createElement(
        'div',
        { className: 'rightButtons' },
        React.createElement(LanguageToggleButton, { toggleLanguage: this.props.toggleLanguage }),
        React.createElement(ReaderNavigationMenuCloseButton, { icon: 'arrow', onClick: this.props.closePanel, interfaceLang: this.props.interfaceLang })
      )
    );
  }
});

var ConnectionsPanelTabs = React.createClass({
  displayName: 'ConnectionsPanelTabs',

  propTypes: {
    activeTab: React.PropTypes.string.isRequired, // "Connections", "Tools"
    setConnectionsMode: React.PropTypes.func.isRequired,
    interfaceLang: React.PropTypes.string.isRequired
  },
  render: function render() {
    var tabNames = [{ "en": "Connections", "he": "קישורים" }, { "en": "Tools", "he": "כלים" }];
    var tabs = tabNames.map(function (item) {
      var tabClick = function () {
        this.props.setConnectionsMode(item["en"]);
      }.bind(this);
      var active = item["en"] === this.props.activeTab;
      var classes = classNames({ connectionsPanelTab: 1, sans: 1, noselect: 1, active: active });
      return React.createElement(
        'div',
        { className: classes, onClick: tabClick, key: item["en"] },
        React.createElement(
          'span',
          { className: 'int-en' },
          item["en"]
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
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
    var basetext = this.getSectionRef(); //get the title of the full title for the commentary from the api and use that (only needs the title to end with the base text
    var commentary = filter[0] + " on " + basetext; //TODO: get rid of "on" special casing switch to hack that only switches out the sections
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
              // console.log("Failed to clear commentator:");
              // console.log(data);
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

    var en = "No connections known" + (filter.length ? " for " + filter.join(", ") : "") + ".";
    var he = "אין קשרים ידועים" + (filter.length ? " ל" + filter.map(function (f) {
      return Sefaria.hebrewTerm(f);
    }).join(", ") : "") + ".";
    var loaded = Sefaria.linksLoaded(sectionRef);
    var noResultsMessage = React.createElement(LoadingMessage, { message: en, heMessage: he });
    var message = !loaded ? React.createElement(LoadingMessage, null) : summary.length === 0 ? noResultsMessage : null;

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
              React.createElement('img', { className: 'sheetAuthorImg', src: sheet.ownerImageUrl, alt: sheet.ownerName })
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
        //debugger;
        var sectionLinks = Sefaria.links(sectionRef);
        var links = sectionLinks.filter(function (link) {
          if ((this.props.multiPanel || !isSingleCommentary) && Sefaria.splitSpanningRef(link.anchorRef).every(function (aref) {
            return Sefaria.util.inArray(aref, refs) === -1;
          })) {
            // Only show section level links for an individual commentary
            return false;
          }
          return filter.length == 0 || Sefaria.util.inArray(link.category, filter) !== -1 || Sefaria.util.inArray(link.collectiveTitle["en"], filter) !== -1;
        }.bind(this)).sort(function (a, b) {
          if (a.anchorVerse !== b.anchorVerse) {
            return a.anchorVerse - b.anchorVerse;
          } else if (a.commentaryNum !== b.commentaryNum) {
            return a.commentaryNum - b.commentaryNum;
          } else {
            return a.sourceRef > b.sourceRef ? 1 : -1;
          }
        });

        var message = !loaded ? React.createElement(LoadingMessage, null) : links.length === 0 ? noResultsMessage : null;
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
            textCategory: oref ? oref.primary_category : null,
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
              textCategory: oref ? oref.primary_category : null,
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
        React.createElement('img', { className: 'noteAuthorImg', src: this.props.ownerImageUrl, alt: this.props.ownerName })
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
        { className: 'note-content' },
        React.createElement(
          'div',
          { className: 'noteTitle' },
          this.props.title
        ),
        React.createElement('span', { className: 'noteText', dangerouslySetInnerHTML: { __html: this.props.text } })
      ),
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
        heCategory: Sefaria.hebrewTerm(cat.category),
        count: cat.count,
        books: cat.books,
        filter: this.props.filter,
        updateRecent: true,
        setFilter: this.props.setFilter,
        on: Sefaria.util.inArray(cat.category, this.props.filter) !== -1 });
    }.bind(this));
    var lexicon = this.props.oref ? React.createElement(LexiconPanel, { selectedWords: this.props.selectedWords, oref: this.props.oref }) : null;
    return React.createElement(
      'div',
      { className: 'fullFilterView filterSet' },
      lexicon,
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
        heBook: index ? index.heTitle : Sefaria.hebrewTerm(filter),
        category: index ? index.primary_category : filter };
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
          var annotatedFilter = { book: filter, heBook: index.heTitle, category: index.primary_category };
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
      entries: [],
      loaded: false
    };
  },
  componentDidMount: function componentDidMount() {
    if (this.props.selectedWords) {
      this.getLookups(this.props.selectedWords, this.props.oref);
    }
  },
  componentWillReceiveProps: function componentWillReceiveProps(nextProps) {
    // console.log("component will receive props: ", nextProps.selectedWords);
    if (this.props.selectedWords != nextProps.selectedWords) {
      this.clearLookups();
      this.getLookups(nextProps.selectedWords, nextProps.oref);
    }
  },
  clearLookups: function clearLookups() {
    this.setState({
      loaded: false,
      entries: []
    });
  },
  getLookups: function getLookups(words, oref) {
    if (this.shouldActivate(words)) {
      // console.log('getting data: ', words, oref.ref);
      Sefaria.lexicon(words, oref.ref, function (data) {
        this.setState({
          loaded: true,
          entries: data
        });

        var action = data.length == 0 ? "Open No Result" : "Open";
        action += " / " + oref.categories.join("/") + "/" + oref.book;
        Sefaria.site.track.event("Lexicon", action, words);

        // console.log('gotten data from Sefaria.js, state re-set: ', this, data);
      }.bind(this));
    }
  },
  shouldActivate: function shouldActivate(selectedWords) {
    if (!selectedWords) {
      return false;
    }
    var wordList = selectedWords.split(/[\s:\u05c3\u05be\u05c0.]+/);
    var inputLength = wordList.length;
    return inputLength <= 3;
  },
  render: function render() {
    var refCats = this.props.oref.categories.join(", "); //TODO: the way to filter by categories is very limiting.
    var enEmpty = "No results found.";
    var heEmpty = "לא נמצאו תוצאות";
    if (!this.shouldActivate(this.props.selectedWords)) {
      //console.log("not rendering lexicon");
      return false;
    }
    var content;
    if (!this.state.loaded) {
      // console.log("lexicon not yet loaded");
      content = React.createElement(LoadingMessage, { message: 'Looking up words...', heMessage: 'מחפש מילים...' });
    } else if (this.state.entries.length == 0) {
      if (this.props.selectedWords.length == 0) {
        //console.log("empty words: nothing to render");
        return false;
      } else {
        //console.log("no results");
        content = React.createElement(LoadingMessage, { message: enEmpty, heMessage: heEmpty });
      }
    } else {
      var entries = this.state.entries;
      content = entries.filter(function (e) {
        return e['parent_lexicon_details']['text_categories'].length == 0 || e['parent_lexicon_details']['text_categories'].indexOf(refCats) > -1;
      }).map(function (entry, i) {
        return React.createElement(LexiconEntry, { data: entry, key: i });
      });
      content = content.length ? content : React.createElement(LoadingMessage, { message: enEmpty, heMessage: heEmpty });
    }
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
    var _this7 = this;

    var grammar = 'grammar' in content ? '(' + content['grammar']['verbal_stem'] + ')' : "";
    var def = 'definition' in content ? content['definition'] : "";
    var notes = 'notes' in content ? React.createElement(
      'span',
      { className: 'notes' },
      content['notes']
    ) : "";
    var sensesElems = 'senses' in content ? content['senses'].map(function (sense) {
      return _this7.renderLexiconEntrySenses(sense);
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
            { className: 'int-en' },
            'Source: '
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
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
            { className: 'int-en' },
            'Creator: '
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
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
      var refString = this.props.srefs[0];
      var currentPath = Sefaria.util.currentPath();
      var currentLangParam;
      if (this.props.version) {
        refString += "/" + encodeURIComponent(this.props.versionLanguage) + "/" + encodeURIComponent(this.props.version);
      }
      var path = "/edit/" + refString;
      var nextParam = "?next=" + encodeURIComponent(currentPath);
      path += nextParam;
      Sefaria.site.track.event("Tools", "Edit Text Click", refString, { hitCallback: function hitCallback() {
          return window.location = path;
        } });
    }.bind(this) : null;

    var addTranslation = function () {
      var _this8 = this;

      var nextParam = "?next=" + Sefaria.util.currentPath();
      Sefaria.site.track.event("Tools", "Add Translation Click", this.props.srefs[0], { hitCallback: function hitCallback() {
          return window.location = "/translate/" + _this8.props.srefs[0] + nextParam;
        } });
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
          React.createElement(ToolsButton, { en: 'Share', he: 'שתף', image: 'tools-share.svg', onClick: function () {
              this.props.setConnectionsMode("Share");
            }.bind(this) }),
          React.createElement(ToolsButton, { en: 'Add to Source Sheet', he: 'הוסף לדף מקורות', image: 'tools-add-to-sheet.svg', onClick: function () {
              this.props.setConnectionsMode("Add to Source Sheet");
            }.bind(this) }),
          React.createElement(ToolsButton, { en: 'Add Note', he: 'הוסף רשומה', image: 'tools-write-note.svg', onClick: function () {
              this.props.setConnectionsMode("Add Note");
            }.bind(this) }),
          React.createElement(ToolsButton, { en: 'My Notes', he: 'הרשומות שלי', image: 'tools-my-notes.svg', onClick: function () {
              this.props.setConnectionsMode("My Notes");
            }.bind(this) }),
          React.createElement(ToolsButton, { en: 'Compare', he: 'השווה', image: 'tools-compare.svg', onClick: this.props.openComparePanel }),
          React.createElement(ToolsButton, { en: 'Add Translation', he: 'הוסף תרגום', image: 'tools-translate.svg', onClick: addTranslation }),
          React.createElement(ToolsButton, { en: 'Add Connection', he: 'הוסף קישור לטקסט אחר', image: 'tools-add-connection.svg', onClick: function () {
              this.props.setConnectionsMode("Add Connection");
            }.bind(this) }),
          editText ? React.createElement(ToolsButton, { en: 'Edit Text', he: 'ערוך טקסט', image: 'tools-edit-text.svg', onClick: editText }) : null
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
      icon = React.createElement('img', { src: "/static/img/" + this.props.image, className: 'toolsButtonIcon', alt: '' });
    }

    return React.createElement(
      'div',
      { className: 'toolsButton sans noselect', onClick: this.props.onClick },
      React.createElement(
        'div',
        { className: 'int-en noselect' },
        this.props.en
      ),
      React.createElement(
        'div',
        { className: 'int-he noselect' },
        this.props.he
      ),
      icon
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
          React.createElement(ToolsButton, { en: 'Facebook', he: 'פייסבוק', icon: 'facebook-official', onClick: shareFacebook }),
          React.createElement(ToolsButton, { en: 'Twitter', he: 'טוויטר', icon: 'twitter', onClick: shareTwitter }),
          React.createElement(ToolsButton, { en: 'Email', he: 'אימייל', icon: 'envelope-o', onClick: shareEmail })
        )
      )
    );
  }
});

var AddToSourceSheetWindow = React.createClass({
  displayName: 'AddToSourceSheetWindow',

  propTypes: {
    srefs: React.PropTypes.array,
    close: React.PropTypes.func,
    en: React.PropTypes.string,
    he: React.PropTypes.string
  },

  close: function close() {
    if (this.props.close) {
      this.props.close();
    }
  },

  render: function render() {
    var nextParam = "?next=" + encodeURIComponent(Sefaria.util.currentPath());

    return React.createElement(
      'div',
      { className: 'sourceSheetPanelBox' },
      React.createElement(
        'div',
        { className: 'sourceSheetBoxTitle' },
        React.createElement('i', { className: 'fa fa-times-circle', 'aria-hidden': 'true', onClick: this.close }),
        Sefaria.loggedIn ? "" : React.createElement(
          'span',
          null,
          'In order to add this source to a sheet, please ',
          React.createElement(
            'a',
            { href: "/login" + nextParam },
            'log in.'
          )
        )
      ),
      Sefaria.loggedIn ? React.createElement(AddToSourceSheetPanel, {
        srefs: this.props.srefs,
        en: this.props.en,
        he: this.props.he
      }) : ""
    );
  }
});

var AddToSourceSheetPanel = React.createClass({
  displayName: 'AddToSourceSheetPanel',

  // In the main app, the function `addToSourceSheet` is executed in the ReaderApp,
  // and collects the needed data from highlights and app state.
  // It is used in external apps, liked gardens.  In those cases, it's wrapped in AddToSourceSheetWindow,
  // refs and text are passed directly, and the add to source sheets API is invoked from within this object.
  propTypes: {
    srefs: React.PropTypes.array,
    addToSourceSheet: React.PropTypes.func,
    fullPanel: React.PropTypes.bool,
    en: React.PropTypes.string,
    he: React.PropTypes.string
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
    if (this.props.addToSourceSheet) {
      this.props.addToSourceSheet(this.state.selectedSheet, this.confirmAdd);
    } else {
      var url = "/api/sheets/" + this.state.selectedSheet + "/add";
      var source = {};
      if (this.props.srefs) {
        source.refs = this.props.srefs;
        if (this.props.en) source.en = this.props.en;
        if (this.props.he) source.he = this.props.he;
      } else {
        if (this.props.en && this.props.he) {
          source.outsideBiText = { he: this.props.he, en: this.props.en };
        } else {
          source.outsideText = this.props.en || this.props.he;
        }
      }
      $.post(url, { source: JSON.stringify(source) }, this.confirmAdd);
    }
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
    if (this.props.srefs) {
      Sefaria.site.track.event("Tools", "Add to Source Sheet Save", this.props.srefs.join("/"));
    } else {
      Sefaria.site.track.event("Tools", "Add to Source Sheet Save", "Outside Source");
    }
    this.setState({ confirm: true });
  },
  render: function render() {
    if (this.state.confirm) {
      return React.createElement(ConfirmAddToSheetPanel, { sheetId: this.state.selectedSheet });
    }
    var sheets = Sefaria.sheets.userSheets(Sefaria._uid);
    var sheetsContent = sheets ? sheets.map(function (sheet) {
      var classes = classNames({ sheet: 1, noselect: 1, selected: this.state.selectedSheet == sheet.id });
      var selectSheet = function () {
        this.setState({ selectedSheet: sheet.id });
      }.bind(this);
      var title = sheet.title ? sheet.title.stripHtml() : "Untitled Source Sheet";
      return React.createElement(
        'div',
        { className: classes, onClick: selectSheet, key: sheet.id },
        title
      );
    }.bind(this)) : React.createElement(LoadingMessage, null);
    sheetsContent = sheets && sheets.length == 0 ? React.createElement(
      'div',
      { className: 'sheet noselect' },
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
      { className: 'noselect' },
      React.createElement('input', { className: 'newSheetInput noselect', placeholder: 'Title your Sheet' }),
      React.createElement(
        'div',
        { className: 'button white small noselect', onClick: this.createSheet },
        React.createElement(
          'span',
          { className: 'int-en' },
          'Create'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'צור חדש'
        )
      )
    ) : React.createElement(
      'div',
      { className: 'button white noselect', onClick: this.openNewSheet },
      React.createElement(
        'span',
        { className: 'int-en' },
        'Start a Source Sheet'
      ),
      React.createElement(
        'span',
        { className: 'int-he' },
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
            { className: 'sourceSheetSelector noselect' },
            sheetsContent
          ),
          React.createElement(
            'div',
            { className: 'button noselect', onClick: this.addToSourceSheet },
            React.createElement(
              'span',
              { className: 'int-en noselect' },
              'Add to Sheet'
            ),
            React.createElement(
              'span',
              { className: 'int-he noselect' },
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
          { className: 'int-en' },
          'Your source has been added.'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'הטקסט נוסף בהצלחה לדף המקורות'
        )
      ),
      React.createElement(
        'a',
        { className: 'button white', href: "/sheets/" + this.props.sheetId },
        React.createElement(
          'span',
          { className: 'int-en' },
          'Go to Source Sheet ',
          React.createElement('i', { className: 'fa fa-angle-right' })
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
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
        Sefaria.site.track.event("Tools", "Note Save " + (this.state.isPrivate ? "Private" : "Public"), this.props.srefs.join("/"));
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
                { className: 'int-en' },
                React.createElement('i', { className: 'fa fa-lock' }),
                ' Private'
              ),
              React.createElement(
                'span',
                { className: 'int-he' },
                React.createElement('i', { className: 'fa fa-lock' }),
                'רשומה פרטית'
              )
            ),
            React.createElement(
              'div',
              { className: publicClasses, onClick: this.setPublic },
              React.createElement(
                'span',
                { className: 'int-en' },
                'Public'
              ),
              React.createElement(
                'span',
                { className: 'int-he' },
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
              { className: 'int-en' },
              this.props.noteId ? "Save" : "Add Note"
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              this.props.noteId ? "שמור" : "הוסף רשומה"
            )
          ),
          React.createElement(
            'div',
            { className: 'button white fillWidth', onClick: this.cancel },
            React.createElement(
              'span',
              { className: 'int-en' },
              'Cancel'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'בטל'
            )
          ),
          this.props.noteId ? React.createElement(
            'div',
            { className: 'deleteNote', onClick: this.deleteNote },
            React.createElement(
              'span',
              { className: 'int-en' },
              'Delete Note'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
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
              { className: 'int-en' },
              'You must be logged in to use this feature.'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'עליך להיות מחובר בכדי להשתמש באפשרות זו.'
            )
          ),
          React.createElement(
            'a',
            { className: 'button', href: "/login" + nextParam },
            React.createElement(
              'span',
              { className: 'int-en' },
              'Log In'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'התחבר'
            )
          ),
          React.createElement(
            'a',
            { className: 'button', href: "/register" + nextParam },
            React.createElement(
              'span',
              { className: 'int-en' },
              'Sign Up'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
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
    var isQueryHebrew = Sefaria.hebrew.isHebrew(this.props.query);
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
        { className: 'content hasFooter' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          React.createElement(
            'div',
            { className: 'searchContentFrame' },
            React.createElement(
              'h1',
              { classNames: isQueryHebrew ? "hebrewQuery" : "englishQuery" },
              '“',
              this.props.query,
              '”'
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
        ),
        React.createElement(
          'footer',
          { id: 'footer', className: 'interface-' + this.props.interfaceLang + ' static sans' },
          React.createElement(Footer, null)
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
        React.createElement('input', { className: 'readerSearch', title: 'Search for Texts or Keywords Here', value: this.state.query, onKeyPress: this.handleKeypress, onChange: this.handleChange, placeholder: 'Search' }),
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
  updateRunningQuery: function updateRunningQuery(type, ajax, isLoadingRemainder) {
    this.state.runningQueries[type] = ajax;
    this.state.isQueryRunning[type] = !!ajax && !isLoadingRemainder;
    this.setState({
      runningQueries: this.state.runningQueries,
      isQueryRunning: this.state.isQueryRunning
    });
  },
  _abortRunningQueries: function _abortRunningQueries() {
    var _this9 = this;

    this.state.types.forEach(function (t) {
      return _this9._abortRunningQuery(t);
    });
  },
  _abortRunningQuery: function _abortRunningQuery(type) {
    if (this.state.runningQueries[type]) {
      this.state.runningQueries[type].abort();
    }
    this.updateRunningQuery(type, null, false);
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
      this.updateRunningQuery(type, null, false);
      this.state.moreToLoad[type] = false;
      this.setState({ moreToLoad: this.state.moreToLoad });
      return;
    }
    var query_props = {
      query: this.props.query,
      type: type,
      size: this.backgroundQuerySize,
      from: last,
      error: function error() {},
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
    var runningLoadRemainderQuery = Sefaria.search.execute_query(query_props);
    this.updateRunningQuery(type, runningLoadRemainderQuery, true);
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
        this.updateRunningQuery("sheet", null, false);
        this.setState({
          hits: extend(this.state.hits, { "sheet": data.hits.hits }),
          totals: extend(this.state.totals, { "sheet": data.hits.total })
        });
        Sefaria.site.track.event("Search", "Query: sheet", props.query, data.hits.total);

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
        this.updateRunningQuery("text", null, false);
        var hitArray = this._process_text_hits(data.hits.hits);
        this.setState({
          hits: extend(this.state.hits, { "text": hitArray }),
          totals: extend(this.state.totals, { "text": data.hits.total })
        });
        var filter_label = request_applied && request_applied.length > 0 ? " - " + request_applied.join("|") : "";
        var query_label = props.query + filter_label;
        Sefaria.site.track.event("Search", "Query: text", query_label, data.hits.total);
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
      }.bind(this),
      error: this._handle_error
    });

    this.updateRunningQuery("text", runningTextQuery, false);
    this.updateRunningQuery("sheet", runningSheetQuery, false);
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
      this.updateRunningQuery(null, null, false);
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
    var _this10 = this;

    //returns object w/ keys 'availableFilters', 'registry'
    //Add already applied filters w/ empty doc count?
    var rawTree = {};

    this.props.appliedFilters.forEach(function (fkey) {
      return _this10._addAvailableFilter(rawTree, fkey, { "docCount": 0 });
    });

    aggregation_buckets.forEach(function (f) {
      return _this10._addAvailableFilter(rawTree, f["key"], { "docCount": f["doc_count"] });
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

    for (var j = 0; j < Sefaria.search_toc.length; j++) {
      var b = walk.call(this, Sefaria.search_toc[j]);
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

      node["docCount"] = 0;

      if ("category" in branch) {
        // Category node

        path.push(branch["category"]); // Place this category at the *end* of the path
        extend(node, {
          "title": path.slice(-1)[0],
          "path": path.join("/"),
          "heTitle": branch["heCategory"]
        });

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

        for (i = 0; i < path.length; i++) {
          //For TOC nodes that we don't have results for, we catch the exception below.
          rawNode = rawNode[path[i]];
        }
        node["docCount"] += rawNode.docCount;

        // Do we need both of these in the registry?
        registry[node.getId()] = node;
        registry[node.path] = node;

        path.pop();
        return node;
      } catch (e) {
        path.pop();
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
    var _this11 = this;

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
          query: _this11.props.query,
          key: result._id,
          onResultClick: _this11.props.onResultClick });
      });
    } else if (tab == "sheet") {
      results = this.state.hits.sheet.slice(0, this.state.displayedUntil["sheet"]).map(function (result) {
        return React.createElement(SearchSheetResult, {
          data: result,
          query: _this11.props.query,
          key: result._id });
      });
    }

    var loadingMessage = React.createElement(LoadingMessage, { message: 'Searching...', heMessage: 'מבצע חיפוש...' });
    var noResultsMessage = React.createElement(LoadingMessage, { message: '0 results.', heMessage: '0 תוצאות.' });

    var queryFullyLoaded = !this.state.moreToLoad[tab] && !this.state.isQueryRunning[tab];
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
      queryFullyLoaded || haveResults ? results : loadingMessage
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
          { className: 'int-en' },
          total != 1 ? en_plural : en_singular
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
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
        { className: 'int-en' },
        !!this.props.appliedFilters.length && !!this.props.total ? this.getSelectedTitles("en").join(", ") : ""
      ),
      React.createElement(
        'span',
        { className: 'int-he' },
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
          { className: 'int-en' },
          'Filter by Text   '
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'סנן לפי כותר   '
        ),
        React.createElement('i', { className: this.state.displayFilters ? "fa fa-caret-down fa-angle-down" : "fa fa-caret-down" })
      ),
      React.createElement(
        'div',
        { className: this.state.displayFilters ? "searchFilterBoxes" : "searchFilterBoxes hidden" },
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
      React.createElement('input', { type: 'checkbox', id: this.props.filter.path, className: 'filter', checked: this.state.selected == 1, onChange: this.handleFilterClick }),
      React.createElement(
        'label',
        { onClick: this.handleFilterClick, 'for': this.props.filter.path },
        React.createElement('span', null)
      ),
      React.createElement(
        'span',
        { className: 'int-en' },
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
        { className: 'int-he', dir: 'rtl' },
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
        { className: 'int-en' },
        React.createElement('i', { className: 'in-focus-arrow fa fa-caret-right' })
      ) : "",
      this.props.isInFocus ? React.createElement(
        'span',
        { className: 'int-he' },
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
      Sefaria.site.track.event("Search", "Search Result Text Click", this.props.query + ' - ' + s.ref + '/' + s.version + '/' + s.lang);
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
        { className: 'similar-title int-he' },
        data.duplicates.length,
        ' ',
        data.duplicates.length > 1 ? " גרסאות נוספות" : " גרסה נוספת"
      ),
      React.createElement(
        'span',
        { className: 'similar-title int-en' },
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
  handleSheetClick: function handleSheetClick(e) {
    var href = e.target.getAttribute("href");
    e.preventDefault();
    var s = this.props.data._source;
    Sefaria.site.track.event("Search", "Search Result Sheet Click", this.props.query + ' - ' + s.sheetId, { hitCallback: function hitCallback() {
        return window.location = href;
      } });
  },
  handleProfileClick: function handleProfileClick(e) {
    var href = e.target.getAttribute("href");
    e.preventDefault();
    var s = this.props.data._source;
    Sefaria.site.track.event("Search", "Search Result Sheet Owner Click", this.props.query + ' - ' + s.sheetId + ' - ' + s.owner_name, { hitCallback: function hitCallback() {
        return window.location = href;
      } });
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
          { href: s.profile_url, onClick: this.handleProfileClick },
          React.createElement('img', { className: 'owner_image', src: s.owner_image, alt: s.owner_name })
        )
      ),
      React.createElement(
        'div',
        { className: 'result_text_box' },
        React.createElement(
          'a',
          { href: s.profile_url, onClick: this.handleProfileClick, className: 'owner_name' },
          s.owner_name
        ),
        React.createElement(
          'a',
          { className: 'result-title', href: href, onClick: this.handleSheetClick },
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
  componentDidMount: function componentDidMount() {
    $(".inAppLink").on("click", this.props.handleInAppLinkClick);
  },
  render: function render() {
    var width = typeof window !== "undefined" ? $(window).width() : 1000;
    var accountContent = [React.createElement(BlockLink, { interfaceLink: true, target: '/my/profile', title: 'Profile', heTitle: 'פרופיל', image: '/static/img/profile.svg' }), React.createElement(BlockLink, { interfaceLink: true, target: '/sheets/private', inAppLink: true, title: 'Source Sheets', heTitle: 'דפי מקורות', image: '/static/img/sheet.svg' }), React.createElement(BlockLink, { interfaceLink: true, target: '/my/groups', inAppLink: true, title: 'Groups', heTitle: 'קבוצות', image: '/static/img/group.svg' }), React.createElement(BlockLink, { interfaceLink: true, target: '/texts/recent', title: 'Reading History', heTitle: 'היסטורית קריאה', image: '/static/img/readinghistory.svg' }), React.createElement(BlockLink, { interfaceLink: true, target: '/settings/account', title: 'Settings', heTitle: 'הגדרות', image: '/static/img/settings.svg' }), React.createElement(BlockLink, { interfaceLink: true, target: '/logout', title: 'Log Out', heTitle: 'ניתוק', image: '/static/img/logout.svg' })];
    accountContent = React.createElement(TwoOrThreeBox, { content: accountContent, width: width });

    var learnContent = [React.createElement(BlockLink, { interfaceLink: true, target: '/about', title: 'About', heTitle: 'אודות' }), React.createElement(BlockLink, { interfaceLink: true, target: '/help', title: 'Help', heTitle: 'עזרה' }), React.createElement(BlockLink, { interfaceLink: true, target: 'http://blog.sefaria.org', title: 'Blog', heTitle: 'בלוג' }), React.createElement(BlockLink, { interfaceLink: true, target: '/faq', title: 'FAQ', heTitle: 'שאלות נפוצות' }), React.createElement(BlockLink, { interfaceLink: true, target: '/educators', title: 'Educators', heTitle: 'מחנכים' }), React.createElement(BlockLink, { interfaceLink: true, target: '/team', title: 'Team', heTitle: 'צוות' })];
    learnContent = React.createElement(TwoOrThreeBox, { content: learnContent, width: width });

    var contributeContent = [React.createElement(BlockLink, { interfaceLink: true, target: '/activity', title: 'Recent Activity', heTitle: 'פעילות אחרונה' }), React.createElement(BlockLink, { interfaceLink: true, target: '/metrics', title: 'Metrics', heTitle: 'מדדים' }), React.createElement(BlockLink, { interfaceLink: true, target: '/contribute', title: 'Contribute', heTitle: 'הצטרפות לעשיה' }), React.createElement(BlockLink, { interfaceLink: true, target: '/donate', title: 'Donate', heTitle: 'תרומות' }), React.createElement(BlockLink, { interfaceLink: true, target: '/supporters', title: 'Supporters', heTitle: 'תומכים' }), React.createElement(BlockLink, { interfaceLink: true, target: '/jobs', title: 'Jobs', heTitle: 'דרושים' })];
    contributeContent = React.createElement(TwoOrThreeBox, { content: contributeContent, width: width });

    var connectContent = [React.createElement(BlockLink, { interfaceLink: true, target: 'https://groups.google.com/forum/?fromgroups#!forum/sefaria', title: 'Forum', heTitle: 'פורום' }), React.createElement(BlockLink, { interfaceLink: true, target: 'http://www.facebook.com/sefaria.org', title: 'Facebook', heTitle: 'פייסבוק' }), React.createElement(BlockLink, { interfaceLink: true, target: 'http://twitter.com/SefariaProject', title: 'Twitter', heTitle: 'טוויטר' }), React.createElement(BlockLink, { interfaceLink: true, target: 'http://www.youtube.com/user/SefariaProject', title: 'YouTube', heTitle: 'יוטיוב' }), React.createElement(BlockLink, { interfaceLink: true, target: 'http://www.github.com/Sefaria', title: 'GitHub', heTitle: 'גיטהאב' }), React.createElement(BlockLink, { interfaceLink: true, target: 'mailto:hello@sefaria.org', title: 'Email', heTitle: 'אימייל' })];
    connectContent = React.createElement(TwoOrThreeBox, { content: connectContent, width: width });

    var footer = React.createElement(
      'footer',
      { id: 'footer', className: 'interface-' + this.props.interfaceLang + ' static sans' },
      React.createElement(Footer, null)
    );

    var classes = { accountPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: 1 };
    var classStr = classNames(classes);
    return React.createElement(
      'div',
      { className: classStr },
      React.createElement(
        'div',
        { className: 'content hasFooter' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          React.createElement(
            'h1',
            null,
            React.createElement(
              'span',
              { className: 'int-en' },
              'Account'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'חשבון משתמש'
            )
          ),
          React.createElement(ReaderNavigationMenuSection, { content: accountContent }),
          React.createElement(ReaderNavigationMenuSection, { title: 'Learn', heTitle: 'לימוד', content: learnContent }),
          React.createElement(ReaderNavigationMenuSection, { title: 'Contribute', heTitle: 'עשייה', content: contributeContent }),
          React.createElement(ReaderNavigationMenuSection, { title: 'Connect', heTitle: 'התחברות', content: connectContent })
        ),
        footer
      )
    );
  }
});

var RecentPanel = React.createClass({
  displayName: 'RecentPanel',

  propTypes: {
    closeNav: React.PropTypes.func.isRequired,
    toggleLanguage: React.PropTypes.func.isRequired,
    openDisplaySettings: React.PropTypes.func.isRequired,
    navHome: React.PropTypes.func.isRequired,
    width: React.PropTypes.number,
    compare: React.PropTypes.bool,
    hideNavHeader: React.PropTypes.bool,
    interfaceLang: React.PropTypes.string
  },
  render: function render() {
    var width = typeof window !== "undefined" ? $(window).width() : 1000;

    var recentItems = Sefaria.recentlyViewed.filter(function (item) {
      // after a text has been deleted a recent ref may be invalid,
      // but don't try to check when booksDict is not available during server side render
      if (Object.keys(Sefaria.booksDict).length === 0) {
        return true;
      }
      return Sefaria.isRef(item.ref);
    }).map(function (item) {
      return React.createElement(TextBlockLink, {
        sref: item.ref,
        heRef: item.heRef,
        book: item.book,
        version: item.version,
        versionLanguage: item.versionLanguage,
        showSections: true,
        recentItem: true });
    });
    var recentContent = React.createElement(TwoOrThreeBox, { content: recentItems, width: width });

    var footer = this.props.compare ? null : React.createElement(
      'footer',
      { id: 'footer', className: 'interface-' + this.props.interfaceLang + ' static sans' },
      React.createElement(Footer, null)
    );

    var navMenuClasses = classNames({ recentPanel: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader, compare: this.props.compare });
    var navTopClasses = classNames({ readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader });
    var contentClasses = classNames({ content: 1, hasFooter: footer != null });
    return React.createElement(
      'div',
      { className: navMenuClasses },
      this.props.hideNavHeader ? null : React.createElement(
        'div',
        { className: navTopClasses },
        React.createElement(CategoryColorLine, { category: "Other" }),
        React.createElement(ReaderNavigationMenuMenuButton, { onClick: this.props.navHome, compare: this.props.compare }),
        React.createElement(ReaderNavigationMenuDisplaySettingsButton, { onClick: this.props.openDisplaySettings }),
        React.createElement(
          'h2',
          null,
          React.createElement(
            'span',
            { className: 'int-en' },
            'Recent'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'נצפו לאחרונה'
          )
        )
      ),
      React.createElement(
        'div',
        { className: contentClasses },
        React.createElement(
          'div',
          { className: 'contentInner' },
          this.props.hideNavHeader ? React.createElement(
            'h1',
            null,
            this.props.multiPanel ? React.createElement(LanguageToggleButton, { toggleLanguage: this.props.toggleLanguage }) : null,
            React.createElement(
              'span',
              { className: 'int-en' },
              'Recent'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'נצפו לאחרונה'
            )
          ) : null,
          recentContent
        ),
        footer
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
      page: 1,
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
    var classStr = classNames(classes);
    return React.createElement(
      'div',
      { className: classStr },
      React.createElement(
        'div',
        { className: 'content hasFooter' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          React.createElement(
            'h1',
            null,
            React.createElement(
              'span',
              { className: 'int-en' },
              'Notifications'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'התראות'
            )
          ),
          Sefaria.loggedIn ? React.createElement('div', { className: 'notificationsList', dangerouslySetInnerHTML: { __html: Sefaria.notificationsHtml } }) : React.createElement(LoginPanel, { fullPanel: true })
        ),
        React.createElement(
          'footer',
          { id: 'footer', className: 'interface-' + this.props.interfaceLang + ' static sans' },
          React.createElement(Footer, null)
        )
      )
    );
  }
});

var MyGroupsPanel = React.createClass({
  displayName: 'MyGroupsPanel',

  propTypes: {
    interfaceLang: React.PropTypes.string
  },
  componentDidMount: function componentDidMount() {
    if (!Sefaria.groupsList()) {
      Sefaria.groupsList(function () {
        this.forceUpdate();
      }.bind(this));
    }
  },
  render: function render() {
    var groupsList = Sefaria.groupsList();
    var classes = { myGroupsPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: 1 };
    var classStr = classNames(classes);
    return React.createElement(
      'div',
      { className: classStr },
      React.createElement(
        'div',
        { className: 'content hasFooter' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          React.createElement(
            'h1',
            null,
            React.createElement(
              'span',
              { className: 'int-en' },
              'My Groups'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'הקבוצות שלי'
            )
          ),
          React.createElement(
            'center',
            null,
            React.createElement(
              'a',
              { className: 'button white', href: '/groups/new' },
              React.createElement(
                'span',
                { className: 'int-en' },
                'Create a Group'
              ),
              React.createElement(
                'span',
                { className: 'int-he' },
                'ליצור קבוצה'
              )
            )
          ),
          React.createElement(
            'div',
            { className: 'groupsList' },
            groupsList ? groupsList.private.length ? groupsList.private.map(function (item) {
              return React.createElement(GroupListing, { data: item });
            }) : React.createElement(LoadingMessage, { message: 'You aren\'t a member of any groups yet.', heMessage: 'You aren\'t a member of any groups yet.' }) : React.createElement(LoadingMessage, null)
          )
        ),
        React.createElement(
          'footer',
          { id: 'footer', className: 'interface-' + this.props.interfaceLang + ' static sans' },
          React.createElement(Footer, null)
        )
      )
    );
  }
});

var GroupListing = React.createClass({
  displayName: 'GroupListing',

  propTypes: {
    data: React.PropTypes.object.isRequired
  },
  render: function render() {
    var imageUrl = this.props.data.imageUrl || "/static/img/group.svg";
    var imageClass = classNames({ groupListingImage: 1, default: !this.props.data.imageUrl });
    var groupUrl = "/groups/" + this.props.data.name.replace(/\s/g, "-");
    return React.createElement(
      'div',
      { className: 'groupListing' },
      React.createElement(
        'a',
        { href: groupUrl },
        React.createElement(
          'div',
          { className: 'groupListingImageBox' },
          React.createElement('img', { className: imageClass, src: imageUrl, alt: 'Group Logo' })
        )
      ),
      React.createElement(
        'a',
        { href: groupUrl, className: 'groupListingName' },
        this.props.data.name
      ),
      React.createElement(
        'div',
        { className: 'groupListingDetails' },
        React.createElement(
          'span',
          { className: 'groupListingDetail groupListingMemberCount' },
          React.createElement(
            'span',
            { className: 'int-en' },
            this.props.data.memberCount,
            ' Members'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            this.props.data.memberCount,
            ' חברים'
          )
        ),
        React.createElement(
          'span',
          { className: 'groupListingDetailSeparator' },
          '•'
        ),
        React.createElement(
          'span',
          { className: 'groupListingDetail groupListingSheetCount' },
          React.createElement(
            'span',
            { className: 'int-en' },
            this.props.data.sheetCount,
            ' Sheets'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            this.props.data.sheetCount,
            ' דפים'
          )
        )
      ),
      React.createElement('div', { className: 'clearFix' })
    );
  }
});

var ModeratorToolsPanel = React.createClass({
  displayName: 'ModeratorToolsPanel',

  propTypes: {
    interfaceLang: React.PropTypes.string
  },
  getInitialState: function getInitialState() {
    return {
      // Bulk Download
      bulk_format: null,
      bulk_title_pattern: null,
      bulk_version_title_pattern: null,
      bulk_language: null,
      // CSV Upload
      files: [],
      uploading: false,
      uploadError: null,
      uploadMessage: null
    };
  },
  handleFiles: function handleFiles(event) {
    this.setState({ files: event.target.files });
  },
  uploadFiles: function uploadFiles(event) {
    event.preventDefault();
    this.setState({ uploading: true, uploadMessage: "Uploading..." });
    var formData = new FormData();
    for (var i = 0; i < this.state.files.length; i++) {
      var file = this.state.files[i];
      formData.append('texts[]', file, file.name);
    }
    $.ajax({
      url: "api/text-upload",
      type: 'POST',
      data: formData,
      success: function (data) {
        if (data.status == "ok") {
          this.setState({ uploading: false, uploadMessage: data.message, uploadError: null, files: [] });
          $("#file-form").get(0).reset(); //Remove selected files from the file selector
        } else {
            this.setState({ "uploadError": "Error - " + data.error, uploading: false, uploadMessage: data.message });
          }
      }.bind(this),
      error: function (xhr, status, err) {
        this.setState({ "uploadError": "Error - " + err.toString(), uploading: false, uploadMessage: null });
      }.bind(this),
      cache: false,
      contentType: false,
      processData: false
    });
  },

  onDlTitleChange: function onDlTitleChange(event) {
    this.setState({ bulk_title_pattern: event.target.value });
  },
  onDlVersionChange: function onDlVersionChange(event) {
    this.setState({ bulk_version_title_pattern: event.target.value });
  },
  onDlLanguageSelect: function onDlLanguageSelect(event) {
    this.setState({ bulk_language: event.target.value });
  },
  onDlFormatSelect: function onDlFormatSelect(event) {
    this.setState({ bulk_format: event.target.value });
  },
  bulkVersionDlLink: function bulkVersionDlLink() {
    var _this12 = this;

    var args = ["format", "title_pattern", "version_title_pattern", "language"].map(function (arg) {
      return _this12.state["bulk_" + arg] ? arg + '=' + encodeURIComponent(_this12.state["bulk_" + arg]) : "";
    }).filter(function (a) {
      return a;
    }).join("&");
    return "download/bulk/versions/?" + args;
  },

  render: function render() {
    // Bulk Download
    var dlReady = this.state.bulk_format && (this.state.bulk_title_pattern || this.state.bulk_version_title_pattern);
    var downloadButton = React.createElement(
      'div',
      { className: 'versionDownloadButton' },
      React.createElement(
        'div',
        { className: 'downloadButtonInner' },
        React.createElement(
          'span',
          { className: 'int-en' },
          'Download'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'הורדה'
        )
      )
    );
    var downloadSection = React.createElement(
      'div',
      { className: 'modToolsSection dlSection' },
      React.createElement(
        'div',
        { className: 'dlSectionTitle' },
        React.createElement(
          'span',
          { className: 'int-en' },
          'Bulk Download Text'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'הורדת הטקסט'
        )
      ),
      React.createElement('input', { className: 'dlVersionSelect', type: 'text', placeholder: 'Index Title Pattern', onChange: this.onDlTitleChange }),
      React.createElement('input', { className: 'dlVersionSelect', type: 'text', placeholder: 'Version Title Pattern', onChange: this.onDlVersionChange }),
      React.createElement(
        'select',
        { className: 'dlVersionSelect dlVersionLanguageSelect', value: this.state.bulk_language || "", onChange: this.onDlLanguageSelect },
        React.createElement(
          'option',
          { disabled: true },
          'Language'
        ),
        React.createElement(
          'option',
          { key: 'all', value: '' },
          'Hebrew & English'
        ),
        React.createElement(
          'option',
          { key: 'he', value: 'he' },
          'Hebrew'
        ),
        React.createElement(
          'option',
          { key: 'en', value: 'en' },
          'English'
        )
      ),
      React.createElement(
        'select',
        { className: 'dlVersionSelect dlVersionFormatSelect', value: this.state.bulk_format || "", onChange: this.onDlFormatSelect },
        React.createElement(
          'option',
          { disabled: true },
          'File Format'
        ),
        React.createElement(
          'option',
          { key: 'txt', value: 'txt' },
          'Text'
        ),
        React.createElement(
          'option',
          { key: 'csv', value: 'csv' },
          'CSV'
        ),
        React.createElement(
          'option',
          { key: 'json', value: 'json' },
          'JSON'
        )
      ),
      dlReady ? React.createElement(
        'a',
        { href: this.bulkVersionDlLink(), download: true },
        downloadButton
      ) : downloadButton
    );

    // Uploading
    var ulReady = !this.state.uploading && this.state.files.length > 0;
    var uploadButton = React.createElement(
      'a',
      null,
      React.createElement(
        'div',
        { className: 'versionDownloadButton', onClick: this.uploadFiles },
        React.createElement(
          'div',
          { className: 'downloadButtonInner' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Upload'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'העלאה'
          )
        )
      )
    );
    var uploadForm = React.createElement(
      'div',
      { className: 'modToolsSection' },
      React.createElement(
        'div',
        { className: 'dlSectionTitle' },
        React.createElement(
          'span',
          { className: 'int-en' },
          'Bulk Upload CSV'
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'הורדת הטקסט'
        )
      ),
      React.createElement(
        'form',
        { id: 'file-form' },
        React.createElement('input', { className: 'dlVersionSelect', type: 'file', id: 'file-select', multiple: true, onChange: this.handleFiles }),
        ulReady ? uploadButton : ""
      ),
      this.state.uploadMessage ? React.createElement(
        'div',
        { className: 'message' },
        this.state.uploadMessage
      ) : "",
      this.state.uploadError ? React.createElement(
        'div',
        { className: 'error' },
        this.state.uploadError
      ) : ""
    );

    return Sefaria.is_moderator ? React.createElement(
      'div',
      { className: 'modTools' },
      downloadSection,
      uploadForm
    ) : React.createElement(
      'div',
      null,
      'Tools are only available to logged in moderators.'
    );
  }
});

var UpdatesPanel = React.createClass({
  displayName: 'UpdatesPanel',

  propTypes: {
    interfaceLang: React.PropTypes.string
  },
  getInitialState: function getInitialState() {
    return {
      page: 0,
      loadedToEnd: false,
      loading: false,
      updates: [],
      submitting: false,
      submitCount: 0,
      error: null
    };
  },
  componentDidMount: function componentDidMount() {
    $(ReactDOM.findDOMNode(this)).find(".content").bind("scroll", this.handleScroll);
    this.getMoreNotifications();
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
  getMoreNotifications: function getMoreNotifications() {
    $.getJSON("/api/updates?page=" + this.state.page, this.loadMoreNotifications);
    this.setState({ loading: true });
  },
  loadMoreNotifications: function loadMoreNotifications(data) {
    if (data.count < data.page_size) {
      this.setState({ loadedToEnd: true });
    }
    this.setState({ page: data.page + 1, loading: false, updates: this.state.updates.concat(data.updates) });
  },
  onDelete: function onDelete(id) {
    $.ajax({
      url: '/api/updates/' + id,
      type: 'DELETE',
      success: function (result) {
        if (result.status == "ok") {
          this.setState({ updates: this.state.updates.filter(function (u) {
              return u._id != id;
            }) });
        }
      }.bind(this)
    });
  },

  handleSubmit: function handleSubmit(type, content) {
    this.setState({ "submitting": true, "error": null });
    var payload = {
      type: type,
      content: content
    };
    $.ajax({
      url: "/api/updates",
      dataType: 'json',
      type: 'POST',
      data: { json: JSON.stringify(payload) },
      success: function (data) {
        if (data.status == "ok") {
          payload.date = Date();
          this.state.updates.unshift(payload);
          this.setState({ submitting: false, updates: this.state.updates, submitCount: this.state.submitCount + 1 });
        } else {
          this.setState({ "error": "Error - " + data.error });
        }
      }.bind(this),
      error: function (xhr, status, err) {
        this.setState({ "error": "Error - " + err.toString() });
      }.bind(this)
    });
  },

  render: function render() {
    var _this13 = this;

    var classes = { notificationsPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: 1 };
    var classStr = classNames(classes);

    return React.createElement(
      'div',
      { className: classStr },
      React.createElement(
        'div',
        { className: 'content hasFooter' },
        React.createElement(
          'div',
          { className: 'contentInner' },
          React.createElement(
            'h1',
            null,
            React.createElement(
              'span',
              { className: 'int-en' },
              'Updates'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'עדכונים'
            )
          ),
          Sefaria.is_moderator ? React.createElement(NewUpdateForm, { handleSubmit: this.handleSubmit, key: this.state.submitCount, error: this.state.error }) : "",
          React.createElement(
            'div',
            { className: 'notificationsList' },
            this.state.updates.map(function (u) {
              return React.createElement(SingleUpdate, {
                type: u.type,
                content: u.content,
                date: u.date,
                key: u._id,
                id: u._id,
                onDelete: _this13.onDelete,
                submitting: _this13.state.submitting
              });
            })
          )
        ),
        React.createElement(
          'footer',
          { id: 'footer', className: 'interface-' + this.props.interfaceLang + ' static sans' },
          React.createElement(Footer, null)
        )
      )
    );
  }
});

var NewUpdateForm = React.createClass({
  displayName: 'NewUpdateForm',

  propTypes: {
    error: React.PropTypes.string,
    handleSubmit: React.PropTypes.func
  },
  getInitialState: function getInitialState() {
    return { type: 'index', index: '', language: 'en', version: '', en: '', he: '', error: '' };
  },
  componentWillReceiveProps: function componentWillReceiveProps(nextProps) {
    this.setState({ "error": nextProps.error });
  },

  handleEnChange: function handleEnChange(e) {
    this.setState({ en: e.target.value, error: null });
  },
  handleHeChange: function handleHeChange(e) {
    this.setState({ he: e.target.value, error: null });
  },
  handleTypeChange: function handleTypeChange(e) {
    this.setState({ type: e.target.value, error: null });
  },
  handleIndexChange: function handleIndexChange(e) {
    this.setState({ index: e.target.value, error: null });
  },
  handleVersionChange: function handleVersionChange(e) {
    this.setState({ version: e.target.value, error: null });
  },
  handleLanguageChange: function handleLanguageChange(e) {
    this.setState({ language: e.target.value, error: null });
  },
  handleSubmit: function handleSubmit(e) {
    e.preventDefault();
    var content = {
      "en": this.state.en.trim(),
      "he": this.state.he.trim()
    };
    if (this.state.type == "general") {
      if (!this.state.en || !this.state.he) {
        this.setState({ "error": "Both Hebrew and English are required" });
        return;
      }
    } else {
      if (!this.state.index) {
        this.setState({ "error": "Index is required" });
        return;
      }
      content["index"] = this.state.index.trim();
    }
    if (this.state.type == "version") {
      if (!this.state.version || !this.state.language) {
        this.setState({ "error": "Version is required" });
        return;
      }
      content["version"] = this.state.version.trim();
      content["language"] = this.state.language.trim();
    }
    this.props.handleSubmit(this.state.type, content);
  },
  render: function render() {
    return React.createElement(
      'form',
      { className: 'globalUpdateForm', onSubmit: this.handleSubmit },
      React.createElement(
        'div',
        null,
        React.createElement('input', { type: 'radio', name: 'type', value: 'index', onChange: this.handleTypeChange, checked: this.state.type == "index" }),
        'Index  ',
        React.createElement('input', { type: 'radio', name: 'type', value: 'version', onChange: this.handleTypeChange, checked: this.state.type == "version" }),
        'Version  ',
        React.createElement('input', { type: 'radio', name: 'type', value: 'general', onChange: this.handleTypeChange, checked: this.state.type == "general" }),
        'General  '
      ),
      React.createElement(
        'div',
        null,
        this.state.type != "general" ? React.createElement('input', { type: 'text', placeholder: 'Index Title', onChange: this.handleIndexChange }) : "",
        this.state.type == "version" ? React.createElement('input', { type: 'text', placeholder: 'Version Title', onChange: this.handleVersionChange }) : "",
        this.state.type == "version" ? React.createElement(
          'select',
          { type: 'text', placeholder: 'Version Language', onChange: this.handleLanguageChange },
          React.createElement(
            'option',
            { value: 'en' },
            'English'
          ),
          React.createElement(
            'option',
            { value: 'he' },
            'Hebrew'
          )
        ) : ""
      ),
      React.createElement(
        'div',
        null,
        React.createElement('textarea', {
          placeholder: 'English Description (optional for Index and Version)',
          onChange: this.handleEnChange,
          rows: '3',
          cols: '80'
        })
      ),
      React.createElement(
        'div',
        null,
        React.createElement('textarea', {
          placeholder: 'Hebrew Description (optional for Index and Version)',
          onChange: this.handleHeChange,
          rows: '3',
          cols: '80'
        })
      ),
      React.createElement('input', { type: 'submit', value: 'Submit', disabled: this.props.submitting }),
      React.createElement(
        'span',
        { className: 'error' },
        this.state.error
      )
    );
  }
});

var SingleUpdate = React.createClass({
  displayName: 'SingleUpdate',

  propTypes: {
    id: React.PropTypes.string,
    type: React.PropTypes.string,
    content: React.PropTypes.object,
    onDelete: React.PropTypes.func,
    date: React.PropTypes.string
  },
  onDelete: function onDelete() {
    this.props.onDelete(this.props.id);
  },
  render: function render() {
    var title = this.props.content.index;
    if (title) {
      var heTitle = Sefaria.index(title) ? Sefaria.index(title).heTitle : "";
    }

    var url = Sefaria.ref(title) ? "/" + Sefaria.normRef(Sefaria.ref(title).book) : "/" + Sefaria.normRef(title);

    var d = new Date(this.props.date);

    return React.createElement(
      'div',
      { className: 'notification' },
      React.createElement(
        'div',
        { className: 'date' },
        React.createElement(
          'span',
          { className: 'int-en' },
          d.toLocaleDateString("en")
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          d.toLocaleDateString("he")
        ),
        Sefaria.is_moderator ? React.createElement('i', { className: 'fa fa-times-circle delete-update-button', onClick: this.onDelete, 'aria-hidden': 'true' }) : ""
      ),
      this.props.type == "index" ? React.createElement(
        'div',
        null,
        React.createElement(
          'span',
          { className: 'int-en' },
          'New Text: ',
          React.createElement(
            'a',
            { href: url },
            title
          )
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'טקסט חדש זמין: ',
          React.createElement(
            'a',
            { href: url },
            heTitle
          )
        )
      ) : "",
      this.props.type == "version" ? React.createElement(
        'div',
        null,
        React.createElement(
          'span',
          { className: 'int-en' },
          'New ',
          this.props.content.language == "en" ? "English" : "Hebrew",
          ' version of ',
          React.createElement(
            'a',
            { href: url },
            title
          ),
          ': ',
          this.props.content.version
        ),
        React.createElement(
          'span',
          { className: 'int-he' },
          'גרסה חדשה של ',
          React.createElement(
            'a',
            { href: url },
            heTitle
          ),
          ' ב',
          this.props.content.language == "en" ? "אנגלית" : "עברית",
          ' : ',
          this.props.content.version
        )
      ) : "",
      React.createElement(
        'div',
        null,
        React.createElement('span', { className: 'int-en', dangerouslySetInnerHTML: { __html: this.props.content.en } }),
        React.createElement('span', { className: 'int-he', dangerouslySetInnerHTML: { __html: this.props.content.he } })
      )
    );
  }
});

var InterruptingMessage = React.createClass({
  displayName: 'InterruptingMessage',
  propTypes: {
    messageName: React.PropTypes.string.isRequired,
    messageHTML: React.PropTypes.string.isRequired,
    onClose: React.PropTypes.func.isRequired
  },
  componentDidMount: function componentDidMount() {
    $("#interruptingMessage .button").click(this.close);
  },
  close: function close() {
    this.markAsRead();
    this.props.onClose();
  },
  markAsRead: function markAsRead() {
    Sefaria._api("/api/interrupting-messages/read/" + this.props.messageName, function (data) {});
    cookie(this.props.messageName, true, { "path": "/" });
    Sefaria.site.track.event("Interrupting Message", "read", this.props.messageName, { nonInteraction: true });
    Sefaria.interruptingMessage = null;
  },
  render: function render() {
    return React.createElement('div', { className: 'interruptingMessageBox' }, React.createElement('div', { className: 'overlay', onClick: this.close }), React.createElement('div', { id: 'interruptingMessage' }, React.createElement('div', { id: 'interruptingMessageClose', onClick: this.close }, '×'), React.createElement('div', { id: 'interruptingMessageContent', dangerouslySetInnerHTML: { __html: this.props.messageHTML } })));
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
            ) : React.createElement('td', { className: 'empty' }),
            row[1] ? React.createElement(
              'td',
              null,
              row[1]
            ) : React.createElement('td', { className: 'empty' })
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
        { className: 'int-en' },
        message
      ),
      React.createElement(
        'span',
        { className: 'int-he' },
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

var Footer = React.createClass({
  displayName: 'Footer',

  trackLanguageClick: function trackLanguageClick(language) {
    Sefaria.site.track.setInterfaceLanguage('interface language footer', language);
  },
  render: function render() {
    var currentPath = Sefaria.util.currentPath();
    var currentPathEncoded = encodeURIComponent(currentPath);
    var next = currentPathEncoded ? currentPathEncoded : '?home';
    return React.createElement(
      'div',
      { id: 'footerInner' },
      React.createElement(
        'div',
        { className: 'section' },
        React.createElement(
          'div',
          { className: 'header' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'About'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'אודות'
          )
        ),
        React.createElement(
          'a',
          { href: '/about', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'What is Sefaria?'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'מהי ספאריה'
          )
        ),
        React.createElement(
          'a',
          { href: '/help', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Help'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'עזרה'
          )
        ),
        React.createElement(
          'a',
          { href: 'https://blog.sefaria.org', target: '_blank', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Blog'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'בלוג'
          )
        ),
        React.createElement(
          'a',
          { href: '/faq', target: '_blank', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'FAQ'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'שאלות נפוצות'
          )
        ),
        React.createElement(
          'a',
          { href: '/team', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Team'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'צוות'
          )
        ),
        React.createElement(
          'a',
          { href: '/terms', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Terms of Use'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'תנאי שימוש'
          )
        ),
        React.createElement(
          'a',
          { href: '/privacy-policy', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Privacy Policy'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'מדיניות הפרטיות'
          )
        )
      ),
      React.createElement(
        'div',
        { className: 'section' },
        React.createElement(
          'div',
          { className: 'header' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Educators'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'מחנכים'
          )
        ),
        React.createElement(
          'a',
          { href: '/educators', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Teach with Sefaria'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'למד באמצעות ספאריה'
          )
        ),
        React.createElement(
          'a',
          { href: '/sheets', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Source Sheets'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'דפי מקורות'
          )
        ),
        React.createElement(
          'a',
          { href: '/visualizations', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Visualizations'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'עזרים חזותיים'
          )
        ),
        React.createElement(
          'a',
          { href: '/people', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Authors'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'מחברים'
          )
        ),
        React.createElement(
          'a',
          { href: '/updates', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'New Additions'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'מה חדש'
          )
        )
      ),
      React.createElement(
        'div',
        { className: 'section' },
        React.createElement(
          'div',
          { className: 'header' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Developers'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'מפתחים'
          )
        ),
        React.createElement(
          'a',
          { href: '/developers', target: '_blank', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Get Involved'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'הצטרף אלינו'
          )
        ),
        React.createElement(
          'a',
          { href: '/developers#api', target: '_blank', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'API Docs'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'מסמכי API'
          )
        ),
        React.createElement(
          'a',
          { href: 'https://github.com/Sefaria/Sefaria-Project', target: '_blank', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Fork us on GitHub'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'זלגו חופשי מגיטהאב'
          )
        ),
        React.createElement(
          'a',
          { href: 'https://github.com/Sefaria/Sefaria-Export', target: '_blank', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Download our Data'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'הורד את בסיס הנתונים שלנו'
          )
        )
      ),
      React.createElement(
        'div',
        { className: 'section' },
        React.createElement(
          'div',
          { className: 'header' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Join Us'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'הצטרף אלינו'
          )
        ),
        React.createElement(
          'a',
          { href: '/donate', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Donate'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'תרומות'
          )
        ),
        React.createElement(
          'a',
          { href: '/supporters', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Supporters'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'תומכים'
          )
        ),
        React.createElement(
          'a',
          { href: '/contribute', target: '_blank', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Contribute'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'הצטרף'
          )
        ),
        React.createElement(
          'a',
          { href: '/jobs', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Jobs'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'דרושים'
          )
        )
      ),
      React.createElement(
        'div',
        { className: 'section last' },
        React.createElement(
          'div',
          { className: 'header' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Connect'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'התחבר'
          )
        ),
        React.createElement(
          'a',
          { href: 'http://www.facebook.com/sefaria.org', target: '_blank', className: 'outOfAppLink' },
          React.createElement('i', { className: 'fa fa-facebook-official' }),
          React.createElement(
            'span',
            { className: 'int-en' },
            'Facebook'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'פייסבוק'
          )
        ),
        React.createElement(
          'a',
          { href: 'http://twitter.com/SefariaProject', target: '_blank', className: 'outOfAppLink' },
          React.createElement('i', { className: 'fa fa-twitter' }),
          React.createElement(
            'span',
            { className: 'int-en' },
            'Twitter'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'טוויטר'
          )
        ),
        React.createElement(
          'a',
          { href: 'http://www.youtube.com/user/SefariaProject', target: '_blank', className: 'outOfAppLink' },
          React.createElement('i', { className: 'fa fa-youtube' }),
          React.createElement(
            'span',
            { className: 'int-en' },
            'YouTube'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'יוטיוב'
          )
        ),
        React.createElement(
          'a',
          { href: 'https://groups.google.com/forum/?fromgroups#!forum/sefaria', target: '_blank', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Forum'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'פורום'
          )
        ),
        React.createElement(
          'a',
          { href: 'mailto:hello@sefaria.org', target: '_blank', className: 'outOfAppLink' },
          React.createElement(
            'span',
            { className: 'int-en' },
            'Email'
          ),
          React.createElement(
            'span',
            { className: 'int-he' },
            'דוא"ל'
          )
        ),
        React.createElement(
          'div',
          { id: 'siteLanguageToggle' },
          React.createElement(
            'div',
            { id: 'siteLanguageToggleLabel' },
            React.createElement(
              'span',
              { className: 'int-en' },
              'Site Language:'
            ),
            React.createElement(
              'span',
              { className: 'int-he' },
              'שפת האתר'
            )
          ),
          React.createElement(
            'a',
            { href: "/interface/english?next=" + next, id: 'siteLanguageEnglish', className: 'outOfAppLink',
              onClick: this.trackLanguageClick.bind(null, "English") },
            'English'
          ),
          '|',
          React.createElement(
            'a',
            { href: "/interface/hebrew?next=" + next, id: 'siteLanguageHebrew', className: 'outOfAppLink',
              onClick: this.trackLanguageClick.bind(null, "Hebrew") },
            '                 עברית'
          )
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
  // Note Sefaria.booksDict in generated on the client from Sefaria.books, but not on the server to save cycles
  Sefaria.calendar = data.calendar;

  Sefaria._cacheIndexFromToc(Sefaria.toc);
  Sefaria.recentlyViewed = data.recentlyViewed ? data.recentlyViewed.map(Sefaria.unpackRecentItem) : [];
  Sefaria.util._defaultPath = data.path;
  Sefaria.loggedIn = data.loggedIn;
  Sefaria._uid = data._uid;
  Sefaria.is_moderator = data.is_moderator;
  Sefaria.is_editor = data.is_editor;
};

if (typeof exports !== 'undefined') {
  exports.ReaderApp = ReaderApp;
  exports.ReaderPanel = ReaderPanel;
  exports.ConnectionsPanel = ConnectionsPanel;
  exports.TextRange = TextRange;
  exports.TextColumn = TextColumn;
  exports.Footer = Footer;
  exports.setData = setData;
  exports.unpackDataFromProps = Sefaria.unpackDataFromProps;
}

