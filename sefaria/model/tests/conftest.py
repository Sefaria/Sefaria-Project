"""
Conftest for sefaria.model.tests

This module makes fixtures from the parent conftest available to model tests.
"""

import pytest

# Import fixtures from parent conftest
pytest_plugins = ["sefaria.tests.conftest"]