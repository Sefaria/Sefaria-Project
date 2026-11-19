import json
import logging
import logging.config

from sefaria.celery_setup.logging_config import build_logging_config


def emitted_records(capsys):
    return [json.loads(line) for line in capsys.readouterr().err.splitlines() if line.strip()]


def test_celery_task_record_carries_its_severity(capsys):
    logging.config.dictConfig(build_logging_config())
    logging.getLogger("celery.app.trace").info("Task linker.find_refs_api[abc] succeeded in 0.01s")

    records = emitted_records(capsys)
    assert len(records) == 1
    assert records[0]["severity"] == "info"
    assert records[0]["logger"] == "celery.app.trace"
    assert records[0]["event"].startswith("Task linker.find_refs_api[abc] succeeded")


def test_worker_record_carries_no_error_level(capsys):
    logging.config.dictConfig(build_logging_config())
    logging.getLogger("celery.worker").warning("consumer: Cannot connect")

    records = emitted_records(capsys)
    assert len(records) == 1
    assert records[0]["severity"] == "warning"
