var sjs = sjs || {};
var cx  = React.addons.classSet;


var ReaderApp = React.createClass({
  getInitialState: function() {
    var contents = [{type: "TextColumn", refs: [this.props.initialRef], scrollTop: 0 }];
    if (this.props.initialFilter) {
      contents.push({type: "TextList", ref: this.props.initialRef, scrollTop: 0 });
    }
    return {
      currentFilter: this.props.initialFilter || [],
      recentFilters: [],
      contents: contents
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
    if (!history.state) { return true; }
    var current = this.state.contents.slice(-1)[0];
    if (history.state.type !== current.type) { return true; }
    if (current.type === "TextColumn") {
      if (current.refs.slice(-1)[0] !== history.state.refs.slice(-1)[0]) { return true; }
    }  
    if (current.type === "TextList") {
      if (current.ref !== history.state.ref) { return true; }
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
      var current = this.state.contents.slice(-1)[0];
      if (current.type !== "TextColumn" || (history.state && history.state.type !== "TextColumn")) {
        // TODO - figure how do to without this timer which is needed because this function 
        // gets called before the TextSegments containted within are rendered.
        setTimeout(function() { $(window).scrollTop(current.scrollTop) }.bind(this), 5);        
      }
      var hist = this.makeHistoryState();
      history.pushState(hist.state, hist.title, hist.url);
    }
  },
  handlePopState: function(event) {
    if (event.state) {
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
      //console.log("lt: " + lastTop + ", lb: " + lastBottom + ", wb: " + windowBottom)
      if (lastTop > (windowBottom + 100) && current.refs.length > 1) { 
        // Remove a section scroll out of view on bottom
        current.refs = current.refs.slice(0,-1);
        this.setState({contents: this.state.contents});
      } else if ( lastBottom < (windowBottom + 0)) {
        // Add the next section
        currentRef = current.refs.slice(-1)[0];
        nextRef    = sjs.library.text(currentRef).next;
        if (nextRef) {
          current.refs.push(nextRef);
          this.setState({contents: this.state.contents});
        }
      }
    }
  },
  showTextList: function(ref) {
    this.state.contents.push({type: "TextList", ref: ref, scrollTop: 0});
    this.setState({contents: this.state.contents });
  },
  showBaseText: function(ref) {
    if (ref) {
      this.setState({
        contents: [{type: "TextColumn", refs: [ref], scrollTop: 0 }],
        currentFilter: [],
        recentFilters: []
      });

    } else {
      this.state.contents = [this.state.contents[0]];
      this.setState({contents: this.state.contents});
    }
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
          sjs.library.text(sectionRef, function(data) {
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
    $(window).scrollTop(0);
  },
  navNext: function() {
    this.navigateReader("next");
  },
  navPrevious: function() {
    this.navigateReader("prev");
  },
  render: function() {
    var items = this.state.contents.slice(-1).map(function(item, i) {
      if (item.type === "TextColumn") {
        return item.refs.map(function(ref, k) {
          return (<TextRange 
            sref={ref}
            basetext={true}
            loadLinks={true}
            prefetchNextPrev={true}
            showBaseText={this.showBaseText} 
            showTextList={this.showTextList} 
            key={ref} />);      
        }.bind(this));
      } else if (item.type === "TextList") {
        return (
          <TextList 
            sref={item.ref} 
            main={true}
            currentFilter={this.state.currentFilter}
            recentFilters={this.state.recentFilters}
            setFilter={this.setFilter}
            showTextList={this.showTextList}
            showBaseText={this.showBaseText} 
            key={item.ref} />
        );
      }
    }.bind(this));
    return (
      <div id="readerApp">
        <ReaderControls 
          navNext={this.navNext}
          navPrevious={this.navPrevious} />
        {items}
      </div>
    );
  }
});

var ReaderControls = React.createClass({
  getInitialState: function() {
    return { 
    };
  },
  showOptions: function(e) {
    setTimeout(function() { sjs.showOptionsBar(); }, 5);
  },
  render: function() {
    return (
      <div id="readerControls">
        <div id="readerPrevious"
              className="controlsButton"
              onClick={this.props.navPrevious}><i className="fa fa-caret-up"></i></div>
        <div id="readerNext" 
              className="controlsButton" 
              onClick={this.props.navNext}><i className="fa fa-caret-down"></i></div>
        <div id="readerOptions"
              className="controlsButton"
              onClick={this.showOptions}><i className="fa fa-bars"></i></div>
      </div>
    );
  }
});


var TextRange = React.createClass({
  getInitialState: function() {
    return { 
      segments: [],
      sref: this.props.sref,
      data: {ref: this.props.sref},
      flowLayout: true
    };
  },
  componentDidMount: function() {
    this.getText();
    if (this.props.basetext) { 
      this.placeSegmentNumbers();
    }
    window.addEventListener('resize', this.handleResize);
  },
  componentDidUpdate: function() {
    if (this.props.basetext) { 
      this.placeSegmentNumbers();
    }
  },
  componentWillUnmount: function() {
    window.removeEventListener('resize', this.handleResize);
  },
  getText: function() {
    sjs.library.text(this.state.sref, this.loadText);
  },
  loadText: function(data) {
    var wrap = (typeof data.text == "string");
    var en = wrap ? [data.text] : data.text;
    var he = wrap ? [data.he] : data.he;

    // Pad the shorter array to make stepping through them easier.
    var length = Math.max(en.length, he.length);
    en = en.pad(length, "");
    he = he.pad(length, "");

    var segments = [];
    var start = data.textDepth == data.sections.length ? data.sections[data.textDepth] : 1;
    for (var i = 0; i < length; i++) {
      var ref = data.ref + ":" + (i+start);
      segments.push({
        en: en[i], 
        he: he[i], 
        ref: ref,
        linkCount: sjs.library.linkCount(ref)
      });
    }
    var flowLayout = data.categories[0] === "Tanach" ||
                      data.categories[0] === "Talmud" &&
                      data.book !== "Psalms";
    this.setState({
      data: data,
      segments: segments,
      sref: data.ref,
      flowLayout: flowLayout
    });

    if (this.props.loadLinks && !sjs.library.linksLoaded(data.ref)) {
      // Calling when links are loaded will overwrite state.segments
      sjs.library.bulkLoadLinks(data.ref, this.loadLinkCounts);
    }

    if (this.props.prefetchNextPrev) {
      if (data.next) {
        sjs.library.text(data.next, function() {});
      }
      if (data.prev) {
        sjs.library.text(data.prev, function() {});
      }
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
  handleResize: function(e) {
    if (this.props.basetext) { this.placeSegmentNumbers(); }
  },
  handleClick: function() {
    if (this.props.openOnClick) {
      var sectionRef = sjs.library.text(this.props.sref).sectionRef;
      this.props.showBaseText(sectionRef);
    }
  },
  nextSection: function() {
    if (this.state.data.next) {
      this.props.showBaseText(this.state.data.next);
    }
  },
  previousSection: function () {
    if (this.state.data.prev) {
      this.props.showBaseText(this.state.data.prev);
    }
  },
  render: function() {
    var textSegments = this.state.segments.map(function (segment, i) {
      return (
        <TextSegment 
            key={segment.ref}
            sref={segment.ref}
            en={segment.en}
            he={segment.he}
            segmentNumber={this.props.basetext ? i+1 : 0}
            linkCount={segment.linkCount}
            showTextList={this.props.showTextList} />
      );
    }.bind(this));
    var classes = cx({textRange: 1, basetext: this.props.basetext, flowLayout: this.state.flowLayout });
    return (
      <div className={classes} onClick={this.handleClick}>
        <div className="title">
          <span className="en" >{this.state.data.ref}</span>
          <span className="he">{this.state.data.heRef}</span>
        </div>
        <div className="text">
          { textSegments }
        </div>
      </div>
    );
  }
});


var TextSegment = React.createClass({
  handleClick: function() {
    if (this.props.showTextList) {
      this.props.showTextList(this.props.sref);
    }
  },
  render: function() {
    var linkCount = this.props.linkCount ? (<span className="linkCount">{this.props.linkCount}</span>) : "";
    var segmentNumber = this.props.segmentNumber ? (<span className="segmentNumber">{this.props.segmentNumber}</span>) : "";          
    var he = this.props.he || "<span class='enOnly'>" + this.props.en + "</span>";
    var en = this.props.en || "<span class='heOnly'>" + this.props.he + "</span>";

    return (
      <span className="segment" onClick={this.handleClick}>
        {segmentNumber}
        {linkCount}
        <span className="he" dangerouslySetInnerHTML={ {__html: he+ " "} }></span>
        <span className="en" dangerouslySetInnerHTML={ {__html: en + " "} }></span>
      </span>
    );
  }
});


var TextList = React.createClass({
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
      $(window).scrollTop(0);
      this.setTopPadding();
    }
  },
  componentWillReceiveProps: function(nextProps) {
    if (this.props.main) {
     this.setTopPadding();
    }
  },
  componetWillUpdate: function() {
    $(window).scrollTop(0);
  },
  toggleFilter: function(filter) {
    this.setState({filter: this.state.filter.toggle(filter)});
  },
  setTopPadding: function() {
    var $textList = $(React.findDOMNode(this));
    var $textListTop = $textList.find(".textListTop");
    var top = $textListTop.outerHeight();
    $textList.css({paddingTop: top});
  },
  showAllFilters: function() {
    this.setState({showAllFilters: true});
  },
  hideAllFilters: function() {
    this.setState({showAllFilters: false});
    $(window).scrollTop(0);

  },
  backToText: function() {
    this.props.showBaseText();
  },
  render: function() {
    var ref     = this.props.sref;
    var summary = sjs.library.linkSummary(ref);
    var count   = sjs.library.linkCount(ref);        
    var classes = cx({textList: 1, main: this.props.main });
    var refs = this.state.links.filter(function(link) {
        return (this.props.currentFilter.length == 0 ||
                $.inArray(link.category, this.props.currentFilter) !== -1 || 
                $.inArray(link.commentator, this.props.currentFilter) !== -1 );
    }.bind(this)).map(function(link) { 
      return link.sourceRef; 
    }).sort();
    var texts = this.state.loaded ? 
                  (refs.length ? 
                  refs.map(function(ref) {
                  return (
                    <TextRange 
                      sref={ref}
                      key={ref} 
                      basetext={false}
                      showBaseText={this.props.showBaseText}
                      openOnClick={true} />
                    );
                 }, this) : (<div className='textListMessage'>No connections known.</div>)) : 
                            (<div className='textListMessage'>Loading...</div>);
    return (
      <div className={classes}>
        <div className="textListTop">
          <div className="anchorText">
            <div className="textBox" onClick={this.backToText}>
              <TextRange sref={this.props.sref} />
              <div className="fader"></div>
            </div>
          </div>
          {this.state.showAllFilters ? "" : 
          <TopFilterSet 
            sref={this.props.sref}
            showText={this.props.showText}
            filter={this.props.currentFilter}
            recentFilters={this.props.recentFilters}
            toggleFilter={this.toggleFilter}
            setFilter={this.props.setFilter}
            showAllFilters={this.showAllFilters}
            setTopPadding={this.setTopPadding}
            summary={summary}
            totalCount={count} />}
        </div>
        {this.state.showAllFilters ?
        <AllFilterSet 
          sref={this.props.sref}
          showText={this.props.showText}
          filter={this.props.currentFilter}
          recentFilters={this.props.recentFilters}
          toggleFilter={this.toggleFilter}
          setFilter={this.props.setFilter}
          hideAllFilters={this.hideAllFilters}
          setTopPadding={this.setTopPadding}
          summary={summary}
          totalCount={count} /> :       
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
    var topLinks = sjs.library.topLinks(this.props.sref);

    // Filter top links for items already in recent filter
    topLinks = topLinks.filter(function(link) {
      return ($.inArray(link.book, this.props.recentFilters) == -1);
    }.bind(this));
    
    // Annotate filter texts with category            
    var recentFilters = this.props.recentFilters.map(function(filter) {
      return {book: filter, category: sjs.library.textCategory(filter) };
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
        var annotatedFilter = {book: filter, category: sjs.library.textCategory(filter) };
        topLinks = [annotatedFilter].concat(topLinks).slice(0,5);
      } else {
        // topLinks.move(i, 0); 
      }        
    }

    var topFilters = topLinks.map(function(book) {
     return (<TextFilter 
                key={book.book} 
                book={book.book} 
                category={book.category}
                hideCounts={true}
                count={book.count}
                updateRecent={false}
                setFilter={this.props.setFilter}
                on={$.inArray(book.book, this.props.filter) !== -1} />);
    }.bind(this));

    // Add "More >" button if needed 
    if (topFilters.length == 5) {
      var style = {"borderTop": "4px solid " + sjs.palette.navy};
      topFilters.push(<div className="showMoreFilters textFilter" 
                          style={style}
                          onClick={this.props.showAllFilters}>
                            <span>More &gt;</span>
                    </div>);
    }

    return (
      <div className="topFilters filterSet">
        <ThreeBox content={topFilters} />
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
  },
  render: function() {
    var textFilters = this.props.books.map(function(book, i) {
     return (<TextFilter 
                key={book.book} 
                book={book.book} 
                count={book.count}
                category={this.props.category}
                hideColors={true}
                updateRecent={true}
                hideAllFilters={this.props.hideAllFilters}
                setFilter={this.props.setFilter}
                on={$.inArray(book.book, this.props.filter) !== -1} />);
    }.bind(this));
    
    var color = sjs.categoryColors[this.props.category] || sjs.palette.pink;
    var style = {"borderTop": "4px solid " + color};
    var classes = cx({categoryFilter: 1, on: this.props.on});
    return (
      <div className="categoryFilterGroup" style={style}>
        <div className={classes} onClick={this.handleClick}>
          {this.props.category} | {this.props.count}
        </div>
        <TwoBox content={ textFilters } />
      </div>
    );
  }
});


var TextFilter = React.createClass({
  handleClick: function() {
    this.props.setFilter(this.props.book, this.props.updateRecent);
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
    var count = this.props.hideCounts ? "" : 
      ( <span> ({this.props.count})</span>);
    return (
      <div 
        className={classes} 
        key={this.props.book} 
        style={style}
        onClick={this.handleClick}>
        {this.props.book}{count}
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
        <table>
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
        <table>
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