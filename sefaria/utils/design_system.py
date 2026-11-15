"""
Previews of unreleased Sefaria/design-system versions, outside production.

Opening a page with ?design_system=<branch or commit> (on a host in DESIGN_SYSTEM_PREVIEW_HOSTS)
loads that version's core.css and semantic.css on top of the pinned ones: on the page itself
(templates/base.html) and in the Library Assistant (its design-system-preview attribute). It stays
in the session, like ?chatbot_version, until ?design_system=clear.
"""

import re

from django.conf import settings

PREVIEW_PARAM = "design_system"
SESSION_KEY = "design_system_preview"
_REF = re.compile(r"^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$")


def is_preview_ref(ref):
    """A branch name or commit: letters, digits, ".", "_", "-" and "/", no "..", at most 100 characters."""
    return isinstance(ref, str) and len(ref) <= 100 and bool(_REF.match(ref)) and ".." not in ref


def preview_allowed(host):
    """Whether previews are on for this host. Entries starting with "." match subdomains."""
    host = host.split(":")[0].lower()
    for allowed in getattr(settings, "DESIGN_SYSTEM_PREVIEW_HOSTS", []):
        if host == allowed or (allowed.startswith(".") and host.endswith(allowed)):
            return True
    return False


def design_system_preview(request):
    """The design-system version to preview on this request, or None."""
    if not preview_allowed(request.get_host()):
        return None
    ref = request.GET.get(PREVIEW_PARAM, "").strip()
    if ref == "clear":
        request.session.pop(SESSION_KEY, None)
        return None
    if is_preview_ref(ref):
        request.session[SESSION_KEY] = ref
        return ref
    stored = request.session.get(SESSION_KEY)
    return stored if is_preview_ref(stored) else None
