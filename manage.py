#!/usr/bin/env python
import os
import sys

if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")

    from django.core.management import execute_from_command_line
    
    # skip migrate command
    if "migrate" in sys.argv:
        sys.argv.remove("migrate")
        if "&&" in sys.argv:
            sys.argv.remove("&&")

    execute_from_command_line(sys.argv)


