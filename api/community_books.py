import copy
import json
import time
import re
import math
from datetime import datetime, timedelta

from django.http import JsonResponse
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
DOCX_MAGIC = b'PK\x03\x04'


class CommunityBookStatus:
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"
    ALL = [SUBMITTED, APPROVED, REJECTED, WITHDRAWN]


try:
    from django.conf import settings
    COMMUNITY_BOOK_ADMIN_IDS = getattr(settings, 'COMMUNITY_BOOK_ADMIN_IDS', [])
except ImportError:
    COMMUNITY_BOOK_ADMIN_IDS = []


# --- Helpers ---

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
        "communityBook.status": CommunityBookStatus.SUBMITTED,
    })
    if pending_count >= MAX_PENDING_SUBMISSIONS:
        return JsonResponse(
            {"error": f"Maximum {MAX_PENDING_SUBMISSIONS} pending submissions"},
            status=429,
        )
    return None


def _sanitize_filename(name):
    return re.sub(r'[^a-zA-Z0-9_\-.]', '-', name)[:100] or "unnamed"


def _parse_int_param(value, default, valid_range=None):
    try:
        result = int(value) if value is not None else default
    except (ValueError, TypeError):
        return None
    if valid_range and result not in valid_range:
        return None
    return result


def _check_title_uniqueness(title_en, title_he, user_id):
    for title in [title_en, title_he]:
        if not title:
            continue
        existing = Index().load({"title": title})
        if existing:
            if (existing.is_community_book
                    and existing.communityBook.get("submittedBy") == user_id
                    and existing.communityBook.get("status") in (
                        CommunityBookStatus.REJECTED, CommunityBookStatus.WITHDRAWN)):
                continue
            return JsonResponse(
                {"error": f'A text with the title "{title}" already exists.'},
                status=409,
            )
    return None


def _validate_docx_file(uploaded_file):
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
    header = uploaded_file.read(4)
    uploaded_file.seek(0)
    if header != DOCX_MAGIC:
        return JsonResponse({"error": "File does not appear to be a valid .docx document"}, status=400)
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


def _build_community_book_dict(user_id):
    return {
        "status": CommunityBookStatus.SUBMITTED,
        "submittedBy": user_id,
        "submittedAt": datetime.utcnow(),
        "reviewedBy": None,
        "rejectionReason": None,
    }


def _load_community_book(title):
    if len(title) > 500:
        return None, JsonResponse({"error": "Invalid title"}, status=400)
    idx = Index().load({"title": title})
    if not idx:
        return None, JsonResponse({"error": "Book not found"}, status=404)
    if not idx.is_community_book:
        return None, JsonResponse({"error": "Not a community book"}, status=400)
    return idx, None


