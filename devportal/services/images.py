"""Mirror external images into the portal's media store (PLAN.md §7.3).

`mirror_images()` finds every image URL in published content that is not in the media store
(today 39 `files.readme.io` URLs and one `i.imgur.com` URL), downloads each, checks it (a raster
image must decode as PNG, JPEG, GIF or WebP; an SVG must have no script, event handler or external
reference), stores it at `developers/<sha256-prefix>-<name>`, and records a `MediaAsset` whose
unique `source_url` makes a second run a no-op. Each affected page then gets one new revision with
the URLs replaced, which is published.

A mirror revision is a mechanical rewrite. It is recorded with source `import` on a page with no
local edits (so the re-import does not mistake it for one) and `editor` on a page that has them
(so they stay protected). The import applies the recorded assets to the pages it writes, so a
re-import never brings the original URLs back.

The download needs network access to the image hosts; storage needs Google Cloud credentials in
deployed pods (`devportal.adapters.storage`). Tests pass a fake `fetch` and a fake storage.
"""

import hashlib
import io
import logging
import re
from dataclasses import asdict, dataclass, field
from urllib.parse import unquote, urlsplit

from django.db import transaction

from devportal.adapters import markdown as md
from devportal.adapters import storage as storage_adapter
from devportal.models import MediaAsset, Page, RevisionSource
from devportal.services import publish

logger = logging.getLogger("devportal")

MAX_BYTES = 15 * 1024 * 1024
RASTER_FORMATS = {"PNG": "image/png", "JPEG": "image/jpeg", "GIF": "image/gif", "WEBP": "image/webp"}
SVG_TYPE = "image/svg+xml"
_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


class RefusedImage(Exception):
    pass


@dataclass
class MirrorReport:
    found: list = field(default_factory=list)  # distinct external URLs
    created: list = field(default_factory=list)  # URLs stored this run
    reused: list = field(default_factory=list)  # URLs with an existing MediaAsset
    refused: list = field(default_factory=list)  # {"url", "reason"}
    failed: list = field(default_factory=list)  # {"url", "error"}
    pages_updated: list = field(default_factory=list)

    def as_dict(self):
        return asdict(self)


def is_external(url):
    return url.startswith(("http://", "https://")) and not storage_adapter.is_media_url(url)


def find_external_images(pages=None):
    """`{url: [page, ...]}` for every external image in published, non-deleted pages."""
    if pages is None:
        pages = Page.objects.filter(deleted_at__isnull=True).exclude(published_revision=None)
    found = {}
    for page in pages.select_related("published_revision").order_by("section", "id"):
        for url in md.image_sources(page.published_revision.body_md):
            if is_external(url):
                found.setdefault(url, [])
                if page not in found[url]:
                    found[url].append(page)
    return found


MAX_REDIRECTS = 5


def check_public_url(url, resolve=None):
    """Raise `RefusedImage` unless `url` is http(s) on a host whose every address is public.

    The image URLs come from page content (staff-written, or imported), and the download runs inside the
    cluster: without this check a URL such as `http://169.254.169.254/...` or `http://localhost:8000/...`
    would make the server fetch an internal address (SSRF). Every redirect hop is checked the same way.
    """
    import ipaddress  # noqa: PLC0415
    import socket  # noqa: PLC0415

    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password:
        msg = "not a plain http(s) URL"
        raise RefusedImage(msg)
    resolve = resolve or socket.getaddrinfo
    try:
        infos = resolve(
            parts.hostname, parts.port or (443 if parts.scheme == "https" else 80), proto=socket.IPPROTO_TCP
        )
    except (OSError, UnicodeError) as exc:
        msg = f"the host does not resolve: {exc}"
        raise RefusedImage(msg) from exc
    addresses = {info[4][0] for info in infos}
    if not addresses:
        msg = "the host does not resolve"
        raise RefusedImage(msg)
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
        if not ip.is_global or ip.is_multicast:
            msg = f"the host resolves to a non-public address ({ip})"
            raise RefusedImage(msg)


def fetch_url(url, *, get=None, resolve=None):
    """GET an image. Returns its bytes. Only public http(s) hosts, checked again on every redirect hop."""
    if get is None:
        import requests  # noqa: PLC0415

        get = requests.get
    from urllib.parse import urljoin  # noqa: PLC0415

    for _hop in range(MAX_REDIRECTS + 1):
        check_public_url(url, resolve)
        with get(url, timeout=30, stream=True, allow_redirects=False) as response:
            if response.is_redirect:
                url = urljoin(url, response.headers["Location"])
                continue
            response.raise_for_status()
            data = io.BytesIO()
            for chunk in response.iter_content(65536):
                data.write(chunk)
                if data.tell() > MAX_BYTES:
                    msg = "larger than the size limit"
                    raise RefusedImage(msg)
            return data.getvalue()
    msg = "too many redirects"
    raise RefusedImage(msg)


