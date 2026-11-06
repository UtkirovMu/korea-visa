import { checkRequestShape, clientIp, envInt, fail, json, rateLimit, readJsonBody, verifyToken } from "@/lib/security";
import { UUID_RE, getStatus } from "@/lib/visa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const bad = checkRequestShape(req);
  if (bad) return fail(403, bad);

  const ip = clientIp(req);
  const rl = rateLimit(`status:${ip}`, envInt("RATE_LIMIT_STATUS", 40), 60_000);
  if (!rl.ok) return fail(429, "Juda ko'p so'rov. Biroz kuting.", { "Retry-After": String(rl.retryAfter) });

  const body = await readJsonBody(req, 512);
  if (!body) return fail(400, "Noto'g'ri so'rov.");

  const id = verifyToken(body.token, UUID_RE);
  if (!id) return fail(401, "Sessiya muddati tugagan. Qaytadan tekshiring.");

  try {
    return json({ ok: true, result: await getStatus(id) });
  } catch (e) {
    console.error("[visa/status] upstream:", e instanceof Error ? e.message : "unknown");
    return fail(502, "Viza xizmati hozir javob bermayapti. Birozdan so'ng urinib ko'ring.");
  }
}
