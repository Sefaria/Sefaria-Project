# -*- coding: utf-8 -*-

import unicodedata
import django
django.setup()

from sefaria.model import *


forms = WordFormSet()
for form in forms:
    print(form._id)
    form.form = unicodedata.normalize("NFC",form.form)
    form.save()