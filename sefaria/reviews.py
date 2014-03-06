import sys
import os
from pprint import pprint
from datetime import datetime, date, timedelta

from settings import *
from util import *
import texts

# To allow these files to be run from command line
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

def save_review(review, uid):
	valitdate = validate(review)
	if "error" in validate:
		return validate

	review = {
		"user":     uid,
		"date":     datetime.now(),
		"rev_type": "review",
		"score":    review["score"],
		"comment":  review["commment"],
		"ref":      review["ref"],
		"language": review["lang"],
		"version":  review["version"],
	}
	
	texts.db.history.save(review)
	
	review["_id"] = str(review["_id"])
	return review


def validate_review(reivew):
	
	for field in ("score", "comment", "ref", "lang", "version"):
		if field not in review:
			return {"error": "Required field '%s' is missing from this review." % field}

	try:
		score = float(review["score"])
		if score > 1 or score < 0:
			return {"error": "'score' must be a number between 0 and 1."}
	except TypeError:
		return {"error": "'score' must be a number between 0 and 1."}

	pRef = texts.parse_ref(review["ref"])
	if "error" in pRef:
		return {"error": "Couldn't understand 'ref': %s" % pRef["error"]}

	return {"result": "ok"}


def delete_review(review_id, uid):
	pass


def get_reviews(ref, lang, version):
	"""
	Returns a list of reviews pertaining to ref/lang/version
	"""
	reviews = []
	ref = texts.norm_ref(ref)
	refRe = '^%s$|^%s:' % (ref, ref)
	cursor = texts.db.history.find({"ref": {"$regex": refRe}, "language": lang, "version": version, "rev_type": "review"})
	for r in cursor:
		r["_id"] = str(r["_id"])
		r["userLink"] = user_link(r["user"])
		reviews.append(r)

	return reviews


def get_last_edit_date(ref, lang, version):
	"""
	Return the date of the last edit or addition to ref/lang/version
	"""
	ref = texts.norm_ref(ref)
	refRe = '^%s$|^%s:' % (ref, ref)
	query = {"ref": {"$regex": refRe}, "language": lang, "version": version, 
					"rev_type": {"$in": ["edit text", "add text", "revert text"]}}
	
	edit = texts.db.history.find(query).sort([["date", -1]]).limit(1)
	if edit.count():
		return edit[0]["date"]
	else:
		return None


def get_review_score_since_last_edit(ref, lang, version, reviews=None, last_edit=None):
	"""
	Returns the average score of all reviews that are current,
	i.e., that have happened since the text was last edited. 
	"""
	reviews = reviews or get_reviews(ref, lang, version)
	last_edit = last_edit or get_last_edit(ref, lang, version)
	
	scores = [r["score"] for r in reviews if r["date"] > last_edit ]

	if len(scores):
		return sum(scores) / float(len(scores))

	return None