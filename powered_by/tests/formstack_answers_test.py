"""
Old Formstack answers converted to the new publish form's format (powered_by/formstack_answers.py), the frozen copy
in migration 0014, the Formstack intake that now saves the new format, and the gallery API that shows categories as
labels. The sample values are the shapes found in the live gallery on 2026-11-19.
"""

import hashlib
import hmac
import importlib
import json

import pytest

from powered_by import formstack_answers as answers
from powered_by.models import Project

MIGRATION = importlib.import_module("powered_by.migrations.0014_convert_formstack_answers")


# --- Categories --------------------------------------------------------------


@pytest.mark.parametrize(
    "old, ids",
    [
        ("Learning & Study Tools", "learning"),
        ("AI Projects, Apps, & Other Tools", "ai"),
        ("Extensions, API Integrations, & GitHub Code", "extensions"),
        ("Extensions and API Integrations", "extensions"),
        ("Community, Interaction, & Social", "community"),
        ("Visualization & Data Analysis", "visualization"),
        # Joined with ", ", with "," and with a plain space; the ids come out in the form's order.
        ("Learning & Study Tools, AI Projects, Apps, & Other Tools", "learning,ai"),
        ("Learning & Study Tools,AI Projects, Apps, & Other Tools", "learning,ai"),
        ("Learning & Study Tools AI Projects, Apps, & Other Tools", "learning,ai"),
        ("AI Projects, Apps, & Other Tools, Visualization & Data Analysis", "ai,visualization"),
        (
            "Learning & Study Tools,AI Projects, Apps, & Other Tools,Visualization & Data Analysis,"
            "Community, Interaction, & Social,Extensions, API Integrations, & GitHub Code",
            "learning,ai,visualization,community,extensions",
        ),
        ("Other", "other"),
        ("", ""),
    ],
)
def test_category_labels_become_ids(old, ids):
    assert answers.convert_category(old) == (ids, [])


def test_category_text_under_other_becomes_other_and_a_note():
    ids, notes = answers.convert_category(
        "Learning & Study Tools AI Projects, Apps, & Other Tools Other: Davening Toolkit"
    )
    assert ids == "learning,ai,other"
    assert notes == ["Category, under Other: Davening Toolkit"]


def test_category_that_matches_no_option_becomes_other_and_a_note():
    ids, notes = answers.convert_category("Learning & Study Tools, Games")
    assert ids == "learning,other"
    assert notes == ["Category that matched no option: Games"]


@pytest.mark.parametrize("ids", ["learning", "learning,ai", "other", "ai,community,extensions"])
def test_categories_already_in_ids_are_unchanged(ids):
    assert answers.convert_category(ids) == (ids, [])


# --- Tools -------------------------------------------------------------------


def test_endpoint_answers_become_sefaria_api_once():
    tools, notes = answers.convert_tools(
        ["Sefaria API", "Calendars", "Text", "Topic", "/api/calendars", "/api/v3/texts", "texts API", "Calendar API"]
    )
    assert tools == ["Sefaria API"]
    assert notes == []


def test_known_tools_are_kept_and_mcp_is_named():
    tools, notes = answers.convert_tools(["Sefaria-Export", "MCP", "Documentation", "Sefaria MCP"])
    assert tools == ["Sefaria-Export", "Sefaria MCP", "Documentation"]
    assert notes == []


def test_tool_text_under_other_becomes_other_and_a_note():
    tools, notes = answers.convert_tools(["Sefaria API", "Other: just website pages!"])
    assert tools == ["Sefaria API", "Other"]
    assert notes == ["Tools, under Other: just website pages!"]


def test_tool_that_matches_no_option_becomes_other_and_a_note():
    tools, notes = answers.convert_tools(["Sefaria API", "Zapier"])
    assert tools == ["Sefaria API", "Other"]
    assert notes == ["Tool that matched no option: Zapier"]


def test_tools_not_a_list_or_empty():
    assert answers.convert_tools(None) == ([], [])
    assert answers.convert_tools([]) == ([], [])
    assert answers.convert_tools("Sefaria API") == (["Sefaria API"], [])


# --- Monthly users -----------------------------------------------------------


@pytest.mark.parametrize(
    "old, new",
    [
        ("None, it's mostly a proof of concept", "poc"),
        ("~10", "10"),
        ("~100", "100"),
        ("~1000", "1000"),
        ("10", "10"),
        ("100", "100"),
        ("<10", "<10"),
        (">7000", ">7000"),
        ("Other: Just launched", "Just launched"),
        ("Other", "other"),
        ("other", "other"),
        ("poc", "poc"),
        ("", ""),
    ],
)
def test_monthly_users(old, new):
    assert answers.convert_reach(old) == new


# --- Notes -------------------------------------------------------------------


def test_notes_lines_are_added_under_a_heading_after_existing_notes():
    assert answers.append_notes("Staff note.", ["a", "b"], "Heading:") == "Staff note.\n\nHeading:\n- a\n- b"
    assert answers.append_notes(None, ["a"], "Heading:") == "Heading:\n- a"
    assert answers.append_notes("Staff note.", [], "Heading:") == "Staff note."
    assert answers.append_notes(None, [], "Heading:") is None


