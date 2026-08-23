"""Tests for build/ci/shipped_stories.py.

No network, no `git`, no `gh` calls: git interaction goes through the
module's own `run_git` function, which these tests monkeypatch directly.

All story ids used below (11111, 22222, ...) are placeholders, not real
Shortcut story ids.
"""

import json

import pytest

import shipped_stories as ss
import post_to_slack as pts


# --- SC-id extraction -------------------------------------------------

@pytest.mark.parametrize(
    "text,expected",
    [
        ("fix(sc-11111): correct the thing", {"11111"}),
        ("fix(SC-11111): case-insensitive", {"11111"}),
        ("[sc-22222] bracketed form", {"22222"}),
        ("Feature/sc-33333/some-description", {"33333"}),
        ("Feature/sc_33333/underscore-form", {"33333"}),
        ("chore: sc-44444 cleanup", {"44444"}),
        ("feat(sc-55555): add widget", {"55555"}),
        ("plain commit with no story id", set()),
        ("", set()),
        (None, set()),
    ],
)
def test_extract_story_ids_from_commit_subjects(text, expected):
    assert ss.extract_story_ids(text) == expected


@pytest.mark.parametrize(
    "branch,expected",
    [
        ("feature/sc-11111/thing", {"11111"}),
        ("fix/sc-22222/apply-gates-during-selection", {"22222"}),
        ("chore/sc-33333/extensive-automated-testing", {"33333"}),
        ("bugfix-explorer-overlay", set()),
        ("update-990-form-2025", set()),
    ],
)
def test_extract_story_ids_from_branch_names(branch, expected):
    assert ss.extract_story_ids(branch) == expected


def test_extract_story_ids_unions_multiple_matches_in_one_string():
    text = "fix(sc-11111): also touches sc-22222 in passing"
    assert ss.extract_story_ids(text) == {"11111", "22222"}


# --- PR number extraction ----------------------------------------------

@pytest.mark.parametrize(
    "text,expected",
    [
        ("Fix the thing (#3644)", "3644"),
        ("Multi-word title here (#42)", "42"),
        ("No PR number here", None),
        ("Unterminated PR ref (#35", None),
        # The LAST (#NNN) wins -- this is the merge-commit convention, and
        # it's also what disambiguates a revert-of-a-revert style subject
        # where the original PR ref is quoted inside the reverted subject.
        ('Revert "Fix the thing (#123)" (#456)', "456"),
        ("(#1) then (#2) then (#3)", "3"),
    ],
)
def test_extract_pr_number(text, expected):
    assert ss.extract_pr_number(text) == expected


# --- Noise filtering ------------------------------------------------------

@pytest.mark.parametrize(
    "subject",
    [
        "deploy(staging): app=6.110.18 chart=0.87.4 [skip ci]",
        "deploy(preprod): app=6.111.0-preprod.4 chart=0.87.5-preprod.1 [skip ci]",
        "deploy(prod): app=6.111.0-prod.2 chart=0.87.5-prod.1 [skip ci]",
        # deploy(<any word>) must be recognized, not just the three
        # originally-enumerated envs -- e.g. a sandbox environment.
        "deploy(sandbox): app=6.110.18 chart=0.87.4 [skip ci]",
        "deploy(demo1): app=1.0.0 [skip ci]",
        "Merge pull request #123 from Sefaria/some-branch",
        "Merge branch 'preprod' into 'prod'",
        "some real change [skip ci]",
    ],
)
def test_noise_pattern_matches_deploy_and_merge_noise(subject):
    assert ss.NOISE_PATTERN.search(subject)


@pytest.mark.parametrize(
    "subject",
    [
        "fix: put fallback params in settings",
        "Update 990 form (#3642)",
        "fix(explore): keep hovered link attached when raising it to the front (#3581)",
    ],
)
def test_noise_pattern_does_not_match_real_commits(subject):
    assert not ss.NOISE_PATTERN.search(subject)


# --- Revert detection ---------------------------------------------------

@pytest.mark.parametrize(
    "subject",
    [
        'Revert "fix(sc-11111): correct the thing"',
        'revert "case-insensitive quoted form"',
        'REVERT "shouty case"',
        "Revert: fix(sc-11111): correct the thing",
        "revert(sc-11111): correct the thing",
        "Revert(scope-only-form): correct the thing",
    ],
)
def test_revert_pattern_matches(subject):
    assert ss.REVERT_PATTERN.match(subject)


@pytest.mark.parametrize(
    "subject",
    [
        "fix(sc-11111): correct the thing",
        "some commit that mentions revert in passing",
        "reverting: not the anchored form",
    ],
)
def test_revert_pattern_does_not_match(subject):
    assert not ss.REVERT_PATTERN.match(subject)


# --- Range spec parsing -----------------------------------------------

def test_split_range_spec_basic():
    prev, cur = ss.split_range_spec("prod/1.0+chart.1..prod/2.0+chart.2")
    assert prev == "prod/1.0+chart.1"
    assert cur == "prod/2.0+chart.2"


def test_split_range_spec_missing_dotdot_exits():
    with pytest.raises(SystemExit):
        ss.split_range_spec("no-range-here")


