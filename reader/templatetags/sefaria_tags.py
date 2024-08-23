# -*- coding: utf-8 -*-
"""
Custom Sefaria Tags for Django Templates
"""
import json
import re
import dateutil.parser
import urllib.request, urllib.parse, urllib.error
import math
from urllib.parse import urlparse
from datetime import datetime
from django import template
from django.template.defaultfilters import stringfilter
from django.utils.safestring import mark_safe
from django.core.serializers import serialize
from django.db.models.query import QuerySet
from django.contrib.sites.models import Site
from django.utils.translation import ugettext as _
from django.utils import translation
from django.conf import settings
from django.utils.dateformat import format as date_format



from sefaria.sheets import get_sheet
from sefaria.model.user_profile import user_link as ulink, user_name as uname, public_user_data
from sefaria.model.text import Version
from sefaria.model.collection import Collection
from sefaria.utils.util import strip_tags as strip_tags_func
from sefaria.utils.hebrew import hebrew_plural, hebrew_term, hebrew_parasha_name
from sefaria.utils.hebrew import hebrew_term as translate_hebrew_term

import sefaria.model.text
import sefaria.model as m
from sefaria.model.text import library, AbstractIndex


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
	try:
		oref = m.Ref(value)
		link = '<a href="/' + oref.url() + '">' + value + '</a>'
	except:
		link = value
	ref_link_cache[value] = mark_safe(link)
	return ref_link_cache[value]


he_ref_link_cache = {} # simple cache for ref links
@register.filter(is_safe=True)
@stringfilter
def he_ref_link(value, absolute=False):
	"""
	Transform a ref into an <a> tag linking to that ref in Hebrew.
	e.g. "Genesis 1:3" -> "<a href='/Genesis.1.2'>בראשית, א, ב</a>"
	"""
	if value in he_ref_link_cache:
		return he_ref_link_cache[value]
	if not value:
		return ""
	try:
		oref = m.Ref(value)
		link = '<a class="heRef" href="/' + oref.url() + '">' + re.sub(r"\d+(-\d+)?", "", oref.he_normal()) + '</a>'
	except:
		link = '<a class="heRef" href="#invalid-ref">' + value + '</a>'
	he_ref_link_cache[value] = mark_safe(link)
	return he_ref_link_cache[value]


@register.filter(is_safe=True)
@stringfilter
def he_ref(value):
	"""
	Returns a Hebrew ref for the english ref passed in.
	"""
	if not value:
		return ""
	try:
		oref = m.Ref(value)
		he   = oref.he_normal()
	except:
		he   = value

	return he


@register.filter(is_safe=True)
@stringfilter
def he_parasha(value):
	"""
	Returns a Hebrew parsha name for the english parsha name passed in.
	"""
	return hebrew_parasha_name(value)


@register.filter(is_safe=True)
@stringfilter
def he_version(value):
	"""
	Returns the Hebrew translation of a version title, if it exists.
	"""
	version = Version().load({"versionTitle": value})
	if not version:
		return value
	return getattr(version, "versionTitleInHebrew", value)


@register.filter(is_safe=True)
def version_link(v):
	"""
	Return an <a> tag linking to the first available text of a particular version.
	"""
	try:
		section_ref = v.first_section_ref() or v.get_index().nodes.first_leaf().first_section_ref()
	except IndexError:
		try:
			section_ref = v.get_index().nodes.first_leaf().first_section_ref()
		except:  # Better if we knew how this may fail...
			return mark_safe('<a href="/{}.1/{}/{}">{}</a>'.format(v.title, v.language, urllib.parse.quote(v.versionTitle.replace(" ", "_").encode("utf-8")), v.versionTitle))

	link = '<a href="/{}/{}/{}">{}</a>'.format(section_ref.url(), v.language, urllib.parse.quote(v.versionTitle.replace(" ", "_").encode("utf-8")), v.versionTitle)
	return mark_safe(link)


@register.filter(is_safe=True)
def text_toc_link(indx):
	"""
	Return an <a> tag linking to the text TOC for the Index
	"""
	if not isinstance(indx, AbstractIndex):
		indx = library.get_index(indx)

	en = indx.nodes.primary_title("en")
	he = indx.nodes.primary_title("he")
	link = '<a href="/{}"><span class="int-en">{}</span><span class="int-he">{}</span></a>'.format(urllib.parse.quote(indx.title), en, he)
	return mark_safe(link)


