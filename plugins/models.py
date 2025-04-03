from django.db import models
from fields.file_fields import GCSImageField

class Plugin(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField()
    url = models.URLField()
    created_at = models.DateTimeField(auto_now_add=True)
    image = GCSImageField(blank=True, null=True)

    # on create, generate a secret
    def save(self, *args, **kwargs):
        if not self.secret:
            self.secret = self._generate_secret()

        super(Plugin, self).save(*args, **kwargs)

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