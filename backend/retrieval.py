"""BM25 + pretrained BGE embeddings, fused by reciprocal rank fusion."""

import hashlib, json, os, re, threading
from functools import lru_cache
from rank_bm25 import BM25Okapi
from . import store


def tokens(text):
    return re.findall(r"[a-z0-9_]+", text.lower())


MODEL = "BAAI/bge-small-en-v1.5"
LOCK = threading.Lock()


@lru_cache(maxsize=1)
def encoder():
    from fastembed import TextEmbedding

    return TextEmbedding(
        model_name=MODEL,
        cache_dir=os.getenv("EMBEDDING_CACHE", str(store.DATA / "models")),
        threads=2,
    )


def embed(texts, query=False):
    prefix = (
        "Represent this sentence for searching relevant passages: " if query else ""
    )
    entries = [prefix + t for t in texts]
    keys = [hashlib.sha256((MODEL + t).encode()).hexdigest() for t in entries]
    with LOCK:
        with store.connect() as c:
            c.execute(
                "CREATE TABLE IF NOT EXISTS embeddings(cache_key TEXT PRIMARY KEY, vector TEXT NOT NULL)"
            )
            cached = {}
            for k in keys:
                row = c.execute(
                    "SELECT vector FROM embeddings WHERE cache_key=?", (k,)
                ).fetchone()
                if row:
                    cached[k] = json.loads(row["vector"])
        missing = [i for i, k in enumerate(keys) if k not in cached]
        if missing:
            vectors = list(encoder().embed([entries[i] for i in missing]))
            with store.connect() as c:
                for i, v in zip(missing, vectors):
                    cached[keys[i]] = v.tolist()
                    c.execute(
                        "INSERT OR IGNORE INTO embeddings VALUES(?,?)",
                        (keys[i], json.dumps(cached[keys[i]])),
                    )
        return [cached[k] for k in keys]


def search(query, service, k=4, method="hybrid"):
    docs = [
        d for d in store.all_items("documents") if d["service"] in (service, "shared")
    ]
    chunks = []
    for d in docs:
        words = d["text"].split()
        for start in range(0, len(words), 140):
            chunks.append(
                {
                    **d,
                    "chunk": start // 140,
                    "text": " ".join(words[start : start + 180]),
                }
            )
    if not chunks:
        return []
    q = tokens(query)
    bm = BM25Okapi([tokens(d["text"]) for d in chunks])
    scores = bm.get_scores(q)
    if method == "bm25":
        return [
            {**chunks[i], "score": float(scores[i]), "retrieval": "bm25"}
            for i in sorted(range(len(chunks)), key=lambda i: scores[i], reverse=True)[
                :k
            ]
        ]
    vectors = embed([d["text"] for d in chunks])
    qv = embed([query], query=True)[0]
    dense = [sum(x * y for x, y in zip(qv, v)) for v in vectors]
    lex_order = sorted(range(len(chunks)), key=lambda i: scores[i], reverse=True)
    vec_order = sorted(range(len(chunks)), key=lambda i: dense[i], reverse=True)
    ranked = []
    for i, d in enumerate(chunks):
        score = (
            dense[i]
            if method == "semantic"
            else 1 / (60 + lex_order.index(i) + 1) + 1 / (60 + vec_order.index(i) + 1)
        )
        ranked.append(
            {
                **d,
                "score": round(float(score), 5),
                "semantic_score": round(float(dense[i]), 4),
                "retrieval": method,
                "embedding_model": MODEL,
            }
        )
    return sorted(ranked, key=lambda x: x["score"], reverse=True)[:k]
