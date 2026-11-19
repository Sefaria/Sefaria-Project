"""Editor uploads (PLAN.md §2.11, S-11): PNG, JPEG, GIF and WebP only, checked by decoding with Pillow; at most
5 MB; stored under developers/ with a content-derived name; staff only."""

import hashlib
import io

import pytest

from .editor_helpers import (  # noqa: F401
    EditorClient,
    assert_shape,
    editor_urls,
    make_user,
    media_storage,
)

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("editor_urls", "media_storage")]


def image_bytes(fmt, size=(4, 3), color=(200, 30, 30)):
    from PIL import Image  # noqa: PLC0415

    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format=fmt)
    return buffer.getvalue()


@pytest.fixture
def staff():
    return make_user("upload-staff", staff=True)


@pytest.fixture
def client(staff):
    return EditorClient(staff)


@pytest.mark.parametrize(
    ("fmt", "content_type", "ext"),
    [
        ("PNG", "image/png", "png"),
        ("JPEG", "image/jpeg", "jpg"),
        ("GIF", "image/gif", "gif"),
        ("WEBP", "image/webp", "webp"),
    ],
)
def test_accepts_the_four_image_types(client, staff, media_storage, fmt, content_type, ext):  # noqa: F811
    from devportal.models import EditorAuditLog, MediaAsset  # noqa: PLC0415

    data = image_bytes(fmt)
    response = client.upload(f"My Screenshot (1).{ext}", data, content_type)
    assert response.status_code == 201, response.content
    payload = response.json()
    assert_shape("editor-upload-response", payload)
    assert payload["created"] is True
    asset = payload["asset"]
    sha = hashlib.sha256(data).hexdigest()
    assert (asset["contentType"], asset["size"], asset["width"], asset["height"], asset["sha256"]) == (
        content_type,
        len(data),
        4,
        3,
        sha,
    )
    row = MediaAsset.objects.get(pk=asset["id"])
    assert row.gcs_path == f"developers/{sha[:16]}-my-screenshot-1.{ext}"
    assert row.uploaded_by == staff and row.source_url is None
    assert row.url == f"/media/{row.gcs_path}"
    assert asset["url"].endswith(f"/media/{row.gcs_path}") and asset["url"].startswith("http")
    assert (media_storage.root / row.gcs_path).read_bytes() == data
    assert EditorAuditLog.objects.filter(action="upload", user=staff).count() == 1


def test_same_bytes_return_the_existing_asset(client):
    data = image_bytes("PNG")
    first = client.upload("a.png", data, "image/png").json()
    response = client.upload("b.png", data, "image/png")
    assert response.status_code == 200
    payload = response.json()
    assert_shape("editor-upload-response", payload)
    assert payload["created"] is False
    assert payload["asset"]["id"] == first["asset"]["id"]


def test_stored_name_comes_from_the_content_not_the_client(client):
    from devportal.models import MediaAsset  # noqa: PLC0415

    data = image_bytes("PNG", color=(1, 2, 3))
    response = client.upload("../../etc/passwd<script>.php", data, "image/png")
    assert response.status_code == 201
    path = MediaAsset.objects.get(pk=response.json()["asset"]["id"]).gcs_path
    assert path.startswith("developers/" + hashlib.sha256(data).hexdigest()[:16] + "-")
    assert path.endswith(".png")
    assert ".." not in path and "<" not in path and path.count("/") == 1


SVG = b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="1"/></svg>'
HTML = b"<!doctype html><html><body><script>alert(1)</script></body></html>"


@pytest.mark.parametrize(
    ("name", "data", "content_type"),
    [
        ("x.svg", SVG, "image/svg+xml"),
        ("x.svg", SVG, "image/png"),
        ("x.html", HTML, "text/html"),
        ("x.png", HTML, "image/png"),
        ("x.png", b"\x89PNG\r\n\x1a\n" + b"\0" * 64, "image/png"),  # a PNG signature with no image
        ("x.jpg", None, "image/jpeg"),  # PNG bytes claimed as JPEG
        ("x.png", None, "image/gif"),
        ("x.bmp", "BMP", "image/bmp"),
        ("x.tiff", "TIFF", "image/tiff"),
    ],
)
def test_rejects_non_images_and_mismatched_types(client, name, data, content_type):
    from devportal.models import EditorAuditLog, MediaAsset  # noqa: PLC0415

    if data is None:
        data = image_bytes("PNG")
    elif isinstance(data, str):
        data = image_bytes(data)
    response = client.upload(name, data, content_type)
    assert response.status_code == 415, response.content
    assert_shape("error-response", response.json())
    assert response.json()["error"]["code"] == "unsupported_media_type"
    assert not MediaAsset.objects.exists()
    assert not EditorAuditLog.objects.filter(action="upload").exists()


def test_rejects_files_over_5_mb(client):
    from devportal.models import MediaAsset  # noqa: PLC0415

    data = image_bytes("PNG") + b"\0" * (5 * 1024 * 1024)
    response = client.upload("big.png", data, "image/png")
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"
    assert not MediaAsset.objects.exists()


def test_accepts_an_image_of_exactly_5_mb_limit_minus_padding(client):
    from PIL import Image  # noqa: PLC0415

    buffer = io.BytesIO()
    Image.effect_noise((1100, 1100), 64).convert("RGB").save(buffer, format="PNG")
    data = buffer.getvalue()
    assert 1024 * 1024 < len(data) <= 5 * 1024 * 1024
    assert client.upload("noise.png", data, "image/png").status_code == 201


def test_missing_file_part_and_non_multipart(client):
    response = client.client.post("/_portal/editor/uploads", {}, HTTP_X_CSRFTOKEN=client.token)
    assert response.status_code == 400
    response = client.post("/_portal/editor/uploads", {"file": "x"})
    assert response.status_code == 415


def test_non_staff_cannot_upload():
    from devportal.models import MediaAsset  # noqa: PLC0415

    response = EditorClient(make_user("reader")).upload("a.png", image_bytes("PNG"), "image/png")
    assert response.status_code == 403
    assert not MediaAsset.objects.exists()
