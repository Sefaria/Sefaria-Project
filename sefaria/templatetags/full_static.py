from django import template
from django.conf import settings
from django.templatetags.static import static

register = template.Library()

@register.simple_tag
def full_static(path):
    """Like the built-in static but uses STATIC_BASE_URL if defined"""
    if hasattr(settings, 'STATIC_BASE_URL'):
        return f"{settings.STATIC_BASE_URL.rstrip('/')}/{path.lstrip('/')}"
    return static(path)
