from .models import Plugin
from django.contrib import admin
class PluginAdmin(admin.ModelAdmin):
    list_display = ('name', 'url')
    search_fields = ('name',)
    fields = ('name', 'description', 'url', 'image')

admin.site.register(Plugin, PluginAdmin)