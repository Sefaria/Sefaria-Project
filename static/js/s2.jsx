if (typeof require !== 'undefined') {
  var INBROWSER    = false,
      React        = require('react'),
      ReactDOM     = require('react-dom'),
      $            = require('jquery'),
      extend       = require('extend'),
      classNames   = require('classnames'),
      Sefaria      = require('./sefaria.js'),
      cookie       = Sefaria.util.cookie;
} else { 
  var INBROWSER    = true,
      extend       = $.extend,
      cookie       = $.cookie;
}


var ReaderApp = React.createClass({
  propTypes: {
    multiPanel:                  React.PropTypes.bool,
    headerMode:                  React.PropTypes.bool,  // is S2 serving only as a header on top of another page?
    loggedIn:                    React.PropTypes.bool,
    interfaceLang:               React.PropTypes.string,
    initialRefs:                 React.PropTypes.array,
    initialFilter:               React.PropTypes.array,
    initialMenu:                 React.PropTypes.string,
    initialPartner:              React.PropTypes.string,
    initialQuery:                React.PropTypes.string,
    initialSearchFilters:        React.PropTypes.array,
    initialSheetsTag:            React.PropTypes.string,
    initialNavigationCategories: React.PropTypes.array,
    initialSettings:             React.PropTypes.object,
    initialPanels:               React.PropTypes.array,
    initialDefaultVersions:      React.PropTypes.object,
    initialPath:                 React.PropTypes.string,
    initialPanelCap:             React.PropTypes.number
  },
  getDefaultProps: function() {
    return {
      multiPanel:                  true,
      headerMode:                  false,  // is S2 serving only as a header on top of another page?
      interfaceLang:               "english",
      initialRefs:                 [],
      initialFilter:               null,
      initialMenu:                 null,
      initialPartner:              null,
      initialQuery:                null,
      initialSearchFilters:        [],
      initialSheetsTag:            null,
      initialNavigationCategories: [],
      initialPanels:               [],
      initialDefaultVersions:      {},
      initialPanelCap:             2,
      initialPath:                 "/"
    };
  },
  getInitialState: function() {
    // TODO clean up generation of initial panels objects.
    // Currently these get generated in reader/views.py, then regenerated in s2.html then regenerated again in ReaderApp.
    var panels               = [];
    var header               = {};
    var defaultVersions      = Sefaria.util.clone(this.props.initialDefaultVersions) || {};
    var defaultPanelSettings = this.getDefaultPanelSettings();

    if (!this.props.multiPanel && !this.props.headerMode) {
      if (this.props.initialPanels && this.props.initialPanels.length > 0 && this.props.initialPanels[0].menuOpen == "book toc") {
        panels[0] = {
            settings: Sefaria.util.clone(defaultPanelSettings),
            menuOpen: "book toc",
            //mode: "Text",
            bookRef:  this.props.initialPanels[0].bookRef
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
          panels[0].settings.language = (panels[0].versionLanguage == "he")? "hebrew": "english";
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
        partner: this.props.initialPartner,
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
          settings: ("settings" in this.props.initialPanels[0]) ? extend(Sefaria.util.clone(defaultPanelSettings), this.props.initialPanels[0].settings) : Sefaria.util.clone(defaultPanelSettings)
        };
        if (p.versionLanguage && !"settings" in this.props.initialPanels[0]) {
          p.settings.language = (p.versionLanguage == "he") ? "hebrew" : "english";
        }
        panels.push(p);
      }
      for (var i = panels.length; i < this.props.initialPanels.length; i++) {
        var panel;
        if (this.props.initialPanels[i].menuOpen == "book toc") {
          panel = {
              menuOpen: this.props.initialPanels[i].menuOpen,
              bookRef:  this.props.initialPanels[i].bookRef,
              settings: ("settings" in this.props.initialPanels[i]) ? extend(Sefaria.util.clone(defaultPanelSettings), this.props.initialPanels[i].settings) : Sefaria.util.clone(defaultPanelSettings)
          };
        } else {
          panel = this.clonePanel(this.props.initialPanels[i]);
          panel.settings = Sefaria.util.clone(defaultPanelSettings);
          if (panel.versionLanguage && !"settings" in this.props.initialPanels[i]) {
            panel.settings.language = (panel.versionLanguage == "he") ? "hebrew" : "english";
          }
        }
        panels.push(panel);
      }
    }
    panels = panels.map(function(panel) { 
      return this.makePanelState(panel); 
    }.bind(this) );

    var layoutOrientation = (this.props.interfaceLang == "english") ? "ltr" : "rtl";
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
  componentDidMount: function() {
    this.updateHistoryState(true); // make sure initial page state is in history, (passing true to replace)
    window.addEventListener("popstate", this.handlePopState);
    window.addEventListener("resize", this.setPanelCap);
    window.addEventListener("beforeunload", this.saveOpenPanelsToRecentlyViewed);
    this.setPanelCap();
    if (this.props.headerMode) {
      $(".inAppLink").on("click", this.handleInAppLinkClick);
    }
    // Set S2 cookie, putting user into S2 mode site wide
    cookie("s2", true, {path: "/"});
  },
  componentWillUnmount: function() {
    window.removeEventListener("popstate", this.handlePopState);
    window.removeEventListener("resize", this.setPanelCap);
    window.removeEventListener("beforeunload", this.saveOpenPanelsToRecentlyViewed);
  },
  componentWillUpdate: function(nextProps, nextState) {
  },
  componentDidUpdate: function(prevProps, prevState) {
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
  },
  handlePopState: function(event) {
    var state = event.state;
    // console.log("Pop - " + window.location.pathname);
    // console.log(state);
    if (state) {
      var kind = "";
      if (Sefaria.site) { Sefaria.site.track.event("Reader", "Pop State", kind); }
      this.justPopped = true;
      this.setState(state);
      this.setContainerMode();
    }
  },
  _canTrackPageview: function() {
      if (!Sefaria.site) { return false; }
      return true;
  },
  trackPageview: function() {
      if (!this._canTrackPageview()) { return; }

      var headerPanel = this.state.header.menuOpen || (!this.state.panels.length && this.state.header.mode === "Header");
      var panels = headerPanel ? [this.state.header] : this.state.panels;
      var textPanels = panels.filter(panel => (panel.refs.length || panel.bookRef) && panel.mode !== "Connections");
      var connectionPanels = panels.filter(panel => panel.mode == "Connections");

      // Set Page Type
      // Todo: More specificity for sheets - browsing, reading, writing
      if (panels.length < 1) { debugger; }
      else { Sefaria.site.track.setPageType(panels[0].menuOpen || panels[0].mode); }

      // Number of panels as e.g. "2" meaning 2 text panels or "3.2" meaning 3 text panels and 2 connection panels
      if (connectionPanels.length == 0) {
        Sefaria.site.track.setNumberOfPanels(textPanels.length.toString());
      } else {
        Sefaria.site.track.setNumberOfPanels(`${textPanels.length}.${connectionPanels.length}`);
      }

      // refs - per text panel
      var refs =  textPanels.map(panel => (panel.refs.length) ? panel.refs.slice(-1)[0] : panel.bookRef);
      Sefaria.site.track.setRef(refs.join(" | "));

      // Book name (Index record primary name) - per text panel
      var bookNames = refs.map(ref => Sefaria.parseRef(ref).index).filter(b => !!b);
      Sefaria.site.track.setBookName(bookNames.join(" | "));

      // Indexes - per text panel
      var indexes = bookNames.map(b => Sefaria.index(b)).filter(i => !!i);

      // categories - per text panel
      var primaryCats = indexes.map(i => (i.dependence === "Commentary")? i.categories[0] + " Commentary": i.categories[0]);
      Sefaria.site.track.setPrimaryCategory(primaryCats.join(" | "));

      var secondaryCats = indexes.map(i => {
          var cats = i.categories..filter(cat=> cat != "Commentary").slice(1);
          return (cats.length >= 1) ? cats[0] : ""
      });
      Sefaria.site.track.setSecondaryCategory(secondaryCats.join(" | "));

      // panel content languages - per text panel
      var contentLanguages = textPanels.map(panel => panel.settings.language);
      Sefaria.site.track.setContentLanguage(contentLanguages.join(" | "));

      // Set Versions - per text panel
      var versionTitles = textPanels.map(p => p.version?`${p.version}(${p.versionLanguage})`:"default version");
      Sefaria.site.track.setVersionTitle(versionTitles.join(" | "));

      // Set Sidebar usages
      // todo: handle toolbar selections
      var sidebars = connectionPanels.map(panel => panel.filter.length ? panel.filter.join("+") : "all");
      Sefaria.site.track.setSidebars(sidebars.join(" | "));

      // After setting the dimensions, post the hit
      var url = window.location.pathname + window.location.search;
      Sefaria.site.track.pageview(url);

      if (!this.state.initialAnalyticsTracked) {
        this.setState({initialAnalyticsTracked: true});
      }
  },
  shouldHistoryUpdate: function() {
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

    for (var i = 0; i < prevPanels.length; i++) {
      // Cycle through each panel, compare previous state to next state, looking for differences
      var prev  = prevPanels[i];
      var next  = nextPanels[i];

      if (!prev || ! next) { return true; }

      if ((prev.mode !== next.mode) ||
          (prev.menuOpen !== next.menuOpen) ||
          (prev.menuOpen === "book toc" && prev.bookRef !== next.bookRef) ||
          (next.mode === "Text" && prev.refs.slice(-1)[0] !== next.refs.slice(-1)[0]) || 
          (next.mode === "TextAndConnections" && prev.highlightedRefs.slice(-1)[0] !== next.highlightedRefs.slice(-1)[0]) || 
          ((next.mode === "Connections" || next.mode === "TextAndConnections") && prev.filter && !prev.filter.compare(next.filter)) ||
          (next.mode === "Connections" && !prev.refs.compare(next.refs)) ||
          (prev.navigationSheetTag !== next.navigationSheetTag) ||
          (prev.version !== next.version) ||
          (prev.versionLanguage !== next.versionLanguage) ||
          (prev.searchQuery != next.searchQuery) ||
          (prev.appliedSearchFilters && next.appliedSearchFilters && (prev.appliedSearchFilters.length !== next.appliedSearchFilters.length)) ||
          (prev.appliedSearchFilters && next.appliedSearchFilters && !(prev.appliedSearchFilters.compare(next.appliedSearchFilters))) ||
          (prev.settings.language != next.settings.language))
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
  },
  clonePanel: function(panel, trimFilters) {
    //Set aside self-referential objects before cloning
    //Todo: Move the multiple instances of this out to a utils file
    if (panel.availableFilters || panel.filterRegistry) {
      var savedAttributes = {
         availableFilters:   panel.availableFilters,
         searchFiltersValid: panel.searchFiltersValid,
         filterRegistry:     panel.filterRegistry
      };
      panel.searchFiltersValid = false;
      panel.availableFilters = [];
      panel.filterRegistry = {};
      var newPanel = (trimFilters) ? Sefaria.util.clone(panel) : extend(Sefaria.util.clone(panel), savedAttributes);
      extend(panel, savedAttributes);
      return newPanel;
    } else {
      return Sefaria.util.clone(panel);
    }
  },
  makeHistoryState: function() {
    // Returns an object with state, title and url params for the current state
    var histories = [];
    // When the header has a panel open, only look at its content for history
    var headerPanel = this.state.header.menuOpen || (!this.state.panels.length && this.state.header.mode === "Header");
    var panels = headerPanel ? [this.state.header] : this.state.panels;
    var states = [];
    for (var i = 0; i < panels.length; i++) {
      // Walk through each panel, create a history object as though for this panel alone
      states[i] = this.clonePanel(panels[i], true);
      if (!states[i]) { debugger; }
      var state = states[i];
      var hist  = {url: ""};
    
      if (state.menuOpen) {
        switch (state.menuOpen) {
          case "home":
            hist.title = "Sefaria: a Living Library of Jewish Texts Online";
            hist.url   = "";
            hist.mode  = "home";
            break;
          case "navigation":
            var cats   = state.navigationCategories ? state.navigationCategories.join("/") : "";
            hist.title = cats ? state.navigationCategories.join(", ") + " | Sefaria" : "Texts | Sefaria";
            hist.url   = "texts" + (cats ? "/" + cats : "");
            hist.mode  = "navigation";
            break;
          case "text toc":
            var ref    = state.refs.slice(-1)[0];
            var bookTitle  = ref ? Sefaria.parseRef(ref).index : "404";
            hist.title = bookTitle + " | Sefaria";
            hist.url   = bookTitle.replace(/ /g, "_");
            hist.mode  = "text toc";
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
            hist.url   = "search" + (state.searchQuery ? "&q=" + query + ((!!state.appliedSearchFilters && !!state.appliedSearchFilters.length) ? "&filters=" + state.appliedSearchFilters.join("|") : "") : "");
            hist.mode  = "search";
            break;
          case "sheets":
            if (states[i].sheetsPartner) {
                hist.url   = "partners/" + state.sheetsPartner.replace(/\s/g,"_");
                hist.title = state.sheetsPartner + " | Sefaria Source Sheets";
                hist.mode  = "sheets tag";
            } else if (states[i].navigationSheetTag) {
              if (states[i].navigationSheetTag == "My Sheets") {
                hist.url   = "sheets/private";
                hist.title = "My Sheets | Sefaria Source Sheets";
                hist.mode  = "sheets tag";
              }
              else {
                hist.url   = "sheets/tags/" + state.navigationSheetTag;
                hist.title = state.navigationSheetTag + " | Sefaria Source Sheets";
                hist.mode  = "sheets tag";
              }
            } else {
              hist.url   = "sheets";
              hist.title = "Sefaria Source Sheets";
              hist.mode  = "sheets";
            }
            break;
          case "account":
            hist.title = "Sefaria About";
            hist.url   = "account";
            hist.mode  = "account";
            break;
          case "notifications":
            hist.title = "Sefaria Notifcations";
            hist.url   = "notifications";
            hist.mode  = "notifications";
            break;
          case "updates":
            hist.title = "New at Sefaria";
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
        hist.title    = state.refs.slice(-1)[0];
        hist.url      = Sefaria.normRef(hist.title);
        hist.version  = state.version;
        hist.versionLanguage = state.versionLanguage;
        hist.mode     = "Text"
      } else if (state.mode === "Connections") {
        var ref       = state.refs.slice(-1)[0];
        hist.sources  = state.filter.length ? state.filter.join("+") : "all";
        hist.title    = ref  + " with " + (hist.sources === "all" ? "Connections" : hist.sources);
        hist.url      = Sefaria.normRef(ref); // + "?with=" + sources;
        hist.mode     = "Connections"
      } else if (state.mode === "TextAndConnections") {
        var ref       = state.highlightedRefs.slice(-1)[0];
        hist.sources  = state.filter.length ? state.filter[0] : "all";
        hist.title    = ref  + " with " + (hist.sources === "all" ? "Connections" : hist.sources);
        hist.url      = Sefaria.normRef(ref); // + "?with=" + sources;
        hist.version  = state.version;
        hist.versionLanguage = state.versionLanguage;
        hist.mode     = "TextAndConnections"
      } else if (state.mode === "Header") {
        hist.title    = document.title;
        hist.url      = window.location.pathname.slice(1);
        if (window.location.search != ""){
          hist.url += window.location.search;
        }
        hist.mode   = "Header"
      }
      if (state.mode !== "Header") {
        hist.lang =  state.settings.language.substring(0,2);
      }
      histories.push(hist);     
    }
    if (!histories.length) {debugger;}

    // Now merge all history objects into one
    var title =  histories.length ? histories[0].title : "Sefaria";

    var url   = "/" + (histories.length ? histories[0].url : "");
    if(histories[0] && histories[0].versionLanguage && histories[0].version) {
        url += "/" + histories[0].versionLanguage + "/" + histories[0].version.replace(/\s/g,"_");
    }
    if (histories[0].mode === "TextAndConnections") {
        url += "&with=" + histories[0].sources;
    }
    if(histories[0].lang) {
        url += "&lang=" + histories[0].lang;
    }
    hist = (headerPanel)
        ? {state: {header: states[0]}, url: url, title: title}
        : {state: {panels: states}, url: url, title: title};
    for (var i = 1; i < histories.length; i++) {
      if (histories[i-1].mode === "Text" && histories[i].mode === "Connections") {
        if (i == 1) {
          // short form for two panels text+commentary - e.g., /Genesis.1?with=Rashi
          hist.url   = "/" + histories[1].url; // Rewrite the URL
          if(histories[0].versionLanguage && histories[0].version) {
            hist.url += "/" + histories[0].versionLanguage + "/" + histories[0].version.replace(/\s/g,"_");
          }
          if(histories[0].lang) {
            hist.url += "&lang=" + histories[0].lang;
          }
          hist.url += "&with=" + histories[1].sources;
          hist.title = histories[1].title;
        } else {
          var replacer = "&p" + i + "=";
          hist.url    = hist.url.replace(RegExp(replacer + ".*"), "");
          hist.url   += replacer + histories[i].url;
          if(histories[i-1].versionLanguage && histories[i-1].version) {
          hist.url += "&l" + (i) + "=" + histories[i-1].versionLanguage +
                      "&v" + (i) + "=" + histories[i-1].version.replace(/\s/g,"_");
          }
          if(histories[i-1].lang) {
            hist.url += "&lang" + (i) + "=" + histories[i-1].lang;
          }
          hist.url   += "&w" + i + "=" + histories[i].sources; //.replace("with=", "with" + i + "=").replace("?", "&");
          hist.title += " & " + histories[i].title; // TODO this doesn't trim title properly
        }
      } else {
        var next    = "&p=" + histories[i].url;
        next        = next.replace("?", "&").replace(/=/g, (i+1) + "=");
        hist.url   += next;
        if(histories[i].versionLanguage && histories[i].version) {
          hist.url += "&l" + (i+1) + "=" + histories[i].versionLanguage + 
                      "&v" + (i+1) + "=" + histories[i].version.replace(/\s/g,"_");
        }
        hist.title += " & " + histories[i].title;
      }
      if(histories[i].lang) {
        hist.url += "&lang" + (i+1) + "=" + histories[i].lang;
      }
    }
    // Replace the first only & with a ? 
    hist.url = hist.url.replace(/&/, "?");

    return hist;
  },
  // These two methods to check scroll intent have similar implementations on the panel level.  Refactor?
  _refState: function() {
    // Return a single flat list of all the refs across all panels
    var panels = (this.props.multiPanel)? this.state.panels : [this.state.header];
    return [].concat(...panels.map(p => p.refs || []))
  },
  checkScrollIntentAndTrack: function() {
    // Record current state of panel refs, and check if it has changed after some delay.  If it remains the same, track analytics.
    var intentDelay = 3000;  // Number of milliseconds to demonstrate intent
    // console.log("Setting scroll intent check");
    window.setTimeout(function(initialRefs){
      // console.log("Checking scroll intent");
      if (initialRefs.compare(this._refState())) {
        this.trackPageview();
      }
    }.bind(this), intentDelay, this._refState());
  },
  updateHistoryState: function(replace) {
    if (!this.shouldHistoryUpdate()) {
      return; 
    }
    var hist = this.makeHistoryState();
    if (replace) {
      history.replaceState(hist.state, hist.title, hist.url);
      // console.log("Replace History - " + hist.url);
      if (this.state.initialAnalyticsTracked) { this.checkScrollIntentAndTrack(); }
      //console.log(hist);
    } else {
      if ((window.location.pathname + window.location.search) == hist.url) { return; } // Never push history with the same URL
      history.pushState(hist.state, hist.title, hist.url);
      // console.log("Push History - " + hist.url);
      this.trackPageview();
      //console.log(hist);
    }

    $("title").html(hist.title);
    this.replaceHistory = false;
  },
  makePanelState: function(state) {
    // Return a full representation of a single panel's state, given a partial representation in `state`
    var panel = {
      mode:                 state.mode,                // "Text", "TextAndConnections", "Connections"
      refs:                 state.refs                 || [], // array of ref strings
      filter:               state.filter               || [],
      connectionsMode:      state.connectionsMode      || "Connections",
      version:              state.version              || null,
      versionLanguage:      state.versionLanguage      || null,
      highlightedRefs:      state.highlightedRefs      || [],
      recentFilters:        state.filter               || [],
      menuOpen:             state.menuOpen             || null, // "navigation", "text toc", "display", "search", "sheets", "home", "book toc"
      navigationCategories: state.navigationCategories || [],
      navigationSheetTag:   state.sheetsTag            || null,
      sheetsPartner:        state.partner              || null,
      searchQuery:          state.searchQuery          || null,
      appliedSearchFilters: state.appliedSearchFilters || [],
      searchFiltersValid:   state.searchFiltersValid   || false,
      availableFilters:     state.availableFilters     || [],
      filterRegistry:       state.filterRegistry       || {},
      orphanSearchFilters:  state.orphanSearchFilters  || [],
      bookRef:              state.bookRef              || null,
      settings:             state.settings ? Sefaria.util.clone(state.settings) : Sefaria.util.clone(this.getDefaultPanelSettings()),
      displaySettingsOpen:  false,
      tagSort:              state.tagSort              || "count",
      mySheetSort:          state.mySheetSort          || "date",
      initialAnalyticsTracked: state.initialAnalyticsTracked || false
    };
    if (this.state && panel.refs.length && !panel.version) {
      var oRef = Sefaria.ref(panel.refs[0]);
      if (oRef) {
        var lang = panel.versionLanguage || (panel.settings.language == "hebrew"?"he":"en");
        panel.version = this.getCachedVersion(oRef.indexTitle, lang);
        if (panel.version) {
          panel.versionLanguage = lang;
        }
      }
    }
    return panel;
  },
  getDefaultPanelSettings: function() {
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
        biLayout:      "stacked",
        color:         "light",
        fontSize:      62.5
      };
    }
  },
  setContainerMode: function() {
    // Applies CSS classes to the React container so that S2 can function as a header only on top of another page.
    // todo: because headerMode CSS was messing stuff up, header links are reloads in headerMode.  So - not sure if this method is still needed.
    if (this.props.headerMode) {
      if (this.state.header.menuOpen || this.state.panels.length) {
        $("#s2").removeClass("headerOnly");
        $("body").css({overflow: "hidden"});
      } else {
        $("#s2").addClass("headerOnly");
        $("body").css({overflow: "auto"});
      }
    }
  },
  MIN_PANEL_WIDTH: 360.0,
  setPanelCap: function() {
    // In multi panel mode, set the maximum number of visible panels depending on the window width.
    this.setWindowWidth();
    var panelCap = Math.floor($(window).outerWidth() / this.MIN_PANEL_WIDTH);
    // console.log("Setting panelCap: " + panelCap);
    this.setState({panelCap: panelCap});
  },
  setWindowWidth: function() {
    // console.log("Setting window width: " + $(window).outerWidth());
    this.setState({windowWidth: $(window).outerWidth()});
  },
  handleNavigationClick: function(ref, version, versionLanguage, options) {
    this.openPanel(ref, version, versionLanguage, options);
  },
  handleSegmentClick: function(n, ref) {
    // Handle a click on a text segment `ref` in from panel in position `n`
    // Update or add panel after this one to be a TextList
    this.setTextListHighlight(n, [ref]);
    this.openTextListAt(n+1, [ref]);
  },
  handleCitationClick: function(n, citationRef, textRef) {
    // Handle clicking on the citation `citationRef` which was found inside of `textRef` in panel `n`.
    if (this.state.panels.length > n+1  && this.state.panels[n+1].mode === "Connections") {
      this.closePanel(n+1);
    }
    this.setTextListHighlight(n, [textRef]);
    this.openPanelAt(n, citationRef);
  },
  handleRecentClick: function(pos, ref, version, versionLanguage) {
    // Click on an item in your Recently Viewed
    if (this.props.multiPanel) {
      this.openPanel(ref, version, versionLanguage);
    } else {
      this.handleNavigationClick(ref, version, versionLanguage);
    }
  },
  handleCompareSearchClick: function(n, ref, version, versionLanguage, options) {
    // Handle clicking a search result in a compare panel, so that clicks don't clobber open panels
    // todo: support options.highlight, passed up from SearchTextResult.handleResultClick()
    this.saveOpenPanelsToRecentlyViewed();
    this.replacePanel(n, ref, version, versionLanguage);
  },
  handleInAppLinkClick: function(e) {
    e.preventDefault();
    var path = $(e.currentTarget).attr("href").slice(1);
    if (path == "texts") {
      this.showLibrary();
    } else if (path == "sheets") {
      this.showSheets();
    } else if (Sefaria.isRef(path)) {
      this.openPanel(Sefaria.humanRef(path));
    }
  },
  updateQueryInHeader: function(query) {
    var updates = {searchQuery: query, searchFiltersValid:  false};
    this.setHeaderState(updates);
  },
  updateQueryInPanel: function(query) {
    var updates = {searchQuery: query, searchFiltersValid:  false};
    this.setPanelState(0, updates);
  },
  updateAvailableFiltersInHeader: function(availableFilters, registry, orphans) {
    this.setHeaderState({
      availableFilters:    availableFilters,
      filterRegistry:      registry,
      orphanSearchFilters: orphans,
      searchFiltersValid:  true
    });
  },
  updateAvailableFiltersInPanel: function(availableFilters, registry, orphans) {
    this.setPanelState(0, {
      availableFilters:    availableFilters,
      filterRegistry:      registry,
      orphanSearchFilters: orphans,
      searchFiltersValid:  true
    });
  },
  updateSearchFilterInHeader: function(filterNode) {
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
  updateSearchFilterInPanel: function(filterNode) {
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
  getAppliedSearchFilters: function(availableFilters) {
    var results = [];
    //results = results.concat(this.orphanFilters);
    for (var i = 0; i < availableFilters.length; i++) {
        results = results.concat(availableFilters[i].getAppliedFilters());
    }
    return results;
  },
  setPanelState: function(n, state, replaceHistory) {
    this.replaceHistory  = Boolean(replaceHistory);
    //console.log(`setPanel State ${n}, replace: ` + this.replaceHistory);
    //console.log(state)

    // When the driving panel changes language, carry that to the dependent panel
    // However, when carrying a language change to the Tools Panel, do not carry over an incorrect version
    var langChange  = state.settings && state.settings.language !== this.state.panels[n].settings.language;
    var next        = this.state.panels[n+1];
    if (langChange && next && next.mode === "Connections" && state.settings.language !== "bilingual") {
        next.settings.language = state.settings.language;
        if (next.settings.language.substring(0,2) != this.state.panels[n].versionLanguage){
            next.versionLanguage = null;
            next.version = null;
        } else {
            next.versionLanguage = this.state.panels[n].versionLanguage;
            next.version = this.state.panels[n].version;
        }
    }
    this.state.panels[n] = extend(this.state.panels[n], state);
    this.setState({panels: this.state.panels});
  },
  selectVersion: function(n, versionName, versionLanguage) {
    // Set the version for panel `n`. 
    var panel = this.state.panels[n];
    var oRef = Sefaria.ref(panel.refs[0]);

    if (versionName && versionLanguage) {
      panel.version = versionName;
      panel.versionLanguage = versionLanguage;
      panel.settings.language = (panel.versionLanguage == "he")? "hebrew": "english";

      this.setCachedVersion(oRef.indexTitle, panel.versionLanguage, panel.version);
      Sefaria.site.track.event("Reader", "Choose Version", `${oRef.indexTitle} / ${panel.version} / ${panel.versionLanguage}`)
    } else {
      panel.version = null;
      panel.versionLanguage = null;
      Sefaria.site.track.event("Reader", "Choose Version", `${oRef.indexTitle} / default version / ${panel.settings.language}`)
    }
    
    if((this.state.panels.length > n+1) && this.state.panels[n+1].mode == "Connections"){
      var connectionsPanel =  this.state.panels[n+1];
      connectionsPanel.version = panel.version;
      connectionsPanel.versionLanguage = panel.versionLanguage;
    }
    this.setState({panels: this.state.panels});
  },
  // this.state.defaultVersion is a depth 2 dictionary - keyed: bookname, language
  getCachedVersion: function(indexTitle, language) {
    if ((!indexTitle) || (!(this.state.defaultVersions[indexTitle]))) { return null; }
    return (language) ? (this.state.defaultVersions[indexTitle][language] || null) : this.state.defaultVersions[indexTitle];
  },
  setCachedVersion: function(indexTitle, language, versionTitle) {
    this.state.defaultVersions[indexTitle] = this.state.defaultVersions[indexTitle] || {};
    this.state.defaultVersions[indexTitle][language] = versionTitle;  // Does this need a setState?  I think not.
  },
  setHeaderState: function(state, replaceHistory) {
    this.state.header = extend(this.state.header, state);
    this.setState({header: this.state.header});
  },
  setDefaultOption: function(option, value) {
    if (value !== this.state.defaultPanelSettings[option]) {
      this.state.defaultPanelSettings[option] = value;
      this.setState(this.state);
    }
  },
  openPanel: function(ref, version, versionLanguage, options) {
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
      panel = this.makePanelState({"menuOpen": "book toc", "bookRef": index.title});
    } else {
      panel = this.makePanelState({refs: [ref], version: version, versionLanguage: versionLanguage, mode: "Text"});
    }

    this.setHeaderState({menuOpen: null});
    this.setState({panels: [panel]});
  },
  openPanelAt: function(n, ref, version, versionLanguage) {
    // Open a new panel after `n` with the new ref

    // If book level, Open book toc
    var index = Sefaria.index(ref); // Do we have to worry about normalization, as in Header.subimtSearch()?
    var panel;
    if (index) {
      panel = this.makePanelState({"menuOpen": "book toc", "bookRef": index.title});
    } else {
      panel = this.makePanelState({refs: [ref], version: version, versionLanguage: versionLanguage, mode: "Text"});
    }

    var newPanels = this.state.panels.slice();
    newPanels.splice(n+1, 0, panel);
    this.setState({panels: newPanels});
    this.setHeaderState({menuOpen: null});
  },
  openPanelAtEnd: function(ref, version, versionLanguage) {
    this.openPanelAt(this.state.panels.length+1, ref, version, versionLanguage);
  },
  openTextListAt: function(n, refs) {
    // Open a connections panel at position `n` for `refs`
    // Replace panel there if already a connections panel, otherwise splice new panel into position `n`
    // `refs` is an array of ref strings
    var newPanels = this.state.panels.slice();
    var panel = newPanels[n] || {};
    var parentPanel = (n >= 1 && newPanels[n-1].mode == 'Text') ? newPanels[n-1] : null;

    if (panel.mode !== "Connections") {
      // No connections panel is open yet, splice in a new one
      newPanels.splice(n, 0, {});
      panel = newPanels[n];
      panel.filter = [];
    }
    panel.refs           = refs;
    panel.menuOpen       = null;
    panel.mode           = panel.mode || "Connections";
    if(parentPanel){
      panel.filter          = parentPanel.filter;
      panel.recentFilters   = parentPanel.recentFilters;
      panel.version         = parentPanel.version;
      panel.versionLanguage = parentPanel.versionLanguage;
    }
    panel.settings          = panel.settings ? panel.settings : Sefaria.util.clone(this.getDefaultPanelSettings()),
    panel.settings.language = panel.settings.language == "hebrew" ? "hebrew" : "english"; // Don't let connections panels be bilingual
    newPanels[n] = this.makePanelState(panel);
    this.setState({panels: newPanels});
  },
  setTextListHighlight: function(n, refs) {
    // Set the textListHighlight for panel `n` to `refs`
    refs = typeof refs === "string" ? [refs] : refs;
    this.state.panels[n].highlightedRefs = refs;
    this.setState({panels: this.state.panels});

    // If a connections panel is opened after n, update its refs as well.
    var next = this.state.panels[n+1];
    if (next && next.mode === "Connections" && !next.menuOpen) {
      this.openTextListAt(n+1, refs);
    }
  },
  setConnectionsFilter: function(n, filter) {
    // Set the filter for connections panel at `n`, carry data onto the panel's basetext as well.
    var connectionsPanel = this.state.panels[n];
    var basePanel        = this.state.panels[n-1];
    if (filter) {
      connectionsPanel.recentFilters.push(filter);
      connectionsPanel.filter = [filter];
    } else {
      connectionsPanel.filter = [];
    }
    if (basePanel) {
      basePanel.filter        = connectionsPanel.filter;
      basePanel.recentFilters = connectionsPanel.recentFilters;
    }
    this.setState({panels: this.state.panels});
  },
  setSelectedWords: function(n, words){
    //console.log(this.state.panels[n].refs);
    var next = this.state.panels[n+1];
    if (next && !next.menuOpen) {
      this.state.panels[n+1].selectedWords = words;
      this.setState({panels: this.state.panels});
    }
  },
  setUnreadNotificationsCount: function(n) {
    Sefaria.notificationCount = n;
    this.forceUpdate();
  },
  replacePanel: function(n, ref, version, versionLanguage) {
    // Opens a text in in place of the panel currently open at `n`.
    this.state.panels[n] = this.makePanelState({refs: [ref], version: version, versionLanguage: versionLanguage, mode: "Text"});
    this.setState({panels: this.state.panels});
  },
  openComparePanel: function(n) {
    var comparePanel = this.makePanelState({
      menuOpen: "compare"
    });
    Sefaria.site.track.event("Tools", "Compare Click");
    this.state.panels[n] = comparePanel;
    this.setState({panels: this.state.panels});
  },
  closePanel: function(n) {
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
    var state = {panels: this.state.panels};
    if (state.panels.length == 0) {
      this.showLibrary();
    }
    this.setState(state);
  },
  showLibrary: function() {
    if (this.props.multiPanel) {
      this.setState({header: this.makePanelState({menuOpen: "navigation"})});
    } else {
      if (this.state.panels.length) {
        this.state.panels[0].menuOpen = "navigation";
      } else {
        this.state.panels[0] = this.makePanelState({menuOpen: "navigation"});
      }
      this.setState({panels: this.state.panels});
    }
  },
  showSearch: function(query) {
    this.saveOpenPanelsToRecentlyViewed();
    var panel = this.makePanelState({menuOpen: "search", searchQuery: query, searchFiltersValid:  false});
    if (this.props.multiPanel) {
      this.setState({header: panel, panels: []});
    } else {
      this.setState({panels: [panel]});
    }
  },
  showSheets: function() {
    var updates = {menuOpen: "sheets"};
    if (this.props.multiPanel) {
      this.setHeaderState(updates);
    } else {
      this.setPanelState(0, updates);
    }
  },
  saveRecentlyViewed: function(panel, n) {
    if (panel.mode == "Connections" || !panel.refs.length) { return; }
    var ref  = panel.refs[0];
    var oRef = Sefaria.ref(ref);
    var json = cookie("recentlyViewed");
    var recent = json ? JSON.parse(json) : [];
    recent = recent.filter(function(item) {
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
    cookie("recentlyViewed", JSON.stringify(recent), {path: "/"});
  },
  saveOpenPanelsToRecentlyViewed: function() {
    for (var i = this.state.panels.length-1; i >= 0; i--) {
      this.saveRecentlyViewed(this.state.panels[i], i);
    }
  },
  rerender: function() {
    this.forceUpdate();
  },
  render: function() {
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
      evenWidth = (100.0 / panelStates.length);
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
      widths = panelStates.map(function() { return evenWidth; });
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
                    updateSearchFilter={this.updateSearchFilterInHeader}
                    registerAvailableFilters={this.updateAvailableFiltersInHeader}
                    setUnreadNotificationsCount={this.setUnreadNotificationsCount}
                    headerMode={this.props.headerMode}
                    panelsOpen={panelStates.length}
                    analyticsInitialized={this.state.initialAnalyticsTracked} />) : null;

    var panels = [];
    for (var i = 0; i < panelStates.length; i++) {
      var panel                    = this.clonePanel(panelStates[i]);
      var offset                   = widths.reduce(function(prev, curr, index, arr) { return index < i ? prev+curr : prev}, 0);
      var width                    = widths[i];
      var style                    = (this.state.layoutOrientation=="ltr")?{width: width + unit, left: offset + unit}:{width: width + unit, right: offset + unit};
      var onSegmentClick           = this.props.multiPanel ? this.handleSegmentClick.bind(null, i) : null;
      var onCitationClick          = this.handleCitationClick.bind(null, i);
      var onSearchResultClick      = this.props.multiPanel ? this.handleCompareSearchClick.bind(null, i) : this.handleNavigationClick;
      var onTextListClick          = null; // this.openPanelAt.bind(null, i);
      var onOpenConnectionsClick   = this.openTextListAt.bind(null, i+1);
      var setTextListHightlight    = this.setTextListHighlight.bind(null, i);
      var setSelectedWords         = this.setSelectedWords.bind(null, i);
      var openComparePanel         = this.openComparePanel.bind(null, i);
      var closePanel               = this.closePanel.bind(null, i);
      var setPanelState            = this.setPanelState.bind(null, i);
      var setConnectionsFilter     = this.setConnectionsFilter.bind(null, i);
      var selectVersion            = this.selectVersion.bind(null, i);

      var ref   = panel.refs && panel.refs.length ? panel.refs[0] : null;
      var oref  = ref ? Sefaria.parseRef(ref) : null;
      var title = oref && oref.book ? oref.book : 0;
      // Keys must be constant as text scrolls, but changing as new panels open in new positions
      // Use a combination of the panel number and text title
      var key   = i + title;
      var classes = classNames({readerPanelBox: 1, sidebar: panel.mode == "Connections"});
      panels.push(<div className={classes} style={style} key={key}>
                    <ReaderPanel 
                      initialState={panel}
                      interfaceLang={this.props.interfaceLang}
                      setCentralState={setPanelState}
                      multiPanel={this.props.multiPanel}
                      onSegmentClick={onSegmentClick}
                      onCitationClick={onCitationClick}
                      onTextListClick={onTextListClick}
                      onSearchResultClick={onSearchResultClick}
                      onNavigationClick={this.handleNavigationClick}
                      onRecentClick={this.handleRecentClick}
                      onOpenConnectionsClick={onOpenConnectionsClick}
                      openComparePanel={openComparePanel}
                      setTextListHightlight={setTextListHightlight}
                      setConnectionsFilter={setConnectionsFilter}
                      setSelectedWords={setSelectedWords}
                      selectVersion={selectVersion}
                      setDefaultOption={this.setDefaultOption}
                      onQueryChange={this.updateQueryInPanel}
                      updateSearchFilter={this.updateSearchFilterInPanel}
                      registerAvailableFilters={this.updateAvailableFiltersInPanel}
                      setUnreadNotificationsCount={this.setUnreadNotificationsCount}
                      closePanel={closePanel}
                      panelsOpen={panelStates.length}
                      masterPanelLanguage={panel.mode === "Connections" ? panelStates[i-1].settings.language : panel.settings.language}
                      layoutWidth={width}
                      analyticsInitialized={this.state.initialAnalyticsTracked}
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
          onClose={this.rerender} />) : null;
    var classDict = {readerApp: 1, multiPanel: this.props.multiPanel, singlePanel: !this.props.multiPanel};
    var interfaceLangClass = `interface-${this.props.interfaceLang}`;
    classDict[interfaceLangClass] = true
    var classes = classNames(classDict);
    return (<div className={classes}>
              {header}
              {panels}
              {interruptingMessage}
            </div>);
  }
});


var Header = React.createClass({
  propTypes: {
    initialState:                React.PropTypes.object.isRequired,
    headerMode:                  React.PropTypes.bool,
    setCentralState:             React.PropTypes.func,
    interfaceLang:               React.PropTypes.string,
    onRefClick:                  React.PropTypes.func,
    onRecentClick:               React.PropTypes.func,
    showLibrary:                 React.PropTypes.func,
    showSearch:                  React.PropTypes.func,
    setDefaultOption:            React.PropTypes.func,
    onQueryChange:               React.PropTypes.func,
    updateSearchFilter:          React.PropTypes.func,
    registerAvailableFilters:    React.PropTypes.func,
    setUnreadNotificationsCount: React.PropTypes.func,
    headerMesssage:              React.PropTypes.string,
    panelsOpen:                  React.PropTypes.number,
    analyticsInitialized:        React.PropTypes.bool,
  },
  getInitialState: function() {
    return this.props.initialState;
  },
  componentDidMount: function() {
    this.initAutocomplete();
  },
  componentWillReceiveProps: function(nextProps) {
    if (nextProps.initialState) {
      this.setState(nextProps.initialState);
    }
  },
  _searchOverridePre: 'Search for: "',
  _searchOverridePost: '"',
  _searchOverrideRegex: function() {
    return RegExp(`^${RegExp.escape(this._searchOverridePre)}(.*)${RegExp.escape(this._searchOverridePost)}`);
  },
  initAutocomplete: function() {
    $.widget( "custom.sefaria_autocomplete", $.ui.autocomplete, {
      _renderItem: function( ul, item) {
        var override = item.label.match(this._searchOverrideRegex());
		return $( "<li></li>" )
			.data( "item.autocomplete", item )
            .toggleClass("search-override", !!override)
			.append( $( "<a></a>" ).text( item.label ) )
			.appendTo( ul );
	  }.bind(this)
    } );
    $(ReactDOM.findDOMNode(this)).find("input.search").sefaria_autocomplete({
      position: {my: "left-12 top+14", at: "left bottom"},
      select: function( event, ui ) {
        $(ReactDOM.findDOMNode(this)).find("input.search").val(ui.item.value);  //This will disappear when the next line executes, but the eye can sometimes catch it.
        this.submitSearch(ui.item.value);
        return false;
      }.bind(this),
      source: function( request, response ) {
        // Commented out code will only put the "Search for: " in the list if the search is an exact match.
        //var exact = false;
        var matches = $.map( Sefaria.books, function(tag) {
            if ( tag.toUpperCase().indexOf(request.term.toUpperCase()) === 0 ) {
              //if (tag.toUpperCase() == request.term.toUpperCase()) {
              //  exact = true;
              //}
              return tag;
            }
          });
        var resp = matches.slice(0, 16); // limits return to 16 items
        //if (exact) {
        if (resp.length > 0) {
          resp.push(`${this._searchOverridePre}${request.term}${this._searchOverridePost}`);
        }
        //}
        response(resp);
      }.bind(this)
    });
  },
  showVirtualKeyboardIcon: function(show){
      if(document.getElementById('keyboardInputMaster')){//if keyboard is open, ignore. 
        return; //this prevents the icon from flashing on every key stroke.
      }
      if(this.props.interfaceLang == 'english'){
          var opacity = show ? 0.4 : 0;
          $(ReactDOM.findDOMNode(this)).find(".keyboardInputInitiator").css({"opacity": opacity});
      }
  },
  showDesktop: function() {
    if (this.props.panelsOpen == 0) {
      var json = cookie("recentlyViewed");
      var recentlyViewed = json ? JSON.parse(json) : null;
      if (recentlyViewed && recentlyViewed.length) {
        this.handleRefClick(recentlyViewed[0].ref, recentlyViewed[0].version, recentlyViewed[0].versionLanguage);
      }
    }
    this.props.setCentralState({menuOpen: null});
    this.clearSearchBox();      
  },
  showLibrary: function() {
    this.props.showLibrary();
    this.clearSearchBox();
  },
  showSearch: function(query) {
    if (typeof sjs !== "undefined") {
      query = encodeURIComponent(query);
      window.location = `/search?q=${query}`;
      return;
    }
    this.props.showSearch(query);
    $(ReactDOM.findDOMNode(this)).find("input.search").sefaria_autocomplete("close");
  },
  showAccount: function() {
    if (typeof sjs !== "undefined") {
      window.location = "/account";
      return;
    }
    this.props.setCentralState({menuOpen: "account"});
    this.clearSearchBox();
  },
  showNotifications: function() {
    if (typeof sjs !== "undefined") {
      window.location = "/notifications";
      return;
    }
    this.props.setCentralState({menuOpen: "notifications"});
    this.clearSearchBox();
  },
  showUpdates: function() {
    // todo: not used yet
    if (typeof sjs !== "undefined") {
      window.location = "/updates";
      return;
    }
    this.props.setCentralState({menuOpen: "updates"});
    this.clearSearchBox();
  },
  showTestMessage: function() {
    this.props.setCentralState({showTestMessage: true});
  },
  hideTestMessage: function() { 
    this.props.setCentralState({showTestMessage: false});
  },
  submitSearch: function(query, skipNormalization, originalQuery) {
    // originalQuery is used to handle an edge case - when a varient of a commentator name is passed - e.g. "Rasag".
    // the name gets normalized, but is ultimately not a ref, so becomes a regular search.
    // We want to search for the original query, not the normalized name
    var override = query.match(this._searchOverrideRegex());
    if (override) {
      if (Sefaria.site) { Sefaria.site.track.event("Search", "Search Box Navigation - Book Override", override[1]); }
      this.closeSearchAutocomplete();
      this.showSearch(override[1]);
      return;
    }

    var index;
    if (query in Sefaria.booksDict) {
      index = Sefaria.index(query);
      if (!index && !skipNormalization) {
        Sefaria.normalizeTitle(query, function(title) {
          this.submitSearch(title, true, query)
        }.bind(this));
        return;
      }
    }
    if (Sefaria.isRef(query)) {
      var action = index? "Search Box Navigation - Book": "Search Box Navigation - Citation";
      if (Sefaria.site) { Sefaria.site.track.event("Search", action, query); }
      this.clearSearchBox();
      this.handleRefClick(query);  //todo: pass an onError function through here to the panel onError function which redirects to search
    } else {
      if (Sefaria.site) { Sefaria.site.track.event("Search", "Search Box Search", query); }
      this.closeSearchAutocomplete();
      this.showSearch(originalQuery || query);
    }
  },
  closeSearchAutocomplete: function() {
    $(ReactDOM.findDOMNode(this)).find("input.search").sefaria_autocomplete("close");
  },
  clearSearchBox: function() {
    $(ReactDOM.findDOMNode(this)).find("input.search").val("").sefaria_autocomplete("close");
  },
  handleLibraryClick: function(e) {
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
  handleRefClick: function(ref, version, versionLanguage) {
    if (this.props.headerMode) {
      window.location.assign("/" + ref);
      return;
    }
    this.props.onRefClick(ref, version, versionLanguage);
  },
  handleSearchKeyUp: function(event) {
    if (event.keyCode === 13) {
      var query = $(event.target).val();
      if (query) {
        this.submitSearch(query);
      }
    }
  },
  handleSearchButtonClick: function(event) {
    var query = $(ReactDOM.findDOMNode(this)).find(".search").val();
    if (query) {
      this.submitSearch(query);
    }
  },
  render: function() {
    var viewContent = this.state.menuOpen ?
                        (<ReaderPanel
                          initialState={this.state}
                          interfaceLang={this.props.interfaceLang}
                          setCentralState={this.props.setCentralState}
                          multiPanel={true}
                          onNavTextClick={this.props.onRefClick}
                          onSearchResultClick={this.props.onRefClick}
                          onRecentClick={this.props.onRecentClick}
                          setDefaultLanguage={this.props.setDefaultLanguage}
                          onQueryChange={this.props.onQueryChange}
                          updateSearchFilter={this.props.updateSearchFilter}
                          registerAvailableFilters={this.props.registerAvailableFilters}
                          setUnreadNotificationsCount={this.props.setUnreadNotificationsCount}
                          hideNavHeader={true}
                          analyticsInitialized={this.props.analyticsInitialized}/>) : null;


    var notificationCount = Sefaria.notificationCount || 0;
    var notifcationsClasses = classNames({notifications: 1, unread: notificationCount > 0});
    var nextParam = "?next=" + encodeURIComponent(Sefaria.util.currentPath());
    var headerMessage = this.props.headerMessage ?
                          (<div className="testWarning" onClick={this.showTestMessage} >{ this.props.headerMessage }</div>) :
                          null;
    var loggedInLinks  = (<div className="accountLinks">
                            <div className="account" onClick={this.showAccount}><img src="/static/img/user-64.png" /></div>
                            <div className={notifcationsClasses} onClick={this.showNotifications}>{notificationCount}</div>
                         </div>);
    var loggedOutLinks = (<div className="accountLinks">
                           <a className="login" href={"/register" + nextParam}>
                             <span className="int-en">Sign up</span>
                             <span className="int-he">הרשם</span>
                           </a>
                           <a className="login" href={"/login" + nextParam}>
                             <span className="int-en">Log in</span>
                             <span className="int-he">התחבר</span>
                           </a>
                         </div>);
    var langSearchPlaceholder = this.props.interfaceLang == 'english' ? "Search" : "הקלד לחיפוש";
    var vkClassActivator = this.props.interfaceLang == 'english' ? " keyboardInput" : "";
    return (<div className="header">
              <div className="headerInner">
                <div className="left">
                  <a href="/texts"><div className="library" onClick={this.handleLibraryClick}><i className="fa fa-bars"></i></div></a>
                </div>
                <div className="right">
                  { headerMessage }
                  { Sefaria.loggedIn ? loggedInLinks : loggedOutLinks }
                </div>
                <span className="searchBox">
                  <ReaderNavigationMenuSearchButton onClick={this.handleSearchButtonClick} />
                  <input className={"search"+ vkClassActivator}
                         placeholder={langSearchPlaceholder}
                         onKeyUp={this.handleSearchKeyUp}
                         onFocus={this.showVirtualKeyboardIcon.bind(this, true)}
                         onBlur={this.showVirtualKeyboardIcon.bind(this, false)}
                  />
                </span>
                <a className="home" href="/?home" ><img src="/static/img/sefaria.svg" /></a>
              </div>
              { viewContent ? 
                (<div className="headerNavContent">
                  {viewContent}
                 </div>) : null}
              { this.state.showTestMessage ? <TestMessage hide={this.hideTestMessage} /> : null}
            </div>);
  }
});


var ReaderPanel = React.createClass({
  propTypes: {
    initialRefs:                 React.PropTypes.array,
    initialMode:                 React.PropTypes.string,
    initialConnectionsMode:      React.PropTypes.string,
    initialVersion:              React.PropTypes.string,
    initialVersionLanguage:      React.PropTypes.string,
    initialFilter:               React.PropTypes.array,
    initialHighlightedRefs:      React.PropTypes.array,
    initialMenu:                 React.PropTypes.string,
    initialQuery:                React.PropTypes.string,
    initialAppliedSearchFilters: React.PropTypes.array,
    initialSheetsTag:            React.PropTypes.string,
    initialState:                React.PropTypes.object, // if present, trumps all props above
    interfaceLang:               React.PropTypes.string,
    setCentralState:             React.PropTypes.func,
    onSegmentClick:              React.PropTypes.func,
    onCitationClick:             React.PropTypes.func,
    onTextListClick:             React.PropTypes.func,
    onNavTextClick:              React.PropTypes.func,
    onRecentClick:               React.PropTypes.func,
    onSearchResultClick:         React.PropTypes.func,
    onUpdate:                    React.PropTypes.func,
    onError:                     React.PropTypes.func,
    closePanel:                  React.PropTypes.func,
    closeMenus:                  React.PropTypes.func,
    setConnectionsFilter:        React.PropTypes.func,
    setDefaultLanguage:          React.PropTypes.func,
    selectVersion:               React.PropTypes.func,
    onQueryChange:               React.PropTypes.func,
    updateSearchFilter:          React.PropTypes.func,
    registerAvailableFilters:    React.PropTypes.func,
    openComparePanel:            React.PropTypes.func,
    setUnreadNotificationsCount: React.PropTypes.func,
    highlightedRefs:             React.PropTypes.array,
    hideNavHeader:               React.PropTypes.bool,
    multiPanel:                  React.PropTypes.bool,
    masterPanelLanguage:         React.PropTypes.string,
    panelsOpen:                  React.PropTypes.number,
    layoutWidth:                 React.PropTypes.number,
    setTextListHightlight:       React.PropTypes.func,
    setSelectedWords:            React.PropTypes.func,
    analyticsInitialized:        React.PropTypes.bool
  },
  getInitialState: function() {
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
      settings: this.props.intialState.settings || {
        language:      "bilingual",
        layoutDefault: "segmented",
        layoutTalmud:  "continuous",
        layoutTanakh:  "segmented",
        biLayout:      "stacked",
        color:         "light",
        fontSize:      62.5
      },
      menuOpen:             this.props.initialMenu || null, // "navigation", "book toc", "text toc", "display", "search", "sheets", "home"
      navigationCategories: this.props.initialNavigationCategories || [],
      navigationSheetTag:   this.props.initialSheetsTag || null,
      sheetsPartner:        this.props.initialPartner || null,
      searchQuery:          this.props.initialQuery || null,
      appliedSearchFilters: this.props.initialAppliedSearchFilters || [],
      searchFiltersValid:   false,
      availableFilters:     [],
      filterRegistry:       {},
      orphanSearchFilters:  [],
      displaySettingsOpen:  false,
      tagSort: "count",
      mySheetSort: "date",
      initialAnalyticsTracked: false
    }
  },
  componentDidMount: function() {
    window.addEventListener("resize", this.setWidth);
    this.setWidth();
    this.setHeadroom();
  },
  componentWillUnmount: function() {
    window.removeEventListener("resize", this.setWidth);
  },
  componentWillReceiveProps: function(nextProps) {
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
  },
  componentDidUpdate: function(prevProps, prevState) {
    this.setHeadroom();
    if (prevProps.layoutWidth !== this.props.layoutWidth) {
      this.setWidth();
    }
    this.replaceHistory = false;
  },
  conditionalSetState: function(state) {
    // Set state either in the central app or in the local component,
    // depending on whether a setCentralState function was given.
    if (this.props.setCentralState) {
      this.props.setCentralState(state, this.replaceHistory);
      this.replaceHistory = false;
    } else {
      this.setState(state);
    }
  },
  onError:  function(message) {
    if (this.props.onError) {
      this.props.onError(message);
      return;
    }
    this.setState({"error": message})
  },
  clonePanel: function(panel) {
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
  handleBaseSegmentClick: function(ref) {
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
  handleCitationClick: function(citationRef, textRef) {
    if (this.props.multiPanel) {
      this.props.onCitationClick(citationRef, textRef);
    } else {
      this.showBaseText(citationRef);
    }
  },
  handleTextListClick: function(ref) {
    this.showBaseText(ref);
  },
  setHeadroom: function() {
    if (this.props.multiPanel) { return; }
    var $node    = $(ReactDOM.findDOMNode(this));
    var $header  = $node.find(".readerControls");
    if (this.state.mode !== "TextAndConnections") {
      var scroller = $node.find(".textColumn")[0];
      $header.headroom({scroller: scroller});
    }
  },
  openConnectionsInPanel: function(ref) {
    var refs = typeof ref == "string" ? [ref] : ref;
    this.replaceHistory = this.state.mode === "TextAndConnections"; // Don't push history for change in Connections focus
    this.conditionalSetState({highlightedRefs: refs, mode: "TextAndConnections" }, this.replaceHistory);      
  },
  closeConnectionsInPanel: function() {
    // Return to the original text in the ReaderPanel contents
    this.conditionalSetState({highlightedRefs: [], mode: "Text"});
  },  
  showBaseText: function(ref, replaceHistory, version=null, versionLanguage=null) {
    // Set the current primary text
    // `replaceHistory` - bool whether to replace browser history rather than push for this change
    if (!ref) { return; }
    this.replaceHistory = Boolean(replaceHistory);
    this.conditionalSetState({
      mode: "Text",
      refs: [ref],
      filter: [],
      recentFilters: [],
      menuOpen: null,
      version: version,
      versionLanguage: versionLanguage
    });
  },
  updateTextColumn: function(refs) {
    // Change the refs in the current TextColumn, for infinite scroll up/down.
    this.replaceHistory = true;
    this.conditionalSetState({ refs: refs }, this.replaceState);
  },
  setTextListHightlight: function(refs) {
    refs = typeof refs === "string" ? [refs] : refs;
    this.replaceHistory = true; 
    this.conditionalSetState({highlightedRefs: refs});
    if (this.props.multiPanel) {
      this.props.setTextListHightlight(refs);
    }
  },
  setSelectedWords: function(words){
    words = (typeof words !== "undefined" && words.length) ?  words : "";
    words = words.trim();
    this.replaceHistory = false;
    if (this.props.multiPanel) {
      this.props.setSelectedWords(words);
    }else{
      this.conditionalSetState({'selectedWords':  words});
    }
  },
  closeMenus: function() {
    var state = {
      // If there's no content to show, return to home
      menuOpen: this.state.refs.slice(-1)[0] ? null: "home",
      // searchQuery: null,
      // appliedSearchFilters: [],
      navigationCategories: null,
      navigationSheetTag: null
    };
    this.conditionalSetState(state);
  },
  openMenu: function(menu) {
    this.conditionalSetState({
      menuOpen: menu,
      initialAnalyticsTracked: false,
      // searchQuery: null,
      // appliedSearchFilters: [],
      navigationCategories: null,
      navigationSheetTag: null,
    });
  },
  setNavigationCategories: function(categories) {
    this.conditionalSetState({navigationCategories: categories});
  },
  setSheetTag: function (tag) {
    this.conditionalSetState({navigationSheetTag: tag});
  },
  setFilter: function(filter, updateRecent) {
    // Sets the current filter for Connected Texts (TextList)
    // If updateRecent is true, include the current setting in the list of recent filters.
    if (this.props.setConnectionsFilter) {
      this.props.setConnectionsFilter(filter);
    } else {
      if (updateRecent && filter) {
        if (Sefaria.util.inArray(filter, this.state.recentFilters) !== -1) {
          this.state.recentFilters.toggle(filter);
        }
        this.state.recentFilters = [filter].concat(this.state.recentFilters);
      }
      filter = filter ? [filter] : [];
      this.conditionalSetState({recentFilters: this.state.recentFilters, filter: filter});      
    }

  },
  toggleLanguage: function() {
    if (this.state.settings.language == "hebrew") {
        this.setOption("language", "english");
        if (Sefaria.site) { Sefaria.site.track.event("Reader", "Change Language", "english");}
    } else {
        this.setOption("language", "hebrew");
        if (Sefaria.site) { Sefaria.site.track.event("Reader", "Change Language", "hebrew");}
    }
  },
  openCommentary: function(commentator) {
    // Tranforms a connections panel into an text panel with a particular commentary
    var baseRef = this.state.refs[0];
    var links   = Sefaria._filterLinks(Sefaria.links(baseRef), [commentator]);
    if (links.length) {
      var ref = links[0].sourceRef;
      // TODO, Hack - stripping at last : to get section level ref for commentary. Breaks for Commentary2?
      ref = ref.substring(0, ref.lastIndexOf(':')); 
      this.showBaseText(ref);
    }
  },
  openSearch: function(query) {
    this.conditionalSetState({
      menuOpen: "search",
      searchQuery: query
    });
  },
  openDisplaySettings: function() {
    this.conditionalSetState({displaySettingsOpen: true});
  },
  closeDisplaySettings: function() {
    this.conditionalSetState({displaySettingsOpen: false});
  },
  setOption: function(option, value) {
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
    cookie(option, value, {path: "/"});
    if (option === "language") {
      cookie("contentLang", value, {path: "/"});
      this.replaceHistory = true;
      this.props.setDefaultOption && this.props.setDefaultOption(option, value);
    }
    this.conditionalSetState(state);
  },
  setConnectionsMode: function(mode) {
    var loginRequired = {
      "Add to Source Sheet": 1,
      "Add Note": 1,
      "My Notes": 1,
      "Add Connection": 1,
      "Add Translation": 1 // Is this used?
    };
    Sefaria.site.track.event("Tools", mode + " Click");
    if (!Sefaria._uid && mode in loginRequired) {
      Sefaria.site.track.event("Tools", "Prompt Login");
      mode = "Login";
    }
    var state = {connectionsMode: mode};
    if (mode === "Connections") { 
      this.setFilter();
    }
    this.conditionalSetState(state);
  },
  editNote: function(note) {
    this.conditionalSetState({
      connectionsMode: "Edit Note",
      noteBeingEdited: note
    });
  },
  setWidth: function() {
    this.width = $(ReactDOM.findDOMNode(this)).width();
  },
  setSheetTagSort: function(sort) {
    this.conditionalSetState({
      tagSort: sort,
    });
  },
  setMySheetSort: function(sort) {
    this.conditionalSetState({
      mySheetSort: sort,
    });
  },
  currentMode: function() {
    return this.state.mode;
  },
  currentRef: function() {
    // Returns a string of the current ref, the first if there are many
    return this.state.refs && this.state.refs.length ? this.state.refs[0] : null;
  },
  lastCurrentRef: function() {
    // Returns a string of the current ref, the last if there are many
    var ret = this.state.refs && this.state.refs.length ? this.state.refs.slice(-1)[0] : null;
    if (ret && typeof ret == "object") {debugger;}
    return ret;
  },
  currentData: function() {
    // Returns the data from the library of the current ref
    var ref  = this.currentRef();
    if (!ref) { return null; }
    var data = Sefaria.ref(ref);
    return data; 
  },
  currentBook: function() {
    var data = this.currentData();
    if (data) {
      return data.indexTitle;
    } else {
      var pRef = Sefaria.parseRef(this.currentRef());
      return "book" in pRef ? pRef.book : null;
    }
  },
  currentCategory: function() {
    var book = this.currentBook();
    return (Sefaria.index(book) ? Sefaria.index(book).primary_category : null);
  },
  currentLayout: function() {
    if (this.state.settings.language == "bilingual") {
      return this.width > 500 ? this.state.settings.biLayout : "stacked";
    }
    var category = this.currentCategory();
    if (!category) { return "layoutDefault"; }
    var option = category === "Tanakh" || category === "Talmud" ? "layout" + category : "layoutDefault";
    return this.state.settings[option];  
  },
  render: function() {
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
    var items = [];
    if (this.state.mode === "Text" || this.state.mode === "TextAndConnections") {
      items.push(<TextColumn
          srefs={this.state.refs.slice()}
          version={this.state.version}
          versionLanguage={this.state.versionLanguage}
          highlightedRefs={this.state.highlightedRefs}
          basetext={true}
          withContext={true}
          loadLinks={true}
          prefetchNextPrev={true}
          multiPanel={this.props.multiPanel}
          mode={this.state.mode}
          settings={Sefaria.util.clone(this.state.settings)}
          setOption={this.setOption}
          showBaseText={this.showBaseText} 
          updateTextColumn={this.updateTextColumn}
          onSegmentClick={this.handleBaseSegmentClick}
          onCitationClick={this.handleCitationClick}
          setTextListHightlight={this.setTextListHightlight}
          setSelectedWords={this.setSelectedWords}
          panelsOpen={this.props.panelsOpen}
          layoutWidth={this.props.layoutWidth}
          filter={this.state.filter}
          key="text" />);
    }
    if (this.state.mode === "Connections" || this.state.mode === "TextAndConnections") {
      var langMode = this.props.masterPanelLanguage || this.state.settings.language;
      var data     = this.currentData();
      var canEditText = data && 
                        (langMode === "hebrew" && data.heVersionStatus !== "locked") ||
                        (langMode === "english" && data.versionStatus !== "locked") ||
                        (Sefaria.is_moderator && langMode !== "bilingual");
      items.push(<ConnectionsPanel 
          srefs={this.state.mode === "Connections" ? this.state.refs.slice() : this.state.highlightedRefs.slice()}
          filter={this.state.filter || []}
          mode={this.state.connectionsMode || "Connections"}
          recentFilters={this.state.recentFilters}
          interfaceLang={this.props.interfaceLang}
          version={this.state.version}
          versionLanguage={this.state.versionLanguage}
          fullPanel={this.props.multiPanel}
          multiPanel={this.props.multiPanel}
          canEditText={canEditText}
          setFilter={this.setFilter}
          setConnectionsMode={this.setConnectionsMode}
          closeConectionsInPanel={this.closeConnectionsInPanel} 
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
          key="connections" />
      );
    }

    if (this.state.menuOpen === "home" || this.state.menuOpen == "navigation" || this.state.menuOpen == "compare") {
      var openInPanel   = function(pos, ref) { this.showBaseText(ref) }.bind(this);
      var openNav       = this.state.menuOpen === "compare" ? this.openMenu.bind(null, "compare") : this.openMenu.bind(null, "navigation");
      var onRecentClick = this.state.menuOpen === "compare" || !this.props.onRecentClick ? openInPanel : this.props.onRecentClick;

      var menu = (<ReaderNavigationMenu 
                    home={this.state.menuOpen === "home"}
                    compare={this.state.menuOpen === "compare"}
                    interfaceLang={this.props.interfaceLang}
                    multiPanel={this.props.multiPanel}
                    categories={this.state.navigationCategories || []}
                    settings={this.state.settings}
                    setCategories={this.setNavigationCategories || []}
                    setOption={this.setOption}
                    toggleLanguage={this.toggleLanguage}
                    closeNav={this.closeMenus}
                    closePanel={this.props.closePanel}
                    openNav={openNav}
                    openSearch={this.openSearch}
                    openMenu={this.openMenu}
                    openDisplaySettings={this.openDisplaySettings}
                    onTextClick={this.props.onNavTextClick || this.showBaseText}
                    onRecentClick={onRecentClick}
                    hideNavHeader={this.props.hideNavHeader} />);

    } 
    else if (this.state.menuOpen === "text toc") {
      var menu = (<ReaderTextTableOfContents
                    mode={this.state.menuOpen}
                    interfaceLang={this.props.interfaceLang}
                    close={this.closeMenus}
                    title={this.currentBook()}
                    version={this.state.version}
                    versionLanguage={this.state.versionLanguage}
                    settingsLanguage={this.state.settings.language == "hebrew"?"he":"en"}
                    category={this.currentCategory()}
                    currentRef={this.lastCurrentRef()}
                    openNav={this.openMenu.bind(null, "navigation")}
                    openDisplaySettings={this.openDisplaySettings}
                    selectVersion={this.props.selectVersion}
                    showBaseText={this.showBaseText}/>);

    } else if (this.state.menuOpen === "book toc") {
      var menu = (<ReaderTextTableOfContents
                    mode={this.state.menuOpen}
                    interfaceLang={this.props.interfaceLang}
                    closePanel={this.props.closePanel}
                    close={this.closeMenus}
                    title={this.state.bookRef}
                    settingsLanguage={this.state.settings.language == "hebrew"?"he":"en"}
                    category={Sefaria.index(this.state.bookRef) ? Sefaria.index(this.state.bookRef).primary_category : null}
                    currentRef={this.state.bookRef}
                    key={this.state.bookRef}
                    openNav={this.openMenu.bind(null, "navigation")}
                    openDisplaySettings={this.openDisplaySettings}
                    selectVersion={this.props.selectVersion}
                    showBaseText={this.showBaseText}/>);

    } else if (this.state.menuOpen === "search" && this.state.searchQuery) {
      var menu = (<SearchPage
                    query={this.state.searchQuery}
                    appliedFilters={this.state.appliedSearchFilters}
                    settings={Sefaria.util.clone(this.state.settings)}
                    onResultClick={this.props.onSearchResultClick}
                    openDisplaySettings={this.openDisplaySettings}
                    toggleLanguage={this.toggleLanguage}
                    close={this.closeMenus}
                    hideNavHeader={this.props.hideNavHeader}
                    onQueryChange={this.props.onQueryChange}
                    updateAppliedFilter={this.props.updateSearchFilter}
                    availableFilters={this.state.availableFilters}
                    filtersValid={this.state.searchFiltersValid}
                    registerAvailableFilters={this.props.registerAvailableFilters} />);

    } else if (this.state.menuOpen === "sheets") {
      var menu = (<SheetsNav
                    interfaceLang={this.props.interfaceLang}
                    openNav={this.openMenu.bind(null, "navigation")}
                    close={this.closeMenus}
                    multiPanel={this.props.multiPanel}
                    hideNavHeader={this.props.hideNavHeader}
                    toggleLanguage={this.toggleLanguage}
                    tag={this.state.navigationSheetTag}
                    partner={this.state.sheetsPartner}
                    tagSort={this.state.tagSort}
                    mySheetSort={this.state.mySheetSort}
                    setMySheetSort={this.setMySheetSort}
                    setSheetTagSort={this.setSheetTagSort}
                    setSheetTag={this.setSheetTag}
                    key={this.state.key} />);

    } else if (this.state.menuOpen === "account") {
      var menu = (<AccountPanel
                    interfaceLang={this.props.interfaceLang} />);


    } else if (this.state.menuOpen === "notifications") {
      var menu = (<NotificationsPanel 
                    setUnreadNotificationsCount={this.props.setUnreadNotificationsCount}
                    interfaceLang={this.props.interfaceLang} />);

    } else if (this.state.menuOpen === "updates") {
      var menu = (<UpdatesPanel
                    interfaceLang={this.props.interfaceLang} />);

    } else if (this.state.menuOpen === "modtools") {
      var menu = (<ModeratorToolsPanel
                    interfaceLang={this.props.interfaceLang} />);

    } else {
      var menu = null;
    }

    var classes  = {readerPanel: 1, narrowColumn: this.width < 730};
    classes[this.currentLayout()]             = 1;
    classes[this.state.settings.color]        = 1;
    classes[this.state.settings.language]     = 1;
    classes = classNames(classes);
    var style = {"fontSize": this.state.settings.fontSize + "%"};
    var hideReaderControls = (
        this.state.mode === "TextAndConnections" ||
        this.state.menuOpen === "text toc" ||
        this.state.menuOpen === "book toc" ||
        this.props.hideNavHeader
    );

    return (
      <div className={classes}>
        {hideReaderControls ? null :  
        (<ReaderControls
          showBaseText={this.showBaseText}
          currentRef={this.lastCurrentRef()}
          currentMode={this.currentMode}
          currentCategory={this.currentCategory}
          currentBook={this.currentBook}
          version={this.state.version}
          versionLanguage={this.state.versionLanguage}
          multiPanel={this.props.multiPanel}
          settings={this.state.settings}
          setOption={this.setOption}
          setConnectionsMode={this.setConnectionsMode}
          openMenu={this.openMenu}
          closeMenus={this.closeMenus}
          openDisplaySettings={this.openDisplaySettings}
          currentLayout={this.currentLayout}
          onError={this.onError}
          connectionsMode={this.state.filter.length && this.state.connectionsMode === "Connections" ? "Connection Text" : this.state.connectionsMode}
          closePanel={this.props.closePanel}
          toggleLanguage={this.toggleLanguage}
          interfaceLang={this.props.interfaceLang}/>)}

        {(items.length > 0 && !menu) ?
            <div className="readerContent" style={style}>
              {items}
            </div>
        :""}

        {menu}
        {this.state.displaySettingsOpen ? (<ReaderDisplayOptionsMenu
                                              settings={this.state.settings}
                                              multiPanel={this.props.multiPanel}
                                              setOption={this.setOption}
                                              currentLayout={this.currentLayout}
                                              width={this.width} 
                                              menuOpen={this.state.menuOpen} />) : null}
        {this.state.displaySettingsOpen ? (<div className="mask" onClick={this.closeDisplaySettings}></div>) : null}

      </div>
    );
  }
});


var ReaderControls = React.createClass({
  // The Header of a Reader panel when looking at a text 
  // contains controls for display, navigation etc.
  propTypes: {
    settings:                React.PropTypes.object.isRequired,
    showBaseText:            React.PropTypes.func.isRequired,
    setOption:               React.PropTypes.func.isRequired,
    setConnectionsMode:      React.PropTypes.func.isRequired,
    openMenu:                React.PropTypes.func.isRequired,
    openDisplaySettings:     React.PropTypes.func.isRequired,
    closeMenus:              React.PropTypes.func.isRequired,
    currentMode:             React.PropTypes.func.isRequired,
    currentCategory:         React.PropTypes.func.isRequired,
    currentBook:             React.PropTypes.func.isRequired,
    currentLayout:           React.PropTypes.func.isRequired,
    onError:                 React.PropTypes.func.isRequired,
    closePanel:              React.PropTypes.func,
    toggleLanguage:          React.PropTypes.func,
    currentRef:              React.PropTypes.string,
    version:                 React.PropTypes.string,
    versionLanguage:         React.PropTypes.string,
    connectionsMode:         React.PropTypes.string,
    multiPanel:              React.PropTypes.bool,
    interfaceLang:           React.PropTypes.string
  },
  openTextToc: function(e) {
    e.preventDefault();
    this.props.openMenu("text toc");
  },
  render: function() {
    var title     = this.props.currentRef;
    if (title) {
      var oref    = Sefaria.ref(title);
      var heTitle = oref ? oref.heTitle : "";      
    } else {
      var heTitle = "";
    }

    var mode              = this.props.currentMode();
    var hideHeader        = !this.props.multiPanel && mode === "Connections";
    var connectionsHeader = this.props.multiPanel && mode === "Connections";

    if (title && !oref) {
      // If we don't have this data yet, rerender when we do so we can set the Hebrew title
      Sefaria.text(title, {context: 1}, function(data) {
        if ("error" in data) {
          this.props.onError(data.error);
          return;
        }
        if (this.isMounted()) { this.setState({}); }
      }.bind(this));
    }

    var versionTitle = this.props.version ? this.props.version.replace(/_/g," "):"";
    var url = Sefaria.ref(title)?"/" + Sefaria.normRef(Sefaria.ref(title).book):Sefaria.normRef(title);
    var centerContent = connectionsHeader ?
      (<div className="readerTextToc">
          <ConnectionsPanelHeader
            activeTab={this.props.connectionsMode}
            setConnectionsMode={this.props.setConnectionsMode}
            closePanel={this.props.closePanel}
            toggleLanguage={this.props.toggleLanguage}
            interfaceLang={this.props.interfaceLang}/>
        </div>) :
      (<a href={url}>
          <div className="readerTextToc" onClick={this.openTextToc}>
            { title ? (<i className="fa fa-caret-down invisible"></i>) : null }
            <div className="readerTextTocBox">
              <span className="en">{title}</span>
              <span className="he">{heTitle}</span>
              { title ? (<i className="fa fa-caret-down"></i>) : null }
              { (this.props.versionLanguage == "en" && this.props.settings.language == "english") ? (<span className="readerTextVersion"><span className="en">{versionTitle}</span></span>) : null}
            </div>
          </div>
        </a>);
    var leftControls = hideHeader || connectionsHeader ? null :
      (<div className="leftButtons">
          {this.props.multiPanel ? (<ReaderNavigationMenuCloseButton onClick={this.props.closePanel} />) : null}
          {this.props.multiPanel ? null : (<ReaderNavigationMenuMenuButton onClick={this.props.openMenu.bind(null, "navigation")} />)}
        </div>);
    var rightControls = hideHeader || connectionsHeader ? null :
      (<div className="rightButtons">
          <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
        </div>);
    var classes = classNames({readerControls: 1, headeroom: 1, connectionsHeader: mode == "Connections"});
    var readerControls = hideHeader ? null :
        (<div className={classes}>
          <div className="readerControlsInner">
            {leftControls}
            {rightControls}
            {centerContent}
          </div>
        </div>);
    return (
      <div>
        <CategoryColorLine category={this.props.currentCategory()} />
        {readerControls}
      </div>
    );
  }
});


var ReaderDisplayOptionsMenu = React.createClass({
  propTyps: {
    setOption:     React.PropTypes.func.isRequired,
    currentLayout: React.PropTypes.func.isRequired,
    menuOpen:      React.PropTypes.string.isRequired,
    multiPanel:    React.PropTypes.bool.isRequired,
    width:         React.PropTypes.number.isRequired,
    settings:      React.PropTypes.object.isRequired,
  },
  render: function() {
    var languageOptions = [
      {name: "english",   content: "<span class='en'>A</span>" },
      {name: "bilingual", content: "<span class='en'>A</span><span class='he'>א</span>" },
      {name: "hebrew",    content: "<span class='he'>א</span>" }
    ];
    var languageToggle = (
        <ToggleSet
          name="language"
          options={languageOptions}
          setOption={this.props.setOption}
          settings={this.props.settings} />);
    
    var layoutOptions = [
      {name: "continuous", fa: "align-justify" },
      {name: "segmented", fa: "align-left" },
    ];
    var biLayoutOptions = [
      {name: "stacked", content: "<img src='/static/img/stacked.png' />"},
      {name: "heLeft", content: "<img src='/static/img/backs.png' />"},
      {name: "heRight", content: "<img src='/static/img/faces.png' />"}
    ];
    var layoutToggle = this.props.settings.language !== "bilingual" ? 
      (<ToggleSet
          name="layout"
          options={layoutOptions}
          setOption={this.props.setOption}
          currentLayout={this.props.currentLayout}
          settings={this.props.settings} />) : 
      (this.props.width > 500 ? 
        <ToggleSet
          name="biLayout"
          options={biLayoutOptions}
          setOption={this.props.setOption}
          currentLayout={this.props.currentLayout}
          settings={this.props.settings} /> : null);

    var colorOptions = [
      {name: "light", content: "" },
      {name: "sepia", content: "" },
      {name: "dark", content: "" }
    ];
    var colorToggle = (
        <ToggleSet
          name="color"
          separated={true}
          options={colorOptions}
          setOption={this.props.setOption}
          settings={this.props.settings} />);
    colorToggle = this.props.multiPanel ? null : colorToggle;

    var sizeOptions = [
      {name: "smaller", content: "Aa" },
      {name: "larger", content: "Aa"  }
    ];
    var sizeToggle = (
        <ToggleSet
          name="fontSize"
          options={sizeOptions}
          setOption={this.props.setOption}
          settings={this.props.settings} />);

    if (this.props.menuOpen === "search") {
      return (<div className="readerOptionsPanel">
                <div className="readerOptionsPanelInner">
                  {languageToggle}
                  <div className="line"></div>
                  {sizeToggle}
                </div>
            </div>);
    } else if (this.props.menuOpen) {
      return (<div className="readerOptionsPanel">
                <div className="readerOptionsPanelInner">
                  {languageToggle}
                </div>
            </div>);
    } else {
      return (<div className="readerOptionsPanel">
                <div className="readerOptionsPanelInner">
                  {languageToggle}
                  {layoutToggle}
                  <div className="line"></div>
                  {colorToggle}
                  {sizeToggle}
                </div>
              </div>);
    }
  }
});


var ReaderNavigationMenu = React.createClass({
  // The Navigation menu for browsing and searching texts, plus some site links.
  propTypes: {
    categories:    React.PropTypes.array.isRequired,
    settings:      React.PropTypes.object.isRequired,
    setCategories: React.PropTypes.func.isRequired,
    setOption:     React.PropTypes.func.isRequired,
    closeNav:      React.PropTypes.func.isRequired,
    openNav:       React.PropTypes.func.isRequired,
    openSearch:    React.PropTypes.func.isRequired,
    onTextClick:   React.PropTypes.func.isRequired,
    onRecentClick: React.PropTypes.func.isRequired,
    closePanel:    React.PropTypes.func,
    hideNavHeader: React.PropTypes.bool,
    multiPanel:    React.PropTypes.bool,
    home:          React.PropTypes.bool,
    compare:       React.PropTypes.bool
  },
  getInitialState: function() {
    this.width = 1000;
    return {
      showMore: false,
    };
  },
  componentDidMount: function() {
    this.setWidth();
    window.addEventListener("resize", this.setWidth);
  },
  componentWillUnmount: function() {
    window.removeEventListener("resize", this.setWidth);
  },
  setWidth: function() {
    var width = $(ReactDOM.findDOMNode(this)).width();
    // console.log("Setting RNM width: " + width);
    var winWidth = $(window).width();
    var winHeight = $(window).height();
    // console.log("Window width: " + winWidth + ", Window height: " + winHeight);
    var oldWidth = this.width;
    this.width = width;
    if ((oldWidth <= 450 && width > 450) || 
        (oldWidth > 450 && width <= 450)) {
      this.forceUpdate();
    }
  },
  navHome: function() {
    this.props.setCategories([]);
    this.props.openNav();
  },
  closeNav: function() {
    if (this.props.compare) {
      this.props.closePanel();
    } else {
      this.props.setCategories([]);
      this.props.closeNav();
    }
  },
  showMore: function() {
    this.setState({showMore: true});
  },
  getRecentlyViewed: function() {
    var json = cookie("recentlyViewed");
    var recentlyViewed = json ? JSON.parse(json) : null;
    return recentlyViewed;
  },
  handleClick: function(event) {
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
      if (Sefaria.site) { Sefaria.site.track.event("Reader", "Navigation Text Click", ref); }
    } else if ($(event.target).hasClass("catLink") || $(event.target).parent().hasClass("catLink")) {
      var cats = $(event.target).attr("data-cats") || $(event.target).parent().attr("data-cats");
      cats = cats.split("|");
      this.props.setCategories(cats);
      if (Sefaria.site) { Sefaria.site.track.event("Reader", "Navigation Sub Category Click", cats.join(" / ")); }
    }  
  },
  handleSearchKeyUp: function(event) {
    if (event.keyCode === 13) {
      var query = $(event.target).val();
      this.props.openSearch(query);
    }
  },
  handleSearchButtonClick: function(event) {
    var query = $(ReactDOM.findDOMNode(this)).find(".readerSearch").val();
    if (query) {
      this.props.openSearch(query);
    }
  },  
  render: function() {
    if (this.props.categories.length) {
      // List of Text in a Category
      return (<div className="readerNavMenu" onClick={this.handleClick} >
                <ReaderNavigationCategoryMenu
                  categories={this.props.categories}
                  category={this.props.categories.slice(-1)[0]}
                  closeNav={this.closeNav}
                  setCategories={this.props.setCategories}
                  toggleLanguage={this.props.toggleLanguage}
                  openDisplaySettings={this.props.openDisplaySettings}
                  navHome={this.navHome}
                  compare={this.props.compare}
                  hideNavHeader={this.props.hideNavHeader}
                  width={this.width}
                  interfaceLang={this.props.interfaceLang} />
              </div>);
    } else {
      // Root Library Menu
      var categories = [
        "Tanakh",
        "Mishnah",
        "Talmud",
        "Midrash",
        "Halakhah",
        "Kabbalah",
        "Liturgy",
        "Philosophy",
        "Tosefta",
        "Chasidut",
        "Musar",
        "Responsa",
        "Apocrypha",
        "Modern Works",
        "Other"
      ];
      categories = categories.map(function(cat) {
        var style = {"borderColor": Sefaria.palette.categoryColor(cat)};
        var openCat = function(e) {e.preventDefault(); this.props.setCategories([cat])}.bind(this);
        var heCat   = Sefaria.hebrewCategory(cat);
        return (<a href={`/texts/${cat}`}>
                  <div className="readerNavCategory" data-cat={cat} style={style} onClick={openCat}>
                    <span className="en">{cat}</span>
                    <span className="he">{heCat}</span>
                  </div>
                </a>);
      }.bind(this));
      var more = (<div className="readerNavCategory readerNavMore" style={{"borderColor": Sefaria.palette.colors.darkblue}} onClick={this.showMore}>
                      <span className="en">More <img src="/static/img/arrow-right.png" /></span>
                      <span className="he">עוד <img src="/static/img/arrow-left.png" /></span>
                  </div>);
      if (this.width < 450) {
        categories = this.state.showMore ? categories : categories.slice(0,9).concat(more);
        categories = (<div className="readerNavCategories"><TwoBox content={categories} /></div>);
      } else {
        categories = this.state.showMore ? categories : categories.slice(0,8).concat(more);
        categories = (<div className="readerNavCategories"><ThreeBox content={categories} /></div>);
      }

      var siteLinks = Sefaria._uid ? 
                    [(<a className="siteLink outOfAppLink" key='profile' href="/my/profile">
                        <i className="fa fa-user"></i>
                        <span className="en">Your Profile</span>
                        <span className="he">הפרופיל שלי</span>
                      </a>), 
                     (<span className='divider' key="d1">•</span>),
                     (<a className="siteLink outOfAppLink" key='about' href="/about">
                        <span className="en">About Sefaria</span>
                        <span className="he">אודות ספאריה</span>
                      </a>),
                     (<span className='divider' key="d2">•</span>),
                     (<a className="siteLink outOfAppLink" key='logout' href="/logout">
                        <span className="en">Logout</span>
                        <span className="he">התנתק</span>
                      </a>)] :
                    
                    [(<a className="siteLink outOfAppLink" key='about' href="/about">
                        <span className="en">About Sefaria</span>
                        <span className="he">אודות ספאריה</span>
                      </a>),
                     (<span className='divider' key="d1">•</span>),
                     (<a className="siteLink outOfAppLink" key='login' href="/login">
                        <span className="en">Sign In</span>
                        <span className="he">התחבר</span>
                      </a>)];
      siteLinks = (<div className="siteLinks">
                    {siteLinks}
                  </div>);

      var calendar = Sefaria.calendar ?
                     [(<TextBlockLink sref={Sefaria.calendar.parasha} title={Sefaria.calendar.parashaName} heTitle={Sefaria.calendar.heParashaName} category="Tanakh" />),
                      (<TextBlockLink sref={Sefaria.calendar.haftara} title="Haftara" heTitle="הפטרה" category="Tanakh" />),
                      (<TextBlockLink sref={Sefaria.calendar.daf_yomi} title="Daf Yomi" heTitle="דף יומי" category="Talmud" />)] : [];
      calendar = (<div className="readerNavCalendar"><TwoOrThreeBox content={calendar} width={this.width} /></div>);


      var sheetsStyle = {"borderColor": Sefaria.palette.categoryColor("Sheets")};
      var resources = [(<a className="resourcesLink" style={sheetsStyle} href="/sheets" onClick={this.props.openMenu.bind(null, "sheets")}>
                        <img src="/static/img/sheet-icon.png" />
                        <span className="int-en">Source Sheets</span>
                        <span className="int-he">דפי מקורות</span>
                      </a>),
                     (<a className="resourcesLink outOfAppLink" style={sheetsStyle} href="/visualizations">
                        <img src="/static/img/visualizations-icon.png" />
                        <span className="int-en">Visualizations</span>
                        <span className="int-he">חזותיים</span>
                      </a>),
                    (<a className="resourcesLink outOfAppLink" style={sheetsStyle} href="/people">
                        <img src="/static/img/authors-icon.png" />
                        <span className="int-en">Authors</span>
                        <span className="int-he">רשימת מחברים</span>
                      </a>)];
      resources = (<div className="readerNavCalendar"><TwoOrThreeBox content={resources} width={this.width} /></div>);


      var topContent = this.props.home ?
              (<div className="readerNavTop search">
                <CategoryColorLine category="Other" />
                <ReaderNavigationMenuSearchButton onClick={this.navHome} />
                <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />                
                <div className='sefariaLogo'><img src="/static/img/sefaria.svg" /></div>
              </div>) :
              (<div className="readerNavTop search">
                <CategoryColorLine category="Other" />
                <ReaderNavigationMenuCloseButton onClick={this.closeNav}/>
                <ReaderNavigationMenuSearchButton onClick={this.handleSearchButtonClick} />
                <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />                
                <input className="readerSearch" placeholder="Search" onKeyUp={this.handleSearchKeyUp} />
              </div>);
      topContent = this.props.hideNavHeader ? null : topContent;


      var recentlyViewed = this.getRecentlyViewed();
      recentlyViewed = recentlyViewed ? recentlyViewed.filter(function(item){
        return Sefaria.isRef(item.ref); // after a text has been deleted a recent ref may be invalid.
      }).map(function(item) {
        return (<TextBlockLink 
                  sref={item.ref}
                  heRef={item.heRef}
                  book={item.book}
                  version={item.version}
                  versionLanguage={item.versionLanguage}
                  showSections={true}
                  recentItem={true}
                  position={item.position || 0} />)
      }) : null;
      recentlyViewed = recentlyViewed ? <TwoOrThreeBox content={recentlyViewed} width={this.width} /> : null;

      var title = (<h1>
                    { this.props.multiPanel ? <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null }
                    <span className="int-en">The Sefaria Library</span>
                    <span className="int-he">האוסף של ספאריה</span>
                  </h1>);

      var footer = this.props.compare ? null :
                    (<footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
                      <Footer />
                    </footer> );
      var classes = classNames({readerNavMenu:1, noHeader: !this.props.hideHeader, compare: this.props.compare, home: this.props.home });
      var contentClasses = classNames({content: 1, hasFooter: footer != null});
      return(<div className={classes} onClick={this.handleClick} key="0">
              {topContent}
              <div className={contentClasses}>
                <div className="contentInner">
                  { this.props.compare ? null : title }
                  <ReaderNavigationMenuSection title="Recent" heTitle="נצפו לאחרונה" content={recentlyViewed} />
                  <ReaderNavigationMenuSection title="Browse" heTitle="טקסטים" content={categories} />
                  <ReaderNavigationMenuSection title="Calendar" heTitle="לוח יומי" content={calendar} />
                  { this.props.compare ? null : (<ReaderNavigationMenuSection title="Resources" heTitle="קהילה" content={resources} />) }
                  { this.props.multiPanel ? null : siteLinks }
                </div>
                {footer}
              </div>
            </div>);
    }
  }
});


var ReaderNavigationMenuSection = React.createClass({
  propTypes: {
    title:   React.PropTypes.string,
    heTitle: React.PropTypes.string,
    content: React.PropTypes.object
  },
  render: function() {
    if (!this.props.content) { return null; }
    return (
      <div className="readerNavSection">
        
        {this.props.title ? (<h2>
          <span className="int-en">{this.props.title}</span>
          <span className="int-he">{this.props.heTitle}</span>
        </h2>) : null }
        {this.props.content}
      </div>
      );
  }
});


var TextBlockLink = React.createClass({
  // Monopoly card style link with category color at top
  propTypes: {
    sref:            React.PropTypes.string.isRequired,
    version:         React.PropTypes.string,
    versionLanguage: React.PropTypes.string,
    heRef:           React.PropTypes.string,
    book:            React.PropTypes.string,
    category:        React.PropTypes.string,
    title:           React.PropTypes.string,
    heTitle:         React.PropTypes.string,
    showSections:    React.PropTypes.bool,
    recentItem:      React.PropTypes.bool,
    position:        React.PropTypes.number
  },
  render: function() {
    var index    = Sefaria.index(this.props.book);
    var category = this.props.category || index.primary_category;
    var style    = {"borderColor": Sefaria.palette.categoryColor(category)};
    var title    = this.props.title   || (this.props.showSections ? this.props.sref : this.props.book);
    var heTitle  = this.props.heTitle || (this.props.showSections ? this.props.heRef : index.heTitle);

    var position = this.props.position || 0;
    var classes  = classNames({refLink: 1, blockLink: 1, recentItem: this.props.recentItem});
    var url      = "/" + Sefaria.normRef(this.props.sref) + (this.props.version?`/${this.props.versionLanguage}/${this.props.version}`:"");
    return (<a href={url} className={classes} data-ref={this.props.sref} data-version={this.props.version} data-versionlanguage={this.props.versionLanguage} data-position={position} style={style}>
              <span className="en">{title}</span>
              <span className="he">{heTitle}</span>
             </a>);
  }
});


var LanguageToggleButton = React.createClass({
  propTypes: {
    toggleLanguage: React.PropTypes.func.isRequired
  },
  render: function() {
    return (<div className="languageToggle" onClick={this.props.toggleLanguage}>
              <span className="en"><img src="/static/img/aleph.svg" /></span>
              <span className="he"><img src="/static/img/aye.svg" /></span>
            </div>);
  }
});


var BlockLink = React.createClass({
  propTypes: {
    title:    React.PropTypes.string,
    heTitle:  React.PropTypes.string,
    target:   React.PropTypes.string,
    interfaceLink: React.PropTypes.bool
  },
  getDefaultProps: function() {
    return {
      interfaceLink: false
    };
  },
  render: function() {
    var interfaceClass = this.props.interfaceLink ? 'int-' : '';
    return (<a className="blockLink" href={this.props.target}>
              <span className={`${interfaceClass}en`}>{this.props.title}</span>
              <span className={`${interfaceClass}he`}>{this.props.heTitle}</span>
           </a>);
  }
});


var ReaderNavigationCategoryMenu = React.createClass({
  // Navigation Menu for a single category of texts (e.g., "Tanakh", "Bavli")
  propTypes: {
    category:      React.PropTypes.string.isRequired,
    categories:    React.PropTypes.array.isRequired,
    closeNav:      React.PropTypes.func.isRequired,
    setCategories: React.PropTypes.func.isRequired,
    navHome:       React.PropTypes.func.isRequired,
    width:         React.PropTypes.number,
    compare:       React.PropTypes.bool,
    hideNavHeader: React.PropTypes.bool
  },
  render: function() {
    var footer = this.props.compare ? null :
                    (<footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
                      <Footer />
                    </footer> );
    // Show Talmud with Toggles
    var categories  = this.props.categories[0] === "Talmud" && this.props.categories.length == 1 ? 
                        ["Talmud", "Bavli"] : this.props.categories;

    if (categories[0] === "Talmud" && categories.length <= 2) {
      var setBavli = function() {
        this.props.setCategories(["Talmud", "Bavli"]);
      }.bind(this);
      var setYerushalmi = function() {
        this.props.setCategories(["Talmud", "Yerushalmi"]);
      }.bind(this);
      var bClasses = classNames({navToggle:1, active: categories[1] === "Bavli"});
      var yClasses = classNames({navToggle:1, active: categories[1] === "Yerushalmi", second: 1});

      var toggle =(<div className="navToggles">
                            <span className={bClasses} onClick={setBavli}>
                              <span className="en">Bavli</span>
                              <span className="he">בבלי</span>
                            </span>
                            <span className="navTogglesDivider">|</span>
                            <span className={yClasses} onClick={setYerushalmi}>
                              <span className="en">Yerushalmi</span>
                              <span className="he">ירושלמי</span>
                            </span>
                         </div>);
      var catTitle = (categories.length > 1) ? categories[0] +  " " + categories[1] : categories[0];
      var heCatTitle = (categories.length > 1) ? Sefaria.hebrewCategory(categories[0]) + " " + Sefaria.hebrewCategory(categories[1]): categories[0];
    } else {
      var toggle = null;
      var catTitle = this.props.category;
      var heCatTitle = Sefaria.hebrewCategory(this.props.category);
    }
    var catContents    = Sefaria.tocItemsByCategories(categories);
    var navMenuClasses = classNames({readerNavCategoryMenu: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader});
    var navTopClasses  = classNames({readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader});
    var contentClasses = classNames({content: 1, hasFooter: footer != null});
    return (<div className={navMenuClasses}>
              <div className={navTopClasses}>
                <CategoryColorLine category={categories[0]} />
                {this.props.hideNavHeader ? null : (<ReaderNavigationMenuMenuButton onClick={this.props.navHome} compare={this.props.compare} />)}
                {this.props.hideNavHeader ? null : (<ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />)}
                {this.props.hideNavHeader ? null : (<h2>
                  <span className="en">{catTitle}</span>
                  <span className="he">{heCatTitle}</span>
                </h2>)}
              </div>
              <div className={contentClasses}>
                <div className="contentInner">
                  {this.props.hideNavHeader ? (<h1>
                      <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} />
                      <span className="en">{catTitle}</span>
                      <span className="he">{heCatTitle}</span>
                    </h1>) : null}
                  {toggle}
                  <ReaderNavigationCategoryMenuContents contents={catContents} categories={categories} width={this.props.width} category={this.props.category} nestLevel={0} />
                </div>
                {footer}
              </div>
            </div>);
  }
});


var ReaderNavigationCategoryMenuContents = React.createClass({
  // Inner content of Category menu (just category title and boxes of)
  propTypes: {
    category:   React.PropTypes.string.isRequired,
    contents:   React.PropTypes.array.isRequired,
    categories: React.PropTypes.array.isRequired,
    width:      React.PropTypes.number,
    nestLevel:   React.PropTypes.number
  },
  getRenderedTextTitleString: function(title, heTitle){
    var whiteList = ['Midrash Mishlei', 'Midrash Tehillim', 'Midrash Tanchuma'];
    var displayCategory = this.props.category;
    var displayHeCategory = Sefaria.hebrewCategory(this.props.category);
    if (whiteList.indexOf(title) == -1){
      var replaceTitles = {
        "en": ['Jerusalem Talmud', displayCategory],
        "he": ['תלמוד ירושלמי', displayHeCategory]
      };
      var replaceOther = {
        "en" : [", ", " on "],
        "he" : [", ", " על "]
      };
      //this will replace a categroy name at the beginning of the title string and any connector strings (0 or 1) that follow.
      var titleRe = new RegExp(`^(${replaceTitles['en'].join("|")})(${replaceOther['en'].join("|")})?`);
      var heTitleRe = new RegExp(`^(${replaceTitles['he'].join("|")})(${replaceOther['he'].join("|")})?`);
      title   = title == displayCategory ? title : title.replace(titleRe, "");
      heTitle = heTitle == displayHeCategory ? heTitle : heTitle.replace(heTitleRe, "");
    }
    return [title, heTitle];
  },

  getRenderedTextTitleString: function(title, heTitle){
    var whiteList = ['Midrash Mishlei', 'Midrash Tehillim', 'Midrash Tanchuma'];
    var displayCategory = this.props.category;
    var displayHeCategory = Sefaria.hebrewCategory(this.props.category);
    if (whiteList.indexOf(title) == -1){
      var replaceTitles = {
        "en": ['Jerusalem Talmud', displayCategory],
        "he": ['תלמוד ירושלמי', displayHeCategory]
      };
      var replaceOther = {
        "en" : [", ", " on "],
        "he" : [", ", " על "]
      };
      //this will replace a categroy name at the beginning of the title string and any connector strings (0 or 1) that follow.
      var titleRe = new RegExp(`^(${replaceTitles['en'].join("|")})(${replaceOther['en'].join("|")})?`);
      var heTitleRe = new RegExp(`^(${replaceTitles['he'].join("|")})(${replaceOther['he'].join("|")})?`);
      title   = title == displayCategory ? title : title.replace(titleRe, "");
      heTitle = heTitle == displayHeCategory ? heTitle : heTitle.replace(heTitleRe, "");
    }
    return [title, heTitle];
  },
  render: function() {
      var content = [];
      var cats = this.props.categories || [];
      for (var i = 0; i < this.props.contents.length; i++) {
        var item = this.props.contents[i];
        if (item.category) {
          var newCats = cats.concat(item.category);
          // Special Case categories which should nest but are normally wouldnt given their depth
          var subcats = [ "Mishneh Torah", "Shulchan Arukh", "Maharal"];
          if (Sefaria.util.inArray(item.category, subcats) > -1 || this.props.nestLevel > 0) {
            if(item.contents.length == 1 && !("category" in item.contents[0])){
                var chItem = item.contents[0]
                var [title, heTitle] = this.getRenderedTextTitleString(chItem.title, chItem.heTitle);
                var url     = "/" + Sefaria.normRef(chItem.firstSection);
                content.push((<a href={url}>
                                <span className={'refLink sparse' + chItem.sparseness} data-ref={chItem.firstSection} key={"text." + this.props.nestLevel + "." + i}>
                                  <span className='en'>{title}</span>
                                  <span className='he'>{heTitle}</span>
                                </span>
                              </a>));
            }else{
              url = "/texts/" + newCats.join("/");
              content.push((<a href={url}>
                            <span className="catLink" data-cats={newCats.join("|")} key={"cat." + this.props.nestLevel + "." + i}>
                              <span className='en'>{item.category}</span>
                              <span className='he'>{item.heCategory}</span>
                            </span>
                          </a>));
            }
          }else{
            // Add a Category
            content.push((<div className='category' key={"cat." + this.props.nestLevel + "." + i}>
                            <h3>
                              <span className='en'>{item.category}</span>
                              <span className='he'>{item.heCategory}</span>
                            </h3>
                            <ReaderNavigationCategoryMenuContents contents={item.contents} categories={newCats} width={this.props.width} nestLevel={this.props.nestLevel + 1} category={this.props.category}  />
                          </div>));
          }
        } else {
          //Add a Text
          var [title, heTitle] = this.getRenderedTextTitleString(item.title, item.heTitle);
          var url     = "/" + Sefaria.normRef(item.firstSection);
          content.push((<a href={url}>
                          <span className={'refLink sparse' + item.sparseness} data-ref={item.firstSection} key={"text." + this.props.nestLevel + "." + i}>
                            <span className='en'>{title}</span>
                            <span className='he'>{heTitle}</span>
                          </span>
                        </a>));
        }
      }
      var boxedContent = [];
      var currentRun   = [];
      for (var i = 0; i < content.length; i++) {
        // Walk through content looking for runs of texts/subcats to group together into a table
        if (content[i].type == "div") { // this is a subcategory
          if (currentRun.length) {
            boxedContent.push((<TwoOrThreeBox content={currentRun} width={this.props.width} key={i} />));
            currentRun = [];
          }
          boxedContent.push(content[i]);
        } else  { // this is a single text
          currentRun.push(content[i]);
        }
      }
      if (currentRun.length) {
        boxedContent.push((<TwoOrThreeBox content={currentRun} width={this.props.width} key={i} />));
      }
      return (<div>{boxedContent}</div>);
  }
});


var ReaderTextTableOfContents = React.createClass({
  // Menu for the Table of Contents for a single text
  propTypes: {
    mode:             React.PropTypes.string.isRequired,
    title:            React.PropTypes.string.isRequired,
    category:         React.PropTypes.string.isRequired,
    currentRef:       React.PropTypes.string.isRequired,
    settingsLanguage: React.PropTypes.string.isRequired,
    versionLanguage:  React.PropTypes.string,
    version:          React.PropTypes.string,
    close:            React.PropTypes.func.isRequired,
    openNav:          React.PropTypes.func.isRequired,
    showBaseText:     React.PropTypes.func.isRequired,
    selectVersion:    React.PropTypes.func
  },
  getInitialState: function() {
    return {
      versions: [],
      versionsLoaded: false,
      currentVersion: null,
      dlVersionTitle: null,
      dlVersionLanguage: null,
      dlVersionFormat: null,
      dlReady: false
    }
  },
  componentDidMount: function() {
    this.loadHtml();
    this.loadVersions();
    this.bindToggles();
    this.shrinkWrap();
    window.addEventListener('resize', this.shrinkWrap);
  },
  componentWillUnmount: function() {
    window.removeEventListener('resize', this.shrinkWrap);
  },
  componentDidUpdate: function(prevProps, prevState) {
    if ((this.props.settingsLanguage != prevProps.settingsLanguage) ||
        (this.props.version != prevProps.version) ||
        (this.props.versionLanguage != prevProps.versionLanguage)
    ) {
      this.loadVersions();
    }
    this.bindToggles();
    this.shrinkWrap();
  },
  loadHtml: function() {
    var textTocHtml = Sefaria.textTocHtml(this.props.title);
    if (!textTocHtml) {
      Sefaria.textTocHtml(this.props.title, function() {
        this.forceUpdate();
      }.bind(this));
    }
  },
  loadVersions: function() {
    var ref = Sefaria.sectionRef(this.props.currentRef) || this.props.currentRef;
    if (!ref) {
      this.setState({versionsLoaded: true});
      return;
    }
    if (Sefaria.ref(ref)) {
      Sefaria.text(
        ref,
        {context: 1, version: this.props.version, language: this.props.versionLanguage},
        this.loadVersionsDataFromText);
    } else {
      Sefaria.versions(ref, function(d) {this.setState({ versions: d, versionsLoaded: true})}.bind(this));
    }
  },
  loadVersionsDataFromText: function(d) {
    // For now treat bilinguale as english. TODO show attribution for 2 versions in bilingual case.
    var currentLanguage = this.props.settingsLanguage == "he" ? "he" : "en";
    if (currentLanguage == "en" && !d.text.length) {currentLanguage = "he"}
    if (currentLanguage == "he" && !d.he.length) {currentLanguage = "en"}

    var currentVersion = {
      language:            currentLanguage,
      versionTitle:        currentLanguage == "he" ? d.heVersionTitle : d.versionTitle,
      versionSource:       currentLanguage == "he" ? d.heVersionSource : d.versionSource,
      versionStatus:       currentLanguage == "he" ? d.heVersionStatus : d.versionStatus,
      license:             currentLanguage == "he" ? d.heLicense : d.license,
      sources:             currentLanguage == "he" ? d.heSources : d.sources,
      versionNotes:        currentLanguage == "he" ? d.heVersionNotes : d.versionNotes,
      digitizedBySefaria:  currentLanguage == "he" ? d.heDigitizedBySefaria : d.digitizedBySefaria
    };
    currentVersion.merged = !!(currentVersion.sources);

    this.setState({
                    versions:d.versions, 
                    versionsLoaded: true,
                    currentVersion: currentVersion
                  });
  },
  handleClick: function(e) {
    var $a = $(e.target).closest("a");
    if ($a.length) {
      var ref = $a.attr("data-ref");
      ref = decodeURIComponent(ref);
      ref = Sefaria.humanRef(ref);
      this.props.close();
      this.props.showBaseText(ref, false, this.props.version, this.props.versionLanguage);
      e.preventDefault();
    }
  },
  bindToggles: function() {
    // Toggling TOC Alt structures
    var component = this;
    $(".altStructToggle").click(function(){
        $(".altStructToggle").removeClass("active");
        $(this).addClass("active");
        var i = $(this).closest("#structToggles").find(".altStructToggle").index(this);
        $(".altStruct").hide();
        $(".altStruct").eq(i).show();
        component.shrinkWrap();
    });    
  },
  shrinkWrap: function() {
    // Shrink the width of the container of a grid of inline-line block elements,
    // so that is is tight around its contents thus able to appear centered. 
    // As far as I can tell, there's no way to do this in pure CSS.
    // TODO - flexbox should be able to solve this
    var shrink  = function(i, container) {
      var $container = $(container);
      // don't run on complex nodes without sectionlinks
      if ($container.hasClass("schema-node-toc") && !$container.find(".sectionLink").length) { return; } 
      var maxWidth   = $container.parent().innerWidth();
      var itemWidth  = $container.find(".sectionLink").outerWidth(true);
      var nItems     = $container.find(".sectionLink").length;

      if (maxWidth / itemWidth > nItems) {
        var width = nItems * itemWidth;
      } else {
        var width = Math.floor(maxWidth / itemWidth) * itemWidth;
      }
      $container.width(width + "px");
    };
    var $root = $(ReactDOM.findDOMNode(this)).find(".altStruct:visible");
    $root = $root.length ? $root : $(ReactDOM.findDOMNode(this)).find(".tocContent");
    if ($root.find(".tocSection").length) {             // nested simple text
      //$root.find(".tocSection").each(shrink); // Don't bother with these for now
    } else if ($root.find(".schema-node-toc").length) { // complex text or alt struct
      $root.find(".schema-node-toc, .schema-node-contents").each(shrink); 
    } else {
      $root.find(".tocLevel").each(shrink);             // Simple text, no nesting
    }
  },
  onVersionSelectChange: function(event) {
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
  onDlVersionSelect: function(event) {
    var versionTitle, versionLang;
    [versionTitle, versionLang] = event.target.value.split("/");
    this.setState({
      dlVersionTitle: versionTitle,
      dlVersionLanguage: versionLang
    });
  },
  onDlFormatSelect: function(event) {
    this.setState({dlVersionFormat: event.target.value});
  },
  versionDlLink: function() {
    return `/download/version/${this.props.title} - ${this.state.dlVersionLanguage} - ${this.state.dlVersionTitle}.${this.state.dlVersionFormat}`;
  },
  recordDownload: function() {
    Sefaria.site.track.event("Reader", "Version Download", `${this.props.title} / ${this.state.dlVersionTitle} / ${this.state.dlVersionLanguage} / ${this.state.dlVersionFormat}`);
    return true;
  },
  isBookToc: function() {
    return (this.props.mode == "book toc")
  },
  isTextToc: function() {
    return (this.props.mode == "text toc")
  },
  isVersionPublicDomain: v => !(v.license && v.license.startsWith("Copyright")),
  render: function() {
    var tocHtml = Sefaria.textTocHtml(this.props.title);

    tocHtml = tocHtml || '<div class="loadingMessage"><span class="int-en">Loading...</span><span class="int-he">טוען...</span></div>';

    var title     = this.props.title;
    var heTitle   = Sefaria.index(title) ? Sefaria.index(title).heTitle : title;


    var currentVersionElement = null;
    var defaultVersionString = "Default Version";
    var defaultVersionObject = null;
    var versionBlocks = "";
    var dl_versions = [];

    if (this.state.versionsLoaded) {
      var cv = this.state.currentVersion;
      if (cv && cv.merged) {
        var uniqueSources = cv.sources.filter(function(item, i, ar){ return ar.indexOf(item) === i; }).join(", ");
        defaultVersionString += " (Merged from " + uniqueSources + ")";
        currentVersionElement = (<div className="versionTitle">Merged from { uniqueSources }</div>);
      } else if (cv) {
        if (!this.props.version) {
          defaultVersionObject = this.state.versions.find(v => (cv.language == v.language && cv.versionTitle == v.versionTitle));
          defaultVersionString += defaultVersionObject ? " (" + defaultVersionObject.versionTitle + ")" : "";
        }
        currentVersionElement = (<VersionBlock title={title} version={cv} currentRef={this.props.currentRef} showHistory={true}/>);
      }

      var [heVersionBlocks, enVersionBlocks] = ["he","en"].map(lang =>
       this.state.versions.filter(v => v.language == lang).map(v =>
           <VersionBlock title={title} version={v} showNotes={true} key={v.versionTitle + "/" + v.language}/>
       )
      );

      versionBlocks = <div className="versionBlocks">
        {(!!heVersionBlocks.length)?<div className="versionLanguageBlock"><div className="versionLanguageHeader"><span className="int-en">Hebrew Versions</span><span className="int-he">בעברית</span></div><div>{heVersionBlocks}</div></div>:""}
        {(!!enVersionBlocks.length)?<div className="versionLanguageBlock"><div className="versionLanguageHeader"><span className="int-en">English Versions</span><span className="int-he">באנגלית</span></div><div>{enVersionBlocks}</div></div>:""}
        <div style={{clear: "both"}}></div>
      </div>;

      // Dropdown options for downloadable texts
      dl_versions = [<option key="/" value="0" disabled>Version Settings</option>];
      var pdVersions = this.state.versions.filter(this.isVersionPublicDomain);
      if (cv && cv.merged) {
        var other_lang = cv.language == "he" ? "en" : "he";
        dl_versions = dl_versions.concat([
          <option value={"merged/" + cv.language} key={"merged/" + cv.language} data-lang={cv.language} data-version="merged">Current Merged Version ({cv.language})</option>,
          <option value={"merged/" + other_lang} key={"merged/" + other_lang} data-lang={other_lang} data-version="merged">Merged Version ({other_lang})</option>
        ]);
        dl_versions = dl_versions.concat(pdVersions.map(v =>
          <option value={v.versionTitle + "/" + v.language} key={v.versionTitle + "/" + v.language}>{v.versionTitle + " (" + v.language + ")"}</option>
        ));
      }
      else if (cv) {
        if (this.isVersionPublicDomain(cv)) {
          dl_versions.push(<option value={cv.versionTitle + "/" + cv.language} key={cv.versionTitle + "/" + cv.language}>Current Version ({cv.versionTitle + " (" + cv.language + ")"})</option>);
        }
        dl_versions = dl_versions.concat([
          <option value="merged/he" key="merged/he">Merged Version (he)</option>,
          <option value="merged/en" key="merged/en">Merged Version (en)</option>
        ]);
        dl_versions = dl_versions.concat(pdVersions.filter(v => v.language != cv.language || v.versionTitle != cv.versionTitle).map(v =>
          <option value={v.versionTitle + "/" + v.language} key={v.versionTitle + "/" + v.language}>{v.versionTitle + " (" + v.language + ")"}</option>
        ));
      }
      else {
        dl_versions = dl_versions.concat([
          <option value="merged/he" key="merged/he">Merged Version (he)</option>,
          <option value="merged/en" key="merged/en">Merged Version (en)</option>
        ]);
        dl_versions = dl_versions.concat(pdVersions.map(v =>
          <option value={v.versionTitle + "/" + v.language} key={v.versionTitle + "/" + v.language}>{v.versionTitle + " (" + v.language + ")"}</option>
        ));
      }
      // End Dropdown options for downloadable texts
    }


    if (this.isTextToc()) {
      var sectionStrings = Sefaria.sectionString(this.props.currentRef);
      var section   = sectionStrings.en.named;
      var heSection = sectionStrings.he.named;

      var selectOptions = [];
      selectOptions.push(<option key="0" value="0">{defaultVersionString}</option>);    // todo: add description of current version.
      var selectedOption = 0;
      for (var i = 0; i < this.state.versions.length; i++) {
        var v = this.state.versions[i];
        if (v == defaultVersionObject) {
          continue;
        }
        if (this.state.currentVersion.language == v.language && this.state.currentVersion.versionTitle == v.versionTitle) {
          selectedOption = i+1;
        }
        var versionString = v.versionTitle + " (" + v.language + ")";  // Can not inline this, because of https://github.com/facebook/react-devtools/issues/248
        selectOptions.push(<option key={i+1} value={i+1} >{ versionString }</option>);
      }
      var selectElement = (<div className="versionSelect">
                             <select value={selectedOption} onChange={this.onVersionSelectChange}>
                               {selectOptions}
                             </select>
                           </div>);
    }
    var showModeratorButtons = Sefaria.is_moderator;
    //if(/*(this.isTextToc() && this.state.currentVersion && this.state.currentVersion.versionStatus == "locked") ||*/
    //    !Sefaria.is_moderator){
    //  showModeratorButtons = false;
    //}
    var moderatorSection = showModeratorButtons ?
      (<ModeratorButtons 
        title={title}
        versionTitle={this.state.currentVersion ? this.state.currentVersion.versionTitle : null}
        versionLanguage={this.state.currentVersion ? this.state.currentVersion.language : null}
        versionStatus={this.state.currentVersion ? this.state.currentVersion.versionStatus: null} />) :
      null;

    // Downloading
    var dlReady = (this.state.dlVersionTitle && this.state.dlVersionFormat && this.state.dlVersionLanguage);
    var downloadButton = <div className="versionDownloadButton">
        <div className="downloadButtonInner">
          <span className="int-en">Download</span>
          <span className="int-he">הורדה</span>
        </div>
      </div>;
    var downloadSection = (
      <div className="dlSection">
        <div className="dlSectionTitle">
          <span className="int-en">Download Text</span>
          <span className="int-he">הורדת הטקסט</span>
        </div>
        <select className="dlVersionSelect dlVersionTitleSelect" value={(this.state.dlVersionTitle && this.state.dlVersionLanguage)?this.state.dlVersionTitle + "/" + this.state.dlVersionLanguage:""} onChange={this.onDlVersionSelect}>
          {dl_versions}
        </select>
        <select className="dlVersionSelect dlVersionFormatSelect" value={this.state.dlVersionFormat || ""} onChange={this.onDlFormatSelect}>
          <option disabled>File Format</option>
          <option key="txt" value="txt" >Text</option>
          <option key="csv" value="csv" >CSV</option>
          <option key="json" value="json" >JSON</option>
        </select>
        {dlReady?<a onClick={this.recordDownload} href={this.versionDlLink()} download>{downloadButton}</a>:downloadButton}
      </div>
    );

    var closeClick = (this.isBookToc())?this.props.closePanel:this.props.close;
    return (<div className="readerTextTableOfContents readerNavMenu">
              <CategoryColorLine category={this.props.category} />
              <div className="readerControls">
                <div className="readerControlsInner">
                  <div className="leftButtons">
                    <ReaderNavigationMenuCloseButton onClick={closeClick}/>
                  </div>
                  <div className="rightButtons">
                    <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
                  </div>
                  <div className="readerTextToc readerTextTocHeader">
                    <div className="readerTextTocBox">
                      <span className="int-en">Table of Contents</span>
                      <span className="int-he">תוכן העניינים</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="content">
                <div className="contentInner">
                  <div className="tocTitle">
                    <span className="en">{title}</span>
                    <span className="he">{heTitle}</span>
                    {this.isTextToc()?
                      <div className="currentSection">
                        <span className="en">{section}</span>
                        <span className="he">{heSection}</span>
                      </div>
                    : null}
                  </div>
                  {this.isTextToc()?
                    <div className="currentVersionBox">
                        {(!this.state.versionsLoaded) ? (<span>Loading...</span>): ""}
                        {(this.state.versionsLoaded)? currentVersionElement: ""}
                        {(this.state.versionsLoaded && this.state.versions.length > 1) ? selectElement: ""}
                    </div>
                  : null}
                  {moderatorSection}
                  <div className="tocContent" dangerouslySetInnerHTML={ {__html: tocHtml} }  onClick={this.handleClick}></div>
                  {versionBlocks}
                  {downloadSection}
                </div>
              </div>
            </div>);
  }
});


var VersionBlock = React.createClass({
  propTypes: {
    title:  React.PropTypes.string.isRequired,
    version: React.PropTypes.object.isRequired,
    currentRef: React.PropTypes.string,
    showHistory: React.PropTypes.bool,
    showNotes: React.PropTypes.bool
  },
  getDefaultProps: function() {
    return {
      ref: "",
      showHistory: false,
      showNotes: false
    }
  },
  getInitialState: function() {
    var s = {
      editing: false,
      error: null,
      originalVersionTitle: this.props.version["versionTitle"]
    };
    this.updateableVersionAttributes.forEach(attr => s[attr] = this.props.version[attr]);
    return s;
  },
  updateableVersionAttributes: [
    "versionTitle",
    "versionSource",
    "versionNotes",
    "license",
    "priority",
    "digitizedBySefaria"
  ],
  licenseMap: {
    "Public Domain": "http://en.wikipedia.org/wiki/Public_domain",
    "CC0": "http://creativecommons.org/publicdomain/zero/1.0/",
    "CC-BY": "http://creativecommons.org/licenses/by/3.0/",
    "CC-BY-SA": "http://creativecommons.org/licenses/by-sa/3.0/"
  },
  onLicenseChange: function(event) {
    this.setState({license: event.target.value, "error": null});
  },
  onVersionSourceChange: function(event) {
    this.setState({versionSource: event.target.value, "error": null});
  },
  onVersionNotesChange: function(event) {
    this.setState({versionNotes: event.target.value, "error": null});
  },
  onPriorityChange: function(event) {
    this.setState({priority: event.target.value, "error": null});
  },
  onDigitizedBySefariaChange: function(event) {
    this.setState({digitizedBySefaria: event.target.checked, "error": null});
  },
  onVersionTitleChange: function(event) {
    this.setState({versionTitle: event.target.value, "error": null});
  },
  saveVersionUpdate: function(event) {
    var v = this.props.version;

    var payloadVersion = {};
    this.updateableVersionAttributes.forEach(function(attr) {
      if (this.state[attr] || this.state[attr] != this.props.version[attr]) {
        payloadVersion[attr] = this.state[attr];
      }
    }.bind(this));
    delete payloadVersion.versionTitle;
    if (this.state.versionTitle != this.state.originalVersionTitle) {
      payloadVersion.newVersionTitle = this.state.versionTitle;
    }
    this.setState({"error": "Saving.  Page will reload on success."});
    $.ajax({
      url: `/api/version/flags/${this.props.title}/${v.language}/${v.versionTitle}`,
      dataType: 'json',
      type: 'POST',
      data: {json: JSON.stringify(payloadVersion)},
      success: function(data) {
        if (data.status == "ok") {
          document.location.reload(true);
        } else {
          this.setState({error: data.error});
        }
      }.bind(this),
      error: function(xhr, status, err) {
        this.setState({error: err.toString()});
      }.bind(this)
    });
  },
  openEditor: function() {
    this.setState({editing:true});
  },
  closeEditor: function() {
    this.setState({editing:false});
  },
  render: function() {
    var v = this.props.version;

    if (this.state.editing) {
      // Editing View
      var close_icon = (Sefaria.is_moderator)?<i className="fa fa-times-circle" aria-hidden="true" onClick={this.closeEditor}/>:"";

      var licenses = Object.keys(this.licenseMap);
      licenses = licenses.includes(v.license) ? licenses : [v.license].concat(licenses);

      return (
        <div className = "versionBlock">
          <div className="error">{this.state.error}</div>
          <div className="versionEditForm">

            <label for="versionTitle" className="">Version Title</label>
            {close_icon}
            <input id="versionTitle" className="" type="text" value={this.state.versionTitle} onChange={this.onVersionTitleChange} />

            <label for="versionSource">Version Source</label>
            <input id="versionSource" className="" type="text" value={this.state.versionSource} onChange={this.onVersionSourceChange} />

            <label id="license_label" for="license">License</label>
            <select id="license" className="" value={this.state.license} onChange={this.onLicenseChange}>
              {licenses.map(v => <option key={v} value={v}>{v?v:"(None Listed)"}</option>)}
            </select>

            <label id="digitzedBySefaria_label" for="digitzedBySefaria">Digitized by Sefaria</label>
            <input type="checkbox" id="digitzedBySefaria" checked={this.state.digitizedBySefaria} onChange={this.onDigitizedBySefariaChange}/>

            <label id="priority_label" for="priority">Priority</label>
            <input id="priority" className="" type="text" value={this.state.priority} onChange={this.onPriorityChange} />

            <label id="versionNotes_label" for="versionNotes">VersionNotes</label>
            <textarea id="versionNotes" placeholder="Version Notes" onChange={this.onVersionNotesChange} value={this.state.versionNotes} rows="5" cols="40"/>

            <div id="save_button" onClick={this.saveVersionUpdate}>SAVE</div>
          </div>
        </div>
      );
    } else {
      // Presentation View
      var license = this.licenseMap[v.license]?<a href={this.licenseMap[v.license]} target="_blank">{v.license}</a>:v.license;
      var digitizedBySefaria = v.digitizedBySefaria ? <a className="versionDigitizedBySefaria" href="/digitized-by-sefaria">Digitized by Sefaria</a> : "";
      var licenseLine = "";
      if (v.license && v.license != "unknown") {
        licenseLine =
          <span className="versionLicense">
            {license}
            {digitizedBySefaria?" - ":""}{digitizedBySefaria}
          </span>
        ;
      }
      var edit_icon = (Sefaria.is_moderator)?<i className="fa fa-pencil" aria-hidden="true" onClick={this.openEditor}/>:"";

      return (
        <div className = "versionBlock">
          <div className="versionTitle">
            {v.versionTitle}
            {edit_icon}
          </div>
          <div>
            <a className="versionSource" target="_blank" href={v.versionSource}>
            { Sefaria.util.parseURL(v.versionSource).host }
            </a>
            {licenseLine?<span>-</span>:""}
            {licenseLine}
            {this.props.showHistory?<span>-</span>:""}
            {this.props.showHistory?<a className="versionHistoryLink" href={`/activity/${Sefaria.normRef(this.props.currentRef)}/${v.language}/${v.versionTitle && v.versionTitle.replace(/\s/g,"_")}`}>Version History &gt;</a>:""}
          </div>
          {this.props.showNotes?<div className="versionNotes" dangerouslySetInnerHTML={ {__html: v.versionNotes} }></div>:""}
        </div>
      );
    }

  }
});


var ModeratorButtons = React.createClass({
  propTypes: {
    title: React.PropTypes.string.isRequired,
    currentRef: React.PropTypes.string,
    versionTitle: React.PropTypes.string,
    versionLanguage: React.PropTypes.string,
    versionStatus: React.PropTypes.string
  },
  getInitialState: function() {
    return {
      expanded: false,
      message: null,
      locked: this.props.versionStatus == "locked"
    }
  },
  expand: function() {
    this.setState({expanded: true});
  },
  toggleLock: function() {
    var title = this.props.title;
    var url = "/api/locktext/" + title + "/" + this.props.versionLanguage + "/" + this.props.versionTitle;
    if (this.state.locked) {
      url += "?action=unlock";
    }

    $.post(url, {}, function(data) {
      if ("error" in data) {
        alert(data.error)
      } else {
        alert(this.state.locked ? "Text Unlocked" : "Text Locked");
        this.setState({locked: !this.state.locked})
      }
    }.bind(this)).fail(function() {
      alert("Something went wrong. Sorry!");
    });
  },
  deleteVersion: function() {
    var title = this.props.title;
    var url = "/api/texts/" + title + "/" + this.props.versionLanguage + "/" + this.props.versionTitle;

    $.ajax({
      url: url,
      type: "DELETE",
      success: function(data) {
        if ("error" in data) {
          alert(data.error)
        } else {
          alert("Text Version Deleted.");
          window.location = "/" + Sefaria.normRef(title);
        }
      }
    }).fail(function() {
      alert("Something went wrong. Sorry!");
    });
  },
  editIndex: function() {
    window.location = "/edit/textinfo/" + this.props.title; 
  },
  deleteIndex: function() {
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
      success: function(data) {
        if ("error" in data) {
          alert(data.error)
        } else {
          alert("Text Deleted.");
          window.location = "/";
        }
      }
    }).fail(function() {
      alert("Something went wrong. Sorry!");
    });
    this.setState({message: "Deleting text (this may time a while)..."});
  },
  render: function() {
    if (!this.state.expanded) {
      return (<div className="moderatorSectionExpand" onClick={this.expand}>
                <i className="fa fa-cog"></i> Moderator Tools
              </div>);
    }
    var versionButtons = this.props.versionTitle ? 
      (<span className="moderatorVersionButtons">
          <div className="button white" onClick={this.toggleLock}>
            { this.state.locked ?
                (<span><i className="fa fa-unlock"></i> Unlock</span>) :
                (<span><i className="fa fa-lock"></i> Lock</span>) }
          </div>
          <div className="button white" onClick={this.deleteVersion}>
              <span><i className="fa fa-trash"></i> Delete Version</span>
          </div>
       </span>)
      : null;
    var textButtons = (<span className="moderatorTextButtons">
                          <div className="button white" onClick={this.editIndex}>
                              <span><i className="fa fa-info-circle"></i> Edit Text Info</span>
                          </div>
                          <div className="button white" onClick={this.deleteIndex}>
                              <span><i className="fa fa-exclamation-triangle"></i> Delete {this.props.title}</span>
                          </div>
                        </span>);
    var message = this.state.message ? (<div className="moderatorSectionMessage">{this.state.message}</div>) : null; 
    return (<div className="moderatorSection">
              {versionButtons}
              {textButtons}
              {message}
            </div>);
  }
});

var SheetsNav = React.createClass({
  // Navigation for Sheets
  propTypes: {
    multiPanel:      React.PropTypes.bool,
    tag:             React.PropTypes.string,
    tagSort:         React.PropTypes.string,
    close:           React.PropTypes.func.isRequired,
    openNav:         React.PropTypes.func.isRequired,
    setSheetTag:     React.PropTypes.func.isRequired,
    setSheetTagSort: React.PropTypes.func.isRequired,
    hideNavHeader:   React.PropTypes.bool
  },
  getInitialState: function() {
    return {
      width: this.props.multiPanel ? 1000 : 400,
    };
  },
  componentDidMount: function() {
    this.setState({width: $(ReactDOM.findDOMNode(this)).width()});
  },
  componentWillReceiveProps: function(nextProps) {
    
  },
  changeSort: function(sort) {
    this.props.setSheetTagSort(sort);
    //Sefaria.sheets.tagList(this.loadTags, event.target.value);
  },
  render: function() {
    var enTitle = this.props.tag || "Source Sheets";
    var heTitle = this.props.tag || "דפי מקורות";

    if (this.props.tag == "My Sheets") {
      var content = (<MySheetsPage
                        hideNavHeader={this.props.hideNavHeader}
                        tagSort={this.props.tagSort}
                        mySheetSort={this.props.mySheetSort}
                        multiPanel={this.props.multiPanel}
                        setMySheetSort={this.props.setMySheetSort}
                        setSheetTag={this.props.setSheetTag}
                        setSheetTagSort={this.props.setSheetTagSort}
                        width={this.state.width} />);


    } else if (this.props.tag == "All Sheets") {
      var content = (<AllSheetsPage
                        hideNavHeader={this.props.hideNavHeader} />);

    } else if (this.props.tag == "sefaria-partners") {
      var content = (<PartnerSheetsPage
                        hideNavHeader={this.props.hideNavHeader}
                        multiPanel={this.props.multiPanel}
                        partner={this.props.partner} />);

    } else if (this.props.tag) {
      var content = (<TagSheetsPage 
                        tag={this.props.tag}
                        setSheetTag={this.props.setSheetTag}
                        multiPanel={this.props.multiPanel}
                        hideNavHeader={this.props.hideNavHeader}
                        width={this.state.width} />);  

    } else {
      var content = (<SheetsHomePage
                       tagSort={this.props.tagSort} 
                       setSheetTag={this.props.setSheetTag}
                       setSheetTagSort={this.props.setSheetTagSort}
                       multiPanel={this.props.multiPanel}
                       hideNavHeader={this.props.hideNavHeader}
                       width={this.state.width} />);  
    }

    var classes = classNames({readerNavMenu: 1, readerSheetsNav: 1, noHeader: this.props.hideNavHeader});
    return (<div className={classes}>
              <CategoryColorLine category="Sheets" />
              {this.props.hideNavHeader ? null :
                 (<div className="readerNavTop searchOnly" key="navTop">
                    <CategoryColorLine category="Sheets" />
                    <ReaderNavigationMenuMenuButton onClick={this.props.openNav} />
                    <h2>
                      <span className="int-en">{enTitle}</span>
                      <span className="int-he">{heTitle}</span>
                    </h2>
                  </div>)}
              {content}
            </div>);
  }
});


var SheetsHomePage = React.createClass({
  // A set of options grouped together.
  propTypes: {
    setSheetTag:     React.PropTypes.func.isRequired,
    setSheetTagSort: React.PropTypes.func.isRequired,
    hideNavHeader:   React.PropTypes.bool
  },
  componentDidMount: function() {
    this.ensureData();
  },
  getTopSheetsFromCache: function() {
    return Sefaria.sheets.topSheets();
  },
  getSheetsFromAPI: function() {
     Sefaria.sheets.topSheets(this.onDataLoad);
  },
  getTagListFromCache: function() {
    return Sefaria.sheets.tagList(this.props.tagSort);
  },
  getTagListFromAPI: function() {
    Sefaria.sheets.tagList(this.props.tagSort, this.onDataLoad);
  },
  getTrendingTagsFromCache: function() {
    return Sefaria.sheets.trendingTags();
  },
  getTrendingTagsFromAPI: function() {
    Sefaria.sheets.trendingTags(this.onDataLoad);
  },
  onDataLoad: function(data) {
    this.forceUpdate();
  },
  ensureData: function() {
    if (!this.getTopSheetsFromCache()) { this.getSheetsFromAPI(); }
    if (!this.getTagListFromCache()) { this.getTagListFromAPI(); }    
    if (!this.getTrendingTagsFromCache()) { this.getTrendingTagsFromAPI(); }    
  },
  showYourSheets: function() {
    this.props.setSheetTag("My Sheets");
  },
  showAllSheets: function() { 
    this.props.setSheetTag("All Sheets");
  },
  changeSort: function(sort) {
    this.props.setSheetTagSort(sort);
  },
  _type_sheet_button: function(en, he, on_click, active) {
    var classes = classNames({"type-button": 1, active: active});

      return <div className={classes} onClick={on_click}>
      <div className="type-button-title">
        <span className="int-en">{en}</span>
        <span className="int-he">{he}</span>
      </div>
    </div>;
  },

  render: function() {
    var trendingTags = this.getTrendingTagsFromCache();
    var topSheets    = this.getTopSheetsFromCache();
    if (this.props.tagSort == "trending") { var tagList  = this.getTrendingTagsFromCache(); }
    else { var tagList = this.getTagListFromCache(); }

    var makeTagButton = tag => <SheetTagButton setSheetTag={this.props.setSheetTag} tag={tag.tag} count={tag.count} key={tag.tag} />;

    var trendingTags    = trendingTags ? trendingTags.slice(0,6).map(makeTagButton) : [<LoadingMessage />];
    var tagList         = tagList ? tagList.map(makeTagButton) : [<LoadingMessage />];
    var publicSheetList = topSheets ? topSheets.map(function(sheet) {
      return (<PublicSheetListing sheet={sheet} key={sheet.id} />);
    }) : [<LoadingMessage />];

    var yourSheetsButton  = Sefaria._uid ? 
      (<div className="yourSheetsLink navButton" onClick={this.showYourSheets}>
        <span className="int-en">My Source Sheets <i className="fa fa-chevron-right"></i></span>
        <span className="int-he">דפי המקורות שלי <i className="fa fa-chevron-left"></i></span>
       </div>) : null;

    return (<div className="content hasFooter">
              <div className="contentInner">
                {this.props.hideNavHeader ? (<h1>
                  <span className="int-en">Source Sheets</span>
                  <span className="int-he">דפי מקורות</span>
                </h1>) : null}
                { this.props.multiPanel ? null : yourSheetsButton }

                { this.props.multiPanel ?
                  (<h2 className="splitHeader">
                    <span className="int-en">Public Sheets</span>
                    <span className="int-en actionText" onClick={this.showAllSheets}>See All <i className="fa fa-angle-right"></i></span>
                    <span className="int-he">דפי מקורות פומביים</span>
                    <span className="int-he actionText" onClick={this.showAllSheets}>צפה בהכל <i className="fa fa-angle-left"></i></span>
                  </h2>) : 
                  (<h2>
                      <span className="int-en">Public Sheets</span>
                      <span className="int-he">דפי מקורות פומביים</span>
                   </h2>)}

                <div className="topSheetsBox">
                  {publicSheetList}
                </div>

                { this.props.multiPanel ? null : 
                  (<h2>
                     <span className="int-en">Trending Tags</span>
                    <span className="int-he">תוויות פופולריות</span>
                   </h2>)}

                { this.props.multiPanel ? null : (<TwoOrThreeBox content={trendingTags} width={this.props.width} /> )}

                { this.props.multiPanel ? (
                    <h2 className="tagsHeader">
                      <span className="int-en">All Tags</span>
                      <span className="int-he">כל התוויות</span>
                      <div className="actionText">
                        <div className="type-buttons">
                          {this._type_sheet_button("Most Used", "הכי בשימוש", () => this.changeSort("count"), (this.props.tagSort == "count"))}
                          {this._type_sheet_button("Alphabetical", "אלפביתי", () => this.changeSort("alpha"), (this.props.tagSort == "alpha"))}
                          {this._type_sheet_button("Trending", "פופולרי", () => this.changeSort("trending"), (this.props.tagSort == "trending"))}
                        </div>
                      </div>
                    </h2>
                ) : (
                <h2>
                  <span className="en">All Tags</span>
                  <span className="he">כל התוויות</span>
                </h2>
                )}

                <TwoOrThreeBox content={tagList} width={this.props.width} />
              </div>
              <footer id="footer" className="static sans">
                    <Footer />
              </footer>
             </div>);
  }
});

var PartnerSheetsPage = React.createClass({
  getInitialState: function() {
    return {
      showYourSheetTags: false,
      sheetFilterTag: null
    };
  },
  componentDidMount: function() {
    this.ensureData();
  },
  getSheetsFromCache: function() {
    return  Sefaria.sheets.partnerSheets(this.props.partner);
  },
  getSheetsFromAPI: function() {
     Sefaria.sheets.partnerSheets(this.props.partner, this.onDataLoad);
  },
  getTagsFromCache: function() {
    return Sefaria.sheets.groupTagList(this.props.partner)
  },
  getTagsFromAPI: function() {
    Sefaria.sheets.partnerSheets(this.props.partner, this.onDataLoad);
  },
  onDataLoad: function(data) {
    this.forceUpdate();
  },
  ensureData: function() {
    if (!this.getSheetsFromCache()) { this.getSheetsFromAPI(); }
    if (!this.getTagsFromCache())   { this.getTagsFromAPI(); }
  },
  toggleSheetTags: function() {
    this.state.showYourSheetTags ? this.setState({showYourSheetTags: false}) : this.setState({showYourSheetTags: true});
  },
  filterYourSheetsByTag: function (tag) {
    if (tag.tag == this.state.sheetFilterTag) {
       this.setState({sheetFilterTag: null, showYourSheetTags: false});
    } else {
      this.setState({sheetFilterTag: tag.tag, showYourSheetTags: false});
    }
  },


    render: function() {
    var sheets = this.getSheetsFromCache();
    var groupTagList = this.getTagsFromCache();

    groupTagList = groupTagList ? groupTagList.map(function (tag) {
        var filterThisTag = this.filterYourSheetsByTag.bind(this, tag);
        var classes = classNames({navButton: 1, sheetButton: 1, active: this.state.sheetFilterTag == tag.tag});
        return (<div className={classes} onClick={filterThisTag} key={tag.tag}>{tag.tag} ({tag.count})</div>);
      }.bind(this)) : null;
      
    sheets = sheets && this.state.sheetFilterTag ? sheets.filter(function(sheet) {
      return Sefaria.util.inArray(this.state.sheetFilterTag, sheet.tags) >= 0;
    }.bind(this)) : sheets;
    sheets = sheets ? sheets.map(function(sheet) {
      return (<PartnerSheetListing sheet={sheet} multiPanel={this.props.multiPanel} setSheetTag={this.props.setSheetTag} />);
    }.bind(this)) : (<LoadingMessage />);


    return (<div className="content sheetList hasFooter">
                      <div className="contentInner">
                        {this.props.hideNavHeader ? (<h1>
                          <span className="int-en">{this.props.partner}</span>
                          <span className="int-he">{this.props.partner}</span>
                        </h1>) : null}

                        {this.props.hideNavHeader ?
                         (<h2 className="splitHeader">
                            <span className="int-en" onClick={this.toggleSheetTags}>Filter By Tag <i className="fa fa-angle-down"></i></span>
                            <span className="int-he" onClick={this.toggleSheetTags}>סנן לפי תווית<i className="fa fa-angle-down"></i></span>{/*
                            <span className="en actionText">Sort By:
                              <select value={this.props.mySheetSort} onChange={this.changeSortYourSheets}>
                               <option value="date">Recent</option>
                               <option value="views">Most Viewed</option>
                             </select> <i className="fa fa-angle-down"></i></span>
                            <span className="he actionText">סנן לפי:
                              <select value={this.props.mySheetSort} onChange={this.changeSortYourSheets}>
                               <option value="date">הכי חדש</option>
                               <option value="views">הכי נצפה</option>
                             </select> <i className="fa fa-angle-down"></i></span>
                             */}

                          </h2>) : null }

                        {this.state.showYourSheetTags ? <TwoOrThreeBox content={groupTagList} width={this.props.width} /> : null}

                        {sheets}
                      </div>
    <footer id="footer" className="static sans">
                        <Footer />
                      </footer>
    </div>);
  }


});

var PartnerSheetListing = React.createClass({
  propTypes: {
    sheet:      React.PropTypes.object.isRequired,
  },
  render: function() {
    var sheet = this.props.sheet;
    var title = sheet.title ? sheet.title.stripHtml() : "Untitled Source Sheet";
    var url = "/sheets/" + sheet.id;

    if (sheet.tags === undefined) sheet.tags = [];
      var tagString = sheet.tags.map(function (tag) {
          return(<SheetTagLink setSheetTag={this.props.setSheetTag} tag={tag} key={tag} />);
    },this);

    return (<div className="sheet userSheet">
                <a className="sheetTitle" href={url} key={url}>{title}</a>
                <div>{sheet.ownerName} · {sheet.views} Views · {sheet.modified} · <span className="tagString">{tagString}</span></div>
              </div>);

  }
});


var TagSheetsPage = React.createClass({
  // Page list all public sheets.
  propTypes: {
    hideNavHeader:   React.PropTypes.bool
  },
  componentDidMount: function() {
    this.ensureData();
  },
  getSheetsFromCache: function() {
    return  Sefaria.sheets.sheetsByTag(this.props.tag);
  },
  getSheetsFromAPI: function() {
     Sefaria.sheets.sheetsByTag(this.props.tag, this.onDataLoad);
  },
  onDataLoad: function(data) {
    this.forceUpdate();
  },
  ensureData: function() {
    if (!this.getSheetsFromCache()) { this.getSheetsFromAPI(); }
  },
  render: function() {
    var sheets = this.getSheetsFromCache();
    sheets = sheets ? sheets.map(function (sheet) {
      return (<PublicSheetListing sheet={sheet} />);
    }) : (<LoadingMessage />);
    return (<div className="content sheetList hasFooter">
                      <div className="contentInner">
                        {this.props.hideNavHeader ? (<h1>
                          <span className="int-en">{this.props.tag}</span>
                          <span className="int-he">{this.props.tag}</span>
                        </h1>) : null}
                        {sheets}
                      </div>
                      <footer id="footer" className="static sans">
                        <Footer />
                      </footer>
                    </div>);
  }
});


var AllSheetsPage = React.createClass({
  // Page list all public sheets.
  // TODO this is currently loading all public sheets at once, needs pagination
  propTypes: {
    hideNavHeader:   React.PropTypes.bool
  },
  getInitialState: function() {
    return {
      page: 1,
      loadedToEnd: false,
      loading: false,
      curSheets: [],
    };
  },
  componentDidMount: function() {
    $(ReactDOM.findDOMNode(this)).bind("scroll", this.handleScroll);
    this.ensureData();
  },
  handleScroll: function() {
    if (this.state.loadedToEnd || this.state.loading) { return; }
    var $scrollable = $(ReactDOM.findDOMNode(this));
    var margin = 100;
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this.getMoreSheets();
    }
  },
  getMoreSheets: function() {
    if (this.state.page == 1) {
      Sefaria.sheets.publicSheets(0,100,this.loadMoreSheets);
    }
    else {
      Sefaria.sheets.publicSheets( ((this.state.page)*50),50,this.loadMoreSheets);
    }
    this.setState({loading: true});
  },
  loadMoreSheets: function(data) {
    this.setState({page: this.state.page + 1});
    this.createSheetList(data)
  },
  createSheetList: function(newSheets) {

      if (newSheets) {
        this.setState({curSheets: this.state.curSheets.concat(newSheets), loading: false});
      }
  },
  getSheetsFromCache: function(offset) {
    if (!offset) offset=0;
    return  Sefaria.sheets.publicSheets(offset,50);
  },
  getSheetsFromAPI: function(offset) {
    if (!offset) offset=0;
     Sefaria.sheets.publicSheets(offset,50, this.onDataLoad);
  },
  onDataLoad: function(data) {
    this.forceUpdate();
  },
  ensureData: function() {
    if (!this.getSheetsFromCache()) { this.getSheetsFromAPI(); }
  },
  render: function() {
    if (this.state.page == 1) {
      var sheets = this.getSheetsFromCache();
    }
    else {
      var sheets = this.state.curSheets;
    }
    sheets = sheets ? sheets.map(function (sheet) {
      return (<PublicSheetListing sheet={sheet} />);
    }) : (<LoadingMessage />);
    return (<div className="content sheetList hasFooter">
                      <div className="contentInner">
                        {this.props.hideNavHeader ? (<h1>
                          <span className="int-en">All Sheets</span>
                          <span className="int-he">כל דפי המקורות</span>
                        </h1>) : null}
                        {sheets}
                      </div>
                      <footer id="footer" className="static sans">
                        <Footer />
                      </footer>
                    </div>);
  }
});


var PublicSheetListing = React.createClass({
  propTypes: {
    sheet: React.PropTypes.object.isRequired
  },
  render: function() {
    var sheet = this.props.sheet;
    var title = sheet.title ? sheet.title.stripHtml() : "Untitled Source Sheet";
    var url = "/sheets/" + sheet.id;
    return (<a className="sheet" href={url} key={url}>
              {sheet.ownerImageUrl ? (<img className="sheetImg" src={sheet.ownerImageUrl}/>) : null}
              <span className="sheetViews"><i className="fa fa-eye"></i> {sheet.views}</span>
              <div className="sheetAuthor">{sheet.ownerName}</div>
              <div className="sheetTitle">{title}</div>
            </a>);   
  }
});


var SheetTagButton = React.createClass({
  propTypes: {
    tag:   React.PropTypes.string.isRequired,
    count: React.PropTypes.number.isRequired,
    setSheetTag: React.PropTypes.func.isRequired
  },
  handleTagClick: function(e) {
    e.preventDefault();
    this.props.setSheetTag(this.props.tag);
  },
  render: function() {
    return (<a href={`/sheets/tags/${this.props.tag}`} className="navButton" onClick={this.handleTagClick}>{this.props.tag} (<span className="enInHe">{this.props.count}</span>)</a>);
  }
});


var MySheetsPage = React.createClass({
  propTypes: {
    setSheetTag:     React.PropTypes.func.isRequired,
    setSheetTagSort: React.PropTypes.func.isRequired,
    multiPanel:      React.PropTypes.bool,
    hideNavHeader:   React.PropTypes.bool

  },
  getInitialState: function() {
    return {
      showYourSheetTags: false,
      sheetFilterTag: null
    };
  },
  componentDidMount: function() {
    this.ensureData();
  },
  getSheetsFromCache: function() {
    return  Sefaria.sheets.userSheets(Sefaria._uid, null, this.props.mySheetSort);
  },
  getSheetsFromAPI: function() {
     Sefaria.sheets.userSheets(Sefaria._uid, this.onDataLoad, this.props.mySheetSort);
  },
  getTagsFromCache: function() {
    return Sefaria.sheets.userTagList(Sefaria._uid)
  },
  getTagsFromAPI: function() {
    Sefaria.sheets.userSheets(Sefaria._uid, this.onDataLoad);
  },
  onDataLoad: function(data) {
    this.forceUpdate();
  },
  ensureData: function() {
    if (!this.getSheetsFromCache()) { this.getSheetsFromAPI(); }
    if (!this.getTagsFromCache())   { this.getTagsFromAPI(); }    
  },
  toggleSheetTags: function() {
    this.state.showYourSheetTags ? this.setState({showYourSheetTags: false}) : this.setState({showYourSheetTags: true});
  },
  filterYourSheetsByTag: function (tag) {
    if (tag.tag == this.state.sheetFilterTag) {
       this.setState({sheetFilterTag: null, showYourSheetTags: false});
    } else {
      this.setState({sheetFilterTag: tag.tag, showYourSheetTags: false});
    }
  },
  changeSortYourSheets: function(event) {
    this.props.setMySheetSort(event.target.value);
    Sefaria.sheets.userSheets(Sefaria._uid, this.onDataLoad, event.target.value);
  },
  render: function() {
    var sheets = this.getSheetsFromCache();
    sheets = sheets && this.state.sheetFilterTag ? sheets.filter(function(sheet) {
      return Sefaria.util.inArray(this.state.sheetFilterTag, sheet.tags) >= 0;
    }.bind(this)) : sheets;
    sheets = sheets ? sheets.map(function(sheet) {
      return (<PrivateSheetListing sheet={sheet} multiPanel={this.props.multiPanel} setSheetTag={this.props.setSheetTag} />);
    }.bind(this)) : (<LoadingMessage />);

    var userTagList = this.getTagsFromCache();
    userTagList = userTagList ? userTagList.map(function (tag) {
      var filterThisTag = this.filterYourSheetsByTag.bind(this, tag);
      var classes = classNames({navButton: 1, sheetButton: 1, active: this.state.sheetFilterTag == tag.tag});
      return (<div className={classes} onClick={filterThisTag} key={tag.tag}>{tag.tag} ({tag.count})</div>);
    }.bind(this)) : null;
  
    return (<div className="content sheetList">
              <div className="contentInner">
                {this.props.hideNavHeader ? 
                  (<h1>
                    <span className="int-en">My Source Sheets</span>
                    <span className="int-he">דפי המקורות שלי</span>
                  </h1>) : null}
                {this.props.hideNavHeader ? 
                  (<div className="sheetsNewButton">
                    <a className="button white" href="/sheets/new">
                        <span className="int-en">Create a Source Sheet</span>
                        <span className="int-he">צור דף מקורות חדש</span>
                    </a>
                  </div>) : null }

                {this.props.hideNavHeader ?
                 (<h2 className="splitHeader">
                    <span className="int-en" onClick={this.toggleSheetTags}>Filter By Tag <i className="fa fa-angle-down"></i></span>
                    <span className="int-he" onClick={this.toggleSheetTags}>סנן לפי תווית<i className="fa fa-angle-down"></i></span>
                    <span className="int-en actionText">Sort By:
                      <select value={this.props.mySheetSort} onChange={this.changeSortYourSheets}>
                       <option value="date">Recent</option>
                       <option value="views">Most Viewed</option>
                     </select> <i className="fa fa-angle-down"></i></span>
                    <span className="int-he actionText">סנן לפי:
                      <select value={this.props.mySheetSort} onChange={this.changeSortYourSheets}>
                       <option value="date">הכי חדש</option>
                       <option value="views">הכי נצפה</option>
                     </select> <i className="fa fa-angle-down"></i></span>

                  </h2>) : null }
                {this.state.showYourSheetTags ? <TwoOrThreeBox content={userTagList} width={this.props.width} /> : null}
                {sheets}
              </div>
            </div>);
  }
});


var PrivateSheetListing = React.createClass({
  propTypes: {
    sheet:      React.PropTypes.object.isRequired,
    multiPanel: React.PropTypes.bool,
    setSheetTag: React.PropTypes.func.isRequired
  },
  render: function() {
    var sheet = this.props.sheet;
    var editSheetTags = function() { console.log(sheet.id)}.bind(this);
    var title = sheet.title ? sheet.title.stripHtml() : "Untitled Source Sheet";
    var url = "/sheets/" + sheet.id;



    if (sheet.tags === undefined) sheet.tags = [];
      var tagString = sheet.tags.map(function (tag) {
          return(<SheetTagLink setSheetTag={this.props.setSheetTag} tag={tag} key={tag} />);
    },this);

    if (this.props.multiPanel) {
      return (<div className="sheet userSheet" href={url} key={url}>
                 <a className="sheetEditButtons" href={url}>
                  <span><i className="fa fa-pencil"></i> </span>
                </a>
                <div className="sheetEditButtons" onClick={editSheetTags}>
                  <span><i className="fa fa-tag"></i> </span>
                </div>

                <a className="sheetTitle" href={url}>{title}</a>
                <div>{sheet.views} Views · {sheet.modified} · <span className="tagString">{tagString}</span></div>
            </div>);
    } else {
      return (<a className="sheet userSheet" href={url} key={url}>
                <div className="sheetTitle">{title}</div>
                <div>{sheet.views} Views · {sheet.modified} · <span className="tagString">{tagString}</span></div>
              </a>);
    }
  }
});

var SheetTagLink = React.createClass({
  propTypes: {
    tag:   React.PropTypes.string.isRequired,
    setSheetTag: React.PropTypes.func.isRequired
  },
  handleTagClick: function(e) {
    e.preventDefault();
    this.props.setSheetTag(this.props.tag);
  },
  render: function() {
    return (<a href={`/sheets/tag/${this.props.tag}`} onClick={this.handleTagClick}>{this.props.tag}</a>);
  }
});


var ToggleSet = React.createClass({
  // A set of options grouped together.
  propTypes: {
    name:          React.PropTypes.string.isRequired,
    setOption:     React.PropTypes.func.isRequired,
    currentLayout: React.PropTypes.func,
    settings:      React.PropTypes.object.isRequired,
    options:       React.PropTypes.array.isRequired,
    separated:     React.PropTypes.bool
  },
  render: function() {
    var classes = {toggleSet: 1, separated: this.props.separated };
    classes[this.props.name] = 1;
    classes = classNames(classes);
    var value = this.props.name === "layout" ? this.props.currentLayout() : this.props.settings[this.props.name];
    var width = 100.0 - (this.props.separated ? (this.props.options.length - 1) * 3 : 0);
    var style = {width: (width/this.props.options.length) + "%"};
    return (
      <div className={classes}>
        {
          this.props.options.map(function(option) {
            return (
              <ToggleOption
                name={option.name}
                key={option.name}
                set={this.props.name}
                on={value == option.name}
                setOption={this.props.setOption}
                style={style}
                image={option.image}
                fa={option.fa}
                content={option.content} />);
          }.bind(this))
        }
      </div>);
  }
});


var ToggleOption = React.createClass({
  // A single option in a ToggleSet
  handleClick: function() {
    this.props.setOption(this.props.set, this.props.name);
    if (Sefaria.site) { Sefaria.site.track.event("Reader", "Display Option Click", this.props.set + " - " + this.props.name); }
  },
  render: function() {
    var classes = {toggleOption: 1, on: this.props.on };
    classes[this.props.name] = 1;
    classes = classNames(classes);
    var content = this.props.image ? (<img src={this.props.image} />) : 
                    this.props.fa ? (<i className={"fa fa-" + this.props.fa}></i>) : 
                      (<span dangerouslySetInnerHTML={ {__html: this.props.content} }></span>);
    return (
      <div
        className={classes}
        style={this.props.style}
        onClick={this.handleClick}>
        {content}
      </div>);
  }
});


var ReaderNavigationMenuSearchButton = React.createClass({
  render: function() { 
    return (<span className="readerNavMenuSearchButton" onClick={this.props.onClick}><i className="fa fa-search"></i></span>);
  }
});


var ReaderNavigationMenuMenuButton = React.createClass({
  render: function() {
    var icon = this.props.compare ? (<i className="fa fa-chevron-left"></i>) : (<i className="fa fa-bars"></i>);
    return (<span className="readerNavMenuMenuButton" onClick={this.props.onClick}>{icon}</span>);
  }
});


var ReaderNavigationMenuCloseButton = React.createClass({
  render: function() {
    if(this.props.icon == "arrow"){
      var icon_dir = (this.props.interfaceLang == 'english') ? 'left' : 'right';
      var icon_class = "fa fa-caret-"+icon_dir;
      var icon = (<i className={icon_class}></i>);
    }else{
      var icon = "×";
    }
    /*var icon = this.props.icon === "arrow" ? (<i className="fa fa-caret-{icon_dir}"></i>) : "×";*/
    var classes = classNames({readerNavMenuCloseButton: 1, arrow: this.props.icon === "arrow"});
    return (<div className={classes} onClick={this.props.onClick}>{icon}</div>);
  }
});


var ReaderNavigationMenuDisplaySettingsButton = React.createClass({
  render: function() { 
    return (<div className="readerOptions" onClick={this.props.onClick}><img src="/static/img/ayealeph.svg" /></div>);
  }
});


var CategoryColorLine = React.createClass({
  render: function() {
    var style = {backgroundColor: Sefaria.palette.categoryColor(this.props.category)};
    return (<div className="categoryColorLine" style={style}></div>);
  }
});


var TextColumn = React.createClass({
  // An infinitely scrollable column of text, composed of TextRanges for each section.
  propTypes: {
    srefs:                 React.PropTypes.array.isRequired,
    version:               React.PropTypes.string,
    versionLanguage:       React.PropTypes.string,
    highlightedRefs:       React.PropTypes.array,
    basetext:              React.PropTypes.bool,
    withContext:           React.PropTypes.bool,
    loadLinks:             React.PropTypes.bool,
    prefetchNextPrev:      React.PropTypes.bool,
    openOnClick:           React.PropTypes.bool,
    lowlight:              React.PropTypes.bool,
    multiPanel:            React.PropTypes.bool,
    mode:                  React.PropTypes.string,
    settings:              React.PropTypes.object,
    showBaseText:          React.PropTypes.func,
    updateTextColumn:      React.PropTypes.func,
    onSegmentClick:        React.PropTypes.func,
    onCitationClick:       React.PropTypes.func,
    setTextListHightlight: React.PropTypes.func,
    setSelectedWords:      React.PropTypes.func,
    onTextLoad:            React.PropTypes.func,
    panelsOpen:            React.PropTypes.number,
    layoutWidth:           React.PropTypes.number
  },
  componentDidMount: function() {
    this.initialScrollTopSet = false;
    this.justTransitioned    = true;
    this.debouncedAdjustTextListHighlight = Sefaria.util.debounce(this.adjustTextListHighlight, 100);
    var node = ReactDOM.findDOMNode(this);
    node.addEventListener("scroll", this.handleScroll);
    this.setScrollPosition();
    this.adjustInfiniteScroll();
  },
  componentWillUnmount: function() {
    var node = ReactDOM.findDOMNode(this);
    node.removeEventListener("scroll", this.handleScroll);
  },
  componentWillReceiveProps: function(nextProps) {
    if (this.props.mode === "Text" && nextProps.mode === "TextAndConnections") {
      // When moving into text and connections, scroll to highlighted
      this.justTransitioned    = true;
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
  componentDidUpdate: function(prevProps, prevState) {
    if (!this.props.highlightedRefs.compare(prevProps.highlightedRefs)) {
      this.setScrollPosition();  // highlight change
    }
    if (this.props.layoutWidth !== prevProps.layoutWidth ||
        this.props.settings.language !== prevProps.settings.language) {
      this.scrollToHighlighted();
    }
  },
  handleScroll: function(event) {
    if (this.justScrolled) {
      this.justScrolled = false;
      return;
    }
    if (this.props.highlightedRefs.length) {
      this.debouncedAdjustTextListHighlight();
    }
    this.adjustInfiniteScroll();   
  },
  handleTextSelection: function() {
    var selection = window.getSelection();

    if (selection.type === "Range") {
      var $start    = $(Sefaria.util.getSelectionBoundaryElement(true)).closest(".segment");
      var $end      = $(Sefaria.util.getSelectionBoundaryElement(false)).closest(".segment");
      var $segments = $start.is($end) ? $start : $start.nextUntil($end, ".segment").add($start).add($end);
      var refs      = [];
 
      $segments.each(function() {
        refs.push($(this).attr("data-ref"));
      });

      this.props.setTextListHightlight(refs);
    }
    this.props.setSelectedWords(selection.toString());
  },
  handleTextLoad: function() {
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
  setScrollPosition: function() {
    // console.log("ssp");
    // Called on every update, checking flags on `this` to see if scroll position needs to be set
    if (this.loadingContentAtTop) {
      // After adding content by infinite scrolling up, scroll back to what the user was just seeing
      // console.log("loading at top");
      var $node   = $(ReactDOM.findDOMNode(this));
      var adjust  = 118; // Height of .loadingMessage.base
      var $texts  = $node.find(".basetext");
      if ($texts.length < 2) { return; }
      var top     = $texts.eq(1).position().top + $node.scrollTop() - adjust;
      if (!$texts.eq(0).hasClass("loading")) {
        this.loadingContentAtTop = false;
        this.initialScrollTopSet = true;
        this.justScrolled = true;
        ReactDOM.findDOMNode(this).scrollTop = top;
        this.scrollToHighlighted();
        //console.log(top)
      }
    } else if (!this.scrolledToHighlight && $(ReactDOM.findDOMNode(this)).find(".segment.highlight").length) {
      // console.log("scroll to highlighted")
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
  adjustInfiniteScroll: function() {
    // Add or remove TextRanges from the top or bottom, depending on scroll position
    // console.log("adjust Infinite Scroll");
    if (!this.isMounted()) { return; }
    var node         = ReactDOM.findDOMNode(this);
    var refs         = this.props.srefs;
    var $lastText    = $(node).find(".textRange.basetext").last();
    if (!$lastText.length) { console.log("no last basetext"); return; }
    var lastTop      = $lastText.position().top;
    var lastBottom   = lastTop + $lastText.outerHeight();
    var windowHeight = $(node).outerHeight();
    var windowTop    = node.scrollTop;
    var windowBottom = windowTop + windowHeight;
    if (lastTop > (windowHeight + 100) && refs.length > 1) { 
      // Remove a section scrolled out of view on bottom
      refs = refs.slice(0,-1);
      this.props.updateTextColumn(refs);
    } else if ( lastBottom < windowHeight + 80 ) {
      // DOWN: add the next section to bottom
      if ($lastText.hasClass("loading")) { 
        // console.log("last text is loading - don't add next section");
        return;
      }
      // console.log("Down! Add next section");
      var currentRef = refs.slice(-1)[0];
      var data       = Sefaria.ref(currentRef);
      if (data && data.next) {
        refs.push(data.next);
        this.props.updateTextColumn(refs);
        if (Sefaria.site) { Sefaria.site.track.event("Reader", "Infinite Scroll", "Down"); }
      }
    } else if (windowTop < 21 && !this.loadingContentAtTop) {
      // UP: add the previous section above then adjust scroll position so page doesn't jump
      var topRef = refs[0];
      var data   = Sefaria.ref(topRef);
      if (data && data.prev) {
        // console.log("Up! Add previous section");
        refs.splice(refs, 0, data.prev);
        this.loadingContentAtTop = true;
        this.props.updateTextColumn(refs);
        if (Sefaria.site) { Sefaria.site.track.event("Reader", "Infinite Scroll", "Up"); }
      }
    } else {
      // nothing happens
    }
  },
  adjustTextListHighlight: function() {
    // console.log("atlh");
    // When scrolling while the TextList is open, update which segment should be highlighted.
    if (this.props.multiPanel && this.props.layoutWidth == 100) {
      return; // Hacky - don't move around highlighted segment when scrolling a single panel,
    }
    // but we do want to keep the highlightedRefs value in the panel 
    // so it will return to the right location after closing other panels.
    var adjustTextListHighlightInner = function() {
      //var start = new Date();
      if (!this.isMounted()) { return; }
      var $container   = $(ReactDOM.findDOMNode(this));
      var $readerPanel = $container.closest(".readerPanel");
      var viewport     = $container.outerHeight() - $readerPanel.find(".textList").outerHeight();
      var center       = (viewport/2);
      var midTop       = 300;
      var threshhold   = this.props.multiPanel ? midTop : center;
      $container.find(".basetext .segment").each(function(i, segment) {
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
  scrollToHighlighted: function() {
    window.requestAnimationFrame(function() {
      var $container   = $(ReactDOM.findDOMNode(this));
      var $readerPanel = $container.closest(".readerPanel");
      var $highlighted = $container.find(".segment.highlight").first();
      if ($highlighted.length) {
        var height     = $highlighted.outerHeight();
        var viewport   = $container.outerHeight() - $readerPanel.find(".textList").outerHeight();
        var offset     = height > viewport + 80 ? 80 : (viewport - height) / 2;
        this.justScrolled = true;
        $container.scrollTo($highlighted, 0, {offset: -offset});
      }
    }.bind(this));
  },
  render: function() {
    var classes = classNames({textColumn: 1, connectionsOpen: this.props.mode === "TextAndConnections"});
    var content =  this.props.srefs.map(function(ref, k) {
      return (<TextRange 
        sref={ref}
        version={this.props.version}
        versionLanguage={this.props.versionLanguage}
        highlightedRefs={this.props.highlightedRefs}
        basetext={true}
        withContext={true}
        loadLinks={true}
        prefetchNextPrev={true}
        settings={this.props.settings}
        setOption={this.props.setOption}
        showBaseText={this.props.showBaseText} 
        onSegmentClick={this.props.onSegmentClick}
        onCitationClick={this.props.onCitationClick}
        onTextLoad={this.handleTextLoad}
        filter={this.props.filter}
        panelsOpen={this.props.panelsOpen}
        layoutWidth={this.props.layoutWidth}
        key={k + ref} />);      
    }.bind(this));

    if (content.length) {
      // Add Next and Previous loading indicators
      var first   = Sefaria.ref(this.props.srefs[0]);
      var last    = Sefaria.ref(this.props.srefs.slice(-1)[0]);
      var hasPrev = first && first.prev;
      var hasNext = last && last.next;
      var topSymbol  = " ";
      var bottomSymbol = " ";
      if (hasPrev && INBROWSER) {
        content.splice(0, 0, (<LoadingMessage className="base prev" key="prev"/>));
      } else {
        content.splice(0, 0, (<LoadingMessage message={topSymbol} heMessage={topSymbol} className="base prev" key="prev"/>));        
      }
      if (hasNext) {
        content.push((<LoadingMessage className="base next" key="next"/>));
      } else {
        content.push((<LoadingMessage message={bottomSymbol} heMessage={bottomSymbol} className="base next final" key="next"/>));
      }
    }

    return (<div className={classes} onMouseUp={this.handleTextSelection}>{content}</div>);
  }
});


var TextRange = React.createClass({
  // A Range or text defined a by a single Ref. Specially treated when set as 'basetext'.
  // This component is responsible for retrieving data from `Sefaria` for the ref that defines it.
  propTypes: {
    sref:                   React.PropTypes.string.isRequired,
    version:                React.PropTypes.string,
    versionLanguage:        React.PropTypes.string,
    highlightedRefs:        React.PropTypes.array,
    basetext:               React.PropTypes.bool,
    withContext:            React.PropTypes.bool,
    hideTitle:              React.PropTypes.bool,
    loadLinks:              React.PropTypes.bool,
    prefetchNextPrev:       React.PropTypes.bool,
    openOnClick:            React.PropTypes.bool,
    lowlight:               React.PropTypes.bool,
    numberLabel:            React.PropTypes.number,
    settings:               React.PropTypes.object,
    filter:                 React.PropTypes.array,
    onTextLoad:             React.PropTypes.func,
    onRangeClick:           React.PropTypes.func,
    onSegmentClick:         React.PropTypes.func,
    onCitationClick:        React.PropTypes.func,
    onNavigationClick:      React.PropTypes.func,
    onCompareClick:         React.PropTypes.func,
    onOpenConnectionsClick: React.PropTypes.func,
    panelsOpen:             React.PropTypes.number,
    layoutWidth:            React.PropTypes.number,
    showActionLinks:        React.PropTypes.bool
  },
  componentDidMount: function() {
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
  componentWillUnmount: function() {
    window.removeEventListener('resize', this.handleResize);
  },
  componentDidUpdate: function(prevProps, prevState) {
    /* Doesn't seem to be need in addition to below
    // Reload text if version changed
    if (this.props.version != prevProps.version || this.props.versionLanguage != prevProps.versionLanguage) {
      this.getText(true);
    }
    */
    // Place segment numbers again if update affected layout
    if (this.props.basetext || this.props.segmentNumber) {
      if (this.props.version != prevProps.version ||
          this.props.versionLanguage != prevProps.versionLanguage ||
          prevProps.settings.language !== this.props.settings.language ||
          prevProps.settings.layoutDefault !== this.props.settings.layoutDefault ||
          prevProps.settings.layoutTanakh !== this.props.settings.layoutTanakh ||
          prevProps.settings.layoutTalmud !== this.props.settings.layoutTalmud ||
          prevProps.settings.biLayout !== this.props.settings.biLayout ||
          prevProps.settings.fontSize !== this.props.settings.fontSize ||
          prevProps.layoutWidth !== this.props.layoutWidth) {
            // Rerender in case version has changed
            this.forceUpdate();
            // TODO: are these animationFrames still needed?
            window.requestAnimationFrame(function() { 
              if (this.isMounted()) {
                this.placeSegmentNumbers();
              }
            }.bind(this));        
      }
    }
  },
  handleResize: function() {
    if (this.props.basetext || this.props.segmentNumber) { 
      this.placeSegmentNumbers();
    }
  },
  handleClick: function(event) {
    if (window.getSelection().type === "Range") { 
      // Don't do anything if this click is part of a selection
      return;
    }
    if (this.props.onRangeClick) {
      //Click on the body of the TextRange itself from TextList
      this.props.onRangeClick(this.props.sref);
      if (Sefaria.site) { Sefaria.site.track.event("Reader", "Click Text from TextList", this.props.sref); }
    }
  },
  getText: function() {
    var settings = {
      context: this.props.withContext ? 1 : 0,
      version: this.props.version || null,
      language: this.props.versionLanguage || null
    };
    var data = Sefaria.text(this.props.sref, settings);
    if (!data) { // If we don't have data yet, call again with a callback to trigger API call
      Sefaria.text(this.props.sref, settings, this.onTextLoad);
    }
    return data;
  },
  onTextLoad: function(data) {
    // console.log("onTextLoad in TextRange");
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
  prefetchData: function() {
    // Prefetch addtional data (next, prev, links, notes etc) for this ref
    if (this.dataPrefetched) { return; }

    var data = this.getText();
    if (!data) { return; }

    // Load links at section level if spanning, so that cache is properly primed with section level refs
    var sectionRefs = data.isSpanning ? data.spanningRefs : [data.sectionRef];
    sectionRefs = sectionRefs.map(function(ref) {
      if (ref.indexOf("-") > -1) {
        ref = ref.split("-")[0];
        ref = ref.slice(0, ref.lastIndexOf(":"));
      }
      return ref;
    });

    if (this.props.loadLinks && !Sefaria.linksLoaded(sectionRefs)) {
      for (var i = 0; i < sectionRefs.length; i++) {
        Sefaria.related(sectionRefs[i], function() {
          if (this.isMounted()) { this.forceUpdate(); }
        }.bind(this));
      }
    }

    if (this.props.prefetchNextPrev) {
     if (data.next) {
       Sefaria.text(data.next, {
         context: 1,
         version: this.props.version || null,
         language: this.props.versionLanguage || null
       }, function() {});
     }
     if (data.prev) {
       Sefaria.text(data.prev, {
         context: 1,
         version: this.props.version || null,
         language: this.props.versionLanguage || null
       }, function() {});
     }
     if (data.book) { Sefaria.textTocHtml(data.book, function() {}); }
    }
    this.dataPrefetched = true;
  },
  makeSegments: function(data) {
    // Returns a flat list of annotated segment objects,
    // derived from the walking the text in data
    if (!data || "error" in data) { return []; }
    var segments  = [];
    var highlight = data.sections.length === data.textDepth; 
    var wrap = (typeof data.text == "string");
    var en = wrap ? [data.text] : data.text;
    var he = wrap ? [data.he] : data.he;
    var topLength = Math.max(en.length, he.length);
    en = en.pad(topLength, "");
    he = he.pad(topLength, "");

    var start = (data.textDepth == data.sections.length && !this.props.withContext ?
                  data.sections.slice(-1)[0] : 1);

    if (!data.isSpanning) {
      for (var i = 0; i < topLength; i++) {
        var number = i+start;
        var delim  = data.textDepth == 1 ? " " : ":";
        var ref = data.sectionRef + delim + number;
        segments.push({
          ref: ref,
          en: en[i], 
          he: he[i],
          number: number,
          highlight: highlight && number >= data.sections.slice(-1)[0] && number <= data.toSections.slice(-1)[0],
        });
      }      
    } else {
      for (var n = 0; n < topLength; n++) {
        var en2 = typeof en[n] == "string" ? [en[n]] : en[n];
        var he2 = typeof he[n] == "string" ? [he[n]] : he[n];
        var length = Math.max(en2.length, he2.length);
        en2 = en2.pad(length, "");
        he2 = he2.pad(length, "");
        var baseRef     = data.book;
        var baseSection = data.sections.slice(0,-2).join(":");
        var delim       = baseSection ? ":" : " ";
        var baseRef     = baseSection ? baseRef + " " + baseSection : baseRef;

        start = (n == 0 ? start : 1);
        for (var i = 0; i < length; i++) {
          var startSection = data.sections.slice(-2)[0];
          var section = typeof startSection == "string" ?
                        Sefaria.hebrew.intToDaf(n+Sefaria.hebrew.dafToInt(startSection))
                        : n + startSection;
          var number  = i + start;
          var ref = baseRef + delim + section + ":" + number;
          segments.push({
            ref: ref,
            en: en2[i], 
            he: he2[i],
            number: number,
            highlight: highlight && 
                        ((n == 0 && number >= data.sections.slice(-1)[0]) || 
                         (n == topLength-1 && number <= data.toSections.slice(-1)[0]) ||
                         (n > 0 && n < topLength -1)),
          });
        }
      }
    }
    return segments;
  },
  placeSegmentNumbers: function() {
    // Set the vertical offsets for segment numbers and link counts, which are dependent
    // on the rendered height of the text of each segment.
    var $text  = $(ReactDOM.findDOMNode(this));
    var elemsAtPosition = {}; // Keyed by top position, an array of elements found there
    var setTop = function() {
      var $elem = $(this);
      var top   = $elem.parent().position().top;
      $elem.css({top: top});
      var list = elemsAtPosition[top] || [];
      list.push($elem);
      elemsAtPosition[top] = list;  
    };
    $text.find(".linkCount").each(setTop);
    elemsAtPosition = {} // resetting because we only want it to track segmentNumbers
    $text.find(".segmentNumber").each(setTop).show();
    var fixCollision = function ($elems) {
      // Takes an array of jQuery elements that all currenlty appear at the same top position
      if ($elems.length == 1) { return; }
      if ($elems.length == 2) {
        var adjust = 8;
        $elems[0].css({top: "-=" + adjust});
        $elems[1].css({top: "+=" + adjust});
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
  render: function() {
    var data = this.getText();
    if (data && this.props.basetext) {
      var ref              = this.props.withContext ? data.sectionRef : data.ref;
      var sectionStrings   = Sefaria.sectionString(ref);
      var oref             = Sefaria.ref(ref);
      var useShortString   = oref && Sefaria.util.inArray(oref.primary_category, ["Tanakh", "Mishnah", "Talmud", "Tosefta", "Commentary"]) !== -1;
      var title            = useShortString ? sectionStrings.en.numbered : sectionStrings.en.named;
      var heTitle          = useShortString ? sectionStrings.he.numbered : sectionStrings.he.named;   
    } else if (data && !this.props.basetext) {  
      var title            = data.ref;
      var heTitle          = data.heRef;
    } else if (!data) {
      var title            = "Loading...";
      var heTitle          = "טעינה...";      
    } 
    var showNumberLabel    =  data &&
                              data.categories &&
                              data.categories[0] !== "Talmud" &&
                              data.categories[0] !== "Liturgy";

    var showSegmentNumbers = showNumberLabel && this.props.basetext;
                              

    var segments = this.makeSegments(data);
    var textSegments = segments.map(function (segment, i) {
      var highlight = this.props.highlightedRefs && this.props.highlightedRefs.length ?                                  // if highlighted refs are explicitly set
                        Sefaria.util.inArray(segment.ref, this.props.highlightedRefs) !== -1 : // highlight if this ref is in highlighted refs prop
                        this.props.basetext && segment.highlight;                   // otherwise highlight if this a basetext and the ref is specific
      return (
        <TextSegment
            sref={segment.ref}
            en={segment.en}
            he={segment.he}
            highlight={highlight}
            segmentNumber={showSegmentNumbers ? segment.number : 0}
            showLinkCount={this.props.basetext}
            filter={this.props.filter}
            onSegmentClick={this.props.onSegmentClick}
            onCitationClick={this.props.onCitationClick}
            key={i + segment.ref} />
      );
    }.bind(this));
    textSegments = textSegments.length ? 
                    textSegments : 
                      this.props.basetext ? "" : (<LoadingMessage />);
    var classes = {
                    textRange: 1,
                    basetext: this.props.basetext,
                    loading: !data,
                    lowlight: this.props.lowlight
                  };
    classes = classNames(classes);

    var open        = function() { this.props.onNavigationClick(this.props.sref)}.bind(this);
    var compare     = function() { this.props.onCompareClick(this.props.sref)}.bind(this);
    var connections = function() { this.props.onOpenConnectionsClick([this.props.sref])}.bind(this);

    var actionLinks = (<div className="actionLinks">
                        <span className="openLink" onClick={open}>
                          <img src="/static/img/open-64.png" />
                          <span className="en">Open</span>
                          <span className="he">פתח</span>
                        </span>
                        <span className="compareLink" onClick={compare}>
                          <img src="/static/img/compare-64.png" />
                          <span className="en">Compare</span>
                          <span className="he">השווה</span>
                        </span>
                        <span className="connectionsLink" onClick={connections}>
                          <i className="fa fa-link"></i>
                          <span className="en">Connections</span>
                          <span className="he">קשרים</span>
                        </span>
                      </div>);
    return (
      <div className={classes} onClick={this.handleClick}>
        {showNumberLabel && this.props.numberLabel ? 
          (<div className="numberLabel sans">
            <span className="numberLabelInner">
              <span className="en">{this.props.numberLabel}</span>
              <span className="he">{Sefaria.hebrew.encodeHebrewNumeral(this.props.numberLabel)}</span>
            </span>
          </div>)
          : null}
        {this.props.hideTitle ? "" :
        (<div className="title">
          <div className="titleBox">
            <span className="en" >{title}</span>
            <span className="he">{heTitle}</span>
          </div>
        </div>)}
        <div className="text">
          <div className="textInner">
            { textSegments }
            { this.props.showActionLinks ? actionLinks : null }
          </div>
        </div>
      </div>
    );
  }
});


var TextSegment = React.createClass({
  propTypes: {
    sref:            React.PropTypes.string,
    en:              React.PropTypes.string,
    he:              React.PropTypes.string,
    highlight:       React.PropTypes.bool,
    segmentNumber:   React.PropTypes.number,
    showLinkCount:   React.PropTypes.bool,
    filter:          React.PropTypes.array,
    onCitationClick: React.PropTypes.func,
    onSegmentClick:  React.PropTypes.func
  },
  handleClick: function(event) {
    if ($(event.target).hasClass("refLink")) {
      //Click of citation
      var ref = Sefaria.humanRef($(event.target).attr("data-ref"));
      this.props.onCitationClick(ref, this.props.sref);
      event.stopPropagation();
      Sefaria.site.track.event("Reader", "Citation Link Click", ref);
    } else if (this.props.onSegmentClick) {
      this.props.onSegmentClick(this.props.sref);
      Sefaria.site.track.event("Reader", "Text Segment Click", this.props.sref);
    }
  },
  render: function() {
    var linkCountElement;
    if (this.props.showLinkCount) {
      var linkCount = Sefaria.linkCount(this.props.sref, this.props.filter);
      var minOpacity = 20, maxOpacity = 70;
      var linkScore = linkCount ? Math.min(linkCount+minOpacity, maxOpacity) / 100.0 : 0;
      var style = {opacity: linkScore};
      linkCountElement = this.props.showLinkCount ? (<div className="linkCount sans">
                                                    <span className="en"><span className="linkCountDot" style={style}></span></span>
                                                    <span className="he"><span className="linkCountDot" style={style}></span></span>
                                                  </div>) : null;      
    } else {
      linkCountElement = "";
    }
    var segmentNumber = this.props.segmentNumber ? (<div className="segmentNumber sans">
                                                      <span className="en"> <span className="segmentNumberInner">{this.props.segmentNumber}</span> </span>
                                                      <span className="he"> <span className="segmentNumberInner">{Sefaria.hebrew.encodeHebrewNumeral(this.props.segmentNumber)}</span> </span>
                                                    </div>) : null;
    var he = this.props.he || "";
    var en = this.props.en || "";
    var classes=classNames({ segment: 1,
                     highlight: this.props.highlight,
                     heOnly: !this.props.en,
                     enOnly: !this.props.he });
    if(!this.props.en && !this.props.he){
        return false;
    }
    return (
      <span className={classes} onClick={this.handleClick} data-ref={this.props.sref}>
        {segmentNumber}
        {linkCountElement}
        <span className="he" dangerouslySetInnerHTML={ {__html: he + " "} }></span>
        <span className="en" dangerouslySetInnerHTML={ {__html: en + " "} }></span>
        <div className="clearFix"></div>
      </span>
    );
  }
});


var ConnectionsPanel = React.createClass({
  propTypes: {
    srefs:                   React.PropTypes.array.isRequired,    // an array of ref strings
    filter:                  React.PropTypes.array.isRequired,
    recentFilters:           React.PropTypes.array.isRequired,
    mode:                    React.PropTypes.string.isRequired,   // "Connections", "Tools", etc. called `connectionsMode` above
    setFilter:               React.PropTypes.func.isRequired,
    setConnectionsMode:      React.PropTypes.func.isRequired,
    editNote:                React.PropTypes.func.isRequired,
    openComparePanel:        React.PropTypes.func.isRequired,
    version:                 React.PropTypes.string,
    versionLanguage:         React.PropTypes.string,
    noteBeingEdited:         React.PropTypes.object,
    fullPanel:               React.PropTypes.bool,
    multiPanel:              React.PropTypes.bool,
    canEditText:             React.PropTypes.bool,
    onTextClick:             React.PropTypes.func,
    onCitationClick:         React.PropTypes.func,
    onNavigationClick:       React.PropTypes.func,
    onCompareClick:          React.PropTypes.func,
    onOpenConnectionsClick:  React.PropTypes.func,
    openNav:                 React.PropTypes.func,
    openDisplaySettings:     React.PropTypes.func,
    closePanel:              React.PropTypes.func,
    toggleLanguage:          React.PropTypes.func,
    selectedWords:           React.PropTypes.string,
    interfaceLang:           React.PropTypes.string
  },
  render: function() {
    var content = null;
    if (this.props.mode == "Connections") {
      content = (<TextList
                    srefs={this.props.srefs}
                    filter={this.props.filter}
                    recentFilters={this.props.recentFilters}
                    fullPanel={this.props.fullPanel}
                    multiPanel={this.props.multiPanel}
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
                    selectedWords={this.props.selectedWords}/>
                );

    } else if (this.props.mode === "Tools") {
      content = (<ToolsPanel
                    srefs={this.props.srefs}
                    mode={this.props.mode}
                    filter={this.props.filter}
                    recentFilters={this.props.recentFilters}
                    fullPanel={this.props.fullPanel}
                    multiPanel={this.props.multiPanel}
                    canEditText={this.props.canEditText}
                    setFilter={this.props.setFilter}
                    setConnectionsMode={this.props.setConnectionsMode}
                    onTextClick={this.props.onTextClick}
                    onCitationClick={this.props.onCitationClick}
                    onNavigationClick={this.props.onNavigationClick}
                    onCompareClick={this.props.onCompareClick}
                    onOpenConnectionsClick={this.props.onOpenConnectionsClick}
                    openNav={this.props.openNav}
                    openDisplaySettings={this.props.openDisplaySettings}
                    openComparePanel={this.props.openComparePanel}
                    closePanel={this.props.closePanel}
                    version={this.props.version}
                    versionLanguage={this.props.versionLanguage} />);

    } else if (this.props.mode === "Share") {
      content = (<SharePanel
        url={window.location.href}
        fullPanel={this.props.fullPanel}
        closePanel={this.props.closePanel}
        setConnectionsMode={this.props.setConnectionsMode} />);

    } else if (this.props.mode === "Add to Source Sheet") {
      content = (<AddToSourceSheetPanel
        srefs={this.props.srefs}
        fullPanel={this.props.fullPanel}
        setConnectionsMode={this.props.setConnectionsMode} />);

    } else if (this.props.mode === "Add Note") {
      content = (<AddNotePanel 
                  srefs={this.props.srefs}
                  fullPanel={this.props.fullPanel}
                  closePanel={this.props.closePanel}
                  setConnectionsMode={this.props.setConnectionsMode} />);
    
    } else if (this.props.mode === "Edit Note") {
      content = (<AddNotePanel 
                  srefs={this.props.srefs}
                  noteId={this.props.noteBeingEdited._id}
                  noteText={this.props.noteBeingEdited.text}
                  noteTitle={this.props.noteBeingEdited.title}
                  noteIsPublic={this.props.noteBeingEdited.isPublic}
                  fullPanel={this.props.fullPanel}
                  closePanel={this.props.closePanel}
                  setConnectionsMode={this.props.setConnectionsMode} />);

    } else if (this.props.mode === "My Notes") {
      content = (<MyNotesPanel 
                  srefs={this.props.srefs}
                  fullPanel={this.props.fullPanel}
                  closePanel={this.props.closePanel}
                  setConnectionsMode={this.props.setConnectionsMode}
                  editNote={this.props.editNote} />);

    } else if (this.props.mode === "Add Connection") {
      var url  = "/s1?next=" + window.location.pathname;
      var link = (<a href={url}><span className="int-en">old Sefaria</span><span className="int-he">ממשק הישן</span></a>);
      content = (<div className="toolsMessage sans">
                    <span className="int-en">We&apos;re still working on updating this feature for the new Sefaria. In the meantime, to add a connection please use the {link}.</span>
                    <span className="int-he">האפשרות הזו עדיין בבניה בממשק החדש. בינתיים ניתן להשתמש ב{link}.</span>
                  </div>);

    } else if (this.props.mode === "Login") {
      content = (<LoginPanel fullPanel={this.props.fullPanel} />);
    }
    return content;
  }
});


var ConnectionsPanelHeader = React.createClass({
  propTypes: {
    activeTab:          React.PropTypes.string.isRequired, // "Connections", "Tools"
    setConnectionsMode: React.PropTypes.func.isRequired,
    closePanel:         React.PropTypes.func.isRequired,
    toggleLanguage:     React.PropTypes.func.isRequired,
    interfaceLang:      React.PropTypes.string.isRequired
  },
  render: function() {
    return (<div className="connectionsPanelHeader">
              <ConnectionsPanelTabs
                activeTab={this.props.activeTab}
                setConnectionsMode={this.props.setConnectionsMode}
                interfaceLang={this.props.interfaceLang}/>
              <div className="rightButtons">
                <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} />
                <ReaderNavigationMenuCloseButton icon="arrow" onClick={this.props.closePanel} interfaceLang={this.props.interfaceLang} />
              </div>
            </div>);
  }
});


var ConnectionsPanelTabs = React.createClass({
  propTypes: {
    activeTab:          React.PropTypes.string.isRequired, // "Connections", "Tools"
    setConnectionsMode: React.PropTypes.func.isRequired,
    interfaceLang:      React.PropTypes.string.isRequired
  },
  render: function() {
    var tabNames = [{"en": "Connections", "he": "קישורים"}, {"en": "Tools", "he":"כלים"}];
    var tabs = tabNames.map(function(item) {
      var tabClick = function() {
        this.props.setConnectionsMode(item["en"])
      }.bind(this);
      var active  = item["en"] === this.props.activeTab;
      var classes = classNames({connectionsPanelTab: 1, sans: 1, active: active});
      return (<div className={classes} onClick={tabClick} key={item["en"]}>
                <span className="int-en">{item["en"]}</span>
                <span className="int-he">{item["he"]}</span>
              </div>);
    }.bind(this));

    return (<div className="connectionsPanelTabs">{tabs}</div>);
  }
});


var TextList = React.createClass({
  propTypes: {
    srefs:                   React.PropTypes.array.isRequired,    // an array of ref strings
    filter:                  React.PropTypes.array.isRequired,
    recentFilters:           React.PropTypes.array.isRequired,
    fullPanel:               React.PropTypes.bool,
    multiPanel:              React.PropTypes.bool,
    setFilter:               React.PropTypes.func,
    setConnectionsMode:      React.PropTypes.func,
    onTextClick:             React.PropTypes.func,
    onCitationClick:         React.PropTypes.func,
    onNavigationClick:       React.PropTypes.func,
    onCompareClick:          React.PropTypes.func,
    onOpenConnectionsClick:  React.PropTypes.func,
    openNav:                 React.PropTypes.func,
    openDisplaySettings:     React.PropTypes.func,
    closePanel:              React.PropTypes.func,
    selectedWords:           React.PropTypes.string
  },
  getInitialState: function() {
    return {
      linksLoaded: false,
      textLoaded: false
    }
  },
  componentDidMount: function() {
    this.loadConnections();
    this.scrollToHighlighted();
  },
  componentWillReceiveProps: function(nextProps) {
    this.preloadText(nextProps.filter);
  },
  componentWillUpdate: function(nextProps) {

  },
  componentDidUpdate: function(prevProps, prevState) {
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
  getSectionRef: function() {
    var ref = this.props.srefs[0]; // TODO account for selections spanning sections
    var sectionRef = Sefaria.sectionRef(ref) || ref;
    return sectionRef;
  },
  loadConnections: function() {
    // Load connections data from server for this section
    var sectionRef = this.getSectionRef();
    if (!sectionRef) { return; }
    Sefaria.related(sectionRef, function(data) {
      if (this.isMounted()) {
        this.preloadText(this.props.filter);
        this.setState({
          linksLoaded: true,
        });
      }
    }.bind(this));
  },
  preloadText: function(filter) {
    // Preload text of links if `filter` is a single commentary, or all commentary
    if (filter.length == 1 &&
        Sefaria.index(filter[0]) && 
        Sefaria.index(filter[0]).categories == "Commentary") {
      this.preloadSingleCommentaryText(filter);
    } else if (filter.length == 1 && filter[0] == "Commentary") {
      this.preloadAllCommentaryText(filter);
    } else {
      this.setState({waitForText: false, textLoaded: false});
    }
  },
  preloadSingleCommentaryText: function(filter) {
    var basetext   = this.getSectionRef(); //get the title of the full title for the commentary from the api and use that (only needs the title to end with the base text
    var commentary = filter[0] + " on " + basetext; //TODO: get rid of "on" special casing switch to hack that only switches out the sections
    this.setState({textLoaded: false, waitForText: true});
    Sefaria.text(commentary, {}, function() {
      if (this.isMounted()) {
        this.setState({textLoaded: true});        
      }
    }.bind(this));
  },
  preloadAllCommentaryText: function() {
    var basetext   = this.getSectionRef();
    var summary    = Sefaria.linkSummary(basetext);
    if (summary.length && summary[0].category == "Commentary") {
      this.setState({textLoaded: false, waitForText: true});
      // Get a list of commentators on this section that we need don't have in the cache
      var links = Sefaria.links(basetext);
      var commentators = summary[0].books.map(function(item) {
        return item.book;
      }).filter(function(commentator) {
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
          Sefaria.text(commentators[i] + " on " + basetext, {}, function(data) {
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
                this.setState({textLoaded: true});
              }
            }
          }.bind(this));          
        }          
      } else {
        // All commentaries have been loaded already
        this.setState({textLoaded: true});          
      }
    } else {
      // There were no commentaries to load
      this.setState({textLoaded: true});
    }
  },
  scrollToHighlighted: function() {
    if (this.props.fullPanel) {
      return; // We don't currently have any situations where there is lowlighted content in fullpanel sidebar
    }
    window.requestAnimationFrame(function() {
      if (!this.isMounted()) { return; }
      var $highlighted = $(ReactDOM.findDOMNode(this)).find(".texts .textRange").not(".lowlight").first();
      if ($highlighted.length) {
        var $texts = $(ReactDOM.findDOMNode(this)).find(".texts");
        var adjust = parseInt($texts.css("padding-top")) + 18;
        $texts.scrollTo($highlighted, 0, {offset: -adjust});
      }
    }.bind(this));
  },
  showAllFilters: function() {
    this.props.setFilter(null);
    if (Sefaria.site) { Sefaria.site.track.event("Reader", "Show All Filters Click", "1"); }
  },
  render: function() {
    var refs               = this.props.srefs;
    var summary            = Sefaria.relatedSummary(refs);
    var oref               = Sefaria.ref(refs[0]);
    var filter             = this.props.filter;
    var sectionRef         = this.getSectionRef();
    var isSingleCommentary = (filter.length == 1 && Sefaria.index(filter[0]) && Sefaria.index(filter[0]).categories == "Commentary");

    //if (summary.length && !links.length) { debugger; }
    var en = "No connections known" + (filter.length ? " for " + filter.join(", ") : "") + ".";
    var he = "אין קשרים ידועים"       + (filter.length ? " ל"    + filter.join(", ") : "") + ".";
    var loaded  = Sefaria.linksLoaded(sectionRef);
    var message = !loaded ? 
                    (<LoadingMessage />) : 
                      (summary.length === 0 ? 
                        <LoadingMessage message={en} heMessage={he} /> : null);
    
    var showAllFilters = !filter.length;
    if (!showAllFilters) {
      if (filter.compare(["Sheets"])) {
        var sheets  = Sefaria.sheets.sheetsByRef(refs);
        var content = sheets ? sheets.map(function(sheet) {
          return (
            <div className="sheet" key={sheet.sheetUrl}>
              <a href={sheet.ownerProfileUrl}>
                <img className="sheetAuthorImg" src={sheet.ownerImageUrl} />
              </a>
              <div className="sheetViews"><i className="fa fa-eye"></i> {sheet.views}</div>
              <a href={sheet.ownerProfileUrl} className="sheetAuthor">{sheet.ownerName}</a>
              <a href={sheet.sheetUrl} className="sheetTitle">{sheet.title}</a>
            </div>);
        }) : (<LoadingMessage />);
        content = content.length ? content : <LoadingMessage message="No sheets here." />;

      } else if (filter.compare(["Notes"])) {
        var notes   = Sefaria.notes(refs);
        var content = notes ? notes.map(function(note) {
          return (<Note 
                    title={note.title}
                    text={note.text}
                    ownerName={note.ownerName}
                    ownerProfileUrl={note.ownerProfileUrl}
                    ownerImageUrl={note.ownerImageUrl}
                    key={note._id} />) 
        }) : (<LoadingMessage />);
        content = content.length ? content : <LoadingMessage message="No notes here." />;
      } else {
        // Viewing Text Connections
        var sectionLinks = Sefaria.links(sectionRef);
        var links        = sectionLinks.filter(function(link) {
          if ( (this.props.multiPanel || !isSingleCommentary) &&
              Sefaria.splitSpanningRef(link.anchorRef).every(aref => Sefaria.util.inArray(aref, refs) === -1)) {
            // Only show section level links for an individual commentary
            return false;
          }
          return (filter.length == 0 ||
                  Sefaria.util.inArray(link.category, filter) !== -1 || 
                  Sefaria.util.inArray(link.commentator, filter) !== -1 );

          }.bind(this)
        ).sort(function(a, b) {
            if (a.anchorVerse !== b.anchorVerse) {
                return a.anchorVerse - b.anchorVerse;
            } else if ( a.commentaryNum !== b.commentaryNum) {
                return a.commentaryNum - b.commentaryNum;
            } else {
                return a.sourceRef > b.sourceRef ? 1 : -1;
            }
        });
        var content = links.length == 0 ? message :
                      this.state.waitForText && !this.state.textLoaded ? 
                        (<LoadingMessage />) : 
                        links.map(function(link, i) {
                            var hideTitle = link.category === "Commentary" && this.props.filter[0] !== "Commentary";
                            return (<TextRange 
                                        sref={link.sourceRef}
                                        key={i + link.sourceRef}
                                        lowlight={Sefaria.util.inArray(link.anchorRef, refs) === -1}
                                        hideTitle={hideTitle}
                                        numberLabel={link.category === "Commentary" ? link.anchorVerse : 0}
                                        basetext={false}
                                        onRangeClick={this.props.onTextClick}
                                        onCitationClick={this.props.onCitationClick}
                                        onNavigationClick={this.props.onNavigationClick}
                                        onCompareClick={this.props.onCompareClick}
                                        onOpenConnectionsClick={this.props.onOpenConnectionsClick} />);
                          }, this);          
      }
    
    }

    var classes = classNames({textList: 1, fullPanel: this.props.fullPanel});
    if (showAllFilters) {
      return (
            <div className={classes}>
              <div className="textListTop">
                  {message}
              </div>
              <AllFilterSet
                srefs={this.props.srefs}
                summary={summary}
                showText={this.props.showText}
                filter={this.props.filter}
                recentFilters={this.props.recentFilters}
                setFilter={this.props.setFilter}
                selectedWords={this.props.selectedWords}
                oref={oref}/>
            </div>);
    } else if (!this.props.fullPanel) {
      return (
            <div className={classes}>
              <div className="textListTop">
                <RecentFilterSet
                  srefs={this.props.srefs}
                  asHeader={true}
                  showText={this.props.showText}
                  filter={this.props.filter}
                  recentFilters={this.props.recentFilters}
                  textCategory={oref ? oref.primary_category : null}
                  setFilter={this.props.setFilter}
                  showAllFilters={this.showAllFilters} />
              </div>
              <div className="texts">
                <div className="contentInner">
                  { content }
                </div>
              </div>
            </div>);
    } else {
      return (
            <div className={classes}>
              <div className="texts">
                <div className="contentInner">
                  <RecentFilterSet
                    srefs={this.props.srefs}
                    asHeader={false}
                    showText={this.props.showText}
                    filter={this.props.filter}
                    recentFilters={this.props.recentFilters}
                    textCategory={oref ? oref.primary_category : null}
                    setFilter={this.props.setFilter}
                    showAllFilters={this.showAllFilters} />
                  { content }
                </div>
              </div>
            </div>
            );
    }
  }
});


var Note = React.createClass({
  propTypes: {
    title:           React.PropTypes.string.isRequired,
    text:            React.PropTypes.string.isRequired,
    ownerName:       React.PropTypes.string,
    ownerImageUrl:   React.PropTypes.string,
    ownerProfileUrl: React.PropTypes.string,
    isPrivate:       React.PropTypes.bool,
    editNote:        React.PropTypes.func
  },
  render: function() {

    var isInMyNotes = !this.props.ownerName; // public notes can appear inside myNotesPanel, use ownerName as a proxy for context

    var authorInfo = isInMyNotes ? null :
        (<div className="noteAuthorInfo">
          <a href={this.props.ownerProfileUrl}>
            <img className="noteAuthorImg" src={this.props.ownerImageUrl} />
          </a>
          <a href={this.props.ownerProfileUrl} className="noteAuthor">{this.props.ownerName}</a>
        </div>);
     
     var buttons = isInMyNotes ? 
                    (<div className="noteButtons">
                      <i className="fa fa-pencil" onClick={this.props.editNote} ></i>
                      {this.props.isPrivate ? null : (<i className="fa fa-unlock-alt"></i>)}
                    </div>) : null; 
     
     return (<div className="note">
                {authorInfo}
                <div className="note-content">
                  <div className="noteTitle">{this.props.title}</div>
                  <span className="noteText" dangerouslySetInnerHTML={{__html:this.props.text}}></span>
                </div>
                {buttons}
              </div>);
  }
});


var AllFilterSet = React.createClass({
  render: function() {
    var categories = this.props.summary.map(function(cat, i) {
      return (
        <CategoryFilter
          srefs={this.props.srefs}
          key={i}
          category={cat.category}
          heCategory={Sefaria.hebrewCategory(cat.category)}
          count={cat.count} 
          books={cat.books}
          filter={this.props.filter}
          updateRecent={true}
          setFilter={this.props.setFilter}
          on={Sefaria.util.inArray(cat.category, this.props.filter) !== -1} />
      );
    }.bind(this));
    return (
      <div className="fullFilterView filterSet">
        <LexiconPanel selectedWords={this.props.selectedWords} oref={this.props.oref}/>
        {categories}
      </div>
    );
  }
});


var CategoryFilter = React.createClass({
  handleClick: function(e) {
    e.preventDefault();
    this.props.setFilter(this.props.category, this.props.updateRecent);
    if (Sefaria.site) { Sefaria.site.track.event("Reader", "Category Filter Click", this.props.category); }
  },
  render: function() {
    var textFilters = this.props.books.map(function(book, i) {
     return (<TextFilter 
                srefs={this.props.srefs}
                key={i}
                book={book.book}
                heBook={book.heBook} 
                count={book.count}
                category={this.props.category}
                hideColors={true}
                updateRecent={true}
                setFilter={this.props.setFilter}
                on={Sefaria.util.inArray(book.book, this.props.filter) !== -1} />);
    }.bind(this));
    
    var notClickable = this.props.category == "Community";
    var color        = Sefaria.palette.categoryColor(this.props.category);
    var style        = notClickable ? {} : {"borderTop": "4px solid " + color};
    var classes      = classNames({categoryFilter: 1, on: this.props.on, notClickable: notClickable});
    var count        = notClickable ? null : (<span className="enInHe"> | {this.props.count}</span>);
    var handleClick  = notClickable ? null : this.handleClick;
    var url = (this.props.srefs && this.props.srefs.length > 0)?"/" + Sefaria.normRef(this.props.srefs[0]) + "?with=" + this.props.category:"";
    var innerFilter = (<div className={classes} onClick={handleClick}>
            <span className="en">{this.props.category}{count}</span>
            <span className="he">{this.props.heCategory}{count}</span>
          </div>);
    var wrappedFilter = notClickable ? innerFilter : <a href={url}>{innerFilter}</a>;
    return (
      <div className="categoryFilterGroup" style={style}>
        {wrappedFilter}
        <TwoBox content={ textFilters } />
      </div>
    );
  }
});


var TextFilter = React.createClass({
  propTypes: {
    srefs:        React.PropTypes.array.isRequired,
    book:         React.PropTypes.string.isRequired,
    heBook:       React.PropTypes.string.isRequired,
    on:           React.PropTypes.bool.isRequired,
    setFilter:    React.PropTypes.func.isRequired,
    updateRecent: React.PropTypes.bool
  },
  handleClick: function(e) {
    e.preventDefault();
    this.props.setFilter(this.props.book, this.props.updateRecent);
    if (Sefaria.site) { Sefaria.site.track.event("Reader", "Text Filter Click", this.props.book); }
  },
  render: function() {
    var classes = classNames({textFilter: 1, on: this.props.on, lowlight: this.props.count == 0});

    if (!this.props.hideColors) {
      var color = Sefaria.palette.categoryColor(this.props.category);
      var style = {"borderTop": "4px solid " + color};
    }
    var name = this.props.book == this.props.category ? this.props.book.toUpperCase() : this.props.book;
    var count = this.props.hideCounts || !this.props.count ? "" : ( <span className="enInHe"> ({this.props.count})</span>);
    var url = (this.props.srefs && this.props.srefs.length > 0)?"/" + Sefaria.normRef(this.props.srefs[0]) + "?with=" + name:"";
    return (
      <a href={url}>
        <div data-name={name}
          className={classes}
          style={style}
          onClick={this.handleClick}>
            <div>
              <span className="en">{name}{count}</span>
              <span className="he">{this.props.heBook}{count}</span>
            </div>
        </div>
      </a>
    );
  }
});


var RecentFilterSet = React.createClass({
  propTypes: {
    srefs:          React.PropTypes.array.isRequired,
    filter:         React.PropTypes.array.isRequired,
    recentFilters:  React.PropTypes.array.isRequired,
    textCategory:   React.PropTypes.string.isRequired,
    setFilter:      React.PropTypes.func.isRequired,
    showAllFilters: React.PropTypes.func.isRequired
  },
  toggleAllFilterView: function() {
    this.setState({showAllFilters: !this.state.showAllFilters});
  },
  render: function() {
    var topLinks = [];

    // Filter top links to exclude items already in recent filter
    topLinks = topLinks.filter(function(link) {
      return (Sefaria.util.inArray(link.book, this.props.recentFilters) == -1);
    }.bind(this));
    
    // Annotate filter texts with category            
    var recentFilters = this.props.recentFilters.map(function(filter) {
      var index = Sefaria.index(filter);
      return {
          book: filter,
          heBook: index ? index.heTitle : Sefaria.hebrewCategory(filter),
          category: index ? index.primary_category : filter };
    });
    topLinks = recentFilters.concat(topLinks).slice(0,5);

    // If the current filter is not already in the top set, put it first 
    if (this.props.filter.length) {
      var filter = this.props.filter[0];
      for (var i=0; i < topLinks.length; i++) {
        if (topLinks[i].book == filter || 
            topLinks[i].category == filter ) { break; }
      }
      if (i == topLinks.length) {
        var index = Sefaria.index(filter);
        if (index) {
          var annotatedFilter = {book: filter, heBook: index.heTitle, category: index.primary_category };
        } else {
          var annotatedFilter = {book: filter, heBook: filter, category: "Other" };
        }

        topLinks = [annotatedFilter].concat(topLinks).slice(0,5);
      } else {
        // topLinks.move(i, 0); 
      }        
    }
    var topFilters = topLinks.map(function(book) {
     return (<TextFilter
                srefs={this.props.srefs}
                key={book.book} 
                book={book.book}
                heBook={book.heBook}
                category={book.category}
                hideCounts={true}
                hideColors={true}
                count={book.count}
                updateRecent={false}
                setFilter={this.props.setFilter}
                on={Sefaria.util.inArray(book.book, this.props.filter) !== -1} />);
    }.bind(this));

    var moreButton = this.props.asHeader ? (<div className="showMoreFilters textFilter" style={style}
                        onClick={this.props.showAllFilters}>
                          <div>
                            <span className="dot">●</span><span className="dot">●</span><span className="dot">●</span>
                          </div>                    
                      </div>) : null;
    var style = this.props.asHeader ? {"borderTopColor": Sefaria.palette.categoryColor(this.props.textCategory)} : {};
    var classes = classNames({recentFilterSet: 1, topFilters: this.props.asHeader, filterSet: 1});
    return (
      <div className={classes} style={style}>
        <div className="topFiltersInner">{topFilters}</div>
        {moreButton}
      </div>
    );
  }
});


var LexiconPanel = React.createClass({
  propTypes: {
    selectedWords: React.PropTypes.string,
    oref:          React.PropTypes.object.isRequired
  },
  getInitialState: function() {
    return {
      entries: [],
      loaded: false
    };
  },
  componentDidMount: function(){
    if(this.props.selectedWords){
      this.getLookups(this.props.selectedWords, this.props.oref);
    }
  },
  componentWillReceiveProps: function(nextProps){
    // console.log("component will receive props: ", nextProps.selectedWords);
    if(this.props.selectedWords != nextProps.selectedWords){
      this.clearLookups();
      this.getLookups(nextProps.selectedWords, nextProps.oref);
    }
  },
  clearLookups: function(){
    this.setState({
      loaded: false,
      entries: []
    });
  },
  getLookups: function(words, oref){
    if(this.shouldActivate(words)){
      // console.log('getting data: ', words, oref.ref);
      Sefaria.lexicon(words, oref.ref, function(data) {
        this.setState({
          loaded: true,
          entries: data
        });

        var action = (data.length == 0)? "Open No Result": "Open";
        action += " / " + oref.categories.join("/") + "/" + oref.book;
        Sefaria.site.track.event("Lexicon", action, words);
        
        // console.log('gotten data from Sefaria.js, state re-set: ', this, data);
      }.bind(this));
    }
  },
  shouldActivate: function(selectedWords){
    if(!selectedWords){
      return false;
    }
    var wordList = selectedWords.split(/[\s:\u05c3\u05be\u05c0.]+/);
    var inputLength = wordList.length;
    return (inputLength <= 3);
  },
  render: function(){
    var refCats = this.props.oref.categories.join(", ");
    var enEmpty = "No results found.";
    var heEmpty = "לא נמצאו תוצאות";
    if(!this.shouldActivate(this.props.selectedWords)){
      //console.log("not rendering lexicon");
      return false;
    }
    var content;
    if(!this.state.loaded) {
      // console.log("lexicon not yet loaded");
      content = (<LoadingMessage message="Looking up words..." heMessage="מחפש מילים..."/>);
    }else if(this.state.entries.length == 0) {
      if (this.props.selectedWords.length == 0) {
        //console.log("empty words: nothing to render");
        return false;
      } else {
        //console.log("no results");
        content = (<LoadingMessage message={enEmpty} heMessage={heEmpty}/>);
      }
    }else{
      var entries = this.state.entries;
      content =  entries.filter(e => e['parent_lexicon_details']['text_categories'].indexOf(refCats) > -1).map(function(entry, i) {
            return (<LexiconEntry data={entry} key={i} />)
          });
      content = content.length ? content : <LoadingMessage message={enEmpty} heMessage={heEmpty} />;
    }
    return (
        <div className="lexicon-content">
          <div className="lexicon-results">
            { content }
          </div>
        </div>
      );
  }
});


var LexiconEntry = React.createClass({
  propTypes: {
    data: React.PropTypes.object.isRequired
  },
  render: function(){
    var entry = this.props.data;
    var headwordClassNames = classNames('headword', entry['parent_lexicon_details']["to_language"].slice(0,2));
    var definitionClassNames = classNames('definition-content', entry['parent_lexicon_details']["to_language"].slice(0,2));
    var entryHeadHtml =  (<span className="headword">{entry['headword']}</span>);
    var morphologyHtml = ('morphology' in entry['content']) ?  (<span className="morphology">({entry['content']['morphology']})</span>) :"";
    var senses = this.renderLexiconEntrySenses(entry['content']);
    var attribution = this.renderLexiconAttribution();
    return (
        <div className="entry">
          <div className={headwordClassNames}>{entryHeadHtml}</div>
          <div className={definitionClassNames}>{morphologyHtml}<ol className="definition">{senses}</ol></div>
          <div className="attribution">{attribution}</div>
        </div>
    );
  },
  renderLexiconEntrySenses: function(content){
		var grammar = ('grammar' in content) ? '('+ content['grammar']['verbal_stem'] + ')' : "";
		var def = ('definition' in content) ? content['definition'] : "";
        var notes = ('notes' in content) ? (<span className="notes">{content['notes']}</span>) : "";
        var sensesElems =  ('senses' in content) ? content['senses'].map((sense)=> {
          return this.renderLexiconEntrySenses(sense)
        }) : "";
        var senses = sensesElems.length ? (<ol className="senses">{sensesElems}</ol>) : "";
        return (
            <li className="sense">
              {grammar}
              {def}
              {notes}
              {senses}
            </li>
        );
  },
  renderLexiconAttribution: function(){
    var entry = this.props.data;
		var lexicon_dtls = entry['parent_lexicon_details'];
        return (
            <div>
                <span>
                  <a target="_blank"
                      href={('source_url' in lexicon_dtls) ? lexicon_dtls['source_url'] : ""}>
                    <span className="int-en">Source: </span>
                    <span className="int-he">מקור:</span>
                    {'source' in lexicon_dtls ? lexicon_dtls['source'] : lexicon_dtls['source_url']}
                  </a>
                </span>
                <span>
                  <a target="_blank"
                      href={('attribution_url' in lexicon_dtls) ? lexicon_dtls['attribution_url'] : ""}>
                    <span className="int-en">Creator: </span>
                    <span className="int-he">יוצר:</span>
                    {'attribution' in lexicon_dtls ? lexicon_dtls['attribution'] : lexicon_dtls['attribution_url']}
                  </a>
                </span>
            </div>
        );
  }
});


var ToolsPanel = React.createClass({
  propTypes: {
    srefs:                   React.PropTypes.array.isRequired,  // an array of ref strings
    mode:                    React.PropTypes.string.isRequired, // "Tools", "Share", "Add to Source Sheet", "Add Note", "My Notes", "Add Connection", "Edit Text", "Add Translation"
    filter:                  React.PropTypes.array.isRequired,
    recentFilters:           React.PropTypes.array.isRequired,
    setConnectionsMode:      React.PropTypes.func.isRequired,
    openComparePanel:        React.PropTypes.func.isRequired,
    version:                 React.PropTypes.string,
    versionLanguage:         React.PropTypes.string,
    fullPanel:               React.PropTypes.bool,
    multiPanel:              React.PropTypes.bool,
    canEditText:             React.PropTypes.bool,
    setFilter:               React.PropTypes.func,
    onTextClick:             React.PropTypes.func,
    onCitationClick:         React.PropTypes.func,
    onNavigationClick:       React.PropTypes.func,
    onCompareClick:          React.PropTypes.func,
    onOpenConnectionsClick:  React.PropTypes.func,
    openNav:                 React.PropTypes.func,
    openDisplaySettings:     React.PropTypes.func,
    closePanel:              React.PropTypes.func
  },
  getInitialState: function() {
    return {
    
    };
  },
  render: function() {
    var editText  = this.props.canEditText ? function() {
        var refString = this.props.srefs[0];
        var currentPath = Sefaria.util.currentPath();
        debugger;
        var currentLangParam;
        if (this.props.version) {
          refString += "/" + encodeURIComponent(this.props.versionLanguage) + "/" + encodeURIComponent(this.props.version);
        }
        var path = "/edit/" + refString;
        var nextParam = "?next=" + encodeURIComponent(currentPath);
        path += nextParam;
        Sefaria.site.track.event("Tools", "Edit Text Click", refString,
          {hitCallback: () =>  window.location = path}
        );
    }.bind(this) : null;
    
    var addTranslation = function() {
      var nextParam = "?next=" + Sefaria.util.currentPath();
      Sefaria.site.track.event("Tools", "Add Translation Click", this.props.srefs[0],
          {hitCallback: () => window.location = "/translate/" + this.props.srefs[0] + nextParam}
      );
    }.bind(this);
    
    var classes = classNames({toolsPanel: 1, textList: 1, fullPanel: this.props.fullPanel});
    return (
      <div className={classes}>
        <div className="texts">
          <div className="contentInner">
            <ToolsButton en="Share" he="שתף" image="tools-share.svg" onClick={function() {this.props.setConnectionsMode("Share")}.bind(this)} /> 
            <ToolsButton en="Add to Source Sheet" he="הוסף לדף מקורות" image="tools-add-to-sheet.svg" onClick={function() {this.props.setConnectionsMode("Add to Source Sheet")}.bind(this)} /> 
            <ToolsButton en="Add Note" he="הוסף רשומה" image="tools-write-note.svg" onClick={function() {this.props.setConnectionsMode("Add Note")}.bind(this)} /> 
            <ToolsButton en="My Notes" he="הרשומות שלי" image="tools-my-notes.svg" onClick={function() {this.props.setConnectionsMode("My Notes")}.bind(this)} /> 
            <ToolsButton en="Compare" he="השווה" image="tools-compare.svg" onClick={this.props.openComparePanel} /> 
            <ToolsButton en="Add Translation" he="הוסף תרגום" image="tools-translate.svg" onClick={addTranslation} /> 
            <ToolsButton en="Add Connection" he="הוסף קישור לטקסט אחר" image="tools-add-connection.svg"onClick={function() {this.props.setConnectionsMode("Add Connection")}.bind(this)} /> 
            { editText ? (<ToolsButton en="Edit Text" he="ערוך טקסט" image="tools-edit-text.svg" onClick={editText} />) : null }
          </div>
        </div>
      </div>);
  }
});


var ToolsButton = React.createClass({
  propTypes: {
    en:      React.PropTypes.string.isRequired,
    he:      React.PropTypes.string.isRequired,
    icon:    React.PropTypes.string,
    image:   React.PropTypes.string,
    onClick: React.PropTypes.func,
  },
  render: function() {
    var icon = null;
    if (this.props.icon) {
      var iconName = "fa-" + this.props.icon;
      var classes = {fa: 1, toolsButtonIcon: 1};
      classes[iconName] = 1;
      icon = (<i className={classNames(classes)} />)
    } else if (this.props.image) {
      icon = (<img src={"/static/img/" + this.props.image} className="toolsButtonIcon" />);
    }

    return (
      <div className="toolsButton sans" onClick={this.props.onClick}>
        <div className="int-en">{this.props.en}</div>
        <div className="int-he">{this.props.he}</div>
        {icon}
      </div>)
  }
});


var SharePanel = React.createClass({
  propTypes: {
    url:                React.PropTypes.string.isRequired,
    setConnectionsMode: React.PropTypes.func.isRequired,
    closePanel:         React.PropTypes.func.isRequired,
    fullPanel:          React.PropTypes.bool
  },
  componentDidMount: function() {
    this.focusInput();
  },
  componentDidUpdate: function() {
    this.focusInput();
  },
  focusInput: function() {
    $(ReactDOM.findDOMNode(this)).find("input").select();
  },
  render: function() {
    var url = this.props.url;
    var shareFacebook = function() {
      openInNewTab("https://www.facebook.com/sharer/sharer.php?u=" + url);
    };
    var shareTwitter = function() {
      openInNewTab("https://twitter.com/home?status=" + url);
    };
    var shareEmail = function() {
      openInNewTab("mailto:?&subject=Text on Sefaria&body=" + url);
    };
    var classes = classNames({sharePanel: 1, textList: 1, fullPanel: this.props.fullPanel});
    return (
      <div className={classes}>
        <div className="texts">
          <div className="contentInner">
            <input className="shareInput" value={this.props.url} />
            <ToolsButton en="Facebook" he="פייסבוק" icon="facebook-official" onClick={shareFacebook} />
            <ToolsButton en="Twitter" he="טוויטר" icon="twitter" onClick={shareTwitter} />
            <ToolsButton en="Email" he="אימייל" icon="envelope-o" onClick={shareEmail} />
          </div>
        </div>
      </div>);
  }
});


var AddToSourceSheetPanel = React.createClass({
  propTypes: {
    srefs:              React.PropTypes.array.isRequired,
    setConnectionsMode: React.PropTypes.func.isRequired,
    fullPanel:          React.PropTypes.bool
  },
  getInitialState: function() {
    return {
      selectedSheet: null
    };
  },
  componentDidMount: function() {
    this.loadSheets();
  },
  loadSheets: function() {
    Sefaria.sheets.userSheets(Sefaria._uid, function() {
      this.forceUpdate();
    }.bind(this));
  },
  addToSourceSheet: function() {
    if (!this.state.selectedSheet) { return; }
    var url     = "/api/sheets/" + this.state.selectedSheet + "/add";
    var source  = {refs: this.props.srefs};
    $.post(url, {source: JSON.stringify(source)}, this.confirmAdd); 
  },
  createSheet: function(refs) {
    var title = $(ReactDOM.findDOMNode(this)).find("input").val();
    if (!title) { return; }
    var sheet = {
      title: title,
      options: {numbered: 0},
      sources: []
    };
    var postJSON = JSON.stringify(sheet);
    $.post("/api/sheets/", {"json": postJSON}, function(data) {
      this.setState({selectedSheet: data.id}, function() {
        this.addToSourceSheet();
      });
      Sefaria.sheets.clearUserSheets(Sefaria._uid);
    }.bind(this)); 
  },
  openNewSheet: function() {
    this.setState({showNewSheetInput: true});
  },
  confirmAdd: function() {
    Sefaria.site.track.event("Tools", "Add to Source Sheet Save", this.props.srefs.join("/"));
    this.setState({confirm: true});
  },
  render: function() {
    if (this.state.confirm) {
      return (<ConfirmAddToSheetPanel sheetId={this.state.selectedSheet} />);
    }
    var sheets        = Sefaria.sheets.userSheets(Sefaria._uid);
    var sheetsContent = sheets ? sheets.map(function(sheet) {
      var classes     = classNames({sheet: 1, selected: this.state.selectedSheet == sheet.id});
      var selectSheet = function() { this.setState({selectedSheet: sheet.id}); }.bind(this);
      var title = sheet.title ? sheet.title.stripHtml() : "Untitled Source Sheet";
      return (<div className={classes} onClick={selectSheet} key={sheet.id}>{title}</div>);
    }.bind(this)) : <LoadingMessage />;
    sheetsContent     = sheets && sheets.length == 0 ? 
                          (<div className="sheet"><span className="en">You don&rsquo;t have any Source Sheets yet.</span><span className="he">טרם יצרת דפי מקורות</span></div>) :
                          sheetsContent;
    var createSheet = this.state.showNewSheetInput ? 
          (<div>
            <input className="newSheetInput" placeholder="Title your Sheet"/>
            <div className="button white small" onClick={this.createSheet} >
              <span className="int-en">Create</span>
              <span className="int-he">צור חדש</span>
            </div>
           </div>)
          :
          (<div className="button white" onClick={this.openNewSheet}>
              <span className="int-en">Start a Source Sheet</span>
              <span className="int-he">צור דף מקורות חדש</span>
          </div>);
    var classes = classNames({addToSourceSheetPanel: 1, textList: 1, fullPanel: this.props.fullPanel});
    return (
      <div className={classes}>
        <div className="texts">
          <div className="contentInner">
            {createSheet}
            <div className="sourceSheetSelector">{sheetsContent}</div>
            <div className="button" onClick={this.addToSourceSheet}>
              <span className="int-en">Add to Sheet</span>
              <span className="int-he">הוסף לדף המקורות</span>
            </div>
          </div>
        </div>
      </div>);
  }
});


var ConfirmAddToSheetPanel = React.createClass({
  propType: {
    sheetId: React.PropTypes.number.isRequired
  },
  render: function() {
    return (<div className="confirmAddToSheetPanel">
              <div className="message">
                <span className="int-en">Your source has been added.</span>
                <span className="int-he">הטקסט נוסף בהצלחה לדף המקורות</span>
              </div>
              <a className="button white" href={"/sheets/" + this.props.sheetId}>
                <span className="int-en">Go to Source Sheet <i className="fa fa-angle-right"></i></span>
                <span className="int-he">עבור לדף המקורות<i className="fa fa-angle-left"></i></span>
              </a>
            </div>);
  }
});


var AddNotePanel = React.createClass({
  propTypes: {
    srefs:              React.PropTypes.array.isRequired,
    setConnectionsMode: React.PropTypes.func.isRequired,
    closePanel:         React.PropTypes.func.isRequired,
    fullPanel:          React.PropTypes.bool,
    noteId:             React.PropTypes.string,
    noteText:           React.PropTypes.string,
    noteTitle:          React.PropTypes.string,
    noteIsPublic:       React.PropTypes.bool
  },
  getInitialState: function() {
    return {
      isPrivate: !this.props.noteIsPublic,
      saving: false
    };
  },
  componentDidMount: function() {
    this.focusNoteText();
  },
  focusNoteText: function() {
    $(ReactDOM.findDOMNode(this)).find(".noteText").focus();
  },
  saveNote: function() {
    var note = {
      text: $(ReactDOM.findDOMNode(this)).find(".noteText").val(),
      refs: this.props.srefs,
      anchorText: "",
      type:  "note",
      title: "",
      public: !this.state.isPrivate
    };
    var postData = { json: JSON.stringify(note) };
    var url = (this.props.noteId ? "/api/notes/" + this.props.noteId : "/api/notes/");
    $.post(url, postData, function(data) {
      if (data.error) {
        alert(data.error);
      } else if (data) {
        if (this.props.noteId) {
          Sefaria.clearPrivateNotes(data);
        } else {
          Sefaria.addPrivateNote(data);
        }
        Sefaria.site.track.event("Tools", "Note Save " + ((this.state.isPrivate)?"Private":"Public"), this.props.srefs.join("/"));
        this.props.setConnectionsMode("My Notes");
      } else {
        alert("Sorry, there was a problem saving your note.");
      }
    }.bind(this)).fail( function(xhr, textStatus, errorThrown) {
      alert("Unfortunately, there was an error saving this note. Please try again or try reloading this page.");
    });
    this.setState({saving: true});
  },
  setPrivate: function() {
    this.setState({isPrivate: true});
  },
  setPublic: function() {
    this.setState({isPrivate: false});
  },
  cancel: function() {
    this.props.setConnectionsMode("Tools");
  },
  deleteNote: function() {
    if (!confirm("Are you sure you want to delete this note?")) { return; }
    var url = "/api/notes/" + this.props.noteId;
    $.ajax({
      type: "delete",
      url: url,
      success: function() { 
        alert("Source deleted.");
        Sefaria.clearPrivateNotes();
        this.props.setConnectionsMode("My Notes");
      }.bind(this),
      error: function () {
        alert("Something went wrong (that's all I know).");
      }
    });
  },
  render: function() {
    var classes        = classNames({addNotePanel: 1, textList: 1, fullPanel: this.props.fullPanel});
    var privateClasses = classNames({notePrivateButton: 1, active: this.state.isPrivate});
    var publicClasses  = classNames({notePublicButton: 1, active: !this.state.isPrivate});
    return (<div className={classes}>
              <div className="texts">
                <div className="contentInner">
        
                  <textarea className="noteText" placeholder="Write a note..." defaultValue={this.props.noteText}></textarea>
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
                  <div className="line"></div>
                  <div className="button fillWidth" onClick={this.saveNote}>
                    <span className="int-en">{this.props.noteId ? "Save" : "Add Note"}</span>
                    <span className="int-he">{this.props.noteId ? "שמור": "הוסף רשומה"}</span>
                  </div>
                  <div className="button white fillWidth" onClick={this.cancel}>
                    <span className="int-en">Cancel</span>
                    <span className="int-he">בטל</span>
                  </div>
                  {this.props.noteId ? 
                    (<div className="deleteNote" onClick={this.deleteNote}>
                      <span className="int-en">Delete Note</span>
                      <span className="int-he">מחק רשומה</span>
                     </div>): null }

                </div>
              </div>
            </div>);
  }
});


var MyNotesPanel = React.createClass({
  propTypes: {
    srefs:              React.PropTypes.array.isRequired,
    setConnectionsMode: React.PropTypes.func.isRequired,
    closePanel:         React.PropTypes.func.isRequired,
    editNote:           React.PropTypes.func.isRequired,
    fullPanel:          React.PropTypes.bool
  },
  componentDidMount: function() {
    this.loadNotes();
  },
  componentDidUpdate: function(prevProps, prevState) {
    if (!prevProps.srefs.compare(this.props.srefs)) {
      this.loadNotes();
    }
  },
  loadNotes: function() {
    // Rerender this component when privateNotes arrive.
    Sefaria.privateNotes(this.props.srefs, this.rerender);
  },
  rerender: function() {
    this.forceUpdate();
  },
  render: function() {
    var myNotesData = Sefaria.privateNotes(this.props.srefs);
    var myNotes = myNotesData ? myNotesData.map(function(note) {
      var editNote = function() {
        this.props.editNote(note);
      }.bind(this);
      return (<Note 
                title={note.title}
                text={note.text} 
                isPrivate={!note.public}
                editNote={editNote}
                key={note._id} />);
    }.bind(this)) : null ;

    var classes = classNames({myNotesPanel: 1, textList: 1, fullPanel: this.props.fullPanel});
    return (<div className={classes}>
              <div className="texts">
                <div className="contentInner">
                  {myNotes}
                  <ToolsButton 
                    en="Add Note" 
                    he="הוסף רשומה"
                    icon="pencil" 
                    onClick={function() {this.props.setConnectionsMode("Add Note")}.bind(this)} />
                </div>
              </div>
            </div>);
  }
});


var LoginPanel = React.createClass({
  propTypes: {
    fullPanel: React.PropTypes.bool,
  },
  render: function() {
    var nextParam = "?next=" + Sefaria.util.currentPath();
    var classes     = classNames({loginPanel: 1, textList: 1, fullPanel: this.props.fullPanel});
    return (<div className={classes}>
              <div className="texts">
                <div className="contentInner">

                  <div className="loginPanelMessage">
                    <span className="int-en">You must be logged in to use this feature.</span>
                    <span className="int-he">עליך להיות מחובר בכדי להשתמש באפשרות זו.</span>
                  </div>
                  <a className="button" href={"/login" + nextParam}>
                    <span className="int-en">Log In</span>
                    <span className="int-he">התחבר</span>
                  </a>
                  <a className="button" href={"/register" + nextParam}>
                    <span className="int-en">Sign Up</span>
                    <span className="int-he">הרשם</span>
                  </a>

                </div>
              </div>
            </div>);
  }
});


var SearchPage = React.createClass({
    propTypes: {
        query:                React.PropTypes.string,
        appliedFilters:       React.PropTypes.array,
        settings:             React.PropTypes.object,
        close:                React.PropTypes.func,
        onResultClick:        React.PropTypes.func,
        onQueryChange:        React.PropTypes.func,
        updateAppliedFilter:  React.PropTypes.func,
        registerAvailableFilters: React.PropTypes.func,
        availableFilters:     React.PropTypes.array,
        filtersValid:         React.PropTypes.bool,
        hideNavHeader:        React.PropTypes.bool
    },
    getInitialState: function() {
        return {};
    },

    getDefaultProps: function() {
      return {
        appliedFilters: []
      };
    },
    render: function () {
        var fontSize = 62.5; // this.props.settings.fontSize, to make this respond to user setting. disabled for now.
        var style    = {"fontSize": fontSize + "%"};
        var classes  = classNames({readerNavMenu: 1, noHeader: this.props.hideNavHeader});
        var isQueryHebrew = Sefaria.hebrew.isHebrew(this.props.query);
        return (<div className={classes}>
                  {this.props.hideNavHeader ? null :
                    (<div className="readerNavTop search">
                      <CategoryColorLine category="Other" />
                      <ReaderNavigationMenuCloseButton onClick={this.props.close}/>
                      <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
                      <SearchBar
                        initialQuery = { this.props.query }
                        updateQuery = { this.props.onQueryChange } />
                    </div>)}
                  <div className="content hasFooter">
                    <div className="contentInner">
                      <div className="searchContentFrame">
                          <h1 classNames={isQueryHebrew?"hebrewQuery":"englishQuery"}>
                            &ldquo;{ this.props.query }&rdquo;
                          </h1>
                          <div className="searchControlsBox">
                          </div>
                          <div className="searchContent" style={style}>
                              <SearchResultList
                                  query = { this.props.query }
                                  appliedFilters = {this.props.appliedFilters}
                                  onResultClick={this.props.onResultClick}
                                  updateAppliedFilter = {this.props.updateAppliedFilter}
                                  registerAvailableFilters={this.props.registerAvailableFilters}
                                  availableFilters={this.props.availableFilters}
                                  filtersValid={this.props.filtersValid} />
                          </div>
                      </div>
                    </div>
                    <footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
                      <Footer />
                    </footer>
                  </div>
                </div>);
    }
});


var SearchBar = React.createClass({
    propTypes: {
        initialQuery: React.PropTypes.string,
        updateQuery: React.PropTypes.func
    },
    getInitialState: function() {
        return {query: this.props.initialQuery};
    },
    handleKeypress: function(event) {
        if (event.charCode == 13) {
            this.updateQuery();
            // Blur search input to close keyboard
            $(ReactDOM.findDOMNode(this)).find(".readerSearch").blur();
        }
    },
    updateQuery: function() {
        if (this.props.updateQuery) {
            this.props.updateQuery(this.state.query)
        }
    },
    handleChange: function(event) {
        this.setState({query: event.target.value});
    },
    render: function () {
        return (
            <div>
                <div className="searchBox">
                    <input className="readerSearch" value={this.state.query} onKeyPress={this.handleKeypress} onChange={this.handleChange} placeholder="Search"/>
                    <ReaderNavigationMenuSearchButton onClick={this.updateQuery} />
                </div>
                <div className="description"></div>
            </div>
        )
    }
});


var SearchResultList = React.createClass({
    propTypes: {
        query:                React.PropTypes.string,
        appliedFilters:       React.PropTypes.array,
        onResultClick:        React.PropTypes.func,
        filtersValid:         React.PropTypes.bool,
        availableFilters:     React.PropTypes.array,
        updateAppliedFilter:  React.PropTypes.func,
        registerAvailableFilters: React.PropTypes.func
    },
    initialQuerySize: 100,
    backgroundQuerySize: 1000,
    maxResultSize: 10000,
    resultDisplayStep: 50,
    getDefaultProps: function() {
        return {
            appliedFilters: []
        };
    },
    getInitialState: function() {
        return {
            types: ["text", "sheet"],
            runningQueries: {"text": null, "sheet": null},
            isQueryRunning: {"text": false, "sheet": false},
            moreToLoad: {"text": true, "sheet": true},
            totals: {"text":0, "sheet":0},
            displayedUntil: {"text":50, "sheet":50},
            hits: {"text": [], "sheet": []},
            activeTab: "text",
            error: false
        }
    },
    updateRunningQuery: function(type, ajax) {
        this.state.runningQueries[type] = ajax;
        this.state.isQueryRunning[type] = !!ajax;
        this.setState({
          runningQueries: this.state.runningQueries,
          isQueryRunning: this.state.isQueryRunning
        });
    },
    _abortRunningQueries: function() {
        this.state.types.forEach(t => this._abortRunningQuery(t));
    },
    _abortRunningQuery: function(type) {
        if(this.state.runningQueries[type]) {
            this.state.runningQueries[type].abort();
        }
        this.updateRunningQuery(type, null);
    },
    componentDidMount: function() {
        this._executeQueries();
        $(ReactDOM.findDOMNode(this)).closest(".content").bind("scroll", this.handleScroll);
    },
    componentWillUnmount: function() {
        this._abortRunningQueries();
        $(ReactDOM.findDOMNode(this)).closest(".content").unbind("scroll", this.handleScroll);
    },
    handleScroll: function() {
      var tab = this.state.activeTab;
      if (this.state.displayedUntil[tab] >= this.state.totals[tab]) { return; }
      var $scrollable = $(ReactDOM.findDOMNode(this)).closest(".content");
      var margin = 100;
      if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
        this._extendResultsDisplayed();
      }
    },
    _extendResultsDisplayed: function() {
      var tab = this.state.activeTab;
      this.state.displayedUntil[tab] += this.resultDisplayStep;
      if (this.state.displayedUntil[tab] >= this.state.totals[tab]) {
        this.state.displayedUntil[tab] = this.state.totals[tab];
      }
      this.setState({displayedUntil: this.state.displayedUntil});
    },
    componentWillReceiveProps: function(newProps) {
        if(this.props.query != newProps.query) {
           this.setState({
             totals: {"text":0, "sheet":0},
             hits: {"text": [], "sheet": []},
             moreToLoad: {"text": true, "sheet": true},
             displayedUntil: {"text":50, "sheet":50}
           });
           this._executeQueries(newProps)
        }
        else if (
        (this.props.appliedFilters.length !== newProps.appliedFilters.length) ||
          !(this.props.appliedFilters.every((v,i) => v === newProps.appliedFilters[i]))) {
           this._executeQueries(newProps)
        }
        // Execute a second query to apply filters after an initial query which got available filters
        else if ((this.props.filtersValid != newProps.filtersValid) && this.props.appliedFilters.length > 0) {
           this._executeQueries(newProps);
        }
    },
    _loadRemainder: function(type, last, total, currentHits) {
    // Having loaded "last" results, and with "total" results to load, load the rest, this.backgroundQuerySize at a time
      if (last >= total || last >= this.maxResultSize) {
        this.state.moreToLoad[type] = false;
        this.setState({moreToLoad: this.state.moreToLoad});
        return;
      }
      var query_props = {
        query: this.props.query,
        type: type,
        size: this.backgroundQuerySize,
        from: last,
        error: function() {  console.log("Failure in SearchResultList._loadRemainder"); },
        success: function(data) {
          var hitArray = (type == "text")?this._process_text_hits(data.hits.hits):data.hits.hits;
          var nextHits = currentHits.concat(hitArray);
          this.state.hits[type] = nextHits;
          
          this.setState({hits: this.state.hits});
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
    _executeQueries: function(props) {
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
            success: function(data) {
                this.updateRunningQuery("sheet", null);
                  this.setState({
                    hits: extend(this.state.hits, {"sheet": data.hits.hits}),
                    totals: extend(this.state.totals, {"sheet": data.hits.total})
                  });
                  Sefaria.site.track.event("Search", "Query: sheet", props.query, data.hits.total);

                if(isCompletionStep) {
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
            success: function(data) {
                this.updateRunningQuery("text", null);
                var hitArray = this._process_text_hits(data.hits.hits);
                this.setState({
                  hits: extend(this.state.hits, {"text": hitArray}),
                  totals: extend(this.state.totals, {"text": data.hits.total})
                });
                var filter_label = (request_applied && request_applied.length > 0)? (" - " + request_applied.join("|")) : ""
                var query_label = props.query + filter_label;
                Sefaria.site.track.event("Search", "Query: text", query_label, data.hits.total);
                if (data.aggregations) {
                  if (data.aggregations.category) {
                    var ftree = this._buildFilterTree(data.aggregations.category.buckets);
                    var orphans = this._applyFilters(ftree, this.props.appliedFilters);
                    this.props.registerAvailableFilters(ftree.availableFilters, ftree.registry, orphans);
                  }
                }
                if(isCompletionStep) {
                  this._loadRemainder("text", this.initialQuerySize, data.hits.total, hitArray);
                }
            }.bind(this),
            error: this._handle_error
        });

        this.updateRunningQuery("text", runningTextQuery);
        this.updateRunningQuery("sheet", runningSheetQuery);
    },
    _handle_error: function(jqXHR, textStatus, errorThrown) {
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
    _process_text_hits: function(hits) {
        var comparingRef = null;
        var newHits = [];

        for(var i = 0, j = 0; i < hits.length; i++) {
            var currentRef = hits[i]._source.ref;
            if(currentRef == comparingRef) {
                newHits[j - 1].duplicates = newHits[j-1].duplicates || [];
                newHits[j - 1].duplicates.push(hits[i]);
            } else {
                newHits[j] = hits[i];
                j++;
                comparingRef = currentRef;
            }
        }
        return newHits;
    },
    _buildFilterTree(aggregation_buckets) {
      //returns object w/ keys 'availableFilters', 'registry'
      //Add already applied filters w/ empty doc count?
      var rawTree = {};

      this.props.appliedFilters.forEach(
          fkey => this._addAvailableFilter(rawTree, fkey, {"docCount":0})
      );

      aggregation_buckets.forEach(
          f => this._addAvailableFilter(rawTree, f["key"], {"docCount":f["doc_count"]})
      );
      this._aggregate(rawTree);
      return this._build(rawTree);
    },
    _addAvailableFilter: function(rawTree, key, data) {
      //key is a '/' separated key list, data is an arbitrary object
      //Based on http://stackoverflow.com/a/11433067/213042
      var keys = key.split("/");
      var base = rawTree;

      // If a value is given, remove the last name and keep it for later:
      var lastName = arguments.length === 3 ? keys.pop() : false;

      // Walk the hierarchy, creating new objects where needed.
      // If the lastName was removed, then the last object is not set yet:
      var i;
      for(i = 0; i < keys.length; i++ ) {
          base = base[ keys[i] ] = base[ keys[i] ] || {};
      }

      // If a value was given, set it to the last name:
      if( lastName ) {
          base = base[ lastName ] = data;
      }

      // Could return the last object in the hierarchy.
      // return base;
    },
    _aggregate: function(rawTree) {
      //Iterates the raw tree to aggregate doc_counts from the bottom up
      //Nod to http://stackoverflow.com/a/17546800/213042
      walker("", rawTree);
      function walker(key, branch) {
          if (branch !== null && typeof branch === "object") {
              // Recurse into children
              $.each(branch, walker);
              // Do the summation with a hacked object 'reduce'
              if ((!("docCount" in branch)) || (branch["docCount"] === 0)) {
                  branch["docCount"] = Object.keys(branch).reduce(function (previous, key) {
                      if (typeof branch[key] === "object" && "docCount" in branch[key]) {
                          previous += branch[key].docCount;
                      }
                      return previous;
                  }, 0);
              }
          }
      }
    },
    _build: function(rawTree) {
      //returns dict w/ keys 'availableFilters', 'registry'
      //Aggregate counts, then sort rawTree into filter objects and add Hebrew using Sefaria.toc as reference
      //Nod to http://stackoverflow.com/a/17546800/213042
      var path = [];
      var filters = [];
      var registry = {};

      var commentaryNode = new Sefaria.search.FilterNode();


      for(var j = 0; j < Sefaria.toc.length; j++) {
          var b = walk.call(this, Sefaria.toc[j]);
          if (b) filters.push(b);

          // Remove after commentary refactor ?
          // If there is commentary on this node, add it as a sibling
          if (commentaryNode.hasChildren()) {
            var toc_branch = Sefaria.toc[j];
            var cat = toc_branch["category"];
            // Append commentary node to result filters, add a fresh one for the next round
            var docCount = 0;
            if (rawTree.Commentary && rawTree.Commentary[cat]) { docCount += rawTree.Commentary[cat].docCount; }
            if (rawTree.Commentary2 && rawTree.Commentary2[cat]) { docCount += rawTree.Commentary2[cat].docCount; }
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

      return {availableFilters: filters, registry: registry};

      function walk(branch, parentNode) {
          var node = new Sefaria.search.FilterNode();

          //Remove after commentary refactor
          node["docCount"] = 0;
          //

          if("category" in branch) { // Category node
              // Remove after commentary refactor
              if(branch["category"] == "Commentary") { // Special case commentary
                  path.unshift(branch["category"]);  // Place "Commentary" at the *beginning* of the path
                   extend(node, {
                       "title": parentNode.title,
                       "path": path.join("/"),
                       "heTitle": parentNode.heTitle
                   });
              } else {
              // End commentary code

                path.push(branch["category"]);  // Place this category at the *end* of the path
                extend(node, {
                  "title": path.slice(-1)[0],
                  "path": path.join("/"),
                  "heTitle": branch["heCategory"]
                });

              // Remove after commentary refactor
              }
              // End commentary code

              for(var j = 0; j < branch["contents"].length; j++) {
                  var b = walk.call(this, branch["contents"][j], node);
                  if (b) node.append(b);
              }
          }
          else if ("title" in branch) { // Text Node
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
              }
              catch (e) {
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
              if(("category" in branch) && (branch["category"] == "Commentary")) {  // Special case commentary
                  commentaryNode.append(node);
                  path.shift();
                  return false;
              }
              // End commentary code

              path.pop();
              return node;
          }
          catch (e) {
              // Remove after commentary refactor
              if(("category" in branch) && (branch["category"] == "Commentary")) {  // Special case commentary
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
    _applyFilters: function(ftree, appliedFilters) {
      var orphans = [];  // todo: confirm behavior
      appliedFilters.forEach(path => {
        var node = ftree.registry[path];
        if (node) { node.setSelected(true); }
        else { orphans.push(path); }
      });
      return orphans;
    },
    showSheets: function() {
      this.setState({"activeTab": "sheet"});
    },
    showTexts:  function() {
      this.setState({"activeTab": "text"});
    },
    render: function () {
        if (!(this.props.query)) {  // Push this up? Thought is to choose on the SearchPage level whether to show a ResultList or an EmptySearchMessage.
            return null;
        }

        var tab = this.state.activeTab;
        var results = [];

        if (tab == "text") {
          results = this.state.hits.text.slice(0,this.state.displayedUntil["text"]).map(result =>
            <SearchTextResult
                data={result}
                query={this.props.query}
                key={result._id}
                onResultClick={this.props.onResultClick} />);

        } else if (tab == "sheet") {
          results = this.state.hits.sheet.slice(0, this.state.displayedUntil["sheet"]).map(result =>
              <SearchSheetResult
                    data={result}
                    query={this.props.query}
                    key={result._id} />);
        }

        var loadingMessage   = (<LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />);
        var noResultsMessage = (<LoadingMessage message="0 results." heMessage="0 תוצאות." />);

        var queryFullyLoaded      = !this.state.moreToLoad[tab] && !this.state.isQueryRunning[tab];
        var haveResults      = !!results.length;
        results              = haveResults ? results : noResultsMessage;
        var searchFilters    = (<SearchFilters
                                  query = {this.props.query}
                                  total = {this.state.totals["text"] + this.state.totals["sheet"]}
                                  textTotal = {this.state.totals["text"]}
                                  sheetTotal = {this.state.totals["sheet"]}
                                  availableFilters={this.props.availableFilters}
                                  appliedFilters = {this.props.appliedFilters}
                                  updateAppliedFilter = {this.props.updateAppliedFilter}
                                  isQueryRunning = {this.state.isQueryRunning[tab]}
                                  activeTab = {this.state.activeTab}
                                  clickTextButton = {this.showTexts}
                                  clickSheetButton = {this.showSheets} />);
        return (
          <div>
            { searchFilters }
            { queryFullyLoaded || haveResults ? results : loadingMessage }
          </div>
        );
    }
});


var SearchFilters = React.createClass({
  propTypes: {
    query:                React.PropTypes.string,
    total:                React.PropTypes.number,
    textTotal:            React.PropTypes.number,
    sheetTotal:           React.PropTypes.number,
    appliedFilters:       React.PropTypes.array,
    availableFilters:     React.PropTypes.array,
    updateAppliedFilter:  React.PropTypes.func,
    isQueryRunning:       React.PropTypes.bool,
    activeTab:            React.PropTypes.string,
    clickTextButton:      React.PropTypes.func,
    clickSheetButton:     React.PropTypes.func
  },
  getInitialState: function() {
    return {
      openedCategory: null,
      openedCategoryBooks: [],
      displayFilters: !!this.props.appliedFilters.length
    }
  },
  getDefaultProps: function() {
    return {
      appliedFilters: [],
      availableFilters: []
    };
  },
  componentWillReceiveProps(newProps) {
    // Save current filters
    // this.props
    // todo: check for cases when we want to rebuild / not

    if ((newProps.query != this.props.query)
        || (newProps.availableFilters.length == 0)) {
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
  getSelectedTitles: function(lang) {
    var results = [];
    for (var i = 0; i < this.props.availableFilters.length; i++) {
        results = results.concat(this.props.availableFilters[i].getSelectedTitles(lang));
    }
    return results;
  },
  handleFocusCategory: function(filterNode) {
    var leaves = filterNode.getLeafNodes();
    this.setState({
      openedCategory: filterNode,
      openedCategoryBooks: leaves
    })
  },
  toggleFilterView: function() {
    this.setState({displayFilters: !this.state.displayFilters});
  },
  _type_button: function(en_singular, en_plural, he_singular, he_plural, total, on_click, active) {
    // if (!total) { return "" }
      var total_with_commas = this._add_commas(total);
      var classes = classNames({"type-button": 1, active: active});

      return <div className={classes} onClick={on_click}>
      <div className="type-button-total">
        {total_with_commas}
      </div>
      <div className="type-button-title">
        <span className="int-en">{(total != 1) ? en_plural : en_singular}</span>
        <span className="int-he">{(total != 1) ? he_plural : he_singular}</span>
      </div>
    </div>;
  },
  _add_commas: function(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  },
  render: function() {

    var runningQueryLine = (<LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />);

    var buttons = (
      <div className="type-buttons">
        {this._type_button("Text", "Texts", "מקור", "מקורות", this.props.textTotal, this.props.clickTextButton, (this.props.activeTab == "text"))}
        {this._type_button("Sheet", "Sheets", "דף מקורות", "דפי מקורות", this.props.sheetTotal, this.props.clickSheetButton, (this.props.activeTab == "sheet"))}
      </div>
    );

    var selected_filters = (<div className="results-count">
          <span className="int-en">
            {(!!this.props.appliedFilters.length && !!this.props.total)?(this.getSelectedTitles("en").join(", ")):""}
          </span>
          <span className="int-he">
            {(!!this.props.appliedFilters.length && !!this.props.total)?(this.getSelectedTitles("he").join(", ")):""}
          </span>
      </div>);
    var filter_panel = (<div>
      <div className="searchFilterToggle" onClick={this.toggleFilterView}>
        <span className="int-en">Filter by Text   </span>
        <span className="int-he">סנן לפי כותר   </span>
        <i className={(this.state.displayFilters) ? "fa fa-caret-down fa-angle-down":"fa fa-caret-down"} />
      </div>
      <div className={(this.state.displayFilters) ? "searchFilterBoxes":"searchFilterBoxes hidden"}>
        <div className="searchFilterCategoryBox">
        {this.props.availableFilters.map(function(filter) {
            return (<SearchFilter
                filter={filter}
                isInFocus={this.state.openedCategory === filter}
                focusCategory={this.handleFocusCategory}
                updateSelected={this.props.updateAppliedFilter}
                key={filter.path}/>);
        }.bind(this))}
        </div>
        <div className="searchFilterBookBox">
        {this.state.openedCategoryBooks.map(function(filter) {
            return (<SearchFilter
                filter={filter}
                updateSelected={this.props.updateAppliedFilter}
                key={filter.path}/>);
        }.bind(this))}
        </div>
        <div style={{clear: "both"}}/>
      </div>
    </div>);

    return (
      <div className={ classNames({searchTopMatter: 1, loading: this.props.isQueryRunning}) }>
        <div className="searchStatusLine">
          { (this.props.isQueryRunning) ? runningQueryLine : buttons }
          { (this.props.availableFilters.length > 0 && this.props.activeTab == "text") ? selected_filters : ""}
        </div>
        { (this.props.availableFilters.length > 0 && this.props.activeTab == "text") ? filter_panel : "" }
      </div>);
  }
});


var SearchFilter = React.createClass({
  propTypes: {
    filter:         React.PropTypes.object.isRequired,
    isInFocus:      React.PropTypes.bool,
    updateSelected: React.PropTypes.func.isRequired,
    focusCategory:  React.PropTypes.func
  },
  getInitialState: function() {
    return {selected: this.props.filter.selected};
  },
  componentWillReceiveProps(newProps) {
    if (newProps.filter.selected != this.state.selected) {
      this.setState({selected: newProps.filter.selected});
    }
  },
  // Can't set indeterminate in the render phase.  https://github.com/facebook/react/issues/1798
  componentDidMount: function() {
    ReactDOM.findDOMNode(this).querySelector("input").indeterminate = this.props.filter.isPartial();
  },
  componentDidUpdate: function() {
    ReactDOM.findDOMNode(this).querySelector("input").indeterminate = this.props.filter.isPartial();
  },
  handleFilterClick: function(evt) {
    //evt.preventDefault();
    this.props.updateSelected(this.props.filter)
  },
  handleFocusCategory: function() {
    if (this.props.focusCategory) {
      this.props.focusCategory(this.props.filter)
    }
  },
  render: function() {
    return(
      <li onClick={this.handleFocusCategory}>
        <input type="checkbox" id={this.props.filter.path} className="filter" checked={this.state.selected == 1} onChange={this.handleFilterClick}/>
        <label onClick={this.handleFilterClick} for={this.props.filter.path}><span></span></label>
        <span className="int-en"><span className="filter-title">{this.props.filter.title}</span> <span className="filter-count">({this.props.filter.docCount})</span></span>
        <span className="int-he" dir="rtl"><span className="filter-title">{this.props.filter.heTitle}</span> <span className="filter-count">({this.props.filter.docCount})</span></span>
        {this.props.isInFocus?<span className="int-en"><i className="in-focus-arrow fa fa-caret-right"/></span>:""}
        {this.props.isInFocus?<span className="int-he"><i className="in-focus-arrow fa fa-caret-left"/></span>:""}
      </li>);
  }
});


var SearchTextResult = React.createClass({
    propTypes: {
        query: React.PropTypes.string,
        data: React.PropTypes.object,
        onResultClick: React.PropTypes.func
    },
    getInitialState: function() {
        return {
            duplicatesShown: false
        }
    },
    toggleDuplicates: function(event) {
        this.setState({
            duplicatesShown: !this.state.duplicatesShown
        });
    },
    handleResultClick: function(event) {
        if(this.props.onResultClick) {
            event.preventDefault();
            var s = this.props.data._source;
            Sefaria.site.track.event("Search", "Search Result Text Click", `${this.props.query} - ${s.ref}/${s.version}/${s.lang}`);
            this.props.onResultClick(s.ref, s.version, s.lang, {"highlight": this.props.query}); //highlight not yet handled, above in ReaderApp.handleNavigationClick()
        }
    },
    render: function () {
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
            return {__html:snippet}
        }

        var more_results_caret =
            (this.state.duplicatesShown)
            ? <i className="fa fa-caret-down fa-angle-down"></i>
            : <i className="fa fa-caret-down"></i>;

        var more_results_indicator = (!(data.duplicates)) ? "" :
                <div className='similar-trigger-box' onClick={this.toggleDuplicates}>
                    <span className='similar-title int-he'>
                        { data.duplicates.length } {(data.duplicates.length > 1) ? " גרסאות נוספות" : " גרסה נוספת"}
                    </span>
                    <span className='similar-title int-en'>
                        { data.duplicates.length } more version{(data.duplicates.length > 1) ? "s" : null}
                    </span>
                    {more_results_caret}
                </div>;

        var shown_duplicates = (data.duplicates && this.state.duplicatesShown) ?
            (<div className='similar-results'>
                    {data.duplicates.map(function(result) {
                        var key = result._source.ref + "-" + result._source.version;
                        return <SearchTextResult
                            data={result}
                            key={key}
                            query={this.props.query}
                            onResultClick={this.props.onResultClick}
                            />;
                        }.bind(this))}
            </div>) : null;

        return (
            <div className="result text_result">
                <a href={href} onClick={this.handleResultClick}>
                    <div className="result-title">
                        <span className="en">{s.ref}</span>
                        <span className="he">{s.heRef}</span>
                    </div>
                    <div className="snippet" dangerouslySetInnerHTML={get_snippet_markup()} ></div>
                    <div className="version" >{s.version}</div>
                </a>
                {more_results_indicator}
                {shown_duplicates}
            </div>
        )
    }
});


var SearchSheetResult = React.createClass({
    propTypes: {
        query: React.PropTypes.string,
        data: React.PropTypes.object
    },
    handleSheetClick: function(e) {
      var href = e.target.getAttribute("href");
      e.preventDefault();
      var s = this.props.data._source;
      Sefaria.site.track.event("Search", "Search Result Sheet Click", `${this.props.query} - ${s.sheetId}`,
          {hitCallback: () => window.location = href}
      );

    },
    handleProfileClick: function(e) {
      var href = e.target.getAttribute("href");
      e.preventDefault();
      var s = this.props.data._source;
      Sefaria.site.track.event("Search", "Search Result Sheet Owner Click", `${this.props.query} - ${s.sheetId} - ${s.owner_name}`,
          {hitCallback: () => window.location = href}
      );
    },
    render: function() {
        var data = this.props.data;
        var s = data._source;
      
        var snippet = data.highlight.content.join("..."); // data.highlight ? data.highlight.content.join("...") : s.content;
        snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").text();

        function get_version_markup() {
            return {__html: s.version};
        }
        var clean_title = $("<span>" + s.title + "</span>").text();
        var href = "/sheets/" + s.sheetId;
        return (
            <div className='result sheet_result'>
              <div className="result_img_box"><a href={s.profile_url} onClick={this.handleProfileClick}><img className='owner_image' src={s.owner_image}/></a></div>
              <div className="result_text_box">
                <a href={s.profile_url} onClick={this.handleProfileClick} className='owner_name'>{s.owner_name}</a>
                <a className='result-title' href={href} onClick={this.handleSheetClick}>{clean_title}</a>
                <div className="snippet">{snippet}</div>
              </div>
            </div>
        );
    }
});


var AccountPanel = React.createClass({
  propTypes: {
    interfaceLang: React.PropTypes.string,
  },
  render: function() {
    var width = typeof window !== "undefined" ? $(window).width() : 1000;
    var accountContent = [
      (<BlockLink interfaceLink={true} target="/my/profile" title="Profile" heTitle="פרופיל"/>),
      (<BlockLink interfaceLink={true} target="/sheets/private" title="My Source Sheets" heTitle="דפי מקורות" />),
      (<BlockLink interfaceLink={true} target="/coming-soon?my-notes" title="My Notes" heTitle="רשומות" />),
      (<BlockLink interfaceLink={true} target="/coming-soon?reading-history" title="Reading History" heTitle="היסטורית קריאה" />),
      (<BlockLink interfaceLink={true} target="/settings/account" title="Settings" heTitle="הגדרות" />),
      (<BlockLink interfaceLink={true} target="/logout" title="Log Out" heTitle="ניתוק" />)
    ];
    accountContent = (<TwoOrThreeBox content={accountContent} width={width} />);

    var learnContent = [
      (<BlockLink interfaceLink={true} target="/about" title="About" heTitle="אודות" />),
      (<BlockLink interfaceLink={true} target="/help" title="Help" heTitle="עזרה" />),
      (<BlockLink interfaceLink={true} target="http://blog.sefaria.org" title="Blog" heTitle="בלוג" />),
      (<BlockLink interfaceLink={true} target="/faq" title="FAQ" heTitle="שאלות נפוצות" />),
      (<BlockLink interfaceLink={true} target="/educators" title="Educators" heTitle="מחנכים" />),
      (<BlockLink interfaceLink={true} target="/team" title="Team" heTitle="צוות" />)
    ];
    learnContent = (<TwoOrThreeBox content={learnContent} width={width} />);

    var contributeContent = [
      (<BlockLink interfaceLink={true} target="/activity" title="Recent Activity" heTitle="פעילות אחרונה" />),
      (<BlockLink interfaceLink={true} target="/metrics" title="Metrics" heTitle="מדדים" />),
      (<BlockLink interfaceLink={true} target="/contribute" title="Contribute" heTitle="הצטרפות לעשיה" />),
      (<BlockLink interfaceLink={true} target="/donate" title="Donate" heTitle="תרומות" />),
      (<BlockLink interfaceLink={true} target="/supporters" title="Supporters" heTitle="תומכים" />),
      (<BlockLink interfaceLink={true} target="/jobs" title="Jobs" heTitle="דרושים" />),
    ];
    contributeContent = (<TwoOrThreeBox content={contributeContent} width={width} />);

    var connectContent = [
      (<BlockLink interfaceLink={true} target="https://groups.google.com/forum/?fromgroups#!forum/sefaria" title="Forum" heTitle="פורום" />),
      (<BlockLink interfaceLink={true} target="http://www.facebook.com/sefaria.org" title="Facebook" heTitle="פייסבוק" />),
      (<BlockLink interfaceLink={true} target="http://twitter.com/SefariaProject" title="Twitter" heTitle="טוויטר" />),
      (<BlockLink interfaceLink={true} target="http://www.youtube.com/user/SefariaProject" title="YouTube" heTitle="יוטיוב" />),
      (<BlockLink interfaceLink={true} target="http://www.github.com/Sefaria" title="GitHub" heTitle="גיטהאב" />),
      (<BlockLink interfaceLink={true} target="mailto:hello@sefaria.org" title="Email" heTitle='אימייל' />)
    ];
    connectContent = (<TwoOrThreeBox content={connectContent} width={width} />);

    var footer =  (<footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
                    <Footer />
                    </footer> );

    var classes = {accountPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: 1 };
    var classStr = classNames(classes);
    return (
      <div className={classStr}>
        <div className="content hasFooter">
          <div className="contentInner">
            <h1>
              <span className="int-en">Account</span>
              <span className="int-he">חשבון משתמש</span>
            </h1>
           <ReaderNavigationMenuSection content={accountContent} />
           <ReaderNavigationMenuSection title="Learn" heTitle="לימוד" content={learnContent} />
           <ReaderNavigationMenuSection title="Contribute" heTitle="עשייה" content={contributeContent} />
           <ReaderNavigationMenuSection title="Connect" heTitle="התחברות" content={connectContent} />
          </div>
            {footer}
        </div>
      </div>
      );
  }
});


var NotificationsPanel = React.createClass({
  propTypes: {
    setUnreadNotificationsCount: React.PropTypes.func.isRequired,
    interfaceLang:               React.PropTypes.string,
  },
  getInitialState: function() {
    return {
      page: 1,
      loadedToEnd: false,
      loading: false
    };
  },
  componentDidMount: function() {
    $(ReactDOM.findDOMNode(this)).find(".content").bind("scroll", this.handleScroll);
    this.markAsRead();
  },
  componentDidUpdate: function() {
    this.markAsRead();
  },
  handleScroll: function() {
    if (this.state.loadedToEnd || this.state.loading) { return; }
    var $scrollable = $(ReactDOM.findDOMNode(this)).find(".content");
    var margin = 100;
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this.getMoreNotifications();
    }
  },
  markAsRead: function() {
    // Marks each notification that is loaded into the page as read via API call
    var ids = [];
    $(".notification.unread").not(".marked").each(function() {
      ids.push($(this).attr("data-id"));
    });
    if (ids.length) {
      $.post("/api/notifications/read", {notifications: JSON.stringify(ids)}, function(data) {
        $(".notification.unread").addClass("marked");
        this.props.setUnreadNotificationsCount(data.unreadCount);
      }.bind(this));
    }
  },
  getMoreNotifications: function() {
    $.getJSON("/api/notifications?page=" + this.state.page, this.loadMoreNotifications);
    this.setState({loading: true});
  },
  loadMoreNotifications: function(data) {
    if (data.count < data.page_size) {
      this.setState({loadedToEnd: true});
    } 
    Sefaria.notificationsHtml += data.html;
    this.setState({page: data.page + 1, loading: false});
    this.forceUpdate();
  },
  render: function() {
    var classes = {notificationsPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: 1 };
    var classStr = classNames(classes);
    return (
      <div className={classStr}>
        <div className="content hasFooter">
          <div className="contentInner">
            <h1>
              <span className="int-en">Notifications</span>
              <span className="int-he">התראות</span>
            </h1>
            { Sefaria.loggedIn ? 
              (<div className="notificationsList" dangerouslySetInnerHTML={ {__html: Sefaria.notificationsHtml } }></div>) :
              (<LoginPanel fullPanel={true} />) }
          </div>
          <footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
                    <Footer />
                    </footer>
        </div>
      </div>);
  }
});


var ModeratorToolsPanel = React.createClass({
  propTypes: {
    interfaceLang: React.PropTypes.string
  },
  getInitialState: function () {
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
  handleFiles: function(event) {
    this.setState({files: event.target.files});
  },
  uploadFiles: function(event) {
    event.preventDefault();
    this.setState({uploading: true, uploadMessage:"Uploading..."});
    var formData = new FormData();
    for (var i = 0; i < this.state.files.length; i++) {
      var file = this.state.files[i];
      formData.append('texts[]', file, file.name);
    }
    $.ajax({
      url: "api/text-upload",
      type: 'POST',
      data: formData,
      success: function(data) {
        if (data.status == "ok") {
          this.setState({uploading: false, uploadMessage: data.message, uploadError: null, files:[]});
          $("#file-form").get(0).reset(); //Remove selected files from the file selector
        } else {
          this.setState({"uploadError": "Error - " + data.error, uploading: false, uploadMessage: data.message});
        }
      }.bind(this),
      error: function(xhr, status, err) {
        this.setState({"uploadError": "Error - " + err.toString(), uploading: false, uploadMessage: null});
      }.bind(this),
      cache: false,
      contentType: false,
      processData: false
    });
  },

  onDlTitleChange: function(event) {
    this.setState({bulk_title_pattern: event.target.value});
  },
  onDlVersionChange: function(event) {
    this.setState({bulk_version_title_pattern: event.target.value});
  },
  onDlLanguageSelect: function(event) {
    this.setState({bulk_language: event.target.value});
  },
  onDlFormatSelect: function(event) {
    this.setState({bulk_format: event.target.value});
  },
  bulkVersionDlLink: function() {
    var args = ["format","title_pattern","version_title_pattern","language"].map(
        arg => this.state["bulk_" + arg]?`${arg}=${encodeURIComponent(this.state["bulk_"+arg])}`:""
    ).filter(a => a).join("&");
    return "download/bulk/versions/?" + args;
  },

  render: function () {
    // Bulk Download
    var dlReady = (this.state.bulk_format && (this.state.bulk_title_pattern || this.state.bulk_version_title_pattern));
    var downloadButton = <div className="versionDownloadButton">
        <div className="downloadButtonInner">
          <span className="int-en">Download</span>
          <span className="int-he">הורדה</span>
        </div>
      </div>;
    var downloadSection = (
      <div className="modToolsSection dlSection">
        <div className="dlSectionTitle">
          <span className="int-en">Bulk Download Text</span>
          <span className="int-he">הורדת הטקסט</span>
        </div>
        <input className="dlVersionSelect" type="text" placeholder="Index Title Pattern" onChange={this.onDlTitleChange} />
        <input className="dlVersionSelect" type="text" placeholder="Version Title Pattern" onChange={this.onDlVersionChange}/>
        <select className="dlVersionSelect dlVersionLanguageSelect" value={this.state.bulk_language || ""} onChange={this.onDlLanguageSelect}>
          <option disabled>Language</option>
          <option key="all" value="" >Hebrew & English</option>
          <option key="he" value="he" >Hebrew</option>
          <option key="en" value="en" >English</option>
        </select>
        <select className="dlVersionSelect dlVersionFormatSelect" value={this.state.bulk_format || ""} onChange={this.onDlFormatSelect}>
          <option disabled>File Format</option>
          <option key="txt" value="txt" >Text</option>
          <option key="csv" value="csv" >CSV</option>
          <option key="json" value="json" >JSON</option>
        </select>
        {dlReady?<a href={this.bulkVersionDlLink()} download>{downloadButton}</a>:downloadButton}
      </div>);

    // Uploading
    var ulReady = (!this.state.uploading) && this.state.files.length > 0;
    var uploadButton = <a><div className="versionDownloadButton" onClick={this.uploadFiles}><div className="downloadButtonInner">
       <span className="int-en">Upload</span>
       <span className="int-he">העלאה</span>
      </div></div></a>;
    var uploadForm = (
      <div className="modToolsSection">
        <div className="dlSectionTitle">
          <span className="int-en">Bulk Upload CSV</span>
          <span className="int-he">הורדת הטקסט</span>
        </div>
         <form id="file-form">
           <input className="dlVersionSelect" type="file" id="file-select"  multiple onChange={this.handleFiles}/>
           {ulReady?uploadButton:""}
         </form>
        {this.state.uploadMessage?<div class="message">{this.state.uploadMessage}</div>:""}
        {this.state.uploadError?<div class="error">{this.state.uploadError}</div>:""}
      </div>);

    return (Sefaria.is_moderator)?<div className="modTools">{downloadSection}{uploadForm}</div>:<div>Tools are only available to logged in moderators.</div>;
  }
});

var UpdatesPanel = React.createClass({
  propTypes: {
    interfaceLang:               React.PropTypes.string
  },
  getInitialState: function() {
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
  componentDidMount: function() {
    $(ReactDOM.findDOMNode(this)).find(".content").bind("scroll", this.handleScroll);
    this.getMoreNotifications();
  },
  handleScroll: function() {
    if (this.state.loadedToEnd || this.state.loading) { return; }
    var $scrollable = $(ReactDOM.findDOMNode(this)).find(".content");
    var margin = 100;
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this.getMoreNotifications();
    }
  },
  getMoreNotifications: function() {
    $.getJSON("/api/updates?page=" + this.state.page, this.loadMoreNotifications);
    this.setState({loading: true});
  },
  loadMoreNotifications: function(data) {
    if (data.count < data.page_size) {
      this.setState({loadedToEnd: true});
    }
    this.setState({page: data.page + 1, loading: false, updates: this.state.updates.concat(data.updates)});
  },
  onDelete: function(id) {
    $.ajax({
        url: '/api/updates/' + id,
        type: 'DELETE',
        success: function(result) {
          if (result.status == "ok") {
              this.setState({updates: this.state.updates.filter(u => u._id != id)});
          }
        }.bind(this)
    });
  },

  handleSubmit: function(type, content) {
    this.setState({"submitting": true, "error": null});
    var payload = {
      type: type,
      content: content
    };
    $.ajax({
      url: "/api/updates",
      dataType: 'json',
      type: 'POST',
      data: {json: JSON.stringify(payload)},
      success: function(data) {
        if (data.status == "ok") {
          payload.date = Date();
          this.state.updates.unshift(payload);
          this.setState({submitting: false, updates: this.state.updates, submitCount: this.state.submitCount + 1});
        } else {
          this.setState({"error": "Error - " + data.error});
        }
      }.bind(this),
      error: function(xhr, status, err) {
        this.setState({"error": "Error - " + err.toString()});
        console.error(this.props.url, status, err.toString());
      }.bind(this)
    });
  },

  render: function() {
    var classes = {notificationsPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: 1 };
    var classStr = classNames(classes);

    return (
      <div className={classStr}>
        <div className="content hasFooter">
          <div className="contentInner">
            <h1>
              <span className="int-en">Updates</span>
              <span className="int-he">עדכונים</span>
            </h1>

            {Sefaria.is_moderator?<NewUpdateForm handleSubmit={this.handleSubmit} key={this.state.submitCount} error={this.state.error}/>:""}

            <div className="notificationsList">
            {this.state.updates.map(u =>
                <SingleUpdate
                    type={u.type}
                    content={u.content}
                    date={u.date}
                    key={u._id}
                    id={u._id}
                    onDelete={this.onDelete}
                    submitting={this.state.submitting}
                />
            )}
            </div>
          </div>
          <footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
                    <Footer />
                    </footer>
        </div>
      </div>);
  }
});

var NewUpdateForm = React.createClass({
  propTypes: {
    error:               React.PropTypes.string,
    handleSubmit:        React.PropTypes.func
  },
  getInitialState: function() {
    return {type: 'index', index: '', language: 'en', version: '', en: '', he: '', error: ''};
  },
  componentWillReceiveProps(nextProps) {
    this.setState({"error": nextProps.error});
  },
  handleEnChange: function(e) {
    this.setState({en: e.target.value, error: null});
  },
  handleHeChange: function(e) {
    this.setState({he: e.target.value, error: null});
  },
  handleTypeChange: function(e) {
    this.setState({type: e.target.value, error: null});
  },
  handleIndexChange: function(e) {
    this.setState({index: e.target.value, error: null});
  },
  handleVersionChange: function(e) {
    this.setState({version: e.target.value, error: null});
  },
  handleLanguageChange: function(e) {
    this.setState({language: e.target.value, error: null});
  },
  handleSubmit: function(e) {
    e.preventDefault();
    var content = {
      "en": this.state.en.trim(),
      "he": this.state.he.trim()
    };
    if (this.state.type == "general") {
      if (!this.state.en || !this.state.he) {
        this.setState({"error": "Both Hebrew and English are required"});
        return;
      }
    } else {
      if (!this.state.index) {
        this.setState({"error": "Index is required"});
        return;
      }
      content["index"] = this.state.index.trim();
    }
    if (this.state.type == "version") {
      if (!this.state.version || !this.state.language) {
        this.setState({"error": "Version is required"});
        return;
      }
      content["version"] = this.state.version.trim();
      content["language"] = this.state.language.trim();
    }
    this.props.handleSubmit(this.state.type, content);

  },
  render: function() {
    return (
      <form className="globalUpdateForm" onSubmit={this.handleSubmit}>
        <div>
          <input type="radio" name="type" value="index" onChange={this.handleTypeChange} checked={this.state.type=="index"}/>Index&nbsp;&nbsp;
          <input type="radio" name="type" value="version" onChange={this.handleTypeChange} checked={this.state.type=="version"}/>Version&nbsp;&nbsp;
          <input type="radio" name="type" value="general" onChange={this.handleTypeChange} checked={this.state.type=="general"}/>General&nbsp;&nbsp;
        </div>
        <div>
          {(this.state.type != "general")?<input type="text" placeholder="Index Title" onChange={this.handleIndexChange} />:""}
          {(this.state.type == "version")?<input type="text" placeholder="Version Title" onChange={this.handleVersionChange}/>:""}
          {(this.state.type == "version")?<select type="text" placeholder="Version Language" onChange={this.handleLanguageChange}>
            <option value="en">English</option>
            <option value="he">Hebrew</option>
          </select>:""}
        </div>
        <div>
          <textarea
            placeholder="English Description (optional for Index and Version)"
            onChange={this.handleEnChange}
            rows="3"
            cols="80"
          />
        </div>
        <div>
          <textarea
            placeholder="Hebrew Description (optional for Index and Version)"
            onChange={this.handleHeChange}
            rows="3"
            cols="80"
          />
        </div>
        <input type="submit" value="Submit" disabled={this.props.submitting}/>
        <span className="error">{this.state.error}</span>
      </form>
    );
  }
});

var SingleUpdate = React.createClass({
  propTypes: {
    id:         React.PropTypes.string,
    type:         React.PropTypes.string,
    content:      React.PropTypes.object,
    onDelete:     React.PropTypes.func,
    date:         React.PropTypes.string
  },
  onDelete: function() {
    this.props.onDelete(this.props.id);
  },
  render: function() {
    var title = this.props.content.index;
    if (title) {
      var heTitle = Sefaria.index(title)?Sefaria.index(title).heTitle:"";
    }

    var url = Sefaria.ref(title)?"/" + Sefaria.normRef(Sefaria.ref(title).book):"/" + Sefaria.normRef(title);

    var d = new Date(this.props.date);

    return (
      <div className="notification">
        <div className="date">
          <span className="int-en">{d.toLocaleDateString("en")}</span>
          <span className="int-he">{d.toLocaleDateString("he")}</span>
          {Sefaria.is_moderator?<i className="fa fa-times-circle delete-update-button" onClick={this.onDelete} aria-hidden="true"/>:""}
        </div>

        {this.props.type == "index"?
        <div>
            <span className="int-en">New Text: <a href={url}>{title}</a></span>
            <span className="int-he">טקסט חדש זמין: <a href={url}>{heTitle}</a></span>
        </div>
        :""}

        {this.props.type == "version"?
        <div>
            <span className="int-en">New { this.props.content.language == "en"?"English":"Hebrew"} version of <a href={url}>{title}</a>: {this.props.content.version}</span>
            <span className="int-he">גרסה חדשה של <a href={url}>{heTitle}</a> ב{ this.props.content.language == "en"?"אנגלית":"עברית"} : {this.props.content.version}</span>
        </div>
        :""}

        <div>
            <span className="int-en" dangerouslySetInnerHTML={ {__html: this.props.content.en } } />
            <span className="int-he" dangerouslySetInnerHTML={ {__html: this.props.content.he } } />
        </div>


      </div>);
  }
});


var InterruptingMessage = React.createClass({
  propTypes: {
    messageName:  React.PropTypes.string.isRequired,
    messageHTML:  React.PropTypes.string.isRequired,
    onClose:      React.PropTypes.func.isRequired
  },
  componentDidMount: function() {
    $("#interruptingMessage .button").click(this.close);
  },
  close: function() {
    this.markAsRead();
    this.props.onClose();
  },
  markAsRead: function() {
    Sefaria._api("/api/interrupting-messages/read/" + this.props.messageName, function(data) {});
    cookie(this.props.messageName, true, {"path": "/"});
    Sefaria.site.track.event("Interrupting Message", "read", this.props.messageName,  {nonInteraction: true});
    Sefaria.interruptingMessage = null;
  },
  render: function() {
    return (<div className="interruptingMessageBox">
              <div className="overlay" onClick={this.close}></div>
              <div id="interruptingMessage">
                  <div id="interruptingMessageClose" onClick={this.close}>×</div>
                  <div id="interruptingMessageContent" dangerouslySetInnerHTML={ {__html: this.props.messageHTML} }></div>
              </div>
            </div>);
  }
});

var ThreeBox = React.createClass({
  // Wrap a list of elements into a three column table
  render: function() {
      var content = this.props.content;
      var length = content.length;
      if (length % 3) {
          length += (3-length%3);
      }
      content.pad(length, "");
      var threes = [];
      for (var i=0; i<length; i+=3) {
        threes.push([content[i], content[i+1], content[i+2]]);
      }
      return (
        <table className="gridBox threeBox">
          <tbody>
          { 
            threes.map(function(row, i) {
              return (
                <tr key={i}>
                  {row[0] ? (<td>{row[0]}</td>) : null}
                  {row[1] ? (<td>{row[1]}</td>) : null}
                  {row[2] ? (<td>{row[2]}</td>) : null}
                </tr>
              );
            })
          }
          </tbody>
        </table>
      );
  }
});


var TwoBox = React.createClass({
  // Wrap a list of elements into a three column table
  propTypes: {
    content: React.PropTypes.array.isRequired
  },
  render: function() {
      var content = this.props.content;
      var length = content.length;
      if (length % 2) {
          length += (2-length%2);
      }
      content.pad(length, "");
      var twos = [];
      for (var i=0; i<length; i+=2) {
        twos.push([content[i], content[i+1]]);
      }
      return (
        <table className="gridBox twoBox">
          <tbody>
          { 
            twos.map(function(row, i) {
              return (
                <tr key={i}>
                  {row[0] ? (<td>{row[0]}</td>) : <td className="empty"></td>}
                  {row[1] ? (<td>{row[1]}</td>) : <td className="empty"></td>}
                </tr>
              );
            })
          }
          </tbody>
        </table>
      );
  }
});


var TwoOrThreeBox = React.createClass({
  // Wrap a list of elements into a two or three column table, depending on window width
  propTypes: {
    content:    React.PropTypes.array.isRequired,
    width:      React.PropTypes.number.isRequired,
    threshhold: React.PropTypes.number
  },
  render: function() {
      var threshhold = this.props.threshhold || 450;
      if (this.props.width > threshhold) {
        return (<ThreeBox content={this.props.content} />);
      } else {
        return (<TwoBox content={this.props.content} />);
      }
  }
});


var LoadingMessage = React.createClass({
  propTypes: {
    message:   React.PropTypes.string,
    heMessage: React.PropTypes.string,
    className: React.PropTypes.string
  },
  render: function() {
    var message = this.props.message || "Loading...";
    var heMessage = this.props.heMessage || "טוען מידע...";
    var classes = "loadingMessage " + (this.props.className || "");
    return (<div className={classes}>
              <span className="int-en">{message}</span>
              <span className="int-he">{heMessage}</span>
            </div>);
  }
});


var TestMessage = React.createClass({
  // Modal explaining development status with links to send feedback or go back to the old site
  propTypes: {
    hide:   React.PropTypes.func
  },
  render: function() {
    return (
      <div className="testMessageBox">
        <div className="overlay" onClick={this.props.hide} ></div>
        <div className="testMessage">
          <div className="title">The new Sefaria is still in development.<br />Thank you for helping us test and improve it.</div>
          <a href="mailto:hello@sefaria.org" target="_blank" className="button">Send Feedback</a>
          <div className="button" onClick={backToS1} >Return to Old Sefaria</div>
        </div>
      </div>);
  }
});


var Footer = React.createClass({
  render: function(){
    var currentPath = Sefaria.util.currentPath();
    var next = encodeURIComponent(currentPath);
    return (
        <div id="footerInner">
          <div className="section">

              <div className="header">
                  <span className="int-en">About</span>
                  <span className="int-he">אודות</span>
              </div>
              <a href="/about" className="outOfAppLink">
                  <span className="int-en">What is Sefaria?</span>
                  <span className="int-he">מהי ספאריה</span>
              </a>
              <a href="/help" className="outOfAppLink">
                  <span className="int-en">Help</span>
                  <span className="int-he">עזרה</span>
              </a>
              <a href="https://blog.sefaria.org" target="_blank" className="outOfAppLink">
                  <span className="int-en">Blog</span>
                  <span className="int-he">בלוג</span>
              </a>
              <a href="/faq" target="_blank" className="outOfAppLink">
                  <span className="int-en">FAQ</span>
                  <span className="int-he">שאלות נפוצות</span>
              </a>
              <a href="/team" className="outOfAppLink">
                  <span className="int-en">Team</span>
                  <span className="int-he">צוות</span>
              </a>
              <a href="/terms" className="outOfAppLink">
                  <span className="int-en">Terms of Use</span>
                  <span className="int-he">תנאי שימוש</span>
              </a>
              <a href="/privacy-policy" className="outOfAppLink">
                  <span className="int-en">Privacy Policy</span>
                  <span className="int-he">מדיניות הפרטיות</span>
              </a>
          </div>

          <div className="section">
              <div className="header">
                      <span className="int-en">Educators</span>
                      <span className="int-he">מחנכים</span>
              </div>
              <a href="/educators" target="_blank" className="outOfAppLink">
                  <span className="int-en">Teach with Sefaria</span>
                  <span className="int-he">למד באמצעות ספאריה</span>
              </a>
              <a href="/sheets" className="outOfAppLink">
                  <span className="int-en">Source Sheets</span>
                  <span className="int-he">דפי מקורות</span>
              </a>
              <a href="/visualizations" className="outOfAppLink">
                  <span className="int-en">Visualizations</span>
                  <span className="int-he">עזרים חזותיים</span>
              </a>
              <a href="/people" className="outOfAppLink">
                  <span className="int-en">Authors</span>
                  <span className="int-he">מחברים</span>
              </a>
              <a href="/updates" className="outOfAppLink">
                  <span className="int-en">New Additions</span>
                  <span className="int-he">מה חדש</span>
              </a>
          </div>

          <div className="section">
              <div className="header">
                  <span className="int-en">Developers</span>
                  <span className="int-he">מפתחים</span>
              </div>
              <a href="/developers" target="_blank" className="outOfAppLink">
                  <span className="int-en">Get Involved</span>
                  <span className="int-he">הצטרף אלינו</span>
              </a>
              <a href="/developers#api" target="_blank" className="outOfAppLink">
                  <span className="int-en">API Docs</span>
                  <span className="int-he">מסמכי API</span>
              </a>
              <a href="https://github.com/Sefaria/Sefaria-Project" target="_blank" className="outOfAppLink">
                  <span className="int-en">Fork us on GitHub</span>
                  <span className="int-he">זלגו חופשי מגיטהאב</span>
              </a>
              <a href="https://github.com/Sefaria/Sefaria-Export" target="_blank" className="outOfAppLink">
                  <span className="int-en">Download our Data</span>
                  <span className="int-he">הורד את בסיס הנתונים שלנו</span>
              </a>
          </div>

          <div className="section">
              <div className="header">
                  <span className="int-en">Join Us</span>
                  <span className="int-he">הצטרף אלינו</span>
              </div>
              <a href="/donate" className="outOfAppLink">
                  <span className="int-en">Donate</span>
                  <span className="int-he">תרומות</span>
              </a>
              <a href="/supporters" className="outOfAppLink">
                  <span className="int-en">Supporters</span>
                  <span className="int-he">תומכים</span>
              </a>
              <a href="/contribute" target="_blank" className="outOfAppLink">
                  <span className="int-en">Contribute</span>
                  <span className="int-he">הצטרף</span>
              </a>
              <a href="/jobs" className="outOfAppLink">
                  <span className="int-en">Jobs</span>
                  <span className="int-he">דרושים</span>
              </a>
          </div>

          <div className="section last">
              <div className="header">
                  <span className="int-en">Connect</span>
                  <span className="int-he">התחבר</span>
              </div>
              <a href="http://www.facebook.com/sefaria.org" target="_blank" className="outOfAppLink">
                  <i className="fa fa-facebook-official"></i>
                  <span className="int-en">Facebook</span>
                  <span className="int-he">פייסבוק</span>

              </a>
              <a href="http://twitter.com/SefariaProject" target="_blank" className="outOfAppLink">
                  <i className="fa fa-twitter"></i>
                  <span className="int-en">Twitter</span>
                  <span className="int-he">טוויטר</span>

              </a>
              <a href="http://www.youtube.com/user/SefariaProject" target="_blank" className="outOfAppLink">
                  <i className="fa fa-youtube"></i>
                  <span className="int-en">YouTube</span>
                  <span className="int-he">יוטיוב</span>

              </a>
              <a href="https://groups.google.com/forum/?fromgroups#!forum/sefaria" target="_blank" className="outOfAppLink">
                  <span className="int-en">Forum</span>
                  <span className="int-he">פורום</span>

              </a>
              <a href="mailto:hello@sefaria.org" target="_blank" className="outOfAppLink">
                  <span className="int-en">Email</span>
                  <span className="int-he">דוא"ל</span>
              </a>
              <div id="siteLanguageToggle">
                  <div id="siteLanguageToggleLabel">
                      <span className="int-en">Site Language:</span>
                      <span className="int-he">שפת האתר</span>
                  </div>
                  <a href={"/interface/english?next=" + next} id="siteLanguageEnglish" className="outOfAppLink">English</a>
                  |
                  <a href={"/interface/hebrew?next=" + next} id="siteLanguageHebrew" className="outOfAppLink">עברית</a>
              </div>
          </div>
        </div>
    );
  }
});


var openInNewTab = function(url) {
  var win = window.open(url, '_blank');
  win.focus();
};


var backToS1 = function() { 
  cookie("s2", "", {path: "/"});
  window.location = "/";
};


var setData = function(data) {
  // Set core data in the module that was loaded in a different scope
  Sefaria.toc       = data.toc;
  Sefaria.books     = data.books;
  Sefaria.calendar  = data.calendar;
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
  exports.ReaderApp           = ReaderApp;
  exports.ReaderPanel         = ReaderPanel;
  exports.ConnectionsPanel    = ConnectionsPanel;
  exports.TextRange           = TextRange;
  exports.TextColumn          = TextColumn;
  exports.Footer              = Footer;
  exports.setData             = setData;
  exports.unpackDataFromProps = Sefaria.unpackDataFromProps;
}