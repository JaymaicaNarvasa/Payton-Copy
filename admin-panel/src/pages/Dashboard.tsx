import { useEffect, useState } from "react";
import { supabase, formatDate } from "../lib/supabase";
import { isMissingFunction } from "../lib/adminUtils";

type Stats = {
  total_users: number;
  verified_users: number;
  suspended_users: number;
  active_last_30d: number;
  new_last_7d: number;
  by_role: Record<string, number>;
  signups_14d: { day: string; n: number }[];
  records: Record<string, number>;
};

const RECORD_LABELS: Record<string, string> = {
  expenses: "Expenses",
  income: "Income entries",
  allowances: "Allowances",
  reminders: "Reminders",
  split_expenses: "Split expenses",
};

// Same data source as System Monitoring: the admin_ai_usage_summary database function (7-day window).
type AiUsage = {
  total_logged: number;
  requests: number;
  success: number;
  error: number;
  rate_limited: number;
  avg_latency_ms: number | null;
  tokens_total: number | null;
  requests_with_token_data: number;
  last_success_at: string | null;
  last_error_at: string | null;
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [edgeStatus, setEdgeStatus] = useState<"healthy" | "degraded" | "down">("healthy");
  const [ai, setAi] = useState<AiUsage | null>(null);
  const [aiError, setAiError] = useState("");

  // Dynamic heartbeat health check para sa real-time latency ug status changes
  const checkHealth = async () => {
    const started = performance.now();
    try {
      const { error: pingError } = await supabase.rpc("admin_role");
      if (pingError) throw pingError;
      const elapsed = Math.round(performance.now() - started);
      setLatency(elapsed);
      if (elapsed > 1000) {
        setEdgeStatus("down");
      } else if (elapsed > 600) {
        setEdgeStatus("degraded");
      } else {
        setEdgeStatus("healthy");
      }
    } catch {
      setEdgeStatus("down");
    }
  };

  const fetchStats = async () => {
    const started = performance.now();
    const { data, error: rpcError } = await supabase.rpc("admin_dashboard_stats");

    if (rpcError) {
      setError("Could not load statistics. The database may be paused or unreachable.");
      return;
    }
    setError("");
    setLatency(Math.round(performance.now() - started));
    setStats(data as Stats);
  };

  const fetchAi = async () => {
    const { data, error: rpcError } = await supabase.rpc("admin_ai_usage_summary", { p_days: 7 });
    if (rpcError) {
      setAiError(
        isMissingFunction(rpcError)
          ? "AI usage data is not set up yet. Run migration 003_monitoring_ai_feedback.sql."
          : "Could not load AI usage."
      );
      return;
    }
    setAiError("");
    setAi(data as AiUsage);
  };

  useEffect(() => {
    fetchStats();
    fetchAi();

    // Re-check connection speed once a minute (keeps free-tier traffic low)
    const interval = setInterval(() => {
      checkHealth();
      fetchAi();
    }, 60000);

    // Automatic DB changes listener (Realtime Update)
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        () => {
          fetchStats();
        }
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  if (error) return <div className="alert-box">{error}</div>;
  if (!stats) return <div className="loading-box">Loading statistics…</div>;

  const roleTotal = Object.values(stats.by_role).reduce((a, b) => a + b, 0) || 1;
  const maxSignup = Math.max(1, ...stats.signups_14d.map((d) => d.n));

  const formatRoleName = (role: string) => {
    return role
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Helper para sa dynamic latency badge colors
  const getLatencyBadge = (ms: number | null) => {
    if (ms === null) return { text: "Checking...", color: "#64748b", bg: "#f1f5f9" };
    if (ms < 250) return { text: `${ms} ms (Optimal)`, color: "#059669", bg: "#ecfdf5" };
    if (ms < 500) return { text: `${ms} ms (Normal)`, color: "#d97706", bg: "#fffbeb" };
    return { text: `${ms} ms (High Latency)`, color: "#dc2626", bg: "#fef2f2" };
  };

  const latencyStyle = getLatencyBadge(latency);

  return (
    <>
      {/* Top Page Header */}
      <header className="vizora-header">
        <div>
          <h1 className="vizora-title">Dashboard</h1>
          <span className="vizora-subtitle">Welcome back, Administrator</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div 
            className="vizora-realtime-box" 
            style={{ 
              backgroundColor: isLive ? "#ecfdf5" : "#fffbeb", 
              border: `1px solid ${isLive ? "#a7f3d0" : "#fde68a"}`,
              padding: "6px 12px",
              borderRadius: "8px"
            }}
          >
            <div className="vizora-realtime-header" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="vizora-live-dot" style={{ backgroundColor: isLive ? "#10b981" : "#f59e0b", width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" }} />
              <span style={{ fontSize: "12px", fontWeight: "600", color: isLive ? "#065f46" : "#b45309" }}>
                {isLive ? "REALTIME LIVE" : "CONNECTING..."}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Body Content */}
      <div className="vizora-content">
        {/* Top Metric Strip Cards */}
        <section className="vizora-strip">
          <StatCard label="Registered users" value={stats.total_users} icon="👤" />
          <StatCard label="Email verified" value={stats.verified_users} icon="✅" />
          <StatCard label="Active (30 days)" value={stats.active_last_30d} icon="⚡" />
          <StatCard label="New (7 days)" value={stats.new_last_7d} icon="📈" />
          <StatCard label="Suspended" value={stats.suspended_users} icon="⚠️" />
        </section>

        {/* Charts & Panels Grid */}
        <div className="vizora-grid2">
          
          {/* Users by Role */}
          <div className="vizora-panel">
            <h2 className="panel-title">Users by Role</h2>
            <p className="panel-sub">Role breakdown</p>

            <div className="vizora-stack" role="img" aria-label="Users by role">
              {Object.entries(stats.by_role).map(([role, n], i) => (
                <div 
                  key={role} 
                  className={`seg${i % 4}`} 
                  style={{ flexGrow: n, height: "100%" }} 
                  title={`${formatRoleName(role)}: ${n}`} 
                />
              ))}
            </div>

            <ul className="vizora-legend">
              {Object.entries(stats.by_role).map(([role, n], i) => (
                <li key={role} className="vizora-legend-li">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className={`vizora-dot seg${i % 4}`} />
                    <span>{formatRoleName(role)}</span>
                  </div>
                  <div>
                    <strong style={{ marginRight: "8px" }}>{n}</strong>
                    <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                      {Math.round((n / roleTotal) * 100)}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
            
          {/* Sign-ups Last 14 Days (Hapsay ug Sima nga Alignment) */}
          <div className="vizora-panel col-span-2">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <div>
                <h2 className="panel-title">Sign-ups, last 14 days</h2>
                <p className="panel-sub">New accounts created trends</p>
              </div>

              {/* Online Users Count Badge */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "4px 10px", borderRadius: "20px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#10b981", display: "inline-block" }} />
                <span style={{ fontSize: "11px", fontWeight: "600", color: "#065f46" }}>
                  {stats.active_last_30d} Active Recently
                </span>
              </div>
            </div>

            {stats.signups_14d.length === 0 ? (
              <p style={{ color: "#9ca3af", padding: "40px 0", textAlign: "center" }}>
                No new accounts in this period.
              </p>
            ) : (
              <div style={{ display: "flex", gap: "12px", height: "175px", paddingTop: "10px" }}>
                
                {/* 1. KALIWANG GILID (Y-Axis Numbers) */}
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingBottom: "24px", fontSize: "10px", color: "#9ca3af", textAlign: "right", minWidth: "24px" }}>
                  <span style={{ transform: "translateY(4px)" }}>{maxSignup}</span>
                  <span>{Math.round(maxSignup / 2)}</span>
                  <span style={{ transform: "translateY(-4px)" }}>0</span>
                </div>

                {/* 2. CHART AREA (Background Grid Lines + Bars + Dates) */}
                <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
                  
                  {/* Dashed Grid Lines */}
                  <div style={{ position: "absolute", top: "4px", left: "0", right: "0", bottom: "28px", display: "flex", flexDirection: "column", justifyContent: "space-between", pointerEvents: "none" }}>
                    <div style={{ borderBottom: "1px dashed #e2e8f0", width: "100%" }} />
                    <div style={{ borderBottom: "1px dashed #e2e8f0", width: "100%" }} />
                    <div style={{ borderBottom: "1px dashed #e2e8f0", width: "100%" }} />
                  </div>

                  {/* Vertical Bars Container */}
                  <div style={{ display: "flex", alignItems: "flex-end", height: "calc(100% - 28px)", paddingTop: "4px", gap: "8px", position: "relative", zIndex: 1 }}>
                    {stats.signups_14d.map((d) => {
                      const heightPercent = Math.max(8, (d.n / maxSignup) * 100);
                      const isPeak = d.n === maxSignup && d.n > 0;

                      return (
                        <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                          <div
                            style={{
                              width: "100%",
                              maxWidth: "12px",
                              height: `${heightPercent}%`,
                              backgroundColor: isPeak ? "#059669" : "#10b981",
                              opacity: isPeak ? 1 : 0.65,
                              borderRadius: "4px 4px 0 0",
                              transition: "height 0.3s ease",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Date Labels sa Ibaba (X-Axis) */}
                  <div style={{ display: "flex", justifyContent: "space-between", height: "24px", alignItems: "center" }}>
                    {stats.signups_14d.map((d) => (
                      <span key={d.day} style={{ fontSize: "10px", color: "#9ca3af", textAlign: "center", flex: 1 }}>
                        {d.day.slice(8)}
                      </span>
                    ))}
                  </div>

                </div>
              </div>
            )}
          </div>

          {/* App Activity (Gipasinaw ug Gibutangan og Icons) */}
          <div className="vizora-panel">
            <h2 className="panel-title">Activity in the app</h2>
            <p className="panel-sub">Record counts only. Amounts are hidden.</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
              {Object.entries(stats.records).map(([key, n]) => {
                const icons: Record<string, string> = {
                  expenses: "💸",
                  income: "💰",
                  allowances: "🎁",
                  reminders: "⏰",
                  split_expenses: "🤝",
                };

                return (
                  <li 
                    key={key} 
                    style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center", 
                      padding: "10px 14px",
                      backgroundColor: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "16px" }}>{icons[key] ?? "📄"}</span>
                      <span style={{ fontSize: "13px", fontWeight: "500", color: "#334155" }}>
                        {RECORD_LABELS[key] ?? key}
                      </span>
                    </div>
                    <strong className="vizora-badge" style={{ backgroundColor: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" }}>
                      {n.toLocaleString()}
                    </strong>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Fully Dynamic Service Status & AI Usage Panel */}
          <div className="vizora-panel col-span-2">
            <div className="ref-panel-header" style={{ marginBottom: "16px" }}>
              <div>
                <h2 className="panel-title">Service status & AI usage</h2>
                <p className="panel-sub">Realtime connection telemetry & dynamic system health</p>
              </div>
              <span style={{ fontSize: "11px", color: "#64748b", backgroundColor: "#f1f5f9", padding: "4px 8px", borderRadius: "6px" }}>
                Re-checks every 60s
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "16px" }}>
              
              {/* 1. Database & API Status */}
              <div className="vizora-status-box" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px", margin: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="vizora-dot" style={{ backgroundColor: edgeStatus === "down" ? "#dc2626" : "#10b981" }} />
                  <span style={{ fontWeight: 600, fontSize: "13px" }}>Database & API</span>
                </div>
                <strong style={{ color: edgeStatus === "down" ? "#dc2626" : "#059669", backgroundColor: edgeStatus === "down" ? "#fef2f2" : "#ecfdf5", padding: "4px 8px", borderRadius: "6px", fontSize: "12px" }}>
                  {edgeStatus === "down" ? "Unreachable" : "Connected & Live"}
                </strong>
              </div>

              {/* 2. Edge Functions Status */}
              <div className="vizora-status-box" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px", margin: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="vizora-dot" style={{ backgroundColor: "#94a3b8" }} />
                  <span style={{ fontWeight: 600, fontSize: "13px" }}>Edge Functions</span>
                </div>
                <strong style={{ color: "#475569", backgroundColor: "#f1f5f9", padding: "4px 8px", borderRadius: "6px", fontSize: "12px" }}>
                  See System monitoring
                </strong>
              </div>

              {/* 3. Response Latency Tracker */}
              <div className="vizora-status-box" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px", margin: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="vizora-dot" style={{ backgroundColor: latencyStyle.color }} />
                  <span style={{ fontWeight: 600, fontSize: "13px" }}>Response Latency</span>
                </div>
                <strong style={{ color: latencyStyle.color, backgroundColor: latencyStyle.bg, padding: "4px 8px", borderRadius: "6px", fontSize: "12px" }}>
                  {latencyStyle.text}
                </strong>
              </div>

            </div>

            {/* AI usage: read from the same database function as System Monitoring */}
            <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "10px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>AI service usage (7 days)</div>
                {ai && ai.total_logged > 0 && (() => {
                  const ok = ai.last_success_at && (!ai.last_error_at || new Date(ai.last_success_at) >= new Date(ai.last_error_at));
                  const failed = !ok && ai.last_error_at;
                  if (!ok && !failed) return null;
                  return (
                    <strong style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "6px", color: ok ? "#059669" : "#dc2626", backgroundColor: ok ? "#ecfdf5" : "#fee2e2" }}>
                      {ok ? "Last request succeeded" : "Last request failed"}
                    </strong>
                  );
                })()}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", display: "flex", flexDirection: "column", gap: "6px" }}>
                {aiError ? (
                  <div>{aiError}</div>
                ) : !ai ? (
                  <div>Loading AI usage…</div>
                ) : ai.total_logged === 0 ? (
                  <div>No AI usage records available yet. Records appear only after requests pass through the AI proxy.</div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "6px", borderBottom: "1px solid #e2e8f0" }}>
                      <span>Total Requests:</span>
                      <strong style={{ color: "#0f172a" }}>{ai.requests.toLocaleString()} ({ai.success.toLocaleString()} success, {ai.error.toLocaleString()} failed{ai.rate_limited > 0 ? `, ${ai.rate_limited} rate-limited` : ""})</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "6px", borderBottom: "1px solid #e2e8f0" }}>
                      <span>Average Latency & Tokens:</span>
                      <strong style={{ color: "#0f172a" }}>
                        {ai.avg_latency_ms !== null ? `${ai.avg_latency_ms} ms` : "N/A"} 
                        {ai.requests_with_token_data > 0 && ai.tokens_total !== null ? ` • ${ai.tokens_total.toLocaleString()} tokens` : ""}
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Last Activity:</span>
                      <span style={{ color: "#334155" }}>
                        Success: {ai.last_success_at ? formatDate(ai.last_success_at) : "None"}
                        {ai.last_error_at ? ` | Error: ${formatDate(ai.last_error_at)}` : ""}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <p style={{ color: "#9ca3af", fontSize: "11px", marginTop: "12px", textAlign: "right", marginBottom: 0 }}>
              Connection speed is measured with a real call to the admin database function.
            </p>
          </div>

        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="vizora-stat-card">
      <div className="vizora-stat-icon">{icon}</div>
      <div>
        <div className="vizora-stat-n">{value.toLocaleString()}</div>
        <div className="vizora-stat-l">{label}</div>
      </div>
    </div>
  );
}