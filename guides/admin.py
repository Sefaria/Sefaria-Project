from django.contrib import admin
from django import forms
from django.db import models
from adminsortable.admin import SortableAdmin
from .models import Guide, InfoCard

# InfoCardInline is a nested inline for the Guide model
# It allows editing InfoCard objects directly within the Guide admin form
class InfoCardInline(admin.StackedInline):
    model = InfoCard
    extra = 0
    can_delete = False
    fields = (('title_en', 'title_he'), ('text_en', 'text_he'), ('video_en', 'video_he'), 'order')
    
    formfield_overrides = {
        models.TextField: {'widget': forms.Textarea(attrs={'rows': 5, 'cols': 50})},
        models.CharField: {'widget': forms.TextInput(attrs={'size': 40})},
        models.URLField: {'widget': forms.URLInput(attrs={'size': 30})},
    }

class GuideAdminForm(forms.ModelForm):
    class Meta:
        model = Guide
        fields = '__all__'

@admin.register(Guide)
class GuideAdmin(admin.ModelAdmin):
    form = GuideAdminForm
    list_display = ('key', 'title_prefix_en', 'title_prefix_he', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('key', 'title_prefix_en', 'title_prefix_he')
    # Inlines allow related models to be edited on the same page as the parent model
    # InfoCardInline enables editing InfoCard objects directly within the Guide admin form
    inlines = [InfoCardInline]
    
    fieldsets = (
        ('Basic Information', {
            'fields': (('key',), ('title_prefix_en', 'title_prefix_he'))
        }),
        ('Footer Link 1', {
            'fields': (('footer_link_1_text_en', 'footer_link_1_text_he'), 'footer_link_1_url'),
            'description': 'First footer link (link will only appear if all fields are provided)'
        }),
        ('Footer Link 2', {
            'fields': (('footer_link_2_text_en', 'footer_link_2_text_he'), 'footer_link_2_url'),
            'description': 'Second footer link (link will only appear if all fields are provided)'
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
            'fields': (('title_en', 'title_he'), ('text_en', 'text_he'))
        }),
        ('Videos', {
            'fields': (('video_en', 'video_he'),)
        }),
    )
    
    formfield_overrides = {
        models.TextField: {'widget': forms.Textarea(attrs={'rows': 3, 'cols': 40})},
    }