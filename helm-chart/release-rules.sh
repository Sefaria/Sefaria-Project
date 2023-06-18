#!/bin/bash

cat << EOF > helm-chart/.releaserc
tagFormat: helm-chart-\${version}
plugins:
  - - "@semantic-release/commit-analyzer"
    - preset: "conventionalcommits"
      releaseRules:
        - {"type": "helm", "release": "minor" }
        - {"type": "helm", "scope": "fix", "release": "patch" }
        - {"type": "feat", "release": false}
        - {"type": "fix", "release": false}
        - {"type": "chore", "release": false}
        - {"type": "docs", "release": false}
        - {"type": "style", "release": false}
        - {"type": "refactor", "release": false}
        - {"type": "perf", "release": false}
        - {"type": "test", "release": false}
        - {"type": "static", "release": false}
      parserOpts:
        noteKeywords:
          - MAJOR RELEASE
  - - "@semantic-release/release-notes-generator"
    - preset: "conventionalcommits"
      presetConfig:
        "types":
          - {"type": "helm", "section": "Helm Chart Changes"}
          - {"type": "feat", "hidden": true}
          - {"type": "fix", "hidden": true}
          - {"type": "chore", "hidden": true}
          - {"type": "docs", "hidden": true}
          - {"type": "style", "hidden": true}
          - {"type": "refactor", "hidden": true}
          - {"type": "perf", "hidden": true}
          - {"type": "test", "hidden": true}
          - {"type": "static", "hidden": true}
  - - "@semantic-release/github"
    - "successComment": false
EOF
export branch=$(git branch --show-current)
if [[ $branch != "master" ]]; then
cat << EOF >> helm-chart/.releaserc
branches: [
    {name: 'master'},
    {name: '${branch}', prerelease: true}
  ]
EOF
else
cat << EOF >> helm-chart/.releaserc
branches: [
    {name: 'master'}
  ]
EOF
fi
