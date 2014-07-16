import dateutil.parser
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
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt, csrf_protect
from django.core.urlresolvers import reverse
from django.utils import simplejson as json
from django.contrib.auth.models import User

from sefaria.texts import parse_ref, get_index, get_text, get_text_titles, make_ref_re
from sefaria.history import get_maximal_collapsed_activity
from sefaria.util import *
from sefaria.calendars import *
from sefaria.workflows import *
from sefaria.reviews import *
from sefaria.summaries import get_toc, flatten_toc
from sefaria.counts import get_percent_available, get_translated_count_by_unit, get_untranslated_count_by_unit, set_counts_flag
from sefaria.notifications import Notification, NotificationSet
from sefaria.users import UserProfile
from sefaria.sheets import LISTED_SHEETS
import sefaria.locks
import sefaria.calendars


@ensure_csrf_cookie
def reader(request, ref, lang=None, version=None):

	# Redirect to standard URLs
	# Let unknown refs pass through 
	uref = url_ref(ref)
	if uref and ref != uref:
		url = "/" + uref
		if lang and version:
			url += "/%s/%s" % (lang, version)

		response = redirect(url, permanent=True)
		params = request.GET.urlencode()
		response['Location'] += "?%s" % params if params else ""
		return response

	# BANDAID - return the first section only of a spanning ref
	pRef = parse_ref(ref)
	if "error" not in pRef and is_spanning_ref(pRef):
		ref = split_spanning_ref(pRef)[0]
		url = "/" + ref
		if lang and version:
			url += "/%s/%s" % (lang, version)
		response = redirect(url)
		params = request.GET.urlencode()
		response['Location'] += "?%s" % params if params else ""
		return response

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
	# URL parameter trumps cookie
	langMode = request.GET.get("lang", langMode)
	langMode = "bi" if langMode in ("he-en", "en-he") else langMode
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

@ensure_csrf_cookie
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


def parashat_hashavua_api(request):
	callback = request.GET.get("callback", None)
	p = sefaria.calendars.this_weeks_parasha(datetime.now())
	p["date"] = p["date"].isoformat()
	p.update(get_text(p["ref"]))
	return jsonResponse(p, callback)


def table_of_contents_api(request):
	return jsonResponse(get_toc())


def text_titles_api(request):
	return jsonResponse({"books": get_text_titles()})


@csrf_exempt
def index_api(request, title):
	"""
	API for manipulating text index records (aka "Text Info")
	"""
	if request.method == "GET":
		i = get_index(title)
		return jsonResponse(i)
	
	if request.method == "POST":
		# use the update function if update is in the params
		func = update_index if request.GET.get("update", False) else save_index
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
			return jsonResponse(func(j, apikey["uid"], method="API"))
		else:
			@csrf_protect
			def protected_index_post(request):
				return jsonResponse(func(j, request.user.id))
			return protected_index_post(request)

	return jsonResponse({"error": "Unsuported HTTP method."})


def counts_api(request, title):
	"""
	API for retrieving the counts document for a given text.
	"""
	if request.method == "GET":
		return jsonResponse(get_counts(title))

	elif request.method == "POST":
		if not request.user.is_staff:
			return jsonResponse({"error": "Not permitted."})

		if "update" in request.GET:
			flag = request.GET.get("flag", None)
			if not flag:
				return jsonResponse({"error": "'flag' parameter missing."})
			val  = request.GET.get("val", None)
			val = True if val == "true" else False

			set_counts_flag(title, flag, val)

			return jsonResponse({"status": "ok"})

		return jsonResponse({"error": "Not implemented."})



@csrf_exempt
def links_api(request, link_id_or_ref=None):
	"""
	API for manipulating textual links.
	Currently also handles post notes.
	"""
	#TODO: can we distinguish between a link_id (mongo id) for POSTs and a ref for GETs?
	if request.method == "GET":
		if link_id_or_ref is None:
			return jsonResponse({"error": "Missing text identifier"})
		#TODO is there are better way to validate the ref from GET params?
		pRef = parse_ref(link_id_or_ref)
		if "error" in pRef:
			return jsonResponse(pRef)
		with_text = int(request.GET.get("with_text", 1))
		return jsonResponse(get_links(link_id_or_ref, with_text))

	if request.method == "POST":
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "Missing 'json' parameter in post data."})
		j = json.loads(j)
		# use the correct function if params indicate this is a note save
		func = save_note if "type" in j and j["type"] == "note" else save_link

		if not request.user.is_authenticated():
			key = request.POST.get("apikey")
			if not key:
				return jsonResponse({"error": "You must be logged in or use an API key to add, edit or delete links."})
			apikey = db.apikeys.find_one({"key": key})
			if not apikey:
				return jsonResponse({"error": "Unrecognized API key."})
			return jsonResponse(func(j, apikey["uid"], method="API"))
		else:
			@csrf_protect
			def protected_link_post(request):
				response = func(j, request.user.id)
				return jsonResponse(response)
			return protected_link_post(request)
			# does this need @csrf_protect?
	
	if request.method == "DELETE":
		if not link_id_or_ref:
			return jsonResponse({"error": "No link id given for deletion."})

		return jsonResponse(delete_link(link_id_or_ref, request.user.id))

	return jsonResponse({"error": "Unsuported HTTP method."})


