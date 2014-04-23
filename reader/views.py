import dateutil.parser
from datetime import datetime, timedelta
from pprint import pprint
from collections import defaultdict
from numbers import Number
from sets import Set
from random import randint
from bson.json_util import dumps

from django.template import Context, loader, RequestContext
from django.shortcuts import render_to_response, get_object_or_404, redirect
from django.http import HttpResponse, HttpResponseRedirect, Http404
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt, csrf_protect
from django.core.urlresolvers import reverse
from django.utils import simplejson as json
from django.contrib.auth.models import User

from sefaria.texts import *
from sefaria.summaries import get_toc
from sefaria.util import *
from sefaria.calendars import *
from sefaria.workflows import *
from sefaria.sheets import LISTED_SHEETS
import sefaria.locks


@ensure_csrf_cookie
def reader(request, ref, lang=None, version=None):
	
	# Redirect to standard URLs
	# Let unknown refs pass through 
	uref = url_ref(ref)
	if uref and ref != uref:
		url = "/" + uref
		if lang and version:
			url += "/%s/%s" % (lang, version)
		return redirect(url, permanent=True)

	# BANDAID - return the first section only of a spanning ref
	pRef = parse_ref(ref)
	if "error" not in pRef and is_spanning_ref(pRef):
		ref = split_spanning_ref(pRef)[0]
		url = "/" + ref
		if lang and version:
			url += "/%s/%s" % (lang, version)
		return redirect(url, permanent=True)

	version = version.replace("_", " ") if version else None
	text = get_text(ref, lang=lang, version=version)
	if not "error" in text:
		notes = get_notes(ref, uid=request.user.id, context=1)
		text["commentary"] += notes
	initJSON = json.dumps(text)
	
	lines = True if "error" in text or text["type"] not in ('Tanach', 'Talmud') or text["book"] == "Psalms" else False
	email = request.user.email if request.user.is_authenticated() else ""
	
	zippedText = map(None, text["text"], text["he"]) if not "error" in text else []

	# Pull language setting from cookie or Accept-Lanugage header
	langMode = request.COOKIES.get('langMode') or request.LANGUAGE_CODE or 'en'
	langMode = 'he' if langMode == 'he-il' else langMode
	# Don't allow languages other than what we currently handle
	langMode = 'en' if langMode not in ('en', 'he', 'bi') else langMode
	# Substitue language mode if text not available in that language
	if not "error" in text:
		if is_text_empty(text["text"]) and not langMode == "he":
			langMode = "he"
		if is_text_empty(text["he"]) and not langMode == "en":
			langMode = "en"
	langClass = {"en": "english", "he": "hebrew", "bi": "bilingual heLeft"}[langMode]

	return render_to_response('reader.html', 
							 {'text': text,
							 'initJSON': initJSON,
							 'zippedText': zippedText,
							 'lines': lines,
							 'langClass': langClass,
							 'page_title': norm_ref(ref) or "Unknown Text",
							 'title_variants': "(%s)" % ", ".join(text.get("titleVariants", []) + [text.get("heTitle", "")]),
							 'email': email}, 
							 RequestContext(request))


@ensure_csrf_cookie
def edit_text(request, ref=None, lang=None, version=None, new_name=None):
	"""
	Opens a view directly to adding, editing or translating a given text.
	"""
	if ref is not None:
		version = version.replace("_", " ") if version else None
		text = get_text(ref, lang=lang, version=version)
		text["mode"] = request.path.split("/")[1] 
		initJSON = json.dumps(text)
	else:
		new_name = new_name.replace("_", " ") if new_name else new_name
		initJSON = json.dumps({"mode": "add new", "title": new_name})

	titles = json.dumps(get_text_titles())
	page_title = "%s %s" % (text["mode"].capitalize(), ref) if ref else "Add a New Text" 
	email = request.user.email if request.user.is_authenticated() else ""


	return render_to_response('reader.html', 
							 {'titles': titles,
							 'initJSON': initJSON, 
							 'page_title': page_title,
							 'email': email}, 
							 RequestContext(request))

