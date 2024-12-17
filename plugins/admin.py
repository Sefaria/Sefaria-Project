from .models import Plugin
from django.contrib import admin

class PluginAdmin(admin.ModelAdmin):
    list_display = ('name', 'url', 'secret')
    search_fields = ('name',)
    fields = ('name', 'description', 'url')


admin.site.register(Plugin, PluginAdmin)