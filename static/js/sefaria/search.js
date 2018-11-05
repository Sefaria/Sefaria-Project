const $ = require('./sefariaJquery');
const extend            = require('extend');
const SearchState = require('./searchState');

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
         appliedFilterAggTypes: array of same len as applied_filters giving aggType for each filter
         field: field to query in elastic_search
         sort_type: See SearchState.metadataByType for possible sort types
         exact: if query is exact
         success: callback on success
         error: callback on error
         */
        if (!args.query) {
            return;
        }
        var req = JSON.stringify(this.get_query_object(args));
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
    get_aggregation_object(aggregation_field_array) {
      return aggregation_field_array.reduce((obj, a) =>
        {
          obj[a] = {
            terms: {
              field: a,
              size: 10000
            }
          };
          return obj;
        }, {}
      );
    }
    get_query_object({
      query,
      get_filters,
      applied_filters,
      appliedFilterAggTypes,
      lastAppliedAggType,
      size,
      from,
      type,
      field,
      sort_type,
      exact
    }) {
        /*
         Only the first argument - "query" - is required.

         query: string
         get_filters: boolean
         applied_filters: null or list of applied filters (in format supplied by Filter_Tree...)
         appliedFilterAggTypes: array of same len as applied_filters giving aggType for each filter
         lastAppliedAggType: the last filter's aggType to be applied. this helps determine which filters to query in the case where there are multiple aggTypes
         size: int - number of results to request
         from: int - start from result # (skip from - 1 results)
         type: string - currently either "text" or "sheet"
         field: string - which field to query. this essentially changes the exactness of the search. right now, 'exact' or 'naive_lemmatizer'
         sort_type: See SearchState.metadataByType for possible sort types
         exact: boolean. true if query should be exact
         */


        const core_query = { match_phrase: {} };
        core_query['match_phrase'][field] = {
            "query": query.replace(/(\S)"(\S)/g, '$1\u05f4$2'), //Replace internal quotes with gershaim.
        };

        if (!exact) {
            core_query['match_phrase'][field]['slop'] = 10;
        }

        var o = {
            from,
            size,
            highlight: {
                pre_tags: ['<b>'],
                post_tags: ['</b>'],
                fields: {}
            }
        };

        o["highlight"]["fields"][field] = {fragment_size: 200};

        // deal with sort_type
        const { sortTypeArray, aggregation_field_array, make_filter_query } = SearchState.metadataByType[type];
        const { sort_method, fieldArray, field: sort_field, score_missing, direction: sort_direction } = sortTypeArray.find( x => x.type === sort_type );
        if (sort_method == "sort") {
            o["sort"] = fieldArray.map( x => ({ [x]: { order: sort_direction } }) );  // wrap your head around that es6 nonsense
        } else if (sort_method == 'score' && !!sort_field) {

            o["query"] = {
                function_score: {
                    field_value_factor: {
                        field: sort_field,
                        missing: score_missing,
                    }
                }
            }
        }

        let inner_query;
        if (get_filters || aggregation_field_array.length > 1) {
          //Initial, unfiltered query.  Get potential filters.
          //OR
          //any filtered query where there are more than 1 agg type means you need to re-fetch filters on each filter you add
          console.log('requesting these filters!!!', aggregation_field_array.filter( a => a !== lastAppliedAggType));
          o['aggs'] = this.get_aggregation_object(aggregation_field_array.filter( a => a !== lastAppliedAggType));
        }
        if (get_filters) {
            inner_query = core_query;
        } else if (!applied_filters || applied_filters.length == 0) {
            inner_query = core_query;
        } else {
            //Filtered query.  Add clauses.
            // AND query (aka must) b/w diff aggTypes
            // OR query (aka should) b/w aggTypes of same type
            const uniqueAggTypes = [...(new Set(appliedFilterAggTypes))];
            inner_query = {
                bool: {
                    must: core_query,
                    filter: {
                      bool: {
                        must: uniqueAggTypes.map( a => ({
                          bool: {
                            should: Sefaria.util.zip(applied_filters, appliedFilterAggTypes).filter( x => x[1] === a).map( x => this[make_filter_query](x[0], x[1]))
                          }
                        }))
                      }
                    }
                }
            };
        }
        if (!inner_query) {

        }

        //after that confusing logic, hopefully inner_query is defined properly
        if (sort_method == 'sort' || !sort_method) {
            o['query'] = inner_query;
        } else if (sort_method == 'score' && !!sort_field) {
            o['query']['function_score']['query'] = inner_query;
        } else if (sort_method == 'score' && !sort_field) {
            o['query'] = inner_query;
        }

        console.log(JSON.stringify(o));
        return o;
    }

    process_text_hits(hits) {
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
    buildFilterTree(aggregation_buckets, appliedFilters) {
      //returns object w/ keys 'availableFilters', 'registry'
      //Add already applied filters w/ empty doc count?
      var rawTree = {};

      appliedFilters.forEach(
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
                "aggKey": "Commentary/" + cat,
                "heTitle": "מפרשי" + " " + toc_branch["heCategory"],
                "docCount": docCount
            });
            registry[commentaryNode.aggKey] = commentaryNode;
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
              "aggKey": path.join("/"),
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
                 "aggKey": path.join("/"),
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
              registry[node.aggKey] = node;

              path.pop();
              return node;
          }
          catch (e) {
            path.pop();
            return false;
          }
      }
    }

    applyFilters(registry, appliedFilters) {
      var orphans = [];  // todo: confirm behavior
      appliedFilters.forEach(aggKey => {
        var node = registry[aggKey];
        if (node) { node.setSelected(true); }
        else { orphans.push(aggKey); }
      });
      return orphans;
    }

    getAppliedSearchFilters(availableFilters) {
      let appliedFilters = [];
      let appliedFilterAggTypes = [];
      //results = results.concat(this.orphanFilters);
      for (let tempFilter of availableFilters) {
          const tempApplied = tempFilter.getAppliedFilters();
          const tempAppliedTypes = tempApplied.map( x => tempFilter.aggType );  // assume all child filters have the same type as their parent
          appliedFilters = appliedFilters.concat(tempApplied);
          appliedFilterAggTypes = appliedFilterAggTypes.concat(tempAppliedTypes);
      }
      return {
        appliedFilters,
        appliedFilterAggTypes,
      };
    }

    buildAndApplyTextFilters(aggregation_buckets, appliedFilters, appliedFilterAggTypes, aggType) {
      const { availableFilters, registry } = this.buildFilterTree(aggregation_buckets, appliedFilters);
      const orphans = this.applyFilters(registry, appliedFilters);
      return { availableFilters, registry, orphans };
    }

    buildAndApplySheetFilters(aggregation_buckets, appliedFilters, appliedFilterAggTypes, aggType) {
      const availableFilters = aggregation_buckets.map( b => {
        const isHeb = Sefaria.hebrew.isHebrew(b.key);
        const enTitle = isHeb ? '' : b.key;
        const heTitle = isHeb ? b.key : (aggType === 'group' || !Sefaria.terms[b.key] ? '' : Sefaria.terms[b.key].he);
        const aggKey = enTitle || heTitle;
        const filterInd = appliedFilters.indexOf(aggKey);
        const isSelected = filterInd !== -1 && appliedFilterAggTypes[filterInd] === aggType;
        return new FilterNode(enTitle, heTitle, b.doc_count, aggKey, aggType, isSelected ? 1 : 0);
      });
      return { availableFilters, registry: {}, orphans: [] };
    }

    makeTextFilterQuery(aggKey, aggType) {
      // only one aggType for text queries so ignoring aggType param
      return {
        regexp: {
          path: RegExp.escape(aggKey) + (aggKey.indexOf("/") != -1 ? ".*" : "/.*")  //filters with '/' might be leading to books. also, very unlikely they'll match an false positives
        }
      };
    }

    makeSheetFilterQuery(aggKey, aggType) {
      return {
        term: {
          [aggType]: aggKey
        }
      };
    }
}

