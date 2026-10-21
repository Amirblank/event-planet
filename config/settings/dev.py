"""Local development: debug on, permissive defaults."""

from .base import *  # noqa: F401,F403
from .base import env_list

DEBUG = True

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "insecure-development-key")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]")
CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000"
)

LOGGING["root"]["level"] = os.environ.get("DJANGO_LOG_LEVEL", "DEBUG")  # noqa: F405
