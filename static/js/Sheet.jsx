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
  LoadingMessage,
  ReaderMessage,
  SheetMetaDataBox,
  SheetAuthorStatement,
  SheetTitle,
  GroupStatement,
  ProfilePic,
} from './Misc';


class Sheet extends Component {
  constructor(props) {
    super(props);

    this.state = {
        scrollDir: "down",
    }
  }
  componentDidMount() {
    this.$container = $(ReactDOM.findDOMNode(this));
    this.setPaddingForScrollbar();
    this.ensureData();

  }
  componentDidUpdate(prevProps, prevState) {
    if (prevProps.editor == true && this.props.editor == false) {
      Sefaria.sheets.loadSheetByID(this.props.id, this.onDataLoad, true);
      console.log('reloading')
    }
  }
  getSheetFromCache() {
    return Sefaria.sheets.loadSheetByID(this.props.id);
  }
  getSheetFromAPI() {
    Sefaria.sheets.loadSheetByID(this.props.id, this.onDataLoad);
  }
  onDataLoad(data) {
    this.forceUpdate();
    this.preloadConnections();
    if (!(this.props.editor) && document.getElementById('sheetEditToggle')) {document.getElementById('sheetEditToggle').click()}
  }
  ensureData() {
    if (!this.getSheetFromCache()) {
      this.getSheetFromAPI();
    } else {
      this.preloadConnections();
    }
    if (!(this.props.editor) && document.getElementById('sheetEditToggle')) {document.getElementById('sheetEditToggle').click()}
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
  setPaddingForScrollbar() {
    // Scrollbars take up spacing, causing the centering of Sheet to be slightly off center
    // compared to the header. This functions sets appropriate padding to compensate.
    var width = Sefaria.util.getScrollbarWidth();
    this.$container.css({paddingRight: 0, paddingLeft: width});
  }
  setScrollDir(event) {
    if (event.nativeEvent.wheelDelta > 0) {
      this.setState({scrollDir: "up"});
    } else {
      this.setState({scrollDir: "down"});
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
          <SheetContent
            sources={sheet.sources}
            title={sheet.title}
            onRefClick={this.props.onRefClick}
            onSegmentClick={this.props.onSegmentClick}
            highlightedNodes={this.props.highlightedNodes}
            highlightedRefsInSheet={this.props.highlightedRefsInSheet}
            scrollDir = {this.state.scrollDir}
            authorStatement = {sheet.ownerName}
            authorUrl = {sheet.ownerProfileUrl}
            authorImage = {sheet.ownerImageUrl}
            group = {sheet.group}
            groupLogo = {sheet.groupLogo}
            editable = {Sefaria._uid == sheet.owner}
            hasSidebar = {this.props.hasSidebar}
            sheetNumbered = {sheet.options.numbered}
            sheetID = {sheet.id}
          />
      )
    }
    return (
        <div className={classes}>
          {  this.props.editor == true && sheet ?
            /*sheet && Sefaria._uid == sheet.owner && $.cookie("new_editor") ? */
            <div className="sheetContent"><SefariaEditor data={sheet} /></div>
            : content}
        </div>
    )
  }
}


