# -*- coding: utf-8 -*-
import django
django.setup()

from sefaria.model import *
from sefaria.system.database import db
from sefaria.model.category import toc_serial_to_objects
from sefaria.summaries import update_table_of_contents


def create_category(en, he, parent=None):
    parent_path = parent.path if parent else []
    c = Category()
    # if Term().load({"name": treenode.primary_title("en")}):
    #    c.add_shared_term(treenode.primary_title("en"))
    c.add_primary_titles(en, he)
    c.path = parent_path + [en]
    c.lastPath = en
    print "Creating - {}".format(" / ".join(c.path))
    c.save(override_dependencies=True)

db.category.remove({})

create_category("Joyces Head", u"א")
create_category("Tail of Joyce", u"ב")
create_category("Relevant", u"ש")
create_category("Etc", u"ת")