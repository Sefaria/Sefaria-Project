const {
  LoadingMessage
}                = require('./Misc');
const React      = require('react');
const ReactDOM   = require('react-dom');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
const TextRange  = require('./TextRange');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
import Component from 'react-class';


class TextColumn extends Component {
  // An infinitely scrollable column of text, composed of TextRanges for each section.
  componentDidMount() {
    this._isMounted          = true;
    this.$container          = $(ReactDOM.findDOMNode(this));
    this.initialScrollTopSet = false;
    this.windowMiddle        = $(window).outerHeight() / 2;
    this.debouncedAdjustHighlightedAndVisible = Sefaria.util.debounce(this.adjustHighlightedAndVisible, 100);
    var node = ReactDOM.findDOMNode(this);
    node.addEventListener("scroll", this.handleScroll);
  }
  componentWillUnmount() {
    this._isMounted = false;
    var node = ReactDOM.findDOMNode(this);
    node.removeEventListener("scroll", this.handleScroll);
  }
  componentWillReceiveProps(nextProps) {
    //console.log(nextProps)
    if ((this.props.mode === "Text" && nextProps.mode === "TextAndConnections") ||
        (this.props.currVersions.en !== nextProps.currVersions.en) ||
        (this.props.currVersions.he !== nextProps.currVersions.he)) {
      // When opening mobile connections panel, scroll to highlighted
      this.scrolledToHighlight = false;
      this.initialScrollTopSet = true;

    } else if (this.props.mode === "TextAndConnections" && nextProps.mode === "Text") {
      // Don't mess with scroll position when closing mobile Connections panel
      this.scrolledToHighlight = true;
      this.initialScrollTopSet = true;

    } else if (this.props.panelsOpen !== nextProps.panelsOpen) {
      // When panels are opened or closed, refocus highlighted segments
      this.scrolledToHighlight = false;

    } else if (nextProps.srefs.length == 1 && Sefaria.util.inArray(nextProps.srefs[0], this.props.srefs) == -1) {
      // If we are switching to a single ref not in the current TextColumn, treat it as a fresh open.
      this.initialScrollTopSet = false;
      this.scrolledToHighlight = false;
      this.loadingContentAtTop = false;
    }
  }
  componentDidUpdate(prevProps, prevState) {
    if (!this.props.highlightedRefs.compare(prevProps.highlightedRefs)) {
      //console.log("Scroll for highlight change")
      this.setScrollPosition();  // highlight change
    }
    if (this.props.layoutWidth !== prevProps.layoutWidth ||
        this.props.settings.language !== prevProps.settings.language) {
      //console.log("scroll to highlighted on layout change")
      this.scrollToHighlighted();
    }
  }
  handleScroll(event) {
    //console.log("scroll");
    if (this.justScrolled) {
      //console.log("pass scroll");
      this.justScrolled = false;
      return;
    }
    this.debouncedAdjustHighlightedAndVisible();
    this.adjustInfiniteScroll();
  }
  handleTextSelection() {
    var selection = window.getSelection();

    if (selection.type === "Range") {
      //console.log("handling range");
      var $start    = $(Sefaria.util.getSelectionBoundaryElement(true)).closest(".segment");
      var $end      = $(Sefaria.util.getSelectionBoundaryElement(false)).closest(".segment");
      var $segments = $(ReactDOM.findDOMNode(this)).find(".segment");
      var start     = $segments.index($start);
      var end       = $segments.index($end);
      var $segments = $segments.slice(start, end+1);
      var refs      = [];

      $segments.each(function() {
        refs.push($(this).attr("data-ref"));
      });

      //console.log("Setting highlights by Text Selection");
      //console.log(refs);
      this.props.setTextListHighlight(refs);
    }
    var selectedWords = selection.toString();
    if (selectedWords !== this.props.selectedWords) {
      //console.log("setting selecting words")
      this.props.setSelectedWords(selectedWords);
    }
  }
  handleTextLoad() {
    //console.log("handle text load");
    this.setScrollPosition();
    this.adjustInfiniteScroll();
  }
  setScrollPosition() {
    //console.log("ssp");
    // Called on every update, checking flags on `this` to see if scroll position needs to be set
    var node = ReactDOM.findDOMNode(this);
    if (this.loadingContentAtTop) {
      // After adding content by infinite scrolling up, scroll back to what the user was just seeing
      //console.log("loading at top");
      var $node   = this.$container;
      var adjust  = 120; // Height of .loadingMessage.base
      var $texts  = $node.find(".basetext");
      if ($texts.length < 2) { return; }
      //console.log("scrolltop: " + $node.scrollTop());
      var top     = $texts.eq(this.numSectionsLoadedAtTop).position().top + (2*$node.scrollTop()) - adjust ;

      if (!$texts.eq(0).hasClass("loading")) {
        this.loadingContentAtTop = false;
        this.initialScrollTopSet = true;
        this.justScrolled = true;
        node.scrollTop = top;
        //console.log("After load at top, total top: " + top)
      }
    } else if (!this.scrolledToHighlight && $(node).find(".segment.highlight").length) {
      //console.log("scroll to highlighted");
      // scroll to highlighted segment
      this.scrollToHighlighted();
      this.initialScrollTopSet = true;
      this.justScrolled        = true;
    } else if (!this.initialScrollTopSet && (node.scrollHeight > node.clientHeight)) {
      //console.log("initial scroll set");
      // initial value set below 0 so you can scroll up for previous
      var first   = Sefaria.ref(this.props.srefs[0]);
      var hasPrev = first && first.prev;
      if (!hasPrev) {
        node.scrollTop = 0;
      }
      else {
        node.scrollTop = 90;
      }
      //console.log(node.scrollTop);
      this.initialScrollTopSet = true;
      this.justScrolled = true;
    }
  }
  adjustInfiniteScroll() {
    // Add or remove TextRanges from the top or bottom, depending on scroll position
    //console.log("adjust Infinite Scroll");
    if (!this._isMounted) { return; }
    var node         = ReactDOM.findDOMNode(this);
    if (node.scrollHeight <= node.clientHeight) { return; }
    var $node        = $(node);

    var refs         = this.props.srefs.slice();
    var $lastText    = $node.find(".textRange.basetext").last();
    if (!$lastText.length) { console.log("no last basetext"); return; }
    var lastTop      = $lastText.position().top;
    var lastBottom   = lastTop + $lastText.outerHeight();
    var windowHeight = $node.outerHeight();
    var windowTop    = node.scrollTop;
    var windowBottom = windowTop + windowHeight;
    if (windowTop < 75 && !this.loadingContentAtTop) {
      // UP: add the previous section above then adjust scroll position so page doesn't jump
      var topRef = refs[0];
      var data   = Sefaria.ref(topRef);   // data for current ref
      if (data && data.prev) {
        refs.splice(refs, 0, data.prev);  // Splice in at least the previous one (-1)
        this.numSectionsLoadedAtTop = 1;

        var prevData, earlierData;

        // Now, only add sources if we have data for them
        if(prevData = Sefaria.ref(data.prev)) {
          earlierData = Sefaria.ref(prevData.prev);
        }

        while(earlierData) {
          refs.splice(refs, 0, earlierData.ref);
          this.numSectionsLoadedAtTop += 1;
          earlierData = Sefaria.ref(earlierData.prev);
        }

        //console.log("Up! Add previous section. Windowtop is: " + windowTop);
        this.loadingContentAtTop = true;
        this.props.updateTextColumn(refs);
        // Sefaria.track.event("Reader", "Infinite Scroll", "Up");
      }
    } else if ( lastBottom < windowHeight + 80 ) {
      // DOWN: add the next section to bottom
      if ($lastText.hasClass("loading")) {
        //console.log("last text is loading - don't add next section");
        return;
      }
      //console.log("Down! Add next section");
      var currentRef = refs.slice(-1)[0];
      var data       = Sefaria.ref(currentRef);
      if (data && data.next) {
        refs.push(data.next); // Append at least the next one

        var nextData, laterData;

        // Now, only add sources if we have data for them
        if(nextData = Sefaria.ref(data.next)) {
          laterData = Sefaria.ref(nextData.next);
        }

        while(laterData) {
          refs.push(laterData.ref);
          laterData = Sefaria.ref(laterData.next);
        }

        this.props.updateTextColumn(refs);
        // Sefaria.track.event("Reader", "Infinite Scroll", "Down");
      }
    }
  }
  getHighlightThreshhold() {
    // Returns the distance from the top of screen that we want highlighted segments to appear below.
    return this.props.multiPanel ? 200 : 70;
  }
  adjustHighlightedAndVisible() {
    //console.log("adjustHighlightedAndVisible");
    // Adjust which ref is current consider visible for header and URL,
    // and while the TextList is open, update which segment should be highlighted.
    // Keeping the highlightedRefs value in the panel ensures it will return
    // to the right location after closing other panels.
    if (!this._isMounted) { return; }

    // When using tab to navigate (i.e. a11y) set ref to currently focused ref
    var $segment = null;
    if ($("body").hasClass("user-is-tabbing") && $(".segment:focus").length > 0) {
      $segment = $(".segment:focus").eq(0);
    } else {
      var $container = this.$container;
      var topThreshhold = this.getHighlightThreshhold();
      $container.find(".basetext .segment").each(function(i, segment) {
        var top = $(segment).offset().top - $container.offset().top;
        var bottom = $(segment).outerHeight() + top;
        if (bottom > this.windowMiddle || top >= topThreshhold) {
          $segment = $(segment);
          return false;
        }
      }.bind(this));
    }

    if (!$segment) { return; }

    var $section = $segment.closest(".textRange");
    var sectionRef = $section.attr("data-ref");
    this.props.setCurrentlyVisibleRef(sectionRef);

    // don't move around highlighted segment when scrolling a single panel,
    var shouldHighlight = this.props.hasSidebar || this.props.mode === "TextAndConnections";

    if (shouldHighlight) {
      var ref = $segment.attr("data-ref");
      this.props.setTextListHighlight(ref);
    }
  }
  scrollToHighlighted() {
    if (!this._isMounted) { return; }
    //console.log("scroll to highlighted - animation frame");
    var $container   = this.$container;
    var $readerPanel = $container.closest(".readerPanel");
    var $highlighted = $container.find(".segment.highlight").first();
    if ($highlighted.length) {
      this.scrolledToHighlight = true;
      this.justScrolled = true;
      var offset = this.getHighlightThreshhold();
      $container.scrollTo($highlighted, 0, {offset: -offset});
      if ($readerPanel.attr("id") == $(".readerPanel:last").attr("id")) {
        $highlighted.focus();
      }
    }
  }
  render() {
    var classes = classNames({textColumn: 1, connectionsOpen: this.props.mode === "TextAndConnections"});
    var index = Sefaria.index(Sefaria.parseRef(this.props.srefs[0]).index);
    var isDictionary = (index && index.categories[0] == "Reference");
    var content =  this.props.srefs.map(function(ref, k) {
      return (<TextRange
        panelPosition ={this.props.panelPosition}
        sref={ref}
        currVersions={this.props.currVersions}
        highlightedRefs={this.props.highlightedRefs}
        textHighlights={this.props.textHighlights}
        hideTitle={isDictionary}
        basetext={true}
        withContext={true}
        loadLinks={true}
        prefetchNextPrev={true}
        prefetchMultiple={isDictionary?20:0}
        showParashahHeaders={true}
        settings={this.props.settings}
        setOption={this.props.setOption}
        showBaseText={this.props.showBaseText}
        onSegmentClick={this.props.onSegmentClick}
        onCitationClick={this.props.onCitationClick}
        onTextLoad={this.handleTextLoad.bind(this)}
        filter={this.props.filter}
        panelsOpen={this.props.panelsOpen}
        layoutWidth={this.props.layoutWidth}
        unsetTextHighlight={this.props.unsetTextHighlight}
        key={ref} />);
    }.bind(this));

    if (content.length) {
      // Add Next and Previous loading indicators
      var first   = Sefaria.ref(this.props.srefs[0]);
      var last    = Sefaria.ref(this.props.srefs.slice(-1)[0]);
      var hasPrev = first && first.prev;
      var hasNext = last && last.next;
      var topSymbol  = " ";
      var bottomSymbol = " ";
      if (hasPrev) {
        content.splice(0, 0, (<LoadingMessage className="base prev" key="prev"/>));
      } else {

        content.splice(0, 0, (
          <div className="bookMetaDataBox" key="prev">
              <div className="title en" role="heading" aria-level="1" style={{"direction": "ltr"}}>{this.props.bookTitle}</div>
              <div className="title he" role="heading" aria-level="1" style={{"direction": "rtl"}}>{this.props.heBookTitle}</div>
          </div>
        ));

      }
      if (hasNext) {
        content.push((<LoadingMessage className="base next" key="next"/>));
      } else {
        content.push((<LoadingMessage message={bottomSymbol} heMessage={bottomSymbol} className="base next final" key="next"/>));
      }
    }

    return (<div className={classes} onMouseUp={this.handleTextSelection}>{content}</div>);
  }
}
TextColumn.propTypes = {
  srefs:                  PropTypes.array.isRequired,
  currVersions:           PropTypes.object.isRequired,
  highlightedRefs:        PropTypes.array,
  basetext:               PropTypes.bool,
  withContext:            PropTypes.bool,
  loadLinks:              PropTypes.bool,
  prefetchNextPrev:       PropTypes.bool,
  openOnClick:            PropTypes.bool,
  lowlight:               PropTypes.bool,
  multiPanel:             PropTypes.bool,
  mode:                   PropTypes.string,
  settings:               PropTypes.object,
  interfaceLang:          PropTypes.string,
  showBaseText:           PropTypes.func,
  updateTextColumn:       PropTypes.func,
  onSegmentClick:         PropTypes.func,
  onCitationClick:        PropTypes.func,
  setTextListHighlight:   PropTypes.func,
  setCurrentlyVisibleRef: PropTypes.func,
  setSelectedWords:       PropTypes.func,
  onTextLoad:             PropTypes.func,
  panelsOpen:             PropTypes.number,
  hasSidebar:             PropTypes.bool,
  layoutWidth:            PropTypes.number,
  textHighlights:         PropTypes.array,
  unsetTextHighlight:     PropTypes.func,
};


module.exports = TextColumn;