class SheetContent extends Component {
  componentDidMount() {
      this.$container          = $(ReactDOM.findDOMNode(this).parentNode);
      this._isMounted          = true;
      var node = ReactDOM.findDOMNode(this).parentNode;
      node.addEventListener("scroll", this.handleScroll);
      this.windowMiddle = $(window).outerHeight() / 2;
      this.debouncedAdjustHighlightedAndVisible = Sefaria.util.debounce(this.adjustHighlightedAndVisible, 100);
      this.scrollToHighlighted();
  }
  componentWillUnmount() {
    this._isMounted = false;
    var node = ReactDOM.findDOMNode(this).parentNode;
    node.removeEventListener("scroll", this.handleScroll);
  }
  handleScroll(event) {
    if (this.justScrolled) {
      this.justScrolled = false;
      return;
    }
    this.debouncedAdjustHighlightedAndVisible();
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
      const ref = $segment.attr("data-ref");
      if (!(this.props.highlightedNodes == ref)) {
        $segment.click()
      }
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
  handleClick(ref, e) {
    e.preventDefault();
    e.stopPropagation();
    this.props.onRefClick(ref);
  }
  sheetSourceClick(source, event) {
    if ($(event.target).hasClass("refLink") && $(event.target).attr("data-ref")) {
      event.preventDefault();
      let ref = Sefaria.humanRef($(event.target).attr("data-ref"));
      this.handleClick(ref, event);
      event.stopPropagation();
      Sefaria.track.event("Reader", "Citation Link Click", ref);
    }

    if(event.target.tagName.toLowerCase() === 'a') {
      window.open(event.target.href, "_blank");
      event.preventDefault();
      event.stopPropagation();
    }

    else {
      this.props.onSegmentClick(source);
    }
  }
  render() {
    var sources = this.props.sources.length ? this.props.sources.map(function(source, i) {
      const highlightedRef = this.props.highlightedRefsInSheet ? Sefaria.normRefList(this.props.highlightedRefsInSheet) : null;
      if ("ref" in source) {
        const highlighted = this.props.highlightedNodes ?
            this.props.highlightedNodes == source.node :
              highlightedRef ?
              Sefaria.refContains(source.ref, highlightedRef) :
                false;
        return (
          <SheetSource
            key={i}
            source={source}
            sourceNum={i + 1}
            linkCount={Sefaria.linkCount(source.ref)}
            handleClick={this.handleClick}
            cleanHTML={this.cleanHTML}
            sheetSourceClick={this.sheetSourceClick.bind(this, source)}
            highlighted={highlighted}
            sheetNumbered={this.props.sheetNumbered}
          />
        )
      }

      else if ("comment" in source) {
        return (
          <SheetComment
            key={i}
            sourceNum={i + 1}
            source={source}
            handleClick={this.handleClick}
            cleanHTML={this.cleanHTML}
            sheetSourceClick={this.sheetSourceClick.bind(this, source)}
            highlightedNodes={this.props.highlightedNodes}
            sheetNumbered={this.props.sheetNumbered}
          />
        )
      }

      else if ("outsideText" in source) {
        return (
          <SheetOutsideText
            key={i}
            sourceNum={i + 1}
            source={source}
            handleClick={this.handleClick}
            cleanHTML={this.cleanHTML}
            sheetSourceClick={this.sheetSourceClick.bind(this, source)}
            highlightedNodes={this.props.highlightedNodes}
            sheetNumbered={this.props.sheetNumbered}
         />
        )
      }

      else if ("outsideBiText" in source) {
        return (
          <SheetOutsideBiText
            key={i}
            sourceNum={i + 1}
            source={source}
            handleClick={this.handleClick}
            cleanHTML={this.cleanHTML}
            sheetSourceClick={this.sheetSourceClick.bind(this, source)}
            highlightedNodes={this.props.highlightedNodes}
            sheetNumbered={this.props.sheetNumbered}
          />
        )
      }

      else if ("media" in source) {
        return (
          <SheetMedia
            key={i}
            sourceNum={i + 1}
            handleClick={this.handleClick}
            cleanHTML={this.cleanHTML}
            source={source}
            sheetSourceClick={this.sheetSourceClick.bind(this, source)}
            highlightedNodes={this.props.highlightedNodes}
            sheetNumbered={this.props.sheetNumbered}
          />
        )
      }

    }, this) : null;

    return (
      <div className="sheetContent">
        <SheetMetaDataBox>
            <SheetTitle title={this.props.title} />
            <SheetAuthorStatement
                authorUrl={this.props.authorUrl}
                authorStatement={this.props.authorStatement}
            >
              <ProfilePic
                url={this.props.authorImage}
                len={30}
                name={this.props.authorStatement}
                outerStyle={{width: "30px", height: "30px", display: "inline-block", verticalAlign: "middle", marginRight: "10px"}}
              />
              <span>by <a href={this.props.authorUrl}>{this.props.authorStatement}</a></span>
            </SheetAuthorStatement>
            <GroupStatement
                group={this.props.group}
                groupLogo={this.props.groupLogo}
            />
        </SheetMetaDataBox>

        <div className="text">
            <div className="textInner">{sources}</div>
        </div>
        <div id="printFooter" style={{display:"none"}}>
          <span className="int-en">Created with <img src="/static/img/logo.svg" /></span>
          <span className="int-he">{Sefaria._("Created with")} <img src="/static/img/logo.svg" /></span>
        </div>
      </div>
    )
  }
}


class SheetItem extends Component {

}

class SheetSource extends Component {
  render() {
    var linkCountElement;
      var linkCount = this.props.linkCount;
      var minOpacity = 20, maxOpacity = 70;
      var linkScore = linkCount ? Math.min(linkCount + minOpacity, maxOpacity) / 100.0 : 0;
      var style = {opacity: linkScore};

      linkCountElement = (<div className="linkCount sans" title={linkCount + " Connections Available"}>
                                                    <span className="en"><span className="linkCountDot" style={style}></span></span>
                                                    <span className="he"><span className="linkCountDot" style={style}></span></span>
                                                  </div>);
      var containerClasses = classNames("sheetItem",
          "segment",
          this.props.highlighted ? "highlight" : null,
          (this.props.source.text && this.props.source.text.en && this.props.source.text.en.stripHtml() == "...") || (this.props.source.text && !this.props.source.text.en.stripHtml()) ? "heOnly" : null,
          (this.props.source.text && this.props.source.text.he && this.props.source.text.he.stripHtml() == "...") || (this.props.source.text && !this.props.source.text.he.stripHtml()) ? "enOnly" : null,
          this.props.source.options ? this.props.source.options.indented : null,
          this.props.source.options && this.props.source.options.refDisplayPosition ? "ref-display-"+ this.props.source.options.refDisplayPosition : null
      );

    return (

        <section className="SheetSource">
      <div className={containerClasses} data-ref={this.props.source.node} onClick={this.props.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.props.sheetSourceClick(e):null}.bind(this)} >
          {this.props.source.title ? <div className="customSourceTitle" role="heading" aria-level="3"><div className="titleBox">{this.props.source.title.stripHtml()}</div></div> : null}


            <div className="segmentNumber sheetSegmentNumber sans">
              <span className="en"> <span className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : this.props.sourceNum}</span> </span>
              <span className="he"> <span
                className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
            </div>


