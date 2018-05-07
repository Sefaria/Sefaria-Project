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
    if (segmentBottomDistanceFromTop < 0) {
      nextSegment.click();
    }
    //scroll up
    var prevSegment = segment.prev();
    var segmentTopDistanceFromBottom = segment.offset().top;
    if (segmentTopDistanceFromBottom > this.windowMiddle && this.props.scrollDir == "up") {
      prevSegment.click();
    }

  }


  cleanHTML(html) {
    html = html.replace(/\u00a0/g, ' ').replace(/&nbsp;/g, ' ');
    var clean = sanitizeHtml(html, {
            allowedTags: [ 'blockquote', 'p', 'a', 'ul', 'ol',
              'nl', 'li', 'b', 'i', 'strong', 'em', 'small', 'big', 'span', 'strike', 'hr', 'br', 'div',
              'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre' ],
            allowedAttributes: {
              a: [ 'href', 'name', 'target' ],
              img: [ 'src' ],
              p: ['style'],
              span: ['style'],
              div: ['style'],
              td: ['colspan'],
              table: ['style']
            },
            allowedStyles: {
              '*': {
                'color': [/^\#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
                    'background-color': [/^\#(0x)?[0-9a-f]+$/i, /^rgb(?!\(\s*255\s*,\s*255\s*,\s*255\s*\))\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
                'text-align': [/^left$/, /^right$/, /^center$/],
              },
              'table': {
                'width': [/^\d+em$/,/^\d+px$/,/^\d+\%$/]
              }

            },
            exclusiveFilter: function(frame) {
                return frame.tag === 'p' && !frame.text.trim();
            } //removes empty p tags  generated by ckeditor...

          });
    return clean;
  }


  handleClick(ref, e) {
    e.preventDefault();
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
          />
        )
      }

    }, this) : null;


    return (
      <div className="sheetContent">
        <div className="title"><div className="titleBox" role="heading" aria-level="2"><span className="en">{this.props.title.stripHtml()}</span><span className="he">{this.props.title.stripHtml()}</span></div></div>
        <div className="text">
            <div className="textInner">{sources}</div>
        </div>
      </div>
    )
  }
}

class SheetSource extends Component {
  sheetSourceClick(event) {
    this.props.onSegmentClick(this.props.source);
  }
  render() {
    var linkCountElement;
      var linkCount = this.props.linkCount;
      var minOpacity = 20, maxOpacity = 70;
      var linkScore = linkCount ? Math.min(linkCount + minOpacity, maxOpacity) / 100.0 : 0;
      var style = {opacity: linkScore};


      if (this.props.source.options) {
        var heSourceClasses = classNames({he: 1, forceDisplayOverrideEn: this.props.source.options.sourceLanguage == "english", forceDisplayOverrideHe: this.props.source.options.sourceLanguage == "hebrew", forceDisplayOverrideBi: this.props.source.options.sourceLanguage == "bilingual"});
        var enSourceClasses = classNames({en: 1, forceDisplayOverrideEn: this.props.source.options.sourceLanguage == "english", forceDisplayOverrideHe: this.props.source.options.sourceLanguage == "hebrew", forceDisplayOverrideBi: this.props.source.options.sourceLanguage == "bilingual"});
      }
      else {
          var heSourceClasses = classNames({he:1})
          var enSourceClasses = classNames({en:1})
      }

      linkCountElement = (<div className="linkCount sans" title={linkCount + " Connections Available"}>
                                                    <span className="en"><span className="linkCountDot" style={style}></span></span>
                                                    <span className="he"><span className="linkCountDot" style={style}></span></span>
                                                  </div>);


    return (


      <div className={this.props.highlightedNodes == this.props.source.node ? "sheetItem segment highlight" : "sheetItem segment"} onClick={this.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
        <div className="segmentNumber sheetSegmentNumber sans">
          <span className="en"> <span className="segmentNumberInner">{this.props.sourceNum}</span> </span>
          <span className="he"> <span
            className="segmentNumberInner">{Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
        </div>

          {linkCountElement}


          {this.props.source.title ? <h3 dangerouslySetInnerHTML={ {__html: (this.props.cleanHTML(this.props.source.title))} }></h3> : null}


        {this.props.source.text ?
          <div className={enSourceClasses}>
            <div className="ref"><a href={"/" + this.props.source.ref} onClick={(e) => {
              this.props.handleClick(this.props.source.ref, e)
            } }>{this.props.source.ref}</a></div>
            <span dangerouslySetInnerHTML={ {__html: (this.props.cleanHTML(this.props.source.text.en))} }></span>
          </div> : null }

        {this.props.source.text ?
          <div className={heSourceClasses}>
            <div className="ref"><a href={"/" + this.props.source.ref} onClick={(e) => {
              this.props.handleClick(this.props.source.ref, e)
            } }>{this.props.source.heRef}</a></div>
            <span dangerouslySetInnerHTML={ {__html: (this.props.cleanHTML(this.props.source.text.he))} }></span>
          </div> : null }


        <div className="clearFix"></div>

      </div>
    )
  }
}

class SheetComment extends Component {
  sheetSourceClick(event) {
    this.props.onSegmentClick(this.props.source);
  }

  render() {
    var lang = Sefaria.hebrew.isHebrew(this.props.source.comment.stripHtml()) ? "he" : "en";
    return (
      <div className={this.props.highlightedNodes == this.props.source.node ? "sheetItem segment highlight" : "sheetItem segment"} onClick={this.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
        <div className="segmentNumber sheetSegmentNumber sans">
          <span className="en"> <span className="segmentNumberInner">{this.props.sourceNum}</span> </span>
          <span className="he"> <span
            className="segmentNumberInner">{Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
        </div>
        <div className={lang}>
            <span dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.comment)} }></span>
        </div>
        <div className="clearFix"></div>
      </div>
    )
  }
}

class SheetOutsideText extends Component {
  sheetSourceClick(event) {
    this.props.onSegmentClick(this.props.source);
  }

