from django.contrib import admin
from django.contrib.auth.models import User
from django.db import models

from oauth2client.contrib.django_orm import FlowField
from oauth2client.contrib.django_orm import CredentialsField


class FlowModel(models.Model):
    id = models.ForeignKey(User, primary_key=True)
    flow = FlowField()


class FlowAdmin(admin.ModelAdmin):
    pass


class CredentialsModel(models.Model):
    id = models.ForeignKey(User, primary_key=True)
    credential = CredentialsField()


class CredentialsAdmin(admin.ModelAdmin):
    pass


admin.site.register(FlowModel, FlowAdmin)
admin.site.register(CredentialsModel, CredentialsAdmin)
