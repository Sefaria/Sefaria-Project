const {
  LoadingMessage,
} = require('./Misc');

const React = require('react');
const ReactDOM = require('react-dom');
const PropTypes = require('prop-types');
const classNames = require('classnames');
const $ = require('./sefaria/sefariaJquery');
const Sefaria = require('./sefaria/sefaria');
const sanitizeHtml = require('sanitize-html');
import Component from 'react-class'


class Sheet extends Component {
  constructor(props) {
    super(props);

    this.state = {
        scrollDir: "down"
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

    for (var i = 0; i < data.sources.length; i++) {
      if ("ref" in data.sources[i]) {
        Sefaria.ref(data.sources[i].ref, function(ref) {
           {
               Sefaria.links(ref.sectionRef, function(){
                    this.forceUpdate();
               }.bind(this))

               }
        }.bind(this));
      }
    }
  }

  componentDidUpdate(prevProps, prevState) {
  }


  ensureData() {
    if (!this.getSheetFromCache()) {
      this.getSheetFromAPI();
    }
  }

  setPaddingForScrollbar() {
    // Scrollbars take up spacing, causing the centering of Sheet to be slightly off center
    // compared to the header. This functions sets appropriate padding to compensate.
    var width = Sefaria.util.getScrollbarWidth();
    if (this.props.interfaceLang == "hebrew") {
      this.$container.css({paddingRight: width, paddingLeft: 0});
    } else {
      this.$container.css({paddingRight: 0, paddingLeft: width});
    }
  }

  render() {
    var sheet = this.getSheetFromCache();
    var classes = classNames({sheetsInPanel: 1});
    var content;
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
            scrollDir = {this.state.scrollDir}
            authorStatement = {sheet.ownerName}
            authorUrl = {sheet.ownerProfileUrl}
            group = {sheet.group}
            editable = {Sefaria._uid == sheet.owner}
            hasSidebar = {this.props.hasSidebar}
            sheetNumbered = {sheet.options.numbered}
            sheetID = {sheet.id}
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
            {content}
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
              a: [ 'href', 'name', 'target' ],
              img: [ 'src' ],
              p: ['style'],
              span: ['style'],
              div: ['style'],
              td: ['colspan'],
            },
            allowedClasses: {
             'sup': ['nechama'],
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

  render() {
    var sources = this.props.sources.length ? this.props.sources.map(function(source, i) {

      if ("ref" in source) {
        return (
          <SheetSource
            key={i}
            source={source}
            sourceNum={i + 1}
            linkCount={Sefaria.linkCount(source.ref)}
            handleClick={this.handleClick}
            cleanHTML={this.cleanHTML}
            onSegmentClick={this.props.onSegmentClick}
            highlightedNodes={this.props.highlightedNodes}
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
        <div className="sheetMetaDataBox">
            <div className="title" role="heading" aria-level="1" style={{"direction": Sefaria.hebrew.isHebrew(this.props.title.stripHtml().replace(/&amp;/g, '&')) ? "rtl" :"ltr"}}>
                {this.props.title.stripHtmlKeepLineBreaks().replace(/&amp;/g, '&').replace(/(<br>|\n)+/g,' ')}
            </div>

            <div className="authorStatement"><a href={this.props.authorUrl}>{this.props.authorStatement}</a></div>
            {this.props.group && this.props.group != "" ? <div className="groupStatement">In the group <a href={"/groups/"+this.props.group}>{this.props.group}</a></div> : null}

        </div>
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
          this.props.highlightedNodes == this.props.source.node ? "highlight" : null,
          this.props.source.text && this.props.source.text.en && this.props.source.text.en == "..." ? "heOnly" : null,
          this.props.source.text && this.props.source.text.he && this.props.source.text.he == "..." ? "enOnly" : null,
          this.props.source.options ? this.props.source.options.indented : null
      );

    return (


      <div className={containerClasses} onClick={this.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
          {this.props.source.title ? <div className="customSourceTitle" role="heading" aria-level="3"><div className="titleBox">{this.props.source.title.stripHtml()}</div></div> : null}


            <div className="segmentNumber sheetSegmentNumber sans">
              <span className="en"> <span className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : this.props.sourceNum}</span> </span>
              <span className="he"> <span
                className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
            </div>


          {linkCountElement}

        {this.props.source.text && this.props.source.text.he && this.props.source.text.he != "" ?
          <div className="he">
            <div className="ref"><a href={"/" + this.props.source.ref} onClick={(e) => {
              this.props.handleClick(this.props.source.ref, e)
            } }>{this.props.source.heRef}</a></div>
            <div className="sourceContentText" dangerouslySetInnerHTML={ {__html: (this.props.cleanHTML(this.props.source.text.he))} }></div>
          </div> : null }


        {this.props.source.text && this.props.source.text.en && this.props.source.text.en != "" ?
          <div className="en">
            <div className="ref"><a href={"/" + this.props.source.ref} onClick={(e) => {
              this.props.handleClick(this.props.source.ref, e)
            } }>{this.props.source.ref}</a></div>
            <div className="sourceContentText" dangerouslySetInnerHTML={ {__html: (this.props.cleanHTML(this.props.source.text.en))} }></div>
          </div> : null }



        <div className="clearFix"></div>

      </div>
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
      </div>
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
      <div className={containerClasses} onClick={this.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
            <div className="segmentNumber sheetSegmentNumber sans">
              <span className="en"> <span className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : this.props.sourceNum}</span> </span>
              <span className="he"> <span
                className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
            </div>
        <div className={lang}>
            <div className="sourceContentText" dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.outsideText)} }></div>
        </div>
        <div className="clearFix"></div>

      </div>
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

    else {
        this.props.onSegmentClick(this.props.source);
    }
  }

  render() {
      var containerClasses = classNames("sheetItem",
          "segment",
          this.props.highlightedNodes == this.props.source.node ? "highlight" : null,
          this.props.source.options ? this.props.source.options.indented : null
      )
    return (
      <div className={containerClasses} onClick={this.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
            <div className="segmentNumber sheetSegmentNumber sans">
              <span className="en"> <span className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : this.props.sourceNum}</span> </span>
              <span className="he"> <span
                className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
            </div>
        <div className="he sourceContentText" dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.outsideBiText.he)} }></div>
        <div className="en sourceContentText" dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.outsideBiText.en)} }></div>
        <div className="clearFix"></div>

      </div>
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

    else {
        this.props.onSegmentClick(this.props.source);
    }
  }

  makeMediaEmbedLink(mediaURL) {
    var mediaLink;

    if (mediaURL.match(/\.(jpeg|jpg|gif|png)$/i) != null) {
      mediaLink = '<img class="addedMedia" src="' + mediaURL + '" />';
    }

    else if (mediaURL.toLowerCase().indexOf('youtube') > 0) {
      mediaLink = '<div class="youTubeContainer"><iframe width="100%" height="100%" src=' + mediaURL + ' frameborder="0" allowfullscreen></iframe></div>'
    }

    else if (mediaURL.toLowerCase().indexOf('soundcloud') > 0) {
      mediaLink = '<iframe width="100%" height="166" scrolling="no" frameborder="no" src="' + mediaURL + '"></iframe>'
    }

    else if (mediaURL.match(/\.(mp3)$/i) != null) {
      mediaLink = '<audio src="' + mediaURL + '" type="audio/mpeg" controls>Your browser does not support the audio element.</audio>';
    }

    else {
      mediaLink = 'Error loading media...';
    }

    return mediaLink
  }

  render() {
      var containerClasses = classNames("sheetItem",
          "segment",
          this.props.highlightedNodes == this.props.source.node ? "highlight" : null,
          this.props.source.options ? this.props.source.options.indented : null
      )
    return (
      <div className={containerClasses} onClick={this.sheetSourceClick} aria-label={"Click to  " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
            <div className="segmentNumber sheetSegmentNumber sans">
              <span className="en"> <span className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : this.props.sourceNum}</span> </span>
              <span className="he"> <span
                className="segmentNumberInner">{this.props.sheetNumbered == 0 ? null : Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
            </div>

        <div className="sourceContentText" dangerouslySetInnerHTML={ {__html: this.makeMediaEmbedLink(this.props.source.media)} }></div>
        <div className="clearFix"></div>

      </div>

    )
  }
}


module.exports = Sheet;
