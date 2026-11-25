"""
The convert_formstack_answers management command converts the Formstack answers already in powered_by_project to the
new publish form's format: what changes, what goes to notes, what must stay exactly as it was (visibility, owner,
source, updated_at, rows already in the new format), a second run, and --dry-run.
"""

import datetime
from io import StringIO

import pytest
from django.core.management import call_command

from powered_by.models import Project

OLD_UPDATED_AT = datetime.datetime(2025, 3, 1, 12, 0, tzinfo=datetime.UTC)


def make_listing(name, **fields):
    fields.setdefault("submission_source", "formstack")
    project = Project.objects.create(project_name=name, project_link=f"https://{name}.example.com", **fields)
    # updated_at is auto_now: set it with a plain UPDATE so the test can check the command leaves it alone.
    Project.objects.filter(pk=project.pk).update(updated_at=OLD_UPDATED_AT)
    return project.pk


def run(*args):
    out = StringIO()
    call_command("convert_formstack_answers", *args, stdout=out)
    return out.getvalue()


def snapshot(pk):
    return Project.objects.filter(pk=pk).values(
        "project_category", "sefaria_tools_used", "project_reach", "notes", "updated_at"
    )[0]


@pytest.mark.django_db
def test_formstack_answers_become_the_new_format():
    pk = make_listing(
        "full",
        project_category="Learning & Study Tools AI Projects, Apps, & Other Tools",
        sefaria_tools_used=["Sefaria API", "Text", "/api/v3/texts", "Sefaria-Export"],
        project_reach="~100",
    )

    assert "Changed 1 project(s); 0 with a note added." in run()

    row = Project.objects.get(pk=pk)
    assert row.project_category == "learning,ai"
    assert row.sefaria_tools_used == ["Sefaria API", "Sefaria-Export"]
    assert row.project_reach == "100"
    assert row.notes is None


@pytest.mark.django_db
def test_text_under_other_is_added_to_the_staff_notes():
    pk = make_listing(
        "other",
        project_category="Learning & Study Tools Other: Davening Toolkit",
        sefaria_tools_used=["Other: just website pages!"],
        project_reach="Other: Just launched",
        notes="Checked by staff.",
    )

    assert "1 with a note added" in run()

    row = Project.objects.get(pk=pk)
    assert row.project_category == "learning,other"
    assert row.sefaria_tools_used == ["Other"]
    assert row.project_reach == "Just launched"
    assert row.notes == (
        "Checked by staff.\n\n"
        "Formstack answers that didn't fit the new form:\n"
        "- Category, under Other: Davening Toolkit\n"
        "- Tools, under Other: just website pages!"
    )


@pytest.mark.django_db
def test_visibility_owner_source_and_updated_at_are_untouched():
    published = make_listing("published", project_category="Learning & Study Tools")
    hidden = make_listing(
        "hidden", project_category="Learning & Study Tools", request_not_to_publish=True, featured=True
    )
    manual = make_listing("manual", submission_source="manual", project_category="Visualization & Data Analysis")

    run()

    rows = Project.objects.filter(pk__in=(published, hidden, manual)).order_by("pk")
    assert [
        (r.is_published, r.request_not_to_publish, r.featured, r.owner_id, r.submission_source, r.updated_at)
        for r in rows
    ] == [
        (True, False, False, None, "formstack", OLD_UPDATED_AT),
        (False, True, True, None, "formstack", OLD_UPDATED_AT),
        (True, False, False, None, "manual", OLD_UPDATED_AT),
    ]


@pytest.mark.django_db
def test_rows_already_in_the_new_format_and_empty_rows_are_unchanged():
    new_format = make_listing(
        "settings",
        submission_source="developer_settings",
        project_category="learning,ai",
        sefaria_tools_used=["Sefaria API", "Sefaria MCP"],
        project_reach="poc",
        notes="Staff note.",
    )
    empty = make_listing("empty", submission_source="in_the_wild")
    before = {pk: snapshot(pk) for pk in (new_format, empty)}

    assert "Changed 0 project(s)" in run()

    assert {pk: snapshot(pk) for pk in (new_format, empty)} == before


@pytest.mark.django_db
def test_running_it_again_changes_nothing():
    pk = make_listing(
        "twice",
        project_category="Learning & Study Tools Other: Davening Toolkit",
        sefaria_tools_used=["/api/texts", "Other: website"],
        project_reach="~10",
    )
    run()
    after_once = snapshot(pk)

    assert "Changed 0 project(s)" in run()

    assert snapshot(pk) == after_once


@pytest.mark.django_db
def test_dry_run_lists_the_changes_and_writes_nothing():
    pk = make_listing("dry", project_category="Learning & Study Tools", project_reach="~100")
    before = snapshot(pk)

    out = run("--dry-run")

    assert f"#{pk} dry: project_category, project_reach" in out
    assert "Would change 1 project(s)" in out
    assert snapshot(pk) == before
