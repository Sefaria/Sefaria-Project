from __future__ import annotations

import json

from django.core.exceptions import ValidationError
from django.db import models


class ValueType:
    STRING = "string"
    INT = "int"
    BOOL = "bool"
    JSON = "json"

    CHOICES = (
        (STRING, "String"),
        (INT, "Integer"),
        (BOOL, "Boolean"),
        (JSON, "JSON"),
    )


class RemoteConfigEntry(models.Model):
    key = models.CharField(max_length=100, unique=True)
    raw_value = models.TextField(help_text="Stored as text; parsed via value_type.")
    value_type = models.CharField(
        max_length=10,
        choices=ValueType.CHOICES,
        default=ValueType.STRING,
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Remote Config Entry"
        verbose_name_plural = "Remote Config Entries"

    def __str__(self) -> str:
        return self.key

    def parse_value(self):
        """
        Parse raw_value into a Python data type based on value_type.
        """
        if self.value_type == ValueType.STRING:
            return self.raw_value
        if self.value_type == ValueType.INT:
            return int(self.raw_value)
        if self.value_type == ValueType.BOOL:
            return self.raw_value.strip().lower() in ("1", "true", "yes", "on")
        if self.value_type == ValueType.JSON:
            return json.loads(self.raw_value)
        return self.raw_value

    def clean(self):
        """
        Ensure raw_value can be parsed for the configured type so admin users
        receive friendly validation errors.
        """
        super().clean()
        try:
            self.parse_value()
        except (ValueError, json.JSONDecodeError) as exc:
            raise ValidationError({"raw_value": f"Invalid {self.value_type} value: {exc}"})

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        from .cache import reload_cache

        reload_cache()

    def delete(self, *args, **kwargs):
        super().delete(*args, **kwargs)
        from .cache import reload_cache

        reload_cache()
