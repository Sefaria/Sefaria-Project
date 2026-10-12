"""Explicitly configured dev-only ES transport; no target supplied by browsers."""
import base64
import json
import re
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def validate_target(url, index, allowed_hosts):
    parsed = urlparse(url)
    if (parsed.scheme not in ("http", "https") or parsed.hostname not in allowed_hosts
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ("", "/")):
        raise ValueError("Elasticsearch target must be an explicitly allowed dev host without embedded credentials or a path")
    if not re.fullmatch(r"lemma-poc-[a-z0-9-]+", index):
        raise ValueError("Only dedicated lemma-poc- indexes are allowed")


def transport(base, username="", password="", writable=False):
    base = base.rstrip("/")
    def request(url, method="GET", body=None, ndjson=False):
        if not (url == base or url.startswith(base + "/")):
            raise ValueError("Request outside configured Elasticsearch destination")
        if not writable and not (method == "GET" or method == "POST" and url.endswith("/_search")):
            raise ValueError("Query worker cannot write to Elasticsearch")
        data = body.encode() if ndjson else (json.dumps(body).encode() if body is not None else None)
        headers = {"Content-Type":"application/x-ndjson" if ndjson else "application/json"}
        if username:
            headers["Authorization"] = "Basic " + base64.b64encode((username+":"+password).encode()).decode()
        req = Request(url,data=data,method=method,headers=headers)
        try:
            with urlopen(req,timeout=30) as response:
                return json.load(response)
        except HTTPError:
            raise
        except URLError as error:
            raise ConnectionError("Cannot reach configured experimental Elasticsearch") from error
    return request
