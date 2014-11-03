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