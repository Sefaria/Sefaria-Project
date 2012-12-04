// Generate scores for top text sections (Chapters, Dafs etc) by nuber of connections.

var db = connect("localhost:27017/sefaria")

var mapper = function () {
  
  var countText = function(ref) {
    var key = ref.substr(0, ref.lastIndexOf(":"))
    var value = {
                ref: ref,
                count: 1
               };
    emit( key, value );
  }

  countText(this.refs[0]);
  countText(this.refs[1]);
};

var reducer = function(key, values) {
    
    var reducedText = {
                        ref: key,
                        count:0
                    };

    values.forEach( function(value) {
                          reducedText.count += value.count;
                    });

    return reducedText;
};

db.links.mapReduce(mapper, reducer, {out: "texts_by_connections"});


var mapper = function () {
  
  var countLink = function(base, ref) {
    var key = base.indexOf(":") > 0 ? base.substr(0, base.lastIndexOf(":")) : base;
    var link = ref.indexOf(" ") > 0 ? ref.substr(0, ref.lastIndexOf(" ")) : ref;
    var value = {
                link: link,
                count: 1
               };
    emit( key, value );
  }

  countLink(this.refs[0], this.refs[1]);
  countLink(this.refs[1], this.refs[0]);
};

var reducer = function(key, values) {
    
    links = {};
    var reducedText = {
                        ref: key,
                        count: 0
                    };

    values.forEach( function(value) {
                          if (!(value.link in links)) {
                            links[value.link] = 1;
                            reducedText.count += value.count;
                          } else {
                            links[value.link] += 1;
                          }
                    });

    return reducedText;
};

db.links.mapReduce(mapper, reducer, {out: "texts_by_distinct_connections"});