# Build context: backend/ (not the repository root).
FROM python:3.13-slim
WORKDIR /srv/backend
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
COPY requirements.lock.txt requirements-runtime.txt ./
RUN pip install --no-cache-dir -r requirements-runtime.txt
COPY app ./app
RUN useradd --create-home appuser
USER appuser
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8080}\" --no-access-log --no-proxy-headers"]
