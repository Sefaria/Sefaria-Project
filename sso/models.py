from django.contrib.auth.models import User
from django.db import models


class SocialIdentity(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="social_identities")
    provider = models.CharField(max_length=50)
    uid = models.CharField(max_length=255)
    email = models.EmailField()
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("provider", "uid")]

    def __str__(self):
        return f"{self.provider}:{self.uid} → user {self.user_id}"
