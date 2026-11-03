FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/lemma
COPY requirements.txt ./
RUN pip install --no-cache-dir torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu && pip install --no-cache-dir -r requirements.txt
COPY . /opt/lemma/
ENV PYTHONPATH=/opt/lemma PYTHONDONTWRITEBYTECODE=1 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TOKENIZERS_PARALLELISM=false OMP_NUM_THREADS=1
RUN useradd --uid 10001 --create-home lemma && chown -R lemma:lemma /opt/lemma
USER lemma
CMD ["sh", "-c", "exec celery -A scripts.lemma_search_celery worker -Q \"$LEMMA_SEARCH_QUEUE\" --concurrency=1 --loglevel=INFO"]
