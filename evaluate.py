"""Small synthetic regression benchmark. Not a production accuracy claim."""

import json, os, time, uuid

os.environ["PATCHNOTES_MODE"] = "demo"
from backend import store
from backend.retrieval import search
from backend.workflow import execute


def main():
    store.init()
    results = []
    cases = [
        ("INC-1042", "rb-pool", "Supported hypothesis"),
        ("INC-1041", "rb-retry", "Supported hypothesis"),
        ("INC-1040", "rb-search", "Insufficient evidence"),
    ]
    for id, expected, confidence in cases:
        i = store.get_incident(id)
        t = time.perf_counter()
        hits = search(i["description"] + " " + " ".join(i["logs"]), i["service"])
        rid = uuid.uuid4().hex
        store.save_run(
            {
                "id": rid,
                "incident_id": id,
                "question": "What changed, and what should I check?",
                "status": "running",
            }
        )
        execute(rid)
        r = store.get_run(rid)
        sources = {e["id"] for e in r.get("evidence", [])}
        report = r.get("report", {})
        results.append(
            {
                "incident": id,
                "expected_runbook_in_top4": expected in {d["id"] for d in hits},
                "valid_citation_ids": all(
                    f["sources"] and set(f["sources"]) <= sources
                    for f in report.get("findings", [])
                ),
                "expected_uncertainty": report.get("confidence") == confidence,
                "latency_ms": round((time.perf_counter() - t) * 1000),
            }
        )
    output = {
        "mode": "deterministic demo",
        "cases": len(cases),
        "results": results,
        "note": "Three controlled fixtures; citation ID validity does not measure entailment. No LLM or production data.",
    }
    print(json.dumps(output, indent=2))
    return all(
        x["expected_runbook_in_top4"]
        and x["valid_citation_ids"]
        and x["expected_uncertainty"]
        for x in results
    )


if __name__ == "__main__":
    raise SystemExit(0 if main() else 1)
