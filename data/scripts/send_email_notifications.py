# -*- coding: utf-8 -*-
import sys
import os

path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")

from sefaria.settings import *
from sefaria.notifications import email_unread_notifications


if len(sys.argv) < 2 or sys.argv[1] not in ("all", "daily", "weekly"):
	print "Please specify a timeframe for which notifications should be emailed."
	print "Options are: 'all', 'daily', 'weekly'"
else:
	email_unread_notifications(sys.argv[1])
