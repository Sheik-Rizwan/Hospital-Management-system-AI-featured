# core/utils/logger.py — Centralized logging configuration
# Extracted from logger_config.py

import logging
import os


def setup_logger(name='whatsapp_webhook', log_file='logs/webhook.log', level=logging.INFO):
    """Create a named logger with file + console handlers."""
    if logging.getLogger(name).hasHandlers():
        return logging.getLogger(name)

    file_formatter = logging.Formatter(
        '%(asctime)s | %(levelname)-7s | %(funcName)-30s | L%(lineno)-4d | %(message)s',
        datefmt='%H:%M:%S'
    )
    console_formatter = logging.Formatter(
        '%(asctime)s | %(levelname)-7s | %(message)s',
        datefmt='%H:%M:%S'
    )

    log_dir = os.path.dirname(log_file)
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir)

    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(file_formatter)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(console_formatter)

    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)

    return logger


# Shared logger instance
logger = setup_logger()
