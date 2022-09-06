"""Delete texts"""

import os
import sys

p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")
os.environ["DJANGO_SETTINGS_MODULE"] = "settings"

from sefaria.system.database import db
from sefaria.texts import delete_text

texts = (
    "Parshat Bereshit",
    "RCA Ketubah Text",
    "Igrot Moshe ",
    "Derashos Maharal miPrague",
    "Sheiltot DeRav Achai",
)

for text in texts:
    delete_text(text)
