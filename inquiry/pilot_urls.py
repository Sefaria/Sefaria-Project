from django.contrib import admin
from django.shortcuts import redirect
from django.urls import include, path

urlpatterns = [path('', lambda request: redirect('/inquiry/atlas/')), path('inquiry/', include('inquiry.urls')),
               path('admin/', admin.site.urls)]
