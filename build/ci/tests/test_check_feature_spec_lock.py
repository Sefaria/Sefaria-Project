"""Tests for build/ci/check-feature-spec-lock.sh (the Feature Spec Lock check).

Each test builds a throwaway git repo, makes commits, and runs the real script with
COMMITS_FILE standing in for the GitHub API's list of the PR's commits.

Run: python -m pytest build/ci/tests/test_check_feature_spec_lock.py
"""

import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "check-feature-spec-lock.sh"
SPEC = "e2e-tests/feature-specs/features/library/reading-a-text.feature"
EDITOR = "product-editor"
ENGINEER = "some-engineer"


class Repo:
    def __init__(self, root: Path):
        self.root = root
        self.git("init", "-q", "-b", "master")
        self.git("config", "user.email", "t@example.com")
        self.git("config", "user.name", "t")
        self.git("config", "commit.gpgsign", "false")

    def git(self, *args) -> str:
        return subprocess.run(
            ["git", *args], cwd=self.root, check=True, capture_output=True, text=True
        ).stdout.strip()

    def write(self, rel: str, text: str):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
        self.git("add", rel)

    def commit(self, rel: str, text: str, msg: str = "c") -> str:
        self.write(rel, text)
        self.git("commit", "-q", "-m", msg)
        return self.head()

    def head(self) -> str:
        return self.git("rev-parse", "HEAD")

    def run_lock(self, base: str, rows: list[tuple], signed: bool = False):
        """rows: (sha, author_login, committer_login, verified)"""
        commits = self.root / "commits.txt"
        commits.write_text(
            "".join(f"{sha} {a} {c} {'true' if v else 'false'}\n" for sha, a, c, v in rows)
        )
        env = {
            **os.environ,
            "BASE_SHA": base,
            "HEAD_SHA": self.head(),
            "SPEC_EDITORS": f"{EDITOR}, someone-else",
            "COMMITS_FILE": str(commits),
            "SPEC_LOCK_REQUIRE_SIGNED": "true" if signed else "",
        }
        return subprocess.run(
            ["bash", str(SCRIPT)], cwd=self.root, env=env, capture_output=True, text=True
        )


@pytest.fixture
def repo(tmp_path):
    r = Repo(tmp_path)
    r.commit(SPEC, "Feature: v1\n", "base spec")
    r.commit("other.txt", "x\n", "base other")
    r.base = r.head()
    r.git("checkout", "-q", "-b", "branch")
    return r


def passed(result):
    return result.returncode == 0


# --- authorship, no signing ---------------------------------------------------------------


def test_no_locked_change_passes(repo):
    sha = repo.commit("e2e-tests/feature-specs/steps/x.steps.ts", "// step\n")
    assert passed(repo.run_lock(repo.base, [(sha, ENGINEER, ENGINEER, False)]))


def test_editor_spec_commit_passes(repo):
    sha = repo.commit(SPEC, "Feature: v2\n")
    assert passed(repo.run_lock(repo.base, [(sha, EDITOR, EDITOR, False)]))


def test_editor_login_match_is_case_insensitive(repo):
    sha = repo.commit(SPEC, "Feature: v2\n")
    assert passed(repo.run_lock(repo.base, [(sha, EDITOR.upper(), EDITOR, False)]))


def test_engineer_spec_commit_fails(repo):
    sha = repo.commit(SPEC, "Feature: v2\n")
    assert not passed(repo.run_lock(repo.base, [(sha, ENGINEER, ENGINEER, False)]))


def test_author_without_github_account_fails(repo):
    sha = repo.commit(SPEC, "Feature: v2\n")
    assert not passed(repo.run_lock(repo.base, [(sha, "-", "-", False)]))


# --- merge commits --------------------------------------------------------------------------


def _advance_master(repo, path="other.txt", text="master change\n"):
    repo.git("checkout", "-q", "master")
    repo.commit(path, text, "master moves on")
    repo.git("checkout", "-q", "branch")


