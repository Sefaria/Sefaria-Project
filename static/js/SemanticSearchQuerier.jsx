import Component from "react-class";
import {SearchTotal} from "./sefaria/searchTotal";
import Sefaria from "./sefaria/sefaria";
import $ from "./sefaria/sefariaJquery";
import PropTypes from "prop-types";
import React from "react";
import SearchPage from "./SearchPage";

const POLL_INTERVAL_MS = 1000;

/**
 * Feeds the search page from the KNN semantic search API (/api/search-wrapper/semantic)
 * instead of Elasticsearch. POC: no filters, no sort, no pagination -- a single capped
 * batch of semantic matches followed by link-origin matches.
 *
 * The search runs as a Celery task server-side (embedding call + pgvector KNN can be
 * slow), so a request here only gets back a task_id; this component polls
 * /api/async/<task_id> until the task completes.
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
        this._stopPolling();
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
    _stopPolling() {
        if (this._pollTimeout) {
            clearTimeout(this._pollTimeout);
            this._pollTimeout = null;
        }
        if (this._pollRequest) {
            this._pollRequest.abort();
            this._pollRequest = null;
        }
    }
    _executeQuery(query) {
        if (!query) { return; }
        this._stopPolling();
        if (this._runningQuery) {
            this._runningQuery.abort();
        }
        this.setState({isQueryRunning: true, error: false, hits: []});
        this._runningQuery = $.ajax({
            url: `${Sefaria.apiHost}/api/search-wrapper/semantic`,
            type: "POST",
            data: JSON.stringify({query}),
            contentType: "application/json; charset=utf-8",
            crossDomain: true,
            processData: false,
            dataType: "json",
            success: data => {
                this._pollForResult(data.task_id);
            },
            error: () => {
                this.setState({isQueryRunning: false, error: true});
            },
        });
    }
    _pollForResult(taskId) {
        this._pollRequest = $.ajax({
            url: `${Sefaria.apiHost}/api/async/${taskId}`,
            type: "GET",
            crossDomain: true,
            dataType: "json",
            success: data => {
                if (!data.ready) {
                    this._pollTimeout = setTimeout(() => this._pollForResult(taskId), POLL_INTERVAL_MS);
                    return;
                }
                const result = data.result || {};
                const semanticHits = (result.results || []).map(r => this._normalizeResult(r, "semantic"));
                const linkHits = (result.linked_refs || []).map(r => this._normalizeResult(r, "link"));
                this.setState({
                    isQueryRunning: false,
                    hits: semanticHits.concat(linkHits),
                });
            },
            error: (jqXHR) => {
                if (jqXHR.statusText === "abort") { return; }
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
