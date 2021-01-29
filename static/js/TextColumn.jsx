import {
  LoadingMessage
} from './Misc';
import React  from 'react';
import ReactDOM  from 'react-dom';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import TextRange  from './TextRange';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import Component from 'react-class';


class TextColumn extends Component {
  // An infinitely scrollable column of text, composed of TextRanges for each section.
  constructor(props) {
    super(props);
    this.state = {
      showScrollPlaceholders: false
    };
    this.debouncedAdjustHighlightedAndVisible = Sefaria.util.debounce(this.adjustHighlightedAndVisible, 100);
    this.scrollPlaceholderHeight = 90;
    this.scrollPlaceholderMargin = 30;
    this.highlightThreshhold = props.multiPanel ? 140 : 70;
    return;
  }  
  componentDidMount() {
    this._isMounted          = true;
    this.node                = ReactDOM.findDOMNode(this)
    this.$container          = $(this.node);
    this.initialScrollTopSet = false;
    this.windowMiddle        = $(window).outerHeight() / 2;

    // Set on mount, so placeholders aren't rendered server side to prevent intial layout shift
    this.setState({showScrollPlaceholders: true});

    this.node.addEventListener("scroll", this.handleScroll);
  }
  componentWillUnmount() {
    this._isMounted = false;
    this.node.removeEventListener("scroll", this.handleScroll);
  }
  componentDidUpdate(prevProps, prevState) {
    const layoutWidth = this.$container.find(".textInner").width();
    const layoutWidthChanged = this.prevLayoutWidth && this.prevLayoutWidth !== layoutWidth;
    this.prevLayoutWidth = layoutWidth;

    if (prevProps.mode === "Text" && this.props.mode === "TextAndConnections") {
      // When opening mobile connections panel, scroll to highlighted
      // console.log("scroll to highlight for mobile connections open")
      this.scrollToHighlighted();

    } else if (this.state.showScrollPlaceholders && !prevState.showScrollPlaceholders) {
      // After scroll placeholders are first rendered, scroll down so top placeholder 
      // is out of view and scrolling up is possible.
      // console.log("scrolling for ScrollPlaceholders first render")
      this.setInitialScrollPosition();

    } else if (this.props.srefs.length == 1 && Sefaria.util.inArray(this.props.srefs[0], prevProps.srefs) == -1) {
      // If we are switching to a single ref not in the current TextColumn, 
      // treat it as a fresh open.
      // console.log("setting initialScroll for brand new ref")
      this.setInitialScrollPosition();

    } else if (layoutWidthChanged) {
      // When the width of the text column changes, keep highlighted text in place
      // console.log("restore scroll by percentage for layout Width Change")
      this.restoreScrollPositionByPercentage();
    
    } else if ((this.props.settings.language !== prevProps.settings.language) ||
        (prevProps.currVersions.en !== this.props.currVersions.en) ||
        (prevProps.currVersions.he !== this.props.currVersions.he)) {
      // When the content the changes but we are anchored on a line, scroll to it
      // console.log("scroll to highlighted on text content change")
      this.scrollToHighlighted();
    }
  }
  handleScroll(event) {
    // console.log("scroll");
    if (this.justScrolled) {
      // console.log("passed scroll");
      this.justScrolled = false;
      return;
    }
    // console.log("handled Scroll");
    this.debouncedAdjustHighlightedAndVisible();
    this.adjustInfiniteScroll();
  }
  handleTextSelection() {
    const selection = window.getSelection();
    if (selection.type === "Range") {
      //console.log("handling range");
      const $start    = $(Sefaria.util.getSelectionBoundaryElement(true)).closest(".segment");
      const $end      = $(Sefaria.util.getSelectionBoundaryElement(false)).closest(".segment");
      let $segments = this.$container.find(".segment");
      let start     = $segments.index($start);
      let end       = $segments.index($end);
      //if one of the endpoints isn't actually in a segment node (for example its in a title), adjust selection endpoints
      start = start == -1 ? end : start;
      end = end == -1 ? start : end;
      $segments = $segments.slice(start, end+1);
      let refs      = [];

      $segments.each(function() {
        refs.push($(this).attr("data-ref"));
      });

      //console.log("Setting highlights by Text Selection");
      //console.log(refs);
      this.props.setTextListHighlight(refs);
    }
    //const selectedWords = selection.toString(); //this doesnt work in Chrome, as it does not skip elements marked with css `user-select: none` as it should.
    const selectedWords = Sefaria.util.getNormalizedSelectionString(); //this gets around the above issue
    if (selectedWords !== this.props.selectedWords) {
      //console.log("setting selecting words")
      this.props.setSelectedWords(selectedWords);
    }
  }
  handleTextLoad(ref) {
    // TextRanges in the column may be initial rendered in "loading" state with out data.
    // When the data loads we may need to change scroll position or render addition ranges.
    // console.log("handle text load: ", ref);

    if (!this.initialScrollTopSet) {
      this.setInitialScrollPosition();
      this.initialScrollTopSet = true;
    }

    if (ref == this.props.srefs.slice(-1)[0]) {
      // When content loads check if we already need to load another section below, which
      // occurs when the loaded section is very short and whitespace is already visible below it.
      // Only check down, a text load should never trigger an infinite scroll up
      // console.log("Checking infinite scroll down");
      this.adjustInfiniteScroll(true);
    }

    if (this.loadingContentAtTop) {
      // If the text that was just loaded was t the top of the page, restore the scroll 
      // position to keep what the user was looking at in place. 
      this.restoreScrollPositionAfterTopLoad();
    }
  }
  setInitialScrollPosition() {    
    // Sets scroll initial scroll position when a text is loaded which is either down to
    // the highlighted segments, or is just down far enough to hide the scroll placeholder above.

    if (this.node.scrollHeight < this.node.clientHeight) { return; }

    if (this.$container.find(".segment.highlight").length) {
      // If there is a highlight the initial position scrolls to it.
      this.scrollToHighlighted();

    } else {
      // When a test is first loaded, scroll it down a small amount so that it is
      // possible to scroll up and trigginer infinites scroll up. This also hides 
      // "Loading..." div which sit above the text.
      var top = this.scrollPlaceholderHeight;
      // console.log("set Initial Scroll Postion: ", top);
      this.setScrollTop(top);
    }
  }
  scrollToHighlighted() {
    // Scroll to the first highlighted segment
    if (!this._isMounted) { return; }
    var $container   = this.$container;
    var $readerPanel = $container.closest(".readerPanel");
    var $highlighted = $container.find(".segment.highlight").first();
    if ($highlighted.length) {
      var adjust = this.scrollPlaceholderHeight + this.scrollPlaceholderMargin;
      var top = $highlighted.position().top + adjust - this.highlightThreshhold;
      var top = top > this.scrollPlaceholderHeight ? top : this.scrollPlaceholderHeight;
      this.setScrollTop(top);
      // console.log("scroll to highlighted: ", top);
      if ($readerPanel.attr("id") == $(".readerPanel:last").attr("id")) {
        $highlighted.focus();
      }
    }
  }
  restoreScrollPositionAfterTopLoad() {
    // After one or more new TextRanges have just loaded in the first position, scroll
    // down to the TextRange that was visible before, so the TextColumn doesn't jump.
    // console.log("checking restore scroll after up");
    var $texts  = this.$container.find(".basetext");
    if ($texts.length < 2 || $texts.eq(0).hasClass("loading") ) { return; }

    this.loadingContentAtTop = false;
    var targetTop = $texts.eq(this.numSectionsLoadedAtTop).position().top;
    var adjust = this.scrollPlaceholderHeight + this.scrollPlaceholderMargin;
    var top = targetTop + (2*this.node.scrollTop) - adjust;
    this.setScrollTop(top);
    // console.log("scroll to restore after infinite up: " + top)  
  }
  restoreScrollPositionByPercentage() {
    // After the layout width of the column changes, restore the scroll to the same percentage
    // of it's scroll position it had before. This approximates keeping the currently visible
    // content in place, even thought its scroll position has changed due to the new layout.
    if (!this.prevScrollPercentage) { return; }
    const target = this.node.scrollHeight * this.prevScrollPercentage;
    this.setScrollTop(target);
  }
  setScrollTop(top) {
    // Set the scroll top of the column, including the flag to prevent extra handling 
    // of scroll event.
    this.justScrolled = true;
    this.node.scrollTop = top;
  }
  adjustInfiniteScroll(downOnly=false) {
    // Add or remove TextRanges from the top or bottom, depending on scroll position
    // console.log("adjust Infinite Scroll");
    if (!this._isMounted) { return; }
    if (this.node.scrollHeight <= this.node.clientHeight) { return; }
    var $node        = this.$container;

    var refs         = this.props.srefs.slice();
    var $lastText    = $node.find(".textRange.basetext").last();
    if (!$lastText.length) { console.log("no last basetext"); return; }
    var lastTop      = $lastText.position().top;
    var lastBottom   = lastTop + $lastText.outerHeight();
    var windowHeight = $node.outerHeight();
    var windowTop    = this.node.scrollTop;
    var windowBottom = windowTop + windowHeight;
    if (windowTop < 75 && !this.loadingContentAtTop && !downOnly) {
      // UP: add the previous section above then adjust scroll position so page doesn't jump
      // console.log("Inifite Scroll UP");
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

        while(earlierData && this.numSectionsLoadedAtTop < 10) {
          refs.splice(refs, 0, earlierData.ref);
          this.numSectionsLoadedAtTop += 1;
          earlierData = Sefaria.ref(earlierData.prev);
        }

        //console.log("Up! Add previous section. Windowtop is: " + windowTop);
        this.loadingContentAtTop = true;
        this.props.updateTextColumn(refs);
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
        let numSectionsAddToBottom = 1;
        var nextData, laterData;

        // Now, only add sources if we have data for them
        if(nextData = Sefaria.ref(data.next)) {
          laterData = Sefaria.ref(nextData.next);
        }

        while(laterData && numSectionsAddToBottom < 10) {
          refs.push(laterData.ref);
          laterData = Sefaria.ref(laterData.next);
          numSectionsAddToBottom += 1;
        }

        this.props.updateTextColumn(refs);
      }
    }
  }
  adjustHighlightedAndVisible() {
    //console.log("adjustHighlightedAndVisible");
    // Adjust which ref is current consider visible for header and URL,
    // and while the TextList is open, update which segment should be highlighted.
    // Keeping the highlightedRefs value in the panel ensures it will return
    // to the right location after closing other panels.
    if (!this._isMounted) { return; }

    this.prevScrollPercentage = this.node.scrollTop / this.node.scrollHeight;

    // When using tab to navigate (i.e. a11y) set ref to currently focused ref
    var $segment = null;
    if ($("body").hasClass("user-is-tabbing") && $(".segment:focus").length > 0) {
      $segment = $(".segment:focus").eq(0);
    } else {
      var $container = this.$container;
      $container.find(".basetext .segment").each(function(i, segment) {
        var top = $(segment).offset().top - $container.offset().top;
        var bottom = $(segment).outerHeight() + top;
        if (bottom > this.windowMiddle || top >= this.highlightThreshhold) {
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
        onNamedEntityClick={this.props.onNamedEntityClick}
        onTextLoad={this.handleTextLoad}
        filter={this.props.filter}
        panelsOpen={this.props.panelsOpen}
        layoutWidth={this.props.layoutWidth}
        unsetTextHighlight={this.props.unsetTextHighlight}
        key={ref} />);
    }.bind(this));

    let pre, post, bookTitle;
    if (content.length) {
      // Add Next and Previous loading indicators
      const first   = Sefaria.ref(this.props.srefs[0]);
      const last    = Sefaria.ref(this.props.srefs.slice(-1)[0]);
      const hasPrev = first && first.prev;
      const noPrev  = first && !first.prev; // first is loaded, so we actually know there's nothing prev
      const hasNext = last && last.next;
  
      bookTitle = noPrev ? 
        <div className="bookMetaDataBox" key="bookTitle">
          <div className="title en" role="heading" aria-level="1" style={{"direction": "ltr"}}>{this.props.bookTitle}</div>
          <div className="title he" role="heading" aria-level="1" style={{"direction": "rtl"}}>{this.props.heBookTitle}</div>
        </div> : null;

      pre = this.state.showScrollPlaceholders ? 
        (noPrev ? bookTitle :
        <LoadingMessage className="base prev" key={"prev"}/>) : null;
      
      post = hasNext && this.state.showScrollPlaceholders ? 
        <LoadingMessage className="base next" key={"next"}/> :
        <LoadingMessage message={" "} className="base next final" key={"next"}/>;
    }

    return (<div className={classes} onMouseUp={this.handleTextSelection}>
      {pre}
      {content}
      {post}
    </div>);
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
  onNamedEntityClick:     PropTypes.func,
  setTextListHighlight:   PropTypes.func,
  setCurrentlyVisibleRef: PropTypes.func,
  setSelectedWords:       PropTypes.func,
  onTextLoad:             PropTypes.func,
  panelsOpen:             PropTypes.number,
  hasSidebar:             PropTypes.bool,
  textHighlights:         PropTypes.array,
  unsetTextHighlight:     PropTypes.func,
};


export default TextColumn;
