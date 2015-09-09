var sjs = sjs || {};
var cx  = React.addons.classSet;


var ReaderApp = React.createClass({
  propTypes: {
    initialRef:       React.PropTypes.string,
    initialFilter:    React.PropTypes.array,
    initialMenu:      React.PropTypes.string,
    initialQuery:     React.PropTypes.string,
    initialSheetsTag: React.PropTypes.string,
    initialSettings:  React.PropTypes.object
  },
  getInitialState: function() {
    if (this.props.initialRef) {
      var contents = [{type: "TextColumn", refs: [this.props.initialRef], scrollTop: 20 }];
      if (this.props.initialFilter) {
        contents.push({type: "TextList", ref: this.props.initialRef, scrollTop: 0 });
      }      
    } else {
      var contents = [];
    }

    return {
      contents: contents,
      filter: this.props.initialFilter || [],
      recentFilters: [],
      settings: this.props.initialSettings || {
        language:      "english",
        layoutDefault: "segmented",
        layoutTalmud:  "continuous",
        layoutTanach:  "segmented",
        color:         "light",
        fontSize:      62.5
      },
      menuOpen: this.props.initialMenu || null, // "navigation", "text toc", "display", "search", "sheets"
      navigationCategories: null,
      navigationSheetTag: null,
      searchQuery: this.props.initialQuery || null,
      navigationSheetTag: this.props.initialSheetsTag || null
    }
  },
  componentDidMount: function() {
    window.addEventListener("popstate", this.handlePopState);
    window.addEventListener("scroll", this.handleScroll);

    var hist = this.makeHistoryState()
    history.replaceState(hist.state, hist.title, hist.url);

    $("#readerControls").headroom();
    this.updateHeadroom();

    $("#top").hide();
  },
  componentWillUnmount: function() {
    window.removeEventListener("popstate", this.handlePopState);
    window.removeEventListener("scroll", this.handleScroll);
  },
  componentDidUpdate: function() {
    this.updateHistoryState();
    this.updateHeadroom();
  },
  rerender: function() {
    this.setState({});
    this.adjustInfiniteScroll();
  },
  shouldHistoryUpdate: function() {
    // Compare the current history state to the current content state,
    // Return true if the change warrants pushing to history.
    var state   = history.state;
    var hist    = state.contents.slice(-1)[0];
    var current = this.currentContent();
    if (!state || !hist || !current) { 
      return true;
    }
    if (hist.type !== current.type) { 
      return true;
    } else if (state.menuOpen !== this.state.menuOpen) {
      if (state.menuOpen !== "display" && this.state.menuOpen !== "display") {
       return true;
      }
    } else if (state.searchQuery !== this.state.searchQuery) {
      return true;
    } else if (state.navigationSheetTag !== this.state.navigationSheetTag) {
      return true;
    } else if (current.type === "TextColumn") {
      if (current.refs.slice(-1)[0] !== hist.refs.slice(-1)[0]) {
        return true;
      }
    } else if (current.type === "TextList") {
      if (current.ref !== hist.ref) {
        return true;
      }
    }

    return false;  
  },
  makeHistoryState: function() {
    // Returns an object with state, title and url params for the current state
    var current = this.currentContent();
    var hist = {state: this.state};
    if (this.state.menuOpen) {
      hist.state.replaceHistory = false;
      switch (this.state.menuOpen) {
        case "navigation":
          hist.title = "Texts | Sefaria";
          hist.url   = "/texts";
          break;
        case "text toc":
          hist.title = this.currentBook() || "";
          hist.url   = "/" + hist.title.replace(/ /g, "_");
          break;
        case "search":
          hist.title = "Sefaria Search";
          hist.url   = "/search?q=" + this.state.searchQuery;
          break;
        case "sheets":
          if (this.state.navigationSheetTag) { 
            hist.url   = "/sheets/tags/" + this.state.navigationSheetTag; 
            hist.title = this.state.navigationSheetTag + " | Sefaria Source Sheets";
          } else {
            hist.url   = "/sheets";
            hist.title = "Sefaria Source Sheets";
          }
          break;
      }
    } else if (current.type === "TextColumn") {
      hist.title = current.refs.slice(-1)[0];
      hist.url = "/" + normRef(hist.title);
    } else if (current.type == "TextList") {
      var sources = this.state.filter.length ? this.state.filter[0] : "all";
      hist.title = current.ref  + " with " + (sources === "all" ? "Connections" : sources);;
      hist.url = "/" + normRef(current.ref) + "?with=" + sources;
    }
    // for testing
    if (window.location.pathname.indexOf("/s2") === 0) { hist.url = "/s2" + hist.url}
    return hist;
  },
  updateHistoryState: function() {
    if (this.shouldHistoryUpdate()) {
      var hist = this.makeHistoryState();
      if (this.state.replaceHistory) {
        //console.log("replace " + hist.title)
        history.replaceState(hist.state, hist.title, hist.url);
        $("title").html(hist.title);
      } else {
        //console.log("push " + hist.title)
        history.pushState(hist.state, hist.title, hist.url);
        $("title").html(hist.title);
        if (hist.state.type == "TextColumn") {
          sjs.track.open(hist.title);
        } else if (hist.state.type == "TextList") {
          sjs.track.event("Reader", "Open Close Reader", hist.title);
        }           
      }
    }
  },
  handlePopState: function(event) {
    var state = event.state;
    if (state) {
      var from = this.currentMode();
      var to   = state.contents.slice(-1)[0] ? state.contents.slice(-1)[0].type : null
      var kind = from + " to " + to;
      sjs.track.event("Reader", "Pop State", kind);
      this.setState(state);
    }
  },
  handleScroll: function(event) {
    if (this.state.contents.length) {
      this.currentContent().scrollTop = $(window).scrollTop();
      this.setState({contents: this.state.contents});
    }
    this.adjustInfiniteScroll();
  },
  adjustInfiniteScroll: function() {
    var current = this.currentContent();
    if (current && current.type === "TextColumn") {
      var $lastText    = $(".textRange.basetext").last();
      var lastTop      = $lastText.offset().top;
      var lastBottom   = lastTop + $lastText.outerHeight();
      var windowTop    = $(window).scrollTop();
      var windowBottom = windowTop + $(window).height();
      if (lastTop > (windowBottom + 100) && current.refs.length > 1) { 
        // Remove a section scrolled out of view on bottom
        current.refs = current.refs.slice(0,-1);
        this.setState({contents: this.state.contents});
      } else if ( lastBottom < windowBottom ) {
        // Add the next section to bottom
        if ($lastText.hasClass("loading")) { 
          return;
        }
        currentRef = current.refs.slice(-1)[0];
        data       = sjs.library.ref(currentRef);
        if (data && data.next) {
          current.refs.push(data.next);
          this.setState({contents: this.state.contents, replaceHistory: true});
        }
        sjs.track.event("Reader", "Infinite Scroll", "Down");
      } else if (windowTop < 10 && !this.state.loadingContentAtTop) {
        // Scroll up for previous
        topRef = current.refs[0];
        data   = sjs.library.ref(topRef);
        if (data && data.prev) {
          current.refs.splice(current.refs, 0, data.prev);
          this.setState({contents: this.state.contents, replaceHistory: true, loadingContentAtTop: true});
        }
        sjs.track.event("Reader", "Infinite Scroll", "Up");
      } else {
        // nothing happens
      }
    } 
  },
  updateHeadroom: function() {
    var mode = this.currentMode();
    if (mode === "TextList") {
      $("#readerControls").addClass("headroomOff");
    } else {
      $("#readerControls").removeClass("headroomOff");
    }
  },
  showTextList: function(ref) {
    this.state.contents.push({type: "TextList", ref: ref, scrollTop: 0});
    this.setState({contents: this.state.contents });
  },
  showBaseText: function(ref, replaceHistory) {
    // Set the current primary text
    // `replaceHistory` - bool whether to replace browser history rather than push for this change
    replaceHistory = typeof replaceHistory === "undefined" ? false : replaceHistory;
    this.setState({
      contents: [{type: "TextColumn", refs: [ref], scrollTop: 20 }],
      filter: [],
      recentFilters: [],
      replaceHistory: replaceHistory,
      menuOpen: null
    });
  },
  backToText: function() {
    // Return to the original text in the ReaderApp contents
    this.state.contents = [this.state.contents[0]];
    this.setState({contents: this.state.contents});
  },  
  closeMenus: function() {
    // If there's no content to show, return to navigation
    var state = {
      menuOpen: this.state.contents.length ? null: "navigation",
      searchQuery: null,
      navigationSheetTag: null
    }
    this.setState(state);
  },
  openMenu: function(menu) {
    this.setState({
      menuOpen: menu,
      searchQuery: null,
      navigationSheetTag: null
    });
  },
  setNavigationCategories: function(categories) {
    this.setState({navigationCategories: categories});
  },
  setSheetTag: function (tag) {
    this.setState({navigationSheetTag: tag});
  },
  setSearchQuery: function (query) {
    this.setState({searchQuery: query});
  },
  setFilter: function(filter, updateRecent) {
    // Sets the current filter for Connected Texts (TextList)
    // If updateRecent is true, include the curent setting in the list of recent filters.
    if (updateRecent) {
      if ($.inArray(filter, this.state.recentFilters) !== -1) {
        this.state.recentFilters.toggle(filter);
      }
      this.state.recentFilters = [filter].concat(this.state.recentFilters);
    }
    this.setState({recentFilters: this.state.recentFilters, filter: [filter]});
    $(window).scrollTop(0);
  },
  openSearch: function(query) {
    this.setState({
      menuOpen: "search",
      searchQuery: query
    });
  },
  navigateReader: function(direction) {
    var current = this.currentContent();
    if (current.type === "TextColumn") {
      // Navigate Sections in text view
      var data = this.currentData();
      if (direction in data && data[direction]) {
        this.showBaseText(data[direction]);
      }
    } else if (current.type === "TextList") {
      // Navigate Segments in close reader view
      var segmentRef = sjs.library.text(current.ref)[direction + "Segment"];
      if (segmentRef) {
        this.showTextList(segmentRef);
      } else {
        var sectionRef = sjs.library.text(current.ref)[direction];
        if (sectionRef) {
          sjs.library.text(sectionRef, {}, function(data) {
              if (direction === "prev") {
                var segment = Math.max(data.text.length, data.he.length);
                var segment = sjs.library.text(sectionRef + ":" + segment);
              } else if (direction === "next") {
                var segment = sjs.library.text(g + ":1");
              }
              if (segment && segment.ref) {
                this.showTextList(segment.ref);
              }
          }.bind(this));
        }
      }
    }
  },
  navNext: function() {
    this.navigateReader("next");
  },
  navPrevious: function() {
    this.navigateReader("prev");
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
    this.setState({settings: this.state.settings});
    $.cookie(option, value, {path: "/"});
    if (option === "language") {
      $.cookie("contentLang", value, {path: "/"});
    }

    if (option === "color") {
      // Needed because of the footer space left by base.html, remove after switching bases
      $("body").removeClass("light sepia dark").addClass(value);
    }
  },
  setScrollTop: function() {
    var current = this.currentContent();
    if (current && current.type === "TextColumn") {
      if (this.state.loadingContentAtTop) {
        // After adding content by infinite scrolling up, scroll back to what the user was just seeing
        var $reader = $(React.findDOMNode(this));
        var adjust  = $reader.offset().top + parseInt($reader.find(".textColumn").css("padding-top").replace("px", ""));
        var top     = $reader.find(".basetext").first().position().top - adjust;
        this.setState({loadingContentAtTop: false});
      } else if (current.scrollTop !== 20) {
        // restore the previously saved scrollTop
        var top = current.scrollTop;
      } else if ($(".segment.highlight").length) {
        // scroll to highlighted segment
        var top = $(".segment.highlight").first().position().top - ($(window).height() / 3);
      } else {
        var top = 20; // below zero to give room to scroll up for previous
      }      
    } else if (current && current.type === "TextList") {
      if (current.scrollTop) {
        var top = current.scrollTop;
      } else {
        var top = 0;
      }
    }
    $(window).scrollTop(top);
  },
  currentContent: function() {
    // Returns the current content item
    return this.state.contents.slice(-1)[0] || null;
  },
  currentMode: function () {
    // Returns the type of the current reader item - TextColumn, TextList
    return this.currentContent() ? this.currentContent().type : null;
  },
  currentRef: function() {
    var item = this.currentContent();
    return item ? (item.ref || item.refs.slice(-1)[0]) : null;
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
    return data ? data.indexTitle : null;
  },
  currentCategory: function() {
    var data = this.currentData();
    return data ? data.categories[0] : null;
  },
  currentLayout: function() {
    var category = this.currentCategory();
    if (!category) { return null; }
    var option = category === "Tanach" || category === "Talmud" ? "layout" + category : "layoutDefault";
    return this.state.settings[option];  
  },
  render: function() {
    var classes  = {};
    classes[this.currentLayout()]         = 1;
    classes[this.state.settings.language] = 1;
    classes[this.state.settings.color]    = 1;
    classes = cx(classes);
    style = {"fontSize": this.state.settings.fontSize + "%"};
    var items = this.state.contents.slice(-1).map(function(item, i) {
      if (item.type === "TextColumn") {
        var content = item.refs.map(function(ref, k) {
          return (<TextRange 
            sref={ref}
            basetext={true}
            withContext={true}
            loadLinks={true}
            prefetchNextPrev={true}
            settings={this.state.settings}
            setOption={this.setOption}
            setScrollTop={this.setScrollTop}
            showBaseText={this.showBaseText} 
            showTextList={this.showTextList}
            rerender={this.rerender} 
            key={k + ref} />);      
        }.bind(this));
        return (<div className='textColumn'>{content}</div>);
      } else if (item.type === "TextList") {
        return (
          <TextList 
            sref={item.ref} 
            main={true}
            filter={this.state.filter}
            recentFilters={this.state.recentFilters}
            setFilter={this.setFilter}
            setScrollTop={this.setScrollTop}
            showTextList={this.showTextList}
            showBaseText={this.showBaseText} 
            backToText={this.backToText} 
            key={1} />
        );
      }
    }.bind(this));
    
    if (this.state.menuOpen === "navigation") {
      var menu = (<ReaderNavigationMenu 
                    closeNav={this.closeMenus}
                    openSearch={this.openSearch}
                    openMenu={this.openMenu}
                    showBaseText={this.showBaseText} />);
    } else if (this.state.menuOpen === "text toc") {
      var menu = (<ReaderTextTableOfContents 
                    close={this.closeMenus}
                    text={this.currentBook()}
                    category={this.currentCategory()}
                    currentRef={this.currentRef()}
                    openNav={this.openMenu.bind(null, "navigation")}
                    showBaseText={this.showBaseText} />);
    } else if (this.state.menuOpen === "display") {
      var menu = (<ReaderDisplayOptionsMenu
                    settings={this.state.settings}
                    setOption={this.setOption}
                    currentLayout={this.currentLayout} />);
    } else if (this.state.menuOpen === "search") {
      var settings = {query: this.state.searchQuery, page: 1};
      var menu = (<SearchPage
                    initialSettings={settings}
                    onResultClick={this.showBaseText}
                    onQueryChange={this.setSearchQuery}
                    close={this.closeMenus} />);
    } else if (this.state.menuOpen === "sheets") {
      var menu = (<SheetsNav
                    openNav={this.openMenu.bind(null, "navigation")}
                    close={this.closeMenus}
                    initialTag={this.state.navigationSheetTag}
                    setSheetTag={this.setSheetTag} />);
    }  else {
      var menu = "";
    }

    return (
      <div id="readerApp" className={classes}>
        <ReaderControls
          showBaseText={this.showBaseText}
          currentRef={this.currentRef}
          currentMode={this.currentMode}
          currentCategory={this.currentCategory}
          currentBook={this.currentBook}
          settings={this.state.settings}
          setOption={this.setOption}
          openMenu={this.openMenu}
          closeMenus={this.closeMenus}
          currentLayout={this.currentLayout} />
          <div id="readerContent" style={style}>
            {items}
          </div>
          {menu}
          {this.state.menuOpen === "display" ? (<div id="mask" onClick={this.closeMenus}></div>) : ""}
      </div>
    );
  }
});


