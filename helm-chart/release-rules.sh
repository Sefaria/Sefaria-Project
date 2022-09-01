#!/bin/bash

cat << EOF > helm-chart/.releaserc
tagFormat: helm-chart-\${version}
plugins:
  - - "@semantic-release/commit-analyzer"
    - releaseRules:
        - {release: patch}
      parserOpts:
        noteKeywords:
          - MAJOR RELEASE
  - "@semantic-release/release-notes-generator"
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
