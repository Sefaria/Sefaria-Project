import string
import random
from urllib.parse import urlparse
from django.db import models
from datetime import timedelta
from django.utils import timezone

def generate_short_code(length=6):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

class ShortURL(models.Model):
    original_url = models.URLField()
    code = models.CharField(max_length=10, unique=True)
    short_url = models.URLField(unique=True)  # Full short URL like https://example.com/Xy9Za3
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.short_url}"
    
    def is_expired(self):
        return self.created_at + timedelta(days=150) < timezone.now()

    @staticmethod
    def create_from_original(original_url):
        parsed = urlparse(original_url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        code = generate_short_code()
        short_url = f"{base}/shorturl/{code}"

        # Ensure uniqueness
        while ShortURL.objects.filter(short_url=short_url).exists():
            code = generate_short_code()
            short_url = f"{base}/shorturl/{code}"
        return ShortURL.objects.create(original_url=original_url, short_url=short_url, code=code)

