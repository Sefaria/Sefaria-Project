# from django.db.models.signals import post_save
# from django.dispatch import receiver
# from django.contrib.auth.models import User
# from .models import UserType

# # Automatically create a user profile when a new User is created
# @receiver(post_save, sender=User)
# def create_user_profile(sender, instance, created, **kwargs):
#     if created:
#         print("UserType created for the new user")
#         UserType.objects.create(user=instance)

# # Automatically save the user profile when the User is saved
# @receiver(post_save, sender=User)
# def save_user_profile(sender, instance, **kwargs):
#     if hasattr(instance, 'usertype'):  # Check if user has an associated UserType
#         instance.usertype.save()