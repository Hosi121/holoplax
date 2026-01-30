FROM python:3.10-slim

WORKDIR /app

COPY pyproject.toml ./
COPY metrics_job.py ./

RUN pip install --no-cache-dir psycopg[binary]==3.1.18

CMD ["python", "metrics_job.py"]