var ReaderControls = React.createClass({
  // The Header of a Reader panel which contains controls for 
  // display, navigation etc.
  propTypes: {
    settings:                React.PropTypes.object.isRequired,
    showBaseText:            React.PropTypes.func.isRequired,
    setOption:               React.PropTypes.func.isRequired,
    openMenu:                React.PropTypes.func.isRequired,
    closeMenus:              React.PropTypes.func.isRequired,
    currentRef:              React.PropTypes.func.isRequired,
    currentMode:             React.PropTypes.func.isRequired,
    currentCategory:         React.PropTypes.func.isRequired,
    currentBook:             React.PropTypes.func.isRequired,
    currentLayout:           React.PropTypes.func.isRequired
  },
  render: function() {
    var lineStyle = {backgroundColor: sjs.categoryColor(this.props.currentCategory())};
    var title = this.props.currentBook();
    var index = sjs.library.index(title);
    var heTitle = index ? index.heTitle : "";
    return (
      <div>
        <div id="readerControls" className="headroom">
          <div className="categoryColorLine" style={lineStyle}></div>
          <div id="readerNav"  onClick={this.props.openMenu.bind(null, "navigation")}><i className="fa fa-search"></i></div>
          <div id="readerTextToc" onClick={this.props.openMenu.bind(null, "text toc")}>
            { title ? (<i className="fa fa-caret-down invisible"></i>) : "" }
            <div className="readerTextTocBox">
              <span className="en">{title}</span>
              <span className="he">{heTitle}</span>
            </div>
            { title ? (<i className="fa fa-caret-down"></i>) : "" }

          </div>
          <div id="readerOptions" onClick={this.props.openMenu.bind(null, "display")}><i className="fa fa-bars"></i></div>
        </div>        
      </div>);
  }
});

