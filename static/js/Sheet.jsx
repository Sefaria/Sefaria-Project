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

          <SheetSources sources={sheet.sources} />
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
          <div>{source.ref}</div>
          {source.text ? <div dangerouslySetInnerHTML={ {__html: source.text.en} }></div> : null }
          {source.text ? <div dangerouslySetInnerHTML={ {__html: source.text.he} }></div> : null }
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