def test_split_range_spec_empty_side_exits():
    with pytest.raises(SystemExit):
        ss.split_range_spec("..cur-only")


# --- --version range resolution ----------------------------------------

def _fake_run_git(tag_responses):
    """Build a stand-in for ss.run_git that answers `tag --list <glob>` calls
    from a dict of {glob: [tag, ...]} and errors on anything unexpected."""

    def _run_git(args):
        assert args[0] == "tag" and args[1] == "--list"
        glob = args[2]
        if glob not in tag_responses:
            raise AssertionError(f"unexpected git tag --list glob: {glob!r}")
        return "\n".join(tag_responses[glob]) + ("\n" if tag_responses[glob] else "")

    return _run_git


ALL_PROD_TAGS = [
    "prod/6.111.0-prod.2+chart.0.87.5-prod.1",
    "prod/6.111.0-prod.1+chart.0.87.4-prod.1",
    "prod/6.110.10-prod.3+chart.0.87.3-prod.1",
]


def test_resolve_range_from_version_success(monkeypatch):
    monkeypatch.setattr(ss, "run_git", _fake_run_git({
        "prod/6.111.0-prod.2+*": ["prod/6.111.0-prod.2+chart.0.87.5-prod.1"],
        "prod/*": ALL_PROD_TAGS,
    }))
    prev, cur = ss.resolve_range_from_version("6.111.0-prod.2")
    assert cur == "prod/6.111.0-prod.2+chart.0.87.5-prod.1"
    assert prev == "prod/6.111.0-prod.1+chart.0.87.4-prod.1"


def test_resolve_range_from_version_strips_leading_v(monkeypatch):
    monkeypatch.setattr(ss, "run_git", _fake_run_git({
        "prod/6.111.0-prod.2+*": ["prod/6.111.0-prod.2+chart.0.87.5-prod.1"],
        "prod/*": ALL_PROD_TAGS,
    }))
    prev, cur = ss.resolve_range_from_version("v6.111.0-prod.2")
    assert cur == "prod/6.111.0-prod.2+chart.0.87.5-prod.1"


def test_resolve_range_from_version_zero_matches_exits(monkeypatch):
    monkeypatch.setattr(ss, "run_git", _fake_run_git({
        "prod/9.9.9-prod.1+*": [],
    }))
    with pytest.raises(SystemExit):
        ss.resolve_range_from_version("9.9.9-prod.1")


def test_resolve_range_from_version_multiple_matches_exits(monkeypatch):
    monkeypatch.setattr(ss, "run_git", _fake_run_git({
        "prod/6.111.0-prod.2+*": [
            "prod/6.111.0-prod.2+chart.0.87.5-prod.1",
            "prod/6.111.0-prod.2+chart.0.87.6-prod.1",
        ],
    }))
    with pytest.raises(SystemExit):
        ss.resolve_range_from_version("6.111.0-prod.2")


def test_resolve_range_from_version_oldest_tag_exits(monkeypatch):
    # cur resolves to the oldest tag in the full prod/* listing -> no previous tag
    monkeypatch.setattr(ss, "run_git", _fake_run_git({
        "prod/6.110.10-prod.3+*": ["prod/6.110.10-prod.3+chart.0.87.3-prod.1"],
        "prod/*": ALL_PROD_TAGS,
    }))
    with pytest.raises(SystemExit):
        ss.resolve_range_from_version("6.110.10-prod.3")


# --- get_commit_subjects filters blank lines ---------------------------

def test_get_commit_subjects_filters_blank_lines(monkeypatch):
    monkeypatch.setattr(ss, "run_git", lambda args: "subject one\n\nsubject two\n")
    assert ss.get_commit_subjects("a..b") == ["subject one", "subject two"]


# --- fetch_story: workflow_id capture ----------------------------------

class _FakeShortcutResponse:
    def __init__(self, payload):
        self._body = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self._body


def test_fetch_story_captures_workflow_id(monkeypatch):
    monkeypatch.setattr(
        ss.urllib.request, "urlopen",
        lambda req, timeout=None: _FakeShortcutResponse({
            "id": 11111,
            "name": "Story A",
            "description": "desc",
            "app_url": "https://app.shortcut.com/org/story/11111",
            "workflow_id": 500000005,
            "workflow_state_id": 500000045,
            "story_type": "feature",
        }),
    )
    sid, data = ss.fetch_story("11111", "fake-token-for-tests")
    assert sid == "11111"
    assert data["workflow_id"] == 500000005
    assert data["workflow_state_id"] == 500000045


def test_fetch_story_workflow_id_defaults_to_none_when_absent(monkeypatch):
    """The Shortcut story object always has workflow_id in practice, but
    the field is still read defensively -- if it's ever missing, emit null
    rather than raising."""
    monkeypatch.setattr(
        ss.urllib.request, "urlopen",
        lambda req, timeout=None: _FakeShortcutResponse({
            "id": 22222,
            "workflow_state_id": 500000045,
        }),
    )
    sid, data = ss.fetch_story("22222", "fake-token-for-tests")
    assert data["workflow_id"] is None


# --- main(): revert commits are suppressed from story_ids and reported --

