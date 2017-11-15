const {
  LoadingMessage,
}                            = require('./Misc');

const React      = require('react');
const ReactDOM   = require('react-dom');
const PropTypes  = require('prop-types');
const classNames = require('classnames');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
import Component from 'react-class'


class Sheet extends Component {
  componentDidMount() {
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
  }

  ensureData() {
    if (!this.getSheetFromCache()) { this.getSheetFromAPI(); }
  }


  render() {
    var sheet = this.getSheetFromCache();
    var classes = classNames({sheetsInPanel: 1});

    if (!sheet) { return (<LoadingMessage />); }
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
    handleClick(ref,e) {
      e.preventDefault();
      this.props.onRefClick(ref);
    }

    render() {
      var sources = this.props.sources.length ? this.props.sources.map(function(source, i) {

        if ("ref" in source) {
          return (
          <SheetSource
            key={i}
            onRefClick = {this.props.onRefClick}
            source = {source}
            handleClick = {this.handleClick}
          />
          )
        }

        else if ("comment" in source) {
          return (
          <SheetComment
            key={i}
            source = {source}
          />
          )
        }

        else if ("outsideText" in source) {
          return (
          <SheetOutsideText
            key={i}
            source = {source}
          />
          )
        }

        else if ("outsideBiText" in source) {
          return (
          <SheetOutsideBiText
            key={i}
            source = {source}
          />
          )
        }

        else if ("media" in source) {
          return (
          <SheetMedia
            key={i}
            source = {source}
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
        <div>
          <div className="ref"><a href={"/"+this.props.source.ref} onClick={(e) => {this.props.handleClick(this.props.source.ref, e)} } >{this.props.source.ref}</a></div>
          {this.props.source.text ? <p className="he">{this.props.source.text.he.stripHtml()}</p> : null }
          {this.props.source.text ? <p className="en">{this.props.source.text.en.stripHtml()}</p> : null }
          <hr/>
        </div>
        )
      }
}

class SheetComment extends Component {
      render() {
        var lang = Sefaria.hebrew.isHebrew(this.props.source.comment.stripHtml()) ? "he" : "en";
        return (
        <div className={lang}>
          {this.props.source.comment.stripHtml()}
          <hr/>
        </div>
        )
      }
}

class SheetOutsideText extends Component {
      render() {
        var lang = Sefaria.hebrew.isHebrew(this.props.source.outsideText.stripHtml()) ? "he" : "en";
        return (
        <div className={lang}>
          {this.props.source.outsideText.stripHtml()}
          <hr/>
        </div>
        )
      }
}

class SheetOutsideBiText extends Component {
      render() {
        return (
        <div>
          <div className="he">{this.props.source.outsideBiText.he.stripHtml()}</div>
          <div className="en">{this.props.source.outsideBiText.en.stripHtml()}</div>
          <hr/>
        </div>
        )
      }

}

class SheetMedia extends Component {
      render() {
        return (
        <div>
          <div className="he">{this.props.source.outsideBiText.he.stripHtml()}</div>
          <div className="en">{this.props.source.outsideBiText.en.stripHtml()}</div>
          <hr/>
        </div>
        )
      }
}




module.exports = Sheet;
