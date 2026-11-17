#!/usr/bin/env bash
# check-next-release.sh: after #3774 lands (semantic-release 18 -> 24), did the next unrelated release on master
# still cut its tags? Read-only; needs `git` with origin fetched.
#
#   check-next-release.sh --since <merge commit of #3774>
#
# semantic-release 24 runs in deploy-static.yaml's release-chart job (helm-chart/), so the proof is a LATER CHART
# release: a deploy(staging) commit after #3774's own whose chart version is higher, with its helm-chart-<version> tag.
# An app-only release does not exercise that job: it is reported, and the check says WAIT until a chart release.
# Releasable types follow .releaserc: feat, fix, perf, static, chore, hotfix, ci (helm and deploy cut no release).
set -euo pipefail
SINCE=""
while (($#)); do
  case "$1" in
    --since) SINCE="$2"; shift 2 ;;
    -h | --help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$SINCE" ]] || { echo "--since <merge commit of #3774> is required" >&2; exit 2; }
git fetch -q --tags origin master
git merge-base --is-ancestor "$SINCE" origin/master || { echo "FAIL  $SINCE is not on origin/master" >&2; exit 1; }

deploys="$(git log --reverse --format='%H %s' "$SINCE"..origin/master --grep='^deploy(staging)')"
releasable="$(git log --format='%h %s' "$SINCE"..origin/master | grep -E '^[0-9a-f]+ (feat|fix|perf|static|chore|hotfix|ci)(\(|:|!)' | grep -v 'auth-service' || true)"
echo "deploy(staging) commits since $SINCE:"
sed 's/^\([0-9a-f]\{10\}\)[0-9a-f]* /  \1 /' <<<"${deploys:-  none}"
echo "releasable commits by others since $SINCE:"
sed 's/^/  /' <<<"${releasable:-none}"

first="$(sed -n 1p <<<"$deploys")"
[[ -n "$first" ]] || { echo "FAIL  #3774's own release left no deploy(staging) commit: look at deploy-static.yaml's run for $SINCE"; exit 1; }
ver() { sed -nE 's/.*app=([0-9.]+) chart=([0-9.]+).*/\1 \2/p' <<<"$1"; }
newer() { [[ "$1" != "$2" && "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)" == "$2" ]]; }   # newer A B: B > A
read -r app0 chart0 <<<"$(ver "$first")"
[[ -n "$chart0" ]] || { echo "FAIL  cannot read the versions in: $first"; exit 1; }
echo "#3774's release: app $app0, chart $chart0"

app_after="" chart_after=""
while read -r line; do
  [[ -n "$line" ]] || continue
  read -r a c <<<"$(ver "$line")"
  newer "$app0" "$a" && app_after="$a"
  if newer "$chart0" "$c"; then chart_after="$c"; fi
done < <(tail -n +2 <<<"$deploys")

if [[ -n "$chart_after" ]]; then
  if git rev-parse -q --verify "refs/tags/helm-chart-$chart_after" >/dev/null; then
    echo "PASS  a later chart release ran on semantic-release 24: chart $chart_after, tag helm-chart-$chart_after"
    exit 0
  fi
  echo "FAIL  deploy(staging) says chart $chart_after but tag helm-chart-$chart_after does not exist"; exit 1
fi
[[ -n "$app_after" ]] && echo "INFO  app releases still cut (app $app_after), but those skip the release-chart job"
# helm-chart/release-rules.sh decides which commits under helm-chart/ cut a chart release; list them for the reader.
chart_commits="$(git log --format='%h %s' "$SINCE"..origin/master -- helm-chart/ | grep -v '^[0-9a-f]* deploy(' || true)"
echo "commits touching helm-chart/ since $SINCE:"
sed 's/^/  /' <<<"${chart_commits:-none}"
if [[ -z "$releasable" && -z "$chart_commits" ]]; then echo "WAIT  no releasable commit from another team yet"
else echo "WAIT  no chart release since #3774's (chart $chart0): the check needs one; if a helm-chart/ commit above should have cut one, look at its release-chart job"; fi
