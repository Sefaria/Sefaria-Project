from django import template
from django.template.defaultfilters import stringfilter
from django.utils.safestring import mark_safe
from django.core.serializers import serialize
from django.db.models.query import QuerySet
from django.utils import simplejson
from django.template import Library
from sefaria.texts import url_ref as url
from sefaria.texts import parse_ref


register = template.Library()

@register.filter(is_safe=True)
@stringfilter
def url_ref(value):
	if not value:
		return ""
	pRef = parse_ref(value, pad=False)
	if pRef["type"] == "Commentary" and "commentaryCategories" not in pRef:
		return value
	link = "<a href='/" + url(value) + "'>" + value + "</a>"
	return mark_safe(link)

@register.filter(is_safe=True)
def jsonify(object):
    if isinstance(object, QuerySet):
        return mark_safe(serialize('json', object))
    return mark_safe(simplejson.dumps(object))