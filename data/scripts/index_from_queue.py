# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import os

path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

from sefaria.settings import *
from sefaria.search import index_from_queue

index_from_queue()
