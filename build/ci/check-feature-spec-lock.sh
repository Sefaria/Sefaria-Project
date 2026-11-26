#!/usr/bin/env bash
# Feature-spec lock (e2e-tests/feature-specs/README.md, "The lock").
#
# Only spec editors (repo variable SPEC_EDITORS) may change product's behavior specs or the lock
# itself. A PR fails when any of its commits that changes a locked path was authored by anyone
# else. No review is involved: who wrote the change is what counts.
#
# Locked paths:
#   e2e-tests/feature-specs/features/          the .feature specs
#   e2e-tests/feature-specs/CLAUDE.md          agent rules for the specs
#   .claude/hooks/guard-feature-specs.sh       the local agent guard (same list)
#   .github/workflows/feature-spec-lock.yaml   this check's workflow
#   build/ci/check-feature-spec-lock.sh        this script
# Step definitions, page objects and fixtures are NOT locked.
#
# Merge commits are checked by what they add beyond their parents (git diff-tree --cc). A clean
# merge of master adds nothing, so merging master into a branch is fine. A merge that also edits a
# locked file, for example while resolving a conflict, is attributed to whoever made the merge.
# Squashing a spec editor's commit into your own makes you its author, and the check fails, which
# is intended.
#
# Backstop: every locked file in the PR's net diff must be changed by at least one of the PR's
# commits that this script inspected. A change it can't attribute to a commit fails the check.
#
# Commit authorship comes from the commit's email, which anyone can set. SPEC_LOCK_REQUIRE_SIGNED
# closes that gap by also requiring a verified signature on commits that touch locked paths, made
# by a spec editor: GitHub verifies a signature against the COMMITTER, not the author, so the
# committer must be a spec editor too. Otherwise anyone could set an editor as the author and sign
# with their own key. Edits made in the GitHub web editor are signed by GitHub with the committer
# `web-flow`; those are accepted, because the web editor makes the signed-in user the author.
# Unverified: whether GitHub's REST API can also produce a web-flow-signed commit with a caller-
# chosen author. If it can, that is a remaining way around SPEC_LOCK_REQUIRE_SIGNED.
#
# Required env:
#   BASE_SHA, HEAD_SHA   PR base and head commits (both must be in the local clone)
#   SPEC_EDITORS       comma-separated GitHub logins
#   PR_NUMBER, REPO      used to list the PR's commits with `gh api` (needs GH_TOKEN)
# Optional:
#   SPEC_LOCK_REQUIRE_SIGNED  'true' to require verified signatures on locked-path commits
#   COMMITS_FILE         read "<sha> <author-login> <committer-login> <verified>" lines from this
#                        file instead of the API (for local testing; use "-" for no GitHub login)
set -euo pipefail

LOCKED=(
  "e2e-tests/feature-specs/features/"
  "e2e-tests/feature-specs/CLAUDE.md"
  ".claude/hooks/guard-feature-specs.sh"
  ".github/workflows/feature-spec-lock.yaml"
  "build/ci/check-feature-spec-lock.sh"
)

changed=$(git diff --no-renames --name-only "$BASE_SHA"..."$HEAD_SHA" -- "${LOCKED[@]}")
if [[ -z "$changed" ]]; then
  echo "No locked files changed. Nothing to check."
  exit 0
fi

echo "This PR changes locked files:"
echo "$changed" | sed 's/^/  /'
echo

if [[ -z "${SPEC_EDITORS// /}" ]]; then
  echo "::error::The SPEC_EDITORS repository variable is not set, so nobody is allowed to change locked files. Set it under Settings > Secrets and variables > Actions > Variables (comma-separated GitHub logins)."
  exit 1
fi

lower() { tr '[:upper:]' '[:lower:]' <<< "$1"; }

is_editor() {
  local login a
  login=$(lower "$1")
  IFS=',' read -ra list <<< "$SPEC_EDITORS"
  for a in "${list[@]}"; do
    a="${a// /}"
    [[ -n "$a" && "$(lower "$a")" == "$login" ]] && return 0
  done
  return 1
}

if [[ -n "${COMMITS_FILE:-}" ]]; then
  commits=$(cat "$COMMITS_FILE")
else
  commits=$(gh api --paginate "repos/$REPO/pulls/$PR_NUMBER/commits" \
    --jq '.[] | "\(.sha) \(.author.login // "-") \(.committer.login // "-") \(.commit.verification.verified)"')
fi

# GitHub signs commits made in its web editor with this committer.
GITHUB_WEB_COMMITTER="web-flow"

violations=()
touched=""   # every locked file some inspected commit changed, one per line
while read -r sha login committer verified; do
  [[ -z "${sha:-}" ]] && continue
  # --cc: a non-merge commit lists its changes as usual; a merge lists only files that differ from
  # every parent, i.e. what the merge itself added (nothing, for a clean merge of master).
  files=$(git diff-tree --no-commit-id --name-only -r --cc "$sha" -- "${LOCKED[@]}")
  [[ -z "$files" ]] && continue
  touched+="$files"$'\n'
  files_flat=$(echo $files)
  if [[ "$login" == "-" ]] || ! is_editor "$login"; then
    who=$([[ "$login" == "-" ]] && echo "an author with no GitHub account" || echo "@$login")
    violations+=("${sha:0:10} by $who changes $files_flat")
  elif [[ "${SPEC_LOCK_REQUIRE_SIGNED:-}" == "true" && "$verified" != "true" ]]; then
    violations+=("${sha:0:10} by @$login changes $files_flat but is not signed (verified signatures are required)")
  elif [[ "${SPEC_LOCK_REQUIRE_SIGNED:-}" == "true" && "$committer" != "$GITHUB_WEB_COMMITTER" ]] \
       && { [[ "$committer" == "-" ]] || ! is_editor "$committer"; }; then
    by=$([[ "$committer" == "-" ]] && echo "a committer with no GitHub account" || echo "@$committer")
    violations+=("${sha:0:10} names @$login as author but was committed and signed by $by, who is not a spec editor")
  else
    echo "OK: ${sha:0:10} by @$login (spec editor) changes $files_flat"
  fi
done <<< "$commits"

# Backstop: a locked file in the net diff that no inspected commit changed can't be attributed to
# anyone, so it can't be allowed.
while read -r f; do
  [[ -z "$f" ]] && continue
  if ! grep -qxF -- "$f" <<< "$touched"; then
    violations+=("$f differs from the base branch, but no commit in this PR that the check could inspect changed it")
  fi
done <<< "$changed"

if (( ${#violations[@]} == 0 )); then
  echo "Every change to a locked file was made by a spec editor. Allowed."
  exit 0
fi

for v in "${violations[@]}"; do
  echo "::error::Locked file changed without permission: $v"
done
echo "::error::Only spec editors ($SPEC_EDITORS) may change feature specs or the spec lock. Engineers change step definitions in e2e-tests/feature-specs/steps/ instead. To fix: remove these commits from the branch (for example, revert them), then ask a spec editor to make the change. See \"Changing a spec\" in e2e-tests/feature-specs/README.md."
exit 1
