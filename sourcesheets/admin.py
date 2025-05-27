from django.contrib import admin
from adminsortable.admin import SortableAdmin
from .models import Guide, InfoCard

class InfoCardInline(admin.TabularInline):
    model = InfoCard
    extra = 0
    fields = ('title_en', 'title_he', 'text_en', 'text_he', 'order')
    readonly_fields = ()

@admin.register(Guide)
class GuideAdmin(admin.ModelAdmin):
    list_display = ('key', 'title_prefix_en', 'title_prefix_he', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('key', 'title_prefix_en', 'title_prefix_he')
    inlines = [InfoCardInline]
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('key', 'title_prefix_en', 'title_prefix_he')
        }),
        ('Footer Links', {
            'fields': ('footer_links_json',),
            'description': 'JSON format: [{"text": {"en": "Link Text", "he": "טקסט קישור"}, "url": "/path"}]'
        }),
    )

@admin.register(InfoCard)
class InfoCardAdmin(SortableAdmin):
    list_display = ('guide', 'title_en', 'title_he', 'order')
    list_filter = ('guide',)
    search_fields = ('title_en', 'title_he', 'text_en', 'text_he')
    
    fieldsets = (
        ('Guide', {
            'fields': ('guide',)
        }),
        ('Content', {
            'fields': ('title_en', 'title_he', 'text_en', 'text_he')
        }),
        ('Images', {
            'fields': ('image_en', 'image_he', 'image_alt_en', 'image_alt_he')
        }),
    )