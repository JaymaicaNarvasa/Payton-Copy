import { useCallback, useEffect, useState } from "react";
import { supabase, formatDate } from "../lib/supabase";
import { rpcErrorMessage } from "../lib/adminUtils";
import type { AdminRole } from "../App";
import NoticeModal, { type Notice } from "../components/NoticeModal";
import "../modules.css";

type Admin = {
  user_id: string;
  email: string;
  full_name: string | null;
  access_role: AdminRole;
  created_at: string;
  last_sign_in_at: string | null;
};
type Dialog = { kind: "add" } | { kind: "role"; admin: Admin } | { kind: "remove"; admin: Admin };

const ROLE_LABEL: Record<AdminRole, string> = { super_admin: "Super admin", support: "Support (read-only)" };

// These rows describe what the database functions actually enforce. They are fixed and not editable here.
const PERMISSIONS: { label: string; superAdmin: boolean; support: boolean }[] = [
  { label: "View dashboard, users, audit log, monitoring", superAdmin: true, support: true },
  { label: "View user feedback and reports", superAdmin: true, support: true },
  { label: "Suspend or reactivate user accounts", superAdmin: true, support: false },
  { label: "Review feedback and change its status", superAdmin: true, support: false },
  { label: "Add, change or remove administrators", superAdmin: true, support: false },
];

