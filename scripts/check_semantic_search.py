#!/usr/bin/env python3
"""API-only semantic search deployment checks. No Django or third-party dependencies."""
import argparse
import ast
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BACKEND_HEADER = 'X-Sefaria-Semantic-Backend'
CASES = [
    {'name': 'english', 'query': 'Giving people the benefit of the doubt'},
    {'name': 'hebrew', 'query': 'ואהבת לרעך כמוך'},
    {'name': 'linked', 'query': 'Giving people the benefit of the doubt', 'include_linked_refs': True},
    {'name': 'english-filter', 'query': 'Resting on the Sabbath', 'filters': {'language': 'en'}},
    {'name': 'hebrew-filter', 'query': 'שמירת שבת', 'filters': {'language': 'he'}},
    {'name': 'book-filter', 'query': 'The creation of the world', 'filters': {'index_title': 'Genesis'}},
    {'name': 'metadata-only', 'query': 'Helping people in need', 'include_text': False},
    {'name': 'limit-one', 'query': 'The importance of studying Torah', 'result_limit': 1},
    {'name': 'empty-query', 'query': '', 'status': 400},
    {'name': 'unauthenticated', 'query': 'Sabbath', 'status': 401, 'authenticated': False},
]


def load_token(local_settings=None):
    """Read the token without executing settings, importing Django, or logging secrets."""
    for key in ('SEFARIA_KNN_AUTH_TOKEN', 'SEMANTIC_SEARCH_API_TOKEN'):
        if os.environ.get(key):
            return os.environ[key]
    path = local_settings if local_settings is not None else Path(__file__).resolve().parents[1] / 'sefaria/local_settings.py'

    def literal_or_environment(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, (str, type(None))):
            return node.value
        if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
            for part in node.values:
                value = literal_or_environment(part)
                if value:
                    return value
            return None
        if isinstance(node, ast.Call) and not node.keywords:
            # Only these exact calls are allowed; never eval/exec a settings file.
            function = ast.unparse(node.func)
            if function in ('os.environ.get', 'os.getenv') and 1 <= len(node.args) <= 2:
                args = [ast.literal_eval(arg) for arg in node.args]
                if args[0] == 'SEMANTIC_SEARCH_API_TOKEN':
                    return os.environ.get(*args)
        raise ValueError('Unsupported token expression')

    try:
        token = None
        for node in ast.parse(path.read_text()).body:
            if isinstance(node, ast.Assign) and any(
                    isinstance(target, ast.Name) and target.id == 'SEMANTIC_SEARCH_API_TOKEN'
                    for target in node.targets):
                token = literal_or_environment(node.value)
        return token if isinstance(token, str) and token else None
    except (OSError, SyntaxError, ValueError, TypeError):
        return None


def payload_for(case):
    payload = {'query': case['query'], 'result_limit': 10, 'linked_ref_limit': 10,
               'include_linked_refs': False, 'include_text': True}
    payload.update({k: v for k, v in case.items() if k not in ('name', 'status', 'authenticated')})
    return payload


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_json(url, payload, token, timeout):
    headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-cache',
               'User-Agent': 'Sefaria-Semantic-Cutover-Check/1'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method='POST')
    opener = urllib.request.build_opener(NoRedirect())
    try:
        response = opener.open(request, timeout=timeout)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError('Response exceeds 2 MB')
        return response.code, response.headers.get(BACKEND_HEADER), json.loads(raw)


