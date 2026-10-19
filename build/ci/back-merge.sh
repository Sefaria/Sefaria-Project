#!/bin/bash
# back-merge.sh — Builds a real merge commit of <source> into <target> on a local branch.
# Usage: ./build/ci/back-merge.sh <source-branch> <target-branch> <work-branch>
#
# Reverse paths only: prod → preprod, preprod → master.
#
# Why a merge commit on a frozen branch (and never a squash of the live branch):
# a squashed back-merge copies the source's env files onto the target without
# recording the source as an ancestor, so the merge base never advances. The next
# forward promotion then conflicts on envs/<env>/helmrelease.yaml and
# promotions/<env>, because both sides "changed" the same version lines since the
# stale base (#3728 → #3739).
#
# Conflict policy — only the deploy bot's env-state files are auto-resolved:
#   envs/<env>/helmrelease.yaml, promotions/<env>, helm-chart/promotions/<env>
#   - <env> is the target's own environment → keep the target's version (ours)
#   - any other <env>                       → take the source's version (theirs);
#                                             the source is closer to that env's
#                                             deploy bot
# Any other conflict aborts the merge and exits 1 for a human to resolve.
#
# Outputs (to GITHUB_OUTPUT if set):
#   pending — "true" if the source has commits the target lacks (deploy-bot bumps
#             and merge commits excluded), else "false" and no branch is built
#   commits — the pending commit list, one "<hash> <subject>" per line

set -euo pipefail

SOURCE="${1:?Usage: $0 <source-branch> <target-branch> <work-branch>}"
TARGET="${2:?Usage: $0 <source-branch> <target-branch> <work-branch>}"
BRANCH="${3:?Usage: $0 <source-branch> <target-branch> <work-branch>}"

case "${SOURCE} -> ${TARGET}" in
  "prod -> preprod"|"preprod -> master") ;;
  *)
    echo "❌ Invalid back-merge path: ${SOURCE} → ${TARGET} (allowed: prod→preprod, preprod→master)" >&2
    exit 1 ;;
esac

# master deploys to staging (matches deploy-static.yaml's branch_to_env)
case "$TARGET" in
  master) TARGET_ENV="staging" ;;
  *)      TARGET_ENV="$TARGET" ;;
esac

if ! git fetch --no-tags --force origin \
    "refs/heads/${TARGET}:refs/remotes/origin/${TARGET}" \
    "refs/heads/${SOURCE}:refs/remotes/origin/${SOURCE}" >/dev/null 2>&1; then
  echo "ERROR: git fetch failed for origin/${TARGET} or origin/${SOURCE}." >&2
  exit 1
fi

write_output() {
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    local delim
    delim="commits_$(openssl rand -hex 16 2>/dev/null || echo "${RANDOM}${RANDOM}${RANDOM}")"
    echo "pending=$1" >> "$GITHUB_OUTPUT"
    { echo "commits<<${delim}"; echo "$2"; echo "${delim}"; } >> "$GITHUB_OUTPUT"
  fi
}

# Deploy-bot bumps (deploy-static.yaml "Commit and tag") and merge commits are
# expected to differ between branches; anything else is real code the target lacks.
COMMITS=$(git log "origin/${TARGET}..origin/${SOURCE}" --no-merges --format='%h %s' \
  -E --invert-grep --grep='^deploy\((staging|preprod|prod)\): ')

if [[ -z "$COMMITS" ]]; then
  echo "Nothing to back-merge: ${SOURCE} has no commits ${TARGET} lacks (besides deploy bumps)."
  write_output false ""
  exit 0
fi

echo "Commits on ${SOURCE} missing from ${TARGET}:"
echo "$COMMITS" | sed 's/^/  /'

SOURCE_SHA=$(git rev-parse --short "origin/${SOURCE}")
git checkout -q -B "$BRANCH" "origin/${TARGET}"

if ! git merge --no-ff --no-edit -m "Merge ${SOURCE} (${SOURCE_SHA}) into ${TARGET}" "origin/${SOURCE}"; then
  unresolved=()
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    env=""
    if [[ "$path" =~ ^envs/([^/]+)/helmrelease\.yaml$ ]] \
      || [[ "$path" =~ ^promotions/([^/]+)$ ]] \
      || [[ "$path" =~ ^helm-chart/promotions/([^/]+)$ ]]; then
      env="${BASH_REMATCH[1]}"
    fi

    if [[ -z "$env" ]]; then
      unresolved+=("$path")
    elif [[ "$env" == "$TARGET_ENV" ]]; then
      echo "  resolved ${path}: kept ${TARGET} (owns ${env})"
      git checkout --ours -- "$path" && git add -- "$path"
    else
      echo "  resolved ${path}: took ${SOURCE} (${env} env state)"
      git checkout --theirs -- "$path" && git add -- "$path"
    fi
  done < <(git diff --name-only --diff-filter=U)

  if (( ${#unresolved[@]} > 0 )); then
    echo "❌ Conflicts outside deploy-bot env files — resolve by hand:" >&2
    printf '  %s\n' "${unresolved[@]}" >&2
    git merge --abort
    exit 1
  fi

  git commit -q --no-edit
fi

echo "Built ${BRANCH}: $(git log -1 --format='%h parents=%p')"
write_output true "$COMMITS"
