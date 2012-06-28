import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from sefaria.counts import *

indices = db.index.find()

for index in indices:
	if index["categories"][0] == "Commentary":
		continue

	if index["categories"][0] in ("Tanach", "Mishna", "Talmud"):
		counts = count_texts(index["title"])
		if "error" in counts:
			print counts["error"]
			continue
		index["lengths"] = counts["lengths"]
		index["sectionCounts"] = zero_jagged_array(counts["counts"])
	else:
		if "length" in index:
			index["lengths"] = [index["length"]]


	en = count_texts(index["title"], lang="en")
	he = count_texts(index["title"], lang="he")

	if "sectionCounts" in index:
		totals = index["sectionCounts"]
	else:
		totals = zero_jagged_array(sum_count_arrays(en["counts"], he["counts"]))

	enCount = sum_count_arrays(en["counts"], totals)
	heCount = sum_count_arrays(he["counts"], totals) 

	index["availableTexts"] = {
		"en": enCount,
		"he": heCount
	}

	index["availableCounts"] = {
		"en": en["lengths"],
		"he": he["lengths"]
	}

	db.index.save(index)