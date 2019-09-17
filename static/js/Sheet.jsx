const {
  LoadingMessage,
  ReaderMessage,
  SheetMetaDataBox,
  SheetAuthorStatement,
  SheetTitle,
  GroupStatement,
  ProfilePic,
} = require('./Misc');

const React = require('react');
const ReactDOM = require('react-dom');
const PropTypes = require('prop-types');
const classNames = require('classnames');
const SefariaEditor = require('./Editor');
const $ = require('./sefaria/sefariaJquery');
const Sefaria = require('./sefaria/sefaria');
const sanitizeHtml = require('sanitize-html');
import Component from 'react-class';

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

  getSheetFromCache() {
    return Sefaria.sheets.loadSheetByID(this.props.id);
  }

  getSheetFromAPI() {
    Sefaria.sheets.loadSheetByID(this.props.id, this.onDataLoad);
  }

  onDataLoad(data) {
    this.forceUpdate();

    for (let i = 0; i < data.sources.length; i++) {
      if ("ref" in data.sources[i]) {
        Sefaria.getRef(data.sources[i].ref)
            .then(ref => ref.sectionRef)
            .then(ref => Sefaria.related(ref, () => this.forceUpdate));
      }
    }
  }

  ensureData() {
    if (!this.getSheetFromCache()) {
      this.getSheetFromAPI();
    }
  }

  setPaddingForScrollbar() {
    // Scrollbars take up spacing, causing the centering of Sheet to be slightly off center
    // compared to the header. This functions sets appropriate padding to compensate.
    const width = Sefaria.util.getScrollbarWidth();
    if (this.props.interfaceLang == "hebrew") {
      this.$container.css({paddingRight: width, paddingLeft: 0});
    } else {
      this.$container.css({paddingRight: 0, paddingLeft: width});
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
            openProfile={this.props.openProfile}
          />
      )
    }

    return (
        <div className={classes} onWheel={ event => {
           if (event.nativeEvent.wheelDelta > 0) {
             this.setState({scrollDir: "up"});
           } else {
             this.setState({scrollDir: "down"});
           }
        }}>
            {this.props.editor == true && sheet ? <div className="sheetContent"><SefariaEditor data={sheet} /></div> : content}



        </div>
    )
  }
}


class SheetContent extends Component {
  componentDidMount() {
      var node = ReactDOM.findDOMNode(this).parentNode;
      node.addEventListener("scroll", this.handleScroll);
      this.windowMiddle = $(window).outerHeight() / 2;
      this.scrollToHighlighted();
  }

  componentWillUnmount() {
    var node = ReactDOM.findDOMNode(this).parentNode;
    node.removeEventListener("scroll", this.handleScroll);
  }

  handleScroll(event) {
    var segment = $(event.target).closest(".readerPanel").find('.segment.highlight');

    if (segment.length == 0) {
        return
    }

    //scroll down
    var nextSegment = segment.next();
    var segmentBottomDistanceFromTop = segment.offset().top+segment.height()-160;
    if (segmentBottomDistanceFromTop < 0 && this.props.hasSidebar) {
      nextSegment.click();
    }
    //scroll up
    var prevSegment = segment.prev();
    var segmentTopDistanceFromBottom = segment.offset().top;
    if (segmentTopDistanceFromBottom > this.windowMiddle && this.props.scrollDir == "up" && this.props.hasSidebar) {
      prevSegment.click();
    }

  }

  scrollToHighlighted() {
    var $container   = $(ReactDOM.findDOMNode(this));
    var $readerPanel = $container.closest(".readerPanel");
    var $highlighted = $container.find(".segment.highlight").first();
    if ($highlighted.length) {
      this.scrolledToHighlight = true;
      this.justScrolled = true;
      var offset = 20;
      $container.scrollTo($highlighted, 0, {offset: -offset});
      $highlighted.focus();
    }
  }



