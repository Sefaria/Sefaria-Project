# -*- coding: utf-8 -*-
"""
Post a sheet form the local environment to a remote environment, using an API Key.
"""
import sys
import json
import urllib
import urllib2

from sefaria.sheets import get_sheet

try:
  from sefaria.local_settings import SEFARIA_API_KEY
except:
  print "To post sheets, please set SEFARIA_API_KEY in your local_settings.py"
  sys.exit()


if len(sys.argv) < 3:
  print "Please specify a sheet id to post and a destination host. E.g.:"
  print "post_sheet.py 613 https://dev.sefaira.org'"
else:
  
  id = int(sys.argv[1])
  host = sys.argv[2]

  sheet = get_sheet(id)
  del sheet["id"]
  del sheet["_id"]

  post_json = json.dumps(sheet)
  values = {'json': post_json, 'apikey': SEFARIA_API_KEY}
  post = urllib.urlencode(values)  

  req = urllib2.Request(host + "/api/sheets", post)  

  try:
    response = urllib2.urlopen(req)
    print "Sheet posted."
  except urllib2.HTTPError as e:
    error_message = e.read()
    print error_message