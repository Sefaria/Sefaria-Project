#!/usr/bin/env python
"""Stand-in manage.py. FIXTURE_PARTIAL_MIGRATE=1 makes `migrate` stop at fixtureapp 0001, so that it exits 0 while a
migration is still pending (what premigrate.sh's final `migrate --check` must catch)."""
import os
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "fixture_settings")
from django.core.management import execute_from_command_line  # noqa: E402

args = sys.argv[:]
if os.environ.get("FIXTURE_PARTIAL_MIGRATE") == "1" and args[1:2] == ["migrate"] and "--check" not in args and "--plan" not in args:
    args += ["fixtureapp", "0001"]
execute_from_command_line(args)
