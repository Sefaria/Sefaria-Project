from django.urls import path
from . import atlas_views

app_name = 'inquiry'
urlpatterns = [
    path('atlas/', atlas_views.page, name='atlas'),
    path('api/atlas/activity/', atlas_views.activity, name='atlas-activity'),
]