def check_svg(data):
    """Raise `RefusedImage` unless the SVG has no script, event handler or external reference."""
    from lxml import etree

    text = data.decode("utf-8", errors="strict") if isinstance(data, bytes) else data
    if re.search(r"<!(DOCTYPE|ENTITY)", text, re.IGNORECASE):
        msg = "SVG with a DOCTYPE or entity declaration"
        raise RefusedImage(msg)
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)
    try:
        root = etree.fromstring(text.encode("utf-8"), parser=parser)
    except etree.XMLSyntaxError as exc:
        msg = f"not well-formed SVG: {exc}"
        raise RefusedImage(msg) from exc
    if etree.QName(root).localname != "svg":
        msg = "not an SVG document"
        raise RefusedImage(msg)
    for el in root.iter():
        if not isinstance(el.tag, str):
            continue
        name = etree.QName(el).localname.lower()
        if name in ("script", "foreignobject", "iframe", "embed", "object"):
            msg = f"SVG contains <{name}>"
            raise RefusedImage(msg)
        if name == "style" and _external_ref(el.text or ""):
            msg = "SVG style references an external resource"
            raise RefusedImage(msg)
        for attr, value in el.attrib.items():
            local = etree.QName(attr).localname.lower()
            if local.startswith("on"):
                msg = f"SVG has an event handler attribute ({local})"
                raise RefusedImage(msg)
            if local in ("href", "src") and not value.strip().startswith(("#", "data:image/png", "data:image/jpeg")):
                msg = f"SVG has an external reference ({value[:60]})"
                raise RefusedImage(msg)
            if _external_ref(value):
                msg = "SVG attribute references an external resource"
                raise RefusedImage(msg)


def _external_ref(text):
    for m in re.finditer(r"url\(\s*['\"]?([^'\")]*)", text, re.IGNORECASE):
        if not m.group(1).strip().startswith("#"):
            return True
    return bool(re.search(r"@import", text, re.IGNORECASE))


def inspect(data, url):
    """`(content_type, width, height)` for an acceptable image; raise `RefusedImage` otherwise."""
    if len(data) > MAX_BYTES:
        msg = "larger than the size limit"
        raise RefusedImage(msg)
    head = data[:512].lstrip()
    if urlsplit(url).path.lower().endswith(".svg") or head.startswith((b"<svg", b"<?xml")):
        check_svg(data)
        return SVG_TYPE, None, None
    from PIL import Image

    try:
        with Image.open(io.BytesIO(data)) as img:
            fmt = img.format
            width, height = img.size
            img.verify()
    except Exception as exc:
        msg = f"does not decode as an image: {exc}"
        raise RefusedImage(msg) from exc
    if fmt not in RASTER_FORMATS:
        msg = f"unsupported image format {fmt}"
        raise RefusedImage(msg)
    return RASTER_FORMATS[fmt], width, height


def storage_name(sha256, url):
    base = unquote(urlsplit(url).path.rsplit("/", 1)[-1]) or "image"
    base = _SAFE_NAME.sub("_", base).strip("._") or "image"
    return f"{storage_adapter.PREFIX}{sha256[:16]}-{base[-80:]}"


def asset_map():
    """`{source_url: url}` of every mirrored asset."""
    return dict(MediaAsset.objects.exclude(source_url=None).values_list("source_url", "url"))


def replace_urls(body, mapping):
    for old in sorted(mapping, key=len, reverse=True):
        if old in body:
            body = body.replace(old, mapping[old])
    return body


def mirror_images(*, fetch=None, storage=None, rebuild=True):
    """Mirror every external image. Idempotent. Returns a `MirrorReport`."""
    fetch = fetch or fetch_url
    storage = storage or storage_adapter.get_storage()
    report = MirrorReport()
    found = find_external_images()
    report.found = sorted(found)
    mapping = {}
    for url in report.found:
        asset = MediaAsset.objects.filter(source_url=url).first()
        if asset is not None:
            mapping[url] = asset.url
            report.reused.append(url)
            continue
        try:
            data = fetch(url)
            content_type, width, height = inspect(data, url)
        except RefusedImage as exc:
            report.refused.append({"url": url, "reason": str(exc)})
            logger.warning("devportal: refused image %s: %s", url, exc)
            continue
        except Exception as exc:
            report.failed.append({"url": url, "error": f"{type(exc).__name__}: {exc}"})
            logger.exception("devportal: could not download %s", url)
            continue
        sha = hashlib.sha256(data).hexdigest()
        name = storage_name(sha, url)
        stored_url = storage.save(name, data, content_type)
        MediaAsset.objects.create(
            gcs_path=name,
            url=stored_url,
            content_type=content_type,
            size=len(data),
            width=width,
            height=height,
            sha256=sha,
            source_url=url,
        )
        mapping[url] = stored_url
        report.created.append(url)
    pages = {}
    for url, url_pages in found.items():
        if url in mapping:
            for page in url_pages:
                pages[page.pk] = page
    from devportal.services.seed import Importer

    with transaction.atomic():
        for page in pages.values():
            current = page.published_revision
            body = replace_urls(current.body_md, mapping)
            if body == current.body_md:
                continue
            source = RevisionSource.EDITOR if Importer.locally_edited(page) else RevisionSource.IMPORT
            pending = page.draft_revision  # an unpublished editor draft stays the draft
            revision = publish.create_revision(page, source=source, base=current, body_md=body)
            publish.publish(page, revision, content_updated_at=page.content_updated_at, rebuild=False)
            if pending is not None:
                Page.objects.filter(pk=page.pk).update(draft_revision=pending)
            report.pages_updated.append(f"{page.section}/{page.slug}")
    if report.pages_updated and rebuild:
        publish.schedule_rebuild()
    return report