def test_clean_merge_of_master_by_engineer_passes(repo):
    spec = repo.commit(SPEC, "Feature: v2\n", "editor's spec")
    _advance_master(repo)
    repo.git("merge", "-q", "--no-edit", "master")
    merge = repo.head()
    rows = [(spec, EDITOR, EDITOR, False), (merge, ENGINEER, ENGINEER, False)]
    assert passed(repo.run_lock(repo.base, rows))


def test_merging_master_that_changed_a_spec_passes(repo):
    """A spec change that reached master legitimately isn't this PR's change."""
    repo.commit("e2e-tests/feature-specs/steps/x.steps.ts", "// step\n")
    steps = repo.head()
    _advance_master(repo, SPEC, "Feature: changed on master\n")
    repo.git("merge", "-q", "--no-edit", "master")
    merge = repo.head()
    new_base = repo.git("rev-parse", "master")
    rows = [(steps, ENGINEER, ENGINEER, False), (merge, ENGINEER, ENGINEER, False)]
    assert passed(repo.run_lock(new_base, rows))


def test_engineer_editing_spec_inside_merge_fails(repo):
    """Review finding: an evil merge used to be skipped and the lock passed."""
    _advance_master(repo)
    repo.git("merge", "-q", "--no-ff", "--no-commit", "master")
    repo.write(SPEC, "Feature: smuggled in a merge\n")
    repo.git("commit", "-q", "--no-edit")
    merge = repo.head()
    result = repo.run_lock(repo.base, [(merge, ENGINEER, ENGINEER, False)])
    assert not passed(result)
    assert merge[:10] in result.stdout


def test_editor_editing_spec_inside_merge_passes(repo):
    _advance_master(repo)
    repo.git("merge", "-q", "--no-ff", "--no-commit", "master")
    repo.write(SPEC, "Feature: editor resolved a conflict\n")
    repo.git("commit", "-q", "--no-edit")
    assert passed(repo.run_lock(repo.base, [(repo.head(), EDITOR, EDITOR, False)]))


# --- backstop ------------------------------------------------------------------------------


def test_spec_change_not_in_any_listed_commit_fails(repo):
    """If the commit list misses the commit that changed a spec, the net diff still catches it."""
    repo.commit(SPEC, "Feature: v2\n")
    steps = repo.commit("e2e-tests/feature-specs/steps/x.steps.ts", "// step\n")
    result = repo.run_lock(repo.base, [(steps, EDITOR, EDITOR, False)])
    assert not passed(result)
    assert SPEC in result.stdout


# --- SPEC_LOCK_REQUIRE_SIGNED ----------------------------------------------------------------


def test_signed_required_editor_signed_passes(repo):
    sha = repo.commit(SPEC, "Feature: v2\n")
    assert passed(repo.run_lock(repo.base, [(sha, EDITOR, EDITOR, True)], signed=True))


def test_signed_required_unsigned_fails(repo):
    sha = repo.commit(SPEC, "Feature: v2\n")
    assert not passed(repo.run_lock(repo.base, [(sha, EDITOR, EDITOR, False)], signed=True))


def test_signed_required_engineer_posing_as_editor_fails(repo):
    """Review finding: editor as author, signed with the engineer's own key, used to pass."""
    sha = repo.commit(SPEC, "Feature: v2\n")
    result = repo.run_lock(repo.base, [(sha, EDITOR, ENGINEER, True)], signed=True)
    assert not passed(result)
    assert ENGINEER in result.stdout


def test_signed_required_committer_without_account_fails(repo):
    sha = repo.commit(SPEC, "Feature: v2\n")
    assert not passed(repo.run_lock(repo.base, [(sha, EDITOR, "-", True)], signed=True))


def test_signed_required_github_web_editor_passes(repo):
    sha = repo.commit(SPEC, "Feature: v2\n")
    assert passed(repo.run_lock(repo.base, [(sha, EDITOR, "web-flow", True)], signed=True))


def test_committer_not_checked_when_signing_not_required(repo):
    """Without the flag, behavior is unchanged: only the author counts."""
    sha = repo.commit(SPEC, "Feature: v2\n")
    assert passed(repo.run_lock(repo.base, [(sha, EDITOR, ENGINEER, False)]))
