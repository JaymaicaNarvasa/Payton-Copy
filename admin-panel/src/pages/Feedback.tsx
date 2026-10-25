import { useCallback, useEffect, useState } from "react";
import { supabase, formatDate } from "../lib/supabase";
import { isMissingFunction, rpcErrorMessage } from "../lib/adminUtils";
import type { AdminRole } from "../App";
import NoticeModal, { type Notice } from "../components/NoticeModal";
import "../modules.css";

type Status = "new" | "in_review" | "resolved" | "dismissed";
type Item = {
  id: string;
  created_at: string;
  category: string;
  status: Status;
  message: string;
  admin_note: string | null;
  user_email: string | null;
  user_name: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  total_count: number;
};
type Summary = { total: number; by_status: Partial<Record<Status, number>> };

const PAGE_SIZE = 10;
const STATUS_LABEL: Record<Status, string> = { new: "New", in_review: "In review", resolved: "Resolved", dismissed: "Dismissed" };
const STATUS_CLASS: Record<Status, string> = { new: "mod-pill-warn", in_review: "mod-pill-neutral", resolved: "ref-pill-active", dismissed: "mod-pill-muted" };
const CATEGORY_LABEL: Record<string, string> = {
  bug: "Bug or technical report",
  feature: "Feature request",
  account: "Account issue",
  ai: "AI assistant",
  other: "Other",
};