var ReaderDisplayOptionsMenu = React.createClass({
  propTyps: {
    setOption:     React.PropTypes.func.isRequired,
    settings:      React.PropTypes.object.isRequired,
    currentLayout: React.PropTypes.func.isRequired,

  },
  render: function() {
    var languageOptions = [
      {name: "english",   image: "/static/img/english.png" },
      {name: "bilingual", image: "/static/img/bilingual.png" },
      {name: "hebrew",    image: "/static/img/hebrew.png" }
    ];
    var languageToggle = (
        <ToggleSet
          name="language"
          options={languageOptions}
          setOption={this.props.setOption}
          settings={this.props.settings} />);
    
    var layoutOptions = [
      {name: "continuous", image: "/static/img/paragraph.png" },
      {name: "segmented", image: "/static/img/lines.png" },
    ];
    var layoutToggle = this.props.settings.language !== "bilingual" ? 
      (<ToggleSet
          name="layout"
          options={layoutOptions}
          setOption={this.props.setOption}
          currentLayout={this.props.currentLayout}
          settings={this.props.settings} />) : "";

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

    return (<div id="readerOptionsPanel">
        {languageToggle}
        {layoutToggle}
        <div className="line"></div>
        {colorToggle}
        {sizeToggle}
      </div>);
  }

});

