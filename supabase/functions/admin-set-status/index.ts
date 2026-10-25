// supabase/functions/admin-set-status/index.ts  (NEW file)
// Suspends or reactivates a user. Runs on the server so the service-role key never reaches a browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ADMIN_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");

    // 1) Who is calling? Validate their login token.
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await caller.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "Not signed in" }, 401);

    // 2) Are they a super admin? (checked in the database, not in the browser)
    const { data: adminRole } = await caller.rpc("admin_role");
    if (adminRole !== "super_admin") return json({ error: "Not authorized" }, 403);

    // 3) Validate input.
    const { userId, status, reason } = await req.json();
    if (typeof userId !== "string" || !["active", "suspended"].includes(status)) {
      return json({ error: "Bad request" }, 400);
    }
    if (userId === user.id) return json({ error: "You cannot change your own account" }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: targetIsAdmin } = await admin
      .from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
    if (targetIsAdmin) return json({ error: "Administrators cannot be suspended here" }, 400);

    // 4) Block / unblock sign-in in Supabase Auth, then mirror it on the profile.
    const { error: banError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: status === "suspended" ? "876000h" : "none",
    });
    if (banError) throw banError;

    const { error: profileError } = await admin
      .from("profiles").update({ account_status: status }).eq("id", userId);
    if (profileError) throw profileError;

    // 5) Audit trail (no passwords, tokens, or financial data).
    await admin.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: status === "suspended" ? "suspend_user" : "reactivate_user",
      target_user_id: userId,
      details: { reason: typeof reason === "string" ? reason.slice(0, 200) : null },
    });

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ error: "Server error" }, 500);
  }
});