  cleanHTML(html) {
    html = html.replace(/\u00a0/g, ' ').replace(/&nbsp;/g, ' ');
    var clean = sanitizeHtml(html, {
            allowedTags: [ 'blockquote', 'p', 'a', 'ul', 'ol',
              'nl', 'li', 'b', 'i', 'strong', 'em', 'small', 'big', 'span', 'strike', 'hr', 'br', 'div',
              'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'sup' ],
            allowedAttributes: {
              a: [ 'href', 'name', 'target', 'class', 'data-ref' ],
              img: [ 'src' ],
              p: ['style'],
              span: ['style'],
              div: ['style'],
              td: ['colspan'],
            },
            allowedStyles: {
              '*': {
                'color': [/^\#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
                'background-color': [/^\#(0x)?[0-9a-f]+$/i, /^rgb(?!\(\s*255\s*,\s*255\s*,\s*255\s*\))\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
                'text-align': [/^left$/, /^right$/, /^center$/],
              },
            },
            exclusiveFilter: function(frame) {
                return frame.tag === 'p' && !frame.text.trim();
            } //removes empty p tags  generated by ckeditor...

          });
    return clean;
  }


  handleClick(ref, e) {
    e.preventDefault();
    e.stopPropagation();
    this.props.onRefClick(ref);
  }

  openProfile(e) {
    e.preventDefault();
    const slugMatch = this.props.authorUrl.match(/profile\/(.+)$/);
    const slug = !!slugMatch ? slugMatch[1] : '';
    this.props.openProfile(slug, this.props.authorStatement);
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
            onSegmentClick={this.props.onSegmentClick}
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
            onSegmentClick={this.props.onSegmentClick}
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
            onSegmentClick={this.props.onSegmentClick}
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
            onSegmentClick={this.props.onSegmentClick}
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
            onSegmentClick={this.props.onSegmentClick}
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
              />
            </SheetAuthorStatement>
            <GroupStatement
                group={this.props.group}
                groupLogo={this.props.groupLogo}
            />
        </SheetMetaDataBox>


        <div className="text">
            <div className="textInner">{sources}</div>
        </div>
      </div>
    )
  }
}

class SheetSource extends Component {
  sheetSourceClick(event) {
      if(event.target.tagName.toLowerCase() === 'a') {
      if( !(location.hostname === event.target.hostname || !event.target.hostname.length) ) {
        window.open(event.target.href, "_blank");
        event.preventDefault();
      }
    }

    if ($(event.target).hasClass("refLink") && $(event.target).attr("data-ref")) {
      event.preventDefault();
      let ref = Sefaria.humanRef($(event.target).attr("data-ref"));
      this.props.handleClick(ref, event);
      event.stopPropagation();
      Sefaria.track.event("Reader", "Citation Link Click", ref);
    }

    else {
        this.props.onSegmentClick(this.props.source);
    }
  }
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
          (this.props.source.text && this.props.source.text.en && this.props.source.text.en == "...") || (this.props.source.text && !this.props.source.text.en) ? "heOnly" : null,
          (this.props.source.text && this.props.source.text.he && this.props.source.text.he == "...") || (this.props.source.text && !this.props.source.text.he) ? "enOnly" : null,
          this.props.source.options ? this.props.source.options.indented : null,
          this.props.source.options && this.props.source.options.refDisplayPosition ? "ref-display-"+ this.props.source.options.refDisplayPosition : null
      );

    return (

        <section className="SheetSource">
      <div className={containerClasses} onClick={this.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
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
            <div className="sourceContentText" dangerouslySetInnerHTML={ {__html: (this.props.cleanHTML(this.props.source.text.he))} }></div>
          </div> : null }


        {this.props.source.text && this.props.source.text.en && this.props.source.text.en != "" ?
          <div className="en">{this.props.source.options && this.props.source.options.sourcePrefix && this.props.source.options.sourcePrefix != "" ? <sup className="sourcePrefix">{this.props.source.options.sourcePrefix}</sup> : null }
            <div className="ref">{this.props.source.options && this.props.source.options.PrependRefWithEn ? this.props.source.options.PrependRefWithEn : null}<a href={"/" + this.props.source.ref} onClick={(e) => {
              this.props.handleClick(this.props.source.ref, e)
            } }>{this.props.source.ref}</a></div>
            <div className="sourceContentText" dangerouslySetInnerHTML={ {__html: (this.props.cleanHTML(this.props.source.text.en))} }></div>
          </div> : null }

        <div className="clearFix"></div>

        {this.props.source.addedBy ?
            <div className="addedBy"><small><em>{Sefaria._("Added by")}: <span dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.userLink)} }></span></em></small></div>
            : null
        }

      </div>
        </section>
    )
  }
}

class SheetComment extends Component {
  sheetSourceClick(event) {
    if(event.target.tagName.toLowerCase() === 'a') {
      if( !(location.hostname === event.target.hostname || !event.target.hostname.length) ) {
        window.open(event.target.href, "_blank");
        event.preventDefault();
      }
    }

    if ($(event.target).hasClass("refLink") && $(event.target).attr("data-ref")) {
      event.preventDefault();
      let ref = Sefaria.humanRef($(event.target).attr("data-ref"));
      this.props.handleClick(ref, event);
      event.stopPropagation();
      Sefaria.track.event("Reader", "Citation Link Click", ref);
    }

    else {
        this.props.onSegmentClick(this.props.source);
    }
  }

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
      <div className={containerClasses} onClick={this.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
            <div className="segmentNumber sheetSegmentNumber sans">
              <span className="en"> <span className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : this.props.sourceNum}</span> </span>
              <span className="he"> <span
                className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
            </div>
        <div className={lang}>
            <div className="sourceContentText" dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.comment)} }></div>
        </div>
        <div className="clearFix"></div>
            {this.props.source.addedBy ?
                <div className="addedBy"><small><em>{Sefaria._("Added by")}: <span dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.userLink)} }></span></em></small></div>
                : null
            }
      </div>
        </section>
    )
  }
}

