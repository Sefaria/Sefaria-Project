#!/bin/bash

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
export branch=$(git branch --show-current)
export channel=$(echo $branch | awk '{print tolower($0)}' | sed 's|.*/\([^/]*\)/.*|\1|; t; s|.*|\0|' | sed 's/[^a-z0-9\.\-]//g')
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
