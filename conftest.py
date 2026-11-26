import importlib


def pytest_plugin_registered(plugin, manager):
    """Load sefaria/conftest.py as a global plugin, whatever paths are on the command line.

    pytest scopes a directory conftest's runtest hooks to the tests below that directory,
    so loaded the normal way (./sefaria on the command line), sefaria/conftest.py's
    Mongo-usage recorder never saw reader/sso/powered_by tests -- while ./reader alone
    did. Registering it here, under the name pytest's own conftest loader uses (the
    module's __file__), happens before any directory conftest is imported: when
    pytest later reaches sefaria/conftest.py it finds this registration and reuses it,
    so the hooks apply to every collected test in every invocation.

    Its fixtures are unaffected: pytest scopes fixtures from any file named conftest.py
    to that file's directory, so its autouse fixtures still apply only under sefaria/.

    This runs once, when this root conftest itself is registered (the hook is replayed
    to a plugin for every plugin registered before it, itself included).
    """
    if getattr(plugin, "__file__", None) != __file__:
        return
    # `-p no:sefaria_conftest` opts out: the developer portal's tests (devportal/tests) run without the library,
    # on standalone settings with no MongoDB, or with no Django at all (devportal/tests/pure).
    if manager.is_blocked("sefaria_conftest"):
        return
    mod = importlib.import_module("sefaria.conftest")
    if manager.get_plugin(mod.__file__) is None and not manager.is_registered(mod):
        manager.register(mod, name=mod.__file__)
