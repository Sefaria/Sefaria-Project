var sjs = sjs || {};
var cx  = React.addons.classSet;


var ReaderApp = React.createClass({displayName: "ReaderApp",
  getInitialState: function() {
    var contents = [{type: "TextColumn", refs: [this.props.initialRef], scrollTop: 0 }];
    if (this.props.initialFilter) {
      contents.push({type: "TextList", ref: this.props.initialRef, scrollTop: 0 });
    }
    return {
      contents: contents,
      currentFilter: this.props.initialFilter || [],
      recentFilters: [],
      settings: this.props.initialSettings || {
        language:      "english",
        layoutDefault: "segmented",
        layoutTalmud:  "continuous",
        layoutTanach:  "segmented",
        color:         "light",
        fontSize:      62.5
      }
    }
  },
  componentDidMount: function() {
    window.addEventListener("popstate", this.handlePopState);
    window.addEventListener("scroll", this.handleScroll);

    var hist = this.makeHistoryState()
    history.replaceState(hist.state, hist.title, hist.url);
  },
  componentWillUnmount: function() {
    window.removeEventListener("popstate", this.handlePopState);
    window.removeEventListener("scroll", this.handleScroll);
  },
  componentDidUpdate: function() {
    this.updateHistoryState();
  },
  shouldHistoryUpdate: function() {
    if (!history.state) { 
      return true;
    }
    var current = this.state.contents.slice(-1)[0];
    if (history.state.type !== current.type) { 
      return true;
    }
    if (current.type === "TextColumn") {
      if (current.refs.slice(-1)[0] !== history.state.refs.slice(-1)[0]) {
        return true;
      }
    } else if (current.type === "TextList") {
      if (current.ref !== history.state.ref) {
        return true;
      }
    }
    return false;  
  },
  makeHistoryState: function() {
    // Returns an object with state, title and url params for the current state
    var current = this.state.contents.slice(-1)[0];
    var hist = {};
    if (current.type === "TextColumn") {
      hist.title = current.refs.slice(-1)[0];
      hist.url = normRef(hist.title);
    } else if (current.type == "TextList") {
      hist.title = current.ref;
      hist.url = normRef(hist.title);
      hist.url += "?with=" + (this.state.currentFilter.length ? this.state.currentFilter[0] : "all");
    }
    hist.state = current;
    return hist;
  },
  updateHistoryState: function() {
    if (this.shouldHistoryUpdate()) {
      var hist = this.makeHistoryState();
      history.pushState(hist.state, hist.title, hist.url);
      if (hist.state.type == "TextColumn") {
        sjs.track.open(hist.title);
      } else if (hist.state.type == "TextList") {
        sjs.track.event("Reader", "Open Close Reader", hist.title);
      }      
    }
  },
  handlePopState: function(event) {
    if (event.state) {
      var kind = this.state.contents.slice(-1)[0].type + " to " + event.state.type;
      sjs.track.event("Reader", "Pop State", kind);
      this.setState({contents: [event.state]});
    }
  },
  handleScroll: function(event) {
    if (this.state.contents.length) {
      var scrollTop = $(window).scrollTop();
      this.state.contents.slice(-1)[0].scrollTop = scrollTop;
    }
    this.adjustInfiniteScroll();
  },
  adjustInfiniteScroll: function() {
    var current = this.state.contents[this.state.contents.length-1];
    if (current.type === "TextColumn") {
      var $lastText    = $(".textRange.basetext").last();
      var lastTop      = $lastText.offset().top;
      var lastBottom   =  lastTop + $lastText.outerHeight();
      var windowBottom = $(window).scrollTop() + $(window).height();
      if (lastTop > (windowBottom + 100) && current.refs.length > 1) { 
        // Remove a section scroll out of view on bottom
        current.refs = current.refs.slice(0,-1);
        this.setState({contents: this.state.contents});
      } else if ( lastBottom < (windowBottom + 0)) {
        // Add the next section
        currentRef = current.refs.slice(-1)[0];
        data       = sjs.library.text(currentRef);
        if (data && data.next) {
          current.refs.push(data.next);
          this.setState({contents: this.state.contents});
        }
        sjs.track.event("Reader", "Infinite Scroll", "Down");
      }
    }
  },
  showTextList: function(ref) {
    this.state.contents.push({type: "TextList", ref: ref, scrollTop: 0});
    this.setState({contents: this.state.contents });
  },
  showBaseText: function(ref) {
    this.setState({
      contents: [{type: "TextColumn", refs: [ref], scrollTop: 0 }],
      currentFilter: [],
      recentFilters: []
    });
  },
  backToText: function() {
    this.state.contents = [this.state.contents[0]];
    this.setState({contents: this.state.contents});
  },
  setFilter: function(filter, updateRecent) {
    if (updateRecent) {
      if ($.inArray(filter, this.state.recentFilters) !== -1) {
        this.state.recentFilters.toggle(filter);
      }
      this.state.recentFilters = [filter].concat(this.state.recentFilters);
    }
    this.setState({recentFilters: this.state.recentFilters, currentFilter: [filter]});
    $(window).scrollTop(0);
  },
  navigateReader: function(direction) {
    var current = this.state.contents.slice(-1)[0];
    if (current.type === "TextColumn") {
      // Navigate Sections in text view
      var ref = $(window).scrollTop() === 0 ? current.refs[0] : current.refs.slice(-1)[0];
      var data = sjs.library.text(ref);
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
                var segment = sjs.library.text(sectionRef + ":1");
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
    var current = this.state.contents.slice(-1)[0];
    if (current.scrollTop) {
      $(window).scrollTop(current.scrollTop);
    } else if ($(".segment.highlight").length) {
      var top = $(".segment.highlight").first().position().top - ($(window).height() / 3);
      $(window).scrollTop(top);
    } else {
      $(window).scrollTop(0);
    }
  },
  currentData: function() {
    var item = this.state.contents.slice(-1)[0];
    var ref  = item.ref || item.refs.slice(-1)[0];
    var data = sjs.library.text(ref);
    return data; 
  },
  currentBook: function() {
    return this.currentData().book;
  },
  currentCategory: function() {
    var data = this.currentData();
    return data ? data.categories[0] : null;
  },
  currentLayout: function() {
    var category = this.currentCategory();
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
        return item.refs.map(function(ref, k) {
          return (React.createElement(TextRange, {
            sref: ref, 
            basetext: true, 
            withContext: true, 
            loadLinks: true, 
            prefetchNextPrev: true, 
            settings: this.state.settings, 
            setOption: this.setOption, 
            setScrollTop: this.setScrollTop, 
            showBaseText: this.showBaseText, 
            showTextList: this.showTextList, 
            key: ref}));      
        }.bind(this));
      } else if (item.type === "TextList") {
        return (
          React.createElement(TextList, {
            sref: item.ref, 
            main: true, 
            currentFilter: this.state.currentFilter, 
            recentFilters: this.state.recentFilters, 
            setFilter: this.setFilter, 
            setScrollTop: this.setScrollTop, 
            showTextList: this.showTextList, 
            showBaseText: this.showBaseText, 
            backToText: this.backToText, 
            key: item.ref})
        );
      }
    }.bind(this));
    return (
      React.createElement("div", {id: "readerApp", className: classes}, 
        React.createElement(ReaderControls, {
          navNext: this.navNext, 
          navPrevious: this.navPrevious, 
          currentBook: this.currentBook, 
          settings: this.state.settings, 
          setOption: this.setOption, 
          currentLayout: this.currentLayout}), 
          React.createElement("div", {id: "readerContent", style: style}, 
            items
          )
      )
    );
  }
});


