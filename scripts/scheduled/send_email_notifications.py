# -*- coding: utf-8 -*-
"""
Send unread notifcations for users with a particular notificationg setting
(daily, weekly, or all)
"""
import sys
import django
django.setup()

from sefaria.model.user_profile import email_unread_notifications

if len(sys.argv) < 2 or sys.argv[1] not in ("all", "daily", "weekly"):
	print("Please specify a timeframe for which notifications should be emailed.")
	print("Options are: 'all', 'daily', 'weekly'")
else:
	email_unread_notifications(sys.argv[1])
