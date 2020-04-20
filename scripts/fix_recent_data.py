from sefaria.system.database import db
"""
    let packed = [
      item.ref,
      item.heRef,
      item.lastVisited,
      item.bookVisitCount,
      item.currVersions.en,
      item.currVersions.he
    ];
"""

profiles = db.profiles.find({"recentlyViewed": {"$exists": 1}, "$where": "this.recentlyViewed.length > 0" })

for profile in profiles:
	recentlyViewed = profile["recentlyViewed"]
	for i, recentItem in enumerate(recentlyViewed):
		ref            = recentItem[0]
		heRef          = recentItem[1]
		lastVisited    = None
		bookVisitCount = None
		for field in recentItem[2:]:
			if isinstance(field, str) and field.startswith("2017"):
				lastVisited = field
				print("#%d: Found a timestamp: %s" % (profile["id"], lastVisited))
			elif isinstance(field, int):
				bookVisitCount = field
				print("#%d: Found a count: %d" % (profile["id"], bookVisitCount))
		profile["recentlyViewed"][i] = [ref, heRef, lastVisited, bookVisitCount, None, None]
	db.profiles.save(profile)

