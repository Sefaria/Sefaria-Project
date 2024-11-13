from django.db import models
from enum import Enum


class PoolType(Enum):
    TEXTUAL = "textual"
    SHEETS = "sheets"
    PROMOTED = "promoted"


class TopicPool(models.Model):
    name = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return f"TopicPool('{self.name}')"
