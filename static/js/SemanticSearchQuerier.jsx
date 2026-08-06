import Component from "react-class";
import {SearchTotal} from "./sefaria/searchTotal";
import Sefaria from "./sefaria/sefaria";
import $ from "./sefaria/sefariaJquery";
import PropTypes from "prop-types";
import React from "react";
import SearchPage from "./SearchPage";

/**
 * Feeds the search page from the natural-language search API
 * (/api/search-wrapper/natural-language) instead of Elasticsearch. That endpoint
 * elaborates the query with an LLM into English and Hebrew versions, runs both
 * through semantic KNN search in parallel, and unions the results. POC: no
 * filters, no sort, no pagination -- semantic matches followed by link-origin
 * matches.
 */
class SemanticSearchQuerier extends Component {
    constructor(props) {
      super(props);
      this.state = {
        isQueryRunning: false,
        hits:           [],
        error:          false,
      };
    }
    componentDidMount() {
        this._executeQuery(this.props.query);
    }
    componentWillReceiveProps(newProps) {
        if (this.props.query !== newProps.query) {
            this._executeQuery(newProps.query);
        }
    }
    componentWillUnmount() {
        if (this._runningQuery) {
            this._runningQuery.abort();
        }
    }
    _normalizeResult(result, resultOrigin) {
        return {
            _id: `${resultOrigin}:${result.ref}`,
            resultOrigin,
            _source: {
                ref: result.ref,
                heRef: result.ref,
                version: result.version_title,
                lang: result.language,
                exact: result.text || "",
            },
        };
    }
    _executeQuery(query) {
        if (!query) { return; }
        if (this._runningQuery) {
            this._runningQuery.abort();
        }
        this.setState({isQueryRunning: true, error: false, hits: []});
        this._runningQuery = $.ajax({
            url: `${Sefaria.apiHost}/api/search-wrapper/natural-language`,
            type: "POST",
            data: JSON.stringify({query}),
            contentType: "application/json; charset=utf-8",
            crossDomain: true,
            processData: false,
            dataType: "json",
            success: data => {
                const semanticHits = (data.results || []).map(r => this._normalizeResult(r, "semantic"));
                const linkHits = (data.linked_refs || []).map(r => this._normalizeResult(r, "link"));
                this.setState({
                    isQueryRunning: false,
                    hits: semanticHits.concat(linkHits),
                });
            },
            error: () => {
                this.setState({isQueryRunning: false, error: true});
            },
        });
    }
    render () {
        return <SearchPage
                    key={"searchPage"}
                    moreToLoad={false}
                    isQueryRunning={this.state.isQueryRunning}
                    searchTopMsg="search_page.results_for"
                    query={this.props.query}
                    sortTypeArray={[]}
                    hits={this.state.hits}
                    totalResults={new SearchTotal({value: this.state.hits.length})}
                    type="semantic"
                    searchState={{sortType: null, appliedFilters: []}}
                    panelsOpen={this.props.panelsOpen}
                    onResultClick={this.props.onResultClick}
                    close={this.props.close}
                    onQueryChange={this.props.onQueryChange}
                    topics={[]}
                  />;
    }
}

SemanticSearchQuerier.propTypes = {
    query: PropTypes.string,
    onResultClick: PropTypes.func,
    close: PropTypes.func,
    panelsOpen: PropTypes.number,
    onQueryChange: PropTypes.func,
};

export { SemanticSearchQuerier };
