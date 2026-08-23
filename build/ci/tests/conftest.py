"""Make the build/ci scripts importable as plain modules from these tests.

build/ci is not a Python package (no __init__.py, on purpose — it's a bag of
standalone CI scripts, not something anything imports at runtime), so tests
here import shipped_stories / mark_stories_deployed by adding build/ci itself
to sys.path rather than using package-relative imports.
"""

import os
import sys

BUILD_CI_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BUILD_CI_DIR not in sys.path:
    sys.path.insert(0, BUILD_CI_DIR)
