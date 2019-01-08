# -*- coding: utf-8 -*-
import pytest
import sefaria.model as m
from sefaria.system.exceptions import InputError


class Test_Group(object):

    def test_save(self):
        g = m.Group({
            "publishers": [],
            "headerUrl": "",
            "name": "Test Group!",
            "imageUrl": "",
            "coverUrl": "",
            "description": "innocent description",
            "admins": [
                1
            ],
            "members": []
        })
        g.description = 'Seemingly ok description... <a href="javascript:alert(8007)">Click me</a>'
        g.save()
        assert g.description == 'Seemingly ok description... <a>Click me</a>'
        g.delete()