import dns.resolver
from sefaria.settings import CELERY_REDIS_URL, CELERY_SENTINEL_HEADLESS_URL, \
    CELERY_REDIS_BROKER_DB_NUM, CELERY_REDIS_RESULT_BACKEND_DB_NUM
from sefaria.settings import CELERY_REDIS_PORT as CPORT


def add_db_num_to_url(url, db_num):
    return url.replace(f':{CPORT}', f':{CPORT}/{db_num}')


if CELERY_SENTINEL_HEADLESS_URL:
    redisdns = dns.resolver.resolve(CELERY_SENTINEL_HEADLESS_URL, 'A')
    addressstring = []
    for res in redisdns.response.answer:
        for item in res.items:
            addressstring.append(f"sentinel://{item.to_text()}:{CPORT}")
    joined_address = ";".join(addressstring)

    # celery config vars
    broker_url = add_db_num_to_url(joined_address, CELERY_REDIS_BROKER_DB_NUM)
    result_backend = add_db_num_to_url(joined_address, CELERY_REDIS_RESULT_BACKEND_DB_NUM)
    result_backend_transport_options = {}
    broker_transport_options = {}
else:
    broker_url = add_db_num_to_url(f"{CELERY_REDIS_URL}:{CPORT}", CELERY_REDIS_BROKER_DB_NUM)
    result_backend = add_db_num_to_url(f"{CELERY_REDIS_URL}:{CPORT}", CELERY_REDIS_RESULT_BACKEND_DB_NUM)
