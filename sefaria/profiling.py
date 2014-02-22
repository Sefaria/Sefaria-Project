import cProfile
import pstats

def prof(cmd):
	cProfile.run(cmd, "stats")
	p = pstats.Stats("stats")
	p.strip_dirs().sort_stats("cumulative").print_stats()