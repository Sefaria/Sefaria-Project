import sys
from pprint import pprint
from datetime import datetime, date, timedelta
from diff_match_patch import diff_match_patch
import texts

dmp = diff_match_patch()

def record_text_change(ref, version, lang, text, user, **kwargs):
	"""
	Record a change to a text (ref/version/lang) by user. 
	"""

	# unpack text into smaller segments if necessary (e.g. chapter -> verse)
	if isinstance(text, list):
		for i in range(len(text)):
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

	# create a patch that turn the new version back into the old	
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
	changes = texts.db.history.find({"ref": ref, "version": version, "language": lang}).sort([['revision', -1]])
	history = []

	for i in range(changes.count()):
		rev = changes[i]
		log = {
			"revision": rev["revision"],
			"date": rev["date"],
			"user": rev["user"],
			"rev_type": rev["rev_type"],
			"method": rev.get("method", "Site"),
			"diff_html": rev["diff_html"],
			"text": text_at_revision(ref, version, lang, rev["revision"])
		}
		history.append(log)
	# create a fake revision 0 for initial work that was unrecorded
	rev0 = {
		"revision": 0,
		"date": "Date Unknown",
		"user": "Untracked Contributor",
		"rev_type": "add text",
		"diff_html": text_at_revision(ref, version, lang, 0)
	}
	history.append(rev0)

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
	text = current.get(textField, "")

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
	@new_obj is a dictionary represent the obj after change
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

	if days:
		cond = { "date": { "$gt": datetime.now() - timedelta(days) }, "method": {"$ne": "API"} }
	else:
		cond = { "method": {"$ne": "API"} }

	t = texts.db.history.group(['user'], 
						cond, 
						{'count': 0},
						'function(obj, prev) {prev.count++}')

	return sorted(t, key=lambda user: -user["count"])


