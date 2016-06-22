from functools import wraps

from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.shortcuts import redirect
from oauth2client.contrib.django_orm import Storage

from gauth.models import CredentialsModel


def gauth_required(scope, ajax=False):
    """
    Decorator that requires the user to authenticate
    with Google and authorize Sefaria to act on their behalf.
    If the user has already authenticated, it will call the wrapped function
    with the kwarg `credential` set to the obtained credentials.
    If not, it will start the OAuth 2.0 flow.
    At the moment, only used for sheets.views.export_to_drive.
    """
    def decorator(func):
        @login_required
        @wraps(func)
        def inner(request, *args, **kwargs):
            storage = Storage(CredentialsModel, 'id',
                              request.user, 'credential')
            credential = storage.get()

            if credential is None or credential.invalid:
                # request.session['next_view'] = (next_ if next_ is not None
                #                                 else request.path)
                request.session['gauth_scope'] = scope
                if ajax:
                    return HttpResponse('Unauthorized', status=401)
                else:
                    return redirect('gauth_index')

            kwargs['credential'] = credential
            return func(request, *args, **kwargs)
        return inner
    return decorator
