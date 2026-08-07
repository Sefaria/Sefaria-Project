import Component from "react-class";
import {SearchTotal} from "./sefaria/searchTotal";
import Sefaria from "./sefaria/sefaria";
import PropTypes from "prop-types";
import React from "react";
import SearchPage from "./SearchPage";

/**
 * Feeds the search page from the natural-language search API
 * (/api/search-wrapper/natural-language) instead of Elasticsearch. That endpoint
 * enqueues a Celery task that elaborates the query with an LLM into English and
 * Hebrew versions, runs both through semantic KNN search in parallel, scores
 * every result's relevance to the query with an LLM (keeping only the 3-5s out
 * of 5), and writes a short LLM relevance summary for each retained result --
 * linked-ref matches are annotated the same way, not returned separately. The
 * task's progress is polled via Sefaria.pollTask.
 */
class SemanticSearchQuerier extends Component {
    constructor(props) {
      super(props);
      this.state = {
        isQueryRunning: false,
        hits:           [],
        error:          false,
        englishQuery:   null,
        hebrewQuery:    null,
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
        if (this._abortController) {
            this._abortController.abort();
        }
    }
    _normalizeResult(result, resultOrigin) {
        return {
            _id: `${resultOrigin}:${result.ref}`,
            resultOrigin,
            summary: result.summary || "",
            _source: {
                ref: result.ref,
                heRef: result.ref,
                version: result.version_title,
                lang: result.language,
                exact: result.text || "",
            },
        };
    }
    async _executeQuery(query) {
        if (!query) { return; }
        if (this._abortController) {
            this._abortController.abort();
        }
        const controller = new AbortController();
        this._abortController = controller;
        this.setState({
            isQueryRunning: true,
            error:          false,
            hits:           [],
            englishQuery:   null,
            hebrewQuery:    null,
        });

        try {
            const startResp = await fetch(`${Sefaria.apiHost}/api/search-wrapper/natural-language`, {
                method:      "POST",
                headers:     {"Content-Type": "application/json; charset=utf-8"},
                body:        JSON.stringify({query}),
                credentials: "include",
                signal:      controller.signal,
            });
            if (!startResp.ok) { throw new Error("Failed to start natural-language search"); }
            const {task_id} = await startResp.json();

            const result = await Sefaria.pollTask(task_id, {
                signal: controller.signal,
                onProgress: meta => {
                    if (!meta) { return; }
                    const update = {};
                    if (meta.english_query) { update.englishQuery = meta.english_query; }
                    if (meta.hebrew_query) { update.hebrewQuery = meta.hebrew_query; }
                    if (Object.keys(update).length) { this.setState(update); }
                },
            });

            const hits = (result.results || []).map(r => this._normalizeResult(r, r.source));
            this.setState({
                isQueryRunning: false,
                hits,
                englishQuery: result.english_query,
                hebrewQuery: result.hebrew_query,
            });
        } catch (e) {
            if (controller.signal.aborted || e.name === "AbortError") { return; }
            this.setState({isQueryRunning: false, error: true});
        }
    }
    render () {
        return <SearchPage
                    key={"searchPage"}
                    moreToLoad={false}
                    isQueryRunning={this.state.isQueryRunning}
                    searchTopMsg="search_page.results_for"
                    query={this.props.query}
                    englishQuery={this.state.englishQuery}
                    hebrewQuery={this.state.hebrewQuery}
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