def notes_api(request, note_id):
	"""
	API for user notes.
	Currently only handles deleting. Adding and editing are handled throughout the links API.
	"""
	if request.method == "DELETE":
		if not request.user.is_authenticated():
			return jsonResponse({"error": "You must be logged in to delete notes."})
		return jsonResponse(delete_note(note_id, request.user.id))

	return jsonResponse({"error": "Unsuported HTTP method."})


def versions_api(request, ref):
	"""
	API for retrieving available text versions list of a ref.
	"""
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
	"""
	API to set an edit lock on a text segment.
	"""
	user = request.user.id if request.user.is_authenticated() else 0
	sefaria.locks.set_lock(norm_ref(ref), lang, version.replace("_", " "), user)
	return jsonResponse({"status": "ok"})


def release_lock_api(request, ref, lang, version):
	"""
	API to release the edit lock on a text segment.
	"""
	sefaria.locks.release_lock(norm_ref(ref), lang, version.replace("_", " "))
	return jsonResponse({"status": "ok"})


def check_lock_api(request, ref, lang, version):
	"""
	API to check whether a text segment currently has an edit lock.
	"""
	locked = sefaria.locks.check_lock(norm_ref(ref), lang, version.replace("_", " "))
	return jsonResponse({"locked": locked})


def lock_text_api(request, title, lang, version):
	"""
	API for locking or unlocking a text as a whole.
	To unlock, include the URL parameter "action=unlock"
	"""
	if not request.user.is_staff:
		return {"error": "Only Sefaria Moderators can lock texts."}

	if request.GET.get("action", None) == "unlock":
		return jsonResponse(set_text_version_status(title, lang, version, status=None))
	else:
		return jsonResponse(set_text_version_status(title, lang, version, status="locked"))


def notifications_api(request):
	"""
	API for retrieving user notifications.
	"""
	if not request.user.is_authenticated():
		return jsonResponse({"error": "You must be logged in to access your notifications."})

	page      = int(request.GET.get("page", 1))
	page_size = int(request.GET.get("page_size", 10))

	notifications = NotificationSet().recent_for_user(request.user.id, limit=page_size, page=page)

	return jsonResponse({
							"html": notifications.to_HTML(),
							"page": page,
							"page_size": page_size,
							"count": notifications.count 
						})


def notifications_read_api(request):
	"""
	API for marking notifications as read

	Takes JSON in the "notifications" parameter of an array of 
	notifcation ids as strings.
	"""
	if request.method == "POST":
		notifications = request.POST.get("notifications")
		if not notifications:
			return jsonResponse({"error": "'notifications' post parameter missing."})
		notifications = json.loads(notifications)
		for id in notifications:
			notification = Notification(_id=id)
			if notification.uid != request.user.id: 
				# Only allow expiring your own notifications
				continue
			notification.mark_read().save()

		return jsonResponse({"status": "ok"})

	else:
		return jsonResponse({"error": "Unsupported HTTP method."})


def messages_api(request):
	"""
	API for posting user to user messages
	"""
	if not request.user.is_authenticated():
		return jsonResponse({"error": "You must be logged in to access your messages."})

	if request.method == "POST":
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "No post JSON."})
		j = json.loads(j)

		Notification(uid=j["recipient"]).make_message(sender_id=request.user.id, message=j["message"]).save()
		return jsonResponse({"status": "ok"})

	elif request.method == "GET":
		return jsonResponse({"error": "Unsupported HTTP method."})


