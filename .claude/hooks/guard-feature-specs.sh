#!/usr/bin/env bash
# Claude Code PreToolUse hook: stop an agent from editing locked behavior specs.
#
# The real control is the Feature Spec Lock CI check (build/ci/check-feature-spec-lock.sh): a PR
# fails if anyone not in the SPEC_EDITORS repo variable changes a locked file. This hook only
# catches it earlier, so an agent doesn't "fix" a failing story by rewriting the spec and the
# engineer doesn't find out until PR time. It is a speed bump, not security: a script the agent writes
# could still change the files, and the CI check would still catch it.
#
# Spec editors turn the guard off for their own sessions by setting SEFARIA_SPEC_EDITOR=1, for
# example in .claude/settings.local.json: { "env": { "SEFARIA_SPEC_EDITOR": "1" } }
# See "The lock" in e2e-tests/feature-specs/README.md.
#
# Exit 2 blocks the tool call and shows stderr to the agent.
set -uo pipefail

[[ "${SEFARIA_SPEC_EDITOR:-}" == "1" ]] && exit 0

# Same list as LOCKED in build/ci/check-feature-spec-lock.sh, matched anywhere in a path so it
# also works from worktrees.
LOCKED_RE='e2e-tests/feature-specs/features\b|e2e-tests/feature-specs/CLAUDE\.md|\.github/workflows/feature-spec-lock\.yaml|build/ci/check-feature-spec-lock\.sh|\.claude/hooks/guard-feature-specs\.sh'

input=$(cat)
tool=$(jq -r '.tool_name // ""' <<< "$input")

block() {
  cat >&2 <<EOF
BLOCKED: $1 is locked. Only spec editors (the SPEC_EDITORS repo variable) may change behavior specs
and the spec lock; CI fails any PR where someone else does.

Do not work around this (no scripts, copies or renames). The spec is the contract; make the code
and the step definitions in e2e-tests/feature-specs/steps/ satisfy it. If you think the spec itself
is wrong or can't be met, stop and tell the user what is wrong and why, so they can ask a spec
editor to change it. Process: e2e-tests/feature-specs/README.md, "Changing a spec".
EOF
  exit 2
}

case "$tool" in
  Edit|Write|MultiEdit|NotebookEdit)
    path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<< "$input")
    if grep -Eq "$LOCKED_RE" <<< "$path"; then
      block "$path"
    fi
    ;;
  Bash)
    cmd=$(jq -r '.tool_input.command // ""' <<< "$input")
    hit=$(grep -Eo "$LOCKED_RE" <<< "$cmd" | head -1)
    [[ -z "$hit" ]] && exit 0
      # Only commands that look like they write. Reads (cat, grep, git diff, npx bddgen) pass.
      # A redirect counts only when its target is a locked path, so a stray ">" (a commit
      # message's <email>, 2>/dev/null, 2>&1) doesn't block.
      if grep -Eq ">>?[[:space:]]*[^[:space:];|&]*($LOCKED_RE)|\btee\b|\b(sed|perl)\b[^|;&]*[[:space:]]-i|\b(rm|mv|cp|touch|truncate|patch|ln)\b|\bgit[[:space:]]+(checkout|restore|rm|mv|apply|stash)\b" <<<"$cmd"; then
      block "a file under $hit"
    fi
    ;;
esac
exit 0
