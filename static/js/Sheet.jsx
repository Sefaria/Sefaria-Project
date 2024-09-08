import React  from 'react';
import ReactDOM  from 'react-dom';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import sanitizeHtml  from 'sanitize-html';
import Component from 'react-class'
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import SefariaEditor from './Editor';
import {
  InterfaceText,
  LoadingMessage,
  ReaderMessage,
  SheetMetaDataBox,
  SheetAuthorStatement,
  SheetTitle,
  CollectionStatement,
  ProfilePic,
} from './Misc';
import SheetContent from "./SheetContent";
import SheetSidebar from "./SheetSidebar";

class Sheet extends Component {
  constructor(props) {
    super(props);
  }
  componentDidMount() {
    this.$container = $(ReactDOM.findDOMNode(this));
    this.ensureData();
    const params = {
       content_type: "Sheet",
       item_id: this.props.id
     }
    gtag("event", "select_content", params)

  }
  getSheetFromCache() {
    return Sefaria.sheets.loadSheetByID(this.props.id);
  }
  getSheetFromAPI() {
    Sefaria.sheets.loadSheetByID(this.props.id, this.onDataLoad);
  }
  onDataLoad(data) {
    const sheetRef = "Sheet " + data.id + (this.props.highlightedNode ? "." + this.props.highlightedNode : "");
    this.props.openSheet(sheetRef, true); // Replace state now that data is loaded so History can include sheet title
    this.forceUpdate();
    this.preloadConnections();
    this.updateDivineNameStateWithSheetValue()
  }
  ensureData() {
    if (!this.getSheetFromCache()) {
      this.getSheetFromAPI();
    } else {
      this.preloadConnections();
      this.updateDivineNameStateWithSheetValue()
    }
  }
  preloadConnections() {
    const data = this.getSheetFromCache();
    if (!data) {return; }
    for (let i = 0; i < data.sources.length; i++) {
      if ("ref" in data.sources[i]) {
        Sefaria.related(data.sources[i].ref, () => this.forceUpdate);
      }
    }
  }
  updateDivineNameStateWithSheetValue() {
    const sheet = this.getSheetFromCache();
    this.props.setDivineNameReplacement(sheet.options.divineNames)
  }
  handleClick(e) {
    const target = e.target.closest('a')
    if (target) {
      let url;
      try {
        url = new URL(target.href);
      } catch {
        return false;
      }
      const path = url.pathname;
      const params = url.searchParams;

      if (path.match(/^\/sheets\/\d+/)) {
        e.preventDefault()
        console.log();
        this.props.onCitationClick(`Sheet ${path.slice(8)}`, `Sheet ${this.props.sheetID}`, true)
      }

      else if (Sefaria.isRef(path.slice(1))) {
        e.preventDefault()
        const currVersions = {en: params.get("ven"), he: params.get("vhe")};
        const options = {showHighlight: path.slice(1).indexOf("-") !== -1};   // showHighlight when ref is ranged
        this.props.onCitationClick(path.slice(1), `Sheet ${this.props.sheetID}`, true, currVersions)
      }

    }
  }


  render() {
    const sheet = this.getSheetFromCache();
    const classes = classNames({sheetsInPanel: 1});
    let content;
    if (!sheet) {
      content = (<LoadingMessage />);
    }
    else {
      content = (
            <div className="sidebarLayout">
              <SheetContent
                  sheetNotice={sheet.sheetNotice}
                  sources={sheet.sources}
                  title={sheet.title}
                  onRefClick={this.props.onRefClick}
                  handleClick={this.handleClick}
                  sheetSourceClick={this.props.onSegmentClick}
                  highlightedNode={this.props.highlightedNode}
                  highlightedRefsInSheet={this.props.highlightedRefsInSheet}
                  scrollToHighlighted={this.props.scrollToHighlighted}
                  editable={Sefaria._uid === sheet.owner}
                  setSelectedWords={this.props.setSelectedWords}
                  sheetNumbered={sheet.options.numbered}
                  hideImages={!!sheet.hideImages}
                  sheetID={sheet.id}
                  authorStatement={sheet.ownerName}
                  authorID={sheet.owner}
                  authorUrl={sheet.ownerProfileUrl}
                  authorImage={sheet.ownerImageUrl}
                  summary={sheet.summary}
                  toggleSignUpModal={this.props.toggleSignUpModal}
                  historyObject={this.props.historyObject}
            />
              <SheetSidebar
                  authorStatement={sheet.ownerName}
                  authorID={sheet.owner}
                  authorUrl={sheet.ownerProfileUrl}
                  authorImage={sheet.ownerImageUrl}
                  collectionName={sheet.collectionName}
                  collectionSlug={sheet.displayedCollection}
                  collectionImage={sheet.collectionImage}
                  collections={sheet.collections}
                  summary={sheet.summary}
              />
          </div>
      );
    }
    return (
      <div className={classes}>
        { sheet && Sefaria._uid === sheet.owner && Sefaria._uses_new_editor ?
        <div className="sheetContent">
          <SefariaEditor
            data={sheet}
            hasSidebar={this.props.hasSidebar}
            handleClick={this.handleClick}
            multiPanel={this.props.multiPanel}
            sheetSourceClick={this.props.onSegmentClick}
            highlightedNode={this.props.highlightedNode}
            highlightedRefsInSheet={this.props.highlightedRefsInSheet}
            setDivineNameReplacement={this.props.setDivineNameReplacement}
            divineNameReplacement={this.props.divineNameReplacement}
          />
        </div>
        :
        content }
      </div>
    );
  }
}

