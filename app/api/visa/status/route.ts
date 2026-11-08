import { checkRequestShape, clientIp, envInt, fail, json, rateLimit, readJsonBody, verifyToken } from "@/lib/security";
import { UUID_RE, getStatus } from "@/lib/visa";
import { notifyOnce } from "@/lib/telegram";
import { after } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const bad = checkRequestShape(req);
  if (bad) return fail(403, bad);

  const ip = clientIp(req);
  const rl = rateLimit(`status:${ip}`, envInt("RATE_LIMIT_STATUS", 40), 60_000);
  if (!rl.ok) return fail(429, "Juda ko'p so'rov. Biroz kuting.", { "Retry-After": String(rl.retryAfter) });

  const body = await readJsonBody(req, 2048);
  if (!body) return fail(400, "Noto'g'ri so'rov.");

  const t = verifyToken(body.token, UUID_RE);
  if (!t) return fail(401, "Sessiya muddati tugagan. Qaytadan tekshiring.");

  try {
    const result = await getStatus(t.id);
    // Natija tayyor bo'lsa — Telegram chatiga (bitta tekshiruvga bitta xabar, javobdan keyin)
    if (t.cid && t.who && result.state !== "pending") after(() => notifyOnce(t.id, t.cid!, t.who!, result));
    return json({ ok: true, result });
  } catch (e) {
    console.error("[visa/status] upstream:", e instanceof Error ? e.message : "unknown");
    return fail(502, "Viza xizmati hozir javob bermayapti. Birozdan so'ng urinib ko'ring.");
  }
}
