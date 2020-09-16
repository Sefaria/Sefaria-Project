# Testing

## Requirements

* Mongo connection
* localsettings.py
  Q: What is the barest minimum required
* envvars
  - DJANGO_SETTINGS_MODULE
  - PYTHONPATH
* reader/browsertest/framework/creds.py
* access to postgres
* access to mongo

* Make sure to run the following before trying to import the model

```python
import django
django.setup()
```