FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
RUN pip install -r requirements.txt
COPY . .

RUN sed -i 's/\r$//' entrypoint.sh \
    && chmod +x entrypoint.sh \
    && useradd --create-home --uid 1000 app \
    && mkdir -p /app/staticfiles \
    && chown -R app:app /app
USER app

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --access-logfile -"]
