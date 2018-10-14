const {
  LoadingMessage,
}                       = require('./Misc');
const React             = require('react');
const ReactDOM          = require('react-dom');
const extend            = require('extend');
const $                 = require('./sefaria/sefariaJquery');
const Sefaria           = require('./sefaria/sefaria');
const { FilterNode }    = require('./sefaria/search');
const SearchTextResult  = require('./SearchTextResult');
const SearchSheetResult = require('./SearchSheetResult');
const SearchFilters     = require('./SearchFilters');
const PropTypes         = require('prop-types');
import Component        from 'react-class';


class SearchResultList extends Component {
    constructor(props) {
        super(props);

        this.initialQuerySize = 100,
        this.backgroundQuerySize = 1000,
        this.maxResultSize = 10000,
        this.resultDisplayStep = 50,
        this.state = {
            types: ["text", "sheet"],
            runningQueries: {"text": null, "sheet": null},
            isQueryRunning: {"text": false, "sheet": false},
            moreToLoad: {"text": true, "sheet": true},
            totals: {"text":0, "sheet":0},
            displayedUntil: {"text":50, "sheet":50},
            hits: {"text": [], "sheet": []},
            activeTab: "text",
            error: false,
            showOverlay: false,
            displayFilters: false,
            displaySort: false
        }
    }
    updateRunningQuery(type, ajax, isLoadingRemainder) {
        this.state.runningQueries[type] = ajax;
        this.state.isQueryRunning[type] = !!ajax && !isLoadingRemainder;
        this.setState({
          runningQueries: this.state.runningQueries,
          isQueryRunning: this.state.isQueryRunning
        });
    }
    _abortRunningQueries() {
        this.state.types.forEach(t => this._abortRunningQuery(t));
    }
    _abortRunningQuery(type) {
        if(this.state.runningQueries[type]) {
            this.state.runningQueries[type].abort();
        }
        this.updateRunningQuery(type, null, false);
    }
    componentDidMount() {
        this._executeQueries();
        $(ReactDOM.findDOMNode(this)).closest(".content").bind("scroll", this.handleScroll);
    }
    componentWillUnmount() {
        this._abortRunningQueries();
        $(ReactDOM.findDOMNode(this)).closest(".content").unbind("scroll", this.handleScroll);
    }
    handleScroll() {
      var tab = this.state.activeTab;
      if (this.state.displayedUntil[tab] >= this.state.totals[tab]) { return; }
      var $scrollable = $(ReactDOM.findDOMNode(this)).closest(".content");
      var margin = 100;
      if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
        this._extendResultsDisplayed();
      }
    }
    _extendResultsDisplayed() {
      var tab = this.state.activeTab;
      this.state.displayedUntil[tab] += this.resultDisplayStep;
      if (this.state.displayedUntil[tab] >= this.state.totals[tab]) {
        this.state.displayedUntil[tab] = this.state.totals[tab];
      }
      this.setState({displayedUntil: this.state.displayedUntil});
    }
    componentWillReceiveProps(newProps) {
        if(this.props.query != newProps.query) {
           this.setState({
             totals: {"text":0, "sheet":0},
             hits: {"text": [], "sheet": []},
             moreToLoad: {"text": true, "sheet": true},
             displayedUntil: {"text":50, "sheet":50},
             displayFilters: false,
             displaySort: false,
             showOverlay: false
           });
           this._executeQueries(newProps)
        }
        else if (!this.props.searchStateText.isEqual({ other: newProps.searchStateText, fields: [ "appliedFilters", "field", "sortType" ] })) {
          this._executeQueries(newProps);
        }
        // Execute a second query to apply filters after an initial query which got available filters
        else if ((this.props.searchStateText.filtersValid != newProps.searchStateText.filtersValid) && this.props.searchStateText.appliedFilters.length > 0) {
          this._executeQueries(newProps);
        }
    }
    _loadRemainder(type, last, total, currentHits) {
    // Having loaded "last" results, and with "total" results to load, load the rest, this.backgroundQuerySize at a time
      if (last >= total || last >= this.maxResultSize) {
        this.updateRunningQuery(type, null, false);
        this.state.moreToLoad[type] = false;
        this.setState({moreToLoad: this.state.moreToLoad});
        return;
      }

      var querySize = this.backgroundQuerySize;
      if (last + querySize > this.maxResultSize) {
        querySize = this.maxResultSize - last;
      }
      const { field, sortType, fieldExact, appliedFilters } = this.props.searchStateText;
      var query_props = {
        query: this.props.query,
        type,
        size: querySize,
        from: last,
        field: type == 'text' ? field : 'content',
        sort_type: type == 'text' ? sortType : null,  // sorting doesn't exist on sheets
        exact: fieldExact === field,
        error: function() {  console.log("Failure in SearchResultList._loadRemainder"); },
        success: function(data) {
          var nextHits = currentHits.concat(data.hits.hits);
          if (type === "text") {
            nextHits = this._process_text_hits(nextHits);
          }

          this.state.hits[type] = nextHits;

          this.setState({hits: this.state.hits});
          this._loadRemainder(type, last + this.backgroundQuerySize, total, nextHits);
        }.bind(this)
      };
      if (type == "text") {
        extend(query_props, {
          get_filters: false,
          appliedFilters
        });
      }

      var runningLoadRemainderQuery = Sefaria.search.execute_query(query_props);
      this.updateRunningQuery(type, runningLoadRemainderQuery, true);
    }
    _executeQueries(props) {
        //This takes a props object, so as to be able to handle being called from componentWillReceiveProps with newProps
        props = props || this.props;
        if (!props.query) {
            return;
        }

        this._abortRunningQueries();

        // If there are no available filters yet, don't apply filters.  Split into two queries:
        // 1) Get all potential filters and counts
        // 2) Apply filters (Triggered from componentWillReceiveProps)
        const { field, sortType, fieldExact, appliedFilters, filtersValid } = props.searchStateText;
        var request_applied = filtersValid && appliedFilters;
        var isCompletionStep = !!request_applied || appliedFilters.length == 0;

        var runningSheetQuery = Sefaria.search.execute_query({
            query: props.query,
            type: "sheet",
            size: this.initialQuerySize,
            field: "content",
            sort_type: null,
            exact: true,
            success: function(data) {
                this.updateRunningQuery("sheet", null, false);
                  this.setState({
                    hits: extend(this.state.hits, {"sheet": data.hits.hits}),
                    totals: extend(this.state.totals, {"sheet": data.hits.total})
                  });
                  Sefaria.track.event("Search", "Query: sheet", props.query, data.hits.total);

                if(isCompletionStep) {
                  this._loadRemainder("sheet", this.initialQuerySize, data.hits.total, data.hits.hits);
                }

            }.bind(this),
            error: this._handle_error
        });

        var runningTextQuery = Sefaria.search.execute_query({
            query: props.query,
            type: "text",
            get_filters: !filtersValid,
            applied_filters: request_applied,
            size: this.initialQuerySize,
            field,
            sort_type: sortType,
            exact: fieldExact === field,
            success: data => {
                this.updateRunningQuery("text", null, false);
                var hitArray = this._process_text_hits(data.hits.hits);
                this.setState({
                  hits: extend(this.state.hits, {"text": hitArray}),
                  totals: extend(this.state.totals, {"text": data.hits.total})
                });
                var filter_label = (request_applied && request_applied.length > 0)? (" - " + request_applied.join("|")) : "";
                var query_label = props.query + filter_label;
                Sefaria.track.event("Search", "Query: text", query_label, data.hits.total);
                if (data.aggregations) {
                  if (data.aggregations.category) {
                    var ftree = this._buildFilterTree(data.aggregations.category.buckets);
                    var orphans = this._applyFilters(ftree, this.props.searchStateText.appliedFilters);
                    this.props.registerAvailableFilters(ftree.availableFilters, ftree.registry, orphans);
                  }
                }
                if(isCompletionStep) {
                  this._loadRemainder("text", this.initialQuerySize, data.hits.total, hitArray);
                }
            },
            error: this._handle_error
        });

        this.updateRunningQuery("text", runningTextQuery, false);
        this.updateRunningQuery("sheet", runningSheetQuery, false);
    }
    _handle_error(jqXHR, textStatus, errorThrown) {
        if (textStatus == "abort") {
            // Abort is immediately followed by new query, above.  Worried there would be a race if we call updateCurrentQuery(null) from here
            //this.updateCurrentQuery(null);
            return;
        }
        this.setState({error: true});
        this.updateRunningQuery(null, null, false);
    }
    _process_text_hits(hits) {
      var newHits = [];
      var newHitsObj = {};  // map ref -> index in newHits
      for (var i = 0; i < hits.length; i++) {
        let currRef = hits[i]._source.ref;
        let newHitsIndex = newHitsObj[currRef];
        if (typeof newHitsIndex != "undefined") {
          newHits[newHitsIndex].duplicates = newHits[newHitsIndex].duplicates || [];
          newHits[newHitsIndex].insertInOrder(hits[i], (a, b) => a._source.version_priority - b._source.version_priority);
        } else {
          newHits.push([hits[i]])
          newHitsObj[currRef] = newHits.length - 1;
        }
      }
      newHits = newHits.map(hit_list => {
        let hit = hit_list[0];
        if (hit_list.length > 1) {
          hit.duplicates = hit_list.slice(1);
        }
        return hit;
      });
      return newHits;
    }
    _buildFilterTree(aggregation_buckets) {
      //returns object w/ keys 'availableFilters', 'registry'
      //Add already applied filters w/ empty doc count?
      var rawTree = {};

      this.props.searchStateText.appliedFilters.forEach(
          fkey => this._addAvailableFilter(rawTree, fkey, {"docCount":0})
      );

      aggregation_buckets.forEach(
          f => this._addAvailableFilter(rawTree, f["key"], {"docCount":f["doc_count"]})
      );
      this._aggregate(rawTree);
      return this._build(rawTree);
    }
    _addAvailableFilter(rawTree, key, data) {
      //key is a '/' separated key list, data is an arbitrary object
      //Based on http://stackoverflow.com/a/11433067/213042
      var keys = key.split("/");
      var base = rawTree;

      // If a value is given, remove the last name and keep it for later:
      var lastName = arguments.length === 3 ? keys.pop() : false;

      // Walk the hierarchy, creating new objects where needed.
      // If the lastName was removed, then the last object is not set yet:
      var i;
      for(i = 0; i < keys.length; i++ ) {
          base = base[ keys[i] ] = base[ keys[i] ] || {};
      }

      // If a value was given, set it to the last name:
      if( lastName ) {
          base = base[ lastName ] = data;
      }

      // Could return the last object in the hierarchy.
      // return base;
    }
    _aggregate(rawTree) {
      //Iterates the raw tree to aggregate doc_counts from the bottom up
      //Nod to http://stackoverflow.com/a/17546800/213042
      walker("", rawTree);
      function walker(key, branch) {
          if (branch !== null && typeof branch === "object") {
              // Recurse into children
              $.each(branch, walker);
              // Do the summation with a hacked object 'reduce'
              if ((!("docCount" in branch)) || (branch["docCount"] === 0)) {
                  branch["docCount"] = Object.keys(branch).reduce(function (previous, key) {
                      if (typeof branch[key] === "object" && "docCount" in branch[key]) {
                          previous += branch[key].docCount;
                      }
                      return previous;
                  }, 0);
              }
          }
      }
    }
    _build(rawTree) {
      //returns dict w/ keys 'availableFilters', 'registry'
      //Aggregate counts, then sort rawTree into filter objects and add Hebrew using Sefaria.toc as reference
      //Nod to http://stackoverflow.com/a/17546800/213042
      var path = [];
      var filters = [];
      var registry = {};

      var commentaryNode = new FilterNode();


      for(var j = 0; j < Sefaria.search_toc.length; j++) {
          var b = walk.call(this, Sefaria.search_toc[j]);
          if (b) filters.push(b);

          // Remove after commentary refactor ?
          // If there is commentary on this node, add it as a sibling
          if (commentaryNode.hasChildren()) {
            var toc_branch = Sefaria.toc[j];
            var cat = toc_branch["category"];
            // Append commentary node to result filters, add a fresh one for the next round
            var docCount = 0;
            if (rawTree.Commentary && rawTree.Commentary[cat]) { docCount += rawTree.Commentary[cat].docCount; }
            if (rawTree.Commentary2 && rawTree.Commentary2[cat]) { docCount += rawTree.Commentary2[cat].docCount; }
            extend(commentaryNode, {
                "title": cat + " Commentary",
                "path": "Commentary/" + cat,
                "heTitle": "מפרשי" + " " + toc_branch["heCategory"],
                "docCount": docCount
            });
            registry[commentaryNode.path] = commentaryNode;
            filters.push(commentaryNode);
            commentaryNode = new FilterNode();
          }
      }

      return { availableFilters: filters, registry };

      function walk(branch, parentNode) {
          var node = new FilterNode();

          node["docCount"] = 0;

          if("category" in branch) { // Category node

            path.push(branch["category"]);  // Place this category at the *end* of the path
            extend(node, {
              "title": path.slice(-1)[0],
              "path": path.join("/"),
              "heTitle": branch["heCategory"]
            });

            for(var j = 0; j < branch["contents"].length; j++) {
                var b = walk.call(this, branch["contents"][j], node);
                if (b) node.append(b);
            }
          }
          else if ("title" in branch) { // Text Node
              path.push(branch["title"]);
              extend(node, {
                 "title": path.slice(-1)[0],
                 "path": path.join("/"),
                 "heTitle": branch["heTitle"]
              });
          }

          try {
              var rawNode = rawTree;
              var i;

              for (i = 0; i < path.length; i++) {
                //For TOC nodes that we don't have results for, we catch the exception below.
                rawNode = rawNode[path[i]];
              }
              node["docCount"] += rawNode.docCount;


              // Do we need both of these in the registry?
              registry[node.getId()] = node;
              registry[node.path] = node;

              path.pop();
              return node;
          }
          catch (e) {
            path.pop();
            return false;
          }
      }
    }
    _applyFilters(ftree, appliedFilters) {
      var orphans = [];  // todo: confirm behavior
      appliedFilters.forEach(path => {
        var node = ftree.registry[path];
        if (node) { node.setSelected(true); }
        else { orphans.push(path); }
      });
      return orphans;
    }
    showSheets() {
      this.setState({"activeTab": "sheet"});
    }
    showTexts() {
      this.setState({"activeTab": "text"});
    }
    showResultsOverlay(shouldShow) {
      //overlay gives opacity to results when either filter box or sort box is open
      this.setState({showOverlay: shouldShow});
    }
    toggleFilterView() {
      this.showResultsOverlay(!this.state.displayFilters);
      this.setState({displayFilters: !this.state.displayFilters, displaySort: false});
    }
    toggleSortView() {
      this.showResultsOverlay(!this.state.displaySort);
      this.setState({displaySort: !this.state.displaySort, displayFilters: false});
    }
    closeFilterView() {
      this.showResultsOverlay(false);
      this.setState({displayFilters: false});
    }
    closeSortView() {
      this.showResultsOverlay(false);
      this.setState({displaySort: false});
    }
    render () {
        if (!(this.props.query)) {  // Push this up? Thought is to choose on the SearchPage level whether to show a ResultList or an EmptySearchMessage.
            return null;
        }

        var tab = this.state.activeTab;
        var results = [];

        if (tab == "text") {
          results = this.state.hits.text.slice(0,this.state.displayedUntil["text"]).filter(result => !!result._source.version).map(result =>
            <SearchTextResult
                data={result}
                query={this.props.query}
                key={result._id}
                onResultClick={this.props.onResultClick} />);

        } else if (tab == "sheet") {
          results = this.state.hits.sheet.slice(0, this.state.displayedUntil["sheet"]).map(result =>
              <SearchSheetResult
                    data={result}
                    query={this.props.query}
                    key={result._id} />);
        }

        var loadingMessage   = (<LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />);
        var noResultsMessage = (<LoadingMessage message="0 results." heMessage="0 תוצאות." />);

        var queryFullyLoaded      = !this.state.moreToLoad[tab] && !this.state.isQueryRunning[tab];
        var haveResults      = !!results.length;
        results              = haveResults ? results : noResultsMessage;
        var searchFilters    = (<SearchFilters
                                  query = {this.props.query}
                                  searchStateText={this.props.searchStateText}
                                  total = {this.state.totals["text"] + this.state.totals["sheet"]}
                                  textTotal = {this.state.totals["text"]}
                                  sheetTotal = {this.state.totals["sheet"]}
                                  updateAppliedFilter = {this.props.updateAppliedFilter}
                                  updateAppliedOptionField = {this.props.updateAppliedOptionField}
                                  updateAppliedOptionSort = {this.props.updateAppliedOptionSort}
                                  isQueryRunning = {this.state.isQueryRunning[tab]}
                                  activeTab = {this.state.activeTab}
                                  clickTextButton = {this.showTexts}
                                  clickSheetButton = {this.showSheets}
                                  showResultsOverlay = {this.showResultsOverlay}
                                  displayFilters={this.state.displayFilters}
                                  displaySort={this.state.displaySort}
                                  toggleFilterView={this.toggleFilterView}
                                  toggleSortView={this.toggleSortView}
                                  closeFilterView={this.closeFilterView}
                                  closeSortView={this.closeSortView}/>);
        return (
          <div>
            { searchFilters }
            <div className={this.state.showOverlay ? "searchResultsOverlay" : ""}>
              { queryFullyLoaded || haveResults ? results : loadingMessage }
            </div>
          </div>
        );
    }
}
SearchResultList.propTypes = {
  query:                PropTypes.string,
  searchStateText:      PropTypes.object,
  onResultClick:        PropTypes.func,
  updateAppliedFilter:  PropTypes.func,
  updateAppliedOptionField: PropTypes.func,
  updateAppliedOptionSort:  PropTypes.func,
  registerAvailableFilters: PropTypes.func
};


module.exports = SearchResultList;