var ReaderNavigationMenu = React.createClass({
  // The Navigation menu for broswing and search texts, other side links.
  propTypes: {
    closeNav:     React.PropTypes.func.isRequired,
    openSearch:   React.PropTypes.func.isRequired,
    showBaseText: React.PropTypes.func.isRequired
  },
  getInitialState: function() {
    return {
      categories: null,
      showMore: false
    };
  },
  setCategories: function(categories) {
    this.setState({categories: categories});
  },
  navHome: function() {
    this.setState({categories: null});
  },
  showMore: function() {
    this.setState({showMore: true});
  },
  handleClick: function(event) {
    if ($(event.target).hasClass("refLink") || $(event.target).parent().hasClass("refLink")) {
      var ref = $(event.target).attr("data-ref") || $(event.target).parent().attr("data-ref");
      this.props.showBaseText(ref);
      sjs.track.event("Reader", "Navigation Text Click", ref)
    } else if ($(event.target).hasClass("catLink") || $(event.target).parent().hasClass("catLink")) {
      var cats = $(event.target).attr("data-cats") || $(event.target).parent().attr("data-cats");
      cats = cats.split("|");
      this.setCategories(cats);
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
  render: function() {
    if (this.state.categories) {
      return (<div className="readerNavMenu" onClick={this.handleClick} >
                      <ReaderNavigationCategoryMenu
                        categories={this.state.categories}
                        category={this.state.categories.slice(-1)[0]}
                        closeNav={this.props.closeNav}
                        setCategories={this.setCategories}
                        navHome={this.navHome} />
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
        "Apocrapha",
        "Other"
      ];
      categories = categories.map(function(cat) {
        var style = {"backgroundColor": sjs.categoryColor(cat)};
        var openCat = function() {this.setCategories([cat])}.bind(this);
        var heCat   = sjs.library.hebrewCategory(cat);
        return (<div className="readerNavCategory" style={style} onClick={openCat}>
                  <span className="en">{cat}</span>
                  <span className="he">{heCat}</span>
                </div>);
      }.bind(this));;
      var more = (<div className="readerNavCategory" style={{"backgroundColor": sjs.palette.navy}} onClick={this.showMore}>
                      <span className="en">More &gt;</span>
                      <span className="he">עוד &gt;</span>
                  </div>);
      categories = this.state.showMore ? categories : categories.slice(0,8).concat(more);
      categories = (<div className="readerNavCategories"><ThreeBox content={categories} /></div>);

      var siteLinks = sjs._uid ? 
                    [(<a className="siteLink" key='profile' href="/my/profile"><i className="fa fa-user"></i> My Profile</a>), "•",
                     (<a className="siteLink" key='home' href="/">Sefaria Home</a>), "•", 
                     (<a className="siteLink" key='logout' href="/logout">Logout</a>)] :
                    
                    [(<a className="siteLink" key='home' href="/">Sefaria Home</a>), "•",
                     (<a className="siteLink" key='login' href="/login">Log In</a>)];


      var calendar = [(<a className="calendarLink refLink" data-ref={sjs.calendar.parasha}>{sjs.calendar.parashaName}</a>),
                      (<a className="calendarLink refLink" data-ref={sjs.calendar.haftara}>Haftara</a>),
                      (<a className="calendarLink refLink" data-ref={sjs.calendar.daf_yomi}>Daf Yomi</a>)];
      calendar = (<div className="readerNavCalendar"><ThreeBox content={calendar} /></div>);


      return(<div className="readerNavMenu readerNavMenuFixed" onClick={this.handleClick}>
              <div className="readerNavTop readerNavTopFixed">
                <i className="fa fa-search"></i>
                <input className="readerSearch" placeholder="Search" onKeyUp={this.handleSearchKeyUp} />
                <i className="fa fa-times" onClick={this.props.closeNav}></i>
              </div>
              <div className="content">
                  <h2>Browse Texts</h2>
                  {categories}
                  <h2>Calendar</h2>
                  {calendar}
                  <h2>Community</h2>
                  <span className="sheetsLink" onClick={this.props.openMenu.bind(null, "sheets")}><i className="fa fa-file-text-o"></i> Source Sheets</span>
                  <div className="siteLinks">
                  {siteLinks}
                  </div>
              </div>
            </div>);
    }
  }
});


var ReaderNavigationCategoryMenu = React.createClass({
  // Navigation Menu for a single category of texts (e.g., "Tanakh", "Bavli")
  propTypes: {
    category:      React.PropTypes.string.isRequired,
    categories:    React.PropTypes.array.isRequired,
    closeNav:      React.PropTypes.func.isRequired,
    setCategories: React.PropTypes.func.isRequired,
    navHome:       React.PropTypes.func.isRequired
  },
  render: function() {
    var makeCatContents = function(contents, cats) {
      // Returns HTML for TOC category contents
      var html = "";
      cats = cats || [];
      for (var i = 0; i < contents.length; i++) {
        var item = contents[i];
        if (item.category) {
          if (item.category == "Commentary") { continue; }
          var newCats = cats.concat(item.category);
          // Special Case categories which should nest
          var subcats = [ "Mishneh Torah", "Shulchan Arukh", "Midrash Rabbah", "Maharal" ];
          if ($.inArray(item.category, subcats) > -1) {
            html += '<span class="catLink" data-cats="' + newCats.join("|") + '">' + 
                    "<span class='en'>" + item.category + "</span>" + 
                    "<span class='he'>" + item.hebrewCategory + "</span></span>";
            continue;
          }
          html += "<div class='category'><h3>" + 
                    "<span class='en'>" + item.category + "</span>" + 
                    "<span class='he'>" + item.heCategory + "</span></h3>" +
                    makeCatContents(item.contents, newCats) +
                  "</div>";
        } else {
          var title   = item.title.replace(/(Mishneh Torah,|Shulchan Arukh,|Jerusalem Talmud) /, "");
          var heTitle = item.heTitle.replace(/(משנה תורה,|תלמוד ירושלמי) /, "");
          html += '<span class="refLink sparse' + item.sparseness + '" data-ref="' + item.firstSection + '">' + 
                    "<span class='en'>" + title + "</span>" + 
                    "<span class='he'>" + heTitle + "</span></span>";
        }
      }
      return html;
    };

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
      var bClasses = cx({navToggle:1, active: categories[1] === "Bavli"});
      var yClasses = cx({navToggle:1, active: categories[1] === "Yerushalmi", second: 1});

      var toggle =(<div className="navToggles">
                            <span className={bClasses} onClick={setBavli}>
                              <span className="en">Bavli</span>
                              <span className="he">בבלי</span>
                            </span> | 
                            <span className={yClasses} onClick={setYerushalmi}>
                              <span className="en">Yerushalmi</span>
                              <span className="he">ירושלמי</span>
                            </span>
                         </div>);

    } else {
      var toggle = "";
    }

    var catContents = sjs.library.tocItemsByCategories(categories);
    var contents    = makeCatContents(catContents, categories);
    var lineStyle   = {backgroundColor: sjs.categoryColor(categories[0])};

    return (<div className="readerNavCategoryMenu readerNavMenuFixed">
              <div className="readerNavTopFixed">
                <div className="categoryColorLine" style={lineStyle}></div>
                <div className="readerNavTop">
                  <i className="fa fa-search" onClick={this.props.navHome}></i>
                  <i className="fa fa-times" onClick={this.props.closeNav}></i>
                  <h2>{this.props.category}</h2>
                </div>
              </div>
              <div className="content">
                {toggle}
                <div dangerouslySetInnerHTML={ {__html: contents} }></div>
              </div>
            </div>);
  }
});


var ReaderTextTableOfContents = React.createClass({
  // Menu for the Table of Contents for a single text
  propTypes: {
    text:         React.PropTypes.string.isRequired,
    category:     React.PropTypes.string.isRequired,
    currentRef:   React.PropTypes.string.isRequired,
    close:        React.PropTypes.func.isRequired,
    openNav:      React.PropTypes.func.isRequired,
    showBaseText: React.PropTypes.func.isRequired
  },
  componentDidMount: function() {
    // Toggling TOC Alt structures
    $(".altStructToggle").click(function(){
        $(".altStructToggle").removeClass("active");
        $(this).addClass("active");
        var i = $(this).index();
        $(".altStruct").hide();
        $(".altStruct").eq(i).show();
    });
  },
  handleClick: function(e) {
    var $a = $(e.target).closest("a");
    if ($a.length) {
      var ref = $a.attr("data-ref");
      ref = decodeURIComponent(ref);
      ref = humanRef(ref);
      this.props.showBaseText(ref);
      e.preventDefault();
      this.props.close();
    }
  },
  render: function() {
    var tocHtml = sjs.library.textTocHtml(this.props.text, function() {
      this.setState({});
    }.bind(this));
    tocHtml = tocHtml || "<div class='loadingMessage'>" +
                            "<span class='en'>Loading...</span>" +
                            "<span class='he'>טעינה...</span>" + 
                          "</div>";

    var title     = this.props.text;
    var heTitle   = sjs.library.index(title) ? sjs.library.index(title).heTitle : title;

    var section   = sjs.library.sectionString(this.props.currentRef).en;
    var heSection = sjs.library.sectionString(this.props.currentRef).he;

    var lineStyle = {backgroundColor: sjs.categoryColor(this.props.category)};

    return (<div className="readerTextTableOfContents" onClick={this.handleClick}>
              <div className="readerNavTopFixed">
                <div className="categoryColorLine" style={lineStyle}></div>
                <div className="readerNavTop">
                  <i className="fa fa-search" onClick={this.props.openNav}></i>
                  <i className="fa fa-times" onClick={this.props.close}></i>
                  <h2>Table of Contents</h2>
                </div>
              </div>
              <div className="content">
                <div className="tocTitle">
                  <span className="en">{title}</span>
                  <span className="he">{heTitle}</span>
                  <div className="currentSection">
                    <span className="en">{section}</span>
                    <span className="he">{heSection}</span>
                  </div>
                </div>
                <div className="tocContent" dangerouslySetInnerHTML={ {__html: tocHtml} }></div>
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
      trendingTags: [],
      tagList: [],
      sheets: [],
      tag: this.props.initialTag
    };
  },
  componentDidMount: function() {
    this.getTags();
    if (this.props.initialTag) {
      this.setTag(this.props.initialTag);
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
  render: function() {
    var title = this.state.tag || "Source Sheets";

    if (this.state.tag) {
      var sheets = this.state.sheets.map(function(sheet) {
        var title = sheet.title.stripHtml();
        var url   = "/sheets/" + sheet.id;
        return (<a className="sheet" href={url}>
                  <img className="sheetImg" src={sheet.ownerImageUrl} />
                  <span className="sheetViews"><i className="fa fa-eye"></i> {sheet.views}</span>
                  <div className="sheetAuthor">{sheet.ownerName}</div>
                  <div className="sheetTitle">{title}</div>
                </a>);
      });
      sheets = sheets.length ? sheets : "Loading...";
      var content = (<div className="content sheetList">{sheets}</div>);
    } else {
      var yourSheets  = ""
      var makeTagButton = function(tag) {
        var setThisTag = this.setTag.bind(null, tag.tag);
        return (<div className="navButton" onClick={setThisTag}>{tag.tag} ({tag.count})</div>);
      }.bind(this);
      var trendingTags = this.state.trendingTags.slice(0,6).map(makeTagButton);
      var tagList      = this.state.tagList.map(makeTagButton);

      if (trendingTags.length && tagList.length) {
        var content = (<div className="content">
                        {yourSheets}
                        <h2>Trending Tags</h2>
                        {trendingTags}
                        <br /><br />
                        <h2>All Tags</h2>
                        {tagList}
                       </div>);
      } else {
        var content = (<div className="content">Loading...</div>);
      }      
    }

    return (<div className="readerSheetsNav readerNavMenu readerNavMenuFixed">
              <div className="readerNavTopFixed">
                <div className="readerNavTop">
                  <i className="fa fa-search" onClick={this.props.openNav}></i>
                  <i className="fa fa-times" onClick={this.props.close}></i>
                  <h2>{title}</h2>
                </div>
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
    var classes = cx({toggleSet: 1, separated: this.props.separated });
    var value = this.props.name === "layout" ? this.props.currentLayout() : this.props.settings[this.props.name];
    var width = 100.0 - (this.props.separated ? (this.props.options.length - 1) * 3 : 0);
    var style = {width: (width/this.props.options.length) + "%"};
    return (
      <div id={this.props.name} className={classes}>
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
                content={option.content} />);
          }.bind(this))
        }
      </div>);
  }
});


