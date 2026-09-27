#!/usr/bin/env bash
# setup_status.sh — part of the cauldron-setup skill.
#
# Checks this computer's setup for the cauldron skills and prints one
# "name: value" line per fact, then a list of problems.
# With --write, also saves the facts to ~/.sefaria/cauldron-setup.md, which
# create-cauldron, move-text-to-cauldron and move-lexicon-to-cauldron read.
#
# Changes nothing except (with --write) that one file. Never prints the API
# key, only the names of files that define it. Run it from inside the
# Sefaria-Project folder.
#
# Usage: setup_status.sh [--write] [--api-key-file FILE]
#   --api-key-file  the startup file that defines SEFARIA_CAULDRON_API_KEY
#                   (the user says which one); recorded in the setup file

set -u
WRITE=0; KEYFILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --write) WRITE=1 ;;
    --api-key-file) KEYFILE="${2:-}"; shift ;;
  esac
  shift
done
VAR=SEFARIA_CAULDRON_API_KEY
OUT="$HOME/.sefaria/cauldron-setup.md"

FACTS=""; PROBLEMS=""
fact()    { FACTS="$FACTS$1: $2
"; }
problem() { PROBLEMS="$PROBLEMS- $*
"; }
have()    { command -v "$1" >/dev/null 2>&1; }
short()   { case "$1" in "$HOME"*) printf '~%s' "${1#"$HOME"}";; *) printf '%s' "$1";; esac; }

# --- Where are we? ---------------------------------------------------------
OS=$(uname -s)
if [ "$OS" != Linux ] || ! grep -qi microsoft /proc/version 2>/dev/null; then
  echo "os: $OS"
  echo "wsl: no"
  echo "STOP: this is not a Claude session running inside WSL."
  exit 0
fi
fact setup_version 1
fact written "$(date '+%Y-%m-%d %H:%M')"
fact os linux
fact wsl yes
fact wsl_distro "${WSL_DISTRO_NAME:-unknown}"
fact claude_runs_in "wsl (run every command directly; never use wsl.exe)"

# --- Sefaria-Project -------------------------------------------------------
REPO=$(git rev-parse --show-toplevel 2>/dev/null)
fact sefaria_project "${REPO:-unknown}"
case "$REPO" in
  "") problem "This session isn't inside a Sefaria-Project folder." ;;
  /mnt/*) problem "Sefaria-Project is on the Windows drive ($REPO). Open the WSL copy (e.g. /home/<you>/Sefaria-Project) instead." ;;
esac
if [ -n "$REPO" ]; then
  [ -f "$REPO/sefaria/local_settings.py" ] || problem "No sefaria/local_settings.py in $REPO, so Sefaria can't run from there."
  [ -f "$REPO/scripts/move_draft_text.py" ] || problem "No scripts/move_draft_text.py in $REPO."
  MH=$(grep -E '^[[:space:]]*MONGO_HOST' "$REPO/sefaria/local_settings.py" 2>/dev/null | head -1 \
       | sed -E 's#//[^/@]*@#//<hidden>@#; s/^[[:space:]]*MONGO_HOST[[:space:]]*=[[:space:]]*//; s/["'"'"']//g')
  fact mongo_host "${MH:-unknown}"
fi

# --- Mongo -----------------------------------------------------------------
MONGO=""
if have docker; then
  D=$(timeout 15 docker ps --format '{{.Names}} ({{.Image}})' 2>/dev/null | grep -i mongo | head -1)
  [ -n "$D" ] && MONGO="docker container $D"
fi
[ -z "$MONGO" ] && pgrep -x mongod >/dev/null 2>&1 && MONGO="mongod running directly in WSL"
fact mongo_runs_in "${MONGO:-not found running right now}"