def _run_main_with_commits(monkeypatch, tmp_path, commit_subjects):
    """Drive main() end-to-end for a --range invocation with no PR numbers
    in play (so fetch_branches never shells out to `gh`) and no
    SHORTCUT_API_TOKEN set (so hydration is skipped, matching the expected
    no-token path). Returns the parsed output JSON."""
    monkeypatch.setattr(ss, "run_git", lambda args: "\n".join(commit_subjects) + "\n")
    monkeypatch.delenv("SHORTCUT_API_TOKEN", raising=False)

    out_path = tmp_path / "shipped-stories.json"
    monkeypatch.setattr(
        "sys.argv",
        ["shipped_stories.py", "--range", "prev-tag..cur-tag", "--out", str(out_path)],
    )
    ss.main()
    return json.loads(out_path.read_text(encoding="utf-8"))


def test_main_suppresses_revert_story_ids_from_shipped_set(monkeypatch, tmp_path):
    data = _run_main_with_commits(monkeypatch, tmp_path, [
        'Revert "fix(sc-11111): correct the thing"',
        "fix(sc-22222): a real, non-reverted change",
    ])
    assert data["story_ids"] == ["22222"]
    assert data["reverted_commits"] == [
        {"subject": 'Revert "fix(sc-11111): correct the thing"', "suppressed_story_ids": ["11111"]},
    ]


def test_main_revert_without_a_story_id_is_not_reported_or_treated_as_noiseless(monkeypatch, tmp_path):
    """A revert commit that never carried a story id in the first place has
    nothing to suppress -- it shouldn't show up in reverted_commits (nothing
    was suppressed) and it shouldn't show up in commits_without_story either
    (it's an ordinary revert, not a commit needing manual attention)."""
    data = _run_main_with_commits(monkeypatch, tmp_path, [
        'Revert "cleanup only, no story"',
    ])
    assert data["reverted_commits"] == []
    assert data["commits_without_story"] == []
    assert data["story_ids"] == []


def test_main_does_not_double_report_revert_in_commits_without_story(monkeypatch, tmp_path):
    """A revert whose story id was suppressed must not ALSO land in
    commits_without_story -- it's already visible via reverted_commits."""
    data = _run_main_with_commits(monkeypatch, tmp_path, [
        'Revert "fix(sc-33333): thing"',
    ])
    assert data["reverted_commits"] == [
        {"subject": 'Revert "fix(sc-33333): thing"', "suppressed_story_ids": ["33333"]},
    ]
    assert data["commits_without_story"] == []


def test_main_non_revert_commit_without_story_id_still_flagged(monkeypatch, tmp_path):
    """Sanity check that ordinary commits_without_story detection is
    untouched by the revert handling."""
    data = _run_main_with_commits(monkeypatch, tmp_path, [
        "a completely unrelated commit with no story id",
    ])
    assert data["commits_without_story"] == ["a completely unrelated commit with no story id"]
    assert data["reverted_commits"] == []


# --- post_to_slack.chunk_text --------------------------------------------
# Tested here (rather than in a dedicated test_post_to_slack.py) because
# this change touched only the two existing test files in build/ci/tests/.

def test_chunk_text_hard_splits_single_over_limit_paragraph():
    limit = 100
    text = ("word " * 40).strip()  # one paragraph, no blank lines, > limit
    assert len(text) > limit
    chunks = pts.chunk_text(text, limit)
    assert len(chunks) > 1
    assert all(len(c) <= limit for c in chunks)


def test_chunk_text_5000_char_single_paragraph_yields_conformant_chunks():
    limit = 2900
    text = "word " * 1000  # 5000 chars, single paragraph (no blank lines)
    assert len(text) == 5000
    assert "\n\n" not in text
    chunks = pts.chunk_text(text, limit)
    assert len(chunks) > 1
    assert all(len(c) <= limit for c in chunks)


def test_chunk_text_hard_split_prefers_a_space_boundary_over_mid_word():
    limit = 20
    text = "a" * 10 + " " + "b" * 10  # 21 chars, one space, > limit
    chunks = pts.chunk_text(text, limit)
    assert all(len(c) <= limit for c in chunks)
    assert chunks[0] == "a" * 10
    assert "".join(chunks) == text.replace(" ", "")


def test_chunk_text_hard_split_falls_back_to_a_hard_cut_with_no_boundary():
    """One giant 'word' (e.g. a URL) with no spaces or newlines at all must
    still terminate and still respect the limit."""
    limit = 50
    text = "x" * 5000
    chunks = pts.chunk_text(text, limit)
    assert all(len(c) <= limit for c in chunks)
    assert "".join(chunks) == text


def test_chunk_text_still_repacks_small_paragraphs_under_limit():
    text = "para one\n\npara two\n\npara three"
    chunks = pts.chunk_text(text, 1000)
    assert chunks == [text]


def test_chunk_text_flushes_when_repacking_would_exceed_limit():
    limit = 15
    text = "short one\n\nshort two\n\nshort three"
    chunks = pts.chunk_text(text, limit)
    assert len(chunks) > 1
    assert all(len(c) <= limit for c in chunks)
