"""
Register for model dependencies.
If instances of Model X depend on field f in Model Class Y:
- X subscribes with: subscribe(Y, "f", X.callback)
- On a chance of an instance of f, Y calls: notify(Y, "f", old_value, new_value)

todo: currently doesn't respect any inheritance


>>> from sefaria.model import *
>>> def handle(old, new):
...     print "Old : " + old
...     print "New : " + new
...
>>> subscribe(index.Index, "title", handle)
>>> notify(index.Index(), "title", "yellow", "green")
Old : yellow
New : green
"""

import logging
logging.basicConfig()
logger = logging.getLogger("dep_register")
logger.setLevel(logging.DEBUG)

deps = {}


def notify(inst, attr, old, new):
    logger.debug("Notify: " + str(inst) + "." + attr + ": " + old + " is becoming " + new)
    callbacks = deps.get((type(inst), attr), None)
    if not callbacks:
        return
    for callback in callbacks:
        callback(old, new)


def subscribe(klass, attr, callback):
    if not deps.get((klass, attr), None):
        deps[(klass, attr)] = []
    deps[(klass, attr)].append(callback)
