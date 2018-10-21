from functools import wraps

from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.shortcuts import redirect
from oauth2client.contrib.django_util.storage import DjangoORMStorage

from sefaria.gauth.models import CredentialsModel


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
            # Try grabbing credential from storage
            storage = DjangoORMStorage(CredentialsModel, 'id',
                              request.user, 'credential')
            credential = storage.get()

            # Begin process of getting a new credential
            if credential is None or credential.invalid:
                request.session['next_view'] = request.path
                request.session['gauth_scope'] = scope
                return (HttpResponse('Unauthorized', status=401)
                        if ajax else redirect('gauth_index'))

            # Everything went well, call wrapped view and give credential to it
            kwargs['credential'] = credential
            return func(request, *args, **kwargs)
        return inner
    return decorator