var ReaderControls = React.createClass({displayName: "ReaderControls",
  getInitialState: function() {
    return {
      open: false
    };
  },
  showOptions: function(e) {
    this.setState({open: true});
  },
  hideOptions: function() {
    this.setState({open: false});
  },
  openNav: function(e) {
    e.stopPropagation();
    $("#navPanel").addClass("navPanelOpen")
  },
  openTextToc: function() {
    var book = this.props.currentBook();
    var url  = normRef(book);
    window.location = "/" + url;
  },
  render: function() {
    var languageOptions = [
      {name: "english", image: "/static/img/english.png" },
      {name: "bilingual", image: "/static/img/bilingual.png" },
      {name: "hebrew", image: "/static/img/hebrew.png" }
    ];
    var languageToggle = (
        React.createElement(ToggleSet, {
          name: "language", 
          options: languageOptions, 
          setOption: this.props.setOption, 
          settings: this.props.settings}));
    
    var layoutOptions = [
      {name: "continuous", image: "/static/img/paragraph.png" },
      {name: "segmented", image: "/static/img/lines.png" },
    ];
    var layoutToggle = this.props.settings.language !== "bilingual" ? 
      (React.createElement(ToggleSet, {
          name: "layout", 
          options: layoutOptions, 
          setOption: this.props.setOption, 
          currentLayout: this.props.currentLayout, 
          settings: this.props.settings})) : "";

    var colorOptions = [
      {name: "light", content: "" },
      {name: "sepia", content: "" },
      {name: "dark", content: "" }
    ];
    var colorToggle = (
        React.createElement(ToggleSet, {
          name: "color", 
          separated: true, 
          options: colorOptions, 
          setOption: this.props.setOption, 
          settings: this.props.settings}));

    var sizeOptions = [
      {name: "smaller", content: "Aa" },
      {name: "larger", content: "Aa"  }
    ];
    var sizeToggle = (
        React.createElement(ToggleSet, {
          name: "fontSize", 
          options: sizeOptions, 
          setOption: this.props.setOption, 
          settings: this.props.settings}));

    var readerOptions = !this.state.open ? "" : (
      React.createElement("div", {id: "readerOptionsPanel"}, 
        languageToggle, 
        layoutToggle, 
        React.createElement("div", {className: "line"}), 
        colorToggle, 
        sizeToggle
      ));

    return (
      React.createElement("div", null, 
        React.createElement("div", {id: "readerControls"}, 
          React.createElement("div", {id: "readerControlsRight"}, 
            React.createElement("div", {id: "readerPrevious", 
                  className: "controlsButton", 
                  onClick: this.props.navPrevious}, React.createElement("i", {className: "fa fa-caret-up"})), 
            React.createElement("div", {id: "readerNext", 
                  className: "controlsButton", 
                  onClick: this.props.navNext}, React.createElement("i", {className: "fa fa-caret-down"})), 
            React.createElement("div", {id: "readerOptions", 
                  className: "controlsButton", 
                  onClick: this.showOptions}, React.createElement("i", {className: "fa fa-bars"}))
          ), 

          React.createElement("div", {id: "readerControlsLeft"}, 
            React.createElement("div", {id: "readerNav", 
                  className: "controlsButton", 
                  onClick: this.openNav}, React.createElement("i", {className: "fa fa-search"})), 
            React.createElement("div", {id: "readerTextToc", 
                  className: "controlsButton", 
                  onClick: this.openTextToc}, React.createElement("i", {className: "fa fa-book"}))
          )
        ), 
        readerOptions, 
        this.state.open ? (React.createElement("div", {id: "mask", onClick: this.hideOptions})) : ""
      )

    );
  }
});


