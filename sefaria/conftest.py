def pytest_configure(config):
    import sys
    import django
    sys._called_from_test = True
    django.setup()


def pytest_unconfigure(config):
    import sys
    del sys._called_from_test
