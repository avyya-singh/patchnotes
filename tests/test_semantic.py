from backend import store
from backend.retrieval import embed, search, MODEL


def test_real_pretrained_vectors_and_paraphrase_retrieval():
    store.init()
    v = embed(["database client connection limit"])[0]
    assert len(v) == 384
    assert 0.95 < sum(x * x for x in v) < 1.05
    pool = search("database is refusing new clients after scaling", "checkout-api", k=2)
    assert {d["id"] for d in pool} >= {"past-pool", "rb-pool"}
    retry = search(
        "requests are being sent again too quickly after throttling",
        "orders-worker",
        k=1,
    )
    assert retry[0]["id"] == "rb-retry"
    assert retry[0]["embedding_model"] == MODEL
    assert retry[0]["semantic_score"] > 0.4


def test_retrieval_modes_and_service_boundary():
    store.init()
    for method in ("bm25", "semantic", "hybrid"):
        hits = search("database connection pool", "checkout-api", method=method)
        assert hits and all(d["service"] == "checkout-api" for d in hits)
        assert all(d["retrieval"] == method for d in hits)