def validate(body, payload, status, expected_status, backend, expected_backend):
    if status != expected_status:
        raise ValueError(f'Expected HTTP {expected_status}, received {status}')
    if not isinstance(body, dict):
        raise ValueError('Expected a JSON object')
    if expected_status != 200:
        if not isinstance(body.get('error'), str) or not body['error']:
            raise ValueError('Expected a JSON error message')
        return
    if 'error' in body:
        raise ValueError('Unexpected API error')
    if expected_backend != 'any' and backend != expected_backend:
        raise ValueError(f'Expected backend {expected_backend}; got {backend!r}')
    rows = body.get('results')
    if not isinstance(rows, list) or not 1 <= len(rows) <= payload['result_limit']:
        raise ValueError('Expected nonempty results within requested limit')
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('Malformed search result')
        for field in ('ref', 'url', 'index_title', 'language', 'version_title'):
            if not isinstance(row.get(field), str) or not row[field].strip():
                raise ValueError(f'Result missing nonempty {field}')
        if not isinstance(row.get('all_categories'), list) or 'primary_category' not in row:
            raise ValueError('Missing category fields')
        if payload['include_text']:
            if not isinstance(row.get('text'), str) or not row['text'].strip():
                raise ValueError('Missing nonempty result text')
        elif 'text' in row:
            raise ValueError('Text returned despite include_text=false')
        if any(row.get(k) != v for k, v in payload.get('filters', {}).items()):
            raise ValueError('Search result violates requested filter')
    if payload['include_linked_refs']:
        linked = body.get('linked_refs')
        if not isinstance(linked, list):
            raise ValueError('Missing linked_refs list')
        # One linked reference can expand to several chunks, so the item count may
        # exceed linked_ref_limit. Check distinct parents instead.
        parents = set()
        for row in linked:
            if not isinstance(row, dict) or not isinstance(row.get('ref'), str) or not row['ref']:
                raise ValueError('Malformed linked reference')
            parents.add(row.get('linked_ref_parent', row['ref']))
            if not isinstance(row.get('text'), str):
                raise ValueError('Linked reference missing text field')
            if row.get('text_source') == 'linked_ref_semantic_chunk':
                if not row['text'].strip() or not row.get('linked_ref_parent'):
                    raise ValueError('Invalid linked semantic chunk')
                count, number = row.get('linked_ref_chunk_count'), row.get('linked_ref_chunk_number')
                if type(count) is not int or type(number) is not int or not 1 <= number <= count:
                    raise ValueError('Invalid linked semantic chunk numbering')
        if len(parents) > payload['linked_ref_limit']:
            raise ValueError('Too many linked reference parents')


def fingerprint(row):
    text = row.get('text')
    return {k: row.get(k) for k in ('ref', 'language', 'version_title', 'text_source', 'linked_ref_parent')} | {
        'text_sha256': hashlib.sha256(text.encode()).hexdigest() if isinstance(text, str) else None}


def run_checks(url, token, expected_backend, timeout, budget, send=request_json):
    checks = []
    started = time.monotonic()
    for case in CASES:
        payload = payload_for(case)
        result = {'name': case['name'], 'request': payload, 'ok': False}
        remaining = budget - (time.monotonic() - started)
        if remaining <= 0:
            result['error'] = 'Run budget exhausted; case not executed'
        else:
            tick = time.monotonic()
            try:
                status, backend, body = send(url, payload, token if case.get('authenticated', True) else None,
                                              min(timeout, remaining))
                result.update(http_status=status, backend=backend)
                validate(body, payload, status, case.get('status', 200), backend, expected_backend)
                if status == 200:
                    result['results'] = [fingerprint(r) for r in body['results']]
                    result['linked_refs'] = [fingerprint(r) for r in body.get('linked_refs', [])]
                    result['warnings'] = []
                    if backend is None:
                        result['warnings'].append('Backend unverified: older server does not emit the header')
                    if payload['include_linked_refs'] and not body['linked_refs']:
                        result['warnings'].append('No linked refs returned; enhancement results not exercised')
                    if any(r.get('text_source', '').startswith('omitted_') for r in body.get('linked_refs', [])):
                        result['warnings'].append('Some linked text omitted; review against baseline')
                result['ok'] = True
            except (urllib.error.URLError, TimeoutError, OSError):
                result['error'] = 'Connection or timeout failure; credential/server details omitted'
            except (ValueError, TypeError, KeyError) as exc:
                # Do not dump server bodies or request headers (they can include secrets).
                result['error'] = str(exc) if not isinstance(exc, json.JSONDecodeError) else 'Invalid JSON response'
            result['seconds'] = round(time.monotonic() - tick, 3)
        checks.append(result)
        if result.get('error'):
            print('  ' + result['error'], flush=True)
        for warning in result.get('warnings', []):
            print('  WARNING: ' + warning, flush=True)
        print(f"{'PASS' if result['ok'] else 'FAIL'} {case['name']} "
              f"{result.get('seconds', 0)}s backend={result.get('backend') or 'unreported'}", flush=True)
    return checks


