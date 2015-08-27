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
            page: this.props.initialSettings.page,
            queryInProcess: false
        }
    },
    updateQuery: function(query) {
        this.setState({query: query});
    },
    updateQueryInProcess: function(bool) {
        this.setState({ queryInProcess: bool })
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
                            updateQueryInProcess = { this.updateQueryInProcess }
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
        updateQueryInProcess: React.PropTypes.func
    },
    getDefaultProps: function() {
        return {
            page: 1,
            size: 100
        };
    },
    getInitialState: function() {
        return {
            queryInProcess: false
        }
    },
    updateQueryInProcess: function(bool) {
        this.setState({queryInProcess: bool});
        this.props.updateQueryInProcess(bool);
    },
    componentDidMount: function() {
        if (!this.props.query) {
            return;
        }
        this.updateQueryInProcess(true);

        sjs.search.execute_query({
            query: this.props.query,
            size: this.props.page * this.props.size,
            success: function(data) {
                if (this.isMounted()) {
                    this.setState({
                        hits: data.hits,
                        aggregations: data.aggregations,
                    });
                    this.updateQueryInProcess(false);
                }
            }.bind(this),
            error: function(jqXHR, textStatus, errorThrown) {
                if (textStatus == "abort") {
                    this.updateQueryInProcess(false);
                    return;
                }
                if (this.isMounted()) {
                    this.setState({
                        error: true,
                    });
                    this.updateQueryInProcess(false);
                }
            }.bind(this)
        });
    },
    render: function () {
        if (!(this.props.query)) {  // Push this up? Thought is to choose on the SearchPage level whether to show a ResultList or an EmptySearchMessage.
            return null;
        }
        return (
            <div>
                <span>Results for {this.props.query}:</span>
                <SearchResult />
                <SearchResult />
                <SearchResult />
                { this.state.hits }
            </div>

        )
    }
});

var SearchResult = React.createClass({
    render: function () {
        return (
            <div>Search Result</div>
        )
    }
});