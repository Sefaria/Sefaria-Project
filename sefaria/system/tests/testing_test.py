import importlib

import pytest

import sefaria.system.testing as testing


@pytest.fixture
def reload_testing(monkeypatch):
    def _reload(deploy_env):
        if deploy_env is None:
            monkeypatch.delenv("DEPLOY_ENV", raising=False)
        else:
            monkeypatch.setenv("DEPLOY_ENV", deploy_env)
        return importlib.reload(testing).test_uid

    yield _reload
    monkeypatch.undo()
    importlib.reload(testing)


@pytest.mark.parametrize("deploy_env", ["sandbox-46eebb0", "cauldron.dev/x:y", "", None])
def test_test_uid_is_safe_in_an_index_title(reload_testing, deploy_env):
    # Test objects put test_uid in Index titles, and Index._validate rejects ":.-\\/" there.
    # CI sets DEPLOY_ENV to "sandbox-<sha>", which used to fail every test that built an Index.
    uid = reload_testing(deploy_env)
    assert uid and uid.isascii() and uid.isalnum()


def test_test_uid_keeps_the_deploy_env_so_runs_stay_traceable(reload_testing):
    assert reload_testing("sandbox-46eebb0") == "sandbox46eebb0"