@ensure_csrf_cookie
def texts_list(request):
	return render_to_response('texts.html', 
							 {}, 
							 RequestContext(request))


def search(request):
	return render_to_response('search.html',
							 {}, 
							 RequestContext(request))


@csrf_exempt
def texts_api(request, ref, lang=None, version=None):
	if request.method == "GET":
		cb = request.GET.get("callback", None)
		context = int(request.GET.get("context", 1))
		commentary = bool(int(request.GET.get("commentary", True)))
		version = version.replace("_", " ") if version else None

		text = get_text(ref, version=version, lang=lang, commentary=commentary, context=context)
		
		if "error" in text:
			return jsonResponse(text, cb)

		if "commentary" in text:
			# If this is a spanning ref it can't handle commmentary,
			# so check if the field is actually present 
			notes = get_notes(ref, uid=request.user.id, context=1)
			text["commentary"] += notes

		return jsonResponse(text, cb)


	if request.method == "POST":
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "Missing 'json' parameter in post data."})
		
		# Parameters to suppress some costly operations after save
		count_after = int(request.GET.get("count_after", 1))
		index_after = int(request.GET.get("index_after", 1))
		if not request.user.is_authenticated():
			key = request.POST.get("apikey")
			if not key:
				return jsonResponse({"error": "You must be logged in or use an API key to save texts."})
			apikey = db.apikeys.find_one({"key": key})
			if not apikey:
				return jsonResponse({"error": "Unrecognized API key."})
			response = save_text(ref, json.loads(j), apikey["uid"], method="API", count_after=count_after, index_after=index_after)
			return jsonResponse(response)
		else:
			@csrf_protect
			def protected_post(request):
				response = save_text(ref, json.loads(j), request.user.id, count_after=count_after, index_after=index_after)
				return jsonResponse(response)
			return protected_post(request)

	return jsonResponse({"error": "Unsuported HTTP method."})


def table_of_contents_api(request):
	return jsonResponse(get_toc())


def table_of_contents_list_api(reuquest):
	return jsonResponse(get_toc())


def text_titles_api(request):
	return jsonResponse({"books": get_text_titles()})

@csrf_exempt
def index_api(request, title):
	if request.method == "GET":
		i = get_index(title)
		return jsonResponse(i)
	
	if request.method == "POST":
		j = json.loads(request.POST.get("json"))
		if not j:
			return jsonResponse({"error": "Missing 'json' parameter in post data."})
		j["title"] = title.replace("_", " ")	
		if not request.user.is_authenticated():
			key = request.POST.get("apikey")
			if not key:
				return jsonResponse({"error": "You must be logged in or use an API key to save texts."})
			apikey = db.apikeys.find_one({"key": key})
			if not apikey:
				return jsonResponse({"error": "Unrecognized API key."})
			return jsonResponse(save_index(j, apikey["uid"], method="API"))
		else:
			@csrf_protect
			def protected_index_post(request):
				return jsonResponse(save_index(j, request.user.id))
			return protected_index_post(request)

	return jsonResponse({"error": "Unsuported HTTP method."})


def counts_api(request, title):
	if request.method == "GET":
		return jsonResponse(get_counts(title))
	else:
		return jsonResponse({"error": "Unsuported HTTP method."})


def links_api(request, link_id=None):
	if not request.user.is_authenticated():
		return jsonResponse({"error": "You must be logged in to add, edit or delete links."})
	
	if request.method == "POST":
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "No post JSON."})
		j = json.loads(j)
		if "type" in j and j["type"] == "note":
			return jsonResponse(save_note(j, request.user.id))
		else:
			return jsonResponse(save_link(j, request.user.id))
	
	if request.method == "DELETE":
		if not link_id:
			return jsonResponse({"error": "No link id given for deletion."})

		return jsonResponse(delete_link(link_id, request.user.id))

	return jsonResponse({"error": "Unsuported HTTP method."})


def notes_api(request, note_id):
	if request.method == "DELETE":
		if not request.user.is_authenticated():
			return jsonResponse({"error": "You must be logged in to delete notes."})
		return jsonResponse(delete_note(note_id, request.user.id))

	return jsonResponse({"error": "Unsuported HTTP method."})


