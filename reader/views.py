import dateutil.parser
from datetime import datetime, timedelta
from pprint import pprint
from collections import defaultdict
from numbers import Number
from sets import Set
from random import choice
from bson.json_util import dumps

from django.template import Context, loader, RequestContext
from django.shortcuts import render_to_response, get_object_or_404, redirect
from django.http import HttpResponse, HttpResponseRedirect
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt, csrf_protect
from django.core.urlresolvers import reverse
from django.utils import simplejson as json
from django.contrib.auth.models import User

from sefaria.texts import *
from sefaria.util import *
from sefaria.calendars import *
from sefaria.workflows import next_text, next_translation
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
	initJSON = json.dumps(text)
	lines = True if "error" in text or text["type"] not in ('Tanach', 'Talmud') or text["book"] == "Psalms" else False
	email = request.user.email if request.user.is_authenticated() else ""
	
	zippedText = map(None, text["text"], text["he"])

	# Pull language setting from cookie if cookie set and lanugage avaialbe
	langMode = request.COOKIES.get('langMode') or 'en'
	if not len(text["text"]) and not langMode == "he":
		langMode = "he"
	if not len(text["he"]) and not langMode == "en":
		langMode = "en"
	langClass = {"en": "english", "he": "hebrew", "bi": "bilingual heLeft"}[langMode]

	return render_to_response('reader.html', 
							 {'titlesJSON': json.dumps(get_text_titles()),
							 'text': text,
							 'initJSON': initJSON,
							 'zippedText': zippedText,
							 'lines': lines,
							 'langClass': langClass,
							 'page_title': norm_ref(ref) or "Unknown Text",
							 'toc': get_toc(),
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
							 'toc': get_toc(),
							 'titlesJSON': json.dumps(get_text_titles()),
							 'email': email}, 
							 RequestContext(request))

@ensure_csrf_cookie
def texts_list(request):
	return render_to_response('texts.html', 
							 { 'toc': get_toc(),
							 'titlesJSON': json.dumps(get_text_titles()),
							 }, 
							 RequestContext(request))


def search(request):
	return render_to_response('search.html',
							 { 
							 	'toc': get_toc(),
							    'titlesJSON': json.dumps(get_text_titles()),
							 }, 
							 RequestContext(request))


@csrf_exempt
def texts_api(request, ref, lang=None, version=None):
	if request.method == "GET":
		cb = request.GET.get("callback", None)
		context = int(request.GET.get("context", 1))
		commentary = bool(int(request.GET.get("commentary", True)))

		version = version.replace("_", " ") if version else None
		return jsonResponse(get_text(ref, version=version, lang=lang, commentary=commentary, context=context), cb)

	if request.method == "POST":
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "Missing 'json' parameter in post data."})
		if not request.user.is_authenticated():
			key = request.POST.get("apikey")
			if not key:
				return jsonResponse({"error": "You must be logged in or use an API key to save texts."})
			apikey = db.apikeys.find_one({"key": key})
			if not apikey:
				return jsonResponse({"error": "Unrecognized API key."})
			response = save_text(ref, json.loads(j), apikey["uid"], method="API")
			return jsonResponse(response)
		else:
			@csrf_protect
			def protected_post(request):
				response = save_text(ref, json.loads(j), request.user.id)
				return jsonResponse(response)
			return protected_post(request)

	return jsonResponse({"error": "Unsuported HTTP method."})


