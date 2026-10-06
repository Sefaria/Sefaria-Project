"""Comparison endpoint with local HTTP or authenticated Celery transport."""
import json
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.core.exceptions import PermissionDenied
from django.http import Http404, JsonResponse
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods

SALT="lemma-search-job-v1"


def backend():
    return getattr(settings,"LEMMA_SEARCH_BACKEND","local")


def guard(request):
    if not getattr(settings,"LEMMA_SEARCH_EXPERIMENT",False): raise Http404
    if backend()=="celery":
        if not request.user.is_authenticated or not request.user.is_staff:
            raise PermissionDenied("This experiment is available to signed-in staff testers.")
    elif backend()=="local":
        if not settings.DEBUG or request.META.get("REMOTE_ADDR") not in ("127.0.0.1","::1"):
            raise Http404
    else:
        raise Http404


@require_GET
@never_cache
@ensure_csrf_cookie
def page(request):
    guard(request)
    return render(request,"lemma_search.html")


def celery_jobs(request):
    from sefaria.celery_setup.app import app
    from scripts.lemma_search_worker import validate
    index=getattr(settings,"LEMMA_SEARCH_INDEX","")
    queue=getattr(settings,"LEMMA_SEARCH_QUEUE","")
    if not re.fullmatch(r"lemma-poc-[a-z0-9-]+",index) or not queue.endswith("-lemma-search"):
        return JsonResponse({"error":"Experiment queue/index is not configured"},status=503)
    if request.method=="POST":
        try:
            payload=json.loads(request.body)
            if not isinstance(payload,dict): raise ValueError("Expected an object")
            validate(payload)
        except (ValueError,TypeError):
            return JsonResponse({"error":"Invalid search parameters"},status=400)
        if not cache.add(f"lemma-search-submit:{request.user.pk}",True,timeout=5):
            return JsonResponse({"error":"Please wait a few seconds before submitting another search."},status=429)
        try:
            task=app.send_task("lemma_search.compare",args=[payload,index],queue=queue,expires=120)
        except Exception:
            return JsonResponse({"error":"Search queue unavailable; try again shortly."},status=503)
        job=signing.dumps({"task":task.id,"user":request.user.pk,"index":index},salt=SALT)
        return JsonResponse({"status":"running","job":job},status=202)
    try:
        token=signing.loads(request.GET.get("job",""),salt=SALT,max_age=1800)
        if token["user"]!=request.user.pk or token["index"]!=index: raise signing.BadSignature()
    except (signing.BadSignature,KeyError,TypeError):
        return JsonResponse({"error":"Job expired or unavailable for this account."},status=400)
    try:
        result=app.AsyncResult(token["task"])
        if not result.ready(): return JsonResponse({"status":"running"})
        if result.failed(): return JsonResponse({"status":"error","error":"Search failed. Check the experiment worker logs or retry with fewer words."})
        return JsonResponse({"status":"complete","data":result.result})
    except Exception:
        return JsonResponse({"error":"Search result backend unavailable."},status=503)


@require_http_methods(["GET","POST"])
@never_cache
def jobs(request):
    guard(request)
    if request.method=="POST" and len(request.body)>10000:
        return JsonResponse({"error":"Query too large"},status=400)
    if backend()=="celery": return celery_jobs(request)
    if request.method=="POST":
        upstream=Request("http://127.0.0.1:19201/jobs",data=request.body,headers={"Content-Type":"application/json"},method="POST")
    else:
        key=request.GET.get("job","")
        if not re.fullmatch(r"[a-f0-9]{32}",key):
            return JsonResponse({"error":"Invalid job ID"},status=400)
        upstream=Request("http://127.0.0.1:19201/jobs/"+key)
    try:
        with urlopen(upstream,timeout=5) as response:
            return JsonResponse(json.load(response),status=response.status)
    except HTTPError as error:
        return JsonResponse({"error":"Worker rejected the request: "+error.read().decode()},status=400)
    except (URLError,TimeoutError,OSError):
        return JsonResponse({"error":"Local lemma worker unavailable. Start scripts/lemma_search_worker.py with the research virtualenv."},status=503)
