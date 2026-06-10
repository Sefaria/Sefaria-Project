#!/bin/bash
# generate-promotion-pr.sh — Creates a promotion PR with auto-generated changelog.
# Usage: ./build/ci/generate-promotion-pr.sh <source-branch> <target-branch>
#
# Requires:
#   GH_TOKEN           — gh CLI authentication
#   ANTHROPIC_API_KEY  — Claude API key (optional; prod only; graceful fallback if unset)
#
# Outputs (to GITHUB_OUTPUT if set):
#   pr_url, total, feat_count, fix_count, ai_summary, prev_app, prev_chart

set -euo pipefail

SOURCE="${1:?Usage: $0 <source-branch> <target-branch>}"
TARGET="${2:?Usage: $0 <source-branch> <target-branch>}"
TIMESTAMP=$(date -u +'%Y-%m-%d %H:%M UTC')

# Ensure both branches are available as remote refs.
# Log a warning on failure but continue — git show/log will fail explicitly if refs are missing.
if ! git fetch --no-tags origin "${TARGET}" "${SOURCE}" >/dev/null 2>&1; then
  echo "WARNING: git fetch failed for origin/${TARGET} or origin/${SOURCE} — refs may be stale." >&2
fi

# Map target branch → helmrelease env directory (matches deploy-static.yaml convention)
case "$TARGET" in
  preprod) ENV_DIR="preprod" ;;
  prod)    ENV_DIR="prod" ;;
  *)       ENV_DIR="$TARGET" ;;
esac

# --- Rollback reference: read current versions from target branch ---
if ! HELMRELEASE_CONTENT=$(git show "origin/${TARGET}:envs/${ENV_DIR}/helmrelease.yaml" 2>&1); then
  echo "WARNING: Could not read helmrelease.yaml from origin/${TARGET} — rollback reference will be missing." >&2
  HELMRELEASE_CONTENT=""
fi

