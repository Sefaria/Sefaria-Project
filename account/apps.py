from django.apps import AppConfig

class AccountsConfig(AppConfig):
    name = 'account'  # The name of your app

    # def ready(self):
    #     import account.signal  # Import the signals