ARG RUNTIME_VERSION
FROM python:${RUNTIME_VERSION}-slim-bookworm

ENV PATH=/opt/venv/bin:$PATH
ENV PORT=8000
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN python -m venv /opt/venv \
	&& pip install --no-cache-dir --upgrade pip setuptools wheel \
	&& groupadd --gid 10001 app \
	&& useradd --uid 10001 --gid app --create-home app \
	&& chown -R app:app /app /opt/venv

USER app
EXPOSE 8000

CMD ["python", "app.py"]
