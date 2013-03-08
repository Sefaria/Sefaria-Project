var db = connect("localhost:27017/sefaria");
var text, i;

// These values may be set form the command line (using --eval)
// to authenticate. 
if (!(typeof user === 'undefined'|| typeof password === 'undefined')) {
  db.auth(user, password);
}

order = [
	"Bereishit Rabbah",
	"Shemot Rabbah",
	"Vayikra Rabbah",
	"Bemidbar Rabbah",
	"Devarim Rabbah",
	"Shir HaShirim Rabbah",
	"Rut Rabba",
	"Ester Rabbah",
	"Kohelet Rabbah",
	"Midrash Tanchuma",
	"Ein Yaakov"
];

for (i = 0; i < order.length; i++) {
	print(order[i]);
	text = db.index.findOne({title: order[i]});
	if (text) {
		text["order"] = [i+1];
		db.index.save(text);		
	}
}