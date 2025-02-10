from django import template
from django.utils import timezone
from django.utils import translation
from sefaria.settings import DATE_FORMATS_REVISION_PAGE


register = template.Library()

def to_tibetan_numeral(number):
    tibetan_numerals = ['༠', '༡', '༢', '༣', '༤', '༥', '༦', '༧', '༨', '༩']
    return ''.join(tibetan_numerals[int(d)] for d in str(number))


@register.filter(name='custom_time_format')
def custom_time_format(value):
    if not timezone.is_aware(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    
    current_language = translation.get_language()
    date_format_string = DATE_FORMATS_REVISION_PAGE.get(current_language, DATE_FORMATS_REVISION_PAGE['en'])
    
    formatted_date = value.strftime(date_format_string)
    
    if current_language == 'he':  # Tibetan
        year, month, day = value.year, value.month, value.day
        tibetan_year = to_tibetan_numeral(year)
        tibetan_month = to_tibetan_numeral(month)
        tibetan_day = to_tibetan_numeral(day)
        formatted_date = f"ཕྱི་ལོ་{tibetan_year} ཟླ་{tibetan_month} ཚེས་{tibetan_day}"
    
    return formatted_date
