def pytest_configure(config):
    import django
    django.setup()