var ToggleOption = React.createClass({
  // A single option in a ToggleSet
  getInitialState: function() {
    return {};
  },
  handleClick: function() {
    this.props.setOption(this.props.set, this.props.name);
    sjs.track.event("Reader", "Display Option Click", this.props.set + " - " + this.props.name);
  },
  render: function() {
    var classes = cx({toggleOption: 1, on: this.props.on });
    var content = this.props.image ? (<img src={this.props.image} />) : this.props.content;
    return (
      <div
        id={this.props.name}
        className={classes}
        style={this.props.style}
        onClick={this.handleClick}>
        {content}
      </div>);
  }
});


var TextRange = React.createClass({
  // A Range or text defined a by a single Ref. Specially treated when set as 'basetext'.
  // This component is responsible for retrieving data from sjs.library for the ref that defines it.
  propTypes: {
    sref:             React.PropTypes.string.isRequired,
    basetext:         React.PropTypes.bool,
    withContext:      React.PropTypes.bool,
    loadLinks:        React.PropTypes.bool,
    prefetchNextPrev: React.PropTypes.bool,
    openOnClick:      React.PropTypes.bool,
    lowlight:         React.PropTypes.bool,
    settings:         React.PropTypes.object,
    showBaseText:     React.PropTypes.func,
    setScrollTop:     React.PropTypes.func,
    rerender:         React.PropTypes.func,
    showTextList:     React.PropTypes.func,
    onTextLoad:       React.PropTypes.func
  },
  getInitialState: function() {
    return { 
      segments: [],
      sref: this.props.sref,
      loaded: false,
      data: {ref: this.props.sref},
    };
  },
  componentDidMount: function() {
    this.getText();
    if (this.props.basetext) { 
      this.placeSegmentNumbers();
    }
    window.addEventListener('resize', this.handleResize);
  },
  componentDidUpdate: function(prevProps, prevState) {
    if (this.props.basetext) { 
      this.placeSegmentNumbers();
    }
    if (this.props.basetext && !prevState.loaded) {
      this.props.setScrollTop();
    }
  },
  componentWillUnmount: function() {
    window.removeEventListener('resize', this.handleResize);
  },
  getText: function() {
    settings = {
      context: this.props.withContext ? 1 : 0
    };
    sjs.library.text(this.state.sref, settings, this.loadText);
  },
  makeSegments: function(data) {
    // Returns a flat list of annotated segment objects,
    // derived from the walking the text in data
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
        var ref = data.sectionRef + ":" + number;
        segments.push({
          ref: ref,
          en: en[i], 
          he: he[i],
          number: number,
          highlight: highlight && number >= data.sections.slice(-1)[0] && number <= data.toSections.slice(-1)[0],
          linkCount: this.props.basetext ? sjs.library.linkCount(ref) : 0
        });
      }      
    } else {
      for (var n = 0; n < topLength; n++) {
        var en2 = typeof en[n] == "string" ? [en[n]] : en[n];
        var he2 = typeof he[n] == "string" ? [he[n]] : he[n];
        var length = Math.max(en2.length, he2.length);
        en2 = en2.pad(length, "");
        he2 = he2.pad(length, "");
        var baseRef = data.book + " " + data.sections.slice(0,-2).join(":");

        start = (n == 0 ? start : 1);
        for (var i = 0; i < length; i++) {
          var section = n+data.sections.slice(-2)[0];
          var number  = i+start;
          var ref = baseRef + ":" + section + ":" + number;
          segments.push({
            ref: ref,
            en: en2[i], 
            he: he2[i],
            number: number,
            highlight: highlight && 
                        ((n == 0 && number >= data.sections.slice(-1)[0]) || 
                         (n == topLength-1 && number <= data.toSections.slice(-1)[0]) ||
                         (n > 0 && n < topLength -1)),
            linkCount: this.props.basetext ? sjs.library.linkCount(ref) : 0
          });
        }
      }
    }
    return segments;
  },
  loadText: function(data) {
    // When data is actually available, load the text into the UI

    if (this.props.basetext && this.props.sref !== data.ref) {
      // Replace ReaderApp contents ref with the normalized form of the ref, if they differ
      // Pass parameter to showBaseText to replaceHistory
      this.props.showBaseText(data.ref, true);        
    }

    var segments  = this.makeSegments(data);
    this.setState({
      data: data,
      segments: segments,
      loaded: true,
      sref: data.ref,
    });

    if (this.props.basetext) {
      // Rerender the full app, because we now know the category and color for the header,
      // which we might not have known before the API call returned.
      // Can be removed when catgoires are exctracted from sjs.toc on every page
      // This also triggers adjusting infinite scroll, once the text is loaded.
      this.props.rerender();
    }

    if (this.props.loadLinks && !sjs.library.linksLoaded(data.sectionRef)) {
      // Calling when links are loaded will overwrite state.segments
      sjs.library.links(data.sectionRef, this.loadLinkCounts);
    }

    if (this.props.prefetchNextPrev) {
      if (data.next) { sjs.library.text(data.next, {context: 1}, function() {}); }
      if (data.prev) { sjs.library.text(data.prev, {context: 1}, function() {}); }
      if (data.book) { sjs.library.textTocHtml(data.book, function() {}); }
    }

    if (this.props.onTextLoad) {
      this.props.onTextLoad();
    }
  },
  loadLinkCounts: function() {
    // When link data has been loaded into sjs.library, load the counts into the UI
    for (var i=0; i < this.state.segments.length; i++) {
      this.state.segments[i].linkCount = sjs.library.linkCount(this.state.segments[i].ref);
    }
    this.setState({segments: this.state.segments});
  },
  placeSegmentNumbers: function() {
    // Set the vertical offsets for segment numbers and link counts, which are dependent
    // on the rendered height of the text of each segment.
    var $text = $(React.findDOMNode(this));
    var left  = $text.offset().left;
    var right = left + $text.outerWidth();
    $text.find(".segmentNumber").each(function(){
      var top = $(this).parent().offset().top;
      $(this).css({top: top});
    });
    $text.find(".linkCount").each(function(){
      var top = $(this).parent().offset().top;
      $(this).css({top: top});
    });
  },
  handleResize: function() {
    if (this.props.basetext) { this.placeSegmentNumbers(); }
  },
  handleClick: function(event) {
    if (this.props.openOnClick && this.props.showBaseText) {
      //Click on the body of the TextRange itself from TextList
      this.props.showBaseText(this.props.sref);
      sjs.track.event("Reader", "Click Text from TextList", this.props.sref);
    }
  },
  render: function() {
    if (this.props.basetext) {
      var sectionStrings   = sjs.library.sectionString(this.state.data.ref);
      var title            = this.state.loaded ? sectionStrings.en : "Loading...";
      var heTitle          = this.state.loaded ? sectionStrings.he : "טעינה...";      
    } else {  
      var title            = this.state.data.ref;
      var heTitle          = this.state.data.heRef;
    }

    var showSegmentNumbers = this.props.basetext &&
                              this.state.data.categories &&
                              this.state.data.categories[0] !== "Talmud" &&
                              this.state.data.categories[0] !== "Liturgy";

    var textSegments = this.state.segments.map(function (segment, i) {
      return (
        <TextSegment 
            key={i + segment.ref}
            sref={segment.ref}
            en={segment.en}
            he={segment.he}
            highlight={this.props.basetext && segment.highlight}
            segmentNumber={showSegmentNumbers ? segment.number : 0}
            linkCount={segment.linkCount}
            showBaseText={this.props.showBaseText}
            showTextList={this.props.showTextList} />
      );
    }.bind(this));
    textSegments = textSegments.length ? 
                    textSegments : 
                      this.props.basetext ? "" :
                      (<div className='loadingMessage'>
                      <span className="en">Loading...</span>
                      <span className="he">טעינה...</span>
                      </div>);
    var classes = {
                    textRange: 1,
                    basetext: this.props.basetext,
                    loading: !this.state.loaded,
                    lowlight: this.props.lowlight
                  };
    classes = cx(classes);
    return (
      <div className={classes} onClick={this.handleClick}>
        <div className="title">
          <div className="titleBox">
            <span className="en" >{title}</span>
            <span className="he">{heTitle}</span>
          </div>
        </div>
        <div className="text">
          { textSegments }
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
    linkCount:       React.PropTypes.number,
    showBaseText:    React.PropTypes.func,
    showTextList:    React.PropTypes.func
  },
  handleClick: function(event) {
    if ($(event.target).hasClass("refLink")) {
      //Click of citation
      var ref = humanRef($(event.target).attr("data-ref"));
      this.props.showBaseText(ref);
      event.stopPropagation();
      sjs.track.event("Reader", "Ref Link Click", ref)
    } else if (this.props.showTextList) {
      this.props.showTextList(this.props.sref);
      sjs.track.event("Reader", "Text Segment Click", this.props.sref);
    }
  },
  render: function() {    
    var minOpacity = 10, maxOpacity = 80;
    var linkScore = Math.min(this.props.linkCount+minOpacity, maxOpacity) / 100.0;
    var style = {opacity: linkScore};
    var linkCount = this.props.linkCount ? (<span className="linkCount" style={style}></span>) : "";

    var segmentNumber = this.props.segmentNumber ? (<span className="segmentNumber">{this.props.segmentNumber}</span>) : "";          
    var he = this.props.he || this.props.en;
    var en = this.props.en || this.props.he;
    var classes=cx({segment: 1, highlight: this.props.highlight, heOnly: !this.props.en, enOnly: !this.props.he});
    return (
      <span className={classes} onClick={this.handleClick}>
        {segmentNumber}
        {linkCount}
        <span className="he" dangerouslySetInnerHTML={ {__html: he + " "} }></span>
        <span className="en" dangerouslySetInnerHTML={ {__html: en + " "} }></span>
      </span>
    );
  }
});


