"""Tests for the post-deploy hold: build/ci/post_deploy.py and its use in
mark_stories_deployed.py and reconcile_deploy_ready.py. No network calls.
Story ids are placeholders, not real Shortcut ids."""

import json

import mark_stories_deployed as msd
import post_deploy
import reconcile_deploy_ready as rdr

DEPLOY_READY = 500000045
ITEM = "Post-deploy: drop webpages index expandedRefs_1 after confirming the sidebar works (#3945)"


def test_open_items_keeps_only_unticked_post_deploy_items():
    story = {
        "tasks": [
            {"description": ITEM, "complete": False},
            {"description": "post deploy: lowercase, no dash", "complete": False},
            {"description": "Post-deploy: already done", "complete": True},
            {"description": "Write tests", "complete": False},
            {"description": "Mention post-deploy: mid-sentence", "complete": False},
        ]
    }
    assert post_deploy.open_items(story) == [ITEM, "post deploy: lowercase, no dash"]
    assert post_deploy.open_items({}) == []


def test_slack_section_lists_items_verbatim_with_story_link():
    data = {"stories": [{"id": 11111, "name": "A & B", "url": "https://x/11111", "post_deploy_items": [ITEM]}]}
    assert post_deploy.slack_section(data) == (
        f":pushpin: *Post-deploy actions*\n• {ITEM} (<https://x/11111|sc-11111: A &amp; B>)"
    )
    assert post_deploy.slack_section({"stories": [{"id": 1, "post_deploy_items": []}]}) == ""


def test_mark_holds_story_with_open_items(monkeypatch, tmp_path, capsys):
    held = {"id": 11111, "workflow_id": 500000005, "workflow_state_id": DEPLOY_READY, "post_deploy_items": [ITEM]}
    plain = {"id": 22222, "workflow_id": 500000005, "workflow_state_id": DEPLOY_READY, "post_deploy_items": []}
    path = tmp_path / "shipped-stories.json"
    path.write_text(json.dumps({"stories": [held, plain]}), encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["mark_stories_deployed.py", "--input", str(path), "--dry-run"])
    msd.main()
    out = json.loads(capsys.readouterr().out)
    assert out["transitioned"] == [22222]
    assert out["held_post_deploy"] == [11111]


def test_reconcile_does_not_transition_held_story(monkeypatch):
    pr = {"number": 1, "merged": True, "repository_id": 500000103, "target_branch_name": "master", "branch_name": "f"}
    held = {
        "id": 11111,
        "workflow_id": 500000005,
        "workflow_state_id": DEPLOY_READY,
        "pull_requests": [pr],
        "tasks": [{"description": ITEM, "complete": False}],
    }
    ticked = dict(held, id=22222, tasks=[{"description": ITEM, "complete": True}])
    monkeypatch.setenv("SHORTCUT_API_TOKEN", "tok")
    monkeypatch.setattr(rdr, "search_deploy_ready_stories", lambda token: [held, ticked])
    monkeypatch.setattr(rdr, "resolve_default_prod_tag", lambda: "prod/1.0")
    monkeypatch.setattr(rdr, "fetch_merge_oids", lambda prs, repo, max_workers=8: {1: "abc"})
    monkeypatch.setattr(rdr, "is_ancestor_of_prod", lambda oid, tag: True)
    monkeypatch.setattr(rdr, "resolve_shipping_release_tag", lambda oid: "prod/1.0")
    calls = []
    monkeypatch.setattr(rdr, "transition_story", lambda sid, done, token: (calls.append(sid), sid, True, None)[1:])
    monkeypatch.setattr("sys.argv", ["reconcile_deploy_ready.py", "--apply"])
    rdr.main()
    assert calls == [22222]
