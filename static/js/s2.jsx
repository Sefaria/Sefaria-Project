if (require) {
  var React    = require('react');
  var ReactDOM = require('react-dom');
  sjs = {library: require('./library.js')}
  // Include utils.js with this hack because it has so many spaghetti methods
  // and extra methods on built-in types.
  var read = function(f) { return fs.readFileSync(f).toString(); }
  var include = function(f) { eval.apply(global, [read(f)]); }
  console.log("util.js");
  console.log(read('../static/js/util.js'));
  include('../static/js/util.js');
}


var ReaderApp = React.createClass({
  propTypes: {
    multiPanel:                  React.PropTypes.bool,
    headerMode:                  React.PropTypes.bool,  // is S2 serving only as a header on top of another page?
    initialRefs:                 React.PropTypes.array,
    initialFilter:               React.PropTypes.array,
    initialMenu:                 React.PropTypes.string,
    initialQuery:                React.PropTypes.string,
    initialSearchFilters:        React.PropTypes.array,
    initialSheetsTag:            React.PropTypes.string,
    initialNavigationCategories: React.PropTypes.array,
    initialSettings:             React.PropTypes.object,
    initialPanels:               React.PropTypes.array,
    initialDefaultVersions:      React.PropTypes.object 
  },
  getInitialState: function() {
    // TODO clean up generation of initial panels objects. 
    // Currently these get generated in reader/views.py, then regenerated in s2.html then regenerated again in ReaderApp.
    var panels               = [];
    var header               = {};
    var defaultVersions      = clone(this.props.initialDefaultVersions) || {};
    var defaultPanelSettings = clone(this.props.initialSettings);

    if (!this.props.multiPanel && !this.props.headerMode) {
      var mode = this.props.initialFilter ? "TextAndConnections" : "Text";
      panels[0] = {
        refs: this.props.initialRefs,
        mode: mode,
        filter: this.props.initialFilter,
        menuOpen: this.props.initialMenu,
        version: this.props.initialPanels.length ? this.props.initialPanels[0].version : null,
        versionLanguage: this.props.initialPanels.length ? this.props.initialPanels[0].versionLanguage : null,
        searchQuery: this.props.initialQuery,
        appliedSearchFilters: this.props.initialSearchFilters,
        settings: clone(defaultPanelSettings)
      };
      if (panels[0].versionLanguage) {
        panels[0].settings.language = (panels[0].versionLanguage == "he")? "hebrew": "english";
      }
      if (mode === "TextAndConnections") {
        panels[0].highlightedRefs = this.props.initialRefs;
      }
    } else {
      // this.props.multiPanel || this.props.headerMode
      var headerState = {
                    mode: "Header",
                    refs: this.props.initialRefs,
                    menuOpen: this.props.initialMenu,
                    searchQuery: this.props.initialQuery,
                    appliedSearchFilters: this.props.initialSearchFilters,
                    navigationCategories: this.props.initialNavigationCategories,
                    sheetsTag: this.props.initialSheetsTag,
                    settings: clone(defaultPanelSettings)
      };
      header = this.makePanelState(headerState);
      if (this.props.initialRefs.length) {
        var p = {
          refs: this.props.initialRefs,
          mode: "Text",
          menuOpen: this.props.initialPanels[0].menuOpen,
          version: this.props.initialPanels.length ? this.props.initialPanels[0].version : null,
          versionLanguage: this.props.initialPanels.length ? this.props.initialPanels[0].versionLanguage : null,
          settings: clone(defaultPanelSettings)
        };
        if (p.versionLanguage) {
          p.settings.language = (p.versionLanguage == "he") ? "hebrew" : "english";
        }
        panels.push(p);
        if (this.props.initialFilter) {
          panels.push({
            refs: this.props.initialRefs,
            filter: this.props.initialFilter,
            mode: "Connections",
            settings: clone(defaultPanelSettings)
          });
        }
        for (var i = panels.length; i < this.props.initialPanels.length; i++) {
          var panel = this.clonePanel(this.props.initialPanels[i]);
          panel.settings = clone(defaultPanelSettings);
          if (panel.versionLanguage) {
            panel.settings.language = (panel.versionLanguage == "he") ? "hebrew" : "english";
          }
          panels.push(panel);
        }
      }
    }
    panels = panels.map(function(panel) { 
      return this.makePanelState(panel); 
    }.bind(this) );

    var layoutOrientation = "ltr";
    if ((panels.length > 0 && panels[0].settings.language == "hebrew")
       || (header.settings && header.settings.language == "hebrew")) {
      layoutOrientation = "rtl";
    }

    return {
      panels: panels,
      header: header,
      defaultVersions: defaultVersions,
      defaultPanelSettings: defaultPanelSettings,
      layoutOrientation: layoutOrientation
    };
  },
  componentDidMount: function() {
    this.updateHistoryState(true); // make sure initial page state is in history, (passing true to replace)
    window.addEventListener("popstate", this.handlePopState);
    window.addEventListener("beforeunload", this.saveOpenPanelsToRecentlyViewed);
   
    // Set S2 cookie, putting user into S2 mode site wide
    $.cookie("s2", true, {path: "/"});
  },
  componentWillUnmount: function() {
    window.removeEventListener("popstate", this.handlePopState);
  },
  componentWillUpdate: function(nextProps, nextState) {
  },
  componentDidUpdate: function(prevProps, prevState) {
    if (this.justPopped) {
      //console.log("Skipping history update - just popped")
      this.justPopped = false;
      return;
    }
    // Central State TODO 
    // - carry panel language change to dependent panel

    this.setContainerMode();
    this.updateHistoryState(this.replaceHistory);
  },
  handlePopState: function(event) {
    var state = event.state;
    console.log("Pop - " + window.location.pathname);
    console.log(state);
    if (state) {
      var kind = "";
      sjs.track.event("Reader", "Pop State", kind);
      this.justPopped = true;
      this.setState(state);
    }
  },
  shouldHistoryUpdate: function() {
    // Compare the current state to the state last pushed to history,
    // Return true if the change warrants pushing to history.
    // If there's no history or the number or basic state of panels has changed
    if (!history.state
        || (!history.state.panels && !history.state.header)
        || (history.state.panels && (history.state.panels.length !== this.state.panels.length))
        || (history.state.header && (history.state.header.menuOpen !== this.state.header.menuOpen))
      ) {
      return true; 
    }

    if (this.props.multiPanel) {
      var prevPanels = [history.state.header];
      var nextPanels = [this.state.header];
    } else {
      var prevPanels = history.state.panels;
      var nextPanels = this.state.panels; 
    }

    for (var i = 0; i < prevPanels.length; i++) {
      // Cycle through each panel, compare previous state to next state, looking for differences
      var prev  = prevPanels[i];
      var next  = nextPanels[i];

      if (!prev || ! next) { return true; }

      if ((prev.mode !== next.mode) ||
          (prev.menuOpen !== next.menuOpen) ||
          (next.mode === "Text" && prev.refs.slice(-1)[0] !== next.refs.slice(-1)[0]) || 
          (next.mode === "TextAndConnections" && prev.highlightedRefs.slice(-1)[0] !== next.highlightedRefs.slice(-1)[0]) || 
          ((next.mode === "Connections" || next.mode === "TextAndConnections") && prev.filter && !prev.filter.compare(next.filter)) ||
          (next.mode === "Connections" && !prev.refs.compare(next.refs)) ||
          (prev.navigationSheetTag !== next.navigationSheetTag) ||
          (prev.version !== next.version) ||
          (prev.versionLanguage !== next.versionLanguage) ||
          (prev.searchQuery != next.searchQuery) ||
          (prev.appliedSearchFilters.length !== next.appliedSearchFilters.length) ||
          (!(prev.appliedSearchFilters.compare(next.appliedSearchFilters))))
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
      var newPanel = (trimFilters) ? clone(panel) : $.extend(clone(panel), savedAttributes);
      $.extend(panel, savedAttributes);
      return newPanel;
    } else {
      return clone(panel);
    }
  },
  makeHistoryState: function() {
    // Returns an object with state, title and url params for the current state
    var histories = [];
    // When the header has a panel open, only look at its content for history
    var headerMode = this.state.header.menuOpen || (!this.state.panels.length && this.state.header.mode === "Header");
    var panels = headerMode ? [this.state.header] : this.state.panels;
    var states = [];
    for (var i = 0; i < panels.length; i++) {
      // Walk through each panel, create a history object as though for this panel alone
      states[i] = this.clonePanel(panels[i], true);
      if (!states[i]) { debugger }
      var hist  = {url: ""};
    
      if (states[i].menuOpen) {
        switch (states[i].menuOpen) {
          case "home":
            hist.title = "Sefaria: a Living Library of Jewish Texts Online";
            hist.url   = "";
            hist.mode  = "home";
            break;
          case "navigation":
            var cats   = states[i].navigationCategories ? states[i].navigationCategories.join("/") : "";
            hist.title = cats ? states[i].navigationCategories.join(", ") + " | Sefaria" : "Texts | Sefaria";
            hist.url   = "texts" + (cats ? "/" + cats : "");
            hist.mode  = "navigation";
            break;
          case "text toc":
            var ref    = states[i].refs.slice(-1)[0];
            var bookTitle  = ref ? parseRef(ref).book : "404";
            hist.title = bookTitle + " | Sefaria";
            hist.url   = bookTitle.replace(/ /g, "_");
            hist.mode  = "text toc";
            break;
          case "search":
            hist.title = states[i].searchQuery ? states[i].searchQuery + " | " : "";
            hist.title += "Sefaria Search";
            hist.url   = "search" + (states[i].searchQuery ? "&q=" + states[i].searchQuery + (!!states[i].appliedSearchFilters.length ? "&filters=" + states[i].appliedSearchFilters.join("|") : "") : "");
            hist.mode  = "search";
            break;
          case "sheets":
            if (states[i].navigationSheetTag) {
              hist.url   = "sheets/tags/" + states[i].navigationSheetTag;
              hist.title = states[i].navigationSheetTag + " | Sefaria Source Sheets";
              hist.mode  = "sheets tag";
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
        }
      } else if (states[i].mode === "Text") {
        //debugger;
        hist.title    = states[i].refs.slice(-1)[0];
        hist.url      = normRef(hist.title);
        hist.version  = states[i].version;
        hist.versionLanguage = states[i].versionLanguage;
        hist.mode     = "Text"
      } else if (states[i].mode === "Connections") {
        var ref     = states[i].refs.slice(-1)[0];
        hist.sources = states[i].filter.length ? states[i].filter.join("+") : "all";
        hist.title  = ref  + " with " + (hist.sources === "all" ? "Connections" : hist.sources);
        hist.url    = normRef(ref); // + "?with=" + sources;
        hist.mode   = "Connections"
      } else if (states[i].mode === "TextAndConnections") {
        var ref       = states[i].highlightedRefs.slice(-1)[0];
        hist.sources   = states[i].filter.length ? states[i].filter[0] : "all";
        hist.title    = ref  + " with " + (hist.sources === "all" ? "Connections" : hist.sources);
        hist.url      = normRef(ref); // + "?with=" + sources;
        hist.version  = states[i].version;
        hist.versionLanguage = states[i].versionLanguage;
        hist.mode     = "TextAndConnections"
      } else if (states[i].mode === "Header") {
        hist.title  = document.title;
        hist.url    = window.location.pathname.slice(1);
        hist.mode   = "Header"
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

    hist = (headerMode)
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
          hist.url += "&with=" + histories[1].sources;
          hist.title = histories[1].title;
        } else {
          var replacer = "&p" + i + "=";
          hist.url    = hist.url.replace(RegExp(replacer + ".*"), "");
          hist.url   += replacer + histories[i].url + "&w" + i + "=" + histories[i].sources; //.replace("with=", "with" + i + "=").replace("?", "&");
          hist.title += " & " + histories[i].title; // TODO this doesn't trim title properly
        }
      } else {
        var next    = "&p=" + histories[i].url;
        next        = next.replace("?", "&").replace(/=/g, (i+1) + "=");
        hist.url   += next;
        if(histories[i].versionLanguage && histories[i].version) {
          hist.url += "&l" + (i+1) + "=" + histories[i].versionLanguage + "&v" + (i+1) + "=" + histories[i].version.replace(/\s/g,"_");
        }
        hist.title += " & " + histories[i].title;

      }
    }
    hist.url = hist.url.replace(/&/, "?");

    return hist;
  },
  updateHistoryState: function(replace) {
    if (!this.shouldHistoryUpdate()) { 
      return; 
    }
    var hist = this.makeHistoryState();
    if (replace) {
      history.replaceState(hist.state, hist.title, hist.url);
      console.log("Replace History - " + hist.url);
      //console.log(hist);
    } else {
      if ((window.location.pathname + window.location.search) == hist.url) { return; } // Never push history with the same URL
      history.pushState(hist.state, hist.title, hist.url);
      console.log("Push History - " + hist.url);
      //console.log(hist);
    }

    $("title").html(hist.title);
    sjs.track.pageview(hist.url);
    this.replaceHistory = false;
  },
  makePanelState: function(state) {
    // Return a full representation of a single panel's state, given a partial representation in `state`
    if (!state.settings && !this.state) {debugger}
    var panel = {
      refs:                 state.refs || [], // array of ref strings
      mode:                 state.mode, // "Text", "TextAndConnections", "Connections"
      filter:               state.filter || [],
      connectionsMode:      state.connectionsMode || "Connections",
      version:              state.version || null,
      versionLanguage:      state.versionLanguage || null,
      highlightedRefs:      state.highlightedRefs || [],
      recentFilters:        state.filter || [],
      settings:             state.settings ? clone(state.settings): clone(this.state.defaultPanelSettings),
      menuOpen:             state.menuOpen || null, // "navigation", "text toc", "display", "search", "sheets", "home"
      navigationCategories: state.navigationCategories || [],
      navigationSheetTag:   state.sheetsTag || null,
      searchQuery:          state.searchQuery || null,
      appliedSearchFilters: state.appliedSearchFilters || [],
      searchFiltersValid:   state.searchFiltersValid   || false,
      availableFilters:     state.availableFilters     || [],
      filterRegistry:       state.filterRegistry       || {},
      orphanSearchFilters:  state.orphanSearchFilters  || [],
      displaySettingsOpen:  false
    };
    if (this.state && panel.refs.length && !panel.version) {
      var oRef = sjs.library.ref(panel.refs[0]);
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
  setContainerMode: function() {
    // Applies CSS classes to the React container so that S2 can function as a header only on top of another page.
    if (this.props.headerMode) {
      if (this.state.header.menuOpen || this.state.panels.length) {
        $("#s2").removeClass("headerOnly");
        $("body").css({overflow: "hidden"});
      } else {
        $("#s2").addClass("headerOnly");
        $("body").css({overflow: "hidden"});
      }
    }
  },
  handleNavigationClick: function(ref, version, versionLanguage, options) {
    //todo: support options.highlight, passed up from SearchTextResult.handleResultClick()
    this.saveOpenPanelsToRecentlyViewed();
    this.setState({
      panels: [this.makePanelState({refs: [ref], version: version, versionLanguage: versionLanguage, mode: "Text"})],
      header: {menuOpen: null}
    });
  },
  handleSegmentClick: function(n, ref) {
    // Handle a click on a text segment `ref` in from panel in position `n`
    // Update or add panel after this one to be a TextList
    this.setTextListHighlight(n, [ref]);
    this.openTextListAt(n+1, [ref]);
  },
  handleCitationClick: function(n, citationRef, textRef) {
    // Handle clicking on the citation `citationRef` which was found inside of `textRef` in panel `n`.
    this.openPanelAt(n, citationRef);
    this.setTextListHighlight(n, [textRef]);
  },
  handleRecentClick: function(pos, ref, version, versionLanguage) {
    // Click on an item in your Recently Viewed
    if (this.props.multiPanel) {
      this.openPanelAt(pos, ref, version, versionLanguage);
    } else {
      this.handleNavigationClick(ref, version, versionLanguage);
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
    var langChange  = state.settings && state.settings.language !== this.state.panels[n].settings.language;
    var next        = this.state.panels[n+1];
    if (langChange && next && next.mode === "Connections") {
        next.settings.language = state.settings.language;
    }

    this.state.panels[n] = $.extend(this.state.panels[n], state);
    this.setState({panels: this.state.panels});
  },
  selectVersion: function(n, versionName, versionLanguage) {
    // Set the version for panel `n`. 
    var panel = this.state.panels[n];
    if (versionName && versionLanguage) {
      panel.version = versionName;
      panel.versionLanguage = versionLanguage;
      panel.settings.language = (panel.versionLanguage == "he")? "hebrew": "english";

      var oRef = sjs.library.ref(panel.refs[0]);
      this.setCachedVersion(oRef.indexTitle, panel.versionLanguage, panel.version);

    } else {
      panel.version = null;
      panel.versionLanguage = null;
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
    this.state.header = $.extend(this.state.header, state);
    this.setState({header: this.state.header});
  },
  setDefaultOption: function(option, value) {
    if (value !== this.state.defaultPanelSettings[option]) {
      this.state.defaultPanelSettings[option] = value;
      this.setState(this.state);
    }
  },
  openPanelAt: function(n, ref, version, versionLanguage) {
    // Open a new panel after `n` with the new ref
    this.state.panels.splice(n+1, 0, this.makePanelState({refs: [ref], version: version, versionLanguage: versionLanguage, mode: "Text"}));
    this.setState({panels: this.state.panels, header: {menuOpen: null}});
  },
  openPanelAtEnd: function(ref, version, versionLanguage) {
    this.openPanelAt(this.state.panels.length+1, ref, version, versionLanguage);
  },
  openTextListAt: function(n, refs) {
    // Open a connections panel at position `n` for `refs`
    // Replace panel there if already a connections panel, otherwise splice new panel into position `n`
    // `refs` is an array of ref strings
    var panel = this.state.panels[n] || {};
    if (panel.mode === "Connections") {
      // what does "a new text" mean here?
      // Pretty sure this can be deleted -- was from a previous case where you could navigate in an individual panel.
      /*
      // If this is a new text reset the filter, otherwise keep the current filter
      var oref1 = parseRef(panel.refs.slice(-1)[0]);
      var oref2 = parseRef(refs.slice(-1)[0]);
      panel.filter = oref1.book === oref2.book ? panel.filter : [];      
      */
    } else {
      // No connctions panel is open yet, splice in a new one
      this.state.panels.splice(n, 0, {});
      panel = this.state.panels[n];
      panel.filter = [];
    }

    panel.refs           = refs;
    panel.menuOpen       = null;
    panel.mode           = panel.mode || "Connections";
    this.state.panels[n] = this.makePanelState(panel);
    this.setState({panels: this.state.panels});
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
  openComparePanel: function(n) {
    var comparePanel = this.makePanelState({
      menuOpen: "navigation"
    });
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
    if (state.panels.length == 0 && !this.props.headerMode) {
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
    var updates = {menuOpen: "search", searchQuery: query, searchFiltersValid:  false};
    if (this.props.multiPanel) {
      this.setHeaderState(updates);
    } else {
      this.setPanelState(0, updates);
    }
  },
  saveRecentlyViewed: function(panel, n) {
    if (panel.mode == "Connections" || !panel.refs.length) { return; }
    var ref  = panel.refs[0];
    var oRef = sjs.library.ref(ref);
    var json = $.cookie("recentlyViewed");
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
    $.cookie("recentlyViewed", JSON.stringify(recent), {path: "/"});
  },
  saveOpenPanelsToRecentlyViewed: function() {
    for (var i = this.state.panels.length-1; i >= 0; i--) {
      this.saveRecentlyViewed(this.state.panels[i], i);
    }
  },
  render: function() {
    var evenWidth = 100.0/this.state.panels.length;
    if (this.state.panels.length == 2 && this.state.panels[0].mode == "Text" && this.state.panels[1].mode == "Connections") {
      var widths = [60.0, 40.0];
    } else {
      var widths = this.state.panels.map(function(){ return evenWidth; });
    }

    var header = this.props.multiPanel || this.state.panels.length == 0 ? 
                  (<Header 
                    initialState={this.state.header}
                    setCentralState={this.setHeaderState}
                    onRefClick={this.handleNavigationClick}
                    onRecentClick={this.handleRecentClick}
                    setDefaultOption={this.setDefaultOption}
                    showLibrary={this.showLibrary}
                    showSearch={this.showSearch}
                    onQueryChange={this.updateQueryInHeader}
                    updateSearchFilter={this.updateSearchFilterInHeader}
                    registerAvailableFilters={this.updateAvailableFiltersInHeader}
                    headerMode={this.props.headerMode}
                    panelsOpen={this.state.panels.length} />) : null;

    var panels = [];
    for (var i = 0; i < this.state.panels.length; i++) {
      var panel                    = this.clonePanel(this.state.panels[i]);
      var offset                   = widths.reduce(function(prev, curr, index, arr) { return index < i ? prev+curr : prev}, 0);
      var width                    = widths[i];
      var style                    = (this.state.layoutOrientation=="ltr")?{width: width + "%", left: offset + "%"}:{width: width + "%", right: offset + "%"};
      var onSegmentClick           = this.props.multiPanel ? this.handleSegmentClick.bind(null, i) : null;
      var onCitationClick          = this.handleCitationClick.bind(null, i);
      var onTextListClick          = null; // this.openPanelAt.bind(null, i);
      var onOpenConnectionsClick   = this.openTextListAt.bind(null, i+1);
      var setTextListHightlight    = this.setTextListHighlight.bind(null, i);
      var openComparePanel         = this.openComparePanel.bind(null, i);
      var closePanel               = this.closePanel.bind(null, i);
      var setPanelState            = this.setPanelState.bind(null, i);
      var selectVersion            = this.selectVersion.bind(null, i);

      var ref   = panel.refs && panel.refs.length ? panel.refs[0] : null;
      var oref  = ref ? parseRef(ref) : null;
      var title = oref && oref.book ? oref.book : 0;
      // Keys must be constant as text scrolls, but changing as new panels open in new positions
      // Use a combination of the panel number and text title
      var key   = i + title;
      panels.push(<div className="readerPanelBox" style={style} key={key}>
                    <ReaderPanel 
                      initialState={panel}
                      setCentralState={setPanelState}
                      multiPanel={this.props.multiPanel}
                      onSegmentClick={onSegmentClick}
                      onCitationClick={onCitationClick}
                      onTextListClick={onTextListClick}
                      onSearchResultClick={this.handleNavigationClick}
                      onNavigationClick={this.handleNavigationClick}
                      onRecentClick={this.handleRecentClick}
                      onOpenConnectionsClick={onOpenConnectionsClick}
                      openComparePanel={openComparePanel}
                      setTextListHightlight={setTextListHightlight}
                      selectVersion={selectVersion}
                      setDefaultOption={this.setDefaultOption}
                      onQueryChange={this.updateQueryInPanel}
                      updateSearchFilter={this.updateSearchFilterInPanel}
                      registerAvailableFilters={this.updateAvailableFiltersInPanel}
                      closePanel={closePanel}
                      panelsOpen={this.state.panels.length}
                      masterPanelLanguage={panel.mode === "Connections" ? this.state.panels[i-1].settings.language : panel.settings.language}
                      layoutWidth={width} />
                  </div>);
    }

    var classes = classNames({readerApp: 1, multiPanel: this.props.multiPanel});
    return (<div className={classes}>
              {header}
              {panels}
            </div>);
  }
});


var Header = React.createClass({
  propTypes: {
    initialState:        React.PropTypes.object.isRequired,
    setCentralState:     React.PropTypes.func,
    onRefClick:          React.PropTypes.func,
    onRecentClick:       React.PropTypes.func,
    showLibrary:         React.PropTypes.func,
    showSearch:          React.PropTypes.func,
    setDefaultOption:    React.PropTypes.func,
    onQueryChange:       React.PropTypes.func,
    updateSearchFilter:  React.PropTypes.func,
    registerAvailableFilters: React.PropTypes.func,
    panelsOpen:          React.PropTypes.number
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
  initAutocomplete: function() {
    $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete({
      position: {my: "left-12 top+14", at: "left bottom"},
      source: function( request, response ) {
        var matches = $.map( sjs.books, function(tag) {
            if ( tag.toUpperCase().indexOf(request.term.toUpperCase()) === 0 ) {
              return tag;
            }
          });
        response(matches.slice(0, 16)); // limits return to 16 items
      }
    });
  },
  showDesktop: function() {
    if (this.props.panelsOpen == 0) {
      var json = $.cookie("recentlyViewed");
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
    this.props.showSearch(query);
    $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete("close");
  },
  showAccount: function() {
    this.props.setCentralState({menuOpen: "account"});
    this.clearSearchBox();
  },
  showNotifications: function() {
    this.props.setCentralState({menuOpen: "notifications"});
    this.clearSearchBox();
  },
  showTestMessage: function() {
    this.props.setCentralState({showTestMessage: true});
  },
  hideTestMessage: function() { 
    this.props.setCentralState({showTestMessage: false});
  },
  submitSearch: function(query, skipNormalization) {
    //window.location = "/search?q=" + query.replace(/ /g, "+");
    if (query in sjs.booksDict) {
      var index = sjs.library.index(query);
      if (index) {
        query = index.firstSection;
      } else if (!skipNormalization) {
        sjs.library.normalizeTitle(query, function(title) {
          this.submitSearch(title, true)
        }.bind(this));
        return;
      }
    }
    if (isRef(query)) {
      this.props.onRefClick(query);
      this.showDesktop();
      sjs.track.ui("Nav Query");
    } else {
      this.showSearch(query);
    }
  },
  clearSearchBox: function() {
    $(ReactDOM.findDOMNode(this)).find("input.search").val("").autocomplete("close");
  },
  handleLibraryClick: function() {
    if (this.state.menuOpen === "home") {
      return;
    } else if (this.state.menuOpen === "navigation" && this.state.navigationCategories.length == 0) {
      this.showDesktop();
    } else {
      this.showLibrary();
    }
  },
  handleRefClick: function(ref, version, versionLanguage) {
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
                          setCentralState={this.props.setCentralState}
                          multiPanel={true}
                          onNavTextClick={this.props.onRefClick}
                          onSearchResultClick={this.props.onRefClick}
                          onRecentClick={this.props.onRecentClick}
                          setDefaultLanguage={this.props.setDefaultLanguage}
                          onQueryChange={this.props.onQueryChange}
                          updateSearchFilter={this.props.updateSearchFilter}
                          registerAvailableFilters={this.props.registerAvailableFilters}
                          hideNavHeader={true} />) : null;


    var notifcationsClasses = classNames({notifications: 1, unread: sjs.notificationCount > 0});
    var currentPath = window.location.pathname + window.location.search;
    var signUpLink = (<a className="login" href={"/register?next=" + currentPath}>
                        <span className="en">Sign Up</span>
                        <span className="he">הירשם</span>
                       </a>);
    return (<div className="header">
              <div className="headerInner">
                <div className="left">
                  <div className="library" onClick={this.handleLibraryClick}><i className="fa fa-bars"></i></div>
                </div>
                <div className="right">
                  <div className="testWarning" onClick={this.showTestMessage} >Attention: You are testing the New Sefaria</div>
                  { sjs.loggedIn ? (<div className="account" onClick={this.showAccount}><img src="/static/img/user-64.png" /></div>) : null }
                  { sjs.loggedIn ? (<div className={notifcationsClasses} onClick={this.showNotifications}>{sjs.notificationCount}</div>) : null }
                  { sjs.loggedIn ? null : signUpLink }
                </div>
                <span className="searchBox">
                  <ReaderNavigationMenuSearchButton onClick={this.handleSearchButtonClick} />
                  <input className="search" placeholder="Search" onKeyUp={this.handleSearchKeyUp} />
                </span>
                <a className="home" href="/?home" ><img src="/static/img/sefaria-on-white.png" /></a>
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
    setCentralState:             React.PropTypes.func,
    onSegmentClick:              React.PropTypes.func,
    onCitationClick:             React.PropTypes.func,
    onTextListClick:             React.PropTypes.func,
    onNavTextClick:              React.PropTypes.func,
    onRecentClick:               React.PropTypes.func,
    onSearchResultClick:         React.PropTypes.func,
    onUpdate:                    React.PropTypes.func,
    closePanel:                  React.PropTypes.func,
    closeMenus:                  React.PropTypes.func,
    setDefaultLanguage:          React.PropTypes.func,
    selectVersion:               React.PropTypes.func,
    onQueryChange:               React.PropTypes.func,
    updateSearchFilter:          React.PropTypes.func,
    registerAvailableFilters:    React.PropTypes.func,
    openComparePanel:            React.PropTypes.func,
    highlightedRefs:             React.PropTypes.array,
    hideNavHeader:               React.PropTypes.bool,
    multiPanel:                  React.PropTypes.bool,
    masterPanelLanguage:         React.PropTypes.string,
    panelsOpen:                  React.PropTypes.number,
    layoutWidth:                 React.PropTypes.number
  },
  getInitialState: function() {
    // When this component is managed by a parent, all it takes is initialState
    if (this.props.initialState) {
      var state = this.clonePanel(this.props.initialState);
      return state;
    }

    // When this component is independent and manages itself, it takes individual initial state props, with defaults listed here. 
    return {
      refs: this.props.initialRefs || [], // array of ref strings
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
        layoutTanach:  "segmented",
        color:         "light",
        fontSize:      62.5
      },
      menuOpen:             this.props.initialMenu || null, // "navigation", "text toc", "display", "search", "sheets", "home"
      navigationCategories: this.props.initialNavigationCategories || [],
      navigationSheetTag:   this.props.initialSheetsTag || null,
      searchQuery:          this.props.initialQuery || null,
      appliedSearchFilters: this.props.initialAppliedSearchFilters || [],
      searchFiltersValid:   false,
      availableFilters:     [],
      filterRegistry:       {},
      orphanSearchFilters:  [],
      displaySettingsOpen:  false
    }
  },
  componentDidMount: function() {
    window.addEventListener("resize", this.setWidth);
    this.setWidth();
    this.setHeadroom();
    this.trackPanelOpens();
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
    if (prevState.refs.compare(this.state.refs)) {
      this.trackPanelOpens();
    }
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
  clonePanel: function(panel) {
    //Set aside self-referential objects before cloning
    //Todo: Move the multiple instances of this out to a utils file
    if (panel.availableFilters || panel.filterRegistry) {
      var savedAttributes = {
         availableFilters: panel.availableFilters,
         searchFiltersValid: panel.searchFiltersValid,
         filterRegistry: panel.filterRegistry
      };
      panel.availableFilters = panel.searchFiltersValid = panel.filterRegistry = null;
      var newpanel = $.extend(clone(panel), savedAttributes);
      $.extend(panel, savedAttributes);
      return newpanel;
    } else {
      return clone(panel);
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
  showBaseText: function(ref, replaceHistory) {
    // Set the current primary text
    // `replaceHistory` - bool whether to replace browser history rather than push for this change
    if (!ref) { return; }
    this.replaceHistory = Boolean(replaceHistory);
    this.conditionalSetState({
      mode: "Text",
      refs: [ref],
      filter: [],
      recentFilters: [],
      menuOpen: null
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
      // searchQuery: null,
      // appliedSearchFilters: [],
      navigationCategories: null,
      navigationSheetTag: null
    });
  },
  setNavigationCategories: function(categories) {
    this.conditionalSetState({menuOpen: "navigation", navigationCategories: categories});
  },
  setSheetTag: function (tag) {
    this.conditionalSetState({navigationSheetTag: tag});
  },
  setFilter: function(filter, updateRecent) {
    // Sets the current filter for Connected Texts (TextList)
    // If updateRecent is true, include the current setting in the list of recent filters.
    
    /*  Hack to open commentaries immediately as full texts
    if (filter && sjs.library.index(filter) && sjs.library.index(filter).categories[0] == "Commentary") {
      this.openCommentary(filter);
      return;
    }
    */

    if (updateRecent && filter) {
      if ($.inArray(filter, this.state.recentFilters) !== -1) {
        this.state.recentFilters.toggle(filter);
      }
      this.state.recentFilters = [filter].concat(this.state.recentFilters);
    }
    filter = filter ? [filter] : [];
    this.conditionalSetState({recentFilters: this.state.recentFilters, filter: filter});
  },
  toggleLanguage: function() {
    if (this.state.settings.language == "hebrew") {
      this.setOption("language", "english");
    } else {
      this.setOption("language", "hebrew");
    }
  },
  openCommentary: function(commentator) {
    // Tranforms a connections panel into an text panel with a particular commentary
    var baseRef = this.state.refs[0];
    var links   = sjs.library._filterLinks(sjs.library.links(baseRef), [commentator]);
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
      var option = category === "Tanach" || category === "Talmud" ? "layout" + category : "layoutDefault";
    }

    this.state.settings[option] = value;
    var state = {settings: this.state.settings};
    if (option !== "fontSize") { state.displaySettingsOpen = false; }
    $.cookie(option, value, {path: "/"});
    if (option === "language") {
      $.cookie("contentLang", value, {path: "/"});
      this.props.setDefaultOption && this.props.setDefaultOption(option, value);
    }
    this.conditionalSetState(state);
  },
  setConnectionsMode: function(mode) {
    var loginRequired = {
      "Add to Source Sheet": 1,
      "Add Note": 1,
      "My Notes": 1,
      "Add Connections": 1,
      "Add Translation": 1
    };
    if (!sjs._uid && mode in loginRequired) {
      mode = "Login";
    };
    var state = {connectionsMode: mode};
    if (mode === "Connections") { 
      state["filter"] = [];
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
  trackPanelOpens: function() {
    if (this.state.mode === "Connections") { return; }
    this.tracked = this.tracked || [];
    // Do a little dance to avoid tracking something we've already just tracked
    // e.g. when refs goes from ["Genesis 5"] to ["Genesis 4", "Genesis 5"] don't track 5 again
    for (var i = 0; i < this.state.refs.length; i++) {
      if ($.inArray(this.state.refs[i], this.tracked) == -1) {
        sjs.track.open(this.state.refs[i]);
        this.tracked.push(this.state.refs[i]);
      }
    }
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
    var data = sjs.library.ref(ref);
    return data; 
  },
  currentBook: function() {
    var data = this.currentData();
    if (data) {
      return data.indexTitle;
    } else {
      var pRef = parseRef(this.currentRef());
      return "book" in pRef ? pRef.book : null;
    }
  },
  currentCategory: function() {
    var book = this.currentBook();
    return (sjs.library.index(book) ? sjs.library.index(book).categories[0] : null);
  },
  currentLayout: function() {
    var category = this.currentCategory();
    if (!category) { return "layoutDefault"; }
    var option = category === "Tanach" || category === "Talmud" ? "layout" + category : "layoutDefault";
    return this.state.settings[option];  
  },
  render: function() {
    var items = [];
    if (this.state.mode === "Text" || this.state.mode === "TextAndConnections") {
      items.push(<TextColumn
          srefs={this.state.refs}
          version={this.state.version}
          versionLanguage={this.state.versionLanguage}
          highlightedRefs={this.state.highlightedRefs}
          basetext={true}
          withContext={true}
          loadLinks={true}
          prefetchNextPrev={true}
          multiPanel={this.props.multiPanel}
          mode={this.state.mode}
          settings={clone(this.state.settings)}
          setOption={this.setOption}
          showBaseText={this.showBaseText} 
          updateTextColumn={this.updateTextColumn}
          onSegmentClick={this.handleBaseSegmentClick}
          onCitationClick={this.handleCitationClick}
          setTextListHightlight={this.setTextListHightlight}
          panelsOpen={this.props.panelsOpen}
          layoutWidth={this.props.layoutWidth}
          filter={this.state.filter}
          key="text" />);
    }
    if (this.state.mode === "Connections" || this.state.mode === "TextAndConnections") {
      var langMode = this.props.masterPanelLanguage || this.state.settings.language;
      var data     = this.currentData();
      var enLocked = data.versionStatus === "locked";
      var heLocked = data.heVersionStatus === "locked";
      var canEditText = langMode === "hebrew" && !heLocked ||
                        langMode === "english" && !enLocked ||
                        sjs.is_moderator && langMode !== "bilingual";
      items.push(<ConnectionsPanel 
          srefs={this.state.mode === "Connections" ? this.state.refs : this.state.highlightedRefs} 
          filter={this.state.filter || []}
          mode={this.state.connectionsMode || "Connections"}
          recentFilters={this.state.recentFilters}
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
          key="connections" />
      );
    }

    if (this.state.menuOpen === "home" || this.state.menuOpen == "navigation") {
      var menu = (<ReaderNavigationMenu 
                    home={this.state.menuOpen === "home"}
                    categories={this.state.navigationCategories || []}
                    settings={this.state.settings}
                    setCategories={this.setNavigationCategories || []}
                    setOption={this.setOption}
                    toggleLanguage={this.toggleLanguage}
                    closeNav={this.closeMenus}
                    openNav={this.openMenu.bind(null, "navigation")}
                    openSearch={this.openSearch}
                    openMenu={this.openMenu}
                    openDisplaySettings={this.openDisplaySettings}
                    onTextClick={this.props.onNavTextClick || this.showBaseText}
                    onRecentClick={this.props.onRecentClick || function(pos, ref) { this.showBaseText(ref) }.bind(this) }
                    hideNavHeader={this.props.hideNavHeader} />);

    } else if (this.state.menuOpen === "text toc") {
      var menu = (<ReaderTextTableOfContents 
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
                    showBaseText={this.showBaseText} />);

    } else if (this.state.menuOpen === "search" && this.state.searchQuery) {
      var menu = (<SearchPage
                    query={this.state.searchQuery}
                    initialPage={1}
                    appliedFilters={this.state.appliedSearchFilters}
                    settings={clone(this.state.settings)}
                    onResultClick={this.props.onSearchResultClick}
                    openDisplaySettings={this.openDisplaySettings}
                    toggleLanguage={this.toggleLanguage}
                    close={this.closeMenus}
                    hideNavHeader={this.props.hideNavHeader}
                    onQueryChange={this.props.onQueryChange}
                    updateAppliedFilter={this.props.updateSearchFilter}
                    availableFilters={this.state.availableFilters}
                    filtersValid={this.state.searchFiltersValid}
                    registerAvailableFilters={this.props.registerAvailableFilters}
      />);

    } else if (this.state.menuOpen === "sheets") {
      var menu = (<SheetsNav
                    openNav={this.openMenu.bind(null, "navigation")}
                    close={this.closeMenus}
                    initialTag={this.state.navigationSheetTag}
                    setSheetTag={this.setSheetTag} />);
    } else if (this.state.menuOpen === "account") {
      var menu = (<AccountPanel />);

    } else if (this.state.menuOpen === "notifications") {
      var menu = (<NotificationsPanel />);

    } else {
      var menu = null;
    }

    var classes  = {readerPanel: 1, wideColumn: this.width > 450};
    classes[this.currentLayout()]             = 1;
    classes[this.state.settings.color]        = 1;
    classes[this.state.settings.language]     = 1;
    classes = classNames(classes);
    var style = {"fontSize": this.state.settings.fontSize + "%"};
    var hideReaderControls = (this.state.mode === "TextAndConnections" || this.props.hideNavHeader);

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
          connectionsMode={this.state.filter.length && this.state.connectionsMode === "Connections" ? "Connection Text" : this.state.connectionsMode}
          closePanel={this.props.closePanel}
          toggleLanguage={this.toggleLanguage} />)}

        <div className="readerContent" style={style}>
          {items}
        </div>

        {menu}
        {this.state.displaySettingsOpen ? (<ReaderDisplayOptionsMenu
                                              settings={this.state.settings}
                                              setOption={this.setOption}
                                              currentLayout={this.currentLayout} 
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
    closePanel:              React.PropTypes.func,
    toggleLanguage:          React.PropTypes.func,
    currentRef:              React.PropTypes.string,
    version:                 React.PropTypes.string,
    versionLanguage:         React.PropTypes.string,
    connectionsMode:         React.PropTypes.string,
    multiPanel:              React.PropTypes.bool
  },
  render: function() {
    var title     = this.props.currentRef;
    if (title) {
      var oref    = sjs.library.ref(title);
      var heTitle = oref ? oref.heTitle : "";      
    } else {
      var heTitle = "";
    }

    var mode              = this.props.currentMode();
    var hideHeader        = !this.props.multiPanel && mode === "Connections";
    var connectionsHeader = this.props.multiPanel && mode === "Connections";

    if (title && !oref) {
      // If we don't have this data yet, rerender when we do so we can set the Hebrew title
      sjs.library.text(title, {context: 1}, function() { if (this.isMounted()) { this.setState({}); } }.bind(this));
    }

    var versionTitle = this.props.version ? this.props.version.replace(/_/g," "):"";
    var centerContent = connectionsHeader ?
      (<div className="readerTextToc">
          <ConnectionsPanelHeader
            activeTab={this.props.connectionsMode}
            setConnectionsMode={this.props.setConnectionsMode}
            closePanel={this.props.closePanel}
            toggleLanguage={this.props.toggleLanguage} />
        </div>) :
      (<div className="readerTextToc" onClick={this.props.openMenu.bind(null, "text toc")}>
          { title ? (<i className="fa fa-caret-down invisible"></i>) : null }
          <div className="readerTextTocBox">
            <span className="en">{title}</span>
            <span className="he">{heTitle}</span>
            { title ? (<i className="fa fa-caret-down"></i>) : null }
            { (this.props.versionLanguage == "en" && this.props.settings.language == "english") ? (<span className="readerTextVersion"><span className="en">{versionTitle}</span></span>) : null}
          </div>
        </div>);
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
    settings:      React.PropTypes.object.isRequired,
    currentLayout: React.PropTypes.func.isRequired,
    menuOpen:      React.PropTypes.string.isRequired
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
    var layoutToggle = this.props.settings.language !== "bilingual" ? 
      (<ToggleSet
          name="layout"
          options={layoutOptions}
          setOption={this.props.setOption}
          currentLayout={this.props.currentLayout}
          settings={this.props.settings} />) : null;

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
    hideNavHeader: React.PropTypes.bool,
    home:          React.PropTypes.bool
  },
  getInitialState: function() {
    this.width = 0;
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
    console.log("Setting RNM width: " + width);
    var winWidth = $(window).width();
    var winHeight = $(window).height();
    console.log("Window width: " + winWidth + ", Window height: " + winHeight);
    var oldWidth = this.width;
    this.width = width;
    if ((oldWidth <= 450 && width > 450) || 
        (oldWidth > 450 && width <= 450)) {
      this.forceUpdate();
    }
  },
  navHome: function() {
    this.props.setCategories([])
    this.props.openNav();
  },
  closeNav: function() {
    this.props.setCategories([])
    this.props.closeNav();
  },
  showMore: function() {
    this.setState({showMore: true});
  },
  getRecentlyViewed: function() {
    var json = $.cookie("recentlyViewed");
    var recentlyViewed = json ? JSON.parse(json) : null;
    return recentlyViewed;
  },
  handleClick: function(event) {
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
      sjs.track.event("Reader", "Navigation Text Click", ref)
    } else if ($(event.target).hasClass("catLink") || $(event.target).parent().hasClass("catLink")) {
      var cats = $(event.target).attr("data-cats") || $(event.target).parent().attr("data-cats");
      cats = cats.split("|");
      this.props.setCategories(cats);
      sjs.track.event("Reader", "Navigation Sub Category Click", cats.join(" / "));
    }  
  },
  handleSearchKeyUp: function(event) {
    if (event.keyCode === 13) {
      var query = $(event.target).val();
      //window.location = "/search?q=" + query.replace(/ /g, "+");
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
      return (<div className="readerNavMenu" onClick={this.handleClick} >
                <ReaderNavigationCategoryMenu
                  categories={this.props.categories}
                  category={this.props.categories.slice(-1)[0]}
                  closeNav={this.closeNav}
                  setCategories={this.props.setCategories}
                  toggleLanguage={this.props.toggleLanguage}
                  openDisplaySettings={this.props.openDisplaySettings}
                  navHome={this.navHome}
                  hideNavHeader={this.props.hideNavHeader}
                  width={this.width} />
              </div>);
    } else {
      var categories = [
        "Tanach",
        "Mishnah",
        "Talmud",
        "Midrash",
        "Halakhah",
        "Kabbalah",
        "Liturgy",
        "Philosophy",
        "Tosefta",
        "Parshanut",
        "Chasidut",
        "Musar",
        "Responsa",
        "Apocrypha",
        "Other"
      ];
      categories = categories.map(function(cat) {
        var style = {"borderColor": sjs.categoryColor(cat)};
        var openCat = function() {this.props.setCategories([cat])}.bind(this);
        var heCat   = sjs.library.hebrewCategory(cat);
        return (<div className="readerNavCategory" data-cat={cat} style={style} onClick={openCat}>
                  <span className="en">{cat}</span>
                  <span className="he">{heCat}</span>
                </div>);
      }.bind(this));;
      var more = (<div className="readerNavCategory" style={{"borderColor": sjs.palette.darkblue}} onClick={this.showMore}>
                      <span className="en">More &gt;</span>
                      <span className="he">עוד &gt;</span>
                  </div>);
      if (this.width < 450) {
        categories = this.state.showMore ? categories : categories.slice(0,9).concat(more);
        categories = (<div className="readerNavCategories"><TwoBox content={categories} /></div>);
      } else {
        categories = this.state.showMore ? categories : categories.slice(0,8).concat(more);
        categories = (<div className="readerNavCategories"><ThreeBox content={categories} /></div>);
      }
                    

      var siteLinks = sjs._uid ? 
                    [(<a className="siteLink" key='profile' href="/my/profile">
                        <i className="fa fa-user"></i>
                        <span className="en">Your Profile</span>
                        <span className="he">הפרופיל שלי</span>
                      </a>), 
                     (<span className='divider' key="d1">•</span>),
                     (<a className="siteLink" key='about' href="/about">
                        <span className="en">About Sefaria</span>
                        <span className="he">אודות ספאריה</span>
                      </a>),
                     (<span className='divider' key="d2">•</span>),
                     (<a className="siteLink" key='logout' href="/logout">
                        <span className="en">Logout</span>
                        <span className="he">התנתק</span>
                      </a>)] :
                    
                    [(<a className="siteLink" key='about' href="/about">
                        <span className="en">About Sefaria</span>
                        <span className="he">אודות ספאריה</span>
                      </a>),
                     (<span className='divider' key="d1">•</span>),
                     (<a className="siteLink" key='login' href="/login">
                        <span className="en">Sign In</span>
                        <span className="he"></span>
                      </a>)];
      var calendar = [(<TextBlockLink sref={sjs.calendar.parasha} title={sjs.calendar.parashaName} heTitle="פרשה" category="Tanach" />),
                      (<TextBlockLink sref={sjs.calendar.haftara} title="Haftara" heTitle="הפטרה" category="Tanach" />),
                      (<TextBlockLink sref={sjs.calendar.daf_yomi} title="Daf Yomi" heTitle="דף יומי" category="Talmud" />)];
      calendar = (<div className="readerNavCalendar"><TwoOrThreeBox content={calendar} width={this.width} /></div>);


      var sheetsStyle = {"borderColor": sjs.categoryColor("Sheets")};
      var resources = [(<span className="sheetsLink" style={sheetsStyle} onClick={this.props.openMenu.bind(null, "sheets")}>
                        <i className="fa fa-file-text-o"></i>
                        <span className="en">Source Sheets</span>
                        <span className="he">דפי מקורות</span>
                      </span>),
                     (<a className="sheetsLink" style={sheetsStyle} href="/explore">
                        <i className="fa fa-link"></i>
                        <span className="en">Link Explorer</span>
                        <span className="he">מפת ציטוטים</span>
                      </a>),
                    (<a className="sheetsLink" style={sheetsStyle} href="/people">
                        <i className="fa fa-book"></i>
                        <span className="en">Authors</span>
                        <span className="he">רשימת מחברים</span>
                      </a>)];
      resources = (<div className="readerNavCalendar"><TwoOrThreeBox content={resources} width={this.width} /></div>);


      var topContent = this.props.home ?
              (<div className="readerNavTop search">
                <CategoryColorLine category="Other" />
                <ReaderNavigationMenuSearchButton onClick={this.navHome} />
                <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />                
                <div className='sefariaLogo'><img src="/static/img/sefaria.png" /></div>
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
      recentlyViewed = recentlyViewed ? recentlyViewed.map(function(item) {
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

      var classes = classNames({readerNavMenu:1, noHeader: !this.props.hideHeader});
      return(<div className={classes} onClick={this.handleClick} key="0">
              {topContent}
              <div className="content">
                <div className="contentInner">
                <h1>
                  <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} />
                  <span className="en">The Sefaria Library</span>
                  <span className="he">האוסף של ספאריה</span>
                </h1>
                  
                  <ReaderNavigationMenuSection title="Recent" heTitle="נצפו לאחרונה" content={recentlyViewed} />
                  <ReaderNavigationMenuSection title="Browse" heTitle="טקסטים" content={categories} />
                  <ReaderNavigationMenuSection title="Calendar" heTitle="לוח יומי" content={calendar} />
                  <ReaderNavigationMenuSection title="Resources" heTitle="קהילה" content={resources} />
                  <div className="siteLinks">
                    {siteLinks}
                  </div>
                </div>
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
        <h2>
          <span className="en">{this.props.title}</span>
          <span className="he">{this.props.heTitle}</span>
        </h2>
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
    var index    = sjs.library.index(this.props.book);
    var category = this.props.category || index.categories[0];
    var style    = {"borderColor": sjs.categoryColor(category)};
    var title    = this.props.title   || (this.props.showSections ? this.props.sref : this.props.book);
    var heTitle  = this.props.heTitle || (this.props.showSections ? this.props.heRef : index.heTitle);

    var position = this.props.position || 0;
    var classes  = classNames({refLink: 1, blockLink: 1, recentItem: this.props.recentItem});
    return (<a className={classes} data-ref={this.props.sref} data-version={this.props.version} data-versionlanguage={this.props.versionLanguage} data-position={position} style={style}>
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
              <span className="en">א</span>
              <span className="he">A</span>
            </div>);
  }
});


var BlockLink = React.createClass({
  propTypes: {
    title:    React.PropTypes.string,
    heTitle:  React.PropTypes.string,
    target:   React.PropTypes.string
  },
  render: function() { 
    return (<a className="blockLink" href={this.props.target}>
              <span className="en">{this.props.title}</span>
              <span className="he">{this.props.heTitle}</span>
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
    hideNavHeader: React.PropTypes.bool
  },
  render: function() {

    // Show Talmud with Toggles
    var categories  = this.props.categories[0] === "Talmud" && this.props.categories.length == 1 ? 
                        ["Talmud", "Bavli"] : this.props.categories;

    if (categories[0] === "Talmud") {
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

    } else {
      var toggle = null;
    }

    var catContents    = sjs.library.tocItemsByCategories(categories);
    var navMenuClasses = classNames({readerNavCategoryMenu: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader});
    var navTopClasses  = classNames({readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader});
    return (<div className={navMenuClasses}>
              <div className={navTopClasses}>
                <CategoryColorLine category={categories[0]} />
                {this.props.hideNavHeader ? null : (<ReaderNavigationMenuMenuButton onClick={this.props.navHome} />)}
                {this.props.hideNavHeader ? null : (<ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />)}
                {this.props.hideNavHeader ? null : (<h2>
                  <span className="en">{this.props.category}</span>
                  <span className="he">{sjs.library.hebrewCategory(this.props.category)}</span>
                </h2>)}
              </div>
              <div className="content">
                <div className="contentInner">
                  {this.props.hideNavHeader ? (<h1>
                      <div className="languageToggle" onClick={this.props.toggleLanguage}>
                        <span className="en">א</span>
                        <span className="he">A</span>
                      </div>
                      <span className="en">{this.props.category}</span>
                      <span className="he">{sjs.library.hebrewCategory(this.props.category)}</span>
                    </h1>) : null}
                  {toggle}
                  <ReaderNavigationCategoryMenuContents contents={catContents} categories={categories} width={this.props.width} />
                </div>
              </div>
            </div>);
  }
});


var ReaderNavigationCategoryMenuContents = React.createClass({
  // Inner content of Category menu (just category title and boxes of)
  propTypes: {
    contents:   React.PropTypes.array.isRequired,
    categories: React.PropTypes.array.isRequired,
    width:      React.PropTypes.number
  },
  render: function() {
      var content = [];
      var cats = this.props.categories || [];
      for (var i = 0; i < this.props.contents.length; i++) {
        var item = this.props.contents[i];
        if (item.category) {
          if (item.category == "Commentary") { continue; }
          var newCats = cats.concat(item.category);
          // Special Case categories which should nest
          var subcats = [ "Mishneh Torah", "Shulchan Arukh", "Midrash Rabbah", "Maharal" ];
          if ($.inArray(item.category, subcats) > -1) {
            content.push((<span className="catLink" data-cats={newCats.join("|")} key={i}>
                           <span className='en'>{item.category}</span>
                           <span className='he'>{sjs.library.hebrewCategory(item.category)}</span>
                          </span>));
            continue;
          }
          // Add a Category
          content.push((<div className='category' key={i}>
                          <h3>
                            <span className='en'>{item.category}</span>
                            <span className='he'>{item.heCategory}</span>
                          </h3>
                          <ReaderNavigationCategoryMenuContents contents={item.contents} categories={newCats} width={this.props.width} />
                        </div>));
        } else {
          // Add a Text
          var title   = item.title.replace(/(Mishneh Torah,|Shulchan Arukh,|Jerusalem Talmud) /, "");
          var heTitle = item.heTitle.replace(/(משנה תורה,|תלמוד ירושלמי) /, "");
          content.push((<span className={'refLink sparse' + item.sparseness} data-ref={item.firstSection} key={i}> 
                          <span className='en'>{title}</span>
                          <span className='he'>{heTitle}</span>
                        </span>));
        }
      }
      var boxedContent = [];
      var currentRun   = [];
      for (var i = 0; i < content.length; i++) {
        // Walk through content looking for runs of spans to group together into a table
        if (content[i].type == "div") { // this is a subcategory
          if (currentRun.length) {
            boxedContent.push((<TwoOrThreeBox content={currentRun} width={this.props.width} key={i} />));
            currentRun = [];
          }
          boxedContent.push(content[i]);
        } else if (content[i].type == "span") { // this is a single text
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
    title:            React.PropTypes.string.isRequired,
    category:         React.PropTypes.string.isRequired,
    currentRef:       React.PropTypes.string.isRequired,
    settingsLanguage: React.PropTypes.string.isRequired,
    versionLanguage:  React.PropTypes.string,
    version:          React.PropTypes.string,
    close:            React.PropTypes.func.isRequired,
    openNav:          React.PropTypes.func.isRequired,
    showBaseText:     React.PropTypes.func.isRequired,
    selectVersion:    React.PropTypes.func.isRequired
  },
  getInitialState: function() {
    return {
      versions: [],
      versionsLoaded: false,
      currentVersion: null
    }
  },
  componentDidMount: function() {
    this.loadVersions();
    this.bindToggles();
    this.shrinkWrap();
    window.addEventListener('resize', this.shrinkWrap);
  },
  componentWillUnmount: function() {
    window.removeEventListener('resize', this.shrinkWrap);
  },
  componentDidUpdate: function() {
    this.bindToggles();
    this.shrinkWrap();
  },
  loadVersions: function() {
    var ref = sjs.library.sectionRef(this.props.currentRef) || this.props.currentRef;
    if (!ref) {
      this.setState({versionsLoaded: true});
      return;
    }
    sjs.library.text(
      ref,
      {context: 1, version: this.state.version, language: this.state.versionLanguage},
      this.loadVersionsData);
  },
  loadVersionsData: function(d) {
    // For now treat bilinguale as english. TODO show attribution for 2 versions in bilingual case.
    var currentLanguage = this.props.settingsLanguage == "he" ? "he" : "en";
    // Todo handle independent Text TOC case where there is no current version
    var currentVersion = {
      language: currentLanguage,
      title:    currentLanguage == "he" ? d.heVersionTitle: d.versionTitle,
      source:   currentLanguage == "he" ? d.heVersionSource: d.versionSource,
      license:  currentLanguage == "he" ? d.heLicense: d.license,
      sources:  currentLanguage == "he" ? d.heSources: d.sources,
      notes:    currentLanguage == "he" ? d.heVersionNotes: d.versionNotes,
      digitizedBySefaria:  currentLanguage == "he" ? d.heDigitizedBySefaria: d.digitizedBySefaria
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
      ref = humanRef(ref);
      this.props.close();
      this.props.showBaseText(ref);
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
    this.props.close();
  },
  render: function() {
    var tocHtml = sjs.library.textTocHtml(this.props.title, function() {
      this.setState({});
    }.bind(this));
    tocHtml = tocHtml || '<div class="loadingMessage"><span class="en">Loading...</span><span class="he">טעינה...</span></div>';

    var title     = this.props.title;
    var heTitle   = sjs.library.index(title) ? sjs.library.index(title).heTitle : title;

    var section   = sjs.library.sectionString(this.props.currentRef).en.named;
    var heSection = sjs.library.sectionString(this.props.currentRef).he.named;

    var currentVersionElement = null;
    var defaultVersionString = "Default Version";
    var defaultVersionObject = null;

    if (this.state.versionsLoaded) {
      if (this.state.currentVersion.merged) {
        var uniqueSources = this.state.currentVersion.sources.filter(function(item, i, ar){ return ar.indexOf(item) === i; }).join(", ");
        defaultVersionString += " (Merged from " + uniqueSources + ")";
        currentVersionElement = (
          <span className="currentVersionInfo">
            <span className="currentVersionTitle">Merged from { uniqueSources }</span>
            <a className="versionHistoryLink" href="#">Version History &gt;</a>
          </span>);
      } else {
        if (!this.props.version) {
          defaultVersionObject = this.state.versions.find(v => (this.state.currentVersion.language == v.language && this.state.currentVersion.title == v.versionTitle));
          defaultVersionString += defaultVersionObject ? " (" + defaultVersionObject.versionTitle + ")" : "";
        }
        currentVersionElement = (
            <span className="currentVersionInfo">
            <span className="currentVersionTitle">{this.state.currentVersion.title}</span>
            <a className="currentVersionSource" target="_blank" href={this.state.currentVersion.source}>
              { parseURL(this.state.currentVersion.source).host }
            </a>
            <span>-</span>
            <span className="currentVersionLicense">{this.state.currentVersion.license == "unknown" ? "License Unknown" : (this.state.currentVersion.license + (this.state.currentVersion.digitizedBySefaria ? " - Digitized by Sefaria": "" ))}</span>
            <span>-</span>
            <a className="versionHistoryLink" href="#">Version History &gt;</a>
          </span>);
      }
    }

    var selectOptions = [];
    selectOptions.push(<option key="0" value="0">{defaultVersionString}</option>);    // todo: add description of current version.
    var selectedOption = 0;
    for (var i = 0; i < this.state.versions.length; i++) {
      var v = this.state.versions[i];
      if (v == defaultVersionObject) {
        continue;
      }
      if (this.props.versionLanguage == v.language && this.props.version == v.versionTitle) {
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


    return (<div className="readerTextTableOfContents readerNavMenu" onClick={this.handleClick}>
              <CategoryColorLine category={this.props.category} />
              <div className="readerControls">
                <div className="readerControlsInner">
                  <div className="leftButtons">
                    <ReaderNavigationMenuCloseButton onClick={this.props.close}/>
                  </div>
                  <div className="rightButtons">
                    <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
                  </div>
                  <div className="readerTextToc">
                    <div className="readerTextTocBox">
                      <span className="en">Table of Contents</span>
                      <span className="he">תוכן העניינים</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="content">
                <div className="contentInner">
                  <div className="tocTitle">
                    <span className="en">{title}</span>
                    <span className="he">{heTitle}</span>
                    <div className="currentSection">
                      <span className="en">{section}</span>
                      <span className="he">{heSection}</span>
                    </div>
                  </div>
                  <div className="versionBox">
                      {(!this.state.versionsLoaded) ? (<span>Loading...</span>): ""}
                      {(this.state.versionsLoaded)? currentVersionElement: ""}
                      {(this.state.versionsLoaded && this.state.versions.length > 1) ? selectElement: ""}
                  </div>
                  <div className="tocContent" dangerouslySetInnerHTML={ {__html: tocHtml} }></div>
                </div>
              </div>
            </div>);
  }
});


var SheetsNav = React.createClass({
  // Navigation for Sheets
  propTypes: {
    initialTag:   React.PropTypes.string,
    close:        React.PropTypes.func.isRequired,
    openNav:      React.PropTypes.func.isRequired,
    setSheetTag:  React.PropTypes.func.isRequired
  },
  getInitialState: function() {
    return {
      trendingTags: null,
      tagList: null,
      yourSheets: null,
      sheets: [],
      tag: this.props.initialTag,
      width: 0
    };
  },
  componentDidMount: function() {
    this.getTags();
    this.setState({width: $(ReactDOM.findDOMNode(this)).width()});
    if (this.props.initialTag) {
      if (this.props.initialTag === "Your Sheets") {
        this.showYourSheets();
      } else {
        this.setTag(this.props.initialTag);
      }
    }
  },
  componentWillReceiveProps: function(nextProps) {
    this.setState({tag: nextProps.initialTag, sheets: []});
  },
  getTags: function() {
    sjs.library.sheets.trendingTags(this.loadTags);
    sjs.library.sheets.tagList(this.loadTags);
  },
  loadTags: function() {
    this.setState({
      trendingTags: sjs.library.sheets.trendingTags() || [],
      tagList:      sjs.library.sheets.tagList() || []
    });
  },
  setTag: function(tag) {
    this.setState({tag: tag});
    sjs.library.sheets.sheetsByTag(tag, this.loadSheets);
    this.props.setSheetTag(tag);
  },
  loadSheets: function(sheets) {
    this.setState({sheets: sheets});
  },
  showYourSheets: function() {
    this.setState({tag: "Your Sheets"});
    sjs.library.sheets.userSheets(sjs._uid, this.loadSheets);
    this.props.setSheetTag("Your Sheets");    
  },
  render: function() {
    var enTitle = this.state.tag || "Source Sheets";

    if (this.state.tag) {
      var sheets = this.state.sheets.map(function(sheet) {
        var title = sheet.title.stripHtml();
        var url   = "/sheets/" + sheet.id;
        return (<a className="sheet" href={url} key={url}>
                  {sheet.ownerImageUrl ? (<img className="sheetImg" src={sheet.ownerImageUrl} />) : null}
                  <span className="sheetViews"><i className="fa fa-eye"></i> {sheet.views}</span>
                  <div className="sheetAuthor">{sheet.ownerName}</div>
                  <div className="sheetTitle">{title}</div>
                </a>);
      });
      sheets = sheets.length ? sheets : (<LoadingMessage />);
      var content = (<div className="content sheetList"><div className="contentInner">{sheets}</div></div>);
    } else {
      var yourSheets  = sjs._uid ? (<div className="yourSheetsLink navButton" onClick={this.showYourSheets}>Your Source Sheets <i className="fa fa-chevron-right"></i></div>) : null;
      var makeTagButton = function(tag) {
        var setThisTag = this.setTag.bind(null, tag.tag);
        return (<div className="navButton" onClick={setThisTag} key={tag.tag}>{tag.tag} ({tag.count})</div>);
      }.bind(this);

      if (this.state.trendingTags !== null && this.state.tagList !== null) {
        var trendingTags = this.state.trendingTags.slice(0,6).map(makeTagButton);
        var tagList      = this.state.tagList.map(makeTagButton);
        var content = (<div className="content">
                        <div className="contentInner">
                          {yourSheets}
                          <h2><span className="en">Trending Tags</span></h2>
                          <TwoOrThreeBox content={trendingTags} width={this.state.width} />
                          <br /><br />
                          <h2><span className="en">All Tags</span></h2>
                          <TwoOrThreeBox content={tagList} width={this.state.width} />
                        </div>
                       </div>);
      } else {
        var content = (<div className="content" key="content"><div className="contentInner"><LoadingMessage /></div></div>);
      }      
    }

    return (<div className="readerSheetsNav readerNavMenu">
              <div className="readerNavTop searchOnly" key="navTop">
                <CategoryColorLine category="Sheets" />
                <ReaderNavigationMenuMenuButton onClick={this.props.openNav} />
                <h2><span className="en">{enTitle}</span></h2>
              </div>
              {content}
            </div>);
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
  getInitialState: function() {
    return {};
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
    sjs.track.event("Reader", "Display Option Click", this.props.set + " - " + this.props.name);
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
    return (<span className="readerNavMenuMenuButton" onClick={this.props.onClick}><i className="fa fa-bars"></i></span>);
  }
});


var ReaderNavigationMenuCloseButton = React.createClass({
  render: function() { 
    var icon = this.props.icon === "arrow" ? (<i className="fa fa-caret-left"></i>) : "×";
    var classes = classNames({readerNavMenuCloseButton: 1, arrow: this.props.icon === "arrow"});
    return (<div className={classes} onClick={this.props.onClick}>{icon}</div>);
  }
});


var ReaderNavigationMenuDisplaySettingsButton = React.createClass({
  render: function() { 
    return (<div className="readerOptions" onClick={this.props.onClick}><img src="/static/img/bilingual2.png" /></div>);
  }
});


var CategoryColorLine = React.createClass({
  render: function() {
    var style = {backgroundColor: sjs.categoryColor(this.props.category)};
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
    onTextLoad:            React.PropTypes.func,
    panelsOpen:            React.PropTypes.number,
    layoutWidth:           React.PropTypes.number
  },
  componentDidMount: function() {
    this.initialScrollTopSet = false;
    this.justTransitioned    = true;
    this.debouncedAdjustTextListHighlight = debounce(this.adjustTextListHighlight, 100);
    var node = ReactDOM.findDOMNode(this);
    node.addEventListener("scroll", this.handleScroll);
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
    } else if (nextProps.srefs.length == 1 && $.inArray(nextProps.srefs[0], this.props.srefs) == -1) {
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
      var $start    = $(getSelectionBoundaryElement(true)).closest(".segment");
      var $end      = $(getSelectionBoundaryElement(false)).closest(".segment");
      var $segments = $start.is($end) ? $start : $start.nextUntil($end, ".segment").add($start).add($end);
      var refs      = [];
 
      $segments.each(function() {
        refs.push($(this).attr("data-ref"));
      });

      this.props.setTextListHightlight(refs);
    }
  },
  handleTextLoad: function() {
    if (this.loadingContentAtTop || !this.initialScrollTopSet) {
      console.log("text load, setting scroll");
      this.setScrollPosition();
    }
    console.log("text load, ais");
    this.adjustInfiniteScroll();
  },
  setScrollPosition: function() {
    //console.log("ssp");
    // Called on every update, checking flags on `this` to see if scroll position needs to be set
    if (this.loadingContentAtTop) {
      // After adding content by infinite scrolling up, scroll back to what the user was just seeing
      //console.log("loading at top")
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
    // This fixes loading of next content when current content is short in viewpot,
    // but breaks loading highlted ref, jumping back up to top of section
    // this.adjustInfiniteScroll();
  },
  adjustInfiniteScroll: function() {
    // Add or remove TextRanges from the top or bottom, depending on scroll position
    console.log("ais");
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
      // Add the next section to bottom
      if ($lastText.hasClass("loading")) { 
        console.log("last text is loading")
        return;
      }
      console.log("Add next section");
      var currentRef = refs.slice(-1)[0];
      var data       = sjs.library.ref(currentRef);
      if (data && data.next) {
        refs.push(data.next);
        this.props.updateTextColumn(refs);
      }
      sjs.track.event("Reader", "Infinite Scroll", "Down");
    } else if (windowTop < 20) {
      // Scroll up for previous
      var topRef = refs[0];
      var data   = sjs.library.ref(topRef);
      if (data && data.prev) {
        console.log("up!")
        refs.splice(refs, 0, data.prev);
        this.loadingContentAtTop = true;
        this.props.updateTextColumn(refs);
      }
      sjs.track.event("Reader", "Infinite Scroll", "Up");
    } else {
      // nothing happens
    }
  },
  adjustTextListHighlight: function() {
    console.log("atlh");
    // When scrolling while the TextList is open, update which segment should be highlighted.
    if (this.props.multipanel && this.props.layoutWidth == 100) { 
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
      var first   = sjs.library.ref(this.props.srefs[0]);
      var last    = sjs.library.ref(this.props.srefs.slice(-1)[0]);
      var hasPrev = first && first.prev;
      var hasNext = last && last.next;
      var topSymbol  = " ";
      var bottomSymbol = " ";
      if (hasPrev) {
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
  // This component is responsible for retrieving data from sjs.library for the ref that defines it.
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
  getInitialState: function() {
    return { 
      segments: [],
      loaded: false,
      linksLoaded: false,
      data: {ref: this.props.sref}
    };
  },
  componentDidMount: function() {
    this.getText();
    if (this.props.basetext || this.props.segmentNumber) { 
      this.placeSegmentNumbers();
    }
    window.addEventListener('resize', this.handleResize);
  },
  componentWillUnmount: function() {
    window.removeEventListener('resize', this.handleResize);
  },
  componentDidUpdate: function(prevProps, prevState) {
    // Reload text if version changed
    if (this.props.version != prevProps.version || this.props.versionLanguage != prevProps.versionLanguage) {
      this.getText(true);
    }
    // Place segment numbers again if update affected layout
    else if (this.props.basetext || this.props.segmentNumber) {
      if ((!prevState.loaded && this.state.loaded) ||
          (!prevState.linksLoaded && this.state.linksLoaded) ||
          prevProps.settings.language !== this.props.settings.language ||
          prevProps.settings.layoutDefault !== this.props.settings.layoutDefault ||
          prevProps.settings.layoutTanach !== this.props.settings.layoutTanach ||
          prevProps.settings.layoutTalmud !== this.props.settings.layoutTalmud ||
          prevProps.settings.fontSize !== this.props.settings.fontSize ||
          prevProps.layoutWidth !== this.props.layoutWidth) {
            window.requestAnimationFrame(function() { 
              if (this.isMounted()) {
                this.placeSegmentNumbers();
              }
            }.bind(this));        
      }
    }
    if (this.props.onTextLoad && !prevState.loaded && this.state.loaded) {
      this.props.onTextLoad();
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
      sjs.track.event("Reader", "Click Text from TextList", this.props.sref);
    }
  },
  getText: function(doRenumber) {
    var settings = {
      context: this.props.withContext ? 1 : 0,
      version: this.props.version || null,
      language: this.props.versionLanguage || null
    };
    sjs.library.text(this.props.sref, settings, function(data) {
      this.loadText(data);
      if (doRenumber) {
        window.requestAnimationFrame(function() {
            if (this.isMounted()) {
              this.placeSegmentNumbers();
            }
          }.bind(this));
      }
    }.bind(this));
  },
  makeSegments: function(data) {
    // Returns a flat list of annotated segment objects,
    // derived from the walking the text in data
    if ("error" in data) { return []; }
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
          var section = n+data.sections.slice(-2)[0];
          var number  = i+start;
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
  loadText: function(data) {
    // When data is actually available, load the text into the UI
    if (this.props.basetext && this.props.sref !== data.ref) {
      // Replace ReaderPanel contents ref with the normalized form of the ref, if they differ.
      // Pass parameter to showBaseText to replaceHistory
      this.props.showBaseText(data.ref, true);        
    }

    var segments  = this.makeSegments(data);
    if (this.isMounted()) {
      this.setState({
        data: data,
        segments: segments,
        loaded: true,
        sref: data.ref
      });      
    }

    // Load links at section level if spanning, so that cache is properly primed with section level refs
    var sectionRefs = data.isSpanning ? data.spanningRefs : [data.sectionRef];
    sectionRefs = sectionRefs.map(function(ref) {
      if (ref.indexOf("-") > -1) {
        ref = ref.split("-")[0];
        ref = ref.slice(0, ref.lastIndexOf(":"));
      }
      return ref;
    });

    if (this.props.loadLinks && !sjs.library.linksLoaded(sectionRefs)) {
      // Calling when links are loaded will overwrite state.segments
      for (var i = 0; i < sectionRefs.length; i++) {
        sjs.library.related(sectionRefs[i], this.loadLinkCounts);
      }
    }

    if (this.props.prefetchNextPrev) {
     if (data.next) {
       sjs.library.text(data.next, {
         context: 1,
         version: this.props.version || null,
         language: this.props.versionLanguage || null
       }, function() {});
     }
     if (data.prev) {
       sjs.library.text(data.prev, {
         context: 1,
         version: this.props.version || null,
         language: this.props.versionLanguage || null
       }, function() {});
     }
     if (data.book) { sjs.library.textTocHtml(data.book, function() {}); }
    }
  },
  loadLinkCounts: function() {
    // When link data has been loaded into sjs.library, load the counts into the UI
    if (this.isMounted()) {
      this.setState({linksLoaded: true});
    }
  },
  placeSegmentNumbers: function() {
    // Set the vertical offsets for segment numbers and link counts, which are dependent
    // on the rendered height of the text of each segment.
    var $text  = $(ReactDOM.findDOMNode(this));
    var setTop = function() {
       var top  = $(this).parent().position().top;
      $(this).css({top: top}).show();   
    };
    $text.find(".segmentNumber").each(setTop);
    $text.find(".linkCount").each(setTop);
  },
  render: function() {
    if (this.props.basetext && this.state.loaded) {
      var ref              = this.props.withContext ? this.state.data.sectionRef : this.state.data.ref;
      var sectionStrings   = sjs.library.sectionString(ref);
      var oref             = sjs.library.ref(ref);
      var useShortString   = oref && $.inArray(oref.categories[0], ["Tanach", "Mishnah", "Talmud", "Tosefta", "Commentary"]) !== -1;
      var title            = useShortString ? sectionStrings.en.numbered : sectionStrings.en.named;
      var heTitle          = useShortString ? sectionStrings.he.numbered : sectionStrings.he.named;   
    } else if (this.props.basetext) {
      var title            = "Loading...";
      var heTitle          = "טעינה...";      
    } else {  
      var title            = this.state.data.ref;
      var heTitle          = this.state.data.heRef;
    }

    var showNumberLabel    = this.state.data.categories &&
                              this.state.data.categories[0] !== "Talmud" &&
                              this.state.data.categories[0] !== "Liturgy";

    var showSegmentNumbers = showNumberLabel && this.props.basetext;
                              

    var textSegments = this.state.segments.map(function (segment, i) {
      var highlight = this.props.highlightedRefs && this.props.highlightedRefs.length ?                                  // if highlighted refs are explicitly set
                        $.inArray(segment.ref, this.props.highlightedRefs) !== -1 : // highlight if this ref is in highlighted refs prop
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
                    loading: !this.state.loaded,
                    lowlight: this.props.lowlight,
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
          (<div className="numberLabel"> <span className="numberLabelInner">{this.props.numberLabel}</span> </div>)
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
      var ref = humanRef($(event.target).attr("data-ref"));
      this.props.onCitationClick(ref, this.props.sref);
      event.stopPropagation();
      sjs.track.event("Reader", "Citation Link Click", ref)
    } else if (this.props.onSegmentClick) {
      this.props.onSegmentClick(this.props.sref);
      sjs.track.event("Reader", "Text Segment Click", this.props.sref);
    }
  },
  render: function() {    
    if (this.props.showLinkCount) {
      var linkCount = sjs.library.linkCount(this.props.sref, this.props.filter);
      var minOpacity = 20, maxOpacity = 70;
      var linkScore = linkCount ? Math.min(linkCount+minOpacity, maxOpacity) / 100.0 : 0;
      var style = {opacity: linkScore};
      var linkCount = this.props.showLinkCount ? (<div className="linkCount">
                                                    <span className="en"><span className="linkCountDot" style={style}></span></span>
                                                    <span className="he"><span className="linkCountDot" style={style}></span></span>
                                                  </div>) : null;      
    } else {
      var linkCount = "";
    }
    var segmentNumber = this.props.segmentNumber ? (<div className="segmentNumber">
                                                      <span className="en"> <span className="segmentNumberInner">{this.props.segmentNumber}</span> </span>
                                                      <span className="he"> <span className="segmentNumberInner">{encodeHebrewNumeral(this.props.segmentNumber)}</span> </span>
                                                    </div>) : null;
    var he = this.props.he || "";
    var en = this.props.en || "";
    var classes=classNames({ segment: 1,
                     highlight: this.props.highlight,
                     heOnly: !this.props.en,
                     enOnly: !this.props.he });
    return (
      <span className={classes} onClick={this.handleClick} data-ref={this.props.sref}>
        {segmentNumber}
        {linkCount}
        <span className="he" dangerouslySetInnerHTML={ {__html: he + " "} }></span>
        <span className="en" dangerouslySetInnerHTML={ {__html: en + " "} }></span>
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
    versionLanguge:          React.PropTypes.string,
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
    toggleLanguage:          React.PropTypes.func
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
                    closePanel={this.props.closePanel} />);

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
                    closePanel={this.props.closePanel} />);

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
      content = (<LoadingMessage className="toolsMessage" message="Coming Soon." heMessage="הרכיב הזה נמצא בבנייה..." />);

    } else if (this.props.mode === "Edit Text") {
      content = (<LoadingMessage className="toolsMessage" message="Coming Soon." heMessage="הרכיב הזה נמצא בבנייה..." />);

    } else if (this.props.mode === "Add Translation") {
      content = (<LoadingMessage className="toolsMessage" message="Coming Soon." heMessage="הרכיב הזה נמצא בבנייה..." />);

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
    toggleLanguage:     React.PropTypes.func.isRequired
  },
  render: function() {
    return (<div className="connectionsPanelHeader">
              <div className="rightButtons">
                <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} />
                <ReaderNavigationMenuCloseButton icon="arrow" onClick={this.props.closePanel} />
               </div>
              <ConnectionsPanelTabs
                activeTab={this.props.activeTab}
                setConnectionsMode={this.props.setConnectionsMode} />
            </div>);
  }
});


var ConnectionsPanelTabs = React.createClass({
  propTypes: {
    activeTab:          React.PropTypes.string.isRequired, // "Connections", "Tools"
    setConnectionsMode: React.PropTypes.func.isRequired
  },
  render: function() {
    var tabNames = [{"en": "Connections", "he": "קישורים"}, {"en": "Tools", "he":"כלים"}];
    var tabs = tabNames.map(function(item) {
      var tabClick = function() {
        this.props.setConnectionsMode(item["en"])
      }.bind(this);
      var active  = item["en"] === this.props.activeTab;
      var classes = classNames({connectionsPanelTab: 1, active: active});
      return (<div className={classes} onClick={tabClick} key={item["en"]}>
                <span className="en">{item["en"]}</span>
                <span className="he">{item["he"]}</span>
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
    closePanel:              React.PropTypes.func
  },
  getInitialState: function() {
    return {
      linksLoaded: false,
      textLoaded: false,
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
    var sectionRef = sjs.library.sectionRef(ref) || ref;
    return sectionRef;
  },
  loadConnections: function() {
    // Load connections data from server for this section
    var sectionRef = this.getSectionRef();
    if (!sectionRef) { return; }
    sjs.library.related(sectionRef, function(data) {
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
        sjs.library.index(filter[0]) && 
        sjs.library.index(filter[0]).categories == "Commentary") {
      this.preloadSingleCommentaryText(filter);
    } else if (filter.length == 1 && filter[0] == "Commentary") {
      this.preloadAllCommentaryText(filter);
    } else {
      this.setState({waitForText: false, textLoaded: false});
    }
  },
  preloadSingleCommentaryText: function(filter) {
    var basetext   = this.getSectionRef();
    var commentary = filter[0] + " on " + basetext;
    this.setState({textLoaded: false, waitForText: true});
    sjs.library.text(commentary, {}, function() {
      if (this.isMounted()) {
        this.setState({textLoaded: true});        
      }
    }.bind(this));
  },
  preloadAllCommentaryText: function() {
    var basetext   = this.getSectionRef();
    var summary    = sjs.library.linkSummary(basetext);
    if (summary.length && summary[0].category == "Commentary") {
      this.setState({textLoaded: false, waitForText: true});
      // Get a list of commentators on this section that we need don't have in the cache
      var links = sjs.library.links(basetext);
      var commentators = summary[0].books.map(function(item) {
        return item.book;
      }).filter(function(commentator) {
        var link = sjs.library._filterLinks(links, [commentator])[0];
        if (link.sourceRef.indexOf(link.anchorRef) == -1) {
          // Check if this is Commentary2, exclude if so
          return false;
        }
        // Exclude if we already have this in the cache
        return !sjs.library.text(commentator + " on " + basetext);
      });
      if (commentators.length) {
        this.waitingFor = clone(commentators);
        this.target = 0;
        for (var i = 0; i < commentators.length; i++) {
          sjs.library.text(commentators[i] + " on " + basetext, {}, function(data) {
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
        var $texts = $(ReactDOM.findDOMNode(this)).find(".texts")
        var adjust = parseInt($texts.css("padding-top")) + 18;
        $texts.scrollTo($highlighted, 0, {offset: -adjust});
      }
    }.bind(this));
  },
  showAllFilters: function() {
    this.props.setFilter(null);
    sjs.track.event("Reader", "Show All Filters Click", "1");
  },
  render: function() {
    var refs               = this.props.srefs;
    var summary            = sjs.library.relatedSummary(refs);
    var oref               = sjs.library.ref(refs[0]);
    var filter             = this.props.filter;
    var sectionRef         = this.getSectionRef();
    var isSingleCommentary = (filter.length == 1 && sjs.library.index(filter[0]) && sjs.library.index(filter[0]).categories == "Commentary");

    //if (summary.length && !links.length) { debugger; }
    var en = "No connections known" + (filter.length ? " for " + filter.join(", ") : "") + ".";
    var he = "אין קשרים ידועים"       + (filter.length ? " ל"    + filter.join(", ") : "") + ".";
    var loaded  = sjs.library.linksLoaded(sectionRef);
    var message = !loaded ? 
                    (<LoadingMessage />) : 
                      (summary.length === 0 ? 
                        <LoadingMessage message={en} heMessage={he} /> : null);
    
    var showAllFilters = !filter.length;
    if (!showAllFilters) {
      if (filter.compare(["Sheets"])) {
        var sheets  = sjs.library.sheets.sheetsByRef(refs);
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
        var notes   = sjs.library.notes(refs);
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
        var sectionLinks = sjs.library.links(sectionRef);
        var links        = sectionLinks.filter(function(link) {
          if ($.inArray(link.anchorRef, refs) === -1 && (this.props.multiPanel || !isSingleCommentary) ) {
            // Only show section level links for an individual commentary
            return false;
          }
          return (filter.length == 0 ||
                  $.inArray(link.category, filter) !== -1 || 
                  $.inArray(link.commentator, filter) !== -1 );

          }.bind(this)).sort(function(a, b) {
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
                                        lowlight={$.inArray(link.anchorRef, refs) === -1}
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
            summary={summary}
            showText={this.props.showText}
            filter={this.props.fitler}
            recentFilters={this.props.recentFilters}
            setFilter={this.props.setFilter} />
        </div>);
    } else if (!this.props.fullPanel) {
      return (
        <div className={classes}>
          <div className="textListTop">
            <RecentFilterSet 
              asHeader={true}
              showText={this.props.showText}
              filter={this.props.filter}
              recentFilters={this.props.recentFilters}
              textCategory={oref ? oref.categories[0] : null}
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
                asHeader={false}
                showText={this.props.showText}
                filter={this.props.filter}
                recentFilters={this.props.recentFilters}
                textCategory={oref ? oref.categories[0] : null}
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
                <div className="noteTitle">{this.props.title}</div>
                <span className="noteText" dangerouslySetInnerHTML={{__html:this.props.text}}></span>
                {buttons}
              </div>);
  }
});


var AllFilterSet = React.createClass({
  render: function() {
    var categories = this.props.summary.map(function(cat, i) {
      return (
        <CategoryFilter 
          key={i}
          category={cat.category}
          heCategory={sjs.library.hebrewCategory(cat.category)}
          count={cat.count} 
          books={cat.books}
          filter={this.props.filter}
          updateRecent={true}
          setFilter={this.props.setFilter}
          on={$.inArray(cat.category, this.props.filter) !== -1} />
      );
    }.bind(this));
    return (
      <div className="fullFilterView filterSet">
        {categories}
      </div>
    );
  }
});


var CategoryFilter = React.createClass({
  handleClick: function() {
    this.props.setFilter(this.props.category, this.props.updateRecent);
    sjs.track.event("Reader", "Category Filter Click", this.props.category);
  },
  render: function() {
    var textFilters = this.props.books.map(function(book, i) {
     return (<TextFilter 
                key={i} 
                book={book.book}
                heBook={book.heBook} 
                count={book.count}
                category={this.props.category}
                hideColors={true}
                updateRecent={true}
                setFilter={this.props.setFilter}
                on={$.inArray(book.book, this.props.filter) !== -1} />);
    }.bind(this));
    
    var notClickable = this.props.category == "Community";
    var color        = sjs.categoryColor(this.props.category);
    var style        = notClickable ? {} : {"borderTop": "4px solid " + color};
    var classes      = classNames({categoryFilter: 1, on: this.props.on, notClickable: notClickable});
    var count        = notClickable ? null : (<span className="enInHe"> | {this.props.count}</span>);
    var handleClick  = notClickable ? null : this.handleClick;
    return (
      <div className="categoryFilterGroup" style={style}>
        <div className={classes} onClick={handleClick}>
          <span className="en">{this.props.category}{count}</span>
          <span className="he">{this.props.heCategory}{count}</span>
        </div>
        <TwoBox content={ textFilters } />
      </div>
    );
  }
});


var TextFilter = React.createClass({
  propTypes: {
    book:         React.PropTypes.string.isRequired,
    heBook:       React.PropTypes.string.isRequired,
    on:           React.PropTypes.bool.isRequired,
    setFilter:    React.PropTypes.func.isRequired,
    updateRecent: React.PropTypes.bool,
  },
  handleClick: function() {
    this.props.setFilter(this.props.book, this.props.updateRecent);
    sjs.track.event("Reader", "Text Filter Click", this.props.book);
  },
  render: function() {
    var classes = classNames({textFilter: 1, on: this.props.on, lowlight: this.props.count == 0});

    if (!this.props.hideColors) {
      var color = sjs.categoryColor(this.props.category)
      var style = {"borderTop": "4px solid " + color};
    }
    var name = this.props.book == this.props.category ? this.props.book.toUpperCase() : this.props.book;
    var count = this.props.hideCounts || !this.props.count ? "" : ( <span className="enInHe"> ({this.props.count})</span>);
    return (
      <div data-name={name}
        className={classes} 
        style={style}
        onClick={this.handleClick}>
          <div>  
            <span className="en">{name}{count}</span>
            <span className="he">{this.props.heBook}{count}</span>
          </div>
      </div>
    );
  }
});


var RecentFilterSet = React.createClass({
  propTypes: {
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
    var topLinks = []; // sjs.library.topLinks(this.props.sref);

    // Filter top links to exclude items already in recent filter
    topLinks = topLinks.filter(function(link) {
      return ($.inArray(link.book, this.props.recentFilters) == -1);
    }.bind(this));
    
    // Annotate filter texts with category            
    var recentFilters = this.props.recentFilters.map(function(filter) {
      var index = sjs.library.index(filter);
      return {
          book: filter,
          heBook: index ? index.heTitle : sjs.library.hebrewCategory(filter),
          category: index ? index.categories[0] : filter };
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
        var index = sjs.library.index(filter);
        if (index) {
          var annotatedFilter = {book: filter, heBook: index.heTitle, category: index.categories[0] };
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
                key={book.book} 
                book={book.book}
                heBook={book.heBook}
                category={book.category}
                hideCounts={true}
                hideColors={true}
                count={book.count}
                updateRecent={false}
                setFilter={this.props.setFilter}
                on={$.inArray(book.book, this.props.filter) !== -1}
                onClick={function(){ sjs.track.event("Reader", "Top Filter Click", "1");}} />);
    }.bind(this));

    var moreButton = this.props.asHeader ? (<div className="showMoreFilters textFilter" style={style}
                        onClick={this.props.showAllFilters}>
                          <div>
                            <span className="dot">●</span><span className="dot">●</span><span className="dot">●</span>
                          </div>                    
                      </div>) : null;
    var style = this.props.asHeader ? {"borderTopColor": sjs.categoryColor(this.props.textCategory)} : {};
    var classes = classNames({recentFilterSet: 1, topFilters: this.props.asHeader, filterSet: 1});
    return (
      <div className={classes} style={style}>
        <div className="topFiltersInner">{topFilters}</div>
        {moreButton}
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
    versionLanguge:          React.PropTypes.string,
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
    var currentPath = window.location.pathname + window.location.search;
    var editText = this.props.canEditText ? function() {
      // TODO this is only an approximation
      
      var path = "/edit/" + this.props.srefs[0];
      if (this.props.version) {
        path += "/" + this.props.versionLanguage + "/" + this.props.version;
      }
      path += "?next=" + currentPath;
      window.location = path;
    }.bind(this) : null;
    var addTranslation = function() {
      window.location = "/translate/" + this.props.srefs[0] + "?next=" + currentPath;
    }.bind(this);
    var classes = classNames({toolsPanel: 1, textList: 1, fullPanel: this.props.fullPanel});
    return (
      <div className={classes}>
        <div className="texts">
          <div className="contentInner">
            <ToolsButton en="Share" he="שתף" icon="share-square-o" onClick={function() {this.props.setConnectionsMode("Share")}.bind(this)} /> 
            <ToolsButton en="Add to Source Sheet" he="הוסף לדף מקורות" icon="plus-circle" onClick={function() {this.props.setConnectionsMode("Add to Source Sheet")}.bind(this)} /> 
            <ToolsButton en="Add Note" he="הוסף רשומה" icon="pencil" onClick={function() {this.props.setConnectionsMode("Add Note")}.bind(this)} /> 
            <ToolsButton en="My Notes" he="הרשומות שלי" icon="file-text-o" onClick={function() {this.props.setConnectionsMode("My Notes")}.bind(this)} /> 
            <ToolsButton en="Compare" he="השווה" image="compare-64.png" onClick={this.props.openComparePanel} /> 
            <ToolsButton en="Add Translation" he="הוסף תרגום" icon="language" onClick={addTranslation} /> 
            <ToolsButton en="Add Connection" he="הוסף קישור לטקסט אחר" icon="link" onClick={function() {this.props.setConnectionsMode("Add Connection")}.bind(this)} /> 
            { editText ? (<ToolsButton en="Edit Text" he="ערוך טקסט" icon="edit" onClick={editText} />) : null }
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
      <div className="toolsButton" onClick={this.props.onClick}>
        {icon}
        <div className="en">{this.props.en}</div>
        <div className="he">{this.props.he}</div>
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
            <ToolsButton en="Facebook" he="פייסבוק" icon="facebook" onClick={shareFacebook} />
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
    sjs.library.sheets.userSheets(sjs._uid, function() {
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
      sjs.library.sheets.clearUserSheets(sjs._uid);
    }.bind(this)); 
  },
  openNewSheet: function() {
    this.setState({showNewSheetInput: true});
  },
  confirmAdd: function() {
    this.setState({confirm: true});
  },
  render: function() {
    if (this.state.confirm) {
      return (<ConfirmAddToSheetPanel sheetId={this.state.selectedSheet} />);
    }
    var sheets        = sjs.library.sheets.userSheets(sjs._uid);
    var sheetsContent = sheets ? sheets.map(function(sheet) {
      var classes     = classNames({sheet: 1, selected: this.state.selectedSheet == sheet.id});
      var selectSheet = function() { this.setState({selectedSheet: sheet.id}); }.bind(this);
      return (<div className={classes} onClick={selectSheet} key={sheet.id}>{sheet.title.stripHtml()}</div>);
    }.bind(this)) : <LoadingMessage />;
    sheetsContent     = sheets && sheets.length == 0 ? 
                          (<div className="sheet"><span className="en">You don&rsquo;t have any Source Sheets yet.</span><span className="he">טרם יצרת דפי מקורות</span></div>) :
                          sheetsContent; 
    var createSheet = this.state.showNewSheetInput ? 
          (<div>
            <input className="newSheetInput" placeholder="Title your Sheet"/>
            <div className="button white small" onClick={this.createSheet} >
              <span className="en">Create</span>
              <span className="he">צור חדש</span>
            </div>
           </div>)
          :
          (<div className="button white" onClick={this.openNewSheet}>
              <span className="en">Create a Source Sheet</span>
              <span className="he">צור דף מקורות חדש</span>
          </div>);
    var classes = classNames({addToSourceSheetPanel: 1, textList: 1, fullPanel: this.props.fullPanel});
    return (
      <div className={classes}>
        <div className="texts">
          <div className="contentInner">
            {createSheet}
            <div className="sourceSheetSelector">{sheetsContent}</div>
            <div className="button" onClick={this.addToSourceSheet}>
              <span className="en">Add to Sheet</span>
              <span className="he">הוסף לדף המקורות</span>
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
                <span className="en">Your source has been added.</span>
                <span className="he">הטקסט נוסף בהצלחה לדף המקורות</span>
              </div>
              <a className="button white" href={"/sheets/" + this.props.sheetId}>
                <span className="en">Go to Source Sheet <i className="fa fa-angle-right"></i></span>
                <span className="he">עבור לדף המקורות<i className="fa fa-angle-left"></i></span>
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
        sjs.alert.message(data.error);
      } else if (data) {
        if (this.props.noteId) {
          sjs.library.clearPrivateNotes(data);
        } else {
          sjs.library.addPrivateNote(data);
        }
        this.props.setConnectionsMode("My Notes");
      } else {
        sjs.alert.message("Sorry, there was a problem saving your note.");
      }
    }.bind(this)).fail( function(xhr, textStatus, errorThrown) {
      sjs.alert.message("Unfortunately, there was an error saving this note. Please try again or try reloading this page.");
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
        sjs.alert.message("Source deleted.");
        sjs.library.clearPrivateNotes();
        this.props.setConnectionsMode("My Notes");
      }.bind(this),
      error: function () {
        sjs.alert.message("Something went wrong (that's all I know).");
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

                      <span className="en"><i className="fa fa-lock"></i> Private</span>
                      <span className="he"><i className="fa fa-lock"></i>רשומה פרטית</span>
                    </div>
                    <div className={publicClasses} onClick={this.setPublic}>
                      <span className="en">Public</span>
                      <span className="he">רשומה כללית</span>
                    </div>
                  </div>
                  <div className="line"></div>
                  <div className="button fillWidth" onClick={this.saveNote}>
                    <span className="en">{this.props.noteId ? "Save" : "Add Note"}</span>
                    <span className="he">{this.props.noteId ? "שמור": "הוסף רשומה"}</span>
                  </div>
                  <div className="button white fillWidth" onClick={this.cancel}>
                    <span className="en">Cancel</span>
                    <span className="he">בטל</span>
                  </div>
                  {this.props.noteId ? 
                    (<div className="deleteNote" onClick={this.deleteNote}>
                      <span className="en">Delete Note</span>
                      <span className="he">מחק רשומה</span>
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
    sjs.library.privateNotes(this.props.srefs, this.rerender);
  },
  rerender: function() {
    this.forceUpdate();
  },
  render: function() {
    var myNotesData = sjs.library.privateNotes(this.props.srefs);
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
    var currentPath = window.location.pathname + window.location.search;
    var classes     = classNames({loginPanel: 1, textList: 1, fullPanel: this.props.fullPanel});
    return (<div className={classes}>
              <div className="texts">
                <div className="contentInner">

                  <div className="loginPanelMessage">
                    <span className="en">You must be logged in to use this feature.</span>
                    <span className="he">עליך להיות מחובר בכדי להשתמש באפשרות זו.</span>
                  </div>
                  <a className="button" href={"/login?next=" + currentPath}>
                    <span className="en">Log In</span>
                    <span className="he">התחבר</span>
                  </a>
                  <a className="button" href={"/register?next=" + currentPath}>
                    <span className="en">Sign Up</span>
                    <span className="he">הרשם</span>
                  </a>

                </div>
              </div>
            </div>);
  }
});


var SearchPage = React.createClass({
    propTypes: {
        query:                React.PropTypes.string,
        initialPage:          React.PropTypes.number,
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
        return {
            page: this.props.initialPage || 1
            //runningQuery: null,
            //isQueryRunning: false
        }
    },
    componentWillMount() {
    },
    getDefaultProps: function() {
      return {
        appliedFilters: []
      };
    },
    componentWillReceiveProps: function(nextProps) {
      /*
      if ((nextProps.query !== this.props.query)
      || (nextProps.appliedFilters.length !== this.props.appliedFilters.length)
      || !(nextProps.appliedFilters.every((v,i) => v === this.props.appliedFilters[i]))
      ) {
        this.updateQuery(nextProps.query, nextProps.appliedFilters);
      }
      */
    },
  /*
    updateRunningQuery: function(ajax) {
        this.setState({
            runningQuery: ajax,
            isQueryRunning: !!ajax
        })
    }, */
    render: function () {

        var style      = {"fontSize": this.props.settings.fontSize + "%"};
        var classes = classNames({readerNavMenu: 1, noHeader: this.props.hideNavHeader});
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
                  <div className="content">
                    <div className="contentInner">
                      <div className="searchContentFrame">
                          <h1>
                            <div className="languageToggle" onClick={this.props.toggleLanguage}>
                              <span className="en">א</span>
                              <span className="he">A</span>
                            </div>
                            <span className="en">&ldquo;{ this.props.query }&rdquo;</span>
                            <span className="he">&rdquo;{ this.props.query }&ldquo;</span>
                          </h1>
                          <div className="searchControlsBox">
                          </div>
                          <div className="searchContent" style={style}>
                              <SearchResultList
                                  query = { this.props.query }
                                  page = { this.state.page }
                                  appliedFilters = {this.props.appliedFilters}
                                  onResultClick={this.props.onResultClick}
                                  updateAppliedFilter = {this.props.updateAppliedFilter}
                                  registerAvailableFilters={this.props.registerAvailableFilters}
                                  availableFilters={this.props.availableFilters}
                                  filtersValid={this.props.filtersValid}
                              />
                          </div>
                      </div>
                    </div>
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
        page:                 React.PropTypes.number,
        size:                 React.PropTypes.number,
        onResultClick:        React.PropTypes.func,
        filtersValid:         React.PropTypes.bool,
        availableFilters:     React.PropTypes.array,
        updateAppliedFilter:  React.PropTypes.func,
        registerAvailableFilters: React.PropTypes.func
    },
    getDefaultProps: function() {
        return {
            page: 1,
            size: 100,
            appliedFilters: []
        };
    },
    getInitialState: function() {
        return {
            runningQuery: null,
            isQueryRunning: false,
            total: 0,
            textTotal: 0,
            sheetTotal: 0,
            textHits: [],
            sheetHits: []
        }
    },
    updateRunningQuery: function(ajax) {
        this.setState({
          runningQuery: ajax,
          isQueryRunning: !!ajax
        });
    },
    _abortRunningQuery: function() {
        if(this.state.runningQuery) {
            this.state.runningQuery.abort();
        }
        this.updateRunningQuery(null);
    },
    componentDidMount: function() {
        this._executeQuery();
    },
    componentWillMount() {
    },
    componentWillUnmount: function() {
        this._abortRunningQuery();
    },
    componentWillReceiveProps: function(newProps) {
        if(this.props.query != newProps.query) {
           this.setState({
                total: 0,
                textTotal: 0,
                sheetTotal: 0,
                textHits: [],
                sheetHits: []
           });
           this._executeQuery(newProps)
        }
        else if (
        (this.props.appliedFilters.length !== newProps.appliedFilters.length) ||
          !(this.props.appliedFilters.every((v,i) => v === newProps.appliedFilters[i]))) {
           this._executeQuery(newProps)
        }
        else if (this.props.size != newProps.size || this.props.page != newProps.page) {
          this._executeQuery(newProps);
        }
        // Execute a second query to apply filters after an initial query which got available filters
        else if ((this.props.filtersValid != newProps.filtersValid) && this.props.appliedFilters.length > 0) {
           this._executeQuery(newProps);
        }
    },
    _executeQuery: function(props) {
        //This takes a props object, so as to be able to handle being called from componentWillReceiveProps with newProps
        props = props || this.props;
        if (!props.query) {
            return;
        }

        this._abortRunningQuery();

        // If there are no available filters yet, don't apply filters.  Split into two queries:
        // 1) Get all potential filters and counts
        // 2) Apply filters (Triggered from componentWillReceiveProps)
        var request_applied = props.filtersValid && props.appliedFilters;

        var runningQuery = sjs.library.search.execute_query({
            query: props.query,
            get_filters: !props.filtersValid,
            applied_filters: request_applied,
            size: props.page * props.size,
            success: function(data) {
                this.updateRunningQuery(null);
                if (this.isMounted()) {
                    var hitarrays = this._process_hits(data.hits.hits);
                    this.setState({
                        textHits: hitarrays.texts,
                        sheetHits: hitarrays.sheets,
                        total: data.hits.total,
                        textTotal: hitarrays.texts.length,
                        sheetTotal: hitarrays.sheets.length
                    });
                    if (data.aggregations) {
                      var ftree = this._buildFilterTree(data.aggregations.category.buckets);
                      var orphans = this._applyFilters(ftree, this.props.appliedFilters);
                      this.props.registerAvailableFilters(ftree.availableFilters, ftree.registry, orphans);
                    }
                }
            }.bind(this),
            error: function(jqXHR, textStatus, errorThrown) {
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
            }.bind(this)
        });
        this.updateRunningQuery(runningQuery);
    },
    _process_hits: function(hits) {
        var comparingRef = null;
        var newHits = [];
        var sheetHits = [];

        for(var i = 0, j = 0; i < hits.length; i++) {
            if (hits[i]._type == "sheet") { //Assume that the rest of the array is sheets, slice and return.
                sheetHits = hits.slice(i);
                break;
            }

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
        return {
            texts: newHits,
            sheets: sheetHits
        };
    },
    _buildFilterTree(aggregation_buckets) {
      //returns object w/ keys 'availableFilters', 'registry'
      //Add already applied filters w/ empty doc count?
      var rawTree = {};
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
      //Aggregate counts, then sort rawTree into filter objects and add Hebrew using sjs.toc as reference
      //Nod to http://stackoverflow.com/a/17546800/213042
      var path = [];
      var filters = [];
      var registry = {};
      /*
      //Manually add base commentary branch
      var commentaryNode = new sjs.FilterNode();
      var rnode = rawTree["Commentary"];
      if (rnode) {
          $.extend(commentaryNode, {
              "title": "Commentary",
              "path": "Commentary",
              "heTitle": "מפרשים",
              "doc_count": rnode.doc_count
          });
          //ftree.registry[commentaryNode.path] = commentaryNode;
      }
      //End commentary base hack
      */
      for(var j = 0; j < sjs.toc.length; j++) {
          var b = walk.call(this, sjs.toc[j]);
          if (b) filters.push(b);
      }
      return {availableFilters: filters, registry: registry};

      //if (rnode) this.state.children.append(commentaryNode);

      function walk(branch, parentNode) {
          var node = new sjs.library.search.FilterNode();

          if("category" in branch) { // Category node
              /*if(branch["category"] == "Commentary") { // Special case commentary

                  path.unshift(branch["category"]);  // Place "Commentary" at the *beginning* of the path
                   $.extend(node, {
                       "title": parentNode.title,
                       "path": path.join("/"),
                       "heTitle": parentNode.heTitle
                   });
              } else {*/
                  path.push(branch["category"]);  // Place this category at the *end* of the path
                  $.extend(node, {
                     "title": path.slice(-1)[0],
                     "path": path.join("/"),
                     "heTitle": branch["heCategory"]
                  });
              //}
              for(var j = 0; j < branch["contents"].length; j++) {
                  var b = walk.call(this, branch["contents"][j], node);
                  if (b) node.append(b);
              }
          }
          else if ("title" in branch) { // Text Node
              path.push(branch["title"]);
              $.extend(node, {
                 "title": path.slice(-1)[0],
                 "path": path.join("/"),
                 "heTitle": branch["heTitle"]
              });
          }

          try {
              var rawNode = rawTree;
              var i;
              for (i = 0; i < path.length; i++) {
                  //For TOC nodes that we don't have results for, this will throw an exception, caught below.
                  rawNode = rawNode[path[i]];
              }

              node["docCount"] = rawNode.docCount;
              // Do we need both of these in the registry?
              registry[node.getId()] = node;
              registry[node.path] = node;
              /*
                if(("category" in branch) && (branch["category"] == "Commentary")) {  // Special case commentary
                  commentaryNode.append(node);
                  path.shift();
                  return false;
              }
              */
              path.pop();
              return node;
          }
          catch (e) {
            /*
            if(("category" in branch) && (branch["category"] == "Commentary")) {  // Special case commentary
                  path.shift();
              } else {
              */
              path.pop();
              //}
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

    render: function () {
        if (!(this.props.query)) {  // Push this up? Thought is to choose on the SearchPage level whether to show a ResultList or an EmptySearchMessage.
            return null;
        }

        return (
            <div>
                <SearchFilters
                  query = {this.props.query}
                  total = {this.state.total}
                  textTotal = {this.state.textTotal}
                  sheetTotal = {this.state.sheetTotal}
                  availableFilters={this.props.availableFilters}
                  appliedFilters = {this.props.appliedFilters}
                  updateAppliedFilter = {this.props.updateAppliedFilter}
                  isQueryRunning = {this.state.isQueryRunning} />
                {this.state.textHits.map(function(result) {
                    return (<SearchTextResult
                              data={result}
                              query={this.props.query}
                              key={result._id}
                              onResultClick={this.props.onResultClick} />);
                }.bind(this))}
                {this.state.sheetHits.map(function(result) {
                    return (<SearchSheetResult
                              data={result}
                              query={this.props.query}
                              key={result._id} />);
                }.bind(this))}
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
    isQueryRunning:       React.PropTypes.bool
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
  componentWillMount() {
  },
  componentWillUnmount() {
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
  render: function() {
    var addCommas = function(number) { return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); };
    var totalWithCommas = addCommas(this.props.total);
    var totalSheetsWithCommas = addCommas(this.props.sheetTotal);
    var totalTextsWithCommas = addCommas(this.props.textTotal);

    var totalBreakdown = (
      <span className="results-breakdown">&nbsp;
        <span className="he">({totalTextsWithCommas} {(this.props.textTotal > 1) ? "מקורות":"מקור"}, {totalSheetsWithCommas} {(this.props.sheetTotal > 1)?"דפי מקורות":"דף מקורות"})</span>
        <span className="en">({totalTextsWithCommas} {(this.props.textTotal > 1) ? "Texts":"Text"}, {totalSheetsWithCommas} {(this.props.sheetTotal > 1)?"Sheets":"Sheet"})</span>
      </span>);

    var enFilterLine = (!!this.props.appliedFilters.length && !!this.props.total)?(": " + this.getSelectedTitles("en").join(", ")):"";
    var heFilterLine = (!!this.props.appliedFilters.length && !!this.props.total)?(": " + this.getSelectedTitles("he").join(", ")):"";

    var summaryLines = (
      <div className="results-count">
          <span className="en">{totalWithCommas} Results{enFilterLine}</span>
          <span className="he">{totalWithCommas} תוצאות{heFilterLine}</span>
          {(this.state.sheet_total > 0 && this.state.text_total > 0) ? totalBreakdown : null}
      </div>);

    var runningQueryLine = (<LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />);
    var show_filters_classes = (this.state.displayFilters) ? "fa fa-caret-down fa-angle-down":"fa fa-caret-down";
    var filter_panel = (<div>
          <div className="searchFilterToggle" onClick={this.toggleFilterView}>
            <span className="en">Filter by Text   </span>
            <span className="he">סנן לפי כותר   </span>
            <i className={show_filters_classes} />
          </div>
          <div className="searchFilterBoxes" style={{display: this.state.displayFilters?"block":"none"}}>
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
      <div className="searchTopMatter">
        <div className="searchStatusLine">
        { (this.props.isQueryRunning) ? runningQueryLine : summaryLines }
        </div>
        { (this.props.textTotal > 0) ? filter_panel : "" }
      </div>)
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
        <input type="checkbox" className="filter" checked={this.state.selected == 1} onChange={this.handleFilterClick}/>
        <span className="en"><span className="filter-title">{this.props.filter.title}</span> <span className="filter-count">({this.props.filter.docCount})</span></span>
        <span className="he" dir="rtl"><span className="filter-title">{this.props.filter.heTitle}</span> <span className="filter-count">({this.props.filter.docCount})</span></span>
        {this.props.isInFocus?<span className="en"><i className="in-focus-arrow fa fa-caret-right"/></span>:""}
        {this.props.isInFocus?<span className="he"><i className="in-focus-arrow fa fa-caret-left"/></span>:""}

      </li>
      )
  }
});


var SearchTextResult = React.createClass({
    propTypes: {
        query: React.PropTypes.string,
        data: React.PropTypes.object,
        key: React.PropTypes.string,
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
            this.props.onResultClick(s.ref, s.version, s.lang, {"highlight": this.props.query}); //highlight not yet handled, above in ReaderApp.handleNavigationClick()
        }
    },
    render: function () {
        var data = this.props.data;
        var s = this.props.data._source;
        var href = '/' + normRef(s.ref) + "/" + s.lang + "/" + s.version.replace(/ +/g, "_") + '?qh=' + this.props.query;

        function get_snippet_markup() {
            var snippet;
            if (data.highlight && data.highlight["content"]) {
                snippet = data.highlight["content"].join("...");
            } else {
                snippet = s["content"];
            }
            snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").html();
            return {__html:snippet}
        }

        var more_results_caret =
            (this.state.duplicatesShown)
            ? <i className="fa fa-caret-down fa-angle-down"></i>
            : <i className="fa fa-caret-down"></i>;

        var more_results_indicator = (!(data.duplicates)) ? "" :
                <div className='similar-trigger-box' onClick={this.toggleDuplicates}>
                    <span className='similar-title he'>
                        { data.duplicates.length } {(data.duplicates.length > 1) ? " גרסאות נוספות" : " גרסה נוספת"}
                    </span>
                    <span className='similar-title en'>
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
            <div className="result">
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
        data: React.PropTypes.object,
        key: React.PropTypes.string
    },
    render: function() {
        var data = this.props.data;
        var s = this.props.data._source;

        var snippet = data.highlight ? data.highlight.content.join("...") : s.content;
        snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").text();

        function get_version_markup() {
            return {__html: s.version};
        }
        var clean_title = $("<span>" + s.title + "</span>").text();
        var href = "/sheets/" + s.sheetId;
        return (<div className='result'>
            <a className='result-title' href={href}>{clean_title}</a>
            <div className="snippet">{snippet}</div>
            <div className='version' dangerouslySetInnerHTML={get_version_markup()} ></div>
            </div>);
    }
});


var AccountPanel = React.createClass({
  render: function() {
    var width = $(window).width();
    var accountContent = [
      (<BlockLink target="/my/profile" title="Profile" heTitle="פרופיל"/>),
      (<BlockLink target="/sheets/private" title="Source Sheets" heTitle="דפי מקורות" />),
      (<BlockLink target="#" title="Reading History" heTitle="היסטוריה קריאה" />),
      (<BlockLink target="#" title="Notes" heTitle="רשומות" />),
      (<BlockLink target="/settings/account" title="Settings" heTitle="הגדרות" />),
      (<BlockLink target="/logout" title="Log Out" heTitle="ניתוק" />)
    ];
    accountContent = (<TwoOrThreeBox content={accountContent} width={width} />);

    var learnContent = [
      (<BlockLink target="/about" title="About" heTitle="אודות" />),
      (<BlockLink target="/faq" title="FAQ" heTitle="שאלות נפוצות" />),
      (<BlockLink target="http://blog.sefaria.org" title="Blog" heTitle="בלוג" />),
      (<BlockLink target="/educators" title="Educators" heTitle="מחנכים" />),
      (<BlockLink target="/help" title="Help" heTitle="עזרה" />),
      (<BlockLink target="/team" title="Team" heTitle="צוות" />)
    ];

    learnContent = (<TwoOrThreeBox content={learnContent} width={width} />);

    var contributeContent = [
      (<BlockLink target="/activity" title="Recent Activity" heTitle="פעילות אחרונה" />),
      (<BlockLink target="/metrics" title="Metrics" heTitle="מדדים" />),
      (<BlockLink target="/contribute" title="Contribute" heTitle="הצטרפות לעשיה" />),
      (<BlockLink target="/donate" title="Donate" heTitle="תרומות" />),
      (<BlockLink target="/supporters" title="Supporters" heTitle="תומכים" />),
      (<BlockLink target="/jobs" title="Jobs" heTitle="דרושים" />),
    ];
    contributeContent = (<TwoOrThreeBox content={contributeContent} width={width} />);

    var connectContent = [
      (<BlockLink target="https://groups.google.com/forum/?fromgroups#!forum/sefaria" title="Forum" heTitle="פורום" />),
      (<BlockLink target="http://www.facebook.com/sefaria.org" title="Facebook" heTitle="פייסבוק" />),
      (<BlockLink target="http://twitter.com/SefariaProject" title="Twitter" heTitle="טוויטר" />),      
      (<BlockLink target="http://www.youtube.com/user/SefariaProject" title="YouTube" heTitle="יוטיוב" />),
      (<BlockLink target="http://www.github.com/Sefaria" title="GitHub" heTitle="גיטהאב" />),
      (<BlockLink target="mailto:hello@sefaria.org" title="Email" heTitle='אימייל' />)
    ];
    connectContent = (<TwoOrThreeBox content={connectContent} width={width} />);

    return (
      <div className="accountPanel readerNavMenu">
        <div className="content">
          <div className="contentInner">
           <ReaderNavigationMenuSection title="Account" heTitle="חשבון משתמש" content={accountContent} />
           <ReaderNavigationMenuSection title="Learn" heTitle="לימוד" content={learnContent} />
           <ReaderNavigationMenuSection title="Contribute" heTitle="עשייה" content={contributeContent} />
           <ReaderNavigationMenuSection title="Connect" heTitle="התחברות" content={connectContent} />
          </div>
        </div>
      </div>
      );
  }
});


var NotificationsPanel = React.createClass({
    render: function() {
    return (
      <div className="notifcationsPanel readerNavMenu">
        <div className="content">
          <div className="contentInner">
           <center>Notifications Coming Soon!</center>
          </div>
        </div>
      </div>
      );
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
                  {row[0] ? (<td>{row[0]}</td>) : null}
                  {row[1] ? (<td>{row[1]}</td>) : null}
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
              <span className="en">{message}</span>
              <span className="he">{heMessage}</span>
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


function openInNewTab(url) {
  var win = window.open(url, '_blank');
  win.focus();
}


var backToS1 = function() { 
  $.cookie("s2", "", {path: "/"});
  window.location = "/";
};

if (exports) {
  // Make this a CommonJS module if it's run from Node 
  exports.ReaderApp        = ReaderApp;
  exports.ReaderPanel      = ReaderPanel;
  exports.ConnectionsPanel = ConnectionsPanel;
  exports.TextRange        = TextRange;
  exports.TextColumn       = TextColumn;
}