# -*- coding: utf-8 -*-

"""
Deprecated as we move to structured logging

import logging
from django.conf import settings
import requests, json, traceback
from requests.exceptions import ConnectionError



class CategoryFilter(logging.Filter):
    def __init__(self, categories=None):
        self.categories = categories if isinstance(categories, list) else [categories]

    def filter(self, record):
        if self.categories is None:
            return True
        if record:
            pass


class ErrorTypeFilter(logging.Filter):
    def __init__(self, error_types, exclude= True):
        self.error_types = error_types
        self.exclude = exclude

    def filter(self, record):
        #print record.exc_info[0].__name__
        if 'Favicon.ico' in record.msg: #ignore and filter out super annoying error about favicon.
            return False
        if not record.exc_info:
            retval = True if self.exclude else False
        else:
            if self.exclude:
                retval = all(record.exc_info[0].__name__ != err_type for err_type in self.error_types)
            else:
                retval = any(record.exc_info[0].__name__ == err_type for err_type in self.error_types)
                #get rid of the stack trace?
                record.exc_info = None
        return retval


class SlackLogHandler(logging.Handler):
    def __init__(self, logging_url="", channel="@slackbot", stack_trace=False):
        logging.Handler.__init__(self)
        self.logging_url = logging_url
        self.channel = channel
        self.stack_trace = stack_trace

    def emit(self, record):
        message = '%s' % (self.formatter.format(record))
        if self.stack_trace:
            if record.exc_info:
                message += '\n'.join(traceback.format_exception(*record.exc_info))
        slack_payload = {
            "text": message,
            "username": "errorbot",
            "icon_emoji": ":scream:",
            "channel": self.channel
        }
        try:
            requests.post(self.logging_url, data=json.dumps(slack_payload))
        except ConnectionError:
            pass  # basa. but slack posting failures should not crash a script

"""
