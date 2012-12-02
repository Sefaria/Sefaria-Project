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


var textsCur = db.texts_by_connections.find({value: {count: {$gt: 20}}});
texts = [];
while (textsCur.hasNext()) {
    text = textsCur.next();
    texts.push({"ref": text.value.ref, "count": text.value.count});
}

texts.sort(function(a,b) { return b.count - a.count;});

texts.forEach(function(t) {
    print(t.ref + ": " + t.count);
})