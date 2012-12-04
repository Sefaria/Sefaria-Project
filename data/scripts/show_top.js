var db = connect("localhost:27017/sefaria")

print("***** Top Texts by Connections *****");

var textsCur = db.texts_by_connections.find();
texts = [];

while (textsCur.hasNext()) {
    text = textsCur.next();
    texts.push({"ref": text._id, "count": text.value.count});
}

texts.sort(function(a,b) { return b.count - a.count;});

texts.forEach(function(t) {
    if (t.count > 20) {
        print(t.ref + ": " + t.count);
    }
})

print("***** Top Texts by Distinct Connections *****");

var textsCur = db.texts_by_distinct_connections.find();
texts = [];

while (textsCur.hasNext()) {
    text = textsCur.next();
    texts.push({"ref": text._id, "count": text.value.count});
}

texts.sort(function(a,b) { return b.count - a.count;});

texts.forEach(function(t) {
    if (t.count > 2) {
        print(t.ref + ": " + t.count);
    }
})