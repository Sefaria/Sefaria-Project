#!/usr/bin/env bash
# test-staging-smoke-secrets.sh: staging-smoke.sh must never put a credential on curl's command line (ps shows it). Runs
# the script against a fake curl that records its arguments and the content of every `-H @file` it is given. Needs bash 4+
# and python3; no cluster, no network.
#   tests/test-staging-smoke-secrets.sh
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
fail=0
ok() { echo "ok: $*"; }
bad() { echo "FAIL: $*"; fail=1; }

mkdir -p "$T/bin"
cat >"$T/bin/curl" <<'FAKE'
#!/usr/bin/env bash
# Records argv; copies each -H @file (and its mode); writes empty header/body files and answers 000.
printf '%s\n' "$*" >>"$FAKE_DIR/argv.log"
out="" hdr=""
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[$i]}" in
    -o) out="${args[$((i + 1))]}" ;;
    -D) hdr="${args[$((i + 1))]}" ;;
    @*) f="${args[$i]#@}"
        if [ -f "$f" ]; then
          { cat "$f"; echo "[mode $(stat -c %a "$f" 2>/dev/null || stat -f %Lp "$f")]"; } >>"$FAKE_DIR/header-files.log"
        fi ;;
  esac
done
[ -n "$out" ] && : >"$out"
[ -n "$hdr" ] && : >"$hdr"
printf '000'
FAKE
chmod +x "$T/bin/curl"
export FAKE_DIR="$T"
TOKEN="knn-token-$(od -An -N10 -tx1 /dev/urandom | tr -d ' \n')"
COOKIE="cookie-$(od -An -N10 -tx1 /dev/urandom | tr -d ' \n')"
printf '%s\n' "$TOKEN" >"$T/token"
printf '%s\n' "$COOKIE" >"$T/cookie"

PATH="$T/bin:$PATH" bash "$HERE/../staging-smoke.sh" --base-url http://127.0.0.1:9 --no-gh \
  --knn-token-file "$T/token" --knn-query "a question" --session-cookie-file "$T/cookie" >"$T/out" 2>&1 </dev/null
[[ -s "$T/argv.log" ]] && ok "the fake curl was used ($(wc -l <"$T/argv.log" | tr -d ' ') calls)" || bad "the fake curl was not called"
if grep -qF "$TOKEN" "$T/argv.log"; then bad "the Library Assistant token is on curl's command line"; else ok "the Library Assistant token is not on any curl command line"; fi
if grep -qF "$COOKIE" "$T/argv.log"; then bad "the session cookie is on curl's command line"; else ok "the session cookie is not on any curl command line"; fi
grep -qF "Authorization: Bearer $TOKEN" "$T/header-files.log" 2>/dev/null \
  && ok "the Authorization header still reaches curl, through a header file (-H @file)" || bad "the Authorization header never reached curl through a file"
grep -F -A1 "Authorization: Bearer $TOKEN" "$T/header-files.log" | grep -q '^\[mode 600\]' \
  && ok "the Authorization header file is private (mode 600)" || bad "the Authorization header file is not mode 600"
grep -qF "$TOKEN" "$T/out" && bad "the token appears in the script's output" || ok "the token never appears in the script's output"
exit "$fail"
