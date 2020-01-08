# -*- coding: utf-8 -*-
"""
Creates a group document in Mongo for each Django Group. 
"""
from django.contrib.auth.models import Group

from sefaria.model.group import Group as NewGroup
from sefaria.model.group import GroupSet

GroupSet().delete()

groups = Group.objects.all()
for group in groups:
    print(group.name)
    base = "http://www.sefaria.org/static/partner/"
    path = group.name.replace(" ", "_")
    newGroup = NewGroup({
                            "name": group.name,
                            "coverUrl": base + path + "/logo.png",
                            "headerUrl": base + path + "/header.png",
                        })
    newGroup.save()