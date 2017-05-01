# -*- coding: utf-8 -*-
import sys
from sefaria.s3 import delete_orphaned_files
minutes = 5 if len(sys.argv) < 2 else int(sys.argv[1])
delete_orphaned_files(minutes=minutes)