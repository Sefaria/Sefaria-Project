from django import template
from django.utils import timezone
from django.utils import translation
from sefaria.settings import DATE_FORMATS_REVISION_PAGE


register = template.Library()


@register.filter(name='custom_time_format')
def custom_time_format(value):

    if not timezone.is_aware(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())

    
    current_language = translation.get_language()
    date_format_string = DATE_FORMATS_REVISION_PAGE.get(current_language, DATE_FORMATS_REVISION_PAGE['en'])
    
    return value.strftime(date_format_string)

