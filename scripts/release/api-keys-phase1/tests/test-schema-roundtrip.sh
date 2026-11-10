#!/usr/bin/env bash
# test-schema-roundtrip.sh: expected_scoped_schema (lib.sh) with a fake docker and pg_restore; no Docker, no cluster. The
# function is called inside `if`, where set -e does not apply to its body, so the build checks every step itself:
#   - a container that does not start, one that never gets ready, a failed createdb and a failed pg_dump each return 2
#     (never 0, never 1 = "no docker, use the weaker comparison") and leave neither a cached reference nor a .tmp file;
#   - the scratch container is removed on every exit path: success, each failure, and SIGTERM in the middle;
#   - a success caches the reference (the .tmp is moved into place) and prints it; a reference that lacks a scoped table
#     is a failure;
#   - no docker on PATH returns 1.
#   tests/test-schema-roundtrip.sh [RELEASE_DIR]     (bash 4+, python3)
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REL="$(cd "${1:-$HERE/..}" && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/schema-roundtrip.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
fail=0
ok() { echo "ok: $*"; }
bad() { echo "FAIL: $*"; fail=1; }

mkdir -p "$WORK/bin"
REAL_SLEEP="$(command -v sleep)"
cat >"$WORK/bin/sleep" <<SLEEP
#!/bin/sh
[ "\${FAKE_REAL_SLEEP:-}" = 1 ] && exec $REAL_SLEEP "\$@"
exit 0
SLEEP
cat >"$WORK/bin/pg_restore" <<'PGR'
#!/bin/sh
if [ "$1" = --version ]; then echo "pg_restore (PostgreSQL) 18.0"; exit 0; fi
echo "ALTER TABLE public.t1 OWNER TO appuser;"
PGR
# The fake docker logs every call to $FAKE_LOG and fails where $FAKE_MODE says.
cat >"$WORK/bin/docker" <<'DOCKER'
#!/bin/sh
echo "$*" >>"$FAKE_LOG"
case "$1" in
  run) [ "$FAKE_MODE" = run-fail ] && { echo "docker: cannot start" >&2; exit 125; }; exit 0 ;;
  rm) exit 0 ;;
  exec)
    shift
    [ "$1" = -i ] && { shift; cat >/dev/null; }
    name="$1"; shift
    case "$1" in
      psql)
        case "$*" in
          *"SELECT 1"*) [ "$FAKE_MODE" = never-ready ] && exit 1; exit 0 ;;
          *"CREATE ROLE"*) echo "ERROR: role already exists" >&2; exit 1 ;;
        esac
        exit 0 ;;
      createdb) [ "$FAKE_MODE" = createdb-fail ] && exit 1
                [ "$FAKE_MODE" = hang ] && FAKE_REAL_SLEEP=1 exec sleep 30
                exit 0 ;;
      pg_restore) exit 1 ;; # restore errors are tolerated; the scoped tables are checked afterwards
      pg_dump)
        [ "$FAKE_MODE" = dump-fail ] && { echo "pg_dump: error: connection lost" >&2; exit 1; }
        [ "$FAKE_MODE" = dump-missing-table ] && { echo "CREATE TABLE public.other ("; echo ");"; exit 0; }
        echo "-- comment"; echo "CREATE TABLE public.t1 ("; echo "    id integer"; echo ");"; exit 0 ;;
    esac ;;
esac
exit 0
DOCKER
chmod +x "$WORK/bin/"*

new_snap() { # DIR
  mkdir -p "$1/db"
  echo "dump" >"$1/db/sefaria_auth.dump"
  echo "scoped" >"$1/db/scoped.dump"
  echo t1 >"$1/db/scoped-tables.txt"
}
# attempt MODE SNAPDIR: runs expected_scoped_schema inside `if` (as schema_matches does); prints "rc=N"
attempt() {
  FAKE_MODE="$1" FAKE_LOG="$WORK/docker.log" PATH="$WORK/bin:$PATH" bash -c '
    source "$1/lib.sh"
    rc=0
    if expected_scoped_schema "$2" >"$2/printed.sql" 2>"$2/stderr.txt"; then rc=0; else rc=$?; fi
    echo "rc=$rc"' _ "$REL" "$2"
}
removed() { grep -c '^rm -f apikeys-schema-check-' "$WORK/docker.log" 2>/dev/null || true; }

