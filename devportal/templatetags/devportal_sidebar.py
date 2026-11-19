"""Helpers for the server-rendered sidebar (devportal/templates/devportal/sidebar_tree.html).

They mirror devportal-ui/src/shell/Sidebar/tree.ts, so the server markup opens the same groups as the
client's `Sidebar` does on load.
"""

from django import template

register = template.Library()


def contains_path(item, path):
    """True when the item or one of its descendants is the page at `path` (tree.ts `containsPath`)."""
    return item.get("href") == path or any(contains_path(child, path) for child in item.get("children") or ())


@register.filter
def sidebar_open(item, path):
    """A group starts open when it or one of its children is the current page (tree.ts `groupsContaining`)."""
    return bool(item.get("children")) and contains_path(item, path)