def texts_history_api(request, ref, lang=None, version=None):
	"""
	API for retrieving history information about a given text.
	"""
	if request.method != "GET":
		return jsonResponse({"error": "Unsuported HTTP method."})

	ref = norm_ref(ref)
	refRe = '^%s$|^%s:' % (ref, ref) 
	if lang and version:
		query = {"ref": {"$regex": refRe }, "language": lang, "version": version.replace("_", " ")}
	else:
		query = {"ref": {"$regex": refRe }}
	history = db.history.find(query)

	summary = {"copiers": Set(), "translators": Set(), "editors": Set(), "reviewers": Set() }

	for act in history:
		if act["rev_type"].startswith("edit"):
			summary["editors"].update([act["user"]])
		elif act["rev_type"] == "review":
			summary["reviewers"].update([act["user"]])
		elif act["version"] == "Sefaria Community Translation":
			summary["translators"].update([act["user"]])
		else:
			summary["copiers"].update([act["user"]])

	# Don't list copiers and translators as editors as well
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


def reviews_api(request, ref=None, lang=None, version=None, review_id=None):
	if request.method == "GET":
		if ref and lang and version:
			pRef = parse_ref(ref)
			if "error" in pRef:
				return jsonResponse(pRef)
			ref = make_ref(pRef)
			version = version.replace("_", " ")

			reviews = get_reviews(ref, lang, version)
			last_edit = get_last_edit_date(ref, lang, version)
			score_since_last_edit = get_review_score_since_last_edit(ref, lang, version, reviews=reviews, last_edit=last_edit)

			for r in reviews:
				r["date"] = r["date"].isoformat()

			response = {
				"ref":                ref,
				"lang":               lang,
				"version":            version,
				"reviews":            reviews,
				"reviewCount":        len(reviews),
				"scoreSinceLastEdit": score_since_last_edit,
				"lastEdit":           last_edit.isoformat() if last_edit else None,
			}
		elif review_id:
			response = {}

		return jsonResponse(response)


	elif request.method == "POST":
		if not request.user.is_authenticated():
			return jsonResponse({"error": "You must be logged in to write reviews."})
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "No post JSON."})
		j = json.loads(j)
		
		response = save_review(j, request.user.id)
		return jsonResponse(response)

	elif request.method == "DELETE":
		if not review_id:
			return jsonResponse({"error": "No review ID given for deletion."})

		return jsonResponse(delete_review(review_id, request.user.id))

	else:
		return jsonResponse({"error": "Unsuported HTTP method."})


