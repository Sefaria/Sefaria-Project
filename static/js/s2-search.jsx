var sjs = sjs || {};
var cx  = React.addons.classSet;

var SearchPage = React.createClass({
    propTypes: {
        initialSettings : React.PropTypes.shape({
            query: React.PropTypes.string,
            page: React.PropTypes.number
        })
    },
    getInitialState: function() {
        return {
            query: this.props.initialSettings.query,
            page: this.props.initialSettings.page || 1,
            runningQuery: null,
            isQueryRunning: false
        }
    },
    updateQuery: function(query) {
        this.setState({query: query});
    },
    updateRunningQuery: function(ajax) {
        this.setState({
            runningQuery: ajax,
            isQueryRunning: !!ajax
        })
    },
    render: function () {
        return (
            <div>
                <div className="row-fluid">
                    <div id="searchHeaderContainer" className="span3">
                        <div id="searchHeader">{ this.state.isQueryRunning ? "Searching" : ""}</div>
                    </div>
                    <div id="lowerSearchBoxWrapper" className="span8">
                        <SearchBar
                            initialQuery = { this.state.query }
                            updateQuery = { this.updateQuery }
                        />
                    </div>
                </div>
                <div id="searchContentFrame" className="row-fluid">
                    <div id="searchControlsBox" className="span3">
                    </div>
                    <div id="searchContent" className="span8">
                        <SearchResultList
                            query = { this.state.query }
                            page = { this.state.page }
                            updateRunningQuery = { this.updateRunningQuery }
                        />
                    </div>
                </div>
            </div>
        )
    }
});

/*
		$(".searchInput").autocomplete({ source: function( request, response ) {
				var matches = $.map( sjs.books, function(tag) {
						if ( tag.toUpperCase().indexOf(request.term.toUpperCase()) === 0 ) {
							return tag;
						}
					});
				response(matches.slice(0, 30)); // limits return to 30 items
			}
		}).focus(function() {
			//$(this).css({"width": "300px"});
			$(this).closest(".searchBox").find(".keyboardInputInitiator").css({"opacity": 1});
		}).blur(function() {
			$(this).closest(".searchBox").find(".keyboardInputInitiator").css({"opacity": 0});
		});
		$(".searchButton").mousedown(sjs.handleSearch);
 */
var SearchBar = React.createClass({
    propTypes: {
        initialQuery: React.PropTypes.string,
        updateQuery: React.PropTypes.func
    },
    getInitialState: function() {
        return {query: this.props.initialQuery};
    },
    handleKeypress: function(event) {
        if (event.charCode == 13) {
            this.updateQuery();
        }
    },
    updateQuery: function() {
        if (this.props.updateQuery) {
            this.props.updateQuery(this.state.query)
        }
    },
    handleChange: function(event) {
        this.setState({query: event.target.value});
    },
    render: function () {
        return (
            <div>
                <div id="lowerSearchBox" className="searchBox">
                    <input id="lowerSearch" value={this.state.query} onKeyPress={this.handleKeypress} onChange={this.handleChange} placeholder="Search" className="searchInput keyboardInput" />
                    <span id="lowerOpenText" className="searchButton ui-icon ui-icon-search"></span>
                </div>
                <div id="description"></div>
            </div>
        )
    }
});

