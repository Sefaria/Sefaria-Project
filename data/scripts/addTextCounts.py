import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from sefaria.counts import *

indices = sefaria.db.index.find()

for index in indices:
	if index["categories"][0] == "Commentary":
		continue

	c = { "title": index["title"] }

	if index["categories"][0] in ("Tanach", "Mishna", "Talmud"):

		# For these texts, consider what is present in the db across 
		# English and Hebrew to represent actual total counts
		counts = count_texts(index["title"])
		if "error" in counts:
			print counts["error"]
			continue
		index["lengths"] = counts["lengths"]
		c["sectionCounts"] = zero_jagged_array(counts["counts"])
	else:
		if "length" in index:
			index["lengths"] = [index["length"]]

	sefaria.db.index.save(index)

	en = count_texts(index["title"], lang="en")
	he = count_texts(index["title"], lang="he")

	if "sectionCounts" in c:
		totals = c["sectionCounts"]
	else:
		totals = zero_jagged_array(sum_count_arrays(en["counts"], he["counts"]))

	enCount = sum_count_arrays(en["counts"], totals)
	heCount = sum_count_arrays(he["counts"], totals) 

	c["availableTexts"] = {
		"en": enCount,
		"he": heCount
	}

	c["availableCounts"] = {
		"en": en["lengths"],
		"he": he["lengths"]
	}

	sefaria.db.counts.save(c)