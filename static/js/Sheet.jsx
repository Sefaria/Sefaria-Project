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
          <div dangerouslySetInnerHTML={ {__html: sheet.title} }></div>

          <SheetSources
              sources={sheet.sources}
              onRefClick={this.props.onRefClick}
          />
        </div>
      )
    }
  }
}


class SheetSources extends Component {


    render() {
      var sources = this.props.sources.length ? this.props.sources.map(function(source, i) {
        return (
        <div key={i}>
          <div onClick={() => {this.props.onRefClick(source.ref)} } >{source.ref}</div>
          {source.text ? <p className="en" dangerouslySetInnerHTML={ {__html: source.text.en} }></p> : null }
          {source.text ? <p className="he" dangerouslySetInnerHTML={ {__html: source.text.he} }></p> : null }
          <hr/>
        </div>
        )
      }, this) : null;


      return (
          <div>
            <div>{sources}</div>
          </div>
      )
    }

}



module.exports = Sheet;