var ToggleSet = React.createClass({displayName: "ToggleSet",
  getInitialState: function() {
    return {};
  },
  render: function() {
    var classes = cx({toggleSet: 1, separated: this.props.separated });
    var value = this.props.name === "layout" ? this.props.currentLayout() : this.props.settings[this.props.name];
    var width = 100.0 - (this.props.separated ? (this.props.options.length - 1) * 3 : 0);
    var style = {width: (width/this.props.options.length) + "%"};
    return (
      React.createElement("div", {id: this.props.name, className: classes}, 
        
          this.props.options.map(function(option) {
            return (
              React.createElement(ToggleOption, {
                name: option.name, 
                key: option.name, 
                set: this.props.name, 
                on: value == option.name, 
                setOption: this.props.setOption, 
                style: style, 
                image: option.image, 
                content: option.content}));
          }.bind(this))
        
      ));
  }
});


var ToggleOption = React.createClass({displayName: "ToggleOption",
  getInitialState: function() {
    return {};
  },
  handleClick: function() {
    this.props.setOption(this.props.set, this.props.name);
    sjs.track.event("Reader", "Display Option Click", this.props.set + " - " + this.props.name);
  },
  render: function() {
    var classes = cx({toggleOption: 1, on: this.props.on });
    var content = this.props.image ? (React.createElement("img", {src: this.props.image})) : this.props.content;
    return (
      React.createElement("div", {
        id: this.props.name, 
        className: classes, 
        style: this.props.style, 
        onClick: this.handleClick}, 
        content
      ));
  }
});