def table_of_contents_api(request):
	return jsonResponse(get_toc_dict())


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
								'toc': get_toc(), 
								'titlesJSON': json.dumps(get_text_titles()),
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
	history = text_history(ref, version, lang)

	for i in range(len(history)):
		uid = history[i]["user"]
		if isinstance(uid, Number):
			user = User.objects.get(id=uid)
			history[i]["firstname"] = user.first_name
		else:
			# For reversions before history where user is 'Unknown'
			history[i]["firstname"] = uid

	url = "%s/%s/%s" % (url_ref(ref), lang, version.replace(" ", "_"))	
	email = request.user.email if request.user.is_authenticated() else False
	return render_to_response('activity.html', 
							 {'activity': history,
							  "single": True, "ref": ref, "lang": lang, "version": version,
							 'url': url,
							 'email': email,
							 'toc': get_toc(),
							 'titlesJSON': json.dumps(get_text_titles()),
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

	text = {
		"versionTitle": version,
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
								'toc': get_toc(),
								'titlesJSON': json.dumps(get_text_titles()),
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

	headlines = [
				"Sefaria is creating a new home for the <nobr>Jewish canon online.</nobr>",
				"Sefaria is a <nobr>Living Library</nobr> of <nobr>Jewish Texts.</nobr>",
				"Welcome to Open Source Jewish Texts."
				]

	return render_to_response('static/splash.html',
							 {"titlesJSON": json.dumps(get_text_titles()),
							  #"connected_texts": connected_texts,
							  #"active_texts": active_texts,
							  "activity": activity,
							  "metrics": metrics,
							  "headlines": headlines,
							  "daf_today": daf_today,
							  "daf_tomorrow": daf_tomorrow,
							  "parasha": parasha,
							  # "sheets": sheets,
							  'toc': get_toc(),},
							  RequestContext(request))


@ensure_csrf_cookie
def mishna_campaign(request):

	# normalize URL
	if request.path != "/translate/Mishnah":
		return redirect("/translate/Mishnah", permanent=True)

	# expire old locks
	sefaria.locks.expire_locks()

	if "random" in request.GET:
		# choose a random Mishnah
		ref = {"error": "haven't chosen yet"}
		while "error" in ref:
			mishnas = db.index.find({"categories.0": "Mishna"}).distinct("title")
			mishna = choice(mishnas)
			ref = next_translation(mishna)
			next = mishna

	elif "text" in request.GET:
		# choose the next text requested in URL
		text = norm_ref(request.GET["text"])
		next = text
		if get_percent_available(text) == 100:
			return HttpResponse("%s is complete! Work on <a href='/translate/Mishnah'>another Mishnah</a>." % next)
		ref = next_translation(text)
		if "error" in ref:
			return HttpResponse("All remainging Mishnahs in %s are being worked on by other contributors. Work on <a href='/translate/Mishnah'>another Mishnah</a> for now.")

	else:
		# choose the next Mishnah in order
		skip = 0
		ref = {"error": "haven't chosen yet"}
		while "error" in ref:
			text = next_text("Mishna", skip=skip)
			ref = next_translation(text)
			skip += 1
		next = None
	
	# get the assigned text
	assigned = get_text(ref, context=0, commentary=False)
	
	# get percentage and remaining counts
	percent = {
		"text":  get_percent_available(assigned["book"]),
		"order": get_percent_available(assigned["categories"]),
		"total": get_percent_available(assigned["categories"][0]),
	}
	remaining = {
		"text":  get_remaining_translation_count(assigned["book"], unit="Mishna"),
		"order": get_remaining_translation_count(assigned["categories"], unit="Mishna"),
		"total": get_remaining_translation_count(assigned["categories"][0], unit="Mishna"),
	}

	# Put a lock on this assignment
	user = request.user.id if request.user.is_authenticated() else 0
	sefaria.locks.set_lock(ref, "en", "Sefaria Community Translation", user)

	return render_to_response('translate_campaign.html', 
									{"title": "Help Create a Free English Mishnah",
									"assigned_ref": ref,
									"assigned_ref_url": url_ref(ref),
									"assigned_text": assigned["he"],
									"assigned": assigned,
									"remaining": remaining,
									"percent": percent,
									"thanks": "thank" in request.GET,
									"next_text": next,
									'toc': get_toc(),
									"titlesJSON": json.dumps(get_text_titles()),
									},
									RequestContext(request))

def contest_splash(request):

	settings = {
		"contest_start"    : datetime.strptime("12/15/13", "%m/%d/%y"),
		"contest_end"      : datetime.strptime("1/1/14", "%m/%d/%y"),
		"version"          : "Sefaria Community Translation",
		"ref_regex"        : "^Mishna ",
		"assignment_url"   : "/translate/mishnah",
		"title"            : "Mishnah Translation 2013", 
		"copy_template"    : "static/contest%s.html" % request.path,
	}

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


	settings.update({
						'toc': get_toc(),
						"titlesJSON": json.dumps(get_text_titles()),
					})

	return render_to_response("contest_splash.html",
								settings,
								RequestContext(request))


def metrics(request):
	metrics = db.metrics.find()
	metrics_json = dumps(metrics)
	return render_to_response('metrics.html', 
								{
									"metrics_json": metrics_json,
									'toc': get_toc(),
									"titlesJSON": json.dumps(get_text_titles()),
								},
								RequestContext(request))


def serve_static(request, page):
	return render_to_response('static/%s.html' % page, {'toc': get_toc(), "titlesJSON": json.dumps(get_text_titles()), }, RequestContext(request))


def coming_soon(request, page):
	return render_to_response('static/placeholder.html',  {'toc': get_toc(), "titlesJSON": json.dumps(get_text_titles()),}, RequestContext(request))


