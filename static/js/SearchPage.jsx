import React  from 'react';
import ReactDOM  from 'react-dom';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Footer  from './Footer';
import ComparePanelHeader from './ComparePanelHeader';
import SearchResultList  from './SearchResultList';
import SearchFilters from './SearchFilters';
import Component from 'react-class';
import {
  CategoryColorLine,
  InterfaceText,
  LoadingMessage,
} from './Misc';

class SearchPage extends Component {
  constructor(props) {
    super(props);
    this.state = {};
  }
  render () {
    const classes        = classNames({readerNavMenu: 1, compare: this.props.compare});
    const isQueryHebrew  = Sefaria.hebrew.isHebrew(this.props.query);
    return (
      <div className={classes} key={this.props.query}>
        {this.props.compare ?
        <ComparePanelHeader
          search={true}
          showDisplaySettings={false}
          onCompareBack={this.props.close}
          openSearch={this.props.onQueryChange} /> : null}

        <div className="content searchContent">
          <div className="sidebarLayout">
            <div className="contentInner">
              <h1 className={classNames({"hebrewQuery": isQueryHebrew, "englishQuery": !isQueryHebrew})}>
                <InterfaceText>Results for</InterfaceText>&nbsp;
                &ldquo;{ this.props.query }&rdquo;
              </h1>
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
            <div className="navSidebar">
              <SearchFilters
                query={this.props.query}
                searchState={this.props[`${this.props.tab}SearchState`]}
                updateAppliedFilter={this.props.updateAppliedFilter.bind(null, this.props.tab)}
                updateAppliedOptionField={this.props.updateAppliedOptionField.bind(null, this.props.tab)}
                updateAppliedOptionSort={this.props.updateAppliedOptionSort.bind(null, this.props.tab)}
                type={this.props.tab} />
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