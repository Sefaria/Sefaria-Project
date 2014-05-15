"""
profiling.py - tools for profiling performance. 
"""

import cProfile
import pstats

def prof(cmd):
	"""
	Runs cmd and prints the profile sorted by cumulative time.
	"""
	cProfile.run(cmd, "stats")
	p = pstats.Stats("stats")
	p.strip_dirs().sort_stats("cumulative").print_stats()