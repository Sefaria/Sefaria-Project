# -*- coding: utf-8 -*-
import os
import django
django.setup()

from django.contrib.auth.models import User
from sefaria.model import UserProfile
from sefaria.system.database import db

os.system('pip install pandas')
import pandas as pd
import datetime



def account_creation():
	"""
	Counts the number of accounts created each month for all users and separately for 
	accounts which have the Hebrew interface set (proxy for Israeli users).
	"""

	users = list(User.objects.all().values('date_joined', 'email', 'first_name', 'last_name', 'id', 'last_login'))

	df = pd.DataFrame(users)
	month_joined = df['date_joined'].groupby(df.date_joined.dt.to_period("M")).agg('count')

	# Filter to users who have hebrew interface language, proxy for Israel
	hebrew_user_ids = db.profiles.find({"settings.interface_language": "hebrew"}, {"id": 1, "settings": 1}).distinct("id")
	hebrew_users = [user for user in users if user["id"] in hebrew_user_ids]
	df_hebrew = pd.DataFrame(hebrew_users)
	hebrew_month_joined = df_hebrew['date_joined'].groupby(df_hebrew.date_joined.dt.to_period("M")).agg('count')


	pd.set_option('display.max_rows', None)
	print("\nAll Users\n*************")
	print(month_joined)

	print("\nHebrew Users\n************")
	print(hebrew_month_joined)


# query = {"datetime": {"$gte": datetime.datetime(2020, 9, 1)}}
def user_activity(query={}):
	"""
	Metrics based on the user history collection
	- Active users in various monthly windows
	- Montly returning users percentage
	"""

	months = db.user_history.aggregate([
		{
			"$match": query
		},
		{
			"$project": {
				"_id": 0,
				"uid": 1,
				"date": {"$dateToString": {"date": "$datetime", "format": "%Y-%m"}}				#"year": {"$year": "$datetime"},
			}
		},
		{
			"$group": {
				"_id": "$date",
				"uids": {"$addToSet": "$uid"}
			}
		},
		{
			"$sort": {"_id": 1}
		}
	])

	months = list(months)

	for i in range(len(months)):
		# Number of user who visit in monthly windows
		active_increments = (1,3,6,12)
		for j in active_increments:
			start = i - j + 1 if i - j + 1 > 0 else 0
			end = i + 1
			months_slice = months[start:end]
			actives = {uid for month in months_slice for uid in month["uids"] }
			months[i]["{} month active".format(j)] = len(actives)

		# Number of users who visited last month and this month over number who visited last month
		returning_users = len(set(months[i]["uids"]) & set(months[i-1]["uids"])) if i != 0 else 0
		months[i]["monthly retention"] = int(100 * returning_users / len(months[i-1]["uids"])) if i != 0 else 0
		months[i]["monthly returning"] = returning_users

	print("Month, 1 Month Active, 3 Month Active, 6 Month Active, 12 Month Active, 1 Month Returning, Monthly Retention")
	for month in months:
		print("{}, {}, {}, {}, {}, {}, {}%".format(month["_id"], month["1 month active"], month["3 month active"], month["6 month active"], month["12 month active"], month["monthly returning"], month["monthly retention"]))
		del month["uids"]

	return months


def monthly_registrations_with_signals():
	"""
	Monthly registration cohort report. Anchored on Postgres auth_user so deactivated
	spam accounts (whose Mongo profile docs are purged) are still counted. Joins in
	per-user activity signals from Mongo to give a sense of how many registrations
	in each cohort look like real users.

	Columns:
	  total_registered      - all auth_user rows with date_joined in the month
	  still_active          - is_active=True (i.e. not deactivated as spam)
	  deactivated_spam      - total_registered - still_active
	  has_profile           - has a doc in Mongo `profiles` (purged on spam deactivation)
	  ever_logged_in        - last_login is not null
	  returned_after_signup - last_login > date_joined + 5 minutes (filters auto-login at signup)
	  has_read_history      - appears as uid in `user_history`
	  has_sheet             - owns a non-quarantined sheet
	  has_note              - owns a note
	  any_activity          - union of the four activity signals above
	"""

	users = list(User.objects.all().values('id', 'date_joined', 'last_login', 'is_active'))
	df = pd.DataFrame(users)
	df['month'] = df['date_joined'].dt.to_period("M")

	profile_ids = set(db.profiles.distinct("id"))
	user_history_ids = set(db.user_history.distinct("uid"))
	sheet_owner_ids = set(db.sheets.distinct("owner", {"spam_sheet_quarantine": {"$exists": False}}))
	note_owner_ids = set(db.notes.distinct("owner"))

	df['has_profile']      = df['id'].isin(profile_ids)
	df['has_read_history'] = df['id'].isin(user_history_ids)
	df['has_sheet']        = df['id'].isin(sheet_owner_ids)
	df['has_note']         = df['id'].isin(note_owner_ids)
	df['ever_logged_in']   = df['last_login'].notna()
	df['returned_after_signup'] = (
		df['last_login'].notna()
		& (df['last_login'] > df['date_joined'] + pd.Timedelta(minutes=5))
	)
	df['any_activity'] = df[
		['has_read_history', 'has_sheet', 'has_note', 'returned_after_signup']
	].any(axis=1)

	agg = df.groupby('month').agg(
		total_registered      = ('id', 'count'),
		still_active          = ('is_active', 'sum'),
		has_profile           = ('has_profile', 'sum'),
		ever_logged_in        = ('ever_logged_in', 'sum'),
		returned_after_signup = ('returned_after_signup', 'sum'),
		has_read_history      = ('has_read_history', 'sum'),
		has_sheet             = ('has_sheet', 'sum'),
		has_note              = ('has_note', 'sum'),
		any_activity          = ('any_activity', 'sum'),
	)
	agg['deactivated_spam'] = agg['total_registered'] - agg['still_active']
	agg = agg[[
		'total_registered', 'still_active', 'deactivated_spam',
		'has_profile', 'ever_logged_in', 'returned_after_signup',
		'has_read_history', 'has_sheet', 'has_note', 'any_activity',
	]]

	pd.set_option('display.max_rows', None)
	pd.set_option('display.width', None)
	print("\nMonthly Registrations with Activity & Spam Signals\n" + "*" * 50)
	print(f"Total users: {len(df)}   Deactivated: {(~df['is_active']).sum()}")
	print(agg)

	return agg

