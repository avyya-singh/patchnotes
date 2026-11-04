// The public deployment is static. No uploads, API keys, paid calls, or shared server state.
// Each visitor's simulation history stays in their own browser.
export const PUBLIC_DEMO = import.meta.env.VITE_PUBLIC_DEMO === "true";
type DemoRun = {
  id: string;
  incident_id: string;
  question: string;
  status: string;
  report: any;
  evidence: any[];
  events: any[];
  decision?: string;
};
let bundlePromise: Promise<any> | null = null;
const KEY = "patchnotes-public-history-v1";
async function bundle() {
  return (bundlePromise ??= fetch("/demo-data.json").then((r) => {
    if (!r.ok) throw Error("Could not load sample investigations");
    return r.json();
  }));
}
function history(): DemoRun[] {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(r) ? r.slice(0, 30) : [];
  } catch {
    return [];
  }
}
function save(r: DemoRun) {
  try {
    const rows = history().filter((x) => x.id !== r.id);
    localStorage.setItem(KEY, JSON.stringify([r, ...rows].slice(0, 30)));
  } catch {
    throw Error(
      "Browser storage is unavailable. Allow site storage to save this simulation.",
    );
  }
}
export async function demoApi<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const b = await bundle();
  let result: any;
  const body =
    typeof options?.body === "string" ? JSON.parse(options.body) : {};
  if (url === "/health")
    result = {
      status: "ok",
      mode: "snapshot",
      retrieval: "Precomputed BM25 + BGE embeddings",
      external_actions: false,
    };
  else if (url === "/incidents") result = b.incidents;
  else if (url === "/documents" && !options?.method) result = b.documents;
  else if (url === "/documents")
    throw Error("Uploads are available in the local Python application only.");
  else if (url === "/runs" && options?.method === "POST") {
    const preset = b.reports[body.incident_id];
    if (!preset) throw Error("Sample incident not found");
    const r: DemoRun = {
      id: crypto.randomUUID(),
      incident_id: body.incident_id,
      question: "What changed, and what should I check?",
      status: preset.report.action ? "awaiting_approval" : "completed",
      report: structuredClone(preset.report),
      evidence: structuredClone(preset.evidence),
      events: [
        {
          seq: 1,
          node: "snapshot",
          detail:
            "Loaded precomputed sample analysis; no live agent or model call.",
        },
        {
          seq: 2,
          node: "retrieval",
          detail:
            "Sources retrieved offline using BM25 + pretrained BGE embeddings.",
        },
      ],
    };
    save(r);
    result = r;
  } else if (url === "/runs") result = history();
  else if (/^\/runs\/[^/]+\/decision$/.test(url)) {
    const id = url.split("/")[2];
    const r = history().find((x) => x.id === id);
    if (!r) throw Error("Run not found in this browser");
    if (r.status !== "awaiting_approval")
      throw Error("This simulation has already been reviewed");
    if (!["approve", "reject"].includes(body.decision))
      throw Error("Invalid decision");
    r.decision = body.decision;
    r.status = "completed";
    r.events.push({
      seq: r.events.length + 1,
      node: body.decision === "approve" ? "simulate_action" : "reject_action",
      detail:
        body.decision === "approve"
          ? "Approval recorded in this browser. No infrastructure changed."
          : "Declined. No action taken.",
    });
    save(r);
    result = r;
  } else if (/^\/runs\/[^/]+$/.test(url)) {
    result = history().find((r) => r.id === url.split("/")[2]);
    if (!result) throw Error("Run not found in this browser");
  } else
    throw Error("This feature is available in the local Python application.");
  return structuredClone(result) as T;
}
export function clearDemoHistory() {
  localStorage.removeItem(KEY);
}
