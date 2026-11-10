"""
Open shelf pilot: free Jewish texts outside the main library, stored in their own
collections (open_shelf_books, open_shelf_pages, open_shelf_meta) and served as plain
Django templates inside the normal site chrome.
"""
import gzip
import hashlib
import hmac
import html
import json
import re
import time
from urllib.parse import quote

from django.http import (
    Http404,
    HttpResponseBadRequest,
    HttpResponseForbidden,
    JsonResponse,
)
from django.views.decorators.csrf import csrf_exempt
from pymongo import ASCENDING, ReplaceOne

from reader.views import render_template
from sefaria.system.database import db

UPLOAD_TOKEN_SHA256 = "7255aa789ac25b856adc3aa72dbb5d78514fcca6071b3ac6f54ba763a826a551"

BOOKS_PER_PAGE = 60

SHELVES = [
    ("responsa", "Responsa", "שאלות ותשובות", "Rabbinic answers to practical questions, mostly from early printed volumes."),
    ("halakha", "Halakha", "הלכה", "Codes, rulings and halakhic works."),
    ("commentary", "Bible, Talmud & commentary", "מקרא, תלמוד ופרשנות", "Commentaries, novellae, midrash and rabbinic literature."),
    ("kabbalah", "Kabbalah, Hasidut & Musar", "קבלה, חסידות ומוסר", "Mystical, Hasidic and ethical works, sermons and thought."),
    ("hebrew-poetry", "Modern Hebrew poetry & drama", "שירה ומחזות עבריים", "Poems, plays and fables from the Ben-Yehuda Project."),
    ("hebrew-prose", "Modern Hebrew prose & essays", "סיפורת ומסות עבריות", "Stories, essays, memoirs and letters."),
    ("yiddish", "Yiddish", "יידיש", "Yiddish prose, poetry and drama."),
    ("german", "German-Jewish writing", "ספרות יהודית-גרמנית", "Books and periodicals of German Jewry."),
    ("languages", "English, Russian, Greek & more", "שפות נוספות", "Jewish texts in other languages, from the Septuagint to 19th-century America."),
    ("piyyut", "Piyyut & liturgy", "פיוט ותפילה", "Liturgical poetry, many from Cairo Genizah manuscripts."),
    ("dss", "Dead Sea Scrolls", "מגילות מדבר יהודה", "Qumran manuscripts, fragment by fragment."),
    ("inscriptions", "Inscriptions & tombstones", "כתובות ומצבות", "Gravestone inscriptions from Jewish cemeteries in Germany."),
    ("more", "History, reference & early print", "היסטוריה, עיון ודפוסים", "History, reference works and other early printed books."),
]
SHELF_MAP = {s[0]: s for s in SHELVES}

_cache = {}


def _cached(key, ttl, fn):
    hit = _cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    val = fn()
    _cache[key] = (time.time() + ttl, val)
    return val


ALLOWED_TAGS = re.compile(r'&lt;(/?)(b|i|em|strong|sup|sub|small|br|u)(\s+class="footnote")?\s*/?&gt;', re.IGNORECASE)


def _tag(m):
    cls = ' class="os-fn"' if m.group(3) and not m.group(1) else ""
    return "<%s%s%s>" % (m.group(1), m.group(2).lower(), cls)


FOOTNOTE = re.compile(r'&lt;FN&gt;(.*?)&lt;/FN&gt;', re.DOTALL | re.IGNORECASE)
HEADING_FOOTNOTE = re.compile(r'\s*\d*\s*<FN>.*?</FN>', re.DOTALL | re.IGNORECASE)
GENERIC_HEADING = re.compile(r'^\s*((Chapter|Section|Part|Book|Volume)\s+\d+|\d+\.?\s*§)\s*$', re.IGNORECASE)
BRACKETED = re.compile(r'^\s*\[\s*(.*?)\s*\]\s*$', re.DOTALL)
LANG_NAMES = {"heb": "Hebrew", "he": "Hebrew", "yid": "Yiddish", "deu": "German", "lad": "Ladino", "rus": "Russian",
              "fra": "French", "grc": "Greek", "lat": "Latin", "ita": "Italian", "pol": "Polish", "swe": "Swedish",
              "nld": "Dutch", "hun": "Hungarian", "spa": "Spanish", "eng": "English", "en": "English",
              "arc": "Aramaic", "jrb": "Judeo-Arabic", "ara": "Arabic", "obm": "Old Babylonian"}


def safe_html(s):
    escaped = html.escape(s or "", quote=False)
    escaped = FOOTNOTE.sub(r' <small class="os-fn">[\1]</small>', escaped)
    return ALLOWED_TAGS.sub(_tag, escaped)


def clean_heading(h, rtl):
    h = HEADING_FOOTNOTE.sub("", h or "").strip()
    if rtl and GENERIC_HEADING.match(h):
        return ""
    return h


def clean_title(t):
    m = BRACKETED.match(t or "")
    return m.group(1) if m else (t or "")


def book_url(book):
    return "/open-shelf/%s/%s" % (quote(book["source"]), quote(book["slug"]))


def _shelf_counts():
    rows = db.open_shelf_books.aggregate([{"$group": {"_id": "$shelf", "n": {"$sum": 1}, "w": {"$sum": "$words"}}}])
    return {r["_id"]: (r["n"], r["w"]) for r in rows}


def landing(request):
    hero = db.open_shelf_meta.find_one({"_id": "hero"}) or {}
    counts = _cached("shelf_counts", 30, _shelf_counts)
    shelves = []
    for key, en, he, blurb in SHELVES:
        n, w = counts.get(key, (0, 0))
        if n:
            shelves.append({"key": key, "en": en, "he": he, "blurb": blurb, "books": n, "words": w})
    return render_template(request, "open_shelf/landing.html", None, {
        "title": "Open Shelf",
        "hero": hero,
        "shelves": shelves,
        "total_books": sum(s["books"] for s in shelves),
    })


