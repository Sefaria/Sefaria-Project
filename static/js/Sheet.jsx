const {
  LoadingMessage,
} = require('./Misc');

const React = require('react');
const ReactDOM = require('react-dom');
const PropTypes = require('prop-types');
const classNames = require('classnames');
const $ = require('./sefaria/sefariaJquery');
const Sefaria = require('./sefaria/sefaria');
import Component from 'react-class'


class Sheet extends Component {
  componentDidMount() {
    this.ensureData();
    this.placeSegmentNumbers();

  }

  getSheetFromCache() {
    return Sefaria.sheets.loadSheetByID(this.props.id);
  }

  getSheetFromAPI() {
    Sefaria.sheets.loadSheetByID(this.props.id, this.onDataLoad);
  }

  onDataLoad(data) {
    this.forceUpdate();
    this.placeSegmentNumbers();

  }

  componentDidUpdate(prevProps, prevState) {
    this.placeSegmentNumbers();
  }


  ensureData() {
    if (!this.getSheetFromCache()) {
      this.getSheetFromAPI();
    }
  }


  placeSegmentNumbers() {
    //console.log("placeSegmentNumbers", this.props.sref);
    // Set the vertical offsets for segment numbers and link counts, which are dependent
    // on the rendered height of the text of each segment.
    var $text = $(ReactDOM.findDOMNode(this));
    var elemsAtPosition = {}; // Keyed by top position, an array of elements found there
    var setTop = function() {
      var $elem = $(this);
      var top = $elem.parent().position().top;
      $elem.css({top: top});
      var list = elemsAtPosition[top] || [];
      list.push($elem);
      elemsAtPosition[top] = list;
    };
    $text.find(".linkCount").each(setTop);
    elemsAtPosition = {};  // resetting because we only want it to track segmentNumbers
    $text.find(".segmentNumber").each(setTop).show();
    var fixCollision = function($elems) {
      // Takes an array of jQuery elements that all currently appear at the same top position
      if ($elems.length == 1) {
        return;
      }
      if ($elems.length == 2) {
        var adjust = 8;
        $elems[0].css({top: "-=" + adjust});
        $elems[1].css({top: "+=" + adjust});
      }
    };
    for (var top in elemsAtPosition) {
      if (elemsAtPosition.hasOwnProperty(top)) {
        fixCollision(elemsAtPosition[top]);
      }
    }
    $text.find(".segmentNumber").show();
    $text.find(".linkCount").show();
  }


  render() {
    var sheet = this.getSheetFromCache();
    var classes = classNames({sheetsInPanel: 1});

    if (!sheet) {
      return (<LoadingMessage />);
    }
    else {
      return (
        <div className={classes}>
          <div className="title">{sheet.title.stripHtml()}</div>

          <SheetContent
            sources={sheet.sources}
            onRefClick={this.props.onRefClick}
          />
        </div>
      )
    }
  }
}


class SheetContent extends Component {
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
            onRefClick={this.props.onRefClick}
            source={source}
            sourceNum={i + 1}
            handleClick={this.handleClick}
          />
        )
      }

      else if ("comment" in source) {
        return (
          <SheetComment
            key={i}
            sourceNum={i + 1}
            source={source}
          />
        )
      }

      else if ("outsideText" in source) {
        return (
          <SheetOutsideText
            key={i}
            sourceNum={i + 1}
            source={source}
          />
        )
      }

      else if ("outsideBiText" in source) {
        return (
          <SheetOutsideBiText
            key={i}
            sourceNum={i + 1}
            source={source}
          />
        )
      }

      else if ("media" in source) {
        return (
          <SheetMedia
            key={i}
            sourceNum={i + 1}
            source={source}
          />
        )
      }

    }, this) : null;


    return (
      <div className="sheetContent">
        <div>{sources}</div>
      </div>
    )
  }
}

class SheetSource extends Component {
  render() {
    return (
      <div className="sheetItem segment">
        <div className="segmentNumber sans">
          <span className="en"> <span className="segmentNumberInner">{this.props.sourceNum}</span> </span>
          <span className="he"> <span
            className="segmentNumberInner">{Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
        </div>

        {this.props.source.text ?
          <div className="en">
            {this.props.source.text.en.stripHtml()}
            <div className="ref"><a href={"/" + this.props.source.ref} onClick={(e) => {
              this.props.handleClick(this.props.source.ref, e)
            } }>{this.props.source.ref}</a></div>
          </div> : null }

        {this.props.source.text ?
          <div className="he">
            {this.props.source.text.he.stripHtml()}
            <div className="ref"><a href={"/" + this.props.source.ref} onClick={(e) => {
              this.props.handleClick(this.props.source.ref, e)
            } }>{this.props.source.heRef}</a></div>
          </div> : null }

      </div>
    )
  }
}

class SheetComment extends Component {
  render() {
    var lang = Sefaria.hebrew.isHebrew(this.props.source.comment.stripHtml()) ? "he" : "en";
    return (
      <div className="sheetItem segment">
        <div className="segmentNumber sans">
          <span className="en"> <span className="segmentNumberInner">{this.props.sourceNum}</span> </span>
          <span className="he"> <span
            className="segmentNumberInner">{Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
        </div>
        <div className={lang}>
          {this.props.source.comment.stripHtml()}
        </div>
      </div>
    )
  }
}

class SheetOutsideText extends Component {
  render() {
    var lang = Sefaria.hebrew.isHebrew(this.props.source.outsideText.stripHtml()) ? "he" : "en";
    return (
      <div className="sheetItem segment">
        <div className="segmentNumber sans">
          <span className="en"> <span className="segmentNumberInner">{this.props.sourceNum}</span> </span>
          <span className="he"> <span
            className="segmentNumberInner">{Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
        </div>

        <div className={lang}>
          {this.props.source.outsideText.stripHtml()}
        </div>
      </div>
    )
  }
}

class SheetOutsideBiText extends Component {
  render() {
    return (
      <div className="sheetItem segment">
        <div className="segmentNumber sans">
          <span className="en"> <span className="segmentNumberInner">{this.props.sourceNum}</span> </span>
          <span className="he"> <span
            className="segmentNumberInner">{Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
        </div>
        <div className="en">{this.props.source.outsideBiText.en.stripHtml()}</div>
        <div className="he">{this.props.source.outsideBiText.he.stripHtml()}</div>
      </div>
    )
  }

}

class SheetMedia extends Component {
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
      <div className="sheetItem segment">
        <div className="segmentNumber sans">
          <span className="en"> <span className="segmentNumberInner">{this.props.sourceNum}</span> </span>
          <span className="he"> <span
            className="segmentNumberInner">{Sefaria.hebrew.encodeHebrewNumeral(this.props.sourceNum)}</span> </span>
        </div>
        <div dangerouslySetInnerHTML={ {__html: this.makeMediaEmbedLink(this.props.source.media)} }></div>
      </div>

    )
  }
}


module.exports = Sheet;
