var sjs = sjs || {};
var cx  = React.addons.classSet;

var SearchPage = React.createClass({
    getInitialState: function() {
        return {
          query: this.props.initialSettings.query,
          page: this.props.initialSettings.page
        }
    },
    updateQuery: function(query) {
        this.setState({query:query});
    },
    render: function () {
        return (
            <div>
                <div className="row-fluid">
                    <div id="searchHeaderContainer" className="span3">
                        <div id="searchHeader"></div>
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
                    <input id="lowerSearch" value={this.state.query} onKeyPress={this.handleKeypress} onChange={this.handleChange} defaultValue="Search" className="searchInput keyboardInput" />
                    <span id="lowerOpenText" className="searchButton ui-icon ui-icon-search"></span>
                </div>
                <div id="description"></div>
            </div>
        )
    }
});

var SearchResultList = React.createClass({
    render: function () {
        return (
            <div>
                <span>Results for {this.props.query}:</span>
                <SearchResult />
                <SearchResult />
                <SearchResult />
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