PREV_APP=$(echo "$HELMRELEASE_CONTENT" | python3 -c "
import sys, re
t = sys.stdin.read()
m = re.search(r'containerImage:\s*\n\s*imageRegistry:[^\n]+\n\s*tag:\s*[\"\'']?([^\"\''\s]+)[\"\'']?', t)
print(m.group(1) if m else 'unknown')
" 2>&1) || PREV_APP="unknown"

PREV_CHART=$(echo "$HELMRELEASE_CONTENT" | python3 -c "
import sys, re
t = sys.stdin.read()
m = re.search(r'chart: sefaria\s*\n\s*version:\s*[\"\'']?([^\"\''\s]+)[\"\'']?', t)
print(m.group(1) if m else 'unknown')
" 2>&1) || PREV_CHART="unknown"

if [[ "$PREV_APP" == "unknown" || "$PREV_CHART" == "unknown" ]]; then
  echo "WARNING: Could not determine rollback versions (app=${PREV_APP}, chart=${PREV_CHART}). Rollback reference in PR may be incomplete." >&2
fi

# --- Changelog: commits between branches (subject + hash only, no author name) ---
# Fail loudly if git log errors — distinguishes "no commits" from "refs unreachable"
if ! COMMITS=$(git log "origin/${TARGET}..origin/${SOURCE}" --pretty=format:"%s (%h)" --no-merges 2>&1); then
  echo "ERROR: git log failed — origin/${TARGET} or origin/${SOURCE} may be unreachable. Output: $COMMITS" >&2
  exit 1
fi

if [[ -z "$COMMITS" ]]; then
  echo "No new commits between ${SOURCE} and ${TARGET}. Skipping PR creation."
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "pr_url=no-changes"   >> "$GITHUB_OUTPUT"
    echo "total=0"             >> "$GITHUB_OUTPUT"
    echo "feat_count=0"        >> "$GITHUB_OUTPUT"
    echo "fix_count=0"         >> "$GITHUB_OUTPUT"
    echo "ai_summary="         >> "$GITHUB_OUTPUT"
    echo "prev_app=${PREV_APP}"     >> "$GITHUB_OUTPUT"
    echo "prev_chart=${PREV_CHART}" >> "$GITHUB_OUTPUT"
  fi
  exit 0
fi

FEAT_COUNT=$(echo "$COMMITS" | grep -c "^feat" || true)
FIX_COUNT=$(echo "$COMMITS"  | grep -c "^fix"  || true)
TOTAL=$(echo "$COMMITS"      | grep -c .        || true)

# --- Claude AI summary: prod only ---
AI_SUMMARY=""
if [[ "$TARGET" == "prod" && -n "${ANTHROPIC_API_KEY:-}" ]]; then
  PROMPT_JSON=$(python3 -c "
import json, sys
commits = sys.stdin.read().strip()
print(json.dumps({
  'model': 'claude-haiku-4-5-20251001',
  'max_tokens': 200,
  'messages': [{
    'role': 'user',
    'content': 'Summarize these git commits in 2-3 sentences for a production deployment PR. Focus on user-facing changes and any risk. Be concise and direct.\n\n' + commits
  }]
}))" <<< "$COMMITS")

  # Capture HTTP status separately so auth/API errors are visible in logs
  CURL_BODY=$(mktemp)
  HTTP_CODE=$(curl -s -o "$CURL_BODY" -w "%{http_code}" \
    https://api.anthropic.com/v1/messages \
    -H "x-api-key: ${ANTHROPIC_API_KEY}" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "$PROMPT_JSON" 2>&1) || HTTP_CODE="000"

  if [[ "$HTTP_CODE" == "200" ]]; then
    AI_SUMMARY=$(python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d['content'][0]['text'].replace('\n', ' '))
" < "$CURL_BODY" 2>&1) || {
      echo "WARNING: Failed to parse Anthropic API response — using fallback summary." >&2
      AI_SUMMARY="_(AI summary unavailable — parse error)_"
    }
  else
    echo "WARNING: Anthropic API returned HTTP ${HTTP_CODE} — using fallback summary." >&2
    cat "$CURL_BODY" >&2
    AI_SUMMARY="_(AI summary unavailable — API returned ${HTTP_CODE})_"
  fi
  rm -f "$CURL_BODY"
fi

# --- Build PR body ---
PR_BODY=$(mktemp)
GH_STDERR=$(mktemp)
trap 'rm -f "$PR_BODY" "$GH_STDERR"' EXIT

{
  echo "## Promote \`${SOURCE}\` → \`${TARGET}\`"
  echo ""
  echo "| Field | Value |"
  echo "|-------|-------|"
  echo "| **Date** | ${TIMESTAMP} |"
  echo "| **Total Commits** | ${TOTAL} |"
  echo "| **Features** | ${FEAT_COUNT} |"
  echo "| **Bug Fixes** | ${FIX_COUNT} |"
  echo ""

  # AI summary: prod only
  if [[ "$TARGET" == "prod" && -n "$AI_SUMMARY" ]]; then
    echo "### AI Summary"
    echo ""
    echo "$AI_SUMMARY"
    echo ""
  fi

  # Rollback reference: all targets
  echo "### Rollback Reference"
  echo ""
  echo "| | Version |"
  echo "|---|---|"
  echo "| **Current on \`${TARGET}\`** | app=\`${PREV_APP}\`, chart=\`${PREV_CHART}\` |"
  echo ""
  echo "> To rollback: revert this PR or re-run the promotion workflow targeting the previous tag."
  echo ""

  echo "### Changes"
  echo ""
  echo "$COMMITS" | sed 's/^/- /'
  echo ""
  echo "---"
  echo "_Auto-generated by Manual Promotion workflow_"
} > "$PR_BODY"

TITLE="Promote to ${TARGET} — ${TIMESTAMP}"

# Capture stdout (URL) and stderr separately.
# On "already exists", retrieve the actual PR URL instead of returning a sentinel string.
PR_URL=$(gh pr create \
  --base "${TARGET}" \
  --head "${SOURCE}" \
  --title "${TITLE}" \
  --body-file "$PR_BODY" 2>"$GH_STDERR") || {
  stderr_content=$(cat "$GH_STDERR")
  if echo "$stderr_content" | grep -q "already exists"; then
    PR_URL=$(gh pr view \
      --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner)" \
      --json url -q .url \
      2>/dev/null || echo "already exists")
    echo "PR already exists: ${PR_URL}"
  else
    echo "ERROR: gh pr create failed: $stderr_content" >&2
    exit 1
  fi
}

echo "PR: ${PR_URL}"

# Export outputs for GitHub Actions.
# Use heredoc delimiter for ai_summary to safely handle any embedded newlines.
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "pr_url=${PR_URL}"         >> "$GITHUB_OUTPUT"
  echo "total=${TOTAL}"           >> "$GITHUB_OUTPUT"
  echo "feat_count=${FEAT_COUNT}" >> "$GITHUB_OUTPUT"
  echo "fix_count=${FIX_COUNT}"   >> "$GITHUB_OUTPUT"
  {
    echo "ai_summary<<EOF"
    echo "$AI_SUMMARY"
    echo "EOF"
  } >> "$GITHUB_OUTPUT"
  echo "prev_app=${PREV_APP}"     >> "$GITHUB_OUTPUT"
  echo "prev_chart=${PREV_CHART}" >> "$GITHUB_OUTPUT"
fi
