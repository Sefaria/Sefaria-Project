#!/usr/bin/env bash
# staging-smoke-creds.sh: writes the three credential files staging-smoke.sh takes, for one throwaway staging account.
#
#   staging-smoke-creds.sh --context gke_development-205018_us-east1-b_cluster-1 [--out DIR] [--email EMAIL]
#   staging-smoke-creds.sh --context ... --remove      # delete the account's sessions, legacy key and the account
#   staging-smoke-creds.sh --context ... --cauldron p1merge   # the same, on a dev cauldron (rehearsals); out dir gets -p1merge
#
# Writes, each mode 600 in DIR (mode 700; default ~/.config/sefaria-apikeys-smoke, refused inside a git work tree):
#   session-cookie   a sessionid of the throwaway account          -> --session-cookie-file
#   legacy-apikey    a legacy (Mongo, non-sfr_) apikey of the same -> --legacy-apikey-file
#   knn-token        staging's own SEMANTIC_SEARCH_API_TOKEN        -> --knn-token-file
#
# Staging only: any other context is refused, so it can never create an account on prod. The account is not staff,
# has no usable password, and is reused on every run (the same email). No value is printed: the pod's output is
# parsed straight into the files. Staging's Sunday restore from prod's dump removes the account: run this again after
# it. Then run:
#   staging-smoke.sh --base-url https://www.sefariastaging.org --context <ctx> \
#     --session-cookie-file DIR/session-cookie --knn-token-file DIR/knn-token --legacy-apikey-file DIR/legacy-apikey
set -euo pipefail
set +x   # never trace: the session key and the token pass through variables
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ENV=staging
CTX=""
OUT="${XDG_CONFIG_HOME:-$HOME/.config}/sefaria-apikeys-smoke"
EMAIL="apikeys-release-smoke@example.com"
REMOVE=0
CAULDRON=""
while (($#)); do
  case "$1" in
    --context) CTX="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --remove) REMOVE=1; shift ;;
    --cauldron) CAULDRON="$2"; shift 2 ;;
    -h | --help) sed -n '2,20p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[[ "$EMAIL" =~ ^apikeys-release-smoke[a-z0-9.+-]*@example\.com$ ]] || die "--email must be apikeys-release-smoke...@example.com (a throwaway this tool owns, that can receive no mail)"
need kubectl
check_context "$ENV" "$CTX"

NS="$(env_namespace "$ENV")"
HR="$(env_hr "$ENV")"
if [[ -n "$CAULDRON" ]]; then
  # A dev cauldron: same cluster as staging, never prod. Its web pods are app=web-<name>.
  [[ "$CAULDRON" =~ ^[a-z0-9-]+$ && "$CAULDRON" != sefariastaging ]] || die "--cauldron must be a cauldron name"
  HR="$CAULDRON"
  [[ "$OUT" == */sefaria-apikeys-smoke ]] && OUT="$OUT-$CAULDRON"
fi
POD="$(web_pods "$NS" "$HR" | awk -F'\t' '$2 == "Running" {print $1; exit}')"
[[ -n "$POD" ]] || die "no Running web pod (app=web-$HR) in $NS"
refuse_tracked_dir "$OUT"
log "web pod: $NS/$POD"

# The Django side. It prints one line, SMOKE_CREDS=<json>, which is read below and never echoed.
read -r -d '' PY <<'PYEOF' || true
import json, os, secrets, base64
from importlib import import_module
from django.conf import settings
from django.contrib.auth import BACKEND_SESSION_KEY, HASH_SESSION_KEY, SESSION_KEY
from django.contrib.auth.models import User
from emailusernames.utils import _email_to_username
from sefaria.system.database import db

email = os.environ["SMOKE_EMAIL"]
remove = os.environ.get("SMOKE_REMOVE") == "1"
user = User.objects.filter(email__iexact=email).first()
engine = import_module(settings.SESSION_ENGINE)
# The tool's mark on accounts it created; an account without it is never reused or deleted.
MARK = ("Release", "Smoke")
if user is not None and ((user.first_name, user.last_name) != MARK or user.is_staff or user.is_superuser):
    raise SystemExit("refusing: %s exists and was not made by this tool" % email)

if remove:
    if user is None:
        print("SMOKE_CREDS=" + json.dumps({"removed": False}))
    else:
        if user.is_staff or user.is_superuser:
            raise SystemExit("refusing: %s is staff" % email)
        uid = user.id
        # Deleting the user already invalidates every session of it; this drops the one session file we hold.
        sessions = 0
        known = os.environ.get("SMOKE_SESSION", "")
        if known:
            engine.SessionStore(session_key=known).delete()
            sessions = 1
        keys = db.apikeys.delete_many({"uid": uid}).deleted_count
        db.profiles.delete_one({"id": uid})
        user.delete()
        print("SMOKE_CREDS=" + json.dumps({"removed": True, "uid": uid, "sessions": sessions, "keys": keys}))
    raise SystemExit(0)

