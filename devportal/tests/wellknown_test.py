"""The `.well-known` discovery files, `/openapi/sefaria-api.json` and `/docs.md` (PLAN.md §2.10, C9)."""

import hashlib
import json

import pytest

from devportal.spec import DEFAULT_SPEC_PATH

from .machine_helpers import LIVE_MACHINE, LIVE_ORIGIN, URLCONF, client, origin, to_live_host

pytestmark = [pytest.mark.django_db, pytest.mark.urls(URLCONF)]


def live(name):
    return (LIVE_MACHINE / name).read_text(encoding="utf-8")


def get(path, content_type):
    response = client().get(path)
    assert response.status_code == 200
    assert response["Content-Type"] == content_type
    return response


def test_api_catalog():
    response = get("/.well-known/api-catalog", "application/linkset+json; charset=utf-8")
    assert to_live_host(response.content.decode()) == live("wk_.well-known_api-catalog")
    assert response["Cache-Control"] == "public, max-age=300"


def test_skill_md():
    response = get("/.well-known/agent-skills/read-the-docs/SKILL.md", "text/markdown; charset=utf-8")
    assert to_live_host(response.content.decode()) == live("read-the-docs-SKILL.md")


def test_agent_skills_index_digest_is_recomputed():
    skill = client().get("/.well-known/agent-skills/read-the-docs/SKILL.md").content
    response = get("/.well-known/agent-skills/index.json", "application/json; charset=utf-8")
    data = response.json()
    assert data["skills"][0]["digest"] == "sha256:" + hashlib.sha256(skill).hexdigest()
    assert data["skills"][0]["url"] == f"{origin()}/.well-known/agent-skills/read-the-docs/SKILL.md"
    # Apart from the host (and so the digest), byte-equal to live.
    ours = to_live_host(response.content.decode())
    live_text = live("wk_.well-known_agent-skills_index.json")
    live_digest = json.loads(live_text)["skills"][0]["digest"]
    assert ours.replace(data["skills"][0]["digest"], live_digest) == live_text


def test_live_digest_matches_lives_skill_file():
    """Guards the recomputation: live's digest is the sha256 of live's SKILL.md bytes."""
    data = json.loads(live("wk_.well-known_agent-skills_index.json"))
    digest = hashlib.sha256((LIVE_MACHINE / "read-the-docs-SKILL.md").read_bytes()).hexdigest()
    assert data["skills"][0]["digest"] == f"sha256:{digest}"


def test_server_card():
    response = get("/.well-known/mcp/server-card.json", "application/json; charset=utf-8")
    text = to_live_host(response.content.decode())
    assert response.json()["name"] == "org.sefaria/developers"
    assert response.json()["remotes"] == [{"type": "streamable-http", "url": f"{origin()}/mcp"}]
    assert text == live("mcp-server-card.json").replace('"com.readme/sefaria"', '"org.sefaria/developers"')


def test_host_comes_from_the_request():
    from django.test import Client  # noqa: PLC0415

    from .portal_helpers import is_standalone  # noqa: PLC0415

    if not is_standalone():
        pytest.skip("the standalone settings accept the developers.localhost host")
    other = Client(HTTP_HOST="developers.localhost")
    data = other.get("/.well-known/mcp/server-card.json").json()
    assert data["remotes"][0]["url"] == "http://developers.localhost/mcp"
    assert (
        "http://developers.localhost/llms.txt"
        in other.get("/.well-known/agent-skills/read-the-docs/SKILL.md").content.decode()
    )
    assert LIVE_ORIGIN not in other.get("/.well-known/api-catalog").content.decode()


def test_openapi_json():
    response = get("/openapi/sefaria-api.json", "application/json; charset=utf-8")
    assert response.content == DEFAULT_SPEC_PATH.read_bytes()


def test_docs_md_redirects():
    response = client().get("/docs.md")
    assert response.status_code == 302
    assert response["Location"] == "/docs/llms.txt"


@pytest.mark.parametrize(
    "path",
    [
        "/.well-known/api-catalog",
        "/.well-known/agent-skills/index.json",
        "/.well-known/agent-skills/read-the-docs/SKILL.md",
        "/.well-known/mcp/server-card.json",
        "/openapi/sefaria-api.json",
    ],
)
def test_safe_methods_only(path):
    assert client().post(path).status_code == 405
    assert client().head(path).status_code == 200
