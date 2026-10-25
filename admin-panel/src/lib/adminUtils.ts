type RpcError = { code?: string; message?: string } | null;

export function isMissingFunction(error: RpcError): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

// Turns a Supabase error into a message that is safe and clear to show on screen.
export function rpcErrorMessage(error: RpcError, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "42501") return "Access denied: your account is not allowed to do this.";
  if (isMissingFunction(error)) {
    return "A required database function is missing. Run supabase/migrations/002_admin_modules.sql first.";
  }
  return error.message || fallback;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