# --- Python that can run Sefaria and read the local database ---------------
try_py() {
  ( cd "$REPO" && PYTHONPATH=. DJANGO_SETTINGS_MODULE=sefaria.settings timeout 180 "$1" -c '
import django; django.setup()
from sefaria.system.database import db
print("OK: database %r has %d books" % (db.name, db.index.estimated_document_count()))' 2>&1 </dev/null \
    | grep -E '^OK|Error|error|No module' | tail -1 | cut -c1-200 )
}
CANDS=""
add() { [ -n "$1" ] && [ -x "$1" ] && CANDS="$CANDS$1
"; }
DEFAULT_PY=$(command -v python3)
add "$DEFAULT_PY"
add "$(bash -lc 'command -v python3' 2>/dev/null </dev/null | tail -1)"
add "$(bash -ic 'command -v python3' 2>/dev/null </dev/null | tail -1)"
for pid in $(pgrep -f 'manage\.py runserver' 2>/dev/null); do
  VE=$(tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | sed -n 's/^VIRTUAL_ENV=//p')
  if [ -n "$VE" ]; then add "$VE/bin/python3"; else add "$(readlink "/proc/$pid/exe" 2>/dev/null)"; fi
done
for d in "$REPO"/venv "$REPO"/.venv "$HOME"/venv* "$HOME"/.venv* "$HOME"/venvs/* "$HOME"/.virtualenvs/* \
         "$HOME"/.pyenv/versions/* "$HOME"/miniconda3/envs/* "$HOME"/anaconda3/envs/*; do
  add "$d/bin/python3"
done

PY_SETUP=""; PY_CHECK=""
if [ -n "$REPO" ]; then
  SEEN=" "
  while IFS= read -r py; do
    [ -z "$py" ] && continue
    case "$SEEN" in *" $py "*) continue ;; esac
    SEEN="$SEEN$py "
    RES=$(try_py "$py")
    case "$RES" in
      OK*)
        PY_CHECK=$RES
        # ./run and the skills call plain "python3", so put this one first on PATH if it isn't already.
        [ "$py" != "$DEFAULT_PY" ] && PY_SETUP="export PATH=\"$(dirname "$py"):\$PATH\""
        break ;;
    esac
  done <<EOF
$CANDS
EOF
fi
fact python_setup "${PY_SETUP:-(none needed)}"
fact python_check "${PY_CHECK:-FAILED}"
[ -z "$PY_CHECK" ] && problem "No Python here could start Sefaria and read the local database. Is local Sefaria (and Mongo) running?"

# --- API key (never printed) -----------------------------------------------
SETS="^[[:space:]]*(export[[:space:]]+)?$VAR="
FOUND=""
for f in "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile" "$HOME/.zshrc"; do
  [ -f "$f" ] && grep -qE "$SETS" "$f" && FOUND="$FOUND, $(short "$f")"
done
fact api_key_env_var "$VAR"
if [ -n "$KEYFILE" ]; then
  KEYFILE=${KEYFILE/#\~/$HOME}
  fact api_key_file "$KEYFILE"
  grep -qE "$SETS" "$KEYFILE" 2>/dev/null || problem "$KEYFILE doesn't contain a line that sets $VAR."
else
  fact api_key_defined_in "${FOUND#, }"
  [ -z "$FOUND" ] && problem "None of the usual startup files define $VAR."
fi

# --- GitHub ----------------------------------------------------------------
fact git_name "$(git config --global user.name || echo '(not set)')"
fact git_email "$(git config --global user.email || echo '(not set)')"
[ -z "$(git config --global user.name)" ] && problem "git name is not set."
[ -z "$(git config --global user.email)" ] && problem "git email is not set."
HELPER=$(git config --get-all credential.helper | tr '\n' ' ')
fact git_credential_helper "${HELPER:-(none)}"
if have gh; then
  fact gh_installed yes
  if timeout 20 gh auth status >/dev/null 2>&1; then
    fact gh_logged_in yes
    fact github_user "$(timeout 20 gh api user --jq .login 2>/dev/null || echo unknown)"
    for r in cauldrons Sefaria-Project; do
      P=$(timeout 20 gh api "repos/Sefaria/$r" --jq '.permissions.push' 2>/dev/null)
      case "$P" in true) P=yes;; false) P=no;; *) P=unknown;; esac
      fact "can_push_$(echo "$r" | tr 'A-Z-' 'a-z_')" "$P"
    done
  else
    fact gh_logged_in no
    problem "gh is not logged in to GitHub."
  fi
  case "$HELPER" in *gh*) ;; *) problem "git isn't using gh's GitHub login yet (run: gh auth setup-git)." ;; esac
else
  fact gh_installed no
  problem "gh (the GitHub tool) is not installed."
fi

# --- cauldrons repo --------------------------------------------------------
CAUL=""
for c in "$HOME/cauldrons" "${REPO:+$(dirname "$REPO")/cauldrons}"; do
  [ -n "$c" ] && [ -f "$c/create-cauldron.sh" ] && { CAUL=$c; break; }
done
fact cauldrons_repo "${CAUL:-not found}"
if [ -z "$CAUL" ]; then
  problem "The cauldrons repo isn't downloaded (expected at ~/cauldrons)."
else
  git -C "$CAUL" remote get-url origin 2>/dev/null | grep -q 'Sefaria/cauldrons' || problem "$CAUL doesn't point at github.com/Sefaria/cauldrons."
  grep -q $'\r' "$CAUL/create-cauldron.sh" && problem "$CAUL/create-cauldron.sh has Windows line endings. Delete $CAUL and clone it again inside WSL."
  [ -f "$CAUL/.git/refs/heads/main" ] || problem "$CAUL/.git/refs/heads/main is missing (run: git -C $CAUL fetch origin main:main)."
fi

# --- Tools -----------------------------------------------------------------
MISSING=""
for t in git make wget curl gh; do have "$t" || MISSING="$MISSING $t"; done
MISSING=${MISSING# }
fact tools_missing "${MISSING:-none}"
for t in $MISSING; do
  case $t in make|wget|curl) problem "'$t' is not installed (create-cauldron needs it): sudo apt install $t" ;; esac
done

# --- Output ----------------------------------------------------------------
printf '%s' "$FACTS"
echo
echo "Problems:"
printf '%s' "${PROBLEMS:-- none
}"

if [ $WRITE = 1 ]; then
  mkdir -p "$HOME/.sefaria" && chmod 700 "$HOME/.sefaria"
  {
    echo "# Sefaria cauldron setup"
    echo
    echo "Written by the cauldron-setup Claude skill. Run that skill again to refresh it."
    echo "Read by the create-cauldron, move-text-to-cauldron and move-lexicon-to-cauldron skills."
    echo "This file never contains the API key itself, only where it is stored."
    echo
    printf '%s' "$FACTS"
    echo
    echo "## Problems found when this was written"
    printf '%s' "${PROBLEMS:-- none
}"
  } > "$OUT"
  chmod 600 "$OUT"
  echo
  echo "Saved to $(short "$OUT")"
fi
exit 0