def versions_api(request, ref):
	pRef = parse_ref(ref)
	if "error" in pRef:
		return jsonResponse(pRef)
	versions = db.texts.find({"title": pRef["book"]})
	results = []
	for v in versions:
		results.append({ 
				"title": v["versionTitle"],
				"source": v["versionSource"],
				"langauge": v["language"]
			})

	return jsonResponse(results)


def set_lock_api(request, ref, lang, version):
	user = request.user.id if request.user.is_authenticated() else 0
	sefaria.locks.set_lock(norm_ref(ref), lang, version.replace("_", " "), user)
	return jsonResponse({"status": "ok"})


def release_lock_api(request, ref, lang, version):
	sefaria.locks.release_lock(norm_ref(ref), lang, version.replace("_", " "))
	return jsonResponse({"status": "ok"})


def check_lock_api(request, ref, lang, version):
	locked = sefaria.locks.check_lock(norm_ref(ref), lang, version.replace("_", " "))
	return jsonResponse({"locked": locked})


def texts_history_api(request, ref, lang=None, version=None):
	if request.method != "GET":
		return jsonResponse({"error": "Unsuported HTTP method."})

	ref = norm_ref(ref)
	refRe = '^%s$|^%s:' % (ref, ref) 
	if lang and version:
		query = {"ref": {"$regex": refRe }, "language": lang, "version": version.replace("_", " ")}
	else:
		query = {"ref": {"$regex": refRe }}
	history = db.history.find(query)

	summary = {"copiers": Set(), "translators": Set(), "editors": Set() }

	for act in history:
		if act["rev_type"].startswith("edit"):
			summary["editors"].update([act["user"]])
		elif act["version"] == "Sefaria Community Translation":
			summary["translators"].update([act["user"]])
		else:
			summary["copiers"].update([act["user"]])

	summary["editors"].difference_update(summary["copiers"])
	summary["editors"].difference_update(summary["translators"])

	for group in summary:
		uids = list(summary[group])
		names = []
		for uid in uids:
			try:
				user = User.objects.get(id=uid)
				name = "%s %s" % (user.first_name, user.last_name)
				link = user_link(uid)
			except User.DoesNotExist:
				name = "Someone"
				link = user_link(-1)
			u = {
				'name': name,
				'link': link
			}
			names.append(u)
		summary[group] = names

	return jsonResponse(summary)


def global_activity(request, page=1):
	"""
	Recent Activity page listing all recent actions and contributor leaderboards.
	"""
	page = int(page)

	if "api" in request.GET:
		q = {}
	else:
		q = {"method": {"$ne": "API"}}

	if "type" in request.GET:
		q["rev_type"] = request.GET["type"].replace("_", " ")

	activity = get_activity(query=q, page_size=100, page=page)

	next_page = page + 1 if len(activity) else 0
	next_page = "/activity/%d" % next_page if next_page else 0

	email = request.user.email if request.user.is_authenticated() else False
	return render_to_response('activity.html', 
							 {'activity': activity,
								'leaders': top_contributors(),
								'leaders30': top_contributors(30),
								'leaders7': top_contributors(7),
								'leaders1': top_contributors(1),
								'email': email,
								'next_page': next_page,
								}, 
							 RequestContext(request))


@ensure_csrf_cookie
def segment_history(request, ref, lang, version):
	"""
	View revision history for the text segment named by ref / lang / version. 
	"""
	nref = norm_ref(ref)
	if not nref:
		return HttpResponse("There was an error in your text reference: %s" % parse_ref(ref)["error"])
	else:
		ref = nref

	version = version.replace("_", " ")
	rev_type = request.GET["type"].replace("_", " ") if "type" in request.GET else None
	history = text_history(ref, version, lang, rev_type=rev_type)

	for i in range(len(history)):
		uid = history[i]["user"]
		if isinstance(uid, Number):
			user = User.objects.get(id=uid)
			history[i]["firstname"] = user.first_name
		else:
			# For reversions before history where user is 'Unknown'
			history[i]["firstname"] = uid

	email = request.user.email if request.user.is_authenticated() else False
	return render_to_response('activity.html', 
							 {'activity': history,
							   "single": True,
							   "ref": ref, 
							   "lang": lang, 
							   "version": version,
							   'email': email,
							 }, 
							 RequestContext(request))


