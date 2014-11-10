# -*- coding: utf-8 -*-

import logging
from django.conf import settings

class CategoryFilter(logging.Filter):
    def __init__(self, categories=None):
        self.categories = categories if isinstance(categories, list) else [categories]

    def filter(self, record):
        if self.categories is None:
            return True
        if record:
            pass

class RequireDebugTrue(logging.Filter):
    def filter(self, record):
        return settings.DEBUG

class ErrorTypeFilter(logging.Filter):
    def __init__(self, error_types, exclude= True):
        self.error_types = error_types
        self.exclude = exclude
    def filter(self, record):
        #print record.exc_info[0].__name__
        if self.exclude:
            retval =  all(record.exc_info[0].__name__ != err_type for err_type in self.error_types)
        else:
            retval = any(record.exc_info[0].__name__ == err_type for err_type in self.error_types)
            #get rid of the stack trace?
            record.exc_info = None
        return retval

