"""
Converts the Powered by answers saved by the Formstack form into the format of the new publish form, so the form
reopens them and the gallery reads one format:

- project_category: labels (joined by commas or spaces) -> ids, "learning,ai".
- sefaria_tools_used: endpoint answers -> "Sefaria API", "MCP" -> "Sefaria MCP", "Other: ..." -> "Other".
- project_reach: "~100" -> "100", "None, it's mostly a proof of concept" -> "poc", "Other: x" -> "x".

Decided by Sarah (2026-11-19): the detail this drops is not kept in a column. The text typed under "Other", and any
answer that matches no option, is added to the staff-only notes; the endpoint lists are dropped (D41: usage comes
from key traffic). The reverse does nothing.

Release order: this ships in a release after the one whose Project.contents() turns ids back into labels
(gallery_category, gallery_reach). Preprod runs migrations on prod's database while prod still serves the previous
release, so that release must already translate the ids this writes.

Rows already in the new format are left as they are, so running it again changes nothing. updated_at is not
touched (bulk_update skips auto_now), so the gallery's dates stay the submitters'. Visibility, owner and
submission_source are not touched: migrated listings stay listed exactly as before.

The conversion is a frozen copy of powered_by/formstack_answers.py, so this migration keeps working when the
Formstack code is retired. powered_by/tests/migration_convert_formstack_answers_test.py checks that the two agree.
"""

import re

from django.db import migrations

# The ids are powered_by.developer.PUBLISH_CATEGORIES, in the form's order.
CATEGORY_IDS = ("learning", "ai", "visualization", "community", "extensions", "other")

# Every label the Formstack form has used for each category. "Other" is matched separately, after these are
# removed, since "AI Projects, Apps, & Other Tools" contains the word.
CATEGORY_LABELS = (
    ("learning", ("Learning & Study Tools",)),
    ("ai", ("AI Projects, Apps, & Other Tools",)),
    ("visualization", ("Visualization & Data Analysis",)),
    ("community", ("Community, Interaction, & Social",)),
    ("extensions", ("Extensions, API Integrations, & GitHub Code", "Extensions and API Integrations")),
)

# The values of the publish form's tools list (E_PB_TOOLS in static/js/SettingsPage.jsx), the same as the
# Formstack form's.
TOOLS = (
    "Sefaria API",
    "Sefaria MCP",
    "Sefaria-Export",
    "Sefaria-Project code",
    "Sefaria ai-chatbot code",
    "Sefaria Embedded code",
    "Sefaria ML models on HuggingFace",
    "Tutorials",
    "Documentation",
    "Sefaria Patot",
    "Other",
)
_TOOLS_BY_LOWER = {tool.lower(): tool for tool in TOOLS}

# The Formstack "Which categories of endpoints did you utilize?" options. Those answers, and the specific endpoints
# (all /api/...), merged into the tools list; the new form dropped both questions (D41), so they all mean the API.
ENDPOINT_CATEGORIES = frozenset(
    (
        "calendars",
        "collections",
        "index",
        "lexicon",
        "reference",
        "related",
        "sheets",
        "term",
        "text",
        "topic",
        "miscellaneous",
    )
)

# Monthly users: the Formstack option text -> the new form's stored value. Anything else is kept as typed (the new
# form stores a typed number as is), without Formstack's "Other: " prefix.
REACH = {
    "None, it's mostly a proof of concept": "poc",
    "~10": "10",
    "~100": "100",
    "~1000": "1000",
    "~1,000": "1000",
}

_OTHER_RE = re.compile(r"\bother\b\s*:?\s*", re.IGNORECASE)


