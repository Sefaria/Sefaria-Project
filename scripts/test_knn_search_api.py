#!/usr/bin/env python3
"""
Smoke-test script for POST /api/knn-search.

Usage:
    python scripts/test_knn_search_api.py [--base-url URL] [--token TOKEN]

Defaults:
    base_url = https://knn-api.cauldron.sefaria.org
    token    = read from SEMANTIC_SEARCH_API_TOKEN env var

Each test prints PASS / FAIL with a short description.
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error


def _parse_body(raw):
    try:
        return json.loads(raw)
    except Exception:
        return {}


def post(url, payload, token):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, _parse_body(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, _parse_body(e.read())


def post_no_auth(url, payload):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, _parse_body(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, _parse_body(e.read())


RESULT_FIELDS = {"ref", "text", "url", "index_title", "language", "version_title",
                 "primary_category", "all_categories"}

passed = 0
failed = 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  PASS  {name}")
        passed += 1
    else:
        print(f"  FAIL  {name}" + (f" — {detail}" for _ in [1]).__next__() if detail else f"  FAIL  {name}")
        failed += 1


def run_tests(base_url, token):
    endpoint = f"{base_url}/api/knn-search"
    print(f"\nTarget: {endpoint}\n")

    # ------------------------------------------------------------------
    # Auth tests
    # ------------------------------------------------------------------
    print("── Auth ──────────────────────────────────────────────────────")

    status, body = post_no_auth(endpoint, {"query": "love thy neighbor"})
    check("no token → 401", status == 401)

    status2, _ = post(endpoint, {"query": "test"}, "wrong-token")
    check("wrong token → 401", status2 == 401)

    # ------------------------------------------------------------------
    # Input validation
    # ------------------------------------------------------------------
    print("\n── Input validation ──────────────────────────────────────────")

    status, body = post(endpoint, {}, token)
    check("missing query → 400", status == 400)

    status, body = post(endpoint, {"query": ""}, token)
    check("empty query → 400", status == 400)

    req = urllib.request.Request(
        endpoint,
        data=b"not json at all",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            status = r.status
    except urllib.error.HTTPError as e:
        status = e.code
    check("invalid JSON body → 400", status == 400)

    # ------------------------------------------------------------------
    # Basic search
    # ------------------------------------------------------------------
    print("\n── Basic search ──────────────────────────────────────────────")

    status, body = post(endpoint, {"query": "love thy neighbor"}, token)
    check("basic query → 200", status == 200, f"got {status}")
    if status == 200:
        results = body.get("results", [])
        check("response has 'results' key", "results" in body)
        check("returns up to 10 results by default", len(results) <= 10, f"got {len(results)}")
        check("returns at least 1 result", len(results) >= 1, f"got {len(results)}")
        if results:
            first = results[0]
            missing = RESULT_FIELDS - set(first.keys())
            check(f"result has all expected fields", not missing, f"missing: {missing}")
            check("ref is a non-empty string", isinstance(first.get("ref"), str) and first["ref"])
            check("text is a non-empty string", isinstance(first.get("text"), str) and first["text"])
            check("all_categories is a list", isinstance(first.get("all_categories"), list))
            check("embedding NOT in response", "embedding" not in first)

    # ------------------------------------------------------------------
    # limit parameter
    # ------------------------------------------------------------------
    print("\n── limit parameter ───────────────────────────────────────────")

    status, body = post(endpoint, {"query": "shabbat", "limit": 3}, token)
    check("limit=3 → 200", status == 200)
    if status == 200:
        check("respects limit=3", len(body.get("results", [])) <= 3,
              f"got {len(body.get('results', []))}")

    status, body = post(endpoint, {"query": "shabbat", "limit": 1}, token)
    check("limit=1 → 200", status == 200)
    if status == 200:
        check("respects limit=1", len(body.get("results", [])) <= 1,
              f"got {len(body.get('results', []))}")

    # ------------------------------------------------------------------
    # filters parameter
    # ------------------------------------------------------------------
    print("\n── filters ───────────────────────────────────────────────────")

    status, body = post(endpoint, {"query": "creation", "filters": {"language": "en"}}, token)
    check("filter language=en → 200", status == 200)
    if status == 200:
        results = body.get("results", [])
        langs = {r["language"] for r in results}
        check("all results are English", langs <= {"en"}, f"got languages: {langs}")

    status, body = post(endpoint, {"query": "creation", "filters": {"language": "he"}}, token)
    check("filter language=he → 200", status == 200)
    if status == 200:
        results = body.get("results", [])
        langs = {r["language"] for r in results}
        check("all results are Hebrew", langs <= {"he"}, f"got languages: {langs}")

    status, body = post(endpoint, {"query": "shabbat", "filters": {"index_title": "Genesis"}}, token)
    check("filter index_title=Genesis → 200", status == 200)
    if status == 200:
        results = body.get("results", [])
        titles = {r["index_title"] for r in results}
        check("all results from Genesis", titles <= {"Genesis"}, f"got: {titles}")

    # Unknown filter key is silently dropped (not an error)
    status, body = post(endpoint, {"query": "prayer", "filters": {"nonexistent_field": "x"}}, token)
    check("unknown filter key silently dropped → 200", status == 200, f"got {status}")

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print(f"\n{'─' * 60}")
    print(f"Results: {passed} passed, {failed} failed")
    return failed == 0


def main():
    parser = argparse.ArgumentParser(description="Smoke-test /api/knn-search")
    parser.add_argument("--base-url", default="https://knn-api.cauldron.sefaria.org")
    parser.add_argument("--token", default=os.environ.get("SEMANTIC_SEARCH_API_TOKEN", ""))
    args = parser.parse_args()

    if not args.token:
        print("ERROR: provide --token or set SEMANTIC_SEARCH_API_TOKEN", file=sys.stderr)
        sys.exit(1)

    success = run_tests(args.base_url, args.token)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
