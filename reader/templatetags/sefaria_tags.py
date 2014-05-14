# -*- coding: utf-8 -*-
"""
Custom Sefaria Tags for Django Templates
"""
import re
import dateutil.parser

from django import template
from django.template.defaultfilters import stringfilter
from django.utils.safestring import mark_safe
from django.utils.encoding import force_unicode
from django.core.serializers import serialize
from django.db.models.query import QuerySet
from django.utils import simplejson
from django.template import Library
from django.contrib.auth.models import User
from django.contrib.sites.models import Site


from sefaria.texts import url_ref
from sefaria.texts import parse_ref
from sefaria.sheets import get_sheet
from sefaria.util import user_link as ulink, strip_tags as strip_tags_func

register = template.Library()

current_site = Site.objects.get_current()
domain       = current_site.domain

ref_link_cache = {} # simple cache for ur
@register.filter(is_safe=True)
@stringfilter
def ref_link(value, absolute=False):
	"""
	Transform a ref into an <a> tag linking to that ref.
	e.g. "Genesis 1:3" -> "<a href='/Genesis.1.2'>Genesis 1:2</a>"
	"""
	if value in ref_link_cache:
		return ref_link_cache[value]
	if not value:
		return ""
	pRef = parse_ref(value, pad=False)
	if "error" in pRef:
		return value
	link = '<a href="/' + url_ref(value) + '">' + value + '</a>'
	ref_link_cache[value] = mark_safe(link)
	return ref_link_cache[value]


@register.filter(is_safe=True)
@stringfilter
def url_safe(value):
	safe = value.replace(" ", "_")
	return mark_safe(safe)


@register.filter(is_safe=True)
def user_link(uid):
	return mark_safe(ulink(uid))


@register.filter(is_safe=True)
def strip_html_entities(text):
	text = text if text else ""
	text = text.replace("<br>", "\n")
	text = text.replace("&amp;", "&")
	text = text.replace("&nbsp;", " ")
	return mark_safe(text)


@register.filter(is_safe=True)
def strip_tags(value):
	"""
	Returns the given HTML with all tags stripped.
	"""
	return mark_safe(strip_tags_func(value))


@register.filter(is_safe=True)
@stringfilter
def sheet_link(value):
	"""
	Returns a link to sheet with id value.
	"""
	value = int(value)
	sheet = get_sheet(value)
	if "error" in sheet:
		safe = "[sheet not found]"
	else:
		safe = "<a href='/sheets/%d'>%s</a>" % (value, strip_tags_func(sheet["title"]))
	return mark_safe(safe)

@register.filter(is_safe=True)
def absolute_link(value):
	"""
	Takes a string with a single <a> tag a replaces the href with absolute URL.
	<a href='/Job.3.4'>Job 3:4</a> --> <a href='http://www.sefaria.org/Job.3.4'>Job 3:4</a>
	"""
	# run twice to account for either single or double quotes
	absolute = value.replace("href='/", "href='http://%s/" % domain)
	absolute = absolute.replace('href="/', 'href="http://%s/' % domain)
	return mark_safe(absolute)



@register.filter(is_safe=True)
@stringfilter
def trim_title(value):
	safe = value.replace("Mishneh Torah, ", "")
	safe = safe.replace("Shulchan Arukh, ", "")
	safe = safe.replace("Jerusalem Talmud ", "")

	safe = safe.replace(u"משנה תורה, ", "")

	return mark_safe(safe)


@register.filter(is_safe=True)
def sum_counts(counts):
	return sum(counts.values()) / 570.0


@register.filter(is_safe=True)
def text_progress_bars(text):
	if text.percentAvailable:
		html = """
		<div class="progressBar heAvailable" style="width:{{ text.percentAvailable.he|floatformat|default:'0' }}%">
		</div>
		<div class="progressBar enAvailable" style="width:{{ text.percentAvailable.en|floatformat|default:'0' }}%">
		</div>
		"""
	else:
		html = """
		<div class="progressBar heAvailable" style="width:{{ text.availableCounts.he|sum_counts }}%">
		</div>
		<div class="progressBar enAvailable" style="width:{{ text.availableCounts.en|sum_counts }}%">
		</div>
		"""
	return sum(counts.values())


@register.filter(is_safe=True)
def jsonify(object):
    if isinstance(object, QuerySet):
        return mark_safe(serialize('json', object))
    return mark_safe(simplejson.dumps(object))


@register.simple_tag 
def get_private_attribute(model_instance, attrib_name): 
        return getattr(model_instance, attrib_name, '') 


@register.filter(is_safe=True)
def nice_timestamp(timestamp):
	return dateutil.parser.parse(timestamp).strftime("%m/%d/%y")