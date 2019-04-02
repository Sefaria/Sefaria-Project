# -*- coding: utf-8 -*-

"""
Runs a blocking scheduler
"""

import django
django.setup()
from . import scheduler

s = scheduler.run_blocking_scheduler()
s.print_jobs()
