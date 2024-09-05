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
    const layoutWidth = this.$container.find(".textInner").width();
    const layoutWidthChanged = this.prevLayoutWidth && this.prevLayoutWidth !== layoutWidth;
    this.prevLayoutWidth = layoutWidth;

    if (prevProps.mode === "Text" && this.props.mode === "TextAndConnections") {
      // When opening mobile connections panel, scroll to highlighted
      // console.log("scroll to highlight for mobile connections open")
      this.scrollToHighlighted();

    } else if (this.state.showScrollPlaceholders && !prevState.showScrollPlaceholders && !this.initialScrollTopSet) {
      // After scroll placeholders are first rendered, scroll down so top placeholder
      // is out of view and scrolling up is possible.
      // console.log("scrolling for ScrollPlaceholders first render")
      this.setInitialScrollPosition();

    } else if (this.props.srefs.length === 1 &&
        Sefaria.util.inArray(this.props.srefs[0], prevProps.srefs) === -1 &&
        !prevProps.srefs.some(r => Sefaria.refContains(this.props.srefs[0], r))) {
      // If we are switching to a single ref not in the current TextColumn,
      // treat it as a fresh open.
      // console.log("setting initialScroll for brand new ref")
      this.setInitialScrollPosition();

    } else if (prevProps.srefs.length === this.props.srefs.length &&
      !prevProps.srefs.compare(this.props.srefs)) {
      // When the highlighted segment has changed, scroll to it.
      // refs length should be equal so as not to scroll when infinite scroll changes refs
      this.scrollToHighlighted();

    } else if ((this.props.settings.language !== prevProps.settings.language) ||
        (prevProps.currVersions.en !== this.props.currVersions.en) ||
        (prevProps.currVersions.he !== this.props.currVersions.he)) {
      // When the content the changes but we are anchored on a line, scroll to it
      // console.log("scroll to highlighted on text content change")
      this.scrollToHighlighted();
    } else if (layoutWidthChanged) {
      // When the width of the text column changes, keep highlighted text in place
      // console.log("restore scroll by percentage for layout Width Change")
      this.restoreScrollPositionByPercentage();
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
      //console.log("handling range");
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

      //console.log("Setting highlights by Text Selection");
      //console.log(refs);
      if (refs.length > 0) {
        this.props.setTextListHighlight(refs);
      }
    }
    //const selectedWords = selection.toString(); //this doesnt work in Chrome, as it does not skip elements marked with css `user-select: none` as it should.
    const selectedWords = Sefaria.util.getNormalizedSelectionString(); //this gets around the above issue
    if (selectedWords !== this.props.selectedWords) {
      //console.log("setting selecting words")
      this.props.setSelectedWords(selectedWords);
    }
  }
  handleTextLoad(ref) {

    // TextRanges in the column may be initial rendered in "loading" state without data.
    // When the data loads we may need to change scroll position or render addition ranges.
    // console.log("handle text load: ", ref);
    if (this.$container.find(".basetext.loading").length) {
      // Don't mess with scroll positions until all sections of text have loaded,
      // prevent race conditions when mutliple section may load out of order.
      return;
    }

    if (!this.initialScrollTopSet) {
      this.setInitialScrollPosition();
      this.initialScrollTopSet = true;
    }

    // When content loads check if we already need to load another section below, which
    // occurs when the loaded section is very short and whitespace is already visible below it.
    // Only check down, a text load should never trigger an infinite scroll up
    // console.log("Checking infinite scroll down");
    this.adjustInfiniteScroll(true);

    if (this.loadingContentAtTop) {
      // If the text that was just loaded was at the top of the page, restore the scroll
      // position to keep what the user was looking at in place.
      this.restoreScrollPositionAfterTopLoad();
    }

    const $texts  = this.$container.find(".basetext")

    if ($texts.length == 1) {
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
      // possible to scroll up and trigginer infinites scroll up. This also hides
      // "Loading..." div which sit above the text.
      const top = this.scrollPlaceholderHeight;
      // console.log("set Initial Scroll Postion: ", top);
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
    const $texts  = this.$container.find(".basetext");
    if ($texts.length < 2 || $texts.eq(0).hasClass("loading") ) { return; }

    this.loadingContentAtTop = false;
    const targetTop = $texts.eq(this.numSectionsLoadedAtTop).position().top;
    const adjust = this.scrollPlaceholderHeight + this.scrollPlaceholderMargin;
    const top = targetTop + (2*this.node.scrollTop) - adjust;
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
    const $node        = this.$container;

    let refs         = this.props.srefs.slice();
    const $lastText    = $node.find(".textRange.basetext").last();
    if (!$lastText.length) { console.log("no last basetext"); return; }
    const lastTop      = $lastText.position().top;
    const lastBottom   = lastTop + $lastText.outerHeight();
    const windowHeight = $node.outerHeight();
    const windowTop    = this.node.scrollTop;
    let data;
    if (windowTop < 75 && !this.loadingContentAtTop && !downOnly) {
      // UP: add the previous section above then adjust scroll position so page doesn't jump
      // console.log("Inifite Scroll UP");
      let topRef = refs[0];
      data   = Sefaria.ref(topRef);   // data for current ref
      if (data && data.prev) {
        refs.splice(refs, 0, data.prev);  // Splice in at least the previous one (-1)
        this.numSectionsLoadedAtTop = 1;

        let prevData, earlierData;

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
      let currentRef = refs.slice(-1)[0];
      data       = Sefaria.ref(currentRef);
      if (data && data.next) {
        refs.push(data.next); // Append at least the next one
        let numSectionsAddToBottom = 1;
        let nextData, laterData;

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

  setTextCompletionStatus(versions){
    let ribbonStyle
    Sefaria.interfaceLang == "hebrew" ? ribbonStyle = 'ribbon-wrap ribbon-padding' : ribbonStyle = 'ribbon-wrap'
    if (status == "done") {
      return null
    } else {
      return (
        <div className={ribbonStyle}>{Sefaria._("text.versions.in_progress")}</div>
      )
    } 
     
  }

  render() {
    let classes = classNames({textColumn: 1, connectionsOpen: this.props.mode === "TextAndConnections"});
    const index = Sefaria.index(Sefaria.parseRef(this.props.srefs[0]).index);
    const versions = Sefaria.getRefFromCache(this.props.srefs[0])?.versions;
    const isDictionary = (index && index.categories[0] === "Reference");
    let content =  this.props.srefs.map((sref, i) => {
      const oref = Sefaria.getRefFromCache(sref);
      
      const isCurrentlyVisible = oref && this.props.currentlyVisibleRef === oref.sectionRef;
      return (
        <div key={i}>
        <TextRange
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
        updateCurrVersionsToMatchAPIResult={this.props.updateCurrVersionsToMatchAPIResult}
        key={sref} />
        </div>
        
      );
    });

    let pre, post, bookTitle, textStatus;
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
      textStatus = versions ?
       this.setTextCompletionStatus(versions): null
          
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
