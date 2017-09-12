import json
from django.template.loader import render_to_string

class InterruptingMessage(object):
  def __init__(self, attrs={}, request=None):
    self.name        = attrs.get("name", None)
    self.repetition  = attrs.get("repitition", 0)
    self.condition   = attrs.get("condition", {})
    self.request     = request
    self.cookie_name = "%s_%d" % (self.name, self.repetition)

  def check_condition(self):
    if not self.name:
    	return False

    if self.request.COOKIES.get(self.cookie_name, False):
    	return False

    if "returning" in self.condition:
    	if self.request.COOKIES.get("_ga", False):
    		return True

    return True

  def json(self):
    if self.check_condition():
      return json.dumps({
          "name": self.name,
          "html": render_to_string("messages/%s.html" % self.name),
          "repetition": self.repetition
        })
    else:
      return "null"