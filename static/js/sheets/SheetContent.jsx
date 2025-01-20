import Component from "react-class";
import $ from "../sefaria/sefariaJquery";
import ReactDOM from "react-dom";
import Sefaria from "../sefaria/sefaria";
import {AddToSourceSheetModal} from "./SheetModals";
import { SheetOptions } from "./SheetOptions";
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
    const shouldHighlight = this.props.hasSidebar || this.props.mode === "SheetAndConnections";
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
  getSources = () => {
    const { sources } = this.props;

    if (!sources.length) return null;
    const { highlightedNode, sheetSourceClick } = this.props;
    return sources.map(source => {
      const addToSheetButton = highlightedNode === source.node &&
                                              <AddToSheetButton sheetID={this.props.sheetID}
                                                                highlightedRefs={this.props.highlightedRefs}
                                                                highlightedNode={highlightedNode}
                                                                toggleSignUpModal={this.props.toggleSignUpModal}/>;
      let highlighted = source.node === highlightedNode;
      let ComponentToRender;
      if ("ref" in source) {
        if (this.props.highlightedRefsInSheet && !highlightedNode) {
          // if we're not highlighting a specific node, we should highlight all highlightedRefsInSheet;
          // used in ConnectionsPanel to show the current reader ref in the sheet
          highlighted = Sefaria.refContains(source.ref, Sefaria.normRefList(this.props.highlightedRefsInSheet));
        }
        ComponentToRender = SheetSource;
      } else if ("comment" in source) {
        ComponentToRender = SheetComment;
      } else if ("outsideText" in source) {
        ComponentToRender = source.outsideText.startsWith("<h1>")
                              ? SheetHeader
                              : SheetOutsideText;
      } else if ("outsideBiText" in source) {
        ComponentToRender = SheetOutsideBiText;
      } else if ("media" in source) {
        ComponentToRender = SheetMedia;
      }
      else {
        console.log(source);
        return <></>;  // handle bad data in sheet.sources
      }
      return <ComponentToRender
        key={source.node}
        source={source}
        sheetSourceClick={() => sheetSourceClick(source)}
        handleKeyPress={(e) => e.charCode === 13 && sheetSourceClick(e)}
        highlighted={highlighted}
        addToSheetButton={addToSheetButton}/>;
    });
  }
  render() {
    const sources = this.getSources();
    const sheetOptions = <SheetOptions toggleSignUpModal={this.props.toggleSignUpModal}
                                                 sheetID={this.props.sheetID}
                                                 historyObject={this.props.historyObject}
                                                 editable={false}
                                                 authorUrl={this.props.authorUrl}/>;
    return (
      <div className="sheetContent">
        <div className="text">
          <SheetMetaDataBox authorStatement={this.props.authorStatement}
                             authorUrl={this.props.authorUrl}
                             authorImage={this.props.authorImage}
                             title={this.props.title}
                             summary={this.props.summary}
                             sheetOptions={sheetOptions}/>
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
  const handleClose = () => setShowingModal(false);
  return <>
    <div onClick={handleClick} className="addToSheetButton">
      <span className="addToSheetPlus">+</span>
      <span className="addToSheetText">Add to Sheet</span>
    </div>
    {showingModal &&
        <AddToSourceSheetModal nodeRef={nodeRef} srefs={highlightedRefs} close={handleClose}/>}
  </>;
}

export { SheetContent };