for mode in run-fail never-ready createdb-fail dump-fail dump-missing-table; do
  snap="$WORK/snap-$mode"
  new_snap "$snap"
  : >"$WORK/docker.log"
  out="$(attempt "$mode" "$snap")"
  if [[ "$out" == rc=2 && ! -e "$snap/db/scoped-schema.roundtrip.sql" && ! -e "$snap/db/scoped-schema.roundtrip.sql.tmp" && ! -e "$snap/db/scoped-schema.roundtrip.sql.raw" ]]; then
    ok "$mode: returns 2 and leaves no cached reference or temp file"
  else
    bad "$mode: $out; files: $(printf "%s " "$snap"/db/*)"
  fi
  if [[ "$(removed)" -ge 1 ]]; then ok "$mode: the scratch container is removed"; else bad "$mode: no docker rm -f in $(tr '\n' ';' <"$WORK/docker.log")"; fi
done

# success
snap="$WORK/snap-ok"
new_snap "$snap"
: >"$WORK/docker.log"
out="$(attempt ok "$snap")"
if [[ "$out" == rc=0 && -s "$snap/db/scoped-schema.roundtrip.sql" && ! -e "$snap/db/scoped-schema.roundtrip.sql.tmp" ]] && grep -q 'CREATE TABLE public.t1' "$snap/printed.sql" && cmp -s "$snap/printed.sql" "$snap/db/scoped-schema.roundtrip.sql"; then
  ok "success: the reference is cached, printed and equal; no temp file left"
else
  bad "success: $out; $(printf "%s " "$snap"/db/*)"
fi
if [[ "$(removed)" -ge 1 ]]; then ok "success: the scratch container is removed"; else bad "success: container not removed"; fi
: >"$WORK/docker.log"
out="$(attempt run-fail "$snap")" # cached: no docker needed
if [[ "$out" == rc=0 && ! -s "$WORK/docker.log" ]]; then ok "a cached reference is used without starting a container"; else bad "cache: $out; $(cat "$WORK/docker.log")"; fi

# no docker on PATH: 1
snap="$WORK/snap-nodocker"
new_snap "$snap"
rc="$(PATH="$WORK/nodocker:$(dirname "$(command -v bash)"):/usr/bin:/bin" bash -c 'source "$1/lib.sh"; if expected_scoped_schema "$2" >/dev/null 2>&1; then echo rc=0; else echo rc=$?; fi' _ "$REL" "$snap")"
if command -v docker >/dev/null 2>&1 && [[ "$(PATH="/usr/bin:/bin" command -v docker || true)" != "" ]]; then
  echo "skip: docker is installed in /usr/bin, the no-docker case cannot be staged"
elif [[ "$rc" == rc=1 ]]; then ok "no docker: returns 1 (the caller may use the weaker comparison)"; else bad "no docker: $rc"; fi

# schema_matches: a failed round trip is a mismatch, not a fallback to the weaker comparison
snap="$WORK/snap-sm"
new_snap "$snap"
echo "CREATE TABLE public.t1 (id integer);" >"$snap/db/scoped-schema.sql"
echo "CREATE TABLE public.t1 (id bigint);" >"$WORK/live.sql"
: >"$WORK/docker.log"
res="$(FAKE_MODE=dump-fail FAKE_LOG="$WORK/docker.log" PATH="$WORK/bin:$PATH" bash -c 'source "$1/lib.sh"; if schema_matches "$2" "$3" 2>"$2/err.txt"; then echo match; else echo mismatch; fi' _ "$REL" "$snap" "$WORK/live.sql")"
if [[ "$res" == mismatch ]] && grep -q "not falling back" "$snap/err.txt"; then ok "schema_matches: a failed round trip is a mismatch, not the weaker comparison"; else bad "schema_matches: $res; $(cat "$snap/err.txt")"; fi

# SIGTERM in the middle of the build: the container is still removed
snap="$WORK/snap-term"
new_snap "$snap"
: >"$WORK/docker.log"
(
  set -m
  FAKE_MODE=hang FAKE_LOG="$WORK/docker.log" PATH="$WORK/bin:$PATH" bash -c 'source "$1/lib.sh"; expected_scoped_schema "$2" >/dev/null 2>&1' _ "$REL" "$snap" &
  pid=$!
  for _ in $(seq 1 50); do grep -q createdb "$WORK/docker.log" && break; "$REAL_SLEEP" 0.1; done
  kill -TERM -- "-$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
)
if [[ "$(removed)" -ge 1 && ! -e "$snap/db/scoped-schema.roundtrip.sql" ]]; then ok "SIGTERM mid-build: the scratch container is removed and nothing is cached"; else bad "SIGTERM: $(tr '\n' ';' <"$WORK/docker.log"); $(printf "%s " "$snap"/db/*)"; fi
exit "$fail"