var TextRange = React.createClass({displayName: "TextRange",
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
      this.props.setScrollTop();
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
      context: this.props.withContext
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
    en = en.pad(length, "");
    he = he.pad(length, "");

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
        var wrap = (typeof en == "string");
        var en2 = wrap ? [en[n]] : en[n];
        var he2 = wrap ? [he[n]] : he[n];
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
    var segments  = this.makeSegments(data);

    this.setState({
      data: data,
      segments: segments,
      loaded: true,
      sref: data.ref,
    });

    if (this.props.loadLinks && !sjs.library.linksLoaded(data.sectionRef)) {
      // Calling when links are loaded will overwrite state.segments
      sjs.library.bulkLoadLinks(data.sectionRef, this.loadLinkCounts);
    }

    if (this.props.prefetchNextPrev) {
      if (data.next) { sjs.library.text(data.next, {}, function() {}); }
      if (data.prev) { sjs.library.text(data.prev, {}, function() {}); }
    }
  },
  loadLinkCounts: function() {
    for (var i=0; i < this.state.segments.length; i++) {
      this.state.segments[i].linkCount = sjs.library.linkCount(this.state.segments[i].ref);
    }
    this.setState({segments: this.state.segments});
  },
  placeSegmentNumbers: function() {
    var $text = $(React.findDOMNode(this));
    var left  = $text.offset().left;
    var right = left + $text.outerWidth();
    $text.find(".segmentNumber").each(function(){
      var top = $(this).parent().offset().top;
      $(this).css({top: top, left: left});
    });
    $text.find(".linkCount").each(function(){
      var top = $(this).parent().offset().top;
      $(this).css({top: top, left: right});
    });
  },
  handleResize: function() {
    if (this.props.basetext) { this.placeSegmentNumbers(); }
  },
  handleClick: function(event) {
    if ($(event.target).hasClass("refLink")) {
      var ref = $(event.target).attr("data-ref");
      this.props.showBaseText(ref);
      sjs.track.event("Reader", "Ref Link Click", ref)
    } else if (this.props.openOnClick) {
      this.props.showBaseText(this.props.sref);
      sjs.track.event("Reader", "Click Text from TextList", this.props.sref);
    }
  },
  render: function() {
    var textSegments = this.state.segments.map(function (segment, i) {
      return (
        React.createElement(TextSegment, {
            key: segment.ref, 
            sref: segment.ref, 
            en: segment.en, 
            he: segment.he, 
            highlight: segment.highlight, 
            segmentNumber: this.props.basetext ? segment.number : 0, 
            linkCount: segment.linkCount, 
            showTextList: this.props.showTextList})
      );
    }.bind(this));
    var classes = {textRange: 1, basetext: this.props.basetext };
    classes = cx(classes);
    return (
      React.createElement("div", {className: classes, onClick: this.handleClick}, 
        React.createElement("div", {className: "title"}, 
          React.createElement("span", {className: "en"}, this.state.data.ref), 
          React.createElement("span", {className: "he"}, this.state.data.heRef)
        ), 
        React.createElement("div", {className: "text"}, 
           textSegments 
        )
      )
    );
  }
});


