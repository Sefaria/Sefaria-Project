var sjs = sjs || {};
var cx  = React.addons.classSet;

var SearchPage = React.createClass({
    render: function () {
        return (
            <div>
                <h1>Search Page</h1>
                <SearchBar />
                <SearchResultList />
            </div>
        )
    }
});

var SearchBar = React.createClass({
    render: function () {
        return (
            <div>Search Bar</div>
        )
    }
});

var SearchResultList = React.createClass({
    render: function () {
        return (
            <div>
                <span>Search Result List</span>
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