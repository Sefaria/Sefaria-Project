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
    this._isMounted = true;
    this.$container = $(ReactDOM.findDOMNode(this));
    this.initialScrollTopSet = false;
    this.justTransitioned    = true;
    this.setScrollPosition();
    this.adjustInfiniteScroll();
    this.setPaddingForScrollbar();
    this.debouncedAdjustTextListHighlight = Sefaria.util.debounce(this.adjustTextListHighlight, 100);
    var node = ReactDOM.findDOMNode(this);
    node.addEventListener("scroll", this.handleScroll);
  }
  componentWillUnmount() {
    this._isMounted = false;
    var node = ReactDOM.findDOMNode(this);
    node.removeEventListener("scroll", this.handleScroll);
  }
  componentWillReceiveProps(nextProps) {
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
    if (this.props.highlightedRefs.length) {
      //console.log("Calling debouncedAdjustTextListHighlight");
      this.debouncedAdjustTextListHighlight();
    }
    this.adjustInfiniteScroll();
  }
  handleTextSelection() {
    var selection = window.getSelection();

    if (selection.type === "Range") {
      var $start    = $(Sefaria.util.getSelectionBoundaryElement(true)).closest(".segment");
      var $end      = $(Sefaria.util.getSelectionBoundaryElement(false)).closest(".segment");
      var $segments = $start.is($end) ? $start : $start.nextUntil($end, ".segment").add($start).add($end);
      var refs      = [];

      $segments.each(function() {
        refs.push($(this).attr("data-ref"));
      });

      //console.log("Setting highlights by Text Selection");
      this.props.setTextListHighlight(refs);
    }

    this.props.setSelectedWords(selection.toString());
  }
  handleTextLoad() {
    if (this.loadingContentAtTop || !this.initialScrollTopSet) {
      //console.log("text load, setting scroll");
      this.setScrollPosition();
    } else if (!this.scrolledToHighlight && $(ReactDOM.findDOMNode(this)).find(".segment.highlight").length) {
      //console.log("scroll to highlighted")
      this.scrollToHighlighted();
      this.scrolledToHighlight = true;
      this.initialScrollTopSet = true;
    }

    this.adjustInfiniteScroll();
  }
  setScrollPosition() {
    // console.log("ssp");
    // Called on every update, checking flags on `this` to see if scroll position needs to be set
    if (this.loadingContentAtTop) {
      // After adding content by infinite scrolling up, scroll back to what the user was just seeing
      //console.log("loading at top");
      var $node   = this.$container;
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
       // console.log(top)
      }
    } else if (!this.scrolledToHighlight && $(ReactDOM.findDOMNode(this)).find(".segment.highlight").length) {
      //console.log("scroll to highlighted");
      // scroll to highlighted segment
      this.scrollToHighlighted();
      this.scrolledToHighlight = true;
      this.initialScrollTopSet = true;
      this.justScrolled        = true;
    } else if (!this.initialScrollTopSet) {
      //console.log("initial scroll to 30");
      // initial value set below 0 so you can scroll up for previous
      var node = ReactDOM.findDOMNode(this);
      node.scrollTop = 30;
      this.initialScrollTopSet = true;
    }
    // This fixes loading of next content when current content is short in viewport,
    // but breaks loading highlighted ref, jumping back up to top of section
    // this.adjustInfiniteScroll();
  }
  adjustInfiniteScroll() {
    // Add or remove TextRanges from the top or bottom, depending on scroll position
    // console.log("adjust Infinite Scroll");
    if (!this._isMounted) { return; }
    var node         = ReactDOM.findDOMNode(this);
    var $node        = $(node);

    var refs         = this.props.srefs;
    var $lastText    = $node.find(".textRange.basetext").last();
    if (!$lastText.length) { console.log("no last basetext"); return; }
    var lastTop      = $lastText.position().top;
    var lastBottom   = lastTop + $lastText.outerHeight();
    var windowHeight = $node.outerHeight();
    var windowTop    = node.scrollTop;
    var windowBottom = windowTop + windowHeight;
    if (lastTop > (windowHeight + 100) && refs.length > 1) {
      // Remove a section scrolled out of view on bottom
      refs = refs.slice(0,-1);
      this.props.updateTextColumn(refs);
    } else if (windowTop < 21 && !this.loadingContentAtTop) {
      // UP: add the previous section above then adjust scroll position so page doesn't jump
      var topRef = refs[0];
      var data   = Sefaria.ref(topRef);
      if (data && data.prev) {
        //console.log("Up! Add previous section");
        refs.splice(refs, 0, data.prev);
        this.loadingContentAtTop = true;
        this.props.updateTextColumn(refs);
        Sefaria.track.event("Reader", "Infinite Scroll", "Up");
      }
    } else if ( lastBottom < windowHeight + 80 ) {
      // DOWN: add the next section to bottom
      if ($lastText.hasClass("loading")) {
        // console.log("last text is loading - don't add next section");
        return;
      }
      //console.log("Down! Add next section");
      var currentRef = refs.slice(-1)[0];
      var data       = Sefaria.ref(currentRef);
      if (data && data.next) {
        refs.push(data.next);
        this.props.updateTextColumn(refs);
        Sefaria.track.event("Reader", "Infinite Scroll", "Down");
      }
    }  else {
      // nothing happens
    }
  }
  getHighlightThreshhold() {
    // Returns the distance from the top of screen that we want highlighted segments to appear below.
    return this.props.multiPanel ? 200 : 50;
  }
  adjustTextListHighlight() {
    // console.log("adjustTextListHighlight");
    // When scrolling while the TextList is open, update which segment should be highlighted.
    if (this.props.multiPanel && this.props.layoutWidth == 100) {
      return; // Hacky - don't move around highlighted segment when scrolling a single panel,
    }
    // but we do want to keep the highlightedRefs value in the panel
    // so it will return to the right location after closing other panels.
    if (!this._isMounted) { return; }
    var $container   = this.$container;
    var threshhold   = this.getHighlightThreshhold();
    $container.find(".basetext .segment").each(function(i, segment) {
      var $segment = $(segment);
      if ($segment.offset().top > threshhold) {
        var ref = $segment.attr("data-ref");
        this.props.setTextListHighlight(ref);
        return false;
      }
    }.bind(this));
  }
  scrollToHighlighted() {
    window.requestAnimationFrame(function() {
      if (!this._isMounted) { return; }
      //console.log("scroll to highlighted - animation frame");
      var $container   = this.$container;
      var $readerPanel = $container.closest(".readerPanel");
      var $highlighted = $container.find(".segment.highlight").first();
      if ($highlighted.length) {
        this.justScrolled = true;
        var offset = this.getHighlightThreshhold();
        $container.scrollTo($highlighted, 0, {offset: -offset});
      }
    }.bind(this));
  }
  setPaddingForScrollbar() {
    // Scrollbars take up spacing, causing the centering of TextColumn to be slightly off center
    // compared to the header. This functions sets appropriate padding to compensate.
    var width      = Sefaria.util.getScrollbarWidth();
    if (this.props.interfaceLang == "hebrew") {
      this.$container.css({paddingRight: width, paddingLeft: 0});
    } else {
      this.$container.css({paddingRight: 0, paddingLeft: width});
    }
  }
  render() {
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
        onTextLoad={this.handleTextLoad.bind(this)}
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
}
TextColumn.propTypes = {
  srefs:                 PropTypes.array.isRequired,
  version:               PropTypes.string,
  versionLanguage:       PropTypes.string,
  highlightedRefs:       PropTypes.array,
  basetext:              PropTypes.bool,
  withContext:           PropTypes.bool,
  loadLinks:             PropTypes.bool,
  prefetchNextPrev:      PropTypes.bool,
  openOnClick:           PropTypes.bool,
  lowlight:              PropTypes.bool,
  multiPanel:            PropTypes.bool,
  mode:                  PropTypes.string,
  settings:              PropTypes.object,
  interfaceLang:         PropTypes.string,
  showBaseText:          PropTypes.func,
  updateTextColumn:      PropTypes.func,
  onSegmentClick:        PropTypes.func,
  onCitationClick:       PropTypes.func,
  setTextListHighlight:  PropTypes.func,
  setSelectedWords:      PropTypes.func,
  onTextLoad:            PropTypes.func,
  panelsOpen:            PropTypes.number,
  layoutWidth:           PropTypes.number
};


module.exports = TextColumn;
