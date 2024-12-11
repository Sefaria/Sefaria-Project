import Component from "react-class";
import $ from "../sefaria/sefariaJquery";
import ReactDOM from "react-dom";
import Sefaria from "../sefaria/sefaria";
import {AddToSourceSheetModal} from "./SheetOptions";
import {
  SheetComment,
  SheetHeader,
  SheetMedia,
  SheetOutsideBiText,
  SheetOutsideText,
  SheetSource
} from "./SheetContentSegments";
import { useState } from "react";
import {SheetMetaDataBox} from "../Misc";
import React from "react";
import {SignUpModalKind} from "../sefaria/signupModalContent";


class SheetContent extends Component {
  componentDidMount() {
      this.$container = $(ReactDOM.findDOMNode(this).parentNode);
      this._isMounted = true;
      var node = ReactDOM.findDOMNode(this).parentNode;
      node.addEventListener("scroll", this.handleScroll);
      this.windowMiddle = $(window).outerHeight() / 2;
      this.highlightThreshhold = this.props.multiPanel ? 200 : 70; // distance from the top of screen that we want highlighted segments to appear below.
      this.debouncedAdjustHighlightedAndVisible = Sefaria.util.debounce(this.adjustHighlightedAndVisible, 100);
      this.scrollToHighlighted();
  }
  componentWillUnmount() {
    this._isMounted = false;
    var node = ReactDOM.findDOMNode(this).parentNode;
    node.removeEventListener("scroll", this.handleScroll);
  }
  componentDidUpdate(prevProps, prevState) {
    if (prevProps.highlightedNode !== this.props.highlightedNode &&
      this.props.scrollToHighlighted) {
      this.scrollToHighlighted();
    }
  }
  handleScroll(event) {
    if (this.justScrolled) {
      this.justScrolled = false;
      return;
    }
    this.debouncedAdjustHighlightedAndVisible();
  }
  handleTextSelection() {
    const selectedWords = Sefaria.util.getNormalizedSelectionString(); //this gets around the above issue
    if (selectedWords !== this.props.selectedWords) {
      //console.log("setting selecting words")
      this.props.setSelectedWords(selectedWords);
    }
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
      var topThreshhold = this.highlightThreshhold;
      $container.find("section .segment").each(function(i, segment) {
        var top = $(segment).offset().top - $container.offset().top;
        var bottom = $(segment).outerHeight() + top;
        if (bottom > this.windowMiddle || top >= topThreshhold) {
          $segment = $(segment);
          return false;
        }
      }.bind(this));
    }
    if (!$segment) { return; }