var TextList = React.createClass({
  propTypes: {
    sref:          React.PropTypes.string.isRequired,
    filter:        React.PropTypes.array.isRequired,
    recentFilters: React.PropTypes.array.isRequired,
    main:          React.PropTypes.bool,
    setFilter:     React.PropTypes.func,
    setScrollTop:  React.PropTypes.func,
    showTextList:  React.PropTypes.func,
    showBaseText:  React.PropTypes.func,
    backToText:    React.PropTypes.func,
  },
  getInitialState: function() {
    return {
      links: [],
      loaded: false,
      filter: this.props.initialFilter,
      showAllFilters: this.props.filter.length == 0
    }
  },
  componentDidMount: function() {
    this.loadConnections();
    if (this.props.main) {
      this.props.setScrollTop();
      this.setTopPadding();
      window.requestAnimationFrame(function() {
        this.scrollToHighlighted();
      }.bind(this));
    }
  },
  componentWillReceiveProps: function(nextProps) {

  },
  componetWillUpdate: function(nextProps) {
    this.props.setScrollTop();
  },
  componentDidUpdate: function(prevProps, prevState) {
    if (!prevProps.filter.compare(this.props.filter)) {
      window.requestAnimationFrame(function() {
        this.scrollToHighlighted();
      }.bind(this));
    }
  },
  loadConnections: function() {
    // Loading intial at section level for commentary
    var ref = sjs.library.ref(this.props.sref) ? sjs.library.ref(this.props.sref).sectionRef : this.props.sref;
    //var ref = this.props.sref;
    sjs.library.links(ref, function(links) {
      if (this.isMounted()) {
        this.setState({links: links, loaded: true });
      }
    }.bind(this));
  },
  scrollToHighlighted: function() {
    var $highlighted = $(React.findDOMNode(this)).find(".texts .textRange").not(".lowlight").first();
    if ($highlighted.length) {
      var $top   = $(React.findDOMNode(this)).find(".textListTop");
      var adjust = $top.outerHeight() + parseInt($top.css("top"));
      var top    = $highlighted.offset().top;
      $(window).scrollTop(top - adjust);
    }
  },
  setTopPadding: function() {
    var $textList    = $(React.findDOMNode(this));
    var $textListTop = $textList.find(".textListTop");
    var top          = $textListTop.outerHeight();
    $textList.css({paddingTop: top});
  },
  showAllFilters: function() {
    this.setState({showAllFilters: true});
    $(window).scrollTop(0);
    sjs.track.event("Reader", "More > Click", "1");
  },
  hideAllFilters: function() {
    this.setState({showAllFilters: false});
    $(window).scrollTop(0);
  },
  backToText: function() {
    this.props.backToText();
    sjs.track.event("Reader", "Back To Text", "Anchor Text Click");
  },
  render: function() {
    var ref            = this.props.sref;
    var summary        = sjs.library.linkSummary(ref);
    var classes        = cx({textList: 1, main: this.props.main });
    var links          = this.state.links.filter(function(link) {
      if (link.category !== "Commentary" && link.anchorRef !== this.props.sref) {
        // Only show section level links for commentary
        return false;
      }
      return (this.props.filter.length == 0 ||
              $.inArray(link.category, this.props.filter) !== -1 || 
              $.inArray(link.commentator, this.props.filter) !== -1 );

      }.bind(this)).sort(function(a, b) {
        if (a.anchorVerse !== b.anchorVerse) {
            return a.anchorVerse - b.anchorVerse;
        } else if ( a.commentaryNum !== b.commentaryNum) {
            return a.commentaryNum - b.commentaryNum;
        } else {
            return a.sourceRef > b.sourceRef ? -1 : 1;
        }
    });
    var filter         = this.props.filter;
    var emptyMessageEn = "No connections known" + (filter.length ? " for " + filter.join(", ") : "") + ".";
    var emptyMessageHe = "אין קשרים ידועים"        + (filter.length ? " ל" + filter.join(", ") : "") + ".";
    var message        = !this.state.loaded ? 
                            (<div className='textListMessage'>
                              <span className="en">Loading...</span>
                              <span className="he">טעינה...</span>
                              </div>)  : 
                          (links.length == 0 ? 
                            (<div className='textListMessage'>
                              <span className="en">{emptyMessageEn}</span>
                              <span className="he">{emptyMessageHe}</span>
                            </div>) : "");
    var texts = (links.map(function(link, i) {
                      return (
                        <TextRange 
                          sref={link.sourceRef}
                          key={i + link.sourceRef}
                          lowlight={ref !== link.anchorRef}
                          basetext={false}
                          showBaseText={this.props.showBaseText}
                          openOnClick={true} 
                          onTextLoad={this.scrollToHighlighted} />
                        );
                    }, this)); 
    return (
      <div className={classes}>
        <div className="textListTop">
          <div className="anchorText" onClick={this.backToText}>
            <div className="textBox">
              <TextRange sref={this.props.sref} showBaseText={this.props.showBaseText}/>
            </div>
            <div className="fader"></div>
          </div>
          {this.state.showAllFilters ? "" : 
          <TopFilterSet 
            sref={this.props.sref}
            showText={this.props.showText}
            filter={this.props.filter}
            recentFilters={this.props.recentFilters}
            setFilter={this.props.setFilter}
            showAllFilters={this.showAllFilters}
            setTopPadding={this.setTopPadding}
            summary={summary} />}
        {message}
        </div>
        {this.state.showAllFilters ?
        <AllFilterSet 
          sref={this.props.sref}
          showText={this.props.showText}
          filter={this.props.fitler}
          recentFilters={this.props.recentFilters}
          setFilter={this.props.setFilter}
          hideAllFilters={this.hideAllFilters}
          setTopPadding={this.setTopPadding}
          summary={summary} /> :       
          <div className="texts">
            { texts }
          </div>}
      </div>
    );
  }
});


