# -*- coding: utf-8 -*-
import django
django.setup()

from django.contrib.auth.models import User
from sefaria.model import UserProfile
from sefaria.system.database import db

import pandas as pd
import datetime

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
