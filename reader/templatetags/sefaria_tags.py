from django import template
from django.template.defaultfilters import stringfilter
from django.utils.safestring import mark_safe
from django.core.serializers import serialize
from django.db.models.query import QuerySet
from django.utils import simplejson
from django.template import Library
from django.contrib.auth.models import User
from sefaria.texts import url_ref as url
from sefaria.texts import parse_ref
from sefaria.util import user_link as ulink

register = template.Library()

@register.filter(is_safe=True)
@stringfilter
def url_ref(value):
	if not value:
		return ""
	pRef = parse_ref(value, pad=False)
	if "error" in pRef:
		return value
	link = '<a href="/' + url(value) + '">' + value + '</a>'
	return mark_safe(link)


@register.filter(is_safe=True)
def jsonify(object):
    if isinstance(object, QuerySet):
        return mark_safe(serialize('json', object))
    return mark_safe(simplejson.dumps(object))


@register.filter(is_safe=True)
def user_link(uid):
	return mark_safe(ulink(uid))

@register.simple_tag 
def get_private_attribute(model_instance, attrib_name): 
        return getattr(model_instance, attrib_name, '') 