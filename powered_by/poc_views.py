"""
The public Powered by Sefaria form for the developer settings proof of concept. Submitting is
a mock: answers are kept in the visitor's session and never reach Salesforce or the Project
table.
"""
import json

from django.views.decorators.csrf import ensure_csrf_cookie

from reader.views import menu_page
from sefaria.client.util import jsonResponse
from sefaria.system.decorators import catch_error_as_json


POWERED_BY_POC_SESSION_KEY = "powered_by_poc_submissions"
POWERED_BY_POC_MAX_BYTES = 32 * 1024
POWERED_BY_POC_MAX_SUBMISSIONS = 20


@ensure_csrf_cookie
def powered_by_form_page(request):
    return menu_page(
        request,
        page="poweredByForm",
        title="Powered by Sefaria Submission Form",
        desc="Tell us about the app, visualization, website or other digital tool you built with Sefaria's data.",
    )


@catch_error_as_json
def powered_by_poc_submissions_api(request):
    """
    GET lists this session's mock submissions, POST appends one, DELETE clears them.
    Open to logged-out visitors, since the public form is.
    """
    if request.method == "GET":
        return jsonResponse({"submissions": request.session.get(POWERED_BY_POC_SESSION_KEY, [])})

    if request.method == "POST":
        if len(request.body) > POWERED_BY_POC_MAX_BYTES:
            return jsonResponse({"error": "Submission is too large."}, status=400)
        try:
            submission = json.loads(request.body)
        except ValueError:
            return jsonResponse({"error": "Could not parse JSON."}, status=400)
        if not isinstance(submission, dict) or not isinstance(submission.get("answers"), dict):
            return jsonResponse({"error": "Submission must be a JSON object with answers."}, status=400)
        submissions = request.session.get(POWERED_BY_POC_SESSION_KEY, [])
        submissions = (submissions + [submission])[-POWERED_BY_POC_MAX_SUBMISSIONS:]
        request.session[POWERED_BY_POC_SESSION_KEY] = submissions
        request.session.modified = True
        return jsonResponse({"ok": True})

    if request.method == "DELETE":
        request.session.pop(POWERED_BY_POC_SESSION_KEY, None)
        request.session.modified = True
        return jsonResponse({"ok": True})

    return jsonResponse({"error": "Unsupported HTTP method."}, status=405)
