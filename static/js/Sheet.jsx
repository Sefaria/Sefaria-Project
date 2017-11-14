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


    render() {
      var sources = this.props.sources.length ? this.props.sources.map(function(source, i) {

        if ("ref" in source) {
          return (
          <SheetSource
            key={i}
            onRefClick = {this.props.onRefClick}
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
          <a className="ref" onClick={() => {this.props.onRefClick(this.props.source.ref)} } >{this.props.source.ref}</a>
          {this.props.source.text ? <p className="en">{this.props.source.text.en.stripHtml()}</p> : null }
          {this.props.source.text ? <p className="he">{this.props.source.text.he.stripHtml()}</p> : null }
          <hr/>
        </div>
        )
      }



}




module.exports = Sheet;
