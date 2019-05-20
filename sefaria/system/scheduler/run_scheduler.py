# -*- coding: utf-8 -*-

"""
Runs a blocking scheduler
"""

import django
django.setup()
import scheduler

s = scheduler.run_blocking_scheduler()
