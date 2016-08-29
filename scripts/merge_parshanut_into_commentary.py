# -*- coding: utf-8 -*-

from sefaria.model import *


mh = library.get_index('Meshech Hochma')
ay = library.get_index('Akeidat Yitzchak')
sl = library.get_index('Shney Luchot HaBrit')

mh.categories = ['Commentary2', 'Tanach', 'Meshech Hochma']
ay.categories = ['Commentary2', 'Tanach', 'Akeidat Yitzchak']
sl.categories = ['Commentary2', 'Tanach', 'Shney Luchot HaBrit']

mh.save()
ay.save()
sl.save()
