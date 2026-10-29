#!/usr/bin/env bash
# Checks the prerelease channel helm-chart/release-rules.sh derives from a branch name.
# Two branches of one ticket must get different channels, or their chart releases tag the same versions.
set -euo pipefail
script="$(cd "$(dirname "$0")/.." && pwd)/release-rules.sh"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
channel_for() {
  (cd "$tmp" && rm -rf repo && git init -q -b "$1" repo && cd repo && mkdir helm-chart && bash "$script" \
    && grep -o '"prerelease": "[^"]*"' helm-chart/.releaserc | sed 's/.*: "\(.*\)"/\1/')
}
h() { printf '%s' "$1" | { sha1sum 2>/dev/null || shasum; } | cut -c1-7; }
fail=0
check() { local got; got=$(channel_for "$1"); if [[ "$got" == "$2" ]]; then echo "ok   $1 -> $got"; else echo "FAIL $1 -> $got (want $2)"; fail=1; fi; }
check feature/sc-1/auth-service-phase1 sc-1-auth-service-phase1
check feature/sc-1/bad-key-anonymous sc-1-bad-key-anonymous
check fix/sc-1/Scrub_API-key-logs "sc-1-scrubapi-key-logs-$(h fix/sc-1/Scrub_API-key-logs)"
check chore/helm-release-channel-per-branch "chorehelm-release-channel-per-branch-$(h chore/helm-release-channel-per-branch)"
check hotfix hotfix
check release/v1.2.3 "releasev123-$(h release/v1.2.3)"
check feature/sc-1/api.01 "sc-1-api01-$(h feature/sc-1/api.01)"
check feature/sc-1/007 sc-1-007
check 12345 b12345
check feature/sc-1/2024 sc-1-2024
check ___ "branch-$(h ___)"
# lossy normalisation must not merge distinct branches
for pair in "release/v1.2.3 release/v123" "feature/sc.1/name feature/sc1/name" "a_b c_d" "feature/sc-1/x.y feature/sc-1/xy"; do
  set -- $pair; x=$(channel_for "$1"); y=$(channel_for "$2")
  if [[ "$x" == "$y" ]]; then echo "FAIL collision $1 / $2 -> $x"; fail=1; else echo "ok   no collision $1 ($x) / $2 ($y)"; fi
done
a=$(channel_for feature/sc-1/one); b=$(channel_for feature/sc-1/two)
if [[ "$a" == "$b" ]]; then echo "FAIL sibling branches share channel $a"; fail=1; else echo "ok   siblings differ ($a, $b)"; fi
l1=feature/sc-1/$(printf 'a%.0s' {1..60})-one; l2=feature/sc-1/$(printf 'a%.0s' {1..60})-two
a=$(channel_for "$l1"); b=$(channel_for "$l2")
if [[ "$a" == "$b" ]]; then echo "FAIL long siblings share channel $a"; fail=1; else echo "ok   long siblings differ ($a, $b)"; fi
if [[ ${#a} -le 48 && "$a" =~ ^[0-9a-z-]+$ ]]; then echo "ok   long channel valid (${#a} chars)"; else echo "FAIL long channel invalid: $a"; fail=1; fi
# every channel must be a SemVer prerelease identifier: [0-9a-z-]+, not purely numeric
for n in feature/sc-1/api.01 12345 ___ release/v1.2.3 feature/sc.1/name "$l1"; do
  c=$(channel_for "$n")
  if [[ "$c" =~ ^[0-9a-z-]+$ && ! "$c" =~ ^[0-9]+$ ]]; then echo "ok   valid identifier for $n"; else echo "FAIL invalid identifier '$c' for $n"; fail=1; fi
done
exit $fail
