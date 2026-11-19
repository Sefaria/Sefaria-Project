"""Logging for the Celery worker.

The worker starts outside Django, so it never installs the structlog JSON handler the web and
name pods use. Celery logs plain text to stderr, the log pipeline finds no level in those lines,
and it files every successful task completion as an error. Connecting `configure_logging` to
celery's setup_logging signal makes each worker record carry `severity`, like the web records.
"""

import logging.config

import structlog

from sefaria.system.logging import add_severity, log_exception_info


def build_logging_config():
    """Return the dictConfig that sends the worker's records through one JSON handler."""
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json_formatter": {
                "()": structlog.stdlib.ProcessorFormatter,
                "processor": structlog.processors.JSONRenderer(),
                # Records from plain stdlib loggers arrive without an event_dict, so they
                # need their own level and timestamp for the log pipeline to classify them.
                "foreign_pre_chain": [
                    structlog.processors.TimeStamper(fmt="iso"),
                    structlog.stdlib.add_logger_name,
                    add_severity,
                ],
            },
        },
        "handlers": {
            "json": {
                "class": "logging.StreamHandler",
                "formatter": "json_formatter",
            },
        },
        "loggers": {
            "": {"handlers": ["json"], "level": "INFO", "propagate": False},
            # Celery gives this logger its own console handler and propagate False.
            "celery": {"handlers": ["json"], "level": "INFO", "propagate": False},
        },
    }


def configure_logging(**_kwargs):
    """celery.signals.setup_logging receiver: replace celery's plain-text logging setup."""
    logging.config.dictConfig(build_logging_config())
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.stdlib.add_logger_name,
            add_severity,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.StackInfoRenderer(),
            log_exception_info,
            structlog.processors.UnicodeDecoder(),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
