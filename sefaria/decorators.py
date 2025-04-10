import base64
from django.contrib.admin.views.decorators import staff_member_required
from functools import wraps
from django.conf import settings

from django.http import HttpResponse


def webhook_auth_or_staff_required(view_func):
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        auth_header = request.META.get("HTTP_AUTHORIZATION")

        if not auth_header or not auth_header.startswith("Basic "):
            return staff_member_required(view_func)(request, *args, **kwargs)

        try:
            encoded_credentials = auth_header.split(" ")[1]
            decoded_credentials = base64.b64decode(encoded_credentials).decode("utf-8")
            username, password = decoded_credentials.split(":", 1)
        except Exception:
            return HttpResponse("Invalid Authorization header", status=401)

        if username != settings.WEBHOOK_USERNAME or password != settings.WEBHOOK_PASSWORD:
            return HttpResponse("Invalid credentials", status=401)

        return view_func(request, *args, **kwargs)
    return _wrapped_view

