"""
Register for model dependencies.
If instances of Model X depend on field f in Model Class Y:
- X subscribes with: subscribe(Y, "f", X.callback)
- On a chance of an instance of f, Y calls: notify(Y, "f", old_value, new_value)

Example:
>>> import sefaria.system.dep_register as dr
>>> from sefaria.model import *
>>> def handle(old, new):
...     print "Old : " + old
...     print "New : " + new
...
>>> dr.subscribe(index.Index, "title", handle)
>>> dr.notify(index.Index, "title", "yellow", "green")
Old : yellow
New : green
"""


deps = {}


def notify(klass, attr, old, new):
    callbacks = deps.get((klass, attr), None)
    if not callbacks:
        return
    for callback in callbacks:
        callback(old, new)


def subscribe(klass, attr, callback):
    if not deps.get((klass, attr), None):
        deps[(klass, attr)] = []
    deps[(klass, attr)].append(callback)
