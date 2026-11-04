import os, time

os.environ["PATCHNOTES_MODE"] = "demo"
from fastapi.testclient import TestClient
from backend.app import app
from backend import store
from backend.retrieval import search
from backend.workflow import execute


def wait(client, id):
    for _ in range(100):
        r = client.get("/api/runs/" + id).json()
        if r["status"] != "running":
            return r
        time.sleep(0.05)
    raise AssertionError("Run did not finish")


def test_full_approval_and_citations():
    with TestClient(app) as c:
        r = c.post("/api/runs", json={"incident_id": "INC-1042"})
        assert r.status_code == 202
        id = r.json()["id"]
        r = wait(c, id)
        assert r["status"] == "awaiting_approval"
        assert "400" in r["report"]["summary"]
        ids = {e["id"] for e in r["evidence"]}
        assert all(
            f["sources"] and set(f["sources"]) <= ids for f in r["report"]["findings"]
        )
        assert len(r["events"]) >= 4
        assert (
            c.post(
                "/api/runs/" + id + "/decision", json={"decision": "approve"}
            ).status_code
            == 202
        )
        r = wait(c, id)
        assert r["status"] == "completed" and r["decision"] == "approve"
        assert (
            c.post(
                "/api/runs/" + id + "/decision", json={"decision": "approve"}
            ).status_code
            == 409
        )
        assert any(
            a["run_id"] == id and a["effect"] == "simulated_only"
            for a in c.get("/api/audit").json()
        )


def test_insufficient_evidence_and_rejection():
    with TestClient(app) as c:
        id = c.post("/api/runs", json={"incident_id": "INC-1040"}).json()["id"]
        r = wait(c, id)
        assert r["status"] == "completed" and r["report"]["action"] is None
        assert r["report"]["confidence"] == "Insufficient evidence"
        id = c.post("/api/runs", json={"incident_id": "INC-1041"}).json()["id"]
        r = wait(c, id)
        assert r["status"] == "awaiting_approval"
        c.post("/api/runs/" + id + "/decision", json={"decision": "reject"})
        r = wait(c, id)
        assert r["decision"] == "reject"
        assert not any(a["run_id"] == id for a in c.get("/api/audit").json())


def test_scope_upload_validation_and_stream():
    with TestClient(app) as c:
        assert c.post("/api/runs", json={"incident_id": "missing"}).status_code == 404
        assert (
            c.post(
                "/api/runs", json={"incident_id": "INC-1042", "question": "a"}
            ).status_code
            == 422
        )
        assert all(
            d["service"] == "orders-worker"
            for d in search("connection pool inventory", "orders-worker")
        )
        assert (
            c.post(
                "/api/documents",
                data={"service": "bad"},
                files={"file": ("x.txt", b"hello")},
            ).status_code
            == 400
        )
        assert (
            c.post(
                "/api/documents",
                data={"service": "checkout-api"},
                files={"file": ("x.exe", b"hello")},
            ).status_code
            == 400
        )
        d = c.post(
            "/api/documents",
            data={"service": "checkout-api"},
            files={
                "file": (
                    "operator.md",
                    b"Checkout deployment confirmation: inspect payment count.",
                    "text/plain",
                )
            },
        )
        assert d.status_code == 201
        assert any(x["id"] == d.json()["id"] for x in c.get("/api/documents").json())
        id = c.post("/api/runs", json={"incident_id": "INC-1040"}).json()["id"]
        wait(c, id)
        stream = c.get("/api/runs/" + id + "/events")
        assert "event: done" in stream.text and "retrieve_runbooks" in stream.text


def test_checkpoint_survives_new_graph():
    with TestClient(app) as c:
        id = c.post("/api/runs", json={"incident_id": "INC-1042"}).json()["id"]
        r = wait(c, id)
        assert r["status"] == "awaiting_approval"
        # execute creates a fresh graph and SQLite connection each call, like a restarted worker.
        execute(id, "reject")
        assert store.get_run(id)["decision"] == "reject"
