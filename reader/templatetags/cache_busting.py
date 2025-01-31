import os
from django import template
from django.conf import settings

register = template.Library()

@register.simple_tag
def versioned_static(file_path):
    full_path = os.path.join(settings.BASE_DIR, 'static', file_path)
    try:
        timestamp = int(os.path.getmtime(full_path))
        return f"{settings.STATIC_URL}{file_path}?v={timestamp}"
    except FileNotFoundError:
        return f"{settings.STATIC_URL}{file_path}"
