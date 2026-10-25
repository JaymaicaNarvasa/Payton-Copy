import { useCallback, useEffect, useState } from "react";
import { supabase, formatDate } from "../lib/supabase";
import { formatBytes, isMissingFunction, rpcErrorMessage } from "../lib/adminUtils";
import { ACTION_LABELS } from "../lib/auditLabels";
import "../modules.css";

type Check = { state: "loading" | "ok" | "fail"; ms?: number; detail: string };
type Snapshot = {
  server_time: string;
  database_size_bytes: number;
  signed_in_24h: number;
  new_users_24h: number;
  suspended_users: number;
  admin_count: number;
  admin_actions_24h: number;
  last_admin_action_at: string | null;
};
type EventRow = {
  id: number;
  created_at: string;
  action: string;
  actor_email: string | null;
  target_email: string | null;
  details: { reason?: string | null } | null;
};

type History = {
  heartbeat: { first_at: string | null; last_at: string | null; count_24h: number; gaps: { from: string; to: string }[] | null };
  reminders: {
    runs_7d: number;
    failed_runs_7d: number;
    last_run: { at: string; due: number; sent: number; failed: number; status: string } | null;
  };
};
type AiUsage = {
  days: number;
  total_logged: number;
  requests: number;
  success: number;
  error: number;
  rate_limited: number;
  avg_latency_ms: number | null;
  tokens_total: number | null;
  requests_with_token_data: number;
  by_operation: Record<string, number>;
  last_success_at: string | null;
  last_error_at: string | null;
  recent_errors: { at: string; operation: string; model: string; code: string | null }[] | null;
};

const LOADING: Check = { state: "loading", detail: "Checking…" };

const NOT_MEASURED: { title: string; reason: string }[] = [
  { title: "Uptime percentage", reason: "Not calculated. The heartbeat history above shows only when the database ran its scheduled job." },
  { title: "AI requests made before the proxy was switched on", reason: "They went directly from the phone to the AI provider and were never recorded." },
  { title: "Mobile app errors and crashes", reason: "The app does not report errors to any table the admin panel can read." },
];

