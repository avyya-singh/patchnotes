import pytest
from backend import store
from backend.workflow import analyze


def test_model_report_uses_generated_fields_and_validates_sources(monkeypatch):
    import langchain_ollama

    class Fake:
        def __init__(self, **kwargs):
            pass

        def with_structured_output(self, schema):
            self.schema = schema
            return self

        def invoke(self, messages):
            assert "untrusted" in messages[0][1].lower()
            return self.schema(
                headline="Model-generated headline",
                summary="A generated synthesis.",
                findings=[
                    {"text": "Release changed the pool.", "sources": ["deployment"]}
                ],
                confidence="Supported hypothesis",
                steps=["Check active database clients."],
                suggest_rollback=True,
            )

    monkeypatch.setattr(langchain_ollama, "ChatOllama", Fake)
    monkeypatch.setenv("PATCHNOTES_MODE", "ollama")
    store.init()
    state = {
        "run_id": "model-unit-test",
        "incident": store.get_incident("INC-1042"),
        "question": "What changed?",
        "evidence": [
            {
                "id": "deployment",
                "title": "Deployment diff",
                "text": "pool increased",
                "type": "deployment",
            },
            {"id": "rb-pool", "text": "runbook"},
        ],
    }
    report = analyze(state)["report"]
    assert report["headline"] == "Model-generated headline"
    assert report["steps"] == ["Check active database clients."]
    state["incident"] = store.get_incident("INC-1040")
    report = analyze(state)["report"]
    assert report["action"] is None
    assert report["confidence"] == "Insufficient evidence"
    state["evidence"] = []
    with pytest.raises(ValueError, match="citation"):
        analyze(state)