var TextSegment = React.createClass({displayName: "TextSegment",
  handleClick: function() {
    if (this.props.showTextList) {
      this.props.showTextList(this.props.sref);
      sjs.track.event("Reader", "Text Segment Click", this.props.sref);
    }
  },
  render: function() {
    var linkCount = this.props.linkCount ? (React.createElement("span", {className: "linkCount"}, this.props.linkCount)) : "";
    var segmentNumber = this.props.segmentNumber ? (React.createElement("span", {className: "segmentNumber"}, this.props.segmentNumber)) : "";          
    var he = this.props.he || this.props.en;
    var en = sjs.wrapRefLinks(this.props.en);
    var en = en || this.props.he;
    var classes=cx({segment: 1, highlight: this.props.highlight, heOnly: !this.props.en, enOnly: !this.props.he});
    return (
      React.createElement("span", {className: classes, onClick: this.handleClick}, 
        segmentNumber, 
        linkCount, 
        React.createElement("span", {className: "he", dangerouslySetInnerHTML:  {__html: he + " "} }), 
        React.createElement("span", {className: "en", dangerouslySetInnerHTML:  {__html: en + " "} })
      )
    );
  }
});


var TextList = React.createClass({displayName: "TextList",
  getInitialState: function() {
    return {
      links: [],
      loaded: false,
      showAllFilters: false
    }
  },
  loadConnections: function() {
    sjs.library.links(this.props.sref, function(links) {
      if (this.isMounted()) {
        this.setState({links: links, loaded: true});
      }
    }.bind(this));
  },
  componentDidMount: function() {
    this.loadConnections();
    if (this.props.main) {
      this.props.setScrollTop();
      this.setTopPadding();
    }
  },
  componentWillReceiveProps: function(nextProps) {
    if (this.props.main) {
     this.setTopPadding();
    }
  },
  componetWillUpdate: function() {
    this.props.setScrollTop();
  },
  toggleFilter: function(filter) {
    this.setState({filter: this.state.filter.toggle(filter)});
  },
  setTopPadding: function() {
    var $textList    = $(React.findDOMNode(this));
    var $textListTop = $textList.find(".textListTop");
    var top = $textListTop.outerHeight();
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
    var ref      = this.props.sref;
    var summary  = sjs.library.linkSummary(ref);
    var count    = sjs.library.linkCount(ref);        
    var classes  = cx({textList: 1, main: this.props.main });
    var topLinks = sjs.library.topLinks(ref).map(function(link){ return link.book; });
    var refs = this.state.links.filter(function(link) {
        return (this.props.currentFilter.length == 0 ||
                $.inArray(link.category, this.props.currentFilter) !== -1 || 
                $.inArray(link.commentator, this.props.currentFilter) !== -1 );
    }.bind(this)).sort(function(a, b) {
      var ia = topLinks.indexOf(a.commentator);
      var ib = topLinks.indexOf(b.commentator);
      var ia = ia === -1 ? 9999 : ia;
      var ib = ib === -1 ? 9999 : ib;
      if ( ia === ib ) {
        return a.sourceRef > b.sourceRef;
      } else {
        return ia > ib;
      }
    }).map(function(link) { 
      return link.sourceRef; 
    });
    var filter = this.props.currentFilter;
    var emptyMessageEn = "No connections known" + (filter.length ? " for " + filter.join(", ") : "") + ".";
    var emptyMessageHe = "אין קשרים ידועים"        + (filter.length ? " ל" + filter.join(", ") : "") + ".";
    var message = !this.state.loaded ? 
                    (React.createElement("div", {className: "textListMessage"}, 
                      React.createElement("span", {className: "en"}, "Loading..."), 
                      React.createElement("span", {className: "he"}, "טעינה...")
                      ))  : 
                  (refs.length == 0 ? 
                    (React.createElement("div", {className: "textListMessage"}, 
                      React.createElement("span", {className: "en"}, emptyMessageEn), 
                      React.createElement("span", {className: "he"}, emptyMessageHe)
                    )) : "");
    var texts = (refs.map(function(ref) {
                      return (
                        React.createElement(TextRange, {
                          sref: ref, 
                          key: ref, 
                          basetext: false, 
                          showBaseText: this.props.showBaseText, 
                          openOnClick: true})
                        );
                    }, this)); 
    return (
      React.createElement("div", {className: classes}, 
        React.createElement("div", {className: "textListTop"}, 
          React.createElement("div", {className: "anchorText", onClick: this.backToText}, 
            React.createElement("div", {className: "textBox"}, 
              React.createElement(TextRange, {sref: this.props.sref})
            ), 
            React.createElement("div", {className: "fader"})
          ), 
          this.state.showAllFilters ? "" : 
          React.createElement(TopFilterSet, {
            sref: this.props.sref, 
            showText: this.props.showText, 
            filter: this.props.currentFilter, 
            recentFilters: this.props.recentFilters, 
            toggleFilter: this.toggleFilter, 
            setFilter: this.props.setFilter, 
            showAllFilters: this.showAllFilters, 
            setTopPadding: this.setTopPadding, 
            summary: summary, 
            totalCount: count}), 
        message
        ), 
        this.state.showAllFilters ?
        React.createElement(AllFilterSet, {
          sref: this.props.sref, 
          showText: this.props.showText, 
          filter: this.props.currentFilter, 
          recentFilters: this.props.recentFilters, 
          toggleFilter: this.toggleFilter, 
          setFilter: this.props.setFilter, 
          hideAllFilters: this.hideAllFilters, 
          setTopPadding: this.setTopPadding, 
          summary: summary, 
          totalCount: count}) :       
          React.createElement("div", {className: "texts"}, 
             texts 
          )
      )
    );
  }
});


