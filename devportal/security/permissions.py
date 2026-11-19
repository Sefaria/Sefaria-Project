"""Permission wrappers for the portal's internal APIs (PLAN.md §2.3.5, contract C10 §5)."""

from functools import wraps

from django.http import JsonResponse


def error_response(status, code, message, fields=None):
    """A JSON error in the shape of contract C3's error-response.schema.json."""
    error = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    response = JsonResponse({"error": error}, status=status)
    response["Cache-Control"] = "no-store"
    return response


def staff_api(view):
    """Wraps every view under /_portal/editor/: 401 JSON for anonymous users, 403 JSON for users who
    are not staff. It never exempts the view from CSRF, so CsrfViewMiddleware still answers 403 to
    an unsafe request without a valid token.
    """
    if getattr(view, "csrf_exempt", False):
        raise TypeError(f"{view.__qualname__}: editor views must not be csrf_exempt")

    @wraps(view)
    def wrapper(request, *args, **kwargs):
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return error_response(401, "not_authenticated", "Log in as a staff member to use the editor.")
        if not (user.is_active and user.is_staff):
            return error_response(403, "forbidden", "Only staff members can use the editor.")
        return view(request, *args, **kwargs)

    wrapper.devportal_staff_api = True
    return wrapper
