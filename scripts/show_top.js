var db = connect("localhost:27017/sefaria")

// These values may be set form the command line (using --eval)
// to authenticate. 
if (!(typeof user === 'undefined'|| typeof password === 'undefined')) {
  db.auth(user, password);
}


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


var activity = function(days) {
    var textsCur = db["texts_by_activity_" + days].find();
    texts = [];

    while (textsCur.hasNext()) {
        text = textsCur.next();
        texts.push({"ref": text._id, "count": text.value});
    }

    texts.sort(function(a,b) { return b.count - a.count;});

    texts.forEach(function(t) {
        if (t.count > 3) {
            print(t.ref + ": " + t.count);
        }
    });
};
print("***** Top Texts by Activity (7 Days) *****");
activity(7);
print("***** Top Texts by Activity (30 Days) *****");
activity(30);
