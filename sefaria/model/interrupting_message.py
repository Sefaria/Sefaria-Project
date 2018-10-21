import json
from django.template.loader import render_to_string

class InterruptingMessage(object):
  def __init__(self, attrs={}, request=None):
    if attrs is None:
      attrs = {}
    self.name        = attrs.get("name", None)
    self.repetition  = attrs.get("repetition", 0)
    self.condition   = attrs.get("condition", {})
    self.request     = request
    self.cookie_name = "%s_%d" % (self.name, self.repetition)

  def check_condition(self):
    """Returns true if this interrupting message should be shown given its conditions"""
    
    # Always show to debug
    if self.condition.get("debug", False):
      return True

    # Nameless is useless
    if not self.name:
      return False

    # Don't show this name/repetiion pair more than once
    if self.request.COOKIES.get(self.cookie_name, False):
      return False

    # Limit to returning visitors only
    if self.condition.get("returning_only", False):
      if not self.request.COOKIES.get("_ga", False):
        return False

    # Filter mobile traffic
    if self.condition.get("desktop_only", True):
      if self.request.user_agent.is_mobile:
        return False

    # Filter non English interface traffic
    if self.condition.get("english_only", True):
      if self.request.LANGUAGE_CODE != "en":
        return False

    return True

  def json(self):
    """
    Returns JSON for this interrupting message which may be just `null` if the
    message should not be shown.
    """
    if self.check_condition():
      return json.dumps({
          "name": self.name,
          "html": render_to_string("messages/%s.html" % self.name),
          "repetition": self.repetition
        })
    else:
      return "null"