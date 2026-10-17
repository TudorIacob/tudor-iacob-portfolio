"""Unit tests must never read local production credentials or select live mode."""
import os
from app.core.config import Settings

Settings.model_config['env_file'] = None
for name in Settings.model_fields:
    os.environ.pop(name.upper(), None)
