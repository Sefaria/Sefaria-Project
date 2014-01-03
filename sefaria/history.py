import sys
import os
from pprint import pprint
from datetime import datetime, date, timedelta
from diff_match_patch import diff_match_patch
from bson.code import Code

from settings import *
from util import *
import texts

# To allow these files to be run from command line
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

dmp = diff_match_patch()


def record_text_change(ref, version, lang, text, user, **kwargs):
	"""
	Record a change to a text (ref/version/lang) by user. 
	"""

	# unpack text into smaller segments if necessary (e.g. chapter -> verse)
	if isinstance(text, list):
		for i in reversed(range(len(text))):
			n = i + 1
			record_text_change("%s.%d" % (ref, n), version, lang, text[i], user, **kwargs)
		return

	# get the current state of the text in question
	current = texts.get_text(ref, context=0, commentary=False, version=version, lang=lang)
	if "error" in current and current["error"].startswith("No text found"):
		current = ""
	elif "error" in current:
		return current
	elif lang == "en" and current["text"]:
		current = current["text"]
	elif lang == "he" and current["he"]:
		current = current["he"]
	else: 
		current = ""

	# Don't record anything if there's no change. 
	if not text:
		text = ""
	if text == current: 
		return

	# create a patch that turns the new version back into the old	
	backwards_diff = dmp.diff_main(text, current)
	patch = dmp.patch_toText(dmp.patch_make(backwards_diff))
	# get html displaying edits in this change.
	forwards_diff = dmp.diff_main(current, text)
	dmp.diff_cleanupSemantic(forwards_diff)
	diff_html = dmp.diff_prettyHtml(forwards_diff) 

	# give this revision a new revision number
	revision = next_revision_num()

	log = {
		"ref": texts.norm_ref(ref),
		"version": version,
		"language": lang,
		"diff_html": diff_html,
		"revert_patch": patch,
		"user": user,
		"date": datetime.now(),
		"revision": revision,
		"message": kwargs.get("message", ""),
		"rev_type": kwargs.get("type", None) or "edit text" if len(current) else "add text",
		"method": kwargs.get("method", "Site")
	}

	texts.db.history.save(log)


def text_history(ref, version, lang):
	"""
	Return a complete list of changes to a segment of text (identified by ref/version/lang)
	"""
	ref = texts.norm_ref(ref)
	refRe = '^%s$|^%s:' % (ref, ref) 
	changes = texts.db.history.find({"ref": {"$regex": refRe}, "version": version, "language": lang}).sort([['revision', -1]])
	history = []

	for i in range(changes.count()):
		rev = changes[i]
		log = {
			"ref": rev["ref"],
			"revision": rev["revision"],
			"date": rev["date"],
			"user": rev["user"],
			"rev_type": rev["rev_type"],
			"method": rev.get("method", "Site"),
			"diff_html": rev["diff_html"],
			"text": text_at_revision(ref, version, lang, rev["revision"])
		}
		history.append(log)
	"""
	# create a fake revision 0 for initial work that was unrecorded
	rev0 = {
		"revision": 0,
		"date": "Date Unknown",
		"user": "Untracked Contributor",
		"rev_type": "add text",
		"diff_html": text_at_revision(ref, version, lang, 0)
	}
	history.append(rev0)
	"""
	return history


def text_at_revision(ref, version, lang, revision):
	"""
	Returns the state of a text (identified by ref/version/lang) at revision number 'revision'
	"""

	changes = texts.db.history.find({"ref": ref, "version": version, "language": lang}).sort([['revision', -1]])
	current = texts.get_text(ref, context=0, commentary=False, version=version, lang=lang)
	if "error" in current and not current["error"].startswith("No text found"):
		return current

	textField = "text" if lang == "en" else lang
	text = unicode(current.get(textField, ""))

	for i in range(changes.count()):
		r = changes[i]
		if r["revision"] == revision: break
		patch = dmp.patch_fromText(r["revert_patch"])
		text = dmp.patch_apply(patch, text)[0]

	return text


