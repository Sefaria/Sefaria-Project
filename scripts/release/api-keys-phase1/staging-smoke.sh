#!/usr/bin/env bash
# staging-smoke.sh: HTTP smoke checks of the release plan's Staging list, after #3774 reaches staging.
#
#   staging-smoke.sh --base-url https://www.sefariastaging.org [--listing-record FILE | --listing-expect N]
#                    [--session-cookie-file FILE] [--knn-token-file FILE [--knn-query TEXT]]
#                    [--gh-repo Sefaria/Sefaria-Project] [--no-gh] [--context C [--repo DIR]]
#
# HTTP checks (read-only GETs and OPTIONS; one POST to /api/knn-search with an empty query, which does no search):
#   - the site loads
#   - /login, /register and the password-reset confirm page send X-Frame-Options: DENY
#   - /settings/account: logged out it redirects to /login (with --session-cookie-file, a file holding a sessionid
#     value, it renders); saving is a manual check
#   - OPTIONS /api/... with Access-Control-Request-Method answers 204 with ACAO *, the methods and X-API-Key
#   - the public /api/powered-by count equals the recorded listed_after_merge (listing-count.sh --record before merge)
#   - /api/knn-search reaches Django (401 Unauthorized without the Library Assistant token; with --knn-token-file the
#     token is accepted, and --knn-query runs one real query)
#   - the release produced a chart version and a release tag (gh api; --no-gh skips)
# With --context (the dev cluster): no migration of origin/master is pending on sefariastaging (read-only SQL), web
# pods run the env file's tag, and an api_key sent in a query string reaches the web and nginx logs only as [REDACTED].
# Legacy apikey writes stay a manual check (they write data). Exits 1 when any check FAILs.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

BASE="" RECORD="" EXPECT="" COOKIE_FILE="" KNN_TOKEN_FILE="" KNN_QUERY="" GH_REPO="Sefaria/Sefaria-Project" GH=1 CTX="" REPO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE="${2%/}"; shift 2 ;;
    --listing-record) RECORD="$2"; shift 2 ;;
    --listing-expect) EXPECT="$2"; shift 2 ;;
    --session-cookie-file) COOKIE_FILE="$2"; shift 2 ;;
    --knn-token-file) KNN_TOKEN_FILE="$2"; shift 2 ;;
    --knn-query) KNN_QUERY="$2"; shift 2 ;;
    --gh-repo) GH_REPO="$2"; shift 2 ;;
    --no-gh) GH=0; shift ;;
    --context) CTX="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --pg-user) PG_USER="$2"; shift 2 ;;
    -h | --help) usage 0 ;;
    *) log "unknown argument: $1"; usage 1 ;;
  esac
done
[[ -n "$BASE" ]] || usage 1
need curl "$PYTHON"

