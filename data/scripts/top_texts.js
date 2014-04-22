// Generate scores for top text sections (Chapters, Dafs etc).

var db = connect("localhost:27017/sefaria")

// These values may be set form the command line (using --eval)
// to authenticate. 
if (!(typeof user === 'undefined'|| typeof password === 'undefined')) {
  db.auth(user, password);
}

now = new Date();
print("Calculating top texts at " + now);


// ----------- Count Top Chapters by # of Connections ------------

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


// ----------- Count Top Chapters by # of Disctinct Connections ------------
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


// ------------- Count Top Chapters by # Connections X # Distinct Connections -----------

var texts = db.texts_by_connections.find();
texts.forEach(function(t) {
  dt = db.texts_by_distinct_connections.findOne({_id: t._id});
  if (dt) {
    count = {
      _id: t._id,
      count: t.value.count * dt.value.count
    }
    db.texts_by_multiplied_connections.save(count);    
  }
});



// ----------- Count Top Chapters by Activity ---------------
var mapper = function () {
  
  var count = function(ref, points) {
    if (!ref) { return; }
    var key = ref.indexOf(":") > 0 ? ref.substr(0, ref.lastIndexOf(":")) : ref;
    emit( key, points );
  };

  if (this.rev_type == "add link") {
    count(this.new.refs[0], 1);
    count(this.new.refs[1], 1);
  } else if (this.rev_type == "add text") {
    var p = this.language == "en" ? this.versionTitle === "Sefaria Community Translation" ? 8 : 2 : 1;
    count(this.ref, p);
  } else if (this.rev_type == "edit text") {
    count(this.ref, 1);
  }
};

var reducer = function(key, values) {
    var points = 0;
    values.forEach(function(value) {
      points += value;
    });
    return points;
};

var countActivity = function(days) {
  var date  = new Date();
  date.setDate(date.getDate() - days );
  db.history.mapReduce(mapper, reducer, {out: "texts_by_activity_" + days,
                                         query: {date: {$gt: date}}});
};

countActivity(7);
countActivity(14);
countActivity(30);