          {linkCountElement}

        {this.props.source.text && this.props.source.text.he && this.props.source.text.he != "" ?
            <div className="he">{this.props.source.options && this.props.source.options.sourcePrefix && this.props.source.options.sourcePrefix != "" ? <sup className="sourcePrefix">{this.props.source.options.sourcePrefix}</sup> : null }
            <div className="ref">{this.props.source.options && this.props.source.options.PrependRefWithHe ? this.props.source.options.PrependRefWithHe : null}<a href={"/" + this.props.source.ref} onClick={(e) => {
              this.props.handleClick(this.props.source.ref, e)
            } }>{this.props.source.heRef}</a></div>
            <div className="sourceContentText" dangerouslySetInnerHTML={ {__html: (Sefaria.util.cleanHTML(this.props.source.text.he))} }></div>
          </div> : null }


        {this.props.source.text && this.props.source.text.en && this.props.source.text.en != "" ?
          <div className="en">{this.props.source.options && this.props.source.options.sourcePrefix && this.props.source.options.sourcePrefix != "" ? <sup className="sourcePrefix">{this.props.source.options.sourcePrefix}</sup> : null }
            <div className="ref">{this.props.source.options && this.props.source.options.PrependRefWithEn ? this.props.source.options.PrependRefWithEn : null}<a href={"/" + this.props.source.ref} onClick={(e) => {
              this.props.handleClick(this.props.source.ref, e)
            } }>{this.props.source.ref}</a></div>
            <div className="sourceContentText" dangerouslySetInnerHTML={ {__html: (Sefaria.util.cleanHTML(this.props.source.text.en))} }></div>
          </div> : null }

        <div className="clearFix"></div>

        {this.props.source.addedBy ?
            <div className="addedBy"><small><em>{Sefaria._("Added by")}: <span dangerouslySetInnerHTML={ {__html: Sefaria.util.cleanHTML(this.props.source.userLink)} }></span></em></small></div>
            : null
        }

      </div>
        </section>
    )
  }
}


