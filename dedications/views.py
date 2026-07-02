from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie

from reader.views import render_template
from .models import Dedication


@ensure_csrf_cookie
def dedication(request, slug):
    """
    Render a Dedication page (from the DB) at /dedication/<slug>.

    Mirrors reader.views.serve_static: passes headerMode as app_props so the
    site header renders in Node, and the dedication record as template context.
    """
    dedication = get_object_or_404(Dedication, slug=slug)
    return render_template(
        request,
        "static/dedication/dedication.html",
        {"headerMode": True},
        {"dedication": dedication},
    )
