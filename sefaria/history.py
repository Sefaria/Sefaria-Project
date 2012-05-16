import sys
from pprint import pprint
from datetime import datetime
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
			record_text_change("%s.%d" % (ref, n), version, lang, text[i], user)
		return

	# get the current state of the text in question
	current = texts.get_text(ref, context=0, commentary=False, version=version, lang=lang)
	if "error" in current:
		return current
	if len(current["text"]) == 0:
		current = ""
	else:
		current = current["text"]

	# Don't record anything if there's no change. 
	if text == current: 
		return

	# create a pactch that turn the new version back into the old	
	backwards_diff = dmp.diff_main(text, current)
	patch = dmp.patch_toText(dmp.patch_make(backwards_diff))
	# get html displaying edits in this change.
	forwards_diff = dmp.diff_main(current, text)
	dmp.diff_cleanupSemantic(forwards_diff)
	diff_html = dmp.diff_prettyHtml(forwards_diff) 

	# give this revision a new revision number
	last_rev = texts.db.history.find().sort([['revision', -1]]).limit(1)
	revision = last_rev.next()["revision"] + 1 if last_rev.count() else 1

	log = {
		"ref": texts.norm_ref(ref),
		"version": version,
		"language": lang,
		"diff_html": diff_html,
		"patch": patch,
		"user": user,
		"date": datetime.now().isoformat(),
		"revision": revision,
		"message": kwargs["message"] if "message" in kwargs else "",
		"type": kwargs["type"] if "type" in kwargs else "edit text" if len(current) else "add text"
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
			"type": rev["type"],
			"diff_html": rev["diff_html"],
			"text": text_at_revision(ref, version, lang, rev["revision"])
		}
		history.append(log)
	# create a fake revision 0 for initial work that was unrecorded
	rev0 = {
		"revision": 0,
		"date": "Date Unknown",
		"user": "Unknown Contributor",
		"type": "add text",
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
	if "error" in current:
		return current
	if len(current["text"]) == 0:
		text = ""
	else:
		text = current["text"]	

	for i in range(changes.count()):
		r = changes[i]
		if r["revision"] == revision: break
		patch = dmp.patch_fromText(r["patch"])
		text = dmp.patch_apply(patch, text)[0]

	return text


def link_change(user):
	pass


def index_change(title, new, user):
	pass


