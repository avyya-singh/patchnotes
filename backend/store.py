import json, os, sqlite3
from pathlib import Path
from .seed import INCIDENTS, DOCS

DATA = Path(os.getenv("PATCHNOTES_DATA", "data"))
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / "patchnotes.db"


def connect():
    c = sqlite3.connect(DB, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


def init():
    with connect() as c:
        c.executescript("""CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);""")
        c.executemany(
            "INSERT OR IGNORE INTO incidents VALUES(?,?)",
            [(i["id"], json.dumps(i)) for i in INCIDENTS],
        )
        c.executemany(
            "INSERT OR IGNORE INTO documents VALUES(?,?)",
            [(i["id"], json.dumps(i)) for i in DOCS],
        )


def all_items(table):
    assert table in ("incidents", "documents")
    with connect() as c:
        return [
            json.loads(r["payload"]) for r in c.execute(f"SELECT payload FROM {table}")
        ]


def get_incident(id):
    return next((x for x in all_items("incidents") if x["id"] == id), None)


def save_doc(doc):
    with connect() as c:
        c.execute("INSERT INTO documents VALUES(?,?)", (doc["id"], json.dumps(doc)))


def save_run(run):
    with connect() as c:
        c.execute(
            "INSERT INTO runs(id,incident_id,status,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload",
            (run["id"], run["incident_id"], run["status"], json.dumps(run)),
        )


def get_run(id):
    with connect() as c:
        r = c.execute("SELECT payload FROM runs WHERE id=?", (id,)).fetchone()
        return json.loads(r["payload"]) if r else None


def list_runs():
    with connect() as c:
        return [
            json.loads(r["payload"])
            for r in c.execute(
                "SELECT payload FROM runs ORDER BY created DESC,rowid DESC LIMIT 100"
            )
        ]


def event(id, payload):
    with connect() as c:
        c.execute(
            "INSERT INTO events(run_id,payload) VALUES(?,?)", (id, json.dumps(payload))
        )


def events(id, after=0):
    with connect() as c:
        return [
            {"seq": r["seq"], **json.loads(r["payload"])}
            for r in c.execute(
                "SELECT seq,payload FROM events WHERE run_id=? AND seq>? ORDER BY seq",
                (id, after),
            )
        ]
