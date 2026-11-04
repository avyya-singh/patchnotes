import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const sample = JSON.parse(
  fs.readFileSync(new URL("../public/demo-data.json", import.meta.url), "utf8"),
);
const source = fs
  .readFileSync(new URL("../src/demo.ts", import.meta.url), "utf8")
  .replace("import.meta.env.VITE_PUBLIC_DEMO", "'true'");
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const adapter = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
function browser() {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}
globalThis.localStorage = browser();
globalThis.fetch = async (url) => {
  assert.equal(url, "/demo-data.json");
  return { ok: true, json: async () => structuredClone(sample) };
};
const post = (body) => ({ method: "POST", body: JSON.stringify(body) });
test("public demo runs entirely from synthetic data and browser-local state", async () => {
  assert.equal(adapter.PUBLIC_DEMO, true);
  const health = await adapter.demoApi("/health");
  assert.equal(health.mode, "snapshot");
  const r = await adapter.demoApi(
    "/runs",
    post({ incident_id: "INC-1042", question: "arbitrary text" }),
  );
  assert.equal(r.status, "awaiting_approval");
  assert.equal(r.report.mode, "snapshot");
  assert.notEqual(r.question, "arbitrary text");
  assert(
    r.evidence.some((x) => x.embedding_model === "BAAI/bge-small-en-v1.5"),
  );
  assert.equal((await adapter.demoApi("/runs")).length, 1);
  const approved = await adapter.demoApi(
    "/runs/" + r.id + "/decision",
    post({ decision: "approve" }),
  );
  assert.equal(approved.decision, "approve");
  assert.equal(approved.status, "completed");
  await assert.rejects(
    () =>
      adapter.demoApi(
        "/runs/" + r.id + "/decision",
        post({ decision: "approve" }),
      ),
    /already/,
  );
  const firstBrowser = globalThis.localStorage;
  globalThis.localStorage = browser();
  assert.equal((await adapter.demoApi("/runs")).length, 0);
  await assert.rejects(() => adapter.demoApi("/runs/" + r.id), /not found/);
  globalThis.localStorage = firstBrowser;
  const unknown = await adapter.demoApi(
    "/runs",
    post({ incident_id: "INC-1040" }),
  );
  assert.equal(unknown.report.confidence, "Insufficient evidence");
  assert.equal(unknown.report.action, null);
  await assert.rejects(
    () => adapter.demoApi("/documents", { method: "POST" }),
    /local Python/,
  );
  adapter.clearDemoHistory();
  assert.equal((await adapter.demoApi("/runs")).length, 0);
});
