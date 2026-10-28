import os
import sys


def pytest_configure(config):
    """Register sefaria/conftest.py's hooks when ./sefaria was not on the command line (reader/conftest.py imports it).

    The plugin is registered under the name pytest itself uses for a conftest (its file path):
    pytest looks that name up before importing a conftest, so `pytest reader/tests .` finds the
    module already registered instead of registering the same object a second time under a
    different name (ValueError: Plugin already registered under a different name).
    """
    mod = sys.modules.get("sefaria.conftest")
    if mod is not None and not config.pluginmanager.is_registered(mod):
        config.pluginmanager.register(mod, os.path.abspath(mod.__file__))
