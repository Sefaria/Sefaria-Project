# -*- coding: utf-8 -*-
#!/usr/local/bin/python

import os
import sys

import django

django.setup()

path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

from sefaria.search import index_from_queue
from sefaria.settings import *

index_from_queue()
