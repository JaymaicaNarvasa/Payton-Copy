import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import AuditLogs from "./pages/AuditLogs";
import Roles from "./pages/Roles";
import Monitoring from "./pages/Monitoring";
import Feedback from "./pages/Feedback";
import Settings from "./pages/Settings";

export type AdminRole = "super_admin" | "support";
type Page = "dashboard" | "users" | "audit" | "roles" | "monitoring" | "feedback" | "settings";

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "users", label: "Users", icon: "👥" },
  { id: "audit", label: "Audit log", icon: "⚡" },
  { id: "roles", label: "Roles and permissions", icon: "🛡️" },
  { id: "monitoring", label: "System monitoring", icon: "🩺" },
  { id: "feedback", label: "Reports and feedback", icon: "💬" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState<Page>("dashboard");

  // Keep the session in sync.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Ask the database whether this user is an administrator.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!userId) {
        setAdminRole(null);
        setChecking(false);
        return;
      }
      setChecking(true);
      const { data, error } = await supabase.rpc("admin_role");
      if (cancelled) return;
      if (error || !data) {
        setNotice("This account is not an administrator.");
        setAdminRole(null);
        await supabase.auth.signOut();
      } else {
        setNotice("");
        setAdminRole(data as AdminRole);
      }
      setChecking(false);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function logout() {
    await supabase.rpc("admin_log_event", { p_action: "logout" });
    await supabase.auth.signOut();
  }

  if (checking) return <div className="loading-box">Checking access…</div>;
  if (!session || !adminRole) return <Login notice={notice} />;

  return (
    <div className="vizora-layout">
      {/* Sidebar Area */}
      <aside className="vizora-sidebar">
        <div>
          <div className="vizora-brand">
            <div className="vizora-logo-box">P</div>
            Payton Admin
          </div>

          <nav className="vizora-nav">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={page === n.id ? "vizora-nav-item active" : "vizora-nav-item"}
                onClick={() => setPage(n.id)}
              >
                <span>{n.icon}</span> {n.label}
              </button>
            ))}
          </nav>
        </div>

        {/* User Info & Footer */}
        <div className="vizora-sidebar-footer">
          <div className="vizora-user-info">
            <span className="vizora-user-email">{(session.user.user_metadata?.display_name as string | undefined) || session.user.email}</span>
            <span className="vizora-user-role">
              {adminRole === "super_admin" ? "Super admin" : "Support (read-only)"}
            </span>
          </div>

          <button className="vizora-signout-btn" onClick={logout}>
            🚪 Sign out
          </button>
        </div>
      </aside>

      {/* Main Pages Content */}
      <main className="vizora-main">
        {page === "dashboard" && <Dashboard />}
        {page === "users" && <Users adminRole={adminRole} />}
        {page === "audit" && <AuditLogs />}
        {page === "roles" && <Roles adminRole={adminRole} />}
        {page === "monitoring" && <Monitoring />}
        {page === "feedback" && <Feedback adminRole={adminRole} />}
        {page === "settings" && <Settings adminRole={adminRole} />}
      </main>
    </div>
  );
}