export default function Monitoring() {
  const [auth, setAuth] = useState<Check>(LOADING);
  const [db, setDb] = useState<Check>(LOADING);
  const [fn, setFn] = useState<Check>(LOADING);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsError, setEventsError] = useState("");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<History | null>(null);
  const [ai, setAi] = useState<AiUsage | null>(null);
  const [extrasError, setExtrasError] = useState("");

  const run = useCallback(async () => {
    setRunning(true);
    setAuth(LOADING);
    setDb(LOADING);
    setFn(LOADING);
    setEventsError("");
    setExtrasError("");

    const checkAuth = async () => {
      const t = performance.now();
      const { data, error } = await supabase.auth.getUser();
      const ms = Math.round(performance.now() - t);
      if (error || !data.user) setAuth({ state: "fail", ms, detail: "The sign-in service did not confirm this session." });
      else setAuth({ state: "ok", ms, detail: "The sign-in service confirmed this session." });
    };

    const checkDb = async () => {
      const t = performance.now();
      const { data, error } = await supabase.rpc("admin_system_status");
      const ms = Math.round(performance.now() - t);
      if (error) {
        setDb({ state: "fail", ms, detail: rpcErrorMessage(error, "The database did not answer.") });
        setSnapshot(null);
        return;
      }
      setDb({ state: "ok", ms, detail: "The database answered an administrator query." });
      setSnapshot(data as Snapshot);
    };

    const checkFn = async () => {
      const t = performance.now();
      // A deliberately invalid request: the function answers with a rejection and changes nothing.
      const { error } = await supabase.functions.invoke("admin-set-status", { body: { userId: "", status: "ping" } });
      const ms = Math.round(performance.now() - t);
      const status = (error as { context?: { status?: number } } | null)?.context?.status;
      if (!error) setFn({ state: "ok", ms, detail: "The function responded." });
      else if (status === 404) setFn({ state: "fail", ms, detail: "The function is not deployed (HTTP 404)." });
      else if (status !== undefined && status < 500)
        setFn({ state: "ok", ms, detail: `The function responded (HTTP ${status}). The test request was rejected on purpose and nothing was changed.` });
      else if (status !== undefined) setFn({ state: "fail", ms, detail: `The function returned an error (HTTP ${status}).` });
      else setFn({ state: "fail", ms, detail: "The function could not be reached." });
    };

    const loadEvents = async () => {
      const { data, error } = await supabase.rpc("admin_list_audit_logs", { p_limit: 5, p_offset: 0 });
      if (error) {
        setEventsError(isMissingFunction(error) ? "Audit log function is missing." : "Could not load recent events.");
        setEvents([]);
      } else setEvents((data ?? []) as EventRow[]);
    };

    const loadExtras = async () => {
      const [h, a] = await Promise.all([
        supabase.rpc("admin_monitoring_history"),
        supabase.rpc("admin_ai_usage_summary", { p_days: 7 }),
      ]);
      const failure = h.error ?? a.error;
      if (failure) {
        setExtrasError(
          isMissingFunction(failure)
            ? "Monitoring history functions are missing. Run supabase/migrations/003_monitoring_ai_feedback.sql first."
            : "Could not load monitoring history."
        );
        setHistory(null);
        setAi(null);
        return;
      }
      setHistory(h.data as History);
      setAi(a.data as AiUsage);
    };

    await Promise.all([checkAuth(), checkDb(), checkFn(), loadEvents(), loadExtras()]);
    setCheckedAt(new Date());
    setRunning(false);
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const checks: { name: string; check: Check; what: string }[] = [
    { name: "Sign-in service (Supabase Auth)", check: auth, what: "Session check" },
    { name: "Database", check: db, what: "Administrator query" },
    { name: "Edge Function: admin-set-status", check: fn, what: "Reachability test" },
  ];

  return (
    <div className="ref-dashboard-container">
      <div className="ref-top-header">
        <div>
          <h1 className="ref-page-title">System Monitoring</h1>
          <div className="ref-breadcrumbs">Dashboard / <span className="current">System monitoring</span></div>
        </div>
        <button className="mod-btn-ghost" onClick={run} disabled={running}>{running ? "Checking…" : "Run checks again"}</button>
      </div>

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">Verified now</h3>
            <p className="ref-panel-sub">
              Measured from your browser{checkedAt ? ` at ${checkedAt.toLocaleTimeString("en-PH")}` : ""}. Response times are single measurements, not averages.
            </p>
          </div>
        </div>
        <div className="mod-grid">
          {checks.map(({ name, check }) => (
            <div className="mod-check" key={name}>
              <div className="mod-check-head">
                <span>{name}</span>
                {check.state === "loading" ? <span className="mod-pill-muted">Checking…</span>
                  : check.state === "ok" ? <span className="mod-ok">Reachable</span>
                  : <span className="mod-fail">Problem</span>}
              </div>
              {check.ms !== undefined && <div className="mod-check-detail">Response time: {check.ms} ms</div>}
              <div className="mod-check-detail">{check.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">Database snapshot</h3>
            <p className="ref-panel-sub">Counts and size only. No personal data is shown.</p>
          </div>
        </div>
        {db.state === "loading" && <div className="ref-state-cell">Loading snapshot…</div>}
        {db.state === "fail" && <div className="alert alert-error" role="alert">Snapshot unavailable. {db.detail}</div>}
        {snapshot && (
          <div className="mod-grid">
            <Metric label="Database size" value={formatBytes(snapshot.database_size_bytes)} />
            <Metric label="Users signed in (last 24 hours)" value={snapshot.signed_in_24h} />
            <Metric label="New accounts (last 24 hours)" value={snapshot.new_users_24h} />
            <Metric label="Suspended accounts" value={snapshot.suspended_users} />
            <Metric label="Administrators" value={snapshot.admin_count} />
            <Metric label="Admin actions (last 24 hours, excluding sign-in)" value={snapshot.admin_actions_24h} />
            <Metric label="Last administrator action" value={snapshot.last_admin_action_at ? formatDate(snapshot.last_admin_action_at) : "None yet"} />
          </div>
        )}
      </div>

      {extrasError && <div className="alert alert-error" role="alert">{extrasError}</div>}

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">Database heartbeat history</h3>
            <p className="ref-panel-sub">
              A scheduled job writes a timestamp every 10 minutes while the database is running. Gaps mean it was not running (or the job was not).
              This is a record, not an uptime percentage.
            </p>
          </div>
        </div>
        {!history && !extrasError && <div className="ref-state-cell">Loading history…</div>}
        {history && !history.heartbeat.last_at && (
          <div className="mod-note warn">
            No heartbeat has been recorded. The scheduled job (pg_cron) may not be enabled. Check the notices after running migration 003.
          </div>
        )}
        {history && history.heartbeat.last_at && (
          <>
            <div className="mod-grid">
              <Metric label="Last recorded heartbeat" value={formatDate(history.heartbeat.last_at)} />
              <Metric label="Heartbeats in the last 24 hours (144 possible)" value={history.heartbeat.count_24h} />
              <Metric label="Recording since" value={formatDate(history.heartbeat.first_at)} />
            </div>
            <p className="ref-panel-sub" style={{ marginTop: 12 }}>
              {history.heartbeat.gaps && history.heartbeat.gaps.length > 0
                ? "Gaps longer than 25 minutes in the last 7 days (latest first):"
                : "No gaps longer than 25 minutes in the last 7 days."}
            </p>
            {history.heartbeat.gaps && history.heartbeat.gaps.length > 0 && (
              <ul className="mod-list">
                {history.heartbeat.gaps.map((g) => (
                  <li key={g.to}>{formatDate(g.from)} to {formatDate(g.to)}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">AI usage (through the proxy, last 7 days)</h3>
            <p className="ref-panel-sub">Request metadata only. Prompts, receipts, and answers are never stored.</p>
          </div>
        </div>
        {!ai && !extrasError && <div className="ref-state-cell">Loading AI usage…</div>}
        {ai && ai.total_logged === 0 && (
          <div className="mod-note">
            No AI requests have been recorded yet. Requests appear here only after the mobile app is switched to the ai-proxy function.
          </div>
        )}
        {ai && ai.total_logged > 0 && (
          <>
            <div className="mod-grid">
              <Metric label="Requests" value={ai.requests} />
              <Metric label="Succeeded" value={ai.success} />
              <Metric label="Failed" value={ai.error} />
              <Metric label="Blocked by the daily limit" value={ai.rate_limited} />
              <Metric label="Average response time (successful)" value={ai.avg_latency_ms !== null ? `${ai.avg_latency_ms} ms` : "—"} />
              <Metric
                label={`Tokens (${ai.requests_with_token_data} requests reported token data)`}
                value={ai.requests_with_token_data > 0 && ai.tokens_total !== null ? ai.tokens_total : "Not reported"}
              />
            </div>
            <p className="ref-panel-sub" style={{ marginTop: 12 }}>
              By type: {Object.entries(ai.by_operation).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.
              {" "}Last success: {ai.last_success_at ? formatDate(ai.last_success_at) : "none"}.
              {" "}Last failure: {ai.last_error_at ? formatDate(ai.last_error_at) : "none"}.
            </p>
            {ai.recent_errors && ai.recent_errors.length > 0 && (
              <ul className="mod-list">
                {ai.recent_errors.map((e) => (
                  <li key={e.at}>{formatDate(e.at)}: {e.operation} ({e.model}) failed with {e.code ?? "unknown error"}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">Reminder emails</h3>
            <p className="ref-panel-sub">Recorded by the send-reminders function each time it runs.</p>
          </div>
        </div>
        {!history && !extrasError && <div className="ref-state-cell">Loading…</div>}
        {history && !history.reminders.last_run && (
          <div className="mod-note">
            No reminder runs have been recorded. They appear after the updated send-reminders function is deployed and runs.
          </div>
        )}
        {history && history.reminders.last_run && (
          <div className="mod-grid">
            <Metric label="Last run" value={formatDate(history.reminders.last_run.at)} />
            <Metric label="Last run: due, sent, failed" value={`${history.reminders.last_run.due}, ${history.reminders.last_run.sent}, ${history.reminders.last_run.failed}`} />
            <Metric label="Runs in the last 7 days" value={history.reminders.runs_7d} />
            <Metric label="Runs with problems (7 days)" value={history.reminders.failed_runs_7d} />
          </div>
        )}
      </div>

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">Recent events</h3>
            <p className="ref-panel-sub">The latest administrator actions. Application errors are not recorded anywhere yet.</p>
          </div>
        </div>
        {eventsError && <div className="alert alert-error" role="alert">{eventsError}</div>}
        <div className="ref-table-container mod-scroll">
          <table className="ref-table">
            <thead>
              <tr>
                <th style={{ width: "22%" }}>When</th>
                <th style={{ width: "26%" }}>Administrator</th>
                <th style={{ width: "26%" }}>Action</th>
                <th style={{ width: "26%" }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {running && events.length === 0 && <tr><td colSpan={4} className="ref-state-cell">Loading events…</td></tr>}
              {!running && !eventsError && events.length === 0 && (
                <tr><td colSpan={4} className="ref-state-cell">No administrator events recorded yet.</td></tr>
              )}
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="text-truncate">{formatDate(e.created_at)}</td>
                  <td className="text-truncate" title={e.actor_email ?? ""}>{e.actor_email ?? "—"}</td>
                  <td className="text-truncate">{ACTION_LABELS[e.action] ?? e.action}</td>
                  <td className="text-truncate" title={e.details?.reason ?? ""}>{e.target_email ?? e.details?.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">Cannot be measured yet</h3>
            <p className="ref-panel-sub">Shown so nothing here is mistaken for a verified status.</p>
          </div>
        </div>
        <ul className="mod-list">
          {NOT_MEASURED.map((n) => (
            <li key={n.title}><strong>{n.title}.</strong> {n.reason}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mod-metric">
      <div className="mod-metric-value">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="mod-metric-label">{label}</div>
    </div>
  );
}
