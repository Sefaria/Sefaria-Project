//  Utilities used both by search.html/search.js and the new React s2_search.html/s2-search.jsx
//  Intention is for search.js to be retired, and for this file to be the center of back end search logic
//  When used in combination with search.js, this should be loaded first.

sjs = sjs || {};
sjs.search = sjs.search || {};

$.extend(sjs.search, {
    active_post: false,  // Can this mechanism be replaced by the React level queryInProcess mechanism? How would an abort work?
    searchUrl: sjs.searchBaseUrl + "/" + sjs.searchIndex + "/_search",

    execute_query: function (args) {
        // To replace sjs.search.post in search.js

        /* args can contain
            query: query string
            size: size of result set
            from: from what result to start
            get_filters: if to fetch initial filters
            applied_filters: fiter query by these filters
            success: callback on success
            error: callback on error
         */
        if (!args.query) {
            return;
        }
        if (sjs.search.active_post) {
            sjs.search.active_post.abort(); //Kill any earlier query
        }

        var url = sjs.search.searchUrl;
        url += "?size=" + args.size;
        if (args.from) {
            url += "&from=" + args.from;
        }

        wrapped_success = function(data) {
            success(data);
            sjs.search.active_post = false;
        };
        wrapped_error = function(j, s, e) {
            error(j, s, e);
            sjs.search.active_post = false;
        };
        sjs.search.active_post = $.ajax({
            url: url,
            type: 'POST',
            data: JSON.stringify(sjs.search.get_query_object(args.query, args.get_filters, args.applied_filters)),
            crossDomain: true,
            processData: false,
            dataType: 'json',
            success: wrapped_success,
            error: wrapped_error
        });
    },

    get_query_object: function (query, get_filters, applied_filters) {
        // query: string
        // get_filters: boolean
        // applied_filters: null or list of applied filters (in format supplied by Filter_Tree...)
        var core_query = {
            "query_string": {
                "query": query.replace(/(\S)"(\S)/g, '$1\u05f4$2'), //Replace internal quotes with gershaim.
                "default_operator": "AND",
                "fields": ["content"]
            }
        };

        var o = {
            "sort": [{
                "order": {}                 // the sort field name is "order"
            }],
            "highlight": {
                "pre_tags": ["<b>"],
                "post_tags": ["</b>"],
                "fields": {
                    "content": {"fragment_size": 200}
                }
            }
        };

        if (get_filters) {
            //Initial, unfiltered query.  Get potential filters.
            o['query'] = core_query;
            o['aggs'] = {
                "category": {
                    "terms": {
                        "field": "path",
                        "size": 0
                    }
                }
            };
        } else if (!applied_filters) {
            o['query'] = core_query;
        } else {
            //Filtered query.  Add clauses.  Don't re-request potential filters.
            var clauses = [];
            for (var i = 0; i < applied_filters.length; i++) {
                clauses.push({
                    "regexp": {
                        "path": RegExp.escape(applied_filters[i]) + ".*"
                    }
                })
            }
            o['query'] = {
                "filtered": {
                    "query": core_query,
                    "filter": {
                        "or": clauses
                    }
                }
            };
        }
        return o;
    }
});
