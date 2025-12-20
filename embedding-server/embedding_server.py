from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
from sentence_transformers import SentenceTransformer
import torch

# --------------------
# App
# --------------------
app = FastAPI(title="Embedding Server")

# --------------------
# Model (GLOBAL, 1회 로드)
# --------------------
MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
device = "cuda" if torch.cuda.is_available() else "cpu"

model = SentenceTransformer(MODEL_NAME, device=device)

# --------------------
# 🚨 Railway 필수: WARM-UP
# --------------------
model.encode(
    ["돼지고기", "양파", "마늘"],
    batch_size=1,
    normalize_embeddings=True
)

# --------------------
# Schema
# --------------------
class EmbedRequest(BaseModel):
    texts: List[str]

# --------------------
# API
# --------------------
@app.post("/embed")
def embed(req: EmbedRequest):
    # ✔ 안전장치: 짧은 재료명만
    texts = [t[:20] for t in req.texts][:50]

    embeddings = model.encode(
        texts,
        batch_size=1,                 # ⭐ Railway 최적
        normalize_embeddings=True,
        show_progress_bar=False
    )

    return {
        "embeddings": embeddings.tolist(),
        "dim": len(embeddings[0]),
        "count": len(texts),
        "model": MODEL_NAME
    }

# --------------------
# Health Check
# --------------------
@app.get("/")
def health():
    return {"status": "ok", "model": MODEL_NAME}