def revert_api(request, ref, lang, version, revision):
	if not request.user.is_authenticated():
		return jsonResponse({"error": "You must be logged in to revert changes."})

	if request.method != "POST":
		return jsonResponse({"error": "Unsupported HTTP method."})

	revision = int(revision)
	version = version.replace("_", " ")
	ref = norm_ref(ref)
	if not ref:
		# pass along the error message if norm_ref failed
		return jsonResponse(parse_ref(ref))

	existing = get_text(ref, commentary=0, version=version, lang=lang)
	if "error" in existing:
		return jsonResponse(existing)

	text = {
		"versionTitle": version,
		"versionSource": existing["versionSource"],
		"language": lang,
		"text": text_at_revision(ref, version, lang, revision)
	}

	return jsonResponse(save_text(ref, text, request.user.id, type="revert text"))


@ensure_csrf_cookie
def user_profile(request, username, page=1):
	user = get_object_or_404(User, username=username)	
	profile = db.profiles.find_one({"id": user.id})
	if not profile:
		profile = {
			"position": "",
			"organizaion": "",
			"bio": "",
		}

	page_size = 100
	page = int(page) if page else 1
	activity = list(db.history.find({"user": user.id}).sort([['revision', -1]]).skip((page-1)*page_size).limit(page_size))
	for i in range(len(activity)):
		a = activity[i]
		if a["rev_type"].endswith("text"):
			a["text"] = text_at_revision(a["ref"], a["version"], a["language"], a["revision"])
			a["history_url"] = "/activity/%s/%s/%s" % (url_ref(a["ref"]), a["language"], a["version"].replace(" ", "_"))

	contributed = activity[0]["date"] if activity else None 
	score = db.leaders_alltime.find_one({"_id": user.id})
	score = int(score["count"]) if score else 0
	sheets = db.sheets.find({"owner": user.id, "status": {"$in": LISTED_SHEETS }})

	next_page = page + 1 if len(activity) else 0
	next_page = "/contributors/%s/%d" % (username, next_page) if next_page else 0

	return render_to_response('profile.html', 
							 {'profile': user,
							 	'extended_profile': profile,
								'activity': activity,
								'sheets': sheets,
								'joined': user.date_joined,
								'contributed': contributed,
								'score': score,
								'next_page': next_page,
								"single": False,
							  }, 
							 RequestContext(request))

def profile_api(request):
	if not request.user.is_authenticated():
		return jsonResponse({"error": "You must be logged in to update your profile."})

	if request.method == "POST":

		profile = request.POST.get("json")
		if not profile:
			return jsonResponse({"error": "No post JSON."})
		profile = json.loads(profile)

		profile["id"] = request.user.id

		db.profiles.update({"id": request.user.id}, profile, upsert=True)

		return jsonResponse({"status": "ok"})


	return jsonResponse({"error": "Unsupported HTTP method."})


@ensure_csrf_cookie
def splash(request):

	daf_today = daf_yomi(datetime.now())
	daf_tomorrow = daf_yomi(datetime.now() + timedelta(1))
	parasha = this_weeks_parasha(datetime.now())

	#connected_texts = db.texts_by_multiplied_connections.find().sort("count", -1).limit(9)
	#connected_texts = [t["_id"] for t in connected_texts ]
	#active_texts = db.texts_by_activity_7.find().sort("value", -1).limit(9)
	#active_texts = [t["_id"] for t in active_texts]

	metrics = db.metrics.find().sort("timestamp", -1).limit(1)[0]

	activity = get_activity(query={}, page_size=5, page=1)

	# featured_sheets = [23, 33, 45, 42]
	# sheets = [{"url": "/sheets/%d" % id, "name": db.sheets.find_one({"id": id})["title"]} for id in featured_sheets]

	# Pull language setting Accept-Lanugage header
	langClass = 'hebrew' if request.LANGUAGE_CODE in ('he', 'he-il') else 'english'

	return render_to_response('static/splash.html',
							 {#"connected_texts": connected_texts,
							  #"active_texts": active_texts,
							  "activity": activity,
							  "metrics": metrics,
							  "headline": randint(1,3), #random choice of 3 headlines
							  "daf_today": daf_today,
							  "daf_tomorrow": daf_tomorrow,
							  "parasha": parasha,
							  "langClass": langClass,
							  # "sheets": sheets,
							  },
							  RequestContext(request))