def convert_category(value):
    """(ids joined with commas, note lines). A value that is already ids comes back unchanged."""
    value = (value or "").strip()
    if not value:
        return "", []
    tokens = [token.strip() for token in value.split(",") if token.strip()]
    if all(token in CATEGORY_IDS for token in tokens):
        return ",".join(dict.fromkeys(tokens)), []

    found, notes, rest = set(), [], value
    for category_id, labels in CATEGORY_LABELS:
        for label in labels:
            pattern = re.compile(re.escape(label), re.IGNORECASE)
            if pattern.search(rest):
                found.add(category_id)
                rest = pattern.sub(" ", rest)
    match = _OTHER_RE.search(rest)
    if match:
        found.add("other")
        typed = rest[match.end() :].strip(" ,")
        if typed:
            notes.append(f"Category, under Other: {typed}")
        rest = rest[: match.start()]
    leftover = rest.strip(" ,\t\n")
    if leftover:
        found.add("other")
        notes.append(f"Category that matched no option: {leftover}")
    return ",".join(c for c in CATEGORY_IDS if c in found), notes


def _is_endpoint_api(lower):
    """ "texts API", "Calendar API": an endpoint category (singular or plural) followed by "api"."""
    if not lower.endswith(" api"):
        return False
    base = lower[: -len(" api")].strip()
    return base in ENDPOINT_CATEGORIES or f"{base}s" in ENDPOINT_CATEGORIES or base.rstrip("s") in ENDPOINT_CATEGORIES


def convert_tools(values):
    """(the form's tool values, without repeats, note lines)."""
    if values in (None, ""):
        return [], []
    if not isinstance(values, list):
        values = [values]
    converted, notes = [], []
    for raw in values:
        tool = str(raw).strip()
        if not tool:
            continue
        lower = tool.lower()
        if lower in _TOOLS_BY_LOWER:
            new = _TOOLS_BY_LOWER[lower]
        elif lower == "mcp":
            new = "Sefaria MCP"
        elif lower.startswith("/api") or lower in ENDPOINT_CATEGORIES or _is_endpoint_api(lower):
            new = "Sefaria API"
        elif _OTHER_RE.match(tool):
            new = "Other"
            typed = tool[_OTHER_RE.match(tool).end() :].strip()
            if typed:
                notes.append(f"Tools, under Other: {typed}")
        else:
            new = "Other"
            notes.append(f"Tool that matched no option: {tool}")
        if new not in converted:
            converted.append(new)
    return converted, notes


def convert_reach(value):
    """The new form's stored value for monthly users."""
    value = (value or "").strip()
    if value in REACH:
        return REACH[value]
    if value.lower() == "other":
        return "other"
    if value.lower().startswith("other:"):
        return value[len("other:") :].strip() or "other"
    return value


def append_notes(notes, lines, heading):
    """Staff notes with the note lines added under a heading; the notes unchanged when there are none."""
    if not lines:
        return notes
    block = heading + "\n" + "\n".join(f"- {line}" for line in lines)
    return f"{notes.rstrip()}\n\n{block}" if (notes or "").strip() else block


NOTES_HEADING = "Formstack answers that didn't fit the new form (migration 0014):"
FIELDS = ("project_category", "sefaria_tools_used", "project_reach", "notes")


def convert_row(project):
    """The converted values of one row, as a dict of field -> value (only the fields that change)."""
    category, category_notes = convert_category(project.project_category)
    tools, tool_notes = convert_tools(project.sefaria_tools_used)
    reach = convert_reach(project.project_reach)
    notes = append_notes(project.notes, category_notes + tool_notes, NOTES_HEADING)
    new = {"project_category": category, "sefaria_tools_used": tools, "project_reach": reach, "notes": notes}
    return {field: value for field, value in new.items() if value != getattr(project, field)}


def forward(apps, schema_editor):
    Project = apps.get_model("powered_by", "Project")
    changed = []
    for project in Project.objects.using(schema_editor.connection.alias).only("id", *FIELDS).iterator():
        updates = convert_row(project)
        for field, value in updates.items():
            setattr(project, field, value)
        if updates:
            changed.append(project)
    Project.objects.using(schema_editor.connection.alias).bulk_update(changed, FIELDS, batch_size=500)


class Migration(migrations.Migration):
    dependencies = [
        ("powered_by", "0013_project_purpose"),
    ]

    operations = [
        migrations.RunPython(forward, migrations.RunPython.noop),
    ]