var TopFilterSet = React.createClass({displayName: "TopFilterSet",
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
    var topLinks = sjs.library.topLinks(this.props.sref);

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
     return (React.createElement(TextFilter, {
                key: book.book, 
                book: book.book, 
                heBook: book.heBook, 
                category: book.category, 
                hideCounts: true, 
                count: book.count, 
                updateRecent: false, 
                setFilter: this.props.setFilter, 
                on: $.inArray(book.book, this.props.filter) !== -1, 
                onClick: function(){ sjs.track.event("Reader", "Top Filter Click", "1");}}));
    }.bind(this));

    // Add "More >" button if needed 
    if (topFilters.length == 5) {
      var style = {"borderTop": "4px solid " + sjs.palette.navy};
      topFilters.push(React.createElement("div", {className: "showMoreFilters textFilter", 
                          style: style, 
                          onClick: this.props.showAllFilters}, 
                            React.createElement("div", null, 
                              React.createElement("span", {className: "en"}, "More >"), 
                              React.createElement("span", {className: "he"}, "עוד >")
                            )
                      ));
    }

    return (
      React.createElement("div", {className: "topFilters filterSet"}, 
        React.createElement(ThreeBox, {content: topFilters})
      )
    );
  }
});


var AllFilterSet = React.createClass({displayName: "AllFilterSet",
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
        React.createElement(CategoryFilter, {
          key: i, 
          category: cat.category, 
          heCategory: sjs.library.hebrewCategory(cat.category), 
          count: cat.count, 
          books: cat.books, 
          filter: this.props.filter, 
          updateRecent: true, 
          setFilter: this.props.setFilter, 
          hideAllFilters: this.props.hideAllFilters, 
          on: $.inArray(cat.category, this.props.filter) !== -1})
      );
    }.bind(this));
    return (
      React.createElement("div", {className: "fullFilterView filterSet"}, 
        categories
      )
    );
  }
});