var TopFilterSet = React.createClass({
  componentDidMount: function() {
    this.props.setTopPadding();
  },
  componentDidUpdate: function() {
    this.props.setTopPadding();
  },
  toggleAllFilterView: function() {
    this.setState({showAllFilters: !this.state.showAllFilters});
  },
  hideAllFilterView: function() {
    this.props.hideAllFilters();
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
    var category = topLinks[0].category;
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

    var moreButton = (<div className="showMoreFilters textFilter" style={style}
                        onClick={this.props.showAllFilters}>
                          <div>
                            <span className="dot">●</span>
                            <span className="dot">●</span>
                            <span className="dot">●</span>
                          </div>                    
                    </div>);

    var style = {"borderTop": "4px solid " + sjs.categoryColor(category)};
    return (
      <div className="topFilters filterSet" style={style}>
        <div className="topFiltersInner">{topFilters}</div>
        {moreButton}
      </div>
    );
  }
});


var AllFilterSet = React.createClass({
  componentDidMount: function() {
    this.props.setTopPadding();
  },
  componentDidUpdate: function() {
    this.props.setTopPadding();
  },
  hideAllFilters: function() {
    this.props.hideAllFilters();
  },
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
          hideAllFilters={this.props.hideAllFilters}
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
    this.props.hideAllFilters();
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
                hideAllFilters={this.props.hideAllFilters}
                setFilter={this.props.setFilter}
                on={$.inArray(book.book, this.props.filter) !== -1} />);
    }.bind(this));
    
    var color   = sjs.categoryColor(this.props.category);
    var style   = {"borderTop": "4px solid " + color};
    var classes = cx({categoryFilter: 1, on: this.props.on});
    var count   = (<span className="enInHe">{this.props.count}</span>);
    return (
      <div className="categoryFilterGroup" style={style}>
        <div className={classes} onClick={this.handleClick}>
          <span className="en">{this.props.category} | {count}</span>
          <span className="he">{this.props.heCategory} | {count}</span>
        </div>
        <TwoBox content={ textFilters } />
      </div>
    );
  }
});


