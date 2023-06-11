#!/bin/bash

#Get the full path of the .githooks directory
HOOK_DIR="$(git rev-parse --show-toplevel)/.githooks"

# Symlink the hooks from the .githooks directory to the .git/hooks directory
ln -s -f "$HOOK_DIR/commit-msg" "$(git rev-parse --git-dir)/hooks/commit-msg"