# --- The migration's frozen copy agrees with the module ------------------------

SAMPLES = [
    "Learning & Study Tools AI Projects, Apps, & Other Tools Other: Davening Toolkit",
    "Extensions and API Integrations, Visualization & Data Analysis",
    "learning,ai",
    "Learning & Study Tools, Games",
    "",
]
TOOL_SAMPLES = [["Sefaria API", "/api/texts", "MCP", "Other: just website pages!", "Zapier"], [], None]
REACH_SAMPLES = ["~100", "None, it's mostly a proof of concept", "Other: Just launched", "<10", ""]


def test_migration_copy_matches_the_module():
    for value in SAMPLES:
        assert MIGRATION.convert_category(value) == answers.convert_category(value)
    for value in TOOL_SAMPLES:
        assert MIGRATION.convert_tools(value) == answers.convert_tools(value)
    for value in REACH_SAMPLES:
        assert MIGRATION.convert_reach(value) == answers.convert_reach(value)
    assert MIGRATION.CATEGORY_LABELS == answers.CATEGORY_LABELS
    assert MIGRATION.TOOLS == answers.TOOLS
    assert MIGRATION.ENDPOINT_CATEGORIES == answers.ENDPOINT_CATEGORIES
    assert MIGRATION.REACH == answers.REACH


# --- Gallery API shows labels ----------------------------------------------------


def test_gallery_category_turns_ids_into_labels():
    assert answers.gallery_category("learning,ai") == "Learning & Study Tools, AI Projects, Apps, & Other Tools"
    assert answers.gallery_category("extensions") == "Extensions, API Integrations, & GitHub Code"


def test_gallery_category_leaves_anything_else_as_it_is():
    assert answers.gallery_category("Learning & Study Tools") == "Learning & Study Tools"
    assert answers.gallery_category("") == ""
    assert answers.gallery_category(None) is None


def test_gallery_reach_spells_out_proof_of_concept():
    assert answers.gallery_reach("poc") == "None, it's mostly a proof of concept"
    assert answers.gallery_reach("100") == "100"
    assert answers.gallery_reach("") == ""


@pytest.mark.django_db
def test_contents_shows_category_labels_and_keeps_the_stored_ids():
    project = Project.objects.create(
        project_name="Ids",
        project_link="https://ids.example.com",
        submission_source="developer_settings",
        project_category="learning,visualization",
        project_reach="poc",
    )
    assert project.contents()["project_reach"] == "None, it's mostly a proof of concept"
    assert project.contents()["project_category"] == "Learning & Study Tools, Visualization & Data Analysis"
    assert project.contents(authenticated=True)["project_category"] == (
        "Learning & Study Tools, Visualization & Data Analysis"
    )
    project.refresh_from_db()
    assert project.project_category == "learning,visualization"


# --- The Formstack intake saves the new format -----------------------------------

TEST_HMAC_SECRET = "test-hmac-secret"


@pytest.fixture
def formstack_hmac_secret(settings):
    settings.POWERED_BY_FORMSTACK_HMAC_SECRET = TEST_HMAC_SECRET


def post_signed(client, body):
    body_bytes = json.dumps(body).encode()
    signature = "sha256=" + hmac.new(TEST_HMAC_SECRET.encode(), body_bytes, hashlib.sha256).hexdigest()
    return client.post(
        "/api/powered-by", data=body_bytes, content_type="application/json", HTTP_X_FS_SIGNATURE=signature
    )


@pytest.mark.django_db
def test_formstack_submission_is_saved_in_the_new_format(client, formstack_hmac_secret):
    body = {
        "FormID": "12345",
        "Field179244711": "Formstack Project",
        "Field179244929": "https://formstack-format.example.com",
        "Field179245509": "Yes",
        "Field179245600": "Anything else: thanks!",
        "Field179248693": ["Learning & Study Tools", "AI Projects, Apps, & Other Tools", "Other: Davening Toolkit"],
        "Field196457970": ["Sefaria API", "Other: just website pages!"],
        "Field196602042": ["Text", "Calendars"],
        "Field196602688": ["/api/v3/texts"],
        "Field196457997": "~100",
    }

    response = post_signed(client, body)

    assert response.status_code == 201
    project = Project.objects.get(project_link="https://formstack-format.example.com")
    assert project.project_category == "learning,ai,other"
    assert project.sefaria_tools_used == ["Sefaria API", "Other"]
    assert project.project_reach == "100"
    assert project.notes == (
        "Anything else: thanks!\n\n"
        "Formstack answers that didn't fit the new form:\n"
        "- Category, under Other: Davening Toolkit\n"
        "- Tools, under Other: just website pages!"
    )
    assert response.json()["project"]["project_category"] == (
        "Learning & Study Tools, AI Projects, Apps, & Other Tools, Other"
    )
