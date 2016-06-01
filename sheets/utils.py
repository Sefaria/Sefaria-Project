"""
Helper functions for sheets views.
"""

from __future__ import unicode_literals

import json

from django.contrib.auth.models import User
from django.template import RequestContext
from django.template.loader import render_to_string

from sefaria.model.group import Group
from sheets.views import (annotate_user_links,
						  assignments_from_sheet,
						  make_sheet_class_string)

def sheet_to_html_string(sheet, request=None):
	"""
	Create the html string of sheet with sheet_id.
	"""
	sheet["sources"] = annotate_user_links(sheet["sources"])

	try:
		owner = User.objects.get(id=sheet["owner"])
		author = owner.first_name + " " + owner.last_name
	except User.DoesNotExist:
		author = "Someone Mysterious"

	sheet_group = (Group().load({"name": sheet["group"]})
				   if "group" in sheet and sheet["group"] != "None" else None)

	context = {
		"sheetJSON": json.dumps(sheet),
		"sheet": sheet,
		"sheet_class": make_sheet_class_string(sheet),
		"can_edit": False,
		"can_add": False,
		"title": sheet["title"],
		"author": author,
		"is_owner": False,
		"is_public": sheet["status"] == "public",
		"owner_groups": None,
		"sheet_group":  sheet_group,
		"like_count": len(sheet.get("likes", [])),
		"viewer_is_liker": False,
		"assignments_from_sheet": assignments_from_sheet(sheet['id']),
	}

	if request is not None:
		return render_to_string('sheets.html', context, RequestContext(request))
	return render_to_string('sheets.html', context).encode('utf-8')


def sheet_to_html_string_naive(sheet, request=None):
    """
	Naively makes an html string from the JSON formatted sheet
	"""
    html = ''

    title = unicode(sheet.get('title', '')).strip()
    html += '{}<br>'.format(title)

    # author = ''
    # html += '<em>Source Sheet by <a href="{}">{}</a><em>'

    for source in sheet['sources']:
        if 'text' in source:
            english = unicode(source['text'].get('en', '')).strip()
            hebrew = unicode(source['text'].get('he', '')).strip()
            html += '{}<br>{}'.format(english, hebrew)
        elif 'outsideText' in source:
            html += unicode(source['outsideText']).strip()
        elif 'comment' in source:
            html += unicode(source['comment']).strip()
        html += '<br><br>'

    return html.encode('utf-8')
