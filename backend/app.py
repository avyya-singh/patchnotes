import asyncio, io, json, os, uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from . import store
from .workflow import execute

# One worker serializes graph writes in this local SQLite deployment.
pool = ThreadPoolExecutor(max_workers=1)


@asynccontextmanager
async def lifespan(app):
    global pool
    pool = ThreadPoolExecutor(max_workers=1)
    store.init()
    # Recover queued/interrupted work after restart; checkpointed approvals are retained.
    for r in store.list_runs():
        if r["status"] == "running":
            r.update(
                status="failed",
                error="Server restarted during this investigation. Start a new run.",
            )
            store.save_run(r)
    yield
    pool.shutdown(wait=True)


app = FastAPI(title="PatchNotes", version="0.1.0", lifespan=lifespan)


class RunInput(BaseModel):
    incident_id: str
    question: str = Field(
        default="What changed, and what should I check?", min_length=3, max_length=2000
    )


class Decision(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "mode": os.getenv("PATCHNOTES_MODE", "demo"),
        "orchestration": "LangGraph",
        "storage": "SQLite",
        "retrieval": "BM25 + BGE-small pretrained embeddings (RRF)",
        "external_actions": False,
    }


@app.get("/api/incidents")
def incidents():
    return store.all_items("incidents")


@app.get("/api/documents")
def documents():
    return store.all_items("documents")


@app.post("/api/documents", status_code=201)
async def upload(service: str = Form(...), file: UploadFile = File(...)):
    if service not in {i["service"] for i in store.all_items("incidents")}:
        raise HTTPException(400, "Choose an existing service")
    name = Path(file.filename or "document").name
    if Path(name).suffix.lower() not in (".txt", ".md", ".pdf"):
        raise HTTPException(400, "Use .txt, .md or .pdf")
    data = await file.read(2_000_001)
    if len(data) > 2_000_000:
        raise HTTPException(413, "Maximum file size is 2 MB")
    try:
        if name.lower().endswith(".pdf"):
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(data))
            text = "\n".join(
                f"Page {n + 1}: {p.extract_text() or ''}"
                for n, p in enumerate(reader.pages[:60])
            )
        else:
            text = data.decode("utf-8")
    except Exception:
        raise HTTPException(
            400,
            "Could not read this document; use an unencrypted text PDF or UTF-8 text",
        )
    if not text.strip():
        raise HTTPException(400, "No readable text found")
    if len(text) > 150_000:
        raise HTTPException(413, "Extracted text exceeds 150,000 characters")
    doc = {
        "id": "doc-" + uuid.uuid4().hex[:12],
        "title": name,
        "service": service,
        "text": text,
    }
    store.save_doc(doc)
    return doc


@app.get("/api/runs")
def runs():
    return store.list_runs()


@app.post("/api/runs", status_code=202)
def start(body: RunInput):
    if not store.get_incident(body.incident_id):
        raise HTTPException(404, "Incident not found")
    active = sum(r["status"] == "running" for r in store.list_runs())
    if active >= 5:
        raise HTTPException(429, "Investigation queue full; wait for an active run")
    run = {
        "id": uuid.uuid4().hex,
        "incident_id": body.incident_id,
        "question": body.question,
        "status": "running",
        "report": None,
        "evidence": [],
    }
    store.save_run(run)
    pool.submit(execute, run["id"])
    return run


@app.get("/api/runs/{id}")
def get_run(id: str):
    r = store.get_run(id)
    if not r:
        raise HTTPException(404, "Run not found")
    return {**r, "events": store.events(id)}


@app.post("/api/runs/{id}/decision", status_code=202)
def decide(id: str, body: Decision):
    # Compare-and-set avoids duplicate approval requests racing.
    with store.connect() as c:
        c.execute("BEGIN IMMEDIATE")
        row = c.execute("SELECT payload FROM runs WHERE id=?", (id,)).fetchone()
        if not row:
            raise HTTPException(404, "Run not found")
        r = json.loads(row["payload"])
        if r["status"] != "awaiting_approval":
            raise HTTPException(409, "This run is not awaiting approval")
        r["status"] = "running"
        c.execute(
            "UPDATE runs SET status=?,payload=? WHERE id=?",
            ("running", json.dumps(r), id),
        )
    pool.submit(execute, id, body.decision)
    return r


@app.get("/api/runs/{id}/events")
async def stream(id: str, after: int = 0):
    if not store.get_run(id):
        raise HTTPException(404, "Run not found")

    async def gen():
        cursor = after
        while True:
            for e in store.events(id, cursor):
                cursor = e["seq"]
                yield f"id: {cursor}\ndata: {json.dumps(e)}\n\n"
            r = store.get_run(id)
            if r["status"] != "running":
                yield f"event: done\ndata: {json.dumps({'status': r['status']})}\n\n"
                break
            yield ": heartbeat\n\n"
            await asyncio.sleep(0.4)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/audit")
def audit():
    with store.connect() as c:
        return [
            {"run_id": r["run_id"], "created": r["created"], **json.loads(r["payload"])}
            for r in c.execute("SELECT * FROM actions ORDER BY created DESC")
        ]


FRONT = Path(__file__).resolve().parents[1] / "frontend" / "dist"
if FRONT.exists():
    app.mount("/assets", StaticFiles(directory=FRONT / "assets"), name="assets")

    @app.get("/")
    def frontend():
        return FileResponse(FRONT / "index.html")
