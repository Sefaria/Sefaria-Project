# -*- coding: utf-8 -*-
import sys

from sefaria.stats import SheetStats

action = sys.argv[1] if len(sys.argv) > 1 else None

stats = SheetStats()
stats.run()
stats.print_stats()
if action == "savesheet":
	stats.save_top_sheets()