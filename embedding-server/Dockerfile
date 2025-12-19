FROM python:3.11-slim

WORKDIR /app

# 일반 패키지 먼저 설치
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    sentence-transformers \
    pydantic

# torch는 별도로 CPU 버전 설치
RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu

# 캐시 정리
RUN pip cache purge

COPY embedding_server.py .

EXPOSE 7860

CMD uvicorn embedding_server:app --host 0.0.0.0 --port 7860