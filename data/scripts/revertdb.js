var db = connect("sefaria_dev");
db.dropDatabase();
db.copyDatabase("sefaria", "sefaria_dev");