class FilterNode {
  //FilterTree object - for category filters
  constructor(title, heTitle, docCount, aggKey, aggType, selected) {
      this.title = title;
      this.heTitle = heTitle;
      this.docCount = docCount;
      this.aggKey = aggKey;
      this.aggType = aggType;
      this.children = [];
      this.parent = null;
      this.selected = (typeof selected === 'undefined') ? 0 : selected; //0 - not selected, 1 - selected, 2 - partially selected
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
      return this.aggKey.replace(new RegExp("[/',()]", 'g'),"-").replace(new RegExp(" ", 'g'),"_");
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
          return [this.aggKey];
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
          let enTitle = !!this.title ? this.title : this.heTitle;
          let heTitle = !!this.heTitle ? this.heTitle : this.title;
          if (!enTitle) {
            if (this.aggType === 'group') { enTitle = '(No Group)'; }
            if (this.aggType === 'tags') { enTitle = '(No Tag)'; }
          }
          if (!heTitle) {
            if (this.aggType === 'group') { heTitle = '(ללא קבוצה)'; }
            if (this.aggType === 'tags') { heTitle = '(ללא תוית)'; }
          }
          return[(lang == "en")?enTitle:heTitle];
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
    cloned.aggKey = this.aggKey;
    cloned.title = this.title;
    cloned.heTitle = this.heTitle;
    cloned.docCount = this.docCount;
    cloned.children = this.children.map( c => {
      const cloned_child = c.clone();
      cloned_child.parent = cloned;
      return cloned_child;
    });
    return cloned;
  }
}

module.exports.Search = Search;
module.exports.FilterNode = FilterNode;

/*TODO
backend
url params
display selected filters in header
make selected filters div constant height (at least dont have it bounce so much)
*/
