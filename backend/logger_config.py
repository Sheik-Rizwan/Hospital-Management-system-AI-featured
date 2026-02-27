import logging
import os

def setup_logger(name='whatsapp_webhook', log_file='logs/webhook.log', level=logging.INFO):
    """Function to setup as many loggers as you want"""
    
    # Check if logger already exists
    if logging.getLogger(name).hasHandlers():
        return logging.getLogger(name)

    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    
    # Ensure logs directory exists
    log_dir = os.path.dirname(log_file)
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir)
    
    # File Handler
    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(formatter)

    # Stream Handler (Console)
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)

    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)

    return logger

# Create a shared logger instance
logger = setup_logger()
