"""
JSON API behind the developer tab of the settings page, and the emailed confirmation link.
"""
import json
from functools import wraps

from django.contrib.auth.decorators import login_required
from django.core.mail import send_mail
from django.http import Http404
from django.shortcuts import redirect
from django.template.loader import render_to_string
from django.urls import reverse
from django.views.decorators.http import require_http_methods

from reader.views import menu_page
from sefaria.client.util import jsonResponse
from sefaria.system.exceptions import InputError
from . import developer


MAX_BODY_BYTES = 16 * 1024


def requires_developer_settings(view):
    """
    The view exists only where DEVELOPER_SETTINGS_ENABLED is on; elsewhere it is a 404.
    """
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not developer.settings_enabled():
            raise Http404
        return view(request, *args, **kwargs)
    return wrapper


def developer_api(func):
    """
    Logged-in JSON endpoints: parses a JSON body into request.json, and maps input errors to
    400, missing setup to 403, unknown or unowned objects to 404 and a repeated request to 429.
    """
    @wraps(func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return jsonResponse({"error": "Log in to use developer settings."}, status=401)
        request.json = {}
        if request.body:
            if len(request.body) > MAX_BODY_BYTES:
                return jsonResponse({"error": "Request is too large."}, status=400)
            try:
                request.json = json.loads(request.body)
            except ValueError:
                return jsonResponse({"error": "Could not parse JSON."}, status=400)
            if not isinstance(request.json, dict):
                return jsonResponse({"error": "Request must be a JSON object."}, status=400)
        try:
            return func(request, *args, **kwargs)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)
        except PermissionError as e:
            return jsonResponse({"error": str(e)}, status=403)
        except LookupError as e:
            return jsonResponse({"error": str(e)}, status=404)
        except developer.CooldownError as e:
            response = jsonResponse({"error": str(e)}, status=429)
            response["Retry-After"] = str(e.retry_after)
            return response
    return wrapper


def state_response(request, **extra):
    return jsonResponse({**developer.developer_state(request), **extra})


@requires_developer_settings
@require_http_methods(["GET"])
@developer_api
def state_api(request):
    return state_response(request)


@requires_developer_settings
@require_http_methods(["POST"])
@developer_api
def enable_api(request):
    developer.enable(request)
    return state_response(request)


@requires_developer_settings
@require_http_methods(["POST"])
@developer_api
def profile_api(request):
    if not developer.account_verified(request):
        raise PermissionError("Confirm your email before setting up developer settings.")
    developer.save_profile(request.user, request.json.get("profile"))
    return state_response(request)


@requires_developer_settings
@require_http_methods(["POST", "DELETE"])
@developer_api
def confirmation_api(request):
    """
    POST emails the account a link that confirms its address; DELETE stops waiting for it.
    With mocks on, nothing is sent: the state carries the link for the mock email instead.
    """
    if request.method == "DELETE":
        developer.mark_confirmation_sent(request.user, False)
        return state_response(request)
    if developer.account_verified(request):
        raise InputError("Your email is already confirmed.")
    if not request.user.email:
        raise InputError("Your account has no email address.")
    # Reserved (check + record, atomically) before sending so a failed send still throttles.
    developer.reserve_confirmation_send(request.user)
    if not developer.mocks_enabled():
        send_confirmation_email(request)
    return state_response(request)


def confirmation_url(request, key):
    return request.build_absolute_uri(reverse("developer_confirm_email", args=[key]))


def send_confirmation_email(request):
    context = {"activate_url": confirmation_url(request, developer.confirmation_for(request.user).key)}
    send_mail(
        render_to_string("developer/email_confirmation_subject.txt", context).strip(),
        render_to_string("developer/email_confirmation_message.txt", context),
        None,
        [request.user.email],
    )


@requires_developer_settings
def confirm_email(request, key):
    if not developer.confirm_email(request, key):
        raise Http404
    return redirect("/settings/developer/email-confirmed")


@requires_developer_settings
def email_confirmed_page(request):
    return menu_page(request, page="developerEmailConfirmed", title="Email confirmed",
                     desc="Your email is confirmed for Sefaria developer settings.")


@requires_developer_settings
@require_http_methods(["POST"])
@developer_api
def projects_api(request):
    developer.require_developer(request)
    project = developer.create_project(request.user, request.json.get("project"))
    return state_response(request, projectId=str(project.id))


@requires_developer_settings
@require_http_methods(["POST", "DELETE"])
@developer_api
def project_api(request, project_id):
    developer.require_developer(request)
    if request.method == "DELETE":
        developer.delete_project(request.user, project_id)
    else:
        developer.update_project(request.user, project_id, request.json.get("project"))
    return state_response(request)


@requires_developer_settings
@require_http_methods(["POST"])
@developer_api
def project_keys_api(request, project_id):
    developer.require_developer(request)
    api_key = developer.create_key(request.user, project_id, request.json.get("label"))
    return state_response(request, keyId=str(api_key.id))


@requires_developer_settings
@require_http_methods(["POST", "DELETE"])
@developer_api
def key_api(request, key_id):
    developer.require_developer(request)
    if request.method == "DELETE":
        developer.revoke_key(request.user, key_id)
    else:
        developer.set_key_restriction(request.user, key_id, bool(request.json.get("restrictToWebsite")))
    return state_response(request)


@requires_developer_settings
@require_http_methods(["POST"])
@developer_api
def listing_api(request, listing_id, action):
    developer.require_developer(request)
    if action == "claim":
        project = developer.claim_listing(request.user, listing_id)
        return state_response(request, projectId=str(project.id))
    developer.dismiss_listing(request.user, listing_id)
    return state_response(request)