@ensure_csrf_cookie
def translation_flow(request, ref):
	"""
	Assign a user a paritcular bit of text to translate within 'ref',
	either a text title or category. 
	"""

	ref = ref.replace("_", " ")
	generic_response = { "title": "Help Translate %s" % ref, "content": "" }
	categories = get_text_categories()
	next_text = None
	next_section = None


	# expire old locks before checking for a currently unlocked text
	sefaria.locks.expire_locks()

	pRef = parse_ref(ref, pad=False)
	if "error" not in pRef and len(pRef["sections"]) == 0:
		# ref is an exact text Title
		text = norm_ref(ref)

		# normalize URL
		if request.path != "/translate/%s" % url_ref(text):
			return redirect("/translate/%s" % url_ref(text), permanent=True)

		# Check for completion
		if get_percent_available(text) == 100:
			generic_response["content"] = "<h3>Sefaria now has a complete translation of %s</h3>But you can still contribute in other ways.</h3> <a href='/contribute'>Learn More.</a>" % ref
			return render_to_response('static/generic.html', generic_response, RequestContext(request))

		if "random" in request.GET:
			# choose a ref from a random section within this text
			assigned_ref = random_untranslated_ref_in_text(text)
			if assigned_ref:
				next_section = parse_ref(assigned_ref)["sections"][0]
		
		elif "section" in request.GET:
			# choose the next ref within the specified section
			next_section = int(request.GET["section"])
			assigned_ref = next_untranslated_ref_in_text(text, section=next_section)
		
		else:
			# choose the next ref in this text in order
			assigned_ref = next_untranslated_ref_in_text(text)
	
		if not assigned_ref:
			generic_response["content"] = "All remaining sections in %s are being worked on by other contributors. Work on <a href='/translate/%s'>another text</a> for now." % (text, ref)
			return render_to_response('static/generic.html', generic_response, RequestContext(request))
		
	elif "error" not in pRef and len(pRef["sections"]) > 0:
		# ref is a citation to a particular location in a text
		# for now, send this to the edit_text view
		return edit_text(request, ref)
		
	elif "error" in pRef and ref in categories:
		# ref is a text Category
		cat = ref

		# Check for completion
		if get_percent_available(cat) == 100:
			generic_response["content"] = "<h3>Sefaria now has a complete translation of %s</h3>But you can still contribute in other ways.</h3> <a href='/contribute'>Learn More.</a>" % ref
			return render_to_response('static/generic.html', generic_response, RequestContext(request))

		if "random" in request.GET:
			# choose a random text from this cateogory
			text = random_untranslated_text_in_category(cat)
			assigned_ref = next_untranslated_ref_in_text(text)
			next_text = text

		elif "text" in request.GET:
			# choose the next text requested in URL
			text = norm_ref(request.GET["text"])
			next_text = text
			if get_percent_available(text) == 100:
				generic_response["content"] = "%s is complete! Work on <a href='/translate/%s'>another text</a>." % (next, ref)
				return render_to_response('static/generic.html', generic_response, RequestContext(request))
			
			assigned_ref = next_untranslated_ref_in_text(text)
			if "error" in assigned_ref:
				generic_response["content"] = "All remaining sections in %s are being worked on by other contributors. Work on <a href='/translate/%s'>another text</a> for now." % (next, ref)
				return render_to_response('static/generic.html', generic_response, RequestContext(request))

		else:
			# choose the next text in order
			skip = 0
			assigned_ref = {"error": "haven't chosen yet"}
			while "error" in assigned_ref:
				text = next_untranslated_text_in_category(cat, skip=skip)
				assigned_ref = next_untranslated_ref_in_text(text)
				skip += 1
	
	else:
		# we don't know what this is
		generic_response["content"] = "<b>%s</b> isn't a known text or category.<br>But you can still contribute in other ways.</h3> <a href='/contribute'>Learn More.</a>" % (ref)
		return render_to_response('static/generic.html', generic_response, RequestContext(request))


	# get the assigned text
	assigned = get_text(assigned_ref, context=0, commentary=False)

	# Put a lock on this assignment
	user = request.user.id if request.user.is_authenticated() else 0
	sefaria.locks.set_lock(assigned_ref, "en", "Sefaria Community Translation", user)
	
	# if the assigned text is actually empty, run this request again
	# but leave the new lock in place to skip over it
	if not len(assigned["he"]):
		return translation_flow(request, ref)

	# get percentage and remaining counts
	# percent   = get_percent_available(assigned["book"])
	translated = get_translated_count_by_unit(assigned["book"], unit=assigned["sectionNames"][-1])
	remaining = get_untranslated_count_by_unit(assigned["book"], unit=assigned["sectionNames"][-1])
	percent = 100 * translated / float(translated + remaining)


	return render_to_response('translate_campaign.html', 
									{"title": "Help Translate %s" % ref,
									"base_ref": ref,
									"assigned_ref": assigned_ref,
									"assigned_ref_url": url_ref(assigned_ref),
									"assigned_text": assigned["he"],
									"assigned_segment_name": assigned["sectionNames"][-1],
									"assigned": assigned,
									"translated": translated,
									"remaining": remaining,
									"percent": percent,
									"thanks": "thank" in request.GET,
									"next_text": next_text,
									"next_section": next_section,
									},
									RequestContext(request))


