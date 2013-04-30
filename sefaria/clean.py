import sys
import os
from pprint import pprint
from datetime import datetime, date, timedelta

from settings import *
from util import *
import texts


"""
Small utilities for fixing problems that occur in the DB.
"""

def remove_refs_with_false():
	texts.db.links.remove({"refs": False})
	texts.db.history.remove({"new.refs": False})
	texts.db.history.find({"new.refs": False})