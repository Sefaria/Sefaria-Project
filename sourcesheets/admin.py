from django.contrib import admin
from adminsortable.admin import SortableAdmin
from .models import InfoCard

@admin.register(InfoCard)
class InfoCardAdmin(SortableAdmin):
    list_display = ('title_en', 'title_he', 'order')