# -*- coding: utf-8 -*-
import django
django.setup()

from django.contrib.auth.models import User
from sefaria.model import UserProfile

import pandas as pd
import datetime

df = pd.DataFrame(list(User.objects.all().values('date_joined', 'email', 'first_name', 'last_name', 'id', 'last_login')))
month_joined = df['date_joined'].groupby(df.date_joined.dt.to_period("M")).agg('count')


print(month_joined)

