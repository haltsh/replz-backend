FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn==0.24.0 \
    sentence-transformers==2.2.2 \
    pydantic==2.6.0 && \
    pip install torch --index-url https://download.pytorch.org/whl/cpu && \
    pip cache purge && \
    rm -rf /root/.cache

COPY embedding_server.py .

EXPOSE 7860

CMD uvicorn embedding_server:app --host 0.0.0.0 --port 7860