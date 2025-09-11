from django.db import models
from fields.file_fields import GCSImageField

class Plugin(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField()
    url = models.URLField()
    created_at = models.DateTimeField(auto_now_add=True)
    image = GCSImageField(blank=True, null=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "url": self.url,
            "image": self.image.url if self.image else None,
        }

    def __str__(self):
        return self.name