import argparse
from sefaria.model import *
from sefaria.search import index_all

#TODO add cmd line args. Unfortunately, doesn't work well with ./run
index_all(clear=True, merged=True)