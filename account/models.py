from django.db import models

from django.contrib.auth.models import User


class UserType(models.Model):
    USER_TYPE_CHOICES = [
        ('Monastic', 'Monastic'),
        ('Teacher', 'Teacher'),
        ('Student', 'Student'),
        ('Educated* /Dr / Prof', 'Educated* /Dr / Prof'),
        ('regular user', 'regular user'),
    ]
    
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    user_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES)

    def __str__(self):
        return f"{self.user.username} - {self.user_type}"