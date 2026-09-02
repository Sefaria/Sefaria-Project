"""Make the build/ci and scripts directories' scripts importable as plain
modules from these tests.

build/ci is not a Python package (no __init__.py, on purpose — it's a bag of
standalone CI scripts, not something anything imports at runtime), so tests
here import shipped_stories / mark_stories_deployed by adding build/ci itself
to sys.path rather than using package-relative imports. post_to_slack now
lives in the repo-root scripts/ directory (it moved out of build/ci since
it's generically useful, not CI-specific), so that directory is added the
same way.
"""

import os
import sys

BUILD_CI_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(os.path.dirname(BUILD_CI_DIR))
SCRIPTS_DIR = os.path.join(REPO_ROOT, "scripts")

for _dir in (BUILD_CI_DIR, SCRIPTS_DIR):
    if _dir not in sys.path:
        sys.path.insert(0, _dir)