class SheetComment extends Component {
  render() {
      var lang = Sefaria.hebrew.isHebrew(this.props.source.comment.stripHtml().replace(/\s+/g, ' ')) ? "he" : "en";
      var containerClasses = classNames("sheetItem",
          "segment",
          lang == "he" ? "heOnly" : "enOnly",
          this.props.highlightedNodes == this.props.source.node ? "highlight" : null,
          this.props.source.options ? this.props.source.options.indented : null
      );

    return (
        <section className="SheetComment">
      <div className={containerClasses} data-ref={this.props.source.node} onClick={this.props.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.props.sheetSourceClick(e):null}.bind(this)} >
            <div className="segmentNumber sheetSegmentNumber sans">
              <span className="en"> <span className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : this.props.sourceNum}</span> </span>
              <span className="he"> <span
                className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
            </div>
        <div className={lang}>
            <div className="sourceContentText" dangerouslySetInnerHTML={ {__html: Sefaria.util.cleanHTML(this.props.source.comment)} }></div>
        </div>
        <div className="clearFix"></div>
            {this.props.source.addedBy ?
                <div className="addedBy"><small><em>{Sefaria._("Added by")}: <span dangerouslySetInnerHTML={ {__html: Sefaria.util.cleanHTML(this.props.source.userLink)} }></span></em></small></div>
                : null
            }
      </div>
        </section>
    )
  }
}


class SheetOutsideText extends Component {
  render() {
    var lang = Sefaria.hebrew.isHebrew(this.props.source.outsideText.stripHtml().replace(/\s+/g, ' ')) ? "he" : "en";

      var containerClasses = classNames("sheetItem",
          "segment",
          lang == "he" ? "heOnly" : "enOnly",
          this.props.highlightedNodes == this.props.source.node ? "highlight" : null,
          this.props.source.options ? this.props.source.options.indented : null
      )


    return (
                <section className="SheetOutsideText">
      <div className={containerClasses} data-ref={this.props.source.node} onClick={this.props.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.props.sheetSourceClick(e):null}.bind(this)} >
            <div className="segmentNumber sheetSegmentNumber sans">
              <span className="en"> <span className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : this.props.sourceNum}</span> </span>
              <span className="he"> <span
                className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
            </div>
        <div className={lang}>{this.props.source.options && this.props.source.options.sourcePrefix && this.props.source.options.sourcePrefix != "" ? <sup className="sourcePrefix">{this.props.source.options.sourcePrefix}</sup> : null }
            <div className="sourceContentText" dangerouslySetInnerHTML={ {__html: Sefaria.util.cleanHTML(this.props.source.outsideText)} }></div>
        </div>
        <div className="clearFix"></div>
        {this.props.source.addedBy ?
            <div className="addedBy"><small><em>{Sefaria._("Added by")}: <span dangerouslySetInnerHTML={ {__html: Sefaria.util.cleanHTML(this.props.source.userLink)} }></span></em></small></div>
            : null
        }

      </div>
                </section>
    )
  }
}


class SheetOutsideBiText extends Component {
  render() {
      var containerClasses = classNames("sheetItem",
          "segment",
          this.props.source.outsideBiText.en == "..." || !this.props.source.outsideBiText.en ? "heOnly" : null,
          this.props.source.outsideBiText.he == "..." || !this.props.source.outsideBiText.he ? "enOnly" : null,
          this.props.highlightedNodes == this.props.source.node ? "highlight" : null,
          this.props.source.options ? this.props.source.options.indented : null
      )
    return (
        <section className="SheetOutsideBiText">
      <div className={containerClasses} data-ref={this.props.source.node} onClick={this.props.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.props.sheetSourceClick(e):null}.bind(this)} >
            <div className="segmentNumber sheetSegmentNumber sans">
              <span className="en">
                  <span className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : this.props.sourceNum}</span>
              </span>
              <span className="he">
                  <span className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span>
              </span>
            </div>
          <div className="he">
            {this.props.source.options && this.props.source.options.sourcePrefix && this.props.source.options.sourcePrefix != "" ? <sup className="sourcePrefix">{this.props.source.options.sourcePrefix}</sup> : null }
            <div className="sourceContentText outsideBiText" dangerouslySetInnerHTML={ {__html: Sefaria.util.cleanHTML(this.props.source.outsideBiText.he)} }></div>
          </div>
          <div className="en">
            {this.props.source.options && this.props.source.options.sourcePrefix && this.props.source.options.sourcePrefix != "" ? <sup className="sourcePrefix">{this.props.source.options.sourcePrefix}</sup> : null }
            <div className="sourceContentText outsideBiText" dangerouslySetInnerHTML={ {__html: Sefaria.util.cleanHTML(this.props.source.outsideBiText.en)} }></div>
          </div>
        <div className="clearFix"></div>
        {this.props.source.addedBy ?
            <div className="addedBy"><small><em>{Sefaria._("Added by")}: <span dangerouslySetInnerHTML={ {__html: Sefaria.util.cleanHTML(this.props.source.userLink)} }></span></em></small></div>
            : null
        }