FAILS=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; FAILS=$((FAILS + 1)); }
warn() { printf 'WARN  %s\n' "$*"; }
skip() { printf 'SKIP  %s\n' "$*"; }
manual() { printf 'MANUAL %s\n' "$*"; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# http METHOD PATH [curl args...] -> sets CODE, $tmp/h (headers), $tmp/b (body)
http() {
  local method="$1" path="$2"
  shift 2
  CODE="$(curl -sS -X "$method" -o "$tmp/b" -D "$tmp/h" -w '%{http_code}' --max-time 60 "$@" "$BASE$path" || echo 000)"
}
header() { awk -v h="$(echo "$1" | tr 'A-Z' 'a-z')" 'BEGIN{IGNORECASE=1} { split($0, a, ":"); if (tolower(a[1]) == h) { sub(/^[^:]*:[ \t]*/, ""); sub(/\r$/, ""); print; exit } }' "$tmp/h"; }

echo "staging smoke against $BASE"

http GET / -L
if [[ "$CODE" == 200 ]] && grep -qi "<html" "$tmp/b"; then pass "GET / (redirects followed) is 200 HTML"; else fail "GET / returned $CODE"; fi

for path in /login /register /password/reset/confirm/MA/set-password/; do
  http GET "$path"
  xfo="$(header X-Frame-Options)"
  if [[ "${xfo^^}" == DENY ]]; then pass "GET $path sends X-Frame-Options: DENY ($CODE)"; else fail "GET $path: X-Frame-Options '${xfo}' ($CODE)"; fi
done

http GET /settings/account
loc="$(header Location)"
if [[ "$CODE" =~ ^30[12]$ && "$loc" == *login* ]]; then
  pass "GET /settings/account logged out redirects to login"
else
  fail "GET /settings/account logged out: $CODE ${loc}"
fi
if [[ -n "$COOKIE_FILE" ]]; then
  http GET /settings/account -H "Cookie: sessionid=$(tr -d '\n' <"$COOKIE_FILE")"
  if [[ "$CODE" == 200 ]]; then pass "GET /settings/account signed in renders (200)"; else fail "GET /settings/account signed in: $CODE"; fi
  manual "save a field on /settings/account and reload: the value persists"
else
  skip "/settings/account signed in (pass --session-cookie-file)"
fi

http OPTIONS /api/texts/Genesis.1 -H "Origin: https://example.org" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: x-api-key"
acao="$(header Access-Control-Allow-Origin)" acam="$(header Access-Control-Allow-Methods)" acah="$(header Access-Control-Allow-Headers)"
if [[ "$CODE" == 204 && "$acao" == "*" && "$acam" == *GET* && "${acah,,}" == *x-api-key* ]]; then
  pass "OPTIONS /api/texts/Genesis.1: 204, ACAO *, methods '$acam', headers '$acah'"
else
  fail "OPTIONS /api/texts/Genesis.1: $CODE, ACAO '${acao}', methods '${acam}', headers '${acah}'"
fi

http GET /api/powered-by
count=""
if [[ "$CODE" == 200 ]]; then
  count="$("$PYTHON" -c 'import json,sys; p=json.load(open(sys.argv[1])).get("projects"); assert isinstance(p, list); print(len(p))' "$tmp/b" 2>/dev/null || echo "")"
fi
if [[ -n "$RECORD" ]]; then
  EXPECT="$("$PYTHON" -c 'import json,sys; print(json.load(open(sys.argv[1]))["listed_after_merge"])' "$RECORD")"
fi
if [[ -z "$count" ]]; then
  fail "GET /api/powered-by: $CODE, not a project list"
elif [[ -n "$EXPECT" ]]; then
  if [[ "$count" == "$EXPECT" ]]; then pass "Powered by lists $count projects, as recorded before the merge"; else fail "Powered by lists $count projects; recorded before the merge: $EXPECT"; fi
else
  warn "Powered by lists $count projects (no --listing-record / --listing-expect to compare with)"
fi

http POST /api/knn-search -H "Content-Type: application/json" --data '{"query": ""}'
if [[ "$CODE" == 401 ]] && grep -q '"Unauthorized"' "$tmp/b"; then
  pass "POST /api/knn-search reaches Django (401 Unauthorized without the Library Assistant token)"
else
  fail "POST /api/knn-search without a token: $CODE $(head -c 200 "$tmp/b")"
fi
if [[ -n "$KNN_TOKEN_FILE" ]]; then
  auth="Authorization: Bearer $(tr -d '\n' <"$KNN_TOKEN_FILE")"
  http POST /api/knn-search -H "Content-Type: application/json" -H "$auth" --data '{"query": ""}'
  if [[ "$CODE" == 400 ]]; then pass "the Library Assistant token is accepted on /api/knn-search (400 on an empty query)"; else fail "knn-search with the token: $CODE $(head -c 200 "$tmp/b")"; fi
  if [[ -n "$KNN_QUERY" ]]; then
    body="$("$PYTHON" -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$KNN_QUERY")"
    http POST /api/knn-search -H "Content-Type: application/json" -H "$auth" --data "$body"
    if [[ "$CODE" == 200 ]]; then pass "knn-search query returned 200"; else fail "knn-search query: $CODE $(head -c 200 "$tmp/b")"; fi
  fi
else
  skip "Library Assistant token on knn-search (pass --knn-token-file)"
fi
manual "legacy apikey write (for example POST /api/notes with the apikey of a test account), then delete what it wrote"

