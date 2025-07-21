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
import {ContentText} from "./ContentText";


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
  }
  componentDidMount() {
    this._isMounted          = true;
    this.node                = ReactDOM.findDOMNode(this)
    this.$container          = $(this.node);
    this.initialScrollTopSet = false;
    this.windowMiddle        = $(window).outerHeight() / (this.props.mode === "TextAndConnections" ? 4 : 2);

    // Set on mount, so placeholders aren't rendered server side to prevent intial layout shift
    this.setState({showScrollPlaceholders: true});

       const params = {
         content_type: Sefaria.index(this.props.bookTitle).primary_category,
         item_id: this.props.bookTitle
       }
      gtag("event", "select_content", params)

    this.node.addEventListener("scroll", this.handleScroll);
  }
  componentWillUnmount() {
    this._isMounted = false;
    this.node.removeEventListener("scroll", this.handleScroll);
  }
  componentDidUpdate(prevProps, prevState) {
    // Identify navigation changes from TOC and reset infinite scroll state
    // Reset if we have fewer sections in the navigation than we have loaded OR if it's a navigation to a single section
    if (this.numSectionsLoadedAtTop && this.props.srefs.length <= this.numSectionsLoadedAtTop || this.props.srefs.length === 1) {
      this.resetInfiniteScrollState();
    }
    
    const layoutWidth = this.$container.find(".textInner").width();
    const layoutWidthChanged = this.prevLayoutWidth && this.prevLayoutWidth !== layoutWidth;
    this.prevLayoutWidth = layoutWidth;

    if (prevProps.mode === "Text" && this.props.mode === "TextAndConnections") {
      // When opening mobile connections panel, scroll to highlighted
      this.scrollToHighlighted();

    } else if (this.state.showScrollPlaceholders && !prevState.showScrollPlaceholders && !this.initialScrollTopSet) {
      // After scroll placeholders are first rendered, scroll down so top placeholder
      // is out of view and scrolling up is possible.
      this.setInitialScrollPosition();

    } else if (this.props.srefs.length === 1 &&
        Sefaria.util.inArray(this.props.srefs[0], prevProps.srefs) === -1 &&
        !prevProps.srefs.some(r => Sefaria.refContains(this.props.srefs[0], r))) {
      // If we are switching to a single ref not in the current TextColumn,
      // treat it as a fresh open.
      this.setInitialScrollPosition();

    } else if (prevProps.srefs.length === this.props.srefs.length &&
      !prevProps.srefs.compare(this.props.srefs)) {
      // When the highlighted segment has changed, scroll to it.
      // refs length should be equal so as not to scroll when infinite scroll changes refs
      this.scrollToHighlighted();

    } else if ((this.props.settings.language !== prevProps.settings.language) ||
        !Sefaria.areBothVersionsEqual(prevProps.currVersions, this.props.currVersions)) {
      // When the content the changes but we are anchored on a line, scroll to it
      this.scrollToHighlighted();
    } else if (layoutWidthChanged) {
      // When the width of the text column changes, keep highlighted text in place
      this.restoreScrollPositionByPercentage();
    }
    
  }
  
  resetInfiniteScrollState() {
    // Reset all infinite scroll state variables
    // This is called when the user navigates through the TOC so the existing scroll position is not relevant
    this.numSectionsLoadedAtTop = 0;
    this.loadingContentAtTop = false;
    this.initialScrollTopSet = false;
  }
  handleScroll(event) {
    if (this.justScrolled) {
      this.justScrolled = false;
      return;
    }
    this.debouncedAdjustHighlightedAndVisible();
    this.adjustInfiniteScroll();
  }
  calculatePositionWithinElement(event){
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left; //x position within the element.
    const y = event.clientY - rect.top;  //y position within the element.
    return [x,y]
  }
  handleClick(event) {
    const pos = this.calculatePositionWithinElement(event)
    this.setState({lastClickXY:pos})
  }
  handleDoubleClick(event) {
    if (event.detail > 1) {
    const pos = this.calculatePositionWithinElement(event)
      // might be problematic if there is a slight move in the double-click shaky hands. can be fixed with an error of a few px on both axes.
      if (this.state.lastClickXY[0] !== pos[0] || this.state.lastClickXY[1] !== pos[1]){
        event.preventDefault();
      }
    }
  }

  handleTextSelection() {
    //Please note that because this function is triggered by an event listener on the document object, that will always be the event target
    // (should someone choose to add reference to the event itself in the future in this function) and not a more specific element.
    const selection = window.getSelection();
    let refs = [];
    if (selection.type === "Range") {
      const $start  = $(Sefaria.util.getSelectionBoundaryElement(true)).closest(".segment");
      const $end    = $(Sefaria.util.getSelectionBoundaryElement(false)).closest(".segment");
      let $segments = this.$container.find(".segment");
      let start     = $segments.index($start);
      let end       = $segments.index($end);
      //if one of the endpoints isn't actually in a segment node (for example its in a title), adjust selection endpoints
      start = start === -1 ? end : start;
      end = end === -1 ? start : end;
      $segments = $segments.slice(start, end+1);

      $segments.each(function() {
        refs.push($(this).attr("data-ref"));
      });

      if (refs.length > 0) {
        this.props.setTextListHighlight(refs);
      }
    }
    const selectedWords = Sefaria.util.getNormalizedSelectionString(); //this gets around the above issue
    if (selectedWords !== this.props.selectedWords) {
      this.props.setSelectedWords(selectedWords);
    }
  }
  handleTextLoad(ref) {
    // Called when TextRange components finish loading their content
    // This is where we handle scroll position adjustments and trigger additional loading
    
    // Don't adjust scroll positions while sections are still loading to prevent race conditions when mutliple section may load out of order.
    if (this.$container.find(".basetext.loading").length > 0) {
      return;
    }
    
    // Clear the loading flag if we were loading content at the top
    const wasLoadingContentAtTop = this.loadingContentAtTop;
    this.loadingContentAtTop = false;
    
    
    // Set initial scroll position if this is the first load
    if (!this.initialScrollTopSet) {
      this.setInitialScrollPosition();
      this.initialScrollTopSet = true;
    }
    
    // When content loads, check if we need to load another section below
    // This occurs when the loaded section is very short and whitespace is visible below it
    // Only check down - text load should never trigger infinite scroll up
    this.adjustInfiniteScroll(true);
    
    // If we were loading content at the top, restore scroll position to prevent jumping
    if (wasLoadingContentAtTop) {
      this.restoreScrollPositionAfterTopLoad();
    }
    
    // Special case: if only one text section is loaded, scroll to highlighted segment
    const $texts = this.$container.find(".basetext");
    if ($texts.length === 1) {
      this.scrollToHighlighted();
    }
  }
  
  setInitialScrollPosition() {
    // Sets scroll initial scroll position when a text is loaded which is either down to
    // the highlighted segments, or is just down far enough to hide the scroll placeholder above.
    if (this.node.scrollHeight < this.node.clientHeight) { return; }

    if (this.$container.find(".segment.invisibleHighlight").length) {
      // If there is a highlight the initial position scrolls to it.
      this.scrollToHighlighted();

    } else {
      // When a text is first loaded, scroll it down a small amount so that it is
      // possible to scroll up and trigger infinite scroll up. This also hides
      // "Loading..." div which sit above the text.
      const top = this.scrollPlaceholderHeight;
      this.setScrollTop(top);
    }
  }
  scrollToHighlighted() {
    // Scroll to the first highlighted segment
    if (!this._isMounted) { return; }
    const $container   = this.$container;
    const $readerPanel = $container.closest(".readerPanel");
    const $highlighted = $container.find(".segment.invisibleHighlight").first();
    if ($highlighted.length) {
      const adjust = this.scrollPlaceholderHeight + this.scrollPlaceholderMargin;
      let top = $highlighted.position().top + adjust - this.highlightThreshhold;
      top = top > this.scrollPlaceholderHeight ? top : this.scrollPlaceholderHeight;
      this.setScrollTop(top);
      if ($readerPanel.attr("id") == $(".readerPanel:last").attr("id")) {
        $highlighted.focus();
      }
    }
  }
  restoreScrollPositionAfterTopLoad() {
    // After new TextRanges load at the top, adjust scroll position to prevent content jumping
    const $texts = this.$container.find(".basetext");
    
    // Check if we can safely restore scroll position
    // Need at least 2 text sections and first one should be loaded
    if ($texts.length < 2 || $texts.eq(0).hasClass("loading")) {
      return;
    }
    
    // Calculate the new scroll position
    const newScrollTop = this.calculateScrollPositionAfterTopLoad($texts);
    
    // Apply the new scroll position
    this.setScrollTop(newScrollTop);
  }

  
  calculateScrollPositionAfterTopLoad($texts) {
    // Calculate the correct scroll position after new content has been loaded at the top
    // The goal is to keep the user viewing the same content they were looking at before (avoid a jump)
    const targetTop = $texts.eq(this.numSectionsLoadedAtTop).position().top;
    const adjust = this.scrollPlaceholderHeight + this.scrollPlaceholderMargin;
    
    const currentScrollTop = this.node.scrollTop;
    const calculatedTop = targetTop + currentScrollTop - adjust;
    
    return calculatedTop;
  }
  restoreScrollPositionByPercentage() {
    // After the layout width of the column changes, restore the scroll to the same percentage
    // of it's scroll position it had before. This approximates keeping the currently visible
    // content in place, even thought its scroll position has changed due to the new layout.
    if (!this.prevScrollPercentage) { return; }
    const target = this.node.scrollHeight * this.prevScrollPercentage;
    this.setScrollTop(target);
  }
  setScrollTop(targetScrollTop) {
    // Set the scroll position and prevent the scroll event handler from firing
    // The justScrolled flag prevents handleScroll from running when we programmatically scroll
    
    // Prevent the scroll event handler from firing for this programmatic scroll
    this.justScrolled = true;
    
    // Apply the new scroll position
    this.node.scrollTop = targetScrollTop;
  }
  adjustInfiniteScroll(downOnly=false) {
    // Add or remove TextRanges from the top or bottom, depending on scroll position
    if (!this._isMounted) { return; }
    if (this.node.scrollHeight <= this.node.clientHeight) { return; }

    const $node = this.$container;
    const $lastText = $node.find(".textRange.basetext").last();
    if (!$lastText.length) { return; }
    
    const windowTop = this.node.scrollTop;
    const windowHeight = $node.outerHeight();
    const lastTop = $lastText.position().top;
    const lastBottom = lastTop + $lastText.outerHeight();
    
    // Check if we need to load content above (user scrolled near top)
    if (windowTop < 75 && !this.loadingContentAtTop && !downOnly) {
      this.handleInfiniteScrollUp();
    } 
    // Check if we need to load content below (user scrolled near bottom)
    else if (lastBottom < windowHeight + 80) {
      this.handleInfiniteScrollDown();
    }
  }

  handleInfiniteScrollUp() {
    // When user scrolls near the top, load previous sections above current content
    // This prevents the user from hitting the top and enables smooth upward scrolling
    
    const refs = this.props.srefs.slice();
    const topRef = refs[0]; // Currently displayed top section
    
    const currentData = Sefaria.ref(topRef);
    if (!currentData?.next) {
      return; // No previous content available
    }
    
    // Build list of previous sections to load
    const newRefs = this.buildPreviousRefs(currentData, refs);
    
    // Set flag to indicate we're loading content at top (affects scroll restoration)
    this.loadingContentAtTop = true;
    
    this.props.updateTextColumn(newRefs);
  }

  buildPreviousRefs(currentData, existingRefs) {
    // Build a list of previous sections to load, starting from the current top section
    // We load multiple sections at once for better performance
    const refs = existingRefs.slice();
    
    // Add the immediate previous section
    refs.splice(0, 0, currentData.prev);
    this.numSectionsLoadedAtTop = 1;
    
    // Try to load additional previous sections (up to 10 total)
    let prevData = Sefaria.ref(currentData.prev);
    let earlierData = prevData ? Sefaria.ref(prevData.prev) : null;

    while (earlierData && this.numSectionsLoadedAtTop < 10) {
      refs.splice(0, 0, earlierData.ref);
      this.numSectionsLoadedAtTop += 1;
      earlierData = Sefaria.ref(earlierData.prev);
    }
    
    return refs;
  }

  handleInfiniteScrollDown() {
    // When user scrolls near the bottom, load next sections below current content
    // This enables smooth downward scrolling
    const $lastText = this.$container.find(".textRange.basetext").last();
      if ($lastText.hasClass("loading")) {
        return; // Don't load more while already loading
      }
    
    const refs = this.props.srefs.slice();
    const currentRef = refs.slice(-1)[0]; // Currently displayed bottom section
    const currentData = Sefaria.ref(currentRef);
    
    if (!currentData?.next) {
      return; // No next content available
    }
    
    // Build list of next sections to load
    const newRefs = this.buildNextRefs(currentData, refs);
    this.props.updateTextColumn(newRefs);
  }

  buildNextRefs(currentData, existingRefs) {
    // Build a list of next sections to load, starting from the current bottom section
    // We load multiple sections at once for better performance
    const refs = existingRefs.slice();
    
    // Add the immediate next section
    refs.push(currentData.next);
    let numSectionsAddToBottom = 1;

    // Try to load additional next sections (up to 10 total)
    let nextData = Sefaria.ref(currentData.next);
    let laterData = nextData ? Sefaria.ref(nextData.next) : null;

         while (laterData && numSectionsAddToBottom < 10) {
          refs.push(laterData.ref);
          laterData = Sefaria.ref(laterData.next);
          numSectionsAddToBottom += 1;
        }

    return refs;
  }
  adjustHighlightedAndVisible() {
    // Adjust which ref is currently consider visible for header and URL,
    // and while the TextList is open, update which segment should be highlighted.
    // Keeping the highlightedRefs value in the panel ensures it will return
    // to the right location after closing other panels.
    if (!this._isMounted) { return; }

    this.prevScrollPercentage = this.node.scrollTop / this.node.scrollHeight;

    // When using tab to navigate (i.e. a11y) set ref to currently focused ref
    let $segment = null;
    if ($("body").hasClass("user-is-tabbing") && $(".segment:focus").length > 0) {
      $segment = $(".segment:focus").eq(0);
    } else {
      const $container = this.$container;
      $container.find(".basetext .segment").each(function(i, segment) {
        const top = $(segment).offset().top - $container.offset().top;
        const bottom = $(segment).outerHeight() + top;
        if (bottom > this.windowMiddle || top >= this.highlightThreshhold) {
          $segment = $(segment);
          return false;
        }
      }.bind(this));
    }

    if (!$segment) { return; }

    const $section = $segment.closest(".textRange");
    const sectionRef = $section.attr("data-ref");
    this.props.setCurrentlyVisibleRef(sectionRef);

    // don't move around highlighted segment when scrolling a single panel,
    const shouldShowHighlight = this.props.hasSidebar || this.props.mode === "TextAndConnections";
    const ref = $segment.attr("data-ref");
    this.props.setTextListHighlight(ref, shouldShowHighlight);
  }
  render() {
    let classes = classNames({textColumn: 1, connectionsOpen: this.props.mode === "TextAndConnections"});
    const index = Sefaria.index(Sefaria.parseRef(this.props.srefs[0]).index);
    const isDictionary = (index && index.categories[0] === "Reference");
    let content =  this.props.srefs.map((sref) => {
      const oref = Sefaria.getRefFromCache(sref);
      const isCurrentlyVisible = oref && this.props.currentlyVisibleRef === oref.sectionRef;
      return (<TextRange
        panelPosition ={this.props.panelPosition}
        sref={sref}
        isCurrentlyVisible={isCurrentlyVisible}
        currVersions={this.props.currVersions}
        highlightedRefs={this.props.highlightedRefs}
        showHighlight={this.props.showHighlight}
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
        navigatePanel={this.props.navigatePanel}
        translationLanguagePreference={this.props.translationLanguagePreference}
        key={sref || oref.sectionRef} />);
    });

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
          <div className="title" role="heading" aria-level="1">
            <ContentText text={{en: this.props.bookTitle, he: this.props.heBookTitle}} defaultToInterfaceOnBilingual={true} />
          </div>
        </div> : null;

      pre = this.state.showScrollPlaceholders ?
        (noPrev ? bookTitle :
        <LoadingMessage className="base prev" key={"prev"}/>) : null;

      post = hasNext && this.state.showScrollPlaceholders ?
        <LoadingMessage className="base next" key={"next"}/> :
        <LoadingMessage message={" "} heMessage={" "} className="base next final" key={"next"}/>;
    }

    return (<div className={classes} onMouseUp={this.handleTextSelection} onClick={this.handleClick} onMouseDown={this.handleDoubleClick}>
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
  translationLanguagePreference: PropTypes.string,
  navigatePanel:          PropTypes.func,
};


export default TextColumn;
