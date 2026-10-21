#!/bin/sh
set -e

echo "Waiting for PostgreSQL at ${POSTGRES_HOST:-localhost}:${POSTGRES_PORT:-5432}..."
python - <<'PY'
import os
import sys
import time

import psycopg

deadline = time.time() + 60
while True:
    try:
        psycopg.connect(
            host=os.environ.get("POSTGRES_HOST", "localhost"),
            port=os.environ.get("POSTGRES_PORT", "5432"),
            dbname=os.environ.get("POSTGRES_DB", "eventplanet"),
            user=os.environ.get("POSTGRES_USER", "eventplanet"),
            password=os.environ.get("POSTGRES_PASSWORD", ""),
            connect_timeout=3,
        ).close()
        break
    except psycopg.OperationalError as exc:
        if time.time() > deadline:
            sys.exit(f"PostgreSQL is not reachable: {exc}")
        time.sleep(1)
PY

echo "Applying migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput

if [ -n "$DJANGO_SUPERUSER_USERNAME" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
    # Fails harmlessly on restarts, when the account already exists.
    python manage.py createsuperuser --noinput \
        || echo "Superuser '$DJANGO_SUPERUSER_USERNAME' was not created (see the message above)."
fi

exec "$@"