var TextFilter = React.createClass({
  handleClick: function() {
    this.props.setFilter(this.props.book, this.props.updateRecent);
    sjs.track.event("Reader", "Text Filter Click", this.props.book);
    if (this.props.hideAllFilters) {
      this.props.hideAllFilters();
    }
  },
  render: function() {
    var classes = cx({textFilter: 1, on: this.props.on, lowlight: this.props.count == 0});

    if (!this.props.hideColors) {
      var color = sjs.categoryColor(this.props.category)
      var style = {"borderTop": "4px solid " + color};
    }
    var name = this.props.book == this.props.category ? this.props.book.toUpperCase() : this.props.book;
    var count = this.props.hideCounts || !this.props.count ? "" : ( <span className="enInHe"> ({this.props.count})</span>);
    return (
      <div 
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
                  <td className={row[0] ? "" : "empty"}>{row[0]}</td>
                  <td className={row[1] ? "" : "empty"}>{row[1]}</td>
                  <td className={row[2] ? "" : "empty"}>{row[2]}</td>
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
  render: function() {
      var content = this.props.content;
      var length = content.length;
      if (length % 2) {
          length += (2-length%2);
      }
      content.pad(length, "");
      var threes = [];
      for (var i=0; i<length; i+=2) {
        threes.push([content[i], content[i+1]]);
      }
      return (
        <table className="gridBox twoBox">
          <tbody>
          { 
            threes.map(function(row, i) {
              return (
                <tr key={i}>
                  <td className={row[0] ? "" : "empty"}>{row[0]}</td>
                  <td className={row[1] ? "" : "empty"}>{row[1]}</td>
                </tr>
              );
            })
          }
          </tbody>
        </table>
      );
  }
});