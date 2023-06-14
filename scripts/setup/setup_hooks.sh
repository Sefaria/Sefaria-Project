#!/bin/bash

#Get the full path of the .githooks directory
HOOK_DIR="$(git rev-parse --show-toplevel)/.githooks"
GIT_DEFAULT_HOOK_DIR="$(git rev-parse --git-dir)/hooks"
HOOK_NAME="commit-msg"

echo "HOOK_DIR: $HOOK_DIR"
echo "GIT_DEFAULT_HOOK_DIR: $GIT_DEFAULT_HOOK_DIR"
echo "HOOK_NAME: $HOOK_NAME"
echo "Target file: $GIT_DEFAULT_HOOK_DIR/$HOOK_NAME"

# Symlink the hooks from the .githooks directory to the .git/hooks directory
ln -s -f "$HOOK_DIR/$HOOK_NAME" "$GIT_DEFAULT_HOOK_DIR/$HOOK_NAME"
chmod +x "$GIT_DEFAULT_HOOK_DIR/commit-msg"