import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  Database,
  FileText,
  GitBranch,
  Layers,
  Loader2,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Upload,
  X,
  Zap,
} from "lucide-react";
import "./style.css";
import { PUBLIC_DEMO, demoApi, clearDemoHistory } from "./demo";
type Incident = {
  id: string;
  title: string;
  service: string;
  severity: string;
  status: string;
  time: string;
  description: string;
  version: string;
  previous: string;
  metric: string;
  metric_label: string;
  delta: string;
  events: string[][];
  logs: string[];
  change: string;
};
type Evidence = {
  id: string;
  title: string;
  text: string;
  type?: string;
  service?: string;
  score?: number;
};
type Report = {
  headline: string;
  summary: string;
  confidence: string;
  mode: string;
  findings: { text: string; sources: string[] }[];
  steps: string[];
  action: null | { label: string; target: string; type: string };
};
type Run = {
  id: string;
  incident_id: string;
  question: string;
  status: string;
  report: Report | null;
  evidence: Evidence[];
  error?: string;
  decision?: string;
  events?: {
    seq: number;
    node: string;
    detail: string;
    duration_ms?: number;
  }[];
};
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  if (PUBLIC_DEMO) return demoApi<T>(url, options);
  const r = await fetch("/api" + url, options);
  if (!r.ok) {
    const e = await r.json().catch(() => ({ detail: "Request failed" }));
    throw Error(e.detail || "Request failed");
  }
  return r.json();
}
const post = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
function App() {
  const [incidents, setIncidents] = useState<Incident[]>([]),
    [selected, setSelected] = useState("INC-1042"),
    [page, setPage] = useState("Incidents"),
    [tab, setTab] = useState("Overview"),
    [run, setRun] = useState<Run | null>(null),
    [runs, setRuns] = useState<Run[]>([]),
    [docs, setDocs] = useState<Evidence[]>([]),
    [source, setSource] = useState<Evidence | null>(null),
    [question, setQuestion] = useState(
      "What changed, and what should I check?",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState(""),
    [health, setHealth] = useState<{ mode: string } | null>(null),
    [service, setService] = useState("checkout-api"),
    [uploading, setUploading] = useState(false);
  const stream = useRef<EventSource | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const incident = incidents.find((i) => i.id === selected);
  const working = run?.status === "running";
  useEffect(() => {
    Promise.all([
      api<Incident[]>("/incidents"),
      api<Run[]>("/runs"),
      api<Evidence[]>("/documents"),
      api<{ mode: string }>("/health"),
    ])
      .then(([i, r, d, h]) => {
        setIncidents(i);
        setRuns(r);
        setDocs(d);
        setHealth(h);
        const saved = r.find((x) => x.incident_id === "INC-1042");
        if (saved)
          api<Run>("/runs/" + saved.id)
            .then(setRun)
            .catch((e) => setError(e.message));
      })
      .catch((e) => setError(e.message));
    return () => stream.current?.close();
  }, []);
  useEffect(() => {
    if (PUBLIC_DEMO || !run || run.status !== "running") return;
    const id = run.id;
    const es = new EventSource("/api/runs/" + id + "/events");
    stream.current = es;
    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      setRun((r) =>
        r?.id === id
          ? {
              ...r,
              events: [
                ...(r.events || []).filter((x) => x.seq !== event.seq),
                event,
              ],
            }
          : r,
      );
    };
    const finish = () => {
      es.close();
      api<Run>("/runs/" + id)
        .then((r) => {
          setRun(r);
          api<Run[]>("/runs").then(setRuns);
        })
        .catch((e) => setError(e.message));
    };
    es.addEventListener("done", finish);
    es.onerror = finish;
    return () => es.close();
  }, [run?.id, run?.status]);
  useEffect(() => {
    if (PUBLIC_DEMO || !run || run.status !== "running") return;
    const id = run.id;
    const timer = setInterval(() => {
      api<Run>("/runs/" + id)
        .then((r) => {
          if (r.status !== "running") {
            setRun(r);
            api<Run[]>("/runs").then(setRuns);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [run?.id, run?.status]);
  useEffect(() => {
    if (!source) return;
    const before = document.activeElement as HTMLElement | null;
    const modal = document.querySelector(".source-modal") as HTMLElement | null;
    const close = modal?.querySelector("button");
    close?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSource(null);
      if (e.key === "Tab" && modal) {
        const list = Array.from(
          modal.querySelectorAll<HTMLElement>(
            'button,a[href],input,select,textarea,[tabindex="0"]',
          ),
        );
        if (list.length === 1) {
          e.preventDefault();
          list[0].focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, [source]);
  function choose(id: string) {
    if (working) return;
    setSelected(id);
    const previous = runs.find((r) => r.incident_id === id);
    setRun(previous || null);
    if (previous)
      api<Run>("/runs/" + previous.id)
        .then(setRun)
        .catch((e) => setError(e.message));
    setTab("Overview");
    setError("");
  }
  async function investigate() {
    setBusy(true);
    setError("");
    try {
      const r = await api<Run>(
        "/runs",
        post({ incident_id: selected, question }),
      );
      setRun(r);
      setRuns(await api<Run[]>("/runs"));
      setTab("Investigation");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function decision(value: string) {
    if (!run) return;
    setBusy(true);
    try {
      setRun(
        await api<Run>(
          "/runs/" + run.id + "/decision",
          post({ decision: value }),
        ),
      );
      setRuns(await api<Run[]>("/runs"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(f: File) {
    setUploading(true);
    setError("");
    const data = new FormData();
    data.append("service", service);
    data.append("file", f);
    try {
      await api("/documents", { method: "POST", body: data });
      setDocs(await api<Evidence[]>("/documents"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }
  function cite(id: string) {
    const s = run?.evidence.find((e) => e.id === id);
    if (s) setSource(s);
  }
  const nav = [
    { name: "Incidents", icon: Activity },
    { name: "Knowledge", icon: BookOpen },
    { name: "Run history", icon: Clock3 },
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Incidents");
          }}
        >
          <span className="brand-mark">
            <GitBranch size={21} />
          </span>
          patchnotes<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-logo">A</span>
          <div>
            Avyya’s workspace
            <small>{PUBLIC_DEMO ? "Public demo" : "Personal project"}</small>
          </div>
          <ChevronDown size={13} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={page === name ? "active" : ""}
              onClick={() => setPage(name)}
            >
              <Icon size={17} />
              {name}
              {name === "Incidents" && <span className="nav-count">3</span>}
            </button>
          ))}
        </nav>
        <div className="nav-label service-label">SAMPLE SERVICES</div>
        {["checkout-api", "orders-worker", "search-api"].map((s) => (
          <button
            className="service"
            key={s}
            onClick={() => {
              setPage("Incidents");
              choose(incidents.find((i) => i.service === s)?.id || selected);
            }}
          >
            <span
              className={
                "service-dot " + (s === "checkout-api" ? "red" : "yellow")
              }
            />
            {s}
            <ChevronRight size={12} />
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="local-status">
            <span />
            {PUBLIC_DEMO ? "Browser-local history" : "Local workspace"}
          </div>
          <div className="user">
            <span>AS</span>
            <div>
              Avyya Singh<small>Workspace owner</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <div>
            <span className="crumb">Workspace</span>
            <ChevronRight size={13} />
            <span>{page}</span>
          </div>
          <div className="header-right">
            <span className="demo-pill">
              <Box size={12} />
              {PUBLIC_DEMO
                ? "Interactive sample"
                : health?.mode === "ollama"
                  ? "Local model"
                  : "Demo environment"}
            </span>
            <span className="avatar-small">AS</span>
          </div>
        </header>
        <main>
          {PUBLIC_DEMO && (
            <div className="public-notice">
              <Box size={16} />
              <div>
                <b>Interactive portfolio demo</b>
                <span>
                  Sample analyses, precomputed semantic retrieval. No live AI
                  calls. Your simulation history stays in this browser.
                </span>
              </div>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {page === "Incidents" && (
            <>
              <div className="page-title">
                <div>
                  <div className="eyebrow">YOUR OPERATIONS, IN CONTEXT</div>
                  <h1>Incident workspace</h1>
                  <p>
                    From alert to understanding. Bring the evidence together.
                  </p>
                </div>
                <div className="live">
                  <span />3 sample services{" "}
                  <span className="muted">· synthetic data</span>
                </div>
              </div>
              <div className="stats">
                <div>
                  <span>Open incidents</span>
                  <b>
                    03 <small>across 3 services</small>
                  </b>
                  <Activity size={18} />
                </div>
                <div>
                  <span>Needs attention</span>
                  <b>
                    01 <small className="red-text">high severity</small>
                  </b>
                  <Zap size={18} />
                </div>
                <div>
                  <span>Knowledge sources</span>
                  <b>
                    {String(docs.length).padStart(2, "0")}{" "}
                    <small>runbooks & documents</small>
                  </b>
                  <BookOpen size={18} />
                </div>
                <div>
                  <span>Investigations</span>
                  <b>
                    {String(runs.length).padStart(2, "0")}{" "}
                    <small>saved locally</small>
                  </b>
                  <GitBranch size={18} />
                </div>
              </div>
              <div className="incident-layout">
                <aside className="incident-list">
                  <div className="list-title">
                    <h2>
                      Incidents <span>3</span>
                    </h2>
                    <span className="list-caption">LATEST FIRST</span>
                  </div>
                  <label className="search">
                    <Search size={14} />
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Search incidents…"
                      aria-label="Search incidents"
                    />
                  </label>
                  {incidents
                    .filter((i) =>
                      (i.title + i.service + i.id)
                        .toLowerCase()
                        .includes(filter.toLowerCase()),
                    )
                    .map((i) => (
                      <button
                        className={
                          "incident-item " +
                          (i.id === selected ? "selected" : "")
                        }
                        key={i.id}
                        onClick={() => choose(i.id)}
                        disabled={!!working}
                      >
                        <div>
                          <span
                            className={
                              "severity " +
                              (i.severity === "SEV 1" ? "sev1" : "sev2")
                            }
                          >
                            {i.severity}
                          </span>
                          <span className="incident-time">{i.time}</span>
                        </div>
                        <h3>{i.title}</h3>
                        <p>
                          <span className="tiny-dot" />
                          {i.service}
                        </p>
                        <div className="incident-meta">
                          <span>{i.id}</span>
                          <span>
                            <span className="open-dot" />
                            Open
                          </span>
                        </div>
                      </button>
                    ))}
                  <div className="list-foot">
                    <ShieldCheck size={14} />
                    <span>
                      Controlled incidents.
                      <br />
                      Safe to investigate.
                    </span>
                  </div>
                </aside>
                <section className="incident-detail">
                  {incident ? (
                    <>
                      <div className="detail-header">
                        <div className="detail-meta">
                          <span
                            className={
                              "severity " +
                              (incident.severity === "SEV 1" ? "sev1" : "sev2")
                            }
                          >
                            {incident.severity}
                          </span>
                          <span>{incident.id}</span>
                          <span>•</span>
                          <span className="status-open">Open</span>
                        </div>
                        <h2>{incident.title}</h2>
                        <p>
                          <Box size={13} />
                          {incident.service}
                          <span>·</span>
                          <GitBranch size={13} />
                          {incident.version}
                          <span>·</span>
                          <Clock3 size={13} />
                          Detected at {incident.time}
                        </p>
                      </div>
                      <div className="tabs">
                        {["Overview", "Investigation", "Activity"].map((t) => (
                          <button
                            onClick={() => setTab(t)}
                            className={t === tab ? "active" : ""}
                            key={t}
                          >
                            {t}
                            {t === "Investigation" && run && (
                              <span className="tab-dot" />
                            )}
                          </button>
                        ))}
                      </div>
                      {tab === "Overview" && (
                        <div className="overview">
                          <div className="signal-row">
                            <div>
                              <span className="label">
                                {incident.metric_label.toUpperCase()}
                              </span>
                              <b>
                                {incident.metric}
                                <small>{incident.delta}</small>
                              </b>
                              <span>at time of capture</span>
                            </div>
                            <div
                              className="sparkline"
                              aria-label="Illustrative incident trend"
                            >
                              <svg viewBox="0 0 300 65">
                                <defs>
                                  <linearGradient
                                    id="area"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                  >
                                    <stop
                                      stopColor="#ec7766"
                                      stopOpacity=".2"
                                    />
                                    <stop
                                      offset="1"
                                      stopColor="#ec7766"
                                      stopOpacity="0"
                                    />
                                  </linearGradient>
                                </defs>
                                <path
                                  d="M0 52 30 50 45 53 63 50 80 51 100 49 122 50 135 45 148 48 157 30 169 33 180 13 190 19 202 7 215 12 230 5 248 10 265 3 280 8 300 5V65H0Z"
                                  fill="url(#area)"
                                />
                                <path
                                  d="M0 52 30 50 45 53 63 50 80 51 100 49 122 50 135 45 148 48 157 30 169 33 180 13 190 19 202 7 215 12 230 5 248 10 265 3 280 8 300 5"
                                  fill="none"
                                  stroke="#e88778"
                                  strokeWidth="2"
                                />
                              </svg>
                              <span>
                                Illustrative trend · synthetic scenario
                              </span>
                            </div>
                          </div>
                          <div className="summary-block">
                            <h3>What we know</h3>
                            <p>{incident.description}</p>
                          </div>
                          <div className="ai-launch">
                            <span className="launch-icon">
                              <Sparkles size={21} />
                            </span>
                            <div>
                              <h3>
                                {PUBLIC_DEMO
                                  ? "Explore the investigation."
                                  : "Let’s connect the dots."}
                              </h3>
                              <p>
                                {PUBLIC_DEMO
                                  ? "Open the sample report and inspect its supporting evidence."
                                  : "Inspect changes, search runbooks, and follow the evidence."}
                              </p>
                              <div className="tool-chips">
                                <span>
                                  <GitBranch size={11} />
                                  Deployments
                                </span>
                                <span>
                                  <Terminal size={11} />
                                  Logs
                                </span>
                                <span>
                                  <BookOpen size={11} />
                                  Runbooks
                                </span>
                              </div>
                            </div>
                            <button
                              className="primary"
                              onClick={investigate}
                              disabled={busy || !!working}
                            >
                              {working ? (
                                <Loader2 className="spin" size={14} />
                              ) : (
                                <Sparkles size={14} />
                              )}
                              {PUBLIC_DEMO ? "Explore sample" : "Investigate"}
                              <ArrowRight size={14} />
                            </button>
                          </div>
                          <label className="question-label">
                            {PUBLIC_DEMO
                              ? "SAMPLE INVESTIGATION QUESTION"
                              : "INVESTIGATION QUESTION"}
                            <textarea
                              readOnly={PUBLIC_DEMO}
                              value={question}
                              maxLength={2000}
                              onChange={(e) => setQuestion(e.target.value)}
                              aria-label="Investigation question"
                            />
                          </label>
                          <div className="timeline-title">
                            <h3>Incident timeline</h3>
                            <span>
                              {incident.events.length} captured events
                            </span>
                          </div>
                          <div className="timeline">
                            {incident.events.map(([time, type, desc], n) => (
                              <div key={time + type}>
                                <span className="time">{time}</span>
                                <span
                                  className={
                                    "timeline-icon " +
                                    (n === 2 ? "alert-icon" : "")
                                  }
                                >
                                  {n === 0 ? (
                                    <GitBranch size={12} />
                                  ) : n === 2 ? (
                                    <Zap size={12} />
                                  ) : (
                                    <Activity size={12} />
                                  )}
                                </span>
                                <div>
                                  <b>{type}</b>
                                  <p>{desc}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {tab === "Investigation" && (
                        <div className="investigation">
                          {!run ? (
                            <div className="empty">
                              <Sparkles size={30} />
                              <h3>Start with the evidence.</h3>
                              <p>
                                Run an investigation to inspect deployment
                                changes,
                                <br />
                                logs, and matching runbooks.
                              </p>
                              <button
                                className="primary"
                                onClick={investigate}
                                disabled={busy}
                              >
                                Start investigation
                                <ArrowRight size={14} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="run-banner">
                                <div>
                                  <span
                                    className={
                                      "status-icon " +
                                      (working ? "running" : "")
                                    }
                                  >
                                    {working ? (
                                      <Loader2 className="spin" size={16} />
                                    ) : (
                                      <CheckCircle2 size={16} />
                                    )}
                                  </span>
                                  <div>
                                    <b>
                                      {working
                                        ? "Investigating…"
                                        : run.status === "awaiting_approval"
                                          ? PUBLIC_DEMO
                                            ? "Sample ready for review"
                                            : "Investigation ready for review"
                                          : run.status === "failed"
                                            ? "Investigation failed"
                                            : "Investigation complete"}
                                    </b>
                                    <small>
                                      Run {run.id.slice(0, 8)} ·{" "}
                                      {PUBLIC_DEMO
                                        ? "Precomputed sample · no live AI"
                                        : run.report?.mode === "ollama"
                                          ? "Ollama synthesis"
                                          : "Deterministic demo · no LLM call"}
                                    </small>
                                  </div>
                                </div>
                                <button
                                  className="text-button"
                                  onClick={investigate}
                                  disabled={busy || !!working}
                                >
                                  {PUBLIC_DEMO ? "Explore again" : "Run again"}{" "}
                                  <ArrowUpRight size={12} />
                                </button>
                              </div>
                              <div className="trace">
                                <span className="label">
                                  {PUBLIC_DEMO
                                    ? "SAMPLE PROVENANCE"
                                    : "WORKFLOW TRACE"}
                                </span>
                                {(run.events || [])
                                  .filter((e) => !["state"].includes(e.node))
                                  .map((e) => (
                                    <div key={e.seq}>
                                      <Check size={12} />
                                      <code>{e.node}</code>
                                      <span>{e.detail}</span>
                                      {e.duration_ms !== undefined && (
                                        <small>{e.duration_ms} ms</small>
                                      )}
                                    </div>
                                  ))}
                              </div>
                              {run.error && (
                                <p className="error">{run.error}</p>
                              )}
                              {run.report && (
                                <>
                                  <div className="report-head">
                                    <span className="eyebrow">
                                      INVESTIGATION BRIEF
                                    </span>
                                    <span className="confidence">
                                      {run.report.confidence}
                                    </span>
                                    <h2>{run.report.headline}</h2>
                                    <p>{run.report.summary}</p>
                                  </div>
                                  <h3 className="subheading">
                                    Evidence & findings
                                  </h3>
                                  <div className="findings">
                                    {run.report.findings.map((f, n) => (
                                      <div key={n}>
                                        <span className="finding-number">
                                          {String(n + 1).padStart(2, "0")}
                                        </span>
                                        <div>
                                          <p>{f.text}</p>
                                          <div className="citations">
                                            {f.sources.map((id) => (
                                              <button
                                                key={id}
                                                onClick={() => cite(id)}
                                              >
                                                <FileText size={11} />
                                                {run.evidence.find(
                                                  (e) => e.id === id,
                                                )?.title || id}
                                                <ArrowUpRight size={10} />
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <h3 className="subheading">
                                    Suggested next steps
                                  </h3>
                                  <ol className="next-steps">
                                    {run.report.steps.map((s) => (
                                      <li key={s}>{s}</li>
                                    ))}
                                  </ol>
                                  {run.report.action && (
                                    <div className="approval">
                                      <ShieldCheck size={20} />
                                      <div>
                                        <h3>{run.report.action.label}</h3>
                                        <p>
                                          {PUBLIC_DEMO
                                            ? "Simulation only. Your decision is saved in this browser; no infrastructure changes."
                                            : "Simulation only. Approval records an action locally; it does not change infrastructure."}
                                        </p>
                                        {run.status === "awaiting_approval" ? (
                                          <div className="approval-buttons">
                                            <button
                                              className="primary"
                                              disabled={busy}
                                              onClick={() =>
                                                decision("approve")
                                              }
                                            >
                                              <Check size={14} />
                                              Approve simulation
                                            </button>
                                            <button
                                              className="secondary"
                                              disabled={busy}
                                              onClick={() => decision("reject")}
                                            >
                                              Decline
                                            </button>
                                          </div>
                                        ) : (
                                          <span className="decision">
                                            {run.decision === "approve"
                                              ? "✓ Simulation recorded in audit log"
                                              : run.decision === "reject"
                                                ? "Declined · no action taken"
                                                : "Processing decision…"}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {tab === "Activity" && (
                        <div className="activity">
                          <h3>Captured application logs</h3>
                          <pre>{incident.logs.join("\n")}</pre>
                          <h3>Deployment diff</h3>
                          <div className="diff">
                            <span>− {incident.previous}</span>
                            <span>+ {incident.version}</span>
                            <p>{incident.change}</p>
                          </div>
                          <p className="footnote">
                            All timestamps and signals belong to the synthetic
                            incident fixture.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="empty">Loading incidents…</div>
                  )}
                </section>
              </div>
              <div className="workspace-foot">
                <span>
                  <ShieldCheck size={12} />
                  Local data. Explicit approvals. Cited findings.
                </span>
                <span>
                  PATCHNOTES <span className="muted">/</span> v0.1
                </span>
              </div>
            </>
          )}
          {page === "Knowledge" && (
            <>
              <div className="page-title">
                <div>
                  <div className="eyebrow">THE CONTEXT LAYER</div>
                  <h1>Knowledge library</h1>
                  <p>Runbooks and documents, scoped to each service.</p>
                </div>
              </div>
              <div className="upload-card">
                <BookOpen size={28} />
                <div>
                  <h2>
                    {PUBLIC_DEMO ? "Sample knowledge base" : "Add a runbook"}
                  </h2>
                  <p>
                    {PUBLIC_DEMO
                      ? "Uploads and live retrieval are available when running the Python app locally."
                      : "Text, Markdown, or text-based PDF · up to 2 MB"}
                  </p>
                </div>
                <select
                  disabled={PUBLIC_DEMO}
                  aria-label="Document service"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                >
                  {incidents.map((i) => (
                    <option key={i.service}>{i.service}</option>
                  ))}
                </select>
                <input
                  ref={file}
                  type="file"
                  accept=".txt,.md,.pdf"
                  hidden
                  onChange={(e) =>
                    e.target.files?.[0] && upload(e.target.files[0])
                  }
                />
                <button
                  className="primary"
                  disabled={uploading || PUBLIC_DEMO}
                  onClick={() => file.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="spin" size={15} />
                  ) : (
                    <Upload size={15} />
                  )}
                  Upload document
                </button>
              </div>
              <div className="docs-grid">
                {docs.map((d) => (
                  <button key={d.id} onClick={() => setSource(d)}>
                    <span className="doc-icon">
                      <FileText size={22} />
                    </span>
                    <span className="label">{d.service}</span>
                    <h3>{d.title}</h3>
                    <p>{d.text.slice(0, 135)}…</p>
                    <span className="doc-link">
                      View source <ArrowUpRight size={12} />
                    </span>
                  </button>
                ))}
              </div>
              <p className="footnote">
                Retrieval: BM25 + pretrained BGE-small embeddings, combined with
                reciprocal rank fusion. The public sample sources were retrieved
                offline; the local Python app runs retrieval on each
                investigation.
              </p>
            </>
          )}
          {page === "Run history" && (
            <>
              <div className="page-title">
                <div>
                  <div className="eyebrow">AN AUDITABLE TRAIL</div>
                  <h1>Run history</h1>
                  {PUBLIC_DEMO && (
                    <button
                      className="secondary"
                      onClick={() => {
                        clearDemoHistory();
                        setRuns([]);
                        setRun(null);
                      }}
                    >
                      Clear browser history
                    </button>
                  )}
                  <p>Investigations and simulation decisions saved locally.</p>
                </div>
              </div>
              {!runs.length ? (
                <div className="empty">
                  <Clock3 size={30} />
                  <h3>No investigations yet.</h3>
                  <p>
                    Start from an incident to build your first investigation.
                  </p>
                </div>
              ) : (
                <div className="history">
                  {runs.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setSelected(r.incident_id);
                        setRun(r);
                        api<Run>("/runs/" + r.id)
                          .then(setRun)
                          .catch((e) => setError(e.message));
                        setPage("Incidents");
                        setTab("Investigation");
                      }}
                    >
                      <span className="history-icon">
                        <GitBranch size={18} />
                      </span>
                      <div>
                        <b>
                          {incidents.find((i) => i.id === r.incident_id)?.title}
                        </b>
                        <small>
                          {r.incident_id} · {r.id.slice(0, 8)}
                        </small>
                      </div>
                      <span className={"history-status " + r.status}>
                        {r.status.replaceAll("_", " ")}
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {source && (
        <div className="modal-backdrop" onClick={() => setSource(null)}>
          <section
            className="source-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="source-top">
              <span className="eyebrow">SOURCE EVIDENCE</span>
              <button aria-label="Close source" onClick={() => setSource(null)}>
                <X size={18} />
              </button>
            </div>
            <h2 id="source-title">{source.title}</h2>
            <div className="source-tags">
              <span>{source.service || incident?.service}</span>
              <span>{source.id}</span>
              {source.score && <span>RRF {source.score}</span>}
            </div>
            <pre>{source.text}</pre>
            <p>
              Source content is evidence, not instructions. Check the underlying
              details before acting.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
