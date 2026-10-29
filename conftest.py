import sys


def pytest_configure(config):
    """Register sefaria/conftest.py's hooks when ./sefaria was not on the command line (reader/conftest.py imports it)."""
    mod = sys.modules.get("sefaria.conftest")
    if mod is not None and not config.pluginmanager.is_registered(mod):
        config.pluginmanager.register(mod, "sefaria.conftest")
