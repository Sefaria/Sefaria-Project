from django.db import models
from enum import Enum


class PoolType(Enum):
    LIBRARY = "library"
    SHEETS = "voices"  
    TORAH_TAB = "torah_tab"


class TopicPool(models.Model):
    name = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return f"TopicPool('{self.name}')"
