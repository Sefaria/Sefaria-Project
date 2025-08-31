#!/bin/bash
# liblouis installation script for Unix-like systems (macOS/Linux)

set -e  # Exit on any error

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Installing liblouis for Unix-like system..."

# Check if we're in a virtual environment
if [[ -z "$VIRTUAL_ENV" ]]; then
    echo "⚠️  Warning: Not in a virtual environment. Consider activating one first."
fi

# Run the Python installer
python3 "$SCRIPT_DIR/install_liblouis.py" "$@"

echo "✅ liblouis installation completed!"
