cur = db.commentary.find({"commentator": "Rashi"});
	
counts = {};

cur.forEach(function( c ) {
	ref = c["ref"] + "." + c["refVerse"];
	if (ref in counts)
		counts[ref] += 1;
	else
		counts[ref] = 1;
		
	db.commmentary.update(c, {$set: {order: counts[ref]}});
	print("saved " + counts[ref] + " for " + c)

})