      </div>
            </section>
    )
  }
}


class SheetMedia extends Component {
  makeMediaEmbedContent() {
    var mediaLink;
    var mediaCaption = "";
    var mediaClass = "media fullWidth";
    var mediaURL = this.props.source.media;
    var caption  = this.props.source.caption;

    if (mediaURL.match(/\.(jpeg|jpg|gif|png)$/i) != null) {
      mediaLink = '<img class="addedMedia" src="' + mediaURL + '" />';
      mediaClass = "media"
    }

    else if (mediaURL.toLowerCase().indexOf('youtube') > 0) {
      mediaLink = '<div class="youTubeContainer"><iframe width="100%" height="100%" src=' + mediaURL + ' frameborder="0" allowfullscreen></iframe></div>';
    }

    else if (mediaURL.toLowerCase().indexOf('vimeo') > 0) {
      mediaLink = '<div class="youTubeContainer"><iframe width="100%" height="100%" src=' + mediaURL + ' frameborder="0"  allow="autoplay; fullscreen" allowfullscreen></iframe></div>';
    }

    else if (mediaURL.toLowerCase().indexOf('soundcloud') > 0) {
      mediaLink = '<iframe width="100%" height="166" scrolling="no" frameborder="no" src="' + mediaURL + '"></iframe>';
    }

    else if (mediaURL.match(/\.(mp3)$/i) != null) {
      mediaLink = '<audio src="' + mediaURL + '" type="audio/mpeg" controls>Your browser does not support the audio element.</audio>';
    }

    else {
      mediaLink = 'Error loading media...';
    }

    if (caption && (caption.en || caption.he) ) {
      var cls = caption.en && caption.he ? "" : caption.en ? "enOnly" : "heOnly";
      var mediaCaption = "<div class='mediaCaption " + cls + "'><div class='mediaCaptionInner'>" +
                "<div class='en'>" + (caption.en || "") + "</div>" +
                "<div class='he'>" + (caption.he || "") + "</div>" +
                 "</div></div>";
    }

    return "<div class='" + mediaClass + "'>" + mediaLink + mediaCaption + "</div>";
  }
  render() {
      var containerClasses = classNames("sheetItem",
          "segment",
          this.props.highlightedNodes == this.props.source.node ? "highlight" : null,
          this.props.source.options ? this.props.source.options.indented : null
      );
    return (
      <section className="SheetMedia">
      <div className={containerClasses} data-ref={this.props.source.node} onClick={this.props.sheetSourceClick} aria-label={"Click to  " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.props.sheetSourceClick(e):null}.bind(this)} >
            <div className="segmentNumber sheetSegmentNumber sans">
              <span className="en"> <span className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : this.props.sourceNum}</span> </span>
              <span className="he"> <span
                className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
            </div>

        <div className="sourceContentText centeredSheetContent" dangerouslySetInnerHTML={ {__html: this.makeMediaEmbedContent()} }></div>
        <div className="clearFix"></div>
        {this.props.source.addedBy ?
            <div className="addedBy"><small><em>{Sefaria._("Added by")}: <span dangerouslySetInnerHTML={ {__html: Sefaria.util.cleanHTML(this.props.source.userLink)} }></span></em></small></div>
            : null
        }

      </div>
      </section>

    )
  }
}


export default Sheet;
