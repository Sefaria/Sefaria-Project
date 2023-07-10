from http.client import HTTPException
import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration
import os

def init_sentry(sentry_dsn, sentry_code_version, sentry_environment):

    def before_send(event, hint):
        # Check if the event has an exception
        if 'exc_info' in hint:
            exc_type, exc_value, tb = hint['exc_info']
            # If it is not an HTTP 500 error, drop the event
            if isinstance(exc_value, HTTPException) and exc_value.code != 500:
                return None

        # If there is no exception, drop the event
        if 'exception' not in event:
            return None

        return event

    sentry_sdk.init(
        dsn=sentry_dsn,
        environment=sentry_environment,
        integrations=[DjangoIntegration()],
        traces_sample_rate=1.0,
        send_default_pii=False,
        before_send=before_send,
        max_breadcrumbs=30,
        release=sentry_code_version,
    )