def contest_splash(request, slug):
	"""
	Splash page for contest. 

	Example of adding a contest record to the DB:
	db.contests.save({
			"contest_start"    : datetime.strptime("3/5/14", "%m/%d/%y"),
			"contest_end"      : datetime.strptime("3/26/14", "%m/%d/%y"),
			"version"          : "Sefaria Community Translation",
			"ref_regex"        : "^Shulchan Arukh, Even HaEzer ",
			"assignment_url"   : "/translate/Shulchan_Arukh,_Even_HaEzer",
			"title"            : "Translate Shulchan Arukh, Even HaEzer",
			"slug"             : "shulchan-arukh-even-haezer"
	})
	"""
	settings = db.contests.find_one({"slug": slug})
	if not settings:
		raise Http404

	settings["copy_template"] = "static/contest/%s.html" % settings["slug"]

	leaderboard_condition = make_leaderboard_condition( start     = settings["contest_start"], 
														end       = settings["contest_end"], 
														version   = settings["version"], 
														ref_regex = settings["ref_regex"])

	now = datetime.now()
	if now < settings["contest_start"]:
		settings["phase"] = "pre"
		settings["leaderboard"] = None
		settings["time_to_start"] = td_format(settings["contest_start"] - now)

	elif settings["contest_start"] < now < settings["contest_end"]:
		settings["phase"] = "active"
		settings["leaderboard_title"] = "Current Leaders"
		settings["leaderboard"] = make_leaderboard(leaderboard_condition)
		settings["time_to_end"] = td_format(settings["contest_end"] - now)

	elif settings["contest_end"] < now:
		settings["phase"] = "post"
		settings["leaderboard_title"] = "Contest Leaders (Unreviewed)"

		settings["leaderboard"] = make_leaderboard(leaderboard_condition)


	return render_to_response("contest_splash.html",
								settings,
								RequestContext(request))


def metrics(request):
	metrics = db.metrics.find()
	metrics_json = dumps(metrics)
	return render_to_response('metrics.html', 
								{
									"metrics_json": metrics_json,
								},
								RequestContext(request))


def serve_static(request, page):
	return render_to_response('static/%s.html' % page, {}, RequestContext(request))



