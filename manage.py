#!/usr/bin/env python
import os
import sys

if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")

    from django.core.management import execute_from_command_line
    
    # replace migrate command with help command
    for i, arg in enumerate(sys.argv):
        if arg == 'migrate':
            sys.argv[i] = 'help'
            break

    execute_from_command_line(sys.argv)