class OldSheetContent extends Component {
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
  render() {
    var sources = this.props.sources.length ? this.props.sources.map(function(source, i) {
      const highlightedRef = this.props.highlightedRefsInSheet ? Sefaria.normRefList(this.props.highlightedRefsInSheet) : null;
      if ("ref" in source) {
        const highlighted = this.props.highlightedNode ?
            this.props.highlightedNode === source.node :
              highlightedRef ?
              Sefaria.refContains(source.ref, highlightedRef) :
                false;
        return (
          <SheetSource
            key={i}
            source={source}
            sourceNum={i + 1}
            cleanHTML={this.cleanHTML}
            sheetSourceClick={this.props.sheetSourceClick.bind(this, source)}
            highlighted={highlighted}
            sheetNumbered={this.props.sheetNumbered}
          />
        );
      }

      else if ("comment" in source) {
        return (
          <SheetComment
            key={i}
            sourceNum={i + 1}
            source={source}
            cleanHTML={this.cleanHTML}
            sheetSourceClick={this.props.sheetSourceClick.bind(this, source)}
            highlightedNode={this.props.highlightedNode}
            sheetNumbered={this.props.sheetNumbered}
          />
        );
      }

      else if ("outsideText" in source) {
        const sourceIsHeader = source["outsideText"].startsWith("<h1>");

        if (sourceIsHeader) {
          return <SheetHeader
            key={i}
            sourceNum={i + 1}
            source={source}
            sheetSourceClick={this.props.sheetSourceClick.bind(this, source)}
            highlightedNode={this.props.highlightedNode}
            sheetNumbered={this.props.sheetNumbered}
          />
        }

        else {
          return (
            <SheetOutsideText
              key={i}
              sourceNum={i + 1}
              source={source}
              cleanHTML={this.cleanHTML}
              sheetSourceClick={this.props.sheetSourceClick.bind(this, source)}
              highlightedNode={this.props.highlightedNode}
              sheetNumbered={this.props.sheetNumbered}
           />
          );
        }
      }

      else if ("outsideBiText" in source) {
        return (
          <SheetOutsideBiText
            key={i}
            sourceNum={i + 1}
            source={source}
            cleanHTML={this.cleanHTML}
            sheetSourceClick={this.props.sheetSourceClick.bind(this, source)}
            highlightedNode={this.props.highlightedNode}
            sheetNumbered={this.props.sheetNumbered}
          />
        );
      }

      else if ("media" in source) {
        return (
          <SheetMedia
            key={i}
            sourceNum={i + 1}
            cleanHTML={this.cleanHTML}
            source={source}
            sheetSourceClick={this.props.sheetSourceClick.bind(this, source)}
            highlightedNode={this.props.highlightedNode}
            sheetNumbered={this.props.sheetNumbered}
            hideImages={this.props.hideImages}
          />
        );
      }

    }, this) : null;

    return (
      <div className="sheetContent">
        {this.props.sheetNotice ? <SheetNotice /> : null}
        <SheetMetaDataBox>
          <SheetTitle title={this.props.title} />

          <SheetAuthorStatement
            authorUrl={this.props.authorUrl}
            authorStatement={this.props.authorStatement} >
            <ProfilePic
              url={this.props.authorImage}
              len={30}
              name={this.props.authorStatement}
              outerStyle={{width: "30px", height: "30px", display: "inline-block", verticalAlign: "middle"}}
            />
            <InterfaceText text={{en: "By", he: "מאת"}}/>
            <a href={this.props.authorUrl} className="sheetAuthorName">
              <InterfaceText>{this.props.authorStatement}</InterfaceText>
            </a>
          </SheetAuthorStatement>

          <CollectionStatement
            name={this.props.collectionName}
            slug={this.props.collectionSlug}
            image={this.props.collectionImage}
          />

        </SheetMetaDataBox>

        <div className="text">
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

class SheetNotice extends Component {
  render() {
    return (
        <div className="sheetNotice sans-serif">
          <InterfaceText>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aliquam arcu felis, molestie sed mauris a, hendrerit vestibulum augue.</InterfaceText>
        </div>
    );
  }
}

export default Sheet;
