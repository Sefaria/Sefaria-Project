import {
  CategoryColorLine,
  ReaderNavigationMenuSearchButton,
  ReaderNavigationMenuCloseButton,
  ReaderNavigationMenuDisplaySettingsButton,
  LoadingMessage,
} from './Misc';
import React  from 'react';
import ReactDOM  from 'react-dom';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Footer  from './Footer';
import ComparePanelHeader from './ComparePanelHeader';
import SearchResultList  from './SearchResultList';
import Component from 'react-class';


class SearchPage extends Component {
    constructor(props) {
      super(props);
      this.state = {};
    }
    render () {
        var fontSize       = 62.5; // this.props.settings.fontSize, to make this respond to user setting. disabled for now.
        var style          = {"fontSize": fontSize + "%"};
        var classes        = classNames({readerNavMenu: 1, compare: this.props.compare});
        var isQueryHebrew  = Sefaria.hebrew.isHebrew(this.props.query);
        return (
          <div className={classes} key={this.props.query}>
            {this.props.compare ?
            <ComparePanelHeader
              search={true}
              showDisplaySettings={false}
              onCompareBack={this.props.close}
              openSearch={this.props.onQueryChange} /> : null}

            <div className="content">
              <div className="contentInner">
                <div className="searchContentFrame">
                    <h1 className={classNames({"hebrewQuery": isQueryHebrew, "englishQuery": !isQueryHebrew})}>
                      &ldquo;{ this.props.query }&rdquo;
                    </h1>
                    <div className="searchContent" style={style}>
                        <SearchResultList
                          query={this.props.query}
                          tab={this.props.tab}
                          textSearchState={this.props.textSearchState}
                          sheetSearchState={this.props.sheetSearchState}
                          onResultClick={this.props.onResultClick}
                          updateTab={this.props.updateTab}
                          updateAppliedFilter = {this.props.updateAppliedFilter}
                          updateAppliedOptionField={this.props.updateAppliedOptionField}
                          updateAppliedOptionSort={this.props.updateAppliedOptionSort}
                          registerAvailableFilters={this.props.registerAvailableFilters}
                        />
                    </div>
                </div>
              </div>
              { this.props.panelsOpen === 1 ? <Footer /> : null }
            </div>
          </div>
        );
    }
}
SearchPage.propTypes = {
    interfaceLang:            PropTypes.oneOf(["english", "hebrew"]),
    query:                    PropTypes.string,
    tab:                      PropTypes.oneOf(["text", "sheet"]),
    textSearchState:          PropTypes.object,
    sheetSearchState:         PropTypes.object,
    settings:                 PropTypes.object,
    panelsOpen:               PropTypes.number,
    close:                    PropTypes.func,
    onResultClick:            PropTypes.func,
    onQueryChange:            PropTypes.func,
    updateTab:                PropTypes.func,
    updateAppliedFilter:      PropTypes.func,
    updateAppliedOptionField: PropTypes.func,
    updateAppliedOptionSort:  PropTypes.func,
    registerAvailableFilters: PropTypes.func,
};


export default SearchPage;