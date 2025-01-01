from django.db import models
from fields.encrypted import EncryptedCharField
from cryptography.fernet import Fernet
from fields.file_fields import GCSImageField

class Plugin(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField()
    url = models.URLField()
    secret = EncryptedCharField(max_length=100)
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

    def _generate_secret(self):
        key = Fernet.generate_key()
        return key.decode('utf-8')
    
    def __str__(self):
        return self.name
