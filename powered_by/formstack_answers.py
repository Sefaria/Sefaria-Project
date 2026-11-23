"""
Old Formstack answers in the format of the new publish form (developer settings, "Publish your project").

The Formstack form stored labels and free text: categories as labels joined with commas or spaces (two labels
contain commas themselves), tools mixed with the endpoint answers, monthly users as the option's text. The new form
stores ids. These functions convert one value at a time; the intake uses them so a Formstack submission is saved in
the new format, and the `convert_formstack_answers` management command converts the rows saved before
(run it whenever: it changes only rows still in the old format).

Anything that can't be kept in the new format (the text typed under "Other", an answer that matches no option) is
returned as a note line, for the staff-only `notes`.
"""

import re

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

# What the public gallery API returns for each id. The external Powered by site (Sefaria/powered-by) finds a
# project's categories by looking for these label texts in project_category, so the API returns labels, not ids.
GALLERY_CATEGORY_LABELS = {
    "learning": "Learning & Study Tools",
    "ai": "AI Projects, Apps, & Other Tools",
    "visualization": "Visualization & Data Analysis",
    "community": "Community, Interaction, & Social",
    "extensions": "Extensions, API Integrations, & GitHub Code",
    "other": "Other",
}

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


def gallery_category(value):
    """project_category as the public gallery shows it: labels joined with ", " when the value is ids."""
    tokens = [token.strip() for token in (value or "").split(",") if token.strip()]
    if not tokens or not all(token in GALLERY_CATEGORY_LABELS for token in tokens):
        return value
    return ", ".join(GALLERY_CATEGORY_LABELS[token] for token in tokens)


def gallery_reach(value):
    """project_reach as the public gallery shows it. The external site finds "Proof of concept" by those words."""
    return "None, it's mostly a proof of concept" if value == "poc" else value


def append_notes(notes, lines, heading):
    """Staff notes with the note lines added under a heading; the notes unchanged when there are none."""
    if not lines:
        return notes
    block = heading + "\n" + "\n".join(f"- {line}" for line in lines)
    return f"{notes.rstrip()}\n\n{block}" if (notes or "").strip() else block


NOTES_HEADING = "Formstack answers that didn't fit the new form:"
ROW_FIELDS = ("project_category", "sefaria_tools_used", "project_reach", "notes")


def convert_row(project):
    """One Project's converted values, as field -> value, only for the fields that change."""
    category, category_notes = convert_category(project.project_category)
    tools, tool_notes = convert_tools(project.sefaria_tools_used)
    reach = convert_reach(project.project_reach)
    notes = append_notes(project.notes, category_notes + tool_notes, NOTES_HEADING)
    new = {"project_category": category, "sefaria_tools_used": tools, "project_reach": reach, "notes": notes}
    return {field: value for field, value in new.items() if value != getattr(project, field)}
