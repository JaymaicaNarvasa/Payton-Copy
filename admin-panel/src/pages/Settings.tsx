import { useEffect, useState, type FormEvent } from "react";
import { supabase, formatDate } from "../lib/supabase";
import type { AdminRole } from "../App";
import NoticeModal, { type Notice } from "../components/NoticeModal";
import "../modules.css";

export default function Settings({ adminRole }: { adminRole: AdminRole }) {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState<"" | "name" | "password" | "sessions">("");
  const [confirmSessions, setConfirmSessions] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      setEmail(user?.email ?? "");
      setLastSignIn(user?.last_sign_in_at ?? null);
      setName(((user?.user_metadata?.display_name as string | undefined) ?? "").toString());
      setLoading(false);
    });
  }, []);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setBusy("name");
    const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim() } });
    setBusy("");
    setNotice(error
      ? { type: "error", message: error.message }
      : { type: "success", message: "Display name saved. It now appears in the sidebar." });
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setNotice({ type: "error", message: "Use at least 8 characters for the new password." });
    if (pw !== pw2) return setNotice({ type: "error", message: "The two passwords do not match." });
    setBusy("password");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (!error) await supabase.rpc("admin_log_event", { p_action: "password_changed" });
    setBusy("");
    if (error) return setNotice({ type: "error", message: error.message });
    setPw("");
    setPw2("");
    setNotice({ type: "success", message: "Password changed." });
  }

  async function revokeOthers() {
    setConfirmSessions(false);
    setBusy("sessions");
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (!error) await supabase.rpc("admin_log_event", { p_action: "sessions_revoked" });
    setBusy("");
    setNotice(error
      ? { type: "error", message: error.message }
      : { type: "success", message: "All other devices were signed out. This session stays signed in." });
  }

  return (
    <div className="ref-dashboard-container">
      <div className="ref-top-header">
        <div>
          <h1 className="ref-page-title">Settings</h1>
          <div className="ref-breadcrumbs">Dashboard / <span className="current">Settings</span></div>
        </div>
      </div>

      {loading ? (
        <div className="ref-state-cell">Loading your account…</div>
      ) : (
        <div className="mod-stack">
          <div className="ref-panel">
            <div className="ref-panel-header">
              <div>
                <h3 className="ref-panel-title">Your account</h3>
                <p className="ref-panel-sub">Your email and role are managed by Super admins and cannot be changed here.</p>
              </div>
            </div>
            <dl className="mod-meta">
              <dt>Email</dt><dd>{email}</dd>
              <dt>Role</dt><dd>{adminRole === "super_admin" ? "Super admin" : "Support (read-only)"}</dd>
              <dt>Last sign-in</dt><dd>{formatDate(lastSignIn)}</dd>
            </dl>
          </div>

          <div className="ref-panel">
            <div className="ref-panel-header">
              <div>
                <h3 className="ref-panel-title">Display name</h3>
                <p className="ref-panel-sub">Shown in the sidebar instead of your email. It has no effect on permissions.</p>
              </div>
            </div>
            <form className="mod-form" onSubmit={saveName}>
              <label>
                Name
                <input className="ref-modal-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              </label>
              <button className="mod-btn" disabled={busy !== ""}>{busy === "name" ? "Saving…" : "Save name"}</button>
            </form>
          </div>

          <div className="ref-panel">
            <div className="ref-panel-header">
              <div>
                <h3 className="ref-panel-title">Change password</h3>
                <p className="ref-panel-sub">The change is recorded in the audit log. The password itself is never stored or shown.</p>
              </div>
            </div>
            <form className="mod-form" onSubmit={savePassword}>
              <label>
                New password
                <input className="ref-modal-input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              </label>
              <label>
                Confirm new password
                <input className="ref-modal-input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
              </label>
              <button className="mod-btn" disabled={busy !== "" || !pw}>{busy === "password" ? "Saving…" : "Change password"}</button>
            </form>
          </div>

          <div className="ref-panel">
            <div className="ref-panel-header">
              <div>
                <h3 className="ref-panel-title">Sessions</h3>
                <p className="ref-panel-sub">Sign out every other browser or device where this account is signed in. This session is kept.</p>
              </div>
            </div>
            <button className="mod-btn-ghost" onClick={() => setConfirmSessions(true)} disabled={busy !== ""}>
              {busy === "sessions" ? "Signing out…" : "Sign out other devices"}
            </button>
          </div>
        </div>
      )}

      {confirmSessions && (
        <div className="ref-modal-overlay" role="dialog" aria-modal="true">
          <div className="ref-modal-content">
            <h3 className="ref-modal-title">Sign out other devices</h3>
            <p className="ref-modal-desc">Every other session of this administrator account will be signed out. Continue?</p>
            <div className="ref-modal-actions">
              <button className="ref-modal-btn-cancel" onClick={() => setConfirmSessions(false)}>Cancel</button>
              <button className="ref-modal-btn-confirm danger" onClick={revokeOthers}>Yes, sign them out</button>
            </div>
          </div>
        </div>
      )}

      <NoticeModal notice={notice} onClose={() => setNotice(null)} />
    </div>
  );
}
