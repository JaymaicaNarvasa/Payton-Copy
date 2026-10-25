import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAILJS_SERVICE_ID = Deno.env.get("EMAILJS_SERVICE_ID");
const EMAILJS_TEMPLATE_ID = Deno.env.get("EMAILJS_TEMPLATE_ID");
const EMAILJS_PUBLIC_KEY = Deno.env.get("EMAILJS_PUBLIC_KEY");

// Records one row per run (counts only). A logging problem never stops reminders from being sent.
// deno-lint-ignore no-explicit-any
async function logRun(db: any, due: number, sent: number, failed: number, status: string) {
  const { error } = await db.from("reminder_runs").insert({ due_count: due, sent_count: sent, failed_count: failed, status });
  if (error) console.error("Could not record reminder run:", error.message);
}

serve(async (_req) => {
  try {
    // 1. Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 2. Get current date based on Philippine Time (Asia/Manila)
    const options = { timeZone: 'Asia/Manila', year: 'numeric' as const, month: '2-digit' as const, day: '2-digit' as const };
    const formatter = new Intl.DateTimeFormat('en-CA', options);
    const today = formatter.format(new Date());

    // 3. Find pending reminders due today
    const { data: reminders, error: remError } = await supabaseAdmin
      .from("reminders")
      .select("id, title, amount, due_date, user_id")
      .eq("status", "pending")
      .eq("due_date", today);

    if (remError) throw remError;

    if (!reminders || reminders.length === 0) {
      await logRun(supabaseAdmin, 0, 0, 0, "ok");
      return new Response(JSON.stringify({ message: "No reminders due for today." }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. Process each reminder
    let sent = 0;
    let failed = 0;
    for (const reminder of reminders) {
      // Get user email from Supabase Auth
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
        reminder.user_id
      );

      if (userError || !userData?.user?.email) {
        failed++;
        continue;
      }
      const userEmail = userData.user.email;

      // 5. Send email using EmailJS REST API
      const emailData = {
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          email: userEmail,
          name: "User",
          title: reminder.title,
          amount: reminder.amount.toFixed(2),
          due_date: reminder.due_date,
        },
      };

      const emailResponse = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailData),
      });

      const responseText = await emailResponse.text();
      console.log(`EmailJS response for ${userEmail}:`, responseText);

      if (!emailResponse.ok) {
        console.error(`Failed to send email to ${userEmail}:`, responseText);
        failed++;
      } else {
        sent++;
      }
    }

    await logRun(supabaseAdmin, reminders.length, sent, failed, failed > 0 ? "partial" : "ok");

    return new Response(JSON.stringify({ success: true, count: reminders.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    await logRun(
      createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""),
      0, 0, 0, "error",
    );
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});