@register.filter(is_safe=True)
def person_link(person):
	"""
	Return an <a> tag linking to a person page.
	"""
	link = '<a href="/person/{}"><span class="int-en">{}</span><span class="int-he">{}</span></a>'.format(person.key, person.primary_name("en"), person.primary_name("he"))
	return mark_safe(link)


@register.filter(is_safe=True)
def version_source_link(v):
	"""
	Return an <a> tag linking to the versionSource, or to a Google Search for the source.
	"""
	if " " in v.versionSource or "." not in v.versionSource:
		href       = "https://www.google.com/search?q=" + urllib.parse.quote(v.versionSource.encode('utf8'))
		val        = v.versionSource
	else:
		parsed_uri = urlparse( v.versionSource )
		href       = v.versionSource
		val        = parsed_uri.netloc

	link = '<a class="versionSource" href="{}" target="_blank">{}</a>'.format(href, val)
	return mark_safe(link)


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
def user_name(uid):
	return mark_safe(uname(uid))


@register.filter(is_safe=True)
def group_link(group_name):
	return mark_safe("<a href='/groups/%s'>%s</a>" % (group_name.replace(" ", "-"), group_name))


@register.filter(is_safe=True)
def collection_link(collection_slug):
	c = Collection().load({"slug": collection_slug})
	if not c:
		return mark_safe("[unknown collection: {}".format(collection_slug))
	return mark_safe("<a href='/collections/{}'>{}</a>".format(collection_slug, c.name))


@register.filter(is_safe=True)
def lang_code(code):
	codes = {
		"en": _("English"),
		"he": _("Hebrew"),
		"bi": _("Bilingual"),
	}
	return codes.get(code, "Unknown Language")


@register.filter(is_safe=True)
def text_category(text):
	"""Returns the top level category for text"""
	try:
		i = m.library.get_index(text)
		result = mark_safe(getattr(i, "categories", ["[no cats]"])[0])
	except:
		result = "[text not found]"
	return result


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
def escape_quotes(value):
	"""
	Returns the given HTML with single and double quotes escpaed with \ for a JS context
	"""
	value = value.replace("'", "\\'")
	value = value.replace('"', '\\"')
	return mark_safe(value)


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
def discussion_link(discussion):
	"""
	Returns a link to layer with id value.

	:param discussion is either a Layer object or a urlkey for a Layer object.
	"""
	if isinstance(discussion, str):
		discussion = m.Layer().load({"urlkey": discussion})
		if not discussion:
			return mark_safe("[discusion not found]")
	if getattr(discussion, "first_ref", None):
		oref = m.Ref(discussion.first_ref)
		href = "/" + oref.url() + "?layer=" + discussion.urlkey
		count = len(discussion.note_ids)
		safe = "<a href='{}'>{} ({} notes)</a>".format(href, oref.normal(), count)
	else:
		safe = "<a href='/Genesis.1?layer=" + discussion.urlkey + "'>Unstarted Discussion</a>"
	return mark_safe(safe)


@register.filter(is_safe=True)
def absolute_link(value):
	"""
	Takes a string with a single <a> tag a replaces the href with absolute URL.
	<a href='/Job.3.4'>Job 3:4</a> --> <a href='http://www.sefaria.org/Job.3.4'>Job 3:4</a>
	"""
	# run twice to account for either single or double quotes
	absolute = value.replace("href='/", "href='https://%s/" % domain)
	absolute = absolute.replace('href="/', 'href="https://%s/' % domain)
	return mark_safe(absolute)


@register.filter(is_safe=True)
def absolute_url(value):
	"""
	Takes a string with path starting with "/" and returls url with domain and protocol.
	"""
	# run twice to account for either single or double quotes
	absolute = "https://%s%s" % (domain, value)
	return mark_safe(absolute)


@register.filter(is_safe=True)
def license_link(value):
	"""
	Returns the text of an <a> tag linking to a page explaining a license.
	"""
	links = {
		"Public Domain": "http://en.wikipedia.org/wiki/Public_domain",
		"CC0":           "http://creativecommons.org/publicdomain/zero/1.0/",
		"CC-BY":         "http://creativecommons.org/licenses/by/3.0/",
		"CC-BY-SA":      "http://creativecommons.org/licenses/by-sa/3.0/",
	}

	if value not in links:
		return mark_safe(value)

	return mark_safe("<a href='%s' target='_blank'>%s</a>" % (links[value], value))


@register.filter(is_safe=True)
@stringfilter
def trim_title(value):
	safe = value.replace("Mishneh Torah, ", "")
	safe = safe.replace("Shulchan Arukh, ", "")
	safe = safe.replace("Jerusalem Talmud ", "")

	safe = safe.replace("משנה תורה, ", "")

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
def percent_available(array, key):
	return array.get(key, {}).get("percentAvailable", 0.0)