var SearchResultList = React.createClass({
    propTypes: {
        query: React.PropTypes.string,
        page: React.PropTypes.number,
        size: React.PropTypes.number,
        updateRunningQuery: React.PropTypes.func
    },
    getDefaultProps: function() {
        return {
            page: 1,
            size: 100
        };
    },
    getInitialState: function() {
        return {
            runningQuery: null,
            total: 0,
            hits: [],
            aggregations: null
        }
    },
    updateRunningQuery: function(ajax) {
        this.setState({runningQuery: ajax});
        this.props.updateRunningQuery(ajax);
    },
    _abortRunningQuery: function() {
        if(this.state.runningQuery) {
            this.state.runningQuery.abort();
        }
    },
    _executeQuery: function(props) {
        //This takes a props object, so as to be able to handle being called from componentWillReceiveProps with newProps
        props = props || this.props;

        if (!props.query) {
            return;
        }

        this._abortRunningQuery();

        var runningQuery = sjs.library.search.execute_query({
            query: props.query,
            size: props.page * props.size,
            success: function(data) {
                if (this.isMounted()) {
                    this.setState({
                        hits: this._process_duplicate_hits(data.hits.hits),
                        total: data.hits.total,
                        aggregations: data.aggregations
                    });
                    this.updateRunningQuery(null);
                }
            }.bind(this),
            error: function(jqXHR, textStatus, errorThrown) {
                if (textStatus == "abort") {
                    // Abort is immediately followed by new query, above.  Worried there would be a race if we call updateCurrentQuery(null) from here
                    //this.updateCurrentQuery(null);
                    return;
                }
                if (this.isMounted()) {
                    this.setState({
                        error: true
                    });
                    this.updateRunningQuery(null);
                }
            }.bind(this)
        });
        this.updateRunningQuery(runningQuery);
    },
    _process_duplicate_hits(hits) {
        var comparingRef = null;
        var newHits = [];
        for(var i = 0, j = 0; i < hits.length; i++) {
            var currentRef = hits[i]._source.ref;
            if(currentRef == comparingRef) {
                newHits[j - 1].duplicates = newHits[j-1].duplicates || [];
                newHits[j - 1].duplicates.push(hits[i]);
            } else {
                newHits[j] = hits[i];
                j++;
                comparingRef = currentRef;
            }
        }
        return newHits;
    },
    componentDidMount: function() {
        this._executeQuery();
    },
    componentWillUnmount: function() {
        this._abortRunningQuery();
    },
    componentWillReceiveProps: function(newProps) {
        if(this.props.query != newProps.query) {
           this.setState({
               total: 0,
               hits: [],
               aggregations: null
           });
           this._executeQuery(newProps)
        }
        else if (
            this.props.size != newProps.size
            || this.props.page != newProps.page
        ) {
           this._executeQuery(newProps)
        }
    },
    render: function () {
        if (!(this.props.query)) {  // Push this up? Thought is to choose on the SearchPage level whether to show a ResultList or an EmptySearchMessage.
            return null;
        }
        if (this.state.runningQuery) {
            return (<div>...</div>)
        }
        return (
            <div>
                <span>{this.state.total} results for {this.props.query}:</span>

                {this.state.hits.map(function(result) {
                    return <SearchResult data={result} query={this.props.query}/>;
                }.bind(this))}
            </div>

        )
    }
});

var SearchResult = React.createClass({
    propTypes: {
        query: React.PropTypes.string,
        data: React.PropTypes.object
    },
    getInitialState: function() {
        return {
            duplicatesShown: false
        }
    },
    toggleDuplicates: function(event) {
        this.setState({
            duplicatesShown: !this.state.duplicatesShown
        });
    },
    render: function () {
        var data = this.props.data;
        var s = this.props.data._source;
        var href = '/' + normRef(s.ref) + "/" + s.lang + "/" + s.version.replace(/ +/g, "_") + '?qh=' + this.props.query;

        function get_snippet_markup() {
            var snippet;
            if (data.highlight && data.highlight["content"]) {
                snippet = data.highlight["content"].join("...");
            } else {
                snippet = s["content"];
            }
            snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").html();
            return {__html:snippet}
        }


        var more_results_indicator = (!(data.duplicates)) ? "" :
                <div className='similar-trigger-box'>
                    <span className='similar-title he' onClick={this.toggleDuplicates}>
                        { data.duplicates.length } {(data.duplicates.length > 1) ? " גרסאות נוספות" : " גרסה נוספת"}
                    </span>
                    <span className='similar-title en' onClick={this.toggleDuplicates}>
                        { data.duplicates.length } more version{(data.duplicates.length > 1) ? "s" : ""}
                    </span>
                </div>;

        var shown_duplicates = (data.duplicates && this.state.duplicatesShown) ?
            (<div className='similar-results-box'>
                    {data.duplicates.map(function(result) {
                        return <SearchResult data={result}/>;
                    })}
            </div>) : "";

        return (
            <div className="result">
                <a href={href}>
                    <span className="en">{s.ref}</span>
                    <span className="he">{s.heRef}</span>
                </a>
                <div className="snippet" dangerouslySetInnerHTML={get_snippet_markup()}></div>
                <div className="version">{s.version}</div>
                {more_results_indicator}
                {shown_duplicates}
            </div>
        )
    }
});