var CategoryFilter = React.createClass({displayName: "CategoryFilter",
  handleClick: function() {
    this.props.setFilter(this.props.category, this.props.updateRecent);
    this.props.hideAllFilters();
    sjs.track.event("Reader", "Category Filter Click", this.props.category);
  },
  render: function() {
    var textFilters = this.props.books.map(function(book, i) {
     return (React.createElement(TextFilter, {
                key: book.book, 
                book: book.book, 
                heBook: book.heBook, 
                count: book.count, 
                category: this.props.category, 
                hideColors: true, 
                updateRecent: true, 
                hideAllFilters: this.props.hideAllFilters, 
                setFilter: this.props.setFilter, 
                on: $.inArray(book.book, this.props.filter) !== -1}));
    }.bind(this));
    
    var color   = sjs.categoryColors[this.props.category] || sjs.palette.pink;
    var style   = {"borderTop": "4px solid " + color};
    var classes = cx({categoryFilter: 1, on: this.props.on});
    var count   = (React.createElement("span", {className: "enInHe"}, this.props.count));
    return (
      React.createElement("div", {className: "categoryFilterGroup", style: style}, 
        React.createElement("div", {className: classes, onClick: this.handleClick}, 
          React.createElement("span", {className: "en"}, this.props.category, " | ", count), 
          React.createElement("span", {className: "he"}, this.props.heCategory, " | ", count)
        ), 
        React.createElement(TwoBox, {content:  textFilters })
      )
    );
  }
});


var TextFilter = React.createClass({displayName: "TextFilter",
  handleClick: function() {
    this.props.setFilter(this.props.book, this.props.updateRecent);
    sjs.track.event("Reader", "Text Filter Click", this.props.book);
    if (this.props.hideAllFilters) {
      this.props.hideAllFilters();
    }
  },
  render: function() {
    var classes = cx({textFilter: 1, on: this.props.on});

    if (!this.props.hideColors) {
      var color = sjs.categoryColors[this.props.category] || sjs.palette.pink;
      var style = {"borderTop": "4px solid " + color};
    }
    var name = this.props.book == this.props.category ? this.props.book.toUpperCase() : this.props.book;
    var count = this.props.hideCounts ? "" : ( React.createElement("span", {className: "enInHe"}, " (", this.props.count, ")"));
    return (
      React.createElement("div", {
        className: classes, 
        key: this.props.book, 
        style: style, 
        onClick: this.handleClick}, 
          React.createElement("div", null, 
            React.createElement("span", {className: "en"}, name, count), 
            React.createElement("span", {className: "he"}, this.props.heBook, count)
          )
      )
    );
  }
});


var ThreeBox = React.createClass({displayName: "ThreeBox",
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
        React.createElement("table", null, 
          React.createElement("tbody", null, 
           
            threes.map(function(row, i) {
              return (
                React.createElement("tr", {key: i}, 
                  React.createElement("td", {className: row[0] ? "" : "empty"}, row[0]), 
                  React.createElement("td", {className: row[1] ? "" : "empty"}, row[1]), 
                  React.createElement("td", {className: row[2] ? "" : "empty"}, row[2])
                )
              );
            })
          
          )
        )
      );
  }
});


var TwoBox = React.createClass({displayName: "TwoBox",
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
        React.createElement("table", null, 
          React.createElement("tbody", null, 
           
            threes.map(function(row, i) {
              return (
                React.createElement("tr", {key: i}, 
                  React.createElement("td", {className: row[0] ? "" : "empty"}, row[0]), 
                  React.createElement("td", {className: row[1] ? "" : "empty"}, row[1])
                )
              );
            })
          
          )
        )
      );
  }
});
