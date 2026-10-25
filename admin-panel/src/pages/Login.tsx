import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login({ notice }: { notice: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError("Email or password is incorrect.");
    } else {
      // Recorded only if this account is an administrator (the database rejects anyone else).
      await supabase.rpc("admin_log_event", { p_action: "login" });
    }
    setBusy(false);
  }

  return (
    <div className="admin-split-wrapper">
      {/* LEFT SIDE: Login Form using your existing .login class */}
      <div className="admin-left-pane">
        <form className="login" onSubmit={onSubmit}>
          <div className="brand-logo-container">
            <img 
              src="/logo.png" 
              alt="Payton Logo" 
              style={{ height: "40px", width: "auto", marginBottom: "0.25rem" }} 
              onError={(e) => (e.currentTarget.style.display = "none")} 
            />
          </div>
          <h1>Payton Admin</h1>
          <p className="muted">Sign in with your administrator account.</p>

          {(error || notice) && (
            <div className="alert" role="alert">
              {error || notice}
            </div>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@payton.com"
              required
              autoComplete="username"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </label>

          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>

      {/* RIGHT SIDE: Financial Admin Tracking Visuals & Logo */}
      <div className="admin-right-pane">
        <div className="admin-right-content">
          <img 
            src="/logo.png" 
            alt="Payton Logo" 
            style={{ height: "52px", width: "auto", marginBottom: "1.25rem" }} 
            onError={(e) => (e.currentTarget.style.display = "none")} 
          />
          <h2>Financial Management & Admin </h2>
          <p className="muted" style={{ color: "var(--c2)", marginBottom: "2rem", lineHeight: "1.5" }}>
            Real-time monitoring of expense tracking, budget allocations, split-bill records, and administrative security audit logs.
          </p>

          <div className="admin-features-grid">
            <div className="admin-feature-card">
              <div className="admin-feat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--c2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
              </div>
              <div>
                <h4 style={{ margin: "0 0 0.2rem 0", color: "#fff", fontSize: "0.95rem" }}>Real-time Expense Tracking</h4>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "#a9c4b4" }}>Live monitoring of system-wide transactions and logs.</p>
              </div>
            </div>

            <div className="admin-feature-card">
              <div className="admin-feat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--c2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
              </div>
              <div>
                <h4 style={{ margin: "0 0 0.2rem 0", color: "#fff", fontSize: "0.95rem" }}>Budget & Financial Analytics</h4>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "#a9c4b4" }}>Comprehensive summary reports on budget distributions.</p>
              </div>
            </div>

            <div className="admin-feature-card">
              <div className="admin-feat-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--c2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              </div>
              <div>
                <h4 style={{ margin: "0 0 0.2rem 0", color: "#fff", fontSize: "0.95rem" }}>Secure RPC Audit Logging</h4>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "#a9c4b4" }}>Database-level security event recording for full protection.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}