export default function Feedback({ adminRole }: { adminRole: AdminRole }) {
  const isSuper = adminRole === "super_admin";
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<Item[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missingSetup, setMissingSetup] = useState(false);

  const [selected, setSelected] = useState<Item | null>(null);
  const [editStatus, setEditStatus] = useState<Status>("new");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("admin_list_feedback", {
      p_status: status || null,
      p_category: category || null,
      p_search: search,
      p_from: from || null,
      p_to: to || null,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (rpcError) {
      setMissingSetup(isMissingFunction(rpcError));
      setError(rpcErrorMessage(rpcError, "Could not load feedback."));
      setRows([]);
    } else {
      setMissingSetup(false);
      setRows((data ?? []) as Item[]);
    }
    setLoading(false);
  }, [status, category, search, from, to, page]);

  const loadSummary = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("admin_feedback_summary");
    if (!rpcError) setSummary(data as Summary);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  function changeFilter(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(0);
  }

  function open(item: Item) {
    setSelected(item);
    setEditStatus(item.status);
    setEditNote(item.admin_note ?? "");
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("admin_update_feedback", {
      p_id: selected.id,
      p_status: editStatus,
      p_note: editNote.trim() || null,
    });
    setSaving(false);
    setSelected(null);
    if (rpcError) {
      setNotice({ type: "error", message: rpcErrorMessage(rpcError, "Could not save the review.") });
      return;
    }
    setNotice({ type: "success", message: "Feedback updated." });
    load();
    loadSummary();
  }

  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(status || category || search || from || to);
  const count = (s: Status) => summary?.by_status[s] ?? 0;

  return (
    <div className="ref-dashboard-container">
      <div className="ref-top-header">
        <div>
          <h1 className="ref-page-title">Reports and Feedback</h1>
          <div className="ref-breadcrumbs">Dashboard / <span className="current">Reports and feedback</span></div>
        </div>
      </div>

      {missingSetup && (
        <div className="mod-note warn">
          The feedback database objects are not installed yet. Run <strong>supabase/migrations/002_admin_modules.sql</strong> in the Supabase SQL Editor, then reload this page.
        </div>
      )}

      <div className="mod-grid">
        <div className="mod-metric"><div className="mod-metric-value">{summary?.total ?? "—"}</div><div className="mod-metric-label">Total submissions</div></div>
        <div className="mod-metric"><div className="mod-metric-value">{summary ? count("new") : "—"}</div><div className="mod-metric-label">New</div></div>
        <div className="mod-metric"><div className="mod-metric-value">{summary ? count("in_review") : "—"}</div><div className="mod-metric-label">In review</div></div>
        <div className="mod-metric"><div className="mod-metric-value">{summary ? count("resolved") + count("dismissed") : "—"}</div><div className="mod-metric-label">Resolved or dismissed</div></div>
      </div>

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">Submissions</h3>
            <p className="ref-panel-sub">Feedback and technical reports sent by Payton users. Reports are the “Bug or technical report” category.</p>
          </div>
        </div>

        <div className="mod-filters" style={{ marginBottom: 14 }}>
          <form
            className="ref-search-form"
            onSubmit={(e) => { e.preventDefault(); setPage(0); setSearch(input.trim()); }}
          >
            <input className="ref-search-input" placeholder="Search message or email..." value={input} onChange={(e) => setInput(e.target.value)} />
            <button className="ref-search-btn" type="submit">Search</button>
          </form>
          <select className="ref-select-control" value={status} onChange={(e) => changeFilter(setStatus, e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <select className="ref-select-control" value={category} onChange={(e) => changeFilter(setCategory, e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="ref-select-control" type="date" value={from} max={to || undefined} onChange={(e) => changeFilter(setFrom, e.target.value)} aria-label="Submitted from" />
          <input className="ref-select-control" type="date" value={to} min={from || undefined} onChange={(e) => changeFilter(setTo, e.target.value)} aria-label="Submitted until" />
        </div>

        {error && !missingSetup && <div className="alert alert-error" role="alert">{error}</div>}

        <div className="ref-table-container mod-scroll">
          <table className="ref-table">
            <thead>
              <tr>
                <th style={{ width: "15%" }}>Submitted</th>
                <th style={{ width: "20%" }}>From</th>
                <th style={{ width: "16%" }}>Category</th>
                <th style={{ width: "29%" }}>Message</th>
                <th style={{ width: "10%" }}>Status</th>
                <th style={{ width: "10%" }} className="text-right">{isSuper ? "Action" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="ref-state-cell">Loading feedback…</td></tr>}
              {!loading && !error && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="ref-state-cell">
                    {hasFilters ? "No submissions match these filters." : "No feedback has been submitted yet."}
                  </td>
                </tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.id} className="mod-row-click" onClick={() => open(r)}>
                  <td className="text-truncate">{formatDate(r.created_at)}</td>
                  <td className="text-truncate" title={r.user_email ?? ""}>{r.user_name || r.user_email || "Deleted account"}</td>
                  <td className="text-truncate">{CATEGORY_LABEL[r.category] ?? r.category}</td>
                  <td className="text-truncate" title={r.message}>{r.message}</td>
                  <td><span className={STATUS_CLASS[r.status]}>{STATUS_LABEL[r.status]}</span></td>
                  <td className="text-right">
                    <button className="ref-action-btn ref-btn-reactivate" onClick={(e) => { e.stopPropagation(); open(r); }}>
                      {isSuper ? "Review" : "View"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ref-table-footer">
          <div className="ref-show-info">Showing <span className="font-semibold">{rows.length}</span> of <span className="font-semibold">{total}</span> results</div>
          <div className="ref-pager">
            <button className="ref-page-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="ref-page-indicator">Page {page + 1} of {pages}</span>
            <button className="ref-page-btn" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      </div>

      {selected && (
        <div className="ref-modal-overlay" role="dialog" aria-modal="true">
          <div className="ref-modal-content" style={{ maxWidth: 560 }}>
            <h3 className="ref-modal-title">{isSuper ? "Review submission" : "Submission"}</h3>
            <dl className="mod-meta">
              <dt>From</dt><dd>{selected.user_name || "—"} {selected.user_email ? `(${selected.user_email})` : "(account deleted)"}</dd>
              <dt>Submitted</dt><dd>{formatDate(selected.created_at)}</dd>
              <dt>Category</dt><dd>{CATEGORY_LABEL[selected.category] ?? selected.category}</dd>
              {selected.reviewed_at && (<><dt>Last reviewed</dt><dd>{formatDate(selected.reviewed_at)}{selected.reviewed_by_email ? ` by ${selected.reviewed_by_email}` : ""}</dd></>)}
            </dl>
            <div className="mod-msg">{selected.message}</div>

            {isSuper ? (
              <div className="mod-form" style={{ marginTop: 14, maxWidth: "none" }}>
                <label>
                  Status
                  <select className="ref-select-control" value={editStatus} onChange={(e) => setEditStatus(e.target.value as Status)}>
                    {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </label>
                <label>
                  Internal note (optional, 500 characters maximum)
                  <textarea className="ref-modal-input mod-textarea" maxLength={500} value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                </label>
              </div>
            ) : (
              <p className="ref-modal-desc" style={{ marginTop: 14 }}>
                Status: <span className={STATUS_CLASS[selected.status]}>{STATUS_LABEL[selected.status]}</span>
                {selected.admin_note ? <><br />Note: {selected.admin_note}</> : null}
                <br /><span className="ref-muted">Only super admins can change the status.</span>
              </p>
            )}

            <div className="ref-modal-actions">
              <button className="ref-modal-btn-cancel" onClick={() => setSelected(null)} disabled={saving}>{isSuper ? "Cancel" : "Close"}</button>
              {isSuper && (
                <button className="ref-modal-btn-confirm success" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save review"}</button>
              )}
            </div>
          </div>
        </div>
      )}

      <NoticeModal notice={notice} onClose={() => setNotice(null)} />
    </div>
  );
}