def _build_preview(result, depth):
    return {
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


def _create_or_update_index(payload, schema, user):
    existing_index = Index().load({"title": payload["title_en"]})

    if existing_index and existing_index.is_community_book:
        if (existing_index.communityBook.get("submittedBy") == user.id
                and existing_index.communityBook.get("status") in (
                    CommunityBookStatus.REJECTED, CommunityBookStatus.WITHDRAWN)):
            original_cb = copy.deepcopy(existing_index.communityBook)
            original_schema = copy.deepcopy(existing_index.schema) if hasattr(existing_index, 'schema') else None

            version_count = VersionSet({"title": payload["title_en"]}).count()
            logger.info("Deleting existing versions for resubmission",
                        title=payload["title_en"], count=version_count)
            VersionSet({"title": payload["title_en"]}).delete()

            existing_index.schema = schema
            existing_index.enDesc = payload["description_en"]
            existing_index.heDesc = payload["description_he"]
            existing_index.communityBook = _build_community_book_dict(user.id)
            existing_index.hidden = True
            try:
                existing_index.save(override_dependencies=True)
            except InputError as e:
                existing_index.communityBook = original_cb
                existing_index.schema = original_schema
                existing_index.save(override_dependencies=True)
                logger.error("Index update failed, restored original state", error=str(e))
                return None, JsonResponse({"error": "Failed to update book. Please try again."}, status=500)
            return existing_index, None
        else:
            return None, JsonResponse({"error": "A text with this title already exists."}, status=409)

    idx = Index({
        "title": payload["title_en"],
        "categories": ["Community"],
        "schema": schema,
        "communityBook": _build_community_book_dict(user.id),
        "hidden": True,
        "enDesc": payload["description_en"],
        "heDesc": payload["description_he"],
    })
    try:
        idx.save(override_dependencies=True)
    except InputError as e:
        logger.error("Index creation failed", error=str(e), title=payload["title_en"])
        return None, JsonResponse({"error": "Failed to save book. Please try again."}, status=500)
    return idx, None


def _create_version(idx, payload, jagged_array, user, is_resubmission):
    lang = payload["language"]
    if lang in ("he", "heb", "hebrew"):
        version_lang = "he"
        direction = "rtl"
    else:
        version_lang = "en"
        direction = "ltr"

    username = user.first_name or user.username

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
    except (InputError, Exception) as e:
        if not is_resubmission:
            idx.delete()
        logger.error("Version save failed, rolled back Index", error=str(e), title=idx.title)
        return JsonResponse({"error": "Failed to save book content. Please try again."}, status=500)
    return None


# --- Views ---

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

    file_err = _validate_docx_file(request.FILES.get("file"))
    if file_err:
        return file_err
    uploaded_file = request.FILES["file"]

    title_en = request.POST.get("title_en", "").strip()
    title_he = request.POST.get("title_he", "").strip()
    language = request.POST.get("language", "en").strip()
    description_en = request.POST.get("description_en", "").strip()
    description_he = request.POST.get("description_he", "").strip()

    depth = _parse_int_param(request.POST.get("depth"), 1, valid_range=(1, 2))
    if depth is None:
        return JsonResponse({"error": "depth must be 1 or 2"}, status=400)

    if not title_en:
        return JsonResponse({"error": "English title is required"}, status=400)

    title_err = _check_title_uniqueness(title_en, title_he, user_id)
    if title_err:
        return title_err

    # Parse first — only upload to GCS if content is valid
    try:
        result = parse_document(uploaded_file, "docx", depth)
    except ParseError as e:
        return JsonResponse({"error": str(e)}, status=400)

    uploaded_file.seek(0)
    safe_name = _sanitize_filename(uploaded_file.name)
    gcs_path = f"uploads/{user_id}/{int(time.time())}_{safe_name}"
    try:
        gcs_url = GoogleStorageManager.upload_file(
            uploaded_file, gcs_path, GoogleStorageManager.COMMUNITY_BOOKS_BUCKET
        )
    except Exception as e:
        logger.error("GCS upload failed", error=str(e))
        return JsonResponse({"error": "File upload failed. Please try again."}, status=500)

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

    return JsonResponse({
        "status": "success",
        "preview": _build_preview(result, depth),
        "upload_token": upload_token,
    })


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

    # Re-check title uniqueness (may have changed since upload)
    title_err = _check_title_uniqueness(payload["title_en"], payload["title_he"], request.user.id)
    if title_err:
        return title_err

    try:
        file_obj = GoogleStorageManager.get_filename(
            payload["gcs_path"], GoogleStorageManager.COMMUNITY_BOOKS_BUCKET
        )
    except Exception as e:
        logger.error("GCS download failed", error=str(e))
        return JsonResponse({"error": "Failed to retrieve uploaded file. Please try again."}, status=500)

    try:
        result = parse_document(file_obj, "docx", payload["depth"])
    except ParseError as e:
        return JsonResponse({"error": str(e)}, status=400)

    jagged_array = build_jagged_array(result)
    schema = build_schema(payload["depth"], payload["title_en"], payload["title_he"] or payload["title_en"])

    idx, err = _create_or_update_index(payload, schema, request.user)
    if err:
        return err

    is_resubmission = Index().load({"title": payload["title_en"]}) is not None
    version_err = _create_version(idx, payload, jagged_array, request.user, is_resubmission)
    if version_err:
        return version_err

    username = request.user.first_name or request.user.username
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

    return JsonResponse({"status": CommunityBookStatus.SUBMITTED, "index_title": idx.title}, status=201)


def list_books(request):
    if request.method != "GET":
        return JsonResponse({"error": "GET required"}, status=405)

    from sefaria.system.database import db

    mine = request.GET.get("mine") == "true"
    status_filter = request.GET.get("status")

    page = _parse_int_param(request.GET.get("page"), 1)
    if page is None or page < 1:
        return JsonResponse({"error": "page must be a positive integer"}, status=400)

    limit = _parse_int_param(request.GET.get("limit"), 20)
    if limit is None or limit < 1 or limit > 100:
        return JsonResponse({"error": "limit must be between 1 and 100"}, status=400)

    skip = (page - 1) * limit
    query = {"communityBook": {"$exists": True}}

    if mine:
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Authentication required to view your books"}, status=401)
        query["communityBook.submittedBy"] = request.user.id
    elif request.user.is_authenticated and request.user.is_staff and status_filter:
        if status_filter not in CommunityBookStatus.ALL:
            return JsonResponse({"error": "Invalid status filter"}, status=400)
        query["communityBook.status"] = status_filter
    elif not (request.user.is_authenticated and request.user.is_staff):
        query["communityBook.status"] = CommunityBookStatus.APPROVED

    total = db.index.count_documents(query)
    docs = list(db.index.find(query).sort("communityBook.submittedAt", -1).skip(skip).limit(limit))

    # Batch-load users and versions to avoid N+1
    submitter_ids = {doc.get("communityBook", {}).get("submittedBy") for doc in docs}
    submitter_ids.discard(None)
    users_by_id = {u.id: u for u in User.objects.filter(id__in=submitter_ids)} if submitter_ids else {}

    titles = [doc.get("title") for doc in docs]
    versions_by_title = {
        v["title"]: v for v in db.texts.find({"title": {"$in": titles}}, {"title": 1, "actualLanguage": 1})
    } if titles else {}

    books = []
    for doc in docs:
        cb = doc.get("communityBook", {})
        submitter_id = cb.get("submittedBy")
        user = users_by_id.get(submitter_id)
        submitter_name = (user.first_name or user.username) if user else "Unknown"

        version_doc = versions_by_title.get(doc.get("title"))
        book_language = version_doc.get("actualLanguage", "en") if version_doc else "en"

        books.append({
            "title": doc.get("title"),
            "submitter": submitter_name,
            "description": {
                "en": doc.get("enDesc", ""),
                "he": doc.get("heDesc", ""),
            },
            "language": book_language,
            "status": cb.get("status"),
            "submittedAt": cb.get("submittedAt").isoformat() if cb.get("submittedAt") else None,
            "categories": doc.get("categories", []),
        })

    return JsonResponse({
        "books": books,
        "total": total,
        "page": page,
        "pages": math.ceil(total / limit) if total > 0 else 0,
    })


@staff_member_required
def approve(request, title):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    idx, err = _load_community_book(title)
    if err:
        return err
    if idx.communityBook.get("status") != CommunityBookStatus.SUBMITTED:
        return JsonResponse({"error": "Can only approve submitted books"}, status=400)

    idx.communityBook["status"] = CommunityBookStatus.APPROVED
    idx.communityBook["reviewedBy"] = request.user.id
    idx.hidden = False
    idx.save()

    submitter_id = idx.communityBook.get("submittedBy")
    if submitter_id:
        _notify_user(submitter_id, "community_book_approved", {
            "title": idx.title,
            "en": f"Your book '{idx.title}' has been approved and is now publicly visible.",
            "he": f"הספר שלך '{idx.title}' אושר וכעת גלוי לציבור.",
        })

    return JsonResponse({"status": CommunityBookStatus.APPROVED})


@staff_member_required
def reject(request, title):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        body = {}

    reason = body.get("reason", "").strip()
    if not reason:
        return JsonResponse({"error": "Rejection reason is required"}, status=400)

    idx, err = _load_community_book(title)
    if err:
        return err
    if idx.communityBook.get("status") != CommunityBookStatus.SUBMITTED:
        return JsonResponse({"error": "Can only reject submitted books"}, status=400)

    idx.communityBook["status"] = CommunityBookStatus.REJECTED
    idx.communityBook["rejectionReason"] = reason
    idx.communityBook["reviewedBy"] = request.user.id
    idx.save()

    submitter_id = idx.communityBook.get("submittedBy")
    if submitter_id:
        _notify_user(submitter_id, "community_book_rejected", {
            "title": idx.title,
            "reason": reason,
            "en": f"Your book '{idx.title}' was not approved. Reason: {reason}",
            "he": f"הספר שלך '{idx.title}' לא אושר. סיבה: {reason}",
        })

    return JsonResponse({"status": CommunityBookStatus.REJECTED})


def withdraw(request, title):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    auth_err = _require_auth(request)
    if auth_err:
        return auth_err

    idx, err = _load_community_book(title)
    if err:
        return err
    if idx.communityBook.get("submittedBy") != request.user.id:
        return JsonResponse({"error": "Book not found"}, status=404)
    if idx.communityBook.get("status") not in (
            CommunityBookStatus.SUBMITTED, CommunityBookStatus.APPROVED):
        return JsonResponse({"error": "Can only withdraw submitted or approved books"}, status=400)

    idx.communityBook["status"] = CommunityBookStatus.WITHDRAWN
    idx.hidden = True
    idx.save()

    return JsonResponse({"status": CommunityBookStatus.WITHDRAWN})
