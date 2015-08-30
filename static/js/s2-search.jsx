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
            currentQuery: null,
            queryInProcess: false
        }
    },
    updateQuery: function(query) {
        this.setState({query: query});
    },
    updateCurrentQuery: function(ajax) {
        this.setState({
            currentQuery: ajax,
            queryInProcess: !!ajax
        })
    },
    render: function () {
        return (
            <div>
                <div className="row-fluid">
                    <div id="searchHeaderContainer" className="span3">
                        <div id="searchHeader">{ this.state.queryInProcess ? "Searching" : ""}</div>
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
                            updateCurrentQuery = { this.updateCurrentQuery }
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
        updateCurrentQuery: React.PropTypes.func
    },
    getDefaultProps: function() {
        return {
            page: 1,
            size: 100
        };
    },
    getInitialState: function() {
        return {
            currentQuery: null,
            total: 0,
            hits: [],
            aggregations: null
        }
    },
    updateCurrentQuery: function(ajax) {
        this.setState({currentQuery: ajax});
        this.props.updateCurrentQuery(ajax);
    },
    _executeQuery: function() {
        if (!this.props.query) {
            return;
        }
        if(this.state.currentQuery) {
            this.state.currentQuery.abort();
        }

        var currentQuery = sjs.library.search.execute_query({
            query: this.props.query,
            size: this.props.page * this.props.size,
            success: function(data) {
                if (this.isMounted()) {
                    this.setState({
                        hits: data.hits.hits,
                        total: data.hits.total,
                        aggregations: data.aggregations
                    });
                    this.updateCurrentQuery(null);
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
                    this.updateCurrentQuery(null);
                }
            }.bind(this)
        });
        this.updateCurrentQuery(currentQuery);
    },
    componentDidMount: function() {
       this._executeQuery()
    },
    componentWillReceiveProps: function(newProps) {
        if(this.props.query != newProps.query) {
           this.setState({
               total: 0,
               hits: []
           });
           this._executeQuery()
        }
        else if (
            this.props.size != newProps.size
            || this.props.page != newProps.page
        ) {
           this._executeQuery()
        }
    },
    render: function () {
        if (!(this.props.query)) {  // Push this up? Thought is to choose on the SearchPage level whether to show a ResultList or an EmptySearchMessage.
            return null;
        }
        if (this.state.currentQuery) {
            return (<div>...</div>)
        }
        return (
            <div>
                <span>{this.state.total} results for {this.props.query}:</span>

                {this.state.hits.map(function(result) {
                    return <SearchResult data={result}/>;
                })}
            </div>

        )
    }
});

var SearchResult = React.createClass({
    propTypes: {
        data: React.PropTypes.object
    },
    render: function () {
        var data = this.props.data;
        var s = this.props.data._source;
        var href = '/' + normRef(s.ref) + "/" + s.lang + "/" + s.version.replace(/ +/g, "_") + '?qh=' + this.query;

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


        return (
            <div className="result">
                <a href="{href}">
                    <span class="en">{s.ref}</span>
                    <span class="he">{s.heRef}</span>
                </a>
                <div className="snippet" dangerouslySetInnerHTML={get_snippet_markup()}></div>
                <div className="version">{s.version}</div>
            </div>
        )
    }
});