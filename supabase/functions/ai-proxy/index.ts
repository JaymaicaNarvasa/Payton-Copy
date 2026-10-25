// supabase/functions/ai-proxy/index.ts  (NEW)
// Server-side gateway to the Gemini API. The provider key lives only in Supabase secrets.
// Checks the caller's login, validates the request, limits usage, and records metadata only
// (never prompts, images, or answers).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const OPERATIONS = ["help", "scan", "insight", "coach", "pacing"];
const ALLOWED_MODELS = (Deno.env.get("AI_ALLOWED_MODELS") ?? "gemini-3.5-flash-lite,gemini-2.5-flash")
  .split(",").map((s) => s.trim()).filter(Boolean);
const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "100"); // requests per user per 24 hours
const MAX_TEXT_CHARS = 20_000;
const MAX_IMAGE_CHARS = 6_000_000; // base64 characters
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const TIMEOUT_MS = 30_000;

type Clean = { operation: string; model: string; contents: unknown[]; generationConfig?: Record<string, unknown> };

// deno-lint-ignore no-explicit-any
function validate(b: any): Clean | string {
  if (!b || typeof b !== "object") return "Invalid request";
  if (!OPERATIONS.includes(b.operation)) return "Unknown operation";
  const model = typeof b.model === "string" ? b.model : ALLOWED_MODELS[0];
  if (!ALLOWED_MODELS.includes(model)) return "Model not allowed";
  if (!Array.isArray(b.contents) || b.contents.length < 1 || b.contents.length > 4) return "Invalid contents";

  let textChars = 0;
  const contents: unknown[] = [];
  for (const c of b.contents) {
    if (!c || !Array.isArray(c.parts) || c.parts.length < 1 || c.parts.length > 6) return "Invalid contents";
    const parts: unknown[] = [];
    for (const p of c.parts) {
      if (typeof p?.text === "string") {
        textChars += p.text.length;
        parts.push({ text: p.text });
      } else if (typeof p?.inlineData?.data === "string" && typeof p?.inlineData?.mimeType === "string") {
        if (b.operation !== "scan") return "Images are only allowed for receipt scanning";
        if (!IMAGE_TYPES.includes(p.inlineData.mimeType) || p.inlineData.data.length > MAX_IMAGE_CHARS) return "Invalid image";
        parts.push({ inlineData: { mimeType: p.inlineData.mimeType, data: p.inlineData.data } });
      } else {
        return "Invalid contents";
      }
    }
    contents.push({ role: "user", parts });
  }
  if (textChars > MAX_TEXT_CHARS) return "Message too long";

  const out: Clean = { operation: b.operation, model, contents };
  const g = b.generationConfig;
  if (g && typeof g === "object") {
    const cfg: Record<string, unknown> = {};
    if (g.responseMimeType !== undefined) {
      if (!["text/plain", "application/json"].includes(g.responseMimeType)) return "Invalid generationConfig";
      cfg.responseMimeType = g.responseMimeType;
    }
    if (g.responseSchema !== undefined) {
      if (typeof g.responseSchema !== "object" || JSON.stringify(g.responseSchema).length > 4000) return "Invalid generationConfig";
      cfg.responseSchema = g.responseSchema;
    }
    if (Object.keys(cfg).length) out.generationConfig = cfg;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1) Who is calling?
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "Not signed in" }, 401);

    // 2) Is the request valid?
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
    const clean = validate(body);
    if (typeof clean === "string") return json({ error: clean }, 400);

    // 3) Suspended accounts cannot use AI.
    const { data: profile } = await service.from("profiles").select("account_status").eq("id", user.id).maybeSingle();
    if (profile?.account_status === "suspended") return json({ error: "This account is suspended" }, 403);

    const record = async (status: string, errorCode: string | null, latency: number | null, usage?: Record<string, unknown>) => {
      const num = (v: unknown) => (typeof v === "number" ? v : null);
      const { error } = await service.from("ai_usage_logs").insert({
        user_id: user.id, operation: clean.operation, model: clean.model, status, error_code: errorCode, latency_ms: latency,
        prompt_tokens: num(usage?.promptTokenCount), output_tokens: num(usage?.candidatesTokenCount), total_tokens: num(usage?.totalTokenCount),
      });
      if (error) console.error("Could not record AI usage", error.message);
    };

    // 4) Usage limit per user.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count, error: countError } = await service.from("ai_usage_logs").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).neq("status", "rate_limited").gte("created_at", since);
    if (countError) { console.error(countError.message); return json({ error: "Service error" }, 500); }
    if ((count ?? 0) >= DAILY_LIMIT) {
      await record("rate_limited", null, null);
      return json({ error: "Daily AI limit reached. Please try again tomorrow." }, 429);
    }

    // 5) Call the provider with the server-side key.
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      await record("error", "not_configured", null);
      return json({ error: "The AI service is not configured" }, 503);
    }
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(clean.model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ contents: clean.contents, generationConfig: clean.generationConfig }),
          signal: controller.signal,
        },
      );
      const latency = Date.now() - started;
      if (!res.ok) {
        await record("error", `http_${res.status}`, latency);
        return json({ error: "The AI provider returned an error" }, 502);
      }
      const data = await res.json();
      const text: string = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
      if (!text) {
        await record("error", "empty_response", latency, data?.usageMetadata);
        return json({ error: "The AI returned no answer" }, 502);
      }
      await record("success", null, latency, data?.usageMetadata);
      return json({ text });
    } catch (err) {
      const aborted = (err as Error)?.name === "AbortError";
      await record("error", aborted ? "timeout" : "network", Date.now() - started);
      return json({ error: aborted ? "The AI service timed out" : "The AI service could not be reached" }, 504);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error(err);
    return json({ error: "Server error" }, 500);
  }
});
