import { checkRequestShape, clientIp, envInt, fail, issueToken, json, rateLimit, readJsonBody, tokenConfigured } from "@/lib/security";
import { parseQuery, startCheck } from "@/lib/visa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_FILL_MS = 2_000; // forma 2 soniyadan tez to'ldirilsa — bot

export async function POST(req: Request) {
  if (!tokenConfigured()) return fail(500, "Server hali sozlanmagan.");

  const bad = checkRequestShape(req);
  if (bad) return fail(403, bad);

  const ip = clientIp(req);
  const perIp = rateLimit(`check:${ip}`, envInt("RATE_LIMIT_CHECK", 5), 10 * 60_000);
  if (!perIp.ok) {
    return fail(429, "Juda ko'p urinish. Bir necha daqiqadan so'ng qaytadan urinib ko'ring.", {
      "Retry-After": String(perIp.retryAfter),
    });
  }

  const body = await readJsonBody(req);
  if (!body) return fail(400, "Noto'g'ri so'rov.");

  // Honeypot: odam ko'rmaydigan maydon to'ldirilgan bo'lsa — bot
  if (typeof body.website === "string" && body.website.length > 0) return fail(400, "So'rov rad etildi.");

  // Brauzer formani to'ldirishga ketgan vaqtni (ms) yuboradi. Mijoz soati bilan solishtirilmaydi:
  // foydalanuvchi kompyuterining soati noto'g'ri bo'lsa ham tekshiruv ishlayveradi.
  const elapsed = Number(body.elapsedMs);
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 6 * 3600_000) {
    return fail(400, "Sahifani yangilab, qaytadan urinib ko'ring.");
  }
  if (elapsed < MIN_FILL_MS) return fail(400, "Iltimos, ma'lumotlarni tekshirib, qaytadan yuboring.");
  const started = Date.now() - elapsed; // server soati bo'yicha

  const parsed = parseQuery(body);
  if (!parsed.ok) return fail(400, parsed.message);

  const global = rateLimit("check:__global", envInt("GLOBAL_CHECKS_PER_HOUR", 600), 3600_000);
  if (!global.ok) return fail(503, "Xizmat hozir band. Birozdan so'ng urinib ko'ring.", { "Retry-After": String(global.retryAfter) });

  try {
    const { id, result } = await startCheck(parsed.query, started / 1000);
    return json({ ok: true, token: issueToken(id), result });
  } catch (e) {
    console.error("[visa/check] upstream:", e instanceof Error ? e.message : "unknown"); // shaxsiy ma'lumot log qilinmaydi
    return fail(502, "Viza xizmati hozir javob bermayapti. Birozdan so'ng urinib ko'ring.");
  }
}
