import sys
import os
from pprint import pprint
from datetime import datetime, date, timedelta

from bson.objectid import ObjectId

from settings import *
from util import *
import texts

# To allow these files to be run from command line
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

def save_review(review, uid):
	validate = validate_review(review)
	if "error" in validate:
		return validate

	review = {
		"user":     uid,
		"date":     datetime.now(),
		"rev_type": "review",
		"score":    review["score"],
		"comment":  review["comment"],
		"ref":      review["ref"],
		"language": review["lang"],
		"version":  review["version"],
	}

	# Check for a review from this user since the last edit
	existing = get_current_review(uid, review["ref"], review["language"], review["version"])
	if existing:
		# Overwrite the existing review if present
		review["_id"] = existing["_id"]

	texts.db.history.save(review)
	
	review["_id"] = str(review["_id"])
	review["date"] = review["date"].isoformat()
	return review


def validate_review(review):
	
	for field in ("score", "comment", "ref", "language", "version"):
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
	review = texts.db.history.find_one({"_id": ObjectId(review_id)})
	if not review:
		return {"error": "Review not found."}
	if review["user"] != uid:
		return {"error": "You do not have permissions to delete this review."}
	texts.db.history.remove(review)
	return {"status": "ok"}


def get_reviews(ref, lang, version):
	"""
	Returns a list of reviews pertaining to ref/lang/version
	"""
	reviews = []
	ref = texts.norm_ref(ref)
	refRe = '^%s$|^%s:' % (ref, ref)
	cursor = texts.db.history.find({"ref": {"$regex": refRe}, "language": lang, "version": version, "rev_type": "review"}).sort([["date", -1]])
	for r in cursor:
		r["_id"] = str(r["_id"])
		r["userLink"] = user_link(r["user"])
		reviews.append(r)

	return reviews

def get_last_edit(ref, lang, version):
	"""
	Returns the last edit or addition to ref/lang/version
	"""
	ref = texts.norm_ref(ref)
	refRe = '^%s$|^%s:' % (ref, ref)
	query = {"ref": {"$regex": refRe}, "language": lang, "version": version, 
					"rev_type": {"$in": ["edit text", "add text", "revert text"]}}
	
	edit = texts.db.history.find(query).sort([["date", -1]]).limit(1)	

	if edit.count():
		return edit[0]
	return None


def get_last_edit_date(ref, lang, version):
	"""
	Return the date of the last edit or addition to ref/lang/version
	"""
	edit = get_last_edit(ref, lang, version)
	if edit:
		return edit["date"]
	else:
		return None


def get_review_score_since_last_edit(ref, lang, version, reviews=None, last_edit=None):
	"""
	Returns the average score of all reviews that are current,
	i.e., that have happened since the text was last edited. 
	"""
	reviews   = reviews or get_reviews(ref, lang, version)
	last_edit = last_edit or get_last_edit(ref, lang, version)
	
	scores = [r["score"] for r in reviews if not last_edit or r["date"] > last_edit ]

	if len(scores):
		return sum(scores) / float(len(scores))

	return None


def get_current_review(uid, ref, lang, version):
	"""
	Returns a review for uid/ref/lang/version that occurred since the last edit, or None.
	"""
	date = get_last_edit_date(ref, lang, version)
	query = {"user": uid, "ref": ref, "language": lang, "version": version}
	result = texts.db.history.find(query).sort([["date", -1]]).limit(1)

	if result.count():
		review = result[0]
		if not date or review["date"] > date:
			return review
	return None