def shelf(request, key):
    if key not in SHELF_MAP:
        raise Http404
    _, en, he, blurb = SHELF_MAP[key]
    try:
        page = max(1, int(request.GET.get("page", 1)))
    except ValueError:
        page = 1
    total = db.open_shelf_books.count_documents({"shelf": key})
    cur = (db.open_shelf_books.find({"shelf": key}, {"display_title": 1, "title": 1, "authors": 1, "source": 1, "slug": 1,
                                                       "source_name": 1, "words": 1, "dir": 1, "date": 1, "languages": 1})
           .sort([("sort_key", ASCENDING)]).skip((page - 1) * BOOKS_PER_PAGE).limit(BOOKS_PER_PAGE))
    books = []
    for b in cur:
        b["url"] = book_url(b)
        b["display_title"] = clean_title(b.get("display_title"))
        books.append(b)
    pages = max(1, (total + BOOKS_PER_PAGE - 1) // BOOKS_PER_PAGE)
    return render_template(request, "open_shelf/shelf.html", None, {
        "title": "%s | Open Shelf" % en,
        "shelf": {"key": key, "en": en, "he": he, "blurb": blurb},
        "books": books, "total": total, "page": page, "pages": pages,
        "prev_page": page - 1 if page > 1 else None,
        "next_page": page + 1 if page < pages else None,
    })


def reader(request, source, slug):
    book = db.open_shelf_books.find_one({"source": source, "slug": slug.rstrip("/")})
    if not book:
        raise Http404
    try:
        p = int(request.GET.get("p", 1))
    except ValueError:
        p = 1
    p = min(max(1, p), book.get("num_pages", 1))
    page = db.open_shelf_pages.find_one({"_id": "%s|%d" % (book["_id"], p)}) or {"blocks": [], "ctx": []}
    rtl = book.get("dir") == "rtl"
    raw_title = book.get("display_title", "")
    book["display_title"] = clean_title(raw_title)
    book["language_names"] = [LANG_NAMES.get(c, c) for c in book.get("languages") or []]
    blocks = []
    for blk in page.get("blocks", []):
        if "h" in blk:
            h = clean_heading(blk["h"], rtl)
            if h:
                blocks.append({"h": h, "d": min(blk.get("d", 0), 3)})
        else:
            blocks.append({"s": safe_html(blk.get("s", ""))})
    url = book_url(book)
    shelf_info = SHELF_MAP.get(book.get("shelf"), SHELVES[-1])
    toc = []
    for t in book.get("toc", []):
        label = clean_heading(t.get("l"), rtl)
        if label:
            toc.append(dict(t, l=label))
    ctx = [c for c in (clean_heading(c, rtl) for c in page.get("ctx", [])) if c]
    preamble = book.get("preamble") if p == 1 else None
    if preamble:
        text = preamble.get("text", "").replace("https://www.sefaria.org/open-shelf/", request.build_absolute_uri("/open-shelf/"))
        if raw_title != book["display_title"]:
            text = text.replace(raw_title, book["display_title"])
        preamble = dict(preamble, text=text)
    return render_template(request, "open_shelf/reader.html", None, {
        "title": "%s | Open Shelf" % book.get("display_title", ""),
        "book": book,
        "url": url,
        "p": p,
        "num_pages": book.get("num_pages", 1),
        "prev_p": p - 1 if p > 1 else None,
        "next_p": p + 1 if p < book.get("num_pages", 1) else None,
        "ctx": ctx,
        "blocks": blocks,
        "toc": toc,
        "shelf": {"key": shelf_info[0], "en": shelf_info[1]},
        "preamble": preamble,
    })


def _authorized(request):
    token = request.headers.get("X-Open-Shelf-Token", "")
    digest = hashlib.sha256(token.encode()).hexdigest()
    return bool(token) and hmac.compare_digest(digest, UPLOAD_TOKEN_SHA256)


_indexes_ready = False


def _ensure_indexes():
    global _indexes_ready
    if _indexes_ready:
        return
    db.open_shelf_books.create_index([("shelf", ASCENDING), ("sort_key", ASCENDING)])
    db.open_shelf_books.create_index([("source", ASCENDING), ("slug", ASCENDING)])
    db.open_shelf_pages.create_index([("book_id", ASCENDING)])
    _indexes_ready = True


@csrf_exempt
def upload_api(request):
    if not _authorized(request):
        return HttpResponseForbidden("bad token")
    if request.method == "GET":
        ids = [d["_id"] for d in db.open_shelf_books.find({}, {"_id": 1})]
        return JsonResponse({"ids": ids})
    if request.method != "POST":
        return HttpResponseBadRequest("POST or GET")
    raw = request.read()
    if request.headers.get("X-Gzip") == "1":
        raw = gzip.decompress(raw)
    payload = json.loads(raw)
    _ensure_indexes()
    ops = {"pages": [], "books": [], "meta": []}
    for item in payload.get("items", []):
        c = item["c"]
        if c in ops:
            ops[c].append(ReplaceOne({"_id": item["doc"]["_id"]}, item["doc"], upsert=True))
    counts = {}
    for c in ("pages", "books", "meta"):
        if ops[c]:
            getattr(db, "open_shelf_" + c).bulk_write(ops[c], ordered=False)
        counts[c] = len(ops[c])
    if payload.get("delete_pages_for"):
        for book_id, keep in payload["delete_pages_for"].items():
            db.open_shelf_pages.delete_many({"book_id": book_id, "n": {"$gt": keep}})
    _cache.pop("shelf_counts", None)
    return JsonResponse({"ok": True, "counts": counts})
