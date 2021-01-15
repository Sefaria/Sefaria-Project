# -*- coding: utf-8 -*-
import pytest
import sefaria.model as m
from sefaria.system.exceptions import InputError


class Test_Collection(object):

    def test_save(self):
        g = m.Collection({
            "name": "Test Collection!",
            "headerUrl": "",
            "imageUrl": "",
            "coverUrl": "",
            "description": "innocent description",
            "admins": [ 1 ],
            "members": []
        })
        
        # Slug is assigned
        g.save()
        assert hasattr(g, "slug")

        # Clean Description HTML
        g.description = 'Seemingly ok description... <a href="javascript:alert(8007)">Click me</a>'
        g.save()
        assert g.description == 'Seemingly ok description... <a>Click me</a>'

        # Can't save with empty title
        g.name = ""
        with pytest.raises(InputError):
            g.save()
        g.name = "Text Collection"

        # Can't be public without image, public sheets
        g.listed = True
        with pytest.raises(InputError):
            g.save()

        g.delete()
