FROM python:3.13-slim
WORKDIR /srv/backend
COPY backend/requirements.lock.txt .
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY backend/ .
COPY data/ /srv/data/
COPY knowledge/ /srv/knowledge/
RUN useradd --create-home appuser
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--no-proxy-headers"]