def record_obj_change(kind, criteria, new_obj, user):
	"""
	Generic method for savind a change to an obj by user
	@kind is a string name of the collection in the db
	@criteria is a dictionary uniquely identifying one obj in the collection
	@new_obj is a dictionary representing the obj after change
	"""
	collection = kind + "s" if kind in ("link", "note") else kind
	obj = texts.db[collection].find_one(criteria)
	if obj and new_obj:
		old = obj
		rev_type = "edit %s" % kind
	elif obj and not new_obj:
		old = obj;
		rev_type = "delete %s" % kind
	else:
		old = None
		rev_type = "add %s" % kind

	log = {
		"revision": next_revision_num(),
		"user": user,
		"old": old,
		"new": new_obj,
		"rev_type": rev_type,
		"date": datetime.now(),
	}

	if "_id" in criteria:
		criteria["%s_id" % kind] = criteria["_id"]
		del criteria["_id"]

	log.update(criteria)
	texts.db.history.save(log)


def next_revision_num():
	last_rev = texts.db.history.find().sort([['revision', -1]]).limit(1)
	revision = last_rev.next()["revision"] + 1 if last_rev.count() else 1
	return revision


def top_contributors(days=None):
	"""
	Returns a list of users and their activity counts, either in the previous
	'days' if present or across all time. 
	Assumes counts have been precalculated and stored in the DB.
	"""
	if days:
		collection = "leaders_%d" % days
	else:
		collection = "leaders_alltime"

	leaders = texts.db[collection].find().sort([["count", -1]])

	return [{"user": l["_id"], "count": l["count"]} for l in leaders]


def make_leaderboard_condition(start=None, end=None, ref_regex=None, version=None, actions=[], api=False):

	condition = {}
			
	# Time Conditions
	if start and end:
		condition["date"] = { "$gt": start, "$lt": end }
	elif start and not end:
		condition["date"] = { "$gt": start }
	elif end and not start:
		condition["date"] = { "$lt": end }

	# Regular Expression to search Ref
	if ref_regex:
		condition["ref"] = {"$regex": ref_regex}

	# Limit to a specific text version
	if version:
		condition["version"] = version

	# Count acitvity from API? 
	if not api:
		condition["method"] = {"$ne": "API"} 
			
	return condition


def make_leaderboard(condition):
	"""
	Returns a list of user and activity counts for activity that 
	matches the conditions of 'condition' - an object used to query
	the history collection.

	This fucntion queries and calculates for all currently matching history.
	"""

	reducer = Code("""
					function(obj, prev) {

						switch(obj.rev_type) {
							case "add text":
								if (obj.language !== 'he' && obj.version === "Sefaria Community Translation") {
									prev.count += Math.max(obj.revert_patch.length / 10, 10);
								} else if(obj.language !== 'he') {
									prev.count += Math.max(obj.revert_patch.length / 400, 2);
								} else {
									prev.count += Math.max(obj.revert_patch.length / 800, 1);
								}
								break;
							case "edit text":
								prev.count += Math.max(obj.revert_patch.length / 1200, 1);
								break;
							case "revert text":
								prev.count += 1;
								break;
							case "add index":
								prev.count += 5;
								break;
							case "edit index":
								prev.count += 1;
								break;
							case "add link":
								prev.count += 2;
								break;
							case "edit link":
								prev.count += 1;
								break;
							case "delete link":
								prev.count += 1;
								break;
							case "add note":
								prev.count += 1;
								break;
							case "edit note":
								prev.count += 1;
								break;
							case "delete note":
								prev.count += 1;
								break;			
						}
					}
				""")

	leaders = texts.db.history.group(['user'], 
						condition, 
						{'count': 0},
						reducer)

	return sorted(leaders, key=lambda x: -x["count"])


def get_activity(query={}, page_size=100, page=1):
	"""
	Returns a list of activity items matching query,
	joins with user info on each item and sets urls. 
	"""

	activity = list(texts.db.history.find(query).sort([["date", -1]]).skip((page-1)*page_size).limit(page_size))

	for i in range(len(activity)):
		a = activity[i]
		if a["rev_type"].endswith("text"):
			a["text"] = text_at_revision(a["ref"], a["version"], a["language"], a["revision"])
			a["history_url"] = "/activity/%s/%s/%s" % (texts.url_ref(a["ref"]), a["language"], a["version"].replace(" ", "_"))
		uid = a["user"]
		try:
			user = User.objects.get(id=uid)
			a["firstname"] = user.first_name
		except User.DoesNotExist:
			a["firstname"] = "Someone"

	return activity