@ensure_csrf_cookie
def global_activity(request, page=1):
	"""
	Recent Activity page listing all recent actions and contributor leaderboards.
	"""
	page = int(page)
	page_size = 100

	if "api" in request.GET:
		q = {}
	else:
		q = {"method": {"$ne": "API"}}

	filter_type = request.GET.get("type", None)
	activity, page = get_maximal_collapsed_activity(query=q, page_size=page_size, page=page, filter_type=filter_type)

	next_page = page + 1 if page else None
	next_page = "/activity/%d" % next_page if next_page else None
	next_page = "%s?type=%s" % (next_page, filter_type) if next_page and filter_type else next_page

	email = request.user.email if request.user.is_authenticated() else False
	return render_to_response('activity.html', 
							 {'activity': activity,
							 	'filter_type': filter_type,
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

	version = version.replace("_", " ")
	filter_type = request.GET.get("type", None)
	history = text_history(nref, version, lang, filter_type=filter_type)

	email = request.user.email if request.user.is_authenticated() else False
	return render_to_response('activity.html', 
							 {'activity': history,
							   "single": True,
							   "ref": nref, 
							   "lang": lang, 
							   "version": version,
							   'email': email,
							   'filter_type': filter_type,
							 }, 
							 RequestContext(request))


def revert_api(request, ref, lang, version, revision):
	"""
	API for reverting a text segment to a previous revision.
	"""
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
		"versionSource": existing["versionSource"] if lang == "en" else existing["heVersionSource"],
		"language": lang,
		"text": text_at_revision(ref, version, lang, revision)
	}

	return jsonResponse(save_text(ref, text, request.user.id, type="revert text"))


@ensure_csrf_cookie
def user_profile(request, username, page=1):
	"""
	User's profile page. 
	"""
	user           = get_object_or_404(User, username=username)	
	profile        = UserProfile(user.id)
	
	page_size      = 50
	page           = int(page) if page else 1
	query          = {"user": user.id}
	filter_type    = request.GET["type"] if "type" in request.GET else None
	activity, page = get_maximal_collapsed_activity(query=query, page_size=page_size, page=page, filter_type=filter_type)

	contributed    = activity[0]["date"] if activity else None 
	scoreDoc       = db.leaders_alltime.find_one({"_id": user.id})
	score          = int(scoreDoc["count"]) if scoreDoc else 0
	sheets         =  db.sheets.find({"owner": user.id, "status": {"$in": LISTED_SHEETS }})

	next_page      = page + 1 if page else None
	next_page      = "/contributors/%s/%d" % (username, next_page) if next_page else None

	return render_to_response('profile.html', 
							 {'profile': user,
							 	'extended_profile': profile,
								'activity': activity,
								'sheets': sheets,
								'joined': user.date_joined,
								'contributed': contributed,
								'score': score,
								'filter_type': filter_type,
								'next_page': next_page,
								"single": False,
							  }, 
							 RequestContext(request))


def profile_api(request):
	"""
	API for editing user profile.
	"""
	if not request.user.is_authenticated():
		return jsonResponse({"error": "You must be logged in to update your profile."})

	if request.method == "POST":

		profileJSON = request.POST.get("json")
		if not profileJSON:
			return jsonResponse({"error": "No post JSON."})
		profileUpdate = json.loads(profileJSON)

		profile = UserProfile(request.user.id)
		profile.update(profileUpdate).save()

		return jsonResponse({"status": "ok"})

	return jsonResponse({"error": "Unsupported HTTP method."})


@login_required
@ensure_csrf_cookie
def account_settings(request):
	"""
	Page for managing a user's account settings.
	"""
	profile = UserProfile(request.user.id)
	return render_to_response('account_settings.html', 
							 {
							    'user': request.user,
							 	'profile': profile,
							  }, 
							 RequestContext(request))

@ensure_csrf_cookie
def splash(request):
	"""
	Homepage a.k.a. Splash page.
	"""
	daf_today          = daf_yomi(datetime.now())
	daf_tomorrow       = daf_yomi(datetime.now() + timedelta(1))
	parasha            = this_weeks_parasha(datetime.now())
	metrics            = db.metrics.find().sort("timestamp", -1).limit(1)[0]
	activity, page     = get_maximal_collapsed_activity(query={}, page_size=5, page=1)

	# Pull language setting from Accept-Lanugage header
	langClass = 'hebrew' if request.LANGUAGE_CODE in ('he', 'he-il') else 'english'

	return render_to_response('static/splash.html',
							 {
							  "activity": activity,
							  "metrics": metrics,
							  "headline": randint(1,3), #random choice of 3 headlines
							  "daf_today": daf_today,
							  "daf_tomorrow": daf_tomorrow,
							  "parasha": parasha,
							  "langClass": langClass,
							  },
							  RequestContext(request))


@ensure_csrf_cookie
def dashboard(request):
	"""
	Dashboard page -- table view of all content
	"""
	counts = db.counts.find({"title": {"$exists": 1}}, 
		{"title": 1, "flags": 1, "linksCount": 1, "percentAvailable": 1})
	
	toc = get_toc()
	flat_toc = flatten_toc(toc)

	def toc_sort(a):
		try:
			return flat_toc.index(a["title"])
		except:
			return 9999

	counts = sorted(counts, key=toc_sort)

	return render_to_response('dashboard.html',
								{
									"counts": counts,
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
			skip = int(request.GET.get("skip")) if "skip" in request.GET else None
			assigned_ref = random_untranslated_ref_in_text(text, skip=skip)
			
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
			skip = int(request.GET.get("skip")) if "skip" in request.GET else None
			text = random_untranslated_text_in_category(cat, skip=skip)
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
			# TODO -- need an escape valve here
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
	if "he" not in assigned or not len(assigned["he"]):
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
									"random_param": "&skip=%d" % assigned["sections"][0] if request.GET.get("random") else "",
									"next_text": next_text,
									"next_section": next_section,
									},
									RequestContext(request))

@ensure_csrf_cookie
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

@ensure_csrf_cookie
def metrics(request):
	"""
	Metrics page. Shows graphs of core metrics. 
	"""
	metrics = db.metrics.find().sort("timestamp", 1)
	metrics_json = dumps(metrics)
	return render_to_response('metrics.html', 
								{
									"metrics_json": metrics_json,
								},
								RequestContext(request))

@ensure_csrf_cookie
def serve_static(request, page):
	"""
	Serve a static page whose template matches the URL
	"""
	return render_to_response('static/%s.html' % page, {}, RequestContext(request))