export default function Roles({ adminRole }: { adminRole: AdminRole }) {
  const isSuper = adminRole === "super_admin";
  const [rows, setRows] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [myId, setMyId] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("support");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const { data, error } = await supabase.rpc("admin_list_admins");
    if (error) setLoadError(rpcErrorMessage(error, "Could not load administrators."));
    else setRows((data ?? []) as Admin[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    supabase.auth.getSession().then(({ data }) => setMyId(data.session?.user.id ?? ""));
  }, [load]);

  function openAdd() {
    setEmail("");
    setRole("support");
    setDialog({ kind: "add" });
  }
  function openRole(admin: Admin) {
    setRole(admin.access_role);
    setDialog({ kind: "role", admin });
  }

  async function submit() {
    if (!dialog) return;
    if (dialog.kind === "add" && !email.trim()) return;
    setBusy(true);
    const call =
      dialog.kind === "add"
        ? supabase.rpc("admin_add_admin", { p_email: email.trim(), p_role: role })
        : dialog.kind === "role"
        ? supabase.rpc("admin_set_admin_role", { p_user_id: dialog.admin.user_id, p_role: role })
        : supabase.rpc("admin_remove_admin", { p_user_id: dialog.admin.user_id });
    const { error } = await call;
    setBusy(false);
    const kind = dialog.kind;
    setDialog(null);
    if (error) {
      setNotice({ type: "error", message: rpcErrorMessage(error, "The action failed.") });
      return;
    }
    setNotice({
      type: "success",
      message:
        kind === "add" ? "Administrator added." : kind === "role" ? "Role updated." : "Administrator removed.",
    });
    load();
  }

  const target = dialog && dialog.kind !== "add" ? dialog.admin : null;

  return (
    <div className="ref-dashboard-container">
      <div className="ref-top-header">
        <div>
          <h1 className="ref-page-title">Roles and Permissions</h1>
          <div className="ref-breadcrumbs">Dashboard / <span className="current">Roles and permissions</span></div>
        </div>
        {isSuper && <button className="mod-btn" onClick={openAdd}>Add administrator</button>}
      </div>

      {!isSuper && (
        <div className="mod-note">
          Read-only access: only super admins can add, change or remove administrators.
        </div>
      )}

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">Administrators</h3>
            <p className="ref-panel-sub">Accounts that can sign in to this admin panel.</p>
          </div>
        </div>
        {loadError && <div className="alert alert-error" role="alert">{loadError}</div>}
        <div className="ref-table-container mod-scroll">
          <table className="ref-table">
            <thead>
              <tr>
                <th style={{ width: "18%" }}>Name</th>
                <th style={{ width: "26%" }}>Email</th>
                <th style={{ width: "16%" }}>Role</th>
                <th style={{ width: "16%" }}>Added</th>
                <th style={{ width: "16%" }}>Last sign-in</th>
                {isSuper && <th style={{ width: "20%" }} className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={isSuper ? 6 : 5} className="ref-state-cell">Loading administrators…</td></tr>
              )}
              {!loading && !loadError && rows.length === 0 && (
                <tr><td colSpan={isSuper ? 6 : 5} className="ref-state-cell">No administrators found.</td></tr>
              )}
              {!loading && rows.map((a) => {
                const isMe = a.user_id === myId;
                return (
                  <tr key={a.user_id}>
                    <td className="font-semibold text-truncate" title={a.full_name || ""}>{a.full_name || "—"}</td>
                    <td className="text-truncate" title={a.email}>{a.email}{isMe && <span className="ref-muted"> (you)</span>}</td>
                    <td>
                      <span className={a.access_role === "super_admin" ? "ref-pill-active" : "mod-pill-neutral"}>
                        {ROLE_LABEL[a.access_role]}
                      </span>
                    </td>
                    <td className="text-truncate">{formatDate(a.created_at)}</td>
                    <td className="text-truncate">{formatDate(a.last_sign_in_at)}</td>
                    {isSuper && (
                      <td className="text-right">
                        {isMe ? (
                          <span className="ref-muted">—</span>
                        ) : (
                          <>
                            <button className="ref-action-btn ref-btn-reactivate" onClick={() => openRole(a)}>Change role</button>{" "}
                            <button className="ref-action-btn ref-btn-suspend" onClick={() => setDialog({ kind: "remove", admin: a })}>Remove</button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ref-panel">
        <div className="ref-panel-header">
          <div>
            <h3 className="ref-panel-title">What each role can do</h3>
            <p className="ref-panel-sub">Permissions are fixed and enforced by the database. They cannot be edited here.</p>
          </div>
        </div>
        <div className="ref-table-container mod-scroll">
          <table className="ref-table">
            <thead>
              <tr>
                <th style={{ width: "60%" }}>Permission</th>
                <th style={{ width: "20%" }}>Super admin</th>
                <th style={{ width: "20%" }}>Support</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td>{p.superAdmin ? <span className="ref-badge-yes">Yes</span> : <span className="ref-muted">No</span>}</td>
                  <td>{p.support ? <span className="ref-badge-yes">Yes</span> : <span className="ref-muted">No</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialog && (
        <div className="ref-modal-overlay" role="dialog" aria-modal="true">
          <div className="ref-modal-content">
            <h3 className="ref-modal-title">
              {dialog.kind === "add" ? "Add administrator" : dialog.kind === "role" ? "Change role" : "Remove administrator"}
            </h3>

            {dialog.kind === "add" && (
              <>
                <p className="ref-modal-desc">The person needs an existing, verified Payton account.</p>
                <div className="ref-modal-field">
                  <label className="ref-modal-label">Email address</label>
                  <input className="ref-modal-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                </div>
              </>
            )}
            {target && dialog.kind === "role" && (
              <p className="ref-modal-desc">New role for <span className="font-semibold">{target.email}</span>:</p>
            )}
            {target && dialog.kind === "remove" && (
              <p className="ref-modal-desc">
                Remove <span className="font-semibold">{target.email}</span> as an administrator? They can still use the Payton mobile app.
              </p>
            )}
            {dialog.kind !== "remove" && (
              <div className="ref-modal-field">
                <label className="ref-modal-label">Role</label>
                <select className="ref-select-control" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
                  <option value="support">Support (read-only)</option>
                  <option value="super_admin">Super admin</option>
                </select>
              </div>
            )}

            <div className="ref-modal-actions">
              <button className="ref-modal-btn-cancel" onClick={() => setDialog(null)} disabled={busy}>Cancel</button>
              <button
                className={`ref-modal-btn-confirm ${dialog.kind === "remove" ? "danger" : "success"}`}
                onClick={submit}
                disabled={busy}
              >
                {busy ? "Saving…" : dialog.kind === "add" ? "Add" : dialog.kind === "role" ? "Save role" : "Yes, remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      <NoticeModal notice={notice} onClose={() => setNotice(null)} />
    </div>
  );
}
