const $ = require('./sefariaJquery');

class Search {
    constructor(searchBaseUrl, searchIndexText, searchIndexSheet) {
      this.searchIndexText = searchIndexText;
      this.searchIndexSheet = searchIndexSheet;
      this.baseUrl = searchBaseUrl;
      this._cache = {}
    }
    cache(key, result) {
        if (result !== undefined) {
           this._cache[key] = result;
        }
        return this._cache[key];
    }
    execute_query(args) {
        // To replace sjs.search.post in search.js

        /* args can contain
         query: query string
         size: size of result set
         from: from what result to start
         type: "sheet" or "text"
         get_filters: if to fetch initial filters
         applied_filters: filter query by these filters
         field: field to query in elastic_search
         sort_type: chonological or relevance
         exact: if query is exact
         success: callback on success
         error: callback on error
         */
        if (!args.query) {
            return;
        }
        var req = JSON.stringify(this.get_query_object(args.query, args.get_filters, args.applied_filters, args.size, args.from, args.type, args.field, args.sort_type, args.exact));
        var cache_result = this.cache(req);
        if (cache_result) {
            args.success(cache_result);
            return null;
        }
        const url = `${this.baseUrl}/${args.type == 'text' ? this.searchIndexText : this.searchIndexSheet}/_search`;
        console.log("SERACH URL", url);
        return $.ajax({
            url,
            type: 'POST',
            data: req,
            contentType: "application/json; charset=utf-8",
            crossDomain: true,
            processData: false,
            dataType: 'json',
            success: function(data) {
                this.cache(req, data);
                args.success(data);
            }.bind(this),
            error: args.error
        });
    }
    get_query_object(query, get_filters, applied_filters, size, from, type, field, sort_type, exact) {
        /*
         Only the first argument - "query" - is required.

         query: string
         get_filters: boolean
         applied_filters: null or list of applied filters (in format supplied by Filter_Tree...)
         size: int - number of results to request
         from: int - start from result # (skip from - 1 results)
         type: string - currently either "text" or "sheet"
         field: string - which field to query. this essentially changes the exactness of the search. right now, 'exact' or 'naive_lemmatizer'
         sort_type: "relevance", "chronological"
         exact: boolean. true if query should be exact
         */


        var core_query = {
            "match_phrase": {

            }
        };

        core_query['match_phrase'][field] = {
            "query": query.replace(/(\S)"(\S)/g, '$1\u05f4$2'), //Replace internal quotes with gershaim.
        };

        if (!exact) {
            core_query['match_phrase'][field]['slop'] = 10;
        }

        var o = {
            "from": from,
            "size": size,
            /*"_source": {
              "exclude": [ field ]
            },*/
            "highlight": {
                "pre_tags": ["<b>"],
                "post_tags": ["</b>"],
                "fields": {}
            }
        };

        o["highlight"]["fields"][field] = {"fragment_size": 200};


        if (sort_type == "chronological") {
            o["sort"] = [
                {"comp_date": {}},
                {"order": {}}                 // the sort field name is "order"
            ];
        } else if (sort_type == "relevance") {

            o["query"] = {
                "function_score": {
                    "field_value_factor": {
                        "field": "pagesheetrank",
                        "missing": 0.04     // this default value comes from the equation used to calculate pagesheetrank. see search.py where this field is created
                    }
                }
            }
        }

        var inner_query = {};
        if (get_filters) {
            //Initial, unfiltered query.  Get potential filters.
            inner_query = core_query;
            o['aggs'] = {
                "category": {
                    "terms": {
                        "field": "path",
                        "size": 10000,
                    }
                }
            };
        } else if (!applied_filters || applied_filters.length == 0) {
            // This is identical to above - can be cleaned up into a variable
            inner_query = core_query;
        } else {
            //Filtered query.  Add clauses.  Don't re-request potential filters.
            var clauses = [];
            for (var i = 0; i < applied_filters.length; i++) {

                var filterSuffix = applied_filters[i].indexOf("/") != -1 ? ".*" : "/.*"; //filters with '/' might be leading to books. also, very unlikely they'll match an false positives
                clauses.push({
                    "regexp": {
                        "path": RegExp.escape(applied_filters[i]) + filterSuffix
                    }
                });
                /* Test for Commentary2 as well as Commentary */
            }
            inner_query = {
                "bool": {
                    "must": core_query,
                    "filter": {
                      "bool": {
                        "should": clauses
                      }
                    }
                }
            };
        }

        //after that confusing logic, hopefully inner_query is defined properly
        if (sort_type == "chronological" || !sort_type) {
            o['query'] = inner_query;
        } else if (sort_type == "relevance") {
            o['query']['function_score']['query'] = inner_query;
        }

        console.log(JSON.stringify(o));
        return o;
    }
}

class FilterNode {
  //FilterTree object - for category filters
  constructor() {
      this.children = [];
      this.parent = null;
      this.selected = 0; //0 - not selected, 1 - selected, 2 - partially selected
  }
  append(child) {
      this.children.push(child);
      child.parent = this;
  }
  hasChildren() {
      return (this.children.length > 0);
  }
  getLeafNodes() {
      //Return ordered array of leaf (book) level filters
      if (!this.hasChildren()) {
          return this;
      }
      var results = [];
      for (var i = 0; i < this.children.length; i++) {
          results = results.concat(this.children[i].getLeafNodes());
      }
      return results;
  }
  getId() {
      return this.path.replace(new RegExp("[/',()]", 'g'),"-").replace(new RegExp(" ", 'g'),"_");
  }
  isSelected() {
      return (this.selected == 1);
  }
  isPartial() {
      return (this.selected == 2);
  }
  isUnselected() {
      return (this.selected == 0);
  }
  setSelected(propogateParent, noPropogateChild) {
      //default is to propogate children and not parents.
      //Calls from front end should use (true, false), or just (true)
      this.selected = 1;
      if (!(noPropogateChild)) {
          for (var i = 0; i < this.children.length; i++) {
              this.children[i].setSelected(false);
          }
      }
      if(propogateParent) {
          if(this.parent) this.parent._deriveState();
      }
  }
  setUnselected(propogateParent, noPropogateChild) {
      //default is to propogate children and not parents.
      //Calls from front end should use (true, false), or just (true)
      this.selected = 0;
      if (!(noPropogateChild)) {
          for (var i = 0; i < this.children.length; i++) {
              this.children[i].setUnselected(false);
          }
      }
      if(propogateParent) {
          if(this.parent) this.parent._deriveState();
      }

  }
  setPartial() {
      //Never propogate to children.  Always propogate to parents
      this.selected = 2;
      if(this.parent) this.parent._deriveState();
  }
  _deriveState() {
      //Always called from children, so we can assume at least one
      var potentialState = this.children[0].selected;
      if (potentialState == 2) {
          this.setPartial();
          return
      }
      for (var i = 1; i < this.children.length; i++) {
          if (this.children[i].selected != potentialState) {
              this.setPartial();
              return
          }
      }
      //Don't use setters, so as to avoid looping back through children.
      if(potentialState == 1) {
          this.setSelected(true, true);
      } else {
          this.setUnselected(true, true);
      }
  }
  hasAppliedFilters() {
      return (this.getAppliedFilters().length > 0)
  }
  getAppliedFilters() {
      if (this.isUnselected()) {
          return [];
      }
      if (this.isSelected()) {
          return[this.path];
      }
      var results = [];
      for (var i = 0; i < this.children.length; i++) {
          results = results.concat(this.children[i].getAppliedFilters());
      }
      return results;
  }
  getSelectedTitles(lang) {
      if (this.isUnselected()) {
          return [];
      }
      if (this.isSelected()) {
          return[(lang == "en")?this.title:this.heTitle];
      }
      var results = [];
      for (var i = 0; i < this.children.length; i++) {
          results = results.concat(this.children[i].getSelectedTitles(lang));
      }
      return results;
  }
  clone() {
    const cloned = new FilterNode();
    cloned.selected = this.selected;
    cloned.path = this.path;
    cloned.title = this.title;
    cloned.heTitle = this.heTitle;
    cloned.docCount = this.docCount;
    cloned.children = this.children.map( c => {
      cloned_child = c.clone();
      cloned_child.parent = cloned;
      return cloned_child;
    });
    return cloned;
  }
}

module.exports.Search = Search;
module.exports.FilterNode = FilterNode;
