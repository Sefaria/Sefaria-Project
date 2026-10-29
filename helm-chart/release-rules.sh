#!/bin/bash

export branch=$(git branch --show-current)
# Prerelease channel for non-master branches. Three or more path segments (feature/<ticket>/<name>) give
# "<ticket>-<name>", so sibling branches of one ticket do not share a channel and tag the same version.
# The channel must be a valid SemVer prerelease identifier: only [0-9a-z-], nonempty, not purely numeric
# (dots would split it into several identifiers). Sanitising is lossy ("release/v1.2.3" and "release/v123" would
# both give "releasev123"), so whenever it drops or changes anything beyond lowercasing and the intended
# "<ticket>/<name>" join, or the name is over 48 chars, the channel is cut to 40 chars and gets "-" plus a 7-hex
# sha1 of the full branch name appended. Clean names stay unhashed. Known limit, accepted for readable versions: a
# branch named exactly like another branch's joined channel (e.g. "sc-1-x" and "feature/sc-1/x") shares its channel.
joined=$(printf '%s' "$branch" | tr 'A-Z' 'a-z' | sed -E 's|.*/([^/]*)/([^/]*)$|\1-\2|')
channel=$(printf '%s' "$joined" | sed 's/[^a-z0-9-]//g' | sed -E 's/^-+//; s/-+$//')
if [[ "$channel" != "$joined" || ${#channel} -gt 48 ]]; then
  hash=$(printf '%s' "$branch" | { sha1sum 2>/dev/null || shasum; } | cut -c1-7)
  channel="$(printf '%s' "${channel:0:40}" | sed -E 's/-+$//')"
  channel="${channel:-branch}-$hash"
fi
[[ -z "$channel" ]] && channel="branch"
[[ "$channel" =~ ^[0-9]+$ ]] && channel="b$channel"
if [[ ! "$channel" =~ ^[0-9a-z-]+$ ]]; then
  echo "release-rules.sh: invalid prerelease channel '$channel' for branch '$branch'" >&2
  exit 1
fi
export channel

cat << EOF > helm-chart/.releaserc
extends:
  - semantic-release-monorepo
tagFormat: helm-chart-\${version}
plugins:
  - - "@semantic-release/commit-analyzer"
    - preset: "conventionalcommits"
      releaseRules:
        - {"type": "feat", "release": "minor"}
        - {"type": "fix", "release": "patch"}
        - {"type": "chore", "release": "patch"}
        - {"type": "docs", "release": "patch"}
        - {"type": "style", "release": "patch"}
        - {"type": "refactor", "release": "patch"}
        - {"type": "perf", "release": "patch"}
        - {"type": "test", "release": "patch"}
        - {"type": "static", "release": "patch"}
        - {"type": "helm", "release": "patch"}
        - {"type": "deploy", "release": "patch"}
      parserOpts:
        noteKeywords:
          - MAJOR RELEASE
  - - "@semantic-release/release-notes-generator"
    - preset: "conventionalcommits"
      presetConfig:
        "types":
          - {"type": "helm", "section": "Helm Chart Changes"}
  - - "@semantic-release/github"
    - "successComment": false
EOF
if [[ $branch != "master" ]]; then
cat << EOF >> helm-chart/.releaserc
branches: [
    {"name": "master"},
    {"name": "${branch}", "prerelease": "$channel"}
  ]
EOF
else
cat << EOF >> helm-chart/.releaserc
branches: [
    {"name": "master"}
  ]
EOF
fi
