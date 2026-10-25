// One shared list of audit-log action names, used by Audit Logs and System Monitoring.
export const ACTION_LABELS: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  suspend_user: "Suspended a user",
  reactivate_user: "Reactivated a user",
  admin_added: "Added an administrator",
  admin_role_changed: "Changed an administrator role",
  admin_removed: "Removed an administrator",
  feedback_updated: "Reviewed feedback",
  password_changed: "Changed own password",
  sessions_revoked: "Signed out other devices",
};