class SheetOutsideText extends Component {
  sheetSourceClick(event) {
    if(event.target.tagName.toLowerCase() === 'a') {
      if( !(location.hostname === event.target.hostname || !event.target.hostname.length) ) {
        window.open(event.target.href, "_blank");
        event.preventDefault();
      }
    }

    if ($(event.target).hasClass("refLink") && $(event.target).attr("data-ref")) {
      event.preventDefault();
      let ref = Sefaria.humanRef($(event.target).attr("data-ref"));
      this.props.handleClick(ref, event);
      event.stopPropagation();
      Sefaria.track.event("Reader", "Citation Link Click", ref);
    }

    else {
        this.props.onSegmentClick(this.props.source);
    }
  }
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
      <div className={containerClasses} onClick={this.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
            <div className="segmentNumber sheetSegmentNumber sans">
              <span className="en"> <span className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : this.props.sourceNum}</span> </span>
              <span className="he"> <span
                className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
            </div>
        <div className={lang}>{this.props.source.options && this.props.source.options.sourcePrefix && this.props.source.options.sourcePrefix != "" ? <sup className="sourcePrefix">{this.props.source.options.sourcePrefix}</sup> : null }
            <div className="sourceContentText" dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.outsideText)} }></div>
        </div>
        <div className="clearFix"></div>
        {this.props.source.addedBy ?
            <div className="addedBy"><small><em>{Sefaria._("Added by")}: <span dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.userLink)} }></span></em></small></div>
            : null
        }

      </div>
                </section>
    )
  }
}

class SheetOutsideBiText extends Component {
  sheetSourceClick(event) {
    if(event.target.tagName.toLowerCase() === 'a') {
      if( !(location.hostname === event.target.hostname || !event.target.hostname.length) ) {
        window.open(event.target.href, "_blank");
        event.preventDefault();
      }
    }

    if ($(event.target).hasClass("refLink") && $(event.target).attr("data-ref")) {
      event.preventDefault();
      let ref = Sefaria.humanRef($(event.target).attr("data-ref"));
      this.props.handleClick(ref, event);
      event.stopPropagation();
      Sefaria.track.event("Reader", "Citation Link Click", ref);
    }

    else {
        this.props.onSegmentClick(this.props.source);
    }
  }

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
      <div className={containerClasses} onClick={this.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
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
            <div className="sourceContentText outsideBiText" dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.outsideBiText.he)} }></div>
          </div>
          <div className="en">
            {this.props.source.options && this.props.source.options.sourcePrefix && this.props.source.options.sourcePrefix != "" ? <sup className="sourcePrefix">{this.props.source.options.sourcePrefix}</sup> : null }
            <div className="sourceContentText outsideBiText" dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.outsideBiText.en)} }></div>
          </div>
        <div className="clearFix"></div>
        {this.props.source.addedBy ?
            <div className="addedBy"><small><em>{Sefaria._("Added by")}: <span dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.userLink)} }></span></em></small></div>
            : null
        }

      </div>
            </section>
    )
  }

}

class SheetMedia extends Component {
  sheetSourceClick(event) {
    if(event.target.tagName.toLowerCase() === 'a') {
      if( !(location.hostname === event.target.hostname || !event.target.hostname.length) ) {
        window.open(event.target.href, "_blank");
        event.preventDefault();
      }
    }

    if ($(event.target).hasClass("refLink") && $(event.target).attr("data-ref")) {
      event.preventDefault();
      let ref = Sefaria.humanRef($(event.target).attr("data-ref"));
      this.props.handleClick(ref, event);
      event.stopPropagation();
      Sefaria.track.event("Reader", "Citation Link Click", ref);
    }
    else {
      this.props.onSegmentClick(this.props.source);
    }
  }

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
      )
    return (
        <section className="SheetMedia">
      <div className={containerClasses} onClick={this.sheetSourceClick} aria-label={"Click to  " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
            <div className="segmentNumber sheetSegmentNumber sans">
              <span className="en"> <span className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : this.props.sourceNum}</span> </span>
              <span className="he"> <span
                className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
            </div>

        <div className="sourceContentText centeredSheetContent" dangerouslySetInnerHTML={ {__html: this.makeMediaEmbedContent()} }></div>
        <div className="clearFix"></div>
        {this.props.source.addedBy ?
            <div className="addedBy"><small><em>{Sefaria._("Added by")}: <span dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.userLink)} }></span></em></small></div>
            : null
        }

      </div>
            </section>

    )
  }
}


module.exports = Sheet;