  render() {
    var lang = Sefaria.hebrew.isHebrew(this.props.source.outsideText.stripHtml()) ? "he" : "en";
    return (
      <div className={this.props.highlightedNodes == this.props.source.node ? "sheetItem segment highlight" : "sheetItem segment"} onClick={this.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
        <div className="segmentNumber sheetSegmentNumber sans">
          <span className="en"> <span className="segmentNumberInner">{this.props.sourceNum}</span> </span>
          <span className="he"> <span
            className="segmentNumberInner">{Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
        </div>

        <div className={lang}>
            <span dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.outsideText)} }></span>
        </div>
        <div className="clearFix"></div>

      </div>
    )
  }
}

class SheetOutsideBiText extends Component {
  sheetSourceClick(event) {
    this.props.onSegmentClick(this.props.source);
  }

  render() {
    return (
      <div className={this.props.highlightedNodes == this.props.source.node ? "sheetItem segment highlight" : "sheetItem segment"} onClick={this.sheetSourceClick} aria-label={"Click to see " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
        <div className="segmentNumber sheetSegmentNumber sans">
          <span className="en"> <span className="segmentNumberInner">{this.props.sourceNum}</span> </span>
          <span className="he"> <span
            className="segmentNumberInner">{Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
        </div>

        <div className="en" dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.outsideBiText.en)} }></div>
        <div className="he" dangerouslySetInnerHTML={ {__html: this.props.cleanHTML(this.props.source.outsideBiText.he)} }></div>
        <div className="clearFix"></div>

      </div>
    )
  }

}

class SheetMedia extends Component {
  sheetSourceClick(event) {
    this.props.onSegmentClick(this.props.source);
  }

  makeMediaEmbedLink(mediaURL) {
    var mediaLink;

    if (mediaURL.match(/\.(jpeg|jpg|gif|png)$/i) != null) {
      mediaLink = '<img class="addedMedia" src="' + mediaURL + '" />';
    }

    else if (mediaURL.toLowerCase().indexOf('youtube') > 0) {
      mediaLink = '<iframe width="560" height="315" src=' + mediaURL + ' frameborder="0" allowfullscreen></iframe>'
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
    return (
      <div className={this.props.highlightedNodes == this.props.source.node ? "sheetItem segment highlight" : "sheetItem segment"} onClick={this.sheetSourceClick} aria-label={"Click to  " + this.props.linkCount +  " connections to this source"} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.sheetSourceClick(e):null}.bind(this)} >
        <div className="segmentNumber sheetSegmentNumber sans">
          <span className="en"> <span className="segmentNumberInner">{this.props.sourceNum}</span> </span>
          <span className="he"> <span
            className="segmentNumberInner">{Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
        </div>
        <div dangerouslySetInnerHTML={ {__html: this.makeMediaEmbedLink(this.props.source.media)} }></div>
        <div className="clearFix"></div>

      </div>

    )
  }
}


module.exports = Sheet;