if user is None:
    user = User(username=_email_to_username(email), email=email, first_name=MARK[0], last_name=MARK[1])
    user.set_unusable_password()
    user.save()
    created = True
else:
    created = False
if user.is_staff or user.is_superuser:
    raise SystemExit("refusing: %s is staff" % email)
if not user.is_active:
    user.is_active = True
    user.save()
from sefaria.model.user_profile import UserProfile
UserProfile(id=user.id).save()

s = engine.SessionStore()
s[SESSION_KEY] = str(user.pk)
s[BACKEND_SESSION_KEY] = settings.AUTHENTICATION_BACKENDS[0]
s[HASH_SESSION_KEY] = user.get_session_auth_hash()
s.set_expiry(14 * 24 * 3600)
s.create()

row = db.apikeys.find_one({"uid": user.id})
if row and not str(row["key"]).startswith("sfr_"):
    key = row["key"]
else:
    key = base64.b64encode(secrets.token_bytes(32), altchars=b"rA").rstrip(b"=").decode("ascii")
    db.apikeys.delete_many({"uid": user.id})
    db.apikeys.insert_one({"uid": user.id, "key": key})

print("SMOKE_CREDS=" + json.dumps({"uid": user.id, "created": created, "session": s.session_key, "key": key}))
PYEOF

umask 077
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
KNOWN_SESSION=""
if ((REMOVE)) && [[ -r "$OUT/session-cookie" ]]; then KNOWN_SESSION="$(tr -d '\r\n' <"$OUT/session-cookie")"; fi
[[ "$KNOWN_SESSION" =~ ^[a-z0-9]*$ ]] || KNOWN_SESSION=""
# The session key goes over stdin with the script, not on the kubectl command line, so `ps` never shows it.
PY="import os; os.environ['SMOKE_SESSION'] = '''${KNOWN_SESSION}'''
${PY}"
kc -n "$NS" exec -i "$POD" -c web -- env SMOKE_EMAIL="$EMAIL" SMOKE_REMOVE="$REMOVE" python manage.py shell <<<"$PY" >"$tmp/out" 2>"$tmp/err" \
  || die "the Django shell on $POD failed (its output is not shown: it may hold values). Last error class: $(grep -oE '^[A-Za-z_.]*(Error|Exception)' "$tmp/err" | tail -n 1)"
grep -m1 '^SMOKE_CREDS=' "$tmp/out" | sed 's/^SMOKE_CREDS=//' >"$tmp/json" || true
[[ -s "$tmp/json" ]] || die "the Django shell printed no SMOKE_CREDS line (output not shown: it may hold values)"

if ((REMOVE)); then
  "$PYTHON" - "$tmp/json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print("removed uid %s: %s session(s), %s legacy key(s)" % (d["uid"], d["sessions"], d["keys"]) if d.get("removed") else "no such account; nothing removed")
PY
  rm -f "$OUT/session-cookie" "$OUT/legacy-apikey" "$OUT/knn-token"
  exit 0
fi

mkdir -p "$OUT"
chmod 700 "$OUT"
"$PYTHON" - "$tmp/json" "$OUT" <<'PY'
import json, os, sys
d = json.load(open(sys.argv[1])); out = sys.argv[2]
import tempfile
for name, value in (("session-cookie", d["session"]), ("legacy-apikey", d["key"])):
    path = os.path.join(out, name)
    # A new private file, then an atomic rename over the target: never writes through an existing symlink.
    fd, tmp = tempfile.mkstemp(dir=out, prefix="." + name + ".")
    with os.fdopen(fd, "w") as f:
        f.write(value + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)
print("account uid %s (%s)" % (d["uid"], "created" if d["created"] else "reused"))
PY

# staging's own knn token, read from the web container's environment into a private temp file, checked, then moved.
# Exit 3 from the pod means the variable is not set there; any other failure (transport, permission) stops the script.
set +e
kc -n "$NS" exec "$POD" -c web -- sh -c '[ -n "${SEMANTIC_SEARCH_API_TOKEN:-}" ] || exit 3; printf %s "$SEMANTIC_SEARCH_API_TOKEN"' >"$tmp/knn" 2>"$tmp/knn.err"
rc=$?
set -e
case "$rc" in
  0)
    [[ -s "$tmp/knn" && "$(wc -l <"$tmp/knn")" -eq 0 && "$(cat "$tmp/knn")" =~ ^[A-Za-z0-9._~+/=-]+$ ]] \
      || die "the knn token read from $POD is not one plain token; not written"
    mv "$tmp/knn" "$OUT/knn-token"
    chmod 600 "$OUT/knn-token"
    log "knn-token: written"
    ;;
  3)
    rm -f "$OUT/knn-token"
    log "WARNING: SEMANTIC_SEARCH_API_TOKEN is not set on $POD; no knn-token file (that smoke check stays SKIP)"
    ;;
  *) die "could not read SEMANTIC_SEARCH_API_TOKEN from $POD (kubectl exit $rc): $(head -c 200 "$tmp/knn.err")" ;;
esac
ls -l "$OUT" | awk 'NR > 1 {print $1, $NF}'