@register.filter(is_safe=True)
def pluralize(value):
	"""
	Hebrew friendly plurals
	"""
	return mark_safe(hebrew_plural(value))


@register.filter(is_safe=True)
def hebrew_term(value):
	"""
	Hebrew friendly plurals
	"""
	return mark_safe(translate_hebrew_term(value))


@register.filter(is_safe=True)
def jsonify(object):
	if isinstance(object, QuerySet):
		return mark_safe(serialize('json', object))
	elif isinstance(object, str):
		return mark_safe(object)
	return mark_safe(json.dumps(object))


@register.simple_tag 
def get_private_attribute(model_instance, attrib_name): 
		return getattr(model_instance, attrib_name, '')


@register.filter(is_safe=True)
def nice_timestamp(timestamp):
	return dateutil.parser.parse(timestamp).strftime("%m/%d/%y")


# Derived from https://djangosnippets.org/snippets/6/
"""
Template tags for working with lists.

You'll use these in templates thusly::

	{% load listutil %}      # I don't think we need this line.
	{% for sublist in mylist|parition:"3" %}
		{% for item in mylist %}
			do something with {{ item }}
		{% endfor %}
	{% endfor %}
"""
@register.filter
def partition_into(thelist, n):
	"""
	Break a list into ``n`` pieces. The last list may be larger than the rest if
	the list doesn't break cleanly. That is::

		>>> l = range(10)

		>>> partition(l, 2)
		[[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]

		>>> partition(l, 3)
		[[0, 1, 2], [3, 4, 5], [6, 7, 8, 9]]

		>>> partition(l, 4)
		[[0, 1], [2, 3], [4, 5], [6, 7, 8, 9]]

		>>> partition(l, 5)
		[[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]]

	"""
	try:
		n = int(n)
		thelist = list(thelist)
	except (ValueError, TypeError):
		return [thelist]
	p = len(thelist) / n
	return [thelist[p*i:p*(i+1)] for i in range(n - 1)] + [thelist[p*(i+1):]]


@register.filter
def partition_by(thelist, n):
	"""
	Break a list into ``n`` sized peices
	``partition_by(range(10), 3)`` gives::

		[[1, 4, 7],
		 [2, 5, 8],
		 [3, 6, 9],
		 [10]]

	"""
	try:
		n = int(n)
		thelist = list(thelist)
	except (ValueError, TypeError):
		return [thelist]
	rows = int(math.ceil(float(len(thelist)) / n))
	newlists = [thelist[r * n : (r + 1) * n] for r in range(rows)]
	return newlists


@register.filter
def partition_vertical(thelist, n):
	"""
	Break a list into ``n`` peices, but "horizontally." That is,
	``partition_horizontal(range(10), 3)`` gives::

		[[1, 4, 7],
		 [2, 5, 8],
		 [3, 6, 9],
		 [10]]

	Clear as mud?
	"""
	try:
		n = int(n)
		thelist = list(thelist)
	except (ValueError, TypeError):
		return [thelist]
	newlists = [list() for i in range(n)]
	for i, val in enumerate(thelist):
		newlists[i%n].append(val)
	return newlists


@register.filter
def date_string_to_date(dateString):
    return(datetime.strptime(dateString, "%Y-%m-%dT%H:%M:%S.%f"))


@register.filter
def date_string_to_tibetan_date(value):
    if isinstance(value, str):
        # Parse the date string to a datetime object
        value = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%f")

    # Create the Tibetan date and time format
    formatted_datetime = (
        f"སྤྱི་ལོ་{value.year} "
        f"ཟླ་{value.month} "
        f"ཚེས་{value.day} "
        f"ཕྱག་ཚོད་{value.hour} "
        f"སྐར་མ་{value.minute} "
    )
    return formatted_datetime

@register.filter
def format_date_by_language(value):
	language = {
		'en': 'en',
		'he': 'bo',
		'ch': 'zh',
	}
	current_language = translation.get_language()
	date_obj = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%f")
	date_format_string = settings.DATE_FORMATS.get(current_language, settings.DATE_FORMATS['en'])
	return date_format(date_obj, date_format_string)


@register.filter(is_safe=True)
def sheet_via_absolute_link(sheet_id):
    return mark_safe(absolute_link(
		'<a href="/sheets/{}">a sheet</a>'.format(sheet_id)))
