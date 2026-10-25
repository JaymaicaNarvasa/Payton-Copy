import { useEffect, useState, useMemo } from "react";
import { supabase, formatDate } from "../lib/supabase";
import { ACTION_LABELS } from "../lib/auditLabels";

type Log = {
  id: number;
  created_at: string;
  action: string;
  actor_email: string | null;
  target_email: string | null;
  details: { reason?: string | null } | null;
  total_count: number;
};

const PAGE_SIZE = 10; // Gi-set sa 10 kada page para dili hasol mag-scroll

export default function AuditLogs() {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAction, setSelectedAction] = useState("all");

  useEffect(() => {
    setLoading(true);
    supabase
      .rpc("admin_list_audit_logs", { p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE })
      .then(({ data, error: rpcError }) => {
        if (rpcError) setError("Could not load the audit log.");
        else setRows((data ?? []) as Log[]);
        setLoading(false);
      });
  }, [page]);

  // Filter logic para sa search ug action filter sa kasamtangang page
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesSearch =
        (r.actor_email?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
        (r.target_email?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
        (r.action?.toLowerCase() || "").includes(searchTerm.toLowerCase());

      const matchesAction = selectedAction === "all" || r.action === selectedAction;

      return matchesSearch && matchesAction;
    });
  }, [rows, searchTerm, selectedAction]);

  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="audit-container">
      <div className="audit-header">
        <h1>Audit Log</h1>
        <p className="audit-subtitle">Monitor administrator activities and system events.</p>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {/* Filters and Search Bar */}
      <div className="audit-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search email or action..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-box">
          <select value={selectedAction} onChange={(e) => setSelectedAction(e.target.value)}>
            <option value="all">All Actions</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Administrator</th>
              <th>Action</th>
              <th>Affected User</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="muted text-center">Loading audit logs...</td>
              </tr>
            )}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted text-center">No administrator actions found.</td>
              </tr>
            )}
            {!loading &&
              filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.created_at)}</td>
                  <td>{r.actor_email ?? "—"}</td>
                  <td>
                    <span className={`badge badge-${r.action}`}>
                      {ACTION_LABELS[r.action] ?? r.action}
                    </span>
                  </td>
                  <td>{r.target_email ?? "—"}</td>
                  <td>{r.details?.reason || "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span className="muted">
          Page {page + 1} of {pages}
        </span>
        <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}