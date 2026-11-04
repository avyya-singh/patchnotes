"""Export synthetic investigation snapshots; never exports local user documents."""

import json, os, tempfile
from pathlib import Path

# Must use an isolated database containing only the committed synthetic fixtures.
os.environ["PATCHNOTES_DATA"] = tempfile.mkdtemp(prefix="patchnotes-export-")
os.environ["PATCHNOTES_MODE"] = "demo"
from backend import store
from backend.seed import INCIDENTS, DOCS
from backend.workflow import baseline
from backend.retrieval import search, MODEL


def main():
    store.init()
    reports = {}
    for i in INCIDENTS:
        docs = search(i["description"] + " " + " ".join(i["logs"]), i["service"])
        evidence = [
            {
                "id": "deployment",
                "title": "Deployment diff",
                "text": f"{i['previous']} → {i['version']}. {i['change']}",
                "type": "deployment",
            },
            {
                "id": "logs",
                "title": "Captured application logs",
                "text": "\n".join(i["logs"]),
                "type": "logs",
            },
        ] + [{**d, "type": "runbook"} for d in docs]
        report = {**baseline({"incident": i, "evidence": evidence}), "mode": "snapshot"}
        reports[i["id"]] = {"report": report, "evidence": evidence}
    output = {
        "version": 1,
        "provenance": {
            "analysis": "Deterministic sample analysis. No language model call.",
            "retrieval": "Precomputed BM25 + pretrained BGE embeddings with RRF",
            "embedding_model": MODEL,
            "data": "Synthetic fixtures only",
        },
        "incidents": INCIDENTS,
        "documents": DOCS,
        "reports": reports,
    }
    path = Path("frontend/public/demo-data.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Exported {len(reports)} synthetic reports to {path}")


if __name__ == "__main__":
    main()
