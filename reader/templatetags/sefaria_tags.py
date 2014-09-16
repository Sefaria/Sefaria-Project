# -*- coding: utf-8 -*-
"""
Custom Sefaria Tags for Django Templates
"""
import json
import dateutil.parser
from django import template
from django.template.defaultfilters import stringfilter
from django.utils.safestring import mark_safe
from django.core.serializers import serialize
from django.db.models.query import QuerySet

from django.contrib.sites.models import Site

from sefaria.texts import url_ref, parse_ref, get_index
from sefaria.sheets import get_sheet
from sefaria.utils.users import user_link as ulink
from sefaria.utils.util import strip_tags as strip_tags_func

import re


register = template.Library()

current_site = Site.objects.get_current()
domain       = current_site.domain


ref_link_cache = {} # simple cache for ref links
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
def prettify_url(value):
	return re.sub(r'^https?:\/\/', '', value, flags=re.MULTILINE)

@register.filter(is_safe=True)
def normalize_url(value):
	if re.match(r'^https?:\/\/', value) is None:
		value = 'http://' + value
	return value

@register.filter(is_safe=True)
def user_link(uid):
	return mark_safe(ulink(uid))


@register.filter(is_safe=True)
def lang_code(code):
	codes = {
		"en": "English",
		"he": "Hebrew",
		"bi": "Bilingual",
	}
	return codes.get(code, "Unknown Language")


@register.filter(is_safe=True)
def text_category(text):
	"""Returns the top level category for text"""
	i = get_index(text)
	return mark_safe(i.get("categories", ["[no cats]"])[0])


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
		safe = "<a href='#'>[sheet not found]</a>"
	else:
		safe = "<a href='/sheets/%d' data-id='%d'>%s</a>" % (value, value, strip_tags_func(sheet["title"]))
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
@stringfilter
def abbreviate_number(value):
	"""
	13,324,4234 -> 13M
	35,234 -> 35k
	231,421,412,432 - 231B
	"""
	try:
		n = int(value)
	except:
		return mark_safe(value)

	if n > 1000000000:
		abbr = "%dB" % ( n / 1000000000 )
	
	elif n > 1000000:
		abbr = "%dM" % ( n / 1000000 )
	
	elif n > 1000:
		abbr = "%dk" % ( n / 1000 )

	else:
		abbr = str(n)



	return mark_safe(abbr)


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
    return mark_safe(json.dumps(object))


@register.simple_tag 
def get_private_attribute(model_instance, attrib_name): 
        return getattr(model_instance, attrib_name, '') 


@register.filter(is_safe=True)
def nice_timestamp(timestamp):
	return dateutil.parser.parse(timestamp).strftime("%m/%d/%y")