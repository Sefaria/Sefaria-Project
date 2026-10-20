import time
from functools import wraps
from django.conf import settings
from django.contrib.admin.views.decorators import staff_member_required
from django.templatetags.static import static
from django.urls import reverse
from django.views.decorators.cache import never_cache
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET
from pymongo.errors import PyMongoError
from .atlas import REFRESH_INTERVAL, catalog_revision, database, request_refresh

def restricted(view):
    @wraps(view)
    @never_cache
    @require_GET
    def wrapped(request):
        if not getattr(settings, "INQUIRY_ATLAS_ENABLED", False):
            return JsonResponse({"error": "Atlas disabled"}, status=404)
        if not request.user.is_authenticated or not request.user.is_staff or not request.user.is_active:
            return JsonResponse({"error": "Staff sign-in required"}, status=403)
        response = view(request)
        response["Cache-Control"] = "private, no-store"
        return response
    return wrapped

@never_cache
@staff_member_required(login_url="admin:login")
@restricted
def page(request):
    revision = catalog_revision()
    config = {
        "catalogRevision": revision,
        "baselineUrl": static("inquiry/atlas-baseline.json") + "?v=" + revision,
        "activityUrl": reverse("inquiry:atlas-activity"),
        "adminUrl": reverse("admin:index"),
        "loginUrl": reverse("admin:login") + "?next=" + reverse("inquiry:atlas"),
    }
    return render(request, "inquiry/atlas.html", {"atlas_config": config})

def viewer_history_enabled(request):
    """Report this viewer's preference without changing it or exposing another user."""
    if getattr(settings, "INQUIRY_STANDALONE", False):
        return None
    profile = database().profiles.find_one({"id": request.user.pk}, {"_id": 0, "settings.reading_history": 1})
    return (profile or {}).get("settings", {}).get("reading_history", True)

@restricted
def activity(request):
    try:
        payload = database().inquiry_activity_snapshots.find_one({"_id": "latest"}, {"_id": 0})
        history_enabled = viewer_history_enabled(request)
        now = time.time()
        if not getattr(settings, "INQUIRY_STANDALONE", False) and (payload is None or now - payload["generated_at"] >= REFRESH_INTERVAL - 1):
            request_refresh(database(), now)
    except PyMongoError:
        return JsonResponse({"status": "unavailable"}, status=503)
    if payload is None:
        return JsonResponse({"status": "waiting", "server_time": time.time(), "viewer_history_enabled": history_enabled})
    payload["viewer_history_enabled"] = history_enabled
    payload["server_time"] = time.time()
    payload["status"] = "current" if payload["server_time"]-payload["generated_at"] <= 30 else "stale"
    return JsonResponse(payload)