envfile=""
if [[ "$GH" == 1 ]] && command -v gh >/dev/null 2>&1; then
  envfile="$(gh api "repos/$GH_REPO/contents/envs/staging/helmrelease.yaml?ref=master" --jq .content 2>/dev/null | base64 -d 2>/dev/null || true)"
  chart="$(sed -n '/chart: sefaria/{n;s/.*version:[[:space:]]*"\{0,1\}\([^"[:space:]]*\).*/\1/p;}' <<<"$envfile" | head -1)"
  app="$(sed -n '/containerImage:/{n;n;s/.*tag:[[:space:]]*"\{0,1\}v\{0,1\}\([^"[:space:]]*\).*/\1/p;}' <<<"$envfile" | head -1)"
  tag="staging/${app}+chart.${chart}"
  if [[ -n "$chart" && -n "$app" ]] && gh api "repos/$GH_REPO/git/ref/tags/$tag" >/dev/null 2>&1; then
    pass "release tag $tag exists (chart $chart, app $app)"
  else
    fail "release tag '$tag' not found for envs/staging on master"
  fi
  if [[ -n "$chart" ]] && gh api "repos/$GH_REPO/git/ref/tags/helm-chart-$chart" >/dev/null 2>&1; then
    pass "chart tag helm-chart-$chart exists"
  else
    warn "chart tag helm-chart-$chart not found (the chart may not have changed in this release)"
  fi
else
  skip "release tag and chart version (gh not available or --no-gh)"
fi

if [[ -n "$CTX" ]]; then
  need kubectl git
  check_context staging "$CTX"
  REPO="${REPO:-$(git -C "$RELEASE_DIR" rev-parse --show-toplevel)}"
  git -C "$REPO" fetch -q origin master 2>/dev/null || true
  TAB="$(printf '\t')"
  git -C "$REPO" ls-tree -r --name-only origin/master | grep '/migrations/' | "$PYTHON" "$RELEASE_PY" migrations-from-paths >"$tmp/code.tsv"
  pg_ro "$(env_db staging)" -At -F "$TAB" -c 'SELECT app, name FROM public.django_migrations' >"$tmp/applied.tsv"
  pending="$("$PYTHON" "$RELEASE_PY" compare-migrations --code "$tmp/code.tsv" --applied "$tmp/applied.tsv" | "$PYTHON" -c 'import json,sys; print(" ".join(json.load(sys.stdin)["pending"]))')"
  if [[ -z "$pending" ]]; then pass "showmigrations: nothing of origin/master pending on $(env_db staging)"; else fail "pending on $(env_db staging): $pending"; fi

  want_tag="$(git -C "$REPO" show origin/master:envs/staging/helmrelease.yaml | sed -n '/containerImage:/{n;n;s/.*tag:[[:space:]]*"\{0,1\}\([^"[:space:]]*\).*/\1/p;}' | head -1)"
  imgs="$(web_pods default sefariastaging | awk -F'\t' '$2 == "Running" {print $3}' | sort -u | tr '\n' ' ')"
  if [[ -n "$imgs" && "$imgs" == *":$want_tag "* && "$(wc -w <<<"$imgs")" -eq 1 ]]; then pass "staging web pods run $want_tag"; else fail "staging web pods run '$imgs', env file says $want_tag"; fi

  marker="smoketest$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
  since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  http GET "/api/texts/Genesis.1?api_key=$marker"
  sleep 5
  logs="$(kc -n default logs -l app=web-sefariastaging -c web --since-time="$since" --tail=-1 2>/dev/null || true)
$(kc -n default logs -l app=nginx-sefariastaging -c nginx --since-time="$since" --tail=-1 2>/dev/null || true)"
  if grep -q "$marker" <<<"$logs"; then
    fail "the api_key value of a test request appears in web or nginx logs"
  elif grep -q 'api_key=\[REDACTED\]' <<<"$logs"; then
    pass "an api_key in a query string is logged only as [REDACTED]"
  else
    warn "the test request was not found in the logs (neither raw nor [REDACTED]); check by hand"
  fi
else
  skip "showmigrations, pod images and log scrubbing (pass --context for the dev cluster)"
fi

echo
if [[ "$FAILS" -gt 0 ]]; then
  echo "staging smoke: $FAILS check(s) FAILED"
  exit 1
fi
echo "staging smoke: all automated checks passed"
