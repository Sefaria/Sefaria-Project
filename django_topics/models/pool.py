from enum import Enum

from django.db import models


class PoolType(Enum):
    LIBRARY = "library"
    SHEETS = "sheets"
    TORAH_TAB = "torah_tab"
    GENERAL_EN = "general_en"
    GENERAL_HE = "general_he"


class TopicPool(models.Model):
    name = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return f"TopicPool('{self.name}')"