def compare(before, checks):
    prior = {r['name']: r for r in before['checks']}
    comparisons = []
    for current in checks:
        if current['name'] in ('empty-query', 'unauthenticated'):
            continue
        old = prior.get(current['name'])
        if not old or not old.get('ok') or not current['ok'] or old['request'] != current['request']:
            comparisons.append({'name': current['name'], 'comparable': False})
            continue
        a, b = ({r['ref'] for r in item['results']} for item in (old, current))
        comparisons.append({'name': current['name'], 'comparable': True,
            'ref_overlap_fraction': round(len(a & b) / max(len(a), len(b), 1), 3),
            'same_order_and_text': old['results'] == current['results'],
            'same_linked_refs_and_text': old['linked_refs'] == current['linked_refs'],
            'before_seconds': old['seconds'], 'after_seconds': current['seconds']})
    return comparisons


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-url', default='https://www.sefaria.org/api/knn-search')
    parser.add_argument('--expect-backend', choices=('new', 'legacy', 'any'), default='new',
                        help='Use any only to capture a baseline from a server without the diagnostic header')
    parser.add_argument('--timeout', type=float, default=30, help='Per-request socket timeout, seconds')
    parser.add_argument('--budget', type=float, default=180, help='Stop starting requests after this many seconds')
    parser.add_argument('--label', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--baseline', type=Path)
    args = parser.parse_args(argv)
    parsed = urllib.parse.urlparse(args.api_url)
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        parser.error('API URL must not contain credentials, query parameters or fragments')
    if not parsed.hostname or (parsed.scheme != 'https' and not
            (parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1', '::1'))):
        parser.error('Use HTTPS, or HTTP on localhost')
    if not 0 < args.timeout <= 300 or not 0 < args.budget <= 3600:
        parser.error('Timeout must be 0–300 seconds; budget must be 0–3600 seconds (exclusive of zero)')
    token = load_token()
    if not token:
        parser.error('No token found. Set SEFARIA_KNN_AUTH_TOKEN or SEMANTIC_SEARCH_API_TOKEN; simple local_settings.py token assignments are also supported')
    if args.output.exists() or not args.output.parent.is_dir():
        parser.error('Output must be a new filename in an existing directory')
    baseline = None
    if args.baseline:
        try:
            baseline = json.loads(args.baseline.read_text())
            if baseline.get('format_version') != 2 or not isinstance(baseline.get('checks'), list):
                raise ValueError('Unsupported baseline format; capture a fresh baseline with this script')
        except (OSError, ValueError) as exc:
            parser.error(str(exc))
    checks = run_checks(args.api_url, token, args.expect_backend, args.timeout, args.budget)
    report = {'format_version': 2, 'label': args.label, 'timestamp': datetime.now(timezone.utc).isoformat(),
              'api_url': args.api_url, 'expected_backend': args.expect_backend,
              'ok': all(r['ok'] for r in checks), 'checks': checks}
    if baseline is not None:
        report['comparison'] = compare(baseline, checks)
        for row in report['comparison']:
            print('COMPARE ' + json.dumps(row))
    with args.output.open('x') as stream:
        json.dump(report, stream, indent=2, ensure_ascii=False)
        stream.write('\n')
    print(f'Report: {args.output}')
    print('Review result differences and warnings; passing smoke checks do not prove full corpus parity.')
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
