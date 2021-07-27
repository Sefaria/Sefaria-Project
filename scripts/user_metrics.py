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

