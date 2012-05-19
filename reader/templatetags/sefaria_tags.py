from django import template
from django.template.defaultfilters import stringfilter
from django.utils.safestring import mark_safe


register = template.Library()

@register.filter(is_safe=True)
@stringfilter
def url_ref(value):
	if not value:
		return ""
	link = "<a href='/" + value.replace(" ", "_").replace(":", ".") + "'>" + value + "</a>"
	return mark_safe(link)

