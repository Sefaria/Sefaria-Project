import json
import time
import re
import math
from datetime import datetime, timedelta

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth.models import User
from django.core import signing

from sefaria.model import Index, IndexSet, Version, VersionSet, library
from sefaria.model.notification import Notification
from sefaria.google_storage_manager import GoogleStorageManager
from sefaria.helper.community_book_parser import (
    parse_document, build_jagged_array, build_schema, ParseError,
)
from sefaria.system.exceptions import InputError

import structlog
logger = structlog.get_logger(__name__)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_DAILY_SUBMISSIONS = 3
MAX_PENDING_SUBMISSIONS = 10
TOKEN_MAX_AGE = 3600  # 1 hour

try:
    from django.conf import settings
    COMMUNITY_BOOK_ADMIN_IDS = getattr(settings, 'COMMUNITY_BOOK_ADMIN_IDS', [])
except Exception:
    COMMUNITY_BOOK_ADMIN_IDS = []


def _require_auth(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Authentication required"}, status=401)
    return None


def _check_rate_limits(user_id):
    from sefaria.system.database import db
    yesterday = datetime.utcnow() - timedelta(days=1)

    daily_count = db.index.count_documents({
        "communityBook.submittedBy": user_id,
        "communityBook.submittedAt": {"$gt": yesterday},
    })
    if daily_count >= MAX_DAILY_SUBMISSIONS:
        return JsonResponse(
            {"error": f"Maximum {MAX_DAILY_SUBMISSIONS} submissions per day"},
            status=429,
        )

    pending_count = db.index.count_documents({
        "communityBook.submittedBy": user_id,
        "communityBook.status": "submitted",
    })
    if pending_count >= MAX_PENDING_SUBMISSIONS:
        return JsonResponse(
            {"error": f"Maximum {MAX_PENDING_SUBMISSIONS} pending submissions"},
            status=429,
        )
    return None


def _sanitize_filename(name):
    return re.sub(r'[^a-zA-Z0-9_\-.]', '-', name)[:100]


def _check_title_uniqueness(title_en, title_he, user_id):
    for title in [title_en, title_he]:
        if not title:
            continue
        existing = Index().load({"title": title})
        if existing:
            if (existing.is_community_book
                    and existing.communityBook.get("submittedBy") == user_id
                    and existing.communityBook.get("status") in ("rejected", "withdrawn")):
                continue
            return JsonResponse(
                {"error": f'A text with the title "{title}" already exists.'},
                status=409,
            )
    return None


def _notify_user(user_id, notif_type, content):
    Notification({
        "type": notif_type,
        "uid": user_id,
        "date": datetime.utcnow(),
        "content": content,
        "read": False,
        "is_global": False,
    }).save()


def _notify_admins(notif_type, content):
    for admin_id in COMMUNITY_BOOK_ADMIN_IDS:
        _notify_user(admin_id, notif_type, content)


@csrf_exempt
def upload(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    user_id = request.user.id

    rate_err = _check_rate_limits(user_id)
    if rate_err:
        return rate_err

    uploaded_file = request.FILES.get("file")
    if not uploaded_file:
        return JsonResponse({"error": "No file provided"}, status=400)

    if not uploaded_file.name.endswith(".docx"):
        if uploaded_file.name.endswith(".doc"):
            return JsonResponse(
                {"error": "Only .docx files are supported. Please re-save your .doc file as .docx."},
                status=400,
            )
        return JsonResponse({"error": "Only .docx files are supported"}, status=400)

    if uploaded_file.size > MAX_FILE_SIZE:
        return JsonResponse({"error": "File must be under 10MB"}, status=400)

    title_en = request.POST.get("title_en", "").strip()
    title_he = request.POST.get("title_he", "").strip()
    depth = int(request.POST.get("depth", 1))
    language = request.POST.get("language", "en").strip()
    description_en = request.POST.get("description_en", "").strip()
    description_he = request.POST.get("description_he", "").strip()

    if not title_en:
        return JsonResponse({"error": "English title is required"}, status=400)

    title_err = _check_title_uniqueness(title_en, title_he, user_id)
    if title_err:
        return title_err

    safe_name = _sanitize_filename(uploaded_file.name)
    gcs_path = f"uploads/{user_id}/{int(time.time())}_{safe_name}"
    try:
        gcs_url = GoogleStorageManager.upload_file(
            uploaded_file, gcs_path, GoogleStorageManager.COMMUNITY_BOOKS_BUCKET
        )
    except Exception as e:
        logger.error("GCS upload failed", error=str(e))
        return JsonResponse({"error": "File upload failed. Please try again."}, status=500)

    uploaded_file.seek(0)
    try:
        result = parse_document(uploaded_file, "docx", depth)
    except ParseError as e:
        return JsonResponse({"error": str(e)}, status=400)

    preview = {
        "chapters": [
            {
                "title": ch.title,
                "section_count": len(ch.sections),
                "word_count": ch.word_count,
            }
            for ch in result.chapters
        ],
        "total_chapters": len(result.chapters),
        "total_words": result.total_words,
        "depth": depth,
    }

    token_payload = {
        "user_id": user_id,
        "gcs_url": gcs_url,
        "gcs_path": gcs_path,
        "title_en": title_en,
        "title_he": title_he,
        "depth": depth,
        "language": language,
        "description_en": description_en,
        "description_he": description_he,
    }
    upload_token = signing.dumps(token_payload, salt="community-book-upload")

    return JsonResponse({"status": "success", "preview": preview, "upload_token": upload_token})


@csrf_exempt
def confirm(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    token_str = body.get("upload_token")
    if not token_str:
        return JsonResponse({"error": "upload_token is required"}, status=400)

    try:
        payload = signing.loads(token_str, salt="community-book-upload", max_age=TOKEN_MAX_AGE)
    except signing.BadSignature:
        return JsonResponse({"error": "Invalid or expired upload token"}, status=400)

    if payload["user_id"] != request.user.id:
        return JsonResponse({"error": "Token does not belong to this user"}, status=403)

    try:
        file_obj = GoogleStorageManager.get_filename(payload["gcs_path"], GoogleStorageManager.COMMUNITY_BOOKS_BUCKET)
    except Exception as e:
        logger.error("GCS download failed", error=str(e))
        return JsonResponse({"error": "Failed to retrieve uploaded file"}, status=500)

    try:
        result = parse_document(file_obj, "docx", payload["depth"])
    except ParseError as e:
        return JsonResponse({"error": str(e)}, status=400)

    jagged_array = build_jagged_array(result)
    schema = build_schema(payload["depth"], payload["title_en"], payload["title_he"] or payload["title_en"])

    existing_index = Index().load({"title": payload["title_en"]})
    if existing_index and existing_index.is_community_book:
        if (existing_index.communityBook.get("submittedBy") == request.user.id
                and existing_index.communityBook.get("status") in ("rejected", "withdrawn")):
            VersionSet({"title": payload["title_en"]}).delete()
            existing_index.schema = schema
            existing_index.enDesc = payload["description_en"]
            existing_index.heDesc = payload["description_he"]
            existing_index.communityBook = {
                "status": "submitted",
                "submittedBy": request.user.id,
                "submittedAt": datetime.utcnow(),
                "reviewedBy": None,
                "rejectionReason": None,
            }
            existing_index.hidden = True
            try:
                existing_index.save(override_dependencies=True)
            except Exception as e:
                return JsonResponse({"error": str(e)}, status=500)
            idx = existing_index
        else:
            return JsonResponse({"error": "A text with this title already exists."}, status=409)
    else:
        idx = Index({
            "title": payload["title_en"],
            "categories": ["Community"],
            "schema": schema,
            "communityBook": {
                "status": "submitted",
                "submittedBy": request.user.id,
                "submittedAt": datetime.utcnow(),
                "reviewedBy": None,
                "rejectionReason": None,
            },
            "hidden": True,
            "enDesc": payload["description_en"],
            "heDesc": payload["description_he"],
        })
        try:
            idx.save(override_dependencies=True)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)

    lang = payload["language"]
    if lang in ("he", "heb", "hebrew"):
        version_lang = "he"
        direction = "rtl"
    else:
        version_lang = "en"
        direction = "ltr"

    username = request.user.first_name or request.user.username

    try:
        version = Version({
            "title": idx.title,
            "language": version_lang,
            "versionTitle": f"Author Submission - {username}",
            "versionSource": payload["gcs_url"],
            "chapter": jagged_array,
            "actualLanguage": lang,
            "isSource": True,
            "isPrimary": True,
            "direction": direction,
        })
        version.save()
    except Exception as e:
        if not existing_index:
            idx.delete()
        logger.error("Version save failed, rolled back Index", error=str(e))
        return JsonResponse({"error": f"Failed to save book content: {str(e)}"}, status=500)

    _notify_user(request.user.id, "community_book_submitted", {
        "title": idx.title,
        "en": f"Your book '{idx.title}' has been submitted for review.",
        "he": f"הספר שלך '{idx.title}' הוגש לבדיקה.",
    })
    _notify_admins("community_book_submitted", {
        "title": idx.title,
        "submitter": username,
        "submitter_id": request.user.id,
        "en": f"New community book submission: '{idx.title}' by {username}",
        "he": f"הגשת ספר קהילתי חדש: '{idx.title}' מאת {username}",
    })

    return JsonResponse({"status": "submitted", "index_title": idx.title}, status=201)