    // don't move around highlighted segment when scrolling a single panel,
    var shouldHighlight = this.props.hasSidebar || this.props.mode === "SheetAndConnections";
    if (shouldHighlight) {
      const node = parseInt($segment.attr("data-node"));
      if (!(this.props.highlightedNode === node)) {
        $segment.click()
      }
    }
  }
  scrollToHighlighted() {
    if (!this._isMounted) { return; }
    var $container   = this.$container;
    var $readerPanel = $container.closest(".readerPanel");
    var $highlighted = $container.find(".segment.highlight").first();
    if ($highlighted.length) {
      this.scrolledToHighlight = true;
      this.justScrolled = true;
      var offset = this.highlightThreshhold;
      var top = $highlighted.position().top - offset;

      $container[0].scrollTop = top;
      if ($readerPanel.attr("id") === $(".readerPanel:last").attr("id")) {
        $highlighted.focus();
      }
    }
  }
  renderSheetSource = (source, i, addToSheetButton) => {
    const { highlightedNode, cleanHTML, sheetSourceClick, sheetNumbered, highlightedRefsInSheet } = this.props;
    const highlightedRef = highlightedRefsInSheet ? Sefaria.normRefList(highlightedRefsInSheet) : null;
    const highlighted = highlightedNode
      ? highlightedNode === source.node
      : highlightedRef ? Sefaria.refContains(source.ref, highlightedRef) : false;

    return (
      <SheetSource
        key={i}
        source={source}
        sourceNum={i + 1}
        cleanHTML={cleanHTML}
        sheetSourceClick={() => sheetSourceClick(source)}
        highlighted={highlighted}
        sheetNumbered={sheetNumbered}
        addToSheetButton={addToSheetButton}
      />
    );
  }

  renderSheetComment = (source, i, addToSheetButton) => {
    const { cleanHTML, sheetSourceClick, highlightedNode, sheetNumbered } = this.props;
    return (
      <SheetComment
        key={i}
        sourceNum={i + 1}
        source={source}
        cleanHTML={cleanHTML}
        sheetSourceClick={() => sheetSourceClick(source)}
        highlightedNode={highlightedNode}
        sheetNumbered={sheetNumbered}
        addToSheetButton={addToSheetButton}
      />
    );
  }

  renderSheetHeader = (source, i, addToSheetButton) => {
    const { sheetSourceClick, highlightedNode, sheetNumbered } = this.props;
    return (
      <SheetHeader
        key={i}
        sourceNum={i + 1}
        source={source}
        sheetSourceClick={() => sheetSourceClick(source)}
        highlightedNode={highlightedNode}
        sheetNumbered={sheetNumbered}
        addToSheetButton={addToSheetButton}
      />
    );
  }

  renderSheetOutsideText = (source, i, addToSheetButton) => {
    const { cleanHTML, sheetSourceClick, highlightedNode, sheetNumbered } = this.props;
    return (
      <SheetOutsideText
        key={i}
        sourceNum={i + 1}
        source={source}
        cleanHTML={cleanHTML}
        sheetSourceClick={() => sheetSourceClick(source)}
        highlightedNode={highlightedNode}
        sheetNumbered={sheetNumbered}
        addToSheetButton={addToSheetButton}
      />
    );
  }

  renderSheetOutsideBiText = (source, i, addToSheetButton) => {
    const { cleanHTML, sheetSourceClick, highlightedNode, sheetNumbered } = this.props;
    return (
      <SheetOutsideBiText
        key={i}
        sourceNum={i + 1}
        source={source}
        clean
        HTML={cleanHTML}
        sheetSourceClick={() => sheetSourceClick(source)}
        highlightedNode={highlightedNode}
        sheetNumbered={sheetNumbered}
        addToSheetButton={addToSheetButton}
      />
    );
  }

  renderSheetMedia = (source, i, addToSheetButton) => {
    const { cleanHTML, sheetSourceClick, highlightedNode, sheetNumbered, hideImages } = this.props;
    return (
      <SheetMedia
        key={i}
        sourceNum={i + 1}
        cleanHTML={cleanHTML}
        source={source}
        sheetSourceClick={() => sheetSourceClick(source)}
        highlightedNode={highlightedNode}
        sheetNumbered={sheetNumbered}
        hideImages={hideImages}
        addToSheetButton={addToSheetButton}
      />
    );
  }

  getSources = () => {
    const { sources } = this.props;

    if (!sources.length) return null;

    return sources.map((source, i) => {
      const addToSheetButton = this.props.highlightedNode === source.node &&
                                              <AddToSheetButton sheetID={this.props.sheetID}
                                                                highlightedRefs={this.props.highlightedRefs}
                                                                highlightedNode={this.props.highlightedNode}
                                                                toggleSignUpModal={this.props.toggleSignUpModal}/>;
      if ("ref" in source) {
        return this.renderSheetSource(source, i, addToSheetButton);
      } else if ("comment" in source) {
        return this.renderSheetComment(source, i, addToSheetButton);
      } else if ("outsideText" in source) {
        return source.outsideText.startsWith("<h1>")
                              ? this.renderSheetHeader(source, i, addToSheetButton)
                              : this.renderSheetOutsideText(source, i, addToSheetButton);
      } else if ("outsideBiText" in source) {
        return this.renderSheetOutsideBiText(source, i, addToSheetButton);
      } else if ("media" in source) {
        return this.renderSheetMedia(source, i, addToSheetButton);
      }
    });
  }
  render() {
    const sources = this.getSources();
    return (
      <div className="sheetContent">
        <div className="text">
          <SheetMetaDataBox authorStatement={this.props.authorStatement} authorUrl={this.props.authorUrl}
                                   authorImage={this.props.authorImage} title={this.props.title}
                                   summary={this.props.summary}
                                   sheetOptions={this.props.sheetOptions}/>
          <div className="textInner" onMouseUp={this.handleTextSelection} onClick={this.props.handleClick}>
            {sources}
          </div>
        </div>

        <div id="printFooter" style={{display:"none"}}>
          <span className="int-en">Created with <img src="/static/img/logo.svg" /></span>
          <span className="int-he">{Sefaria._("Created with")} <img src="/static/img/logo.svg" /></span>
        </div>
      </div>
    )
  }
}

const AddToSheetButton = ({highlightedNode, sheetID, highlightedRefs, toggleSignUpModal}) => {
  const handleClick = () => {
    if (Sefaria._uid) {
      setShowingModal(true);
    } else {
      toggleSignUpModal(SignUpModalKind.AddToSheet);
    }
  }
  const [showingModal, setShowingModal] = useState(false);
  const nodeRef = `${sheetID}.${highlightedNode}`;
  return <>
    <div onClick={handleClick} className="addToSheetButton">
      <span className="addToSheetPlus">+</span>
      <span className="addToSheetText">Add to Sheet</span>
    </div>
    {showingModal &&
        <AddToSourceSheetModal nodeRef={nodeRef} srefs={highlightedRefs} close={() => setShowingModal(false)}/>}
  </>;
}

class SheetNotice extends Component {
  render() {
    return (
        <div className="sheetNotice sans-serif">
          <InterfaceText>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aliquam arcu felis, molestie sed mauris a, hendrerit vestibulum augue.</InterfaceText>
        </div>
    );
  }
}

export { SheetContent };
